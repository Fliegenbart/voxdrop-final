import { useEffect, useMemo, useRef, useState } from "react";
import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Loader2,
  Sparkles,
  Video,
  Download,
  RefreshCw,
  PlayCircle,
  Upload,
} from "lucide-react";

interface AvatarInfo {
  id: string;
  name: string;
  preview_url?: string;
}

interface VoiceInfo {
  id: string;
  name: string;
  has_sample?: boolean;
}

interface JobStatus {
  job_id: string;
  status: string;
  progress: number;
  video_url?: string | null;
  error?: string | null;
}

const API_BASE = "/api/avatar";
const CHAR_LIMIT = 2000;

const statusLabels: Record<string, string> = {
  pending: "In Warteschlange...",
  processing_tts: "Generiere Sprache...",
  processing_avatar: "Animiere Avatar...",
  completed: "Fertig!",
  error: "Fehler aufgetreten",
};

const fallbackAvatarSvg = encodeURIComponent(
  "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 120 120\"><rect width=\"120\" height=\"120\" fill=\"#E5E7EB\"/><circle cx=\"60\" cy=\"46\" r=\"22\" fill=\"#9CA3AF\"/><rect x=\"26\" y=\"76\" width=\"68\" height=\"26\" rx=\"13\" fill=\"#9CA3AF\"/></svg>"
);
const fallbackAvatar = `data:image/svg+xml;utf8,${fallbackAvatarSvg}`;

