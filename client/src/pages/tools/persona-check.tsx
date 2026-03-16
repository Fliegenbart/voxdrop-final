import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import {
  Users, Upload, Loader2, CheckCircle2, AlertTriangle, XCircle,
  FileText, Info, X, ChevronDown, ChevronUp, Lightbulb,
  Plus, UserPlus, Trash2, Wand2, Copy, Check, Wrench
} from "lucide-react";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

type JobStatus = "pending" | "parsing" | "analyzing" | "ai_analysis" | "generating_report" | "completed" | "failed";

interface PersonaIssue {
  type: string;
  severity: "critical" | "warning" | "info";
  description: string;
  recommendation: string;
  persona_impact?: string;
  examples?: string[];
}

interface PersonaResult {
  id: string;
  name: string;
  icon: string;
  description: string;
  core_limitation: string;
  status: "accessible" | "limited" | "blocked";
  critical_issues: number;
  warning_issues: number;
  issues: PersonaIssue[];
}

interface Recommendation {
  action: string;
  issue: string;
  type: string;
  severity: string;
  impact: number;
  affected_personas: string[];
  priority: number;
  effort: string;
}

interface Report {
  document: string;
  format: string;
  analyzed_at: string;
  summary: {
    accessible: number;
    limited: number;
    blocked: number;
    total: number;
    accessibility_percentage: number;
  };
  personas: PersonaResult[];
  recommendations: Recommendation[];
  document_stats: {
    page_count: number;
    word_count: number;
    image_count: number;
    heading_count: number;
  };
}

interface AnalysisJob {
  id: string;
  status: JobStatus;
  progress: number;
  currentStage: string;
  error?: string;
  report?: Report;
}

interface CustomPersona {
  id: string;
  name: string;
  age: number;
  description: string;
  core_limitation: string;
  icon: string;
  relevant_tests: string[];
  is_custom: boolean;
}

interface AvailableTest {
  id: string;
  name: string;
  category: string;
  description: string;
}

interface NewPersonaForm {
  name: string;
  age: number;
  description: string;
  core_limitation: string;
  icon: string;
  relevant_tests: string[];
}

interface OptimizedTextResult {
  persona_id: string;
  persona_name: string;
  original_text: string;
  optimized_text: string;
  optimization_notes: string[];
}

const STAGES: { key: JobStatus; label: string; description: string }[] = [
  { key: "parsing", label: "Parsing", description: "Dokument wird analysiert" },
  { key: "analyzing", label: "Automatische Tests", description: "Kontrast, Lesbarkeit, Struktur" },
  { key: "ai_analysis", label: "KI-Analyse", description: "Tonalität, Fachbegriffe" },
  { key: "generating_report", label: "Report", description: "Persona-Bewertung wird erstellt" },
];

