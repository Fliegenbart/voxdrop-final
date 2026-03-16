import { Button } from "@/components/ui/button";
import { PageLayout } from "@/components/PageLayout";
import { SEO, ArticleSchema } from "@/components/SEO";
import { getBlogPost, formatDate } from "@/lib/blog-posts";
import {
  CheckCircle2, ArrowRight, Calendar, Clock, ArrowLeft,
  BookOpen, AlertTriangle, Keyboard,
  Eye, Type, Clock3, ShieldCheck, Languages, FormInput
} from "lucide-react";
import { Link } from "wouter";

export default function BarrierefreieFormulare() {
  const post = getBlogPost("barrierefreie-formulare");

  return (
    <PageLayout>
      <SEO
        title="Barrierefreie Online-Formulare: Der unterschätzte Stolperstein"
        description="Wenn die Überwachungsstelle anruft, geht es in 9 von 10 Fällen um Formulare. Die 10 häufigsten Formular-Fehler und wie Sie sie beheben - mit Code-Beispielen."
        canonical="/blog/barrierefreie-formulare"
        ogType="article"
      />
      <ArticleSchema
        title="Barrierefreie Online-Formulare: Der unterschätzte Stolperstein"
        description="Ein Praxisleitfaden für Webmaster, Entwickler und Digitalisierungsbeauftragte."
        url="/blog/barrierefreie-formulare"
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
                14 min Lesezeit
              </span>
            </div>
          </div>

          <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight mb-4">
            Barrierefreie Online-Formulare: Der unterschätzte Stolperstein
          </h1>
          <p className="text-xl text-slate-600 font-light">
            Ein Praxisleitfaden für Webmaster, Entwickler und Digitalisierungsbeauftragte.
            Mit konkreten Lösungen und Code-Beispielen.
          </p>
        </div>
      </header>

      <main id="main-content" className="max-w-3xl mx-auto px-6 pb-24" tabIndex={-1}>

        {/* Warning Banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-12">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h2 className="font-semibold text-amber-900 mb-1">Formulare sind der Schwachpunkt Nr. 1</h2>
              <p className="text-amber-700">
                Wenn die Überwachungsstelle für Barrierefreiheit anruft, geht es in 9 von 10 Fällen um Formulare.
                Hier scheitern die meisten kommunalen Websites. Die gute Nachricht: Die häufigsten Fehler
                sind mit überschaubarem Aufwand zu beheben.
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
            <a href="#warum-kritisch" className="block text-purple-600 hover:text-purple-800">1. Warum Formulare so kritisch sind</a>
            <a href="#fehler" className="block text-purple-600 hover:text-purple-800">2. Die 10 häufigsten Formular-Fehler</a>
            <a href="#leichte-sprache" className="block text-purple-600 hover:text-purple-800">3. Leichte Sprache in Formularen</a>
            <a href="#checkliste" className="block text-purple-600 hover:text-purple-800">4. Checkliste für barrierefreie Formulare</a>
          </nav>
        </div>

        {/* Content Sections */}
        <article className="prose prose-gray max-w-none">

          {/* Section 1 */}
          <section id="warum-kritisch" className="mb-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <FormInput className="w-6 h-6 text-purple-600" />
              Warum Formulare so kritisch sind
            </h2>
            <p className="text-slate-700 mb-4">
              Formulare sind das Herzstück der digitalen Verwaltung. Hier findet der eigentliche Bürgerservice statt:
              Anträge werden gestellt, Termine gebucht, Anliegen übermittelt. Wer an einem Formular scheitert,
              ist von der digitalen Verwaltung ausgeschlossen - egal wie barrierefrei der Rest der Website ist.
            </p>
            <p className="text-slate-700 mb-4">
              Die BITV 2.0 trägt dem Rechnung: Paragraph 3 Absatz 4 fordert, dass "Formulare, interaktive Prozesse
              und zentrale Einstiegsseiten ein hoechstmögliches Mass an Barrierefreiheit" aufweisen müssen.
              Das ist keine Kann-Bestimmung, sondern eine explizite Priorisierung.
            </p>

            <div className="bg-violet-50 rounded-xl p-5 border border-violet-100 not-prose mb-6">
              <h3 className="font-semibold text-blue-900 mb-3">Das Problem in Zahlen</h3>
              <p className="text-violet-800 text-sm mb-3">
                Eine Analyse der Barrierefreiheitserklärungen deutscher Kommunen zeigt ein wiederkehrendes Muster.
                Typische Einträge lauten:
              </p>
              <ul className="space-y-1 text-sm text-violet-700">
                <li>• "Beschriftungen für Formularelemente sind nicht korrekt verknüpft"</li>
                <li>• "Fehlermeldungen werden nicht bei allen Feldern ausgegeben"</li>
                <li>• "Das autocomplete-Attribut fehlt bei persönlichen Daten"</li>
                <li>• "Der Fokusrahmen ist nicht ausreichend sichtbar"</li>
              </ul>
            </div>
          </section>

          {/* Section 2: Die 10 Fehler */}
          <section id="fehler" className="mb-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold text-slate-900 mb-6 flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-red-600" />
              Die 10 häufigsten Formular-Fehler
            </h2>

            <div className="space-y-6 not-prose">

              {/* Fehler 1 */}
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center shrink-0 text-red-700 font-bold text-sm">1</div>
                  <div>
                    <h4 className="font-semibold text-slate-900">Fehlende oder falsch verknüpfte Labels</h4>
                    <p className="text-sm text-slate-500 mt-1">WCAG 1.3.1, 3.3.2</p>
                  </div>
                </div>
                <p className="text-slate-600 text-sm mb-4">
                  Eingabefelder haben keine Beschriftung, oder die Beschriftung ist nicht technisch mit dem Feld verknüpft.
                  Screenreader lesen nur "Eingabefeld, leer" - der Nutzer weiss nicht, was er eingeben soll.
                </p>
                <div className="bg-slate-50 rounded-lg p-4 font-mono text-xs">
                  <p className="text-red-600 mb-2">{"<!-- FALSCH: Label ohne Verknüpfung -->"}</p>
                  <p className="text-slate-600 mb-3">{"<label>Vorname</label>"}<br/>{"<input type=\"text\" name=\"vorname\">"}</p>
                  <p className="text-green-600 mb-2">{"<!-- RICHTIG: Label mit for-Attribut -->"}</p>
                  <p className="text-slate-600">{"<label for=\"vorname\">Vorname</label>"}<br/>{"<input type=\"text\" id=\"vorname\" name=\"vorname\">"}</p>
                </div>
              </div>

              {/* Fehler 2 */}
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center shrink-0 text-red-700 font-bold text-sm">2</div>
                  <div>
                    <h4 className="font-semibold text-slate-900">Placeholder statt Label</h4>
                    <p className="text-sm text-slate-500 mt-1">WCAG 3.3.2</p>
                  </div>
                </div>
                <p className="text-slate-600 text-sm mb-4">
                  Sobald der Nutzer zu tippen beginnt, verschwindet der Placeholder. Der Nutzer kann nicht mehr sehen,
                  was in das Feld gehört. Besonders problematisch bei längeren Formularen.
                </p>
                <div className="bg-amber-50 rounded-lg p-3 text-sm text-amber-800">
                  <strong>Lösung:</strong> Placeholder sind eine Ergänzung, kein Ersatz für Labels.
                </div>
              </div>

              {/* Fehler 3 */}
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center shrink-0 text-red-700 font-bold text-sm">3</div>
                  <div>
                    <h4 className="font-semibold text-slate-900">Unzureichende Fehlermeldungen</h4>
                    <p className="text-sm text-slate-500 mt-1">WCAG 3.3.1, 3.3.3</p>
                  </div>
                </div>
                <p className="text-slate-600 text-sm mb-4">
                  Bei Eingabefehlern erscheint nur "Es ist ein Fehler aufgetreten" oder das fehlerhafte Feld
                  wird nur farblich markiert. Der Nutzer weiss nicht, was genau falsch ist.
                </p>
                <div className="bg-slate-50 rounded-lg p-4 font-mono text-xs">
                  <p className="text-green-600 mb-2">{"<!-- RICHTIG: Spezifische Fehlermeldung -->"}</p>
                  <p className="text-slate-600">{"<input id=\"plz\" aria-describedby=\"plz-error\" aria-invalid=\"true\">"}<br/>{"<span id=\"plz-error\" role=\"alert\">"}<br/>{"  Bitte geben Sie eine gültige 5-stellige Postleitzahl ein."}<br/>{"</span>"}</p>
                </div>
              </div>

              {/* Fehler 4 */}
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center shrink-0 text-red-700 font-bold text-sm">4</div>
                  <div>
                    <h4 className="font-semibold text-slate-900">Pflichtfelder nur durch Farbe gekennzeichnet</h4>
                    <p className="text-sm text-slate-500 mt-1">WCAG 1.4.1</p>
                  </div>
                </div>
                <p className="text-slate-600 text-sm mb-4">
                  Pflichtfelder werden nur durch ein rotes Sternchen gekennzeichnet - ohne zusätzlichen Text
                  oder ARIA-Attribut. Farbenblinde und Screenreader-Nutzer erkennen nicht, welche Felder Pflicht sind.
                </p>
                <div className="bg-green-50 rounded-lg p-3 text-sm text-green-800">
                  <strong>Lösung:</strong> Kombinieren Sie visuelle und textuelle Kennzeichnung.
                  Zusätzlich: Erklären Sie am Formularbeginn, was das Sternchen bedeutet.
                </div>
              </div>

              {/* Fehler 5 */}
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center shrink-0 text-red-700 font-bold text-sm">5</div>
                  <div>
                    <h4 className="font-semibold text-slate-900">Keine Tastaturbedienung möglich</h4>
                    <p className="text-sm text-slate-500 mt-1">WCAG 2.1.1, 2.1.2</p>
                  </div>
                </div>
                <p className="text-slate-600 text-sm mb-4">
                  Custom-Dropdowns, Datepicker oder Autocomplete-Felder sind nur mit der Maus bedienbar.
                  Nutzer ohne Maus können das Formular nicht ausfüllen.
                </p>
                <div className="bg-violet-50 rounded-lg p-3 text-sm text-violet-800">
                  <strong>Test:</strong> Legen Sie die Maus beiseite. Können Sie das gesamte Formular
                  mit Tab, Enter und Pfeiltasten ausfüllen und absenden?
                </div>
              </div>

              {/* Fehler 6 */}
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center shrink-0 text-red-700 font-bold text-sm">6</div>
                  <div>
                    <h4 className="font-semibold text-slate-900">Fehlender oder unsichtbarer Fokusindikator</h4>
                    <p className="text-sm text-slate-500 mt-1">WCAG 2.4.7</p>
                  </div>
                </div>
                <p className="text-slate-600 text-sm mb-4">
                  Der Standard-Fokusrahmen wurde per CSS entfernt (outline: none), ohne eine Alternative anzubieten.
                  Bei Tastaturnavigation ist nicht erkennbar, welches Element fokussiert ist.
                </p>
                <div className="bg-slate-50 rounded-lg p-4 font-mono text-xs">
                  <p className="text-green-600 mb-2">{"/* RICHTIG: Eigenen Fokus-Stil definieren */"}</p>
                  <p className="text-slate-600">{"input:focus {"}<br/>{"  outline: 2px solid #0066cc;"}<br/>{"  outline-offset: 2px;"}<br/>{"}"}</p>
                </div>
              </div>

              {/* Fehler 7 */}
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center shrink-0 text-red-700 font-bold text-sm">7</div>
                  <div>
                    <h4 className="font-semibold text-slate-900">Zeitlimits ohne Verlängerungsmöglichkeit</h4>
                    <p className="text-sm text-slate-500 mt-1">WCAG 2.2.1</p>
                  </div>
                </div>
                <p className="text-slate-600 text-sm mb-4">
                  Formulare oder Sessions haben ein Zeitlimit, nach dem die Eingaben verloren gehen -
                  ohne Vorwarnung oder Verlängerungsoption. Nutzer, die langsamer tippen, verlieren ihre Eingaben.
                </p>
                <div className="bg-green-50 rounded-lg p-3 text-sm text-green-800">
                  <strong>Lösung:</strong> Warnen Sie vor Ablauf und bieten Sie eine Verlängerung an.
                  Ermöglichen Sie das Speichern von Zwischenständen bei langen Formularen.
                </div>
              </div>

              {/* Fehler 8 */}
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center shrink-0 text-red-700 font-bold text-sm">8</div>
                  <div>
                    <h4 className="font-semibold text-slate-900">CAPTCHAs ohne barrierefreie Alternative</h4>
                    <p className="text-sm text-slate-500 mt-1">WCAG 1.1.1</p>
                  </div>
                </div>
                <p className="text-slate-600 text-sm mb-4">
                  Zum Spam-Schutz wird ein visuelles CAPTCHA eingesetzt, das für Screenreader-Nutzer
                  oder Menschen mit Sehbehinderung nicht lösbar ist. Betroffene Nutzer sind vollständig ausgesperrt.
                </p>
                <div className="bg-violet-50 rounded-lg p-3 text-sm text-violet-800">
                  <strong>Alternativen:</strong> Honeypot-Felder, zeitbasierte Prüfung, reCAPTCHA v3 (arbeitet im Hintergrund),
                  Audio-CAPTCHA, oder logische Fragen wie "Welche Farbe hat Gras?"
                </div>
              </div>

              {/* Fehler 9 */}
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center shrink-0 text-red-700 font-bold text-sm">9</div>
                  <div>
                    <h4 className="font-semibold text-slate-900">Fehlende Autocomplete-Attribute</h4>
                    <p className="text-sm text-slate-500 mt-1">WCAG 1.3.5</p>
                  </div>
                </div>
                <p className="text-slate-600 text-sm mb-4">
                  Bei Feldern für persönliche Daten fehlen die autocomplete-Attribute. Browser und Passwort-Manager
                  können die Felder nicht automatisch ausfüllen - nachteilig für Nutzer mit motorischen Einschränkungen.
                </p>
                <div className="bg-slate-50 rounded-lg p-4 font-mono text-xs">
                  <p className="text-slate-600">{"<input type=\"text\" id=\"name\" autocomplete=\"name\">"}<br/>{"<input type=\"email\" id=\"email\" autocomplete=\"email\">"}<br/>{"<input type=\"text\" id=\"plz\" autocomplete=\"postal-code\">"}</p>
                </div>
              </div>

              {/* Fehler 10 */}
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center shrink-0 text-red-700 font-bold text-sm">10</div>
                  <div>
                    <h4 className="font-semibold text-slate-900">Unklare Formularstruktur</h4>
                    <p className="text-sm text-slate-500 mt-1">WCAG 1.3.1, 2.4.6</p>
                  </div>
                </div>
                <p className="text-slate-600 text-sm mb-4">
                  Lange Formulare haben keine erkennbare Struktur. Zusammengehörige Felder sind nicht gruppiert,
                  Abschnitte nicht beschriftet. Nutzer verlieren den Überblick.
                </p>
                <div className="bg-slate-50 rounded-lg p-4 font-mono text-xs">
                  <p className="text-green-600 mb-2">{"<!-- RICHTIG: fieldset und legend -->"}</p>
                  <p className="text-slate-600">{"<fieldset>"}<br/>{"  <legend>Persönliche Daten</legend>"}<br/>{"  <label for=\"vorname\">Vorname</label>"}<br/>{"  <input type=\"text\" id=\"vorname\">"}<br/>{"</fieldset>"}</p>
                </div>
              </div>

            </div>
          </section>

          {/* Section 3: Leichte Sprache */}
          <section id="leichte-sprache" className="mb-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold text-slate-900 mb-6 flex items-center gap-3">
              <Languages className="w-6 h-6 text-purple-600" />
              Leichte Sprache in Formularen
            </h2>

            <p className="text-slate-700 mb-4">
              Barrierefreie Formulare sind nicht nur technisch korrekt - sie sind auch verständlich.
              Hier kommt Leichte Sprache ins Spiel.
            </p>

            <div className="bg-white rounded-xl p-6 border border-slate-200 not-prose mb-6">
              <h4 className="font-semibold text-slate-900 mb-3">Das Problem komplexer Formulartexte</h4>
              <div className="bg-red-50 rounded-lg p-4 mb-4">
                <p className="text-sm text-red-800 italic">
                  "Ich versichere, dass die vorstehenden Angaben der Wahrheit entsprechen und mir bekannt ist,
                  dass unrichtige oder unvollständige Angaben strafrechtlich verfolgt werden können."
                </p>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <p className="text-sm text-green-800 font-medium mb-2">In Leichter Sprache:</p>
                <p className="text-sm text-green-800 italic">
                  "Ich habe die Wahrheit geschrieben. Ich weiss: Lügen ist verboten. Lügen kann bestraft werden."
                </p>
              </div>
            </div>

            <div className="bg-violet-50 rounded-xl p-5 border border-violet-100 not-prose">
              <h4 className="font-semibold text-blue-900 mb-2">VoxDrop für Formulare</h4>
              <p className="text-violet-800 text-sm">
                VoxDrop bietet speziell für Formulare zwei hilfreiche Funktionen:
                <strong> Leichte Sprache</strong> - Labels, Hilfetexte und Fehlermeldungen werden automatisch vereinfacht.
                <strong> Vorlesefunktion</strong> - Formulartexte werden vorgelesen, besonders hilfreich bei langen Erklärungen.
              </p>
            </div>
          </section>

          {/* Section 4: Checkliste */}
          <section id="checkliste" className="mb-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold text-slate-900 mb-6 flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
              Checkliste für barrierefreie Formulare
            </h2>

            <div className="space-y-6 not-prose">

              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Type className="w-5 h-5 text-violet-600" />
                  Struktur und Beschriftung
                </h4>
                <ul className="space-y-2 text-sm text-slate-700">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Jedes Eingabefeld hat ein verknüpftes Label
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Placeholder sind Ergänzung, nicht Ersatz für Labels
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Pflichtfelder sind textlich gekennzeichnet
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Zusammengehörige Felder sind mit fieldset/legend gruppiert
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Autocomplete-Attribute sind bei persönlichen Daten gesetzt
                  </li>
                </ul>
              </div>

              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-orange-600" />
                  Fehlermeldungen
                </h4>
                <ul className="space-y-2 text-sm text-slate-700">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Fehler werden spezifisch benannt (welches Feld, was ist falsch)
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Fehlermeldungen bieten Lösungshinweise
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Fehler sind programmatisch mit dem Feld verknüpft (aria-describedby)
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Fehlerzustand ist per aria-invalid markiert
                  </li>
                </ul>
              </div>

              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Keyboard className="w-5 h-5 text-purple-600" />
                  Tastaturbedienung
                </h4>
                <ul className="space-y-2 text-sm text-slate-700">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Alle Elemente sind per Tab erreichbar
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Die Tab-Reihenfolge ist logisch
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Custom-Elemente haben vollständige Tastaturunterstützung
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Es gibt keine Tastaturfallen
                  </li>
                </ul>
              </div>

              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Eye className="w-5 h-5 text-green-600" />
                  Visuelles Design
                </h4>
                <ul className="space-y-2 text-sm text-slate-700">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Fokusindikator ist deutlich sichtbar
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Textkontrast beträgt mindestens 4,5:1
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Fehlerzustände sind nicht nur durch Farbe erkennbar
                  </li>
                </ul>
              </div>

              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Clock3 className="w-5 h-5 text-violet-600" />
                  Zeitverhalten & Spam-Schutz
                </h4>
                <ul className="space-y-2 text-sm text-slate-700">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Zeitlimits sind verlängerbar
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    Vor Session-Ablauf wird gewarnt
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    CAPTCHA hat barrierefreie Alternative
                  </li>
                </ul>
              </div>

            </div>
          </section>

          {/* Fazit */}
          <section className="mb-12">
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-8 border border-green-100 not-prose">
              <h3 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-green-600" />
                Fazit: Formulare als Schlüssel zur Inklusion
              </h3>
              <p className="text-slate-700 mb-4">
                Barrierefreie Formulare sind kein Nice-to-Have - sie sind der Kern der digitalen Verwaltung.
                Wer hier versagt, schliesst Bürger aus. Wer hier überzeugt, schafft echte digitale Teilhabe.
              </p>
              <p className="text-slate-700 mb-4">
                Die gute Nachricht: Die meisten Fehler sind technisch einfach zu beheben. Label-Verknüpfungen,
                Fehlermeldungen, Fokusindikatoren - das sind keine Rocket-Science-Themen, sondern solides Handwerk.
              </p>
              <p className="text-slate-700 font-medium">
                Beginnen Sie mit den meistgenutzten Formularen: Kontaktformular, Terminbuchung, die wichtigsten Anträge.
                Und denken Sie daran: Ein barrierefreies Formular ist auch ein benutzerfreundliches Formular -
                davon profitieren alle Bürger.
              </p>
            </div>
          </section>

        </article>

        {/* CTA Section */}
        <div className="bg-gradient-to-br from-violet-600 to-purple-700 rounded-2xl p-8 md:p-10 text-center text-white">
          <h2 className="text-2xl md:text-3xl font-semibold mb-4">
            Machen Sie Ihre Formulare<br />barrierefrei
          </h2>
          <p className="text-white/80 mb-8 max-w-xl mx-auto">
            VoxDrop hilft Ihnen mit Leichter Sprache und Vorlesefunktion - DSGVO-konform und Made in Germany.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/">
              <Button className="h-12 px-8 rounded-xl bg-white text-violet-600 hover:bg-slate-100 font-semibold">
                Kostenlos starten
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <Link href="/tools/formular-check">
              <Button variant="outline" className="h-12 px-8 rounded-xl border-white/30 text-white hover:bg-white/10">
                Formular-Check testen
              </Button>
            </Link>
          </div>
        </div>
      </main>

    </PageLayout>
  );
}
