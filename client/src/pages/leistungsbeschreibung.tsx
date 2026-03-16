import {
  FileText, Download, ArrowLeft, CheckCircle2, Video, Type, Palette,
  FileCheck, Users, Shield, Server, Headphones, Clock, Mail, Globe
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import { PageLayout } from "@/components/PageLayout";

const modules = [
  {
    category: "Create",
    color: "blue",
    items: [
      {
        name: "Video-Untertitelung",
        description: "Automatische Transkription von Audio/Video mit KI, Generierung von SRT/VTT-Untertiteln, Einbrennen in MP4",
        icon: Video,
      },
      {
        name: "PPTX → PDF/UA",
        description: "Konvertiert PowerPoint-Präsentationen in strukturierte, screenreader-lesbare PDFs (PDF/UA) inkl. Überschriften, Listen, Tabellen und Alternativtexten",
        icon: FileText,
      },
      {
        name: "Einfache Sprache",
        description: "Textanalyse und -vereinfachung nach Regeln für Einfache/Leichte Sprache, Scoring und Verbesserungsvorschläge",
        icon: Type,
      },
    ],
  },
  {
    category: "Verify",
    color: "green",
    items: [
      {
        name: "Web-Prüfung",
        description: "Automatischer Smoke-Test für ARIA, Tastatur-Bedienbarkeit und typische WCAG/BITV-Probleme inkl. Checkliste",
        icon: Globe,
      },
      {
        name: "Formular-Check (Web/PDF)",
        description: "Prüft typische Form- und PDF-Formularprobleme (Labels, Fokusreihenfolge, Fehlermeldungen, Formularfelder)",
        icon: FileCheck,
      },
      {
        name: "Kontrastprüfung",
        description: "WCAG 2.1 Farbkontrastprüfung, Farbfehlsichtigkeits-Simulation, Optimierungsvorschläge",
        icon: Palette,
      },
      {
        name: "VPAT/EN 301 549 Nachweise",
        description: "Report-Generator für Vergabe, Audits und Dokumentationspflichten (VPAT/EN 301 549) inkl. interner Checklisten",
        icon: FileCheck,
      },
    ],
  },
];

export default function Leistungsbeschreibung() {
  return (
    <PageLayout>
      <SEO
        title="Leistungsbeschreibung – VoxDrop Accessibility Suite"
        description="Vollständige Servicebeschreibung der VoxDrop Accessibility Suite für öffentliche Ausschreibungen. EVB-IT Cloud kompatibel."
        canonical="/leistungsbeschreibung"
      />

      <main id="main-content" className="max-w-4xl mx-auto px-6 py-12" tabIndex={-1}>
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
              <FileText className="w-6 h-6 text-violet-600" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                Leistungsbeschreibung
              </h1>
              <p className="text-slate-600 mt-1">
                VoxDrop Accessibility Suite – EVB-IT Cloud Anlage
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm text-slate-600 mb-6">
            <span>Version 1.1</span>
            <span>|</span>
            <span>Stand: Januar 2026</span>
          </div>

          <Button
            className="bg-violet-600 hover:bg-violet-700"
            onClick={() => typeof window !== 'undefined' && window.print()}
          >
            <Download className="w-4 h-4 mr-2" />
            Als PDF herunterladen
          </Button>
        </div>

        {/* Content */}
        <div className="space-y-8">

          {/* 1. Zweck */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              1. Zweck und Leistungsgegenstand
            </h2>
            <p className="text-slate-700 mb-4">
              Die VoxDrop Accessibility Suite ist eine webbasierte Software-as-a-Service (SaaS) Lösung
              zur Erstellung, Prüfung und Transformation barrierearmer digitaler Inhalte.
            </p>
            <p className="text-slate-700 mb-4">
              <strong>Ziel:</strong> Unterstützung bei der Erfüllung gesetzlicher Barrierefreiheitsanforderungen
              (BITV 2.0, BFSG, EN 301 549, WCAG 2.1) durch automatisierte und KI-gestützte Werkzeuge.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm text-amber-800">
                <strong>Abgrenzung:</strong> VoxDrop ersetzt keine rechtliche Prüfung oder menschliche
                Qualitätssicherung. Die Tools liefern technische Unterstützung und Vorschläge,
                die finale Verantwortung liegt beim Auftraggeber.
              </p>
            </div>
          </section>

          {/* 2. Servicemodell */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              2. Servicemodell und Bereitstellung
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="p-4 bg-slate-50 rounded-lg">
                <h3 className="font-semibold text-slate-900 mb-2">Bereitstellungsform</h3>
                <ul className="text-sm text-slate-700 space-y-1">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    Public Cloud (Multi-Tenant)
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    Private Tenant auf Anfrage
                  </li>
                </ul>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg">
                <h3 className="font-semibold text-slate-900 mb-2">Datenverarbeitung</h3>
                <ul className="text-sm text-slate-700 space-y-1">
                  <li className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-violet-600" />
                    Server in Deutschland (Hetzner)
                  </li>
                  <li className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-violet-600" />
                    DSGVO-konform
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* 3. Module */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-6">
              3. Funktionaler Umfang (Module)
            </h2>
            {modules.map((category, i) => (
              <div key={i} className="mb-6 last:mb-0">
                <h3 className={`text-lg font-semibold mb-4 ${
                  category.color === "blue" ? "text-violet-700" : "text-green-700"
                }`}>
                  3.{i + 1} {category.category}
                </h3>
                <div className="space-y-4">
                  {category.items.map((item, j) => (
                    <div key={j} className="flex gap-4 p-4 bg-slate-50 rounded-lg">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        category.color === "blue" ? "bg-violet-100" : "bg-green-100"
                      }`}>
                        <item.icon className={`w-5 h-5 ${
                          category.color === "blue" ? "text-violet-600" : "text-green-600"
                        }`} />
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-900">{item.name}</h4>
                        <p className="text-sm text-slate-600">{item.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>

          {/* 4. Nutzungsgrenzen */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              4. Nutzungsgrenzen und Fair Use
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Parameter</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Free</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Pro</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Team</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr>
                    <td className="px-4 py-3">Transkriptionen/Monat</td>
                    <td className="px-4 py-3">5</td>
                    <td className="px-4 py-3">100</td>
                    <td className="px-4 py-3">Unbegrenzt</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Max. Dateigröße</td>
                    <td className="px-4 py-3">100 MB</td>
                    <td className="px-4 py-3">500 MB</td>
                    <td className="px-4 py-3">5 GB</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Unterstützte Formate</td>
                    <td className="px-4 py-3" colSpan={3}>MP4, MP3, WAV, WEBM, PDF, PPTX, DOCX</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Speicherdauer Uploads</td>
                    <td className="px-4 py-3">24h</td>
                    <td className="px-4 py-3">24–72h</td>
                    <td className="px-4 py-3">Konfigurierbar</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 5. Rollen */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              5. Rollen und Berechtigungen
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                { role: "Nutzer", rights: "Eigene Dateien hochladen, verarbeiten, exportieren" },
                { role: "Admin", rights: "Nutzerverwaltung, Einstellungen, Audit-Logs" },
              ].map((item, i) => (
                <div key={i} className="p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-5 h-5 text-slate-600" />
                    <h3 className="font-semibold text-slate-900">{item.role}</h3>
                  </div>
                  <p className="text-sm text-slate-600">{item.rights}</p>
                </div>
              ))}
            </div>
            <p className="text-sm text-slate-600 mt-4">
              SSO-Integration (SAML/OIDC) auf Anfrage verfügbar.
            </p>
          </section>

          {/* 6. Betrieb */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              6. Betrieb und Support
            </h2>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-4 bg-slate-50 rounded-lg text-center">
                <Clock className="w-6 h-6 text-violet-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-slate-900">99,5%</div>
                <div className="text-sm text-slate-600">Verfügbarkeit</div>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg text-center">
                <Headphones className="w-6 h-6 text-violet-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-slate-900">Mo-Fr</div>
                <div className="text-sm text-slate-600">09:00-17:00 Support</div>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg text-center">
                <Mail className="w-6 h-6 text-violet-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-slate-900">&lt; 24h</div>
                <div className="text-sm text-slate-600">Reaktionszeit</div>
              </div>
            </div>
            <p className="text-sm text-slate-600 mt-4">
              Details siehe <Link href="/sla" className="text-violet-600 hover:underline">Service Level Agreement (SLA)</Link>.
            </p>
          </section>

          {/* 7. Verweise */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              7. Verweise auf weitere Anlagen
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                { title: "Service Level Agreement", href: "/sla" },
                { title: "Auftragsverarbeitungsvertrag", href: "/avv" },
                { title: "Technisch-org. Maßnahmen", href: "/toms" },
                { title: "Exit- & Löschkonzept", href: "/exit-konzept" },
                { title: "Subunternehmer-Verzeichnis", href: "/subunternehmer" },
                { title: "C5-Basiskriterien Mapping", href: "/c5-mapping" },
              ].map((item, i) => (
                <Link key={i} href={item.href}>
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">
                    <span className="font-medium text-slate-900">{item.title}</span>
                    <ArrowLeft className="w-4 h-4 text-slate-400 rotate-180" />
                  </div>
                </Link>
              ))}
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="mt-8 flex items-center gap-4 text-sm text-slate-600">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <span>Dokument-ID: LB-2026-001 | Stand: Januar 2026</span>
        </div>
      </main>
    </PageLayout>
  );
}
