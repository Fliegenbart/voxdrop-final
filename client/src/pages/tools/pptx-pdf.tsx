import { useState, useCallback, useRef } from "react";
import { Link } from "wouter";
import { useDropzone } from "react-dropzone";
import { PageLayout } from "@/components/PageLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { QueueStatusBadge } from "@/components/QueueStatus";
import { StorageTargetPicker } from "@/components/StorageTargetPicker";
import { useStorageTarget } from "@/hooks/use-storage-target";
import {
  ArrowLeft, Upload, FileText, Loader2, CheckCircle2,
  Download, FileSearch, RefreshCw, AlertTriangle, Info, Mail, Clock, Users, Crown
} from "lucide-react";

interface JobProgress {
  phase: string;
  percentage: number;
  total_slides?: number;
  processed_slides?: number;
  current_slide?: number;
}

interface QueueInfo {
  position: number | null;
  estimatedWaitMinutes: number;
  totalInQueue: number;
}

interface JobStatus {
  id: string;
  status: "pending" | "running" | "processing" | "queued" | "completed" | "failed";
  progress: JobProgress;
  result?: {
    success: boolean;
    pdfua_compliant: boolean;
    processing_time_seconds: number;
  };
  error?: string;
  queue?: QueueInfo;
}

const PHASE_LABELS: Record<string, string> = {
  queued: "In der Warteschlange...",
  uploading: "Wird hochgeladen...",
  init: "Initialisierung...",
  parsing: "PPTX wird analysiert...",
  converting: "Wird konvertiert...",
  processing: "Wird verarbeitet...",
  rendering: "Folien werden gerendert...",
  ocr: "Texterkennung (OCR)...",
  vlm: "KI-Analyse (Alternativtexte)...",
  building: "HTML wird generiert...",
  pdfua: "PDF/UA wird erstellt...",
  validate: "Barrierefreiheit wird geprüft...",
  repair: "Fehler werden behoben...",
  finalizing: "Wird abgeschlossen...",
  done: "Fertig!",
  completed: "Fertig!"
};

