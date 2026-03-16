import { Link } from "wouter";
import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { ArrowRight, Brain, CheckCircle2, Scissors, Share2, Video } from "lucide-react";

const steps = [
  {
    title: "Schnitt & Struktur",
    description: "Aufnehmen oder Upload, Untertitel (SRT/VTT/TTML), Voiceover und Schnitt in einem Workflow - barrierefrei für alle.",
    href: "/tools/untertitel",
    icon: Scissors,
    color: "from-slate-500 to-slate-700",
    cta: "Jetzt starten",
    available: true,
  },
  {
    title: "VoxCut",
    description: "Erweiterte KI-Schnittfunktionen (Text-/Sprachsteuerung) als separates Modul.",
    href: "/tools/voxcut",
    icon: Brain,
    color: "from-cyan-500 to-blue-600",
    cta: "Kommt bald",
    available: false,
  },
  {
    title: "Bereitstellen & Teilen",
    description: "Exports paketieren und sicher weitergeben (z.B. Team, Review, Freigabe).",
    href: "/tools/filesharing",
    icon: Share2,
    color: "from-teal-500 to-cyan-600",
    cta: "Kommt bald",
    available: false,
  },
] as const;

export default function VideoSuite() {
  return (
    <PageLayout>
      <SEO
        title="VoxDrop Video Suite"
        description="Video-Produktion als Prozess: Aufnahme, Schnitt, Untertitel, Voiceover und Bereitstellung in einem Workflow. Barrierefreiheit inklusive."
        canonical="/video"
      />

      <header className="pt-16 pb-10 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-violet-50 text-violet-700 rounded-full text-sm font-medium mb-6">
            <Video className="w-4 h-4" />
            Video als integrierter Prozess
          </div>
          <h1 className="text-4xl md:text-5xl font-semibold text-slate-900 tracking-tight mb-4">
            Video Suite
          </h1>
          <p className="text-xl text-slate-600 font-light max-w-2xl mx-auto">
            Videos sind ein Kernkanal moderner Kommunikation. VoxDrop loest den Video-Prozess integriert und macht die
            Ergebnisse automatisch barrierefrei: Untertitel für gehörlose/schwerhörige Menschen, nutzbar auch ohne Ton.
          </p>
        </div>
      </header>

      <main id="main-content" className="max-w-5xl mx-auto px-6 pb-24" tabIndex={-1}>
        <section className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-semibold text-slate-900">Der Workflow in 3 Schritten</h2>
              <p className="text-sm text-slate-600 mt-1">
                Inhaltlich getrennt vom klassischen “Barrierefreiheits-Check”, aber Teil derselben Suite: ein
                durchgängiger Produktionsprozess für Demos, Selbstlernkurse und Materialbereitstellung.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mt-8">
            {steps.map((step) => {
              const card = (
                <div
                  className={`group bg-white rounded-2xl p-6 border transition-all h-full ${
                    step.available
                      ? "border-slate-200 hover:shadow-lg hover:border-violet-200 cursor-pointer"
                      : "border-slate-200 opacity-70 cursor-not-allowed"
                  }`}
                >
                  {!step.available && (
                    <div className="inline-flex items-center px-2 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium mb-4">
                      Kommt bald
                    </div>
                  )}
                  <div className="flex items-center gap-4 mb-4">
                    <div className={`w-12 h-12 bg-gradient-to-br ${step.color} rounded-xl flex items-center justify-center`}>
                      <step.icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className={`font-semibold text-slate-900 ${step.available ? "group-hover:text-violet-600" : ""} transition-colors`}>
                      {step.title}
                    </h3>
                  </div>
                  <p className="text-slate-600 text-sm leading-relaxed">{step.description}</p>
                  <div className={`mt-4 flex items-center text-sm font-medium ${step.available ? "text-violet-600" : "text-slate-500"}`}>
                    <span>{step.cta}</span>
                    {step.available && <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />}
                  </div>
                </div>
              );

              if (!step.available) {
                return (
                  <div key={step.href + step.title} aria-disabled="true">
                    {card}
                  </div>
                );
              }

              return (
                <Link key={step.href + step.title} href={step.href}>
                  {card}
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mt-10 bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-10 text-white">
          <h2 className="text-2xl md:text-3xl font-semibold mb-3">Warum das im Hauptmenue separat ist</h2>
          <p className="text-white/80 max-w-3xl">
            Viele Barrierefreiheits-Tools starten bei Checklisten. In der Praxis beginnen Teams bei Video-Produktion und
            Materialbereitstellung. VoxDrop trennt das im UI klar als eigenen Bereich, integriert aber Untertitel und
            barrierefreie Exporte direkt in den Prozess.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
            <Link href="/tools/untertitel">
              <Button className="h-12 px-6 rounded-xl bg-white text-slate-900 hover:bg-slate-100 font-semibold">
                Video Workflow starten
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <Link href="/features">
              <Button variant="outline" className="h-12 px-6 rounded-xl border-white/25 text-white hover:bg-white/10">
                Alle Tools ansehen
              </Button>
            </Link>
          </div>
        </section>
      </main>

    </PageLayout>
  );
}
