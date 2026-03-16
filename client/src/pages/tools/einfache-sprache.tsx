import { useState, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import { CreditEstimate } from "@/components/CreditEstimate";
import {
  Type, Search, Loader2, Copy, FileText, FileDown, Upload, X,
  AlertTriangle, CheckCircle2, ArrowRight, Crown, Info, Sparkles, Filter, Columns
} from "lucide-react";
import * as mammoth from "mammoth/mammoth.browser";
import { diffWords } from "diff";
import { Document, Packer, Paragraph, TextRun } from "docx";

// Limits:
// - Free: keep conservative character cap for analysis; simplify is demo-limited separately (500 chars).
// - Paid (Pro/Premium): allow up to 10,000 words per request.
const FREE_MAX_CHARS = 10_000;
const PAID_MAX_WORDS = 10_000;
const PAID_MAX_CHARS = 300_000;
const EXAMPLE_TEXT = `Sehr geehrte Damen und Herren,

hiermit beantragen wir die Verlängerung der Frist zur Einreichung der Unterlagen, da die Beschaffung mehrerer Nachweise länger dauert als erwartet. Bitte berücksichtigen Sie, dass sich die relevanten Informationen auf mehrere Abteilungen verteilen und wir diese sorgfältig zusammenführen.

Die betroffene Person hat bereits alle erforderlichen Dokumente vorbereitet, jedoch fehlen noch die Bescheinigungen der letzten zwei Quartale. Wir bitten um Bestätigung, dass eine Nachreichung bis zum 15. des kommenden Monats möglich ist.

Mit freundlichen Grüßen
Max Mustermann`;

interface TextIssue {
  type: string;
  text: string;
  suggestion?: string;
}

interface TextStats {
  characters: number;
  words: number;
  sentences: number;
  avgWordsPerSentence: number;
  complexWords: number;
  passiveConstructions: number;
  genitiveConstructions: number;
  abbreviations: number;
  replaceableWords: number;
}

interface AnalysisResult {
  score: number;
  level: 'leicht' | 'mittel' | 'schwer';
  levelColor: 'green' | 'yellow' | 'red';
  issues: TextIssue[];
  stats: TextStats;
  suggestions: Array<{ original: string; replacement: string }>;
}

// Persona assessment from backend
interface PersonaAssessment {
  personaId: string;
  status: 'accessible' | 'limited' | 'blocked';
  matchScore: number;
  specificIssues: string[];
}

interface ApiResponse {
  analysis: AnalysisResult | null;
  simplified: string | null;
  personaChecks: PersonaAssessment[] | null;
  mode: string;
  requiresPremium?: boolean;
  error?: string;
  message?: string;
}

// Persona metadata for display
const PERSONA_METADATA: Record<string, { name: string; age: number; icon: string; description: string; limitation: string }> = {
  ingrid: {
    name: "Ingrid",
    age: 78,
    icon: "👵",
    description: "Sehbeeinträchtigung",
    limitation: "Altersbedingte Makuladegeneration, nutzt Bildschirmlupe"
  },
  mehmet: {
    name: "Mehmet",
    age: 34,
    icon: "👨",
    description: "Geflüchteter",
    limitation: "Deutsch B1, komplexe PTBS, Smartphone als Hauptgerät"
  },
  fatima: {
    name: "Fatima",
    age: 29,
    icon: "👩",
    description: "Analphabetin",
    limitation: "Keine formale Schulbildung, Deutsch A2 mündlich"
  },
  thomas: {
    name: "Thomas",
    age: 42,
    icon: "👨‍💼",
    description: "ADHS & Legasthenie",
    limitation: "Braucht klare Struktur und visuelle Anker"
  },
  aisha: {
    name: "Aisha",
    age: 67,
    icon: "👵",
    description: "Gehörlos",
    limitation: "DGS als Muttersprache, Schriftdeutsch ist Zweitsprache"
  },
  sandra: {
    name: "Sandra",
    age: 35,
    icon: "👩‍👧",
    description: "Alleinerziehend",
    limitation: "Chronischer Zeitmangel, füllt Formulare abends am Handy aus"
  },
  viktor: {
    name: "Viktor",
    age: 52,
    icon: "👨‍🦳",
    description: "Farbenblind & Depression",
    limitation: "Rot-Grün-Schwäche, mittelschwere Depression"
  },
};

export default function EinfacheSprache() {
  const { toast } = useToast();
  const { user, isAuthenticated, openUpgradeModal } = useAuth();

  const [inputText, setInputText] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [simplifiedText, setSimplifiedText] = useState<string | null>(null);
  const [personaChecks, setPersonaChecks] = useState<PersonaAssessment[] | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSimplifying, setIsSimplifying] = useState(false);
  const [isParsingDoc, setIsParsingDoc] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [issueFilters, setIssueFilters] = useState<string[]>([]);
  const [showAllIssues, setShowAllIssues] = useState(false);
  const [showDiff, setShowDiff] = useState(true);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isPremium = user?.subscription !== "free";
  const wordCount = useMemo(() => {
    const t = inputText.trim();
    if (!t) return 0;
    // Use a simple whitespace split; the input is capped and this stays fast enough.
    return t.split(/\s+/).filter(Boolean).length;
  }, [inputText]);

  const maxChars = isPremium ? PAID_MAX_CHARS : FREE_MAX_CHARS;
  const isOverLimit = isPremium
    ? (wordCount > PAID_MAX_WORDS || inputText.length > PAID_MAX_CHARS)
    : inputText.length > FREE_MAX_CHARS;

  const limitLabel = isPremium
    ? `${wordCount.toLocaleString('de-DE')} / ${PAID_MAX_WORDS.toLocaleString('de-DE')} Wörter`
    : `${inputText.length.toLocaleString('de-DE')} / ${FREE_MAX_CHARS.toLocaleString('de-DE')} Zeichen`;
  const overLimitSrText = isPremium ? 'Wörterlimit überschritten' : 'Zeichenlimit überschritten';

  const availableIssueTypes = useMemo(() => {
    if (!analysis?.issues?.length) return [];
    return Array.from(new Set(analysis.issues.map((issue) => issue.type)));
  }, [analysis]);

  const activeIssueTypes = useMemo(() => {
    if (!availableIssueTypes.length) return [];
    return issueFilters.length ? issueFilters : availableIssueTypes;
  }, [availableIssueTypes, issueFilters]);

  const groupedIssues = useMemo(() => {
    if (!analysis?.issues?.length) return {};
    return analysis.issues.reduce<Record<string, TextIssue[]>>((groups, issue) => {
      if (!activeIssueTypes.includes(issue.type)) return groups;
      if (!groups[issue.type]) groups[issue.type] = [];
      groups[issue.type].push(issue);
      return groups;
    }, {});
  }, [analysis, activeIssueTypes]);

  const issueTypeCounts = useMemo(() => {
    if (!analysis?.issues?.length) return {};
    return analysis.issues.reduce<Record<string, number>>((counts, issue) => {
      counts[issue.type] = (counts[issue.type] || 0) + 1;
      return counts;
    }, {});
  }, [analysis]);

  const diff = useMemo(() => {
    if (!simplifiedText) return [];
    return diffWords(inputText, simplifiedText);
  }, [inputText, simplifiedText]);

  const handleAnalyze = async () => {
    if (!inputText.trim()) {
      toast({
        title: "Text erforderlich",
        description: "Bitte geben Sie einen Text ein.",
        variant: "destructive",
      });
      return;
    }

    if (!isAuthenticated) {
      toast({
        title: "Anmeldung erforderlich",
        description: "Bitte melden Sie sich an, um diese Funktion zu nutzen.",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);
    setAnalysis(null);
    setPersonaChecks(null);

    try {
      const response = await fetch("/api/simplify-text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: inputText,
          mode: "analyze",
        }),
      });

      const data: ApiResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || "Analyse fehlgeschlagen");
      }

      setAnalysis(data.analysis);
      setPersonaChecks(data.personaChecks);

      toast({
        title: "Analyse abgeschlossen",
        description: `Verständlichkeits-Score: ${data.analysis?.score}/100`,
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: error instanceof Error ? error.message : "Analyse fehlgeschlagen",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSimplify = async () => {
    if (!inputText.trim()) {
      toast({
        title: "Text erforderlich",
        description: "Bitte geben Sie einen Text ein.",
        variant: "destructive",
      });
      return;
    }

    if (!isAuthenticated) {
      toast({
        title: "Anmeldung erforderlich",
        description: "Bitte melden Sie sich an, um diese Funktion zu nutzen.",
        variant: "destructive",
      });
      return;
    }

    if (!isPremium && inputText.length > 500) {
      toast({
        title: "Free-Demo Limit",
        description: "Im Free-Plan können Sie bis zu 500 Zeichen vereinfachen. Für mehr: Upgrade auf Pro.",
        variant: "destructive",
      });
      openUpgradeModal('simplify');
      return;
    }

    setIsSimplifying(true);
    setSimplifiedText(null);
    setPersonaChecks(null);

    try {
      const response = await fetch("/api/simplify-text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: inputText,
          mode: "both",
        }),
      });

      const data: ApiResponse = await response.json();

      if (!response.ok) {
        if (response.status === 403 && (data as any)?.requiredMinPlan === 'pro') {
          openUpgradeModal('simplify');
          return;
        }
        throw new Error(data.message || data.error || "Vereinfachung fehlgeschlagen");
      }

      setAnalysis(data.analysis);
      setSimplifiedText(data.simplified);
      setPersonaChecks(data.personaChecks);

      toast({
        title: "Vereinfachung abgeschlossen",
        description: "Der Text wurde in Einfache Sprache umgewandelt.",
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: error instanceof Error ? error.message : "Vereinfachung fehlgeschlagen",
        variant: "destructive",
      });
    } finally {
      setIsSimplifying(false);
    }
  };

  const handleLoadExample = () => {
    setInputText(EXAMPLE_TEXT);
    setAnalysis(null);
    setSimplifiedText(null);
    setPersonaChecks(null);
    setUploadedFileName(null);
  };

  const handleClear = () => {
    setInputText("");
    setAnalysis(null);
    setSimplifiedText(null);
    setPersonaChecks(null);
    setUploadedFileName(null);
  };

  const handleDocUpload = async (file: File) => {
    if (!file) return;
    const isDocx = file.name.toLowerCase().endsWith(".docx") ||
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (!isDocx) {
      toast({
        title: "Nur DOCX unterstützt",
        description: "Bitte eine Word-Datei im DOCX-Format hochladen.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Datei zu groß",
        description: "Bitte eine DOCX-Datei unter 5 MB hochladen.",
        variant: "destructive",
      });
      return;
    }

    setIsParsingDoc(true);
    setUploadedFileName(file.name);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      const text = (result.value || "").trim();
      if (!text) {
        throw new Error("Kein auslesbarer Text gefunden");
      }
      setInputText(text);
      setAnalysis(null);
      setSimplifiedText(null);
      setPersonaChecks(null);
      if (result.messages?.length) {
        toast({
          title: "Hinweis",
          description: "Einige Formatierungen konnten nicht übernommen werden.",
        });
      }
    } catch (error) {
      toast({
        title: "Import fehlgeschlagen",
        description: error instanceof Error ? error.message : "DOCX konnte nicht gelesen werden.",
        variant: "destructive",
      });
      setUploadedFileName(null);
    } finally {
      setIsParsingDoc(false);
    }
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({
      title: "Kopiert",
      description: "Text wurde in die Zwischenablage kopiert.",
    });
  };

  const handleExportTxt = () => {
    if (!simplifiedText) return;
    const blob = new Blob([simplifiedText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "einfache-sprache.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportDocx = () => {
    if (!simplifiedText) return;
    const paragraphs = simplifiedText.split("\n").map((line) => new Paragraph({
      children: [new TextRun(line || " ")],
    }));
    const doc = new Document({
      sections: [{ properties: {}, children: paragraphs }],
    });
    Packer.toBlob(doc)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "einfache-sprache.docx";
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => {
        toast({
          title: "Export fehlgeschlagen",
          description: "DOCX konnte nicht erstellt werden.",
          variant: "destructive",
        });
      });
  };

  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const applySuggestion = (original: string, replacement: string) => {
    if (!original || !replacement) return;
    setInputText((prev) => {
      const escaped = escapeRegExp(original);
      const pattern = new RegExp(`\\b${escaped}\\b`, "gi");
      if (pattern.test(prev)) {
        return prev.replace(pattern, replacement);
      }
      return prev.split(original).join(replacement);
    });
    toast({
      title: "Vorschlag angewendet",
      description: `„${original}“ → „${replacement}“`,
    });
  };

  const handleApplyAllSuggestions = () => {
    if (!analysis?.suggestions?.length) return;
    setInputText((prev) => {
      return analysis.suggestions.reduce((text, suggestion) => {
        const escaped = escapeRegExp(suggestion.original);
        const pattern = new RegExp(`\\b${escaped}\\b`, "gi");
        if (pattern.test(text)) {
          return text.replace(pattern, suggestion.replacement);
        }
        return text.split(suggestion.original).join(suggestion.replacement);
      }, prev);
    });
    toast({
      title: "Vorschläge angewendet",
      description: `${analysis.suggestions.length} Ersetzungen übernommen.`,
    });
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const renderOriginalDiff = () => (
    diff.map((part, idx) => {
      if (part.added) return null;
      return (
        <span
          key={`orig-${idx}`}
          className={part.removed ? "bg-red-100 line-through px-0.5" : ""}
        >
          {part.value}
        </span>
      );
    })
  );

  const renderSimplifiedDiff = () => (
    diff.map((part, idx) => {
      if (part.removed) return null;
      return (
        <span
          key={`simp-${idx}`}
          className={part.added ? "bg-green-200 px-0.5" : ""}
        >
          {part.value}
        </span>
      );
    })
  );

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 50) return "text-amber-600";
    return "text-red-600";
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return "bg-green-50 border-green-200";
    if (score >= 50) return "bg-amber-50 border-amber-200";
    return "bg-red-50 border-red-200";
  };

  const getIssueIcon = (type: string) => {
    switch (type) {
      case 'long_sentence':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'complex_word':
        return <AlertTriangle className="w-4 h-4 text-orange-500" />;
      case 'passive_voice':
        return <AlertTriangle className="w-4 h-4 text-purple-500" />;
      case 'replaceable_word':
        return <ArrowRight className="w-4 h-4 text-blue-500" />;
      default:
        return <Info className="w-4 h-4 text-slate-600" />;
    }
  };

  const getIssueLabel = (type: string) => {
    switch (type) {
      case 'long_sentence': return 'Langer Satz';
      case 'complex_word': return 'Komplexes Wort';
      case 'passive_voice': return 'Passiv';
      case 'genitive_case': return 'Genitiv';
      case 'abbreviation': return 'Abkürzung';
      case 'replaceable_word': return 'Ersetzbar';
      default: return type;
    }
  };

  return (
    <PageLayout>
      <SEO
        title="Einfache Sprache - VoxDrop"
        description="Wandeln Sie komplexe Texte in Einfache Sprache um. Textanalyse mit Verständlichkeits-Score und KI-gestützte Vereinfachung."
      />

      {/* Hero Section */}
      <header className="pt-12 pb-8 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
            <Type className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight mb-4">
            Einfache Sprache
          </h1>
          <p className="text-lg text-slate-600 font-light max-w-2xl mx-auto">
            Komplexe Texte analysieren und in verständliche Sprache umwandeln
          </p>
        </div>
      </header>

      <main id="main-content" className="max-w-4xl mx-auto px-6 pb-24" tabIndex={-1}>
        {/* Side-by-side Layout: Input | Funktionen */}
        {!analysis && !simplifiedText && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">
            {/* Input Section */}
            <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <label htmlFor="input-text" className="text-sm font-medium text-slate-700">
                    Originaltext
                  </label>
                  <span
                    id="input-text-hint"
                    className={`text-sm ${isOverLimit ? 'text-red-600' : 'text-slate-400'}`}
                    aria-live="polite"
                  >
                    {limitLabel}
                    {isOverLimit && <span className="sr-only">, {overLimitSrText}</span>}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 px-3 text-sm rounded-lg"
                    onClick={handleLoadExample}
                  >
                    Beispiel laden
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 px-3 text-sm rounded-lg"
                    onClick={handleClear}
                    disabled={!inputText}
                  >
                    <X className="w-4 h-4 mr-1" />
                    Leeren
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleDocUpload(file);
                      e.currentTarget.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 px-3 text-sm rounded-lg"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isParsingDoc}
                  >
                    {isParsingDoc ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Importiere...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        DOCX hochladen
                      </>
                    )}
                  </Button>
                  {uploadedFileName && (
                    <span className="text-xs text-slate-500">
                      Datei: {uploadedFileName}
                    </span>
                  )}
                </div>
                <Textarea
                  id="input-text"
                  placeholder="Fügen Sie hier Ihren Text ein (z.B. einen Behördenbrief, Vertragstext oder Amtsschreiben)..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="min-h-[200px] resize-y text-base"
                  maxLength={maxChars + 100}
                  aria-describedby="input-text-hint"
                  aria-invalid={isOverLimit}
                />
                <p className="text-xs text-slate-500 mt-2">
                  Hinweis: Bitte keine vertraulichen Daten. Der Text wird ausschließlich zur Analyse und Vereinfachung verarbeitet.
                </p>

                <p className="text-xs text-slate-500 mt-3 text-center">
                  Analyse ist kostenlos • Vereinfachung nutzt Credits (Free-Demo: bis 500 Zeichen)
                </p>

                <div className="mt-3">
                  <CreditEstimate
                    costKey="SIMPLE_LANG_1K"
                    quantity={Math.ceil(inputText.length / 1000)}
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-3 mt-3">
                  <Button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing || isSimplifying || !inputText.trim() || isOverLimit}
                    variant="outline"
                    className="flex-1 h-12 text-base font-medium rounded-xl"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Analysiere...
                      </>
                    ) : (
                      <>
                        <Search className="w-5 h-5 mr-2" />
                        Text analysieren
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={handleSimplify}
                    disabled={isAnalyzing || isSimplifying || !inputText.trim() || isOverLimit}
                    className="flex-1 h-12 text-base font-medium rounded-xl bg-green-600 hover:bg-green-700"
                  >
                    {isSimplifying ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Vereinfache...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5 mr-2" />
                        In Einfache Sprache
                        {!isPremium && inputText.length > 500 && <Crown className="w-4 h-4 ml-2 text-amber-300" />}
                      </>
                    )}
                  </Button>
                </div>

                {!isPremium && (
                  <p className="text-sm text-slate-600 mt-3 text-center">
                    <Crown className="w-4 h-4 inline mr-1 text-amber-500" />
                    Free-Demo bis 500 Zeichen.{" "}
                    <button onClick={() => openUpgradeModal('simplify')} className="text-violet-600 hover:underline">
                      Upgrade auf Pro
                    </button>
                  </p>
                )}
              </div>
            </div>

            {/* Funktionen Card - Side by Side */}
            <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
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
                    Erkennt komplexe Wörter und lange Sätze
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Vorschläge für einfachere Formulierungen
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    KI-Vereinfachung nach Leichte-Sprache-Regeln
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Persona-Check für 7 Nutzergruppen
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Export als TXT oder DOCX
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Word-Upload (DOCX)
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Verständlichkeits-Score von 0-100
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Input Section - Full Width when analysis is shown */}
        {(analysis || simplifiedText) && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden mb-6">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <label htmlFor="input-text-full" className="text-sm font-medium text-slate-700">
                  Originaltext
                </label>
                <span
                  id="input-text-hint-full"
                  className={`text-sm ${isOverLimit ? 'text-red-600' : 'text-slate-400'}`}
                  aria-live="polite"
                >
                  {limitLabel}
                  {isOverLimit && <span className="sr-only">, {overLimitSrText}</span>}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 px-3 text-sm rounded-lg"
                  onClick={handleLoadExample}
                >
                  Beispiel laden
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 px-3 text-sm rounded-lg"
                  onClick={handleClear}
                  disabled={!inputText}
                >
                  <X className="w-4 h-4 mr-1" />
                  Leeren
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleDocUpload(file);
                    e.currentTarget.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 px-3 text-sm rounded-lg"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isParsingDoc}
                >
                  {isParsingDoc ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Importiere...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      DOCX hochladen
                    </>
                  )}
                </Button>
                {uploadedFileName && (
                  <span className="text-xs text-slate-500">
                    Datei: {uploadedFileName}
                  </span>
                )}
              </div>
              <Textarea
                id="input-text-full"
                placeholder="Fügen Sie hier Ihren Text ein (z.B. einen Behördenbrief, Vertragstext oder Amtsschreiben)..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="min-h-[200px] resize-y text-base"
                maxLength={maxChars + 100}
                aria-describedby="input-text-hint-full"
                aria-invalid={isOverLimit}
              />
              <p className="text-xs text-slate-500 mt-2">
                Hinweis: Bitte keine vertraulichen Daten. Der Text wird ausschließlich zur Analyse und Vereinfachung verarbeitet.
              </p>

              <p className="text-xs text-slate-500 mt-3 text-center">
                Analyse ist kostenlos • Vereinfachung ist Premium
              </p>

              <div className="flex flex-col sm:flex-row gap-3 mt-3">
                <Button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || isSimplifying || !inputText.trim() || isOverLimit}
                  variant="outline"
                  className="flex-1 h-12 text-base font-medium rounded-xl"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Analysiere...
                    </>
                  ) : (
                    <>
                      <Search className="w-5 h-5 mr-2" />
                      Text analysieren
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleSimplify}
                  disabled={isAnalyzing || isSimplifying || !inputText.trim() || isOverLimit}
                  className="flex-1 h-12 text-base font-medium rounded-xl bg-green-600 hover:bg-green-700"
                >
                  {isSimplifying ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Vereinfache...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 mr-2" />
                      In Einfache Sprache
                      {!isPremium && inputText.length > 500 && <Crown className="w-4 h-4 ml-2 text-amber-300" />}
                    </>
                  )}
                </Button>
              </div>

              {!isPremium && (
                <p className="text-sm text-slate-600 mt-3 text-center">
                  <Crown className="w-4 h-4 inline mr-1 text-amber-500" />
                  Free-Demo bis 500 Zeichen.{" "}
                  <button onClick={() => openUpgradeModal('simplify')} className="text-violet-600 hover:underline">
                    Upgrade auf Pro
                  </button>
                </p>
              )}
            </div>
          </div>
        )}

        {(analysis || simplifiedText) && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden mb-6">
            <div className="p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <Columns className="w-4 h-4 text-slate-500" />
                Schnellnavigation
              </div>
              <div className="flex flex-wrap gap-2">
                {analysis && (
                  <button
                    type="button"
                    onClick={() => scrollToSection("analysis-score")}
                    className="px-3 py-1.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
                  >
                    Score
                  </button>
                )}
                {analysis && analysis.issues.length > 0 && (
                  <button
                    type="button"
                    onClick={() => scrollToSection("analysis-issues")}
                    className="px-3 py-1.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
                  >
                    Probleme
                  </button>
                )}
                {personaChecks && personaChecks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => scrollToSection("analysis-personas")}
                    className="px-3 py-1.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
                  >
                    Personas
                  </button>
                )}
                {simplifiedText && (
                  <button
                    type="button"
                    onClick={() => scrollToSection("analysis-output")}
                    className="px-3 py-1.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
                  >
                    Ausgabe
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Analysis Results */}
        {analysis && (
          <div id="analysis-score" className="grid md:grid-cols-3 gap-6 mb-6 scroll-mt-24">
            {/* Score Card */}
            <div className={`bg-white rounded-2xl shadow-sm border overflow-hidden ${getScoreBg(analysis.score)}`}>
              <div className="p-6 text-center">
                <p className="text-sm font-medium text-slate-600 mb-2">Verständlichkeit</p>
                <div className={`text-5xl font-bold ${getScoreColor(analysis.score)}`}>
                  {analysis.score}
                </div>
                <p className="text-sm text-slate-600 mt-1">von 100</p>
                <div className={`inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full text-sm font-medium ${
                  analysis.level === 'leicht' ? 'bg-green-100 text-green-700' :
                  analysis.level === 'mittel' ? 'bg-amber-100 text-amber-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {analysis.level === 'leicht' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  {analysis.level.charAt(0).toUpperCase() + analysis.level.slice(1)}
                </div>
              </div>
            </div>

            {/* Stats Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden md:col-span-2">
              <div className="p-6">
                <p className="text-sm font-medium text-slate-700 mb-4">Statistiken</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-2xl font-semibold text-slate-900">{analysis.stats.sentences}</p>
                    <p className="text-sm text-slate-600">Sätze</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-slate-900">{analysis.stats.avgWordsPerSentence}</p>
                    <p className="text-sm text-slate-600">Wörter/Satz</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-slate-900">{analysis.stats.complexWords}</p>
                    <p className="text-sm text-slate-600">Komplexe Wörter</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-slate-900">{analysis.stats.passiveConstructions}</p>
                    <p className="text-sm text-slate-600">Passiv-Sätze</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Issues List */}
        {analysis && analysis.issues.length > 0 && (
          <div id="analysis-issues" className="bg-white rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden mb-6 scroll-mt-24">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-slate-500" />
                  <p className="text-sm font-medium text-slate-700">
                    Gefundene Probleme ({analysis.issues.length})
                  </p>
                </div>
                {analysis.suggestions?.length ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 px-3 text-sm rounded-lg"
                    onClick={handleApplyAllSuggestions}
                  >
                    Alle Vorschläge anwenden
                  </Button>
                ) : null}
              </div>
              {availableIssueTypes.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  <button
                    type="button"
                    onClick={() => setIssueFilters([])}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                      issueFilters.length === 0 ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    Alle
                  </button>
                  {availableIssueTypes.map((type) => {
                    const isActive = issueFilters.length === 0 ? false : issueFilters.includes(type);
                    return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setIssueFilters((prev) => (
                          prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
                        ));
                      }}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                        isActive ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      {getIssueLabel(type)} ({issueTypeCounts[type] || 0})
                    </button>
                  );
                  })}
                </div>
              )}

              <div className="space-y-4 max-h-[360px] overflow-y-auto">
                {Object.entries(groupedIssues).map(([type, issues]) => {
                  const visibleIssues = showAllIssues ? issues : issues.slice(0, 6);
                  return (
                    <div key={type} className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                        <span>{getIssueLabel(type)}</span>
                        <span className="text-slate-400">({issues.length})</span>
                      </div>
                      <div className="space-y-3">
                        {visibleIssues.map((issue, idx) => (
                          <div
                            key={`${type}-${idx}`}
                            className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl"
                          >
                            {getIssueIcon(issue.type)}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-700 break-words">
                                {issue.type === 'replaceable_word' ? (
                                  <>
                                    <span className="font-medium">„{issue.text}"</span>
                                    <ArrowRight className="w-3 h-3 inline mx-1" />
                                    <span className="text-green-600 font-medium">„{issue.suggestion}"</span>
                                  </>
                                ) : (
                                  <>
                                    <span className="font-medium">„{issue.text.slice(0, 100)}{issue.text.length > 100 ? '...' : ''}"</span>
                                    {issue.suggestion && (
                                      <span className="block text-slate-600 text-xs mt-1">{issue.suggestion}</span>
                                    )}
                                  </>
                                )}
                              </p>
                              {issue.type === 'replaceable_word' && issue.suggestion && (
                                <div className="mt-2">
                                  <button
                                    type="button"
                                    onClick={() => applySuggestion(issue.text, issue.suggestion || "")}
                                    className="text-xs font-medium text-violet-600 hover:underline"
                                  >
                                    Vorschlag anwenden
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {!Object.keys(groupedIssues).length && (
                  <p className="text-sm text-slate-600 text-center py-2">
                    Keine Probleme für die aktuelle Filterauswahl.
                  </p>
                )}
              </div>

              {analysis.issues.length > 6 && (
                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={() => setShowAllIssues((prev) => !prev)}
                    className="text-sm font-medium text-violet-600 hover:underline"
                  >
                    {showAllIssues ? "Weniger anzeigen" : "Alle anzeigen"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Persona Dashboard */}
        {personaChecks && personaChecks.length > 0 && (
          <div id="analysis-personas" className="bg-white rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden mb-6 scroll-mt-24">
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xl">👥</span>
                <p className="text-sm font-medium text-slate-700">Barrierefreiheit für verschiedene Nutzergruppen</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {personaChecks.map((check) => {
                  const persona = PERSONA_METADATA[check.personaId];
                  if (!persona) return null;
                  const statusLabel = check.status === 'accessible'
                    ? 'Zugänglich'
                    : check.status === 'limited'
                      ? 'Eingeschränkt'
                      : 'Blockiert';

                  return (
                    <div
                      key={check.personaId}
                      className={`p-4 rounded-xl border transition-all ${
                        check.status === 'accessible'
                          ? 'bg-green-50 border-green-200'
                          : check.status === 'limited'
                            ? 'bg-amber-50 border-amber-200'
                            : 'bg-red-50 border-red-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-2xl">{persona.icon}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-medium text-slate-600">{statusLabel}</span>
                          <div className={`w-2.5 h-2.5 rounded-full ${
                            check.status === 'accessible'
                              ? 'bg-green-500'
                              : check.status === 'limited'
                                ? 'bg-amber-500'
                                : 'bg-red-500'
                          }`} />
                        </div>
                      </div>
                      <h4 className="font-semibold text-slate-900 text-sm">{persona.name}, {persona.age}</h4>
                      <p className="text-xs text-slate-500 line-clamp-1">{persona.description}</p>

                      {/* Match Score Bar */}
                      <div className="mt-3 flex items-center gap-2">
                        <div className="flex-1 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${
                              check.matchScore >= 75
                                ? 'bg-green-500'
                                : check.matchScore >= 40
                                  ? 'bg-amber-500'
                                  : 'bg-red-500'
                            }`}
                            style={{ width: `${check.matchScore}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-slate-600 w-8">{check.matchScore}%</span>
                      </div>

                      {/* Specific Issues */}
                      {check.specificIssues.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-slate-200/50">
                          <p className="text-[10px] text-slate-500 line-clamp-2">
                            {check.specificIssues[0]}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                  <span className="text-xs text-slate-600">Zugänglich</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="text-xs text-slate-600">Eingeschränkt</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  <span className="text-xs text-slate-600">Blockiert</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Simplified Text Output */}
        {simplifiedText && (
          <div id="analysis-output" className="bg-white rounded-2xl shadow-sm border border-green-200 overflow-hidden scroll-mt-24">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <p className="text-sm font-medium text-slate-700">Vereinfachter Text</p>
                </div>
                <span className="text-sm text-slate-400">
                  {simplifiedText.length.toLocaleString('de-DE')} Zeichen
                </span>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <Button
                  type="button"
                  variant={showDiff ? "default" : "outline"}
                  className="h-8 px-3 text-xs rounded-lg"
                  onClick={() => setShowDiff(true)}
                >
                  <Columns className="w-3.5 h-3.5 mr-1" />
                  Vergleich
                </Button>
                <Button
                  type="button"
                  variant={!showDiff ? "default" : "outline"}
                  className="h-8 px-3 text-xs rounded-lg"
                  onClick={() => setShowDiff(false)}
                >
                  Nur Ergebnis
                </Button>
              </div>

              {showDiff ? (
                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  <div className="bg-slate-50 rounded-xl p-4 max-h-[400px] overflow-y-auto">
                    <p className="text-xs font-semibold text-slate-500 mb-2">Original</p>
                    <div className="whitespace-pre-wrap text-slate-800">
                      {renderOriginalDiff()}
                    </div>
                  </div>
                  <div className="bg-green-50 rounded-xl p-4 max-h-[400px] overflow-y-auto">
                    <p className="text-xs font-semibold text-slate-500 mb-2">Vereinfachung</p>
                    <div className="whitespace-pre-wrap text-slate-800">
                      {renderSimplifiedDiff()}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-green-50 rounded-xl p-4 mb-4 whitespace-pre-wrap text-slate-800 max-h-[400px] overflow-y-auto">
                  {simplifiedText}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => handleCopy(simplifiedText)}
                  variant="outline"
                  className="h-10 rounded-lg"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Kopieren
                </Button>
                <Button
                  onClick={handleExportTxt}
                  variant="outline"
                  className="h-10 rounded-lg"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  TXT
                </Button>
                <Button
                  onClick={handleExportDocx}
                  variant="outline"
                  className="h-10 rounded-lg"
                >
                  <FileDown className="w-4 h-4 mr-2" />
                  DOCX
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Im Behördenalltag */}
        <div className="mt-8 bg-white rounded-2xl p-8 shadow-sm border border-slate-200">
          <h3 className="font-semibold text-slate-900 mb-4 text-lg">Im Behördenalltag</h3>
          <div className="prose prose-gray max-w-none text-slate-600">
            <p className="mb-4">
              Nach der EU-Richtlinie 2016/2102 und dem Behindertengleichstellungsgesetz müssen öffentliche Stellen
              Informationen in verständlicher Sprache bereitstellen. Komplexe Behördentexte, Bescheide und Formulare
              schließen oft Menschen mit geringer Lesekompetenz, Migrationshintergrund oder kognitiven Einschränkungen aus.
            </p>
            <p className="mb-4">
              Einfache Sprache verwendet kurze Sätze, vermeidet Fachbegriffe und Passivkonstruktionen. So werden Texte
              für alle Menschen zugänglich - unabhängig von Bildungshintergrund, Deutschkenntnissen oder kognitiven Fähigkeiten.
            </p>
            <p>
              Dieses Tool analysiert Ihre Texte automatisch und kann sie mit KI-Unterstützung in verständliche Sprache
              umwandeln. Der integrierte Persona-Check zeigt, für welche Nutzergruppen der Text bereits geeignet ist.
            </p>
          </div>
        </div>
      </main>

    </PageLayout>
  );
}
