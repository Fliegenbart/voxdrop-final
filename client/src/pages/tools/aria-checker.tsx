import { useState } from "react";
import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import {
  Code2,
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronUp,
  FileJson,
  FileText,
  Eye,
  Hand,
  Brain,
  Sparkles,
  Search,
  X,
} from "lucide-react";

// Types
export type Persona = "blind" | "sehbehindert" | "motorisch" | "neurodivergent";
export type Severity = "critical" | "serious" | "moderate" | "minor";

export interface AriaRule {
  id: string;
  name: string;
  selector: string;
  check: (element: Element) => boolean;
  severity: Severity;
  wcag: string;
  personas: Persona[];
  suggestion: string;
}

export interface AriaIssue {
  id: string;
  rule: string;
  ruleName: string;
  severity: Severity;
  element: string;
  htmlSnippet: string;
  suggestion: string;
  affectedPersonas: Persona[];
  wcagCriteria: string;
}

// ARIA Checking Rules
export const ariaRules: AriaRule[] = [
  {
    id: "toggle-no-expanded",
    name: "Toggle-Button ohne aria-expanded",
    selector: "button",
    check: (el) => {
      const hasToggleClass = /toggle|expand|collapse|accordion/i.test(el.className);
      const hasToggleText = /aufklappen|zuklappen|erweitern|schliessen|mehr|weniger|anzeigen|ausblenden/i.test(el.textContent || "");
      const hasOnClick = el.hasAttribute("onclick") || el.getAttribute("role") === "button";
      return (hasToggleClass || hasToggleText) && hasOnClick && !el.hasAttribute("aria-expanded");
    },
    severity: "serious",
    wcag: "4.1.2",
    personas: ["blind", "motorisch"],
    suggestion: 'aria-expanded="false" hinzufügen und bei Interaktion umschalten',
  },
  {
    id: "pressed-no-controls",
    name: "aria-pressed ohne aria-controls bei Inhalt-Toggles",
    selector: "[aria-pressed]",
    check: (el) => !el.hasAttribute("aria-controls") && !el.hasAttribute("aria-expanded"),
    severity: "moderate",
    wcag: "4.1.2",
    personas: ["blind"],
    suggestion: 'aria-controls="ziel-element-id" hinzufügen um Beziehung herzustellen',
  },
  {
    id: "sortable-no-sort",
    name: "Sortierbare Spalte ohne aria-sort",
    selector: "th",
    check: (el) => {
      const hasButton = el.querySelector("button") !== null;
      const hasOnClick = el.hasAttribute("onclick");
      const hasRole = el.getAttribute("role") === "button";
      const hasSortClass = /sort/i.test(el.className);
      return (hasButton || hasOnClick || hasRole || hasSortClass) && !el.hasAttribute("aria-sort");
    },
    severity: "serious",
    wcag: "1.3.1",
    personas: ["blind"],
    suggestion: 'aria-sort="none" hinzufügen (oder "ascending"/"descending" je nach Zustand)',
  },
  {
    id: "group-no-label",
    name: "Visuelle Gruppe ohne role=group",
    selector: "div, section",
    check: (el) => {
      const inputs = el.querySelectorAll("input, button, select, textarea");
      const prevSibling = el.previousElementSibling;
      const hasLabel = prevSibling ? prevSibling.matches("label, p, h1, h2, h3, h4, h5, h6, span") : false;
      return inputs.length >= 2 && hasLabel && !el.hasAttribute("role") && !el.hasAttribute("aria-labelledby");
    },
    severity: "moderate",
    wcag: "1.3.1",
    personas: ["blind"],
    suggestion: 'role="group" aria-labelledby="label-id" hinzufügen',
  },
  {
    id: "modal-no-trap",
    name: "Modaler Dialog ohne aria-modal",
    selector: '[role="dialog"], .modal, .dialog, [class*="modal"], [class*="Modal"]',
    check: (el) => {
      const hasDialogRole = el.getAttribute("role") === "dialog";
      const hasAriaModal = el.hasAttribute("aria-modal");
      // If it has modal class but no proper ARIA
      if (!hasDialogRole && !hasAriaModal) {
        return true;
      }
      // If it has role=dialog but no aria-modal
      if (hasDialogRole && !hasAriaModal) {
        return true;
      }
      return false;
    },
    severity: "critical",
    wcag: "2.4.3",
    personas: ["blind", "motorisch"],
    suggestion: 'role="dialog" aria-modal="true" hinzufügen',
  },
  {
    id: "listbox-no-activedescendant",
    name: "Listbox/Combobox ohne aria-activedescendant",
    selector: '[role="listbox"], [role="combobox"]',
    check: (el) => !el.hasAttribute("aria-activedescendant"),
    severity: "serious",
    wcag: "4.1.2",
    personas: ["blind", "motorisch"],
    suggestion: 'aria-activedescendant="aktives-option-id" hinzufügen',
  },
];

