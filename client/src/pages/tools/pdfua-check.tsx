import { useCallback, useEffect, useRef, useState } from "react";
import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileCheck,
  Info,
  Shield,
  ShieldCheck,
  ShieldX,
  Upload,
} from "lucide-react";

type Severity = "critical" | "serious" | "moderate" | "minor";

type Check = {
  id: string;
  name: string;
  passed: boolean;
  severity: Severity;
  message: string;
  details?: any;
};

type CategoryResult = {
  passed: number;
  failed: number;
  total: number;
  checks: Check[];
};

type PdfuaCheckResult = {
  summary: {
    pages: number;
    score: number;
    status: "critical" | "serious" | "moderate" | "pass";
    total_checks: number;
    passed: number;
    failed: number;
    tagged: boolean;
    has_pdfua_id: boolean;
    language: string;
    title: string;
  };
  categories: Record<string, CategoryResult>;
  tag_statistics: Record<string, number>;
};

type JobStatus = {
  job_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: {
    phase: string;
    percentage: number;
    message: string;
  };
  result: PdfuaCheckResult | null;
  error: string | null;
};

const severityConfig: Record<Severity, { label: string; bg: string; border: string; text: string; icon: typeof AlertCircle }> = {
  critical: { label: "Kritisch", bg: "bg-red-50", border: "border-red-300", text: "text-red-800", icon: AlertCircle },
  serious: { label: "Schwerwiegend", bg: "bg-orange-50", border: "border-orange-300", text: "text-orange-800", icon: AlertTriangle },
  moderate: { label: "Mittel", bg: "bg-yellow-50", border: "border-yellow-300", text: "text-yellow-800", icon: Info },
  minor: { label: "Leicht", bg: "bg-violet-50", border: "border-blue-300", text: "text-violet-800", icon: Info },
};

const categoryLabels: Record<string, { name: string; icon: string }> = {
  metadata: { name: "Metadaten", icon: "📋" },
  structure: { name: "Strukturbaum", icon: "🌳" },
  headings: { name: "Überschriften", icon: "📑" },
  images: { name: "Bilder & Figuren", icon: "🖼" },
  tables: { name: "Tabellen", icon: "📊" },
  lists: { name: "Listen", icon: "📝" },
  links: { name: "Links", icon: "🔗" },
  forms: { name: "Formulare", icon: "📄" },
  fonts: { name: "Schriften", icon: "🔤" },
  bookmarks: { name: "Lesezeichen", icon: "🔖" },
  taborder: { name: "Tab-Reihenfolge", icon: "⌨" },
};

function ScoreGauge({ score, status }: { score: number; status: string }) {
  const getColor = () => {
    if (status === "pass") return "text-emerald-600";
    if (status === "moderate") return "text-yellow-600";
    if (status === "serious") return "text-orange-600";
    return "text-red-600";
  };

  const getBgColor = () => {
    if (status === "pass") return "bg-emerald-50 border-emerald-200";
    if (status === "moderate") return "bg-yellow-50 border-yellow-200";
    if (status === "serious") return "bg-orange-50 border-orange-200";
    return "bg-red-50 border-red-200";
  };

  const getLabel = () => {
    if (status === "pass") return "Konform";
    if (status === "moderate") return "Teilweise konform";
    if (status === "serious") return "Wesentliche Mängel";
    return "Nicht konform";
  };

  const Icon = status === "pass" ? ShieldCheck : status === "moderate" ? Shield : ShieldX;

  return (
    <div className={`rounded-2xl border p-6 text-center ${getBgColor()}`}>
      <Icon className={`w-12 h-12 mx-auto mb-3 ${getColor()}`} />
      <div className={`text-4xl font-bold ${getColor()}`}>{score}%</div>
      <div className={`text-sm font-medium mt-1 ${getColor()}`}>{getLabel()}</div>
    </div>
  );
}

