import { Link } from 'wouter';
import {
  FileCheck, Clock, CheckCircle, AlertCircle,
  Globe, FileText, Smartphone, File, ChevronRight
} from 'lucide-react';
import type { AuditHistoryItem } from '@/types/compliance-timeline';

interface AuditHistoryProps {
  history: AuditHistoryItem[];
}

const productTypeIcons: Record<string, typeof Globe> = {
  web: Globe,
  pdf: FileText,
  app: Smartphone,
  document: File,
};

const statusConfig = {
  draft: {
    label: 'Entwurf',
    icon: FileCheck,
    color: 'text-slate-500',
    bgColor: 'bg-slate-100',
  },
  in_progress: {
    label: 'In Arbeit',
    icon: Clock,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
  },
  completed: {
    label: 'Abgeschlossen',
    icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
};

export function AuditHistory({ history }: AuditHistoryProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-100">
        <h2 className="text-lg font-semibold text-slate-900">Audit-Historie</h2>
      </div>

      <div className="divide-y divide-slate-100">
        {history.map((audit) => {
          const ProductIcon = productTypeIcons[audit.product_type] || File;
          const status = statusConfig[audit.status] || statusConfig.draft;
          const StatusIcon = status.icon;

          const scoreColor = audit.compliance_rate >= 80 ? 'text-green-600' :
                             audit.compliance_rate >= 50 ? 'text-amber-600' : 'text-red-600';

          return (
            <Link
              key={audit.id}
              href={`/tools/vpat-checker?audit=${audit.id}`}
              className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                  <ProductIcon className="w-5 h-5 text-slate-600" />
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900 group-hover:text-violet-600 transition-colors">
                      {audit.name}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${status.bgColor} ${status.color}`}>
                      <StatusIcon className="w-3 h-3" />
                      {status.label}
                    </span>
                    {audit.signoff_at && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700">
                        <CheckCircle className="w-3 h-3" />
                        Freigegeben
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-sm text-slate-600">
                      {audit.product_name}
                    </span>
                    {audit.product_version && (
                      <span className="text-xs text-slate-400">
                        v{audit.product_version}
                      </span>
                    )}
                    <span className="text-slate-300">|</span>
                    <span className="text-sm text-slate-500">
                      {new Date(audit.audit_date).toLocaleDateString('de-DE')}
                    </span>
                    <span className="text-slate-300">|</span>
                    <span className="text-sm text-slate-500">
                      Abdeckung {audit.coverage_rate}%
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <span className={`text-lg font-semibold ${scoreColor}`}>
                    {audit.compliance_rate}%
                  </span>
                  <p className="text-xs text-slate-400">Compliance</p>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-violet-600 transition-colors" />
              </div>
            </Link>
          );
        })}
      </div>

      {history.length === 0 && (
        <div className="p-8 text-center">
          <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500">Keine Audits vorhanden</p>
        </div>
      )}
    </div>
  );
}
