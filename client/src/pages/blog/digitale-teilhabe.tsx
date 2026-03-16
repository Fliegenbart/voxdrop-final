import { Button } from "@/components/ui/button";
import { PageLayout } from "@/components/PageLayout";
import { SEO, ArticleSchema } from "@/components/SEO";
import { getBlogPost, formatDate } from "@/lib/blog-posts";
import {
  Heart, Users, TrendingUp, CheckCircle2, ArrowRight,
  Calendar, Clock, ArrowLeft, Eye, Ear, Hand, Brain,
  Building2, Target, Lightbulb, Scale, BarChart3,
  Settings, Monitor, Sparkles, Mail
} from "lucide-react";
import { Link } from "wouter";

export default function DigitaleTeilhabe() {
  const post = getBlogPost("digitale-teilhabe");

  return (
    <PageLayout>
      <SEO
        title="Digitale Teilhabe: Barrierefreiheit als Bürgerrecht"
        description="Ein Perspektivwechsel für Führungskräfte in der Verwaltung. Warum Barrierefreiheit keine IT-Aufgabe ist, sondern eine Frage der Haltung."
        canonical="/blog/digitale-teilhabe"
        ogType="article"
      />
      <ArticleSchema
        title="Digitale Teilhabe: Barrierefreiheit als Bürgerrecht"
        description="Ein Perspektivwechsel für Führungskräfte in der Verwaltung. Warum Barrierefreiheit keine IT-Aufgabe ist, sondern eine Frage der Haltung."
        url="/blog/digitale-teilhabe"
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
              Grundlagen
            </span>
            <div className="flex items-center gap-4 text-sm text-slate-600">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {post ? formatDate(post.date) : "1. Februar 2026"}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                15 min Lesezeit
              </span>
            </div>
          </div>

          <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight mb-4">
            Digitale Teilhabe: Barrierefreiheit als Bürgerrecht
          </h1>
          <p className="text-xl text-slate-600 font-light">
            Ein Perspektivwechsel für Führungskräfte in der Verwaltung. Warum Barrierefreiheit
            keine IT-Aufgabe ist, sondern eine Frage der Haltung, der Strategie und des Selbstverständnisses
            einer modernen Verwaltung.
          </p>
        </div>
      </header>

      <main id="main-content" className="max-w-3xl mx-auto px-6 pb-24" tabIndex={-1}>

        <article className="prose prose-gray max-w-none">

          {/* Einleitung */}
          <section className="mb-12">
            <p className="text-slate-700 mb-4">
              Wenn wir über digitale Barrierefreiheit sprechen, sprechen wir oft über Technik: WCAG-Kriterien,
              Alt-Texte, Kontrastwerte. Doch hinter den technischen Anforderungen steht etwas Größeres – eine
              gesellschaftliche Frage, die jede Kommune betrifft: <strong>Wer darf an der digitalen Verwaltung
              teilhaben? Und wer wird ausgeschlossen?</strong>
            </p>
            <p className="text-slate-700 mb-4">
              Dieser Artikel richtet sich bewusst nicht an Entwickler und Webmaster, sondern an Führungskräfte:
              Bürgermeister, Amtsleiter, Digitalisierungsbeauftragte. Denn Barrierefreiheit ist keine Aufgabe
              für die IT-Abteilung allein – sie ist eine Frage der Haltung, der Strategie und letztlich des
              Selbstverständnisses einer modernen Verwaltung.
            </p>
          </section>

          {/* Mehr als Compliance */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <Scale className="w-6 h-6 text-blue-500" />
              Mehr als Compliance: Barrierefreiheit neu denken
            </h2>
            <p className="text-slate-700 mb-4">
              In vielen Verwaltungen wird Barrierefreiheit als Pflichtübung betrachtet: Die BITV 2.0 schreibt
              es vor, also muss es gemacht werden. Diese Perspektive ist verständlich – aber sie greift zu kurz.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mb-3">Das Compliance-Mindset und seine Grenzen</h3>
            <p className="text-slate-700 mb-4">
              Wer Barrierefreiheit nur als gesetzliche Anforderung begreift, optimiert auf das Minimum.
              Das Ergebnis sind Websites, die technisch konform sind, aber nicht wirklich zugänglich:
            </p>
            <ul className="list-disc pl-6 text-slate-700 mb-4 space-y-2">
              <li>Alt-Texte, die "Bild" lauten</li>
              <li>Erklärungen zur Barrierefreiheit, die Mängel dokumentieren, aber nie behoben werden</li>
              <li>Formulare, die theoretisch funktionieren, praktisch aber niemanden erreichen</li>
            </ul>

            <div className="bg-violet-50 rounded-xl p-6 border border-violet-100 not-prose my-6">
              <p className="text-blue-900 font-medium">
                Compliance ist notwendig, aber nicht hinreichend.
              </p>
            </div>

            <h3 className="text-xl font-semibold text-slate-900 mb-3">Der Perspektivwechsel: Vom Muessen zum Wollen</h3>
            <p className="text-slate-700 mb-4">
              Echte digitale Teilhabe entsteht, wenn Barrierefreiheit nicht als Bürde, sondern als Chance
              begriffen wird. Wenn die Frage nicht lautet "Was müssen wir mindestens tun?" sondern
              "Wie erreichen wir wirklich alle Bürger?"
            </p>

            <div className="grid md:grid-cols-2 gap-4 not-prose mb-6">
              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2">Von der Checkliste</h4>
                <p className="text-sm text-slate-600">zur Nutzerperspektive</p>
              </div>
              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2">Von der Nachbesserung</h4>
                <p className="text-sm text-slate-600">zum Mitdenken von Anfang an</p>
              </div>
              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2">Von der IT-Aufgabe</h4>
                <p className="text-sm text-slate-600">zur Führungsverantwortung</p>
              </div>
              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2">Von der Pflichtübung</h4>
                <p className="text-sm text-slate-600">zum Qualitätsmerkmal</p>
              </div>
            </div>
          </section>

          {/* Die Zahlen */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-6 flex items-center gap-3">
              <Users className="w-6 h-6 text-purple-500" />
              Die Zahlen: Wen betrifft es wirklich?
            </h2>
            <p className="text-slate-700 mb-6">
              Die abstrakte Diskussion über Barrierefreiheit wird konkret, wenn man die Zahlen betrachtet.
            </p>

            <div className="space-y-6 not-prose">
              <div className="bg-purple-50 rounded-xl p-6 border border-purple-100">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center shrink-0">
                    <Users className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-purple-900 mb-2">7,9 Millionen Menschen mit Schwerbehinderung</h4>
                    <p className="text-purple-800">
                      Ende 2023 lebten in Deutschland 7,9 Millionen Menschen mit anerkannter Schwerbehinderung –
                      etwa <strong>9,3% der Bevölkerung</strong>. Das ist jeder elfte Mensch. In einer Kommune
                      mit 50.000 Einwohnern sind das statistisch 4.650 Bürger.
                    </p>
                    <p className="text-purple-700 text-sm mt-2">
                      Diese Zahl steigt weiter: Die Bevölkerung altert, und mit dem Alter nehmen Behinderungen zu.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-4">Die Vielfalt der Einschränkungen</h4>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <Hand className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-medium text-slate-900">Körperliche Behinderungen (58%):</span>
                      <span className="text-slate-600"> Eingeschränkte Motorik betrifft die Tastaturbedienung,
                      das Ausfüllen von Formularen, die Navigation.</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Brain className="w-5 h-5 text-pink-500 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-medium text-slate-900">Geistige oder seelische Behinderungen (15%):</span>
                      <span className="text-slate-600"> Komplexe Texte, unübersichtliche Strukturen, Zeitdruck
                      bei Formularen werden zu Barrieren.</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Eye className="w-5 h-5 text-purple-500 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-medium text-slate-900">Sehbehinderungen und Blindheit:</span>
                      <span className="text-slate-600"> Screenreader, Vergrößerung, Kontraste – die klassischen
                      Themen der Web-Barrierefreiheit.</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Ear className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-medium text-slate-900">Hörbehinderungen:</span>
                      <span className="text-slate-600"> Untertitel, Gebärdensprache, visuelle Alternativen
                      für Audio-Inhalte.</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 rounded-xl p-6 border border-amber-100">
                <h4 className="font-semibold text-amber-900 mb-2">Die vergessene Mehrheit</h4>
                <p className="text-amber-800">
                  <strong>91% der Schwerbehinderungen sind nicht angeboren</strong>, sondern im Lebensverlauf
                  erworben – durch Krankheit, Unfall oder Alter. Die meisten betroffenen Menschen waren die
                  längste Zeit ihres Lebens nicht behindert. Sie sind mit digitalen Diensten vertraut – und
                  erleben plötzlich Barrieren, wo vorher keine waren.
                </p>
              </div>

              <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-3">Temporäre und situative Einschränkungen</h4>
                <p className="text-slate-700 mb-3">
                  Jenseits der anerkannten Schwerbehinderungen gibt es Millionen Menschen mit temporären
                  oder situativen Einschränkungen:
                </p>
                <ul className="space-y-2 text-slate-700">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    Der Arm im Gips, der keine Maus bedienen kann
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    Die Augenentzündung, die das Lesen erschwert
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    Die laute Umgebung, in der Audio nicht funktioniert
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    Das helle Sonnenlicht, das den Bildschirm unleserlich macht
                  </li>
                </ul>
                <p className="text-slate-700 mt-3 font-medium">
                  Barrierefreie Websites helfen nicht nur Menschen mit Behinderungen – sie helfen allen
                  in bestimmten Situationen.
                </p>
              </div>
            </div>
          </section>

          {/* Der Business Case */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <BarChart3 className="w-6 h-6 text-green-500" />
              Der Business Case: Warum sich Barrierefreiheit rechnet
            </h2>
            <p className="text-slate-700 mb-6">
              Für Führungskräfte ist die ethische Argumentation wichtig, aber nicht hinreichend.
              Was bringt Barrierefreiheit konkret? Der Business Case ist überraschend stark.
            </p>

            <div className="space-y-6 not-prose">
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-4">Direkte Vorteile</h4>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <TrendingUp className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-medium text-slate-900">Größere Reichweite:</span>
                      <span className="text-slate-600"> 9,3% der Bevölkerung haben eine Schwerbehinderung.
                      Eine barrierefreie Website erreicht mehr Bürger.</span>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <TrendingUp className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-medium text-slate-900">Weniger Supportaufwand:</span>
                      <span className="text-slate-600"> Wenn Bürger Online-Dienste selbstständig nutzen können,
                      sinkt der Bedarf an telefonischer Beratung.</span>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <TrendingUp className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-medium text-slate-900">Rechtssicherheit:</span>
                      <span className="text-slate-600"> BITV-Konformität schützt vor negativen Prüfberichten
                      und Beschwerden.</span>
                    </div>
                  </li>
                </ul>
              </div>

              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-4">Indirekte Vorteile</h4>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-medium text-slate-900">Bessere Usability für alle:</span>
                      <span className="text-slate-600"> Barrierefreie Websites sind strukturierter,
                      verständlicher, leichter zu bedienen.</span>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-medium text-slate-900">SEO-Vorteile:</span>
                      <span className="text-slate-600"> Viele Barrierefreiheits-Kriterien decken sich mit
                      SEO-Best-Practices. Google belohnt barrierefreie Websites.</span>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-medium text-slate-900">Zukunftssicherheit:</span>
                      <span className="text-slate-600"> Die Anforderungen werden steigen, nicht sinken.
                      Wer heute investiert, muss morgen nicht teuer nachrüsten.</span>
                    </div>
                  </li>
                </ul>
              </div>

              <div className="bg-green-50 rounded-xl p-6 border border-green-100">
                <h4 className="font-semibold text-green-900 mb-3">Die Kosten-Perspektive</h4>
                <p className="text-green-800 mb-3">
                  Barrierefreiheit kostet Geld – aber weniger, als viele denken. Die entscheidende Frage
                  ist der Zeitpunkt:
                </p>
                <ul className="space-y-2 text-green-800">
                  <li><strong>Von Anfang an:</strong> 10-20% Mehrkosten bei der Entwicklung</li>
                  <li><strong>Nachträglich:</strong> 50-100% der ursprünglichen Entwicklungskosten</li>
                  <li><strong>Gar nicht:</strong> Langfristig die teuerste Option</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Change Management */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <Settings className="w-6 h-6 text-orange-500" />
              Change Management: Barrierefreiheit in der Organisation verankern
            </h2>
            <p className="text-slate-700 mb-6">
              Barrierefreiheit ist kein Projekt, das man einmal macht und dann abhakt.
              Sie ist ein fortlaufender Prozess, der in der Organisation verankert werden muss.
            </p>

            <div className="space-y-6 not-prose">
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center shrink-0 text-orange-700 font-bold">1</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-2">Awareness schaffen</h4>
                  <p className="text-slate-600">
                    Screenreader-Demonstration für Führungskräfte und Teams. Simulation von Einschränkungen.
                    Berichte von Betroffenen. Zahlen und Fakten zur Zielgruppe in der eigenen Kommune.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center shrink-0 text-orange-700 font-bold">2</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-2">Verantwortlichkeiten klären</h4>
                  <p className="text-slate-600">
                    Barrierefreiheit braucht klare Zuständigkeiten: Gesamtverantwortung auf Leitungsebene,
                    operative Koordination durch einen Beauftragten, klare Umsetzung in IT, Redaktion und
                    Fachabteilungen.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center shrink-0 text-orange-700 font-bold">3</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-2">Prozesse etablieren</h4>
                  <p className="text-slate-600">
                    Bei der Beschaffung: Barrierefreiheits-Anforderungen in jede IT-Ausschreibung.
                    Bei der Entwicklung: Accessibility-Check als Abnahmekriterium.
                    Bei der Redaktion: Schulung für barrierefreie Texte, Bilder, PDFs.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center shrink-0 text-orange-700 font-bold">4</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-2">Erfolge messen</h4>
                  <p className="text-slate-600">
                    KPIs definieren: Anzahl bekannter Barrieren, Ergebnisse automatisierter Tests,
                    Nutzerfeedback, Nutzung assistiver Funktionen, Abschlussquoten bei Online-Formularen.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center shrink-0 text-orange-700 font-bold">5</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-2">Kontinuierlich verbessern</h4>
                  <p className="text-slate-600">
                    Regelmäßige Audits, jährliche Aktualisierung der Barrierefreiheitserklärung,
                    Feedback-Kanal für Bürger, Schulungen für neue Mitarbeiter.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Die inklusive Kommune der Zukunft */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <Building2 className="w-6 h-6 text-blue-500" />
              Die inklusive Kommune der Zukunft
            </h2>
            <p className="text-slate-700 mb-6">
              Wie sieht eine Kommune aus, die digitale Teilhabe ernst nimmt?
            </p>

            <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-2xl p-6 border border-violet-100 not-prose mb-6">
              <h3 className="font-semibold text-blue-900 mb-4">Vision 2030</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Monitor className="w-5 h-5 text-violet-600 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium text-blue-900">Digitale Dienste für alle:</span>
                    <span className="text-violet-800"> Jeder Online-Service ist so gestaltet, dass Menschen
                    mit unterschiedlichsten Einschränkungen ihn selbstständig nutzen können.</span>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Heart className="w-5 h-5 text-pink-600 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium text-blue-900">Kanalvielfalt:</span>
                    <span className="text-violet-800"> Online, telefonisch, persönlich – alle Kanäle
                    sind gleichwertig und barrierefrei.</span>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Brain className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium text-blue-900">Leichte Sprache als Standard:</span>
                    <span className="text-violet-800"> Wichtige Informationen sind auch in verständlicher
                    Sprache verfügbar.</span>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Users className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium text-blue-900">Feedback-Kultur:</span>
                    <span className="text-violet-800"> Bürger mit Behinderungen werden aktiv einbezogen –
                    als Experten für ihre eigenen Bedürfnisse.</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 border border-slate-200 not-prose">
              <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                Die Rolle der Technologie
              </h4>
              <p className="text-slate-700 mb-4">
                Moderne Technologien können Inklusion erleichtern:
              </p>
              <ul className="space-y-2 text-slate-700">
                <li><strong>KI-basierte Leichte Sprache:</strong> Automatische Übersetzung komplexer Texte</li>
                <li><strong>Text-to-Speech:</strong> Vorlesefunktionen für alle</li>
                <li><strong>Automatisierte PDF-Barrierefreiheit:</strong> Die Masse der Behörden-PDFs wird zugänglich</li>
                <li><strong>Sprachassistenten:</strong> Spracheingabe und -ausgabe als Alternative</li>
              </ul>
              <p className="text-slate-700 mt-4 font-medium">
                Diese Technologien sind keine Zukunftsmusik – sie sind heute verfügbar.
              </p>
            </div>
          </section>

          {/* Die Rolle der Führung */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <Target className="w-6 h-6 text-red-500" />
              Die Rolle der Führung
            </h2>
            <p className="text-slate-700 mb-6">
              Digitale Teilhabe braucht Führung. Sie entsteht nicht von allein, weil es eine Vorschrift gibt.
              Sie entsteht, wenn Führungskräfte sie zu ihrer Sache machen.
            </p>

            <div className="space-y-4 not-prose">
              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2">Priorität setzen</h4>
                <p className="text-slate-600">
                  Barrierefreiheit auf die Agenda heben, Budget bereitstellen, Ressourcen zuweisen.
                </p>
              </div>
              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2">Vorbild sein</h4>
                <p className="text-slate-600">
                  Selbst verstehen, was Barrierefreiheit bedeutet. Die eigenen Präsentationen barrierefrei
                  gestalten. In Grußworten und Reden das Thema ansprechen.
                </p>
              </div>
              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2">Nachfragen</h4>
                <p className="text-slate-600">
                  Bei jedem neuen Projekt, bei jeder Beschaffung: "Wie stellen wir Barrierefreiheit sicher?"
                </p>
              </div>
              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2">Anerkennung geben</h4>
                <p className="text-slate-600">
                  Teams und Mitarbeiter, die Barrierefreiheit voranbringen, sichtbar machen und würdigen.
                </p>
              </div>
            </div>

            <div className="bg-purple-50 rounded-xl p-6 border border-purple-100 not-prose mt-6">
              <p className="text-purple-900">
                Wenn eine Bürgermeisterin oder ein Amtsleiter sagt: "Wir wollen, dass alle Bürger unsere
                digitalen Dienste nutzen können – nicht nur die, die keine Einschränkungen haben" – dann
                hat das Gewicht. Es signalisiert der Organisation, dass das Thema ernst genommen wird.
                Und es signalisiert den Bürgern, dass ihre Teilhabe gewollt ist.
              </p>
            </div>
          </section>

          {/* Fazit */}
          <section className="mb-12">
            <div className="bg-gradient-to-br from-blue-50 to-green-50 rounded-2xl p-8 border border-violet-100 not-prose">
              <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
                <Lightbulb className="w-6 h-6 text-amber-500" />
                Fazit: Teilhabe ist kein Feature
              </h2>
              <p className="text-slate-700 mb-4">
                Digitale Barrierefreiheit ist kein technisches Feature, das man hinzufügt oder weglässt.
                Sie ist Ausdruck eines Menschenbildes: Wollen wir eine Gesellschaft, in der alle teilhaben
                können? Oder nehmen wir in Kauf, dass ein Teil der Bürger ausgeschlossen bleibt?
              </p>
              <p className="text-slate-700 mb-4">
                Für Verwaltungen ist diese Frage keine abstrakte Philosophie. Sie hat konkrete Auswirkungen
                auf konkrete Menschen: Auf den Rentner mit Sehbehinderung, der seinen Antrag nicht online
                stellen kann. Auf die Mutter mit Lernschwäche, die das Formular für den Kindergartenplatz
                nicht versteht. Auf das Unfallopfer im Rollstuhl, dessen einarmige Tastatureingabe an einem
                zeitbegrenzten Formular scheitert.
              </p>
              <p className="text-slate-900 font-semibold text-lg">
                Die gute Nachricht: Der Weg zur inklusiven Kommune ist machbar. Er erfordert Entscheidungen,
                Ressourcen und Ausdauer – aber keine Wunder. Jede Kommune kann barrierefrei werden.
                Es ist eine Frage der Priorität.
              </p>
            </div>
          </section>

        </article>

        {/* CTA Section */}
        <div className="bg-gradient-to-br from-violet-600 to-purple-700 rounded-2xl p-8 md:p-10 text-center text-white">
          <h2 className="text-2xl md:text-3xl font-semibold mb-4">
            Digitale Teilhabe in Ihrer<br />Kommune voranbringen
          </h2>
          <p className="text-white/80 mb-8 max-w-xl mx-auto">
            Von Text-to-Speech über KI-basierte Leichte Sprache bis zur automatisierten PDF-Barrierefreiheit –
            VoxDrop hilft Kommunen dabei, echte digitale Teilhabe zu ermöglichen.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/">
              <Button className="h-12 px-8 rounded-xl bg-white text-violet-600 hover:bg-slate-100 font-semibold">
                Jetzt kostenlos testen
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <Link href="/behoerden">
              <Button variant="outline" className="h-12 px-8 rounded-xl border-white/30 text-white hover:bg-white/10">
                Lösungen für Behörden
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
              <p className="font-medium text-slate-900 mb-1">Kontakt</p>
              <p className="text-slate-600 text-sm mb-2">
                Sie möchten digitale Teilhabe in Ihrer Kommune voranbringen?
                Wir unterstützen Sie gerne – von der Strategieberatung bis zur technischen Umsetzung.
              </p>
              <a href="mailto:hallo@voxdrop.live" className="text-purple-600 hover:text-purple-700 font-medium">
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
