import {
  Clock, Download, ArrowLeft, CheckCircle2,
  Headphones, Activity, Calendar, Phone, Mail
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import { PageLayout } from "@/components/PageLayout";

const priorities = [
  {
    level: "P1 – Kritisch",
    description: "Totalausfall des Dienstes, keine Nutzung möglich",
    reaction: "< 4 Stunden",
    resolution: "< 8 Stunden",
    color: "red",
  },
  {
    level: "P2 – Hoch",
    description: "Wesentliche Funktionen eingeschränkt, Workaround möglich",
    reaction: "< 8 Stunden",
    resolution: "< 24 Stunden",
    color: "orange",
  },
  {
    level: "P3 – Normal",
    description: "Einzelne Funktionen betroffen, Nutzung möglich",
    reaction: "< 24 Stunden",
    resolution: "< 72 Stunden",
    color: "yellow",
  },
  {
    level: "P4 – Niedrig",
    description: "Anfragen, Verbesserungsvorschläge, keine Einschränkung",
    reaction: "< 48 Stunden",
    resolution: "Nach Vereinbarung",
    color: "gray",
  },
];

export default function SLA() {
  return (
    <PageLayout>
      <SEO
        title="Service Level Agreement (SLA)"
        description="Service Level Agreement für VoxDrop. Verfügbarkeit, Reaktionszeiten, Support und Wartung für öffentliche Auftraggeber."
        canonical="/sla"
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
            <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center">
              <Clock className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                Service Level Agreement (SLA)
              </h1>
              <p className="text-slate-600 mt-1">
                Vereinbarung über Serviceleistungen – EVB-IT Cloud Anlage
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm text-slate-600 mb-6">
            <span>Version 1.0</span>
            <span>|</span>
            <span>Stand: Januar 2026</span>
          </div>

          <Button
            className="bg-green-600 hover:bg-green-700"
            onClick={() => typeof window !== 'undefined' && window.print()}
          >
            <Download className="w-4 h-4 mr-2" />
            Als PDF herunterladen
          </Button>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { icon: Activity, label: "Verfügbarkeit", value: "99,5%" },
            { icon: Clock, label: "Reaktion P1", value: "< 4h" },
            { icon: Headphones, label: "Support", value: "Mo-Fr" },
            { icon: Calendar, label: "Wartung", value: "So 02-06" },
          ].map((stat, i) => (
            <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 text-center">
              <stat.icon className="w-5 h-5 text-green-600 mx-auto mb-2" />
              <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
              <div className="text-sm text-slate-600">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="space-y-8">

          {/* 1. Verfügbarkeit */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              1. Verfügbarkeit
            </h2>
            <div className="space-y-4">
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span className="font-semibold text-green-800">Zugesicherte Verfügbarkeit: 99,5%</span>
                </div>
                <p className="text-sm text-green-700">
                  Gemessen auf Monatsbasis, bezogen auf die Kernarbeitszeiten (Mo-Fr 08:00-18:00 Uhr).
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 mb-2">Ausnahmen von der Verfügbarkeitsberechnung:</h3>
                <ul className="text-sm text-slate-700 space-y-1">
                  <li className="flex items-start gap-2">
                    <span className="text-slate-400">•</span>
                    Geplante Wartungsfenster (siehe Abschnitt 4)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-slate-400">•</span>
                    Höhere Gewalt (Naturkatastrophen, Cyberangriffe auf Infrastruktur)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-slate-400">•</span>
                    Störungen bei Drittanbietern außerhalb unseres Einflussbereichs
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-slate-400">•</span>
                    Vom Auftraggeber verursachte Störungen
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* 2. Supportzeiten */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              2. Supportzeiten und Erreichbarkeit
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-slate-900 mb-3">Regulärer Support</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between p-2 bg-slate-50 rounded">
                    <span className="text-slate-600">Montag – Freitag</span>
                    <span className="font-medium">09:00 – 17:00 Uhr</span>
                  </div>
                  <div className="flex justify-between p-2 bg-slate-50 rounded">
                    <span className="text-slate-600">Samstag, Sonntag</span>
                    <span className="font-medium">Kein Support</span>
                  </div>
                  <div className="flex justify-between p-2 bg-slate-50 rounded">
                    <span className="text-slate-600">Feiertage (bundesweit)</span>
                    <span className="font-medium">Kein Support</span>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 mb-3">Kontaktkanäle</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Mail className="w-5 h-5 text-slate-400" />
                    <div>
                      <div className="text-sm font-medium">E-Mail</div>
                      <div className="text-sm text-slate-600">support@voxdrop.live</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Phone className="w-5 h-5 text-slate-400" />
                    <div>
                      <div className="text-sm font-medium">Telefon (nur P1)</div>
                      <div className="text-sm text-slate-600">Auf Anfrage</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 3. Reaktionszeiten */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              3. Reaktions- und Lösungszeiten
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Priorität</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Beschreibung</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Reaktion</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Lösung</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {priorities.map((p, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                          p.color === "red" ? "bg-red-100 text-red-700" :
                          p.color === "orange" ? "bg-orange-100 text-orange-700" :
                          p.color === "yellow" ? "bg-yellow-100 text-yellow-700" :
                          "bg-slate-100 text-slate-700"
                        }`}>
                          {p.level}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{p.description}</td>
                      <td className="px-4 py-3 font-medium">{p.reaction}</td>
                      <td className="px-4 py-3 font-medium">{p.resolution}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-slate-600 mt-4">
              Reaktionszeit = Zeit bis zur ersten qualifizierten Rückmeldung.
              Lösungszeit = Zeit bis zur Wiederherstellung der Funktionalität oder eines Workarounds.
            </p>
          </section>

          {/* 4. Wartung */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              4. Geplante Wartung
            </h2>
            <div className="space-y-4">
              <div className="p-4 bg-violet-50 rounded-lg border border-violet-200">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-5 h-5 text-violet-600" />
                  <span className="font-semibold text-violet-800">Reguläres Wartungsfenster</span>
                </div>
                <p className="text-sm text-violet-700">
                  Sonntag, 02:00 – 06:00 Uhr (MEZ/MESZ)
                </p>
              </div>
              <ul className="text-sm text-slate-700 space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                  Ankündigung regulärer Wartung: mindestens 5 Werktage vorher
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                  Ankündigung kritischer Sicherheitsupdates: mindestens 24 Stunden vorher
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                  Notfall-Patches: Sofortige Durchführung mit nachträglicher Information
                </li>
              </ul>
            </div>
          </section>

          {/* 5. Incident Management */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              5. Incident Management
            </h2>
            <div className="space-y-4">
              <p className="text-slate-700">
                Bei Störungen erfolgt die Bearbeitung nach folgendem Prozess:
              </p>
              <div className="grid md:grid-cols-4 gap-4">
                {[
                  { step: "1", title: "Meldung", desc: "Erfassung und Priorisierung" },
                  { step: "2", title: "Analyse", desc: "Ursachenermittlung" },
                  { step: "3", title: "Behebung", desc: "Fix oder Workaround" },
                  { step: "4", title: "Abschluss", desc: "Dokumentation und RCA" },
                ].map((item, i) => (
                  <div key={i} className="text-center p-4 bg-slate-50 rounded-lg">
                    <div className="w-8 h-8 bg-violet-600 text-white rounded-full flex items-center justify-center mx-auto mb-2 text-sm font-bold">
                      {item.step}
                    </div>
                    <div className="font-semibold text-slate-900">{item.title}</div>
                    <div className="text-xs text-slate-600">{item.desc}</div>
                  </div>
                ))}
              </div>
              <p className="text-sm text-slate-600">
                Bei P1-Incidents erfolgt eine Root Cause Analysis (RCA) innerhalb von 5 Werktagen.
              </p>
            </div>
          </section>

          {/* 6. Reporting */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              6. Reporting
            </h2>
            <div className="space-y-4">
              <p className="text-slate-700">
                Auf Anfrage stellen wir folgende Berichte zur Verfügung:
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-lg">
                  <h3 className="font-semibold text-slate-900 mb-2">Monatlicher Servicebericht</h3>
                  <ul className="text-sm text-slate-600 space-y-1">
                    <li>• Verfügbarkeitsstatistik</li>
                    <li>• Anzahl und Art der Incidents</li>
                    <li>• Reaktions- und Lösungszeiten</li>
                  </ul>
                </div>
                <div className="p-4 bg-slate-50 rounded-lg">
                  <h3 className="font-semibold text-slate-900 mb-2">Quartalsweise Übersicht</h3>
                  <ul className="text-sm text-slate-600 space-y-1">
                    <li>• Trend-Analyse</li>
                    <li>• Geplante Änderungen</li>
                    <li>• Security-Events (aggregiert)</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* 7. Eskalation */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              7. Eskalationspfad
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Eskalationsstufe</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Zeitpunkt</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Kontakt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr>
                    <td className="px-4 py-3">Stufe 1 – Support</td>
                    <td className="px-4 py-3">Sofort bei Meldung</td>
                    <td className="px-4 py-3">support@voxdrop.live</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Stufe 2 – Teamleitung</td>
                    <td className="px-4 py-3">Nach 4h ohne Lösung (P1/P2)</td>
                    <td className="px-4 py-3">Auf Anfrage</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Stufe 3 – Geschäftsführung</td>
                    <td className="px-4 py-3">Nach 24h ohne Lösung (P1)</td>
                    <td className="px-4 py-3">Auf Anfrage</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="mt-8 flex items-center gap-4 text-sm text-slate-600">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <span>Dokument-ID: SLA-2026-001 | Stand: Januar 2026</span>
        </div>
      </main>
    </PageLayout>
  );
}
