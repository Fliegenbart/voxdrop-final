import { Link } from "wouter";
import { Sparkles } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="mb-10 grid gap-8 md:grid-cols-4">
          <div>
            <Link href="/">
              <span className="mb-4 flex cursor-pointer items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-purple-700">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <span className="text-lg font-semibold text-slate-900">VoxDrop</span>
              </span>
            </Link>
            <p className="text-sm leading-relaxed text-slate-600">
              Barrierefreiheits- und Content-Workflows für Behörden, öffentliche Stellen und regulierte Organisationen.
            </p>
          </div>

          <div>
            <h2 className="mb-4 text-base font-semibold text-slate-900">Produkt</h2>
            <div className="space-y-2 text-sm">
              <Link href="/features" className="block text-slate-600 hover:text-slate-900">
                Produktüberblick
              </Link>
              <a href="/#einsatzbereiche" className="block text-slate-600 hover:text-slate-900">
                Einsatzbereiche
              </a>
              <a href="/#pilot-einfuehrung" className="block text-slate-600 hover:text-slate-900">
                Pilot & Einführung
              </a>
              <Link href="/blog" className="block text-slate-600 hover:text-slate-900">
                Blog
              </Link>
              <Link href="/voxdrop-2030" className="block text-slate-600 hover:text-slate-900">
                Vision 2030
              </Link>
            </div>
          </div>

          <div>
            <h2 className="mb-4 text-base font-semibold text-slate-900">Für Organisationen</h2>
            <div className="space-y-2 text-sm">
              <Link href="/behoerden" className="block text-slate-600 hover:text-slate-900">
                Für Behörden
              </Link>
              <a href="/#sicherheit-betrieb" className="block text-slate-600 hover:text-slate-900">
                Sicherheit & Betrieb
              </a>
              <a href="/#kontakt" className="block text-slate-600 hover:text-slate-900">
                Kontakt
              </a>
            </div>
          </div>

          <div>
            <h2 className="mb-4 text-base font-semibold text-slate-900">Rechtliches</h2>
            <div className="space-y-2 text-sm text-slate-600">
              <Link href="/datenschutz" className="block hover:text-slate-900">
                Datenschutz
              </Link>
              <Link href="/impressum" className="block hover:text-slate-900">
                Impressum
              </Link>
              <a href="mailto:anfrage@voxdrop.live" className="block text-violet-700 hover:text-violet-800">
                anfrage@voxdrop.live
              </a>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-slate-100 pt-8 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
          <p>Tyrn.On GmbH, Hamburg, Deutschland</p>
          <div className="flex flex-wrap items-center gap-3">
            <span>Deutsche Infrastruktur</span>
            <span className="text-slate-300">•</span>
            <span>DSGVO-konform gedacht</span>
            <span className="text-slate-300">•</span>
            <span>Made in Hamburg</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
