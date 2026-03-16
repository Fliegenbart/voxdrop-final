import { Button } from "@/components/ui/button";
import { PageLayout } from "@/components/PageLayout";
import { SEO, ArticleSchema } from "@/components/SEO";
import { getBlogPost, formatDate } from "@/lib/blog-posts";
import {
  Scale, Building2, FileText, ArrowRight, CheckCircle2,
  Calendar, Clock, ArrowLeft, Monitor, Users, ShieldCheck,
  BookOpen, ClipboardList, Server, Landmark, Settings2
} from "lucide-react";
import { Link } from "wouter";

export default function BfsgKommunenLeitfaden() {
  const post = getBlogPost("bfsg-kommunen-leitfaden");

  return (
    <PageLayout>
      <SEO
        title="BFSG 2025: Was Kommunen jetzt wissen müssen"
        description="Das Barrierefreiheitstaerkungsgesetz betrifft auch Kommunen. Selbstbedienungsterminals, Bürgerkioske und digitale Beschaffung - der vollständige Leitfaden für IT-Leiter und Digitalisierungsbeauftragte."
        canonical="/blog/bfsg-kommunen-leitfaden"
        ogType="article"
      />
      <ArticleSchema
        title="BFSG 2025: Was Kommunen jetzt wissen müssen"
        description="Das Barrierefreiheitstaerkungsgesetz ist seit Juni 2025 in Kraft. Ein Leitfaden für IT-Leiter, Digitalisierungsbeauftragte und Verwaltungsvorstaende."
        url="/blog/bfsg-kommunen-leitfaden"
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
              Recht & Compliance
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
            BFSG 2025: Was Kommunen jetzt wissen müssen
          </h1>
          <p className="text-xl text-slate-600 font-light">
            Ein Leitfaden für IT-Leiter, Digitalisierungsbeauftragte und Verwaltungsvorstaende.
            Das Barrierefreiheitstaerkungsgesetz betrifft auch den öffentlichen Sektor.
          </p>
        </div>
      </header>

      <main id="main-content" className="max-w-3xl mx-auto px-6 pb-24" tabIndex={-1}>

        {/* Info Banner */}
        <div className="bg-violet-50 border border-violet-200 rounded-2xl p-6 mb-12">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-violet-100 rounded-xl flex items-center justify-center shrink-0">
              <Landmark className="w-6 h-6 text-violet-600" />
            </div>
            <div>
              <h2 className="font-semibold text-blue-900 mb-1">Für Kommunen besonders relevant</h2>
              <p className="text-violet-700">
                Während viele Kommunen das BFSG zunächst als "Privatwirtschafts-Thema" abgetan haben,
                zeigt sich nun: Die Auswirkungen auf den öffentlichen Sektor sind erheblich -
                von Bürgerterminals bis zur IT-Beschaffung.
              </p>
            </div>
          </div>
        </div>

        {/* Table of Contents */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-12">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-purple-600" />
            Inhalt dieses Artikels
          </h2>
          <nav className="space-y-2 text-sm">
            <a href="#was-ist-bfsg" className="block text-purple-600 hover:text-purple-800">1. Was ist das BFSG - und warum jetzt?</a>
            <a href="#bfsg-vs-bitv" className="block text-purple-600 hover:text-purple-800">2. BFSG vs. BITV 2.0: Was ist der Unterschied?</a>
            <a href="#auswirkungen-kommunen" className="block text-purple-600 hover:text-purple-800">3. Konkrete Auswirkungen auf Kommunen</a>
            <a href="#technische-anforderungen" className="block text-purple-600 hover:text-purple-800">4. Technische Anforderungen im Detail</a>
            <a href="#handlungsempfehlungen" className="block text-purple-600 hover:text-purple-800">5. Handlungsempfehlungen: Was Kommunen jetzt tun sollten</a>
            <a href="#digitale-assistenz" className="block text-purple-600 hover:text-purple-800">6. Die Rolle digitaler Assistenzloesungen</a>
            <a href="#fazit" className="block text-purple-600 hover:text-purple-800">7. Fazit: Compliance als Chance</a>
          </nav>
        </div>

        {/* Content Sections */}
        <article className="prose prose-gray max-w-none">

          {/* Section 1 */}
          <section id="was-ist-bfsg" className="mb-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <Scale className="w-6 h-6 text-purple-600" />
              Was ist das BFSG - und warum jetzt?
            </h2>
            <p className="text-slate-700 mb-4">
              Der 28. Juni 2025 markiert einen Wendepunkt für die digitale Barrierefreiheit in Deutschland.
              An diesem Tag trat das Barrierefreiheitstaerkungsgesetz (BFSG) in Kraft - und mit ihm
              eine Reihe neuer Anforderungen, die weit über die bisherige BITV 2.0 hinausgehen.
            </p>
            <p className="text-slate-700 mb-4">
              Das BFSG setzt die EU-Richtlinie 2019/882 (European Accessibility Act) in deutsches Recht um.
              Das erklärte Ziel: Menschen mit Behinderungen, Einschränkungen und aeltere Menschen sollen
              gleichberechtigt an der digitalen Gesellschaft teilhaben können.
            </p>

            <div className="bg-slate-50 rounded-xl p-6 border border-slate-200 not-prose mb-6">
              <h3 className="font-semibold text-slate-900 mb-4">Die wichtigsten Eckdaten</h3>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                  <span><strong>Inkrafttreten:</strong> 28. Juni 2025</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                  <span><strong>Rechtsgrundlage:</strong> EU-Richtlinie 2019/882</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                  <span><strong>Überwachung:</strong> Marktueberwachungsbehörden der Laender</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                  <span><strong>Sanktionen:</strong> Bussgelder bis zu 100.000 Euro</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                  <span><strong>Übergangsfrist Terminals:</strong> Bestandsschutz bis max. 2040</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                  <span><strong>Betroffene:</strong> Hersteller, Importeure, Haendler, Dienstleister</span>
                </div>
              </div>
            </div>

            <div className="bg-violet-50 rounded-xl p-5 border border-violet-100 not-prose">
              <p className="text-violet-800">
                <strong>Wichtig:</strong> Während das Behindertengleichstellungsgesetz (BGG) und die BITV 2.0
                primaer öffentliche Stellen adressieren, nimmt das BFSG erstmals auch private Unternehmen in die Pflicht.
                Doch diese Erweiterung hat Rueckwirkungen auf den öffentlichen Sektor - denn Kommunen sind an vielen
                Stellen Schnittstelle zwischen Bürgern und privaten Dienstleistern.
              </p>
            </div>
          </section>

          {/* Section 2 */}
          <section id="bfsg-vs-bitv" className="mb-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold text-slate-900 mb-6 flex items-center gap-3">
              <FileText className="w-6 h-6 text-purple-600" />
              BFSG vs. BITV 2.0: Was ist der Unterschied?
            </h2>

            <p className="text-slate-700 mb-6">
              Diese Frage hoeren wir in Beratungsgespraechen am häufigsten. Die kurze Antwort:
              Das BFSG ersetzt die BITV 2.0 nicht, sondern ergaenzt sie.
            </p>

            <div className="grid md:grid-cols-2 gap-6 not-prose mb-6">
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-violet-600" />
                  BITV 2.0 - Der bekannte Standard
                </h3>
                <ul className="space-y-2 text-sm text-slate-700">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Barrierefreie Websites und Apps
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Erklärung zur Barrierefreiheit
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Feedback-Mechanismus für Nutzer
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Inhalte in Leichter Sprache
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Inhalte in Deutscher Gebaerdensprache
                  </li>
                </ul>
              </div>

              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Scale className="w-5 h-5 text-purple-600" />
                  BFSG - Die Erweiterung
                </h3>
                <ul className="space-y-2 text-sm text-slate-700">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Selbstbedienungsterminals
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Computer, Tablets, Smartphones
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    E-Book-Reader und E-Books
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Telekommunikationsdienste
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Personenbefoerderungsdienste
                  </li>
                </ul>
              </div>
            </div>

            <div className="bg-amber-50 rounded-xl p-5 border border-amber-100 not-prose">
              <p className="text-amber-800">
                <strong>Die Schnittmenge für Kommunen:</strong> Das BFSG wird ueberall dort relevant,
                wo digitale Bürgerservices über physische Geraete angeboten werden - sei es über
                Bürgerterminals im Rathaus, Kiosk-Systeme in Bibliotheken oder digitale Anzeigetafeln
                im öffentlichen Raum. Aber auch die Beschaffung von IT-Ausstattung faellt in den Anwendungsbereich.
              </p>
            </div>
          </section>

          {/* Section 3 */}
          <section id="auswirkungen-kommunen" className="mb-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold text-slate-900 mb-6 flex items-center gap-3">
              <Building2 className="w-6 h-6 text-purple-600" />
              Konkrete Auswirkungen auf Kommunen
            </h2>

            <p className="text-slate-700 mb-6">
              Auch wenn das BFSG primaer auf die Privatwirtschaft zielt, ergeben sich für Kommunen
              direkte und indirekte Pflichten. Diese lassen sich in vier Bereiche gliedern.
            </p>

            <div className="space-y-6 not-prose">
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Monitor className="w-5 h-5 text-violet-600" />
                  1. Selbstbedienungsterminals und Bürgerkioske
                </h4>
                <p className="text-slate-600 mb-4">
                  Viele Kommunen setzen mittlerweile Selbstbedienungsterminals ein - etwa für die
                  Beantragung von Ausweisdokumenten, die Erfassung biometrischer Daten oder als
                  Informationspunkte in Rathaeusern und Bürgeraemtern.
                </p>
                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="text-sm text-slate-700 font-medium mb-2">Das BFSG fordert für Terminals:</p>
                  <ul className="space-y-1 text-sm text-slate-600">
                    <li>• Zwei-Sinne-Prinzip: visuell UND auditiv</li>
                    <li>• Sprachausgabe mit Kopfhoerer-Anschluss</li>
                    <li>• Grosse, kontrastreiche Bedienelemente (Kontrast 4,5:1)</li>
                    <li>• Vergrößerbare Texte (mindestens 200%)</li>
                    <li>• Alternative Eingabemöglichkeiten zum Touchscreen</li>
                  </ul>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Server className="w-5 h-5 text-green-600" />
                  2. Digitale Informationssysteme im öffentlichen Raum
                </h4>
                <p className="text-slate-600">
                  Interaktive Displays im Rathaus, digitale Wegeleitsysteme, Touchscreens in Bibliotheken,
                  Museen oder Schwimmbaeder, elektronische Anzeigetafeln an Bushaltestellen - all diese Systeme
                  fallen unter das BFSG, wenn sie nach dem Stichtag in Betrieb genommen werden.
                </p>
              </div>

              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-purple-600" />
                  3. Beschaffung und Vergabe
                </h4>
                <p className="text-slate-600 mb-4">
                  Wer nach dem 28. Juni 2025 Selbstbedienungsterminals, Informationssysteme oder
                  Computer für Bürgerarbeitsplaetze beschafft, muss sicherstellen, dass diese
                  die Barrierefreiheitsanforderungen erfüllen.
                </p>
                <div className="bg-violet-50 rounded-lg p-4">
                  <p className="text-sm text-violet-800">
                    <strong>Muster für Ausschreibungen:</strong> "Das angebotene Produkt muss die
                    Anforderungen des Barrierefreiheitstaerkungsgesetzes (BFSG) sowie der Norm EN 301 549
                    in der jeweils geltenden Fassung erfüllen."
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Users className="w-5 h-5 text-orange-600" />
                  4. Dienstleister und Auftragnehmer
                </h4>
                <p className="text-slate-600">
                  Auch Dienstleister, die im Auftrag der Kommune arbeiten, sind in der Pflicht.
                  Dies betrifft IT-Dienstleister, Software-Anbieter und Agenturen, die digitale
                  Services betreuen. Überprüfen Sie bestehende Vertraege auf Barrierefreiheitsklauseln.
                </p>
              </div>
            </div>
          </section>

          {/* Section 4 */}
          <section id="technische-anforderungen" className="mb-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold text-slate-900 mb-6 flex items-center gap-3">
              <Settings2 className="w-6 h-6 text-purple-600" />
              Technische Anforderungen im Detail
            </h2>

            <p className="text-slate-700 mb-6">
              Das BFSG verweist für die technischen Anforderungen auf die Barrierefreiheitsanforderungsverordnung
              (BFSGV) sowie die europaeische Norm EN 301 549. Für Kommunen, die bereits BITV-konform arbeiten,
              sind viele Anforderungen bekannt.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mb-4">Anforderungen an Terminals</h3>

            <div className="grid md:grid-cols-3 gap-4 not-prose mb-6">
              <div className="bg-violet-50 rounded-xl p-5 border border-violet-100">
                <h4 className="font-semibold text-blue-900 mb-2">Visuelle Gestaltung</h4>
                <ul className="text-sm text-violet-800 space-y-1">
                  <li>• Mindestkontrast 4,5:1</li>
                  <li>• Schriftgröße mind. 16pt</li>
                  <li>• Skalierbar bis 200%</li>
                  <li>• Keine zeitbegrenzten Inhalte</li>
                </ul>
              </div>
              <div className="bg-purple-50 rounded-xl p-5 border border-purple-100">
                <h4 className="font-semibold text-purple-900 mb-2">Auditive Ausgabe</h4>
                <ul className="text-sm text-purple-800 space-y-1">
                  <li>• Sprachausgabe für alle Funktionen</li>
                  <li>• Kopfhoereranschluss (3,5mm)</li>
                  <li>• Lautstärke einstellbar (20 dB)</li>
                  <li>• Wiederholung von Ansagen</li>
                </ul>
              </div>
              <div className="bg-green-50 rounded-xl p-5 border border-green-100">
                <h4 className="font-semibold text-green-900 mb-2">Motorische Bedienung</h4>
                <ul className="text-sm text-green-800 space-y-1">
                  <li>• Einhand-Bedienung möglich</li>
                  <li>• Alternative zum Touchscreen</li>
                  <li>• Ausreichend Zeit (20+ Sek.)</li>
                  <li>• Erreichbare Hoehe (85-120 cm)</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 5 */}
          <section id="handlungsempfehlungen" className="mb-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold text-slate-900 mb-6 flex items-center gap-3">
              <ClipboardList className="w-6 h-6 text-purple-600" />
              Handlungsempfehlungen: Was Kommunen jetzt tun sollten
            </h2>

            <div className="space-y-6 not-prose">
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center shrink-0 text-purple-700 font-bold">1</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-1">Phase 1: Bestandsaufnahme (2-4 Wochen)</h4>
                  <p className="text-slate-600 text-sm">
                    Vollstaendige Erfassung aller betroffenen Systeme: Welche Terminals sind im Einsatz?
                    Wann wurden sie in Betrieb genommen? Welche Beschaffungen sind geplant?
                    Dokumentieren Sie Standort, Hersteller, Modell und Barrierefreiheits-Status.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center shrink-0 text-purple-700 font-bold">2</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-1">Phase 2: Gap-Analyse (4-6 Wochen)</h4>
                  <p className="text-slate-600 text-sm">
                    Vergleichen Sie den Ist-Zustand mit den BFSG-Anforderungen. Kann das Terminal ohne
                    Sehen bedient werden? Ohne Hoeren? Mit eingeschraenkter Motorik? Dokumentieren Sie
                    alle Abweichungen und priorisieren Sie nach Risiko und Aufwand.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center shrink-0 text-purple-700 font-bold">3</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-1">Phase 3: Massnahmenplanung (2-4 Wochen)</h4>
                  <p className="text-slate-600 text-sm">
                    Entwickeln Sie einen konkreten Massnahmenplan mit Sofortmassnahmen (Stopp nicht-konformer
                    Beschaffungen), kurzfristigen Massnahmen (Software-Updates, Nachruestungen) und
                    mittelfristigen Massnahmen (Austausch von Altsystemen).
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center shrink-0 text-purple-700 font-bold">4</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-1">Phase 4: Umsetzung und Dokumentation</h4>
                  <p className="text-slate-600 text-sm">
                    Setzen Sie die Massnahmen um und dokumentieren Sie jeden Schritt sorgfaeltig.
                    Die Dokumentation ist essenziell für den Nachweis gegenüber Aufsichtsbehörden
                    und zur Sicherung des Bestandsschutzes für Altsysteme.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center shrink-0 text-purple-700 font-bold">5</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-1">Phase 5: Kontinuierliche Verbesserung</h4>
                  <p className="text-slate-600 text-sm">
                    Barrierefreiheit ist kein Projekt mit Enddatum. Etablieren Sie quartalsweise Prüfungen,
                    Barrierefreiheits-Checks bei jeder Beschaffung, jährliche Management-Reviews
                    und Schulungen für neue Mitarbeiter.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Section 6 */}
          <section id="digitale-assistenz" className="mb-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold text-slate-900 mb-6 flex items-center gap-3">
              <ShieldCheck className="w-6 h-6 text-purple-600" />
              Die Rolle digitaler Assistenzloesungen
            </h2>

            <p className="text-slate-700 mb-6">
              Neben der Hardware-Barrierefreiheit spielt auch die inhaltliche Zugaenglichkeit eine zentrale Rolle.
              Moderne Accessibility-Lösungen können Kommunen wirksam unterstuetzen.
            </p>

            <div className="space-y-4 not-prose">
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2">Text-to-Speech für Websites und Dokumente</h4>
                <p className="text-slate-600">
                  Eine integrierte Vorlesefunktion macht Webinhalte und PDF-Dokumente auch für Menschen
                  zugänglich, die keinen eigenen Screenreader nutzen - sei es aufgrund von Sehbehinderung,
                  Leseschwaeche, Dyslexie oder situativen Einschränkungen.
                </p>
              </div>
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2">Leichte Sprache für komplexe Inhalte</h4>
                <p className="text-slate-600">
                  Die BITV 2.0 fordert bereits Inhalte in Leichter Sprache. Mit KI-basierten Lösungen
                  lassen sich komplexe Verwaltungstexte automatisch uebersetzen - deutlich schneller
                  und kostengünstiger als die manuelle Übersetzung.
                </p>
              </div>
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2">Barrierefreie PDF-Dokumente</h4>
                <p className="text-slate-600">
                  Viele Kommunen kaempfen mit dem Altlast-Problem: Tausende PDF-Dokumente aus Jahren
                  der Verwaltungsarbeit, die nicht barrierefrei sind. Moderne Tools können diese
                  automatisch in zugängliche Formate umwandeln.
                </p>
              </div>
            </div>
          </section>

          {/* Section 7 */}
          <section id="fazit" className="mb-12 scroll-mt-20">
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-8 border border-green-100 not-prose">
              <h3 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
                Fazit: Compliance als Chance begreifen
              </h3>
              <p className="text-slate-700 mb-4">
                Das BFSG mag zunächst als weitere Regulierungslast erscheinen. Doch wer die Anforderungen
                als Chance begreift, profitiert mehrfach:
              </p>
              <ul className="space-y-2 text-slate-700 mb-4">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-1 shrink-0" />
                  <span><strong>Rechtssicherheit:</strong> Keine Bussgelder, keine Abmahnungen</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-1 shrink-0" />
                  <span><strong>Bürgerzufriedenheit:</strong> Weniger Frustration, weniger Beschwerden</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-1 shrink-0" />
                  <span><strong>Zukunftssicherheit:</strong> Heute investieren, morgen nicht nachruesteb</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-1 shrink-0" />
                  <span><strong>Imagegewinn:</strong> Moderne, buergernahe Verwaltung</span>
                </li>
              </ul>
              <p className="text-slate-700 font-medium">
                Die demografische Entwicklung macht Barrierefreiheit ohnehin zum Gebot der Stunde.
                Wer heute handelt, ist morgen vorbereitet.
              </p>
            </div>
          </section>

        </article>

        {/* CTA Section */}
        <div className="bg-gradient-to-br from-violet-600 to-purple-700 rounded-2xl p-8 md:p-10 text-center text-white">
          <h2 className="text-2xl md:text-3xl font-semibold mb-4">
            Machen Sie Ihre Kommune<br />BFSG-konform
          </h2>
          <p className="text-white/80 mb-8 max-w-xl mx-auto">
            Unsere browserbasierten Tools arbeiten DSGVO-konform ohne Datenuebertragung an externe Server
            und unterstuetzen Sie bei der barrierefreien Umsetzung.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/">
              <Button className="h-12 px-8 rounded-xl bg-white text-violet-600 hover:bg-slate-100 font-semibold">
                Kostenlos starten
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <Link href="/tools/pptx-to-pdf-smart">
              <Button variant="outline" className="h-12 px-8 rounded-xl border-white/30 text-white hover:bg-white/10">
                PDF/UA-Tool testen
              </Button>
            </Link>
          </div>
        </div>
      </main>

    </PageLayout>
  );
}