// Severity configuration
export const severityConfig: Record<Severity, { label: string; bg: string; border: string; text: string; icon: typeof AlertCircle }> = {
  critical: { label: "Kritisch", bg: "bg-red-50", border: "border-red-300", text: "text-red-800", icon: AlertCircle },
  serious: { label: "Schwerwiegend", bg: "bg-orange-50", border: "border-orange-300", text: "text-orange-800", icon: AlertTriangle },
  moderate: { label: "Mittel", bg: "bg-yellow-50", border: "border-yellow-300", text: "text-yellow-800", icon: Info },
  minor: { label: "Leicht", bg: "bg-violet-50", border: "border-blue-300", text: "text-violet-800", icon: Info },
};

// Persona configuration
const personaConfig: Record<Persona, { label: string; bg: string; text: string; icon: typeof Eye }> = {
  blind: { label: "Blind", bg: "bg-purple-100", text: "text-purple-800", icon: Eye },
  sehbehindert: { label: "Sehbehindert", bg: "bg-violet-100", text: "text-violet-800", icon: Eye },
  motorisch: { label: "Motorisch", bg: "bg-green-100", text: "text-green-800", icon: Hand },
  neurodivergent: { label: "Neurodivergent", bg: "bg-teal-100", text: "text-teal-800", icon: Brain },
};

// Helper to get HTML snippet
export function getHtmlSnippet(element: Element): string {
  const clone = element.cloneNode(false) as Element;
  let html = clone.outerHTML;
  // Truncate if too long
  if (html.length > 150) {
    html = html.substring(0, 147) + "...";
  }
  return html;
}

// Helper to get element descriptor
export function getElementDescriptor(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : "";
  const classes = element.className ? `.${element.className.split(" ").slice(0, 2).join(".")}` : "";
  return `${tag}${id}${classes}`;
}

