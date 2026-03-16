import { useState, useRef, useCallback, useEffect, useId } from 'react';
import { Button } from '@/components/ui/button';
import {
  Play, Pause, SkipBack, SkipForward, Scissors,
  Trash2, Download, Image, ZoomIn, ZoomOut,
  Plus, Volume2, VolumeX, GripVertical, Loader2,
  ChevronUp, ChevronDown, Eye, EyeOff
} from 'lucide-react';
import { SessionFile, TimelineTrack, TimelineClip, VideoTrackLayout, VideoLayoutPreset, AudioTrackRole } from '@/hooks/use-session';

const TRACK_LABEL_WIDTH_PX = 160;

// Move clip increment in seconds for keyboard navigation
const CLIP_MOVE_INCREMENT = 0.5;

// Timeline clip with additional UI state
interface UIClip extends TimelineClip {
  id: string;
  duration: number;
  sourceName: string;
}

// Timeline track with UI state
interface UITrack {
  id: string;
  type: 'video' | 'audio';
  name: string;
  clips: UIClip[];
  muted: boolean;
  volume: number;
  layout?: VideoTrackLayout;
  role?: AudioTrackRole;
}

// Timeline state
interface TimelineState {
  duration: number;
  zoom: number; // pixels per second
  playhead: number;
  isPlaying: boolean;
  tracks: UITrack[];
  selectedClipId: string | null;
  transition?: { type: 'none' | 'fade' | 'crossfade'; durationSeconds?: number };
}

