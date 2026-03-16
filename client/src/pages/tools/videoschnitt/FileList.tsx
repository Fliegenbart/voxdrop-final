import React, { useCallback, useState, useEffect, forwardRef } from "react";
import {
  Video, Trash2, Music, Mic, Square, FileVideo, FileAudio, Loader2
} from "lucide-react";
import type { SessionFile } from "@/hooks/use-session";

interface FileListProps {
  files: SessionFile[];
  isLoading: boolean;
  selectedFile: SessionFile | null;
  mode: string;
  mergeSelection: string[];
  sessionId: string | null;
  isDragOver: boolean;
  onDragOverChange: (v: boolean) => void;
  onDrop: (e: React.DragEvent) => void;
  onSelectFile: (file: SessionFile) => void;
  onToggleMergeSelection: (fileId: string) => void;
  onDeleteFile: (fileId: string) => void;
  onVideoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAudioUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isRecordingAudio: boolean;
  audioRecordingTime: number;
  onStartAudioRecording: () => void;
  onStopAudioRecording: () => void;
  formatFileSize: (bytes: number) => string;
  formatDuration: (seconds: number) => string;
  highlightedFileId?: string | null;
}

function isAudioFile(file: SessionFile): boolean {
  return !!file.mimeType?.startsWith('audio/') || /\.(mp3|wav|ogg|aac|flac|webm|m4a)$/i.test(file.name);
}

function formatAudioTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const FileList = forwardRef<HTMLDivElement, FileListProps>(function FileList({
  files,
  isLoading,
  selectedFile,
  mode,
  mergeSelection,
  sessionId,
  isDragOver,
  onDragOverChange,
  onDrop,
  onSelectFile,
  onToggleMergeSelection,
  onDeleteFile,
  onVideoUpload,
  onAudioUpload,
  isRecordingAudio,
  audioRecordingTime,
  onStartAudioRecording,
  onStopAudioRecording,
  formatFileSize,
  formatDuration,
  highlightedFileId,
}, ref) {
  // Inline delete confirmation: first click shows "Wirklich?", second click within 3s deletes
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmingDeleteId) return;
    const timer = setTimeout(() => setConfirmingDeleteId(null), 3000);
    return () => clearTimeout(timer);
  }, [confirmingDeleteId]);

  const handleDelete = useCallback((e: React.MouseEvent, fileId: string) => {
    e.stopPropagation();
    if (confirmingDeleteId === fileId) {
      onDeleteFile(fileId);
      setConfirmingDeleteId(null);
    } else {
      setConfirmingDeleteId(fileId);
    }
  }, [confirmingDeleteId, onDeleteFile]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDragOverChange(true);
  }, [onDragOverChange]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDragOverChange(true);
  }, [onDragOverChange]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDragOverChange(false);
  }, [onDragOverChange]);

  return (
    <div
      ref={ref}
      className={`bg-white/80 backdrop-blur-sm rounded-2xl border p-6 transition-colors ${
        isDragOver ? "border-purple-400 bg-purple-50/70" : "border-slate-200"
      }`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={onDrop}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Dateien</h2>
        <div className="flex items-center gap-2">
          {/* Video Upload */}
          <label className="cursor-pointer focus-within:ring-2 focus-within:ring-purple-500 focus-within:ring-offset-2 rounded-lg">
            <input
              type="file"
              accept="video/*"
              onChange={onVideoUpload}
              className="sr-only"
              aria-label="Video-Datei hochladen"
            />
            <div className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium" aria-hidden="true">
              <Video className="w-4 h-4" />
              Video
            </div>
          </label>

          {/* Audio Upload */}
          <label className="cursor-pointer focus-within:ring-2 focus-within:ring-orange-500 focus-within:ring-offset-2 rounded-lg">
            <input
              type="file"
              accept="audio/*"
              onChange={onAudioUpload}
              className="sr-only"
              aria-label="Audio-Datei hochladen"
            />
            <div className="flex items-center gap-2 px-3 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm font-medium" aria-hidden="true">
              <Music className="w-4 h-4" />
              Audio
            </div>
          </label>

          {/* Audio Recording */}
          {isRecordingAudio ? (
            <button
              onClick={onStopAudioRecording}
              className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium animate-pulse"
            >
              <Square className="w-4 h-4 fill-current" />
              {formatAudioTime(audioRecordingTime)}
            </button>
          ) : (
            <button
              onClick={onStartAudioRecording}
              className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium"
            >
              <Mic className="w-4 h-4" />
              Aufnehmen
            </button>
          )}
        </div>
      </div>

      {isDragOver && (
        <div className="mb-4 rounded-xl border border-dashed border-purple-300 bg-purple-50 px-4 py-3 text-sm text-purple-800">
          Dateien loslassen, um sie hochzuladen.
        </div>
      )}

      {isLoading && files.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : files.length === 0 ? (
        <div className="text-center py-8 text-slate-500">
          <div className="flex justify-center gap-2 mb-3">
            <FileVideo className="w-10 h-10 text-slate-300" />
            <FileAudio className="w-10 h-10 text-slate-300" />
          </div>
          <p className="font-medium">Noch keine Dateien</p>
          <p className="text-sm">Zieh Dateien hierher (Drag+Drop) oder nutze die Buttons oben.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {files.map(file => (
            <div
              key={file.id}
              className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
                highlightedFileId === file.id
                  ? 'ring-2 ring-purple-400 animate-pulse bg-purple-50 border-2 border-purple-300 shadow-sm'
                  : selectedFile?.id === file.id
                  ? 'bg-purple-50 border-2 border-purple-300 shadow-sm'
                  : mode === 'merge' && mergeSelection.includes(file.id)
                  ? 'bg-violet-50 border-2 border-blue-300 shadow-sm'
                  : 'bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:border-slate-300'
              }`}
              onClick={() => mode === 'merge' ? onToggleMergeSelection(file.id) : onSelectFile(file)}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                isAudioFile(file)
                  ? 'bg-orange-100'
                  : selectedFile?.id === file.id ? 'bg-purple-200' : 'bg-purple-100'
              }`}>
                {isAudioFile(file) ? (
                  <Music className="w-5 h-5 text-orange-600" />
                ) : (
                  <Video className="w-5 h-5 text-purple-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {file.name}
                </p>
                <p className="text-xs text-slate-500">
                  {formatFileSize(file.size)}
                  {file.metadata?.duration && ` \u2022 ${formatDuration(file.metadata.duration)}`}
                </p>
              </div>
              {mode === 'merge' && (
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                  mergeSelection.includes(file.id)
                    ? 'bg-violet-600 text-white'
                    : 'border-2 border-slate-300'
                }`}>
                  {mergeSelection.includes(file.id) && (
                    <span className="text-xs font-bold">
                      {mergeSelection.indexOf(file.id) + 1}
                    </span>
                  )}
                </div>
              )}
              <button
                onClick={(e) => handleDelete(e, file.id)}
                className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
                  confirmingDeleteId === file.id
                    ? 'bg-red-100 text-red-600 ring-2 ring-red-300'
                    : 'text-slate-400 hover:text-red-500 hover:bg-red-50'
                }`}
                title={confirmingDeleteId === file.id ? 'Nochmal klicken zum Löschen' : 'Datei löschen'}
              >
                {confirmingDeleteId === file.id ? (
                  <span className="text-xs font-medium px-1">Löschen?</span>
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Session Info */}
      <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <span>Session: {sessionId?.slice(0, 8) || 'Keine'}...</span>
        <span>Dateien werden nach 24h automatisch gelöscht</span>
      </div>
    </div>
  );
});
