import type { PlanId } from './config';

export type FeatureKey =
  | 'contrast_check'
  | 'aria_check'
  | 'form_check'
  | 'web_check'
  | 'simple_language'
  | 'ppt_analyze'
  | 'alt_text'
  | 'pdfua_smart'
  | 'word_pdfua'
  | 'pptx_podcast'
  | 'video_subtitles'
  | 'video_edit'
  | 'filler_removal'
  | 'chapter_detect'
  | 'persona_check'
  | 'vpat_export'
  | 'tts'
  | 'voice_clone'
  | 'audio_description'
  | 'url_shortener'
  | 'filesharing'
  | 'insights_dashboard'
  | 'api_access';

export interface FeatureConfig {
  minPlan: PlanId;
  /**
   * Optional limits for free users. Interpretation is feature-specific.
   * - 'day'/'month' are rate/usage limits
   * - 'request' is a per-request cap (e.g. max characters/slides)
   * - 'total' is a total cap (e.g. max active items)
   */
  freeLimit?: number;
  freeLimitPer?: 'day' | 'month' | 'request' | 'total';
}

export const FEATURE_GATES: Record<FeatureKey, FeatureConfig> = {
  // Free for everyone
  contrast_check: { minPlan: 'free' },
  aria_check: { minPlan: 'free' },
  form_check: { minPlan: 'free' },

  // Free with limits
  web_check: { minPlan: 'free', freeLimit: 5, freeLimitPer: 'day' },
  simple_language: { minPlan: 'free', freeLimit: 500, freeLimitPer: 'request' }, // max chars/request
  ppt_analyze: { minPlan: 'free', freeLimit: 10, freeLimitPer: 'request' }, // max slides/request
  url_shortener: { minPlan: 'free', freeLimit: 10, freeLimitPer: 'total' }, // max active short links
  filesharing: { minPlan: 'free', freeLimit: 100, freeLimitPer: 'request' }, // max MB/upload (see enforcement)

  // Pro required
  alt_text: { minPlan: 'pro' },
  pdfua_smart: { minPlan: 'pro' },
  word_pdfua: { minPlan: 'pro' },
  pptx_podcast: { minPlan: 'pro' },
  video_subtitles: { minPlan: 'pro' },
  video_edit: { minPlan: 'pro' },
  filler_removal: { minPlan: 'pro' },
  chapter_detect: { minPlan: 'pro' },
  persona_check: { minPlan: 'pro' },
  vpat_export: { minPlan: 'pro' },
  tts: { minPlan: 'pro' },

  // Premium required
  voice_clone: { minPlan: 'premium' },
  audio_description: { minPlan: 'premium' },
  insights_dashboard: { minPlan: 'premium' },
  api_access: { minPlan: 'premium' },
};

export const PLAN_HIERARCHY: Record<PlanId, number> = {
  free: 0,
  pro: 1,
  premium: 2,
};

export function canAccessFeature(userPlan: PlanId, feature: FeatureKey): boolean {
  const gate = FEATURE_GATES[feature];
  return PLAN_HIERARCHY[userPlan] >= PLAN_HIERARCHY[gate.minPlan];
}

export function getFeatureLimit(userPlan: PlanId, feature: FeatureKey): FeatureConfig | null {
  const gate = FEATURE_GATES[feature];
  if (userPlan === 'free' && gate.freeLimit !== undefined) {
    return gate;
  }
  return null;
}

