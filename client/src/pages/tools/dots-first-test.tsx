import { useCallback, useState } from "react";
import { Link } from "wouter";
import { useDropzone } from "react-dropzone";
import { ArrowLeft, AlertTriangle, CheckCircle2, Copy, Download, FileOutput, Loader2, RefreshCw, Sparkles, Upload } from "lucide-react";

import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

interface JobStatus {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  stage?: string;
  percent?: number;
  error?: string;
  pipelineMode?: "legacy" | "docling" | "hybrid" | "docling_optimized" | "smart_legacy" | "dots_first" | string;
  requestedPipelineMode?: string;
  effectivePipelineMode?: string;
  fallbackUsed?: boolean;
  fallbackReasons?: string[];
  queue?: {
    position: number | null;
    estimatedWaitMinutes: number;
    totalInQueue: number;
  };
}

const PHASE_LABELS: Record<string, string> = {
  queued: "In der Warteschlange...",
  parsing: "Struktur wird mit dots erkannt...",
  classifying: "Folien werden vorbereitet...",
  gpu_queue: "Wartet auf GPU...",
  vision: "Visuelle Analyse...",
  vlm: "Qwen-Enrichment...",
  summary: "Zusammenfassung...",
  building: "PDF wird vorbereitet...",
  pdfua: "PDF/UA wird erstellt...",
  finalizing: "Wird abgeschlossen...",
  done: "Fertig!",
  complete: "Fertig!",
  completed: "Fertig!",
};

function resolvePipelineLabelByMode(modeInput?: string): string | null {
  const mode = String(modeInput || "").toLowerCase();
  if (mode === "dots_first") return "Dots-first";
  if (mode === "smart_legacy") return "Smart Legacy";
  if (mode === "hybrid") return "Hybrid";
  if (mode === "docling") return "Docling";
  if (mode === "legacy") return "Legacy";
  return null;
}

