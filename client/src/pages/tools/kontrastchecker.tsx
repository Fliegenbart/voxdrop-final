import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Palette, Upload, FileUp, CheckCircle2, AlertTriangle, XCircle,
  Loader2, RefreshCw, Zap, Eye, ChevronRight, Pipette,
  Sparkles, Copy, ArrowRight, Info, Download
} from "lucide-react";
import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import { useToast } from "@/hooks/use-toast";
import { useAgencyMode } from "@/lib/agency-mode";

// Types
interface ColorInfo {
  r: number;
  g: number;
  b: number;
  hex: string;
}

interface ColorIssue {
  slide: number;
  type: string;
  foreground: ColorInfo;
  background: ColorInfo;
  ratio: number;
  text_preview: string;
  suggestions?: {
    aa?: { color: ColorInfo; hex: string; ratio: number; meets_target: boolean };
    aaa?: { color: ColorInfo; hex: string; ratio: number; meets_target: boolean };
  };
}

interface AnalysisResult {
  total_slides: number;
  total_color_pairs: number;
  failing_pairs: number;
  issues: ColorIssue[];
  has_thumbnails: boolean;
  summary: {
    passes_wcag_aa: boolean;
    compliance_rate: number;
  };
}

interface JobStatus {
  job_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress?: {
    phase: string;
    percentage: number;
    message: string;
  };
  result?: AnalysisResult;
  error?: string;
}

interface GeneratedColor {
  name: string;
  fg: string;
  bg: string;
  usage: string;
}

interface GeneratedPalette {
  name: string;
  colors: GeneratedColor[];
}

// Helper functions
function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(color1: string, color2: string): number {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  if (!rgb1 || !rgb2) return 0;
  const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
  const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

function checkWCAG(ratio: number) {
  return {
    aaLargeText: ratio >= 3,
    aaNormalText: ratio >= 4.5,
    aaaLargeText: ratio >= 4.5,
    aaaNormalText: ratio >= 7,
  };
}

function simulateColorBlindness(hex: string, type: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  let { r, g, b } = rgb;

  switch (type) {
    case "protanopia":
      r = Math.round(0.567 * r + 0.433 * g);
      g = Math.round(0.558 * r + 0.442 * g);
      b = Math.round(0.242 * g + 0.758 * b);
      break;
    case "deuteranopia":
      r = Math.round(0.625 * r + 0.375 * g);
      g = Math.round(0.7 * r + 0.3 * g);
      b = Math.round(0.3 * g + 0.7 * b);
      break;
    case "tritanopia":
      r = Math.round(0.95 * r + 0.05 * g);
      g = Math.round(0.433 * g + 0.567 * b);
      b = Math.round(0.475 * g + 0.525 * b);
      break;
  }

  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));

  return rgbToHex(r, g, b);
}

function suggestBetterContrast(foreground: string, background: string, targetRatio: number): string {
  const bgRgb = hexToRgb(background);
  const fgRgb = hexToRgb(foreground);
  if (!bgRgb || !fgRgb) return foreground;

  let bestColor = foreground;
  let bestRatio = getContrastRatio(foreground, background);

  for (let i = 0; i <= 100; i += 5) {
    const darkerR = Math.max(0, Math.round(fgRgb.r * (1 - i / 100)));
    const darkerG = Math.max(0, Math.round(fgRgb.g * (1 - i / 100)));
    const darkerB = Math.max(0, Math.round(fgRgb.b * (1 - i / 100)));
    const darker = rgbToHex(darkerR, darkerG, darkerB);
    const darkerRatio = getContrastRatio(darker, background);

    if (darkerRatio >= targetRatio && darkerRatio > bestRatio) {
      bestColor = darker;
      bestRatio = darkerRatio;
      break;
    }

    const lighterR = Math.min(255, Math.round(fgRgb.r + (255 - fgRgb.r) * (i / 100)));
    const lighterG = Math.min(255, Math.round(fgRgb.g + (255 - fgRgb.g) * (i / 100)));
    const lighterB = Math.min(255, Math.round(fgRgb.b + (255 - fgRgb.b) * (i / 100)));
    const lighter = rgbToHex(lighterR, lighterG, lighterB);
    const lighterRatio = getContrastRatio(lighter, background);

    if (lighterRatio >= targetRatio && lighterRatio > bestRatio) {
      bestColor = lighter;
      bestRatio = lighterRatio;
      break;
    }
  }

  return bestColor;
}

