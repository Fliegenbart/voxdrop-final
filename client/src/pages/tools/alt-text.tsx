import { useState, useCallback, useRef } from "react";
import {
  Image,
  Upload,
  Copy,
  Check,
  AlertTriangle,
  RefreshCw,
  Trash2,
  X,
  FileJson,
  Code,
  FileText,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import { CreditEstimate } from "@/components/CreditEstimate";

// Types
type Length = "short" | "standard" | "detailed";

interface ImageFile {
  id: string;
  file: File;
  preview: string;
}

interface AltTextResult {
  filename: string;
  altText: string;
  characterCount: number;
  error?: string;
}

// Length presets
const LENGTH_OPTIONS: Array<{ value: Length; label: string; description: string; maxChars: number }> = [
  { value: "short", label: "Kurz", description: "Für Icons und einfache Grafiken", maxChars: 50 },
  { value: "standard", label: "Standard", description: "WCAG-konform für die meisten Bilder", maxChars: 150 },
  { value: "detailed", label: "Ausführlich", description: "Für komplexe Diagramme und Infografiken", maxChars: 400 },
];

// Main Component
export default function AltTextGenerator() {
  const { isAuthenticated } = useAuth();
  const [images, setImages] = useState<ImageFile[]>([]);
  const [results, setResults] = useState<AltTextResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [length, setLength] = useState<Length>("standard");
  const [context, setContext] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file selection
  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;

    const newImages: ImageFile[] = [];
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp", "image/bmp"];

    Array.from(files).slice(0, 5 - images.length).forEach((file) => {
      if (!allowedTypes.includes(file.type)) {
        setError(`${file.name}: Nur PNG, JPG, GIF, WEBP und BMP erlaubt`);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError(`${file.name}: Max. 10 MB pro Bild`);
        return;
      }

      newImages.push({
        id: `${Date.now()}-${Math.random()}`,
        file,
        preview: URL.createObjectURL(file),
      });
    });

    if (newImages.length > 0) {
      setImages((prev) => [...prev, ...newImages].slice(0, 5));
      setError(null);
    }
  }, [images.length]);

  // Remove image
  const removeImage = useCallback((id: string) => {
    setImages((prev) => {
      const img = prev.find((i) => i.id === id);
      if (img) URL.revokeObjectURL(img.preview);
      return prev.filter((i) => i.id !== id);
    });
    setResults([]);
  }, []);

  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  // Generate alt-texts
  const generateAltTexts = async () => {
    if (images.length === 0) return;

    setIsProcessing(true);
    setError(null);
    setResults([]);

    try {
      const formData = new FormData();
      images.forEach((img) => formData.append("images", img.file));
      formData.append("length", length);
      if (context.trim()) formData.append("context", context.trim());

      const response = await fetch("/api/generate-alt-text", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.message || "Fehler bei der Verarbeitung");
      }

      const data = await response.json();
      setResults(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setIsProcessing(false);
    }
  };

  // Copy to clipboard
  const copyToClipboard = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Export functions
  const exportJSON = () => {
    const data = results
      .filter((r) => !r.error)
      .map((r) => ({ filename: r.filename, altText: r.altText }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    downloadBlob(blob, "alt-texts.json");
  };

  const exportHTML = () => {
    const html = results
      .filter((r) => !r.error)
      .map((r) => `<img src="${r.filename}" alt="${escapeHtml(r.altText)}">`)
      .join("\n");
    const blob = new Blob([html], { type: "text/html" });
    downloadBlob(blob, "alt-texts.html");
  };

  const exportMarkdown = () => {
    const md = results
      .filter((r) => !r.error)
      .map((r) => `![${r.altText}](${r.filename})`)
      .join("\n");
    const blob = new Blob([md], { type: "text/markdown" });
    downloadBlob(blob, "alt-texts.md");
  };

  const copyAllToClipboard = async () => {
    const text = results
      .filter((r) => !r.error)
      .map((r) => `${r.filename}: ${r.altText}`)
      .join("\n\n");
    await navigator.clipboard.writeText(text);
    setCopiedIndex(-1);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const escapeHtml = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  // Get character limit for current length
  const charLimit = LENGTH_OPTIONS.find((o) => o.value === length)?.maxChars || 150;

  // Auth required check
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white flex flex-col">
        <SEO
          title="Alt-Text Generator"
          description="Generieren Sie barrierefreie Alternativtexte für Ihre Bilder mit KI. WCAG-konform auf Deutsch."
        />
        <div className="flex-1 py-16">
          <div className="max-w-2xl mx-auto px-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Image className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-3xl font-bold text-slate-900 mb-4">Alt-Text Generator</h1>
              <p className="text-slate-600 mb-8">
                Bitte melden Sie sich an, um barrierefreie Alternativtexte für Ihre Bilder zu generieren.
              </p>
              <a
                href="/login"
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl font-medium hover:from-cyan-600 hover:to-blue-700 transition-all"
              >
                Anmelden
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PageLayout>
      <SEO
        title="Alt-Text Generator"
        description="Generieren Sie barrierefreie Alternativtexte für Ihre Bilder mit KI. WCAG-konform auf Deutsch."
      />
      <main
        id="main-content"
        className="flex-1 py-5 lg:py-6 overflow-y-auto lg:overflow-hidden"
        tabIndex={-1}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-full flex flex-col min-h-0">
          {/* Header */}
          <div className="text-center mb-4 lg:mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
              <Image className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 mb-1">Alt-Text Generator</h1>
            <p className="text-slate-600">
              KI-basierte Bildbeschreibungen für barrierefreie Websites
            </p>
          </div>

          {/* Two-panel layout.
              Desktop: keep all important controls/results inside the viewport by using internal scroll areas. */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 flex-1 min-h-0">
            {/* Left: Upload + Options + Action (sticky inside panel) */}
            <section
              className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-0"
              aria-label="Bilder hochladen und Optionen"
            >
              <div className="p-5 sm:p-6 flex-1 min-h-0 overflow-y-auto space-y-5">
                {/* Upload Area */}
                <div
                  className={`border-2 border-dashed rounded-2xl p-7 text-center transition-colors ${
                    images.length >= 5
                      ? "border-slate-200 bg-slate-50 cursor-not-allowed"
                      : "border-slate-300 hover:border-cyan-500 hover:bg-cyan-50/30 cursor-pointer"
                  }`}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onClick={() => images.length < 5 && fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/bmp"
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                    disabled={images.length >= 5}
                  />
                  <Upload className="w-11 h-11 text-slate-400 mx-auto mb-3" />
                  <p className="text-slate-700 font-medium mb-1">
                    Bilder hierher ziehen oder klicken
                  </p>
                  <p className="text-sm text-slate-500">
                    PNG, JPG, GIF, WEBP, BMP - Max 5 Bilder, je max 10 MB
                  </p>
                </div>

                {/* Image Preview Grid */}
                {images.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {images.map((img) => (
                      <div key={img.id} className="relative group">
                        <img
                          src={img.preview}
                          alt={img.file.name}
                          className="w-full h-24 object-cover rounded-lg border border-slate-200"
                        />
                        <button
                          onClick={(e) => { e.stopPropagation(); removeImage(img.id); }}
                          className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label={`${img.file.name} entfernen`}
                        >
                          <X className="w-4 h-4" />
                        </button>
                        <p className="text-xs text-slate-500 truncate mt-1">{img.file.name}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Options */}
                <div className="rounded-xl border border-slate-200 p-5">
                  <h2 className="font-semibold text-slate-900 mb-4">Optionen</h2>

                  {/* Length Selection */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Länge</label>
                    <div className="grid grid-cols-3 gap-3">
                      {LENGTH_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => setLength(option.value)}
                          className={`p-3 rounded-lg border text-left transition-all ${
                            length === option.value
                              ? "border-cyan-500 bg-cyan-50 ring-2 ring-cyan-200"
                              : "border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <p className="font-medium text-slate-900">{option.label}</p>
                          <p className="text-xs text-slate-500 mt-1">{option.description}</p>
                          <p className="text-xs text-cyan-600 mt-1">Max {option.maxChars} Zeichen</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Context Input */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Kontext (optional)
                    </label>
                    <input
                      type="text"
                      value={context}
                      onChange={(e) => setContext(e.target.value)}
                      placeholder="z.B. 'Organigramm der IT-Abteilung' oder 'Produktfoto für Webshop'"
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Zusätzlicher Kontext hilft der KI, bessere Beschreibungen zu erstellen
                    </p>
                  </div>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-red-700">{error}</p>
                  </div>
                )}
              </div>

              <div className="p-4 sm:p-5 border-t border-slate-200 bg-white">
                {isAuthenticated && images.length > 0 && (
                  <div className="mb-3">
                    <CreditEstimate costKey="ALT_TEXT_IMAGE" quantity={images.length} />
                  </div>
                )}
                <button
                  onClick={generateAltTexts}
                  disabled={images.length === 0 || isProcessing}
                  className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl font-semibold hover:from-cyan-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      Analysiere Bilder...
                    </>
                  ) : (
                    <>
                      <Image className="w-5 h-5" />
                      Alt-Texte generieren
                    </>
                  )}
                </button>
              </div>
            </section>

            {/* Right: Results or Features */}
            <section
              className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-0"
              aria-label={results.length > 0 ? "Ergebnisse" : "Funktionen"}
              aria-live={results.length > 0 ? "polite" : undefined}
            >
              <div className="p-5 sm:p-6 border-b border-slate-200">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 bg-cyan-100 rounded-xl flex items-center justify-center shrink-0">
                      {results.length > 0 ? (
                        <Check className="w-5 h-5 text-cyan-600" />
                      ) : (
                        <Image className="w-5 h-5 text-cyan-600" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-semibold text-slate-900 truncate">
                        {results.length > 0 ? "Ergebnisse" : "Funktionen"}
                      </h2>
                      <p className="text-sm text-slate-600">
                        {results.length > 0
                          ? `${results.filter((r) => !r.error).length}/${results.length} erfolgreich`
                          : "Alles Wichtige auf einen Blick"}
                      </p>
                    </div>
                  </div>
                  {results.length > 0 && (
                    <button
                      onClick={() => {
                        images.forEach((img) => URL.revokeObjectURL(img.preview));
                        setImages([]);
                        setResults([]);
                        setContext("");
                      }}
                      className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Reset
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6">
                {results.length === 0 ? (
                  <ul className="space-y-3 text-sm text-slate-600">
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      KI-generierte Bildbeschreibungen auf Deutsch
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      WCAG-konforme Zeichenlängen
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      Batch-Verarbeitung bis 5 Bilder
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      Export als JSON, HTML oder Markdown
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      Kontextbezogene Beschreibungen
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      Drei Detailstufen wählbar
                    </li>
                  </ul>
                ) : (
                  <div className="space-y-4">
                    <p className="sr-only">{results.length} Alt-Texte wurden generiert</p>

                    {results.map((result, index) => {
                      const img = images.find((i) => i.file.name === result.filename);
                      return (
                        <div
                          key={result.filename}
                          className={`rounded-xl border p-4 ${
                            result.error ? "border-red-200 bg-red-50/30" : "border-slate-200 bg-white"
                          }`}
                        >
                          <div className="flex items-start gap-4">
                            {img && (
                              <img
                                src={img.preview}
                                alt={result.filename}
                                className="w-16 h-16 object-cover rounded-lg flex-shrink-0 border border-slate-200"
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-3 mb-2">
                                <p className="font-medium text-slate-900 truncate">{result.filename}</p>
                                {!result.error && (
                                  <button
                                    onClick={() => copyToClipboard(result.altText, index)}
                                    className="flex items-center gap-1 px-3 py-1 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors shrink-0"
                                  >
                                    {copiedIndex === index ? (
                                      <>
                                        <Check className="w-4 h-4 text-green-600" />
                                        <span className="text-green-600">Kopiert</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-4 h-4" />
                                        <span>Kopieren</span>
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>

                              {result.error ? (
                                <div className="flex items-center gap-2 text-red-700">
                                  <AlertTriangle className="w-4 h-4" />
                                  <span>{result.error}</span>
                                </div>
                              ) : (
                                <>
                                  <p className="text-slate-700 bg-slate-50 p-3 rounded-lg">
                                    {result.altText}
                                  </p>
                                  <div className="flex items-center gap-2 mt-2 text-sm">
                                    <span
                                      className={`${
                                        result.characterCount <= charLimit
                                          ? "text-green-600"
                                          : "text-yellow-600"
                                      }`}
                                    >
                                      {result.characterCount} Zeichen
                                    </span>
                                    {result.characterCount <= charLimit ? (
                                      <span className="text-green-600 flex items-center gap-1">
                                        <Check className="w-3 h-3" />
                                        WCAG-konform
                                      </span>
                                    ) : (
                                      <span className="text-yellow-600 flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" />
                                        Evtl. zu lang
                                      </span>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {results.length > 0 && results.some((r) => !r.error) && (
                <div className="p-4 sm:p-5 border-t border-slate-200 bg-white">
                  <p className="text-sm font-medium text-slate-700 mb-3">Exportieren</p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={exportJSON}
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      <FileJson className="w-4 h-4 text-orange-500" />
                      JSON
                    </button>
                    <button
                      onClick={exportHTML}
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      <Code className="w-4 h-4 text-blue-500" />
                      HTML
                    </button>
                    <button
                      onClick={exportMarkdown}
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      <FileText className="w-4 h-4 text-purple-500" />
                      Markdown
                    </button>
                    <button
                      onClick={copyAllToClipboard}
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      {copiedIndex === -1 ? (
                        <>
                          <Check className="w-4 h-4 text-green-600" />
                          <span className="text-green-600">Alle kopiert</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Alle kopieren
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Hintergrundinfo bleibt da, nimmt aber nicht den Workflow-Platz weg. */}
          <details className="mt-4 bg-white rounded-2xl shadow-sm border border-slate-200">
            <summary className="cursor-pointer select-none px-5 py-4 text-sm font-semibold text-slate-900">
              Im Behördenalltag (Warum Alt-Texte wichtig sind)
            </summary>
            <div className="px-5 pb-5 prose prose-gray max-w-none text-slate-600">
              <p className="mb-4">
                Alternativtexte (alt-Attribute) sind nach WCAG 2.1 und BITV 2.0 verpflichtend für alle
                informativen Bilder auf Webseiten öffentlicher Stellen. Sie ermöglichen blinden und
                sehbehinderten Nutzern, den Inhalt von Bildern über Screenreader zu erfassen.
              </p>
              <p className="mb-4">
                Das manuelle Verfassen von Alternativtexten ist zeitaufwendig und erfordert Fachwissen
                über barrierefreie Formulierungen. Dieses Tool nutzt KI, um aussagekräftige Beschreibungen
                in der richtigen Länge automatisch zu generieren.
              </p>
              <p>
                Die generierten Texte entsprechen den WCAG-Empfehlungen für verschiedene Bildtypen:
                kurz für Icons, Standard für normale Bilder, ausführlich für komplexe Diagramme und Infografiken.
              </p>
            </div>
          </details>
        </div>
      </main>
    </PageLayout>
  );
}
