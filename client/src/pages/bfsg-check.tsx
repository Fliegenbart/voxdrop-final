import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { SEO, Schema } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Lock,
  Loader2,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { questions } from "@/data/bfsg/questions";
import { computeScopeResult, getVisibleQuestions, nextQuestionId } from "@/lib/bfsg/decision-tree";
import type { LeadData, ScopeResult, ScanResult } from "@/types/bfsg";
import { AnimatedNumber } from "@/components/bfsg-kompass/AnimatedNumber";
import { ScoreRing } from "@/components/bfsg-kompass/ScoreRing";
import { ShareButton } from "@/components/bfsg-kompass/ShareButton";
import { cn } from "@/lib/utils";

type FunnelStage =
  | { stage: "scope"; step: number }
  | { stage: "scope-result"; result: ScopeResult }
  | { stage: "scan-url"; scope?: ScopeResult }
  | { stage: "scan-lead"; url: string; scope?: ScopeResult }
  | { stage: "scanning"; scanId: string; url: string; scope?: ScopeResult; lead?: LeadData }
  | { stage: "scan-result"; result: ScanResult; scope?: ScopeResult; lead?: LeadData }
  | { stage: "conversion"; result: ScanResult; scope?: ScopeResult; lead?: LeadData };

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

function trackEvent(name: string, props?: Record<string, unknown>) {
  // Placeholder analytics hook (can be swapped for your analytics client)
  // eslint-disable-next-line no-console
  console.log(`[BFSG] event=${name}`, props || {});
}

function validateHttpUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return "Bitte geben Sie eine URL an.";
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "Bitte geben Sie eine gültige URL an (z.B. https://www.beispiel.de).";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "URL muss mit http:// oder https:// beginnen.";
  return null;
}

function formatEuro(value: number) {
  const n = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

function formatSeconds(value: number) {
  const n = Math.max(0, Number.isFinite(value) ? Math.round(value) : 0);
  if (n < 60) return `${n}s`;
  const min = Math.floor(n / 60);
  const sec = n % 60;
  return `${min}m ${sec}s`;
}

const severityChartColors = {
  critical: "var(--color-danger)",
  major: "var(--color-warning)",
  moderate: "var(--color-accent)",
  passed: "var(--color-primary)",
};

const scopeAnswerDependencies: Record<string, string[]> = {
  q0: ["q1", "q1a", "q2", "q3", "q4", "q5", "q6"],
  q1: ["q1a", "q2", "q3", "q4", "q5", "q6"],
  q1a: ["q2", "q3", "q4", "q5", "q6"],
  q2: ["q3", "q4", "q5", "q6"],
  q3: ["q4", "q5", "q6"],
  q4: ["q5", "q6"],
  q5: ["q6"],
};

function pruneScopeAnswers(
  current: Record<string, string | string[]>,
  questionId: string,
  answer: string | string[]
) {
  const next = { ...current, [questionId]: answer } as Record<string, string | string[]>;
  const dependent = scopeAnswerDependencies[questionId] || [];
  for (const key of dependent) {
    delete next[key];
  }
  return next;
}

function getVisibleScopeStep(answers: Record<string, string | string[]>, step: number) {
  const visible = getVisibleQuestions(answers);
  return Math.max(0, Math.min(step, Math.max(0, visible.length - 1)));
}

function getStepForQuestion(answers: Record<string, string | string[]>, questionId: string) {
  const visible = getVisibleQuestions(answers);
  const index = visible.indexOf(questionId);
  return Math.max(0, index);
}

function ToolFrame({
  children,
  containerClass,
  mainClass,
}: {
  children: React.ReactNode;
  containerClass?: string;
  mainClass?: string;
}) {
  const rootClass = cn("min-h-screen bg-[#FAFAFA]", containerClass || "");
  const contentClass = cn("mx-auto px-4 py-10", mainClass || "max-w-5xl");

  return (
    <div className={rootClass}>
      <a
        href="#bfsg-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 rounded bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow"
      >
        Zum Inhalt springen
      </a>

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-4 flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900">
            <Sparkles className="h-4 w-4" style={{ color: "var(--color-primary)" }} aria-hidden="true" />
            voxdrop
          </Link>
          <a
            href="https://voxdrop.live"
            className="text-sm text-slate-600 hover:text-[var(--color-primary)] hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            voxdrop.live →
          </a>
        </div>

        <div className="mx-auto max-w-5xl px-4 pb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">BFSG-KOMPASS</p>
          <p className="mt-1 text-sm text-slate-600">Ist Ihre Website barrierefrei? Finden Sie in wenigen Minuten heraus, wo Sie stehen.</p>
        </div>
      </header>

      <main id="bfsg-main" className={contentClass}>
        {children}
      </main>

      <footer className="border-t border-slate-200 bg-white mt-10">
        <div className="mx-auto max-w-5xl px-4 py-6 text-xs text-slate-600 space-y-3">
          <p>
            <strong>Rechtlicher Hinweis:</strong> Dieser Check ersetzt keine Rechtsberatung. Die Einschätzung basiert auf den BFSG
            Leitlinien und Ihren Angaben.
          </p>
          <nav className="flex flex-wrap items-center gap-3">
            <a href="/impressum" className="underline decoration-slate-300 hover:text-slate-900">
              Impressum
            </a>
            <a href="/datenschutz" className="underline decoration-slate-300 hover:text-slate-900">
              Datenschutz
            </a>
            <a href="/blog/bfsg-2025-leitfaden" className="underline decoration-slate-300 hover:text-slate-900">
              BFSG-Gesetzestext
            </a>
          </nav>
          <p>© 2025-2026 voxdrop.live — Barrierefreiheit für alle</p>
        </div>
      </footer>
    </div>
  );
}

function scoreSummaryText(compliance: ScanResult["compliance"]["bfsg"]) {
  if (compliance === "konform") return "Ihre Website erfüllt die BFSG‑Anforderungen weitgehend.";
  if (compliance === "teilweise") return "Ihre Website erfüllt die BFSG‑Anforderungen teilweise.";
  return "Ihre Website erfüllt die BFSG‑Anforderungen aktuell nicht ausreichend.";
}

function isScanResult(value: unknown): value is ScanResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ScanResult>;
  if (typeof candidate.url !== "string") return false;
  if (typeof candidate.score !== "number") return false;
  if (!Array.isArray(candidate.findings)) return false;
  if (!candidate.risk || typeof candidate.risk !== "object") return false;
  if (!candidate.compliance || typeof candidate.compliance !== "object") return false;
  if (!candidate.pageMeta || typeof candidate.pageMeta !== "object") return false;
  return true;
}

const leadSchema = z.object({
  email: z.string().email("Bitte geben Sie eine gültige E‑Mail‑Adresse ein"),
  name: z.string().trim().max(120).optional().or(z.literal("")),
  company: z.string().trim().max(160).optional().or(z.literal("")),
  newsletter: z.boolean().default(false),
  consent: z.boolean().refine((v) => v === true, { message: "Bitte stimmen Sie der Datenschutzerklärung zu" }),
});

const updatesSchema = z.object({
  email: z.string().email("Bitte geben Sie eine gültige E‑Mail‑Adresse ein"),
  newsletter: z.boolean().default(true),
  consent: z.boolean().refine((v) => v === true, { message: "Bitte stimmen Sie der Datenschutzerklärung zu" }),
});

