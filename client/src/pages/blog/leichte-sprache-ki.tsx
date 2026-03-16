import { Button } from "@/components/ui/button";
import { PageLayout } from "@/components/PageLayout";
import { SEO, ArticleSchema } from "@/components/SEO";
import { getBlogPost, formatDate } from "@/lib/blog-posts";
import {
  CheckCircle2, ArrowRight, Calendar, Clock, ArrowLeft,
  Brain, Users, Scale, Calculator, Zap,
  FileText, AlertTriangle, Sparkles, Target, BookOpen,
  XCircle, Mail
} from "lucide-react";
import { Link } from "wouter";

export default function LeichteSpracheKI() {
  const post = getBlogPost("leichte-sprache-ki");

  return (
    <PageLayout>
      <SEO
        title="Leichte Sprache auf Behörden-Websites: Der KI-Leitfaden 2026"
        description="Wie Kommunen ihre Websites endlich für alle zugänglich machen – und warum KI dabei zum Game-Changer wird."
        canonical="/blog/leichte-sprache-ki"
        ogType="article"
      />
      <ArticleSchema
        title="Leichte Sprache auf Behörden-Websites: Der KI-Leitfaden 2026"
        description="Wie Kommunen ihre Websites endlich für alle zugänglich machen – und warum KI dabei zum Game-Changer wird."
        url="/blog/leichte-sprache-ki"
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
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
              Best Practices
            </span>
            <div className="flex items-center gap-4 text-sm text-slate-600">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {post ? formatDate(post.date) : "1. Februar 2026"}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                18 min Lesezeit
              </span>
            </div>
          </div>

          <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight mb-4">
            Leichte Sprache auf Behörden-Websites: Der KI-Leitfaden 2026
          </h1>
	          <p className="text-xl text-slate-600 font-light">
	            Wie Kommunen ihre Websites endlich für alle zugänglich machen – und warum KI dabei
	            zum Game-Changer wird. 97% aller kommunalen Websites haben Barrierefreiheits-Mängel.
	            Einer der häufigsten Gründe: fehlende Leichte Sprache.
	          </p>
        </div>
      </header>

      <main id="main-content" className="max-w-3xl mx-auto px-6 pb-24" tabIndex={-1}>

        <article className="prose prose-gray max-w-none">

          {/* Einleitung */}
          <section className="mb-12">
            <div className="bg-red-50 rounded-xl p-6 border border-red-100 not-prose mb-6">
              <div className="flex items-start gap-4">
                <AlertTriangle className="w-6 h-6 text-red-500 shrink-0 mt-1" />
                <div>
                  <p className="font-semibold text-red-900 mb-2">97 Prozent</p>
                  <p className="text-red-800">
                    Diese Zahl sollte jeden Bürgermeister, jeden IT-Leiter und jeden Digitalisierungsbeauftragten
                    aufhorchen lassen. Laut den aktuellen Monitoring-Berichten der Überwachungsstellen weisen
                    97 Prozent aller kommunalen Websites erhebliche Barrierefreiheits-Mängel auf.
                  </p>
                </div>
              </div>
            </div>

            <p className="text-slate-700 mb-4">
              Leichte Sprache ist keine freiwillige Zusatzleistung, sondern seit über einem Jahrzehnt
              gesetzliche Pflicht. Die BITV 2.0 fordert bereits seit 2011, dass öffentliche Stellen
              wesentliche Inhalte ihrer Websites in Leichter Sprache bereitstellen müssen.
            </p>
            <p className="text-slate-700 mb-4">
	              Die Gründe für die Lücke sind nachvollziehbar: Leichte Sprache zu erstellen ist aufwendig,
	              erfordert spezielles Know-how und kostet – bei professionellen Übersetzungsbüros – schnell
	              <strong> 150 bis 200 Euro pro Seite</strong>. Bei einer durchschnittlichen Kommunalwebsite
	              mit 200 oder mehr Unterseiten summiert sich das auf fünfstellige Beträge.
	            </p>
	            <p className="text-slate-700">
	              Doch es gibt Hoffnung. Moderne KI-Technologie verändert grundlegend, wie Leichte Sprache
	              erstellt werden kann. Was früher Wochen dauerte und Tausende Euro kostete, lässt sich
	              heute in Minuten erledigen – bei einem Bruchteil der Kosten.
	            </p>
          </section>

          {/* 1. Das Problem */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <XCircle className="w-6 h-6 text-red-500" />
              1. Das Problem: Warum Kommunen bei Leichter Sprache scheitern
            </h2>

            <div className="space-y-6 not-prose">
              <div className="bg-white rounded-xl p-6 border border-slate-200">
	                <h4 className="font-semibold text-slate-900 mb-3">Die Wissenslücke</h4>
	                <p className="text-slate-700">
	                  In vielen Kommunalverwaltungen fehlt schlicht das Wissen darüber, was Leichte Sprache
	                  eigentlich ist. Viele verwechseln sie mit einfacher Sprache oder bürgernaher Sprache.
	                  Dabei folgt Leichte Sprache einem klar definierten Regelwerk mit präzisen Vorgaben zu
	                  Satzbau, Wortlänge, Zeilenumbrüchen und visueller Gestaltung.
	                </p>
	              </div>

	              <div className="bg-white rounded-xl p-6 border border-slate-200">
	                <h4 className="font-semibold text-slate-900 mb-3">Die Ressourcenknappheit</h4>
	                <p className="text-slate-700">
	                  Kommunale Verwaltungen arbeiten chronisch am Limit. Die IT-Abteilung kämpft mit der
	                  Digitalisierung, die Öffentlichkeitsarbeit mit Social Media. Für ein Sonderprojekt
	                  Leichte Sprache fehlen die personellen Kapazitäten – und oft auch das Budget für
	                  externe Dienstleister.
	                </p>
	              </div>

	              <div className="bg-white rounded-xl p-6 border border-slate-200">
	                <h4 className="font-semibold text-slate-900 mb-3">Das Skalierungsproblem</h4>
	                <p className="text-slate-700">
	                  Selbst Kommunen, die den Einstieg geschafft haben, stehen vor einem strukturellen Problem:
	                  Leichte Sprache lässt sich nicht skalieren. Jede neue Seite, jede Aktualisierung, jedes
	                  neue PDF muss erneut übersetzt werden. Bei dynamischen Websites wird die Pflege zum
	                  Fass ohne Boden.
	                </p>
	              </div>
            </div>
          </section>

          {/* 2. Was ist Leichte Sprache */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <BookOpen className="w-6 h-6 text-blue-500" />
              2. Was ist Leichte Sprache? Definition und Abgrenzung
            </h2>

            <p className="text-slate-700 mb-6">
              Leichte Sprache ist eine stark vereinfachte Form der deutschen Sprache, die speziell für
              Menschen mit Lernschwierigkeiten entwickelt wurde. Sie folgt einem festen Regelwerk, das
              vom Netzwerk Leichte Sprache e.V. definiert wird.
            </p>

            <div className="bg-violet-50 rounded-xl p-6 border border-violet-100 not-prose mb-6">
              <h4 className="font-semibold text-blue-900 mb-4">Die wichtigsten Regeln</h4>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium text-blue-900">Kurze Sätze:</span>
                    <span className="text-violet-800"> Maximal ein Gedanke pro Satz, idealerweise
                    nicht mehr als 8-12 Wörter.</span>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium text-blue-900">Einfache Wörter:</span>
                    <span className="text-violet-800"> Keine Fremdwoerter, keine Fachbegriffe,
                    keine Abkuerzungen.</span>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium text-blue-900">Aktive Sprache:</span>
                    <span className="text-violet-800"> "Das Formular wird ausgefüllt" wird zu
                    "Sie füllen das Formular aus."</span>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium text-blue-900">Klare Struktur:</span>
                    <span className="text-violet-800"> Jeder Satz beginnt auf einer neuen Zeile.
                    Absätze gliedern den Text.</span>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium text-blue-900">Visuelle Unterstützung:</span>
                    <span className="text-violet-800"> Bilder und Symbole ergänzen den Text
                    und erleichtern das Verständnis.</span>
                  </div>
                </li>
              </ul>
            </div>

            <div className="bg-amber-50 rounded-xl p-6 border border-amber-100 not-prose mb-6">
              <h4 className="font-semibold text-amber-900 mb-2">Wichtige Unterscheidung</h4>
              <p className="text-amber-800">
                <strong>Leichte Sprache vs. Einfache Sprache:</strong> Während Leichte Sprache einem strengen
                Regelwerk folgt und für Menschen mit kognitiven Einschränkungen optimiert ist, ist
                Einfache Sprache ein weniger formalisiertes Konzept für allgemeine Verständlichkeit.
                Die BITV 2.0 fordert explizit Leichte Sprache, nicht Einfache Sprache.
              </p>
            </div>

            <h3 className="text-xl font-semibold text-slate-900 mb-4">Wer profitiert von Leichter Sprache?</h3>
            <p className="text-slate-700 mb-4">Die Zielgruppe ist größer, als viele denken:</p>

            <div className="grid md:grid-cols-2 gap-4 not-prose mb-6">
              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="w-5 h-5 text-pink-500" />
                  <h4 className="font-semibold text-slate-900">Menschen mit Demenz</h4>
                </div>
                <p className="text-sm text-slate-600">Rund 1,8 Millionen Menschen in Deutschland</p>
              </div>
              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-5 h-5 text-blue-500" />
                  <h4 className="font-semibold text-slate-900">Nicht-Muttersprachler</h4>
                </div>
                <p className="text-sm text-slate-600">Verstehen Leichte Sprache besser als Behördendeutsch</p>
              </div>
              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-5 h-5 text-purple-500" />
                  <h4 className="font-semibold text-slate-900">Ältere Menschen</h4>
                </div>
                <p className="text-sm text-slate-600">Mit zunehmendem Alter lässt die Texterfassung nach</p>
              </div>
              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-5 h-5 text-green-500" />
                  <h4 className="font-semibold text-slate-900">Geringe Lesekompetenz</h4>
                </div>
                <p className="text-sm text-slate-600">6,2 Millionen Erwachsene können nicht richtig lesen</p>
              </div>
            </div>

            <div className="bg-green-50 rounded-xl p-6 border border-green-100 not-prose">
              <p className="text-green-900 font-medium">
                Insgesamt profitieren schätzungsweise <strong>10 bis 15 Millionen Menschen</strong> in
                Deutschland von Leichter Sprache. Das sind mehr Einwohner als Nordrhein-Westfalen hat.
              </p>
            </div>
          </section>

          {/* 3. Gesetzliche Anforderungen */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <Scale className="w-6 h-6 text-purple-500" />
              3. Gesetzliche Anforderungen: Was Kommunen umsetzen müssen
            </h2>

            <p className="text-slate-700 mb-6">
              Leichte Sprache ist für Behörden keine Option, sondern Pflicht. Die rechtlichen
              Grundlagen sind klar – auch wenn viele Kommunen sie ignorieren.
            </p>

            <div className="bg-white rounded-xl p-6 border border-slate-200 not-prose mb-6">
              <h4 className="font-semibold text-slate-900 mb-3">BITV 2.0: Die zentrale Vorschrift</h4>
              <p className="text-slate-700 mb-4">
                Die Barrierefreie-Informationstechnik-Verordnung 2.0 gilt für alle öffentlichen Stellen –
                von Bundesministerien bis zur kleinsten Gemeindeverwaltung.
              </p>
              <p className="text-slate-700 mb-3">
                Paragraph 4 fordert konkret, dass auf der Startseite folgende Informationen in Leichter
                Sprache bereitgestellt werden müssen:
              </p>
              <ul className="space-y-2 text-slate-700">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  Informationen über die wesentlichen Inhalte der Website
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  Hinweise zur Navigation
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  Informationen über die wichtigsten Aufgaben und Zustaendigkeiten
                </li>
              </ul>
            </div>

            <div className="bg-amber-50 rounded-xl p-6 border border-amber-100 not-prose">
              <h4 className="font-semibold text-amber-900 mb-2">Die Barrierefreiheitserklärung</h4>
              <p className="text-amber-800">
                Jede öffentliche Website muss eine Barrierefreiheitserklärung veröffentlichen. Wer keine
                Leichte Sprache anbietet, muss das offiziell erklären und begründen. Die Ausrede
                "unverhältnismäßige Belastung" wird kritisch geprüft – besonders wenn kostengünstige
                KI-Lösungen verfügbar sind.
              </p>
            </div>
          </section>

          {/* 4. Kostenvergleich */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <Calculator className="w-6 h-6 text-green-500" />
              4. Manuell vs. KI: Der große Kostenvergleich
            </h2>

            <div className="space-y-6 not-prose">
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-4">Variante 1: Professionelle Übersetzungsbueros</h4>
                <p className="text-slate-700 mb-4">
                  Der klassische Weg: Übersetzer wandelt Text um, Pruefgruppe testet, Text wird finalisiert.
                </p>
                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="text-slate-900 font-medium mb-2">Kosten: 150-200 Euro pro Normseite</p>
                  <p className="text-slate-600 text-sm">
                    Rechenbeispiel: 50 Seiten Erstübersetzung = 9.000 Euro<br />
                    + 10 Seiten/Monat Aktualisierung = 1.800 Euro/Monat = 21.600 Euro/Jahr
                  </p>
                </div>
              </div>

              <div className="bg-green-50 rounded-xl p-6 border border-green-100">
                <h4 className="font-semibold text-green-900 mb-4">Variante 2: KI-basierte Lösung mit VoxDrop</h4>
                <p className="text-green-800 mb-4">
                  Moderne KI-Sprachmodelle können komplexe Regelsysteme wie die Leichte-Sprache-Richtlinien
                  anwenden. VoxDrop nutzt diese Technologie für automatisierte, hochwertige Übersetzungen.
                </p>
                <div className="bg-green-100 rounded-lg p-4">
                  <p className="text-green-900 font-medium mb-2">Pakete ab 49 Euro/Monat</p>
                  <p className="text-green-700 text-sm">
                    Unbegrenzte Übersetzungen, sofortige Ergebnisse, keine laufenden Pro-Seite-Kosten
                  </p>
                </div>
              </div>

              <div className="bg-violet-50 rounded-xl p-6 border border-violet-100">
                <h4 className="font-semibold text-blue-900 mb-3">Die Ersparnis</h4>
                <p className="text-violet-800">
                  Im ersten Jahr spart eine Kommune mit VoxDrop etwa <strong>9.600 Euro</strong> gegenüber
                  der manuellen Übersetzung. Im zweiten Jahr – wenn bei der manuellen Variante die laufenden
                  Aktualisierungskosten anfallen – steigt die Ersparnis auf über <strong>20.000 Euro jährlich</strong>.
                </p>
              </div>
            </div>

            <h3 className="text-xl font-semibold text-slate-900 mt-8 mb-4">Der Zeitfaktor</h3>
            <p className="text-slate-700 mb-4">
              Neben den Kosten spielt auch die Zeit eine entscheidende Rolle:
            </p>
            <div className="grid md:grid-cols-2 gap-4 not-prose">
              <div className="bg-red-50 rounded-xl p-5 border border-red-100">
                <h4 className="font-semibold text-red-900 mb-2">Manuell</h4>
                <p className="text-red-800">5-10 Werktage pro Text. Bei 50+ Seiten mehrere Monate.</p>
              </div>
              <div className="bg-green-50 rounded-xl p-5 border border-green-100">
                <h4 className="font-semibold text-green-900 mb-2">Mit KI</h4>
                <p className="text-green-800">Sekunden bis Minuten pro Seite. Komplette Website in Tagen.</p>
              </div>
            </div>
          </section>

          {/* 5. So funktioniert KI-basierte Leichte Sprache */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <Sparkles className="w-6 h-6 text-amber-500" />
              5. So funktioniert KI-basierte Leichte Sprache
            </h2>

            <div className="bg-white rounded-xl p-6 border border-slate-200 not-prose mb-6">
              <h4 className="font-semibold text-slate-900 mb-4">Die Technologie</h4>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <Zap className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium text-slate-900">Regelbasiertes Prompting:</span>
                    <span className="text-slate-600"> Das vollständige Regelwerk des Netzwerks Leichte
                    Sprache ist integriert.</span>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Zap className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium text-slate-900">Beispielgestütztes Lernen:</span>
                    <span className="text-slate-600"> Training mit Tausenden professioneller
                    Leichte-Sprache-Übersetzungen.</span>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Zap className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium text-slate-900">Automatische Qualitätskontrolle:</span>
                    <span className="text-slate-600"> Prüfung auf Satzlänge, Wortlänge,
                    Passivkonstruktionen und mehr.</span>
                  </div>
                </li>
              </ul>
            </div>

            <h3 className="text-xl font-semibold text-slate-900 mb-4">Ein Beispiel aus der Praxis</h3>

            <div className="space-y-4 not-prose mb-6">
              <div className="bg-slate-100 rounded-xl p-5 border border-slate-200">
                <p className="text-sm text-slate-500 mb-2">Originaltext (Behördendeutsch):</p>
                <p className="text-slate-800 italic">
                  "Die Beantragung eines Personalausweises setzt die persönliche Vorsprache des
                  Antragstellers bei der zuständigen Personalausweisbehörde voraus. Hierbei sind
                  ein aktuelles biometrisches Lichtbild sowie gegebenenfalls der bisherige
                  Personalausweis vorzulegen."
                </p>
              </div>

              <div className="bg-green-50 rounded-xl p-5 border border-green-100">
                <p className="text-sm text-green-600 mb-2">VoxDrop-Übersetzung (Leichte Sprache):</p>
                <div className="text-green-900 space-y-2">
                  <p className="font-medium">Sie brauchen einen neuen Personal-Ausweis?</p>
                  <p>Dann müssen Sie persönlich zum Bürger-Amt kommen.</p>
                  <p>Bringen Sie bitte mit:</p>
                  <ul className="list-disc pl-5">
                    <li>Ein neues Foto von Ihrem Gesicht</li>
                    <li>Ihren alten Personal-Ausweis (wenn Sie einen haben)</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* 6. Der 5-Schritte-Plan */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <Target className="w-6 h-6 text-purple-500" />
              6. Der 5-Schritte-Plan: So führt Ihre Kommune Leichte Sprache ein
            </h2>

            <div className="space-y-6 not-prose">
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center shrink-0 text-purple-700 font-bold">1</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-2">Bestandsaufnahme (Woche 1)</h4>
                  <p className="text-slate-600 mb-3">
                    Erstellen Sie eine Liste aller Seiten und kategorisieren Sie nach Wichtigkeit:
                  </p>
                  <ul className="text-slate-600 text-sm space-y-1">
                    <li><strong>Priorität A:</strong> Startseite, Kontakt, Navigation, Top-10 meistbesucht</li>
                    <li><strong>Priorität B:</strong> Bürgerdienste mit hohem Aufkommen</li>
                    <li><strong>Priorität C:</strong> Alle weiteren Inhalte</li>
                  </ul>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center shrink-0 text-purple-700 font-bold">2</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-2">Tool-Entscheidung (Woche 2)</h4>
                  <p className="text-slate-600">
                    Für die meisten Kommunen: KI-Übersetzung für 90% der Inhalte, menschliche
                    Prüfung für kritische Inhalte. Testen Sie VoxDrop kostenlos für 14 Tage.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center shrink-0 text-purple-700 font-bold">3</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-2">Pilotphase mit Priorität A (Woche 3-4)</h4>
                  <p className="text-slate-600">
                    Starten Sie mit den wichtigsten Seiten: Startseite der Leichte-Sprache-Rubrik,
                    Navigation, die 5 meistbesuchten Bürgerservice-Seiten, Kontaktseite.
                    Sammeln Sie Feedback.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center shrink-0 text-purple-700 font-bold">4</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-2">Rollout auf Priorität B und C (Woche 5-8)</h4>
                  <p className="text-slate-600">
                    Mit VoxDrop problemlos 10-20 Seiten pro Tag uebersetzen. Achten Sie auch auf
                    Navigation, Formulare und wichtige PDFs.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center shrink-0 text-purple-700 font-bold">5</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-2">Laufende Pflege etablieren (dauerhaft)</h4>
                  <p className="text-slate-600">
                    Definieren Sie klare Verantwortlichkeiten: Wer aktualisiert? Welcher Workflow
                    bei neuen Inhalten? Wie oft werden bestehende Inhalte geprüft?
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Häufige Fehler */}
          <section className="mb-12">
            <h3 className="text-xl font-semibold text-slate-900 mb-4">Häufige Fehler vermeiden</h3>

            <div className="space-y-4 not-prose">
              <div className="bg-red-50 rounded-xl p-5 border border-red-100">
                <h4 className="font-semibold text-red-900 mb-2">Fehler 1: Nur die Startseite uebersetzen</h4>
                <p className="text-red-800">
                  Eine Leichte-Sprache-Version, die nach der Startseite endet, frustriert Nutzer mehr,
                  als sie hilft.
                </p>
              </div>
              <div className="bg-red-50 rounded-xl p-5 border border-red-100">
                <h4 className="font-semibold text-red-900 mb-2">Fehler 2: Leichte Sprache verstecken</h4>
                <p className="text-red-800">
                  Der Link muss prominent auf der Startseite sein – nicht im Footer oder einer Unterseite.
                </p>
              </div>
              <div className="bg-red-50 rounded-xl p-5 border border-red-100">
                <h4 className="font-semibold text-red-900 mb-2">Fehler 3: Texte nie aktualisieren</h4>
                <p className="text-red-800">
                  Veraltete Informationen in Leichter Sprache sind ein No-Go. Aktualisierungen müssen
                  beide Versionen betreffen.
                </p>
              </div>
              <div className="bg-red-50 rounded-xl p-5 border border-red-100">
                <h4 className="font-semibold text-red-900 mb-2">Fehler 4: Keine Rückmeldung einholen</h4>
                <p className="text-red-800">
                  Ein einfacher Feedback-Button kann Wunder wirken bei der kontinuierlichen Verbesserung.
                </p>
              </div>
            </div>
          </section>

          {/* Fazit */}
          <section className="mb-12">
            <div className="bg-gradient-to-br from-green-50 to-blue-50 rounded-2xl p-8 border border-green-100 not-prose">
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">
                Fazit: Leichte Sprache ist machbar – mit der richtigen Technologie
              </h2>
              <p className="text-slate-700 mb-4">
                Leichte Sprache auf Behörden-Websites ist seit über einem Jahrzehnt gesetzliche Pflicht.
                Die Ausreden – zu teuer, zu aufwendig, kein Know-how – haben angesichts moderner
                KI-Lösungen ausgedient.
              </p>
              <p className="text-slate-700 mb-4">
                Wichtiger noch: Es geht hier nicht nur um Compliance. Es geht um <strong>10 bis 15 Millionen
                Menschen</strong> in Deutschland, die ohne Leichte Sprache von wichtigen Informationen
                ausgeschlossen sind. Menschen, die ein Recht darauf haben, zu verstehen, was ihre
                Gemeinde tut.
              </p>
              <p className="text-slate-900 font-semibold text-lg">
                Die Technologie ist da. Das Regelwerk ist klar. Die rechtliche Pflicht besteht.
                Es gibt keinen Grund mehr zu warten.
              </p>
            </div>
          </section>

        </article>

        {/* CTA Section */}
        <div className="bg-gradient-to-br from-green-600 to-blue-600 rounded-2xl p-8 md:p-10 text-center text-white">
          <h2 className="text-2xl md:text-3xl font-semibold mb-4">
            Testen Sie VoxDrop 14 Tage kostenlos
          </h2>
          <p className="text-white/80 mb-8 max-w-xl mx-auto">
            Sehen Sie selbst, wie Ihre Website in Leichter Sprache aussieht.
            Keine Kreditkarte erforderlich. Keine Verpflichtung.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/tools/einfache-sprache">
              <Button className="h-12 px-8 rounded-xl bg-white text-green-600 hover:bg-slate-100 font-semibold">
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
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-blue-600 rounded-full flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-medium text-slate-900 mb-1">Sie haben Fragen?</p>
              <p className="text-slate-600 text-sm mb-2">
                Unser Team berät Sie gerne – kostenlos und unverbindlich.
              </p>
              <a href="mailto:hallo@voxdrop.live" className="text-green-600 hover:text-green-700 font-medium">
                hallo@voxdrop.live
              </a>
            </div>
          </div>
        </div>

        {/* Author */}
        <div className="mt-8 pt-8 border-t border-slate-200">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-blue-600 rounded-full flex items-center justify-center">
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
