import { useState } from "react";
import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Hand,
  Keyboard,
  MonitorCheck,
  Sparkles,
} from "lucide-react";
import {
  ariaRules,
  getElementDescriptor,
  getHtmlSnippet,
  severityConfig,
  type Severity,
  type AriaIssue,
} from "@/pages/tools/aria-checker";

type WebIssue = AriaIssue & {
  category: "aria" | "structure" | "keyboard" | "forms";
};

const keyboardChecks = [
  {
    id: "kb-tab-order",
    title: "Tab-Reihenfolge logisch",
    description: "Fokus folgt dem visuellen Layout – keine Sprünge.",
  },
  {
    id: "kb-focus-visible",
    title: "Fokus sichtbar",
    description: "Alle Bedienelemente zeigen einen klaren Fokuszustand.",
  },
  {
    id: "kb-no-traps",
    title: "Keine Tastatur-Fallen",
    description: "Dialoge und Menüs lassen sich per Tastatur verlassen.",
  },
  {
    id: "kb-skip-link",
    title: "Skip-Link funktioniert",
    description: "Direkter Sprung zum Hauptinhalt möglich.",
  },
  {
    id: "kb-controls",
    title: "Alle Controls erreichbar",
    description: "Menüs, Tabs, Popovers, Slider etc. sind per Tastatur bedienbar.",
  },
];

const screenreaderChecks = [
  {
    id: "sr-lang-title",
    title: "Sprache & Titel korrekt",
    description: "Page-Titel passt, Sprache ist korrekt gesetzt.",
  },
  {
    id: "sr-headings",
    title: "Überschriftenstruktur sinnvoll",
    description: "H1–H3 geben Struktur, keine Level-Sprünge.",
  },
  {
    id: "sr-controls",
    title: "Controls angekündigt",
    description: "Screenreader nennt Name, Rolle, Zustand.",
  },
  {
    id: "sr-errors",
    title: "Fehleransagen bei Formularen",
    description: "Fehlermeldungen sind fokussierbar/lesbar.",
  },
  {
    id: "sr-dynamic",
    title: "Dynamische Inhalte angekündigt",
    description: "Wichtige Updates sind mit aria-live versehen.",
  },
];

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

function getAccessibleName(element: Element, doc: Document): string {
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel?.trim()) return ariaLabel.trim();

  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(" ")
      .map((id) => doc.getElementById(id)?.textContent || "")
      .join(" ")
      .trim();
    if (text) return text;
  }

  const title = element.getAttribute("title");
  if (title?.trim()) return title.trim();

  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  ) {
    const id = element.id;
    if (id) {
      const label = doc.querySelector(`label[for="${escapeId(id)}"]`);
      if (label?.textContent?.trim()) return label.textContent.trim();
    }

    const parentLabel = element.closest("label");
    if (parentLabel?.textContent?.trim()) return parentLabel.textContent.trim();

    if (element instanceof HTMLInputElement) {
      const type = element.type || "text";
      if (["submit", "button", "reset"].includes(type) && element.value) {
        return element.value;
      }
      if (type === "image") {
        const alt = element.getAttribute("alt");
        if (alt?.trim()) return alt.trim();
      }
    }
  }

  const textContent = element.textContent?.trim();
  if (textContent) return textContent;

  return "";
}

function hasSkipLink(doc: Document): boolean {
  const anchors = Array.from(doc.querySelectorAll('a[href^="#"]'));
  return anchors.some((anchor) => {
    const href = anchor.getAttribute("href") || "";
    const text = anchor.textContent?.toLowerCase() || "";
    return (
      /skip|sprung|hauptinhalt|inhalt/.test(text) ||
      /skip|main|content/.test(href) ||
      anchor.className.toLowerCase().includes("skip")
    );
  });
}