export default function PptxToPdf() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { target: storageTarget, setTarget: setStorageTarget } = useStorageTarget("pptx-pdf");

  // Check if user has premium access
  const isPremium = user?.subscription === 'premium' || user?.subscription === 'team';

  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [serviceAvailable, setServiceAvailable] = useState<boolean | null>(null);
  const [notifyByEmail, setNotifyByEmail] = useState(false);
  const pollRetryRef = useRef(0);

  // Check service health on mount
  useState(() => {
    fetch("/api/convert-pptx/health")
      .then(res => res.json())
      .then(data => setServiceAvailable(data.status === "ok"))
      .catch(() => setServiceAvailable(false));
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const pptxFile = acceptedFiles.find(f =>
      f.name.toLowerCase().endsWith(".pptx")
    );
    if (pptxFile) {
      setFile(pptxFile);
      setError(null);
      setStatus(null);
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
    disabled: isConverting
  });

  const pollJobStatus = async (id: string) => {
    try {
      const response = await fetch(`/api/convert-pptx/jobs/${id}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error("Status konnte nicht abgerufen werden");

      const jobStatus: JobStatus = await response.json();
      pollRetryRef.current = 0;
      setStatus(jobStatus);

      // Continue polling for pending, queued, processing, or running states
      const pollableStates = ["running", "pending", "queued", "processing"];
      if (pollableStates.includes(jobStatus.status)) {
        // Poll less frequently when in queue (every 3s), more frequently when processing (every 1.5s)
        const pollInterval = jobStatus.status === "pending" ? 3000 : 1500;
        setTimeout(() => pollJobStatus(id), pollInterval);
      } else if (jobStatus.status === "completed") {
        setIsConverting(false);
        toast({
          title: "Konvertierung abgeschlossen",
          description: "Ihr barrierefreies PDF ist bereit zum Download.",
        });
      } else if (jobStatus.status === "failed") {
        setIsConverting(false);
        setError(jobStatus.error || "Konvertierung fehlgeschlagen");
        toast({
          title: "Fehler",
          description: jobStatus.error || "Konvertierung fehlgeschlagen",
          variant: "destructive",
        });
      }
    } catch (err) {
      const retryDelay = Math.min(15000, 1500 + pollRetryRef.current * 1000);
      pollRetryRef.current += 1;
      setError("Verbindung zum Server verloren – wir versuchen es erneut...");
      setTimeout(() => pollJobStatus(id), retryDelay);
    }
  };

  const handleConvert = async () => {
    if (!file) return;

    setIsConverting(true);
    setError(null);
    setStatus(null);

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
      if (notifyByEmail && user?.email) {
        formData.append("notifyEmail", user.email);
      }

      const response = await fetch("/api/convert-pptx", {
        method: "POST",
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Upload fehlgeschlagen");
      }

      const result = await response.json();
      setJobId(result.job_id);

      // Start polling
      pollJobStatus(result.job_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
      setIsConverting(false);
      toast({
        title: "Fehler",
        description: err instanceof Error ? err.message : "Upload fehlgeschlagen",
        variant: "destructive",
      });
    }
  };

  const handleDownload = async () => {
    if (!jobId) return;

    try {
      const response = await fetch(`/api/convert-pptx/jobs/${jobId}/download`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error("Download fehlgeschlagen");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file?.name.replace(".pptx", "_barrierefrei.pdf") || "accessible.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({
        title: "Fehler",
        description: "Download fehlgeschlagen",
        variant: "destructive",
      });
    }
  };

  const handleViewReport = () => {
    if (!jobId) return;
    window.open(`/api/convert-pptx/jobs/${jobId}/report?format=html`, "_blank");
  };

  const resetForm = () => {
    setFile(null);
    setJobId(null);
    setStatus(null);
    setError(null);
    setIsConverting(false);
  };

  return (
    <PageLayout>
      <main id="main-content" className="max-w-4xl mx-auto px-6 py-8" tabIndex={-1}>
        {/* Back Link */}
        <Link href="/" className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Zurück zur Übersicht
        </Link>

        {/* Header */}
        <div className="text-center mb-12">
          <div className="w-20 h-20 bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
            <FileText className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-semibold text-slate-900 mb-4">
            PPTX zu barrierefreiem PDF
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Konvertiert PowerPoint-Präsentationen in PDF/UA-konforme, barrierefreie PDFs.
            Die KI generiert automatisch Alternativtexte für Bilder.
          </p>
        </div>

        {/* Premium Gate */}
        {!isPremium && (
          <div className="mb-8 bg-gradient-to-br from-purple-50 to-blue-50 border border-purple-200 rounded-2xl p-8 text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Crown className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900 mb-2">Premium-Funktion</h2>
            <p className="text-slate-600 mb-6 max-w-md mx-auto">
              Die PDF/UA-Konvertierung ist exklusiv für Premium-Nutzer verfügbar.
              Upgraden Sie jetzt für unbegrenzten Zugang zu allen Tools.
            </p>
            <Link href="/preise">
              <Button className="bg-purple-600 hover:bg-purple-700 text-white">
                <Crown className="w-4 h-4 mr-2" />
                Jetzt freischalten
              </Button>
            </Link>
          </div>
        )}

        {/* Service Status Warning */}
        {isPremium && serviceAvailable === false && (
          <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-amber-800">Service nicht verfügbar</p>
              <p className="text-sm text-amber-700">
                Der PDF/UA-Konvertierungsdienst ist momentan nicht erreichbar.
                Bitte versuchen Sie es später erneut.
              </p>
            </div>
          </div>
        )}

        {/* Queue Status Badge */}
        {isPremium && serviceAvailable !== false && !isConverting && (
          <div className="mb-6 flex justify-center">
            <QueueStatusBadge queueType="pdfua" />
          </div>
        )}

        {/* Side-by-side Layout: Tool | Funktionen */}
        {isPremium && !isConverting && status?.status !== "completed" && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Tool Card - Upload Section */}
            <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-8">
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
                        <p className="text-sm text-slate-500">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center mb-4">
                          <Upload className="w-8 h-8 text-slate-400" />
                        </div>
                        <p className="text-lg font-medium text-slate-900 mb-2">
                          {isDragActive ? "Datei hier ablegen..." : "PPTX-Datei hochladen"}
                        </p>
                        <p className="text-sm text-slate-500">
                          Ziehen Sie eine Datei hierher oder klicken Sie zum Auswählen
                        </p>
                        <p className="text-xs text-slate-400 mt-2">
                          Maximal 100 MB
                        </p>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-6">
                  <StorageTargetPicker
                    value={storageTarget}
                    onChange={setStorageTarget}
                    helperText="Wähle, ob die PDF/UA privat bleibt oder im Workspace verfügbar ist."
                  />
                </div>

                {/* Error Display */}
                {error && (
                  <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                    <p className="text-red-700">{error}</p>
                  </div>
                )}

                {/* Convert Button */}
                {file && (
                  <div className="mt-6 flex flex-col items-center gap-4">
                    {/* Email notification checkbox */}
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
                      Konvertierung starten
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Funktionen Card - Side by Side */}
            <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center shrink-0">
                    <Info className="w-5 h-5 text-violet-600" />
                  </div>
                  <h3 className="font-semibold text-slate-900">Funktionen</h3>
                </div>
                <ul className="space-y-3 text-sm text-slate-600">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Automatische Alternativtext-Generierung durch KI
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    KI-Zusammenfassungen für komplexe Folien
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    PDF/UA-Konformität nach ISO 14289-1
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Strukturierte Tags für Screenreader
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Barrierefreie Tabellen und Listen
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Automatische Lesezeichen
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    DSGVO-konforme lokale Verarbeitung
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Progress Section - Full Width */}
        {isPremium && isConverting && status && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-300">
            <div className="p-8" role="status" aria-live="polite" aria-atomic="true">
              <div className="flex flex-col items-center">
                {/* Queue Position Display */}
                {status.status === "pending" && status.queue && status.queue.position && status.queue.position > 0 ? (
                  <>
                    <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-6">
                      <Clock className="w-8 h-8 text-amber-600" />
                    </div>

                    <h2 className="text-xl font-semibold text-slate-900 mb-2">
                      In der Warteschlange
                    </h2>

                    <div className="flex items-center gap-4 text-slate-600 mb-6">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        <span>Position <strong>{status.queue.position}</strong> von {status.queue.totalInQueue}</span>
                      </div>
                      {status.queue.estimatedWaitMinutes > 0 && (
                        <>
                          <span className="text-slate-300">|</span>
                          <span>~{status.queue.estimatedWaitMinutes} Min. Wartezeit</span>
                        </>
                      )}
                    </div>

                    <p className="text-sm text-slate-500 mb-4">
                      Ihr Job wird bearbeitet, sobald er an der Reihe ist.
                    </p>

                    {/* Waiting animation instead of progress bar */}
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
                      {PHASE_LABELS[status.progress?.phase] || status.progress?.phase || "Wird verarbeitet..."}
                    </h2>

                    {status.progress?.total_slides && (
                      <p className="text-slate-500 mb-6">
                        Folie {status.progress.current_slide || 0} von {status.progress.total_slides}
                      </p>
                    )}

                    {/* Progress Bar */}
                    <div className="w-full max-w-md">
                      <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-full transition-all duration-500"
                          style={{ width: `${status.progress?.percentage || 0}%` }}
                        />
                      </div>
                      <p className="text-center text-sm text-slate-500 mt-2">
                        {status.progress?.percentage || 0}% abgeschlossen
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Result Section - Full Width */}
        {isPremium && status?.status === "completed" && status.result && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-300">
            <div className="p-8">
              <div className="flex flex-col items-center text-center">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 ${
                  status.result.pdfua_compliant ? "bg-green-100" : "bg-amber-100"
                }`}>
                  {status.result.pdfua_compliant ? (
                    <CheckCircle2 className="w-8 h-8 text-green-600" />
                  ) : (
                    <AlertTriangle className="w-8 h-8 text-amber-600" />
                  )}
                </div>

                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium mb-4 ${
                  status.result.pdfua_compliant
                    ? "bg-green-100 text-green-800"
                    : "bg-amber-100 text-amber-800"
                }`}>
                  {status.result.pdfua_compliant ? "PDF/UA konform" : "Teilweise konform"}
                </div>

                <h2 className="text-2xl font-semibold text-slate-900 mb-2">
                  Konvertierung abgeschlossen
                </h2>
                <p className="text-slate-500 mb-8">
                  Verarbeitung in {status.result.processing_time_seconds.toFixed(1)} Sekunden
                </p>

                <div className="flex flex-wrap gap-4 justify-center">
                  <Button
                    onClick={handleDownload}
                    className="h-12 px-6 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 rounded-xl"
                  >
                    <Download className="w-5 h-5 mr-2" />
                    PDF herunterladen
                  </Button>
                  <Button
                    onClick={handleViewReport}
                    variant="outline"
                    className="h-12 px-6 rounded-xl"
                  >
                    <FileSearch className="w-5 h-5 mr-2" />
                    Bericht anzeigen
                  </Button>
                  <Button
                    onClick={resetForm}
                    variant="ghost"
                    className="h-12 px-6 rounded-xl"
                  >
                    <RefreshCw className="w-5 h-5 mr-2" />
                    Neue Datei
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Hinweis zur Verarbeitungszeit */}
        <div className="mt-8 bg-amber-50 rounded-2xl p-6 shadow-sm border border-amber-200">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="font-semibold text-amber-900 mb-1">Hinweis zur Verarbeitungszeit</h3>
              <p className="text-amber-800 text-sm">
                Die Konvertierung kann je nach Dateigröße und Anzahl der Folien <strong>2-5 Minuten</strong> dauern.
                Unsere KI analysiert jede Folie und generiert automatisch Alternativtexte für Bilder.
                Sie können die Seite während der Verarbeitung geöffnet lassen oder sich per E-Mail benachrichtigen lassen.
              </p>
            </div>
          </div>
        </div>

        {/* Im Behördenalltag */}
        <div className="mt-8 bg-white rounded-2xl p-8 shadow-sm border border-slate-200">
          <h3 className="font-semibold text-slate-900 mb-4 text-lg">Im Behördenalltag</h3>
          <div className="prose prose-gray max-w-none text-slate-600">
            <p className="mb-4">
              Öffentliche Stellen sind nach der EU-Richtlinie 2016/2102 und dem Behindertengleichstellungsgesetz (BGG)
              verpflichtet, digitale Dokumente barrierefrei bereitzustellen. PowerPoint-Präsentationen, die häufig
              für Schulungen, Informationsveranstaltungen oder Bürgerinformationen verwendet werden, müssen als
              barrierefreie PDFs veröffentlicht werden.
            </p>
            <p className="mb-4">
              Dieses Tool automatisiert den aufwendigen Prozess der manuellen Nachbearbeitung: Es erkennt Bilder,
              generiert aussagekräftige Alternativtexte mit KI, strukturiert Inhalte semantisch korrekt und
              erstellt ein PDF/UA-konformes Dokument, das von Screenreadern optimal vorgelesen werden kann.
            </p>
            <p>
              So sparen Sie wertvolle Arbeitszeit und stellen gleichzeitig sicher, dass alle Bürgerinnen und
              Bürger gleichberechtigten Zugang zu Ihren Informationen erhalten.
            </p>
          </div>
        </div>
      </main>

    </PageLayout>
  );
}
