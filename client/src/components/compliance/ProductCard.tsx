import { Link } from 'wouter';
import {
  Globe, FileText, Smartphone, File,
  TrendingUp, TrendingDown, Minus, Calendar, CheckCircle, AlertTriangle
} from 'lucide-react';
import type { ProductSummary } from '@/types/compliance-timeline';

interface ProductCardProps {
  product: ProductSummary;
}

const productTypeIcons: Record<string, typeof Globe> = {
  web: Globe,
  pdf: FileText,
  app: Smartphone,
  document: File,
};

const productTypeLabels: Record<string, string> = {
  web: 'Webseite',
  pdf: 'PDF',
  app: 'App',
  document: 'Dokument',
};

export function ProductCard({ product }: ProductCardProps) {
  const Icon = productTypeIcons[product.product_type] || File;

  const TrendIcon = product.trend === 'up' ? TrendingUp :
                    product.trend === 'down' ? TrendingDown : Minus;

  const trendColor = product.trend === 'up' ? 'text-green-600' :
                     product.trend === 'down' ? 'text-red-600' : 'text-slate-400';

  const scoreColor = product.latest_compliance_rate >= 80 ? 'text-green-600' :
                     product.latest_compliance_rate >= 50 ? 'text-amber-600' : 'text-red-600';

  const StatusIcon = product.latest_compliance_rate >= 80 ? CheckCircle : AlertTriangle;
  const statusIconColor = product.latest_compliance_rate >= 80 ? 'text-green-500' : 'text-amber-500';

  return (
    <Link
      href={`/tools/vpat-checker?audit=${product.latest_audit_id}`}
      className="block bg-white rounded-xl border border-slate-200 p-5 hover:border-blue-300 hover:shadow-md transition-all group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center group-hover:bg-violet-50 transition-colors">
            <Icon className="w-5 h-5 text-slate-600 group-hover:text-violet-600 transition-colors" />
          </div>
          <div>
            <h3 className="font-medium text-slate-900 group-hover:text-violet-600 transition-colors">
              {product.product_name}
            </h3>
            <p className="text-xs text-slate-500">
              {productTypeLabels[product.product_type] || product.product_type}
            </p>
          </div>
        </div>
        <StatusIcon className={`w-5 h-5 ${statusIconColor}`} />
      </div>

      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${scoreColor}`}>
              {product.latest_compliance_rate}%
            </span>
            <div className="flex items-center gap-1">
              <TrendIcon className={`w-4 h-4 ${trendColor}`} />
              {product.trend_change !== 0 && (
                <span className={`text-xs font-medium ${trendColor}`}>
                  {product.trend_change > 0 ? '+' : ''}{product.trend_change}%
                </span>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Abdeckung {product.latest_coverage_rate}% · NA {product.latest_na_rate}%
          </p>
        </div>

        <div className="text-right">
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <Calendar className="w-3 h-3" />
            {new Date(product.latest_audit_date).toLocaleDateString('de-DE')}
          </div>
          <p className="text-xs text-slate-400">
            {product.audit_count} {product.audit_count === 1 ? 'Audit' : 'Audits'}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3">
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              product.latest_compliance_rate >= 80 ? 'bg-green-500' :
              product.latest_compliance_rate >= 50 ? 'bg-amber-500' : 'bg-red-500'
            }`}
            style={{ width: `${product.latest_compliance_rate}%` }}
          />
        </div>
      </div>
    </Link>
  );
}
