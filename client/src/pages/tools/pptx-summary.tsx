import { useState, useCallback, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useDropzone } from "react-dropzone";
import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { QueuePositionDisplay, useJobPosition } from "@/components/QueueStatus";
import { StorageTargetPicker } from "@/components/StorageTargetPicker";
import { useStorageTarget } from "@/hooks/use-storage-target";
import {
  ArrowLeft, Upload, FileText, Loader2, CheckCircle2,
  Download, RefreshCw, AlertTriangle, Info, Clock, BookOpen, List, HelpCircle
} from "lucide-react";

interface SummaryResult {
  language: string;
  global_summary: {
    short: string;
    long?: string;
  };
  timeline?: Array<{
    years: number[];
    headline: string;
    details?: string;
  }>;
  glossary?: Array<{
    term: string;
    definition: string;
    certainty: string;
  }>;
  open_questions?: Array<{
    question: string;
  }>;
  quality_flags?: string[];
}

interface JobStatus {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  stage?: string;
  percent?: number;
  error?: string;
  resultData?: {
    language: string;
    hasTimeline: boolean;
    hasGlossary: boolean;
    qualityFlags: string[];
  };
}

const PHASE_LABELS: Record<string, string> = {
  queued: "In der Warteschlange...",
  upload: "Datei empfangen...",
  pipeline: "PPTX wird analysiert...",
  llm: "KI erstellt Zusammenfassung...",
  completed: "Fertig!"
};

