export type ScopeStatus = "betroffen" | "wahrscheinlich-nicht" | "kleinstunternehmen" | "öffentlich";

export type RiskLevel = "niedrig" | "mittel" | "hoch";

export type ScopeResult = {
  status: ScopeStatus;
  relevantParagraphs: string[];
  riskLevel: RiskLevel;
  selectedServices: string[];
  explanation: string;
};

export type LeadData = {
  email: string;
  name?: string;
  company?: string;
  newsletter?: boolean;
};

export interface FindingAffectedElement {
  selector: string;
  html: string;
}

export interface Finding {
  id: string;
  severity: "critical" | "major" | "moderate" | "info";
  wcag_criterion: string;
  wcag_level: "A" | "AA" | "AAA";
  title: string;
  description: string;
  count: number;
  is_free: boolean;
  voxdrop_can_fix?: boolean;
  recommendation?: string;
  affected_elements?: FindingAffectedElement[];
}

export interface PdfUaError {
  rule: string;
  description: string;
  clause: string;
  failedChecks: number;
}

export interface PdfUaResult {
  filename: string;
  url: string;
  isCompliant: boolean;
  totalChecks: number;
  failedChecks: number;
  errors: PdfUaError[];
}

export interface PdfUaSummary {
  scanned: number;
  compliant: number;
  non_compliant: number;
  files: PdfUaResult[];
  skipped: number;
  warnings?: string[];
}

export interface PageMetaHeading {
  level: number;
  text: string;
}

export interface PageMeta {
  title: string;
  lang: string | null;
  hasH1: boolean;
  hasSkipLink?: boolean;
  headingStructure?: PageMetaHeading[];
  formCount: number;
  imageCount: number;
  videoCount?: number;
}

export interface ScanResult {
  url: string;
  scannedAt: string;
  score: number;
  screenshot?: string | null;
  findings: Finding[];
  compliance: {
    bfsg: "konform" | "teilweise" | "nicht-konform";
    wcag_aa: { passed: number; total: number; percentage: number };
    pdf_ua: PdfUaSummary;
    bitv: "nicht-geprüft" | "zusätzliche-prüfung-nötig";
  };
  risk: {
    critical: number;
    major: number;
    moderate: number;
    passed: number;
    maxFine: number;
  };
  pageMeta: PageMeta;
  scanDuration: number;
}
