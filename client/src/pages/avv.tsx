import { FileText, Download, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import { PageLayout } from "@/components/PageLayout";

export default function AVV() {
  return (
    <PageLayout>
      <SEO
        title="Auftragsverarbeitungsvertrag (AVV)"
        description="Auftragsverarbeitungsvertrag nach Art. 28 DSGVO für VoxDrop. Rechtssichere Datenverarbeitung für Behörden und Unternehmen."
        canonical="/avv"
      />

      <main id="main-content" className="max-w-4xl mx-auto px-6 py-12" tabIndex={-1}>
        {/* Back Link */}
        <Link href="/behoerden">
          <span className="inline-flex items-center gap-2 text-violet-600 hover:text-violet-700 mb-8 cursor-pointer">
            <ArrowLeft className="w-4 h-4" />
            Zurück zur Behörden-Seite
          </span>
        </Link>

        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mb-8">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 bg-violet-50 rounded-xl flex items-center justify-center">
              <FileText className="w-6 h-6 text-violet-600" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                Auftragsverarbeitungsvertrag (AVV)
              </h1>
              <p className="text-slate-600 mt-1">
                Vertrag zur Auftragsverarbeitung nach Art. 28 DS-GVO
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <Button
              className="bg-violet-600 hover:bg-violet-700"
              onClick={() => typeof window !== 'undefined' && window.print()}
            >
              <Download className="w-4 h-4 mr-2" />
              AVV als PDF herunterladen
            </Button>
            <Button asChild variant="outline">
              <a href="mailto:anfrage@voxdrop.live?subject=AVV%20Word-Vorlage%20anfordern">
                <FileText className="w-4 h-4 mr-2" />
                Word-Vorlage anfordern
              </a>
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 prose prose-gray max-w-none">

          <h2>Präambel</h2>
          <p>
            Dieser Auftragsverarbeitungsvertrag (nachfolgend "AVV") konkretisiert die datenschutzrechtlichen
            Verpflichtungen der Vertragsparteien, die sich aus der Nutzung der VoxDrop-Dienste ergeben.
            Er findet Anwendung auf alle Tätigkeiten, bei denen Mitarbeiter des Auftragnehmers oder durch
            den Auftragnehmer beauftragte Dritte personenbezogene Daten des Auftraggebers verarbeiten.
          </p>

          <h2>1. Gegenstand und Dauer der Verarbeitung</h2>
          <h3>1.1 Gegenstand</h3>
          <p>
            Gegenstand des Auftrags ist die Bereitstellung von Barrierefreiheits-Tools zur:
          </p>
          <ul>
            <li>Transkription von Audio- und Videoinhalten</li>
            <li>Erstellung von Untertiteln</li>
            <li>Textanalyse und -vereinfachung (Einfache/Leichte Sprache)</li>
            <li>Kontrastprüfung und Barrierefreiheitsanalysen</li>
          </ul>

          <h3>1.2 Dauer</h3>
          <p>
            Die Laufzeit dieses AVV entspricht der Laufzeit des Hauptvertrags. Der AVV endet automatisch
            mit Beendigung des Hauptvertrags, sofern nicht gesetzliche Aufbewahrungspflichten eine
            längere Speicherung erfordern.
          </p>

          <h2>2. Art und Zweck der Verarbeitung</h2>
          <p>
            Die Verarbeitung personenbezogener Daten erfolgt ausschließlich zum Zweck der Erbringung
            der vertraglich vereinbarten Dienstleistungen, insbesondere:
          </p>
          <ul>
            <li>Verarbeitung hochgeladener Medieninhalte zur Transkription</li>
            <li>Analyse von Texten zur Barrierefreiheitsprüfung</li>
            <li>Speicherung von Nutzerdaten zur Bereitstellung des Dienstes</li>
            <li>Protokollierung zur Qualitätssicherung und Fehleranalyse</li>
          </ul>

          <h2>3. Art der personenbezogenen Daten</h2>
          <p>Folgende Datenkategorien können verarbeitet werden:</p>
          <ul>
            <li>Stammdaten (Name, E-Mail-Adresse, Organisation)</li>
            <li>Nutzungsdaten (Zugriffszeiten, verwendete Funktionen)</li>
            <li>Inhaltsdaten (hochgeladene Medien, Texte)</li>
            <li>Technische Daten (IP-Adresse, Browser-Informationen)</li>
          </ul>

          <h2>4. Kategorien betroffener Personen</h2>
          <ul>
            <li>Mitarbeiter und Beauftragte des Auftraggebers</li>
            <li>In Medieninhalten vorkommende Personen</li>
            <li>Autoren von Texten und Dokumenten</li>
          </ul>

          <h2>5. Pflichten des Auftragnehmers</h2>
          <h3>5.1 Weisungsgebundenheit</h3>
          <p>
            Der Auftragnehmer verarbeitet personenbezogene Daten ausschließlich auf dokumentierte
            Weisung des Auftraggebers, es sei denn, er ist nach Unionsrecht oder dem Recht der
            Mitgliedstaaten zur Verarbeitung verpflichtet.
          </p>

          <h3>5.2 Vertraulichkeit</h3>
          <p>
            Der Auftragnehmer gewährleistet, dass sich die zur Verarbeitung der personenbezogenen
            Daten befugten Personen zur Vertraulichkeit verpflichtet haben oder einer angemessenen
            gesetzlichen Verschwiegenheitspflicht unterliegen.
          </p>

          <h3>5.3 Technische und organisatorische Maßnahmen</h3>
          <p>
            Der Auftragnehmer trifft alle erforderlichen technischen und organisatorischen Maßnahmen
            gemäß Art. 32 DS-GVO. Die aktuellen Maßnahmen sind in der{" "}
            <Link href="/toms" className="text-violet-600 hover:underline">
              TOM-Dokumentation
            </Link>{" "}
            beschrieben.
          </p>

          <h3>5.4 Unterauftragnehmer</h3>
          <p>
            Der Auftragnehmer setzt Unterauftragnehmer nur mit vorheriger schriftlicher Genehmigung
            des Auftraggebers ein. Die aktuelle Liste der Unterauftragnehmer ist im{" "}
            <Link href="/subunternehmer" className="text-violet-600 hover:underline">
              Subunternehmer-Verzeichnis
            </Link>{" "}
            einsehbar.
          </p>

          <h2>6. Rechte und Pflichten des Auftraggebers</h2>
          <p>Der Auftraggeber ist verantwortlich für:</p>
          <ul>
            <li>Die Rechtmäßigkeit der Datenverarbeitung</li>
            <li>Die Information der betroffenen Personen</li>
            <li>Die Einholung erforderlicher Einwilligungen</li>
            <li>Die Beantwortung von Betroffenenanfragen</li>
          </ul>

          <h2>7. Unterstützungspflichten</h2>
          <p>
            Der Auftragnehmer unterstützt den Auftraggeber bei:
          </p>
          <ul>
            <li>Der Beantwortung von Anfragen betroffener Personen</li>
            <li>Der Einhaltung der Meldepflichten bei Datenschutzverletzungen</li>
            <li>Der Durchführung von Datenschutz-Folgenabschätzungen</li>
            <li>Prüfungen durch Aufsichtsbehörden</li>
          </ul>

          <h2>8. Löschung und Rückgabe von Daten</h2>
          <p>
            Nach Beendigung der Verarbeitung löscht der Auftragnehmer alle personenbezogenen Daten,
            sofern nicht eine Verpflichtung zur Speicherung besteht. Auf Wunsch werden die Daten
            vor der Löschung in einem gängigen Format an den Auftraggeber übergeben.
          </p>

          <h2>9. Kontrollrechte</h2>
          <p>
            Der Auftraggeber kann sich vor Beginn der Verarbeitung und sodann regelmäßig von den
            technischen und organisatorischen Maßnahmen des Auftragnehmers überzeugen. Der
            Auftragnehmer stellt dem Auftraggeber alle erforderlichen Informationen zum Nachweis
            der Einhaltung der Pflichten zur Verfügung.
          </p>

          <h2>10. Haftung</h2>
          <p>
            Die Haftung richtet sich nach den gesetzlichen Bestimmungen der DS-GVO sowie den
            Regelungen des Hauptvertrags.
          </p>

          <h2>11. Schlussbestimmungen</h2>
          <p>
            Änderungen und Ergänzungen dieses AVV bedürfen der Schriftform. Sollten einzelne
            Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.
          </p>

          <div className="mt-12 p-6 bg-slate-50 rounded-xl border border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Anlage: Technische und organisatorische Maßnahmen</h3>
            <p className="text-slate-600 mb-4">
              Die detaillierte Dokumentation unserer technischen und organisatorischen Maßnahmen
              finden Sie unter:
            </p>
            <Link href="/toms">
              <Button variant="outline">
                <FileText className="w-4 h-4 mr-2" />
                TOMs einsehen
              </Button>
            </Link>
          </div>

          <div className="mt-8 flex items-center gap-4 text-sm text-slate-600">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <span>Stand: Januar 2026 | Version 1.1</span>
          </div>
        </div>
      </main>
    </PageLayout>
  );
}
