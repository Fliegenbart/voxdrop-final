import { useCallback, useEffect, useRef, useState } from "react";
import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Upload,
} from "lucide-react";
import { severityConfig, type Severity } from "@/pages/tools/aria-checker";

type FormIssue = {
  id: string;
  severity: Severity;
  message: string;
  element: string;
  htmlSnippet: string;
  suggestion: string;
};

type PdfFormIssue = {
  severity: Severity;
  message: string;
  field?: string | null;
};

type PdfFormResult = {
  summary: {
    pages: number;
    tagged: boolean;
    has_forms: boolean;
    need_appearances: boolean;
    xfa: boolean;
  };
  stats: {
    total_fields: number;
    missing_tooltip: number;
    missing_name: number;
    required_fields: number;
    read_only_fields: number;
  };
  fields: Array<{
    name: string;
    type: string;
    tooltip: string;
    required: boolean;
    read_only: boolean;
    issues: string[];
  }>;
  issues: PdfFormIssue[];
};

const severityOrder: Record<Severity, number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

function escapeId(id: string) {
  if (typeof CSS !== "undefined" && CSS.escape) {
    return CSS.escape(id);
  }
  return id;
}

function getLabelText(field: Element, doc: Document): string {
  const ariaLabel = field.getAttribute("aria-label");
  if (ariaLabel?.trim()) return ariaLabel.trim();

  const labelledBy = field.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(" ")
      .map((id) => doc.getElementById(id)?.textContent || "")
      .join(" ")
      .trim();
    if (text) return text;
  }

  const id = (field as HTMLElement).id;
  if (id) {
    const label = doc.querySelector(`label[for="${escapeId(id)}"]`);
    if (label?.textContent?.trim()) return label.textContent.trim();
  }

  const parentLabel = field.closest("label");
  if (parentLabel?.textContent?.trim()) return parentLabel.textContent.trim();

  const title = field.getAttribute("title");
  if (title?.trim()) return title.trim();

  if (field instanceof HTMLInputElement) {
    const type = field.type || "text";
    if (["submit", "button", "reset"].includes(type) && field.value) {
      return field.value;
    }
  }

  return "";
}

function getFieldDescriptor(field: Element): string {
  const tag = field.tagName.toLowerCase();
  const id = (field as HTMLElement).id ? `#${(field as HTMLElement).id}` : "";
  const name = field.getAttribute("name") ? `[name="${field.getAttribute("name")}"]` : "";
  return `${tag}${id}${name}`;
}

function getHtmlSnippet(element: Element): string {
  const clone = element.cloneNode(false) as Element;
  let html = clone.outerHTML;
  if (html.length > 150) {
    html = `${html.substring(0, 147)}...`;
  }
  return html;
}

function analyzeWebForms(doc: Document) {
  const issues: FormIssue[] = [];
  const forms = Array.from(doc.querySelectorAll("form"));
  const fields = Array.from(doc.querySelectorAll("input, select, textarea"));
  let issueId = 0;

  let missingLabel = 0;
  let missingName = 0;
  let placeholderOnly = 0;
  let missingFieldset = 0;

  fields.forEach((field) => {
    if (field instanceof HTMLInputElement && field.type === "hidden") return;

    const labelText = getLabelText(field, doc);
    const placeholder = field.getAttribute("placeholder") || "";
    const nameAttr = field.getAttribute("name") || "";

    if (!labelText) {
      missingLabel += 1;
      issues.push({
        id: `issue-${issueId++}`,
        severity: "serious",
        message: "Formularfeld ohne Label",
        element: getFieldDescriptor(field),
        htmlSnippet: getHtmlSnippet(field),
        suggestion: "Label verknüpfen oder aria-label/aria-labelledby setzen.",
      });
    }

    if (!labelText && placeholder) {
      placeholderOnly += 1;
      issues.push({
        id: `issue-${issueId++}`,
        severity: "moderate",
        message: "Nur Platzhalter statt Label",
        element: getFieldDescriptor(field),
        htmlSnippet: getHtmlSnippet(field),
        suggestion: "Platzhalter nicht als einziges Label verwenden.",
      });
    }

    if (!nameAttr) {
      missingName += 1;
      issues.push({
        id: `issue-${issueId++}`,
        severity: "moderate",
        message: "Formularfeld ohne Name-Attribut",
        element: getFieldDescriptor(field),
        htmlSnippet: getHtmlSnippet(field),
        suggestion: "name-Attribut setzen für serverseitige Verarbeitung.",
      });
    }

    if (field instanceof HTMLInputElement && ["radio", "checkbox"].includes(field.type)) {
      const fieldset = field.closest("fieldset");
      const legend = fieldset?.querySelector("legend");
      if (!fieldset || !legend || !legend.textContent?.trim()) {
        missingFieldset += 1;
        issues.push({
          id: `issue-${issueId++}`,
          severity: "moderate",
          message: "Checkbox/Radio-Gruppe ohne Fieldset/Legend",
          element: getFieldDescriptor(field),
          htmlSnippet: getHtmlSnippet(field),
          suggestion: "Gruppen mit <fieldset><legend> strukturieren.",
        });
      }
    }
  });

  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    issues,
    summary: {
      forms: forms.length,
      fields: fields.length,
      missingLabel,
      missingName,
      placeholderOnly,
      missingFieldset,
    },
  };
}