export default function PptxSummary() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAuthenticated = !!user?.id;
  const { target: storageTarget, setTarget: setStorageTarget } = useStorageTarget("pptx-summary");

  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [result, setResult] = useState<SummaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [serviceAvailable, setServiceAvailable] = useState<boolean | null>(null);
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState("");
  const pollRetryRef = useRef(0);

  const { position, estimatedWait, isProcessing: isQueueProcessing } = useJobPosition(
    "pptx-summary",
    jobId,
    isAuthenticated
  );

  // Check service health on mount
  useEffect(() => {
    fetch("/api/pptx-summary/health")
      .then(res => res.json())
      .then(data => setServiceAvailable(data.status === "healthy"))
      .catch(() => setServiceAvailable(false));
  }, []);

  useEffect(() => {
    if (user?.email) {
      setNotifyEmail(user.email);
    }
  }, [user?.email]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const pptxFile = acceptedFiles.find(f =>
      f.name.toLowerCase().endsWith(".pptx")
    );
    if (pptxFile) {
      setFile(pptxFile);
      setError(null);
      setStatus(null);
      setResult(null);
      setJobId(null);
    } else {
      setError("Bitte eine PPTX-Datei hochladen");
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"]
    },
    maxFiles: 1,
    maxSize: 100 * 1024 * 1024, // 100MB
    disabled: isProcessing
  });

  const pollJobStatus = async (id: string) => {
    try {
      const response = await fetch(`/api/pptx-summary/status/${id}`);
      if (!response.ok) throw new Error("Status konnte nicht abgerufen werden");

      const jobStatus: JobStatus = await response.json();
      pollRetryRef.current = 0;
      setStatus(jobStatus);

      if (jobStatus.status === "queued" || jobStatus.status === "processing") {
        setTimeout(() => pollJobStatus(id), 2000);
      } else if (jobStatus.status === "completed") {
        setIsProcessing(false);
        // Fetch the result
        const resultResponse = await fetch(`/api/pptx-summary/download/${id}`);
        if (resultResponse.ok) {
          const summaryResult = await resultResponse.json();
          setResult(summaryResult);
        }
        toast({
          title: "Analyse abgeschlossen",
          description: "Die Zusammenfassung ist bereit.",
        });
      } else if (jobStatus.status === "failed") {
        setIsProcessing(false);
        setError(jobStatus.error || "Analyse fehlgeschlagen");
        toast({
          title: "Fehler",
          description: jobStatus.error || "Analyse fehlgeschlagen",
          variant: "destructive",
        });
      }
    } catch (err) {
      const retryDelay = Math.min(15000, 2000 + pollRetryRef.current * 1000);
      pollRetryRef.current += 1;
      setError("Verbindung zum Server verloren – wir versuchen es erneut...");
      setTimeout(() => pollJobStatus(id), retryDelay);
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;

    setIsProcessing(true);
    setError(null);
    setStatus(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("storageScope", storageTarget.scope);
      if (storageTarget.scope === "workspace") {
        if (storageTarget.workspaceId) {
          formData.append("workspaceId", storageTarget.workspaceId);
        }
        if (storageTarget.projectId) {
          formData.append("projectId", storageTarget.projectId);
        }
      }
      if (notifyEnabled) {
        if (!notifyEmail || !notifyEmail.includes("@")) {
          throw new Error("Bitte eine gültige E-Mail-Adresse angeben.");
        }
        formData.append("notifyEmail", notifyEmail);
      }

      const response = await fetch("/api/pptx-summary/convert", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Upload fehlgeschlagen");
      }

      const data = await response.json();
      setJobId(data.jobId);
      pollJobStatus(data.jobId);
    } catch (err: any) {
      setError(err.message);
      setIsProcessing(false);
    }
  };

  const handleDownloadJson = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${file?.name.replace(".pptx", "")}_summary.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setFile(null);
    setJobId(null);
    setStatus(null);
    setResult(null);
    setError(null);
    setIsProcessing(false);
  };

  return (
    <PageLayout>
      <SEO
        title="PPTX Zusammenfassung"
        description="Analysiert PowerPoint-Präsentationen und erstellt barrierefreie Zusammenfassungen mit KI, Glossar und Timeline."
        canonical="/tools/pptx-summary"
      />

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Link href="/tools">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Alle Tools
          </Button>
        </Link>

        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <FileText className="h-8 w-8 text-primary" />
              PPTX Zusammenfassung
            </h1>
            <p className="text-muted-foreground mt-2">
              Analysiert PowerPoint-Präsentationen und erstellt barrierefreie Zusammenfassungen mit KI.
            </p>
          </div>

          {/* Service Status */}
          {serviceAvailable === false && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive">Service nicht verfügbar</p>
                <p className="text-sm text-muted-foreground">
                  Der PPTX-Analyse-Service ist momentan nicht erreichbar.
                </p>
              </div>
            </div>
          )}

          {/* Upload Area */}
          {!result && (
            <div
              {...getRootProps()}
              className={`
                border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
                transition-colors duration-200
                ${isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}
                ${isProcessing ? "opacity-50 cursor-not-allowed" : ""}
              `}
            >
              <input {...getInputProps()} />
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              {file ? (
                <div>
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              ) : isDragActive ? (
                <p className="text-primary">Datei hier ablegen...</p>
              ) : (
                <div>
                  <p className="font-medium">PPTX-Datei hierher ziehen</p>
                  <p className="text-sm text-muted-foreground">oder klicken zum Auswählen</p>
                </div>
              )}
            </div>
          )}

          {file && !result && (
            <StorageTargetPicker
              value={storageTarget}
              onChange={setStorageTarget}
              helperText="Wähle, ob die Analyse privat bleibt oder im Workspace verfügbar ist."
            />
          )}

          {file && !result && (
            <div className="bg-muted/30 rounded-lg p-4">
              <label className="flex items-start gap-3 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={notifyEnabled}
                  onChange={(e) => setNotifyEnabled(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                />
                <span className="flex-1">
                  E-Mail-Benachrichtigung, wenn die Analyse fertig ist
                </span>
              </label>
              {notifyEnabled && (
                <div className="mt-2">
                  <input
                    type="email"
                    value={notifyEmail}
                    onChange={(e) => setNotifyEmail(e.target.value)}
                    placeholder="ihre@email.de"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none bg-white"
                  />
                </div>
              )}
            </div>
          )}

          {/* Progress */}
          {status && !result && (
            <div className="bg-muted/30 rounded-lg p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="font-medium">
                  {PHASE_LABELS[status.stage || "processing"] || status.stage}
                </span>
              </div>
              {status.percent !== undefined && (
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{ width: `${status.percent}%` }}
                  />
                </div>
              )}
              {position !== null && (
                <QueuePositionDisplay
                  position={position}
                  estimatedWait={estimatedWait}
                  isProcessing={isQueueProcessing}
                />
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive">Fehler</p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 text-green-600">
                <CheckCircle2 className="h-6 w-6" />
                <span className="font-medium text-lg">Analyse abgeschlossen</span>
              </div>

              {/* Global Summary */}
              <div className="bg-card border rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Zusammenfassung
                </h2>
                <p className="text-lg">{result.global_summary.short}</p>
                {result.global_summary.long && (
                  <p className="mt-3 text-muted-foreground">{result.global_summary.long}</p>
                )}
              </div>

              {/* Timeline */}
              {result.timeline && result.timeline.length > 0 && (
                <div className="bg-card border rounded-lg p-6">
                  <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Zeitverlauf ({result.timeline.length} Ereignisse)
                  </h2>
                  <div className="space-y-3">
                    {result.timeline.slice(0, 5).map((event, i) => (
                      <div key={i} className="flex gap-3">
                        <span className="font-mono text-primary font-medium">
                          {event.years.join("-")}
                        </span>
                        <div>
                          <p className="font-medium">{event.headline}</p>
                          {event.details && (
                            <p className="text-sm text-muted-foreground">{event.details}</p>
                          )}
                        </div>
                      </div>
                    ))}
                    {result.timeline.length > 5 && (
                      <p className="text-sm text-muted-foreground">
                        ... und {result.timeline.length - 5} weitere Ereignisse
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Glossary */}
              {result.glossary && result.glossary.length > 0 && (
                <div className="bg-card border rounded-lg p-6">
                  <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
                    <List className="h-5 w-5" />
                    Glossar ({result.glossary.length} Begriffe)
                  </h2>
                  <div className="grid gap-3 md:grid-cols-2">
                    {result.glossary.slice(0, 6).map((term, i) => (
                      <div key={i} className="bg-muted/30 rounded p-3">
                        <p className="font-medium">{term.term}</p>
                        <p className="text-sm text-muted-foreground">{term.definition}</p>
                      </div>
                    ))}
                  </div>
                  {result.glossary.length > 6 && (
                    <p className="text-sm text-muted-foreground mt-3">
                      ... und {result.glossary.length - 6} weitere Begriffe
                    </p>
                  )}
                </div>
              )}

              {/* Open Questions */}
              {result.open_questions && result.open_questions.length > 0 && (
                <div className="bg-card border rounded-lg p-6">
                  <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
                    <HelpCircle className="h-5 w-5" />
                    Offene Fragen ({result.open_questions.length})
                  </h2>
                  <ul className="list-disc list-inside space-y-1">
                    {result.open_questions.map((q, i) => (
                      <li key={i} className="text-muted-foreground">{q.question}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Quality Flags */}
              {result.quality_flags && result.quality_flags.length > 0 && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                  <h3 className="font-medium flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
                    <Info className="h-4 w-4" />
                    Qualitätshinweise
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {result.quality_flags.map((flag, i) => (
                      <span key={i} className="bg-yellow-100 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-100 text-xs px-2 py-1 rounded">
                        {flag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <Button onClick={handleDownloadJson}>
                  <Download className="mr-2 h-4 w-4" />
                  JSON herunterladen
                </Button>
                <Button variant="outline" onClick={handleReset}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Neue Datei
                </Button>
              </div>
            </div>
          )}

          {/* Start Button */}
          {file && !result && !isProcessing && (
            <Button
              onClick={handleAnalyze}
              size="lg"
              className="w-full"
              disabled={serviceAvailable === false}
            >
              <FileText className="mr-2 h-5 w-5" />
              Analyse starten
            </Button>
          )}
        </div>
      </main>
    </PageLayout>
  );
}
