import { CREDIT_PACKS } from "./config";

export const PUBLIC_BILLING_CONFIG = {
  plans: [
    {
      id: "free",
      name: "Prüfen",
      description: "Für erste Prüfungen, schnelle Reviews und den Einstieg ohne laufendes Budget.",
      monthlyPriceEur: 0,
      annualPriceEur: null,
      includedCreditsPerMonth: 0,
      featureFlags: [
        "Kontrast-, ARIA- und Formular-Checks",
        "Kostenlose Web-Prüfungen mit Tageslimit",
        "Ideal für erste Reviews vor dem Rollout",
      ],
      rateLimits: { priority: "standard", maxJobSizeMb: 50 },
      examples: [
        "Einzelne Seiten und Formulare prüfen",
        "VoxDrop kennenlernen, ohne Budget zu binden",
        "Erste Einschätzung vor größeren Vorhaben",
      ],
    },
    {
      id: "pro",
      name: "Fachstelle",
      description: "Für Fachstellen, Redaktionen und kleine Teams mit laufender Accessibility-Arbeit.",
      monthlyPriceEur: 149,
      annualPriceEur: 1490,
      includedCreditsPerMonth: 1500,
      featureFlags: [
        "PDF/UA, Untertitel, Alt-Texte und Audioausgabe",
        "Web-Scans und Nachweise für VPAT, BITV und BFSG",
        "Priorisierte Verarbeitung",
        "Dateien bis 1 GB",
      ],
      rateLimits: { priority: "priority", maxJobSizeMb: 1000 },
      examples: [
        "Regelmäßige Dokument- und Video-Updates",
        "Wiederkehrende Prüfungen für Websites oder Bereiche",
        "Kleine Teams mit laufendem Veröffentlichungsbetrieb",
      ],
    },
    {
      id: "premium",
      name: "Organisation",
      description: "Für Organisationen mit mehreren Beteiligten, laufenden Nachweisen und höherem Volumen.",
      monthlyPriceEur: 399,
      annualPriceEur: 3990,
      includedCreditsPerMonth: 5000,
      featureFlags: [
        "Alles aus Fachstelle",
        "Insights, Dossiers und API-Zugang",
        "Audiodeskription und größere Workloads",
        "Dateien bis 2 GB",
        "Bevorzugter Support",
      ],
      rateLimits: { priority: "priority", maxJobSizeMb: 2000 },
      examples: [
        "Mehrere Teams oder Standorte koordinieren",
        "Laufende Reports und Nachweise für Stakeholder",
        "Größere Volumina im Regelbetrieb abdecken",
      ],
    },
  ],
  creditPacks: CREDIT_PACKS.map(({ id, credits, priceEur }) => ({ id, credits, priceEur })),
  creditCosts: [
    { key: "ASR_MINUTE", label: "Untertitel / Transkription", unit: "Minute", credits: 3 },
    { key: "PDFUA_SMART_SLIDE", label: "PPTX -> PDF/UA Smart", unit: "Slide", credits: 12 },
    { key: "WORD_PDFUA_PAGE", label: "Word/PDF -> PDF/UA", unit: "Seite", credits: 6 },
    { key: "VPAT_EXPORT", label: "VPAT / BITV / Dossier-Export", unit: "Export", credits: 60 },
    { key: "TTS_MINUTE", label: "TTS / barrierefreie Audioausgabe", unit: "Minute", credits: 4 },
    { key: "AUDIO_DESC_MINUTE", label: "Audiodeskription", unit: "Minute", credits: 12 },
  ],
  rolloverPercent: 0,
};
