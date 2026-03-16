import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { SessionFile } from "@/hooks/use-session";
import { Loader2 } from "lucide-react";

type Voice = "male" | "female";
type TtsEngine = "qwen3tts" | "xtts" | "piper";

const MARKER_RE = /\(\(\s*(WEITER|NEXT|BREAK)\s*\)\)|^\s*---\s*$/gim;

const EXAMPLE_SCRIPT = [
  "Titel: Anwendung X in 3 Minuten",
  "",
  "Hallo, ich zeige dir kurz, wie du Antrag Y in der Anwendung X erstellst.",
  "",
  "((WEITER))",
  "",
  "Wir starten auf der Startseite. Klicke links auf \"Anträge\" und dann auf \"Neu\".",
  "",
  "((WEITER))",
  "",
  "Jetzt füllst du die Pflichtfelder aus: Name, Aktenzeichen und Datum. Wenn du unsicher bist, nutze die Hilfetexte rechts.",
  "",
  "---",
  "",
  "Zum Schluss pruefst du alles und klickst auf \"Senden\". Fertig.",
].join("\n");

function analyzeMarkerChunks(text: string): { chunkCount: number; markerCount: number } {
  const s = String(text || "").replace(/\r\n/g, "\n");
  const matches = Array.from(s.matchAll(MARKER_RE));
  const boundaries: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const m of matches) {
    const idx = m.index ?? -1;
    if (idx < 0) continue;
    boundaries.push({ start: cursor, end: idx });
    cursor = idx + m[0].length;
  }
  boundaries.push({ start: cursor, end: s.length });
  const chunks = boundaries.map((b) => s.slice(b.start, b.end).trim()).filter(Boolean);
  return { chunkCount: chunks.length, markerCount: matches.length };
}