const colorBlindnessTypes = [
  { id: "protanopia", name: "Protanopie", subtitle: "Rot-Blindheit", percentage: "1%" },
  { id: "deuteranopia", name: "Deuteranopie", subtitle: "Grün-Blindheit", percentage: "6%" },
  { id: "tritanopia", name: "Tritanopie", subtitle: "Blau-Blindheit", percentage: "0.01%" },
];

export default function KontrastChecker() {
  const { toast } = useToast();
  const { isAgencyMode } = useAgencyMode();

  // PPTX Analysis State
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [isFixing, setIsFixing] = useState(false);
  const [fixJobId, setFixJobId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manual Mode State
  const [foreground, setForeground] = useState("#1e40af");
  const [background, setBackground] = useState("#ffffff");
  const [contrastRatio, setContrastRatio] = useState(0);
  const [wcagResults, setWcagResults] = useState(checkWCAG(0));
  const [eyeDropperSupported, setEyeDropperSupported] = useState(false);

  // AI Palette State
  const [paletteDescription, setPaletteDescription] = useState("");
  const [generatedPalette, setGeneratedPalette] = useState<GeneratedPalette | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [paletteError, setPaletteError] = useState<string | null>(null);

  // Effects
  useEffect(() => {
    setEyeDropperSupported("EyeDropper" in window);
  }, []);

  useEffect(() => {
    const ratio = getContrastRatio(foreground, background);
    setContrastRatio(ratio);
    setWcagResults(checkWCAG(ratio));
  }, [foreground, background]);

  const downloadReport = () => {
    if (!jobStatus?.result) return;
    const result = jobStatus.result;
    const lines = [
      "VoxDrop Kontrast-Report",
      `Datum: ${new Date().toLocaleString("de-DE")}`,
      `Folien: ${result.total_slides}`,
      `Farbpaare: ${result.total_color_pairs}`,
      `Kontrastprobleme: ${result.failing_pairs}`,
      `Konformität (WCAG 2.1 AA): ${result.summary.compliance_rate}%`,
      `Status: ${result.summary.passes_wcag_aa ? "OK" : "Nicht erfüllt"}`,
      "",
      "Details:",
      ...result.issues.map((issue) => (
        `Folie ${issue.slide}: ${issue.ratio.toFixed(2)}:1 (${issue.type}) ` +
        `FG ${issue.foreground.hex} / BG ${issue.background.hex} – "${issue.text_preview}"`
      )),
      "",
      "Hinweis: Behörden sollten EN 301 549 und WCAG 2.1 AA als Mindeststandard ansetzen.",
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kontrast-report-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Poll for job status
  useEffect(() => {
    if (!jobId || jobStatus?.status === "completed" || jobStatus?.status === "failed") {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/tools/pptx/analyze-colors/${jobId}`, {
          credentials: 'include'
        });
        if (response.ok) {
          const data = await response.json();
          setJobStatus(data);
        }
      } catch (error) {
        console.error("Failed to fetch job status:", error);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [jobId, jobStatus?.status]);

  // Poll for fix job status
  useEffect(() => {
    if (!fixJobId) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/tools/pptx/fix-colors/${fixJobId}`, {
          credentials: 'include'
        });
        if (response.ok) {
          const data = await response.json();
          if (data.status === "completed") {
            setIsFixing(false);
            toast({ title: "Farben korrigiert!" });
            // Download with auth header
            const downloadResponse = await fetch(`/api/tools/pptx/fix-colors/${fixJobId}/download`, {
              credentials: 'include'
            });
            if (downloadResponse.ok) {
              const blob = await downloadResponse.blob();
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'präsentation_barrierefrei.pptx';
              document.body.appendChild(a);
              a.click();
              window.URL.revokeObjectURL(url);
              a.remove();
            }
            setFixJobId(null);
          } else if (data.status === "failed") {
            setIsFixing(false);
            toast({ title: "Fehler bei der Korrektur", variant: "destructive" });
            setFixJobId(null);
          }
        }
      } catch (error) {
        console.error("Failed to fetch fix status:", error);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [fixJobId, toast]);

  // Handlers
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile?.name.endsWith(".pptx")) {
      setFile(droppedFile);
    } else {
      toast({ title: "Nur PPTX-Dateien sind erlaubt", variant: "destructive" });
    }
  }, [toast]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  }, []);

  const handleUpload = useCallback(async () => {
    if (!file) return;

    setIsUploading(true);
    setJobStatus(null);
    setJobId(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/tools/pptx/analyze-colors", {
        method: "POST",
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Upload fehlgeschlagen");
      }

      const data = await response.json();
      setJobId(data.job_id);
      setJobStatus({
        job_id: data.job_id,
        status: "pending",
        progress: { phase: "queued", percentage: 0, message: "In der Warteschlange..." }
      });

    } catch (error) {
      toast({
        title: "Fehler",
        description: error instanceof Error ? error.message : "Upload fehlgeschlagen",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  }, [file, toast]);

  const handleAutoFix = useCallback(async (level: "aa" | "aaa") => {
    if (!jobId) return;

    setIsFixing(true);

    try {
      const response = await fetch("/api/tools/pptx/fix-colors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          job_id: jobId,
          target_level: level
        }),
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error("Korrektur fehlgeschlagen");
      }

      const data = await response.json();
      setFixJobId(data.job_id);

    } catch (error) {
      setIsFixing(false);
      toast({
        title: "Fehler",
        description: "Automatische Korrektur fehlgeschlagen",
        variant: "destructive"
      });
    }
  }, [jobId, toast]);

  const pickColor = useCallback(async (setColor: (color: string) => void) => {
    if (!("EyeDropper" in window)) return;
    try {
      const eyeDropper = new (window as any).EyeDropper();
      const result = await eyeDropper.open();
      setColor(result.sRGBHex);
    } catch (e) {}
  }, []);

  const resetAnalysis = useCallback(() => {
    setFile(null);
    setJobId(null);
    setJobStatus(null);
    setFixJobId(null);
    setIsFixing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const copyResult = useCallback(() => {
    const text = `Kontrast: ${contrastRatio.toFixed(2)}:1\nVordergrund: ${foreground}\nHintergrund: ${background}\nWCAG AA: ${wcagResults.aaNormalText ? "Bestanden" : "Nicht bestanden"}`;
    navigator.clipboard.writeText(text);
    toast({ title: "Kopiert!" });
  }, [foreground, background, contrastRatio, wcagResults, toast]);

  const getSuggestion = useCallback((targetRatio: number) => {
    const suggested = suggestBetterContrast(foreground, background, targetRatio);
    setForeground(suggested);
    toast({ title: "Farbe optimiert" });
  }, [foreground, background, toast]);

  const generatePalette = useCallback(async () => {
    if (!paletteDescription.trim()) return;

    setIsGenerating(true);
    setPaletteError(null);
    setGeneratedPalette(null);

    try {
      const response = await fetch("/api/generate-palette", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ description: paletteDescription }),
        credentials: 'include'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || "Generierung fehlgeschlagen");
      }

      setGeneratedPalette(data.palette);
      toast({ title: "Palette generiert!" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unbekannter Fehler";
      setPaletteError(message);
    } finally {
      setIsGenerating(false);
    }
  }, [paletteDescription, toast]);

  const getSimulatedColors = useCallback((type: string) => {
    return {
      fg: simulateColorBlindness(foreground, type),
      bg: simulateColorBlindness(background, type),
    };
  }, [foreground, background]);

  // Rating helper
  const getRating = () => {
    if (contrastRatio >= 7) return { text: "Exzellent", color: "text-green-500", bg: "bg-green-500" };
    if (contrastRatio >= 4.5) return { text: "Gut", color: "text-emerald-500", bg: "bg-emerald-500" };
    if (contrastRatio >= 3) return { text: "Ausreichend", color: "text-yellow-500", bg: "bg-yellow-500" };
    return { text: "Ungenuegend", color: "text-red-500", bg: "bg-red-500" };
  };

  const rating = getRating();

  const getRatingInfo = (ratio: number) => {
    if (ratio >= 7) return { text: "Exzellent", color: "text-green-600", bg: "bg-green-100" };
    if (ratio >= 4.5) return { text: "Gut", color: "text-emerald-600", bg: "bg-emerald-100" };
    if (ratio >= 3) return { text: "Ausreichend", color: "text-amber-600", bg: "bg-amber-100" };
    return { text: "Ungenuegend", color: "text-red-600", bg: "bg-red-100" };
  };

  return (
    <PageLayout>
      <SEO
        title="PPTX Kontrast-Audit"
        description="Analysieren Sie PowerPoint-Präsentationen auf Kontrastprobleme und korrigieren Sie diese automatisch für WCAG-Konformität."
        canonical="/tools/kontrastchecker"
      />


      {/* Skip Link */}<main id="main-content" tabIndex={-1}>
      {/* Hero Section */}
      <div className="relative">
        <div className="relative max-w-6xl mx-auto px-6 pt-16 pb-12">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 border border-slate-200 rounded-full text-slate-700 text-sm mb-6">
              <Palette className="w-4 h-4" />
              WCAG 2.1 konform
            </div>
            <h1 className="text-5xl md:text-6xl font-bold text-slate-900 mb-4 tracking-tight">
              Kontrast<span className="text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-500">checker</span>
            </h1>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              PowerPoint-Präsentationen auf Barrierefreiheit prüfen und automatisch korrigieren
            </p>
          </div>

          {isAgencyMode && (
            <div className="max-w-2xl mx-auto mb-8 bg-emerald-50 rounded-2xl border border-emerald-200 p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-700 mt-0.5" />
                <div>
                  <h2 className="text-lg font-semibold text-emerald-900">Behörden-Modus aktiv</h2>
                  <p className="text-sm text-emerald-800 mt-1">
                    Ausrichtung auf EN 301 549 / WCAG 2.1 AA mit strengeren Prüfhinweisen und Report-Export.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* PPTX Upload Section */}
          <div className="max-w-2xl mx-auto">
            {!jobStatus ? (
              <div
                className={`bg-white rounded-3xl border border-slate-200 p-8 text-center shadow-sm transition-all ${
                  file ? "border-emerald-300" : "hover:border-slate-300"
                }`}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pptx"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="pptx-upload"
                />

                {file ? (
                  <div className="space-y-4">
                    <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto">
                      <FileUp className="w-8 h-8 text-slate-600" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">{file.name}</p>
                      <p className="text-sm text-slate-500">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                    <div className="flex gap-3 justify-center">
                      <Button
                        onClick={handleUpload}
                        disabled={isUploading}
                        className="bg-slate-900 hover:bg-slate-800 text-white"
                      >
                        {isUploading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Wird analysiert...
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4 mr-2" />
                            Analyse starten
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setFile(null)}
                        className="border-slate-300 text-slate-700 hover:bg-slate-100"
                      >
                        Andere Datei
                      </Button>
                    </div>
                  </div>
                ) : (
                  <label htmlFor="pptx-upload" className="cursor-pointer block">
                    <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Upload className="w-8 h-8 text-slate-500" />
                    </div>
                    <p className="text-lg font-medium text-slate-900 mb-1">
                      PPTX-Datei hierher ziehen
                    </p>
                    <p className="text-slate-500 mb-4">oder klicken zum Auswählen</p>
                    <p className="text-sm text-slate-400">Max. 50 MB</p>
                  </label>
                )}
              </div>
            ) : jobStatus.status === "processing" || jobStatus.status === "pending" ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center shadow-sm">
                <Loader2 className="w-12 h-12 text-slate-500 animate-spin mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-900 mb-2">
                  {jobStatus.progress?.message || "Analysiere..."}
                </h3>
                <div className="w-full max-w-xs mx-auto bg-slate-100 rounded-full h-2 mb-2">
                  <div
                    className="bg-gradient-to-r from-slate-500 to-slate-300 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${jobStatus.progress?.percentage || 0}%` }}
                  />
                </div>
                <p className="text-sm text-slate-500">
                  {jobStatus.progress?.percentage || 0}%
                </p>
              </div>
            ) : jobStatus.status === "failed" ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center shadow-sm">
                <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <XCircle className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="text-lg font-medium text-slate-900 mb-2">
                  Analyse fehlgeschlagen
                </h3>
                <p className="text-slate-600 mb-4">{jobStatus.error}</p>
                <Button onClick={resetAnalysis} className="bg-slate-900 hover:bg-slate-800 text-white">
                  Erneut versuchen
                </Button>
              </div>
            ) : jobStatus.result ? (
              <div className="space-y-6">
                {/* Summary Card */}
                <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                      {jobStatus.result.summary.passes_wcag_aa ? (
                        <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center">
                          <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                        </div>
                      ) : (
                        <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center">
                          <AlertTriangle className="w-7 h-7 text-amber-600" />
                        </div>
                      )}
                      <div>
                        <h3 className="text-xl font-semibold text-slate-900">
                          {jobStatus.result.summary.passes_wcag_aa
                            ? "WCAG AA konform"
                            : `${jobStatus.result.failing_pairs} Kontrastprobleme`}
                        </h3>
                        <p className="text-slate-600">
                          {jobStatus.result.total_slides} Folien, {jobStatus.result.total_color_pairs} Farbpaare
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-slate-900">
                        {jobStatus.result.summary.compliance_rate}%
                      </div>
                      <div className="text-sm text-slate-500">Konformitaet</div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={downloadReport}
                        className="mt-3 border-slate-300 text-slate-700 hover:bg-slate-100"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Report herunterladen
                      </Button>
                    </div>
                  </div>

                  {jobStatus.result.failing_pairs > 0 && (
                    <div className="flex gap-3 pt-4 border-t border-slate-200">
                      <div className="flex-1 flex items-center gap-2">
                        <Button
                          type="button"
                          onClick={() => handleAutoFix("aa")}
                          disabled={isFixing}
                          className="flex-1 bg-slate-900 hover:bg-slate-800 text-white"
                        >
                          {isFixing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                          Auto-Fix AA (4.5:1)
                        </Button>
                        <div className="group relative">
                          <Info className="w-4 h-4 text-slate-400 hover:text-slate-700 cursor-help" />
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 border border-slate-800">
                            Mindeststandard (BITV, EU-Richtlinie)
                          </div>
                        </div>
                      </div>
                      <div className="flex-1 flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleAutoFix("aaa")}
                          disabled={isFixing}
                          className="flex-1 border-slate-300 text-slate-700 hover:bg-slate-100"
                        >
                          {isFixing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                          Auto-Fix AAA (7:1)
                        </Button>
                        <div className="group relative">
                          <Info className="w-4 h-4 text-slate-400 hover:text-slate-700 cursor-help" />
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 border border-slate-800">
                            Beste Lesbarkeit, empfohlen
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Issues List */}
                {jobStatus.result.issues.length > 0 && (
                  <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="p-4 border-b border-slate-200">
                      <h3 className="font-semibold text-slate-900">
                        Kontrastprobleme ({jobStatus.result.issues.length})
                      </h3>
                    </div>
                    <div className="divide-y divide-slate-200 max-h-80 overflow-y-auto">
                      {jobStatus.result.issues.map((issue, idx) => (
                        <div key={idx} className="p-4 hover:bg-slate-50">
                          <div className="flex items-center gap-4">
                            {jobStatus.result?.has_thumbnails && jobId && (
                              <img
                                src={`/api/tools/pptx/analyze-colors/${jobId}/thumbnail/${issue.slide}`}
                                alt={`Folie ${issue.slide}`}
                                className="w-16 h-12 object-cover rounded-lg border border-slate-200"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            )}
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-lg border-2 border-slate-200" style={{ backgroundColor: issue.foreground.hex }} />
                              <ChevronRight className="w-4 h-4 text-slate-400" />
                              <div className="w-8 h-8 rounded-lg border-2 border-slate-200" style={{ backgroundColor: issue.background.hex }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium text-slate-900">Folie {issue.slide}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${getRatingInfo(issue.ratio).bg} ${getRatingInfo(issue.ratio).color}`}>
                                  {issue.ratio.toFixed(1)}:1
                                </span>
                              </div>
                              {issue.text_preview && (
                                <p className="text-sm text-slate-600 truncate">"{issue.text_preview}"</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-center">
                  <Button variant="outline" onClick={resetAnalysis} className="border-slate-300 text-slate-700 hover:bg-slate-100">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Neue Analyse
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Manual Color Checker Section */}
      <div className="relative py-16">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-slate-900 mb-8 text-center">Manueller Farbcheck</h2>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Color Pickers */}
            <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
              <div className="space-y-6">
                {/* Foreground */}
                <div>
                  <label htmlFor="fg-input" className="text-sm font-medium text-slate-700 mb-3 block">Textfarbe</label>
                  <div className="flex gap-3">
                    <div
                      className="w-20 h-20 rounded-2xl cursor-pointer border-4 border-slate-200 transition-transform hover:scale-105 shadow-sm"
                      style={{ backgroundColor: foreground }}
                      onClick={() => document.getElementById('fg-picker')?.click()}
                      role="button"
                      aria-label="Textfarbe wählen"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') document.getElementById('fg-picker')?.click(); }}
                    />
                    <input type="color" id="fg-picker" value={foreground} onChange={(e) => setForeground(e.target.value)} className="sr-only" aria-label="Textfarbe Farbwähler" />
                    <div className="flex-1">
                      <Input
                        id="fg-input"
                        value={foreground}
                        onChange={(e) => setForeground(e.target.value)}
                        className="bg-white border-slate-300 text-slate-900 font-mono text-lg h-12"
                        aria-describedby="fg-hint"
                      />
                      {eyeDropperSupported && (
                        <Button variant="ghost" size="sm" onClick={() => pickColor(setForeground)} className="mt-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100">
                          <Pipette className="w-4 h-4 mr-2" />
                          Pipette
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Swap */}
                <div className="flex justify-center">
                  <Button variant="ghost" onClick={() => { setForeground(background); setBackground(foreground); }} className="text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-full">
                    <RefreshCw className="w-5 h-5" />
                  </Button>
                </div>

                {/* Background */}
                <div>
                  <label htmlFor="bg-input" className="text-sm font-medium text-slate-700 mb-3 block">Hintergrundfarbe</label>
                  <div className="flex gap-3">
                    <div
                      className="w-20 h-20 rounded-2xl cursor-pointer border-4 border-slate-200 transition-transform hover:scale-105 shadow-sm"
                      style={{ backgroundColor: background }}
                      onClick={() => document.getElementById('bg-picker')?.click()}
                      role="button"
                      aria-label="Hintergrundfarbe wählen"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') document.getElementById('bg-picker')?.click(); }}
                    />
                    <input type="color" id="bg-picker" value={background} onChange={(e) => setBackground(e.target.value)} className="sr-only" aria-label="Hintergrundfarbe Farbwähler" />
                    <div className="flex-1">
                      <Input
                        id="bg-input"
                        value={background}
                        onChange={(e) => setBackground(e.target.value)}
                        className="bg-white border-slate-300 text-slate-900 font-mono text-lg h-12"
                        aria-describedby="bg-hint"
                      />
                      {eyeDropperSupported && (
                        <Button variant="ghost" size="sm" onClick={() => pickColor(setBackground)} className="mt-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100">
                          <Pipette className="w-4 h-4 mr-2" />
                          Pipette
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="pt-4 border-t border-slate-200">
                  <span id="presets-label" className="text-sm font-medium text-slate-600 mb-3 block">Schnellauswahl</span>
                  <div className="flex flex-wrap gap-2" role="group" aria-labelledby="presets-label">
                    {[
                      { fg: "#000000", bg: "#ffffff", label: "Klassisch" },
                      { fg: "#1e40af", bg: "#ffffff", label: "Blau" },
                      { fg: "#ffffff", bg: "#16a34a", label: "Grün" },
                      { fg: "#ffffff", bg: "#dc2626", label: "Rot" },
                    ].map((preset, i) => (
                      <button
                        key={i}
                        onClick={() => { setForeground(preset.fg); setBackground(preset.bg); }}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors border border-slate-200"
                      >
                        <div className="flex -space-x-1">
                          <span className="w-4 h-4 rounded-full border border-slate-200" style={{ backgroundColor: preset.fg }} />
                          <span className="w-4 h-4 rounded-full border border-slate-200" style={{ backgroundColor: preset.bg }} />
                        </div>
                        <span className="text-sm text-slate-700">{preset.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Results */}
            <div className="space-y-6">
              {/* Main Score */}
              <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center shadow-sm">
                <div className="text-8xl font-bold text-slate-900 tracking-tighter mb-2">
                  {contrastRatio.toFixed(1)}
                  <span className="text-4xl text-slate-500">:1</span>
                </div>
                <div className={`text-xl font-medium ${rating.color}`}>{rating.text}</div>

                {/* Visual Meter */}
                <div className="relative h-3 bg-slate-200 rounded-full overflow-hidden my-6">
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-400 via-amber-300 to-emerald-400 transition-all duration-500"
                    style={{ width: `${Math.min(100, (contrastRatio / 21) * 100)}%` }}
                  />
                  <div className="absolute inset-y-0 left-[14.3%] w-0.5 bg-slate-400" title="3:1" />
                  <div className="absolute inset-y-0 left-[21.4%] w-0.5 bg-slate-400" title="4.5:1" />
                  <div className="absolute inset-y-0 left-[33.3%] w-0.5 bg-slate-500" title="7:1" />
                </div>

                {/* WCAG Badges */}
                <div className="grid grid-cols-2 gap-3">
                  <div className={`p-4 rounded-xl ${wcagResults.aaNormalText ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'} border`}>
                    <div className="flex items-center justify-center gap-2 mb-1">
                      {wcagResults.aaNormalText ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <XCircle className="w-5 h-5 text-red-600" />}
                      <span className="font-bold text-slate-900">AA</span>
                    </div>
                    <div className="text-xs text-slate-600">Normaler Text</div>
                  </div>
                  <div className={`p-4 rounded-xl ${wcagResults.aaaNormalText ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'} border`}>
                    <div className="flex items-center justify-center gap-2 mb-1">
                      {wcagResults.aaaNormalText ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <XCircle className="w-5 h-5 text-slate-400" />}
                      <span className="font-bold text-slate-900">AAA</span>
                    </div>
                    <div className="text-xs text-slate-600">Normaler Text</div>
                  </div>
                  <div className={`p-4 rounded-xl ${wcagResults.aaLargeText ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'} border`}>
                    <div className="flex items-center justify-center gap-2 mb-1">
                      {wcagResults.aaLargeText ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <XCircle className="w-5 h-5 text-red-600" />}
                      <span className="font-bold text-slate-900">AA</span>
                    </div>
                    <div className="text-xs text-slate-600">Grosser Text</div>
                  </div>
                  <div className={`p-4 rounded-xl ${wcagResults.aaaLargeText ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'} border`}>
                    <div className="flex items-center justify-center gap-2 mb-1">
                      {wcagResults.aaaLargeText ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <XCircle className="w-5 h-5 text-slate-400" />}
                      <span className="font-bold text-slate-900">AAA</span>
                    </div>
                    <div className="text-xs text-slate-600">Grosser Text</div>
                  </div>
                </div>

                {/* Quick Fix */}
                {!wcagResults.aaNormalText && (
                  <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <div className="flex items-center gap-2 text-amber-700 mb-3">
                      <Zap className="w-5 h-5" />
                      <span className="font-medium">Schnell-Optimierung</span>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => getSuggestion(4.5)} className="flex-1 bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-200">
                        AA erreichen
                      </Button>
                      <Button size="sm" onClick={() => getSuggestion(7)} className="flex-1 bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-200">
                        AAA erreichen
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 mt-6">
                  <Button variant="ghost" onClick={copyResult} className="flex-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100">
                    <Copy className="w-4 h-4 mr-2" />
                    Kopieren
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Live Preview Section */}
      <div className="relative py-16">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-slate-900 mb-8 text-center">Live-Vorschau</h2>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Card Preview */}
            <div className="rounded-2xl p-6 transition-all" style={{ backgroundColor: background }}>
              <h3 className="text-2xl font-bold mb-3" style={{ color: foreground }}>Überschrift</h3>
              <p className="mb-4" style={{ color: foreground }}>
                Dies ist ein Beispieltext, um die Lesbarkeit Ihrer Farbkombination zu testen.
              </p>
              <button className="px-4 py-2 rounded-lg font-medium transition-opacity hover:opacity-80" style={{ backgroundColor: foreground, color: background }}>
                Button
              </button>
            </div>

            {/* Navigation Preview */}
            <div className="rounded-2xl p-6" style={{ backgroundColor: background }}>
              <div className="flex items-center justify-between mb-4">
                <span className="font-bold text-lg" style={{ color: foreground }}>Logo</span>
                <div className="flex gap-4 text-sm" style={{ color: foreground }}>
                  <span className="hover:opacity-70 cursor-pointer">Start</span>
                  <span className="hover:opacity-70 cursor-pointer">Produkte</span>
                  <span className="hover:opacity-70 cursor-pointer">Kontakt</span>
                </div>
              </div>
              <div className="h-24 rounded-lg border-2 border-dashed flex items-center justify-center" style={{ borderColor: foreground + '40' }}>
                <span className="text-sm opacity-60" style={{ color: foreground }}>Hero-Bereich</span>
              </div>
            </div>

            {/* Form Preview */}
            <div className="rounded-2xl p-6" style={{ backgroundColor: background }}>
              <h4 className="font-semibold mb-4" style={{ color: foreground }}>Formular</h4>
              <div className="space-y-3">
                <div>
                  <label className="text-sm block mb-1" style={{ color: foreground }}>E-Mail</label>
                  <div className="h-10 rounded-lg border-2" style={{ borderColor: foreground + '40' }} />
                </div>
                <div>
                  <label className="text-sm block mb-1" style={{ color: foreground }}>Passwort</label>
                  <div className="h-10 rounded-lg border-2" style={{ borderColor: foreground + '40' }} />
                </div>
                <button className="w-full py-2 rounded-lg font-medium" style={{ backgroundColor: foreground, color: background }}>
                  Anmelden
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Color Blindness Simulation */}
      <div className="relative py-16">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 border border-slate-200 rounded-full text-slate-700 text-sm mb-4">
              <Eye className="w-4 h-4" />
              Farbfehlsichtigkeit
            </div>
	            <h2 className="text-3xl font-bold text-slate-900 mb-4">So sehen andere Ihre Farben</h2>
	            <p className="text-slate-600 max-w-2xl mx-auto">
	              Etwa 8% der Männer und 0.5% der Frauen haben eine Form von Farbfehlsichtigkeit.
	            </p>
	          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {colorBlindnessTypes.map((type) => {
              const simColors = getSimulatedColors(type.id);
              const simRatio = getContrastRatio(simColors.fg, simColors.bg);
              const simWcag = checkWCAG(simRatio);

              return (
                <div key={type.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="p-8 text-center" style={{ backgroundColor: simColors.bg }}>
                    <p className="text-3xl font-bold mb-2" style={{ color: simColors.fg }}>Aa</p>
                    <p className="text-sm" style={{ color: simColors.fg }}>Beispieltext</p>
                  </div>
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-slate-900">{type.name}</h3>
                      <span className="text-xs px-2 py-1 bg-slate-100 rounded-full text-slate-600">{type.percentage}</span>
                    </div>
                    <p className="text-sm text-slate-600 mb-4">{type.subtitle}</p>
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <span className="text-sm text-slate-700">Kontrast</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900">{simRatio.toFixed(1)}:1</span>
                        {simWcag.aaNormalText ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* AI Palette Generator */}
      <div className="relative py-16">
        <div className="max-w-4xl mx-auto px-6">
          <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">KI-Farbpalette</h2>
            </div>
            <p className="text-slate-600 mb-6">Beschreiben Sie Ihr Projekt und erhalten Sie barrierefreie Farbvorschlaege.</p>

            <div className="space-y-4">
              <textarea
                value={paletteDescription}
                onChange={(e) => setPaletteDescription(e.target.value)}
                placeholder="z.B. Moderne, professionelle Farben für eine Bank in Blautoenen..."
                className="w-full h-24 px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-slate-300"
                maxLength={500}
              />

                <Button
                  onClick={generatePalette}
                  disabled={isGenerating || paletteDescription.length < 5}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white h-12"
                >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generiere...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Palette generieren
                  </>
                )}
              </Button>

              {paletteError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
                  {paletteError}
                </div>
              )}

              {generatedPalette && (
                <div className="mt-6 p-6 bg-slate-50 rounded-xl border border-slate-200">
                  <h3 className="font-semibold text-slate-900 mb-4">{generatedPalette.name}</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {generatedPalette.colors.map((color, i) => {
                      const ratio = getContrastRatio(color.fg, color.bg);
                      return (
                        <button
                          key={i}
                          onClick={() => { setForeground(color.fg); setBackground(color.bg); toast({ title: `${color.name} angewendet` }); }}
                          className="group p-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 transition-all text-left"
                        >
                          <div className="h-16 rounded-lg flex items-center justify-center font-bold text-xl mb-2" style={{ backgroundColor: color.bg, color: color.fg }}>
                            Aa
                          </div>
                          <div className="text-sm font-medium text-slate-900">{color.name}</div>
                          <div className="text-xs text-slate-600">{ratio.toFixed(1)}:1</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* WCAG Info */}
      <div className="relative py-16 border-t border-slate-200">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-slate-900 mb-8 text-center">WCAG-Richtlinien</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                  <span className="font-bold text-amber-800">AA</span>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">Minimum (AA)</h3>
                  <p className="text-sm text-slate-600">Gesetzlich empfohlen</p>
                </div>
              </div>
              <ul className="space-y-2 text-slate-700">
                <li className="flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 text-amber-600" />
                  Normaler Text: 4.5:1
                </li>
                <li className="flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 text-amber-600" />
                  Grosser Text (18pt+): 3:1
                </li>
              </ul>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <span className="font-bold text-emerald-800">AAA</span>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">Erweitert (AAA)</h3>
                  <p className="text-sm text-slate-600">Beste Barrierefreiheit</p>
                </div>
              </div>
              <ul className="space-y-2 text-slate-700">
                <li className="flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 text-emerald-600" />
                  Normaler Text: 7:1
                </li>
                <li className="flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 text-emerald-600" />
                  Grosser Text (18pt+): 4.5:1
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      </main>

    </PageLayout>
  );
}
