import { useState, useCallback, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useDropzone } from "react-dropzone";
import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { QueueStatusBadge } from "@/components/QueueStatus";
import {
  ArrowLeft,
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  Download,
  RefreshCw,
  AlertTriangle,
  Sparkles,
  FileOutput,
  Mail,
  Clock,
  Users,
  Info,
  Copy,
} from "lucide-react";

interface JobStatus {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  stage?: string;
  percent?: number;
  error?: string;
  documentName?: string;
  queue?: {
    position: number | null;
    estimatedWaitMinutes: number;
    totalInQueue: number;
  };
}

interface SummaryPdfHealthEnvelope {
  status?: string;
  service?: {
    status?: string;
    [key: string]: unknown;
  };
  error?: string;
}

interface HealthState<TPayload extends { error?: string }> {
  available: boolean | null;
  payload?: TPayload;
  error?: string;
}

const PHASE_LABELS: Record<string, string> = {
  queued: "In der Warteschlange...",
  upload: "Datei wird hochgeladen...",
  parsing: "Dokument wird analysiert...",
  classifying: "Inhalte werden eingeordnet...",
  vlm: "KI-Analyse (Alt-Texte & Diagramme)...",
  summary: "KI fasst Inhalte zusammen...",
  building: "Struktur wird generiert...",
  pdfua: "PDF/UA wird erstellt...",
  finalizing: "Wird abgeschlossen...",
  done: "Fertig!",
  complete: "Fertig!",
  completed: "Fertig!",
};