const SIGNUP_URL = import.meta.env.VITE_SIGNUP_URL || "https://voxdrop.live/signup";
const TOOL_URL = import.meta.env.VITE_VOXDROP_URL || "https://voxdrop.live";
const scanProgressSteps = [
  { percent: 15, message: "Seite wird geladen …" },
  { percent: 30, message: "Seitenstruktur wird analysiert …" },
  { percent: 45, message: "Barrierefreiheit wird geprüft (axe-core) …" },
  { percent: 55, message: "Farbkontraste und Textalternativen …" },
  { percent: 90, message: "PDF-Dokumente werden geprüft (veraPDF) …" },
  { percent: 100, message: "Ergebnis wird berechnet …" },
];
const POLL_FALLBACK_MIN_DURATION_MS = 5_000;
const scanProgressMessages = scanProgressSteps.map((step) => step.message);

type ScanProgressState = {
  percent: number;
  message: string;
  details?: string[];
};

const scopeStatusCopy = {
  betroffen: {
    panelClass: "bg-[color-mix(in_srgb,var(--color-danger),white_88%)] border-[var(--color-danger)]/25",
    iconClass: "text-[var(--color-danger)]",
    title: "Ihr Unternehmen fällt wahrscheinlich unter das BFSG",
    description:
      "Das BFSG ist seit dem 28. Juni 2025 in Kraft. Websites und verbrauchergerichtete digitale Dienstleistungen müssen barrierefrei sein.",
  },
  "kleinstunternehmen": {
    panelClass: "bg-amber-50 border-amber-200",
    iconClass: "text-[var(--color-warning)]",
    title: "Sie könnten als Kleinstunternehmen ausgenommen sein",
    description: "Für Dienstleistungen kann eine Ausnahme greifen. Vorsicht: Für Produkte gilt diese Ausnahme nicht.",
  },
  "öffentlich": {
    panelClass: "bg-white border-slate-200",
    iconClass: "text-[var(--color-primary)]",
    title: "Für Sie gilt voraussichtlich die BITV 2.0 (öffentlicher Sektor)",
    description:
      "Öffentliche Stellen müssen i.d.R. zusätzlich zu EN 301 549 weitere Anforderungen erfüllen (z.B. Leichte Sprache / DGS‑Infos).",
  },
  "wahrscheinlich-nicht": {
    panelClass: "bg-[color-mix(in_srgb,var(--color-accent),white_88%)] border-[var(--color-accent)]/30",
    iconClass: "text-[var(--color-accent)]",
    title: "Ihr Unternehmen fällt wahrscheinlich nicht unter das BFSG",
    description:
      "Basierend auf Ihren Angaben scheint das BFSG aktuell nicht anwendbar zu sein. Barrierefreiheit bleibt dennoch ein UX‑ und SEO‑Vorteil.",
  },
} as const;

type ScanInitResponse = {
  scanId: string;
  cached: boolean;
  status?: "pending" | "running" | "completed" | "failed";
  result?: ScanResult;
  error?: string;
  message?: string;
};

type ScanStatusResponse = {
  scanId: string;
  status: "completed" | "running" | "pending" | "failed";
  result?: unknown;
  error?: string;
};

