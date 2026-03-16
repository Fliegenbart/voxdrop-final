import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useSession } from "@/hooks/use-session";
import { Loader2, Mic, Upload, ArrowRight, FileText } from "lucide-react";

type Voice = "male" | "female";

export default function VoiceoverTool() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { uploadFile } = useSession();

  const [text, setText] = useState("");
  const [voice, setVoice] = useState<Voice>("female");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [insertedFileId, setInsertedFileId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        window.clearTimeout(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  const extractTextFromDoc = async (file: File) => {
    if (!isAuthenticated) {
      window.location.href = "/anmelden";
      return;
    }
    setIsExtracting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/voiceover/extract-text", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Konnte Text nicht aus Word extrahieren");
      }
      setText(String(data.text || "").trim());
      toast({ title: "Text extrahiert", description: file.name });
    } catch (e: any) {
      toast({
        title: "Fehler",
        description: e?.message || "Extraktion fehlgeschlagen",
        variant: "destructive",
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const startGeneration = async () => {
    if (!isAuthenticated) {
      window.location.href = "/anmelden";
      return;
    }
    if (!text.trim()) {
      toast({
        title: "Kein Text",
        description: "Bitte Text eingeben oder ein Word-Dokument hochladen.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setJobId(null);
    setProgress(0);
    setStatusText("Voiceover wird generiert…");
    setAudioUrl(null);
    setInsertedFileId(null);

    if (pollRef.current) {
      window.clearTimeout(pollRef.current);
      pollRef.current = null;
    }

    try {
      const res = await fetch("/api/voiceover/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          text,
          voice,
          // Force Qwen3 as requested.
          ttsEngine: "qwen3tts",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Generierung fehlgeschlagen");
      }

      const newJobId = String(data.jobId || data.job_id || "");
      if (!newJobId) {
        throw new Error("Kein jobId erhalten");
      }

      setJobId(newJobId);
      const poll = async () => {
        try {
          const s = await fetch(`/api/voiceover/status/${newJobId}`, { credentials: "include" });
          const st = await s.json().catch(() => ({}));
          if (!s.ok) {
            throw new Error(st?.error || "Status-Abfrage fehlgeschlagen");
          }

          setProgress(Number(st.progress || 0));
          setStatusText(String(st.currentStage || st.status || ""));

          if (st.status === "completed") {
            setAudioUrl(`/api/voiceover/download/${newJobId}`);
            setIsGenerating(false);
            if (pollRef.current) {
              window.clearTimeout(pollRef.current);
              pollRef.current = null;
            }
            return;
          }

          if (st.status === "failed") {
            throw new Error(st.error || "Voiceover fehlgeschlagen");
          }

          pollRef.current = window.setTimeout(poll, 1000);
        } catch (e: any) {
          setIsGenerating(false);
          setStatusText("");
          toast({
            title: "Fehler",
            description: e?.message || "Voiceover fehlgeschlagen",
            variant: "destructive",
          });
        }
      };

      pollRef.current = window.setTimeout(poll, 800);
    } catch (e: any) {
      setIsGenerating(false);
      toast({
        title: "Fehler",
        description: e?.message || "Generierung fehlgeschlagen",
        variant: "destructive",
      });
    }
  };

  const insertIntoVideoschnitt = async () => {
    if (!audioUrl) return;
    if (!isAuthenticated) {
      window.location.href = "/anmelden";
      return;
    }
    try {
      const res = await fetch(audioUrl, { credentials: "include" });
      if (!res.ok) {
        throw new Error("Download fehlgeschlagen");
      }
      const blob = await res.blob();
      const filename = `voiceover-${Date.now()}.mp3`;
      const file = new File([blob], filename, { type: "audio/mpeg" });

      const uploaded = await uploadFile(file, { forceResumable: true });
      if (!uploaded) {
        throw new Error("Konnte Voiceover nicht speichern");
      }

      setInsertedFileId(uploaded.id);
      toast({ title: "Voiceover gespeichert", description: "Wird in Videoschnitt eingefügt…" });

      // Auto-insert in videoschnitt via query param
      setLocation(`/tools/untertitel/videoschnitt?insertAudio=${encodeURIComponent(uploaded.id)}`);
    } catch (e: any) {
      toast({
        title: "Fehler",
        description: e?.message || "Einfügen fehlgeschlagen",
        variant: "destructive",
      });
    }
  };

  return (
    <PageLayout>
      <SEO
        title="Voiceover"
        description="Text zu Stimme: Erzeuge ein Voiceover mit Qwen3-TTS und füge es direkt in den Videoschnitt ein."
        canonical="/tools/voiceover"
      />

      <header className="pt-16 pb-10 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-full text-sm font-medium mb-6">
            <Mic className="w-4 h-4" />
            Qwen3 Voiceover
          </div>
          <h1 className="text-4xl md:text-5xl font-semibold text-slate-900 tracking-tight mb-4">
            Voiceover erstellen
          </h1>
          <p className="text-xl text-slate-600 font-light max-w-2xl mx-auto">
            Text einfügen oder aus Word übernehmen. Danach Stimme wählen und direkt als Audiospur im Videoschnitt nutzen.
          </p>
        </div>
      </header>

      <main id="main-content" className="max-w-4xl mx-auto px-6 pb-24" tabIndex={-1}>
        {!user ? (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
            <h2 className="text-xl font-semibold text-slate-900 mb-2">Login erforderlich</h2>
            <p className="text-slate-600 mb-6">Voiceover nutzt deine VoxDrop Session und ist nur im Login verfügbar.</p>
            <Link href="/anmelden">
              <Button className="h-11 rounded-xl">Anmelden</Button>
            </Link>
          </section>
        ) : (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-8 border-b border-slate-100">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <h2 className="text-xl font-semibold text-slate-900">Textquelle</h2>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".doc,.docx"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) extractTextFromDoc(f);
                      e.currentTarget.value = "";
                    }}
                  />
                  <Button
                    variant="outline"
                    className="h-10 rounded-xl"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isExtracting}
                  >
                    {isExtracting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                    Word hochladen
                  </Button>
                </div>
              </div>

              <div className="mt-5">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Text (wird gesprochen)
                </label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Text hier einfügen…"
                  className="w-full min-h-[200px] rounded-xl border border-slate-200 px-4 py-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
                <p className="mt-2 text-xs text-slate-500 flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5" />
                  Tipp: Überschriften, kurze Absätze, klare Satzzeichen verbessern die Sprechqualität.
                </p>
              </div>
            </div>

            <div className="p-8">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Stimme</label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={voice === "male" ? "default" : "outline"}
                      className="h-10 rounded-xl flex-1"
                      onClick={() => setVoice("male")}
                    >
                      Mann
                    </Button>
                    <Button
                      type="button"
                      variant={voice === "female" ? "default" : "outline"}
                      className="h-10 rounded-xl flex-1"
                      onClick={() => setVoice("female")}
                    >
                      Frau
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Engine: <span className="font-medium">Qwen3-TTS</span>
                  </p>
                </div>

                <div className="flex items-end">
                  <Button
                    className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700"
                    onClick={startGeneration}
                    disabled={isGenerating || isExtracting || !text.trim()}
                  >
                    {isGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mic className="w-4 h-4 mr-2" />}
                    Voiceover generieren
                  </Button>
                </div>
              </div>

              {(isGenerating || audioUrl) && (
                <div className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <p className="text-sm font-medium text-emerald-900">
                        {audioUrl ? "Fertig" : "In Arbeit"}
                      </p>
                      <p className="text-xs text-emerald-900/70 mt-1">
                        {jobId ? `Job: ${jobId.slice(0, 8)}…` : null} {statusText ? `· ${statusText}` : null}
                      </p>
                    </div>
                    <div className="text-sm text-emerald-900 font-semibold">
                      {audioUrl ? "100%" : `${Math.max(0, Math.min(99, Math.round(progress || 0)))}%`}
                    </div>
                  </div>

                  <div className="mt-3 h-2 rounded-full bg-emerald-100 overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 rounded-full transition-all"
                      style={{ width: `${audioUrl ? 100 : Math.max(2, Math.min(99, Number(progress || 0)))}%` }}
                    />
                  </div>

                  {audioUrl && (
                    <div className="mt-4 flex flex-col sm:flex-row gap-3">
                      <Button
                        variant="outline"
                        className="h-11 rounded-xl border-emerald-200 text-emerald-800 hover:bg-emerald-100"
                        onClick={() => window.open(audioUrl, "_blank")}
                      >
                        MP3 herunterladen
                      </Button>
                      <Button
                        className="h-11 rounded-xl bg-slate-900 hover:bg-slate-800"
                        onClick={insertIntoVideoschnitt}
                      >
                        In Videoschnitt einfügen
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                  )}

                  {insertedFileId && (
                    <p className="mt-3 text-xs text-emerald-900/70">
                      Gespeichert in deiner Session: <span className="font-mono">{insertedFileId.slice(0, 8)}…</span>
                    </p>
                  )}
                </div>
              )}

              <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-3">
                <Link href="/tools/untertitel/videoschnitt">
                  <Button variant="outline" className="h-11 rounded-xl">
                    Videoschnitt öffnen
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
                <p className="text-xs text-slate-500 text-center sm:text-right">
                  Hinweis: Das Voiceover wird in deiner VoxDrop Session gespeichert (für spätere Weiterverarbeitung).
                </p>
              </div>
            </div>
          </section>
        )}
      </main>

    </PageLayout>
  );
}

