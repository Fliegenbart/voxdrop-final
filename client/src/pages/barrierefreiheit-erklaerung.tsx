import {
  Accessibility, ArrowLeft, CheckCircle2, AlertTriangle,
  Mail, Calendar, ExternalLink, Eye
} from "lucide-react";
import { Link } from "wouter";
import { SEO } from "@/components/SEO";
import { PageLayout } from "@/components/PageLayout";

const conformanceAreas = [
  {
    area: "Wahrnehmbar",
    status: "conformant",
    items: [
      { criterion: "1.1.1 Nicht-Text-Inhalt", status: "conformant", note: "Alt-Texte für alle Bilder und Icons" },
      { criterion: "1.3.1 Info und Beziehungen", status: "conformant", note: "Semantisches HTML, ARIA-Labels" },
      { criterion: "1.4.1 Verwendung von Farbe", status: "conformant", note: "Farbe nicht als einziges Unterscheidungsmerkmal" },
      { criterion: "1.4.3 Kontrast (Minimum)", status: "conformant", note: "Alle Texte erfüllen 4.5:1 Kontrast" },
      { criterion: "1.4.4 Textgröße ändern", status: "conformant", note: "Zoom bis 200% ohne Informationsverlust" },
    ],
  },
  {
    area: "Bedienbar",
    status: "conformant",
    items: [
      { criterion: "2.1.1 Tastatur", status: "conformant", note: "Vollständige Tastaturbedienbarkeit" },
      { criterion: "2.1.2 Keine Tastaturfalle", status: "conformant", note: "Fokus kann stets verlassen werden" },
      { criterion: "2.4.1 Blöcke umgehen", status: "conformant", note: "Skip-Links auf allen Seiten" },
      { criterion: "2.4.2 Seite mit Titel", status: "conformant", note: "Aussagekräftige Seitentitel" },
      { criterion: "2.4.3 Fokusreihenfolge", status: "conformant", note: "Logische Tab-Reihenfolge" },
      { criterion: "2.4.7 Fokus sichtbar", status: "conformant", note: "Sichtbare Fokusindikatoren" },
    ],
  },
  {
    area: "Verständlich",
    status: "conformant",
    items: [
      { criterion: "3.1.1 Sprache der Seite", status: "conformant", note: "HTML lang='de' gesetzt" },
      { criterion: "3.2.1 Bei Fokus", status: "conformant", note: "Keine unerwarteten Kontextänderungen" },
      { criterion: "3.2.2 Bei Eingabe", status: "conformant", note: "Formularübermittlung nur durch Nutzeraktion" },
      { criterion: "3.3.1 Fehlererkennung", status: "conformant", note: "Fehler werden identifiziert und beschrieben" },
      { criterion: "3.3.2 Beschriftungen", status: "conformant", note: "Labels für alle Formularfelder" },
    ],
  },
  {
    area: "Robust",
    status: "conformant",
    items: [
      { criterion: "4.1.1 Syntaxanalyse", status: "conformant", note: "Valides HTML" },
      { criterion: "4.1.2 Name, Rolle, Wert", status: "conformant", note: "ARIA-Attribute korrekt verwendet" },
    ],
  },
];

const knownLimitations = [
  {
    area: "Einfache Sprache Tool",
    limitation: "Die KI-generierten Vereinfachungen können Fehler enthalten",
    workaround: "Menschliche Prüfung der Ergebnisse wird empfohlen",
  },
  {
    area: "Kontrastchecker Pipette",
    limitation: "EyeDropper API nur in Chrome/Edge verfügbar",
    workaround: "Manuelle Farbeingabe als Alternative",
  },
  {
    area: "PDF/UA-Konvertierung",
    limitation: "Die automatische Strukturierung hängt vom Ausgangsdokument ab und kann in Einzelfällen unvollständig sein",
    workaround: "Ergebnisse mit PDF Accessibility Checkern (z.B. PAC) prüfen und bei Bedarf nachbearbeiten",
  },
];