export default function FormularCheck() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"web" | "pdf">("web");
  const [inputMode, setInputMode] = useState<"url" | "html">("url");
  const [htmlInput, setHtmlInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [webIssues, setWebIssues] = useState<FormIssue[]>([]);
  const [webSummary, setWebSummary] = useState({
    forms: 0,
    fields: 0,
    missingLabel: 0,
    missingName: 0,
    placeholderOnly: 0,
    missingFieldset: 0,
  });
  const [webChecked, setWebChecked] = useState(false);
  const [webError, setWebError] = useState<string | null>(null);
  const [webChecking, setWebChecking] = useState(false);

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfJobId, setPdfJobId] = useState<string | null>(null);
  const [pdfStatus, setPdfStatus] = useState<any>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfUploading, setPdfUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const runWebCheck = async () => {
    setWebChecking(true);
    setWebError(null);
    setWebChecked(false);

    try {
      let htmlContent = "";
      if (inputMode === "html") {
        htmlContent = htmlInput;
      } else {
        const response = await fetch(`/api/proxy?url=${encodeURIComponent(urlInput)}`);
        if (!response.ok) {
          throw new Error("URL konnte nicht abgerufen werden");
        }
        htmlContent = await response.text();
      }

      if (!htmlContent.trim()) {
        throw new Error("Kein HTML-Inhalt zum Prüfen");
      }

      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, "text/html");
      const result = analyzeWebForms(doc);
      setWebIssues(result.issues);
      setWebSummary(result.summary);
      setWebChecked(true);
    } catch (err) {
      setWebError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setWebChecking(false);
    }
  };

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

  const startPdfAnalysis = async () => {
    if (!pdfFile) return;

    setPdfError(null);
    setPdfUploading(true);
    setPdfStatus(null);

    try {
      const formData = new FormData();
      formData.append("file", pdfFile);

      const response = await fetch("/api/tools/pdf/analyze-forms", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Analyse fehlgeschlagen");
      }

      const data = await response.json();
      setPdfJobId(data.job_id);
      setPdfStatus(data);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setPdfUploading(false);
    }
  };

  useEffect(() => {
    if (!pdfJobId || pdfStatus?.status === "completed" || pdfStatus?.status === "failed") {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/tools/pdf/analyze-forms/${pdfJobId}`, {
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          setPdfStatus(data);
        }
      } catch (error) {
        console.error("Failed to fetch PDF form status:", error);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [pdfJobId, pdfStatus?.status]);

  const pdfResult = pdfStatus?.result as PdfFormResult | undefined;
  const pdfIssues = pdfResult?.issues || [];

  return (
    <PageLayout>
      <SEO
        title="Formular-Check"
        description="Web- und PDF-Formulare auf Barrierefreiheit prüfen. Labels, Fieldsets und PDF-Formularfelder automatisch analysieren."
        canonical="/tools/formular-check"
      />

      <main className="max-w-6xl mx-auto px-6 py-12">
        <header className="mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-full text-sm font-medium mb-4">
            <ClipboardCheck className="w-4 h-4" />
            Formular-Check
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 mb-3">
            Formulare prüfen (Web + PDF)
          </h1>
          <p className="text-slate-600 max-w-2xl">
            Schnellcheck für Labels, Gruppierungen und PDF-Formularfelder. Ideal als Vorprüfung für EN 301 549.
          </p>
        </header>

        <Tabs value={tab} onValueChange={(value) => setTab(value as "web" | "pdf")}>
          <TabsList className="mb-6">
            <TabsTrigger value="web">Web-Formulare</TabsTrigger>
            <TabsTrigger value="pdf">PDF-Formulare</TabsTrigger>
          </TabsList>

          <TabsContent value="web">
            <div className="grid lg:grid-cols-3 gap-8">
              <section className="lg:col-span-2 space-y-6">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-slate-900">Web-Check</h2>
                    <Badge className="bg-slate-100 text-slate-700">HTML & URL</Badge>
                  </div>

                  <Tabs value={inputMode} onValueChange={(value) => setInputMode(value as "url" | "html")}>
                    <TabsList className="mb-4">
                      <TabsTrigger value="url">URL prüfen</TabsTrigger>
                      <TabsTrigger value="html">HTML einfügen</TabsTrigger>
                    </TabsList>
                    <TabsContent value="url">
                      <Input
                        placeholder="https://beispiel.de/formular"
                        value={urlInput}
                        onChange={(event) => setUrlInput(event.target.value)}
                      />
                    </TabsContent>
                    <TabsContent value="html">
                      <Textarea
                        placeholder="&lt;form&gt;..."
                        rows={8}
                        value={htmlInput}
                        onChange={(event) => setHtmlInput(event.target.value)}
                      />
                    </TabsContent>
                  </Tabs>

                  {webError && (
                    <div className="mt-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
                      {webError}
                    </div>
                  )}

                  <Button
                    onClick={runWebCheck}
                    disabled={webChecking || (inputMode === "url" ? !urlInput : !htmlInput)}
                    className="mt-4"
                  >
                    {webChecking ? "Prüfe..." : "Web-Check starten"}
                  </Button>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-slate-900">Ergebnisse</h2>
                    {webChecked && (
                      <div className="text-sm text-slate-600">
                        {webIssues.length} Hinweise gefunden
                      </div>
                    )}
                  </div>

                  {!webChecked && (
                    <div className="p-6 rounded-xl bg-slate-50 text-slate-500 text-sm">
                      Starten Sie eine Prüfung, um Ergebnisse zu sehen.
                    </div>
                  )}

                  {webChecked && webIssues.length === 0 && (
                    <div className="p-6 rounded-xl bg-emerald-50 text-emerald-700 text-sm flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5" />
                      Keine kritischen Formularprobleme erkannt.
                    </div>
                  )}

                  {webIssues.length > 0 && (
                    <div className="space-y-3">
                      {webIssues.map((issue) => {
                        const config = severityConfig[issue.severity];
                        const Icon = config.icon;
                        return (
                          <div key={issue.id} className={`border rounded-lg p-4 ${config.border} ${config.bg}`}>
                            <div className="flex items-center gap-2 mb-2">
                              <Icon className={`w-4 h-4 ${config.text}`} />
                              <span className={`font-medium ${config.text}`}>{issue.message}</span>
                            </div>
                            <p className="text-xs text-slate-500 mb-2">{issue.element}</p>
                            <code className="block p-2 bg-slate-900 text-green-400 rounded text-xs overflow-x-auto">
                              {issue.htmlSnippet}
                            </code>
                            <p className="text-sm text-slate-700 mt-2">{issue.suggestion}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>

              <aside className="space-y-6">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <div className="flex items-center gap-2 mb-2 text-slate-800">
                    <FileText className="w-5 h-5" />
                    <h3 className="font-semibold">Zusammenfassung</h3>
                  </div>
                  <div className="space-y-2 text-sm text-slate-700">
                    <div className="flex justify-between">
                      <span>Formulare</span>
                      <span>{webSummary.forms}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Felder</span>
                      <span>{webSummary.fields}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Fehlende Labels</span>
                      <span>{webSummary.missingLabel}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Placeholder-only</span>
                      <span>{webSummary.placeholderOnly}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Fehlendes name</span>
                      <span>{webSummary.missingName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Kein Fieldset</span>
                      <span>{webSummary.missingFieldset}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <div className="flex items-center gap-2 mb-2 text-slate-800">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                    <h3 className="font-semibold">Hinweis</h3>
                  </div>
                  <p className="text-sm text-slate-600">
                    Dieser Schnellcheck ersetzt kein vollständiges Formular-Testing mit Tastatur und Screenreader.
                  </p>
                </div>
              </aside>
            </div>
          </TabsContent>

          <TabsContent value="pdf">
            <div className="grid lg:grid-cols-3 gap-8">
              <section className="lg:col-span-2 space-y-6">
                <div
                  className="bg-white rounded-2xl border border-dashed border-slate-300 p-6 text-center"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleDrop}
                >
                  <Upload className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                  <p className="text-sm text-slate-600 mb-2">PDF-Formular hier ablegen oder auswählen.</p>
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
                    <p className="text-sm text-slate-700 mt-3">Ausgewählt: {pdfFile.name}</p>
                  )}
                </div>

                {pdfError && (
                  <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
                    {pdfError}
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <Button onClick={startPdfAnalysis} disabled={!pdfFile || pdfUploading}>
                    {pdfUploading ? "Analyse läuft..." : "PDF analysieren"}
                  </Button>
                  {pdfStatus?.progress && (
                    <span className="text-sm text-slate-500">{pdfStatus.progress.message}</span>
                  )}
                </div>

                {pdfStatus?.progress && (
                  <Progress value={pdfStatus.progress.percentage || 0} />
                )}

                {pdfResult && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <h2 className="text-lg font-semibold text-slate-900 mb-4">PDF-Ergebnisse</h2>
                    <div className="grid md:grid-cols-2 gap-4 text-sm">
                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <span>Seiten</span>
                        <span>{pdfResult.summary.pages}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <span>Formularfelder</span>
                        <span>{pdfResult.stats.total_fields}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <span>Getaggt</span>
                        <span>{pdfResult.summary.tagged ? "Ja" : "Nein"}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <span>XFA</span>
                        <span>{pdfResult.summary.xfa ? "Ja" : "Nein"}</span>
                      </div>
                    </div>

                    {pdfIssues.length > 0 && (
                      <div className="mt-6 space-y-3">
                        {pdfIssues.map((issue, index) => {
                          const config = severityConfig[issue.severity];
                          const Icon = config.icon;
                          return (
                            <div key={`${issue.message}-${index}`} className={`border rounded-lg p-4 ${config.border} ${config.bg}`}>
                              <div className="flex items-center gap-2 mb-1">
                                <Icon className={`w-4 h-4 ${config.text}`} />
                                <span className={`font-medium ${config.text}`}>{issue.message}</span>
                              </div>
                              {issue.field && (
                                <p className="text-xs text-slate-500">{issue.field}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {pdfResult.fields?.length > 0 && (
                      <div className="mt-6">
                        <h3 className="text-sm font-semibold text-slate-700 mb-2">Feldliste</h3>
                        <div className="space-y-2">
                          {pdfResult.fields.map((field, index) => (
                            <div key={`${field.name}-${index}`} className="p-3 bg-slate-50 rounded-lg text-sm">
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-slate-800">{field.name}</span>
                                <Badge className="bg-slate-200 text-slate-700">{field.type}</Badge>
                              </div>
                              <div className="text-xs text-slate-500 mt-1">
                                Tooltip: {field.tooltip ? "vorhanden" : "fehlt"} · Required: {field.required ? "ja" : "nein"}
                              </div>
                              {field.issues.length > 0 && (
                                <div className="text-xs text-amber-600 mt-1">{field.issues.join(", ")}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>

              <aside className="space-y-6">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <div className="flex items-center gap-2 mb-2 text-slate-800">
                    <FileText className="w-5 h-5" />
                    <h3 className="font-semibold">Hinweise</h3>
                  </div>
                  <p className="text-sm text-slate-600">
                    PDF-Formulare benötigen Tooltips (Feldbeschriftungen) und ein getaggtes Dokument für Screenreader.
                  </p>
                </div>
              </aside>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </PageLayout>
  );
}
