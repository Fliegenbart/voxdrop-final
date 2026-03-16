import { Button } from "@/components/ui/button";
import { PageLayout } from "@/components/PageLayout";
import { SEO, ArticleSchema } from "@/components/SEO";
import { getBlogPost, formatDate } from "@/lib/blog-posts";
import {
  Scale, AlertTriangle, FileText, ArrowRight, CheckCircle2,
  Calendar, Clock, ArrowLeft, Users, ShieldAlert,
  Monitor, Smartphone, CreditCard, BookOpen, ClipboardList, HelpCircle
} from "lucide-react";
import { Link } from "wouter";

export default function BfsgLeitfaden() {
  const post = getBlogPost("bfsg-2025-leitfaden");

  return (
    <PageLayout>
      <SEO
        title="BFSG 2025: Leitfaden zum Barrierefreiheitsstärkungsgesetz"
        description="Das Barrierefreiheitsstärkungsgesetz ist seit Juni 2025 in Kraft. Wer nicht handelt, riskiert Bußgelder bis 100.000 Euro. Vollständiger Leitfaden zu Pflichten und Umsetzung."
        canonical="/blog/bfsg-2025-leitfaden"
        ogType="article"
      />
      <ArticleSchema
        title="BFSG 2025: Was Unternehmen jetzt wissen müssen"
        description="Das Barrierefreiheitsstärkungsgesetz ist seit Juni 2025 in Kraft. Vollständiger Leitfaden zu Pflichten, Fristen und Umsetzung."
        url="/blog/bfsg-2025-leitfaden"
        datePublished={post?.date || "2026-01-17"}
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
            <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
              Recht & Compliance
            </span>
            <div className="flex items-center gap-4 text-sm text-slate-600">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {post ? formatDate(post.date) : "17. Januar 2026"}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                12 min Lesezeit
              </span>
            </div>
          </div>

          <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight mb-4">
            BFSG 2025: Was Unternehmen und Behörden jetzt wissen müssen
          </h1>
          <p className="text-xl text-slate-600 font-light">
            Das Barrierefreiheitsstärkungsgesetz ist seit dem 28. Juni 2025 in Kraft.
            Wer nicht handelt, riskiert Bußgelder bis zu 100.000 Euro, Abmahnungen und Verkaufsverbote.
          </p>
        </div>
      </header>

      <main id="main-content" className="max-w-3xl mx-auto px-6 pb-24" tabIndex={-1}>

        {/* Warning Banner */}
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 mb-12">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h2 className="font-semibold text-red-900 mb-1">Achtung: Das BFSG gilt bereits!</h2>
              <p className="text-red-700">
                Seit dem 28. Juni 2025 müssen Websites und Online-Shops barrierefrei sein.
                Anders als bei der DSGVO ist nicht zu erwarten, dass Behörden zunächst nur Verwarnungen aussprechen.
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
            <a href="#was-ist-bfsg" className="block text-purple-600 hover:text-purple-800">1. Was ist das BFSG?</a>
            <a href="#betroffene-produkte" className="block text-purple-600 hover:text-purple-800">2. Welche Produkte und Dienstleistungen sind betroffen?</a>
            <a href="#wer-betroffen" className="block text-purple-600 hover:text-purple-800">3. Wer ist vom BFSG betroffen?</a>
            <a href="#technische-anforderungen" className="block text-purple-600 hover:text-purple-800">4. Welche technischen Anforderungen gelten?</a>
            <a href="#pflichten" className="block text-purple-600 hover:text-purple-800">5. Welche Pflichten haben Unternehmen?</a>
            <a href="#sanktionen" className="block text-purple-600 hover:text-purple-800">6. Welche Sanktionen drohen?</a>
            <a href="#fristen" className="block text-purple-600 hover:text-purple-800">7. Übergangsfristen</a>
            <a href="#umsetzung" className="block text-purple-600 hover:text-purple-800">8. Praktische Schritte zur Umsetzung</a>
            <a href="#faq" className="block text-purple-600 hover:text-purple-800">9. Häufig gestellte Fragen</a>
          </nav>
        </div>

        {/* Content Sections */}
        <article className="prose prose-gray max-w-none">

          {/* Section 1 */}
          <section id="was-ist-bfsg" className="mb-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <Scale className="w-6 h-6 text-purple-600" />
              Was ist das BFSG?
            </h2>
            <p className="text-slate-700 mb-4">
              Das Barrierefreiheitsstärkungsgesetz setzt den <strong>European Accessibility Act (EAA)</strong> in deutsches Recht um.
              Es verpflichtet erstmals auch private Unternehmen dazu, bestimmte Produkte und Dienstleistungen barrierefrei anzubieten.
            </p>
            <p className="text-slate-700 mb-4">
              Ziel ist die gleichberechtigte Teilhabe von Menschen mit Behinderungen, älteren Personen und Menschen mit
              vorübergehenden Einschränkungen am digitalen Leben.
            </p>
            <div className="bg-violet-50 rounded-xl p-5 border border-violet-100 not-prose">
              <p className="text-violet-800">
                <strong>Wichtiger Unterschied:</strong> Während öffentliche Stellen bereits seit Jahren durch die BITV 2.0
                zu barrierefreien Webauftritten verpflichtet sind, erfasst das BFSG nun auch <strong>Online-Shops, Apps,
                Bankdienstleistungen</strong> und viele weitere digitale Angebote der Privatwirtschaft.
              </p>
            </div>
          </section>

          {/* Section 2 */}
          <section id="betroffene-produkte" className="mb-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold text-slate-900 mb-6 flex items-center gap-3">
              <Monitor className="w-6 h-6 text-purple-600" />
              Welche Produkte und Dienstleistungen sind betroffen?
            </h2>

            <div className="grid md:grid-cols-2 gap-6 not-prose mb-6">
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-violet-600" />
                  Betroffene Produkte
                </h3>
                <ul className="space-y-2 text-sm text-slate-700">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Computer, Laptops, Tablets
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Smartphones und Mobiltelefone
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Selbstbedienungsterminals (Geldautomaten, Fahrkartenautomaten)
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    E-Book-Reader
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Router und Modems
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Smart-TVs mit Internetzugang
                  </li>
                </ul>
              </div>

              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-purple-600" />
                  Betroffene Dienstleistungen
                </h3>
                <ul className="space-y-2 text-sm text-slate-700">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    E-Commerce / Online-Shops
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Bankdienstleistungen für Verbraucher
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    E-Books und deren Software
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Telekommunikation & Messenger
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Personenbeförderung (Websites, Apps, Tickets)
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Online-Terminbuchungssysteme
                  </li>
                </ul>
              </div>
            </div>

            <div className="bg-amber-50 rounded-xl p-5 border border-amber-100 not-prose">
              <p className="text-amber-800">
                <strong>Wichtig:</strong> Die Barrierefreiheitspflicht gilt für <strong>B2C-Angebote</strong>.
                Reine B2B-Anwendungen sind ausgenommen, ebenso wie Produkte und Dienstleistungen,
                die vor dem 28. Juni 2025 in Verkehr gebracht wurden.
              </p>
            </div>
          </section>

          {/* Section 3 */}
          <section id="wer-betroffen" className="mb-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold text-slate-900 mb-6 flex items-center gap-3">
              <Users className="w-6 h-6 text-purple-600" />
              Wer ist vom BFSG betroffen?
            </h2>

            <p className="text-slate-700 mb-6">
              Das Gesetz erfasst verschiedene Wirtschaftsakteure mit unterschiedlichen Pflichten:
            </p>

            <div className="space-y-4 not-prose mb-6">
              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2">Hersteller</h4>
                <p className="text-sm text-slate-600">
                  Müssen sicherstellen, dass ihre Produkte die Barrierefreiheitsanforderungen erfüllen
                  und ein Konformitätsbewertungsverfahren durchlaufen.
                </p>
              </div>
              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2">Importeure und Händler</h4>
                <p className="text-sm text-slate-600">
                  Dürfen nur konforme Produkte in Verkehr bringen.
                </p>
              </div>
              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2">Dienstleistungserbringer</h4>
                <p className="text-sm text-slate-600">
                  Müssen ihre digitalen Angebote barrierefrei gestalten und eine Barrierefreiheitserklärung bereitstellen.
                </p>
              </div>
            </div>

            <div className="bg-green-50 rounded-xl p-6 border border-green-100 not-prose">
              <h4 className="font-semibold text-green-900 mb-2">Ausnahme für Kleinstunternehmen</h4>
              <p className="text-green-800 mb-3">
                Kleinstunternehmen, die <strong>Dienstleistungen</strong> erbringen, sind von den Anforderungen ausgenommen:
              </p>
              <ul className="space-y-1 text-sm text-green-700">
                <li>• Weniger als 10 Mitarbeiter</li>
                <li>• Jahresumsatz oder Bilanzsumme von höchstens 2 Millionen Euro</li>
              </ul>
              <p className="text-green-800 mt-3 text-sm">
                <strong>Achtung:</strong> Diese Ausnahme gilt nur für Dienstleistungen, nicht für Produkte!
              </p>
            </div>
          </section>

          {/* Section 4 */}
          <section id="technische-anforderungen" className="mb-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold text-slate-900 mb-6 flex items-center gap-3">
              <FileText className="w-6 h-6 text-purple-600" />
              Welche technischen Anforderungen gelten?
            </h2>

            <p className="text-slate-700 mb-6">
              Die konkreten Anforderungen ergeben sich aus der Barrierefreiheitsanforderungsverordnung (BFSGV).
              Für Websites und Apps orientieren sie sich an den <strong>Web Content Accessibility Guidelines (WCAG) 2.1</strong>,
              Konformitätsstufe AA, sowie der europäischen Norm <strong>EN 301 549</strong>.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mb-4">
              Die vier Kernprinzipien der digitalen Barrierefreiheit
            </h3>

            <div className="grid md:grid-cols-2 gap-4 not-prose">
              <div className="bg-violet-50 rounded-xl p-5 border border-violet-100">
                <h4 className="font-semibold text-blue-900 mb-2">1. Wahrnehmbarkeit</h4>
                <p className="text-sm text-violet-800">
                  Inhalte müssen von allen wahrgenommen werden können: Alternativtexte für Bilder,
                  Untertitel für Videos, ausreichende Farbkontraste.
                </p>
              </div>
              <div className="bg-purple-50 rounded-xl p-5 border border-purple-100">
                <h4 className="font-semibold text-purple-900 mb-2">2. Bedienbarkeit</h4>
                <p className="text-sm text-purple-800">
                  Alle Funktionen müssen ohne Maus nutzbar sein (Tastatur). Fokuszustände müssen sichtbar sein,
                  keine starren Zeitlimits.
                </p>
              </div>
              <div className="bg-green-50 rounded-xl p-5 border border-green-100">
                <h4 className="font-semibold text-green-900 mb-2">3. Verständlichkeit</h4>
                <p className="text-sm text-green-800">
                  Klare Navigation, verständliche Fehlermeldungen bei Formularen, konsistente Bedienelemente.
                </p>
              </div>
              <div className="bg-orange-50 rounded-xl p-5 border border-orange-100">
                <h4 className="font-semibold text-orange-900 mb-2">4. Robustheit</h4>
                <p className="text-sm text-orange-800">
                  Inhalte müssen mit verschiedenen Browsern und assistiven Technologien (Screenreader) funktionieren.
                </p>
              </div>
            </div>
          </section>

          {/* Section 5 */}
          <section id="pflichten" className="mb-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold text-slate-900 mb-6 flex items-center gap-3">
              <ClipboardList className="w-6 h-6 text-purple-600" />
              Welche Pflichten haben Unternehmen?
            </h2>

            <div className="space-y-4 not-prose">
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2">Barrierefreiheitserklärung</h4>
                <p className="text-slate-600">
                  Muss auf der Website zugänglich sein – idealerweise in der Fußzeile neben Impressum und Datenschutz.
                  Sie muss darlegen, wie die Anforderungen erfüllt werden und welche Marktüberwachungsbehörde zuständig ist.
                </p>
              </div>
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2">Dokumentationspflichten</h4>
                <p className="text-slate-600">
                  Hersteller müssen ein Konformitätsbewertungsverfahren durchführen, eine EU-Konformitätserklärung
                  ausstellen und die CE-Kennzeichnung anbringen.
                </p>
              </div>
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2">Informationspflichten</h4>
                <p className="text-slate-600">
                  Unternehmen müssen Marktüberwachungsbehörden informieren, wenn Produkte oder Dienstleistungen
                  den Anforderungen nicht entsprechen.
                </p>
              </div>
            </div>
          </section>

          {/* Section 6 */}
          <section id="sanktionen" className="mb-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold text-slate-900 mb-6 flex items-center gap-3">
              <ShieldAlert className="w-6 h-6 text-red-600" />
              Welche Sanktionen drohen bei Verstößen?
            </h2>

            <div className="bg-red-50 rounded-2xl p-6 border border-red-200 not-prose mb-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="text-center">
                  <div className="text-4xl font-bold text-red-600 mb-2">100.000 €</div>
                  <p className="text-red-800 text-sm">
                    Bußgeld bei schweren Verstößen<br />
                    (nicht-konforme Produkte/Dienstleistungen)
                  </p>
                </div>
                <div className="text-center">
                  <div className="text-4xl font-bold text-red-600 mb-2">10.000 €</div>
                  <p className="text-red-800 text-sm">
                    Bußgeld bei leichten Verstößen<br />
                    (fehlende Dokumentation)
                  </p>
                </div>
              </div>
            </div>

            <h4 className="font-semibold text-slate-900 mb-3">Weitere Konsequenzen:</h4>
            <ul className="space-y-2 text-slate-700 not-prose">
              <li className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-1 shrink-0" />
                <span><strong>Verkaufsverbot:</strong> Marktüberwachungsbehörde kann Bereitstellung untersagen oder Rückruf anordnen</span>
              </li>
              <li className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-1 shrink-0" />
                <span><strong>Abmahnungen:</strong> Verbraucherverbände und Mitbewerber können wettbewerbsrechtlich abmahnen</span>
              </li>
              <li className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-1 shrink-0" />
                <span><strong>Reputationsschäden:</strong> Negative Berichterstattung kann das Unternehmensimage nachhaltig beschädigen</span>
              </li>
            </ul>
          </section>

          {/* Section 7 */}
          <section id="fristen" className="mb-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold text-slate-900 mb-6 flex items-center gap-3">
              <Calendar className="w-6 h-6 text-purple-600" />
              Übergangsfristen im Überblick
            </h2>

            <div className="space-y-4 not-prose">
              <div className="bg-red-50 rounded-xl p-5 border border-red-200">
                <div className="flex items-center gap-3 mb-2">
                  <span className="px-2 py-1 bg-red-200 text-red-800 rounded text-xs font-bold">JETZT</span>
                  <h4 className="font-semibold text-red-900">Webseiten und Online-Shops</h4>
                </div>
                <p className="text-sm text-red-800">Müssen seit dem 29. Juni 2025 barrierefrei sein.</p>
              </div>
              <div className="bg-amber-50 rounded-xl p-5 border border-amber-200">
                <div className="flex items-center gap-3 mb-2">
                  <span className="px-2 py-1 bg-amber-200 text-amber-800 rounded text-xs font-bold">2030</span>
                  <h4 className="font-semibold text-amber-900">Dienstleistungen mit Produktabhängigkeit</h4>
                </div>
                <p className="text-sm text-amber-800">Dürfen noch bis zum 27. Juni 2030 mit bestehenden (nicht-barrierefreien) Produkten arbeiten.</p>
              </div>
              <div className="bg-violet-50 rounded-xl p-5 border border-violet-200">
                <div className="flex items-center gap-3 mb-2">
                  <span className="px-2 py-1 bg-blue-200 text-violet-800 rounded text-xs font-bold">2040</span>
                  <h4 className="font-semibold text-blue-900">Selbstbedienungsterminals</h4>
                </div>
                <p className="text-sm text-violet-800">Vor dem 28. Juni 2025 installierte Terminals dürfen maximal bis 2040 weiter genutzt werden.</p>
              </div>
            </div>
          </section>

          {/* Section 8 */}
          <section id="umsetzung" className="mb-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold text-slate-900 mb-6 flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
              Praktische Schritte zur Umsetzung
            </h2>

            <div className="space-y-6 not-prose">
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center shrink-0 text-purple-700 font-bold">1</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-1">Bestandsaufnahme durchführen</h4>
                  <p className="text-slate-600 text-sm">
                    Prüfen Sie, ob Ihre Produkte/Dienstleistungen in den Anwendungsbereich fallen.
                    Führen Sie ein Barrierefreiheits-Audit durch. Automatisierte Tests geben erste Hinweise,
                    ersetzen aber keine manuelle Prüfung.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center shrink-0 text-purple-700 font-bold">2</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-1">Prioritäten setzen</h4>
                  <p className="text-slate-600 text-sm">
                    Konzentrieren Sie sich zunächst auf kritische Barrieren: fehlende Alternativtexte,
                    nicht per Tastatur bedienbare Funktionen, unzureichende Kontraste.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center shrink-0 text-purple-700 font-bold">3</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-1">Dokumente nicht vergessen</h4>
                  <p className="text-slate-600 text-sm">
                    Neben Websites müssen auch PDFs, Office-Dokumente und andere herunterladbare Inhalte
                    barrierefrei sein. Hier liegt bei vielen Unternehmen Nachholbedarf.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center shrink-0 text-purple-700 font-bold">4</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-1">Schulung und Sensibilisierung</h4>
                  <p className="text-slate-600 text-sm">
                    Barrierefreiheit ist ein fortlaufender Prozess. Schulen Sie Mitarbeiter in Content-Erstellung
                    und Dokumentenproduktion, damit die Barrierefreiheit bei Updates erhalten bleibt.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center shrink-0 text-purple-700 font-bold">5</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-1">Barrierefreiheitserklärung erstellen</h4>
                  <p className="text-slate-600 text-sm">
                    Veröffentlichen Sie eine leicht auffindbare Erklärung. Benennen Sie bekannte Einschränkungen
                    transparent und geben Sie einen Kontakt für Feedback an.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Chance Section */}
          <section className="mb-12">
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-8 border border-green-100 not-prose">
              <h3 className="text-xl font-semibold text-slate-900 mb-4">Barrierefreiheit als Chance</h3>
              <p className="text-slate-700 mb-4">
                Das BFSG ist nicht nur eine Pflicht, sondern auch eine Chance. Barrierefreie Angebote erreichen mehr Menschen:
              </p>
              <ul className="space-y-2 text-slate-700 mb-4">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-1 shrink-0" />
                  <span><strong>10 Millionen Menschen</strong> mit anerkannter Behinderung in Deutschland</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-1 shrink-0" />
                  <span>Ältere Menschen und Personen mit vorübergehenden Einschränkungen</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-1 shrink-0" />
                  <span>Bessere allgemeine Benutzerfreundlichkeit für alle</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-1 shrink-0" />
                  <span>Positive Auswirkungen auf die Suchmaschinenoptimierung (SEO)</span>
                </li>
              </ul>
              <p className="text-slate-700 font-medium">
                Unternehmen, die jetzt handeln, positionieren sich als inklusive und zukunftsorientierte Anbieter.
              </p>
            </div>
          </section>

          {/* FAQ Section */}
          <section id="faq" className="mb-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold text-slate-900 mb-6 flex items-center gap-3">
              <HelpCircle className="w-6 h-6 text-purple-600" />
              Häufig gestellte Fragen zum BFSG
            </h2>

            <div className="space-y-4 not-prose">
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2">Gilt das BFSG auch für bestehende Websites?</h4>
                <p className="text-slate-600">
                  Ja. Websites und Online-Shops, die nach dem 28. Juni 2025 für Verbraucher zugänglich sind,
                  müssen barrierefrei sein – unabhängig davon, wann sie erstellt wurden.
                </p>
              </div>
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2">Was passiert, wenn ich die Anforderungen nicht vollständig erfüllen kann?</h4>
                <p className="text-slate-600">
                  Das BFSG sieht Ausnahmen vor, wenn die Erfüllung eine unverhältnismäßige Belastung darstellt
                  oder das Wesen des Produkts grundlegend verändern würde. Diese Ausnahmen sind jedoch eng gefasst
                  und müssen dokumentiert werden.
                </p>
              </div>
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2">Wer kontrolliert die Einhaltung des BFSG?</h4>
                <p className="text-slate-600">
                  Die Marktüberwachungsbehörden der Bundesländer sind zuständig. Auch Verbraucher, Verbände
                  und Mitbewerber können Verstöße melden.
                </p>
              </div>
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2">Müssen auch PDFs und Dokumente barrierefrei sein?</h4>
                <p className="text-slate-600">
                  Ja. Alle Inhalte, die Teil eines vom BFSG erfassten digitalen Angebots sind, müssen
                  barrierefrei zugänglich sein – auch herunterladbare Dokumente.
                </p>
              </div>
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2">Wie unterscheidet sich das BFSG von der BITV 2.0?</h4>
                <p className="text-slate-600">
                  Die BITV 2.0 gilt für öffentliche Stellen des Bundes. Das BFSG erweitert die Pflicht zur
                  Barrierefreiheit auf die Privatwirtschaft und gilt für bestimmte Produkte und Dienstleistungen.
                </p>
              </div>
            </div>
          </section>

        </article>

        {/* CTA Section */}
        <div className="bg-gradient-to-br from-violet-600 to-purple-700 rounded-2xl p-8 md:p-10 text-center text-white">
          <h2 className="text-2xl md:text-3xl font-semibold mb-4">
            Machen Sie Ihre Inhalte<br />BFSG-konform
          </h2>
          <p className="text-white/80 mb-8 max-w-xl mx-auto">
            Unsere browserbasierten Tools arbeiten DSGVO-konform ohne Datenübertragung an externe Server
            und unterstützen Sie bei der barrierefreien Umsetzung.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/">
              <Button className="h-12 px-8 rounded-xl bg-white text-violet-600 hover:bg-slate-100 font-semibold">
                Kostenlos starten
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <Link href="/tools/kontrastchecker">
              <Button variant="outline" className="h-12 px-8 rounded-xl border-white/30 text-white hover:bg-white/10">
                Kontrastchecker testen
              </Button>
            </Link>
          </div>
        </div>
      </main>

    </PageLayout>
  );
}