export default function BarrierefreiheitErklärung() {
  return (
    <PageLayout>
      <SEO
        title="Erklärung zur Barrierefreiheit"
        description="Erklärung zur Barrierefreiheit der VoxDrop-Webanwendung gemäß BITV 2.0 und EN 301 549. WCAG 2.1 AA Konformität."
        canonical="/barrierefreiheit-erklaerung"
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
            <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center">
              <Accessibility className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                Erklärung zur Barrierefreiheit
              </h1>
              <p className="text-slate-600 mt-1">
                VoxDrop Accessibility Suite – gemäß BITV 2.0 / EN 301 549
              </p>
            </div>
          </div>

          <p className="text-slate-700 mb-6">
            Diese Erklärung zur Barrierefreiheit gilt für die Webanwendung VoxDrop
            unter der Domain <strong>voxdrop.live</strong>.
          </p>

          <div className="flex items-center gap-4 text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>Erstellt: Januar 2026</span>
            </div>
            <span>|</span>
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4" />
              <span>Letzte Prüfung: Januar 2026</span>
            </div>
          </div>
        </div>

        {/* Conformance Status */}
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 mb-8">
          <div className="flex items-start gap-4">
            <CheckCircle2 className="w-8 h-8 text-green-600 flex-shrink-0" />
            <div>
              <h2 className="text-xl font-semibold text-green-900 mb-2">
                Stand der Konformität
              </h2>
              <p className="text-green-800 mb-4">
                Diese Webanwendung ist <strong>weitgehend konform</strong> mit WCAG 2.1 Level AA.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                  WCAG 2.1 AA
                </span>
                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                  BITV 2.0
                </span>
                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                  EN 301 549
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-8">

          {/* Conformance Details */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-6">
              Geprüfte Bereiche (WCAG 2.1 AA)
            </h2>
            <div className="space-y-6">
              {conformanceAreas.map((area, i) => (
                <div key={i}>
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <h3 className="text-lg font-semibold text-slate-900">{area.area}</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-semibold text-slate-700">Kriterium</th>
                          <th className="px-4 py-2 text-left font-semibold text-slate-700">Status</th>
                          <th className="px-4 py-2 text-left font-semibold text-slate-700">Anmerkung</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {area.items.map((item, j) => (
                          <tr key={j}>
                            <td className="px-4 py-2 text-slate-900">{item.criterion}</td>
                            <td className="px-4 py-2">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                                <CheckCircle2 className="w-3 h-3" />
                                Erfüllt
                              </span>
                            </td>
                            <td className="px-4 py-2 text-slate-600">{item.note}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Known Limitations */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              Bekannte Einschränkungen
            </h2>
            <p className="text-slate-700 mb-6">
              Folgende Bereiche sind uns als noch nicht vollständig barrierefrei bekannt:
            </p>
            <div className="space-y-4">
              {knownLimitations.map((item, i) => (
                <div key={i} className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-amber-900">{item.area}</h3>
                      <p className="text-sm text-amber-800 mt-1">
                        <strong>Einschränkung:</strong> {item.limitation}
                      </p>
                      <p className="text-sm text-amber-700 mt-1">
                        <strong>Workaround:</strong> {item.workaround}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Feedback */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              Feedback und Kontakt
            </h2>
            <p className="text-slate-700 mb-4">
              Wenn Sie auf Barrieren stoßen oder Verbesserungsvorschläge haben,
              kontaktieren Sie uns bitte:
            </p>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-slate-400" />
                <div>
                  <span className="font-medium text-slate-900">E-Mail:</span>
                  <a href="mailto:barrierefreiheit@voxdrop.live" className="ml-2 text-violet-600 hover:underline">
                    barrierefreiheit@voxdrop.live
                  </a>
                </div>
              </div>
            </div>
            <p className="text-sm text-slate-600 mt-4">
              Wir bemühen uns, Ihr Anliegen innerhalb von 2 Wochen zu beantworten.
            </p>
          </section>

          {/* Enforcement */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              Durchsetzungsverfahren
            </h2>
            <p className="text-slate-700 mb-4">
              Sollten Sie der Meinung sein, dass wir auf Ihre Anfrage nicht
              angemessen reagiert haben, können Sie sich an die zuständige
              Durchsetzungsstelle wenden:
            </p>
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="font-medium text-slate-900 mb-2">
                Überwachungsstelle des Bundes für Barrierefreiheit von Informationstechnik
              </p>
              <p className="text-sm text-slate-600">
                Bundesministerium für Arbeit und Soziales<br />
                Wilhelmstraße 49, 10117 Berlin
              </p>
              <a
                href="https://www.bfit-bund.de"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-violet-600 hover:underline mt-2"
              >
                www.bfit-bund.de
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </section>

          {/* Technical Info */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              Technische Informationen
            </h2>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div className="p-4 bg-slate-50 rounded-lg">
                <h3 className="font-semibold text-slate-900 mb-2">Kompatibilität</h3>
                <ul className="text-slate-600 space-y-1">
                  <li>• Chrome (aktuell)</li>
                  <li>• Firefox (aktuell)</li>
                  <li>• Safari (aktuell)</li>
                  <li>• Edge (aktuell)</li>
                </ul>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg">
                <h3 className="font-semibold text-slate-900 mb-2">Assistive Technologien</h3>
                <ul className="text-slate-600 space-y-1">
                  <li>• Screenreader (NVDA, VoiceOver, JAWS)</li>
                  <li>• Bildschirmlupen</li>
                  <li>• Sprachsteuerung</li>
                  <li>• Tastaturnavigation</li>
                </ul>
              </div>
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="mt-8 flex items-center gap-4 text-sm text-slate-600">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <span>Dokument-ID: A11Y-2026-001 | Stand: Januar 2026</span>
        </div>
      </main>
    </PageLayout>
  );
}
