export type PlanId = 'free' | 'pro' | 'premium';

export interface PlanConfig {
  id: PlanId;
  name: string;
  description: string;
  monthlyPriceEur: number;
  includedCreditsPerMonth: number;
  featureFlags: string[];
  rateLimits: {
    priority: 'standard' | 'priority';
    maxJobSizeMb: number;
  };
  // LemonSqueezy variant ID (set after creating products)
  lemonSqueezyVariantId?: string;
}

export const PLAN_CONFIG: Record<PlanId, PlanConfig> = {
  free: {
    id: 'free',
    name: 'Free',
    description: 'Zum Ausprobieren und für kleine Aufgaben.',
    monthlyPriceEur: 0,
    includedCreditsPerMonth: 200,
    featureFlags: [
      'Basis-Tools (Checks & Textarbeit)',
      'Best-Effort Warteschlange',
      'Begrenzte Job-Größen (50 MB)',
    ],
    rateLimits: {
      priority: 'standard',
      maxJobSizeMb: 50,
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    description: 'Für Einzelpersonen in Behörden oder Freelance-Projekten.',
    monthlyPriceEur: 99,
    includedCreditsPerMonth: 3000,
    lemonSqueezyVariantId: '1295319',
    featureFlags: [
      'Alle Kernfeatures',
      'PDF/UA, Podcasts, Untertitel',
      'Priorisierte Verarbeitung',
      'Dateien bis 500 MB',
    ],
    rateLimits: {
      priority: 'priority',
      maxJobSizeMb: 500,
    },
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    description: 'Volle Power für Teams und Vielnutzer.',
    monthlyPriceEur: 199,
    includedCreditsPerMonth: 15000,
    lemonSqueezyVariantId: '1295323',
    featureFlags: [
      'Alles aus Pro',
      'Insights-Dashboard',
      'Erweiterte Historie & Exporte',
      'Dateien bis 2 GB',
      'Priority-Support',
    ],
    rateLimits: {
      priority: 'priority',
      maxJobSizeMb: 2000,
    },
  },
};

export const CREDIT_PACKS = [
  { id: 'pack_500', credits: 500, priceEur: 59, lemonSqueezyVariantId: '1295324' },
  { id: 'pack_2500', credits: 2500, priceEur: 249, lemonSqueezyVariantId: '1295327' },
  { id: 'pack_10000', credits: 10000, priceEur: 899, lemonSqueezyVariantId: '1295331' },
];

export const CREDIT_COSTS = {
  // === KOSTENLOSE TOOLS (0 Credits) ===
  CONTRAST_CHECK: { label: 'Kontrastcheck', unit: 'Check', credits: 0 },
  ARIA_CHECK: { label: 'ARIA-Check', unit: 'Check', credits: 0 },
  FORM_CHECK: { label: 'Formular-Check', unit: 'Check', credits: 0 },

  // === LEICHTE TOOLS (0-2 Credits) ===
  WEB_CHECK_URL: { label: 'Web-Pruefung', unit: 'URL', credits: 1 },
  URL_SHORTENER_LINK: { label: 'URL Shortener', unit: 'Link', credits: 0 },
  DOC_CHECK_PAGE: { label: 'Dokument-Check', unit: 'Seite', credits: 1 },
  SIMPLE_LANG_1K: { label: 'Einfache Sprache', unit: '1000 Zeichen', credits: 2 },
  PPT_SLIDE_ANALYZE: { label: 'PPT-Analyse', unit: 'Slide', credits: 2 },

  // === MITTLERE TOOLS (3-5 Credits) ===
  ALT_TEXT_IMAGE: { label: 'Alt-Text Generator', unit: 'Bild', credits: 3 },
  WORD_PDFUA_PAGE: { label: 'Word->PDF/UA', unit: 'Seite', credits: 3 },
  VIDEO_EDIT_MINUTE: { label: 'Videoschnitt', unit: 'Minute', credits: 3 },
  PDFUA_SMART_SLIDE: { label: 'PPTX->PDF/UA Smart', unit: 'Slide', credits: 5 },
  FILLER_REMOVAL_MIN: { label: 'Aehm-Entfernung', unit: 'Minute', credits: 5 },
  CHAPTER_DETECT: { label: 'Kapitel-Erkennung', unit: 'Video', credits: 5 },
  VPAT_EXPORT: { label: 'VPAT Export', unit: 'Report', credits: 5 },

  // === INTENSIVE TOOLS (6-10 Credits) ===
  TTS_MINUTE: { label: 'KI-Stimme/TTS', unit: 'Minute', credits: 6 },
  PODCAST_MINUTE: { label: 'PPTX->Podcast', unit: 'Minute Output', credits: 8 },
  ASR_MINUTE: { label: 'Video Untertitel', unit: 'Minute', credits: 10 },

  // === PREMIUM TOOLS (15-20 Credits) ===
  PERSONA_CHECK: { label: 'Persona-Check', unit: 'Dokument', credits: 15 },
  VOICE_CLONE_MINUTE: { label: 'Voice Cloning', unit: 'Minute', credits: 15 },
  AUDIO_DESC_MINUTE: { label: 'Audiodeskription', unit: 'Minute', credits: 20 },

  // === STORAGE ===
  FILESHARING_GB_MONTH: { label: 'Filesharing', unit: 'GB/Monat', credits: 10 },

  // === LEGACY KEYS (for older code paths) ===
  PDFUA_EXPORT_PAGE: { label: 'PDF/UA-Export', unit: 'Seite', credits: 2 },
} as const;

export type CreditCostKey = keyof typeof CREDIT_COSTS;

export const CREDIT_COSTS_LIST = Object.entries(CREDIT_COSTS).map(([key, cfg]) => ({
  key,
  ...(cfg as { label: string; unit: string; credits: number }),
}));

export const CREDIT_ROLLOVER_MAX_PERCENT = 0;

// Map legacy subscription names to plan IDs
export const SUBSCRIPTION_PLAN_MAP: Record<string, PlanId> = {
  free: 'free',
  pro: 'pro',
  premium: 'premium',
  // Legacy mappings
  team: 'premium',
  studio: 'premium',
};
