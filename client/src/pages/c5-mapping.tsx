import {
  Shield, Download, ArrowLeft, CheckCircle2, Users, Activity,
  Database, AlertTriangle, FileText, Key, Eye
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import { PageLayout } from "@/components/PageLayout";

const c5Domains = [
  {
    domain: "Organisation der Informationssicherheit (OIS)",
    icon: Shield,
    color: "blue",
    criteria: [
      {
        id: "OIS-01",
        name: "Informationssicherheitsmanagementsystem",
        implementation: "ISMS-Richtlinie, dokumentierte Prozesse, regelmäßige Reviews",
        evidence: "ISMS-Policy, Risk Register",
        status: "implemented",
      },
      {
        id: "OIS-02",
        name: "Sicherheitsorganisation",
        implementation: "Definierte Rollen und Verantwortlichkeiten, Security Owner",
        evidence: "Organigramm, Rollenbeschreibungen",
        status: "implemented",
      },
    ],
  },
  {
    domain: "Identitäts- und Berechtigungsmanagement (IDM)",
    icon: Users,
    color: "green",
    criteria: [
      {
        id: "IDM-01",
        name: "Benutzerregistrierung",
        implementation: "E-Mail-Verifizierung, sichere Passwortrichtlinien",
        evidence: "Auth-Logs, Registrierungsprozess",
        status: "implemented",
      },
      {
        id: "IDM-02",
        name: "Zugriffsberechtigungen",
        implementation: "RBAC (Role-Based Access Control), Least Privilege",
        evidence: "Berechtigungsmatrix, Audit-Logs",
        status: "implemented",
      },
      {
        id: "IDM-03",
        name: "Privilegierte Zugänge",
        implementation: "MFA für Admin-Zugänge, separate Admin-Accounts",
        evidence: "MFA-Konfiguration, Access-Logs",
        status: "implemented",
      },
    ],
  },
  {
    domain: "Kryptographie und Schlüsselmanagement (KRY)",
    icon: Key,
    color: "purple",
    criteria: [
      {
        id: "KRY-01",
        name: "Verschlüsselung in Transit",
        implementation: "TLS 1.3 für alle Verbindungen, HSTS",
        evidence: "SSL-Zertifikate, TLS-Konfiguration",
        status: "implemented",
      },
      {
        id: "KRY-02",
        name: "Verschlüsselung at Rest",
        implementation: "AES-256 für gespeicherte Daten",
        evidence: "Storage-Konfiguration",
        status: "implemented",
      },
    ],
  },
  {
    domain: "Protokollierung und Überwachung (LOG)",
    icon: Activity,
    color: "orange",
    criteria: [
      {
        id: "LOG-01",
        name: "Sicherheitsrelevante Protokollierung",
        implementation: "Zentrale Logs für Auth, Access, Errors",
        evidence: "Log-Policy, Log-Samples",
        status: "implemented",
      },
      {
        id: "LOG-02",
        name: "Audit-Trails",
        implementation: "Unveränderliche Audit-Logs, User-Aktionen",
        evidence: "Audit-Log-Export",
        status: "implemented",
      },
      {
        id: "LOG-03",
        name: "Monitoring und Alerting",
        implementation: "Uptime-Monitoring, Error-Alerting",
        evidence: "Monitoring-Dashboard",
        status: "implemented",
      },
    ],
  },
  {
    domain: "Datensicherung und Wiederherstellung (BCM)",
    icon: Database,
    color: "teal",
    criteria: [
      {
        id: "BCM-01",
        name: "Backup-Strategie",
        implementation: "Tägliche automatisierte Backups, geografisch getrennt",
        evidence: "Backup-Reports, Retention-Policy",
        status: "implemented",
      },
      {
        id: "BCM-02",
        name: "Wiederherstellungstests",
        implementation: "Regelmäßige Restore-Tests",
        evidence: "Restore-Protokolle",
        status: "implemented",
      },
    ],
  },
  {
    domain: "Schwachstellenmanagement (VUL)",
    icon: AlertTriangle,
    color: "red",
    criteria: [
      {
        id: "VUL-01",
        name: "Schwachstellen-Scanning",
        implementation: "Container-Scans, Dependency-Checks (npm audit)",
        evidence: "Scan-Reports",
        status: "implemented",
      },
      {
        id: "VUL-02",
        name: "Patch-Management",
        implementation: "Regelmäßige Updates, kritische Patches < 48h",
        evidence: "Update-Logs, Patch-Plan",
        status: "implemented",
      },
    ],
  },
  {
    domain: "Incident Management (INC)",
    icon: AlertTriangle,
    color: "yellow",
    criteria: [
      {
        id: "INC-01",
        name: "Incident-Response-Plan",
        implementation: "Dokumentierter IR-Plan, Eskalationspfade",
        evidence: "IR-Runbook",
        status: "implemented",
      },
      {
        id: "INC-02",
        name: "Meldewege",
        implementation: "Definierte Kontakte, Meldefristen (72h DSGVO)",
        evidence: "Kontaktliste, Prozessdoku",
        status: "implemented",
      },
    ],
  },
  {
    domain: "Lieferantenmanagement (SUP)",
    icon: FileText,
    color: "gray",
    criteria: [
      {
        id: "SUP-01",
        name: "Lieferantenbewertung",
        implementation: "Sorgfältige Auswahl, Prüfung der Sicherheitsmaßnahmen",
        evidence: "Vendor-Register, Due-Diligence-Checklisten",
        status: "implemented",
      },
      {
        id: "SUP-02",
        name: "Vertragliche Regelungen",
        implementation: "AVV mit allen Unterauftragnehmern",
        evidence: "AVV-Dokumentation, Subunternehmer-Liste",
        status: "implemented",
      },
    ],
  },
];

const DOMAIN_COLOR_STYLES: Record<string, { bg: string; text: string }> = {
  blue: { bg: 'bg-violet-50', text: 'text-violet-600' },
  green: { bg: 'bg-green-50', text: 'text-green-600' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-600' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-600' },
  teal: { bg: 'bg-teal-50', text: 'text-teal-600' },
  red: { bg: 'bg-red-50', text: 'text-red-600' },
  yellow: { bg: 'bg-yellow-50', text: 'text-yellow-600' },
  gray: { bg: 'bg-slate-50', text: 'text-slate-600' },
};

const customerCriteria = [
  {
    title: "Passwort-Richtlinie",
    description: "Sichere Passwörter verwenden (min. 12 Zeichen, Komplexität)",
  },
  {
    title: "MFA aktivieren",
    description: "Zwei-Faktor-Authentifizierung für Admin-Accounts empfohlen",
  },
  {
    title: "Berechtigungen prüfen",
    description: "Regelmäßige Überprüfung der Nutzerberechtigungen",
  },
  {
    title: "Offboarding",
    description: "Accounts ehemaliger Mitarbeiter zeitnah deaktivieren",
  },
  {
    title: "Retention-Einstellungen",
    description: "Angemessene Löschfristen in der Admin-Konsole konfigurieren",
  },
  {
    title: "Export-Kontrolle",
    description: "Exportierte Daten sicher verwahren und bei Bedarf löschen",
  },
];

export default function C5Mapping() {
  const handleExportCsv = () => {
    if (typeof window === 'undefined') return;

    const header = ['Domain', 'Kriterium-ID', 'Kriterium', 'Umsetzung bei VoxDrop', 'Evidenz', 'Status'];
    const rows: string[][] = [header];

    for (const domain of c5Domains) {
      for (const c of domain.criteria) {
        rows.push([
          domain.domain,
          c.id,
          c.name,
          c.implementation,
          c.evidence,
          c.status,
        ]);
      }
    }

    const csv = rows
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/\"/g, '""')}"`)
          .join(';')
      )
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'voxdrop-c5-mapping.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PageLayout>
      <SEO
        title="BSI C5-Basiskriterien Mapping"
        description="Mapping der BSI C5-Basiskriterien auf VoxDrop-Sicherheitsmaßnahmen. Dokumentation für EVB-IT Cloud Compliance."
        canonical="/c5-mapping"
      />

      <main id="main-content" className="max-w-5xl mx-auto px-6 py-12" tabIndex={-1}>
        <Link href="/behoerden">
          <span className="inline-flex items-center gap-2 text-violet-600 hover:text-violet-700 mb-8 cursor-pointer">
            <ArrowLeft className="w-4 h-4" />
            Zurück zur Behörden-Seite
          </span>
        </Link>

        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mb-8">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 bg-violet-50 rounded-xl flex items-center justify-center">
              <Shield className="w-6 h-6 text-violet-600" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                BSI C5-Basiskriterien Mapping
              </h1>
              <p className="text-slate-600 mt-1">
                Cloud Computing Compliance Criteria Catalogue – EVB-IT Cloud Anlage
              </p>
            </div>
          </div>

          <p className="text-slate-700 mb-6">
            Die EVB-IT Cloud-AGB verpflichten zur Einhaltung der C5-Basiskriterien des BSI.
            Dieses Dokument zeigt die Umsetzung bei VoxDrop.
          </p>

          <div className="flex flex-wrap gap-4">
            <Button
              className="bg-violet-600 hover:bg-violet-700"
              onClick={() => typeof window !== 'undefined' && window.print()}
            >
              <Download className="w-4 h-4 mr-2" />
              Als PDF herunterladen
            </Button>
            <Button variant="outline" onClick={handleExportCsv}>
              <FileText className="w-4 h-4 mr-2" />
              Excel-Export
            </Button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 text-center">
            <div className="text-3xl font-bold text-green-600">8</div>
            <div className="text-sm text-slate-600">Domänen abgedeckt</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 text-center">
            <div className="text-3xl font-bold text-green-600">17</div>
            <div className="text-sm text-slate-600">Kriterien umgesetzt</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 text-center">
            <div className="text-3xl font-bold text-violet-600">100%</div>
            <div className="text-sm text-slate-600">Basiskriterien</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 text-center">
            <div className="text-3xl font-bold text-slate-600">Jan 2026</div>
            <div className="text-sm text-slate-600">Letzte Aktualisierung</div>
          </div>
        </div>

        {/* C5 Domains */}
        <div className="space-y-6 mb-12">
          {c5Domains.map((domain, i) => (
            <div key={i} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className={`p-4 border-b border-slate-100 ${(DOMAIN_COLOR_STYLES[domain.color] || DOMAIN_COLOR_STYLES.gray).bg}`}>
                <div className="flex items-center gap-3">
                  <domain.icon className={`w-5 h-5 ${(DOMAIN_COLOR_STYLES[domain.color] || DOMAIN_COLOR_STYLES.gray).text}`} />
                  <h2 className="text-lg font-semibold text-slate-900">{domain.domain}</h2>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700 w-24">ID</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Kriterium</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Umsetzung bei VoxDrop</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Evidenz</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700 w-24">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {domain.criteria.map((c, j) => (
                      <tr key={j}>
                        <td className="px-4 py-3 font-mono text-slate-600">{c.id}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                        <td className="px-4 py-3 text-slate-600">{c.implementation}</td>
                        <td className="px-4 py-3 text-slate-600">{c.evidence}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                            <CheckCircle2 className="w-3 h-3" />
                            Umgesetzt
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>

        {/* Customer Corresponding Criteria */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mb-8">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">
            Korrespondierende Kriterien für Kunden
          </h2>
          <p className="text-slate-700 mb-6">
            Die C5-Systematik enthält auch Kriterien, die vom Kunden umzusetzen sind.
            Folgende Maßnahmen empfehlen wir unseren Auftraggebern:
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            {customerCriteria.map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-violet-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium text-slate-900">{item.title}</h3>
                  <p className="text-sm text-slate-600">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Audit Info */}
        <div className="bg-violet-50 rounded-2xl p-6 border border-violet-100">
          <div className="flex items-start gap-3">
            <Eye className="w-5 h-5 text-violet-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-blue-900 mb-2">Prüfrechte und Nachweise</h3>
              <p className="text-sm text-violet-800 mb-3">
                Gemäß EVB-IT Cloud-AGB haben Auftraggeber das Recht, die Einhaltung der
                Sicherheitsmaßnahmen zu prüfen. Wir stellen auf Anfrage folgende Nachweise bereit:
              </p>
              <ul className="text-sm text-violet-800 space-y-1">
                <li>• Detaillierte Evidenz-Dokumentation zu einzelnen Kriterien</li>
                <li>• Aktuelle Scan-/Audit-Reports</li>
                <li>• Begehung / Remote-Audit nach Vereinbarung</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 flex items-center gap-4 text-sm text-slate-600">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <span>Dokument-ID: C5-2026-001 | Stand: Januar 2026 | Nächste Aktualisierung: Q2/2026</span>
        </div>
      </main>
    </PageLayout>
  );
}
