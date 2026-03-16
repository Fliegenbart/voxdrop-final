import {
  LogOut, Download, ArrowLeft, CheckCircle2, Database, FileText,
  Clock, Shield, HardDrive, AlertTriangle, FileArchive
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import { PageLayout } from "@/components/PageLayout";

const dataClasses = [
  {
    name: "Account-/Mandantendaten",
    examples: "Nutzer-ID, E-Mail, Name, Organisation, Rolle",
    retention: "Bis Löschung/Vertragsende (gesetzliche Pflichten ausgenommen)",
    export: "JSON",
  },
  {
    name: "Uploads (Originale)",
    examples: "PDF, PPTX, MP4, MP3, WAV",
    retention: "Temporär (Standard: 24h; Filesharing optional 24–72h)",
    export: "Originalformat",
  },
  {
    name: "Derivate/Outputs",
    examples: "SRT, VTT, eingebrannte MP4, vereinfachte Texte",
    retention: "Wie Uploads",
    export: "Originalformat",
  },
  {
    name: "Metadaten",
    examples: "Dateinamen, Parameter, Timestamps, Job-Status",
    retention: "Temporär (Job-Metadaten standardmäßig 24h)",
    export: "JSON/CSV",
  },
  {
    name: "Audit-Logs",
    examples: "Wer, wann, was verarbeitet/exportiert",
    retention: "90 Tage (Standard, konfigurierbar)",
    export: "JSON/CSV",
  },
  {
    name: "Backups",
    examples: "Datenbank-Snapshots, Storage-Backups",
    retention: "Nach Policy / Vereinbarung",
    export: "Nicht direkt",
  },
];

const deletionSteps = [
  {
    step: 1,
    title: "Markierung",
    description: "Tenant wird auf 'Read-only' gesetzt, neue Verarbeitungen gesperrt",
    icon: AlertTriangle,
  },
  {
    step: 2,
    title: "Export-Frist",
    description: "30 Tage Zeit für finale Datenexporte durch den Auftraggeber",
    icon: Download,
  },
  {
    step: 3,
    title: "Primary Storage",
    description: "Löschung aller Uploads, Outputs, Metadaten aus Produktivsystem",
    icon: Database,
  },
  {
    step: 4,
    title: "Sekundärsysteme",
    description: "Löschung aus Suchindex, Cache, Thumbnails, CDN",
    icon: HardDrive,
  },
  {
    step: 5,
    title: "Backup-Rotation",
    description: "Backups laufen planmäßig aus (max. 14 Tage)",
    icon: Clock,
  },
  {
    step: 6,
    title: "Lösch-Zertifikat",
    description: "Ausstellung des Deletion Certificates",
    icon: FileText,
  },
];

export default function ExitKonzept() {
  return (
    <PageLayout>
      <SEO
        title="Exit- und Löschkonzept"
        description="Detailliertes Konzept für Vertragsende, Datenexport und sichere Löschung bei VoxDrop. EVB-IT Cloud konform."
        canonical="/exit-konzept"
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
            <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center">
              <LogOut className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                Exit- und Löschkonzept
              </h1>
              <p className="text-slate-600 mt-1">
                Vertragsende, Datenportabilität und sichere Löschung – EVB-IT Cloud Anlage
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm text-slate-600 mb-6">
            <span>Version 1.0</span>
            <span>|</span>
            <span>Stand: Januar 2026</span>
          </div>

          <Button
            className="bg-red-600 hover:bg-red-700"
            onClick={() => typeof window !== 'undefined' && window.print()}
          >
            <Download className="w-4 h-4 mr-2" />
            Als PDF herunterladen
          </Button>
        </div>

        {/* Content */}
        <div className="space-y-8">

          {/* 1. Datenklassen */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              1. Datenklassen und Aufbewahrungsfristen
            </h2>
            <p className="text-slate-700 mb-6">
              Folgende Datenklassen werden im Rahmen der Leistungserbringung verarbeitet:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Datenklasse</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Beispiele</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Aufbewahrung</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Export-Format</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {dataClasses.map((dc, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3 font-medium text-slate-900">{dc.name}</td>
                      <td className="px-4 py-3 text-slate-600">{dc.examples}</td>
                      <td className="px-4 py-3 text-slate-600">{dc.retention}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-violet-50 text-violet-700 rounded text-xs">
                          {dc.export}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 2. Export/Portabilität */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              2. Datenexport und Portabilität
            </h2>
            <p className="text-slate-700 mb-4">
              Gemäß Art. 20 DSGVO und EVB-IT Cloud-AGB stellen wir folgende Export-Möglichkeiten bereit:
            </p>

            <div className="grid md:grid-cols-2 gap-6 mb-6">
              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <Download className="w-5 h-5 text-violet-600" />
                  <h3 className="font-semibold text-slate-900">Self-Service Export</h3>
                </div>
                <ul className="text-sm text-slate-600 space-y-1">
                  <li>• Einzeldatei-Download (UI)</li>
                  <li>• Bulk-Export als ZIP</li>
                  <li>• Einstellungen → Datenexport</li>
                </ul>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <FileArchive className="w-5 h-5 text-violet-600" />
                  <h3 className="font-semibold text-slate-900">Vollexport bei Vertragsende</h3>
                </div>
                <ul className="text-sm text-slate-600 space-y-1">
                  <li>• Alle Uploads + Outputs</li>
                  <li>• Metadaten als JSON</li>
                  <li>• Audit-Logs als CSV</li>
                </ul>
              </div>
            </div>

            <div className="p-4 bg-violet-50 rounded-lg border border-violet-200">
              <p className="text-sm text-violet-800">
                <strong>Exportformate:</strong> Originalformate (PDF, PPTX, MP4, SRT, VTT) +
                strukturierte Metadaten (JSON/CSV). Keine proprietären Formate.
              </p>
            </div>
          </section>

          {/* 3. Migrationsunterstützung */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              3. Migrationsunterstützung
            </h2>
            <p className="text-slate-700 mb-4">
              Bei Vertragsende bieten wir folgende Unterstützungsleistungen an (soweit vereinbart):
            </p>
            <div className="space-y-4">
              {[
                {
                  title: "Kickoff & Abstimmung",
                  description: "Koordination mit dem Auftraggeber und ggf. Nachfolgeanbieter",
                },
                {
                  title: "Migrationskonzept",
                  description: "Dokumentation der Datenstrukturen, Formate und Cut-over-Plan",
                },
                {
                  title: "Technische Unterstützung",
                  description: "Unterstützung bei Exportläufen und Validierung der Vollständigkeit",
                },
                {
                  title: "Weiterbetrieb (optional)",
                  description: "Bis zu 6 Monate Weiterbetrieb im bisherigen Umfang auf Anfrage",
                },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-slate-900">{item.title}</h4>
                    <p className="text-sm text-slate-600">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-sm text-slate-600 mt-4">
              Migrationsleistungen werden separat beauftragt und vergütet.
            </p>
          </section>

          {/* 4. Löschprozess */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              4. Löschprozess
            </h2>
            <p className="text-slate-700 mb-6">
              Die sichere Löschung erfolgt nach folgendem Prozess:
            </p>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {deletionSteps.map((step) => (
                <div key={step.step} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-red-600 font-bold text-sm">
                      {step.step}
                    </div>
                    <step.icon className="w-5 h-5 text-slate-500" />
                  </div>
                  <h4 className="font-semibold text-slate-900 mb-1">{step.title}</h4>
                  <p className="text-sm text-slate-600">{step.description}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 5. Lösch-Zertifikat */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              5. Lösch-Zertifikat (Deletion Certificate)
            </h2>
            <p className="text-slate-700 mb-4">
              Nach Abschluss der Löschung wird auf Anfrage ein Lösch-Zertifikat ausgestellt:
            </p>
            <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
              <h3 className="font-semibold text-slate-900 mb-4">Inhalt des Zertifikats:</h3>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-600">Mandant:</span>
                  <span className="ml-2 font-medium">ID / Name</span>
                </div>
                <div>
                  <span className="text-slate-600">Zeitraum:</span>
                  <span className="ml-2 font-medium">Von – Bis</span>
                </div>
                <div>
                  <span className="text-slate-600">Gelöschte Datenklassen:</span>
                  <span className="ml-2 font-medium">Auflistung</span>
                </div>
                <div>
                  <span className="text-slate-600">Löschmethode:</span>
                  <span className="ml-2 font-medium">z.B. Crypto-Shredding</span>
                </div>
                <div>
                  <span className="text-slate-600">Backup-Auslauf:</span>
                  <span className="ml-2 font-medium">Datum</span>
                </div>
                <div>
                  <span className="text-slate-600">Verantwortlich:</span>
                  <span className="ml-2 font-medium">Name / Funktion</span>
                </div>
              </div>
            </div>
            <div className="mt-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">
                  <strong>Hinweis:</strong> Die EVB-IT Cloud-AGB verlangen einen Nachweis der sicheren
                  Löschung (nicht rekonstruierbar). Das Lösch-Zertifikat erfüllt diese Anforderung.
                </p>
              </div>
            </div>
          </section>

          {/* 6. Gesetzliche Aufbewahrung */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              6. Gesetzliche Aufbewahrungspflichten
            </h2>
            <p className="text-slate-700 mb-4">
              Folgende Daten können aufgrund gesetzlicher Vorgaben länger aufbewahrt werden:
            </p>
            <ul className="text-sm text-slate-700 space-y-2">
              <li className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-violet-600 flex-shrink-0 mt-0.5" />
                <span><strong>Rechnungsdaten:</strong> 10 Jahre (§ 147 AO, § 257 HGB)</span>
              </li>
              <li className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-violet-600 flex-shrink-0 mt-0.5" />
                <span><strong>Vertragsdaten:</strong> 3 Jahre nach Vertragsende (Verjährung)</span>
              </li>
              <li className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-violet-600 flex-shrink-0 mt-0.5" />
                <span><strong>Security-Logs:</strong> Ggf. länger bei laufenden Ermittlungen</span>
              </li>
            </ul>
            <p className="text-sm text-slate-600 mt-4">
              Betroffene Daten werden im Lösch-Zertifikat als „gesetzlich aufbewahrt" gekennzeichnet.
            </p>
          </section>

        </div>

        {/* Footer */}
        <div className="mt-8 flex items-center gap-4 text-sm text-slate-600">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <span>Dokument-ID: EXIT-2026-001 | Stand: Januar 2026</span>
        </div>
      </main>
    </PageLayout>
  );
}
