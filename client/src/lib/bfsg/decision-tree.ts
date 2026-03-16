import type { RiskLevel, ScopeResult, ScopeStatus } from "@/types/bfsg";

function computeRiskLevel(q6: string[]): RiskLevel {
  const signals = new Set((q6 || []).filter((x) => x && x !== "none"));
  if (signals.has("forms") || signals.has("chat") || signals.has("calendar")) return "hoch";
  if (signals.has("pdf") || signals.has("video") || signals.has("maps")) return "mittel";
  if (signals.size >= 2) return "mittel";
  if (signals.size === 1) return "mittel";
  return "niedrig";
}

function result(
  status: ScopeStatus,
  riskLevel: RiskLevel,
  selectedServices: string[],
  explanation: string,
  relevantParagraphs: string[] = []
): ScopeResult {
  return { status, relevantParagraphs, riskLevel, selectedServices, explanation };
}

export function computeScopeResult(answers: Record<string, string | string[]>): ScopeResult {
  const q0 = (answers.q0 as string | undefined) || undefined;
  const q1 = (answers.q1 as string | undefined) || undefined;
  const q1a = (answers.q1a as string | undefined) || undefined;
  const q2 = (answers.q2 as string[] | undefined) || [];
  const q3 = (answers.q3 as string | undefined) || undefined;
  const q4 = (answers.q4 as string | undefined) || undefined;
  const q5 = (answers.q5 as string | undefined) || undefined;
  const q6 = (answers.q6 as string[] | undefined) || [];

  const riskLevel = computeRiskLevel(q6);

  if (q0 === "public") {
    return result(
      "öffentlich",
      riskLevel,
      q2.filter((x) => x !== "none"),
      "Für öffentliche Stellen gelten in Deutschland i.d.R. die Vorgaben der BITV 2.0 (EN 301 549) und damit häufig strengere Anforderungen als beim BFSG. Diese Einschätzung ersetzt keine Rechtsberatung.",
      ["BITV 2.0", "EN 301 549"]
    );
  }

  // Direct outcomes
  if (q1 === "intern") {
    return result(
      "wahrscheinlich-nicht",
      riskLevel,
      [],
      "Basierend auf Ihren Angaben ist das BFSG wahrscheinlich nicht anwendbar. Diese Einschätzung ersetzt keine Rechtsberatung."
    );
  }

  // Product path
  if (q1 === "produkte" || q1 === "import") {
    if (q1a && q1a !== "andere") {
      return result(
        "betroffen",
        riskLevel,
        [],
        "Sie stellen/vertreiben Produkte, die typischerweise in den Anwendungsbereich fallen. Barrierefreiheitsanforderungen können greifen (je nach Produktkategorie). Diese Einschätzung ersetzt keine Rechtsberatung.",
        ["§ 1 Abs. 2 BFSG"]
      );
    }
    // other products: fall through to service questions
  }

  // Service path
  const hasService = q2.length > 0 && !q2.includes("none");
  if (!hasService) {
    return result(
      "wahrscheinlich-nicht",
      riskLevel,
      [],
      "Wenn Sie keine verbrauchergerichteten digitalen Dienstleistungen anbieten, ist das BFSG wahrscheinlich nicht anwendbar. Diese Einschätzung ersetzt keine Rechtsberatung."
    );
  }

  if (q3 === "b2b") {
    return result(
      "wahrscheinlich-nicht",
      riskLevel,
      q2.filter((x) => x !== "none"),
      "Das BFSG gilt typischerweise für Verbraucher‑Dienstleistungen (B2C). Wenn Sie ausschließlich B2B anbieten, ist es wahrscheinlich nicht anwendbar. Diese Einschätzung ersetzt keine Rechtsberatung."
    );
  }

  if (q4 === "kleinst") {
    return result(
      "kleinstunternehmen",
      riskLevel,
      q2.filter((x) => x !== "none"),
      "Sie könnten als Kleinstunternehmen ausgenommen sein (für Dienstleistungen). Für Produkte gilt diese Ausnahme nicht. Freiwillige Umsetzung ist oft sinnvoll. Diese Einschätzung ersetzt keine Rechtsberatung.",
      ["§ 3 Abs. 3 BFSG"]
    );
  }

  const dateHint =
    q5 === "vor2025"
      ? "Achtung: Für Websites gibt es praktisch keine komfortable Übergangsfrist. Die Pflicht gilt seit dem 28. Juni 2025."
      : q5 === "planung"
      ? "Planen Sie Barrierefreiheit von Anfang an ein. Nachträgliche Anpassungen sind meist deutlich teurer."
      : q5 === "nach2025"
      ? "Wenn Sie nach dem 28. Juni 2025 gestartet oder wesentlich geändert haben, sollten Sie Barrierefreiheit direkt mitdenken."
      : "Bei unklarer Antwort gehen wir zugunsten der Betroffenheit von einer Relevanz aus. Wenn die Plattform nach dem 28. Juni 2025 gestartet wurde oder wesentlich verändert wurde, gilt die Prüfungspflicht.";

  return result(
    "betroffen",
    riskLevel,
    q2.filter((x) => x !== "none"),
    `Basierend auf Ihren Angaben ist Ihr Unternehmen wahrscheinlich betroffen. ${dateHint} Diese Einschätzung ersetzt keine Rechtsberatung.`,
    ["BFSG", "BFSGV", "EN 301 549", "§ 36 BFSG"]
  );
}

export function nextQuestionId(currentId: string, answers: Record<string, string | string[]>): string | null {
  if (currentId === "q0") {
    const q0 = answers.q0 as string | undefined;
    if (q0 === "public") return null;
    return "q1";
  }

  if (currentId === "q1") {
    const q1 = answers.q1 as string | undefined;
    if (q1 === "produkte" || q1 === "import") return "q1a";
    if (q1 === "dienstleistungen") return "q2";
    return null;
  }
  if (currentId === "q1a") return "q2";
  if (currentId === "q2") {
    const q2 = (answers.q2 as string[] | undefined) || [];
    if (q2.includes("none") || q2.length === 0) return null;
    return "q3";
  }
  if (currentId === "q3") {
    const q3 = answers.q3 as string | undefined;
    if (q3 === "b2b") return null;
    return "q4";
  }
  if (currentId === "q4") {
    const q4 = answers.q4 as string | undefined;
    if (q4 === "kleinst") return null;
    return "q5";
  }
  if (currentId === "q5") return "q6";
  if (currentId === "q6") return null;
  return null;
}

export function getVisibleQuestions(answers: Record<string, string | string[]>): string[] {
  const ordered: string[] = [];
  let current: string | null = "q0";

  while (current) {
    ordered.push(current);
    const next = nextQuestionId(current, answers);

    const currentAnswer = answers[current];
    if (!currentAnswer) break;
    if (Array.isArray(currentAnswer) && currentAnswer.length === 0) break;

    current = next;
  }

  return ordered;
}
