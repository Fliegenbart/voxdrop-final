import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Target,
  Users,
  Lock,
  Shield,
  Zap,
  Building2,
  Globe,
  CheckCircle2,
  ArrowRight,
  Rocket,
  Mail,
  Server,
  FileText,
  Video,
} from "lucide-react";
import { SEO } from "@/components/SEO";

interface Slide {
  id: string;
  content: React.ReactNode;
}

export default function PitchDeck() {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides: Slide[] = [
    // Slide 1: Title
    {
      id: "title",
      content: (
        <div className="flex flex-col items-center justify-center h-full text-center px-8">
          <div className="mb-8">
            <div className="w-24 h-24 bg-gradient-to-br from-violet-600 to-purple-700 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl">
              <span className="text-4xl font-bold text-white">V</span>
            </div>
            <h1 className="text-6xl md:text-8xl font-bold text-slate-900 tracking-tight mb-4">
              VoxDrop
            </h1>
            <p className="text-2xl md:text-3xl text-slate-600 font-light">
              Die Accessibility Suite für den deutschen Markt
            </p>
          </div>
          <div className="flex items-center gap-8 text-lg text-slate-500 mt-8">
            <span>DSGVO-konform</span>
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
            <span>Deutsche Server</span>
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
            <span>Lokale KI</span>
          </div>
          <div className="absolute bottom-12 text-sm text-slate-400">
            Investor Pitch · Februar 2026
          </div>
        </div>
      ),
    },

    // Slide 2: Problem
    {
      id: "problem",
      content: (
        <div className="flex flex-col justify-center h-full px-16">
          <div className="text-violet-600 font-semibold text-xl mb-4">DAS PROBLEM</div>
          <h2 className="text-5xl md:text-6xl font-bold text-slate-900 mb-12 leading-tight">
            Barrierefreiheit ist Pflicht.<br />
            <span className="text-slate-400">Aber niemand hat die Tools.</span>
          </h2>
          <div className="grid grid-cols-3 gap-8">
            <div className="bg-red-50 rounded-2xl p-8">
              <div className="text-5xl font-bold text-red-600 mb-2">97%</div>
              <p className="text-slate-700">aller kommunalen Websites haben Barrierefreiheits-Mängel</p>
            </div>
            <div className="bg-orange-50 rounded-2xl p-8">
              <div className="text-5xl font-bold text-orange-600 mb-2">100k€</div>
              <p className="text-slate-700">Bußgeld pro Verstoß nach BFSG seit Juni 2025</p>
            </div>
            <div className="bg-amber-50 rounded-2xl p-8">
              <div className="text-5xl font-bold text-amber-600 mb-2">11.000+</div>
              <p className="text-slate-700">Kommunen in Deutschland brauchen eine Lösung</p>
            </div>
          </div>
          <div className="mt-12 text-xl text-slate-600">
            <strong>Das Chaos:</strong> PDFs, Videos, PPTs, Websites – jedes Format braucht andere Tools.
            Cloud-Lösungen sind datenschutzrechtlich problematisch.
          </div>
        </div>
      ),
    },

    // Slide 3: Solution
    {
      id: "solution",
      content: (
        <div className="flex flex-col justify-center h-full px-16">
          <div className="text-violet-600 font-semibold text-xl mb-4">DIE LÖSUNG</div>
          <h2 className="text-5xl md:text-6xl font-bold text-slate-900 mb-8">
            Eine Suite. Alle Formate.
          </h2>
          <p className="text-2xl text-slate-600 mb-12 max-w-3xl">
            VoxDrop ist die erste DSGVO-konforme Accessibility-Plattform, die Dokumente,
            Videos und Webinhalte in einem Workflow barrierefrei macht.
          </p>
          <div className="grid grid-cols-2 gap-6">
            <div className="flex items-start gap-4 bg-white rounded-xl p-6 shadow-sm">
              <div className="w-12 h-12 bg-violet-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <FileText className="w-6 h-6 text-violet-600" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-slate-900">PPTX → PDF/UA</h3>
                <p className="text-slate-600">Präsentationen automatisch barrierefrei konvertieren</p>
              </div>
            </div>
            <div className="flex items-start gap-4 bg-white rounded-xl p-6 shadow-sm">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Video className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-slate-900">Video-Untertitel</h3>
                <p className="text-slate-600">Whisper-basierte Transkription auf deutschen Servern</p>
              </div>
            </div>
            <div className="flex items-start gap-4 bg-white rounded-xl p-6 shadow-sm">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Zap className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-slate-900">Einfache Sprache</h3>
                <p className="text-slate-600">KI-gestützte Vereinfachung komplexer Texte</p>
              </div>
            </div>
            <div className="flex items-start gap-4 bg-white rounded-xl p-6 shadow-sm">
              <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Shield className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-slate-900">Compliance-Reports</h3>
                <p className="text-slate-600">VPAT, BITV 2.0, EN 301 549 Nachweise</p>
              </div>
            </div>
          </div>
        </div>
      ),
    },

    // Slide 4: USP
    {
      id: "usp",
      content: (
        <div className="flex flex-col justify-center h-full px-16">
          <div className="text-violet-600 font-semibold text-xl mb-4">UNIQUE SELLING PROPOSITION</div>
          <h2 className="text-5xl md:text-6xl font-bold text-slate-900 mb-12">
            Warum VoxDrop gewinnt
          </h2>
          <div className="grid grid-cols-3 gap-8">
            <div className="bg-gradient-to-br from-violet-600 to-purple-700 rounded-2xl p-8 text-white">
              <Server className="w-12 h-12 mb-4 opacity-80" />
              <h3 className="text-2xl font-bold mb-3">100% Deutsche Server</h3>
              <p className="text-violet-100">
                Keine US-Cloud, keine Drittland-Transfers. Hetzner-Infrastruktur in Deutschland.
              </p>
            </div>
            <div className="bg-gradient-to-br from-emerald-600 to-green-700 rounded-2xl p-8 text-white">
              <Lock className="w-12 h-12 mb-4 opacity-80" />
              <h3 className="text-2xl font-bold mb-3">Lokale KI-Modelle</h3>
              <p className="text-emerald-100">
                Whisper, LLaMA, Ollama – alles on-premise. Keine API-Calls an OpenAI/Google.
              </p>
            </div>
            <div className="bg-gradient-to-br from-orange-600 to-red-600 rounded-2xl p-8 text-white">
              <Building2 className="w-12 h-12 mb-4 opacity-80" />
              <h3 className="text-2xl font-bold mb-3">EVB-IT Cloud Ready</h3>
              <p className="text-orange-100">
                Fertige Beschaffungsunterlagen: AVV, TOMs, SLA, C5-Mapping. Behörden-ready.
              </p>
            </div>
          </div>
          <div className="mt-12 bg-slate-100 rounded-xl p-6">
            <p className="text-xl text-slate-700">
              <strong>Wettbewerbsvorteil:</strong> Keine vergleichbare Lösung vereint DSGVO-Konformität,
              lokale KI und One-Stop-Shop für alle Medienformate.
            </p>
          </div>
        </div>
      ),
    },

    // Slide 5: Market
    {
      id: "market",
      content: (
        <div className="flex flex-col justify-center h-full px-16">
          <div className="text-violet-600 font-semibold text-xl mb-4">MARKTPOTENZIAL</div>
          <h2 className="text-5xl md:text-6xl font-bold text-slate-900 mb-12">
            Der Accessibility-Markt explodiert
          </h2>
          <div className="grid grid-cols-3 gap-12 mb-12">
            <div className="text-center">
              <div className="text-6xl font-bold text-violet-600 mb-2">€2.1B</div>
              <div className="text-lg font-semibold text-slate-900 mb-1">TAM</div>
              <p className="text-slate-600">Europäischer Digital Accessibility Markt 2026</p>
            </div>
            <div className="text-center">
              <div className="text-6xl font-bold text-emerald-600 mb-2">€340M</div>
              <div className="text-lg font-semibold text-slate-900 mb-1">SAM</div>
              <p className="text-slate-600">DACH-Region, Behörden + Enterprise</p>
            </div>
            <div className="text-center">
              <div className="text-6xl font-bold text-orange-600 mb-2">€28M</div>
              <div className="text-lg font-semibold text-slate-900 mb-1">SOM</div>
              <p className="text-slate-600">Erreichbar in 3 Jahren (8% Marktanteil)</p>
            </div>
          </div>
          <div className="bg-violet-50 rounded-xl p-8">
            <h3 className="font-bold text-xl text-slate-900 mb-4">Markttreiber</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-violet-600" />
                <span>BFSG seit Juni 2025 in Kraft</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-violet-600" />
                <span>European Accessibility Act</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-violet-600" />
                <span>7.8 Mio. Schwerbehinderte in DE</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-violet-600" />
                <span>Überalternde Gesellschaft</span>
              </div>
            </div>
          </div>
        </div>
      ),
    },

    // Slide 6: Business Model
    {
      id: "business-model",
      content: (
        <div className="flex flex-col justify-center h-full px-16">
          <div className="text-violet-600 font-semibold text-xl mb-4">GESCHÄFTSMODELL</div>
          <h2 className="text-5xl md:text-6xl font-bold text-slate-900 mb-8">
            SaaS + Credit-System
          </h2>
          <p className="text-xl text-slate-600 mb-10 max-w-3xl">
            Recurring Revenue durch Subscriptions + nutzungsbasierte Zusatz-Credits.
            Hohe Retention durch Workflow-Integration.
          </p>
          <div className="grid grid-cols-4 gap-6 mb-10">
            <div className="bg-slate-100 rounded-xl p-6 text-center">
              <div className="text-3xl font-bold text-slate-900 mb-1">Free</div>
              <div className="text-2xl font-semibold text-slate-600 mb-2">€0</div>
              <p className="text-sm text-slate-500">200 Credits/Monat</p>
              <p className="text-xs text-slate-400 mt-2">Lead Generation</p>
            </div>
            <div className="bg-violet-600 rounded-xl p-6 text-center text-white">
              <div className="text-3xl font-bold mb-1">Pro</div>
              <div className="text-2xl font-semibold mb-2">€99/Mo</div>
              <p className="text-sm text-violet-100">3.000 Credits/Monat</p>
              <p className="text-xs text-violet-200 mt-2">Einzelnutzer</p>
            </div>
            <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl p-6 text-center text-white">
              <div className="text-3xl font-bold mb-1">Premium</div>
              <div className="text-2xl font-semibold mb-2">€199/Mo</div>
              <p className="text-sm text-indigo-100">15.000 Credits/Monat</p>
              <p className="text-xs text-indigo-200 mt-2">Teams & Vielnutzer</p>
            </div>
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 text-center text-white">
              <div className="text-3xl font-bold mb-1">Enterprise</div>
              <div className="text-2xl font-semibold mb-2">€699+</div>
              <p className="text-sm text-slate-300">100k+ Credits/Monat</p>
              <p className="text-xs text-slate-400 mt-2">Behörden & Konzerne</p>
            </div>
          </div>
          <div className="flex gap-8 text-lg">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-green-500 rounded-full" />
              <span><strong>LTV:CAC</strong> Ziel: 4:1</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-violet-500 rounded-full" />
              <span><strong>Gross Margin:</strong> 75%+</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-purple-500 rounded-full" />
              <span><strong>Net Revenue Retention:</strong> 115%</span>
            </div>
          </div>
        </div>
      ),
    },

    // Slide 7: Go-to-Market
    {
      id: "gtm",
      content: (
        <div className="flex flex-col justify-center h-full px-16">
          <div className="text-violet-600 font-semibold text-xl mb-4">GO-TO-MARKET</div>
          <h2 className="text-5xl md:text-6xl font-bold text-slate-900 mb-12">
            Product-Led Growth + Behörden-Vertrieb
          </h2>
          <div className="grid grid-cols-2 gap-12">
            <div>
              <h3 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-3">
                <Rocket className="w-8 h-8 text-violet-600" />
                Phase 1: PLG (jetzt)
              </h3>
              <ul className="space-y-4 text-lg text-slate-700">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" />
                  <span>Kostenlose Tools als Einstieg (Kontrastchecker, Alt-Text)</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" />
                  <span>SEO-Content für "Barrierefreiheit + [Keyword]"</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" />
                  <span>Freemium → Pro Conversion (Ziel: 3%)</span>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-3">
                <Building2 className="w-8 h-8 text-emerald-600" />
                Phase 2: Enterprise (Q3 2026)
              </h3>
              <ul className="space-y-4 text-lg text-slate-700">
                <li className="flex items-start gap-3">
                  <ArrowRight className="w-6 h-6 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span>Direktvertrieb an Kommunen (11.000+ Targets)</span>
                </li>
                <li className="flex items-start gap-3">
                  <ArrowRight className="w-6 h-6 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span>Rahmenverträge mit Landesbehörden</span>
                </li>
                <li className="flex items-start gap-3">
                  <ArrowRight className="w-6 h-6 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span>Partnerschaften mit Accessibility-Beratungen</span>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-12 bg-slate-100 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold">Akquisitionskosten</span>
              <span className="text-lg"><strong>PLG:</strong> ~€50 CAC | <strong>Enterprise:</strong> ~€2.000 CAC</span>
            </div>
          </div>
        </div>
      ),
    },

    // Slide 8: Traction
    {
      id: "traction",
      content: (
        <div className="flex flex-col justify-center h-full px-16">
          <div className="text-violet-600 font-semibold text-xl mb-4">TRAKTION</div>
          <h2 className="text-5xl md:text-6xl font-bold text-slate-900 mb-12">
            Proof of Concept
          </h2>
          <div className="grid grid-cols-4 gap-8 mb-12">
            <div className="bg-white rounded-xl p-8 shadow-sm text-center">
              <div className="text-5xl font-bold text-violet-600 mb-2">500+</div>
              <p className="text-slate-600">Registrierte Nutzer</p>
            </div>
            <div className="bg-white rounded-xl p-8 shadow-sm text-center">
              <div className="text-5xl font-bold text-emerald-600 mb-2">2.400</div>
              <p className="text-slate-600">Dokumente verarbeitet</p>
            </div>
            <div className="bg-white rounded-xl p-8 shadow-sm text-center">
              <div className="text-5xl font-bold text-orange-600 mb-2">18</div>
              <p className="text-slate-600">Tools in der Suite</p>
            </div>
            <div className="bg-white rounded-xl p-8 shadow-sm text-center">
              <div className="text-5xl font-bold text-purple-600 mb-2">0</div>
              <p className="text-slate-600">US-Cloud Dependencies</p>
            </div>
          </div>
          <div className="bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl p-8">
            <h3 className="font-bold text-xl text-slate-900 mb-4">Meilensteine 2026</h3>
            <div className="grid grid-cols-4 gap-6 text-center">
              <div>
                <div className="w-4 h-4 bg-green-500 rounded-full mx-auto mb-2" />
                <div className="font-semibold">Q1</div>
                <p className="text-sm text-slate-600">Launch voxdrop.live</p>
              </div>
              <div>
                <div className="w-4 h-4 bg-violet-500 rounded-full mx-auto mb-2" />
                <div className="font-semibold">Q2</div>
                <p className="text-sm text-slate-600">1.000 aktive Nutzer</p>
              </div>
              <div>
                <div className="w-4 h-4 bg-slate-300 rounded-full mx-auto mb-2" />
                <div className="font-semibold">Q3</div>
                <p className="text-sm text-slate-600">Erste Behörden-Deals</p>
              </div>
              <div>
                <div className="w-4 h-4 bg-slate-300 rounded-full mx-auto mb-2" />
                <div className="font-semibold">Q4</div>
                <p className="text-sm text-slate-600">€100k ARR</p>
              </div>
            </div>
          </div>
        </div>
      ),
    },

    // Slide 9: Competition
    {
      id: "competition",
      content: (
        <div className="flex flex-col justify-center h-full px-16">
          <div className="text-violet-600 font-semibold text-xl mb-4">WETTBEWERB</div>
          <h2 className="text-5xl md:text-6xl font-bold text-slate-900 mb-10">
            Fragmentierter Markt
          </h2>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-6 py-4 font-semibold"></th>
                  <th className="px-6 py-4 font-semibold text-center">VoxDrop</th>
                  <th className="px-6 py-4 font-semibold text-center">UserWay</th>
                  <th className="px-6 py-4 font-semibold text-center">Axe/Deque</th>
                  <th className="px-6 py-4 font-semibold text-center">Adobe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                <tr>
                  <td className="px-6 py-4 font-medium">DSGVO/Deutsche Server</td>
                  <td className="px-6 py-4 text-center text-2xl text-green-600">✓</td>
                  <td className="px-6 py-4 text-center text-2xl text-red-500">✗</td>
                  <td className="px-6 py-4 text-center text-2xl text-red-500">✗</td>
                  <td className="px-6 py-4 text-center text-2xl text-red-500">✗</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-medium">Lokale KI (keine Cloud)</td>
                  <td className="px-6 py-4 text-center text-2xl text-green-600">✓</td>
                  <td className="px-6 py-4 text-center text-2xl text-red-500">✗</td>
                  <td className="px-6 py-4 text-center text-2xl text-red-500">✗</td>
                  <td className="px-6 py-4 text-center text-2xl text-red-500">✗</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-medium">Video + Dokumente + Web</td>
                  <td className="px-6 py-4 text-center text-2xl text-green-600">✓</td>
                  <td className="px-6 py-4 text-center text-2xl text-orange-500">~</td>
                  <td className="px-6 py-4 text-center text-2xl text-orange-500">~</td>
                  <td className="px-6 py-4 text-center text-2xl text-orange-500">~</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-medium">EVB-IT Cloud Ready</td>
                  <td className="px-6 py-4 text-center text-2xl text-green-600">✓</td>
                  <td className="px-6 py-4 text-center text-2xl text-red-500">✗</td>
                  <td className="px-6 py-4 text-center text-2xl text-red-500">✗</td>
                  <td className="px-6 py-4 text-center text-2xl text-orange-500">~</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-medium">Pricing für KMU</td>
                  <td className="px-6 py-4 text-center text-2xl text-green-600">✓</td>
                  <td className="px-6 py-4 text-center text-2xl text-orange-500">~</td>
                  <td className="px-6 py-4 text-center text-2xl text-red-500">✗</td>
                  <td className="px-6 py-4 text-center text-2xl text-red-500">✗</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-8 text-xl text-slate-600">
            <strong>Positionierung:</strong> Der "deutsche" Accessibility-Stack für datenschutzsensible Organisationen.
          </p>
        </div>
      ),
    },

    // Slide 10: Financials
    {
      id: "financials",
      content: (
        <div className="flex flex-col justify-center h-full px-16">
          <div className="text-violet-600 font-semibold text-xl mb-4">FINANZPLANUNG</div>
          <h2 className="text-5xl md:text-6xl font-bold text-slate-900 mb-10">
            Weg zu €1M ARR
          </h2>
          <div className="grid grid-cols-3 gap-8 mb-10">
            <div className="bg-white rounded-xl p-8 shadow-sm">
              <div className="text-sm text-slate-500 mb-2">2026 (Jahr 1)</div>
              <div className="text-4xl font-bold text-slate-900 mb-2">€120k</div>
              <p className="text-slate-600">ARR · 200 zahlende Kunden</p>
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="flex justify-between text-sm">
                  <span>MRR Dez</span>
                  <span className="font-semibold">€10k</span>
                </div>
              </div>
            </div>
            <div className="bg-violet-600 rounded-xl p-8 text-white">
              <div className="text-sm text-violet-200 mb-2">2027 (Jahr 2)</div>
              <div className="text-4xl font-bold mb-2">€480k</div>
              <p className="text-violet-100">ARR · 800 zahlende Kunden</p>
              <div className="mt-4 pt-4 border-t border-violet-500">
                <div className="flex justify-between text-sm">
                  <span>MRR Dez</span>
                  <span className="font-semibold">€40k</span>
                </div>
              </div>
            </div>
            <div className="bg-gradient-to-br from-emerald-600 to-green-600 rounded-xl p-8 text-white">
              <div className="text-sm text-emerald-200 mb-2">2028 (Jahr 3)</div>
              <div className="text-4xl font-bold mb-2">€1.2M</div>
              <p className="text-emerald-100">ARR · 2.000 zahlende Kunden</p>
              <div className="mt-4 pt-4 border-t border-emerald-500">
                <div className="flex justify-between text-sm">
                  <span>MRR Dez</span>
                  <span className="font-semibold">€100k</span>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-slate-100 rounded-xl p-8">
            <h3 className="font-bold text-lg mb-4">Unit Economics (Ziel Jahr 2)</h3>
            <div className="grid grid-cols-4 gap-6 text-center">
              <div>
                <div className="text-2xl font-bold text-slate-900">€600</div>
                <p className="text-sm text-slate-600">Avg. Revenue/Kunde</p>
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900">75%</div>
                <p className="text-sm text-slate-600">Gross Margin</p>
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900">€150</div>
                <p className="text-sm text-slate-600">Blended CAC</p>
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900">4:1</div>
                <p className="text-sm text-slate-600">LTV:CAC</p>
              </div>
            </div>
          </div>
        </div>
      ),
    },

    // Slide 11: The Ask
    {
      id: "ask",
      content: (
        <div className="flex flex-col justify-center h-full px-16">
          <div className="text-violet-600 font-semibold text-xl mb-4">INVESTMENT</div>
          <h2 className="text-5xl md:text-6xl font-bold text-slate-900 mb-8">
            Seed Round: €500k
          </h2>
          <p className="text-2xl text-slate-600 mb-12 max-w-3xl">
            Pre-Seed/Seed für 18 Monate Runway bis zum Erreichen von €100k MRR.
          </p>
          <div className="grid grid-cols-2 gap-12 mb-12">
            <div>
              <h3 className="text-2xl font-bold text-slate-900 mb-6">Mittelverwendung</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-lg">Produkt & Engineering (60%)</span>
                  <span className="font-bold text-lg">€300k</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-3">
                  <div className="bg-violet-600 h-3 rounded-full" style={{ width: "60%" }} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-lg">Sales & Marketing (25%)</span>
                  <span className="font-bold text-lg">€125k</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-3">
                  <div className="bg-emerald-600 h-3 rounded-full" style={{ width: "25%" }} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-lg">Operations & Legal (15%)</span>
                  <span className="font-bold text-lg">€75k</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-3">
                  <div className="bg-orange-500 h-3 rounded-full" style={{ width: "15%" }} />
                </div>
              </div>
            </div>
            <div>
              <h3 className="text-2xl font-bold text-slate-900 mb-6">Meilensteine mit Funding</h3>
              <ul className="space-y-4 text-lg">
                <li className="flex items-start gap-3">
                  <Target className="w-6 h-6 text-violet-600 flex-shrink-0 mt-0.5" />
                  <span>€100k MRR innerhalb 18 Monaten</span>
                </li>
                <li className="flex items-start gap-3">
                  <Target className="w-6 h-6 text-violet-600 flex-shrink-0 mt-0.5" />
                  <span>5 Enterprise-Kunden (Behörden/Konzerne)</span>
                </li>
                <li className="flex items-start gap-3">
                  <Target className="w-6 h-6 text-violet-600 flex-shrink-0 mt-0.5" />
                  <span>Team auf 8 FTE skalieren</span>
                </li>
                <li className="flex items-start gap-3">
                  <Target className="w-6 h-6 text-violet-600 flex-shrink-0 mt-0.5" />
                  <span>ISO 27001 Zertifizierung</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      ),
    },

    // Slide 12: Team (Placeholder)
    {
      id: "team",
      content: (
        <div className="flex flex-col justify-center h-full px-16">
          <div className="text-violet-600 font-semibold text-xl mb-4">TEAM</div>
          <h2 className="text-5xl md:text-6xl font-bold text-slate-900 mb-12">
            Die Gründer
          </h2>
          <div className="grid grid-cols-2 gap-12 max-w-4xl">
            <div className="bg-white rounded-2xl p-8 shadow-sm">
              <div className="w-24 h-24 bg-gradient-to-br from-violet-100 to-purple-100 rounded-full flex items-center justify-center mb-6">
                <Users className="w-12 h-12 text-violet-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-2">David Wegener</h3>
              <p className="text-violet-600 font-medium mb-4">CEO & Founder</p>
              <p className="text-slate-600">
                [Bio hier einfügen: Hintergrund, relevante Erfahrung,
                warum diese Person das Problem lösen kann]
              </p>
            </div>
            <div className="bg-slate-100 rounded-2xl p-8 border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-center">
              <div className="w-24 h-24 bg-slate-200 rounded-full flex items-center justify-center mb-6">
                <Users className="w-12 h-12 text-slate-400" />
              </div>
              <h3 className="text-2xl font-bold text-slate-400 mb-2">CTO gesucht</h3>
              <p className="text-slate-500">
                Mit Funding: Senior Engineer mit<br />
                AI/ML und DevOps Background
              </p>
            </div>
          </div>
          <div className="mt-12 text-lg text-slate-600 max-w-3xl">
            <strong>Advisors:</strong> [Strategische Berater hier auflisten –
            idealerweise mit Behörden- oder Accessibility-Expertise]
          </div>
        </div>
      ),
    },

    // Slide 13: Contact
    {
      id: "contact",
      content: (
        <div className="flex flex-col items-center justify-center h-full text-center px-8">
          <div className="w-24 h-24 bg-gradient-to-br from-violet-600 to-purple-700 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-2xl">
            <span className="text-4xl font-bold text-white">V</span>
          </div>
          <h2 className="text-5xl md:text-6xl font-bold text-slate-900 mb-6">
            Let's Talk
          </h2>
          <p className="text-2xl text-slate-600 mb-12 max-w-2xl">
            Barrierefreiheit wird Pflicht. VoxDrop macht es möglich.<br />
            Der deutsche Markt wartet.
          </p>
          <div className="flex flex-col gap-4 text-xl">
            <a href="mailto:david@voxdrop.live" className="flex items-center gap-3 text-violet-600 hover:text-violet-700">
              <Mail className="w-6 h-6" />
              david@voxdrop.live
            </a>
            <a href="https://voxdrop.live" className="flex items-center gap-3 text-slate-600 hover:text-slate-700">
              <Globe className="w-6 h-6" />
              voxdrop.live
            </a>
          </div>
          <div className="absolute bottom-12 text-sm text-slate-400">
            Drücke ← → zum Navigieren · ESC zum Beenden
          </div>
        </div>
      ),
    },
  ];

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  }, [slides.length]);

  const prevSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  }, [slides.length]);

  const goToSlide = useCallback((index: number) => {
    setCurrentSlide(index);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        nextSlide();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prevSlide();
      } else if (e.key === "Home") {
        e.preventDefault();
        goToSlide(0);
      } else if (e.key === "End") {
        e.preventDefault();
        goToSlide(slides.length - 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextSlide, prevSlide, goToSlide, slides.length]);

  return (
    <div className="h-screen w-screen bg-page-bg overflow-hidden select-none">
      <SEO
        title="Investor Pitch Deck"
        description="VoxDrop Pitch Deck für Investoren"
        noIndex
      />

      {/* Slide Content */}
      <div className="h-full w-full">
        {slides[currentSlide].content}
      </div>

      {/* Navigation */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4">
        <button
          onClick={prevSlide}
          className="w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center hover:bg-slate-50 transition-colors"
          aria-label="Vorherige Slide"
        >
          <ChevronLeft className="w-5 h-5 text-slate-600" />
        </button>

        <div className="flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-lg">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={`w-2 h-2 rounded-full transition-all ${
                index === currentSlide ? "bg-violet-600 w-6" : "bg-slate-300 hover:bg-slate-400"
              }`}
              aria-label={`Slide ${index + 1}`}
            />
          ))}
        </div>

        <button
          onClick={nextSlide}
          className="w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center hover:bg-slate-50 transition-colors"
          aria-label="Nächste Slide"
        >
          <ChevronRight className="w-5 h-5 text-slate-600" />
        </button>
      </div>

      {/* Slide Counter */}
      <div className="fixed top-6 right-6 bg-white rounded-full px-4 py-2 shadow-lg text-sm font-medium text-slate-600">
        {currentSlide + 1} / {slides.length}
      </div>
    </div>
  );
}
