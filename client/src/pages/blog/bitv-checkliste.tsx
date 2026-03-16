import { Button } from "@/components/ui/button";
import { PageLayout } from "@/components/PageLayout";
import { SEO, ArticleSchema } from "@/components/SEO";
import { getBlogPost, formatDate } from "@/lib/blog-posts";
import {
  CheckCircle2, ArrowRight, Calendar, Clock, ArrowLeft,
  BookOpen, Eye, Hand, Brain, Wrench, FileText,
  Keyboard, MousePointer, Type, Image, Link as LinkIcon,
  Languages, MessageSquare, AlertCircle, Code, Accessibility
} from "lucide-react";
import { Link } from "wouter";

export default function BitvCheckliste() {
  const post = getBlogPost("bitv-checkliste");

  return (
    <PageLayout>
      <SEO
        title="BITV 2.0 Checkliste: 25 Schritte zur Konformitaet"
        description="Die praktische Prüfliste für IT-Leiter, Webmaster und Digitalisierungsbeauftragte. Alle 25 wesentlichen Prüfpunkte der BITV 2.0 mit konkreten Handlungsempfehlungen."
        canonical="/blog/bitv-checkliste"
        ogType="article"
      />
      <ArticleSchema
        title="BITV 2.0 Checkliste: 25 Schritte zur Konformitaet"
        description="Die praktische Prüfliste für IT-Leiter, Webmaster und Digitalisierungsbeauftragte."
        url="/blog/bitv-checkliste"
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
                12 min Lesezeit
              </span>
            </div>
          </div>

          <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight mb-4">
            BITV 2.0 Checkliste: 25 Schritte zur Konformitaet
          </h1>
          <p className="text-xl text-slate-600 font-light">
            Die praktische Prüfliste für IT-Leiter, Webmaster und Digitalisierungsbeauftragte.
            Alle wichtigen Prüfpunkte mit konkreten Handlungsempfehlungen.
          </p>
        </div>
      </header>

      <main id="main-content" className="max-w-3xl mx-auto px-6 pb-24" tabIndex={-1}>

        {/* Intro */}
        <div className="bg-violet-50 border border-violet-200 rounded-2xl p-6 mb-12">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-violet-100 rounded-xl flex items-center justify-center shrink-0">
              <Accessibility className="w-6 h-6 text-violet-600" />
            </div>
            <div>
              <h2 className="font-semibold text-blue-900 mb-1">Die 4 Grundprinzipien der Barrierefreiheit</h2>
              <p className="text-violet-700 text-sm">
                Alle Anforderungen der BITV 2.0 lassen sich auf vier Grundprinzipien zurückfuehren:
                <strong> Wahrnehmbar, Bedienbar, Verständlich, Robust</strong>.
                Diese zu verstehen hilft, die einzelnen Prüfpunkte einzuordnen.
              </p>
            </div>
          </div>
        </div>

        {/* Table of Contents */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-12">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-purple-600" />
            Inhalt dieser Checkliste
          </h2>
          <nav className="grid md:grid-cols-2 gap-2 text-sm">
            <a href="#wahrnehmbar" className="text-purple-600 hover:text-purple-800">Kategorie 1: Wahrnehmbar (1-8)</a>
            <a href="#bedienbar" className="text-purple-600 hover:text-purple-800">Kategorie 2: Bedienbar (9-16)</a>
            <a href="#verständlich" className="text-purple-600 hover:text-purple-800">Kategorie 3: Verständlich (17-21)</a>
            <a href="#robust" className="text-purple-600 hover:text-purple-800">Kategorie 4: Robust + BITV (22-25)</a>
          </nav>
        </div>

        {/* Content Sections */}
        <article className="prose prose-gray max-w-none">

          {/* Category 1: Wahrnehmbar */}
          <section id="wahrnehmbar" className="mb-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold text-slate-900 mb-6 flex items-center gap-3">
              <Eye className="w-6 h-6 text-violet-600" />
              Kategorie 1: Wahrnehmbar (Prüfpunkte 1-8)
            </h2>
            <p className="text-slate-600 mb-6">
              Diese Kriterien stellen sicher, dass alle Nutzer die Inhalte Ihrer Website wahrnehmen können.
            </p>

            <div className="space-y-4 not-prose">
              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center shrink-0">
                    <Image className="w-4 h-4 text-violet-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900">1. Alternativtexte für Bilder</h4>
                    <p className="text-sm text-slate-600 mt-1">
                      Alle informativen Bilder haben aussagekräftige Alt-Texte.
                    </p>
                    <p className="text-xs text-slate-500 mt-2">
                      <strong>Test:</strong> Fahren Sie mit der Maus über ein Bild - erscheint ein Tooltip?
                    </p>
                    <p className="text-xs text-red-600 mt-1">
                      <strong>Häufiger Fehler:</strong> Alt-Texte wie "Bild1.jpg" oder "Logo" sind nicht aussagekräftig.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center shrink-0">
                    <MessageSquare className="w-4 h-4 text-violet-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900">2. Untertitel für Videos</h4>
                    <p className="text-sm text-slate-600 mt-1">
                      Videos mit gesprochenen Inhalten haben Untertitel oder ein Transkript.
                    </p>
                    <p className="text-xs text-red-600 mt-1">
                      <strong>Häufiger Fehler:</strong> Automatisch generierte YouTube-Untertitel sind oft fehlerhaft.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center shrink-0">
                    <Eye className="w-4 h-4 text-violet-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900">3. Audiodeskription für Videos</h4>
                    <p className="text-sm text-slate-600 mt-1">
                      Wichtige visuelle Informationen in Videos werden beschrieben.
                    </p>
                    <p className="text-xs text-slate-500 mt-2">
                      <strong>Tipp:</strong> Für die meisten kommunalen Videos (Interviews, Reden) ist keine Audiodeskription nötig.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center shrink-0">
                    <Type className="w-4 h-4 text-violet-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900">4. Farbkontrast</h4>
                    <p className="text-sm text-slate-600 mt-1">
                      Text hat einen Kontrast von mindestens 4,5:1 zum Hintergrund (grosser Text: 3:1).
                    </p>
                    <p className="text-xs text-red-600 mt-1">
                      <strong>Häufiger Fehler:</strong> Hellgraue Schrift auf weißem Hintergrund, orangefarbene Links.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center shrink-0">
                    <Type className="w-4 h-4 text-violet-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900">5. Textgröße skalierbar</h4>
                    <p className="text-sm text-slate-600 mt-1">
                      Text kann bis 200% vergrößert werden, ohne dass Funktionalität verloren geht.
                    </p>
                    <p className="text-xs text-slate-500 mt-2">
                      <strong>Test:</strong> Druecken Sie Strg/Cmd + Plus mehrmals. Bricht das Layout?
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center shrink-0">
                    <Eye className="w-4 h-4 text-violet-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900">6. Nicht nur Farbe</h4>
                    <p className="text-sm text-slate-600 mt-1">
                      Informationen werden nicht ausschliesslich durch Farbe vermittelt.
                    </p>
                    <p className="text-xs text-red-600 mt-1">
                      <strong>Häufiger Fehler:</strong> Rote Pflichtfeld-Markierung ohne zusätzliches Sternchen.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center shrink-0">
                    <AlertCircle className="w-4 h-4 text-violet-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900">7. Bewegte Inhalte kontrollierbar</h4>
                    <p className="text-sm text-slate-600 mt-1">
                      Animationen, Slider und Auto-Play-Elemente können pausiert werden.
                    </p>
                    <p className="text-xs text-slate-500 mt-2">
                      <strong>Tipp:</strong> Verzichten Sie auf automatisch rotierende Slider - sie werden ohnehin selten beachtet.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center shrink-0">
                    <MessageSquare className="w-4 h-4 text-violet-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900">8. Audio-Kontrolle</h4>
                    <p className="text-sm text-slate-600 mt-1">
                      Automatisch abspielende Audios können gestoppt oder in der Lautstärke angepasst werden.
                    </p>
                    <p className="text-xs text-slate-500 mt-2">
                      <strong>Best Practice:</strong> Vermeiden Sie Auto-Play komplett.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Category 2: Bedienbar */}
          <section id="bedienbar" className="mb-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold text-slate-900 mb-6 flex items-center gap-3">
              <Hand className="w-6 h-6 text-purple-600" />
              Kategorie 2: Bedienbar (Prüfpunkte 9-16)
            </h2>
            <p className="text-slate-600 mb-6">
              Diese Kriterien stellen sicher, dass alle Nutzer die Website navigieren und bedienen können.
            </p>

            <div className="space-y-4 not-prose">
              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center shrink-0">
                    <Keyboard className="w-4 h-4 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900">9. Vollstaendige Tastaturbedienung</h4>
                    <p className="text-sm text-slate-600 mt-1">
                      Alle Funktionen sind per Tastatur erreichbar - ohne Maus.
                    </p>
                    <p className="text-xs text-slate-500 mt-2">
                      <strong>Test:</strong> Legen Sie die Maus beiseite. Navigieren Sie mit Tab, Enter und Pfeiltasten.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center shrink-0">
                    <AlertCircle className="w-4 h-4 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900">10. Keine Tastaturfalle</h4>
                    <p className="text-sm text-slate-600 mt-1">
                      Der Fokus kann von jedem Element weiterbewegt werden.
                    </p>
                    <p className="text-xs text-red-600 mt-1">
                      <strong>Häufiger Fehler:</strong> Modale Dialoge, aus denen man nicht per Tab herauskommt.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center shrink-0">
                    <LinkIcon className="w-4 h-4 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900">11. Skip-Links</h4>
                    <p className="text-sm text-slate-600 mt-1">
                      Es gibt einen "Zum Inhalt springen"-Link am Seitenanfang.
                    </p>
                    <p className="text-xs text-slate-500 mt-2">
                      <strong>Test:</strong> Druecken Sie Tab direkt nach dem Laden. Erscheint ein Skip-Link?
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900">12. Aussagekräftige Seitentitel</h4>
                    <p className="text-sm text-slate-600 mt-1">
                      Jede Seite hat einen eindeutigen, beschreibenden Titel.
                    </p>
                    <p className="text-xs text-slate-500 mt-2">
                      <strong>Empfehlung:</strong> Format "Seiteninhalt | Website-Name"
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center shrink-0">
                    <Keyboard className="w-4 h-4 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900">13. Logische Fokusreihenfolge</h4>
                    <p className="text-sm text-slate-600 mt-1">
                      Die Tab-Reihenfolge ist logisch und folgt der visuellen Anordnung.
                    </p>
                    <p className="text-xs text-red-600 mt-1">
                      <strong>Häufiger Fehler:</strong> Positive tabindex-Werte im HTML.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center shrink-0">
                    <LinkIcon className="w-4 h-4 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900">14. Aussagekräftige Link-Texte</h4>
                    <p className="text-sm text-slate-600 mt-1">
                      Der Zweck eines Links ist aus dem Linktext ersichtlich.
                    </p>
                    <p className="text-xs text-red-600 mt-1">
                      <strong>Häufiger Fehler:</strong> "Hier klicken", "Mehr", "Weiterlesen" ohne Kontext.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center shrink-0">
                    <MousePointer className="w-4 h-4 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900">15. Mehrere Navigationswege</h4>
                    <p className="text-sm text-slate-600 mt-1">
                      Es gibt mehr als einen Weg, Inhalte zu finden (z.B. Menue + Suche + Sitemap).
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center shrink-0">
                    <Eye className="w-4 h-4 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900">16. Sichtbarer Fokus-Indikator</h4>
                    <p className="text-sm text-slate-600 mt-1">
                      Das aktuell fokussierte Element ist deutlich erkennbar.
                    </p>
                    <p className="text-xs text-red-600 mt-1">
                      <strong>Häufiger Fehler:</strong> CSS-Regel "outline: none" ohne Alternative.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Category 3: Verständlich */}
          <section id="verständlich" className="mb-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold text-slate-900 mb-6 flex items-center gap-3">
              <Brain className="w-6 h-6 text-green-600" />
              Kategorie 3: Verständlich (Prüfpunkte 17-21)
            </h2>
            <p className="text-slate-600 mb-6">
              Diese Kriterien stellen sicher, dass Inhalte und Bedienung für alle verständlich sind.
            </p>

            <div className="space-y-4 not-prose">
              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                    <Languages className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900">17. Dokumentsprache definiert</h4>
                    <p className="text-sm text-slate-600 mt-1">
                      Die Hauptsprache der Seite ist im HTML-Code definiert (lang="de").
                    </p>
                    <p className="text-xs text-slate-500 mt-2">
                      <strong>Wichtig:</strong> Dies steuert, mit welcher Sprachausgabe Screenreader den Text vorlesen.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                    <Languages className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900">18. Sprachwechsel gekennzeichnet</h4>
                    <p className="text-sm text-slate-600 mt-1">
                      Fremdsprachige Textpassagen sind mit dem entsprechenden lang-Attribut versehen.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                    <MousePointer className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900">19. Konsistente Navigation</h4>
                    <p className="text-sm text-slate-600 mt-1">
                      Die Navigation ist auf allen Seiten an der gleichen Stelle und in der gleichen Reihenfolge.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                    <AlertCircle className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900">20. Fehlererkennung bei Formularen</h4>
                    <p className="text-sm text-slate-600 mt-1">
                      Fehler in Formularen werden klar angezeigt und beschrieben.
                    </p>
                    <p className="text-xs text-red-600 mt-1">
                      <strong>Häufiger Fehler:</strong> Nur "Es ist ein Fehler aufgetreten" ohne Angabe des Feldes.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900">21. Beschriftete Formularfelder</h4>
                    <p className="text-sm text-slate-600 mt-1">
                      Jedes Eingabefeld hat ein zugeordnetes Label.
                    </p>
                    <p className="text-xs text-slate-500 mt-2">
                      <strong>Test:</strong> Klicken Sie auf den Text neben einem Feld. Springt der Cursor ins Feld?
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Category 4: Robust */}
          <section id="robust" className="mb-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold text-slate-900 mb-6 flex items-center gap-3">
              <Wrench className="w-6 h-6 text-orange-600" />
              Kategorie 4: Robust + BITV-spezifisch (Prüfpunkte 22-25)
            </h2>
            <p className="text-slate-600 mb-6">
              Diese Kriterien umfassen technische Anforderungen und die besonderen deutschen Vorgaben.
            </p>

            <div className="space-y-4 not-prose">
              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center shrink-0">
                    <Code className="w-4 h-4 text-orange-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900">22. Valides HTML</h4>
                    <p className="text-sm text-slate-600 mt-1">
                      Der HTML-Code enthaelt keine groben Syntaxfehler.
                    </p>
                    <p className="text-xs text-slate-500 mt-2">
                      <strong>Test:</strong> Nutzen Sie den W3C Markup Validator (validator.w3.org).
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center shrink-0">
                    <Languages className="w-4 h-4 text-orange-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900">23. Leichte Sprache</h4>
                    <p className="text-sm text-slate-600 mt-1">
                      Wesentliche Inhalte sind in Leichter Sprache verfügbar.
                    </p>
                    <p className="text-xs text-slate-500 mt-2">
                      <strong>BITV-Minimum:</strong> Startseite, Navigation, wesentliche Inhalte, Zustaendigkeiten.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center shrink-0">
                    <Hand className="w-4 h-4 text-orange-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900">24. Gebaerdensprache</h4>
                    <p className="text-sm text-slate-600 mt-1">
                      Auf der Startseite gibt es ein Video in Deutscher Gebaerdensprache (DGS).
                    </p>
                    <p className="text-xs text-slate-500 mt-2">
                      <strong>Wichtig:</strong> Prüfen Sie Ihre Landesverordnung für kommunale Anforderungen.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-orange-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900">25. Barrierefreiheitserklärung</h4>
                    <p className="text-sm text-slate-600 mt-1">
                      Eine vollständige Barrierefreiheitserklärung ist veröffentlicht.
                    </p>
                    <p className="text-xs text-slate-500 mt-2">
                      <strong>Inhalt:</strong> Stand der Konformitaet, nicht barrierefreie Inhalte, Feedback, Durchsetzungsverfahren.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Schnelltest */}
          <section className="mb-12">
            <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-2xl p-8 border border-purple-100 not-prose">
              <h3 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-6 h-6 text-purple-600" />
                Schnelltest: Die 5 wichtigsten Prüfpunkte
              </h3>
              <p className="text-slate-700 mb-4">
                Keine Zeit für alle 25 Punkte? Prüfen Sie zumindest diese fuenf:
              </p>
              <ul className="space-y-2 text-slate-700">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-1 shrink-0" />
                  <span><strong>Tastaturbedienung:</strong> Können Sie die komplette Navigation mit Tab erreichen?</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-1 shrink-0" />
                  <span><strong>Alternativtexte:</strong> Haben wichtige Bilder aussagekräftige Beschreibungen?</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-1 shrink-0" />
                  <span><strong>Farbkontrast:</strong> Ist der Text gut lesbar?</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-1 shrink-0" />
                  <span><strong>Fokus-Indikator:</strong> Sehen Sie, wo der Tastaturfokus gerade ist?</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-1 shrink-0" />
                  <span><strong>Barrierefreiheitserklärung:</strong> Ist sie vorhanden und aktuell?</span>
                </li>
              </ul>
            </div>
          </section>

          {/* Fazit */}
          <section className="mb-12">
            <div className="bg-slate-50 rounded-2xl p-8 border border-slate-200 not-prose">
              <h3 className="text-xl font-semibold text-slate-900 mb-4">Fazit: Systematisch zur Barrierefreiheit</h3>
              <p className="text-slate-700 mb-4">
                Diese 25 Prüfpunkte decken die wesentlichen Anforderungen der BITV 2.0 ab.
                Arbeiten Sie sie systematisch durch - am besten im Vier-Augen-Prinzip.
              </p>
              <p className="text-slate-700 mb-4">
                <strong>Wichtig:</strong> Automatisierte Tools finden nur etwa 30% der Barrierefreiheits-Probleme.
                Die manuelle Prüfung mit Tastatur und Screenreader bleibt unverzichtbar.
              </p>
              <p className="text-slate-700">
                Beginnen Sie mit den kritischen Bereichen: Startseite, Kontaktseite, die meistbesuchten Seiten.
                Und denken Sie daran: Barrierefreiheit ist kein Projekt mit Enddatum, sondern ein fortlaufender Prozess.
              </p>
            </div>
          </section>

        </article>

        {/* CTA Section */}
        <div className="bg-gradient-to-br from-violet-600 to-purple-700 rounded-2xl p-8 md:p-10 text-center text-white">
          <h2 className="text-2xl md:text-3xl font-semibold mb-4">
            Machen Sie Ihre Website<br />BITV-konform
          </h2>
          <p className="text-white/80 mb-8 max-w-xl mx-auto">
            VoxDrop hilft Ihnen bei der Umsetzung: Leichte Sprache, barrierefreie PDFs
            und automatische Vorlesefunktion - DSGVO-konform und Made in Germany.
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