interface TimelineEditorProps {
  files: SessionFile[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onSeek: (time: number) => void;
  onPlayPause: () => void;
  onExtractFreezeFrame: (fileId: string, time: number) => Promise<void>;
  onRenderTimeline: (
    tracks: TimelineTrack[],
    options?: { transition?: { type: 'none' | 'fade' | 'crossfade'; durationSeconds?: number } }
  ) => Promise<void>;
  isProcessing: boolean;
  sessionId: string | null;
  autoInsertAudioFileId?: string | null;
  onAutoInsertAudioDone?: () => void;
}

export function TimelineEditor({
  files,
  currentTime,
  duration: videoDuration,
  isPlaying,
  onSeek,
  onPlayPause,
  onExtractFreezeFrame,
  onRenderTimeline,
  isProcessing,
  sessionId,
  autoInsertAudioFileId,
  onAutoInsertAudioDone
}: TimelineEditorProps) {
  // Timeline state
  const [timeline, setTimeline] = useState<TimelineState>({
    duration: 0,
    zoom: 50, // 50 pixels per second
    playhead: 0,
    isPlaying: false,
    tracks: [
      { id: 'video-1', type: 'video', name: 'Video 1', clips: [], muted: false, volume: 1, layout: { preset: 'full', opacity: 1 } },
      { id: 'audio-1', type: 'audio', name: 'Audio 1', clips: [], muted: false, volume: 1, role: 'voice' }
    ],
    selectedClipId: null,
    transition: { type: 'fade', durationSeconds: 0.35 }
  });

  // Refs
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const isRestoringRef = useRef(false);
  const hasRestoredRef = useRef(false);
  const saveTimeoutRef = useRef<number | null>(null);
  const dragDataRef = useRef<{
    clipId: string;
    trackId: string;
    startX: number;
    originalStart: number;
  } | null>(null);

  // Accessibility refs
  const clipRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const filesListRef = useRef<HTMLDivElement>(null);

  // Unique IDs for ARIA
  const timelineId = useId();
  const announcementId = `${timelineId}-announcements`;

  // Accessibility announcements
  const [announcement, setAnnouncement] = useState<string>('');

  // Format time display (moved here for use in callbacks)
  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
  }, []);

  // Sync playhead with video
  useEffect(() => {
    setTimeline(prev => ({ ...prev, playhead: currentTime }));
  }, [currentTime]);

  // Update timeline duration based on clips
  const updateTimelineDuration = useCallback((tracks: UITrack[]) => {
    let maxEnd = videoDuration || 0;
    for (const track of tracks) {
      for (const clip of track.clips) {
        const clipEnd = clip.timelineStart + clip.duration;
        if (clipEnd > maxEnd) maxEnd = clipEnd;
      }
    }
    return maxEnd;
  }, [videoDuration]);

  // Allow state restore again when switching sessions
  useEffect(() => {
    hasRestoredRef.current = false;
    isRestoringRef.current = false;
  }, [sessionId]);

  // Restore timeline state from localStorage
  useEffect(() => {
    if (!sessionId || files.length === 0 || hasRestoredRef.current) return;
    const raw = localStorage.getItem(`voxdrop-timeline:${sessionId}`);
    if (!raw) return;

    try {
      const saved = JSON.parse(raw) as TimelineState;
      if (!saved || !Array.isArray(saved.tracks)) return;

      const fileIds = new Set(files.map(f => f.id));
      const restoredTracks = saved.tracks.map(track => ({
        ...track,
        clips: track.clips.filter(clip => fileIds.has(clip.fileId))
      }));

      isRestoringRef.current = true;
      setTimeline(prev => ({
        ...prev,
        ...saved,
        tracks: restoredTracks,
        duration: updateTimelineDuration(restoredTracks)
      }));
    } catch {
      // Ignore corrupted state
    } finally {
      hasRestoredRef.current = true;
      isRestoringRef.current = false;
    }
  }, [sessionId, files, updateTimelineDuration]);

  // Persist timeline state for crash recovery (debounced)
  useEffect(() => {
    if (!sessionId || isRestoringRef.current) return;
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = window.setTimeout(() => {
      try {
        localStorage.setItem(`voxdrop-timeline:${sessionId}`, JSON.stringify(timeline));
      } catch {
        // Ignore storage failures
      }
    }, 300);

    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [sessionId, timeline]);

  // Add clip to timeline from file
  const addClipFromFile = useCallback((file: SessionFile, trackId: string) => {
    const track = timeline.tracks.find(t => t.id === trackId);
    if (!track) return;

    const fileDuration = file.metadata?.duration || 10;
    const isAudio = file.mimeType.startsWith('audio/');
    const isImage = file.mimeType.startsWith('image/');

    // Find the end of the last clip in this track
    const lastClipEnd = track.clips.reduce((max, clip) =>
      Math.max(max, clip.timelineStart + clip.duration), 0);

    const newClip: UIClip = {
      id: `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      fileId: file.id,
      sourceStart: 0,
      sourceEnd: isImage ? 5 : fileDuration, // Images default to 5 seconds
      timelineStart: lastClipEnd,
      duration: isImage ? 5 : fileDuration,
      type: isImage ? 'image' : (isAudio ? 'audio' : 'video'),
      volume: 1,
      sourceName: file.name
    };

    setTimeline(prev => {
      const newTracks = prev.tracks.map(t =>
        t.id === trackId
          ? { ...t, clips: [...t.clips, newClip] }
          : t
      );
      return {
        ...prev,
        tracks: newTracks,
        duration: updateTimelineDuration(newTracks)
      };
    });
  }, [timeline.tracks, updateTimelineDuration]);

  // Auto-insert an audio file (e.g. generated voiceover) into the first audio track.
  useEffect(() => {
    if (!autoInsertAudioFileId) return;
    const file = files.find((f) => f.id === autoInsertAudioFileId);
    if (!file) return;
    if (!file.mimeType?.startsWith('audio/')) return;

    const firstAudio = timeline.tracks.find((t) => t.type === 'audio');
    if (!firstAudio) return;

    const fileDuration = file.metadata?.duration || 10;
    const clip: UIClip = {
      id: `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      fileId: file.id,
      sourceStart: 0,
      sourceEnd: fileDuration,
      timelineStart: 0,
      duration: fileDuration,
      type: 'audio',
      volume: 1,
      sourceName: file.name
    };

    setTimeline((prev) => {
      // Avoid inserting the same file multiple times if parent rerenders.
      const already = prev.tracks.some((t) => t.type === 'audio' && t.clips.some((c) => c.fileId === file.id));
      if (already) return prev;

      const newTracks = prev.tracks.map((t) =>
        t.id === firstAudio.id ? { ...t, clips: [...t.clips, clip] } : t
      );
      return {
        ...prev,
        tracks: newTracks,
        duration: updateTimelineDuration(newTracks)
      };
    });

    onAutoInsertAudioDone?.();
  }, [autoInsertAudioFileId, files, timeline.tracks, updateTimelineDuration, onAutoInsertAudioDone]);

  // Handle file drop on track
  const handleDrop = useCallback((e: React.DragEvent, trackId: string) => {
    e.preventDefault();
    const fileId = e.dataTransfer.getData('fileId');
    const file = files.find(f => f.id === fileId);
    if (file) {
      addClipFromFile(file, trackId);
    }
  }, [files, addClipFromFile]);

  // Handle drag over
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  // Announce for screen readers
  const announce = useCallback((message: string) => {
    setAnnouncement(message);
    // Clear after a short delay to allow re-announcement of same message
    setTimeout(() => setAnnouncement(''), 100);
  }, []);

  // Handle clip selection
  const selectClip = useCallback((clipId: string, focusClip = false) => {
    setTimeline(prev => ({ ...prev, selectedClipId: clipId }));
    if (focusClip) {
      // Focus the clip element after state update
      requestAnimationFrame(() => {
        const clipEl = clipRefs.current.get(clipId);
        clipEl?.focus();
      });
    }
  }, []);

  // Delete selected clip
  const deleteSelectedClip = useCallback(() => {
    if (!timeline.selectedClipId) return;

    // Find the clip name for announcement and next clip to focus
    let deletedClipName = '';
    let nextClipId: string | null = null;

    for (const track of timeline.tracks) {
      const clipIndex = track.clips.findIndex(c => c.id === timeline.selectedClipId);
      if (clipIndex !== -1) {
        deletedClipName = track.clips[clipIndex].sourceName;
        // Try to focus next clip, or previous if last
        if (clipIndex < track.clips.length - 1) {
          nextClipId = track.clips[clipIndex + 1].id;
        } else if (clipIndex > 0) {
          nextClipId = track.clips[clipIndex - 1].id;
        }
        break;
      }
    }

    setTimeline(prev => {
      const newTracks = prev.tracks.map(track => ({
        ...track,
        clips: track.clips.filter(clip => clip.id !== prev.selectedClipId)
      }));
      return {
        ...prev,
        tracks: newTracks,
        duration: updateTimelineDuration(newTracks),
        selectedClipId: nextClipId
      };
    });

    // Announce deletion
    announce(`${deletedClipName} gelöscht`);

    // Focus next clip after state update
    if (nextClipId) {
      requestAnimationFrame(() => {
        const clipEl = clipRefs.current.get(nextClipId!);
        clipEl?.focus();
      });
    }
  }, [timeline.selectedClipId, timeline.tracks, updateTimelineDuration, announce]);

  // Split clip at playhead
  const splitAtPlayhead = useCallback(() => {
    const playhead = currentTime;
    let splitClipName = '';
    let newSecondClipId = '';

    setTimeline(prev => {
      const newTracks = prev.tracks.map(track => {
        const newClips: UIClip[] = [];

        for (const clip of track.clips) {
          const clipEnd = clip.timelineStart + clip.duration;

          // Check if playhead is within this clip
          if (playhead > clip.timelineStart && playhead < clipEnd) {
            // Split into two clips
            const firstDuration = playhead - clip.timelineStart;
            const secondDuration = clipEnd - playhead;
            newSecondClipId = `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            splitClipName = clip.sourceName;

            // First clip (before playhead)
            newClips.push({
              ...clip,
              duration: firstDuration,
              sourceEnd: clip.sourceStart + firstDuration
            });

            // Second clip (after playhead)
            newClips.push({
              ...clip,
              id: newSecondClipId,
              timelineStart: playhead,
              duration: secondDuration,
              sourceStart: clip.sourceStart + firstDuration,
              sourceEnd: clip.sourceEnd
            });
          } else {
            newClips.push(clip);
          }
        }

        return { ...track, clips: newClips };
      });

      return { ...prev, tracks: newTracks, selectedClipId: newSecondClipId || prev.selectedClipId };
    });

    // Announce split
    if (splitClipName) {
      announce(`${splitClipName} geteilt bei ${formatTime(playhead)}`);
      // Focus the second clip after split
      if (newSecondClipId) {
        requestAnimationFrame(() => {
          const clipEl = clipRefs.current.get(newSecondClipId);
          clipEl?.focus();
        });
      }
    }
  }, [currentTime, announce]);

  // Handle clip drag start
  const handleClipDragStart = useCallback((
    e: React.MouseEvent,
    clipId: string,
    trackId: string
  ) => {
    const clip = timeline.tracks.find(t => t.id === trackId)?.clips.find(c => c.id === clipId);
    if (!clip) return;

    isDraggingRef.current = true;
    dragDataRef.current = {
      clipId,
      trackId,
      startX: e.clientX,
      originalStart: clip.timelineStart
    };

    selectClip(clipId);
  }, [timeline.tracks, selectClip]);

  // Handle clip drag
  const handleClipDrag = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current || !dragDataRef.current) return;

    const deltaX = e.clientX - dragDataRef.current.startX;
    const deltaTime = deltaX / timeline.zoom;
    const newStart = Math.max(0, dragDataRef.current.originalStart + deltaTime);

    setTimeline(prev => ({
      ...prev,
      tracks: prev.tracks.map(track =>
        track.id === dragDataRef.current?.trackId
          ? {
              ...track,
              clips: track.clips.map(clip =>
                clip.id === dragDataRef.current?.clipId
                  ? { ...clip, timelineStart: newStart }
                  : clip
              )
            }
          : track
      )
    }));
  }, [timeline.zoom]);

  // Handle clip drag end
  const handleClipDragEnd = useCallback(() => {
    isDraggingRef.current = false;
    dragDataRef.current = null;
  }, []);

  // Move clip via keyboard (accessibility alternative to drag)
  const moveClipByKeyboard = useCallback((clipId: string, direction: 'left' | 'right') => {
    const delta = direction === 'left' ? -CLIP_MOVE_INCREMENT : CLIP_MOVE_INCREMENT;

    setTimeline(prev => {
      const newTracks = prev.tracks.map(track => ({
        ...track,
        clips: track.clips.map(clip => {
          if (clip.id === clipId) {
            const newStart = Math.max(0, clip.timelineStart + delta);
            return { ...clip, timelineStart: newStart };
          }
          return clip;
        })
      }));

      return {
        ...prev,
        tracks: newTracks,
        duration: updateTimelineDuration(newTracks)
      };
    });

    const directionText = direction === 'left' ? 'nach links' : 'nach rechts';
    announce(`Clip ${directionText} verschoben`);
  }, [updateTimelineDuration, announce]);

  // Navigate between clips with keyboard
  const navigateClips = useCallback((direction: 'prev' | 'next') => {
    // Collect all clips across tracks in timeline order
    const allClips: { clip: UIClip; trackId: string }[] = [];
    for (const track of timeline.tracks) {
      for (const clip of track.clips) {
        allClips.push({ clip, trackId: track.id });
      }
    }

    // Sort by timeline position
    allClips.sort((a, b) => a.clip.timelineStart - b.clip.timelineStart);

    if (allClips.length === 0) return;

    const currentIndex = allClips.findIndex(c => c.clip.id === timeline.selectedClipId);

    let newIndex: number;
    if (currentIndex === -1) {
      // No selection, select first or last
      newIndex = direction === 'next' ? 0 : allClips.length - 1;
    } else {
      newIndex = direction === 'next'
        ? Math.min(currentIndex + 1, allClips.length - 1)
        : Math.max(currentIndex - 1, 0);
    }

    const newClip = allClips[newIndex];
    selectClip(newClip.clip.id, true);

    // Announce the selected clip
    announce(`${newClip.clip.sourceName} ausgewählt, ${formatTime(newClip.clip.duration)} Dauer`);
  }, [timeline.tracks, timeline.selectedClipId, selectClip, announce]);

  // Handle clip keyboard events
  const handleClipKeyDown = useCallback((
    e: React.KeyboardEvent,
    clipId: string,
    trackId: string
  ) => {
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        selectClip(clipId);
        // Also seek to clip start
        const clip = timeline.tracks.find(t => t.id === trackId)?.clips.find(c => c.id === clipId);
        if (clip) {
          onSeek(clip.timelineStart);
          announce(`Playhead zu ${formatTime(clip.timelineStart)}`);
        }
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        if (timeline.selectedClipId === clipId) {
          deleteSelectedClip();
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (e.shiftKey) {
          // Move clip left
          moveClipByKeyboard(clipId, 'left');
        } else {
          // Navigate to previous clip
          navigateClips('prev');
        }
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (e.shiftKey) {
          // Move clip right
          moveClipByKeyboard(clipId, 'right');
        } else {
          // Navigate to next clip
          navigateClips('next');
        }
        break;
      case 'ArrowUp':
      case 'ArrowDown':
        // Navigate between tracks (if we want to add that functionality)
        e.preventDefault();
        break;
    }
  }, [timeline.tracks, timeline.selectedClipId, selectClip, deleteSelectedClip, moveClipByKeyboard, navigateClips, onSeek, announce]);

  // Timeline click to seek
  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const scrollLeft = timelineContainerRef.current?.scrollLeft || 0;
    const x = e.clientX - rect.left + scrollLeft - TRACK_LABEL_WIDTH_PX;
    // Ignore clicks on the track control area (left column).
    if (x < 0) return;
    const time = x / timeline.zoom;
    onSeek(Math.max(0, Math.min(time, timeline.duration || videoDuration)));
  }, [timeline.zoom, timeline.duration, videoDuration, onSeek]);

  // Zoom controls
  const zoomIn = useCallback(() => {
    setTimeline(prev => ({ ...prev, zoom: Math.min(200, prev.zoom * 1.5) }));
  }, []);

  const zoomOut = useCallback(() => {
    setTimeline(prev => ({ ...prev, zoom: Math.max(10, prev.zoom / 1.5) }));
  }, []);

  // Toggle track mute
  const toggleTrackMute = useCallback((trackId: string) => {
    setTimeline(prev => ({
      ...prev,
      tracks: prev.tracks.map(track =>
        track.id === trackId ? { ...track, muted: !track.muted } : track
      )
    }));
  }, []);

  const setTrackVolume = useCallback((trackId: string, volume: number) => {
    const safe = Math.max(0, Math.min(2, volume));
    setTimeline(prev => ({
      ...prev,
      tracks: prev.tracks.map(track =>
        track.id === trackId ? { ...track, volume: safe } : track
      )
    }));
  }, []);

  const setTrackLayoutPreset = useCallback((trackId: string, preset: VideoLayoutPreset) => {
    setTimeline(prev => ({
      ...prev,
      tracks: prev.tracks.map(track =>
        track.id === trackId
          ? { ...track, layout: { ...(track.layout || {}), preset } }
          : track
      )
    }));
  }, []);

  const setTrackOpacity = useCallback((trackId: string, opacity: number) => {
    const safe = Math.max(0, Math.min(1, opacity));
    setTimeline(prev => ({
      ...prev,
      tracks: prev.tracks.map(track =>
        track.id === trackId
          ? { ...track, layout: { ...(track.layout || {}), opacity: safe } }
          : track
      )
    }));
  }, []);

  const setTrackRole = useCallback((trackId: string, role: AudioTrackRole) => {
    setTimeline(prev => ({
      ...prev,
      tracks: prev.tracks.map(track =>
        track.id === trackId ? { ...track, role } : track
      )
    }));
  }, []);

  const moveTrack = useCallback((trackId: string, direction: 'up' | 'down') => {
    setTimeline(prev => {
      const idx = prev.tracks.findIndex(t => t.id === trackId);
      if (idx === -1) return prev;
      const nextIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (nextIdx < 0 || nextIdx >= prev.tracks.length) return prev;
      const next = [...prev.tracks];
      const [item] = next.splice(idx, 1);
      next.splice(nextIdx, 0, item);
      return { ...prev, tracks: next };
    });
  }, []);

  const addVideoTrack = useCallback(() => {
    const presets: VideoLayoutPreset[] = ['pip_tr', 'pip_tl', 'pip_br', 'pip_bl', 'lower_third', 'center'];
    setTimeline(prev => {
      const existingVideoTracks = prev.tracks.filter(t => t.type === 'video');
      const nextNumber = existingVideoTracks.length + 1;
      const preset = presets[Math.max(0, nextNumber - 2) % presets.length];
      const newTrack: UITrack = {
        id: `video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'video',
        name: `Video ${nextNumber}`,
        clips: [],
        muted: false,
        volume: 1,
        layout: { preset, opacity: 1 },
      };
      return { ...prev, tracks: [...prev.tracks, newTrack] };
    });
  }, []);

  const addAudioTrack = useCallback(() => {
    setTimeline(prev => {
      const existingAudioTracks = prev.tracks.filter(t => t.type === 'audio');
      const nextNumber = existingAudioTracks.length + 1;
      const newTrack: UITrack = {
        id: `audio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'audio',
        name: `Audio ${nextNumber}`,
        clips: [],
        muted: false,
        volume: 1,
        role: 'voice',
      };
      return { ...prev, tracks: [...prev.tracks, newTrack] };
    });
  }, []);

  const setTransitionType = useCallback((type: 'none' | 'fade' | 'crossfade') => {
    setTimeline(prev => ({
      ...prev,
      transition: {
        type,
        durationSeconds: prev.transition?.durationSeconds ?? 0.35,
      }
    }));
  }, []);

  const setTransitionDuration = useCallback((durationSeconds: number) => {
    const safe = Math.max(0, Math.min(5, durationSeconds));
    setTimeline(prev => ({
      ...prev,
      transition: {
        type: prev.transition?.type ?? 'fade',
        durationSeconds: safe,
      }
    }));
  }, []);

  // Extract freeze frame at current time
  const handleFreezeFrame = useCallback(async () => {
    // Find video clip at current time
    for (const track of timeline.tracks) {
      if (track.type !== 'video') continue;

      for (const clip of track.clips) {
        const clipEnd = clip.timelineStart + clip.duration;
        if (currentTime >= clip.timelineStart && currentTime < clipEnd) {
          // Calculate time within source video
          const sourceTime = clip.sourceStart + (currentTime - clip.timelineStart);
          await onExtractFreezeFrame(clip.fileId, sourceTime);
          return;
        }
      }
    }

    // If no clip at playhead, use first video file
    const videoFile = files.find(f => f.mimeType.startsWith('video/'));
    if (videoFile) {
      await onExtractFreezeFrame(videoFile.id, currentTime);
    }
  }, [timeline.tracks, currentTime, files, onExtractFreezeFrame]);

  // Export timeline
  const handleExport = useCallback(async () => {
    // Convert UI tracks to API format
    const apiTracks: TimelineTrack[] = timeline.tracks
      .filter(track => track.clips.length > 0)
      .map(track => ({
        type: track.type,
        clips: track.clips.map(clip => ({
          fileId: clip.fileId,
          sourceStart: clip.sourceStart,
          sourceEnd: clip.sourceEnd,
          timelineStart: clip.timelineStart,
          type: clip.type,
          volume: clip.volume,
          fadeInSeconds: clip.fadeInSeconds,
          fadeOutSeconds: clip.fadeOutSeconds,
        })),
        muted: track.muted,
        volume: track.volume,
        layout: track.layout,
        role: track.role,
      }));

    if (apiTracks.length === 0) return;

    await onRenderTimeline(apiTracks, { transition: timeline.transition });
  }, [timeline.tracks, timeline.transition, onRenderTimeline]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case ' ':
          e.preventDefault();
          onPlayPause();
          break;
        case 's':
        case 'S':
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            splitAtPlayhead();
          }
          break;
        case 'Delete':
        case 'Backspace':
          if (timeline.selectedClipId) {
            e.preventDefault();
            deleteSelectedClip();
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          // Frame backward (1/30 second or 1 second with Shift)
          onSeek(Math.max(0, currentTime - (e.shiftKey ? 1 : 1/30)));
          break;
        case 'ArrowRight':
          e.preventDefault();
          // Frame forward (1/30 second or 1 second with Shift)
          onSeek(Math.min(timeline.duration || videoDuration, currentTime + (e.shiftKey ? 1 : 1/30)));
          break;
        case 'Home':
          e.preventDefault();
          onSeek(0);
          break;
        case 'End':
          e.preventDefault();
          onSeek(timeline.duration || videoDuration);
          break;
        case '+':
        case '=':
          e.preventDefault();
          zoomIn();
          break;
        case '-':
          e.preventDefault();
          zoomOut();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onPlayPause, splitAtPlayhead, deleteSelectedClip, zoomIn, zoomOut, currentTime, timeline.selectedClipId, timeline.duration, videoDuration, onSeek]);

  // Calculate timeline width
  const clipAreaMinWidth = Math.max(0, (timelineContainerRef.current?.clientWidth || 800) - TRACK_LABEL_WIDTH_PX);
  const timelineWidth = Math.max(
    (timeline.duration || videoDuration) * timeline.zoom,
    clipAreaMinWidth
  );
  const totalWidth = timelineWidth + TRACK_LABEL_WIDTH_PX;

  // Check if there are clips to export
  const hasClips = timeline.tracks.some(t => t.clips.length > 0);

  // Handle file keyboard activation (add to appropriate track)
  const handleFileKeyDown = useCallback((e: React.KeyboardEvent, file: SessionFile) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const isAudio = file.mimeType.startsWith('audio/');
      const targetTrackId = isAudio ? 'audio-1' : 'video-1';
      addClipFromFile(file, targetTrackId);
      announce(`${file.name} zur Timeline hinzugefügt`);
    }
  }, [addClipFromFile, announce]);

  return (
    <div className="bg-slate-900 rounded-xl overflow-hidden" role="region" aria-label="Timeline Editor">
      {/* Screen reader announcements */}
      <div
        id={announcementId}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-2" role="group" aria-label="Wiedergabe-Steuerung">
          {/* Playback controls */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSeek(0)}
            className="text-slate-300 hover:text-white hover:bg-slate-700"
            title="Zum Anfang (Home)"
            aria-label="Zum Anfang springen, Tastenkürzel Home"
          >
            <SkipBack className="w-4 h-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onPlayPause}
            className="text-slate-300 hover:text-white hover:bg-slate-700"
            title="Play/Pause (Leertaste)"
            aria-label={isPlaying ? 'Pause, Tastenkürzel Leertaste' : 'Abspielen, Tastenkürzel Leertaste'}
          >
            {isPlaying ? <Pause className="w-4 h-4" aria-hidden="true" /> : <Play className="w-4 h-4" aria-hidden="true" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSeek(timeline.duration || videoDuration)}
            className="text-slate-300 hover:text-white hover:bg-slate-700"
            title="Zum Ende (End)"
            aria-label="Zum Ende springen, Tastenkürzel Ende"
          >
            <SkipForward className="w-4 h-4" aria-hidden="true" />
          </Button>

          {/* Time display */}
          <span className="text-sm text-slate-400 font-mono ml-2">
            {formatTime(currentTime)} / {formatTime(timeline.duration || videoDuration)}
          </span>
        </div>

        <div className="flex items-center gap-2" role="group" aria-label="Bearbeitungswerkzeuge">
          {/* Split */}
          <Button
            variant="ghost"
            size="sm"
            onClick={splitAtPlayhead}
            disabled={!hasClips}
            className="text-slate-300 hover:text-white hover:bg-slate-700 gap-1"
            title="Clip an Playhead teilen (S)"
            aria-label="Clip an Playhead-Position teilen, Tastenkürzel S"
          >
            <Scissors className="w-4 h-4" aria-hidden="true" />
            <span className="text-xs">Split</span>
          </Button>

          {/* Delete */}
          <Button
            variant="ghost"
            size="sm"
            onClick={deleteSelectedClip}
            disabled={!timeline.selectedClipId}
            className="text-slate-300 hover:text-red-400 hover:bg-slate-700 gap-1"
            title="Ausgewählten Clip löschen (Entf)"
            aria-label="Ausgewählten Clip löschen, Tastenkürzel Entfernen"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </Button>

          {/* Freeze Frame */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleFreezeFrame}
            disabled={isProcessing}
            className="text-slate-300 hover:text-white hover:bg-slate-700 gap-1"
            aria-label="Standbild aus aktuellem Frame extrahieren"
          >
            <Image className="w-4 h-4" aria-hidden="true" />
            <span className="text-xs">Standbild</span>
          </Button>

          {/* Zoom */}
          <div className="flex items-center gap-1 ml-2" role="group" aria-label="Zoom-Steuerung">
            <Button
              variant="ghost"
              size="sm"
              onClick={zoomOut}
              className="text-slate-300 hover:text-white hover:bg-slate-700"
              aria-label="Herauszoomen, Tastenkürzel Minus"
            >
              <ZoomOut className="w-4 h-4" aria-hidden="true" />
            </Button>
            <span className="text-xs text-slate-500 w-12 text-center" aria-label={`Zoom: ${Math.round(timeline.zoom)} Pixel pro Sekunde`}>{Math.round(timeline.zoom)}px/s</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={zoomIn}
              className="text-slate-300 hover:text-white hover:bg-slate-700"
              aria-label="Hineinzoomen, Tastenkürzel Plus"
            >
              <ZoomIn className="w-4 h-4" aria-hidden="true" />
            </Button>
          </div>

          {/* Sources / Tracks */}
          <div className="flex items-center gap-1 ml-2" role="group" aria-label="Quellen und Spuren">
            <Button
              variant="ghost"
              size="sm"
              onClick={addVideoTrack}
              className="text-slate-300 hover:text-white hover:bg-slate-700 gap-1"
              aria-label="Videoquelle hinzufügen"
              title="Videoquelle hinzufügen"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span className="text-xs">Quelle</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={addAudioTrack}
              className="text-slate-300 hover:text-white hover:bg-slate-700 gap-1"
              aria-label="Audiospur hinzufügen"
              title="Audiospur hinzufügen"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span className="text-xs">Audio</span>
            </Button>
          </div>

          {/* Transition */}
          <div className="flex items-center gap-2 ml-2" role="group" aria-label="Transition Einstellungen">
            <span className="text-xs text-slate-500">Transition</span>
            <select
              value={timeline.transition?.type || 'none'}
              onChange={(e) => setTransitionType(e.target.value as any)}
              className="h-8 rounded bg-slate-700 text-slate-100 text-xs px-2 border border-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
              aria-label="Transition Typ"
            >
              <option value="none">Keine</option>
              <option value="fade">Fade</option>
              <option value="crossfade">Crossfade</option>
            </select>
            <input
              type="range"
              min={0}
              max={2000}
              step={50}
              value={Math.round((timeline.transition?.durationSeconds ?? 0.35) * 1000)}
              onChange={(e) => setTransitionDuration(Number(e.target.value) / 1000)}
              disabled={(timeline.transition?.type || 'none') === 'none'}
              className="w-28 accent-blue-500"
              aria-label="Transition Dauer (Millisekunden)"
            />
          </div>

          {/* Export */}
          <Button
            variant="default"
            size="sm"
            onClick={handleExport}
            disabled={!hasClips || isProcessing}
            className="bg-green-600 hover:bg-green-700 text-white gap-1 ml-2"
            aria-label={isProcessing ? 'Export wird verarbeitet' : 'Timeline als Video exportieren'}
          >
            {isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="w-4 h-4" aria-hidden="true" />
            )}
            <span className="text-xs">Export</span>
          </Button>
        </div>
      </div>

      {/* Timeline */}
      <div
        ref={timelineContainerRef}
        className="overflow-x-auto"
        onMouseMove={handleClipDrag}
        onMouseUp={handleClipDragEnd}
        onMouseLeave={handleClipDragEnd}
      >
        {/* Time ruler */}
        <div
          className="h-6 bg-slate-800 border-b border-slate-700 relative"
          style={{ width: `${totalWidth}px` }}
        >
          <div
            className="absolute left-0 top-0 h-full bg-slate-800 border-r border-slate-700 z-20"
            style={{ width: `${TRACK_LABEL_WIDTH_PX}px` }}
            aria-hidden="true"
          />
          {Array.from({ length: Math.ceil(timelineWidth / (timeline.zoom * 5)) + 1 }).map((_, i) => (
            <div
              key={i}
              className="absolute top-0 h-full border-l border-slate-600 flex items-end pb-1"
              style={{ left: `${TRACK_LABEL_WIDTH_PX + i * timeline.zoom * 5}px` }}
            >
              <span className="text-[10px] text-slate-500 pl-1">{formatTime(i * 5)}</span>
            </div>
          ))}
        </div>

        {/* Tracks */}
        <div
          className="relative"
          style={{ width: `${totalWidth}px` }}
          onClick={handleTimelineClick}
          role="group"
          aria-label="Timeline-Spuren"
        >
          {timeline.tracks.map((track, trackIndex) => (
            <div
              key={track.id}
              className="relative h-20 border-b border-slate-700 bg-slate-850"
              onDrop={(e) => handleDrop(e, track.id)}
              onDragOver={handleDragOver}
              role="region"
              aria-label={`${track.name} Spur${track.muted ? ', stumm geschaltet' : ''}`}
            >
              {/* Track label */}
              <div
                className="absolute left-0 top-0 bottom-0 bg-slate-800 border-r border-slate-700 flex flex-col justify-center px-2 py-1 z-30 gap-1"
                style={{ width: `${TRACK_LABEL_WIDTH_PX}px` }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-300 truncate" id={`track-label-${track.id}`}>{track.name}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        moveTrack(track.id, 'up');
                      }}
                      disabled={trackIndex === 0}
                      className="p-1 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-transparent rounded focus:ring-2 focus:ring-violet-500 focus:outline-none"
                      aria-label={`${track.name} nach oben verschieben`}
                      title="Spur nach oben"
                    >
                      <ChevronUp className="w-3 h-3 text-slate-300" aria-hidden="true" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        moveTrack(track.id, 'down');
                      }}
                      disabled={trackIndex === timeline.tracks.length - 1}
                      className="p-1 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-transparent rounded focus:ring-2 focus:ring-violet-500 focus:outline-none"
                      aria-label={`${track.name} nach unten verschieben`}
                      title="Spur nach unten"
                    >
                      <ChevronDown className="w-3 h-3 text-slate-300" aria-hidden="true" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTrackMute(track.id);
                      }}
                      className="p-1 hover:bg-slate-700 rounded focus:ring-2 focus:ring-violet-500 focus:outline-none"
                      aria-label={
                        track.type === 'video'
                          ? (track.muted ? `${track.name} anzeigen` : `${track.name} ausblenden`)
                          : (track.muted ? `${track.name} Ton aktivieren` : `${track.name} stumm schalten`)
                      }
                      aria-pressed={track.muted}
                      title={track.type === 'video' ? 'Quelle ein/aus' : 'Mute'}
                    >
                      {track.type === 'video' ? (
                        track.muted ? (
                          <EyeOff className="w-3 h-3 text-red-300" aria-hidden="true" />
                        ) : (
                          <Eye className="w-3 h-3 text-slate-300" aria-hidden="true" />
                        )
                      ) : track.muted ? (
                        <VolumeX className="w-3 h-3 text-red-300" aria-hidden="true" />
                      ) : (
                        <Volume2 className="w-3 h-3 text-slate-300" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={200}
                    step={5}
                    value={Math.round((track.volume ?? 1) * 100)}
                    onChange={(e) => setTrackVolume(track.id, Number(e.target.value) / 100)}
                    className="w-full accent-blue-500"
                    aria-label={`${track.name} Lautstärke`}
                  />
                </div>

                {track.type === 'video' ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={track.layout?.preset || (track.id === 'video-1' ? 'full' : 'pip_tr')}
                      onChange={(e) => setTrackLayoutPreset(track.id, e.target.value as any)}
                      className="h-7 rounded bg-slate-700 text-slate-100 text-[10px] px-2 border border-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
                      aria-label={`${track.name} Layout`}
                      title="Layout"
                    >
                      <option value="full">Full</option>
                      <option value="pip_tr">PiP TR</option>
                      <option value="pip_tl">PiP TL</option>
                      <option value="pip_br">PiP BR</option>
                      <option value="pip_bl">PiP BL</option>
                      <option value="lower_third">Lower 1/3</option>
                      <option value="center">Center</option>
                    </select>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={Math.round(((track.layout?.opacity ?? 1) * 100))}
                      onChange={(e) => setTrackOpacity(track.id, Number(e.target.value) / 100)}
                      className="w-full accent-blue-500"
                      aria-label={`${track.name} Deckkraft`}
                      title="Deckkraft"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      value={track.role || 'voice'}
                      onChange={(e) => setTrackRole(track.id, e.target.value as any)}
                      className="h-7 w-full rounded bg-slate-700 text-slate-100 text-[10px] px-2 border border-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
                      aria-label={`${track.name} Rolle`}
                      title="Rolle"
                    >
                      <option value="voice">Voice</option>
                      <option value="music">Music</option>
                      <option value="sfx">SFX</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Clips */}
              <div
                className="relative h-full"
                style={{ marginLeft: `${TRACK_LABEL_WIDTH_PX}px`, width: `${timelineWidth}px` }}
                role="listbox"
                aria-label={`Clips in ${track.name}`}
                aria-describedby={`track-label-${track.id}`}
              >
                {track.clips.map((clip) => (
                  <div
                    key={clip.id}
                    ref={(el) => {
                      if (el) clipRefs.current.set(clip.id, el);
                      else clipRefs.current.delete(clip.id);
                    }}
                    role="option"
                    tabIndex={0}
                    aria-selected={timeline.selectedClipId === clip.id}
                    aria-label={`${clip.sourceName}, Dauer ${formatTime(clip.duration)}, Position ${formatTime(clip.timelineStart)}. Shift und Pfeiltasten zum Verschieben.`}
                    className={`absolute top-1 bottom-1 rounded cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 focus:ring-offset-gray-900 ${
                      timeline.selectedClipId === clip.id
                        ? 'ring-2 ring-violet-500'
                        : ''
                    } ${
                      clip.type === 'video'
                        ? 'bg-purple-600 hover:bg-purple-500'
                        : clip.type === 'audio'
                        ? 'bg-orange-600 hover:bg-orange-500'
                        : 'bg-green-600 hover:bg-green-500'
                    }`}
                    style={{
                      left: `${clip.timelineStart * timeline.zoom}px`,
                      width: `${Math.max(20, clip.duration * timeline.zoom)}px`
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      selectClip(clip.id);
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleClipDragStart(e, clip.id, track.id);
                    }}
                    onKeyDown={(e) => handleClipKeyDown(e, clip.id, track.id)}
                  >
                    <div className="flex items-center h-full px-2 gap-1 overflow-hidden">
                      <GripVertical className="w-3 h-3 text-white/50 flex-shrink-0" aria-hidden="true" />
                      <span className="text-xs text-white truncate">{clip.sourceName}</span>
                    </div>

                    {/* Resize handles - hidden from screen readers */}
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-white/20 hover:bg-white/40 cursor-ew-resize" aria-hidden="true" />
                    <div className="absolute right-0 top-0 bottom-0 w-1 bg-white/20 hover:bg-white/40 cursor-ew-resize" aria-hidden="true" />
                  </div>
                ))}

                {/* Drop hint when empty */}
                {track.clips.length === 0 && (
                  <div
                    className="absolute inset-y-0 flex items-center justify-center text-slate-600 text-xs"
                    style={{ left: 0, right: 0 }}
                    aria-hidden="true"
                  >
                    Datei hierher ziehen
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
            style={{ left: `${TRACK_LABEL_WIDTH_PX + currentTime * timeline.zoom}px` }}
          >
            <div className="w-3 h-3 bg-red-500 -ml-[5px] -mt-1 rounded-full" />
          </div>
        </div>
      </div>

      {/* Files Panel (Drag Source) */}
      <div className="p-4 bg-slate-800 border-t border-slate-700" role="region" aria-label="Verfügbare Dateien">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm text-slate-400" id="files-panel-label">Dateien</span>
          <span className="text-xs text-slate-500">(Enter drücken oder in Timeline ziehen)</span>
        </div>

        <div
          ref={filesListRef}
          className="flex gap-2 flex-wrap"
          role="listbox"
          aria-labelledby="files-panel-label"
          aria-describedby="files-instructions"
        >
          {files.map(file => {
            const isVideo = file.mimeType.startsWith('video/');
            const isAudio = file.mimeType.startsWith('audio/');
            const isImage = file.mimeType.startsWith('image/');
            const typeLabel = isVideo ? 'Video' : isAudio ? 'Audio' : isImage ? 'Bild' : 'Datei';
            const durationText = file.metadata?.duration ? `, Dauer ${formatTime(file.metadata.duration)}` : '';

            return (
              <div
                key={file.id}
                role="option"
                tabIndex={0}
                aria-selected={false}
                aria-label={`${file.name}, ${typeLabel}${durationText}. Enter drücken um zur Timeline hinzuzufügen.`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('fileId', file.id);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onKeyDown={(e) => handleFileKeyDown(e, file)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-grab active:cursor-grabbing transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                  isVideo
                    ? 'bg-purple-900/50 hover:bg-purple-900/70 border border-purple-700'
                    : isAudio
                    ? 'bg-orange-900/50 hover:bg-orange-900/70 border border-orange-700'
                    : isImage
                    ? 'bg-green-900/50 hover:bg-green-900/70 border border-green-700'
                    : 'bg-slate-700 hover:bg-slate-600 border border-slate-600'
                }`}
              >
                <span className="text-xs text-white truncate max-w-[120px]">{file.name}</span>
                {file.metadata?.duration && (
                  <span className="text-[10px] text-slate-400" aria-hidden="true">
                    {formatTime(file.metadata.duration)}
                  </span>
                )}
              </div>
            );
          })}

          {files.length === 0 && (
            <span className="text-sm text-slate-500">Keine Dateien vorhanden</span>
          )}
        </div>

        {/* Keyboard shortcuts hint */}
        <div
          id="files-instructions"
          className="mt-3 pt-3 border-t border-slate-700 flex flex-wrap gap-4 text-[10px] text-slate-500"
          role="note"
          aria-label="Tastenkürzel"
        >
          <span><kbd className="px-1 py-0.5 bg-slate-700 rounded">Space</kbd> Play/Pause</span>
          <span><kbd className="px-1 py-0.5 bg-slate-700 rounded">S</kbd> Split</span>
          <span><kbd className="px-1 py-0.5 bg-slate-700 rounded">Entf</kbd> Löschen</span>
          <span><kbd className="px-1 py-0.5 bg-slate-700 rounded">←/→</kbd> Frame / Clip-Navigation</span>
          <span><kbd className="px-1 py-0.5 bg-slate-700 rounded">Shift+←/→</kbd> Clip verschieben</span>
          <span><kbd className="px-1 py-0.5 bg-slate-700 rounded">+/-</kbd> Zoom</span>
        </div>
      </div>
    </div>
  );
}
