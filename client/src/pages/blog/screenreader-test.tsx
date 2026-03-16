import { Button } from "@/components/ui/button";
import { PageLayout } from "@/components/PageLayout";
import { SEO, ArticleSchema } from "@/components/SEO";
import { getBlogPost, formatDate } from "@/lib/blog-posts";
import {
  CheckCircle2, ArrowRight, Calendar, Clock, ArrowLeft,
  Eye, Monitor, Keyboard, AlertTriangle, FileText,
  Download, Play, Search, List, Link as LinkIcon,
  Image, FormInput, Lightbulb, BookOpen, Mail
} from "lucide-react";
import { Link } from "wouter";

export default function ScreenreaderTest() {
  const post = getBlogPost("screenreader-test");

  return (
    <PageLayout>
      <SEO
        title="Screenreader-Test für Einsteiger: So prüfen Sie Ihre Website selbst"
        description="Eine praktische Anleitung für Webmaster und Entwickler im öffentlichen Sektor. In 30 Minuten Barrieren finden, die kein automatisches Tool erkennt."
        canonical="/blog/screenreader-test"
        ogType="article"
      />
      <ArticleSchema
        title="Screenreader-Test für Einsteiger: So prüfen Sie Ihre Website selbst"
        description="Eine praktische Anleitung für Webmaster und Entwickler im öffentlichen Sektor. In 30 Minuten Barrieren finden, die kein automatisches Tool erkennt."
        url="/blog/screenreader-test"
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
            <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
              Best Practices
            </span>
            <div className="flex items-center gap-4 text-sm text-slate-600">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {post ? formatDate(post.date) : "1. Februar 2026"}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                14 min Lesezeit
              </span>
            </div>
          </div>

          <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight mb-4">
            Screenreader-Test für Einsteiger: So prüfen Sie Ihre Website selbst
          </h1>
          <p className="text-xl text-slate-600 font-light">
            Automatisierte Tools finden nur 30-40% aller Barrierefreiheits-Probleme.
            Die restlichen 60-70% erkennt man nur durch manuelle Prüfung mit einem Screenreader.
            Mit dieser Anleitung schaffen Sie das in 30 Minuten.
          </p>
        </div>
      </header>

      <main id="main-content" className="max-w-3xl mx-auto px-6 pb-24" tabIndex={-1}>

        <article className="prose prose-gray max-w-none">

          {/* Warum Screenreader-Tests */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <Eye className="w-6 h-6 text-blue-500" />
              Warum Screenreader-Tests unverzichtbar sind
            </h2>

            <div className="bg-violet-50 rounded-xl p-6 border border-violet-100 not-prose mb-6">
              <h4 className="font-semibold text-blue-900 mb-3">Die Grenzen automatisierter Tools</h4>
              <p className="text-violet-800 mb-3">
                Tools wie WAVE, axe oder Lighthouse prüfen technische Kriterien: Ist ein Alt-Text vorhanden?
                Ist der Kontrast ausreichend? Gibt es ein Label für das Formularfeld?
              </p>
              <p className="text-violet-800 font-medium">Was sie nicht prüfen können:</p>
              <ul className="mt-2 space-y-1 text-violet-800">
                <li>• Ist der Alt-Text sinnvoll oder nur "Bild1.jpg"?</li>
                <li>• Ergibt die Lesereihenfolge Sinn?</li>
                <li>• Ist das Formular verständlich zu bedienen?</li>
                <li>• Funktioniert die Navigation logisch?</li>
              </ul>
            </div>

            <p className="text-slate-700">
              Ein Screenreader-Test zwingt Sie, Ihre Website aus einer voellig anderen Perspektive zu erleben.
              Ploetzlich sind Sie auf die lineare Abfolge der Inhalte angewiesen, auf korrekte Überschriften,
              auf aussagekräftige Linktexte. Dieser Perspektivwechsel ist unbezahlbar für das Verständnis
              von Barrierefreiheit.
            </p>
          </section>

          {/* Screenreader-Optionen */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <Monitor className="w-6 h-6 text-purple-500" />
              Screenreader-Optionen im Überblick
            </h2>

            <div className="space-y-4 not-prose">
              <div className="bg-green-50 rounded-xl p-6 border border-green-100">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-green-900 mb-2">NVDA (Windows) – Die Empfehlung</h4>
                    <p className="text-green-800 mb-3">
                      NVDA (NonVisual Desktop Access) ist ein kostenloser Open-Source-Screenreader für Windows.
                      Er wird weltweit von Millionen blinden und sehbehinderten Menschen genutzt.
                    </p>
                    <ul className="text-green-700 text-sm space-y-1">
                      <li>✓ Komplett kostenlos</li>
                      <li>✓ Aktive Entwicklung und regelmaessige Updates</li>
                      <li>✓ Funktioniert hervorragend mit Firefox und Chrome</li>
                      <li>✓ Portable Version ohne Installation verfügbar</li>
                    </ul>
                    <p className="text-green-800 mt-3 font-medium">
                      Download: nvaccess.org (ca. 50 MB)
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2">VoiceOver (macOS/iOS) – Integriert</h4>
                <p className="text-slate-700 mb-2">
                  Auf Apple-Geraeten vorinstalliert. Aktivierung: Cmd + F5 (Mac) oder
                  Einstellungen → Bedienungshilfen (iPhone/iPad).
                </p>
                <p className="text-slate-600 text-sm">
                  Gut für mobile Tests, aber andere Tastenbefehle als NVDA.
                </p>
              </div>

              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2">JAWS (Windows) – Der Profi</h4>
                <p className="text-slate-700 mb-2">
                  Der meistgenutzte kommerzielle Screenreader. Wird von vielen blinden
                  Verwaltungsmitarbeitern verwendet.
                </p>
                <p className="text-slate-600 text-sm">
                  Kostenpflichtig (ca. 1.000 Euro Lizenz) – für gelegentliche Tests ueberdimensioniert.
                </p>
              </div>

              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2">Narrator (Windows) – Eingebaut</h4>
                <p className="text-slate-700 mb-2">
                  Windows bringt mit Narrator einen eigenen Screenreader mit.
                  Aktivierung: Win + Strg + Enter.
                </p>
                <p className="text-slate-600 text-sm">
                  Für erste Experimente geeignet, für ernsthafte Tests nicht empfohlen.
                </p>
              </div>
            </div>

            <div className="bg-purple-50 rounded-xl p-6 border border-purple-100 not-prose mt-6">
              <p className="text-purple-900 font-medium">
                <strong>Unsere Empfehlung:</strong> NVDA mit Firefox. Diese Kombination ist kostenlos,
                gut dokumentiert und entspricht dem, was viele blinde Nutzer tatsaechlich verwenden.
              </p>
            </div>
          </section>

          {/* NVDA installieren */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <Download className="w-6 h-6 text-green-500" />
              NVDA installieren und einrichten
            </h2>

            <p className="text-slate-700 mb-6">
              Die Installation dauert etwa 5 Minuten. Hier ist die Schritt-für-Schritt-Anleitung.
            </p>

            <div className="space-y-4 not-prose">
              <div className="flex gap-4">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center shrink-0 text-green-700 font-bold text-sm">1</div>
                <div>
	                  <h4 className="font-semibold text-slate-900 mb-1">Download</h4>
	                  <p className="text-slate-600">
	                    Laden Sie NVDA von nvaccess.org herunter. Wählen Sie die Standardinstallation.
	                  </p>
	                </div>
	              </div>

              <div className="flex gap-4">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center shrink-0 text-green-700 font-bold text-sm">2</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-1">Installation</h4>
                  <p className="text-slate-600">
                    Die Installation ist selbsterklärend. NVDA startet automatisch nach der Installation
                    und beginnt zu sprechen – keine Sorge, das ist normal.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center shrink-0 text-green-700 font-bold text-sm">3</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-1">Erste Konfiguration</h4>
                  <p className="text-slate-600">
                    Im Willkommensdialog können Sie die NVDA-Taste festlegen. Standard ist die
                    Einfügen-Taste (Ins). Diese Taste ist wichtig für viele Tastenkombinationen.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center shrink-0 text-green-700 font-bold text-sm">4</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-1">Wichtige Einstellungen für Tests</h4>
                  <div className="text-slate-600 space-y-2 mt-2">
                    <p><strong>Visuelle Hervorhebung aktivieren:</strong><br />
                    Rechtsklick NVDA-Symbol → Optionen → Einstellungen → "Hervorhebung aktivieren"</p>
                    <p><strong>Sprachbetrachter aktivieren:</strong><br />
                    Rechtsklick NVDA-Symbol → Werkzeuge → Sprachausgaben-Betrachter</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center shrink-0 text-green-700 font-bold text-sm">5</div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-1">Browser vorbereiten</h4>
                  <p className="text-slate-600">
                    NVDA funktioniert am besten mit Firefox. Stellen Sie sicher, dass Firefox
                    installiert ist.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Tastenkombinationen */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <Keyboard className="w-6 h-6 text-blue-500" />
              Die wichtigsten Tastenkombinationen
            </h2>

            <p className="text-slate-700 mb-6">
              Screenreader werden primaer per Tastatur bedient. Hier sind die Befehle, die Sie
              für den Test brauchen.
            </p>

            <div className="space-y-6 not-prose">
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-4">Grundlegende Navigation</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 font-medium text-slate-900">Taste</th>
                        <th className="text-left py-2 font-medium text-slate-900">Funktion</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-700">
                      <tr className="border-b"><td className="py-2 font-mono">Tab</td><td className="py-2">Naechstes interaktives Element</td></tr>
                      <tr className="border-b"><td className="py-2 font-mono">Shift + Tab</td><td className="py-2">Vorheriges interaktives Element</td></tr>
                      <tr className="border-b"><td className="py-2 font-mono">Pfeiltasten</td><td className="py-2">Zeilenweise durch Inhalt navigieren</td></tr>
                      <tr className="border-b"><td className="py-2 font-mono">Ins + Pfeiltasten</td><td className="py-2">Zeichenweise lesen</td></tr>
                      <tr className="border-b"><td className="py-2 font-mono">Strg</td><td className="py-2">Sprachausgabe stoppen</td></tr>
                      <tr><td className="py-2 font-mono">Ins + Q</td><td className="py-2">NVDA beenden</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-4">Schnellnavigation (Lesemodus)</h4>
                <p className="text-slate-600 mb-3">
                  Im Lesemodus können Sie mit einzelnen Tasten zu bestimmten Elementen springen:
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                  <div className="bg-slate-50 px-3 py-2 rounded"><span className="font-mono">H</span> = Überschrift</div>
                  <div className="bg-slate-50 px-3 py-2 rounded"><span className="font-mono">1-6</span> = Überschrift Level</div>
                  <div className="bg-slate-50 px-3 py-2 rounded"><span className="font-mono">K</span> = Link</div>
                  <div className="bg-slate-50 px-3 py-2 rounded"><span className="font-mono">F</span> = Formularfeld</div>
                  <div className="bg-slate-50 px-3 py-2 rounded"><span className="font-mono">B</span> = Button</div>
                  <div className="bg-slate-50 px-3 py-2 rounded"><span className="font-mono">G</span> = Grafik</div>
                  <div className="bg-slate-50 px-3 py-2 rounded"><span className="font-mono">T</span> = Tabelle</div>
                  <div className="bg-slate-50 px-3 py-2 rounded"><span className="font-mono">L</span> = Liste</div>
                  <div className="bg-slate-50 px-3 py-2 rounded"><span className="font-mono">D</span> = Landmark</div>
                </div>
                <p className="text-slate-600 text-sm mt-3">
                  <strong>Tipp:</strong> Shift + Taste springt zum vorherigen Element
                  (z.B. Shift + H = vorherige Überschrift).
                </p>
              </div>

              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-4">Elementlisten</h4>
                <div className="text-sm text-slate-700 space-y-1">
                  <p><span className="font-mono bg-slate-100 px-2 py-1 rounded">Ins + F7</span> = Elementliste oeffnen</p>
                  <p className="text-slate-600 ml-4">Dann: Alt + H für Überschriften, Alt + K für Links</p>
                </div>
              </div>
            </div>
          </section>

          {/* Der 30-Minuten-Test */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <Play className="w-6 h-6 text-orange-500" />
              Der 30-Minuten-Test: Schritt für Schritt
            </h2>

            <div className="bg-orange-50 rounded-xl p-6 border border-orange-100 not-prose mb-6">
              <h4 className="font-semibold text-orange-900 mb-3">Vorbereitung (2 Minuten)</h4>
              <ul className="space-y-1 text-orange-800">
                <li>✓ NVDA starten (falls nicht automatisch)</li>
                <li>✓ Firefox oeffnen</li>
                <li>✓ Sprachbetrachter aktivieren</li>
                <li>✓ Ihre Website aufrufen</li>
              </ul>
            </div>

            <div className="space-y-6 not-prose">
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <div className="flex items-start gap-4">
                  <FileText className="w-6 h-6 text-blue-500 shrink-0 mt-1" />
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-2">Test 1: Seitentitel (1 Minute)</h4>
                    <p className="text-slate-700 mb-2">
                      <strong>Was Sie tun:</strong> Laden Sie die Startseite. NVDA liest automatisch
                      den Seitentitel vor.
                    </p>
                    <p className="text-slate-700 mb-2">
                      <strong>Was Sie prüfen:</strong> Wird ein aussagekräftiger Titel vorgelesen?
                    </p>
                    <p className="text-slate-600 text-sm">
                      <strong>Typische Fehler:</strong> "Startseite" (zu generisch), nur der Organisationsname,
                      technische Bezeichnungen ("index.html")
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <div className="flex items-start gap-4">
                  <List className="w-6 h-6 text-purple-500 shrink-0 mt-1" />
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-2">Test 2: Überschriftenstruktur (5 Minuten)</h4>
                    <p className="text-slate-700 mb-2">
                      <strong>Was Sie tun:</strong> Druecken Sie Ins + F7, dann Alt + H für die Überschriftenliste.
                    </p>
                    <p className="text-slate-700 mb-2">
                      <strong>Was Sie prüfen:</strong> Gibt es eine H1? Ist die Hierarchie logisch (H1 → H2 → H3)?
                    </p>
                    <p className="text-slate-600 text-sm">
                      <strong>Typische Fehler:</strong> Keine H1, Spruenge in der Hierarchie (H1 → H3),
                      Überschriften nur wegen der Formatierung
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <div className="flex items-start gap-4">
                  <Search className="w-6 h-6 text-green-500 shrink-0 mt-1" />
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-2">Test 3: Navigation (5 Minuten)</h4>
                    <p className="text-slate-700 mb-2">
                      <strong>Was Sie tun:</strong> Druecken Sie Tab wiederholt, um durch die interaktiven
                      Elemente zu navigieren.
                    </p>
                    <p className="text-slate-700 mb-2">
                      <strong>Was Sie prüfen:</strong> Erreichen Sie alle Menüpunkte? Ist die Reihenfolge logisch?
                      Gibt es einen "Skip to content"-Link?
                    </p>
                    <p className="text-slate-600 text-sm">
                      <strong>Typische Fehler:</strong> Untermenues nur bei Mouse-Hover, kein Skip-Link,
                      unlogische Tab-Reihenfolge
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <div className="flex items-start gap-4">
                  <LinkIcon className="w-6 h-6 text-blue-500 shrink-0 mt-1" />
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-2">Test 4: Links (5 Minuten)</h4>
                    <p className="text-slate-700 mb-2">
                      <strong>Was Sie tun:</strong> Druecken Sie Ins + F7 für die Linkliste.
                    </p>
                    <p className="text-slate-700 mb-2">
                      <strong>Was Sie prüfen:</strong> Sind die Linktexte aussagekräftig? Kann man das
                      Linkziel verstehen?
                    </p>
                    <p className="text-slate-600 text-sm">
                      <strong>Typische Fehler:</strong> "Hier klicken", "Mehr", "Weiterlesen" (nichtssagend),
                      mehrfach "Download" ohne Unterscheidung
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <div className="flex items-start gap-4">
                  <Image className="w-6 h-6 text-pink-500 shrink-0 mt-1" />
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-2">Test 5: Bilder (5 Minuten)</h4>
                    <p className="text-slate-700 mb-2">
                      <strong>Was Sie tun:</strong> Druecken Sie wiederholt G, um durch die Bilder zu navigieren.
                    </p>
                    <p className="text-slate-700 mb-2">
                      <strong>Was Sie prüfen:</strong> Haben informative Bilder Alt-Texte? Sind sie aussagekräftig?
                    </p>
                    <p className="text-slate-600 text-sm">
                      <strong>Typische Fehler:</strong> "Bild", "Grafik", "IMG_1234.jpg", Alt-Text beschreibt nicht
                      was zu sehen ist
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <div className="flex items-start gap-4">
                  <FormInput className="w-6 h-6 text-orange-500 shrink-0 mt-1" />
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-2">Test 6: Formular (7 Minuten)</h4>
                    <p className="text-slate-700 mb-2">
                      <strong>Was Sie tun:</strong> Navigieren Sie zu einem Formular. Druecken Sie F für das
                      erste Feld, dann Tab für weitere.
                    </p>
                    <p className="text-slate-700 mb-2">
                      <strong>Was Sie prüfen:</strong> Wird bei jedem Feld erklärt, was einzugeben ist?
                      Sind Pflichtfelder gekennzeichnet?
                    </p>
                    <p className="text-slate-600 text-sm mb-2">
                      <strong>Typische Fehler:</strong> NVDA sagt nur "Eingabefeld" ohne Beschreibung,
                      Pflichtfelder nicht erkennbar
                    </p>
                    <p className="text-slate-700 font-medium">
                      Test: Fuellen Sie das Formular absichtlich falsch aus und senden Sie es ab.
                      Werden Fehlermeldungen vorgelesen?
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Typische Probleme */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-red-500" />
              Typische Probleme erkennen
            </h2>

            <div className="space-y-4 not-prose">
              <div className="bg-red-50 rounded-xl p-5 border border-red-100">
                <h4 className="font-semibold text-red-900 mb-2">"Grafik" ohne Beschreibung</h4>
                <p className="text-red-800 mb-2">
                  <strong>Was Sie hoeren:</strong> "Grafik" oder "Grafik, Link"
                </p>
                <p className="text-red-700">
                  <strong>Lösung:</strong> Aussagekräftigen Alt-Text ergänzen.
                </p>
              </div>

              <div className="bg-red-50 rounded-xl p-5 border border-red-100">
                <h4 className="font-semibold text-red-900 mb-2">"Link, Link, Link"</h4>
                <p className="text-red-800 mb-2">
                  <strong>Was Sie hoeren:</strong> Mehrere Links hintereinander, die nur "Link" genannt werden.
                </p>
                <p className="text-red-700">
                  <strong>Typisches Beispiel:</strong> Social-Media-Icons ohne Beschreibung.
                </p>
              </div>

              <div className="bg-red-50 rounded-xl p-5 border border-red-100">
                <h4 className="font-semibold text-red-900 mb-2">Überschriftenspruenge</h4>
                <p className="text-red-800 mb-2">
                  <strong>Was Sie sehen:</strong> H1, H3, H2, H4 – durcheinander
                </p>
                <p className="text-red-700">
                  Verwirrend für Screenreader-Nutzer, die nach Überschriften navigieren.
                </p>
              </div>

              <div className="bg-red-50 rounded-xl p-5 border border-red-100">
                <h4 className="font-semibold text-red-900 mb-2">"Eingabefeld" ohne Kontext</h4>
                <p className="text-red-800 mb-2">
                  <strong>Was Sie hoeren:</strong> "Eingabefeld, Bearbeiten" – aber nicht, was eingegeben werden soll.
                </p>
                <p className="text-red-700">
                  <strong>Bedeutet:</strong> Das Formularfeld hat kein verknüpftes Label.
                </p>
              </div>

              <div className="bg-red-50 rounded-xl p-5 border border-red-100">
                <h4 className="font-semibold text-red-900 mb-2">Tastaturfalle</h4>
                <p className="text-red-800 mb-2">
                  <strong>Was passiert:</strong> Sie können mit Tab in ein Element hinein, aber nicht mehr hinaus.
                </p>
                <p className="text-red-700">
                  <strong>Bedeutet:</strong> Das JavaScript-Widget hat keine Tastaturunterstützung.
                </p>
              </div>
            </div>
          </section>

          {/* Ergebnisse dokumentieren */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <FileText className="w-6 h-6 text-blue-500" />
              Ergebnisse dokumentieren und weitergeben
            </h2>

            <div className="bg-white rounded-xl p-6 border border-slate-200 not-prose mb-6">
              <h4 className="font-semibold text-slate-900 mb-4">Für jedes Problem notieren</h4>
              <ul className="space-y-2 text-slate-700">
                <li><strong>Wo:</strong> URL und Element (z.B. "Startseite, Bild unter 'Aktuelles'")</li>
                <li><strong>Was:</strong> Was NVDA vorgelesen hat (oder nicht)</li>
                <li><strong>Warum problematisch:</strong> Welche Barriere entsteht</li>
                <li><strong>Empfehlung:</strong> Konkrete Lösung</li>
                <li><strong>Priorität:</strong> Hoch/Mittel/Niedrig</li>
              </ul>
            </div>

            <div className="bg-violet-50 rounded-xl p-6 border border-violet-100 not-prose">
              <h4 className="font-semibold text-blue-900 mb-3">An die Entwicklung uebergeben</h4>
              <p className="text-violet-800">
                Entwickler brauchen konkrete Informationen: Exakte URL, welches HTML-Element betroffen ist,
                was der erwartete Zustand waere, ggf. Code-Beispiel für die Lösung.
              </p>
            </div>
          </section>

          {/* Fazit */}
          <section className="mb-12">
            <div className="bg-gradient-to-br from-orange-50 to-blue-50 rounded-2xl p-8 border border-orange-100 not-prose">
              <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
                <Lightbulb className="w-6 h-6 text-amber-500" />
                Fazit: 30 Minuten, die sich lohnen
              </h2>
              <p className="text-slate-700 mb-4">
                Ein Screenreader-Test ist keine Raketenwissenschaft. Mit NVDA, etwas Vorbereitung und
                dieser Anleitung können Sie in 30 Minuten Barrieren finden, die kein automatisches
                Tool erkennt.
              </p>
              <p className="text-slate-700 mb-4">
                Der wichtigste Effekt ist vielleicht nicht einmal die Fehlerliste – sondern der
                <strong> Perspektivwechsel</strong>. Wenn Sie einmal erlebt haben, wie frustrierend
                eine Website ohne vernuenftige Überschriften oder mit nichtssagenden Linktexten ist,
                werden Sie nie wieder so entwickeln.
              </p>
              <p className="text-slate-900 font-semibold text-lg">
                Machen Sie den Test zur Gewohnheit: Jede neue Seite, jedes neue Feature einmal mit
                NVDA durchgehen. Es dauert nicht lange – und es macht Ihre Website für alle besser.
              </p>
            </div>
          </section>

          {/* Ressourcen */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <BookOpen className="w-6 h-6 text-purple-500" />
              Weiterfuehrende Ressourcen
            </h2>

            <div className="space-y-3 not-prose">
              <a href="https://nvda.bhvd.de/userguide/" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 hover:border-purple-300 transition-colors">
                <BookOpen className="w-5 h-5 text-purple-500" />
                <div>
                  <p className="font-medium text-slate-900">NVDA Benutzerhandbuch</p>
                  <p className="text-sm text-slate-600">Offizielle deutschsprachige Dokumentation</p>
                </div>
              </a>
              <a href="https://webaim.org/articles/nvda/" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 hover:border-purple-300 transition-colors">
                <BookOpen className="w-5 h-5 text-purple-500" />
                <div>
                  <p className="font-medium text-slate-900">WebAIM NVDA Guide</p>
                  <p className="text-sm text-slate-600">Ausfuehrliche englischsprachige Anleitung</p>
                </div>
              </a>
              <a href="https://dequeuniversity.com/screenreaders/nvda-keyboard-shortcuts" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 hover:border-purple-300 transition-colors">
                <Keyboard className="w-5 h-5 text-purple-500" />
                <div>
                  <p className="font-medium text-slate-900">Deque NVDA Cheat Sheet</p>
                  <p className="text-sm text-slate-600">Tastenkombinationen zum Ausdrucken</p>
                </div>
              </a>
            </div>
          </section>

        </article>

        {/* CTA Section */}
        <div className="bg-gradient-to-br from-orange-500 to-pink-600 rounded-2xl p-8 md:p-10 text-center text-white">
          <h2 className="text-2xl md:text-3xl font-semibold mb-4">
            Barrierefreiheit automatisiert prüfen
          </h2>
          <p className="text-white/80 mb-8 max-w-xl mx-auto">
            Ergaenzen Sie manuelle Screenreader-Tests mit automatisierten Checks.
            VoxDrop prueft Ihre Website auf WCAG-Konformitaet.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/tools/web-pruefung">
              <Button className="h-12 px-8 rounded-xl bg-white text-orange-600 hover:bg-slate-100 font-semibold">
                Kostenlos prüfen
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
            <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-pink-600 rounded-full flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-medium text-slate-900 mb-1">Fragen zum Screenreader-Testen?</p>
              <p className="text-slate-600 text-sm mb-2">
                Wir helfen gerne weiter – bei der Barrierefreiheit Ihrer Website oder bei technischen Fragen.
              </p>
              <a href="mailto:hallo@voxdrop.live" className="text-orange-600 hover:text-orange-700 font-medium">
                hallo@voxdrop.live
              </a>
            </div>
          </div>
        </div>

        {/* Author */}
        <div className="mt-8 pt-8 border-t border-slate-200">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-pink-600 rounded-full flex items-center justify-center">
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
