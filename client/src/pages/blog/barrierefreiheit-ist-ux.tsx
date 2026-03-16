import { Button } from "@/components/ui/button";
import { PageLayout } from "@/components/PageLayout";
import { SEO, ArticleSchema } from "@/components/SEO";
import { getBlogPost, formatDate } from "@/lib/blog-posts";
import {
  Heart, Users, TrendingUp, CheckCircle2, XCircle, ArrowRight,
  Calendar, Clock, ArrowLeft, Eye, Ear, Hand, Brain,
  Sun, Volume2, Lightbulb, Target, Layers, BookOpen, ExternalLink
} from "lucide-react";
import { Link } from "wouter";

export default function BarrierefreiheitIstUx() {
  const post = getBlogPost("barrierefreiheit-ist-ux");

  return (
    <PageLayout>
      <SEO
        title="Warum Barrierefreiheit kein Compliance-Thema ist, sondern ein UX-Thema"
        description="Die meisten Organisationen behandeln digitale Barrierefreiheit wie eine lästige Vorschrift. Das ist nicht nur falsch gedacht – es kostet sie bares Geld und bessere Produkte."
        canonical="/blog/barrierefreiheit-ist-ux"
        ogType="article"
      />
      <ArticleSchema
        title="Warum Barrierefreiheit kein Compliance-Thema ist, sondern ein UX-Thema"
        description="Die meisten Organisationen behandeln digitale Barrierefreiheit wie eine lästige Vorschrift. Das ist nicht nur falsch gedacht – es kostet sie bares Geld und bessere Produkte."
        url="/blog/barrierefreiheit-ist-ux"
        datePublished={post?.date || "2026-01-17"}
        author="David Wegener"
      />

      {/* Hero Section */}
      <header className="pt-12 pb-8 px-6">
        <div className="max-w-3xl mx-auto">
          <Link href="/blog" className="inline-flex items-center gap-2 text-purple-600 hover:text-purple-700 mb-6 group">
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Zurück zum Blog
          </Link>

          <div className="flex items-center gap-4 mb-4">
            <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
              Grundlagen
            </span>
            <div className="flex items-center gap-4 text-sm text-slate-600">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {post ? formatDate(post.date) : "17. Januar 2026"}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                8 min Lesezeit
              </span>
            </div>
          </div>

          <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight mb-4">
            Warum Barrierefreiheit kein Compliance-Thema ist, sondern ein UX-Thema
          </h1>
          <p className="text-xl text-slate-600 font-light">
            Die meisten Organisationen behandeln digitale Barrierefreiheit wie eine lästige Vorschrift.
            Das ist nicht nur falsch gedacht – es kostet sie bares Geld und bessere Produkte.
          </p>
        </div>
      </header>

      <main id="main-content" className="max-w-3xl mx-auto px-6 pb-24" tabIndex={-1}>

        <article className="prose prose-gray max-w-none">

          {/* Section 1: Der Compliance-Reflex */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">
              Der Compliance-Reflex: Warum er schadet
            </h2>
            <p className="text-slate-700 mb-4">
              Wenn in deutschen Behörden und Unternehmen das Wort „Barrierefreiheit" fällt, passiert fast immer dasselbe:
              Der Blick wandert zur Rechtsabteilung. BITV 2.0, BFSG, EN 301 549 – die Abkürzungen werden aufgezählt,
              Fristen notiert, und am Ende steht die Frage: <em>Was ist das Minimum, das wir tun müssen?</em>
            </p>
            <p className="text-slate-700 mb-4">
              Dieser Reflex ist verständlich. Er ist auch <strong>fatal</strong>.
            </p>
            <p className="text-slate-700 mb-4">
              Denn wer Barrierefreiheit als Compliance-Thema behandelt, bekommt genau das: das Minimum.
              Technisch korrekte PDFs, die niemand gerne liest. Websites, die den automatischen Test bestehen,
              aber echte Nutzer frustrieren. Dokumente mit Alt-Texten, die „Bild" heißen.
            </p>

            <div className="bg-purple-50 rounded-xl p-6 border border-purple-100 not-prose my-6">
              <p className="text-purple-900 font-medium">
                Das eigentliche Problem: Diese Organisationen verpassen die Chance, ihre digitalen Produkte
                grundlegend besser zu machen – <strong>für alle Nutzer</strong>.
              </p>
            </div>
          </section>

          {/* Section 2: Was Barrierefreiheit wirklich ist */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <Heart className="w-6 h-6 text-pink-500" />
              Was Barrierefreiheit wirklich ist: Design für Menschen
            </h2>
            <p className="text-slate-700 mb-4">
              Barrierefreiheit ist keine Sonderanforderung für eine kleine Randgruppe.
              Sie ist die <strong>konsequente Anwendung guter UX-Prinzipien</strong>.
            </p>
            <p className="text-slate-700 mb-6">
              Betrachten wir, was barrierefreies Design konkret bedeutet:
            </p>

            <div className="grid md:grid-cols-2 gap-4 not-prose mb-6">
              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2">Klare Struktur</h4>
                <p className="text-sm text-slate-600">
                  Überschriften-Hierarchien, logische Lesereihenfolge, eindeutige Navigation
                </p>
              </div>
              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2">Verständliche Sprache</h4>
                <p className="text-sm text-slate-600">
                  Kurze Sätze, aktive Formulierungen, Vermeidung von Fachjargon
                </p>
              </div>
              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2">Robuste Technik</h4>
                <p className="text-sm text-slate-600">
                  Inhalte funktionieren unabhängig vom Gerät, Browser oder der Internetverbindung
                </p>
              </div>
              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2">Konsistente Interaktion</h4>
                <p className="text-sm text-slate-600">
                  Vorhersehbare Bedienung, klares Feedback, erkennbare Aktionselemente
                </p>
              </div>
            </div>

            <p className="text-slate-700 mb-4">
              Das sind keine Accessibility-Kriterien. Das sind die <strong>Grundlagen von gutem Design</strong>.
            </p>
            <p className="text-slate-700">
              Der Unterschied zwischen einer „barrierefreien" und einer „gut gestalteten" Website ist oft keiner.
              Organisationen, die verstehen, dass sie nicht <em>für Behinderte</em> designen, sondern <em>für Menschen</em>,
              produzieren automatisch bessere digitale Produkte.
            </p>
          </section>

          {/* Section 3: Die Zahlen */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-6 flex items-center gap-3">
              <Users className="w-6 h-6 text-blue-500" />
              Die Zahlen sprechen eine deutliche Sprache
            </h2>
            <p className="text-slate-700 mb-6">
              Die Vorstellung, Barrierefreiheit betreffe nur eine kleine Minderheit, hält keiner Überprüfung stand.
            </p>

            <div className="space-y-6 not-prose">
              <div className="bg-violet-50 rounded-xl p-6 border border-violet-100">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-violet-100 rounded-xl flex items-center justify-center shrink-0">
                    <Eye className="w-6 h-6 text-violet-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-blue-900 mb-2">Permanente Einschränkungen</h4>
                    <p className="text-violet-800">
                      In Deutschland leben etwa <strong>7,8 Millionen Menschen</strong> mit einer anerkannten Schwerbehinderung.
                      Dazu kommen Millionen mit nicht anerkannten oder leichteren Einschränkungen: Sehschwächen,
                      Hörminderungen, motorische Einschränkungen, kognitive Beeinträchtigungen.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 rounded-xl p-6 border border-amber-100">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                    <Hand className="w-6 h-6 text-amber-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-amber-900 mb-2">Temporäre Einschränkungen</h4>
                    <p className="text-amber-800">
                      Jeder Mensch erlebt Situationen eingeschränkter Fähigkeiten: ein gebrochener Arm, eine Augen-OP,
                      eine Mittelohrentzündung, Erschöpfung nach einer schlaflosen Nacht. In diesen Momenten profitieren
                      auch Menschen ohne dauerhafte Behinderung von barrierefreiem Design.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-green-50 rounded-xl p-6 border border-green-100">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
                    <Sun className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-green-900 mb-2">Situative Einschränkungen</h4>
                    <p className="text-green-800">
                      Die Sonne scheint auf den Bildschirm – plötzlich ist hoher Kontrast keine Accessibility-Funktion mehr,
                      sondern Notwendigkeit. Im lauten Großraumbüro werden Untertitel zum Standardwerkzeug.
                      Mit dem Kinderwagen in einer Hand wird die Einhandbedienung zum Muss.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-slate-700 mt-6">
              Microsoft hat diese Erkenntnis in einem einflussreichen Design-Framework zusammengefasst:
              <strong> Inclusive Design</strong> betrachtet permanente, temporäre und situative Einschränkungen als Kontinuum.
              Wer für einen Arm designt, designt für den Nutzer mit Armamputation genauso wie für die Mutter mit Baby auf dem Arm.
            </p>
          </section>

          {/* Section 4: Der Curb-Cut-Effekt */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <TrendingUp className="w-6 h-6 text-green-500" />
              Der Curb-Cut-Effekt: Wie Barrierefreiheit alle besser macht
            </h2>
            <p className="text-slate-700 mb-4">
              In den 1970er Jahren wurden in den USA die ersten abgesenkten Bordsteinkanten eingeführt –
              ursprünglich für Rollstuhlfahrer. Was dann passierte, war unerwartet: <strong>Plötzlich nutzten alle diese Rampen.</strong>
              Eltern mit Kinderwagen, Reisende mit Rollkoffern, Lieferanten mit Sackkarren, Jogger, Skater.
            </p>
            <p className="text-slate-700 mb-6">
              Eine Lösung für eine kleine Gruppe wurde zum Standard für alle.
            </p>
            <p className="text-slate-700 mb-6">
              Dieses Phänomen – der <strong>Curb-Cut-Effekt</strong> – wiederholt sich in der digitalen Welt ständig:
            </p>

            <div className="overflow-x-auto not-prose mb-6">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="text-left p-4 font-semibold text-slate-900 border-b">Ursprünglich für</th>
                    <th className="text-left p-4 font-semibold text-slate-900 border-b">Heute genutzt von</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="p-4 text-slate-700">
                      <div className="flex items-center gap-2">
                        <Ear className="w-4 h-4 text-purple-500" />
                        Untertitel für Gehörlose
                      </div>
                    </td>
                    <td className="p-4 text-slate-600">Pendler in der U-Bahn, Nicht-Muttersprachler, Nutzer in lauten Umgebungen</td>
                  </tr>
                  <tr className="border-b bg-slate-50">
                    <td className="p-4 text-slate-700">
                      <div className="flex items-center gap-2">
                        <Volume2 className="w-4 h-4 text-blue-500" />
                        Sprachsteuerung für motorisch Eingeschränkte
                      </div>
                    </td>
                    <td className="p-4 text-slate-600">Autofahrer, Köche mit schmutzigen Händen, Smart-Home-Nutzer</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4 text-slate-700">
                      <div className="flex items-center gap-2">
                        <Sun className="w-4 h-4 text-amber-500" />
                        Hoher Kontrast für Sehbehinderte
                      </div>
                    </td>
                    <td className="p-4 text-slate-600">Nutzer bei Sonnenlicht, ältere Menschen, müde Augen</td>
                  </tr>
                  <tr className="border-b bg-slate-50">
                    <td className="p-4 text-slate-700">
                      <div className="flex items-center gap-2">
                        <Brain className="w-4 h-4 text-pink-500" />
                        Einfache Sprache für kognitiv Eingeschränkte
                      </div>
                    </td>
                    <td className="p-4 text-slate-600">Fachfremde Leser, gestresste Nutzer, internationale Zielgruppen</td>
                  </tr>
                  <tr>
                    <td className="p-4 text-slate-700">
                      <div className="flex items-center gap-2">
                        <Hand className="w-4 h-4 text-green-500" />
                        Tastaturnavigation für Blinde
                      </div>
                    </td>
                    <td className="p-4 text-slate-600">Power-User, Entwickler, Menschen mit RSI</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="bg-green-50 rounded-xl p-6 border border-green-100 not-prose">
              <p className="text-green-900 font-medium">
                Jede Investition in Barrierefreiheit ist eine Investition in bessere Usability für die <strong>gesamte Nutzerschaft</strong>.
              </p>
            </div>
          </section>

          {/* Section 5: Was schlechte Barrierefreiheit kostet */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">
              Was schlechte Barrierefreiheit wirklich kostet
            </h2>
            <p className="text-slate-700 mb-6">
              Organisationen, die Barrierefreiheit als Kostenfaktor betrachten, rechnen falsch.
              Sie ignorieren die versteckten Kosten schlechter Zugänglichkeit:
            </p>

            <div className="space-y-6 not-prose">
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-4">Direkte Kosten</h4>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <XCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                    <span className="text-slate-700">
                      <strong>Nachbesserung ist teurer als Prävention:</strong> Ein Accessibility-Problem in der Konzeptionsphase
                      zu beheben, kostet einen Bruchteil der nachträglichen Korrektur im fertigen System
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <XCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                    <span className="text-slate-700">
                      <strong>Rechtliche Risiken:</strong> Mit dem BFSG drohen Abmahnungen und Bußgelder –
                      ein Compliance-Argument mit konkreten Euro-Beträgen
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <XCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                    <span className="text-slate-700">
                      <strong>Parallele Systeme:</strong> Wer „normale" und „barrierefreie" Versionen pflegt,
                      verdoppelt den Wartungsaufwand
                    </span>
                  </li>
                </ul>
              </div>

              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-4">Indirekte Kosten</h4>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <XCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                    <span className="text-slate-700">
                      <strong>Verlorene Nutzer:</strong> Menschen mit Einschränkungen verlassen unzugängliche Websites sofort –
                      und kommen nicht wieder
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <XCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                    <span className="text-slate-700">
                      <strong>Schlechtere Conversion:</strong> Komplizierte Formulare, unklare Navigation und schwer lesbare Texte
                      kosten Conversions bei <em>allen</em> Nutzern
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <XCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                    <span className="text-slate-700">
                      <strong>SEO-Nachteile:</strong> Suchmaschinen bewerten viele Accessibility-Faktoren positiv –
                      semantische Struktur, Alt-Texte, schnelle Ladezeiten
                    </span>
                  </li>
                </ul>
              </div>

              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-4">Reputationskosten</h4>
                <p className="text-slate-700">
                  In einer Zeit, in der Diversity und Inklusion für Arbeitgebermarken und Unternehmensimage zentral sind,
                  sendet eine unzugängliche digitale Präsenz ein eindeutiges Signal:
                  <strong className="text-red-600"> Manche Menschen sind uns egal.</strong>
                </p>
              </div>
            </div>
          </section>

          {/* Section 6: Der Mindset-Shift */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <Lightbulb className="w-6 h-6 text-amber-500" />
              Der Mindset-Shift: Von der Checkliste zur Haltung
            </h2>
            <p className="text-slate-700 mb-6">
              Der entscheidende Unterschied zwischen Organisationen, die Barrierefreiheit richtig machen,
              und solchen, die scheitern, liegt nicht in den Tools oder dem Budget. Er liegt in der <strong>Haltung</strong>.
            </p>

            <div className="grid md:grid-cols-2 gap-6 not-prose mb-6">
              <div className="bg-red-50 rounded-xl p-6 border border-red-200">
                <h4 className="font-semibold text-red-900 mb-3">Das Compliance-Mindset</h4>
                <p className="text-red-800 italic mb-4">„Wir müssen BITV-konform sein."</p>
                <p className="text-red-700 text-sm">
                  <strong>Ergebnis:</strong> Teams arbeiten Checklisten ab, ohne die Gründe zu verstehen.
                  Technische Kriterien werden erfüllt, die Nutzererfahrung bleibt schlecht.
                  Barrierefreiheit wird als abgeschlossenes Projekt betrachtet.
                </p>
              </div>
              <div className="bg-green-50 rounded-xl p-6 border border-green-200">
                <h4 className="font-semibold text-green-900 mb-3">Das UX-Mindset</h4>
                <p className="text-green-800 italic mb-4">„Wir wollen, dass alle Menschen unsere Dienste nutzen können."</p>
                <p className="text-green-700 text-sm">
                  <strong>Ergebnis:</strong> Teams verstehen, dass Barrierefreiheit ein kontinuierlicher Prozess ist.
                  Accessibility wird Teil der Definition of Done. Design-Entscheidungen werden von Anfang an inklusiv getroffen.
                </p>
              </div>
            </div>

            <p className="text-slate-700 mb-4">Der Unterschied zeigt sich in konkreten Fragen:</p>

            <div className="overflow-x-auto not-prose">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="text-left p-4 font-semibold text-red-700 border-b">Compliance-Frage</th>
                    <th className="text-left p-4 font-semibold text-green-700 border-b">UX-Frage</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="p-4 text-slate-600">Haben alle Bilder Alt-Texte?</td>
                    <td className="p-4 text-slate-700 font-medium">Verstehen Nutzer ohne das Bild den Inhalt?</td>
                  </tr>
                  <tr className="border-b bg-slate-50">
                    <td className="p-4 text-slate-600">Ist der Kontrast 4,5:1?</td>
                    <td className="p-4 text-slate-700 font-medium">Ist der Text unter allen Bedingungen lesbar?</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4 text-slate-600">Ist das PDF technisch barrierefrei?</td>
                    <td className="p-4 text-slate-700 font-medium">Macht es Freude, dieses Dokument zu lesen?</td>
                  </tr>
                  <tr>
                    <td className="p-4 text-slate-600">Bestehen wir den automatischen Test?</td>
                    <td className="p-4 text-slate-700 font-medium">Können echte Menschen unsere Website nutzen?</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 7: Fünf konkrete Schritte */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <Target className="w-6 h-6 text-purple-500" />
              Wie der Wandel gelingt: Fünf konkrete Schritte
            </h2>
            <p className="text-slate-700 mb-6">
              Die gute Nachricht: Der Wechsel vom Compliance- zum UX-Mindset ist keine Revolution, sondern eine Evolution.
              Er beginnt mit kleinen, konkreten Veränderungen.
            </p>

            <div className="space-y-6 not-prose">
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center shrink-0 text-purple-700 font-bold">1</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-2">Barrierefreiheit in die Prozesse einbetten</h4>
                  <p className="text-slate-600">
                    Accessibility ist kein Projekt, sondern ein Qualitätsmerkmal – wie Performance oder Sicherheit.
                    Sie gehört in jede Phase: Konzeption, Design, Entwicklung, Testing, Redaktion.
                    Accessibility-Kriterien in User Stories, in Design-Reviews, in QA-Checklisten.
                    Nicht als Sonderpunkt am Ende, sondern als integraler Bestandteil.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center shrink-0 text-purple-700 font-bold">2</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-2">Mit echten Nutzern testen</h4>
                  <p className="text-slate-600">
                    Automatische Tests finden etwa 30 % der Accessibility-Probleme. Die restlichen 70 % erfordern
                    menschliches Urteil. Niemand kann beurteilen, ob eine Website für Screenreader-Nutzer funktioniert,
                    besser als ein Screenreader-Nutzer. Organisationen, die regelmäßig mit Menschen mit Behinderungen
                    testen, lernen mehr über gutes Design als durch jede Schulung.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center shrink-0 text-purple-700 font-bold">3</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-2">Wissen im Team aufbauen</h4>
                  <p className="text-slate-600">
                    Barrierefreiheit ist kein Spezialistenthema für einen einzelnen Accessibility-Beauftragten.
                    Sie ist Grundwissen für alle, die digitale Produkte gestalten. Designer sollten Farbkontraste verstehen,
                    Entwickler semantisches HTML, Redakteure die Prinzipien verständlicher Sprache.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center shrink-0 text-purple-700 font-bold">4</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-2">Die richtigen Tools einsetzen</h4>
                  <p className="text-slate-600">
                    Gute Werkzeuge senken die Hürde. Wenn barrierefreie PDFs mit einem Klick entstehen statt mit
                    stundenlanger Nacharbeit, wird Accessibility vom Hindernis zur Selbstverständlichkeit.
                    Browser-basierte Lösungen, die keine Installation erfordern und datenschutzkonform arbeiten,
                    haben klare Vorteile – besonders in Behörden mit strengen IT-Richtlinien.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center shrink-0 text-purple-700 font-bold">5</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-2">Erfolge sichtbar machen</h4>
                  <p className="text-slate-600">
                    Barrierefreiheit wird oft als unsichtbare Arbeit wahrgenommen – man merkt es erst, wenn sie fehlt.
                    Organisationen, die den Wandel schaffen, machen Erfolge sichtbar: Nutzerfeedback teilen,
                    Metriken tracken, Verbesserungen feiern.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Section 8: Der eigentliche Gewinn */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <Layers className="w-6 h-6 text-green-500" />
              Der eigentliche Gewinn: Bessere Produkte für alle
            </h2>
            <p className="text-slate-700 mb-6">
              Wer Barrierefreiheit als UX-Thema begreift, gewinnt mehr als Compliance:
            </p>

            <div className="grid md:grid-cols-2 gap-4 not-prose">
              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <h4 className="font-semibold text-slate-900">Zufriedenere Nutzer</h4>
                </div>
                <p className="text-sm text-slate-600">
                  Klare Strukturen, verständliche Sprache und robuste Technik machen das Leben aller Nutzer einfacher
                </p>
              </div>
              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <h4 className="font-semibold text-slate-900">Effizientere Prozesse</h4>
                </div>
                <p className="text-sm text-slate-600">
                  Einmal richtig gemacht, spart barrierefreies Design Zeit bei jeder Iteration
                </p>
              </div>
              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <h4 className="font-semibold text-slate-900">Bessere SEO</h4>
                </div>
                <p className="text-sm text-slate-600">
                  Viele Accessibility-Faktoren sind gleichzeitig Ranking-Faktoren
                </p>
              </div>
              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <h4 className="font-semibold text-slate-900">Stärkere Marke</h4>
                </div>
                <p className="text-sm text-slate-600">
                  Inklusion als gelebter Wert statt als Marketing-Buzzword
                </p>
              </div>
              <div className="bg-white rounded-xl p-5 border border-slate-200 md:col-span-2">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <h4 className="font-semibold text-slate-900">Zukunftssicherheit</h4>
                </div>
                <p className="text-sm text-slate-600">
                  Die regulatorischen Anforderungen werden steigen – wer jetzt investiert, ist vorbereitet
                </p>
              </div>
            </div>
          </section>

          {/* Fazit */}
          <section className="mb-12">
            <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-2xl p-8 border border-purple-100 not-prose">
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">
                Fazit: Die Frage ist nicht ob, sondern wie
              </h2>
              <p className="text-slate-700 mb-4">
                Die Diskussion, ob digitale Barrierefreiheit wichtig ist, ist vorbei. Die gesetzlichen Anforderungen
                sind eindeutig, die gesellschaftliche Erwartung wächst, die wirtschaftlichen Argumente sind überzeugend.
              </p>
              <p className="text-slate-700 mb-4">
                Die relevante Frage lautet: <strong>Behandeln wir Barrierefreiheit als lästige Pflicht oder als Chance
                für bessere Produkte?</strong>
              </p>
              <p className="text-slate-700 mb-4">
                Organisationen, die den Compliance-Reflex überwinden und Barrierefreiheit als das begreifen, was sie ist –
                konsequent gutes Design für alle Menschen –, werden nicht nur die gesetzlichen Anforderungen erfüllen.
                Sie werden <strong>bessere digitale Produkte</strong> bauen.
              </p>
              <p className="text-slate-900 font-semibold text-lg">
                Und das ist kein Compliance-Thema. Das ist einfach gutes UX.
              </p>
            </div>
          </section>

          {/* Ressourcen */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <BookOpen className="w-6 h-6 text-blue-500" />
              Weiterführende Ressourcen
            </h2>
            <div className="space-y-3 not-prose">
              <a href="https://www.w3.org/TR/WCAG22/" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 hover:border-purple-300 transition-colors">
                <ExternalLink className="w-5 h-5 text-purple-500" />
                <div>
                  <p className="font-medium text-slate-900">Web Content Accessibility Guidelines (WCAG) 2.2</p>
                  <p className="text-sm text-slate-600">Der internationale Standard</p>
                </div>
              </a>
              <a href="https://www.gesetze-im-internet.de/bitv_2_0/" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 hover:border-purple-300 transition-colors">
                <ExternalLink className="w-5 h-5 text-purple-500" />
                <div>
                  <p className="font-medium text-slate-900">BITV 2.0</p>
                  <p className="text-sm text-slate-600">Die deutsche Verordnung für Bundesbehörden</p>
                </div>
              </a>
              <Link href="/blog/bfsg-2025-leitfaden"
                className="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 hover:border-purple-300 transition-colors">
                <ArrowRight className="w-5 h-5 text-purple-500" />
                <div>
                  <p className="font-medium text-slate-900">Barrierefreiheitsstärkungsgesetz (BFSG)</p>
                  <p className="text-sm text-slate-600">Unser vollständiger Leitfaden zu den neuen Pflichten</p>
                </div>
              </Link>
              <a href="https://inclusive.microsoft.design/" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 hover:border-purple-300 transition-colors">
                <ExternalLink className="w-5 h-5 text-purple-500" />
                <div>
                  <p className="font-medium text-slate-900">Microsoft Inclusive Design</p>
                  <p className="text-sm text-slate-600">Framework für inklusives Design</p>
                </div>
              </a>
            </div>
          </section>

        </article>

        {/* CTA Section */}
        <div className="bg-gradient-to-br from-violet-600 to-purple-700 rounded-2xl p-8 md:p-10 text-center text-white">
          <h2 className="text-2xl md:text-3xl font-semibold mb-4">
            Barrierefreiheit in Ihren<br />Workflow integrieren
          </h2>
          <p className="text-white/80 mb-8 max-w-xl mx-auto">
            Unsere Browser-basierten Tools machen barrierefreie Dokumente so einfach wie möglich –
            DSGVO-konform und ohne Installation.
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

        {/* Author */}
        <div className="mt-12 pt-8 border-t border-slate-200">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-violet-600 to-purple-700 rounded-full flex items-center justify-center">
              <span className="text-white font-semibold">DW</span>
            </div>
            <div>
              <p className="font-medium text-slate-900">David Wegener</p>
              <p className="text-sm text-slate-600">Gründer von VoxDrop</p>
            </div>
          </div>
        </div>
      </main>

    </PageLayout>
  );
}
