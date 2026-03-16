import { useState, useCallback, useEffect } from "react";
import { Link } from "wouter";
import { useDropzone } from "react-dropzone";
import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { QueueStatusBadge } from "@/components/QueueStatus";
import { StorageTargetPicker } from "@/components/StorageTargetPicker";
import { useStorageTarget } from "@/hooks/use-storage-target";
import {
  ArrowLeft, Upload, FileText, Loader2, CheckCircle2,
  Download, RefreshCw, AlertTriangle, Sparkles, FileOutput,
  Mail, Clock, Users, Info
} from "lucide-react";

interface JobStatus {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  stage?: string;
  percent?: number;
  error?: string;
  queue?: {
    position: number | null;
    estimatedWaitMinutes: number;
    totalInQueue: number;
  };
}

const PHASE_LABELS: Record<string, string> = {
  queued: "In der Warteschlange...",
  upload: "Datei wird hochgeladen...",
  uploading: "Datei wird hochgeladen...",
  extract: "Dokumentstruktur wird extrahiert...",
  semantic: "Semantische Analyse...",
  alttext: "KI generiert Alt-Texte...",
  inject: "Alt-Texte werden eingefügt...",
  pdf: "PDF/UA wird erstellt...",
  converting: "Dokument wird konvertiert...",
  processing: "Wird verarbeitet...",
  finalizing: "Wird abgeschlossen...",
  done: "Fertig!",
  complete: "Fertig!",
  completed: "Fertig!"
};