const STATUS_COLORS = {
  accessible: { bg: "bg-green-100", text: "text-green-700", border: "border-green-200" },
  limited: { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-200" },
  blocked: { bg: "bg-red-100", text: "text-red-700", border: "border-red-200" },
};

const STATUS_LABELS = {
  accessible: "Zugänglich",
  limited: "Eingeschränkt",
  blocked: "Blockiert",
};

export default function PersonaCheck() {
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();

  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [job, setJob] = useState<AnalysisJob | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [expandedPersona, setExpandedPersona] = useState<string | null>(null);

  // Custom Persona State
  const [showCustomPersonaDialog, setShowCustomPersonaDialog] = useState(false);
  const [customPersonas, setCustomPersonas] = useState<CustomPersona[]>([]);
  const [availableTests, setAvailableTests] = useState<AvailableTest[]>([]);
  const [newPersona, setNewPersona] = useState<NewPersonaForm>({
    name: "",
    age: 40,
    description: "",
    core_limitation: "",
    icon: "👤",
    relevant_tests: [],
  });

  // Text Optimization State
  const [showOptimizeModal, setShowOptimizeModal] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizedResult, setOptimizedResult] = useState<OptimizedTextResult | null>(null);
  const [optimizeError, setOptimizeError] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState(false);

  // PPTX Fix State
  const [isFixingPptx, setIsFixingPptx] = useState(false);
  const [fixingPersonaId, setFixingPersonaId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Load available tests and custom personas
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load available tests
        const testsResponse = await fetch("/api/persona/available-tests");
        if (testsResponse.ok) {
          const data = await testsResponse.json();
          setAvailableTests(data.tests || []);
        }

        // Load custom personas
        const personasResponse = await fetch("/api/persona/custom-personas");
        if (personasResponse.ok) {
          const data = await personasResponse.json();
          setCustomPersonas(data.personas || []);
        }
      } catch (error) {
        console.error("Failed to load persona data:", error);
      }
    };
    loadData();
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      validateAndSetFile(file);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  }, []);

  const validateAndSetFile = (file: File) => {
    const validExtensions = [".pdf", ".pptx", ".ppt", ".docx", ".doc"];
    const ext = "." + file.name.split(".").pop()?.toLowerCase();

    if (!validExtensions.includes(ext)) {
      toast({
        title: "Ungültiger Dateityp",
        description: "Unterstützte Formate: PDF, PPTX, DOCX",
        variant: "destructive",
      });
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: "Datei zu groß",
        description: `Maximal ${MAX_FILE_SIZE / 1024 / 1024}MB erlaubt.`,
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
    setJob(null);
  };

  const handleAnalyze = async () => {
    if (!selectedFile) return;

    if (!isAuthenticated) {
      toast({
        title: "Anmeldung erforderlich",
        description: "Bitte melden Sie sich an, um diese Funktion zu nutzen.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setJob({ id: "", status: "pending", progress: 0, currentStage: "Wird hochgeladen..." });

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch("/api/persona/analyze", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || "Upload fehlgeschlagen");
      }

      setJob({
        id: data.job_id,
        status: "parsing",
        progress: 0,
        currentStage: "Dokument wird analysiert..."
      });

      startPolling(data.job_id);

      toast({
        title: "Analyse gestartet",
        description: "Ihr Dokument wird gegen 7 Personas geprüft.",
      });

    } catch (error) {
      setJob(null);
      toast({
        title: "Fehler",
        description: error instanceof Error ? error.message : "Upload fehlgeschlagen",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const startPolling = (jobId: string) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/persona/status/${jobId}`);

        if (!response.ok) {
          throw new Error("Status-Abfrage fehlgeschlagen");
        }

        const data = await response.json();

        if (data.status === "completed") {
          // Fetch full report
          const reportResponse = await fetch(`/api/persona/report/${jobId}`);

          if (reportResponse.ok) {
            const report = await reportResponse.json();
            setJob({
              id: jobId,
              status: "completed",
              progress: 100,
              currentStage: "Fertig",
              report,
            });
          }

          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }

          toast({
            title: "Analyse abgeschlossen",
            description: "Der Persona-Report ist bereit.",
          });

        } else if (data.status === "failed") {
          setJob({
            id: jobId,
            status: "failed",
            progress: 0,
            currentStage: "Fehler",
            error: data.error,
          });

          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }

          toast({
            title: "Analyse fehlgeschlagen",
            description: data.error || "Ein Fehler ist aufgetreten",
            variant: "destructive",
          });

        } else {
          setJob({
            id: jobId,
            status: data.status,
            progress: data.progress || 0,
            currentStage: data.current_stage || "",
          });
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    }, 2000);
  };

  const getStageIndex = (status: JobStatus) => {
    return STAGES.findIndex(s => s.key === status);
  };

  const clearFile = () => {
    setSelectedFile(null);
    setJob(null);
    setExpandedPersona(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const togglePersona = (id: string) => {
    setExpandedPersona(expandedPersona === id ? null : id);
  };

  // Custom Persona Functions
  const handleCreateCustomPersona = async () => {
    if (!newPersona.name || !newPersona.description || newPersona.relevant_tests.length === 0) {
      toast({
        title: "Felder ausfüllen",
        description: "Name, Beschreibung und mindestens ein Test sind erforderlich.",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch("/api/persona/custom-personas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(newPersona),
      });

      if (!response.ok) {
        throw new Error("Fehler beim Erstellen der Persona");
      }

      const created = await response.json();
      setCustomPersonas([...customPersonas, { ...created, is_custom: true }]);
      setShowCustomPersonaDialog(false);
      setNewPersona({
        name: "",
        age: 40,
        description: "",
        core_limitation: "",
        icon: "👤",
        relevant_tests: [],
      });

      toast({
        title: "Persona erstellt",
        description: `${created.name} wurde hinzugefügt.`,
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Persona konnte nicht erstellt werden.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteCustomPersona = async (personaId: string) => {
    try {
      const response = await fetch(`/api/persona/custom-personas/${personaId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setCustomPersonas(customPersonas.filter(p => p.id !== personaId));
        toast({
          title: "Persona gelöscht",
        });
      }
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Persona konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    }
  };

  const toggleTestSelection = (testId: string) => {
    setNewPersona(prev => ({
      ...prev,
      relevant_tests: prev.relevant_tests.includes(testId)
        ? prev.relevant_tests.filter(t => t !== testId)
        : [...prev.relevant_tests, testId],
    }));
  };

  // Text Optimization Functions
  const handleOptimizeText = async (personaId: string) => {
    // Get the text from the report's document analysis
    // For now, we'll need the original document text - which we can get from the report
    // The document text should be available in the analysis
    if (!job?.report) return;

    // We need the original text - let's use the document stats to indicate we have text
    // In a real implementation, we'd store the document text in the report
    // For now, we'll prompt the user to paste text
    setOptimizedResult(null);
    setOptimizeError(null);
    setShowOptimizeModal(true);

    // Store which persona we're optimizing for
    setOptimizedResult({
      persona_id: personaId,
      persona_name: job.report.personas.find(p => p.id === personaId)?.name || personaId,
      original_text: "",
      optimized_text: "",
      optimization_notes: [],
    });
  };

  const handleRunOptimization = async (text: string) => {
    if (!optimizedResult?.persona_id || !text.trim()) return;

    setIsOptimizing(true);
    setOptimizeError(null);

    try {
      const response = await fetch("/api/persona/optimize-text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: text.trim(),
          persona_id: optimizedResult.persona_id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || "Optimierung fehlgeschlagen");
      }

      setOptimizedResult(data);

      toast({
        title: "Text optimiert",
        description: `Text wurde für ${data.persona_name} angepasst.`,
      });

    } catch (error) {
      console.error("Optimization error:", error);
      setOptimizeError(error instanceof Error ? error.message : "Unbekannter Fehler");
      toast({
        title: "Fehler",
        description: error instanceof Error ? error.message : "Optimierung fehlgeschlagen",
        variant: "destructive",
      });
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleCopyOptimizedText = async () => {
    if (!optimizedResult?.optimized_text) return;

    try {
      await navigator.clipboard.writeText(optimizedResult.optimized_text);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
      toast({
        title: "Kopiert",
        description: "Optimierter Text wurde in die Zwischenablage kopiert.",
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Text konnte nicht kopiert werden.",
        variant: "destructive",
      });
    }
  };

  const handleFixCriticalIssues = async (personaId: string) => {
    if (!selectedFile || !job?.id) return;

    // Only allow fixing for PPTX files
    const ext = selectedFile.name.split(".").pop()?.toLowerCase();
    if (ext !== "pptx" && ext !== "ppt") {
      toast({
        title: "Nicht unterstützt",
        description: "Automatische Textkorrektur ist nur für PowerPoint-Dateien verfügbar.",
        variant: "destructive",
      });
      return;
    }

    setIsFixingPptx(true);
    setFixingPersonaId(personaId);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("persona_id", personaId);
      formData.append("job_id", job.id);

      const response = await fetch("/api/persona/fix-critical", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || errorData.error || "Korrektur fehlgeschlagen");
      }

      // Download the fixed PPTX
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const personaName = job.report?.personas.find(p => p.id === personaId)?.name || personaId;
      a.download = selectedFile.name.replace(/\.pptx?$/i, `_${personaName}_korrigiert.pptx`);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "PPTX korrigiert",
        description: `Kritische Stellen für ${personaName} wurden angepasst.`,
      });

    } catch (error) {
      toast({
        title: "Fehler",
        description: error instanceof Error ? error.message : "Korrektur fehlgeschlagen",
        variant: "destructive",
      });
    } finally {
      setIsFixingPptx(false);
      setFixingPersonaId(null);
    }
  };

  const EMOJI_OPTIONS = ["👤", "👵", "👴", "👨", "👩", "🧑", "👶", "🧓", "👨‍🦯", "👩‍🦯", "🧑‍🦽", "👨‍🦼", "🤰", "🧕", "👨‍💼", "👩‍💼"];

  return (
    <PageLayout>
      <SEO
        title="Persona-Check - VoxDrop"
        description="Analysieren Sie Ihre Dokumente gegen 7 realistische Personas. Erfahren Sie, wer Ihre Inhalte nutzen kann und wo Barrieren bestehen."
      />

      {/* Hero Section */}
      <header className="pt-12 pb-8 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
            <Users className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight mb-4">
            Persona-Check
          </h1>
          <p className="text-lg text-slate-600 font-light max-w-2xl mx-auto">
            Prüfen Sie, welche Menschen Ihr Dokument wirklich nutzen können
          </p>
        </div>
      </header>

      {/* Explanation Section */}
      <section className="max-w-4xl mx-auto px-6 mb-8">
        <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl border border-purple-100 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">
            Warum Personas statt abstrakter Scores?
          </h2>
          <div className="space-y-3 text-sm text-slate-700">
            <p>
              <strong>Abstrakte Scores wie "WCAG AA bestanden" sagen wenig aus.</strong> Ein Dokument kann technisch barrierefrei sein
              und trotzdem Menschen ausschließen - z.B. durch zu komplexe Sprache oder fehlende Struktur.
            </p>
            <p>
              Dieses Tool nutzt <strong>fiktive Personas als Denkwerkzeug</strong>, um Barrieren greifbar zu machen.
              Statt zu fragen "Ist der Kontrast hoch genug?" fragen wir: "Kann Ingrid (78, Makuladegeneration) das lesen?"
            </p>
            <div className="bg-white/60 rounded-xl p-4 mt-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                <strong>Hinweis zur Methodik:</strong> Die Bewertungen basieren auf <em>statistischen Richtwerten</em> aus
                Barrierefreiheits-Forschung (z.B. Flesch-Index, WCAG-Kontrastverhältnisse, durchschnittliche Satzlängen).
                Die Personas repräsentieren <em>keine</em> echten Personen und sollen <em>keine</em> Stereotypen über
                Menschen mit Behinderungen, Migrationshintergrund oder anderen Merkmalen verstärken. Sie dienen als
                empathie-förderndes Werkzeug, um abstrakte Metriken in konkrete Auswirkungen zu übersetzen.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 7 Personas Overview Section */}
      <section className="max-w-4xl mx-auto px-6 mb-8">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-600" />
              Die 7 Personas
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Ihr Dokument wird gegen diese 7 realistischen Personas geprüft
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6">
            {/* Ingrid */}
            <div className="p-4 bg-slate-50 rounded-xl">
              <div className="flex items-start gap-3">
                <span className="text-3xl">👵</span>
                <div className="flex-1">
                  <p className="font-semibold text-slate-900">Ingrid, 78</p>
                  <p className="text-sm text-purple-700 font-medium">Sehbeeinträchtigung & Digital Immigrant</p>
                  <p className="text-xs text-slate-600 mt-1">
                    Altersbedingte Makuladegeneration, nutzt Bildschirmlupe mit 200-300% Zoom.
                    Braucht hohen Kontrast, große Schrift und klare Struktur.
                  </p>
                </div>
              </div>
            </div>

            {/* Mehmet */}
            <div className="p-4 bg-slate-50 rounded-xl">
              <div className="flex items-start gap-3">
                <span className="text-3xl">👨</span>
                <div className="flex-1">
                  <p className="font-semibold text-slate-900">Mehmet, 34</p>
                  <p className="text-sm text-purple-700 font-medium">Geflüchteter mit Traumahintergrund</p>
                  <p className="text-xs text-slate-600 mt-1">
                    Deutsch B1, komplexe PTBS. Benötigt einfache Sprache, kurze Sätze,
                    freundlichen Ton und keine bedrohlichen Formulierungen.
                  </p>
                </div>
              </div>
            </div>

            {/* Fatima */}
            <div className="p-4 bg-slate-50 rounded-xl">
              <div className="flex items-start gap-3">
                <span className="text-3xl">👩</span>
                <div className="flex-1">
                  <p className="font-semibold text-slate-900">Fatima, 29</p>
                  <p className="text-sm text-purple-700 font-medium">Analphabetin mit Fluchthintergrund</p>
                  <p className="text-xs text-slate-600 mt-1">
                    Keine formale Schulbildung, kann nicht lesen. Braucht Piktogramme,
                    Audio-Alternativen und extrem einfache Sprache (Leichte Sprache).
                  </p>
                </div>
              </div>
            </div>

            {/* Thomas */}
            <div className="p-4 bg-slate-50 rounded-xl">
              <div className="flex items-start gap-3">
                <span className="text-3xl">👨‍💼</span>
                <div className="flex-1">
                  <p className="font-semibold text-slate-900">Thomas, 42</p>
                  <p className="text-sm text-purple-700 font-medium">ADHS & Legasthenie</p>
                  <p className="text-xs text-slate-600 mt-1">
                    Diagnostizierte ADHS und Legasthenie. Braucht klare visuelle Struktur,
                    kurze Absätze, Aufzählungen und hervorgehobene Schlüsselinformationen.
                  </p>
                </div>
              </div>
            </div>

            {/* Aisha */}
            <div className="p-4 bg-slate-50 rounded-xl">
              <div className="flex items-start gap-3">
                <span className="text-3xl">👵</span>
                <div className="flex-1">
                  <p className="font-semibold text-slate-900">Aisha, 67</p>
                  <p className="text-sm text-purple-700 font-medium">Gehörlose Rentnerin</p>
                  <p className="text-xs text-slate-600 mt-1">
                    Von Geburt an gehörlos, DGS als Muttersprache. Schriftdeutsch ist Zweitsprache.
                    Braucht einfache Grammatik, keine Passiv-Sätze, Untertitel für Videos.
                  </p>
                </div>
              </div>
            </div>

            {/* Sandra */}
            <div className="p-4 bg-slate-50 rounded-xl">
              <div className="flex items-start gap-3">
                <span className="text-3xl">👩‍👧</span>
                <div className="flex-1">
                  <p className="font-semibold text-slate-900">Sandra, 35</p>
                  <p className="text-sm text-purple-700 font-medium">Alleinerziehende unter Zeitdruck</p>
                  <p className="text-xs text-slate-600 mt-1">
                    Chronischer Zeitmangel, liest am Handy. Braucht das Wichtigste zuerst,
                    klare Handlungsanweisungen und Zeitschätzungen.
                  </p>
                </div>
              </div>
            </div>

            {/* Viktor */}
            <div className="p-4 bg-slate-50 rounded-xl md:col-span-2 md:w-1/2">
              <div className="flex items-start gap-3">
                <span className="text-3xl">👨‍🦳</span>
                <div className="flex-1">
                  <p className="font-semibold text-slate-900">Viktor, 52</p>
                  <p className="text-sm text-purple-700 font-medium">Farbenblindheit & Depression</p>
                  <p className="text-xs text-slate-600 mt-1">
                    Rot-Grün-Schwäche, mittelschwere Depression. Braucht keine Farbkodierung ohne Symbole,
                    positiven Ton, kleine machbare Schritte statt überwältigender Formulare.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main id="main-content" className="max-w-4xl mx-auto px-6 pb-24" tabIndex={-1}>
        {/* Upload Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden mb-6">
          <div className="p-6">
            {!selectedFile ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all
                  ${isDragging
                    ? "border-purple-500 bg-purple-50"
                    : "border-slate-200 hover:border-purple-300 hover:bg-slate-50"
                  }
                `}
              >
                <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragging ? "text-purple-500" : "text-slate-400"}`} />
                <p className="text-lg font-medium text-slate-700 mb-2">
                  Dokument hochladen
                </p>
                <p className="text-sm text-slate-500 mb-4">
                  PDF, PowerPoint oder Word-Dokument
                </p>
                <p className="text-xs text-slate-400">
                  Maximal {MAX_FILE_SIZE / 1024 / 1024}MB
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">
                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                  <FileText className="w-6 h-6 text-purple-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 truncate">{selectedFile.name}</p>
                  <p className="text-sm text-slate-500">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={clearFile}
                  disabled={isUploading || (job?.status !== "completed" && job?.status !== "failed" && job !== null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.pptx,.ppt,.docx,.doc"
              onChange={handleFileSelect}
              className="hidden"
            />

            {selectedFile && !job && (
              <Button
                onClick={handleAnalyze}
                disabled={isUploading}
                className="w-full h-12 text-base font-medium rounded-xl bg-purple-600 hover:bg-purple-700 mt-4"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Wird hochgeladen...
                  </>
                ) : (
                  <>
                    <Users className="w-5 h-5 mr-2" />
                    Gegen Personas prüfen
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Progress Section */}
        {job && job.status !== "completed" && job.status !== "failed" && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden mb-6">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-semibold text-slate-900">Analyse läuft</h3>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                  {job.currentStage}
                </div>
              </div>

              {/* Stage Progress */}
              <div className="space-y-3">
                {STAGES.map((stage, index) => {
                  const currentIndex = getStageIndex(job.status);
                  const isComplete = index < currentIndex;
                  const isCurrent = index === currentIndex;
                  const isPending = index > currentIndex;

                  return (
                    <div key={stage.key} className="flex items-center gap-3">
                      <div className={`
                        w-8 h-8 rounded-full flex items-center justify-center shrink-0
                        ${isComplete ? "bg-green-100 text-green-600" :
                          isCurrent ? "bg-purple-100 text-purple-600" :
                          "bg-slate-100 text-slate-400"}
                      `}>
                        {isComplete ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : isCurrent ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <span className="text-sm font-medium">{index + 1}</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className={`font-medium ${isPending ? "text-slate-400" : "text-slate-900"}`}>
                          {stage.label}
                        </p>
                        <p className={`text-sm ${isPending ? "text-slate-300" : "text-slate-500"}`}>
                          {stage.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Progress Bar */}
              <div className="mt-6">
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full transition-all duration-500"
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
                <p className="text-sm text-slate-500 mt-2 text-center">
                  {job.progress}% abgeschlossen
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error State */}
        {job?.status === "failed" && (
          <div className="bg-red-50 rounded-2xl border border-red-200 overflow-hidden mb-6">
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 mb-2">Analyse fehlgeschlagen</h3>
                  <p className="text-sm text-slate-600 mb-4">
                    {job.error || "Ein unbekannter Fehler ist aufgetreten."}
                  </p>
                  <Button
                    onClick={clearFile}
                    variant="outline"
                    className="h-10 rounded-lg"
                  >
                    Erneut versuchen
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Results Section */}
        {job?.status === "completed" && job.report && (
          <>
            {/* Summary */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden mb-6">
              <div className="p-6">
                <h3 className="font-semibold text-slate-900 mb-4">Zusammenfassung</h3>

                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-green-50 rounded-xl p-4 text-center">
                    <p className="text-3xl font-bold text-green-700">{job.report.summary.accessible}</p>
                    <p className="text-sm text-green-600">Zugänglich</p>
                  </div>
                  <div className="bg-amber-50 rounded-xl p-4 text-center">
                    <p className="text-3xl font-bold text-amber-700">{job.report.summary.limited}</p>
                    <p className="text-sm text-amber-600">Eingeschränkt</p>
                  </div>
                  <div className="bg-red-50 rounded-xl p-4 text-center">
                    <p className="text-3xl font-bold text-red-700">{job.report.summary.blocked}</p>
                    <p className="text-sm text-red-600">Blockiert</p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm text-slate-600 bg-slate-50 rounded-xl p-4">
                  <div className="flex items-center gap-4">
                    <span>{job.report.document_stats.page_count} Seiten</span>
                    <span>{job.report.document_stats.word_count.toLocaleString()} Wörter</span>
                    <span>{job.report.document_stats.image_count} Bilder</span>
                  </div>
                  <div className="font-medium">
                    {job.report.summary.accessibility_percentage}% Zugänglichkeit
                  </div>
                </div>
              </div>
            </div>

            {/* Persona Cards */}
            <div className="space-y-3 mb-6">
              <h3 className="font-semibold text-slate-900 px-1">7 Personas</h3>

              {job.report.personas.map((persona) => {
                const colors = STATUS_COLORS[persona.status];
                const isExpanded = expandedPersona === persona.id;

                return (
                  <div
                    key={persona.id}
                    className={`bg-white rounded-xl border ${colors.border} overflow-hidden`}
                  >
                    <button
                      onClick={() => togglePersona(persona.id)}
                      className="w-full p-4 flex items-center gap-4 text-left hover:bg-slate-50 transition-colors"
                    >
                      <div className="text-3xl">{persona.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-slate-900">{persona.name}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                            {STATUS_LABELS[persona.status]}
                          </span>
                        </div>
                        <p className="text-sm text-slate-500 truncate">{persona.core_limitation}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {persona.critical_issues > 0 && (
                          <span className="flex items-center gap-1 text-sm text-red-600">
                            <XCircle className="w-4 h-4" />
                            {persona.critical_issues}
                          </span>
                        )}
                        {persona.warning_issues > 0 && (
                          <span className="flex items-center gap-1 text-sm text-amber-600">
                            <AlertTriangle className="w-4 h-4" />
                            {persona.warning_issues}
                          </span>
                        )}
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-slate-400" />
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-slate-100">
                        <p className="text-sm text-slate-600 my-4">{persona.description}</p>

                        {persona.issues.length > 0 ? (
                          <div className="space-y-2">
                            {persona.issues.map((issue, idx) => (
                              <div
                                key={idx}
                                className={`p-3 rounded-lg ${
                                  issue.severity === "critical" ? "bg-red-50" :
                                  issue.severity === "warning" ? "bg-amber-50" :
                                  "bg-slate-50"
                                }`}
                              >
                                <div className="flex items-start gap-2">
                                  {issue.severity === "critical" ? (
                                    <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                                  ) : issue.severity === "warning" ? (
                                    <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                                  ) : (
                                    <Info className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                                  )}
                                  <div>
                                    <p className="text-sm font-medium text-slate-800">{issue.description}</p>
                                    {issue.persona_impact && (
                                      <p className="text-xs text-slate-500 mt-1">{issue.persona_impact}</p>
                                    )}
                                    <p className="text-xs text-slate-600 mt-2">
                                      <span className="font-medium">Empfehlung:</span> {issue.recommendation}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}

                            {/* Action Buttons */}
                            <div className="flex flex-col sm:flex-row gap-2 mt-3">
                              {/* Fix in PPTX Button - only for PPTX files with critical issues */}
                              {persona.critical_issues > 0 &&
                               selectedFile?.name.toLowerCase().match(/\.pptx?$/) && (
                                <Button
                                  onClick={() => handleFixCriticalIssues(persona.id)}
                                  disabled={isFixingPptx}
                                  size="sm"
                                  className="flex-1 gap-2 bg-purple-600 hover:bg-purple-700 text-white"
                                >
                                  {isFixingPptx && fixingPersonaId === persona.id ? (
                                    <>
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                      Wird korrigiert...
                                    </>
                                  ) : (
                                    <>
                                      <Wrench className="w-4 h-4" />
                                      In PPTX korrigieren
                                    </>
                                  )}
                                </Button>
                              )}

                              {/* Optimize Text Button */}
                              <Button
                                onClick={() => handleOptimizeText(persona.id)}
                                variant="outline"
                                size="sm"
                                className="flex-1 gap-2 border-purple-200 text-purple-700 hover:bg-purple-50"
                              >
                                <Wand2 className="w-4 h-4" />
                                Text optimieren
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                            <p className="text-sm text-green-700">
                              Keine kritischen Barrieren für diese Persona gefunden.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Recommendations */}
            {job.report.recommendations.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden mb-6">
                <div className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Lightbulb className="w-5 h-5 text-amber-500" />
                    <h3 className="font-semibold text-slate-900">Priorisierte Empfehlungen</h3>
                  </div>

                  <div className="space-y-3">
                    {job.report.recommendations.slice(0, 5).map((rec, idx) => (
                      <div key={idx} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                        <div className={`
                          w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold
                          ${idx === 0 ? "bg-purple-600 text-white" : "bg-slate-200 text-slate-600"}
                        `}>
                          {idx + 1}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-800">{rec.action}</p>
                          <p className="text-xs text-slate-500 mt-1">{rec.issue}</p>
                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-xs text-purple-600">
                              Hilft {rec.impact} Persona{rec.impact !== 1 ? "s" : ""}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              rec.effort === "niedrig" ? "bg-green-100 text-green-700" :
                              rec.effort === "mittel" ? "bg-amber-100 text-amber-700" :
                              "bg-red-100 text-red-700"
                            }`}>
                              Aufwand: {rec.effort}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* New Analysis Button */}
            <Button
              onClick={clearFile}
              variant="outline"
              className="w-full h-12 text-base font-medium rounded-xl"
            >
              Neues Dokument analysieren
            </Button>
          </>
        )}

        {/* Custom Personas Section - only show when no file is selected */}
        {!job && !selectedFile && (
          <>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/50 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-purple-600" />
                  <h3 className="font-semibold text-slate-900">Eigene Personas</h3>
                </div>
                <Button
                  onClick={() => setShowCustomPersonaDialog(true)}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Persona erstellen
                </Button>
              </div>

              {customPersonas.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Erstellen Sie eigene Personas für spezifische Zielgruppen Ihrer Organisation.
                </p>
              ) : (
                <div className="space-y-2">
                  {customPersonas.map((persona) => (
                    <div
                      key={persona.id}
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{persona.icon}</span>
                        <div>
                          <p className="font-medium text-slate-900">{persona.name} ({persona.age})</p>
                          <p className="text-sm text-slate-500">{persona.core_limitation}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteCustomPersona(persona.id)}
                        className="text-slate-400 hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Custom Persona Dialog */}
        {showCustomPersonaDialog && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-slate-900">Eigene Persona erstellen</h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowCustomPersonaDialog(false)}
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                {/* Icon Selection */}
                <div>
                  <span id="persona-icon-label" className="block text-sm font-medium text-slate-700 mb-2">Icon</span>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="persona-icon-label">
                    {EMOJI_OPTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => setNewPersona({ ...newPersona, icon: emoji })}
                        role="radio"
                        aria-checked={newPersona.icon === emoji}
                        aria-label={`Icon ${emoji}`}
                        className={`w-10 h-10 text-xl rounded-lg flex items-center justify-center transition-all ${
                          newPersona.icon === emoji
                            ? "bg-purple-100 ring-2 ring-purple-500"
                            : "bg-slate-100 hover:bg-slate-200"
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Name & Age */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="persona-name" className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                    <input
                      id="persona-name"
                      type="text"
                      value={newPersona.name}
                      onChange={(e) => setNewPersona({ ...newPersona, name: e.target.value })}
                      placeholder="z.B. Maria"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label htmlFor="persona-age" className="block text-sm font-medium text-slate-700 mb-1">Alter</label>
                    <input
                      id="persona-age"
                      type="number"
                      value={newPersona.age}
                      onChange={(e) => setNewPersona({ ...newPersona, age: parseInt(e.target.value) || 40 })}
                      min={1}
                      max={120}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label htmlFor="persona-description" className="block text-sm font-medium text-slate-700 mb-1">Kurzbeschreibung</label>
                  <input
                    id="persona-description"
                    type="text"
                    value={newPersona.description}
                    onChange={(e) => setNewPersona({ ...newPersona, description: e.target.value })}
                    placeholder="z.B. Alleinerziehend mit Migrationshintergrund"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                {/* Core Limitation */}
                <div>
                  <label htmlFor="persona-limitation" className="block text-sm font-medium text-slate-700 mb-1">Haupteinschränkung</label>
                  <textarea
                    id="persona-limitation"
                    value={newPersona.core_limitation}
                    onChange={(e) => setNewPersona({ ...newPersona, core_limitation: e.target.value })}
                    placeholder="z.B. Wenig Zeit, liest nur am Smartphone, Deutsch als Zweitsprache"
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                  />
                </div>

                {/* Test Selection */}
                <div>
                  <span id="persona-tests-label" className="block text-sm font-medium text-slate-700 mb-2">
                    Relevante Tests ({newPersona.relevant_tests.length} ausgewählt)
                  </span>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 bg-slate-50 rounded-lg" role="group" aria-labelledby="persona-tests-label">
                    {availableTests.map((test) => (
                      <button
                        key={test.id}
                        onClick={() => toggleTestSelection(test.id)}
                        className={`p-2 text-left rounded-lg text-sm transition-all ${
                          newPersona.relevant_tests.includes(test.id)
                            ? "bg-purple-100 text-purple-800 ring-1 ring-purple-300"
                            : "bg-white hover:bg-slate-100 text-slate-700"
                        }`}
                      >
                        <p className="font-medium">{test.name}</p>
                        <p className="text-xs opacity-70">{test.description}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setShowCustomPersonaDialog(false)}
                >
                  Abbrechen
                </Button>
                <Button
                  onClick={handleCreateCustomPersona}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  Persona erstellen
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Text Optimization Modal */}
        {showOptimizeModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                      <Wand2 className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-slate-900">Text optimieren</h2>
                      <p className="text-sm text-slate-500">
                        Für {optimizedResult?.persona_name || "Persona"}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setShowOptimizeModal(false);
                      setOptimizedResult(null);
                      setOptimizeError(null);
                    }}
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                {!optimizedResult?.optimized_text ? (
                  <>
                    {/* Input Text Area */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Text eingeben oder einfügen
                      </label>
                      <textarea
                        id="optimize-input"
                        placeholder="Fügen Sie hier den Text ein, der optimiert werden soll..."
                        rows={8}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none text-sm"
                        defaultValue={optimizedResult?.original_text || ""}
                      />
                    </div>

                    {optimizeError && (
                      <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                        {optimizeError}
                      </div>
                    )}

                    <Button
                      onClick={() => {
                        const textarea = document.getElementById("optimize-input") as HTMLTextAreaElement;
                        if (textarea?.value) {
                          handleRunOptimization(textarea.value);
                        }
                      }}
                      disabled={isOptimizing}
                      className="w-full h-12 bg-purple-600 hover:bg-purple-700 text-base font-medium rounded-xl"
                    >
                      {isOptimizing ? (
                        <>
                          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                          Text wird optimiert...
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-5 h-5 mr-2" />
                          Text optimieren
                        </>
                      )}
                    </Button>
                  </>
                ) : (
                  <>
                    {/* Optimization Result */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-slate-700">
                          Optimierter Text
                        </label>
                        <Button
                          onClick={handleCopyOptimizedText}
                          variant="ghost"
                          size="sm"
                          className="gap-2 text-purple-600 hover:text-purple-700"
                        >
                          {copiedText ? (
                            <>
                              <Check className="w-4 h-4" />
                              Kopiert!
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4" />
                              Kopieren
                            </>
                          )}
                        </Button>
                      </div>
                      <div className="p-4 bg-purple-50 border border-purple-100 rounded-xl">
                        <p className="text-sm text-slate-800 whitespace-pre-wrap">
                          {optimizedResult.optimized_text}
                        </p>
                      </div>
                    </div>

                    {/* Optimization Notes */}
                    {optimizedResult.optimization_notes.length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Anpassungen
                        </label>
                        <div className="space-y-1">
                          {optimizedResult.optimization_notes.map((note, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-sm text-slate-600">
                              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                              {note}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Original Text (collapsed) */}
                    <details className="group">
                      <summary className="cursor-pointer text-sm font-medium text-slate-500 hover:text-slate-700">
                        Original anzeigen
                      </summary>
                      <div className="mt-2 p-4 bg-slate-50 rounded-xl">
                        <p className="text-sm text-slate-600 whitespace-pre-wrap">
                          {optimizedResult.original_text}
                        </p>
                      </div>
                    </details>

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                      <Button
                        onClick={() => {
                          setOptimizedResult({
                            ...optimizedResult,
                            optimized_text: "",
                            original_text: "",
                            optimization_notes: [],
                          });
                        }}
                        variant="outline"
                        className="flex-1 h-11 rounded-xl"
                      >
                        Neuen Text optimieren
                      </Button>
                      <Button
                        onClick={() => {
                          setShowOptimizeModal(false);
                          setOptimizedResult(null);
                        }}
                        className="flex-1 h-11 bg-purple-600 hover:bg-purple-700 rounded-xl"
                      >
                        Fertig
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

    </PageLayout>
  );
}