export default function PptxToPdfSmart() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [outputReady, setOutputReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [notifyByEmail, setNotifyByEmail] = useState(false);
  const [summaryPdfHealth, setSummaryPdfHealth] = useState<HealthState<SummaryPdfHealthEnvelope>>({
    available: null,
  });
  const pollRetryRef = useRef(0);

  const serviceAvailable = summaryPdfHealth.available;
  const serviceError =
    summaryPdfHealth.error ||
    summaryPdfHealth.payload?.error ||
    "Der PDF/UA-Dienst ist momentan nicht erreichbar.";
  const activeDocumentName = status?.documentName || file?.name;

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

  useEffect(() => {
    let cancelled = false;

    const fetchHealth = async (): Promise<HealthState<SummaryPdfHealthEnvelope>> => {
      try {
        const response = await fetch("/api/pptx-summary-pdf/health");
        const payload = (await response.json().catch(() => null)) as SummaryPdfHealthEnvelope | null;
        if (!response.ok || !payload) {
          return {
            available: false,
            payload: payload ?? undefined,
            error: payload?.error || `Healthcheck fehlgeschlagen (HTTP ${response.status})`,
          };
        }

        const available = payload.status === "healthy";
        return {
          available,
          payload,
          error: available ? undefined : payload.error || "Service meldet keinen healthy-Status",
        };
      } catch (err: any) {
        return {
          available: false,
          error: err?.message || "Healthcheck fehlgeschlagen",
        };
      }
    };

    void fetchHealth().then((health) => {
      if (cancelled) return;
      setSummaryPdfHealth(health);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const copyJobId = useCallback(async () => {
    if (!jobId) return;

    try {
      await navigator.clipboard.writeText(jobId);
      toast({
        title: "Job-ID kopiert",
        description: `Job-ID ${jobId} wurde in die Zwischenablage kopiert.`,
      });
    } catch {
      toast({
        title: "Fehler",
        description: "Job-ID konnte nicht kopiert werden.",
        variant: "destructive",
      });
    }
  }, [jobId, toast]);

  useEffect(() => {
    if (!jobId || !isProcessing) return;

    const cancelJob = () => {
      const url = `/api/pptx-summary-pdf/cancel/${jobId}`;
      if (navigator.sendBeacon) {
        const payload = new Blob([], { type: "application/json" });
        navigator.sendBeacon(url, payload);
      } else {
        fetch(url, { method: "POST", keepalive: true }).catch(() => {});
      }
    };

    const handlePageHide = () => cancelJob();
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
    };
  }, [jobId, isProcessing]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const pptxFile = acceptedFiles.find((f) => /\.pptx$/i.test(f.name));
    if (pptxFile) {
      setFile(pptxFile);
      setError(null);
      setStatus(null);
      setOutputReady(false);
      setJobId(null);
      return;
    }
    setError("Bitte eine PPTX-Datei hochladen.");
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
    },
    maxFiles: 1,
    maxSize: 100 * 1024 * 1024,
    disabled: isProcessing || serviceAvailable === false,
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
          setError("Job nicht gefunden. Bitte starte die Konvertierung erneut.");
          setIsProcessing(false);
          return;
        }
        if (!response.ok) throw new Error("Status konnte nicht abgerufen werden");

        const jobStatus: JobStatus = await response.json();
        pollRetryRef.current = 0;
        setStatus(jobStatus);

        if (jobStatus.status === "queued" || jobStatus.status === "processing") {
          const pollInterval = jobStatus.status === "queued" ? 3000 : 1500;
          window.setTimeout(() => {
            void pollJobStatus(id);
          }, pollInterval);
          return;
        }

        if (jobStatus.status === "completed") {
          setIsProcessing(false);
          setOutputReady(true);
          toast({
            title: "PDF/UA erstellt",
            description: "Das barrierefreie PDF/UA ist bereit zum Download.",
          });
          return;
        }

        setIsProcessing(false);
        setError(jobStatus.error || "Konvertierung fehlgeschlagen");
        toast({
          title: "Fehler",
          description: jobStatus.error || "Konvertierung fehlgeschlagen",
          variant: "destructive",
        });
      } catch {
        const retryDelay = Math.min(15000, 1500 + pollRetryRef.current * 1000);
        pollRetryRef.current += 1;
        setError("Verbindung zum Server verloren – wir versuchen es erneut...");
        window.setTimeout(() => {
          void pollJobStatus(id);
        }, retryDelay);
      }
    },
    [fetchWithAuthRetry, toast],
  );

  const handleConvert = useCallback(async () => {
    if (!file) return;
    if (serviceAvailable === false) {
      const message = "Der PDF/UA-Dienst ist momentan nicht erreichbar.";
      setError(message);
      toast({
        title: "Service nicht verfügbar",
        description: `${message} ${serviceError}`,
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setError(null);
    setStatus(null);
    setOutputReady(false);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("storageScope", "user");
      if (notifyByEmail && user?.email) {
        formData.append("notifyEmail", user.email);
      }

      // Fester Produktionspfad: beste Qualität, keine Speaker Notes.
      formData.append("quality", "high");
      formData.append("processVersion", "2");
      formData.append("summaryMode", "true");
      formData.append("includeSpeakerNotes", "false");
      formData.append("pipelineMode", "smart_legacy");

      const response = await fetchWithAuthRetry("/api/pptx-summary-pdf/convert", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Sitzung abgelaufen. Bitte neu einloggen.");
        }
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Upload fehlgeschlagen");
      }

      const data = await response.json();
      const jobIdFromResponse = data?.jobId || data?.job_id;
      if (!jobIdFromResponse || typeof jobIdFromResponse !== "string") {
        throw new Error("Job-ID wurde von der API nicht zurückgegeben.");
      }

      setJobId(jobIdFromResponse);
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("jobId", jobIdFromResponse);
      window.history.replaceState({}, "", nextUrl.toString());
      toast({
        title: "Job gestartet",
        description: `Job-ID: ${jobIdFromResponse}`,
      });
      void pollJobStatus(jobIdFromResponse);
    } catch (err: any) {
      setError(err.message);
      setIsProcessing(false);
    }
  }, [file, fetchWithAuthRetry, notifyByEmail, pollJobStatus, serviceAvailable, serviceError, toast, user?.email]);

  const handleDownload = useCallback(async () => {
    if (!jobId) return;
    try {
      const response = await fetchWithAuthRetry(`/api/pptx-summary-pdf/download/${jobId}`);
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Sitzung abgelaufen. Bitte neu einloggen.");
        }
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Download fehlgeschlagen");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const baseName = file?.name.replace(/\.[^/.]+$/, "") || "pdfua";
      a.download = `${baseName}_pdfua.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || "Download fehlgeschlagen");
      toast({
        title: "Fehler",
        description: err.message || "Download fehlgeschlagen",
        variant: "destructive",
      });
    }
  }, [fetchWithAuthRetry, file?.name, jobId, toast]);

  const handleReset = useCallback(() => {
    setFile(null);
    setJobId(null);
    setStatus(null);
    setOutputReady(false);
    setError(null);
    setIsProcessing(false);
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete("jobId");
    window.history.replaceState({}, "", nextUrl.pathname);
  }, []);

  return (
    <PageLayout>
      <SEO
        title="PPTX zu PDF/UA Smart"
        description="Konvertieren Sie PowerPoint-Präsentationen in barrierefreies PDF/UA. Fester Produktionspfad mit bester Qualität."
        canonical="/tools/pptx-to-pdf-smart"
      />

      <main id="main-content" className="max-w-4xl mx-auto px-6 py-8" tabIndex={-1}>
        <Link href="/" className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Zurück zur Übersicht
        </Link>

        <div className="text-center mb-12">
          <div className="w-20 h-20 bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
            <FileOutput className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-semibold text-slate-900 mb-4">PPTX → PDF/UA Smart</h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Nur PPTX-Dateien. Die Konvertierung läuft über einen festen Qualitäts-Standardpfad;
            Speaker Notes werden nicht verwendet.
          </p>
        </div>

        {serviceAvailable === false && (
          <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-amber-800">PDF/UA derzeit nicht verfügbar</p>
              <p className="text-sm text-amber-700">
                Der PDF/UA-Dienst ist momentan nicht erreichbar. Bitte versuchen Sie es später erneut.
              </p>
              <p className="text-xs text-amber-700/90 mt-1">Details: {serviceError}</p>
            </div>
          </div>
        )}

        {serviceAvailable !== false && !isProcessing && !outputReady && (
          <div className="mb-6 flex justify-center">
            <QueueStatusBadge queueType="pdfua" />
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {!isProcessing && !outputReady && (
            <div className="p-8">
              <div className="mb-8 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <h3 className="font-medium text-slate-900 mb-2 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-orange-500" />
                  Fester Verarbeitungsmodus
                </h3>
                <p className="text-sm text-slate-600">
                  Beste Qualität, PDF/UA-Ausgabe, keine Speaker Notes. Es gibt keine zusätzlichen Schalter.
                </p>
              </div>

              <div
                {...getRootProps()}
                className={`
                  relative border-2 border-dashed rounded-xl p-12 transition-all cursor-pointer
                  ${isDragActive ? "border-orange-400 bg-orange-50" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"}
                  ${file ? "border-orange-400 bg-orange-50" : ""}
                  ${serviceAvailable === false ? "opacity-50 pointer-events-none" : ""}
                `}
              >
                <input {...getInputProps()} />

                <div className="flex flex-col items-center text-center">
                  {file ? (
                    <>
                      <div className="w-16 h-16 bg-orange-100 rounded-xl flex items-center justify-center mb-4">
                        <FileText className="w-8 h-8 text-orange-600" />
                      </div>
                      <p className="text-lg font-medium text-slate-900 mb-1">{file.name}</p>
                      <p className="text-sm text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </>
                  ) : (
                    <>
                      <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center mb-4">
                        <Upload className="w-8 h-8 text-slate-400" />
                      </div>
                      <p className="text-lg font-medium text-slate-900 mb-2">
                        {isDragActive ? "Datei hier ablegen..." : "PPTX-Datei hochladen"}
                      </p>
                      <p className="text-sm text-slate-500">Ziehen Sie eine Datei hierher oder klicken Sie zum Auswählen</p>
                      <p className="text-xs text-slate-400 mt-2">Maximal 100 MB</p>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-6">
                <p className="text-sm text-slate-600">
                  Ihre Datei können Sie nach Fertigstellung herunterladen. Sie finden sie ebenfalls in Ihrem persönlichen Dokumente-Bereich.
                </p>
              </div>

              {error && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                  <p className="text-red-700">{error}</p>
                </div>
              )}

              {file && (
                <div className="mt-6 flex flex-col items-center gap-4">
                  {user?.email && (
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={notifyByEmail}
                        onChange={(e) => setNotifyByEmail(e.target.checked)}
                        className="w-5 h-5 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                        aria-label="Per E-Mail benachrichtigen wenn fertig"
                      />
                      <span className="flex items-center gap-2 text-slate-600 group-hover:text-slate-900 transition-colors" aria-hidden="true">
                        <Mail className="w-4 h-4" />
                        Per E-Mail benachrichtigen wenn fertig
                      </span>
                    </label>
                  )}

                  <Button
                    onClick={handleConvert}
                    disabled={serviceAvailable === false}
                    className="h-14 px-8 text-lg bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 rounded-xl shadow-lg"
                  >
                    <Sparkles className="w-5 h-5 mr-2" />
                    PDF/UA erstellen
                  </Button>
                </div>
              )}
            </div>
          )}

          {isProcessing && status && (
            <div className="p-8" role="status" aria-live="polite" aria-atomic="true">
              <div className="flex flex-col items-center">
                {status.status === "queued" && status.queue && status.queue.position && status.queue.position > 0 ? (
                  <>
                    <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-6">
                      <Clock className="w-8 h-8 text-amber-600" />
                    </div>

                    <h2 className="text-xl font-semibold text-slate-900 mb-2">In der Warteschlange</h2>
                    {activeDocumentName && (
                      <p className="text-sm text-slate-600 mb-3">
                        Dokument: <span className="font-medium text-slate-900">{activeDocumentName}</span>
                      </p>
                    )}
                    {jobId && (
                      <p className="text-xs text-slate-500 mb-1">
                        Job-ID: <span className="font-mono text-slate-700">{jobId}</span>
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-slate-600 mb-6">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        <span>
                          Position <strong>{status.queue.position}</strong> von {status.queue.totalInQueue}
                        </span>
                      </div>
                      {status.queue.estimatedWaitMinutes > 0 && (
                        <>
                          <span className="text-slate-300">|</span>
                          <span>~{status.queue.estimatedWaitMinutes} Min. Wartezeit</span>
                        </>
                      )}
                    </div>

                    <p className="text-sm text-slate-500 mb-4">Ihr Job wird bearbeitet, sobald er an der Reihe ist.</p>

                    <div className="flex gap-2">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="w-3 h-3 bg-amber-400 rounded-full animate-bounce"
                          style={{ animationDelay: `${i * 0.15}s` }}
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <Loader2 className="w-12 h-12 text-orange-500 animate-spin mb-6" />

                    <h2 className="text-xl font-semibold text-slate-900 mb-2">
                      {PHASE_LABELS[status.stage || "processing"] || status.stage || "Wird verarbeitet..."}
                    </h2>
                    {activeDocumentName && (
                      <p className="text-sm text-slate-600 mb-4">
                        Dokument: <span className="font-medium text-slate-900">{activeDocumentName}</span>
                      </p>
                    )}
                    <div className="mb-4 flex items-center gap-2 text-sm text-slate-600">
                      <p>
                        Job-ID: <span className="font-mono">{jobId || "–"}</span>
                      </p>
                      {jobId && (
                        <Button type="button" variant="outline" size="sm" onClick={copyJobId} className="h-7 px-2 rounded-lg">
                          <Copy className="w-3 h-3 mr-1" />
                          kopieren
                        </Button>
                      )}
                    </div>

                    <div className="w-full max-w-md">
                      <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-full transition-all duration-500"
                          style={{ width: `${status.percent || 0}%` }}
                        />
                      </div>
                      <p className="text-center text-sm text-slate-500 mt-2">{status.percent || 0}% abgeschlossen</p>
                    </div>

                    <div className="grid grid-cols-5 gap-2 text-xs text-center mt-6 w-full max-w-md">
                      {["parsing", "vlm", "summary", "building", "pdfua"].map((phase, idx, arr) => {
                        const phaseAlias: Record<string, string> = {
                          classifying: "parsing",
                          finalizing: "pdfua",
                          done: "pdfua",
                          complete: "pdfua",
                          completed: "pdfua",
                        };
                        const effectiveStage = phaseAlias[status.stage || ""] || status.stage || "";
                        const currentPhaseIdx = arr.indexOf(effectiveStage);
                        const isCompleted = currentPhaseIdx > idx || status.stage === "complete" || status.stage === "completed";
                        const isCurrent = effectiveStage === phase;

                        return (
                          <div
                            key={phase}
                            className={`
                              p-2 rounded-lg transition-all
                              ${isCompleted ? "bg-green-100 text-green-700" : ""}
                              ${isCurrent ? "bg-orange-100 text-orange-700 font-medium" : ""}
                              ${!isCompleted && !isCurrent ? "bg-slate-100 text-slate-500" : ""}
                            `}
                          >
                            {phase === "parsing" && "Analyse"}
                            {phase === "vlm" && "KI-Analyse"}
                            {phase === "summary" && "Zusammenfassung"}
                            {phase === "building" && "Struktur"}
                            {phase === "pdfua" && "PDF/UA"}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {outputReady && (
            <div className="p-8">
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>

                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-green-100 text-green-800 mb-4">
                  Barrierefrei erstellt
                </div>

                <h2 className="text-2xl font-semibold text-slate-900 mb-2">PDF/UA erstellt</h2>
                <p className="text-slate-500 mb-8">{file ? `${file.name.replace(/\.[^/.]+$/, "")}_pdfua.pdf` : ""}</p>
                {jobId && (
                  <div className="mb-6 flex items-center gap-2 text-sm text-slate-600">
                    <p>
                      Job-ID: <span className="font-mono">{jobId}</span>
                    </p>
                    <Button type="button" variant="outline" size="sm" onClick={copyJobId} className="h-7 px-2 rounded-lg">
                      <Copy className="w-3 h-3 mr-1" />
                      kopieren
                    </Button>
                  </div>
                )}

                <div className="flex flex-wrap gap-4 justify-center">
                  <Button
                    onClick={handleDownload}
                    className="h-12 px-6 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 rounded-xl"
                  >
                    <Download className="w-5 h-5 mr-2" />
                    PDF herunterladen
                  </Button>
                  <Button onClick={handleReset} variant="outline" className="h-12 px-6 rounded-xl">
                    <RefreshCw className="w-5 h-5 mr-2" />
                    Neue Datei
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 bg-amber-50 rounded-2xl p-6 shadow-sm border border-amber-200">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="font-semibold text-amber-900 mb-1">Hinweis zur Verarbeitungszeit</h3>
              <p className="text-amber-800 text-sm">
                Die Konvertierung kann je nach Dateigröße und Anzahl der Folien <strong>10-15 Minuten</strong> dauern.
                Lassen Sie die Seite während der Verarbeitung geöffnet oder lassen Sie sich per E-Mail benachrichtigen.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 bg-white rounded-2xl p-8 shadow-sm border border-slate-200">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-violet-100 rounded-xl flex items-center justify-center shrink-0">
              <Info className="w-6 h-6 text-violet-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-3">Funktionen</h3>
              <ul className="space-y-2 text-slate-600">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-1 shrink-0" />
                  Fester Produktionspfad nur für PPTX zu PDF/UA
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-1 shrink-0" />
                  Beste Qualitätsstufe mit KI-Analyse und semantischer Struktur
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-1 shrink-0" />
                  Speaker Notes werden nicht gelesen und nicht ausgegeben
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-1 shrink-0" />
                  Optimiert für Screenreader (NVDA, JAWS, VoiceOver)
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-1 shrink-0" />
                  DSGVO-konforme lokale Verarbeitung
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </PageLayout>
  );
}
