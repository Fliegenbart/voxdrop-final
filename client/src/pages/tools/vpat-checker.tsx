import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import {
  ClipboardCheck,
  Plus,
  Download,
  ChevronDown,
  ChevronRight,
  Search,
  Filter,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  ArrowLeft,
  BarChart3,
  Crown,
} from "lucide-react";
import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import type {
  Audit,
  AuditWithDetails,
  AuditEvaluation,
  SupportLevel,
  ProductType,
} from "@/types/vpat";

const SUPPORT_COLORS: Record<SupportLevel, string> = {
  supports: 'bg-emerald-100 border-emerald-300 text-emerald-700',
  partially_supports: 'bg-amber-100 border-amber-300 text-amber-700',
  does_not_support: 'bg-red-100 border-red-300 text-red-700',
  not_applicable: 'bg-slate-100 border-slate-300 text-slate-500',
  not_evaluated: 'bg-white border-slate-200 text-slate-400',
};

const PRODUCT_LABELS: Record<ProductType, string> = {
  web: 'Webseite / Web-Anwendung',
  pdf: 'PDF-Dokument',
  app: 'Mobile App / Desktop-Software',
  document: 'Office-Dokument',
};

export default function VPATChecker() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  // State
  const [audits, setAudits] = useState<Audit[]>([]);
  const [activeAudit, setActiveAudit] = useState<AuditWithDetails | null>(null);
  const [view, setView] = useState<'list' | 'wizard' | 'checklist'>('list');
  const [isLoading, setIsLoading] = useState(false);

  // Wizard State
  const [wizardData, setWizardData] = useState({
    name: '',
    product_name: '',
    product_type: 'web' as ProductType,
    product_version: '',
    organization: '',
    audit_date: new Date().toISOString().split('T')[0],
    auditor_name: '',
  });

  // Filter State
  const [chapterFilter, setChapterFilter] = useState<string>('all');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Export State
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [bitvConfig, setBitvConfig] = useState({
    declaration_date: new Date().toISOString().split('T')[0],
    contact_email: '',
    contact_phone: '',
    feedback_url: '',
    include_methodology: true,
  });
  const [isExporting, setIsExporting] = useState(false);

  // Load audits
  useEffect(() => {
    if (isAuthenticated) {
      loadAudits();
    }
  }, [isAuthenticated]);

  const loadAudits = async () => {
    try {
      const response = await fetch('/api/vpat/audits', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setAudits(data.audits);
      }
    } catch (error) {
      console.error('Error loading audits:', error);
    }
  };

  const loadAuditDetails = async (auditId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/vpat/audits/${auditId}`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setActiveAudit(data);
        setView('checklist');
      }
    } catch (error) {
      console.error('Error loading audit details:', error);
      toast({ title: 'Fehler beim Laden', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const createAudit = async () => {
    if (!wizardData.name || !wizardData.product_name) {
      toast({ title: 'Bitte alle Pflichtfelder ausfüllen', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/vpat/audits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(wizardData),
      });

      if (response.ok) {
        const audit = await response.json();
        toast({ title: 'Audit erstellt' });
        await loadAuditDetails(audit.id);
        setWizardData({
          name: '',
          product_name: '',
          product_type: 'web',
          product_version: '',
          organization: '',
          audit_date: new Date().toISOString().split('T')[0],
          auditor_name: '',
        });
      } else {
        const error = await response.json();
        toast({ title: error.error || 'Fehler', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Fehler beim Erstellen', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const deleteAudit = async (auditId: string) => {
    if (!confirm('Audit wirklich löschen?')) return;

    try {
      const response = await fetch(`/api/vpat/audits/${auditId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        toast({ title: 'Audit gelöscht' });
        loadAudits();
        if (activeAudit?.id === auditId) {
          setActiveAudit(null);
          setView('list');
        }
      }
    } catch (error) {
      toast({ title: 'Fehler beim Löschen', variant: 'destructive' });
    }
  };

  const updateEvaluation = async (criterionId: string, updates: Partial<AuditEvaluation>) => {
    if (!activeAudit) return;

    try {
      const response = await fetch(`/api/vpat/audits/${activeAudit.id}/evaluations/${criterionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates),
      });

      if (response.ok) {
        // Optimistic update
        setActiveAudit(prev => {
          if (!prev) return null;
          const updatedEvaluations = prev.evaluations.map(e =>
            e.criterion_id === criterionId ? { ...e, ...updates } : e
          );

          // Recalculate progress
          const total = updatedEvaluations.length;
          const evaluated = updatedEvaluations.filter(e => e.support_level !== 'not_evaluated').length;
          const supports = updatedEvaluations.filter(e => e.support_level === 'supports').length;
          const partially = updatedEvaluations.filter(e => e.support_level === 'partially_supports').length;
          const doesNot = updatedEvaluations.filter(e => e.support_level === 'does_not_support').length;
          const notApplicable = updatedEvaluations.filter(e => e.support_level === 'not_applicable').length;
          const applicable = total - notApplicable;
          const complianceRate = applicable > 0
            ? Math.round(((supports + partially * 0.5) / applicable) * 100)
            : 0;

          return {
            ...prev,
            evaluations: updatedEvaluations,
            progress: {
              total_criteria: total,
              evaluated,
              supports,
              partially_supports: partially,
              does_not_support: doesNot,
              not_applicable: notApplicable,
              not_evaluated: total - evaluated,
              compliance_rate: complianceRate,
            },
          };
        });
      }
    } catch (error) {
      console.error('Error updating evaluation:', error);
    }
  };

  const exportBITV = async () => {
    if (!activeAudit) return;

    setIsExporting(true);
    try {
      const response = await fetch(`/api/vpat/audits/${activeAudit.id}/export/bitv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(bitvConfig),
      });

      if (response.ok) {
        const data = await response.json();

        // Download als HTML-Datei
        const blob = new Blob([data.html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `BITV_Erklärung_${activeAudit.product_name.replace(/[^a-zA-Z0-9]/g, '_')}.html`;
        a.click();
        URL.revokeObjectURL(url);

        toast({ title: 'BITV-Erklärung exportiert' });
        setExportDialogOpen(false);
      }
    } catch (error) {
      toast({ title: 'Export fehlgeschlagen', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const exportVPAT = async () => {
    if (!activeAudit) return;

    setIsExporting(true);
    try {
      const response = await fetch(`/api/vpat/audits/${activeAudit.id}/export/vpat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ language: 'de', include_not_applicable: true }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `VPAT_${activeAudit.product_name.replace(/[^a-zA-Z0-9]/g, '_')}.docx`;
        a.click();
        URL.revokeObjectURL(url);

        toast({ title: 'VPAT exportiert' });
      }
    } catch (error) {
      toast({ title: 'Export fehlgeschlagen', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  // Filter evaluations
  const filteredEvaluations = activeAudit?.evaluations.filter(e => {
    if (chapterFilter !== 'all' && (e as any).chapter?.toString() !== chapterFilter) return false;
    if (levelFilter !== 'all' && (e as any).level !== levelFilter) return false;
    if (statusFilter !== 'all' && e.support_level !== statusFilter) return false;
    if (searchQuery) {
      const search = searchQuery.toLowerCase();
      return (
        e.criterion_id.toLowerCase().includes(search) ||
        (e as any).title_de?.toLowerCase().includes(search) ||
        (e as any).wcag_criterion?.toLowerCase().includes(search)
      );
    }
    return true;
  }) || [];

  // Group by chapter
  const groupedEvaluations = filteredEvaluations.reduce((acc, e) => {
    const chapter = (e as any).chapter || 9;
    if (!acc[chapter]) acc[chapter] = [];
    acc[chapter].push(e);
    return acc;
  }, {} as Record<number, typeof filteredEvaluations>);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#f6f7fb]">
        <main className="max-w-4xl mx-auto px-6 py-16 text-center">
          <ClipboardCheck className="w-16 h-16 text-slate-300 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-slate-900 mb-4">VPAT & BITV Checker</h1>
          <p className="text-slate-600 mb-8">
            Bitte melden Sie sich an, um Compliance-Audits zu erstellen und zu verwalten.
          </p>
          <Button onClick={() => window.location.href = '/login'}>
            Anmelden
          </Button>
        </main>
      </div>
    );
  }

  return (
    <PageLayout>
      <SEO
        title="VPAT & BITV Checker"
        description="EN 301 549 Konformität dokumentieren und VPAT/BITV-Erklärungen exportieren."
        canonical="/tools/vpat-checker"
      />


      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          {view !== 'list' && (
            <Button
              variant="ghost"
              onClick={() => { setView('list'); setActiveAudit(null); }}
              className="mb-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Zurück zur Übersicht
            </Button>
          )}

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">
                {view === 'list' && 'VPAT & BITV Checker'}
                {view === 'wizard' && 'Neues Audit erstellen'}
                {view === 'checklist' && activeAudit?.name}
              </h1>
              <p className="text-slate-600 mt-1">
                {view === 'list' && 'EN 301 549 Konformität dokumentieren und Nachweise exportieren'}
                {view === 'wizard' && 'Geben Sie die Produktinformationen ein'}
                {view === 'checklist' && `${activeAudit?.product_name} - ${PRODUCT_LABELS[activeAudit?.product_type as ProductType] || ''}`}
              </p>
            </div>

            {view === 'list' && (
              <div className="flex items-center gap-3">
                <Link
                  href="/dashboard/compliance"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <BarChart3 className="w-4 h-4" />
                  Timeline
                  <span className="flex items-center gap-1 text-xs bg-gradient-to-r from-amber-500 to-orange-500 text-white px-1.5 py-0.5 rounded-full">
                    <Crown className="w-2.5 h-2.5" />
                  </span>
                </Link>
                <Button onClick={() => setView('wizard')}>
                  <Plus className="w-4 h-4 mr-2" />
                  Neues Audit
                </Button>
              </div>
            )}

            {view === 'checklist' && activeAudit && (
              <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Download className="w-4 h-4 mr-2" />
                    Exportieren
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
	                    <DialogTitle>Export</DialogTitle>
	                    <DialogDescription>
	                      Wählen Sie das Exportformat und konfigurieren Sie die Optionen.
	                    </DialogDescription>
	                  </DialogHeader>

                  <Tabs defaultValue="bitv">
                    <TabsList className="w-full">
                      <TabsTrigger value="bitv" className="flex-1">BITV-Erklärung</TabsTrigger>
                      <TabsTrigger value="vpat" className="flex-1">VPAT (Word)</TabsTrigger>
                    </TabsList>

                    <TabsContent value="bitv" className="space-y-4 mt-4">
                      <div>
                        <Label>Erklärungsdatum</Label>
                        <Input
                          type="date"
                          value={bitvConfig.declaration_date}
                          onChange={e => setBitvConfig(c => ({ ...c, declaration_date: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label>Kontakt E-Mail *</Label>
                        <Input
                          type="email"
                          placeholder="barrierefreiheit@example.de"
                          value={bitvConfig.contact_email}
                          onChange={e => setBitvConfig(c => ({ ...c, contact_email: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label>Telefon (optional)</Label>
                        <Input
                          placeholder="+49 30 12345678"
                          value={bitvConfig.contact_phone}
                          onChange={e => setBitvConfig(c => ({ ...c, contact_phone: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label>Feedback-URL (optional)</Label>
                        <Input
                          placeholder="https://example.de/feedback"
                          value={bitvConfig.feedback_url}
                          onChange={e => setBitvConfig(c => ({ ...c, feedback_url: e.target.value }))}
                        />
                      </div>

                      <Button
                        onClick={exportBITV}
                        disabled={!bitvConfig.contact_email || isExporting}
                        className="w-full"
                      >
                        {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                        BITV-Erklärung (HTML)
                      </Button>
                    </TabsContent>

                    <TabsContent value="vpat" className="space-y-4 mt-4">
                      <p className="text-sm text-slate-600">
                        Exportiert einen VPAT-Bericht im Word-Format basierend auf dem VPAT 2.4 Rev (EU) Template.
                      </p>

                      <Button
                        onClick={exportVPAT}
                        disabled={isExporting}
                        className="w-full"
                      >
                        {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                        VPAT (Word)
                      </Button>
                    </TabsContent>
                  </Tabs>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* Audit List */}
        {view === 'list' && (
          <div className="space-y-4">
            {audits.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                <ClipboardCheck className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-slate-900 mb-2">Keine Audits vorhanden</h2>
                <p className="text-slate-600 mb-6">
                  Erstellen Sie Ihr erstes Compliance-Audit, um EN 301 549 Konformitaet zu dokumentieren.
                </p>
                <Button onClick={() => setView('wizard')}>
                  <Plus className="w-4 h-4 mr-2" />
                  Erstes Audit erstellen
                </Button>
              </div>
            ) : (
              audits.map(audit => (
                <div
                  key={audit.id}
                  className="bg-white rounded-xl border border-slate-200 p-6 hover:border-slate-300 transition-colors cursor-pointer"
                  onClick={() => loadAuditDetails(audit.id)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-slate-900">{audit.name}</h3>
                      <p className="text-sm text-slate-600">{audit.product_name}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="secondary">{PRODUCT_LABELS[audit.product_type as ProductType]}</Badge>
                        <Badge variant={audit.status === 'completed' ? 'default' : 'outline'}>
                          {audit.status === 'draft' && 'Entwurf'}
                          {audit.status === 'in_progress' && 'In Bearbeitung'}
                          {audit.status === 'completed' && 'Abgeschlossen'}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={e => { e.stopPropagation(); deleteAudit(audit.id); }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <ChevronRight className="w-5 h-5 text-slate-400" />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Wizard */}
        {view === 'wizard' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 max-w-2xl mx-auto">
            <div className="space-y-6">
              <div>
                <Label>Audit-Name *</Label>
                <Input
                  placeholder="z.B. Barrierefreiheitsprüfung Bürgerportal 2024"
                  value={wizardData.name}
                  onChange={e => setWizardData(d => ({ ...d, name: e.target.value }))}
                />
              </div>

              <div>
                <Label>Produktname *</Label>
                <Input
                  placeholder="z.B. Bürgerportal Stadt Musterstadt"
                  value={wizardData.product_name}
                  onChange={e => setWizardData(d => ({ ...d, product_name: e.target.value }))}
                />
              </div>

              <div>
                <Label>Produkttyp *</Label>
                <Select
                  value={wizardData.product_type}
                  onValueChange={v => setWizardData(d => ({ ...d, product_type: v as ProductType }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="web">Webseite / Web-Anwendung</SelectItem>
                    <SelectItem value="pdf">PDF-Dokument</SelectItem>
                    <SelectItem value="document">Office-Dokument</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Version (optional)</Label>
                  <Input
                    placeholder="z.B. 2.1.0"
                    value={wizardData.product_version}
                    onChange={e => setWizardData(d => ({ ...d, product_version: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Prüfungsdatum</Label>
                  <Input
                    type="date"
                    value={wizardData.audit_date}
                    onChange={e => setWizardData(d => ({ ...d, audit_date: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <Label>Organisation (optional)</Label>
                <Input
                  placeholder="z.B. Stadt Musterstadt"
                  value={wizardData.organization}
                  onChange={e => setWizardData(d => ({ ...d, organization: e.target.value }))}
                />
              </div>

              <div>
                <Label>Pruefer (optional)</Label>
                <Input
                  placeholder="Ihr Name"
                  value={wizardData.auditor_name}
                  onChange={e => setWizardData(d => ({ ...d, auditor_name: e.target.value }))}
                />
              </div>

              <div className="flex gap-4 pt-4">
                <Button variant="outline" onClick={() => setView('list')} className="flex-1">
                  Abbrechen
                </Button>
                <Button onClick={createAudit} disabled={isLoading} className="flex-1">
                  {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                  Audit erstellen
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Checklist */}
        {view === 'checklist' && activeAudit && (
          <div className="space-y-6">
            {/* Progress */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Fortschritt</h2>
                <span className="text-2xl font-bold text-slate-900">
                  {activeAudit.progress.compliance_rate}%
                </span>
              </div>

              <Progress value={activeAudit.progress.compliance_rate} className="h-3 mb-4" />

              <div className="grid grid-cols-5 gap-4 text-center text-sm">
	                <div>
	                  <div className="font-semibold text-emerald-600">{activeAudit.progress.supports}</div>
	                  <div className="text-slate-500">Erfüllt</div>
	                </div>
                <div>
                  <div className="font-semibold text-amber-600">{activeAudit.progress.partially_supports}</div>
                  <div className="text-slate-500">Teilweise</div>
                </div>
	                <div>
	                  <div className="font-semibold text-red-600">{activeAudit.progress.does_not_support}</div>
	                  <div className="text-slate-500">Nicht erfüllt</div>
	                </div>
                <div>
                  <div className="font-semibold text-slate-500">{activeAudit.progress.not_applicable}</div>
                  <div className="text-slate-500">N/A</div>
                </div>
                <div>
                  <div className="font-semibold text-slate-400">{activeAudit.progress.not_evaluated}</div>
                  <div className="text-slate-500">Offen</div>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      placeholder="Suchen..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <Select value={chapterFilter} onValueChange={setChapterFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Kapitel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Kapitel</SelectItem>
                    <SelectItem value="9">Kapitel 9 - Web</SelectItem>
                    <SelectItem value="10">Kapitel 10 - Dokumente</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={levelFilter} onValueChange={setLevelFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Level</SelectItem>
                    <SelectItem value="A">Level A</SelectItem>
                    <SelectItem value="AA">Level AA</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
	                  <SelectContent>
	                    <SelectItem value="all">Alle Status</SelectItem>
	                    <SelectItem value="not_evaluated">Nicht bewertet</SelectItem>
	                    <SelectItem value="supports">Erfüllt</SelectItem>
	                    <SelectItem value="partially_supports">Teilweise</SelectItem>
	                    <SelectItem value="does_not_support">Nicht erfüllt</SelectItem>
	                    <SelectItem value="not_applicable">Nicht anwendbar</SelectItem>
	                  </SelectContent>
	                </Select>
              </div>
            </div>

            {/* Criteria List */}
            <div className="space-y-4">
              {Object.entries(groupedEvaluations).map(([chapter, evals]) => (
                <div key={chapter} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
                    <h3 className="font-semibold text-slate-900">
                      {chapter === '9' ? 'Kapitel 9 - Web' : 'Kapitel 10 - Dokumente'}
                      <span className="ml-2 text-sm font-normal text-slate-500">
                        ({evals.length} Kriterien)
                      </span>
                    </h3>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {evals.map(evaluation => (
                      <CriterionRow
                        key={evaluation.criterion_id}
                        evaluation={evaluation}
                        onUpdate={(updates) => updateEvaluation(evaluation.criterion_id, updates)}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {filteredEvaluations.length === 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                  <Filter className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-600">Keine Kriterien gefunden</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

    </PageLayout>
  );
}

// Criterion Row Component
interface CriterionRowProps {
  evaluation: any;
  onUpdate: (updates: Partial<AuditEvaluation>) => void;
}

function CriterionRow({ evaluation, onUpdate }: CriterionRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [remarks, setRemarks] = useState(evaluation.remarks_de || '');

  const handleSupportChange = (level: SupportLevel) => {
    onUpdate({ support_level: level });
  };

  const handleRemarksBlur = () => {
    if (remarks !== (evaluation.remarks_de || '')) {
      onUpdate({ remarks_de: remarks });
    }
  };

  return (
    <div className={`border-l-4 ${SUPPORT_COLORS[evaluation.support_level as SupportLevel].split(' ')[0]}`}>
      <div
        className="px-6 py-4 cursor-pointer hover:bg-slate-50"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-sm text-slate-500">{evaluation.criterion_id}</span>
              <Badge variant="outline" className="text-xs">{evaluation.level}</Badge>
              {evaluation.wcag_criterion && (
                <Badge variant="secondary" className="text-xs">WCAG {evaluation.wcag_criterion}</Badge>
              )}
            </div>
            <h4 className="font-medium text-slate-900">{evaluation.title_de}</h4>
          </div>

          <div className="flex items-center gap-3 ml-4">
            <Select
              value={evaluation.support_level}
              onValueChange={handleSupportChange}
            >
              <SelectTrigger
                className={`w-[180px] ${SUPPORT_COLORS[evaluation.support_level as SupportLevel]}`}
                onClick={e => e.stopPropagation()}
              >
                <SelectValue />
              </SelectTrigger>
	              <SelectContent>
	                <SelectItem value="supports">
	                  <span className="flex items-center gap-2">
	                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
	                    Erfüllt
	                  </span>
	                </SelectItem>
	                <SelectItem value="partially_supports">
	                  <span className="flex items-center gap-2">
	                    <AlertTriangle className="w-4 h-4 text-amber-500" />
	                    Teilweise erfüllt
	                  </span>
	                </SelectItem>
	                <SelectItem value="does_not_support">
	                  <span className="flex items-center gap-2">
	                    <XCircle className="w-4 h-4 text-red-500" />
	                    Nicht erfüllt
	                  </span>
	                </SelectItem>
                <SelectItem value="not_applicable">
                  <span className="flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-slate-400" />
                    Nicht anwendbar
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>

            {expanded ? (
              <ChevronDown className="w-5 h-5 text-slate-400" />
            ) : (
              <ChevronRight className="w-5 h-5 text-slate-400" />
            )}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-6 pb-4 space-y-4 border-t border-slate-100 pt-4 bg-slate-50">
          {evaluation.description_de && (
            <p className="text-sm text-slate-600">{evaluation.description_de}</p>
          )}

          {evaluation.testing_guidance_de && (
            <div className="p-3 bg-violet-50 rounded-lg border border-violet-100">
              <h5 className="text-xs font-medium text-violet-800 mb-1">Pruefhinweis</h5>
              <p className="text-sm text-violet-700">{evaluation.testing_guidance_de}</p>
            </div>
          )}

          <div>
            <Label className="text-sm">Anmerkungen / Begruendung</Label>
            <Textarea
              placeholder="Beschreiben Sie den Status oder notieren Sie Verbesserungsvorschlaege..."
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              onBlur={handleRemarksBlur}
              className="mt-1"
              rows={3}
              onClick={e => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
