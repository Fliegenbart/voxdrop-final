import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import { Shield, Server, Lock, Trash2, Download, Mail, Building2 } from "lucide-react";

export default function Datenschutz() {
  return (
    <PageLayout>
      <SEO
        title="Datenschutzerklärung"
        description="DSGVO-konforme Datenverarbeitung bei VoxDrop. Lokale Verarbeitung auf deutschen Servern, keine US-Cloud, sofortige Löschung nach Verarbeitung."
        canonical="/datenschutz"
      />


      {/* Hero Section */}
      <header className="pt-16 pb-12 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-violet-50 text-violet-700 rounded-full text-sm font-medium mb-6">
            <Shield className="w-4 h-4" />
            DSGVO-konform
          </div>
	          <h1 className="text-4xl md:text-5xl font-semibold text-slate-900 tracking-tight mb-4">
	            Datenschutz&shy;erklärung
	          </h1>
	          <p className="text-xl text-slate-600 font-light max-w-2xl mx-auto">
	            Ihre Daten gehören Ihnen. Wir verarbeiten alles lokal auf deutschen Servern.
	          </p>
	        </div>
	      </header>

      <main id="main-content" className="max-w-4xl mx-auto px-6 pb-24" tabIndex={-1}>
        {/* Highlights */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 text-center">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Server className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="font-semibold text-slate-900 mb-2">Deutsche Server</h3>
            <p className="text-sm text-slate-600">Hosting bei Hetzner in Deutschland. Keine US-Cloud.</p>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-slate-200 text-center">
            <div className="w-12 h-12 bg-violet-100 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Lock className="w-6 h-6 text-violet-600" />
            </div>
            <h3 className="font-semibold text-slate-900 mb-2">Lokale KI (Standard)</h3>
            <p className="text-sm text-slate-600">Transkription erfolgt standardmäßig auf unserem Server. Cloud-Modus nur wenn explizit aktiviert.</p>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-slate-200 text-center">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-purple-600" />
            </div>
            <h3 className="font-semibold text-slate-900 mb-2">Automatische Löschung</h3>
            <p className="text-sm text-slate-600">Dateien werden nach Verarbeitung oder spätestens nach 24-72h gelöscht.</p>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-8 md:p-12 prose prose-gray max-w-none">

            <h2 className="text-2xl font-semibold text-slate-900 mb-4 flex items-center gap-3">
              <Building2 className="w-6 h-6 text-violet-600" />
              1. Verantwortlicher
            </h2>
            <p className="text-slate-700 mb-6">
              Verantwortlich für die Datenverarbeitung auf dieser Website ist:
            </p>
            <div className="bg-slate-50 rounded-xl p-6 mb-8">
              <p className="text-slate-900 font-medium">David Wegener Marketing Consulting GmbH</p>
              <p className="text-slate-600">
                Stockmeyerstraße 43<br />
                20457 Hamburg<br />
                Deutschland
              </p>
              <p className="text-slate-600 mt-4">
                Telefon: 0176 10401247<br />
                E-Mail: <a href="mailto:datenschutz@voxdrop.live" className="text-violet-600 hover:underline">datenschutz@voxdrop.live</a>
              </p>
            </div>

            <h2 className="text-2xl font-semibold text-slate-900 mb-4 mt-12">2. Welche Daten wir verarbeiten</h2>

            <h3 className="text-xl font-semibold text-slate-900 mb-3 mt-8">2.1 Nutzerkonto (optional)</h3>
            <p className="text-slate-700 mb-4">
              Wenn Sie ein Konto erstellen, speichern wir:
            </p>
	            <ul className="list-disc list-inside text-slate-700 mb-6 space-y-2">
	              <li><strong>E-Mail-Adresse</strong> - für Login und Kommunikation</li>
	              <li><strong>Passwort</strong> - verschlüsselt gespeichert (bcrypt, 12 Runden)</li>
	              <li><strong>Organisation</strong> - falls angegeben</li>
	              <li><strong>Nutzungsstatistik</strong> - Anzahl Transkriptionen/Videos pro Monat</li>
	            </ul>
	            <p className="text-slate-700 mb-6">
	              <strong>Speicherdauer:</strong> Solange Ihr Konto besteht. Nach Kontolöschung werden Kontodaten gelöscht,
	              Audit-Logs anonymisiert und zugehörige Dateien entfernt. Rechnungsdaten bewahren wir 10 Jahre auf
	              (gesetzliche Aufbewahrungspflicht gemäß HGB/AO).<br />
	              <strong>Rechtsgrundlage:</strong> Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO)
	            </p>

            <h3 className="text-xl font-semibold text-slate-900 mb-3 mt-8">2.2 Audio- und Videodateien</h3>
            <p className="text-slate-700 mb-4">
              Wenn Sie Dateien zur Transkription hochladen:
            </p>
            <ul className="list-disc list-inside text-slate-700 mb-6 space-y-2">
              <li>Dateien werden <strong>nur während der Verarbeitung</strong> gespeichert</li>
              <li>Verarbeitung erfolgt <strong>standardmäßig lokal auf unserem deutschen Server</strong> (Hetzner)</li>
              <li>Keine Übertragung an Drittanbieter (OpenAI, Google, etc.) im Standardbetrieb</li>
              <li>Dateien werden nach Verarbeitung gelöscht oder spätestens nach 24-72h automatisch entfernt</li>
            </ul>
            <p className="text-slate-700 mb-6">
              <strong>Optionaler Cloud-Modus:</strong> Falls der Betreiber den Cloud-Modus für Transkription
              explizit aktiviert, werden Audiodaten an einen externen KI-Dienst (z.B. OpenAI) übermittelt.
              In diesem Fall informieren wir vorab und passen die Datenschutzerklärung entsprechend an.
            </p>

            <h4 className="text-lg font-semibold text-slate-900 mb-3">Transkripte</h4>
            <p className="text-slate-700 mb-6">
              Die generierten Transkripte werden <strong>nicht auf unseren Servern gespeichert</strong>.
              Sie werden direkt an Sie übermittelt und verbleiben ausschließlich auf Ihrem Gerät.
              Wir haben keinen Zugriff auf Ihre Transkripte.
            </p>
	            <p className="text-slate-700 mb-6">
	              <strong>Speicherdauer:</strong> Keine Speicherung - sofortige Löschung nach Übermittlung<br />
	              <strong>Rechtsgrundlage:</strong> Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO)
	            </p>

            <h3 className="text-xl font-semibold text-slate-900 mb-3 mt-8">2.3 Dateien, Freigaben und Zwischenresultate</h3>
            <p className="text-slate-700 mb-4">
              Für Funktionen wie Dateifreigabe, Aufnahmen, PPTX-Konvertierung oder Podcast-Erstellung
              speichern wir Dateien vorübergehend auf dem Server.
            </p>
            <ul className="list-disc list-inside text-slate-700 mb-6 space-y-2">
              <li><strong>Aufnahmen</strong>: maximal 24 Stunden</li>
              <li><strong>Dateifreigaben</strong>: 24-72 Stunden (je nach gewählter Laufzeit)</li>
              <li><strong>Job-Ergebnisse</strong>: maximal 24 Stunden</li>
            </ul>
	            <p className="text-slate-700 mb-6">
	              <strong>Rechtsgrundlage:</strong> Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO)
	            </p>

            <h3 className="text-xl font-semibold text-slate-900 mb-3 mt-8">2.4 Protokolldaten (Audit-Logs)</h3>
            <p className="text-slate-700 mb-4">
              Für Sicherheitszwecke speichern wir:
            </p>
            <ul className="list-disc list-inside text-slate-700 mb-6 space-y-2">
              <li><strong>IP-Adresse</strong> - anonymisiert durch Hashing (SHA-256)</li>
              <li><strong>Zeitstempel</strong> - wann Aktionen durchgeführt wurden</li>
              <li><strong>Aktionstyp</strong> - z.B. Login, Transkription gestartet</li>
            </ul>
	            <p className="text-slate-700 mb-6">
	              <strong>Speicherdauer:</strong> 90 Tage<br />
	              <strong>Rechtsgrundlage:</strong> Berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO) - Sicherheit und Missbrauchsprävention
	            </p>

            <h2 className="text-2xl font-semibold text-slate-900 mb-4 mt-12">3. Keine Tracking-Cookies, kein Tracking</h2>
            <p className="text-slate-700 mb-6">
              Wir setzen <strong>keine Tracking-Cookies</strong> ein und nutzen keine Dienste zur
              Besucheranalyse oder zum Marketing-Tracking.
            </p>
            <ul className="list-disc list-inside text-slate-700 mb-6 space-y-2">
              <li><strong>Keine Tracking-Cookies</strong></li>
              <li><strong>Keine Tracking-Pixel</strong></li>
              <li><strong>Keine Analytics-Dienste</strong> (Google Analytics, etc.)</li>
              <li><strong>Keine Social-Media-Plugins</strong></li>
            </ul>
            <p className="text-slate-700 mb-4">
              Zur Bereitstellung der notwendigen Funktionalität (z.B. UI-Einstellungen wie Sidebar-Status,
              Upload-Optionen oder zuletzt verwendete Tool-Konfigurationen) nutzen wir den lokalen Speicher
              (LocalStorage) Ihres Browsers. Diese Daten bleiben auf Ihrem Gerät und werden nicht zu Werbezwecken
              an Dritte weitergegeben.
            </p>
            <p className="text-slate-700 mb-6">
              Für den Login verwenden wir technisch notwendige, sichere Session-Cookies (HttpOnly), damit
              Ihre Anmeldung im Browser funktioniert. Diese Cookies dienen nicht dem Tracking.
            </p>

            <h2 className="text-2xl font-semibold text-slate-900 mb-4 mt-12">4. Hosting und Auftragsverarbeitung</h2>
            <p className="text-slate-700 mb-4">
              Unsere Server werden betrieben von:
            </p>
            <div className="bg-slate-50 rounded-xl p-6 mb-6">
              <p className="text-slate-900 font-medium">Hetzner Online GmbH</p>
              <p className="text-slate-600">
                Industriestr. 25<br />
                91710 Gunzenhausen<br />
                Deutschland
              </p>
            </div>
            <p className="text-slate-700 mb-6">
              Mit Hetzner besteht ein Auftragsverarbeitungsvertrag (AVV) gemäß Art. 28 DSGVO.
              Alle Daten werden ausschließlich in deutschen Rechenzentren verarbeitet.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mb-3 mt-8">4.2 E-Mail-Versand</h3>
            <p className="text-slate-700 mb-4">
              Für den Versand von E-Mails (z.B. E-Mail-Verifizierung, Benachrichtigungen) nutzen wir:
            </p>
            <div className="bg-slate-50 rounded-xl p-6 mb-6">
              <p className="text-slate-900 font-medium">Resend Inc.</p>
              <p className="text-slate-600">
                E-Mail-Dienstleister für transaktionale E-Mails<br />
                <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:underline">resend.com/legal/privacy-policy</a>
              </p>
            </div>
            <p className="text-slate-700 mb-6">
              An Resend wird ausschließlich Ihre E-Mail-Adresse übermittelt, um Ihnen E-Mails zuzustellen.
              Resend ist unter dem <strong>EU-US Data Privacy Framework (DPF)</strong> zertifiziert.
              Rechtsgrundlage für die Datenübermittlung in die USA ist der <strong>Angemessenheitsbeschluss</strong>
              nach Art. 45 DSGVO.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mb-3 mt-8">4.3 Einwilligung bei Registrierung</h3>
            <p className="text-slate-700 mb-6">
              Bei der Registrierung holen wir Ihre ausdrückliche Einwilligung zur Datenverarbeitung ein (Art. 7 DSGVO).
              Diese Einwilligung wird mit Zeitstempel und Version in unserer Datenbank dokumentiert.
              Sie können Ihre Einwilligung jederzeit widerrufen, indem Sie Ihr Konto löschen.
            </p>

	            <h3 className="text-xl font-semibold text-slate-900 mb-3 mt-8">4.4 Verarbeitungsaufträge (Jobs)</h3>
	            <p className="text-slate-700 mb-6">
	              Temporäre Verarbeitungsdaten (z.B. bei Transkriptionen, Konvertierungen) werden maximal 24 Stunden
	              zwischengespeichert und anschließend automatisch gelöscht.
	            </p>

            <h2 className="text-2xl font-semibold text-slate-900 mb-4 mt-12 flex items-center gap-3">
              <Download className="w-6 h-6 text-violet-600" />
              5. Ihre Rechte
            </h2>
            <p className="text-slate-700 mb-4">
              Sie haben folgende Rechte bezüglich Ihrer Daten:
            </p>

            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="bg-violet-50 rounded-xl p-5 border border-violet-100">
                <h4 className="font-semibold text-slate-900 mb-2">Auskunft (Art. 15)</h4>
                <p className="text-sm text-slate-600">
                  Sie können jederzeit Auskunft über Ihre gespeicherten Daten anfordern.
                </p>
              </div>
              <div className="bg-green-50 rounded-xl p-5 border border-green-100">
                <h4 className="font-semibold text-slate-900 mb-2">Datenexport (Art. 20)</h4>
                <p className="text-sm text-slate-600">
                  Exportieren Sie alle Ihre Daten als JSON-Datei direkt in Ihrem Konto.
                </p>
              </div>
              <div className="bg-purple-50 rounded-xl p-5 border border-purple-100">
                <h4 className="font-semibold text-slate-900 mb-2">Berichtigung (Art. 16)</h4>
                <p className="text-sm text-slate-600">
                  Unrichtige Daten können Sie jederzeit korrigieren lassen.
                </p>
              </div>
              <div className="bg-red-50 rounded-xl p-5 border border-red-100">
                <h4 className="font-semibold text-slate-900 mb-2">Löschung (Art. 17)</h4>
                <p className="text-sm text-slate-600">
                  Löschen Sie Ihr Konto und alle Daten mit einem Klick in den Einstellungen.
                </p>
              </div>
              <div className="bg-orange-50 rounded-xl p-5 border border-orange-100">
	                <h4 className="font-semibold text-slate-900 mb-2">Einschränkung (Art. 18)</h4>
	                <p className="text-sm text-slate-600">
	                  Sie können die Einschränkung der Verarbeitung Ihrer Daten verlangen.
	                </p>
              </div>
              <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2">Widerspruch (Art. 21)</h4>
                <p className="text-sm text-slate-600">
                  Sie können der Verarbeitung Ihrer Daten jederzeit widersprechen.
                </p>
              </div>
            </div>

	            <p className="text-slate-700 mb-6">
	              Für die Ausübung Ihrer Rechte kontaktieren Sie uns unter:{" "}
	              <a href="mailto:datenschutz@voxdrop.live" className="text-violet-600 hover:underline">datenschutz@voxdrop.live</a>
	            </p>

            <h2 className="text-2xl font-semibold text-slate-900 mb-4 mt-12">6. Beschwerderecht</h2>
            <p className="text-slate-700 mb-6">
              Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren.
              Die für uns zuständige Behörde ist:
            </p>
            <div className="bg-slate-50 rounded-xl p-6 mb-6">
              <p className="text-slate-900 font-medium">Der Hamburgische Beauftragte für Datenschutz und Informationsfreiheit</p>
              <p className="text-slate-600">
                Ludwig-Erhard-Str. 22, 7. OG<br />
                20459 Hamburg<br />
                <a href="https://datenschutz-hamburg.de" target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:underline">datenschutz-hamburg.de</a>
              </p>
            </div>

            <h2 className="text-2xl font-semibold text-slate-900 mb-4 mt-12">7. Änderungen</h2>
            <p className="text-slate-700 mb-6">
              Diese Datenschutzerklärung kann gelegentlich aktualisiert werden.
              Die aktuelle Version finden Sie immer auf dieser Seite.
            </p>
            <p className="text-slate-600 text-sm">
              Stand: Januar 2026
            </p>

          </div>
        </div>

        {/* Contact CTA */}
        <div className="mt-12 bg-gradient-to-br from-violet-600 to-purple-700 rounded-2xl p-8 text-center text-white">
          <Mail className="w-12 h-12 mx-auto mb-4 opacity-80" />
          <h2 className="text-2xl font-semibold mb-3">Fragen zum Datenschutz?</h2>
          <p className="text-white/80 mb-6">
            Wir beantworten Ihre Fragen gerne innerhalb von 24 Stunden.
          </p>
          <a
            href="mailto:datenschutz@voxdrop.live"
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-violet-600 rounded-xl font-semibold hover:bg-slate-100 transition-colors"
          >
            <Mail className="w-4 h-4" />
            datenschutz@voxdrop.live
          </a>
        </div>
      </main>

    </PageLayout>
  );
}