// Issue Card Component
function IssueCard({ issue, isOpen, onToggle }: { issue: AriaIssue; isOpen: boolean; onToggle: () => void }) {
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
            <span className="text-slate-600 text-sm ml-2">({issue.element})</span>
          </div>
        </div>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 text-slate-500" />
        ) : (
          <ChevronDown className="w-5 h-5 text-slate-500" />
        )}
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

          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">Betroffene Personas</p>
            <div className="flex flex-wrap gap-2">
              {issue.affectedPersonas.map((persona) => {
                const pConfig = personaConfig[persona];
                const PIcon = pConfig.icon;
                return (
                  <span
                    key={persona}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${pConfig.bg} ${pConfig.text}`}
                  >
                    <PIcon className="w-3 h-3" />
                    {pConfig.label}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Persona Filter Component
function PersonaFilter({
  selectedPersonas,
  onToggle,
}: {
  selectedPersonas: Set<Persona>;
  onToggle: (persona: Persona) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(personaConfig) as Persona[]).map((persona) => {
        const config = personaConfig[persona];
        const Icon = config.icon;
        const isSelected = selectedPersonas.has(persona);

        return (
          <button
            key={persona}
            onClick={() => onToggle(persona)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
              isSelected
                ? `${config.bg} ${config.text} ring-2 ring-offset-1 ring-current`
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
            aria-pressed={isSelected}
          >
            <Icon className="w-4 h-4" />
            {config.label}
          </button>
        );
      })}
    </div>
  );
}

// Main Component
export default function AriaChecker() {
  const [inputMode, setInputMode] = useState<"html" | "url">("html");
  const [htmlInput, setHtmlInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [issues, setIssues] = useState<AriaIssue[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const [selectedPersonas, setSelectedPersonas] = useState<Set<Persona>>(new Set());
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const runCheck = async () => {
    setIsChecking(true);
    setError(null);
    setIssues([]);

    try {
      let htmlContent = "";

      if (inputMode === "html") {
        htmlContent = htmlInput;
      } else {
        // Fetch URL content via proxy to avoid CORS
        const response = await fetch(`/api/proxy?url=${encodeURIComponent(urlInput)}`);
        if (!response.ok) {
          throw new Error("URL konnte nicht abgerufen werden");
        }
        htmlContent = await response.text();
      }

      if (!htmlContent.trim()) {
        throw new Error("Kein HTML-Inhalt zum Prüfen");
      }

      // Parse HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, "text/html");

      const foundIssues: AriaIssue[] = [];
      let issueId = 0;

      // Run each rule
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
            });
          }
        }
      }

      // Sort by severity
      const severityOrder: Record<Severity, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };
      foundIssues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

      setIssues(foundIssues);
      setHasChecked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setIsChecking(false);
    }
  };

  const togglePersona = (persona: Persona) => {
    setSelectedPersonas((prev) => {
      const next = new Set(prev);
      if (next.has(persona)) {
        next.delete(persona);
      } else {
        next.add(persona);
      }
      return next;
    });
  };

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

  // Filter issues by selected personas
  const filteredIssues =
    selectedPersonas.size === 0
      ? issues
      : issues.filter((issue) => issue.affectedPersonas.some((p) => selectedPersonas.has(p)));

  // Count by severity
  const counts = {
    critical: filteredIssues.filter((i) => i.severity === "critical").length,
    serious: filteredIssues.filter((i) => i.severity === "serious").length,
    moderate: filteredIssues.filter((i) => i.severity === "moderate").length,
    minor: filteredIssues.filter((i) => i.severity === "minor").length,
  };

  // Export functions
  const exportJson = () => {
    const data = {
      timestamp: new Date().toISOString(),
      source: inputMode === "html" ? "HTML-Eingabe" : urlInput,
      summary: {
        total: filteredIssues.length,
        ...counts,
      },
      issues: filteredIssues,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aria-prüfbericht-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportMarkdown = () => {
    const date = new Date().toLocaleDateString("de-DE");
    let md = `# ARIA-Prüfbericht\n\n`;
    md += `**Geprüft am:** ${date}\n`;
    md += `**Quelle:** ${inputMode === "html" ? "HTML-Eingabe" : urlInput}\n\n`;

    md += `## Zusammenfassung\n\n`;
    md += `- Kritisch: ${counts.critical}\n`;
    md += `- Schwerwiegend: ${counts.serious}\n`;
    md += `- Mittel: ${counts.moderate}\n`;
    md += `- Leicht: ${counts.minor}\n\n`;

    md += `## Gefundene Probleme\n\n`;

    const severityGroups: Record<Severity, AriaIssue[]> = {
      critical: [],
      serious: [],
      moderate: [],
      minor: [],
    };

    filteredIssues.forEach((issue) => {
      severityGroups[issue.severity].push(issue);
    });

    for (const [severity, issues] of Object.entries(severityGroups)) {
      if (issues.length === 0) continue;

      md += `### ${severityConfig[severity as Severity].label}\n\n`;

      for (const issue of issues) {
        md += `#### ${issue.ruleName}\n\n`;
        md += `- **Element:** \`${issue.element}\`\n`;
        md += `- **WCAG:** ${issue.wcagCriteria}\n`;
        md += `- **Betroffene Personas:** ${issue.affectedPersonas.map((p) => personaConfig[p].label).join(", ")}\n`;
        md += `- **Lösung:** ${issue.suggestion}\n\n`;
        md += `\`\`\`html\n${issue.htmlSnippet}\n\`\`\`\n\n`;
      }
    }

    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aria-prüfbericht-${new Date().toISOString().split("T")[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PageLayout>
      <SEO
        title="ARIA-Checker"
        description="Prüfen Sie HTML auf fehlende oder falsche ARIA-Attribute. Mit WCAG-Referenzen, Schweregrad und konkreten Fix-Vorschlägen."
        canonical="/tools/aria-checker"
      />

      <main className="flex-1">
        {/* Hero Section */}
        <header className="pt-12 pb-8 px-6">
          <div className="max-w-3xl mx-auto text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
              <Code2 className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight mb-4">
              ARIA-Checker
            </h1>
            <p className="text-lg text-slate-600 font-light max-w-2xl mx-auto">
              Prüft HTML auf fehlende oder falsche ARIA-Attribute basierend auf BITV-2.0-Prüfberichten
            </p>
          </div>
        </header>

        <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
          {/* Side-by-side Layout: Input | Funktionen */}
          {!hasChecked && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* Input Section */}
              <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                {/* Tabs */}
                <div className="flex border-b border-slate-200">
                  <button
                    onClick={() => setInputMode("html")}
                    className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                      inputMode === "html"
                        ? "text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    HTML einfügen
                  </button>
                  <button
                    onClick={() => setInputMode("url")}
                    className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                      inputMode === "url"
                        ? "text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    URL prüfen
                  </button>
                </div>

                <div className="p-6">
                  {inputMode === "html" ? (
                    <div className="space-y-4">
                      <label htmlFor="html-input" className="sr-only">HTML-Code eingeben</label>
                      <textarea
                        id="html-input"
                        value={htmlInput}
                        onChange={(e) => setHtmlInput(e.target.value)}
                        placeholder="HTML-Code hier einfügen..."
                        className="w-full h-48 p-4 border border-slate-200 rounded-lg font-mono text-sm resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        aria-describedby="html-input-hint"
                      />
                      <p id="html-input-hint" className="text-xs text-slate-500">
                        Tipp: Kopieren Sie den HTML-Quellcode einer Seite oder Komponente
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex gap-2">
                        <label htmlFor="url-input" className="sr-only">URL zur Prüfung eingeben</label>
                        <input
                          id="url-input"
                          type="url"
                          value={urlInput}
                          onChange={(e) => setUrlInput(e.target.value)}
                          placeholder="https://beispiel.de/seite"
                          className="flex-1 px-4 py-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          aria-describedby="url-input-hint"
                        />
                      </div>
                      <p id="url-input-hint" className="text-xs text-slate-500">
                        Hinweis: Nur öffentlich zugängliche URLs können geprüft werden
                      </p>
                    </div>
                  )}

                  <button
                    onClick={runCheck}
                    disabled={isChecking || (inputMode === "html" ? !htmlInput.trim() : !urlInput.trim())}
                    className="mt-4 w-full py-3 px-4 bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-medium rounded-lg hover:from-indigo-600 hover:to-violet-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isChecking ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Prüfe...
                      </>
                    ) : (
                      <>
                        <Search className="w-5 h-5" />
                        Prüfen
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Funktionen Card - Side by Side */}
              <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center shrink-0">
                      <Info className="w-5 h-5 text-indigo-600" />
                    </div>
                    <h3 className="font-semibold text-slate-900">Geprüft werden</h3>
                  </div>
                  <ul className="space-y-2 text-sm">
                    {ariaRules.slice(0, 6).map((rule) => (
                      <li key={rule.id} className="flex items-start gap-2">
                        <span
                          className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                            rule.severity === "critical"
                              ? "bg-red-500"
                              : rule.severity === "serious"
                              ? "bg-orange-500"
                              : "bg-yellow-500"
                          }`}
                        />
                        <span className="text-slate-600">{rule.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Input Section - Full Width when results are shown */}
          {hasChecked && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              {/* Tabs */}
              <div className="flex border-b border-slate-200">
                <button
                  onClick={() => setInputMode("html")}
                  className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                    inputMode === "html"
                      ? "text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  HTML einfügen
                </button>
                <button
                  onClick={() => setInputMode("url")}
                  className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                    inputMode === "url"
                      ? "text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  URL prüfen
                </button>
              </div>

              <div className="p-6">
                {inputMode === "html" ? (
                  <div className="space-y-4">
                    <label htmlFor="html-input-full" className="sr-only">HTML-Code eingeben</label>
                    <textarea
                      id="html-input-full"
                      value={htmlInput}
                      onChange={(e) => setHtmlInput(e.target.value)}
                      placeholder="HTML-Code hier einfügen..."
                      className="w-full h-48 p-4 border border-slate-200 rounded-lg font-mono text-sm resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      aria-describedby="html-input-hint-full"
                    />
                    <p id="html-input-hint-full" className="text-xs text-slate-500">
                      Tipp: Kopieren Sie den HTML-Quellcode einer Seite oder Komponente
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <label htmlFor="url-input-full" className="sr-only">URL zur Prüfung eingeben</label>
                      <input
                        id="url-input-full"
                        type="url"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        placeholder="https://beispiel.de/seite"
                        className="flex-1 px-4 py-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        aria-describedby="url-input-hint-full"
                      />
                    </div>
                    <p id="url-input-hint-full" className="text-xs text-slate-500">
                      Hinweis: Nur öffentlich zugängliche URLs können geprüft werden
                    </p>
                  </div>
                )}

                <button
                  onClick={runCheck}
                  disabled={isChecking || (inputMode === "html" ? !htmlInput.trim() : !urlInput.trim())}
                  className="mt-4 w-full py-3 px-4 bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-medium rounded-lg hover:from-indigo-600 hover:to-violet-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isChecking ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Prüfe...
                    </>
                  ) : (
                    <>
                      <Search className="w-5 h-5" />
                      Erneut prüfen
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-red-800">{error}</p>
              <button onClick={() => setError(null)} className="ml-auto">
                <X className="w-5 h-5 text-red-600 hover:text-red-800" />
              </button>
            </div>
          )}

          {/* Results Section */}
          {hasChecked && (
            <>
              {/* Persona Filter */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h2 className="text-sm font-medium text-slate-700 mb-3">Nach Persona filtern</h2>
                <PersonaFilter selectedPersonas={selectedPersonas} onToggle={togglePersona} />
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {(["critical", "serious", "moderate", "minor"] as Severity[]).map((severity) => {
                  const config = severityConfig[severity];
                  const Icon = config.icon;
                  return (
                    <div
                      key={severity}
                      className={`${config.bg} border ${config.border} rounded-xl p-4 text-center`}
                    >
                      <Icon className={`w-6 h-6 ${config.text} mx-auto mb-2`} />
                      <p className={`text-2xl font-bold ${config.text}`}>{counts[severity]}</p>
                      <p className="text-sm text-slate-600">{config.label}</p>
                    </div>
                  );
                })}
              </div>

              {/* Issues List */}
              {filteredIssues.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-slate-900">
                      {filteredIssues.length} {filteredIssues.length === 1 ? "Problem" : "Probleme"} gefunden
                    </h2>
                    <div className="flex gap-2">
                      <button
                        onClick={exportJson}
                        className="inline-flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-medium text-slate-700 transition-colors"
                      >
                        <FileJson className="w-4 h-4" />
                        JSON
                      </button>
                      <button
                        onClick={exportMarkdown}
                        className="inline-flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-medium text-slate-700 transition-colors"
                      >
                        <FileText className="w-4 h-4" />
                        Markdown
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {filteredIssues.map((issue) => (
                      <IssueCard
                        key={issue.id}
                        issue={issue}
                        isOpen={expandedIssues.has(issue.id)}
                        onToggle={() => toggleIssue(issue.id)}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center">
                  <Sparkles className="w-12 h-12 text-green-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-green-800 mb-2">Keine Probleme gefunden</h3>
                  <p className="text-green-700">
                    {selectedPersonas.size > 0
                      ? "Für die ausgewählten Personas wurden keine ARIA-Probleme gefunden."
                      : "Das HTML enthält keine der geprüften ARIA-Probleme."}
                  </p>
                </div>
              )}
            </>
          )}

          {/* Im Behördenalltag */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200">
            <h3 className="font-semibold text-slate-900 mb-4 text-lg">Im Behördenalltag</h3>
            <div className="prose prose-gray max-w-none text-slate-600">
              <p className="mb-4">
                ARIA-Attribute (Accessible Rich Internet Applications) sind essenziell für die Barrierefreiheit
                dynamischer Webanwendungen. Sie ermöglichen Screenreadern und anderen assistiven Technologien,
                interaktive Elemente wie Menüs, Dialoge und Tabs korrekt anzukündigen.
              </p>
              <p className="mb-4">
                Die BITV 2.0 (Barrierefreie-Informationstechnik-Verordnung) fordert von öffentlichen Stellen,
                dass alle Web-Anwendungen die WCAG-Erfolgskriterien erfüllen. Fehlende oder falsche ARIA-Attribute
                können dazu führen, dass Nutzer mit Screenreadern wichtige Funktionen nicht bedienen können.
              </p>
              <p>
                Dieses Tool prüft Ihren HTML-Code automatisch auf die häufigsten ARIA-Fehler aus echten
                BITV-Prüfberichten und zeigt Ihnen, welche Nutzergruppen (Personas) von den gefundenen Problemen betroffen sind.
              </p>
            </div>
          </div>
        </div>
      </main>

    </PageLayout>
  );
}
