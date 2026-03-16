import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import {
  Sparkles, Crown, TrendingUp, TrendingDown, Minus,
  Calendar, FileCheck, ArrowLeft, Loader2, AlertCircle,
  Filter, Download, ShieldCheck, UserCheck, Info, FileText
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SEO } from '@/components/SEO';
import { UpgradePrompt } from '@/components/compliance/UpgradePrompt';
import { TimelineChart } from '@/components/compliance/TimelineChart';
import { ProductCard } from '@/components/compliance/ProductCard';
import { AuditHistory } from '@/components/compliance/AuditHistory';
import type { ComplianceOverview, AuditDossier } from '@/types/compliance-timeline';

export default function ComplianceTimeline() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState({
    product: 'all',
    productType: 'all',
    status: 'completed,in_progress',
    timeframe: '12m',
    trendScope: 'completed',
  });

  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  const [signoffForm, setSignoffForm] = useState({
    name: '',
    role: '',
    email: '',
    notes: '',
  });

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation('/login');
    }
  }, [authLoading, isAuthenticated, setLocation]);

  const isPremium = user?.subscription === 'premium' || user?.subscription === 'team';

  const dateRange = useMemo(() => {
    if (filters.timeframe === 'all') return { from: undefined, to: undefined };

    const now = new Date();
    const from = new Date(now);

    if (filters.timeframe === '30d') from.setDate(now.getDate() - 30);
    if (filters.timeframe === '90d') from.setDate(now.getDate() - 90);
    if (filters.timeframe === '12m') from.setMonth(now.getMonth() - 12);
    if (filters.timeframe === '24m') from.setMonth(now.getMonth() - 24);

    const formatDate = (date: Date) => date.toISOString().split('T')[0];
    return { from: formatDate(from), to: formatDate(now) };
  }, [filters.timeframe]);

  // Fetch timeline data (only for premium users)
  const { data, isLoading, error } = useQuery<ComplianceOverview>({
    queryKey: ['compliance-timeline', filters, dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.product !== 'all') params.set('product', filters.product);
      if (filters.productType !== 'all') params.set('product_type', filters.productType);
      if (filters.status !== 'all') params.set('status', filters.status);
      if (filters.trendScope) params.set('trendScope', filters.trendScope);
      if (dateRange.from) params.set('from', dateRange.from);
      if (dateRange.to) params.set('to', dateRange.to);

      const query = params.toString();
      const res = await fetch(`/api/vpat/timeline${query ? `?${query}` : ''}`, { credentials: 'include' });
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('PREMIUM_REQUIRED');
        }
        throw new Error('Failed to fetch timeline');
      }
      return res.json();
    },
    enabled: isPremium && isAuthenticated,
  });

  useEffect(() => {
    if (data?.history?.length) {
      const stillExists = selectedAuditId && data.history.some(a => a.id === selectedAuditId);
      if (!selectedAuditId || !stillExists) {
        setSelectedAuditId(data.history[0].id);
      }
    }
  }, [data, selectedAuditId]);

  const dossierQuery = useQuery<AuditDossier>({
    queryKey: ['audit-dossier', selectedAuditId],
    queryFn: async () => {
      const res = await fetch(`/api/vpat/audits/${selectedAuditId}/dossier`, { credentials: 'include' });
      if (!res.ok) {
        throw new Error('Failed to fetch dossier');
      }
      return res.json();
    },
    enabled: isPremium && isAuthenticated && !!selectedAuditId,
  });

  useEffect(() => {
    if (dossierQuery.data) {
      setSignoffForm({
        name: dossierQuery.data.audit.signoff_name || '',
        role: dossierQuery.data.audit.signoff_role || '',
        email: dossierQuery.data.audit.signoff_email || '',
        notes: dossierQuery.data.audit.signoff_notes || '',
      });
    }
  }, [dossierQuery.data]);

  const historySorted = useMemo(() => {
    if (!data?.history) return [];
    return [...data.history].sort(
      (a, b) => new Date(b.audit_date).getTime() - new Date(a.audit_date).getTime()
    );
  }, [data?.history]);

  const handleSignoff = async () => {
    if (!selectedAuditId) return;

    if (!signoffForm.name.trim()) {
      toast({
        title: 'Name erforderlich',
        description: 'Bitte geben Sie den Namen für die Freigabe an.',
        variant: 'destructive',
      });
      return;
    }

    const res = await fetch(`/api/vpat/audits/${selectedAuditId}/signoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        name: signoffForm.name.trim(),
        role: signoffForm.role.trim() || null,
        email: signoffForm.email.trim() || null,
        notes: signoffForm.notes.trim() || null,
      }),
    });

    if (!res.ok) {
      toast({
        title: 'Freigabe fehlgeschlagen',
        description: 'Bitte versuchen Sie es erneut.',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Freigabe gespeichert',
      description: 'Das Audit wurde als freigegeben markiert.',
    });

    await queryClient.invalidateQueries({ queryKey: ['audit-dossier', selectedAuditId] });
    await queryClient.invalidateQueries({ queryKey: ['compliance-timeline'] });
  };

  const handleClearSignoff = async () => {
    if (!selectedAuditId) return;
    const res = await fetch(`/api/vpat/audits/${selectedAuditId}/signoff`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (!res.ok) {
      toast({
        title: 'Freigabe konnte nicht entfernt werden',
        description: 'Bitte versuchen Sie es erneut.',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Freigabe entfernt',
      description: 'Die Freigabe wurde zurückgesetzt.',
    });

    await queryClient.invalidateQueries({ queryKey: ['audit-dossier', selectedAuditId] });
    await queryClient.invalidateQueries({ queryKey: ['compliance-timeline'] });
  };

  const downloadDossier = async (format: 'csv' | 'pdf') => {
    if (!selectedAuditId) return;
    const res = await fetch(`/api/vpat/audits/${selectedAuditId}/dossier.${format}`, {
      credentials: 'include',
    });

    if (!res.ok) {
      toast({
        title: 'Download fehlgeschlagen',
        description: 'Bitte versuchen Sie es erneut.',
        variant: 'destructive',
      });
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const filenameBase = dossierQuery.data?.audit?.product_name
      ? dossierQuery.data.audit.product_name.replace(/[^a-zA-Z0-9_-]+/g, '_')
      : 'audit';
    a.href = url;
    a.download = `${filenameBase}_dossier.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-page-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  // Trend icon helper
  const TrendIcon = ({ trend }: { trend: 'up' | 'down' | 'stable' }) => {
    if (trend === 'up') return <TrendingUp className="w-4 h-4 text-green-600" />;
    if (trend === 'down') return <TrendingDown className="w-4 h-4 text-red-600" />;
    return <Minus className="w-4 h-4 text-slate-400" />;
  };

  const statusLabels: Record<string, string> = {
    draft: 'Entwurf',
    in_progress: 'In Arbeit',
    completed: 'Abgeschlossen',
  };

  const activityLabels: Record<string, string> = {
    vpat_audit_create: 'Audit erstellt',
    vpat_audit_update: 'Audit aktualisiert',
    vpat_audit_delete: 'Audit gelöscht',
    vpat_evaluation_update: 'Bewertung aktualisiert',
    vpat_evaluation_bulk: 'Bewertungen gespeichert',
    vpat_evaluation_mark_na: 'Nicht anwendbar markiert',
    vpat_export_bitv: 'BITV-Export',
    vpat_export_word: 'VPAT-Export',
    vpat_dossier_csv: 'Dossier CSV-Export',
    vpat_dossier_pdf: 'Dossier PDF-Export',
    vpat_audit_signoff: 'Freigabe gesetzt',
    vpat_audit_signoff_remove: 'Freigabe entfernt',
  };

  return (
    <div className="min-h-screen bg-page-bg">
      <SEO
        title="Compliance Timeline"
        description="Übersicht und Verlauf Ihrer Barrierefreiheits-Audits."
        canonical="/dashboard/compliance"
        noIndex={true}
      />
      {/* Navigation Bar */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 border-b border-slate-200/50">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-violet-600 to-purple-700 rounded-lg flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-semibold text-slate-900 tracking-tight">VoxDrop</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/tools/vpat-checker"
              className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Zurück zum VPAT Checker
            </Link>
            {isPremium && (
              <span className="flex items-center gap-1 text-xs bg-gradient-to-r from-amber-500 to-orange-500 text-white px-2 py-1 rounded-full">
                <Crown className="w-3 h-3" />
                Premium
              </span>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">
                Compliance Timeline
              </h1>
              {isPremium && (
                <span className="flex items-center gap-1 text-xs bg-gradient-to-r from-amber-500 to-orange-500 text-white px-2 py-1 rounded-full">
                  <Crown className="w-3 h-3" />
                  Premium
                </span>
              )}
            </div>
            <p className="text-slate-600">
              Verfolgen Sie Ihre Barrierefreiheits-Entwicklung über Zeit
            </p>
          </div>
        </div>

        {/* Show upgrade prompt for non-premium users */}
        {!isPremium && (
          <div className="py-12">
            <UpgradePrompt />
          </div>
        )}

        {/* Premium content */}
        {isPremium && (
          <>
            {/* Filters */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
              <div className="flex items-center gap-2 mb-4 text-sm font-medium text-slate-900">
                <Filter className="w-4 h-4 text-slate-500" />
                Filter
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Produkt</Label>
                  <Select
                    value={filters.product}
                    onValueChange={(value) => setFilters((prev) => ({ ...prev, product: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Alle Produkte" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle Produkte</SelectItem>
                      {data?.products?.map((product) => (
                        <SelectItem key={product.product_name} value={product.product_name}>
                          {product.product_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Produkttyp</Label>
                  <Select
                    value={filters.productType}
                    onValueChange={(value) => setFilters((prev) => ({ ...prev, productType: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Alle Typen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle Typen</SelectItem>
                      <SelectItem value="web">Webseite</SelectItem>
                      <SelectItem value="pdf">PDF</SelectItem>
                      <SelectItem value="app">App</SelectItem>
                      <SelectItem value="document">Dokument</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={filters.status}
                    onValueChange={(value) => setFilters((prev) => ({ ...prev, status: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Alle Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle Status</SelectItem>
                      <SelectItem value="completed">Nur abgeschlossen</SelectItem>
                      <SelectItem value="completed,in_progress">Abgeschlossen + In Arbeit</SelectItem>
                      <SelectItem value="in_progress">Nur In Arbeit</SelectItem>
                      <SelectItem value="draft">Nur Entwuerfe</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Zeitraum</Label>
                  <Select
                    value={filters.timeframe}
                    onValueChange={(value) => setFilters((prev) => ({ ...prev, timeframe: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Zeitraum" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle</SelectItem>
                      <SelectItem value="30d">Letzte 30 Tage</SelectItem>
                      <SelectItem value="90d">Letzte 90 Tage</SelectItem>
                      <SelectItem value="12m">Letzte 12 Monate</SelectItem>
                      <SelectItem value="24m">Letzte 24 Monate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={filters.trendScope === 'completed'}
                    onCheckedChange={(checked) =>
                      setFilters((prev) => ({ ...prev, trendScope: checked ? 'completed' : 'all' }))
                    }
                  />
                  <Label className="text-sm">Trend nur abgeschlossene Audits</Label>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <ShieldCheck className="w-4 h-4" />
                  Standard: EN 301 549 (BITV abgeleitet)
                </div>
              </div>
            </div>

            {/* Loading state */}
            {isLoading && (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
              </div>
            )}

            {/* Error state */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
                <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-3" />
                <p className="text-red-700">Fehler beim Laden der Timeline</p>
              </div>
            )}

            {/* Data loaded */}
            {data && (
              <>
                {/* No data yet */}
                {data.total_audits === 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                    <FileCheck className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-slate-900 mb-2">
                      Noch keine Audits vorhanden
                    </h3>
                    <p className="text-slate-500 mb-6">
                      Erstellen Sie Ihr erstes VPAT-Audit, um Ihre Compliance-Timeline zu starten.
                    </p>
                    <Link
                      href="/tools/vpat-checker"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-violet-600 text-white font-medium rounded-xl hover:bg-violet-700 transition-colors"
                    >
                      <FileCheck className="w-4 h-4" />
                      Erstes Audit erstellen
                    </Link>
                  </div>
                )}

                {data.total_audits > 0 && (
                  <>
                    {/* Overall Score Card */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                          <p className="text-sm text-slate-500 mb-1">Gesamt-Score</p>
                          <div className="flex items-center gap-3">
                            <span className="text-4xl font-bold text-slate-900">
                              {data.overall_score}%
                            </span>
                            <div className="flex items-center gap-1">
                              <TrendIcon trend={data.overall_trend} />
                              <span className={`text-sm font-medium ${
                                data.overall_trend === 'up' ? 'text-green-600' :
                                data.overall_trend === 'down' ? 'text-red-600' : 'text-slate-500'
                              }`}>
                                {data.trend_change > 0 ? '+' : ''}{data.trend_change}%
                              </span>
                            </div>
                          </div>
                          {data.first_audit_date && (
                            <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              Seit {new Date(data.first_audit_date).toLocaleDateString('de-DE')}
                            </p>
                          )}
                        </div>

                        <div>
                          <p className="text-sm text-slate-500 mb-1">Abdeckung</p>
                          <div className="flex items-center gap-3">
                            <span className="text-3xl font-semibold text-slate-900">
                              {data.overall_coverage_rate}%
                            </span>
                            <span className="text-xs text-slate-500">
                              {data.overall_evaluated_criteria}/{data.overall_total_criteria} Kriterien bewertet
                            </span>
                          </div>
                        </div>

                        <div>
                          <p className="text-sm text-slate-500 mb-1">Nicht anwendbar</p>
                          <div className="flex items-center gap-3">
                            <span className="text-3xl font-semibold text-slate-900">
                              {data.overall_na_rate}%
                            </span>
                            <span className="text-xs text-slate-500">
                              {data.overall_not_applicable} von {data.overall_total_criteria}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 space-y-2">
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-violet-600 to-purple-700 rounded-full transition-all duration-500"
                            style={{ width: `${data.overall_score}%` }}
                          />
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500 rounded-full transition-all duration-500"
                            style={{ width: `${data.overall_coverage_rate}%` }}
                          />
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-6 text-xs text-slate-500">
                        <span>Audits gesamt: {data.total_audits}</span>
                        <span>Abgeschlossen: {data.completed_audits}</span>
                        <span>Produkte: {data.products.length}</span>
                      </div>

                      <div className="mt-4 flex items-start gap-2 text-xs text-slate-500">
                        <Info className="w-4 h-4 mt-0.5 text-slate-400" />
                        <div>
                          Formel: (Erfüllt + 0.5 * Teilweise) / Anwendbar.
                          Abdeckung = Bewertete Kriterien / Gesamt.
                          NA = Nicht anwendbar.
                        </div>
                      </div>
                    </div>

                    {/* Products Grid */}
                    {data.products.length > 0 && (
                      <div className="mb-6">
                        <h2 className="text-lg font-semibold text-slate-900 mb-4">Produkte</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {data.products.map((product) => (
                            <ProductCard key={product.product_name} product={product} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Timeline Chart + Table */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-slate-900">Timeline</h2>
                        <span className="text-xs text-slate-500">
                          {data.timeline.length} Datenpunkte
                        </span>
                      </div>
                      <Tabs defaultValue="chart">
                        <TabsList>
                          <TabsTrigger value="chart">Chart</TabsTrigger>
                          <TabsTrigger value="table">Tabelle</TabsTrigger>
                        </TabsList>
                        <TabsContent value="chart" className="mt-4">
                          {data.timeline.length > 1 ? (
                            <TimelineChart data={data.timeline} />
                          ) : (
                            <div className="h-64 flex items-center justify-center text-slate-500">
                              Mindestens 2 Datenpunkte erforderlich für die Visualisierung
                            </div>
                          )}
                        </TabsContent>
                        <TabsContent value="table" className="mt-4">
                          {historySorted.length > 0 ? (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Datum</TableHead>
                                  <TableHead>Audit</TableHead>
                                  <TableHead>Produkt</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead>Compliance</TableHead>
                                  <TableHead>Abdeckung</TableHead>
                                  <TableHead>NA</TableHead>
                                  <TableHead>Kriterien</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {historySorted.map((audit) => (
                                  <TableRow key={audit.id}>
                                    <TableCell>
                                      {new Date(audit.audit_date).toLocaleDateString('de-DE')}
                                    </TableCell>
                                    <TableCell className="font-medium text-slate-900">
                                      {audit.name}
                                    </TableCell>
                                    <TableCell>{audit.product_name}</TableCell>
                                    <TableCell>{statusLabels[audit.status]}</TableCell>
                                    <TableCell>{audit.compliance_rate}%</TableCell>
                                    <TableCell>{audit.coverage_rate}%</TableCell>
                                    <TableCell>{audit.na_rate}%</TableCell>
                                    <TableCell>
                                      {audit.evaluated_criteria}/{audit.total_criteria}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          ) : (
                            <div className="text-sm text-slate-500">
                              Keine Daten für die Tabellenansicht.
                            </div>
                          )}
                        </TabsContent>
                      </Tabs>
                    </div>

                    {/* Audit History */}
                    {data.history.length > 0 && (
                      <AuditHistory history={data.history} />
                    )}

                    {/* Audit Dossier */}
                    {data.history.length > 0 && (
                      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mt-6">
                        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                          <div>
                            <h2 className="text-lg font-semibold text-slate-900">Audit-Dossier</h2>
                            <p className="text-sm text-slate-500">
                              Nachweis, Freigabe und Export für einzelne Audits.
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-3">
                            <Select
                              value={selectedAuditId || ''}
                              onValueChange={(value) => setSelectedAuditId(value)}
                            >
                              <SelectTrigger className="min-w-[220px]">
                                <SelectValue placeholder="Audit auswählen" />
                              </SelectTrigger>
                              <SelectContent>
                                {data.history.map((audit) => (
                                  <SelectItem key={audit.id} value={audit.id}>
                                    {audit.name} · {audit.product_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button variant="outline" onClick={() => downloadDossier('pdf')}>
                              <Download className="w-4 h-4 mr-2" />
                              PDF
                            </Button>
                            <Button variant="outline" onClick={() => downloadDossier('csv')}>
                              <FileText className="w-4 h-4 mr-2" />
                              CSV
                            </Button>
                          </div>
                        </div>

                        <div className="p-6">
                          {dossierQuery.isLoading && (
                            <div className="flex items-center gap-2 text-sm text-slate-500">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Dossier wird geladen...
                            </div>
                          )}
                          {dossierQuery.error && (
                            <div className="text-sm text-red-600">
                              Fehler beim Laden des Dossiers.
                            </div>
                          )}

                          {dossierQuery.data && (
                            <div className="space-y-6">
                              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <div className="lg:col-span-2 space-y-4">
                                  <div className="rounded-xl border border-slate-200 p-4">
                                    <h3 className="text-sm font-semibold text-slate-900 mb-3">Audit-Details</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-600">
                                      <div>
                                        <p className="text-xs text-slate-500">Produkt</p>
                                        <p className="font-medium text-slate-900">
                                          {dossierQuery.data.audit.product_name}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-slate-500">Version</p>
                                        <p className="font-medium text-slate-900">
                                          {dossierQuery.data.audit.product_version || '—'}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-slate-500">Datum</p>
                                        <p className="font-medium text-slate-900">
                                          {new Date(dossierQuery.data.audit.audit_date).toLocaleDateString('de-DE')}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-slate-500">Status</p>
                                        <p className="font-medium text-slate-900">
                                          {statusLabels[dossierQuery.data.audit.status]}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-slate-500">Auditor</p>
                                        <p className="font-medium text-slate-900">
                                          {dossierQuery.data.audit.auditor_name || '—'}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-slate-500">E-Mail</p>
                                        <p className="font-medium text-slate-900">
                                          {dossierQuery.data.audit.auditor_email || '—'}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-slate-500">Organisation</p>
                                        <p className="font-medium text-slate-900">
                                          {dossierQuery.data.audit.organization || '—'}
                                        </p>
                                      </div>
                                    </div>
                                    {dossierQuery.data.audit.notes && (
                                      <div className="mt-3 text-sm text-slate-600">
                                        <p className="text-xs text-slate-500 mb-1">Notizen</p>
                                        <p>{dossierQuery.data.audit.notes}</p>
                                      </div>
                                    )}
                                  </div>

                                  <div className="rounded-xl border border-slate-200 p-4">
                                    <h3 className="text-sm font-semibold text-slate-900 mb-3">Compliance-Status</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                      <div>
                                        <p className="text-xs text-slate-500">Compliance</p>
                                        <p className="text-lg font-semibold text-slate-900">
                                          {dossierQuery.data.metrics.compliance_rate}%
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-slate-500">Abdeckung</p>
                                        <p className="text-lg font-semibold text-slate-900">
                                          {dossierQuery.data.metrics.coverage_rate}%
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-slate-500">Nicht anwendbar</p>
                                        <p className="text-lg font-semibold text-slate-900">
                                          {dossierQuery.data.metrics.na_rate}%
                                        </p>
                                      </div>
                                    </div>
                                    <div className="mt-3 text-xs text-slate-500">
                                      Bewertet: {dossierQuery.data.metrics.evaluated_criteria}/{dossierQuery.data.metrics.total_criteria} ·
                                      Anwendbar: {dossierQuery.data.metrics.applicable_criteria}
                                    </div>
                                  </div>
                                </div>

                                <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                                  <div className="flex items-center gap-2">
                                    <UserCheck className="w-4 h-4 text-emerald-600" />
                                    <h3 className="text-sm font-semibold text-slate-900">Freigabe</h3>
                                  </div>

                                  {dossierQuery.data.audit.signoff_at && (
                                    <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                                      Freigegeben am {new Date(dossierQuery.data.audit.signoff_at).toLocaleDateString('de-DE')}
                                    </div>
                                  )}

                                  <div className="space-y-2">
                                    <Label>Name</Label>
                                    <Input
                                      value={signoffForm.name}
                                      onChange={(e) => setSignoffForm((prev) => ({ ...prev, name: e.target.value }))}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Rolle (optional)</Label>
                                    <Input
                                      value={signoffForm.role}
                                      onChange={(e) => setSignoffForm((prev) => ({ ...prev, role: e.target.value }))}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>E-Mail (optional)</Label>
                                    <Input
                                      value={signoffForm.email}
                                      onChange={(e) => setSignoffForm((prev) => ({ ...prev, email: e.target.value }))}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Notiz (optional)</Label>
                                    <Textarea
                                      value={signoffForm.notes}
                                      onChange={(e) => setSignoffForm((prev) => ({ ...prev, notes: e.target.value }))}
                                      rows={3}
                                    />
                                  </div>
                                  <div className="flex flex-col gap-2">
                                    <Button onClick={handleSignoff}>
                                      Freigabe speichern
                                    </Button>
                                    {dossierQuery.data.audit.signoff_at && (
                                      <Button variant="outline" onClick={handleClearSignoff}>
                                        Freigabe entfernen
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="rounded-xl border border-slate-200 p-4">
                                <h3 className="text-sm font-semibold text-slate-900 mb-3">Audit-Log</h3>
                                {dossierQuery.data.activity.length === 0 ? (
                                  <p className="text-sm text-slate-500">Keine Aktivitäten vorhanden.</p>
                                ) : (
                                  <div className="space-y-2">
                                    {dossierQuery.data.activity.map((entry) => (
                                      <div key={entry.id} className="flex items-center justify-between text-sm">
                                        <div className="flex items-center gap-2">
                                          <span className={`w-2 h-2 rounded-full ${entry.status === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                          <span className="text-slate-700">{activityLabels[entry.action] || entry.action}</span>
                                        </div>
                                        <span className="text-xs text-slate-400">
                                          {new Date(entry.created_at).toLocaleString('de-DE')}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
