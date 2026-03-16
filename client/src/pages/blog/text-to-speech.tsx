import { Button } from "@/components/ui/button";
import { PageLayout } from "@/components/PageLayout";
import { SEO, ArticleSchema } from "@/components/SEO";
import { getBlogPost, formatDate } from "@/lib/blog-posts";
import {
  CheckCircle2, XCircle, ArrowRight, Calendar, Clock, ArrowLeft,
  Volume2, Scale, Users, Cloud, Server,
  Calculator, Eye, Brain, AlertTriangle, Settings,
  Target, Mail, Zap, TrendingUp
} from "lucide-react";
import { Link } from "wouter";

export default function TextToSpeech() {
  const post = getBlogPost("text-to-speech");

  return (
    <PageLayout>
      <SEO
        title="Text-to-Speech für Behörden-Websites: Rechtliche Pflicht oder Nice-to-Have?"
        description="Eine Entscheidungshilfe für IT-Verantwortliche und Webmaster im öffentlichen Sektor. Was die BITV 2.0 wirklich fordert und warum TTS trotzdem sinnvoll ist."
        canonical="/blog/text-to-speech"
        ogType="article"
      />
      <ArticleSchema
        title="Text-to-Speech für Behörden-Websites: Rechtliche Pflicht oder Nice-to-Have?"
        description="Eine Entscheidungshilfe für IT-Verantwortliche und Webmaster im öffentlichen Sektor."
        url="/blog/text-to-speech"
        datePublished={post?.date || "2026-02-01"}
        author="VoxDrop Team"
      />

      {/* Hero Section */}
      <header className="pt-12 pb-8 px-6">
        <div className="max-w-3xl mx-auto">
          <Link href="/blog" className="inline-flex items-center gap-2 text-purple-600 hover:text-purple-700 mb-6 group">
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Zurück zum Blog
          </Link>

          <div className="flex items-center gap-4 mb-4">
            <span className="px-3 py-1 bg-violet-100 text-violet-700 rounded-full text-xs font-medium">
              Best Practices
            </span>
            <div className="flex items-center gap-4 text-sm text-slate-600">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {post ? formatDate(post.date) : "1. Februar 2026"}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                12 min Lesezeit
              </span>
            </div>
          </div>

          <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight mb-4">
            Text-to-Speech für Behörden-Websites: Rechtliche Pflicht oder Nice-to-Have?
          </h1>
          <p className="text-xl text-slate-600 font-light">
            "Brauchen wir eine Vorlesefunktion auf unserer Website?" Die Antwort ist komplexer, als
            sie scheint – und führt zu einer überraschenden Erkenntnis: TTS ist zwar keine rechtliche
            Pflicht, aber oft der effektivste Weg zu echter Barrierefreiheit.
          </p>
        </div>
      </header>

      <main id="main-content" className="max-w-3xl mx-auto px-6 pb-24" tabIndex={-1}>

        <article className="prose prose-gray max-w-none">

          {/* Was die BITV 2.0 fordert */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <Scale className="w-6 h-6 text-purple-500" />
              Was die BITV 2.0 tatsaechlich fordert
            </h2>

            <p className="text-slate-700 mb-4">
              Die Barrierefreie-Informationstechnik-Verordnung 2.0 basiert auf den internationalen
              Web Content Accessibility Guidelines (WCAG 2.1) und der europaeischen Norm EN 301 549.
              Sie gilt für alle Websites und Apps von Bundesbehörden und – über die
              Landesgleichstellungsgesetze – auch für Laender und Kommunen.
            </p>

            <div className="bg-violet-50 rounded-xl p-6 border border-violet-100 not-prose mb-6">
              <h4 className="font-semibold text-blue-900 mb-3">Die zentrale Erkenntnis: Keine explizite TTS-Pflicht</h4>
              <p className="text-violet-800">
                Viele IT-Verantwortliche sind überrascht zu erfahren: <strong>Die BITV 2.0 fordert keine
                Vorlesefunktion auf der Website.</strong> Tatsaechlich ist sie ein freiwilliges Extra –
                kein Pflichtbestandteil der Barrierefreiheit.
              </p>
              <p className="text-violet-800 mt-3">
                Der Grund: Menschen, die auf das Vorlesen angewiesen sind, nutzen in der Regel eigene
                Software – sogenannte Screenreader wie JAWS, NVDA oder VoiceOver.
              </p>
            </div>

            <h3 className="text-xl font-semibold text-slate-900 mb-3">Was stattdessen gefordert wird</h3>
            <p className="text-slate-700 mb-4">
              Die eigentliche Pflicht lautet: Ihre Website muss technisch so gestaltet sein, dass sie
              mit Screenreadern problemlos funktioniert. Das bedeutet konkret:
            </p>

            <div className="space-y-3 not-prose mb-6">
              <div className="flex items-start gap-3 bg-white rounded-lg p-4 border border-slate-200">
                <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
                <div>
                  <span className="font-medium text-slate-900">Semantisches HTML:</span>
                  <span className="text-slate-600"> Überschriften als H1, H2, H3, Listen als Listen,
                  Tabellen als Tabellen.</span>
                </div>
              </div>
              <div className="flex items-start gap-3 bg-white rounded-lg p-4 border border-slate-200">
                <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
                <div>
                  <span className="font-medium text-slate-900">Alternativtexte:</span>
                  <span className="text-slate-600"> Alle informativen Bilder benötigen beschreibende
                  Alt-Texte.</span>
                </div>
              </div>
              <div className="flex items-start gap-3 bg-white rounded-lg p-4 border border-slate-200">
                <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
                <div>
                  <span className="font-medium text-slate-900">Fokusreihenfolge:</span>
                  <span className="text-slate-600"> Die Tab-Navigation muss logisch sein.</span>
                </div>
              </div>
              <div className="flex items-start gap-3 bg-white rounded-lg p-4 border border-slate-200">
                <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
                <div>
                  <span className="font-medium text-slate-900">Sprachangaben:</span>
                  <span className="text-slate-600"> Die Dokumentsprache muss im HTML definiert sein
                  (lang="de").</span>
                </div>
              </div>
              <div className="flex items-start gap-3 bg-white rounded-lg p-4 border border-slate-200">
                <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
                <div>
                  <span className="font-medium text-slate-900">Formular-Labels:</span>
                  <span className="text-slate-600"> Alle Eingabefelder müssen beschriftet sein.</span>
                </div>
              </div>
            </div>
          </section>

          {/* Warum TTS trotzdem sinnvoll */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <Volume2 className="w-6 h-6 text-blue-500" />
              Warum eine Vorlesefunktion trotzdem sinnvoll ist
            </h2>

            <p className="text-slate-700 mb-6">
              Wenn Screenreader existieren und keine gesetzliche Pflicht besteht – warum sollten Sie
              dann in eine Vorlesefunktion investieren? Die Antwort liegt in der Realitaet der Nutzer.
            </p>

            <div className="bg-amber-50 rounded-xl p-6 border border-amber-100 not-prose mb-6">
              <h4 className="font-semibold text-amber-900 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Das Screenreader-Paradoxon
              </h4>
              <p className="text-amber-800 mb-3">
                Screenreader sind maechtige Werkzeuge – aber sie haben eine <strong>steile Lernkurve</strong>.
                Die Bedienung erfordert Uebung, das Erlernen von Tastenkombinationen, das Verstehen der Logik.
              </p>
              <p className="text-amber-800">
                In Deutschland leben etwa <strong>1,2 Millionen blinde und sehbehinderte Menschen</strong>.
                Die große Mehrheit verliert ihr Augenlicht erst im Laufe des Lebens – und hat oft keine
                Screenreader-Kenntnisse.
              </p>
            </div>

            <h3 className="text-xl font-semibold text-slate-900 mb-4">Die vergessene Zielgruppe</h3>
            <p className="text-slate-700 mb-4">
              Neben Blinden und stark Sehbehinderten gibt es weitere Gruppen, die von einer
              Vorlesefunktion profitieren:
            </p>

            <div className="grid md:grid-cols-2 gap-4 not-prose mb-6">
              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="w-5 h-5 text-pink-500" />
                  <h4 className="font-semibold text-slate-900">Menschen mit Leseschwaeche</h4>
                </div>
                <p className="text-sm text-slate-600">
                  5-10% der Bevoelkerung sind von Legasthenie betroffen. Mitlesen beim Hoeren hilft.
                </p>
              </div>
              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="w-5 h-5 text-purple-500" />
                  <h4 className="font-semibold text-slate-900">Kognitive Einschränkungen</h4>
                </div>
                <p className="text-sm text-slate-600">
                  Auditive Aufnahme von Informationen kann deutlich einfacher sein als Lesen.
                </p>
              </div>
              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-5 h-5 text-blue-500" />
                  <h4 className="font-semibold text-slate-900">Ältere Menschen</h4>
                </div>
                <p className="text-sm text-slate-600">
                  Mit dem Alter lässt oft die Sehkraft und Konzentrationsfähigkeit beim Lesen nach.
                </p>
              </div>
              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="w-5 h-5 text-green-500" />
                  <h4 className="font-semibold text-slate-900">Temporäre Einschränkungen</h4>
                </div>
                <p className="text-sm text-slate-600">
                  Augenentzündung, Migräne, Müdigkeit – situative Einschränkungen betreffen jeden.
                </p>
              </div>
            </div>

            <div className="bg-green-50 rounded-xl p-6 border border-green-100 not-prose">
              <h4 className="font-semibold text-green-900 mb-2">Die Nutzerzahlen sprechen für sich</h4>
              <p className="text-green-800">
                Behörden, die Vorlesefunktionen implementiert haben, berichten von überraschend hohen
                Nutzungszahlen. Der Grund: <strong>Die Huerdeist niedrig.</strong> Ein Klick auf "Vorlesen" –
                und los geht's. Keine Installation, keine Einarbeitung, keine Hemmschwelle.
              </p>
            </div>
          </section>

          {/* Welche TTS-Lösungen gibt es */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <Settings className="w-6 h-6 text-orange-500" />
              Welche TTS-Lösungen gibt es?
            </h2>

            <div className="space-y-6 not-prose">
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Volume2 className="w-5 h-5 text-slate-500" />
                  Option 1: Browser-eigene Funktionen
                </h4>
                <p className="text-slate-700 mb-3">
                  Moderne Browser bieten eingebaute Vorlesefunktionen. In Chrome "Vorlesen", in Edge
                  "Laut vorlesen", Safari bietet "Sprachausgabe".
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-green-700 text-sm font-medium mb-1">Vorteile:</p>
                    <ul className="text-slate-600 text-sm space-y-1">
                      <li>• Keine Kosten für die Behörde</li>
                      <li>• Keine Integration nötig</li>
                    </ul>
                  </div>
                  <div>
                    <p className="text-red-700 text-sm font-medium mb-1">Nachteile:</p>
                    <ul className="text-slate-600 text-sm space-y-1">
                      <li>• Roboterhafte Stimmen</li>
                      <li>• Nutzer müssen Funktion kennen</li>
                      <li>• Keine Texthervorhebung</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Cloud className="w-5 h-5 text-blue-500" />
                  Option 2: Externe Cloud-Dienste
                </h4>
                <p className="text-slate-700 mb-3">
                  Anbieter wie ReadSpeaker oder BrowseAloud bieten cloud-basierte Vorlesefunktionen.
                  Ein JavaScript-Snippet wird eingebunden, die Sprachsynthese erfolgt auf Servern des Anbieters.
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-green-700 text-sm font-medium mb-1">Vorteile:</p>
                    <ul className="text-slate-600 text-sm space-y-1">
                      <li>• Professionelle, natuerliche Stimmen</li>
                      <li>• Einfache Integration per Snippet</li>
                      <li>• Texthervorhebung, MP3-Download</li>
                    </ul>
                  </div>
                  <div>
                    <p className="text-red-700 text-sm font-medium mb-1">Nachteile:</p>
                    <ul className="text-slate-600 text-sm space-y-1">
                      <li>• Kosten: 1.000-5.000 Euro/Jahr</li>
                      <li>• Texte werden an externe Server uebertragen</li>
                      <li>• DSGVO-Konformität muss geprüft werden</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="bg-green-50 rounded-xl p-6 border border-green-100">
                <h4 className="font-semibold text-green-900 mb-3 flex items-center gap-2">
                  <Server className="w-5 h-5 text-green-600" />
                  Option 3: Integrierte On-Premise-Lösungen
                </h4>
                <p className="text-green-800 mb-3">
                  Lösungen, die vollständig auf der eigenen Infrastruktur laufen oder auf deutschen
                  bzw. EU-Servern. VoxDrop bietet Text-to-Speech als Teil einer Accessibility-Suite an,
                  bei der die Datenverarbeitung <strong>DSGVO-konform in Deutschland</strong> erfolgt.
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-green-700 text-sm font-medium mb-1">Vorteile:</p>
                    <ul className="text-green-700 text-sm space-y-1">
                      <li>• Volle Datenkontrolle</li>
                      <li>• DSGVO-Konformität ohne Aufwand</li>
                      <li>• Integration mit Leichter Sprache + PDF</li>
                      <li>• Deutscher Support</li>
                    </ul>
                  </div>
                  <div>
                    <p className="text-green-600 text-sm font-medium mb-1">Bewertung:</p>
                    <p className="text-green-700 text-sm">
                      Für datenschutzsensible Behörden die sauberste Lösung. Besonders sinnvoll,
                      wenn weitere Accessibility-Massnahmen geplant sind.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Kosten-Nutzen-Analyse */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <Calculator className="w-6 h-6 text-green-500" />
              Kosten-Nutzen-Analyse: Lohnt sich TTS?
            </h2>

            <div className="space-y-6 not-prose">
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-4">Die Kostenseite</h4>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <span className="text-slate-400">•</span>
                    <div>
                      <span className="font-medium text-slate-900">Cloud-Dienste:</span>
                      <span className="text-slate-600"> Typisch 1.000-5.000 Euro pro Jahr, abhaengig
                      von Seitenaufrufen.</span>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-slate-400">•</span>
                    <div>
                      <span className="font-medium text-slate-900">Integrierte Lösungen (VoxDrop):</span>
                      <span className="text-slate-600"> Pakete ab 49 Euro monatlich, inkl. Leichte
                      Sprache und PDF-Barrierefreiheit.</span>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-slate-400">•</span>
                    <div>
                      <span className="font-medium text-slate-900">Browser-Funktionen:</span>
                      <span className="text-slate-600"> Kostenlos, aber mit genannten Einschränkungen.</span>
                    </div>
                  </li>
                </ul>
              </div>

              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-4">Die Nutzenseite</h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <p className="font-medium text-slate-900 mb-2">Direkte Vorteile:</p>
                    <ul className="text-slate-600 text-sm space-y-1">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        Mehr Bürger können Inhalte nutzen
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        Niedrigere Huerdeals Screenreader
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        Positives Signal für Inklusion
                      </li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium text-slate-900 mb-2">Indirekte Vorteile:</p>
                    <ul className="text-slate-600 text-sm space-y-1">
                      <li className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-blue-500" />
                        Bessere Barrierefreiheits-Bewertungen
                      </li>
                      <li className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-blue-500" />
                        SEO-Vorteile durch längere Verweildauer
                      </li>
                      <li className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-blue-500" />
                        Imagegewinn als moderne Verwaltung
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="bg-violet-50 rounded-xl p-6 border border-violet-100">
                <h4 className="font-semibold text-blue-900 mb-3">Die Rechnung</h4>
                <p className="text-violet-800">
                  Bei durchschnittlichen Kosten von 2.000 Euro pro Jahr und einer Reichweite von 50.000
                  Bürgern kostet die Vorlesefunktion <strong>4 Cent pro erreichtem Bürger</strong>.
                  Selbst wenn nur 5% die Funktion nutzen, liegen die Kosten bei 80 Cent pro Nutzer –
                  weniger als ein einzelner Telefonanruf im Bürgerservice kostet.
                </p>
              </div>
            </div>
          </section>

          {/* Entscheidungshilfe */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <Target className="w-6 h-6 text-purple-500" />
              Entscheidungshilfe: Braucht Ihre Behörde TTS?
            </h2>

            <div className="grid md:grid-cols-2 gap-6 not-prose mb-6">
              <div className="bg-green-50 rounded-xl p-6 border border-green-100">
                <h4 className="font-semibold text-green-900 mb-4">TTS ist besonders sinnvoll, wenn...</h4>
                <ul className="space-y-2 text-green-800">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>Ihre Website viel Text enthaelt</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>Sie eine aeltere Zielgruppe ansprechen</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>Ihre Inhalte sensibel sind (Sozialleistungen, Gesundheit)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>Sie bereits andere Accessibility-Massnahmen umsetzen</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>Sie Wert auf Datenschutz und DSGVO legen</span>
                  </li>
                </ul>
              </div>

              <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-4">TTS ist weniger dringlich, wenn...</h4>
                <ul className="space-y-2 text-slate-700">
                  <li className="flex items-start gap-2">
                    <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
                    <span>Ihre Website primaer aus Formularen besteht</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
                    <span>Screenreader-Kompatibilitaet vollständig gewaehrleistet ist</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
                    <span>Das Budget extrem begrenzt ist</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
                    <span>Sie nur wenige textlastige Inhalte haben</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="bg-purple-50 rounded-xl p-6 border border-purple-100 not-prose">
              <h4 className="font-semibold text-purple-900 mb-2">Der pragmatische Mittelweg</h4>
              <p className="text-purple-800">
                Viele Kommunen starten mit einer <strong>Pilotphase</strong>: TTS wird zunaechst nur
                für bestimmte Bereiche aktiviert – etwa die Startseite, die Bürgerservice-Seiten
                und die Informationen zu Sozialleistungen. So lässt sich die Nutzung evaluieren,
                bevor die Lösung auf die gesamte Website ausgerollt wird.
              </p>
            </div>
          </section>

          {/* Best Practices */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <Zap className="w-6 h-6 text-amber-500" />
              Best Practices für die Implementierung
            </h2>

            <div className="space-y-4 not-prose">
              <div className="flex gap-4">
                <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center shrink-0 text-amber-700 font-bold text-sm">1</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-1">Sichtbare Platzierung</h4>
                  <p className="text-slate-600">
                    Der Vorlesen-Button muss gut sichtbar sein – idealerweise im Header,
                    neben anderen Accessibility-Funktionen.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center shrink-0 text-amber-700 font-bold text-sm">2</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-1">Klare Beschriftung</h4>
                  <p className="text-slate-600">
                    "Vorlesen" ist verständlicher als "Text-to-Speech" oder ein reines Lautsprecher-Icon.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center shrink-0 text-amber-700 font-bold text-sm">3</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-1">Texthervorhebung aktivieren</h4>
                  <p className="text-slate-600">
                    Die synchrone Hervorhebung des vorgelesenen Textes ist besonders für Menschen
                    mit Leseschwaeche wichtig.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center shrink-0 text-amber-700 font-bold text-sm">4</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-1">Geschwindigkeit anpassbar machen</h4>
                  <p className="text-slate-600">
                    Eine Anpassung zwischen 0,5x und 2x sollte möglich sein.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center shrink-0 text-amber-700 font-bold text-sm">5</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-1">Mit Leichter Sprache kombinieren</h4>
                  <p className="text-slate-600">
                    Besonders wirkungsvoll: Text wird erst vereinfacht, dann vorgelesen.
                    VoxDrop bietet beides aus einer Hand.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Fazit */}
          <section className="mb-12">
            <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-2xl p-8 border border-violet-100 not-prose">
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">
                Fazit: Pflicht nein, sinnvoll ja
              </h2>
              <p className="text-slate-700 mb-4">
                Die BITV 2.0 fordert keine Vorlesefunktion – aber sie fordert Barrierefreiheit.
                Und echte Barrierefreiheit bedeutet, alle Bürger zu erreichen: auch die, die keinen
                Screenreader installieren können oder wollen.
              </p>
              <p className="text-slate-700 mb-4">
                Eine gut implementierte TTS-Lösung ist mehr als ein nettes Extra. Sie ist ein Statement:
                <strong> Diese Behörde nimmt digitale Teilhabe ernst.</strong> Sie erreicht Menschen,
                die sonst ausgeschlossen waeren. Und sie kostet weniger, als viele denken.
              </p>
              <p className="text-slate-900 font-semibold text-lg">
                Die Frage ist nicht, ob Sie sich TTS leisten können – sondern ob Sie es sich
                leisten können, darauf zu verzichten.
              </p>
            </div>
          </section>

        </article>

        {/* CTA Section */}
        <div className="bg-gradient-to-br from-violet-600 to-purple-700 rounded-2xl p-8 md:p-10 text-center text-white">
          <h2 className="text-2xl md:text-3xl font-semibold mb-4">
            Testen Sie VoxDrop 14 Tage kostenlos
          </h2>
          <p className="text-white/80 mb-8 max-w-xl mx-auto">
            Überzeugen Sie sich selbst von der Qualität unserer Vorlesefunktion.
            Vollzugriff auf alle TTS-Funktionen, Integration in Ihre Test-Umgebung,
            persönliche Einfuehrung durch unser Team.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/">
              <Button className="h-12 px-8 rounded-xl bg-white text-violet-600 hover:bg-slate-100 font-semibold">
                Jetzt kostenlos testen
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <Link href="/preise">
              <Button variant="outline" className="h-12 px-8 rounded-xl border-white/30 text-white hover:bg-white/10">
                Preise ansehen
              </Button>
            </Link>
          </div>
        </div>

        {/* Contact */}
        <div className="mt-12 p-6 bg-white rounded-xl border border-slate-200">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-violet-600 to-purple-700 rounded-full flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-medium text-slate-900 mb-1">Fragen zu Text-to-Speech?</p>
              <p className="text-slate-600 text-sm mb-2">
                Wir beraten Sie gerne – kostenlos und unverbindlich.
              </p>
              <a href="mailto:hallo@voxdrop.live" className="text-violet-600 hover:text-violet-700 font-medium">
                hallo@voxdrop.live
              </a>
            </div>
          </div>
        </div>

        {/* Author */}
        <div className="mt-8 pt-8 border-t border-slate-200">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-violet-600 to-purple-700 rounded-full flex items-center justify-center">
              <span className="text-white font-semibold">VD</span>
            </div>
            <div>
              <p className="font-medium text-slate-900">VoxDrop Team</p>
              <p className="text-sm text-slate-600">Accessibility-Suite für den öffentlichen Sektor</p>
            </div>
          </div>
        </div>
      </main>

    </PageLayout>
  );
}