export default function DotsFirstTestTool() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [notifyByEmail, setNotifyByEmail] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [outputReady, setOutputReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshSession = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });
      return response.ok;
    } catch {
      return false;
    }
  }, []);

  const fetchWithAuthRetry = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const mergedOptions: RequestInit = {
        credentials: "include",
        ...options,
      };

      let response = await fetch(url, mergedOptions);
      if (response.status !== 401) return response;

      const refreshed = await refreshSession();
      if (!refreshed) return response;

      return fetch(url, mergedOptions);
    },
    [refreshSession],
  );

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const pptxFile = acceptedFiles.find((f) => /\.pptx$/i.test(f.name));
    if (!pptxFile) {
      setFile(null);
      setError("Bitte eine PPTX-Datei hochladen.");
      return;
    }

    setFile(pptxFile);
    setError(null);
    setStatus(null);
    setOutputReady(false);
    setJobId(null);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
    },
    maxFiles: 1,
    maxSize: 100 * 1024 * 1024,
    disabled: isProcessing,
  });

  const pollJobStatus = useCallback(
    async (id: string) => {
      try {
        const response = await fetchWithAuthRetry(`/api/pptx-summary-pdf/status/${id}`);
        if (response.status === 401) {
          setError("Sitzung abgelaufen. Bitte neu einloggen.");
          setIsProcessing(false);
          return;
        }
        if (response.status === 404) {
          setError("Job nicht gefunden.");
          setIsProcessing(false);
          return;
        }
        if (!response.ok) {
          throw new Error("Status konnte nicht geladen werden.");
        }

        const jobStatus: JobStatus = await response.json();
        setStatus(jobStatus);

        if (jobStatus.status === "queued" || jobStatus.status === "processing") {
          const delay = jobStatus.status === "queued" ? 3000 : 1500;
          window.setTimeout(() => {
            void pollJobStatus(id);
          }, delay);
          return;
        }

        if (jobStatus.status === "completed") {
          setIsProcessing(false);
          setOutputReady(true);
          toast({
            title: "Fertig",
            description: "Das Dots-first PDF/UA ist bereit zum Download.",
          });
          return;
        }

        setIsProcessing(false);
        setError(jobStatus.error || "Konvertierung fehlgeschlagen.");
      } catch (err: any) {
        setError(err?.message || "Verbindung verloren.");
        window.setTimeout(() => {
          void pollJobStatus(id);
        }, 2500);
      }
    },
    [fetchWithAuthRetry, toast],
  );

  const handleConvert = useCallback(async () => {
    if (!file) return;

    setIsProcessing(true);
    setOutputReady(false);
    setStatus(null);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("storageScope", "user");
      formData.append("quality", "standard");
      formData.append("processVersion", "2");
      formData.append("summaryMode", "true");
      formData.append("includeSpeakerNotes", "true");
      formData.append("pipelineMode", "dots_first");
      formData.append("useDocling", "false");
      if (notifyByEmail && user?.email) {
        formData.append("notifyEmail", user.email);
      }

      const response = await fetchWithAuthRetry("/api/pptx-summary-pdf/convert-dots", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Sitzung abgelaufen. Bitte neu einloggen.");
        }
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Upload fehlgeschlagen.");
      }

      const data = await response.json();
      const id = data?.jobId || data?.job_id;
      if (!id || typeof id !== "string") {
        throw new Error("API hat keine gueltige Job-ID geliefert.");
      }

      setJobId(id);
      toast({
        title: "Dots-first Job gestartet",
        description: `Job-ID: ${id}`,
      });
      void pollJobStatus(id);
    } catch (err: any) {
      setIsProcessing(false);
      setError(err?.message || "Konvertierung fehlgeschlagen.");
    }
  }, [file, notifyByEmail, user?.email, fetchWithAuthRetry, pollJobStatus, toast]);

  const handleDownload = useCallback(async () => {
    if (!jobId) return;
    try {
      const response = await fetchWithAuthRetry(`/api/pptx-summary-pdf/download/${jobId}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Download fehlgeschlagen.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const baseName = file?.name?.replace(/\.[^/.]+$/, "") || "dots_first_test";
      a.download = `${baseName}_dots_pdfua.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message || "Download fehlgeschlagen.");
    }
  }, [file?.name, jobId, fetchWithAuthRetry]);

  const handleReset = useCallback(() => {
    setFile(null);
    setNotifyByEmail(false);
    setJobId(null);
    setStatus(null);
    setIsProcessing(false);
    setOutputReady(false);
    setError(null);
  }, []);

  const copyJobId = useCallback(async () => {
    if (!jobId) return;
    try {
      await navigator.clipboard.writeText(jobId);
      toast({
        title: "Job-ID kopiert",
        description: jobId,
      });
    } catch {
      setError("Job-ID konnte nicht kopiert werden.");
    }
  }, [jobId, toast]);

  const requestedPipelineMode = String(status?.requestedPipelineMode || status?.pipelineMode || "").toLowerCase();
  const effectivePipelineMode = String(status?.effectivePipelineMode || status?.pipelineMode || "").toLowerCase();
  const pipelineLabel = resolvePipelineLabelByMode(effectivePipelineMode);
  const requestedPipelineLabel = resolvePipelineLabelByMode(requestedPipelineMode);
  const fallbackReasons = Array.isArray(status?.fallbackReasons)
    ? status.fallbackReasons.map((reason) => String(reason || "").trim()).filter(Boolean)
    : [];
  const fallbackUsed = Boolean(
    status?.fallbackUsed
    || fallbackReasons.length > 0
    || (requestedPipelineMode && effectivePipelineMode && requestedPipelineMode !== effectivePipelineMode)
  );
  const warningVisible = Boolean(
    status && (
      fallbackUsed
      || (effectivePipelineMode && effectivePipelineMode !== "dots_first")
      || (requestedPipelineMode && requestedPipelineMode !== "dots_first")
    )
  );

  return (
    <PageLayout>
      <SEO
        title="Dots-first Test (Beta)"
        description="Interner Beta-Test fuer den dots_first Pipeline-Mode mit Dots-Layout Parsing und Qwen-Enrichment."
        canonical="/tools/dots-first-test"
        noIndex
      />

      <main id="main-content" className="max-w-4xl mx-auto px-6 py-8" tabIndex={-1}>
        <Link href="/" className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Zurueck zur Uebersicht
        </Link>

        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-semibold text-slate-900 mb-3">Dots-first Test (Beta)</h1>
          <p className="text-slate-600 max-w-2xl mx-auto">
            Interner Testpfad: Dots liefert die Folienstruktur, Qwen ergaenzt komplexe Kurzsummaries, Alt-Texte und eine Gesamtuebersicht.
          </p>
        </div>

        <div className="mb-6 p-4 bg-cyan-50 border border-cyan-200 rounded-xl text-sm text-cyan-900">
          Dieser Test nutzt den neuen <code className="bg-cyan-100 px-1 rounded">pipelineMode=dots_first</code> Pfad und erstellt immer eine Overview-Seite.
          Die Route ist fail-closed: Wenn Dots nicht bereit ist, startet kein Job.
        </div>

        {warningVisible && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-900">
              <p className="font-medium">Warnung: Job lief nicht strikt als dots_first.</p>
              <p>
                Angefragt: <strong>{requestedPipelineLabel || requestedPipelineMode || "unbekannt"}</strong> |
                Effektiv: <strong>{pipelineLabel || effectivePipelineMode || "unbekannt"}</strong>
              </p>
              {fallbackReasons.length > 0 && (
                <p>Gruende: {fallbackReasons.join(", ")}</p>
              )}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          {!isProcessing && !outputReady && (
            <>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-10 transition-all cursor-pointer ${
                  isDragActive ? "border-cyan-400 bg-cyan-50" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
                } ${file ? "border-cyan-400 bg-cyan-50" : ""}`}
              >
                <input {...getInputProps()} />
                <div className="flex flex-col items-center text-center">
                  {file ? (
                    <>
                      <FileOutput className="w-8 h-8 text-cyan-600 mb-2" />
                      <p className="font-medium text-slate-900">{file.name}</p>
                      <p className="text-sm text-slate-500 mt-1">
                        Typ: PPTX | {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-slate-400 mb-2" />
                      <p className="font-medium text-slate-900">PPTX hochladen</p>
                      <p className="text-sm text-slate-500 mt-1">Maximal 100 MB</p>
                    </>
                  )}
                </div>
              </div>

              {user?.email && (
                <label className="mt-5 flex items-center gap-3 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifyByEmail}
                    onChange={(e) => setNotifyByEmail(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-cyan-500 focus:ring-cyan-500"
                  />
                  Per E-Mail benachrichtigen ({user.email})
                </label>
              )}

              {error && (
                <div className="mt-5 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  onClick={() => void handleConvert()}
                  disabled={!file}
                  className="bg-cyan-600 hover:bg-cyan-700"
                >
                  <FileOutput className="w-4 h-4 mr-2" />
                  Dots-first Konvertierung starten
                </Button>
                <Button variant="outline" onClick={handleReset}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Zuruecksetzen
                </Button>
              </div>
            </>
          )}

          {isProcessing && status && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-cyan-600" />
                <div>
                  <p className="font-medium text-slate-900">Konvertierung laeuft...</p>
                  <p className="text-sm text-slate-500">
                    {PHASE_LABELS[status.stage || "processing"] || status.stage || "Verarbeitung"}
                  </p>
                </div>
              </div>

              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-500 transition-all duration-300"
                  style={{ width: `${Math.max(0, Math.min(100, status.percent || 0))}%` }}
                />
              </div>

              <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                <span>Fortschritt: {status.percent || 0}%</span>
                {requestedPipelineLabel && <span>Angefragt: {requestedPipelineLabel}</span>}
                {pipelineLabel && <span>Effektiv: {pipelineLabel}</span>}
                {status.queue?.position && status.queue.position > 1 && (
                  <span>Queue: Platz {status.queue.position}</span>
                )}
              </div>

              {jobId && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Job-ID</p>
                    <p className="text-sm font-mono text-slate-800 break-all">{jobId}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => void copyJobId()}>
                    <Copy className="w-4 h-4 mr-2" />
                    Kopieren
                  </Button>
                </div>
              )}
            </div>
          )}

          {outputReady && (
            <div className="space-y-5">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-emerald-900">Konvertierung erfolgreich abgeschlossen</p>
                  <p className="text-sm text-emerald-800">
                    {warningVisible
                      ? "Das PDF/UA wurde erstellt, aber der Lauf war nicht strikt dots_first. Details stehen im Warnhinweis oben."
                      : "Das PDF/UA wurde erstellt. Laden Sie das Ergebnis herunter oder starten Sie einen neuen Test."}
                  </p>
                </div>
              </div>

              {jobId && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Job-ID</p>
                    <p className="text-sm font-mono text-slate-800 break-all">{jobId}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => void copyJobId()}>
                    <Copy className="w-4 h-4 mr-2" />
                    Kopieren
                  </Button>
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <Button onClick={() => void handleDownload()} className="bg-cyan-600 hover:bg-cyan-700">
                  <Download className="w-4 h-4 mr-2" />
                  PDF herunterladen
                </Button>
                <Button variant="outline" onClick={handleReset}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Neuen Test starten
                </Button>
              </div>
            </div>
          )}

          {!isProcessing && !outputReady && !file && (
            <p className="mt-6 text-sm text-slate-500">
              Hinweis: Diese Seite ist ein interner Beta-Testpfad und wird nicht in der Hauptnavigation angezeigt.
            </p>
          )}
        </div>
      </main>
    </PageLayout>
  );
}
