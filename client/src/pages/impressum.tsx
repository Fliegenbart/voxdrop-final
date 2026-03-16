import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import { Building2, Mail, Phone, Scale, FileText } from "lucide-react";

export default function Impressum() {
  return (
    <PageLayout>
      <SEO
        title="Impressum"
        description="Impressum der David Wegener Marketing Consulting GmbH. Angaben gemäß § 5 TMG für VoxDrop."
        canonical="/impressum"
      />


      {/* Hero Section */}
      <header className="pt-16 pb-12 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-full text-sm font-medium mb-6">
            <Scale className="w-4 h-4" />
            Rechtliche Informationen
          </div>
          <h1 className="text-4xl md:text-5xl font-semibold text-slate-900 tracking-tight mb-4">
            Impressum
          </h1>
          <p className="text-xl text-slate-600 font-light max-w-2xl mx-auto">
            Angaben gemäß § 5 TMG
          </p>
        </div>
      </header>

      <main id="main-content" className="max-w-4xl mx-auto px-6 pb-24" tabIndex={-1}>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-8 md:p-12">

            {/* Company Info */}
            <div className="mb-12">
              <h2 className="text-2xl font-semibold text-slate-900 mb-6 flex items-center gap-3">
                <Building2 className="w-6 h-6 text-violet-600" />
                Anbieter
              </h2>
              <div className="bg-slate-50 rounded-xl p-6">
                <p className="text-xl font-semibold text-slate-900 mb-4">
                  David Wegener Marketing Consulting GmbH
                </p>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Anschrift</p>
                    <p className="text-slate-700">
                      Stockmeyerstraße 43<br />
                      20457 Hamburg<br />
                      Deutschland
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Vertreten durch</p>
                    <p className="text-slate-700">
                      David Wegener<br />
                      Geschäftsführer
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Contact */}
            <div className="mb-12">
              <h2 className="text-2xl font-semibold text-slate-900 mb-6 flex items-center gap-3">
                <Mail className="w-6 h-6 text-violet-600" />
                Kontakt
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-violet-50 rounded-xl p-5 border border-violet-100">
                  <div className="flex items-center gap-3 mb-2">
                    <Mail className="w-5 h-5 text-violet-600" />
                    <p className="font-medium text-slate-900">E-Mail</p>
                  </div>
                  <a href="mailto:info@voxdrop.live" className="text-violet-600 hover:underline">
                    info@voxdrop.live
                  </a>
                </div>
                <div className="bg-green-50 rounded-xl p-5 border border-green-100">
                  <div className="flex items-center gap-3 mb-2">
                    <Phone className="w-5 h-5 text-green-600" />
                    <p className="font-medium text-slate-900">Telefon</p>
                  </div>
                  <p className="text-slate-700">0176 10401247</p>
                </div>
              </div>
            </div>

            {/* Registration */}
            <div className="mb-12">
              <h2 className="text-2xl font-semibold text-slate-900 mb-6 flex items-center gap-3">
                <FileText className="w-6 h-6 text-violet-600" />
                Registereintrag
              </h2>
              <div className="bg-slate-50 rounded-xl p-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Registergericht</p>
                    <p className="text-slate-700">Amtsgericht Hamburg</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Registernummer</p>
                    <p className="text-slate-700">HRB 191989</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Umsatzsteuer-ID</p>
                    <p className="text-slate-700">DE454929926</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Editorial */}
            <div className="mb-12">
              <h2 className="text-2xl font-semibold text-slate-900 mb-6">
                Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV
              </h2>
              <div className="bg-slate-50 rounded-xl p-6">
                <p className="text-slate-700">
                  David Wegener<br />
                  Stockmeyerstraße 43<br />
                  20457 Hamburg
                </p>
              </div>
            </div>

            {/* Dispute Resolution */}
            <div className="mb-12">
              <h2 className="text-2xl font-semibold text-slate-900 mb-6">
                Streitschlichtung
              </h2>
              <div className="prose prose-gray max-w-none">
                <p className="text-slate-700 mb-4">
                  Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{" "}
                  <a
                    href="https://ec.europa.eu/consumers/odr/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-600 hover:underline"
                  >
                    https://ec.europa.eu/consumers/odr/
                  </a>
                </p>
                <p className="text-slate-700">
                  Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer
                  Verbraucherschlichtungsstelle teilzunehmen.
                </p>
              </div>
            </div>

            {/* Liability */}
            <div className="mb-12">
              <h2 className="text-2xl font-semibold text-slate-900 mb-6">
                Haftung für Inhalte
              </h2>
              <div className="prose prose-gray max-w-none">
                <p className="text-slate-700 mb-4">
                  Als Diensteanbieter sind wir gemäß § 7 Abs.1 TMG für eigene Inhalte auf diesen Seiten
                  nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 TMG sind wir als Diensteanbieter
                  jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen
                  oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.
                </p>
                <p className="text-slate-700">
                  Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen nach den allgemeinen
                  Gesetzen bleiben hiervon unberührt. Eine diesbezügliche Haftung ist jedoch erst ab dem Zeitpunkt
                  der Kenntnis einer konkreten Rechtsverletzung möglich. Bei Bekanntwerden von entsprechenden
                  Rechtsverletzungen werden wir diese Inhalte umgehend entfernen.
                </p>
              </div>
            </div>

            {/* Links */}
            <div>
              <h2 className="text-2xl font-semibold text-slate-900 mb-6">
                Haftung für Links
              </h2>
              <div className="prose prose-gray max-w-none">
                <p className="text-slate-700">
                  Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben.
                  Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen. Für die Inhalte der
                  verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich. Die verlinkten
                  Seiten wurden zum Zeitpunkt der Verlinkung auf mögliche Rechtsverstoße überprüft. Rechtswidrige
                  Inhalte waren zum Zeitpunkt der Verlinkung nicht erkennbar. Eine permanente inhaltliche Kontrolle der
                  verlinkten Seiten ist jedoch ohne konkrete Anhaltspunkte einer Rechtsverletzung nicht zumutbar. Bei
                  Bekanntwerden von Rechtsverletzungen werden wir derartige Links umgehend entfernen.
                </p>
              </div>
            </div>

          </div>
        </div>
      </main>

    </PageLayout>
  );
}