export default function BfsgCheckPage() {
  const [state, setState] = useState<FunnelStage>({ stage: "scope", step: 0 });
  const [scopeAnswers, setScopeAnswers] = useState<Record<string, string | string[]>>({});

  const [wizardDir, setWizardDir] = useState<1 | -1>(1);
  const reducedMotion = useMemo(() => prefersReducedMotion(), []);

  const [scanUrl, setScanUrl] = useState<string>("");
  const [scanUrlError, setScanUrlError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<ScanProgressState>({
    percent: 0,
    message: "Bereit",
    details: scanProgressMessages,
  });
  const [scanInProgress, setScanInProgress] = useState(false);
  const scanEventSourceRef = useRef<EventSource | null>(null);

  const [updatesSuccess, setUpdatesSuccess] = useState(false);
  const [updatesError, setUpdatesError] = useState<string | null>(null);

  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const scopeStartedAtRef = useRef<number | null>(null);

  const visibleQuestionIds = useMemo(() => getVisibleQuestions(scopeAnswers), [scopeAnswers]);
  const safeScopeStep = useMemo(
    () => (state.stage === "scope" ? getVisibleScopeStep(scopeAnswers, state.step) : 0),
    [scopeAnswers, state.stage, state.stage === "scope" ? state.step : 0]
  );
  const currentQuestionId = state.stage === "scope" ? visibleQuestionIds[safeScopeStep] : null;
  const currentQuestion = currentQuestionId ? questions.find((q) => q.id === currentQuestionId) : null;
  const headingAriaKey =
    state.stage === "scope"
      ? `scope-${safeScopeStep}-${currentQuestionId || "start"}`
      : state.stage === "scope-result"
      ? "scope-result"
      : state.stage === "scan-url"
      ? "scan-url"
      : state.stage === "scan-lead"
      ? "scan-lead"
      : state.stage === "scanning"
      ? "scanning"
      : state.stage === "scan-result"
      ? "scan-result"
      : "conversion";

  const faqJsonLd = useMemo(
    () => ({
      mainEntity: [
        {
          "@type": "Question",
          name: "Gilt das BFSG auch für bestehende Websites?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Das BFSG ist seit dem 28. Juni 2025 in Kraft. Ob und wie Übergänge im Detail greifen, hängt vom Angebot ab. Dieser Check ersetzt keine Rechtsberatung.",
          },
        },
        {
          "@type": "Question",
          name: "Deckt ein automatisierter Scan alle BFSG-Anforderungen ab?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Nein. Automatisierte Tests erkennen typischerweise nur einen Teil (ca. 30–50%) möglicher Barrieren. Für volle Konformität sind zusätzliche manuelle Tests nötig (z.B. Tastatur, Screenreader, Inhalte).",
          },
        },
        {
          "@type": "Question",
          name: "Gilt das BFSG für reine B2B-Angebote?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Typischerweise betrifft das BFSG verbrauchergerichtete (B2C) Dienstleistungen. Wenn Sie ausschließlich B2B anbieten, ist es häufig nicht anwendbar. Im Zweifel ist eine juristische Prüfung sinnvoll.",
          },
        },
      ],
    }),
    []
  );

  useEffect(() => {
    headingRef.current?.focus?.();
  }, [headingAriaKey]);

  useEffect(() => {
    if (state.stage === "scope" && safeScopeStep === 0) {
      scopeStartedAtRef.current = Date.now();
      trackEvent("scope_check_started");
    }
  }, [state.stage, safeScopeStep]);

  const scopeStep = state.stage === "scope" ? state.step : safeScopeStep;

  useEffect(() => {
    if (state.stage !== "scope") return;
    if (scopeStep === safeScopeStep) return;
    setState((prev) => ({ ...prev, stage: "scope", step: safeScopeStep }));
  }, [state.stage, scopeStep, safeScopeStep]);

  const leadForm = useForm<z.infer<typeof leadSchema>>({
    resolver: zodResolver(leadSchema),
    defaultValues: { email: "", name: "", company: "", newsletter: false, consent: false },
    mode: "onSubmit",
  });

  const updatesForm = useForm<z.infer<typeof updatesSchema>>({
    resolver: zodResolver(updatesSchema),
    defaultValues: { email: "", newsletter: true, consent: false },
    mode: "onSubmit",
  });

  useEffect(() => {
    return () => {
      scanEventSourceRef.current?.close();
      scanEventSourceRef.current = null;
    };
  }, []);

  async function submitUpdatesLead(values: z.infer<typeof updatesSchema>, scope?: ScopeResult) {
    setUpdatesError(null);
    setUpdatesSuccess(false);

    const resp = await fetch("/api/bfsg/lead", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: values.email,
        newsletter: values.newsletter,
        consent: values.consent,
        scopeResult: scope || undefined,
      }),
    });

    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data?.error || "Lead konnte nicht gespeichert werden.");
    }

    setUpdatesSuccess(true);
    trackEvent("lead_captured", { newsletter: !!values.newsletter, from: "scope_result" });
  }

  async function startScan(lead: z.infer<typeof leadSchema>, url: string, scope?: ScopeResult) {
    if (scanInProgress) return;

    const uxStartMs = Date.now();
    const ensureMinimumScanDuration = async (startAt: number) => {
      const elapsed = Date.now() - startAt;
      const waitMs = Math.max(0, POLL_FALLBACK_MIN_DURATION_MS - elapsed);
      if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
    };

    const normalizeResultFromPayload = (value: unknown) => (isScanResult(value) ? value : null);
    const fetchLatestStatus = async (scanId: string): Promise<ScanStatusResponse | null> => {
      try {
        const resultResp = await fetch(`/api/bfsg/scan/${encodeURIComponent(scanId)}`);
        if (!resultResp.ok) return null;
        return (await resultResp.json()) as ScanStatusResponse;
      } catch {
        return null;
      }
    };

    setScanError(null);
    setScanProgress({
      percent: 1,
      message: "Scan wird gestartet …",
      details: scanProgressMessages,
    });
    setScanInProgress(true);

    trackEvent("quick_scan_started", { from: scope ? "scope_result" : "direct" });
    trackEvent("lead_captured", { has_name: !!lead.name, has_company: !!lead.company, newsletter: !!lead.newsletter });

    const finishScanFlow = (nextState?: () => void, message?: string) => {
      setScanInProgress(false);
      scanEventSourceRef.current?.close();
      scanEventSourceRef.current = null;
      if (message) {
        setScanError(message);
      }
      if (nextState) {
        nextState();
      }
    };

    try {
      const resp = await fetch("/api/bfsg/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url,
          email: lead.email,
          name: lead.name || undefined,
          company: lead.company || undefined,
          newsletter: lead.newsletter || false,
          scopeResult: scope || undefined,
        }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        const msg = data?.message || data?.error || "Scan konnte nicht gestartet werden.";
        finishScanFlow(undefined, String(msg));
        return;
      }

      const data = (await resp.json()) as ScanInitResponse;
      const scanId = data.scanId;
      const leadData: LeadData = {
        email: lead.email,
        name: lead.name || undefined,
        company: lead.company || undefined,
        newsletter: lead.newsletter || false,
      };

      if (data.cached && data.status === "completed") {
        if (!isScanResult(data.result)) {
          finishScanFlow(() => setState({ stage: "scan-url", scope }), "Scan-Ergebnis konnte nicht geladen werden.");
          return;
        }

        const cachedResult = data.result;
        setScanProgress({ percent: 100, message: "Fertig", details: [] });
        trackEvent("scan_completed", { score: cachedResult.score, critical_findings: cachedResult.risk?.critical });
        finishScanFlow(() => setState({ stage: "scan-result", result: cachedResult, scope, lead: leadData }));
        return;
      }
      if (data.cached && data.status === "failed") {
        const failMsg = data.error || data.message || "Scan fehlgeschlagen.";
        finishScanFlow(() => setState({ stage: "scan-url", scope }), failMsg);
        return;
      }

      setState({ stage: "scanning", scanId, url, scope, lead: leadData });

      const es = new EventSource(`/api/bfsg/scan/${encodeURIComponent(scanId)}/stream`);
      scanEventSourceRef.current = es;
      let didComplete = false;

      const finalizeFailure = async (
        fallbackMessage = "Die Verbindung zum Scan ist abgebrochen. Bitte versuchen Sie es erneut.") => {
        const statusData = await fetchLatestStatus(scanId);

        const statusResult = statusData ? normalizeResultFromPayload(statusData.result) : null;
        if (statusData?.status === "completed" && statusResult) {
          setScanProgress({ percent: 100, message: "Fertig", details: [] });
          trackEvent("scan_completed", { score: statusResult.score, critical_findings: statusResult.risk?.critical });
          finishScanFlow(() => setState({ stage: "scan-result", result: statusResult, scope, lead: leadData }));
          return;
        }

        if (statusData?.status === "failed") {
          const message = statusData.error || fallbackMessage;
          finishScanFlow(() => setState({ stage: "scan-url", scope }), String(message || fallbackMessage));
          return;
        }

        if (statusData?.status === "running" || statusData?.status === "pending") {
          finishScanFlow(() => setState({ stage: "scan-url", scope }), "Der Scan ist noch nicht abgeschlossen. Bitte erneut starten.");
          return;
        }

        finishScanFlow(() => setState({ stage: "scan-url", scope }), fallbackMessage);
      };

      es.addEventListener("progress", (ev) => {
        try {
          const payload = JSON.parse((ev as MessageEvent).data || "{}") as {
            percent?: unknown;
            message?: unknown;
            details?: unknown;
          };
          const nextPercent = Number(payload.percent);
          const nextMessage =
            typeof payload?.message === "string" && payload.message.trim().length > 0
              ? payload.message
              : "Scan läuft …";
          const nextDetails =
            Array.isArray(payload?.details) && payload.details.length > 0
              ? payload.details.filter((item: unknown) => typeof item === "string")
              : scanProgressMessages;
          setScanProgress({
            percent: Number.isFinite(nextPercent) ? Math.max(1, Math.min(99, Math.round(nextPercent))) : 1,
            message: nextMessage,
            details: nextDetails,
          });
        } catch {
          // ignore malformed payloads
        }
      });

      es.addEventListener("complete", async (ev) => {
        didComplete = true;
        es.close();

        try {
          const payload = JSON.parse((ev as MessageEvent).data || "{}");
          const result = normalizeResultFromPayload(payload?.result);
          if (result) {
            await ensureMinimumScanDuration(uxStartMs);
            setScanProgress({ percent: 100, message: "Fertig", details: [] });
            trackEvent("scan_completed", { score: result?.score, critical_findings: result?.risk?.critical });
            finishScanFlow(() => setState({ stage: "scan-result", result, scope, lead: leadData }));
            return;
          }

          if (payload?.error) {
            const message = String(payload.error);
            if (message) {
              await finalizeFailure(message);
            }
            return;
          }
        } catch {
          // fall back to polling
        }

        await finalizeFailure("Scan konnte nicht abgeschlossen werden.");
      });

      es.addEventListener("scan-error", async (ev) => {
        if (didComplete) return;
        es.close();
        try {
          const payload = JSON.parse((ev as MessageEvent).data || "{}");
          if (typeof payload?.message === "string" && payload.message) {
            await finalizeFailure(String(payload.message));
            return;
          }
        } catch {
          // ignore parse errors and fallback
        }

        await finalizeFailure("Die Verbindung zum Scan ist abgebrochen. Bitte versuchen Sie es erneut.");
      });

      es.addEventListener("error", async () => {
        if (didComplete) return;
        es.close();
        await finalizeFailure("Die Verbindung zum Scan ist abgebrochen. Bitte versuchen Sie es erneut.");
      });

      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Scan konnte nicht gestartet werden.";
      finishScanFlow(undefined, message);
    }
  }

  function renderScopeWizard() {
    if (!currentQuestion) return null;

    const cq = currentQuestion;
    const pathTotal = Math.max(1, visibleQuestionIds.length);
    const total = Math.max(1, pathTotal);
    const currentIndex = safeScopeStep;
    const percent = Math.round(((Math.min(currentIndex + 1, total)) / total) * 100);

    const selected = scopeAnswers[cq.id];
    const multiSelected = Array.isArray(selected) ? (selected as string[]) : [];

    const anim = reducedMotion
      ? ""
      : wizardDir === 1
      ? "animate-in fade-in slide-in-from-right-6 duration-300"
      : "animate-in fade-in slide-in-from-left-6 duration-300";

    function completeWizard(nextAnswers: Record<string, string | string[]>) {
      const result = computeScopeResult(nextAnswers);
      const durationSeconds =
        scopeStartedAtRef.current ? Math.max(0, Math.round((Date.now() - scopeStartedAtRef.current) / 1000)) : undefined;
      trackEvent("scope_check_completed", { result: result.status, duration_seconds: durationSeconds });
      setState({ stage: "scope-result", result });
    }

    function setSingle(value: string) {
      setWizardDir(1);
      const nextAnswers = pruneScopeAnswers(scopeAnswers, cq.id, value);
      setScopeAnswers(nextAnswers);
      trackEvent("scope_check_question", { step: currentIndex + 1, id: cq.id, answer: value });

      const nextId = nextQuestionId(cq.id, nextAnswers);
      if (!nextId) return completeWizard(nextAnswers);

      const nextStep = getStepForQuestion(nextAnswers, nextId);
      setState({ stage: "scope", step: nextStep });
    }

    function toggleMulti(value: string) {
      const current = new Set(multiSelected);
      if (value === "none") {
        current.clear();
        current.add("none");
      } else {
        current.delete("none");
        if (current.has(value)) current.delete(value);
        else current.add(value);
      }
      const nextAnswers = pruneScopeAnswers(scopeAnswers, cq.id, Array.from(current));
      setScopeAnswers(nextAnswers);
      trackEvent("scope_check_question", { step: currentIndex + 1, id: cq.id, answer: Array.from(current) });
    }

    function goBack() {
      setWizardDir(-1);
      setState({ stage: "scope", step: Math.max(0, currentIndex - 1) });
    }

    function nextFromMulti() {
      setWizardDir(1);
      const nextAnswers = pruneScopeAnswers(scopeAnswers, cq.id, multiSelected);
      const nextId = nextQuestionId(cq.id, nextAnswers);
      if (!nextId) return completeWizard(nextAnswers);

      setState({ stage: "scope", step: getStepForQuestion(nextAnswers, nextId) });
    }

    return (
      <ToolFrame mainClass="max-w-3xl">
        <SEO
          title={cq ? `BFSG‑Kompass: ${cq.title}` : "BFSG‑Kompass"}
          description="Finden Sie in 60 Sekunden heraus, ob Ihr Unternehmen vom BFSG betroffen ist und wie barrierefrei Ihre Website bereits ist."
          canonical="/bfsg-check"
        />
        <Schema type="FAQPage" data={faqJsonLd} />
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 leading-tight">
          BFSG‑Kompass:{" "}
          <span className="text-transparent bg-clip-text" style={{ color: "var(--color-primary)" }}>
            Ist Ihre Website betroffen?
          </span>
        </h1>
        <p className="mt-2 text-slate-600">
          In unter 60 Sekunden zur ersten Einschätzung. Bis zu 8 Fragen, klarer Status, nächster Schritt.
          Keine Rechtsberatung. Automatisierte Tests decken typischerweise nur ca. 30–50% der möglichen Barrieren ab.
        </p>

        <div className="mt-6">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>Fortschritt</span>
            <span>
              {Math.min(currentIndex + 1, total)}/{total}
            </span>
          </div>
          <Progress
            className="mt-2"
            value={percent}
            aria-label="Fortschritt"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          />
        </div>

        <Card key={cq.id} className={cn("mt-6", anim)}>
          <CardHeader>
            <CardTitle className="text-xl">{cq.title}</CardTitle>
            {cq.description ? <p className="text-sm text-slate-600">{cq.description}</p> : null}
          </CardHeader>
          <CardContent>
            <fieldset
              className="grid gap-3"
              aria-label={cq.title}
              role={cq.type === "single" ? "radiogroup" : "group"}
              aria-labelledby={`bfsg-question-${cq.id}-title`}
            >
              <legend className="sr-only" id={`bfsg-question-${cq.id}-title`}>
                {cq.title}
              </legend>
              {cq.options.map((opt) => {
                const isChecked = cq.type === "single" ? selected === opt.value : multiSelected.includes(opt.value);
                const role = cq.type === "single" ? "radio" : "checkbox";
                return (
                  <label
                    key={opt.value}
                    className={[
                      "w-full rounded-xl border bg-white p-4 text-left shadow-sm outline-none",
                      "focus-within:ring-2 focus-within:ring-offset-2",
                      "focus-within:[--tw-ring-color:var(--color-primary)]",
                      isChecked
                        ? "border-2 border-[var(--color-primary)] ring-1 ring-[color:var(--color-primary)]"
                        : "border-slate-200 hover:border-slate-300",
                      reducedMotion ? "" : "transition-colors duration-200",
                    ].join(" ")}
                    role={role}
                    aria-checked={isChecked ? "true" : "false"}
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        if (cq.type === "single") {
                          setSingle(opt.value);
                        } else {
                          toggleMulti(opt.value);
                        }
                      }
                    }}
                  >
                    <input
                      type={cq.type === "single" ? "radio" : "checkbox"}
                      name={cq.type === "single" ? `bfsg-${cq.id}` : `bfsg-${cq.id}[]`}
                      checked={isChecked}
                      className="sr-only"
                      aria-hidden="true"
                      onChange={() => {
                        if (cq.type === "single") setSingle(opt.value);
                        else toggleMulti(opt.value);
                      }}
                      aria-label={opt.label}
                    />
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-slate-900">{opt.label}</div>
                        {opt.description ? <div className="mt-1 text-sm text-slate-600">{opt.description}</div> : null}
                      </div>
                      {isChecked ? <CheckCircle2 className="h-5 w-5" style={{ color: "var(--color-primary)" }} /> : null}
                    </div>
                  </label>
                );
              })}
            </fieldset>

            <div className="mt-6 flex items-center justify-between">
              <Button variant="ghost" onClick={goBack} disabled={currentIndex === 0}>
                Zurück
              </Button>
              {cq.type === "multi" ? (
                <Button onClick={nextFromMulti} disabled={!Array.isArray(selected) || (selected as string[]).length === 0}>
                  Weiter
                </Button>
              ) : (
                <span className="text-sm text-slate-600">Auswahl trifft direkt eine Entscheidung.</span>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <strong>Rechtlicher Hinweis:</strong> Dieser Check ersetzt keine Rechtsberatung. Die Einschätzung basiert auf Ihren Angaben.
        </div>
      </ToolFrame>
    );
  }

  function renderScopeResult(result: ScopeResult) {
    const ui = scopeStatusCopy[result.status];
    const icon =
      result.status === "betroffen" ? (
        <ShieldAlert className="mt-1 h-6 w-6" style={{ color: ui.iconClass }} />
      ) : result.status === "kleinstunternehmen" || result.status === "wahrscheinlich-nicht" ? (
        <AlertTriangle className="mt-1 h-6 w-6" style={{ color: ui.iconClass }} />
      ) : (
        <Building2 className="mt-1 h-6 w-6" style={{ color: ui.iconClass }} />
      );

    return (
      <ToolFrame mainClass="max-w-3xl">
        <SEO
          title="BFSG‑Kompass Ergebnis"
          description="Ergebnis Ihres BFSG‑Checks und nächster Schritt: Quick‑Scan Ihrer Website."
          canonical="/bfsg-check"
        />

        <h1 ref={headingRef} tabIndex={-1} className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
          BFSG‑Kompass Ergebnis
        </h1>

        <div className={cn("mt-6 rounded-xl border p-5", ui.panelClass)}>
          <div className="flex items-start gap-3">
            {icon}
            <div className="min-w-0">
              <div className="text-lg font-semibold text-slate-900">{ui.title}</div>
              <p className="mt-2 text-slate-700">{ui.description}</p>
              <p className="mt-3 text-slate-700">{result.explanation}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="secondary">Risiko: {result.riskLevel}</Badge>
                {result.relevantParagraphs.slice(0, 6).map((p) => (
                  <Badge key={p} variant="secondary">
                    {p}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>

        {result.status === "betroffen" ? (
          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
            <div className="font-semibold text-slate-900">Wichtig (Kurzüberblick)</div>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Bußgeldrisiko: bis zu 100.000 € pro Verstoß (Angabe ohne Gewähr).</li>
              <li>Für Websites ist Barrierefreiheit seit 28. Juni 2025 relevant.</li>
              <li>Automatisierte Tests decken nur einen Teil möglicher Barrieren ab.</li>
            </ul>
          </div>
        ) : null}

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-xl">Stufe 2: Quick‑Scan (kostenlos)</CardTitle>
            <p className="text-sm text-slate-600">
              Wir prüfen Ihre Startseite automatisiert mit axe-core (WCAG 2.1 AA) und checken gefundene PDFs mit veraPDF (PDF/UA‑1).
              Ergebnis in wenigen Sekunden.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="bfsg-scope-result-url">
                Website‑URL
              </label>
              <Input
                id="bfsg-scope-result-url"
                type="url"
                inputMode="url"
                placeholder="https://www.beispiel.de"
                value={scanUrl}
                onChange={(e) => {
                  setScanUrl(e.target.value);
                  setScanUrlError(null);
                }}
                aria-describedby="bfsg-scope-url-hint bfsg-scope-url-error"
              />
              <p id="bfsg-scope-url-hint" className="text-xs text-slate-500">
                Hinweis: Automatisierte Checks erkennen nicht alles (z.B. Tastatur‑UX, Screenreader‑Kompatibilität, Inhalte).
              </p>
              {scanUrlError ? (
                <p id="bfsg-scope-url-error" className="text-sm text-red-600" role="status">
                  {scanUrlError}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => {
                  const err = validateHttpUrl(scanUrl);
                  if (err) return setScanUrlError(err);
                  setScanError(null);
                  setState({ stage: "scan-lead", url: scanUrl.trim(), scope: result });
                }}
                disabled={scanInProgress}
              >
                Jetzt prüfen
              </Button>
              <Button
                asChild
                variant="outline"
                onClick={() => trackEvent("conversion_cta_clicked", { type: "signup", from: "scope_result" })}
              >
                <a href={SIGNUP_URL}>
                  Oder direkt loslegen
                </a>
              </Button>
              <Button variant="ghost" onClick={() => setState({ stage: "scope", step: 0 })}>
                Antworten ändern
              </Button>
            </div>
            <p className="text-xs text-slate-500" id="bfsg-scope-result-hint">
              Die URL wird serverseitig geprüft. Ergebnisse können je nach Infrastruktur variieren.
            </p>
          </CardContent>
        </Card>

        {result.status === "wahrscheinlich-nicht" ? (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-xl">Updates erhalten (optional)</CardTitle>
              <p className="text-sm text-slate-600">
                Wenn sich die Rechtslage ändert, informieren wir Sie auf Wunsch per E‑Mail. Kein Spam.
              </p>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-4"
                onSubmit={updatesForm.handleSubmit(async (values) => {
                  try {
                    await submitUpdatesLead(values, result);
                  } catch (err) {
                    setUpdatesError(err instanceof Error ? err.message : String(err));
                  }
                })}
              >
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="bfsg-updates-email">
                    E‑Mail
                  </label>
                  <Input id="bfsg-updates-email" type="email" {...updatesForm.register("email")} />
                  {updatesForm.formState.errors.email ? (
                    <p className="text-sm text-red-600">{updatesForm.formState.errors.email.message}</p>
                  ) : null}
                </div>

                <div className="flex items-start gap-3">
                  <Checkbox
                    id="bfsg-updates-consent"
                    checked={!!updatesForm.watch("consent")}
                    onCheckedChange={(v) => updatesForm.setValue("consent", v === true, { shouldValidate: true })}
                  />
                  <div className="grid gap-1">
                    <label htmlFor="bfsg-updates-consent" className="text-sm font-medium text-slate-800">
                      Ich stimme der Datenschutzerklärung zu (Pflicht)
                    </label>
                    {updatesForm.formState.errors.consent ? (
                      <p className="text-sm text-red-600">{updatesForm.formState.errors.consent.message}</p>
                    ) : (
                      <p className="text-xs text-slate-500">DSGVO‑konform. Keine Weitergabe an Dritte.</p>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Checkbox
                    id="bfsg-updates-newsletter"
                    checked={!!updatesForm.watch("newsletter")}
                    onCheckedChange={(v) => updatesForm.setValue("newsletter", v === true)}
                  />
                  <label htmlFor="bfsg-updates-newsletter" className="text-sm text-slate-800">
                    Ich möchte Updates zu Barrierefreiheit und BFSG erhalten
                  </label>
                </div>

                {updatesError ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{updatesError}</div> : null}
                {updatesSuccess ? (
                  <div className="rounded-lg border border-[var(--color-accent)]/30 bg-[color-mix(in_srgb,var(--color-accent),white_88%)] p-3 text-sm text-slate-900">
                    Danke. Wir haben Ihre E‑Mail gespeichert.
                  </div>
                ) : null}

                <Button type="submit">Updates speichern</Button>
              </form>
            </CardContent>
          </Card>
        ) : null}
      </ToolFrame>
    );
  }

  function renderScanUrl(scope?: ScopeResult) {
    return (
      <ToolFrame mainClass="max-w-3xl">
        <SEO title="Quick‑Scan (kostenlos)" description="URL eingeben, dann E‑Mail bestätigen, dann Scan starten." canonical="/bfsg-check" />
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
          Quick‑Scan (kostenlos)
        </h1>
        {scanError ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{scanError}</div> : null}
        <p className="mt-2 text-slate-600">URL eingeben, dann E‑Mail bestätigen, dann Scan starten.</p>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-xl">Website‑URL</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Input
              id="bfsg-scan-url"
              type="url"
              inputMode="url"
              placeholder="https://www.beispiel.de"
              value={scanUrl}
              onChange={(e) => {
                setScanUrl(e.target.value);
                setScanUrlError(null);
              }}
              aria-describedby="bfsg-url-quick-hint bfsg-url-quick-error"
            />
            {scanUrlError ? (
              <p id="bfsg-url-quick-error" className="text-sm text-red-600" role="status">
                {scanUrlError}
              </p>
            ) : null}
            <p id="bfsg-url-quick-hint" className="text-xs text-slate-500">
              Nur die Startseite scannen; zusätzliche Seiten werden innerhalb der Analysezeit nicht automatisch geprüft.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => {
                  const err = validateHttpUrl(scanUrl);
                  if (err) return setScanUrlError(err);
                  setScanError(null);
                  setState({ stage: "scan-lead", url: scanUrl.trim(), scope });
                }}
                disabled={scanInProgress}
              >
                Weiter
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setScanError(null);
                  setScanUrlError(null);
                  setState({ stage: "scope", step: 0 });
                }}
              >
                Zum BFSG‑Check
              </Button>
            </div>
          </CardContent>
        </Card>
      </ToolFrame>
    );
  }

  function renderScanLead(url: string, scope?: ScopeResult) {
    return (
      <ToolFrame mainClass="max-w-3xl">
        <SEO title="Quick‑Scan starten" description="E‑Mail angeben und kostenlosen BFSG‑Quick‑Scan starten." canonical="/bfsg-check" />
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
          Quick‑Scan starten
        </h1>
        <p className="mt-2 text-slate-600">
          Wohin sollen wir Ihren Barrierefreiheits‑Report senden? Wir speichern Ihre E‑Mail nur für den Scan und optional Newsletter.
        </p>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-xl">Ihre Daten</CardTitle>
            <p className="text-sm text-slate-600">
              URL: <span className="font-mono">{url}</span>
            </p>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4"
              onSubmit={leadForm.handleSubmit(async (values) => {
                try {
                  await startScan(values, url, scope);
                } catch (err) {
                  setScanError(err instanceof Error ? err.message : String(err));
                }
              })}
            >
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-700" htmlFor="bfsg-email">
                  E‑Mail (Pflicht)
                </label>
                <Input id="bfsg-email" type="email" {...leadForm.register("email")} />
                {leadForm.formState.errors.email ? (
                  <p className="text-sm text-red-600">{leadForm.formState.errors.email.message}</p>
                ) : null}
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="bfsg-name">
                    Name (optional)
                  </label>
                  <Input id="bfsg-name" {...leadForm.register("name")} />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="bfsg-company">
                    Unternehmen (optional)
                  </label>
                  <Input id="bfsg-company" {...leadForm.register("company")} />
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox
                  id="bfsg-consent"
                  checked={!!leadForm.watch("consent")}
                  onCheckedChange={(v) => leadForm.setValue("consent", v === true, { shouldValidate: true })}
                />
                <div className="grid gap-1">
                  <label htmlFor="bfsg-consent" className="text-sm font-medium text-slate-800">
                    Ich stimme der Datenschutzerklärung zu (Pflicht)
                  </label>
                  {leadForm.formState.errors.consent ? (
                    <p className="text-sm text-red-600">{leadForm.formState.errors.consent.message}</p>
                  ) : (
                    <p className="text-xs text-slate-500">DSGVO‑konform. Keine Weitergabe an Dritte. Verarbeitung in der EU.</p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox
                  id="bfsg-newsletter"
                  checked={!!leadForm.watch("newsletter")}
                  onCheckedChange={(v) => leadForm.setValue("newsletter", v === true)}
                />
                <label htmlFor="bfsg-newsletter" className="text-sm text-slate-800">
                  Ich möchte Updates zu Barrierefreiheit und BFSG erhalten (optional)
                </label>
              </div>

              {scanError ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{scanError}</div> : null}

              <div className="flex items-center gap-2">
                <Button type="submit" disabled={scanInProgress}>
                  {scanInProgress ? "Scan startet …" : "Scan starten"}
                </Button>
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => {
                    setScanError(null);
                    setScanUrlError(null);
                    setState({ stage: "scan-url", scope });
                  }}
                  disabled={scanInProgress}
                >
                  Zurück
                </Button>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
                <strong>Scan‑Hinweis:</strong> Automatisierte Tests decken nur einen Teil möglicher Barrieren ab. Für volle BFSG‑Konformität sind zusätzliche manuelle Checks erforderlich.
              </div>
            </form>
          </CardContent>
        </Card>
      </ToolFrame>
    );
  }

  function renderScanning(url: string) {
    const pct = Math.max(0, Math.min(100, Number(scanProgress.percent || 0)));
    const currentIndex = scanProgressSteps.findIndex((s) => pct < s.percent);
    const activeIdx = currentIndex === -1 ? scanProgressSteps.length - 1 : Math.max(0, currentIndex);
    const detailList = scanProgress?.details && scanProgress.details.length > 0 ? scanProgress.details : scanProgressMessages;

    return (
      <ToolFrame mainClass="max-w-3xl">
        <SEO title="Scan läuft …" description="BFSG Quick‑Scan läuft." canonical="/bfsg-check" />
          <h1 ref={headingRef} tabIndex={-1} className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
            Scan läuft …
          </h1>
          <p className="mt-2 text-slate-600">
            URL: <span className="font-mono">{url}</span>
          </p>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-xl">Fortschritt</CardTitle>
              <p className="text-sm text-slate-600" aria-live="polite">
                {scanProgress.message}
              </p>
            </CardHeader>
            <CardContent>
              <Progress
                role="progressbar"
                value={pct}
                aria-label="Scan-Fortschritt"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                aria-valuetext={scanProgress.message}
              />

              <div className="mt-4 grid gap-2">
                {scanProgressSteps.map((s, idx) => {
                  const isDone = pct >= s.percent;
                  const isActive = idx === activeIdx && !isDone;
                  const label = detailList[idx] || s.message;
                  return (
                    <div key={s.message} className="flex items-center gap-2 text-sm text-slate-700">
                      {isDone ? (
                        <CheckCircle2 className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
                      ) : isActive ? (
                        <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--color-primary)" }} />
                      ) : (
                        <div className="h-4 w-4 rounded-full border border-slate-300" aria-hidden="true" />
                      )}
                      <span className={isDone ? "text-slate-700" : "text-slate-600"}>{label}</span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                Automatisierte Tests erkennen typischerweise nur ca. 30–50% möglicher Barrieren. Für volle Compliance braucht es
                manuelle Checks (Tastatur, Screenreader, Inhalte).
              </div>
            </CardContent>
          </Card>
      </ToolFrame>
    );
  }

  function renderScanResult(result: ScanResult, scope?: ScopeResult, lead?: LeadData) {
    const score = Number(result?.score ?? 0);
    const compliance = result?.compliance?.bfsg || "teilweise";
    const findings = Array.isArray(result?.findings) ? result.findings : [];
    const visibleFindings = findings.slice(0, 5);
    const hiddenCount = Math.max(0, findings.length - visibleFindings.length);
    const screenshotDataUrl = result?.screenshot
      ? `data:image/jpeg;base64,${result.screenshot}`
      : null;

    const pdf = result?.compliance?.pdf_ua;
    const pdfSummary =
      pdf && typeof pdf.scanned === "number"
        ? `${pdf.compliant}/${pdf.scanned} PDFs PDF/UA‑konform`
        : "PDF/UA: nicht geprüft";
    const pdfWarnings = Array.isArray(pdf?.warnings) ? pdf.warnings : [];
    const scanDuration = Number.isFinite(result?.scanDuration) ? result.scanDuration : 0;
    const riskChartData = [
      { key: "critical", name: "Kritisch", value: Number(result?.risk?.critical ?? 0), color: severityChartColors.critical },
      { key: "major", name: "Schwerwiegend", value: Number(result?.risk?.major ?? 0), color: severityChartColors.major },
      { key: "moderate", name: "Moderat", value: Number(result?.risk?.moderate ?? 0), color: severityChartColors.moderate },
      { key: "passed", name: "Bestanden", value: Number(result?.risk?.passed ?? 0), color: severityChartColors.passed },
    ];
    const riskChartTotal = riskChartData.reduce((sum, item) => sum + item.value, 0);
    const activeRiskData = riskChartData.filter((item) => item.value > 0);
    const hasRiskData = activeRiskData.length > 0;

    const shareUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/bfsg-check?ref=share`
        : `${TOOL_URL}/bfsg-check?ref=share`;

    return (
      <ToolFrame mainClass="max-w-5xl">
        <SEO title="Quick‑Scan Ergebnis" description="BFSG Quick‑Scan Ergebnis." canonical="/bfsg-check" />

          <h1 ref={headingRef} tabIndex={-1} className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
            Quick‑Scan Ergebnis
          </h1>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-xl">Barrierefreiheits‑Score</CardTitle>
                <p className="text-sm text-slate-600">{scoreSummaryText(compliance)}</p>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    <ScoreRing score={score} size={156}>
                      <div className="text-center">
                        <div className="text-4xl font-bold text-slate-900 leading-none">
                          <AnimatedNumber value={score} />
                        </div>
                        <div className="mt-1 text-xs text-slate-500">von 100</div>
                      </div>
                    </ScoreRing>
                    <div className="text-sm text-slate-600">
                      <div>
                        <span className="font-semibold text-slate-900">{Math.round(score)}%</span> automatischer Status
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs">
                        <Badge variant="secondary">kritisch: {result?.risk?.critical ?? 0}</Badge>
                        <Badge variant="secondary">schwerwiegend: {result?.risk?.major ?? 0}</Badge>
                        <Badge variant="secondary">moderat: {result?.risk?.moderate ?? 0}</Badge>
                        <Badge variant="secondary">bestanden: {result?.risk?.passed ?? 0}</Badge>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">Scandauer: {formatSeconds(scanDuration)}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <ShareButton
                      url={shareUrl}
                      title={`BFSG‑Score: ${score}/100`}
                      text="Ich habe meine Website im BFSG‑Kompass geprüft."
                      onShare={(mode) => trackEvent("conversion_cta_clicked", { type: "share", mode })}
                    />
                    <Button variant="outline" onClick={() => setState({ stage: "scan-url", scope })}>
                      Weitere URL prüfen
                    </Button>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-[340px_1fr]">
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <p className="text-xs text-slate-500">Risiko-Verteilung</p>
                    <div className="mt-2 h-[188px] w-full" aria-label="Risiko-Aufteilung nach Schweregrad">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={hasRiskData ? activeRiskData : [{ key: "empty", name: "Keine Daten", value: 1, color: "#cbd5e1" }]}
                            dataKey="value"
                            nameKey="name"
                            outerRadius={78}
                            innerRadius={44}
                            isAnimationActive={!reducedMotion}
                            animationDuration={700}
                            startAngle={90}
                            endAngle={-270}
                          >
                            {(hasRiskData ? activeRiskData : [{ key: "empty", name: "Keine Daten", value: 1, color: "#cbd5e1" }]).map((entry) => (
                              <Cell key={entry.key} fill={entry.color} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-2 grid gap-2 text-xs">
                      {riskChartData.map((item) => (
                        <div key={item.key} className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-2">
                            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                            {item.name}
                          </span>
                          <span>{item.value}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">{pdfSummary}</p>
                    <p className="text-xs text-slate-500">
                      {riskChartTotal > 0 ? `${riskChartTotal} Kriterien bewertet` : "Noch keine KPI-Daten"}
                    </p>
                  </div>

                  <div className="grid gap-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="text-xs text-slate-500">BFSG / EN 301 549</div>
                      <div className="mt-1 text-xl font-bold text-slate-900">
                        {compliance === "konform"
                          ? "Konform"
                          : compliance === "teilweise"
                          ? "Teilweise"
                          : "Nicht konform"}
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        WCAG 2.1 AA: {result?.compliance?.wcag_aa?.passed ?? 0} von {result?.compliance?.wcag_aa?.total ?? 0}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="text-xs text-slate-500">PDF/UA</div>
                      <div className="mt-1 text-xl font-bold text-slate-900">
                        {pdf?.non_compliant ?? 0} nicht‑konforme PDF-Dateien
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        Konform: {pdf?.compliant ?? 0}, übersprungen: {pdf?.skipped ?? 0}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="text-xs text-slate-500">BitV/ Behördenrahmen</div>
                      <p className="mt-1 text-sm text-slate-900">Zusätzliche Prüfung empfohlen (BITV 2.0).</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {screenshotDataUrl ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">Scan-Screenshot</CardTitle>
                  <p className="text-sm text-slate-600">Vorschaubild der Startseite zum Scan-Zeitpunkt.</p>
                </CardHeader>
                <CardContent>
                  <img
                    src={screenshotDataUrl}
                    alt="Vorschaubild der gescannten Startseite"
                    className="w-full rounded-lg border border-slate-200"
                    loading="lazy"
                  />
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Stufe 3: Vollreport</CardTitle>
                <p className="text-sm text-slate-600">Compliance‑Report nach Anlage 3 BFSG (Teaser) + Signup‑Wall.</p>
              </CardHeader>
              <CardContent className="grid gap-3">
                <Button
                  onClick={() => {
                    trackEvent("conversion_cta_clicked", { type: "report" });
                    setState({ stage: "conversion", result, scope, lead });
                  }}
                >
                  Vollständigen Report freischalten
                </Button>
                <Button
                  asChild
                  onClick={() => trackEvent("conversion_cta_clicked", { type: "signup", from: "scan_result" })}
                >
                  <a href={SIGNUP_URL}>Kostenlos registrieren</a>
                </Button>
                <p className="text-xs text-slate-500">
                  Hinweis: Für Behörden (BITV 2.0) gelten zusätzlich Anforderungen wie Leichte Sprache / DGS‑Infos.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Top‑Findings (Auszug)</CardTitle>
                <p className="text-sm text-slate-600">
                  Die ersten 5 Findings sind sichtbar. Der Vollreport enthält alle Findings inkl. Maßnahmen.
                </p>
              </CardHeader>
              <CardContent>
                {visibleFindings.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <Sparkles className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
                    Keine automatisierten Findings auf der Startseite gefunden (das ist selten, aber möglich).
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {visibleFindings.map((f) => (
                      <div key={f.id || f.title} className="rounded-xl border border-slate-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900">
                              {f.title || f.id}{" "}
                              {f.voxdrop_can_fix ? (
                                <Badge variant="secondary" className="ml-2">
                                  voxdrop kann helfen
                                </Badge>
                              ) : null}
                            </div>
                            <div className="mt-1 text-sm text-slate-600">{f.description}</div>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                              <span>WCAG‑Level: {f.wcag_level || "A"}</span>
                              {f.count ? <span>Vorkommen: {f.count}</span> : null}
                            </div>
                          </div>
                          <Badge variant="secondary">{f.severity}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {hiddenCount > 0 ? (
                  <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    <Lock className="h-4 w-4 text-slate-500" />
                    <span>
                      {hiddenCount} weitere Findings sind im Vollreport sichtbar (inkl. Priorisierung und Empfehlungen).
                    </span>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <div className="grid gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">Compliance‑Status</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm text-slate-700">
                  <div className="flex items-center justify-between">
                    <span>BFSG / EN 301 549</span>
                    <Badge variant="secondary">
                      {result.compliance?.bfsg === "konform"
                        ? "konform"
                        : result.compliance?.bfsg === "teilweise"
                        ? "teilweise konform"
                        : "nicht konform"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>WCAG 2.1 AA</span>
                    <span className="text-slate-600">
                      {result.compliance?.wcag_aa?.passed ?? 0} von {result.compliance?.wcag_aa?.total ?? 0} Checks bestanden (
                      {result.compliance?.wcag_aa?.percentage ?? 0}%)
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>PDF/UA</span>
                    <span className="text-slate-600">
                      {pdf?.non_compliant ?? 0} nicht‑konforme PDFs, {pdf?.compliant ?? 0} konform
                      {pdf?.skipped ? `, ${pdf.skipped} übersprungen` : ""}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>BITV 2.0</span>
                    <span className="text-slate-600">zusätzliche Prüfung nötig</span>
                  </div>
                  {pdfWarnings.length > 0 ? (
                    <div className="grid gap-2 rounded-lg border border-[var(--color-warning)]/30 bg-amber-50 p-3 text-slate-900">
                      <div className="text-sm font-semibold">PDF/UA-Hinweis</div>
                      <ul className="list-disc space-y-1 pl-5 text-xs">
                        {pdfWarnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">Risiko‑Kalkulation (Indikativ)</CardTitle>
                  <p className="text-sm text-slate-600">Marketing‑Richtwert, keine Rechtsberatung.</p>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm text-slate-700">
                  <div className="flex items-center justify-between">
                    <span>Potenzielle Bußgelder</span>
                    <span className="font-semibold text-slate-900">bis zu {formatEuro(result?.risk?.maxFine ?? 0)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Agentur (manuell)</span>
                    <span className="text-slate-600">15.000 – 35.000 €/Jahr</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>voxdrop (automatisiert)</span>
                    <span className="text-slate-600">ab 99 €/Monat</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4" style={{ color: "var(--color-warning)" }} />
              <div>
                <strong>Scan‑Disclaimer:</strong> Dieser automatisierte Scan prüft Ihre Website gegen einen Teil der WCAG 2.1 AA / EN 301 549 Regeln mithilfe von axe-core. Automatisierte Tests decken typischerweise nur ca. 30–50% der möglichen Barrieren ab. Für eine vollständige BFSG‑Konformitätsprüfung sind zusätzlich manuelle Tests erforderlich.
              </div>
            </div>
          </div>

          {scope ? (
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <div className="font-semibold text-slate-900">Ihre Stufe‑1 Einschätzung</div>
              <div className="mt-1 text-slate-600">
                Status: <span className="font-medium text-slate-900">{scope.status}</span>, Risiko:{" "}
                <span className="font-medium text-slate-900">{scope.riskLevel}</span>
              </div>
            </div>
          ) : null}
      </ToolFrame>
    );
  }

  function renderConversion(result: ScanResult, scope?: ScopeResult, lead?: LeadData) {
    const score = Number(result?.score ?? 0);
    const emailParam = lead?.email ? `?email=${encodeURIComponent(lead.email)}` : "";
    const signupUrl = `${SIGNUP_URL}${emailParam}`;

    return (
      <ToolFrame mainClass="max-w-5xl">
        <SEO title="Compliance‑Report (Teaser)" description="Report‑Teaser + Signup." canonical="/bfsg-check" />

          <h1 ref={headingRef} tabIndex={-1} className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
            Compliance‑Report nach Anlage 3 BFSG
          </h1>
          <p className="mt-2 text-slate-600">
            Vorschau (gekürzt). Vollständiger Report inkl. Maßnahmen, Priorisierung und Dokumentationsvorlage nach Signup.
          </p>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-xl">Ihr Score</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center">
                  <ScoreRing score={score} size={156}>
                    <div className="text-center">
                      <div className="text-4xl font-bold text-slate-900 leading-none">
                        <AnimatedNumber value={score} />
                      </div>
                      <div className="mt-1 text-xs text-slate-500">von 100</div>
                    </div>
                  </ScoreRing>
                </div>
                <div className="mt-4 grid gap-2">
                  <Button
                    asChild
                    onClick={() => trackEvent("conversion_cta_clicked", { type: "signup", from: "conversion" })}
                  >
                    <a href={signupUrl}>Jetzt kostenlos starten</a>
                  </Button>
                  <p className="rounded-lg border border-[var(--color-accent)]/30 bg-[color-mix(in_srgb,var(--color-accent),white_88%)] p-3 text-sm text-slate-900">
                    14 Tage kostenlos testen • jederzeit kündbar.
                  </p>
                  <Button variant="outline" onClick={() => setState({ stage: "scan-result", result, scope, lead })}>
                    Zurück zum Ergebnis
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-xl">Report‑Vorschau</CardTitle>
                <p className="text-sm text-slate-600">Gebrandete PDF‑Vorschau (Blur‑Overlay ab 70%).</p>
              </CardHeader>
              <CardContent>
                <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-6">
                  <div className="grid gap-3">
                    <div className="h-4 w-2/3 rounded bg-slate-200" />
                    <div className="h-3 w-full rounded bg-slate-100" />
                    <div className="h-3 w-11/12 rounded bg-slate-100" />
                    <div className="h-3 w-10/12 rounded bg-slate-100" />
                    <div className="mt-4 h-4 w-1/2 rounded bg-slate-200" />
                    <div className="h-3 w-full rounded bg-slate-100" />
                    <div className="h-3 w-5/6 rounded bg-slate-100" />
                    <div className="h-3 w-4/6 rounded bg-slate-100" />
                  </div>

                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-white via-white/95 to-white/0" />
                  <div className="absolute inset-x-0 bottom-4 flex items-center justify-center">
                    <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow">
                      Vollreport nach Signup freischalten
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Feature‑Vergleich</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-700">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">Feature</th>
                        <th className="px-4 py-3 text-left font-semibold">Ohne voxdrop</th>
                        <th className="px-4 py-3 text-left font-semibold">Mit voxdrop</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-700">
                      {[
                        ["Einmalige Prüfung", "✓ (manuell)", "✓ (automatisiert)"],
                        ["Continuous Monitoring", "✗", "✓"],
                        ["PDF/UA‑Konvertierung", "✗", "✓"],
                        ["BITV 2.0 + BFSG", "✗", "✓"],
                        ["Compliance‑Report", "✗", "✓ (automatisch)"],
                        ["DGS / Leichte Sprache", "✗", "✓"],
                        ["Kosten", "Projektabhängig", "ab 99 €/Monat"],
                        ["Testphase", "–", "14 Tage kostenfrei"],
                      ].map((row) => (
                        <tr key={row[0]} className="border-t border-slate-200">
                          <td className="px-4 py-3 font-medium text-slate-900">{row[0]}</td>
                          <td className="px-4 py-3">{row[1]}</td>
                          <td className="px-4 py-3">{row[2]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Trust Signals</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm text-slate-700">
                <div className="rounded-lg border border-slate-200 bg-white p-3">100% DSGVO‑konform (keine Weitergabe an Dritte)</div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">Basiert auf EN 301 549 / WCAG 2.1 AA</div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">Automatisiert + geführte manuelle Checks</div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">Bestehende Kundenreferenzen nur mit Erlaubnis verwenden.</div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  Optional: Audit-Trail und Dokumentationspaket im Report inklusive.
                </div>
              </CardContent>
            </Card>
          </div>

          {scope ? (
            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
              <strong>Ihre Stufe‑1 Einschätzung:</strong> Status <span className="font-semibold">{scope.status}</span>, Risiko{" "}
              <span className="font-semibold">{scope.riskLevel}</span>.
            </div>
          ) : null}
      </ToolFrame>
    );
  }

  // Stage router
  if (state.stage === "scope") return renderScopeWizard();
  if (state.stage === "scope-result") return renderScopeResult(state.result);
  if (state.stage === "scan-url") return renderScanUrl(state.scope);
  if (state.stage === "scan-lead") return renderScanLead(state.url, state.scope);
  if (state.stage === "scanning") return renderScanning(state.url);
  if (state.stage === "scan-result") return renderScanResult(state.result, state.scope, state.lead);
  if (state.stage === "conversion") return renderConversion(state.result, state.scope, state.lead);
  return null;
}
