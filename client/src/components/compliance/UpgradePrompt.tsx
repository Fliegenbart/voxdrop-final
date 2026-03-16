import { Crown, TrendingUp, Shield, BarChart3 } from 'lucide-react';
import { Link } from 'wouter';

interface UpgradePromptProps {
  feature?: string;
}

export function UpgradePrompt({ feature = 'Compliance Timeline' }: UpgradePromptProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center max-w-2xl mx-auto">
      <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
        <Crown className="w-8 h-8 text-white" />
      </div>

      <h2 className="text-2xl font-semibold text-slate-900 mb-3">
        {feature} ist ein Premium-Feature
      </h2>

      <p className="text-slate-600 mb-8 max-w-md mx-auto">
        Verfolgen Sie Ihre Barrierefreiheits-Entwicklung über Zeit,
        erkennen Sie Trends und behalten Sie alle Ihre Audits im Blick.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="p-4 bg-slate-50 rounded-xl">
          <TrendingUp className="w-6 h-6 text-violet-600 mx-auto mb-2" />
          <h3 className="font-medium text-slate-900 text-sm">Trend-Analyse</h3>
          <p className="text-xs text-slate-500 mt-1">
            Sehen Sie, wie sich Ihre Compliance entwickelt
          </p>
        </div>

        <div className="p-4 bg-slate-50 rounded-xl">
          <BarChart3 className="w-6 h-6 text-green-600 mx-auto mb-2" />
          <h3 className="font-medium text-slate-900 text-sm">Produkt-Vergleich</h3>
          <p className="text-xs text-slate-500 mt-1">
            Vergleichen Sie Produkte über Zeit
          </p>
        </div>

        <div className="p-4 bg-slate-50 rounded-xl">
          <Shield className="w-6 h-6 text-purple-600 mx-auto mb-2" />
          <h3 className="font-medium text-slate-900 text-sm">Audit-Historie</h3>
          <p className="text-xs text-slate-500 mt-1">
            Vollständige Historie aller Prüfungen
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href="/preise"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-600 to-purple-700 text-white font-medium rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg shadow-blue-500/25"
        >
          <Crown className="w-4 h-4" />
          Auf Premium upgraden
        </Link>

        <Link
          href="/tools/vpat-checker"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition-colors"
        >
          Zurück zum VPAT Checker
        </Link>
      </div>

      <p className="text-xs text-slate-400 mt-6">
        Premium ab 199 EUR/Monat. Jederzeit kündbar.
      </p>
    </div>
  );
}