function getHeadingIssues(doc: Document, issueIdStart: number): WebIssue[] {
  const issues: WebIssue[] = [];
  const headings = Array.from(doc.querySelectorAll("h1, h2, h3, h4, h5, h6"));
  let issueId = issueIdStart;

  if (headings.length === 0) {
    issues.push({
      id: `issue-${issueId++}`,
      rule: "no-headings",
      ruleName: "Keine Überschriftenstruktur",
      severity: "moderate",
      element: "document",
      htmlSnippet: "<body>",
      suggestion: "Mindestens eine H1 und semantische Überschriften hinzufügen.",
      affectedPersonas: ["blind", "sehbehindert"],
      wcagCriteria: "1.3.1",
      category: "structure",
    });
    return issues;
  }

  const h1Count = headings.filter((h) => h.tagName.toLowerCase() === "h1").length;
  if (h1Count === 0) {
    issues.push({
      id: `issue-${issueId++}`,
      rule: "missing-h1",
      ruleName: "Keine H1 vorhanden",
      severity: "moderate",
      element: "document",
      htmlSnippet: "<body>",
      suggestion: "Genau eine H1 als Seitentitel verwenden.",
      affectedPersonas: ["blind", "sehbehindert"],
      wcagCriteria: "1.3.1",
      category: "structure",
    });
  } else if (h1Count > 1) {
    issues.push({
      id: `issue-${issueId++}`,
      rule: "multiple-h1",
      ruleName: "Mehrere H1 vorhanden",
      severity: "minor",
      element: "document",
      htmlSnippet: "<body>",
      suggestion: "H1 einmalig einsetzen und weitere Ebenen mit H2/H3 strukturieren.",
      affectedPersonas: ["blind"],
      wcagCriteria: "1.3.1",
      category: "structure",
    });
  }

  let previousLevel = 0;
  headings.forEach((heading) => {
    const level = Number(heading.tagName.substring(1));
    if (previousLevel && level - previousLevel > 1) {
      issues.push({
        id: `issue-${issueId++}`,
        rule: "heading-skip",
        ruleName: "Überschriftenebene übersprungen",
        severity: "moderate",
        element: getElementDescriptor(heading),
        htmlSnippet: getHtmlSnippet(heading),
        suggestion: "Überschriftenebenen nicht überspringen (z.B. H2 vor H3).",
        affectedPersonas: ["blind", "sehbehindert"],
        wcagCriteria: "1.3.1",
        category: "structure",
      });
    }
    previousLevel = level;
  });

  return issues;
}

function getFormIssues(doc: Document, issueIdStart: number): WebIssue[] {
  const issues: WebIssue[] = [];
  let issueId = issueIdStart;
  const fields = Array.from(doc.querySelectorAll("input, select, textarea"));

  fields.forEach((field) => {
    if (field instanceof HTMLInputElement && field.type === "hidden") return;

    const name = getAccessibleName(field, doc);
    if (!name) {
      issues.push({
        id: `issue-${issueId++}`,
        rule: "form-no-label",
        ruleName: "Formularfeld ohne Label",
        severity: "serious",
        element: getElementDescriptor(field),
        htmlSnippet: getHtmlSnippet(field),
        suggestion: "Label verknüpfen oder aria-label/aria-labelledby setzen.",
        affectedPersonas: ["blind", "motorisch"],
        wcagCriteria: "1.3.1",
        category: "forms",
      });
    }
  });

  return issues;
}

