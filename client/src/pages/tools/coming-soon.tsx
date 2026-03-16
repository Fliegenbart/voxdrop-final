import { Link } from "wouter";
import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, ArrowRight, Bell, Type, Palette, Image, AudioLines, Brain, Share2
} from "lucide-react";

interface ToolConfig {
  name: string;
  description: string;
  longDescription: string;
  icon: React.ElementType;
  color: string;
  features: string[];
}

const toolConfigs: Record<string, ToolConfig> = {
  "einfache-sprache": {
    name: "Einfache Sprache",
    description: "Texte automatisch vereinfachen",
    longDescription: "Wandeln Sie komplexe Texte automatisch in Leichte oder Einfache Sprache um. Perfekt für barrierefreie Kommunikation mit allen Bürgerinnen und Bürgern.",
    icon: Type,
    color: "from-green-500 to-emerald-600",
    features: [
      "KI-gestützte Textvereinfachung",
      "Leichte Sprache nach Regelwerk",
      "Einfache Sprache für Behördentexte",
      "Wortschatz-Anpassung",
      "Satzstruktur-Optimierung",
    ],
  },
  "kontrastchecker": {
    name: "Kontrastchecker",
    description: "Farbkontraste WCAG-konform prüfen",
    longDescription: "Prüfen Sie Ihre Farbkombinationen auf ausreichende Kontrastverhältnisse nach WCAG 2.1. Mit Vorschlägen für barrierefreie Alternativen.",
    icon: Palette,
    color: "from-pink-500 to-rose-600",
    features: [
      "WCAG AA und AAA Konformität",
      "Echtzeit-Kontrastberechnung",
      "Farbvorschläge für besseren Kontrast",
      "Export als Farbpalette",
      "Simulation von Farbfehlsichtigkeit",
    ],
  },
  "alt-text": {
    name: "Alt-Text Generator",
    description: "KI-Bildbeschreibungen erstellen",
    longDescription: "Lassen Sie automatisch aussagekräftige Alternativtexte für Ihre Bilder generieren. Die KI erkennt Inhalte und erstellt Beschreibungen für Screenreader.",
    icon: Image,
    color: "from-cyan-500 to-blue-600",
    features: [
      "KI-basierte Bilderkennung",
      "Kontextbezogene Beschreibungen",
      "Batch-Verarbeitung mehrerer Bilder",
      "Anpassbare Beschreibungslänge",
      "Export für CMS-Systeme",
    ],
  },
  "audiodeskription": {
    name: "Audiodeskription",
    description: "Videos für Blinde beschreiben",
    longDescription: "Erstellen Sie automatisch Audiodeskriptionen für Ihre Videos. Die KI analysiert visuelle Inhalte und generiert Beschreibungen für blinde Nutzer.",
    icon: AudioLines,
    color: "from-violet-500 to-purple-600",
    features: [
      "Automatische Szenen-Analyse",
      "KI-generierte Beschreibungen",
      "Timing-optimierte Einfügung",
      "Deutsche Sprachausgabe",
      "Export als separate Audiospur",
    ],
  },
  "voxcut": {
    name: "VoxCut",
    description: "KI-Video-Editor mit Text-/Sprachsteuerung",
    longDescription: "VoxCut wird als erweitertes Modul für KI-gestützte Schnittoperationen bereitgestellt. Der Kern-Workflow bleibt in Schnitt & Struktur.",
    icon: Brain,
    color: "from-cyan-500 to-blue-600",
    features: [
      "Schnittbefehle per Text oder Stimme",
      "Intelligente Segmentvorschläge",
      "Effekt-Presets für Tempo und Fokus",
      "Schnelle Iteration mit Vorschau",
      "Übergabe in den Haupt-Workflow",
    ],
  },
  "bereitstellen-teilen": {
    name: "Bereitstellen & Teilen",
    description: "Exports bündeln und sicher freigeben",
    longDescription: "Dieses Modul für Freigabe-Workflows und sichere Bereitstellung ist geplant. Bis dahin erfolgt der komplette Prozess in Schnitt & Struktur.",
    icon: Share2,
    color: "from-emerald-500 to-green-600",
    features: [
      "Freigabe-Links mit Ablaufdatum",
      "Rollenbasierte Review-Prozesse",
      "Paketierung von Video und Untertiteln",
      "Download-Tracking für Teams",
      "DSGVO-konforme Bereitstellung",
    ],
  },
};

