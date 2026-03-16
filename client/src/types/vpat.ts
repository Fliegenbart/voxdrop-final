// VPAT / EN 301 549 / BITV 2.0 Compliance Tool Types

export type ProductType = 'web' | 'pdf' | 'app' | 'document';
export type ConformanceLevel = 'A' | 'AA' | 'AAA';
export type SupportLevel =
  | 'supports'
  | 'partially_supports'
  | 'does_not_support'
  | 'not_applicable'
  | 'not_evaluated';

export type AuditStatus = 'draft' | 'in_progress' | 'completed';

// EN 301 549 Kriterium
export interface EN301549Criterion {
  id: string;                    // z.B. "9.1.1.1", "10.2.1"
  chapter: 9 | 10 | 11;          // 9=Web, 10=Dokumente, 11=Software
  section: string;               // z.B. "1.1.1", "2.4.7"
  title_de: string;
  title_en: string;
  description_de: string;
  level: ConformanceLevel;
  wcag_criterion?: string;       // WCAG 2.1 Mapping z.B. "1.1.1"
  bitv_reference?: string;       // BITV 2.0 Referenz
  applies_to: ProductType[];
  is_additional: boolean;        // true = EN 301 549 spezifisch (nicht WCAG)
  testing_guidance_de?: string;
}

// Audit / Projekt
export interface Audit {
  id: string;
  user_id: number;
  name: string;
  product_name: string;
  product_version?: string;
  product_type: ProductType;
  organization?: string;
  audit_date: string;
  auditor_name?: string;
  auditor_email?: string;
  status: AuditStatus;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// Bewertung eines Kriteriums
export interface AuditEvaluation {
  id: number;
  audit_id: string;
  criterion_id: string;
  support_level: SupportLevel;
  remarks_de: string;
  remarks_en?: string;
  evidence_url?: string;
  evaluated_at?: string;
  evaluated_by?: string;
}

// Fortschrittsanzeige
export interface AuditProgress {
  total_criteria: number;
  evaluated: number;
  supports: number;
  partially_supports: number;
  does_not_support: number;
  not_applicable: number;
  not_evaluated: number;
  compliance_rate: number;       // % der "supports" + "partially_supports" Bewertungen
}

// Audit mit allen Details
export interface AuditWithDetails extends Audit {
  evaluations: AuditEvaluation[];
  progress: AuditProgress;
}

// VPAT Export Konfiguration
export interface VPATExportConfig {
  format: 'word' | 'pdf';
  language: 'de' | 'en' | 'both';
  include_not_applicable: boolean;
  include_testing_guidance: boolean;
  company_name?: string;
  company_logo_url?: string;
}

// BITV Export Konfiguration
export interface BITVExportConfig {
  declaration_date: string;
  contact_email: string;
  contact_phone?: string;
  feedback_url?: string;
  enforcement_url?: string;
  include_methodology: boolean;
  custom_css?: string;
}

// API Response Types
export interface CriteriaResponse {
  criteria: EN301549Criterion[];
  total: number;
}

export interface AuditsResponse {
  audits: Audit[];
  total: number;
}

export interface MappingResponse {
  wcag_to_en: Record<string, string[]>;
  en_to_wcag: Record<string, string>;
}

// Labels und Farben für UI
export const SUPPORT_LEVEL_LABELS: Record<SupportLevel, string> = {
  supports: 'Erfüllt',
  partially_supports: 'Teilweise erfüllt',
  does_not_support: 'Nicht erfüllt',
  not_applicable: 'Nicht anwendbar',
  not_evaluated: 'Nicht bewertet',
};

export const SUPPORT_LEVEL_LABELS_EN: Record<SupportLevel, string> = {
  supports: 'Supports',
  partially_supports: 'Partially Supports',
  does_not_support: 'Does Not Support',
  not_applicable: 'Not Applicable',
  not_evaluated: 'Not Evaluated',
};

export const SUPPORT_LEVEL_COLORS: Record<SupportLevel, string> = {
  supports: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-600',
  partially_supports: 'bg-amber-500/20 border-amber-500/50 text-amber-600',
  does_not_support: 'bg-red-500/20 border-red-500/50 text-red-600',
  not_applicable: 'bg-slate-500/20 border-slate-500/50 text-slate-500',
  not_evaluated: 'bg-slate-100 border-slate-200 text-slate-400',
};

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  web: 'Webseite / Web-Anwendung',
  pdf: 'PDF-Dokument',
  app: 'Mobile App / Desktop-Software',
  document: 'Office-Dokument (Word, Excel, etc.)',
};

export const CHAPTER_LABELS: Record<9 | 10 | 11, string> = {
  9: 'Kapitel 9 - Web',
  10: 'Kapitel 10 - Dokumente',
  11: 'Kapitel 11 - Software',
};

export const CONFORMANCE_LEVEL_LABELS: Record<ConformanceLevel, string> = {
  A: 'Level A (Minimum)',
  AA: 'Level AA (Empfohlen)',
  AAA: 'Level AAA (Optimal)',
};