export default function AvatarTool() {
  const [text, setText] = useState("");
  const [avatars, setAvatars] = useState<AvatarInfo[]>([
    { id: "default", name: "Standard" },
  ]);
  const [voices, setVoices] = useState<VoiceInfo[]>([
    { id: "default", name: "Standard" },
  ]);
  const [selectedAvatar, setSelectedAvatar] = useState("default");
  const [selectedVoice, setSelectedVoice] = useState("default");
  const [speed, setSpeed] = useState(1.0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("Bereit");
  const [isProcessing, setIsProcessing] = useState(false);
  const [serviceAvailable, setServiceAvailable] = useState<boolean | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: "error" | "success";
    message: string;
  } | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const charCount = text.length;
  const charState = useMemo(() => {
    if (charCount > 1800) return "error";
    if (charCount > 1500) return "warning";
    return "ok";
  }, [charCount]);

  useEffect(() => {
    let active = true;

    const loadAvatars = async () => {
      try {
        const response = await fetch(`${API_BASE}/avatars`);
        if (!response.ok) throw new Error("avatars_failed");
        const data = await response.json();
        const avatarsRaw = data?.avatars;
        if (!active || !Array.isArray(avatarsRaw)) return;
        // Cast away `any` coming from `response.json()` so we keep type safety downstream.
        const mapped = (avatarsRaw as AvatarInfo[]).map((avatar) => ({
          ...avatar,
          preview_url: `${API_BASE}/preview/${avatar.id}`,
        }));
        if (mapped.length > 0) {
          setAvatars(mapped);
          setSelectedAvatar((prev) =>
            mapped.some((avatar) => avatar.id === prev) ? prev : mapped[0]?.id || "default"
          );
        }
      } catch {
        // Keep defaults
      }
    };

    const loadVoices = async () => {
      try {
        const response = await fetch(`${API_BASE}/voices`);
        if (!response.ok) throw new Error("voices_failed");
        const data = await response.json();
        if (!active || !Array.isArray(data?.voices)) return;
        if (data.voices.length > 0) {
          setVoices(data.voices);
          setSelectedVoice((prev) =>
            data.voices.some((voice: VoiceInfo) => voice.id === prev) ? prev : data.voices[0]?.id || "default"
          );
        }
      } catch {
        // Keep defaults
      }
    };

    const checkHealth = async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(`${API_BASE}/health`, { signal: controller.signal });
        if (!response.ok) throw new Error("health_failed");
        setServiceAvailable(true);
      } catch {
        setServiceAvailable(false);
      } finally {
        window.clearTimeout(timeout);
      }
    };

    loadAvatars();
    loadVoices();
    checkHealth();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!jobId || !isProcessing) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`${API_BASE}/status/${jobId}`);
        if (!response.ok) throw new Error("status_failed");
        const data: JobStatus = await response.json();
        if (cancelled) return;

        const nextProgress = typeof data.progress === "number" ? data.progress : 0;
        setProgress(nextProgress);
        setProgressText(statusLabels[data.status] || "Verarbeite...");

        if (data.status === "completed") {
          setVideoUrl(data.video_url || `${API_BASE}/video/${jobId}`);
          setIsProcessing(false);
          setStatusMessage({ type: "success", message: "Video erfolgreich generiert." });
          setProgress(100);
        }

        if (data.status === "error") {
          setIsProcessing(false);
          setJobId(null);
          setStatusMessage({
            type: "error",
            message: data.error || "Ein Fehler ist aufgetreten.",
          });
        }
      } catch (error) {
        if (cancelled) return;
        setIsProcessing(false);
        setJobId(null);
        setStatusMessage({
          type: "error",
          message: "Status konnte nicht abgerufen werden.",
        });
      }
    };

    poll();
    const interval = window.setInterval(poll, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [jobId, isProcessing]);

  useEffect(() => {
    if (!videoUrl || !videoRef.current) return;
    videoRef.current.load();
    videoRef.current
      .play()
      .catch(() => {
        // Autoplay may be blocked, ignore.
      });
  }, [videoUrl]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = text.trim();

    if (!trimmed) {
      setStatusMessage({ type: "error", message: "Bitte gib einen Text ein." });
      return;
    }

    setStatusMessage(null);
    setIsProcessing(true);
    setProgress(0);
    setProgressText("Wird gestartet...");
    setVideoUrl(null);

    try {
      const response = await fetch(`${API_BASE}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          avatar: selectedAvatar,
          voice: selectedVoice,
          speed,
        }),
      });

      const data: JobStatus = await response.json().catch(() => ({
        job_id: "",
        status: "error",
        progress: 0,
      }));

      if (!response.ok || !data.job_id) {
        throw new Error(data.error || "Anfrage fehlgeschlagen");
      }

      setJobId(data.job_id);
    } catch (error: any) {
      setIsProcessing(false);
      setJobId(null);
      setStatusMessage({
        type: "error",
        message: error?.message || "Anfrage fehlgeschlagen.",
      });
    }
  };

  const resetForm = () => {
    setText("");
    setJobId(null);
    setVideoUrl(null);
    setProgress(0);
    setProgressText("Bereit");
    setIsProcessing(false);
    setStatusMessage(null);
  };

  const handleAvatarUpload = async () => {
    if (!uploadFile) return;

    setUploading(true);
    setUploadStatus(null);

    try {
      const formData = new FormData();
      formData.append("file", uploadFile);

      const response = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.id) {
        throw new Error(data?.detail || data?.error || "Upload fehlgeschlagen");
      }

      const nextAvatar: AvatarInfo = {
        id: data.id,
        name: data.name || "Eigenes Bild",
        preview_url: `${API_BASE}/preview/${data.id}`,
      };

      setAvatars((prev) => {
        if (prev.some((avatar) => avatar.id === nextAvatar.id)) return prev;
        return [nextAvatar, ...prev];
      });
      setSelectedAvatar(nextAvatar.id);
      setUploadStatus("Bild erfolgreich hochgeladen.");
      setUploadFile(null);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    } catch (error: any) {
      setUploadStatus(error?.message || "Upload fehlgeschlagen.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <PageLayout>
      <SEO
        title="Sprechender Avatar"
        description="Text eingeben, Avatar spricht. DSGVO-konform, barrierefrei und vollständig selbst gehostet."
        canonical="/avatar"
      />

      <main id="main-content" className="max-w-6xl mx-auto px-6 py-12" tabIndex={-1}>
        <header className="text-center mb-10">
          <Badge variant="outline" className="mb-4 bg-white">
            DSGVO-konform
          </Badge>
          <h1 className="text-4xl md:text-5xl font-semibold text-slate-900 tracking-tight mb-3">
            Sprechender Avatar
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Gib einen Text ein und dein Avatar spricht ihn für dich. Barrierefrei, datenschutzkonform und komplett selbst gehostet.
          </p>
        </header>

        {serviceAvailable === false && (
          <div className="mb-8">
            <Alert variant="destructive">
              <AlertTitle>Avatar-Service nicht erreichbar</AlertTitle>
              <AlertDescription>
                Der Avatar-Service ist aktuell nicht verfügbar. Bitte versuche es später erneut.
              </AlertDescription>
            </Alert>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl">Text eingeben</CardTitle>
              <CardDescription>
                Der Avatar spricht deinen Text mit der ausgewählten Stimme.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="avatar-text">Was soll der Avatar sagen?</Label>
                  <Textarea
                    id="avatar-text"
                    placeholder="Gib hier deinen Text ein..."
                    maxLength={CHAR_LIMIT}
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    className="min-h-[180px]"
                    aria-describedby="avatar-char-count"
                  />
                  <div
                    id="avatar-char-count"
                    className={`text-right text-xs ${
                      charState === "error"
                        ? "text-red-600"
                        : charState === "warning"
                        ? "text-amber-600"
                        : "text-slate-500"
                    }`}
                  >
                    {charCount} / {CHAR_LIMIT} Zeichen
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Avatar auswählen</Label>
                  <div
                    className="grid grid-cols-4 gap-3"
                    role="radiogroup"
                    aria-label="Avatar auswählen"
                  >
                    {avatars.map((avatar) => {
                      const previewUrl = avatar.preview_url || `${API_BASE}/preview/${avatar.id}`;
                      const isSelected = selectedAvatar === avatar.id;
                      return (
                        <button
                          key={avatar.id}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          onClick={() => setSelectedAvatar(avatar.id)}
                          className={`group relative aspect-square rounded-xl border bg-white overflow-hidden transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${
                            isSelected
                              ? "border-violet-500 ring-2 ring-violet-500/20"
                              : "border-slate-200 hover:border-violet-300"
                          }`}
                        >
                          <img
                            src={previewUrl}
                            alt={avatar.name}
                            className="h-full w-full object-cover"
                            onError={(event) => {
                              const target = event.currentTarget;
                              if (target.dataset.fallback) return;
                              target.dataset.fallback = "true";
                              target.src = fallbackAvatar;
                            }}
                          />
                          <span className="sr-only">{avatar.name}</span>
                          <div
                            className={`absolute inset-0 bg-violet-500/10 opacity-0 transition-opacity ${
                              isSelected ? "opacity-100" : "group-hover:opacity-60"
                            }`}
                            aria-hidden="true"
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="avatar-upload">Eigenes Bild hochladen</Label>
                  <input
                    id="avatar-upload"
                    ref={uploadInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setUploadFile(file);
                      setUploadStatus(null);
                    }}
                    className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
                  />
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span>PNG, JPG oder WEBP (max. 10 MB)</span>
                    {uploadFile && <span className="text-slate-700">{uploadFile.name}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleAvatarUpload}
                      disabled={!uploadFile || uploading || serviceAvailable === false}
                    >
                      {uploading ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Lädt hoch...
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <Upload className="h-4 w-4" />
                          Bild hochladen
                        </span>
                      )}
                    </Button>
                    {uploadStatus && (
                      <span
                        className={`text-xs ${
                          uploadStatus.toLowerCase().includes("erfolgreich")
                            ? "text-emerald-600"
                            : "text-red-600"
                        }`}
                      >
                        {uploadStatus}
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="voice-select">Stimme</Label>
                  <select
                    id="voice-select"
                    value={selectedVoice}
                    onChange={(event) => setSelectedVoice(event.target.value)}
                    className="w-full h-11 px-3 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    {voices.map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.name}{voice.has_sample ? " (Voice Clone)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-3">
                  <Label htmlFor="speed-range">
                    Geschwindigkeit: <span className="font-semibold text-slate-900">{speed.toFixed(1)}x</span>
                  </Label>
                  <input
                    id="speed-range"
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={speed}
                    onChange={(event) => setSpeed(parseFloat(event.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <p className="text-xs text-slate-500">0.5x (langsam) bis 2.0x (schnell)</p>
                </div>

                <Button type="submit" className="w-full" disabled={isProcessing || serviceAvailable === false}>
                  {isProcessing ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Wird gestartet...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      Avatar generieren
                    </span>
                  )}
                </Button>

                {statusMessage && (
                  <Alert
                    className={
                      statusMessage.type === "success"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-red-200 bg-red-50 text-red-700"
                    }
                  >
                    <AlertTitle>
                      {statusMessage.type === "success" ? "Erfolg" : "Fehler"}
                    </AlertTitle>
                    <AlertDescription>{statusMessage.message}</AlertDescription>
                  </Alert>
                )}
              </form>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl">Vorschau</CardTitle>
              <CardDescription>Hier erscheint dein sprechender Avatar.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="aspect-square w-full rounded-xl border border-dashed border-slate-200 bg-white flex items-center justify-center overflow-hidden">
                {videoUrl ? (
                  <video
                    ref={videoRef}
                    className="h-full w-full object-contain"
                    controls
                    loop
                    aria-label="Generiertes Avatar-Video"
                  >
                    <source src={videoUrl} type="video/mp4" />
                    Dein Browser unterstützt kein Video.
                  </video>
                ) : (
                  <div className="text-center text-slate-500 px-6">
                    <PlayCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                    <p>Starte eine Generierung, um die Vorschau zu sehen.</p>
                  </div>
                )}
              </div>

              {isProcessing && (
                <div className="space-y-3">
                  <Progress value={progress} className="h-2" />
                  <div className="flex items-center justify-between text-sm text-slate-600">
                    <span className="flex items-center gap-2" aria-live="polite">
                      <Video className="w-4 h-4 text-violet-500" />
                      {progressText}
                    </span>
                    <span className="font-mono text-violet-600">{progress}%</span>
                  </div>
                </div>
              )}

              {videoUrl && !isProcessing && (
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button asChild className="flex-1">
                    <a href={videoUrl} download>
                      <Download className="w-4 h-4 mr-2" />
                      Herunterladen
                    </a>
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={resetForm} type="button">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Neues Video
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

    </PageLayout>
  );
}
