import { Button } from "@/components/ui/button";
import { PageLayout } from "@/components/PageLayout";
import { SEO, ArticleSchema } from "@/components/SEO";
import { getBlogPost, formatDate } from "@/lib/blog-posts";
import {
  Scale, Users, Globe, Eye, Ear, Brain,
  Building2, FileText, ArrowRight, CheckCircle2, AlertTriangle,
  Calendar, Clock, ArrowLeft
} from "lucide-react";
import { Link } from "wouter";

export default function FaktenZurBarrierefreiheit() {
  const post = getBlogPost("fakten-zur-barrierefreiheit");

  return (
    <PageLayout>
      <SEO
        title="Fakten zur Barrierefreiheit - VoxDrop Blog"
        description="7,8 Millionen schwerbehinderte Menschen in Deutschland. Barrierefreiheit ist kein Nice-to-have – es ist ein Grundrecht."
        canonical="/blog/fakten-zur-barrierefreiheit"
        ogType="article"
      />
      <ArticleSchema
        title="Fakten zur Barrierefreiheit"
        description="7,8 Millionen schwerbehinderte Menschen in Deutschland. Barrierefreiheit ist kein Nice-to-have – es ist ein Grundrecht."
        url="/blog/fakten-zur-barrierefreiheit"
        datePublished={post?.date || "2026-01-15"}
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
            <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
              Grundlagen
            </span>
            <div className="flex items-center gap-4 text-sm text-slate-600">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {post ? formatDate(post.date) : "15. Januar 2026"}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                5 min Lesezeit
              </span>
            </div>
          </div>

          <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight mb-4">
            Fakten zur Barrierefreiheit
          </h1>
          <p className="text-xl text-slate-600 font-light">
            7,8 Millionen schwerbehinderte Menschen in Deutschland. Barrierefreiheit ist kein Nice-to-have – es ist ein Grundrecht.
          </p>
        </div>
      </header>

      <main id="main-content" className="max-w-3xl mx-auto px-6 pb-24" tabIndex={-1}>
        {/* Statistics Section */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 text-center">
            <div className="text-4xl font-bold text-violet-600 mb-2">7,8 Mio.</div>
            <p className="text-slate-600">schwerbehinderte Menschen in Deutschland</p>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-slate-200 text-center">
            <div className="text-4xl font-bold text-purple-600 mb-2">15%</div>
            <p className="text-slate-600">der Weltbevölkerung leben mit einer Behinderung</p>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-slate-200 text-center">
            <div className="text-4xl font-bold text-pink-600 mb-2">71%</div>
            <p className="text-slate-600">verlassen Websites, die nicht barrierefrei sind</p>
          </div>
        </div>

        {/* Why It Matters Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-12">
          <div className="p-8 md:p-10">
            <h2 className="text-2xl font-semibold text-slate-900 mb-8 text-center">
              Wer profitiert von Barrierefreiheit?
            </h2>
            <div className="grid md:grid-cols-2 gap-8">
              <div className="flex gap-4">
                <div className="w-12 h-12 bg-violet-100 rounded-xl flex items-center justify-center shrink-0">
                  <Ear className="w-6 h-6 text-violet-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 mb-2">Menschen mit Hörbehinderung</h3>
                  <p className="text-slate-600">
                    Ca. 80.000 gehörlose und 16 Millionen schwerhörige Menschen in Deutschland sind auf Untertitel und Gebärdensprache angewiesen.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center shrink-0">
                  <Eye className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 mb-2">Menschen mit Sehbehinderung</h3>
                  <p className="text-slate-600">
                    1,2 Millionen blinde und sehbehinderte Menschen benötigen Screenreader-kompatible Inhalte und Audiodeskription.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-12 h-12 bg-pink-100 rounded-xl flex items-center justify-center shrink-0">
                  <Brain className="w-6 h-6 text-pink-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 mb-2">Menschen mit kognitiven Einschränkungen</h3>
                  <p className="text-slate-600">
                    Leichte Sprache und klare Strukturen helfen Menschen mit Lernschwierigkeiten, Demenz oder Leseschwäche.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
                  <Users className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 mb-2">Alle anderen auch</h3>
                  <p className="text-slate-600">
                    Untertitel helfen in lauten Umgebungen, bei Fremdsprachen oder beim Lernen. Gute Barrierefreiheit verbessert die UX für alle.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Legal Requirements */}
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border border-amber-100 overflow-hidden mb-12">
          <div className="p-8 md:p-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                <Scale className="w-6 h-6 text-amber-600" />
              </div>
              <h2 className="text-2xl font-semibold text-slate-900">Gesetzliche Anforderungen</h2>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="bg-white/70 rounded-xl p-5 border border-amber-100">
                  <h3 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-amber-600" />
                    BITV 2.0
                  </h3>
                  <p className="text-sm text-slate-600">
                    Die Barrierefreie-Informationstechnik-Verordnung verpflichtet Bundesbehörden zur barrierefreien Gestaltung ihrer Websites und Apps.
                  </p>
                </div>

                <div className="bg-white/70 rounded-xl p-5 border border-amber-100">
                  <h3 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-amber-600" />
                    EU-Richtlinie 2016/2102
                  </h3>
                  <p className="text-sm text-slate-600">
                    Alle öffentlichen Stellen in der EU müssen ihre Websites und mobilen Anwendungen barrierefrei gestalten.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-white/70 rounded-xl p-5 border border-amber-100">
                  <h3 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-amber-600" />
                    BFSG (ab Juni 2025)
                  </h3>
                  <p className="text-sm text-slate-600">
                    Das Barrierefreiheitsstärkungsgesetz verpflichtet auch private Unternehmen zur Barrierefreiheit digitaler Produkte und Dienstleistungen.
                  </p>
                </div>

                <div className="bg-white/70 rounded-xl p-5 border border-amber-100">
                  <h3 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-amber-600" />
                    WCAG 2.1 AA
                  </h3>
                  <p className="text-sm text-slate-600">
                    Die Web Content Accessibility Guidelines sind der internationale Standard für barrierefreie Web-Inhalte.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-8 p-5 bg-amber-100/50 rounded-xl border border-amber-200">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                <div>
                  <p className="font-medium text-slate-900 mb-1">Wichtiger Hinweis für öffentliche Stellen</p>
                  <p className="text-sm text-slate-700">
                    Öffentliche Stellen, die ihre Barrierefreiheitspflichten nicht erfüllen, können von den zuständigen Überwachungsstellen
                    abgemahnt werden. Betroffene Bürger haben zudem ein Klagerecht.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* How VoxDrop Helps */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-12">
          <div className="p-8 md:p-10">
            <div className="text-center mb-10">
              <h2 className="text-2xl font-semibold text-slate-900 mb-3">
                Wie VoxDrop hilft
              </h2>
              <p className="text-slate-600 max-w-2xl mx-auto">
                Unsere Tools machen es einfach, die gesetzlichen Anforderungen zu erfüllen – ohne technisches Know-how.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-violet-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-violet-600" />
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">Automatische Untertitel</h3>
                <p className="text-sm text-slate-600">
                  KI-gestützte Transkription für Videos. Erfüllt die Anforderung an Untertitel nach BITV 2.0.
                </p>
              </div>

              <div className="text-center p-6">
                <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Ear className="w-8 h-8 text-purple-600" />
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">Video-Einbettung</h3>
                <p className="text-sm text-slate-600">
                  Untertitel direkt ins Video einbetten – als Hardcoded oder Soft-Untertitel für volle Flexibilität.
                </p>
              </div>

              <div className="text-center p-6">
                <div className="w-16 h-16 bg-pink-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Building2 className="w-8 h-8 text-pink-600" />
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">DSGVO-konform</h3>
                <p className="text-sm text-slate-600">
                  Lokale Verarbeitung auf deutschen Servern. Keine Datenübertragung an US-Cloud-Dienste.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="bg-gradient-to-br from-violet-600 to-purple-700 rounded-2xl p-8 md:p-10 text-center text-white">
          <h2 className="text-2xl md:text-3xl font-semibold mb-4">
            Starten Sie noch heute mit<br />digitaler Barrierefreiheit
          </h2>
          <p className="text-white/80 mb-8 max-w-xl mx-auto">
            5 kostenlose Prozesse zum Ausprobieren. Keine Kreditkarte erforderlich.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/">
              <Button className="h-12 px-8 rounded-xl bg-white text-violet-600 hover:bg-slate-100 font-semibold">
                Kostenlos starten
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
      </main>

    </PageLayout>
  );
}