interface ComingSoonToolProps {
  toolId: string;
}

export default function ComingSoonTool({ toolId }: ComingSoonToolProps) {
  const tool = toolConfigs[toolId] || toolConfigs["alt-text"];
  const IconComponent = tool.icon;

  return (
    <PageLayout>
      <SEO
        title={`${tool.name} – bald verfügbar`}
        description={tool.longDescription}
      />

      <main id="main-content" className="max-w-3xl mx-auto px-6 py-16" tabIndex={-1}>
        {/* Back Link */}
        <Link href="/" className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Zurück zur Übersicht
        </Link>

        {/* Hero */}
        <div className="text-center mb-12">
          <div className={`w-20 h-20 bg-gradient-to-br ${tool.color} rounded-2xl flex items-center justify-center mx-auto mb-6`}>
            <IconComponent className="w-10 h-10 text-white" />
          </div>

          <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-800 rounded-full text-sm font-medium mb-6">
            <Bell className="w-4 h-4" />
            Bald verfügbar
          </div>

          <h1 className="text-4xl font-semibold text-slate-900 mb-4">
            {tool.name}
          </h1>
          <p className="text-xl text-slate-600 max-w-xl mx-auto">
            {tool.longDescription}
          </p>
        </div>

        {/* Features */}
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200 mb-8">
          <h2 className="text-xl font-semibold text-slate-900 mb-6">Geplante Funktionen</h2>
          <ul className="space-y-4">
            {tool.features.map((feature, i) => (
              <li key={i} className="flex items-start gap-3">
                <div className={`w-6 h-6 bg-gradient-to-br ${tool.color} rounded-full flex items-center justify-center shrink-0 mt-0.5`}>
                  <span className="text-white text-xs font-bold">{i + 1}</span>
                </div>
                <span className="text-slate-700">{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Notify CTA */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 text-center text-white">
          <h2 className="text-2xl font-semibold mb-4">
            Interesse an diesem Tool?
          </h2>
          <p className="text-white/70 mb-6">
            Kontaktieren Sie uns und wir informieren Sie, sobald das Tool verfügbar ist.
          </p>
          <Button
            className="h-12 px-8 rounded-xl bg-white text-slate-900 hover:bg-slate-100 font-medium"
            onClick={() => {
              window.location.href = `mailto:mail@wegener-gmbh.com?subject=Interesse an ${tool.name}&body=Hallo,%0A%0Aich interessiere mich für das Tool "${tool.name}" und würde gerne informiert werden, sobald es verfügbar ist.%0A%0AMit freundlichen Grüßen`;
            }}
          >
            Benachrichtigung anfragen
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>

        {/* Available Tool Hint */}
        <div className="mt-8 p-6 bg-violet-50 rounded-2xl border border-violet-100">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-violet-600 to-purple-700 rounded-xl flex items-center justify-center shrink-0">
              <span className="text-white text-lg">🎬</span>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">Schon jetzt verfügbar: Schnitt & Struktur</h3>
              <p className="text-slate-600 text-sm mb-3">
                Aufnahme/Upload, Untertitel (SRT/VTT/TTML), Voiceover und Videoschnitt in einem Tool.
              </p>
              <Link href="/tools/untertitel">
                <Button size="sm" className="bg-violet-600 hover:bg-violet-700">
                  Zum Video-Tool
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </PageLayout>
  );
}
