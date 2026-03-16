import { Link } from "wouter";
import { useMemo, useState } from "react";
import { PageLayout } from "@/components/PageLayout";
import { SEO } from "@/components/SEO";
import { toolGroups, type ToolItem } from "@/lib/tool-catalog";
import { ChevronRight, FileCheck2, FileText, Globe, Layers, Shield, Video } from "lucide-react";
import { Button } from "@/components/ui/button";

type ToolFilter = "all" | "video" | "documents" | "web" | "reports";

const categorizeTool = (tool: ToolItem): ToolFilter[] => {
  const href = tool.href;
  const id = tool.id;

  const categories: ToolFilter[] = ["all"];

  const isVideo =
    href === "/video" ||
    href.startsWith("/tools/untertitel") ||
    href === "/avatar" ||
    href.startsWith("/tools/pptx-podcast") ||
    id === "audiodeskription" ||
    id === "live-transkription";

  const isDocuments =
    href.includes("pptx") ||
    href.includes("pdf") ||
    href.includes("word") ||
    id === "alt-text";

  const isWeb = id === "aria-checker" || id === "web-pruefung" || id === "formular-check";
  const isReports = href === "/tools/reports" || id === "vpat-checker" || href.startsWith("/dashboard/compliance");

  if (isVideo) categories.push("video");
  if (isDocuments) categories.push("documents");
  if (isWeb) categories.push("web");
  if (isReports) categories.push("reports");

  return categories;
};

export default function Features() {
  const [filter, setFilter] = useState<ToolFilter>("all");

  const filteredToolGroups = useMemo(() => {
    if (filter === "all") return toolGroups;
    return toolGroups
      .map((group) => ({
        ...group,
        tools: group.tools.filter((tool) => tool.available && categorizeTool(tool).includes(filter)),
      }))
      .filter((group) => group.tools.length > 0);
  }, [filter]);

  const counts = useMemo(() => {
    const allTools = toolGroups.flatMap((group) => group.tools).filter((tool) => tool.available);
    const count = (value: ToolFilter) => allTools.filter((tool) => categorizeTool(tool).includes(value)).length;

    return {
      all: allTools.length,
      video: count("video"),
      documents: count("documents"),
      web: count("web"),
      reports: count("reports"),
    };
  }, []);

  return (
    <PageLayout>
      <SEO
        title="Produktüberblick und Module"
        description="Produktmodule für barrierearme Dokumente, Screen Recordings, Untertitel, Alt-Texte und nachvollziehbare Accessibility-Workflows."
        canonical="/features"
      />

      <header className="border-b border-slate-100 bg-slate-50 px-6 pb-14 pt-16">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200">
            <Layers className="h-4 w-4" />
            Produktüberblick
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900 md:text-5xl">
            Module für barrierearme Inhalte und nachvollziehbare Workflows
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-xl font-light leading-relaxed text-slate-600">
            Die Produktmodule von VoxDrop unterstützen Behörden und regulierte Organisationen bei
            Dokumenten-, Medien- und Nachweisprozessen in sensiblen Umgebungen.
          </p>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-5xl px-6 pb-24 pt-12" tabIndex={-1}>
        <div className="mb-10 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              filter === "all" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Layers className="h-4 w-4" aria-hidden="true" />
            Alle Module
            <span className={`text-xs ${filter === "all" ? "text-white/75" : "text-slate-500"}`}>({counts.all})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilter("video")}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              filter === "video" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Video className="h-4 w-4" aria-hidden="true" />
            Video
            <span className={`text-xs ${filter === "video" ? "text-white/75" : "text-slate-500"}`}>({counts.video})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilter("documents")}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              filter === "documents" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            Dokumente
            <span className={`text-xs ${filter === "documents" ? "text-white/75" : "text-slate-500"}`}>({counts.documents})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilter("web")}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              filter === "web" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Globe className="h-4 w-4" aria-hidden="true" />
            Web
            <span className={`text-xs ${filter === "web" ? "text-white/75" : "text-slate-500"}`}>({counts.web})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilter("reports")}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              filter === "reports" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <FileCheck2 className="h-4 w-4" aria-hidden="true" />
            Nachweise
            <span className={`text-xs ${filter === "reports" ? "text-white/75" : "text-slate-500"}`}>({counts.reports})</span>
          </button>
        </div>

        <div className="space-y-12">
          {filteredToolGroups.map((group) => (
            <section key={group.id} className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-slate-900">{group.title}</h2>
                <p className="text-sm text-slate-600">{group.description}</p>
              </div>

              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {group.tools.map((tool) => (
                  <Link
                    key={tool.href}
                    href={tool.available ? tool.href : "#"}
                    onClick={(event) => !tool.available && event.preventDefault()}
                  >
                    <div
                      className={`group flex h-full flex-col rounded-3xl border p-6 transition-all ${
                        tool.available
                          ? "cursor-pointer border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                          : "cursor-not-allowed border-slate-100 bg-slate-50 opacity-60"
                      }`}
                    >
                      <div className="mb-4 flex items-center gap-4">
                        <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${tool.color}`}>
                          <tool.icon className="h-6 w-6 text-white" />
                        </div>
                        <h3 className="font-semibold text-slate-900 transition-colors group-hover:text-slate-950">
                          {tool.name}
                        </h3>
                      </div>
                      <p className="text-sm leading-relaxed text-slate-600">{tool.description}</p>
                      {tool.available && (
                        <div className="mt-auto flex items-center pt-4 text-sm font-medium text-slate-900">
                          <span>Modul ansehen</span>
                          <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </div>
                      )}
                      {!tool.available && (
                        <div className="mt-auto pt-4">
                          <div className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
                            Kommt bald
                          </div>
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="mt-16 rounded-[2rem] bg-slate-900 p-12 text-center text-white">
          <Shield className="mx-auto h-10 w-10 text-white/70" />
          <h2 className="mt-5 text-3xl font-semibold md:text-4xl">Mehr Kontext für Behörden und Beschaffung</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-white/75">
            Vertiefen Sie Sicherheit, Betrieb, Pilotmodell und Unterlagen für öffentliche Auftraggeber auf der
            Behörden-Seite von VoxDrop.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
            <Button asChild className="h-12 rounded-xl bg-white px-8 text-slate-900 hover:bg-slate-100">
              <Link href="/behoerden">Für Behörden ansehen</Link>
            </Button>
            <Button asChild variant="outline" className="h-12 rounded-xl border-white/20 px-8 text-white hover:bg-white/10">
              <a href="mailto:anfrage@voxdrop.live?subject=Beh%C3%B6rdendemo%20VoxDrop">Behördendemo anfragen</a>
            </Button>
          </div>
        </section>
      </main>
    </PageLayout>
  );
}