function IssueCard({ issue, isOpen, onToggle }: { issue: WebIssue; isOpen: boolean; onToggle: () => void }) {
  const config = severityConfig[issue.severity];
  const Icon = config.icon;

  return (
    <div className={`border rounded-lg overflow-hidden ${config.border} ${config.bg}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-black/5 transition-colors"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-3">
          <Icon className={`w-5 h-5 ${config.text}`} />
          <div>
            <span className={`font-medium ${config.text}`}>{issue.ruleName}</span>
            <span className="text-slate-600 text-sm ml-2">({issue.category})</span>
          </div>
        </div>
        <span className="text-xs text-slate-500">{issue.element}</span>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-3">
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">HTML-Element</p>
            <code className="block p-2 bg-slate-900 text-green-400 rounded text-sm overflow-x-auto">
              {issue.htmlSnippet}
            </code>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">WCAG-Kriterium</p>
            <span className="text-sm text-slate-700">{issue.wcagCriteria}</span>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">Lösung</p>
            <p className="text-sm text-slate-700">{issue.suggestion}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WebPrüfung() {
  const [inputMode, setInputMode] = useState<"url" | "html">("url");
  const [htmlInput, setHtmlInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [issues, setIssues] = useState<WebIssue[]>([]);
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [isChecking, setIsChecking] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalChecklistItems = keyboardChecks.length + screenreaderChecks.length;
  const completedChecklistItems = Object.values(checkedItems).filter(Boolean).length;
  const checklistProgress = totalChecklistItems
    ? Math.round((completedChecklistItems / totalChecklistItems) * 100)
    : 0;

  const toggleIssue = (id: string) => {
    setExpandedIssues((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleChecklistItem = (id: string) => {
    setCheckedItems((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const runCheck = async () => {
    setIsChecking(true);
    setHasChecked(false);
    setError(null);
    setIssues([]);

    try {
      let htmlContent = "";
      if (inputMode === "html") {
        htmlContent = htmlInput;
      } else {
        const response = await fetch(`/api/proxy?url=${encodeURIComponent(urlInput)}`, {
          credentials: 'include',
        });
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

      const foundIssues: WebIssue[] = [];
      let issueId = 0;

      for (const rule of ariaRules) {
        const elements = Array.from(doc.querySelectorAll(rule.selector));
        for (const element of elements) {
          if (rule.check(element)) {
            foundIssues.push({
              id: `issue-${issueId++}`,
              rule: rule.id,
              ruleName: rule.name,
              severity: rule.severity,
              element: getElementDescriptor(element),
              htmlSnippet: getHtmlSnippet(element),
              suggestion: rule.suggestion,
              affectedPersonas: rule.personas,
              wcagCriteria: rule.wcag,
              category: "aria",
            });
          }
        }
      }

      const htmlElement = doc.documentElement;
      if (!htmlElement.getAttribute("lang")) {
        foundIssues.push({
          id: `issue-${issueId++}`,
          rule: "missing-lang",
          ruleName: "Dokument ohne Sprache (lang)",
          severity: "serious",
          element: "document",
          htmlSnippet: "<html>",
          suggestion: "lang-Attribut am <html>-Element setzen (z. B. lang=\"de\").",
          affectedPersonas: ["blind", "sehbehindert"],
          wcagCriteria: "3.1.1",
          category: "structure",
        });
      }

      const titleText = doc.querySelector("title")?.textContent?.trim();
      if (!titleText) {
        foundIssues.push({
          id: `issue-${issueId++}`,
          rule: "missing-title",
          ruleName: "Seitentitel fehlt",
          severity: "moderate",
          element: "document",
          htmlSnippet: "<title>",
          suggestion: "Einen aussagekräftigen <title> setzen.",
          affectedPersonas: ["blind", "sehbehindert"],
          wcagCriteria: "2.4.2",
          category: "structure",
        });
      }

      if (!hasSkipLink(doc)) {
        foundIssues.push({
          id: `issue-${issueId++}`,
          rule: "missing-skip-link",
          ruleName: "Kein Skip-Link gefunden",
          severity: "moderate",
          element: "document",
          htmlSnippet: "<a href=\"#main\">",
          suggestion: "Skip-Link zum Hauptinhalt hinzufügen.",
          affectedPersonas: ["motorisch", "blind"],
          wcagCriteria: "2.4.1",
          category: "keyboard",
        });
      }

      const headingIssues = getHeadingIssues(doc, issueId);
      issueId += headingIssues.length;
      foundIssues.push(...headingIssues);

      const formIssues = getFormIssues(doc, issueId);
      issueId += formIssues.length;
      foundIssues.push(...formIssues);

      const focusables = Array.from(doc.querySelectorAll("button, [role='button'], a[href], input, select, textarea"));
      focusables.forEach((element) => {
        if (element instanceof HTMLInputElement && element.type === "hidden") return;
        const name = getAccessibleName(element, doc);
        if (!name) {
          foundIssues.push({
            id: `issue-${issueId++}`,
            rule: "missing-accessible-name",
            ruleName: "Interaktives Element ohne Name",
            severity: "serious",
            element: getElementDescriptor(element),
            htmlSnippet: getHtmlSnippet(element),
            suggestion: "Accessible Name über Text, aria-label oder label setzen.",
            affectedPersonas: ["blind", "motorisch"],
            wcagCriteria: "4.1.2",
            category: "keyboard",
          });
        }
      });

      foundIssues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
      setIssues(foundIssues);
      setHasChecked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setIsChecking(false);
    }
  };

  const exportReport = () => {
    const data = {
      timestamp: new Date().toISOString(),
      source: inputMode === "html" ? "HTML-Eingabe" : urlInput,
      issues,
      manualChecklist: {
        keyboard: keyboardChecks.map((item) => ({
          ...item,
          checked: Boolean(checkedItems[item.id]),
        })),
        screenreader: screenreaderChecks.map((item) => ({
          ...item,
          checked: Boolean(checkedItems[item.id]),
        })),
      },
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `web-pruefung-report-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const counts = {
    critical: issues.filter((i) => i.severity === "critical").length,
    serious: issues.filter((i) => i.severity === "serious").length,
    moderate: issues.filter((i) => i.severity === "moderate").length,
    minor: issues.filter((i) => i.severity === "minor").length,
  };

  return (
    <PageLayout>
      <SEO
        title="Web-Prüfung"
        description="Schneller ARIA-, Keyboard- und Screenreader-Smoke-Test für Webseiten. DSGVO-konform auf deutschen Servern."
        canonical="/tools/web-pruefung"
      />

      <main className="max-w-6xl mx-auto px-6 py-12">
        <header className="mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-full text-sm font-medium mb-4">
            <MonitorCheck className="w-4 h-4" />
            Web-Prüfung
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 mb-3">
            ARIA-, Keyboard- & Screenreader-Smoke-Test
          </h1>
          <p className="text-slate-600 max-w-2xl">
            Prüfen Sie Webinhalte schnell auf die häufigsten Barrieren. Automatische Checks plus manuelle
            Checkliste für Behörden-Reports.
          </p>
        </header>

        <div className="grid lg:grid-cols-3 gap-8">
          <section className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Automatische Prüfung</h2>
                <Badge className="bg-slate-100 text-slate-700">ARIA + Struktur + Formulare</Badge>
              </div>

              <Tabs value={inputMode} onValueChange={(value) => setInputMode(value as "url" | "html")}>
                <TabsList className="mb-4">
                  <TabsTrigger value="url">URL prüfen</TabsTrigger>
                  <TabsTrigger value="html">HTML einfügen</TabsTrigger>
                </TabsList>
                <TabsContent value="url">
                  <Input
                    placeholder="https://beispiel.de"
                    value={urlInput}
                    onChange={(event) => setUrlInput(event.target.value)}
                  />
                </TabsContent>
                <TabsContent value="html">
                  <Textarea
                    placeholder="&lt;html&gt;..."
                    rows={8}
                    value={htmlInput}
                    onChange={(event) => setHtmlInput(event.target.value)}
                  />
                </TabsContent>
              </Tabs>

              {error && (
                <div className="mt-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
                  {error}
                </div>
              )}

              <div className="flex flex-wrap gap-3 mt-4">
                <Button onClick={runCheck} disabled={isChecking || (inputMode === "url" ? !urlInput : !htmlInput)}>
                  {isChecking ? "Prüfe..." : "Prüfung starten"}
                </Button>
                <Button variant="outline" onClick={exportReport} disabled={!issues.length}>
                  Report herunterladen
                </Button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Ergebnisse</h2>
                {hasChecked && (
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    {issues.length} Hinweise gefunden
                  </div>
                )}
              </div>

              {!hasChecked && (
                <div className="p-6 rounded-xl bg-slate-50 text-slate-500 text-sm">
                  Starten Sie eine Prüfung, um Ergebnisse zu sehen.
                </div>
              )}

              {hasChecked && issues.length === 0 && (
                <div className="p-6 rounded-xl bg-emerald-50 text-emerald-700 text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  Keine kritischen Probleme gefunden.
                </div>
              )}

              {issues.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge className="bg-red-100 text-red-700">Kritisch: {counts.critical}</Badge>
                    <Badge className="bg-orange-100 text-orange-700">Schwer: {counts.serious}</Badge>
                    <Badge className="bg-yellow-100 text-yellow-700">Mittel: {counts.moderate}</Badge>
                    <Badge className="bg-violet-100 text-violet-700">Leicht: {counts.minor}</Badge>
                  </div>
                  {issues.map((issue) => (
                    <IssueCard
                      key={issue.id}
                      issue={issue}
                      isOpen={expandedIssues.has(issue.id)}
                      onToggle={() => toggleIssue(issue.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>

          <aside className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-2 text-slate-800">
                <Keyboard className="w-5 h-5" />
                <h3 className="font-semibold">Manuelle Checkliste</h3>
              </div>
              <p className="text-sm text-slate-600 mb-4">
                Ergänzen Sie die automatischen Checks durch kurze manuelle Tests.
              </p>
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                  <span>Fortschritt</span>
                  <span>{completedChecklistItems}/{totalChecklistItems}</span>
                </div>
                <Progress value={checklistProgress} />
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex items-center gap-2 mb-2 text-sm font-medium text-slate-700">
                    <Hand className="w-4 h-4" />
                    Tastatur
                  </div>
                  <div className="space-y-2">
                    {keyboardChecks.map((item) => (
                      <label key={item.id} className="flex items-start gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          className="mt-1 accent-slate-900"
                          checked={Boolean(checkedItems[item.id])}
                          onChange={() => toggleChecklistItem(item.id)}
                        />
                        <span>
                          <span className="font-medium">{item.title}</span>
                          <span className="block text-xs text-slate-500">{item.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2 text-sm font-medium text-slate-700">
                    <Eye className="w-4 h-4" />
                    Screenreader
                  </div>
                  <div className="space-y-2">
                    {screenreaderChecks.map((item) => (
                      <label key={item.id} className="flex items-start gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          className="mt-1 accent-slate-900"
                          checked={Boolean(checkedItems[item.id])}
                          onChange={() => toggleChecklistItem(item.id)}
                        />
                        <span>
                          <span className="font-medium">{item.title}</span>
                          <span className="block text-xs text-slate-500">{item.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-2 text-slate-800">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <h3 className="font-semibold">Hinweis</h3>
              </div>
              <p className="text-sm text-slate-600">
                Dieser Smoke-Test ersetzt kein vollständiges WCAG-/EN-301-549-Audit. Nutzen Sie die Ergebnisse als
                schnellen Einstieg für Behörden-Checks.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </PageLayout>
  );
}