function CategorySection({ name, icon, data }: { name: string; icon: string; data: CategoryResult }) {
  const [expanded, setExpanded] = useState(data.failed > 0);
  const allPassed = data.failed === 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">{icon}</span>
          <span className="font-medium text-slate-900">{name}</span>
          <Badge className={allPassed ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}>
            {data.passed}/{data.total}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {allPassed ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-500" />
          )}
          {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 p-4 space-y-2">
          {data.checks.map((check) => {
            const config = check.passed
              ? { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", icon: CheckCircle2 }
              : severityConfig[check.severity];
            const Icon = check.passed ? CheckCircle2 : config.icon;

            return (
              <div
                key={check.id}
                className={`flex items-start gap-3 p-3 rounded-lg border ${check.passed ? "bg-emerald-50 border-emerald-200" : `${config.bg} ${config.border}`}`}
              >
                <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${check.passed ? "text-emerald-600" : config.text}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-medium ${check.passed ? "text-emerald-700" : config.text}`}>
                      {check.name}
                    </span>
                    {!check.passed && (
                      <Badge className={`text-xs ${config.bg} ${config.text} border ${config.border}`}>
                        {severityConfig[check.severity].label}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 mt-0.5">{check.message}</p>
                  {check.details?.missing && (
                    <div className="mt-1 text-xs text-slate-500">
                      {check.details.missing.slice(0, 5).join(", ")}
                      {check.details.missing.length > 5 && ` und ${check.details.missing.length - 5} weitere`}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function PdfuaCheck() {
  const { toast } = useToast();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && file.name.toLowerCase().endsWith(".pdf")) {
      setPdfFile(file);
    } else {
      toast({ title: "Bitte eine PDF-Datei auswählen", variant: "destructive" });
    }
  }, [toast]);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setPdfFile(file);
  }, []);

  const startCheck = async () => {
    if (!pdfFile) return;

    setError(null);
    setUploading(true);
    setJobStatus(null);
    setJobId(null);

    try {
      const formData = new FormData();
      formData.append("file", pdfFile);

      const response = await fetch("/api/tools/pdf/check-pdfua", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Prüfung fehlgeschlagen");
      }

      const data = await response.json();
      setJobId(data.job_id);
      setJobStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setUploading(false);
    }
  };

  const resetCheck = () => {
    setPdfFile(null);
    setJobId(null);
    setJobStatus(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    if (!jobId || jobStatus?.status === "completed" || jobStatus?.status === "failed") {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/tools/pdf/check-pdfua/${jobId}`, {
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          setJobStatus(data);
        }
      } catch (err) {
        console.error("Failed to fetch PDF/UA check status:", err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [jobId, jobStatus?.status]);

  const result = jobStatus?.result as PdfuaCheckResult | undefined;
  const isProcessing = jobStatus?.status === "processing" || jobStatus?.status === "pending";

  // Stable category order
  const categoryOrder = ["metadata", "structure", "headings", "images", "tables", "lists", "links", "forms", "fonts", "bookmarks", "taborder"];

  return (
    <PageLayout>
      <SEO
        title="PDF/UA-Check"
        description="PDFs auf PDF/UA-Konformität (ISO 14289) prüfen. Struktur, Metadaten, Schriften, Bilder und mehr automatisch analysieren."
        // `pdfua-check` is the legacy URL; primary URL is now `/tools/formular-check`.
        canonical="/tools/formular-check"
      />

      <main className="max-w-6xl mx-auto px-6 py-12">
        <header className="mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-full text-sm font-medium mb-4">
            <FileCheck className="w-4 h-4" />
            PDF/UA-Check
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 mb-3">
            PDF/UA-Konformität prüfen
          </h1>
          <p className="text-slate-600 max-w-2xl">
            Umfassende Prüfung nach ISO 14289 (PDF/UA). Struktur-Tags, Metadaten, Überschriften,
            Bilder, Tabellen, Schriften und mehr – in einem Check.
          </p>
        </header>

        <div className="grid lg:grid-cols-3 gap-8">
          <section className="lg:col-span-2 space-y-6">
            {/* Upload area */}
            {!result && !isProcessing && (
              <div
                className="bg-white rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center hover:border-emerald-400 transition-colors"
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
              >
                <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-700 font-medium mb-1">PDF hier ablegen oder auswählen</p>
                <p className="text-sm text-slate-500 mb-4">Maximale Dateigröße: 150 MB</p>
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  Datei auswählen
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="application/pdf"
                  onChange={handleFileSelect}
                />
                {pdfFile && (
                  <p className="text-sm text-slate-700 mt-4 font-medium">
                    Ausgewählt: {pdfFile.name} ({(pdfFile.size / 1024 / 1024).toFixed(1)} MB)
                  </p>
                )}
              </div>
            )}

            {error && (
              <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
                {error}
              </div>
            )}

            {/* Start button or progress */}
            {!result && !isProcessing && (
              <Button onClick={startCheck} disabled={!pdfFile || uploading} size="lg">
                {uploading ? "Wird hochgeladen..." : "PDF/UA-Check starten"}
              </Button>
            )}

            {isProcessing && jobStatus?.progress && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                    <FileCheck className="w-4 h-4 text-emerald-600 animate-pulse" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">Prüfung läuft...</p>
                    <p className="text-sm text-slate-500">{jobStatus.progress.message}</p>
                  </div>
                </div>
                <Progress value={jobStatus.progress.percentage || 0} />
              </div>
            )}

            {/* Error state */}
            {jobStatus?.status === "failed" && (
              <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-6">
                <div className="flex items-center gap-2 text-red-700 mb-2">
                  <AlertCircle className="w-5 h-5" />
                  <span className="font-medium">Prüfung fehlgeschlagen</span>
                </div>
                <p className="text-sm text-red-600">{jobStatus.error || "Unbekannter Fehler"}</p>
                <Button variant="outline" className="mt-4" onClick={resetCheck}>
                  Erneut versuchen
                </Button>
              </div>
            )}

            {/* Results */}
            {result && (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-slate-900">Prüfergebnisse</h2>
                  <Button variant="outline" size="sm" onClick={resetCheck}>
                    Neue Prüfung
                  </Button>
                </div>

                <div className="space-y-3">
                  {categoryOrder.map((catKey) => {
                    const catData = result.categories[catKey];
                    if (!catData) return null;
                    const label = categoryLabels[catKey] || { name: catKey, icon: "📎" };
                    return (
                      <CategorySection
                        key={catKey}
                        name={label.name}
                        icon={label.icon}
                        data={catData}
                      />
                    );
                  })}
                </div>

                {/* Tag statistics */}
                {result.tag_statistics && Object.keys(result.tag_statistics).length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Tag-Statistik</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {Object.entries(result.tag_statistics)
                        .sort(([, a], [, b]) => b - a)
                        .map(([tag, count]) => (
                          <div key={tag} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg text-sm">
                            <code className="text-xs text-slate-600">{tag}</code>
                            <span className="font-medium text-slate-800">{count}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          {/* Sidebar */}
          <aside className="space-y-6">
            {result && (
              <ScoreGauge score={result.summary.score} status={result.summary.status} />
            )}

            {result && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <h3 className="font-semibold text-slate-900 mb-3">Zusammenfassung</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-slate-700">
                    <span>Seiten</span>
                    <span className="font-medium">{result.summary.pages}</span>
                  </div>
                  <div className="flex justify-between text-slate-700">
                    <span>Prüfungen</span>
                    <span className="font-medium">{result.summary.total_checks}</span>
                  </div>
                  <div className="flex justify-between text-slate-700">
                    <span>Bestanden</span>
                    <span className="font-medium text-emerald-600">{result.summary.passed}</span>
                  </div>
                  <div className="flex justify-between text-slate-700">
                    <span>Fehlgeschlagen</span>
                    <span className="font-medium text-red-600">{result.summary.failed}</span>
                  </div>
                  <hr className="border-slate-100" />
                  <div className="flex justify-between text-slate-700">
                    <span>Getaggt</span>
                    <span className={`font-medium ${result.summary.tagged ? "text-emerald-600" : "text-red-600"}`}>
                      {result.summary.tagged ? "Ja" : "Nein"}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-700">
                    <span>PDF/UA-ID</span>
                    <span className={`font-medium ${result.summary.has_pdfua_id ? "text-emerald-600" : "text-red-600"}`}>
                      {result.summary.has_pdfua_id ? "Ja" : "Nein"}
                    </span>
                  </div>
                  {result.summary.language && (
                    <div className="flex justify-between text-slate-700">
                      <span>Sprache</span>
                      <span className="font-medium">{result.summary.language}</span>
                    </div>
                  )}
                  {result.summary.title && (
                    <div className="flex justify-between text-slate-700">
                      <span>Titel</span>
                      <span className="font-medium truncate ml-4 max-w-[160px]" title={result.summary.title}>
                        {result.summary.title}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h3 className="font-semibold text-slate-900 mb-2">Was wird geprüft?</h3>
              <ul className="text-sm text-slate-600 space-y-1.5">
                <li>Dokumenttitel, Sprache, PDF/UA-ID</li>
                <li>Struktur-Tags und Tag-Baum</li>
                <li>Überschriften-Hierarchie (H1-H6)</li>
                <li>Alt-Texte für Bilder</li>
                <li>Tabellen-Struktur (TH/TD)</li>
                <li>Listen-Struktur (L/LI)</li>
                <li>Link-Annotationen</li>
                <li>Formularfeld-Beschriftungen</li>
                <li>Schrift-Einbettung & Unicode</li>
                <li>Lesezeichen / Outlines</li>
                <li>Tab-Reihenfolge</li>
              </ul>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-2 text-slate-800">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <h3 className="font-semibold">Hinweis</h3>
              </div>
              <p className="text-sm text-slate-600">
                Dieser automatische Check ersetzt keine manuelle Prüfung mit assistiven Technologien.
                Er deckt die maschinenprüfbaren Anforderungen von PDF/UA-1 (ISO 14289-1) ab.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </PageLayout>
  );
}