export default function WordToPdfUA() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { target: storageTarget, setTarget: setStorageTarget } = useStorageTarget("word-to-pdfua");

  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [outputReady, setOutputReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [serviceAvailable, setServiceAvailable] = useState<boolean | null>(null);
  const [notifyByEmail, setNotifyByEmail] = useState(false);

  // Check service health on mount
  useEffect(() => {
    fetch("/api/docx-to-pdf/health")
      .then(res => res.json())
      .then(data => setServiceAvailable(data.status === "healthy"))
      .catch(() => setServiceAvailable(false));
  }, []);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const docFile = acceptedFiles.find((f) =>
      /\.docx$/i.test(f.name)
    );
    if (docFile) {
      setFile(docFile);
      setError(null);
      setStatus(null);
      setOutputReady(false);
      setJobId(null);
    } else {
      setError("Bitte eine DOCX-Datei hochladen");
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
    maxFiles: 1,
    maxSize: 100 * 1024 * 1024, // 100MB
    disabled: isProcessing
  });

  const pollJobStatus = async (id: string) => {
    try {
      const response = await fetch(`/api/docx-to-pdf/status/${id}`);
      if (!response.ok) throw new Error("Status konnte nicht abgerufen werden");

      const jobStatus: JobStatus = await response.json();
      setStatus(jobStatus);

      if (jobStatus.status === "queued" || jobStatus.status === "processing") {
        const pollInterval = jobStatus.status === "queued" ? 3000 : 1500;
        setTimeout(() => pollJobStatus(id), pollInterval);
      } else if (jobStatus.status === "completed") {
        setIsProcessing(false);
        setOutputReady(true);
        toast({
          title: "PDF/UA erstellt",
          description: "Das barrierefreie PDF/UA ist bereit zum Download.",
        });
      } else if (jobStatus.status === "failed") {
        setIsProcessing(false);
        setError(jobStatus.error || "Konvertierung fehlgeschlagen");
        toast({
          title: "Fehler",
          description: jobStatus.error || "Konvertierung fehlgeschlagen",
          variant: "destructive",
        });
      }
    } catch (err) {
      setError("Verbindung zum Server verloren");
      setIsProcessing(false);
    }
  };

  const handleConvert = async () => {
    if (!file) return;

    setIsProcessing(true);
    setError(null);
    setStatus(null);
    setOutputReady(false);

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

      const response = await fetch("/api/docx-to-pdf/convert", {
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

  const handleDownload = async () => {
    if (!jobId) return;
    try {
      const response = await fetch(`/api/docx-to-pdf/download/${jobId}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Download fehlgeschlagen");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const baseName = file?.name.replace(/\.[^/.]+$/, "") || "document";
      a.download = `${baseName}_accessible.pdf`;
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
  };

  const handleReset = () => {
    setFile(null);
    setJobId(null);
    setStatus(null);
    setOutputReady(false);
    setError(null);
    setIsProcessing(false);
  };

  return (
    <PageLayout>
      <SEO
        title="Word zu PDF/UA"
        description="Konvertieren Sie Word-Dokumente (DOCX) in barrierefreies PDF/UA mit automatischer Alt-Text-Generierung durch KI."
        canonical="/tools/word-to-pdfua"
      />

      <main id="main-content" className="max-w-4xl mx-auto px-6 py-8" tabIndex={-1}>
        {/* Back Link */}
        <Link href="/" className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Zurück zur Übersicht
        </Link>

        {/* Header */}
        <div className="text-center mb-12">
          <div className="w-20 h-20 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
            <FileOutput className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-semibold text-slate-900 mb-4">
            Word zu PDF/UA
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Konvertiert Word-Dokumente in barrierefreies PDF/UA mit automatischer
            Alt-Text-Generierung für Bilder durch KI.
          </p>
        </div>

        {/* Service Status Warning */}
        {serviceAvailable === false && (
          <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-amber-800">Service nicht verfügbar</p>
              <p className="text-sm text-amber-700">
                Der Konvertierungsdienst ist momentan nicht erreichbar.
                Bitte versuchen Sie es später erneut.
              </p>
            </div>
          </div>
        )}

        {/* Queue Status Badge */}
        {serviceAvailable !== false && !isProcessing && !outputReady && (
          <div className="mb-6 flex justify-center">
            <QueueStatusBadge queueType="pdfua" />
          </div>
        )}

        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Upload Section */}
          {!isProcessing && !outputReady && (
            <div className="p-8">
              {/* Upload Area */}
              <div
                {...getRootProps()}
                className={`
                  relative border-2 border-dashed rounded-xl p-12 transition-all cursor-pointer
                  ${isDragActive ? "border-amber-400 bg-amber-50" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"}
                  ${file ? "border-amber-400 bg-amber-50" : ""}
                  ${serviceAvailable === false ? "opacity-50 pointer-events-none" : ""}
                `}
              >
                <input {...getInputProps()} />

                <div className="flex flex-col items-center text-center">
                  {file ? (
                    <>
                      <div className="w-16 h-16 bg-amber-100 rounded-xl flex items-center justify-center mb-4">
                        <FileText className="w-8 h-8 text-amber-600" />
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
                        {isDragActive ? "Datei hier ablegen..." : "Word-Dokument hochladen"}
                      </p>
                      <p className="text-sm text-slate-500">
                        Ziehen Sie eine DOCX-Datei hierher oder klicken Sie zum Auswählen
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
	                  helperText="Wähle, ob die Konvertierung privat bleibt oder im Workspace verfügbar ist."
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
                        className="w-5 h-5 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
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
                    className="h-14 px-8 text-lg bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 rounded-xl shadow-lg"
                  >
                    <Sparkles className="w-5 h-5 mr-2" />
                    PDF/UA erstellen
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Progress Section */}
          {isProcessing && status && (
            <div className="p-8" role="status" aria-live="polite" aria-atomic="true">
              <div className="flex flex-col items-center">
                {/* Queue Position Display */}
                {status.status === "queued" && status.queue && status.queue.position && status.queue.position > 0 ? (
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

                    {/* Waiting animation */}
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
                    <Loader2 className="w-12 h-12 text-amber-500 animate-spin mb-6" />

                    <h2 className="text-xl font-semibold text-slate-900 mb-2">
                      {PHASE_LABELS[status.stage || "processing"] || status.stage || "Wird verarbeitet..."}
                    </h2>

                    {/* Progress Bar */}
                    <div className="w-full max-w-md">
                      <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-500"
                          style={{ width: `${status.percent || 0}%` }}
                        />
                      </div>
                      <p className="text-center text-sm text-slate-500 mt-2">
                        {status.percent || 0}% abgeschlossen
                      </p>
                    </div>

                    {/* Progress Steps */}
                    <div className="grid grid-cols-4 gap-2 text-xs text-center mt-6 w-full max-w-md">
                      {["extract", "alttext", "inject", "pdf"].map((phase, idx, arr) => {
                        const phaseAlias: Record<string, string> = {
                          semantic: "extract",
                          finalizing: "pdf",
                          done: "pdf",
                          complete: "pdf",
                          completed: "pdf",
                        };
                        const effectiveStage = phaseAlias[status.stage || ""] || status.stage || "";
                        const currentPhaseIdx = arr.indexOf(effectiveStage);
                        const isCompleted = currentPhaseIdx > idx || status.stage === "complete" || status.stage === "completed";
                        const isCurrent = effectiveStage === phase;

                        return (
                          <div key={phase} className={`
                            p-2 rounded-lg transition-all
                            ${isCompleted ? "bg-green-100 text-green-700" : ""}
                            ${isCurrent ? "bg-amber-100 text-amber-700 font-medium" : ""}
                            ${!isCompleted && !isCurrent ? "bg-slate-100 text-slate-500" : ""}
                          `}>
                            {phase === "extract" && "Analyse"}
                            {phase === "alttext" && "Alt-Texte"}
                            {phase === "inject" && "Einfügen"}
                            {phase === "pdf" && "PDF/UA"}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Result Section */}
          {outputReady && (
            <div className="p-8">
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>

                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-green-100 text-green-800 mb-4">
                  Barrierefrei erstellt
                </div>

                <h2 className="text-2xl font-semibold text-slate-900 mb-2">
                  PDF/UA erstellt
                </h2>
                <p className="text-slate-500 mb-8">
                  {file
                    ? `${file.name.replace(/\.[^/.]+$/, "")}_accessible.pdf`
                    : ""}
                </p>

                <div className="flex flex-wrap gap-4 justify-center">
                  <Button
                    onClick={handleDownload}
                    className="h-12 px-6 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 rounded-xl"
                  >
                    <Download className="w-5 h-5 mr-2" />
                    PDF herunterladen
                  </Button>
                  <Button
                    onClick={handleReset}
                    variant="outline"
                    className="h-12 px-6 rounded-xl"
                  >
                    <RefreshCw className="w-5 h-5 mr-2" />
                    Neue Datei
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Info Section - Time Warning */}
        <div className="mt-8 bg-amber-50 rounded-2xl p-6 shadow-sm border border-amber-200">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="font-semibold text-amber-900 mb-1">Hinweis zur Verarbeitungszeit</h3>
              <p className="text-amber-800 text-sm">
                Die Konvertierung kann je nach Dateigröße und Anzahl der Bilder <strong>1-3 Minuten</strong> dauern.
                Unsere KI analysiert das Dokument und generiert automatisch Alternativtexte für Bilder.
                Sie können die Seite waehrend der Verarbeitung geoeffnet lassen oder sich per E-Mail benachrichtigen lassen.
              </p>
            </div>
          </div>
        </div>

        {/* Info Section - Features */}
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
                  Automatische Alternativtext-Generierung durch KI
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-1 shrink-0" />
                  PDF/UA-Konformitaet nach ISO 14289-1
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-1 shrink-0" />
                  Strukturierte Tags für Screenreader
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-1 shrink-0" />
                  Überschriften-Hierarchie wird uebernommen
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-1 shrink-0" />
                  Barrierefreie Tabellen und Listen
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
