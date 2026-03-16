import {
  Users, Shield, ArrowLeft,
  CheckCircle2, MapPin, Globe, Download
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import { PageLayout } from "@/components/PageLayout";

const subcontractors = [
  {
    name: "Hetzner Online GmbH",
    purpose: "Server-Hosting & Infrastruktur",
    description: "Bereitstellung der Server-Infrastruktur für die VoxDrop-Plattform",
    dataProcessed: ["IP-Adressen", "Serverlogs", "Anwendungsdaten"],
    location: "Deutschland",
    locationIcon: "de",
    certifications: ["ISO 27001", "SOC 2"],
    website: "https://www.hetzner.com",
    avvStatus: "Abgeschlossen",
    legalBasis: "AVV (Art. 28 DSGVO)",
  },
  {
    name: "Stripe Payments Europe Ltd.",
    purpose: "Zahlungsabwicklung",
    description: "Verarbeitung von Zahlungen für Premium-Abonnements",
    dataProcessed: ["Name", "E-Mail", "Zahlungsdaten", "Rechnungsadresse"],
    location: "Irland (EU)",
    locationIcon: "eu",
    certifications: ["PCI DSS Level 1", "SOC 2"],
    website: "https://stripe.com",
    avvStatus: "Abgeschlossen",
    legalBasis: "AVV (Art. 28 DSGVO)",
  },
  {
    name: "Resend, Inc.",
    purpose: "E-Mail-Versand (transaktional)",
    description: "Transaktionale E-Mails (Registrierung, Passwort-Reset, Benachrichtigungen)",
    dataProcessed: ["E-Mail-Adresse", "Name (optional)"],
    location: "USA",
    locationIcon: "us",
    certifications: ["Auf Anfrage"],
    website: "https://resend.com",
    avvStatus: "Abgeschlossen",
    legalBasis: "Angemessenheitsbeschluss (EU-US DPF, Art. 45 DSGVO)",
  },
];

export default function Subunternehmer() {
  return (
    <PageLayout>
      <SEO
        title="Subunternehmer-Verzeichnis"
        description="Liste aller Unterauftragnehmer von VoxDrop gemäß Art. 28 DSGVO. Transparente Dokumentation aller Dienstleister die personenbezogene Daten verarbeiten."
        canonical="/subunternehmer"
      />

      <main id="main-content" className="max-w-4xl mx-auto px-6 py-12" tabIndex={-1}>
        {/* Back Link */}
        <Link href="/behoerden">
          <span className="inline-flex items-center gap-2 text-violet-600 hover:text-violet-700 mb-8 cursor-pointer">
            <ArrowLeft className="w-4 h-4" />
            Zurück zur Behörden-Seite
          </span>
        </Link>

        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mb-8">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                Subunternehmer-Verzeichnis
              </h1>
              <p className="text-slate-600 mt-1">
                Liste der Unterauftragnehmer gemäß Art. 28 Abs. 2 DS-GVO
              </p>
            </div>
          </div>

          <p className="text-slate-600 mb-6">
            Zur Erbringung unserer Dienstleistungen setzen wir die folgenden Unterauftragnehmer ein.
            Alle Unterauftragnehmer wurden sorgfältig ausgewählt und sind vertraglich zur Einhaltung
            der datenschutzrechtlichen Vorgaben verpflichtet.
          </p>

          <Button
            className="bg-purple-600 hover:bg-purple-700"
            onClick={() => typeof window !== 'undefined' && window.print()}
          >
            <Download className="w-4 h-4 mr-2" />
            Liste als PDF herunterladen
          </Button>
        </div>

        {/* Info Banner */}
        <div className="bg-violet-50 border border-violet-100 rounded-xl p-4 mb-8">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-violet-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-violet-800">
                <strong>Hinweis:</strong> Bei Änderungen an dieser Liste werden Sie als Auftraggeber
                mindestens 14 Tage vor Einsatz eines neuen Unterauftragnehmers informiert. Sie haben
                ein Widerspruchsrecht gemäß unserem AVV.
              </p>
            </div>
          </div>
        </div>

        {/* Subcontractor Cards */}
        <div className="space-y-6">
          {subcontractors.map((sub, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      {sub.name}
                    </h2>
                    <p className="text-sm text-purple-600 font-medium">
                      {sub.purpose}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1 bg-green-50 rounded-full">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span className="text-sm text-green-700 font-medium">AVV {sub.avvStatus}</span>
                  </div>
                </div>

                <p className="text-slate-600 mb-4">
                  {sub.description}
                </p>

                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  {/* Location */}
                  <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-slate-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-slate-700">Standort</p>
                      <p className="text-sm text-slate-600">{sub.location}</p>
                    </div>
                  </div>

                  {/* Website */}
                  <div className="flex items-start gap-3">
                    <Globe className="w-5 h-5 text-slate-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-slate-700">Website</p>
                      <a
                        href={sub.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-violet-600 hover:underline"
                      >
                        {sub.website.replace("https://", "")}
                      </a>
                    </div>
                  </div>
                </div>

                {/* Data Processed */}
                <div className="mb-4">
                  <p className="text-sm font-medium text-slate-700 mb-2">Verarbeitete Daten:</p>
                  <div className="flex flex-wrap gap-2">
                    {sub.dataProcessed.map((data, j) => (
                      <span
                        key={j}
                        className="px-2 py-1 bg-slate-100 text-slate-700 text-xs rounded-md"
                      >
                        {data}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Certifications */}
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">Zertifizierungen:</p>
                  <div className="flex flex-wrap gap-2">
                    {sub.certifications.map((cert, j) => (
                      <span
                        key={j}
                        className="px-2 py-1 bg-violet-50 text-violet-700 text-xs rounded-md font-medium"
                      >
                        {cert}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Summary Table */}
        <div className="mt-8 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-900">
              Übersicht Datenübermittlung
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Unterauftragnehmer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Zweck
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Standort
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Rechtsgrundlage
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {subcontractors.map((sub, i) => (
                  <tr key={i}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                      {sub.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {sub.purpose}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {sub.location}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {sub.legalBasis}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Additional Info */}
        <div className="mt-8 bg-slate-50 rounded-xl p-6 border border-slate-200">
          <h3 className="font-semibold text-slate-900 mb-3">Hinweise zur Datenübermittlung in Drittländer</h3>
          <p className="text-sm text-slate-600 mb-4">
            Sofern Unterauftragnehmer Daten in Länder außerhalb der EU/des EWR übermitteln,
            erfolgt dies ausschließlich auf Basis angemessener Garantien:
          </p>
          <ul className="text-sm text-slate-600 space-y-2">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
              <span><strong>EU-US Data Privacy Framework (DPF):</strong> Für US-Anbieter, die unter dem DPF zertifiziert sind</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
              <span><strong>Standardvertragsklauseln (SCCs):</strong> EU-Kommissions-Standardvertragsklauseln nach Art. 46 DSGVO</span>
            </li>
          </ul>
        </div>

        {/* Footer Note */}
        <div className="mt-8 flex items-center gap-4 text-sm text-slate-600">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <span>Stand: Januar 2026 | Version 1.1</span>
        </div>
      </main>
    </PageLayout>
  );
}
