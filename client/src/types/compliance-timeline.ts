// Compliance Timeline Types (Premium Feature)

import type { ProductType } from './vpat';

export interface ProductSummary {
  product_name: string;
  product_type: ProductType;
  latest_audit_id: string;
  latest_audit_date: string;
  latest_compliance_rate: number;
  latest_coverage_rate: number;
  latest_na_rate: number;
  latest_total_criteria: number;
  latest_evaluated_criteria: number;
  latest_applicable_criteria: number;
  audit_count: number;
  trend: 'up' | 'down' | 'stable';
  trend_change: number; // Prozentpunkte seit letztem Audit
}

export interface TimelineDataPoint {
  date: string;           // YYYY-MM-DD
  product_name: string;
  compliance_rate: number;
  coverage_rate: number;
  na_rate: number;
  evaluated_criteria: number;
  total_criteria: number;
  applicable_criteria: number;
  audit_id: string;
  audit_name: string;
  status: 'draft' | 'in_progress' | 'completed';
}

export interface AuditHistoryItem {
  id: string;
  name: string;
  product_name: string;
  product_version: string | null;
  product_type: ProductType;
  audit_date: string;
  status: 'draft' | 'in_progress' | 'completed';
  compliance_rate: number;
  coverage_rate: number;
  na_rate: number;
  evaluated_criteria: number;
  total_criteria: number;
  applicable_criteria: number;
  auditor_name?: string | null;
  auditor_email?: string | null;
  signoff_name?: string | null;
  signoff_role?: string | null;
  signoff_email?: string | null;
  signoff_at?: string | null;
}

export interface ComplianceOverview {
  total_audits: number;
  completed_audits: number;
  products: ProductSummary[];
  timeline: TimelineDataPoint[];
  history: AuditHistoryItem[];
  overall_score: number;
  overall_trend: 'up' | 'down' | 'stable';
  trend_change: number;
  overall_coverage_rate: number;
  overall_na_rate: number;
  overall_total_criteria: number;
  overall_evaluated_criteria: number;
  overall_applicable_criteria: number;
  overall_not_applicable: number;
  first_audit_date: string | null;
}

export interface AuditActivityItem {
  id: number;
  action: string;
  status: 'success' | 'failure';
  created_at: string;
  details?: Record<string, unknown> | null;
}

export interface AuditDossier {
  audit: AuditHistoryItem & {
    organization?: string | null;
    notes?: string | null;
    auditor_name?: string | null;
    auditor_email?: string | null;
    signoff_notes?: string | null;
  };
  metrics: {
    total_criteria: number;
    evaluated_criteria: number;
    applicable_criteria: number;
    not_applicable: number;
    supports: number;
    partially_supports: number;
    does_not_support: number;
    compliance_rate: number;
    coverage_rate: number;
    na_rate: number;
  };
  activity: AuditActivityItem[];
}
