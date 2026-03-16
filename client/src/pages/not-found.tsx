import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Home, Search, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <PageLayout>
      <SEO
        title="Seite nicht gefunden"
        description="Die angeforderte Seite konnte nicht gefunden werden."
        noIndex={true}
      />

      <main id="main-content" className="flex items-center justify-center px-6 py-24" tabIndex={-1}>
        <div className="text-center max-w-lg">
          <div className="w-24 h-24 bg-gradient-to-br from-violet-600 to-purple-700 rounded-3xl flex items-center justify-center mx-auto mb-8">
            <Search className="w-12 h-12 text-white" />
          </div>

          <h1 className="text-6xl font-bold text-slate-900 mb-4">404</h1>
          <h2 className="text-2xl font-semibold text-slate-700 mb-4">
            Seite nicht gefunden
          </h2>
          <p className="text-slate-600 mb-8">
            Die Seite, die Sie suchen, existiert nicht oder wurde verschoben.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/">
              <Button className="h-12 px-6 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium">
                <Home className="w-4 h-4 mr-2" />
                Zur Startseite
              </Button>
            </Link>
            <Button
              variant="outline"
              className="h-12 px-6 rounded-xl border-slate-300"
              onClick={() => window.history.back()}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Zurück
            </Button>
          </div>

          <div className="mt-12 pt-8 border-t border-slate-200">
            <p className="text-sm text-slate-600 mb-4">Vielleicht suchen Sie nach:</p>
            <div className="flex flex-wrap gap-2 justify-center">
              <Link href="/tools/untertitel">
                <span className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-purple-300 hover:text-purple-600 transition-colors cursor-pointer">
                  Schnitt & Struktur
                </span>
              </Link>
              <Link href="/tools/einfache-sprache">
                <span className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-purple-300 hover:text-purple-600 transition-colors cursor-pointer">
                  Einfache Sprache
                </span>
              </Link>
              <Link href="/tools/kontrastchecker">
                <span className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-purple-300 hover:text-purple-600 transition-colors cursor-pointer">
                  Kontrastchecker
                </span>
              </Link>
              <Link href="/preise">
                <span className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-purple-300 hover:text-purple-600 transition-colors cursor-pointer">
                  Preise
                </span>
              </Link>
            </div>
          </div>
        </div>
      </main>

    </PageLayout>
  );
}