export function SmartSyncPanel(props: {
  sessionId: string | null;
  selectedFile: SessionFile | null;
  refreshSession: () => Promise<void>;
  onUseResult: (file: SessionFile) => void;
}) {
  const { toast } = useToast();
  const { sessionId, selectedFile, refreshSession, onUseResult } = props;

  const [scriptFile, setScriptFile] = useState<File | null>(null);
  const [voice, setVoice] = useState<Voice>("female");
  const [ttsEngine, setTtsEngine] = useState<TtsEngine>("qwen3tts");
  const [working, setWorking] = useState(false);
  const [resultFileId, setResultFileId] = useState<string | null>(null);

  const [scriptTextPreview, setScriptTextPreview] = useState<string | null>(null);
  const [analyzeStatus, setAnalyzeStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const analysis = useMemo(() => {
    if (!scriptTextPreview) return null;
    const { chunkCount, markerCount } = analyzeMarkerChunks(scriptTextPreview);
    return {
      chunkCount,
      markerCount,
      single: chunkCount === 1,
      tooMany: chunkCount > 40,
    };
  }, [scriptTextPreview]);

  const copyExample = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(EXAMPLE_SCRIPT);
      } else {
        const ta = document.createElement("textarea");
        ta.value = EXAMPLE_SCRIPT;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      toast({ title: "Beispiel kopiert", description: "Du kannst es jetzt in Word oder eine .txt einfügen." });
    } catch {
      toast({ title: "Kopieren fehlgeschlagen", description: "Bitte manuell markieren und kopieren.", variant: "destructive" });
    }
  }, [toast]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!scriptFile) {
        setScriptTextPreview(null);
        setAnalyzeStatus("idle");
        setAnalyzeError(null);
        return;
      }

      setAnalyzeStatus("loading");
      setAnalyzeError(null);
      setScriptTextPreview(null);

      try {
        const isDocx =
          scriptFile.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
          scriptFile.name.toLowerCase().endsWith(".docx");

        if (isDocx) {
          const form = new FormData();
          form.append("file", scriptFile, scriptFile.name);
          const res = await fetch("/api/voiceover/extract-text", {
            method: "POST",
            credentials: "include",
            body: form,
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || "Skript konnte nicht gelesen werden");

          const text = String(data?.text || "");
          if (cancelled) return;
          setScriptTextPreview(text);
          setAnalyzeStatus("ready");
          return;
        }

        const text = await scriptFile.text();
        if (cancelled) return;
        setScriptTextPreview(text);
        setAnalyzeStatus("ready");
      } catch (err: any) {
        if (cancelled) return;
        setAnalyzeStatus("error");
        setAnalyzeError(err?.message || String(err));
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [scriptFile]);

  const start = useCallback(async () => {
    if (!sessionId) {
      toast({ title: "Keine Session", description: "Bitte Seite neu laden.", variant: "destructive" });
      return;
    }
    if (!selectedFile) {
      toast({ title: "Video auswählen", description: "Bitte zuerst ein Screen Recording auswählen.", variant: "destructive" });
      return;
    }
    if (!scriptFile) {
      toast({ title: "Skript fehlt", description: "Bitte ein Skript (.docx oder .txt) auswählen.", variant: "destructive" });
      return;
    }
    if (analysis?.tooMany) {
      toast({ title: "Zu viele Abschnitte", description: "Bitte Marker reduzieren (max 40 Abschnitte).", variant: "destructive" });
      return;
    }

    setWorking(true);
    setResultFileId(null);
    try {
      const form = new FormData();
      form.append("videoFileId", selectedFile.id);
      form.append("voice", voice);
      form.append("ttsEngine", ttsEngine);
      form.append("script", scriptFile, scriptFile.name);

      const res = await fetch("/api/video-ai/smart-sync", {
        method: "POST",
        headers: { "X-Session-ID": sessionId },
        credentials: "include",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Smart-Sync fehlgeschlagen");

      const newFile = data?.file as SessionFile | undefined;
      await refreshSession();

      if (newFile?.id) {
        setResultFileId(newFile.id);
        onUseResult(newFile);
      }

      toast({ title: "Autopilot fertig", description: "Neues Video wurde in der Session gespeichert." });
    } catch (err: any) {
      toast({ title: "Smart-Sync fehlgeschlagen", description: err?.message || String(err), variant: "destructive" });
    } finally {
      setWorking(false);
    }
  }, [analysis?.tooMany, onUseResult, refreshSession, scriptFile, selectedFile, sessionId, toast, ttsEngine, voice]);

  return (
    <div className="mt-2 bg-white rounded-xl border border-violet-200 p-3 w-[min(640px,92vw)]">
      <div className="text-xs font-medium text-slate-800 mb-2">Erklärvideo-Autopilot</div>
      <div className="text-[11px] text-slate-600 mb-3">
        Skript (.docx/.txt) mit Markern wie <span className="font-mono">((WEITER))</span> oder <span className="font-mono">---</span>.
        Wir erzeugen pro Abschnitt Sprache und synchronisieren dein Screen Recording automatisch (Freeze wenn nötig).
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2">
          <input
            type="file"
            accept=".docx,.txt,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => setScriptFile(e.target.files?.[0] || null)}
            className="block w-full text-sm"
          />
          <div className="mt-1 text-[11px] text-slate-500">
            {scriptFile ? `Skript: ${scriptFile.name}` : "Noch kein Skript ausgewählt."}
          </div>
        </div>

        <div className="flex items-start gap-2">
          <Button
            className="w-full bg-violet-700 hover:bg-violet-800"
            onClick={start}
            disabled={working || !selectedFile || !scriptFile}
          >
            {working ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Läuft...
              </>
            ) : (
              "Start"
            )}
          </Button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className="text-[11px] font-medium text-slate-700 mb-1">Stimme</div>
          <Select value={voice} onValueChange={(v) => setVoice(v as Voice)}>
            <SelectTrigger>
              <SelectValue placeholder="female" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="female">Weiblich</SelectItem>
              <SelectItem value="male">Männlich</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-[11px] font-medium text-slate-700 mb-1">TTS Engine</div>
          <Select value={ttsEngine} onValueChange={(v) => setTtsEngine(v as TtsEngine)}>
            <SelectTrigger>
              <SelectValue placeholder="qwen3tts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="qwen3tts">Qwen3-TTS (best)</SelectItem>
              <SelectItem value="xtts">XTTS (fallback)</SelectItem>
              <SelectItem value="piper">Piper (fast)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-violet-100 bg-violet-50/40 p-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[11px] font-medium text-slate-800">Skript-Checkliste</div>
          <Button
            size="sm"
            variant="outline"
            className="rounded-lg border-violet-200 bg-white hover:bg-violet-50"
            onClick={copyExample}
            type="button"
          >
            Beispiel kopieren
          </Button>
        </div>
        <div className="mt-2 text-[11px] text-slate-700 space-y-1">
          <div>1. Marker auf eigener Zeile: <span className="font-mono">((WEITER))</span> oder <span className="font-mono">---</span></div>
          <div>2. Pro Abschnitt 1 bis 4 Sätze (kurz und klar), dann Marker.</div>
          <div>3. Schreibe konkret (statt "hier klicken"): Menüpunkt, Button, Feldname.</div>
          <div>4. Wenn es mehr als 40 Abschnitte sind: Marker grober setzen.</div>
        </div>
        <pre className="mt-3 text-[11px] leading-4 bg-white border border-violet-100 rounded-lg p-2 overflow-auto max-h-44 whitespace-pre-wrap">
{EXAMPLE_SCRIPT}
        </pre>
      </div>

      <div className="mt-3 text-[11px] text-slate-700">
        {analyzeStatus === "loading" && (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            Skript wird analysiert...
          </span>
        )}
        {analyzeStatus === "error" && (
          <span className="text-red-700">
            Skript-Analyse fehlgeschlagen: {analyzeError || "Unbekannter Fehler"}
          </span>
        )}
        {analyzeStatus === "ready" && analysis && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-1 rounded bg-white border border-slate-200">
              Abschnitte: <span className="font-medium tabular-nums">{analysis.chunkCount}</span>
            </span>
            <span className="px-2 py-1 rounded bg-white border border-slate-200">
              Marker: <span className="font-medium tabular-nums">{analysis.markerCount}</span>
            </span>
            {analysis.single && (
              <span className="px-2 py-1 rounded bg-amber-100 text-amber-900 border border-amber-200">
                Hinweis: keine Marker erkannt, es wird ein langer Monolog.
              </span>
            )}
            {analysis.tooMany && (
              <span className="px-2 py-1 rounded bg-red-100 text-red-900 border border-red-200">
                Zu viele Abschnitte (max 40). Bitte Marker reduzieren.
              </span>
            )}
          </div>
        )}
      </div>

      {resultFileId && sessionId && (
        <div className="mt-3 text-[11px] text-slate-600">
          Ergebnis:{" "}
          <a className="underline underline-offset-4 text-violet-700" href={`/api/session/files/${resultFileId}?session=${sessionId}`}>
            Download
          </a>
        </div>
      )}
    </div>
  );
}
