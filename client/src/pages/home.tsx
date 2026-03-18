import { Link } from "wouter";
import { PageLayout } from "@/components/PageLayout";
import { Navigation } from "@/components/Navigation";
import { SEO, OrganizationSchema, WebSiteSchema } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Check,
  FileCheck,
  FileText,
  Files,
  GraduationCap,
  MonitorPlay,
  MoveRight,
  ScanSearch,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

const trustBadges = [
  "Lokal betreibbar",
  "Deutsche Infrastruktur",
  "Für sensible Umgebungen",
  "Untertitel & Alt-Texte",
  "PDF-Accessibility-Workflows",
  "Auditierbare Nachweise",
];

const workflowSteps = [
  {
    step: "01",
    title: "Input und Analyse",
    description: "Dateien, Aufzeichnungen und Inhalte werden in einer kontrollierten Umgebung verarbeitet und für die weitere Bearbeitung vorbereitet.",
  },
  {
    step: "02",
    title: "Aufbereitung",
    description: "VoxDrop unterstützt bei Untertiteln, Alt-Texten, verständlicheren Formulierungen und barriereorientierten Dokumenten-Workflows.",
  },
  {
    step: "03",
    title: "Prüfung und Freigabe",
    description: "Teams behalten die Kontrolle. Ergebnisse können geprüft, angepasst und vor der Weitergabe freigegeben werden.",
  },
  {
    step: "04",
    title: "Export und Nachweis",
    description: "Inhalte werden in geeignete Formate überführt und durch nachvollziehbare Exporte und Reports ergänzt.",
  },
];

const useCases: { title: string; description: string; icon: LucideIcon }[] = [
  {
    title: "Solution-Demos und Verfahrensdokumentation",
    description: "Abläufe, Oberflächen und Fachverfahren nachvollziehbar dokumentieren und intern weiterverwendbar aufbereiten.",
    icon: MonitorPlay,
  },
  {
    title: "Interne Schulungen und Wissenssicherung",
    description: "Wissen in Form von Screen Recordings, Untertiteln und strukturierten Inhalten breiter verfügbar machen.",
    icon: GraduationCap,
  },
  {
    title: "Barrierearme Dokumente und Medien",
    description: "Teams bei Alt-Texten, Untertiteln und barrierefrei weiterverwendbaren PDF-Dokumenten unterstützen.",
    icon: Files,
  },
  {
    title: "Accessibility-Verantwortung und Audit-Vorbereitung",
    description: "Eine bessere Grundlage für interne Prüfprozesse, Qualitätsverbesserung und dokumentierte Workflows schaffen.",
    icon: FileCheck,
  },
];

const modules = [
  {
    title: "PPTX zu PDF/UA",
    description: "Präsentationen in barrierefrei weiterverwendbare PDF-Dokumente überführen, inklusive Struktur, Lesereihenfolge und Alt-Text-Unterstützung.",
    href: "/tools/pptx-to-pdf-smart",
  },
  {
    title: "Screen Recording, Transkription und Untertitel",
    description: "Bildschirmaufzeichnungen erstellen, verschriftlichen, untertiteln und für interne Kommunikation oder Schulung weiterverarbeiten.",
    href: "/tools/untertitel",
  },
  {
    title: "Alt-Text-Unterstützung",
    description: "Bildinhalte schneller und konsistenter für barrierearme Kommunikation vorbereiten.",
    href: "/tools/alt-text",
  },
  {
    title: "Verständlichere Sprache",
    description: "Texte zugänglicher und verständlicher formulieren, ohne ihren fachlichen Kern zu verlieren.",
    href: "/tools/einfache-sprache",
  },
  {
    title: "Checks und Audit-Vorbereitung",
    description: "Schwachstellen sichtbar machen, Ergebnisse strukturieren und Verbesserungsbedarf nachvollziehbarer dokumentieren.",
    href: "/tools/reports",
  },
];

const trustBlocks = [
  {
    title: "Kontrollierbare Verarbeitung",
    description: "Geeignet für Organisationen, in denen Inhalte die eigene Umgebung möglichst nicht verlassen sollen.",
  },
  {
    title: "Klare Verantwortlichkeiten",
    description: "Prüfung, Freigabe und Qualitätssicherung bleiben in den Händen der Teams.",
  },
  {
    title: "Nachvollziehbare Ergebnisse",
    description: "Exporte, Reports und strukturierte Workflows erleichtern interne Bewertung, Audits und Beschaffung.",
  },
  {
    title: "Für den öffentlichen Sektor gedacht",
    description: "VoxDrop orientiert sich an der Realität von Behörden, Sozialversicherungsträgern und anderen regulierten Organisationen.",
  },
];

const benefitCards = [
  {
    title: "Altlasten abarbeiten",
    description: "Große Mengen an Präsentationen, PDFs, Videos und Bildinhalten strukturierter und effizienter bearbeiten.",
  },
  {
    title: "Qualität absichern",
    description: "Prüf- und Freigabeschritte sorgen für bessere Nachvollziehbarkeit und mehr Konsistenz.",
  },
  {
    title: "Nachweise vorbereiten",
    description: "Reports, Exporte und dokumentierte Workflows schaffen eine belastbarere Grundlage für interne Anforderungen.",
  },
];

const rolloutCards = [
  {
    title: "Pilot",
    description: "Für erste Evaluierungen und konkrete Anwendungsfälle wie Screen Recordings, Untertitelung oder barrierefreie Dokumenten-Workflows.",
  },
  {
    title: "Fachbereich",
    description: "Für Teams mit regelmäßigem Bedarf in Schulung, Dokumentation, Kommunikation oder Accessibility.",
  },
  {
    title: "Organisation",
    description: "Für größere Einheiten mit erhöhten Anforderungen an Betrieb, Verantwortlichkeiten und Skalierung.",
  },
];

const audienceItems = [
  "Behörden und öffentliche Stellen",
  "Sozialversicherungsträger",
  "Kommunale und landesnahe Einrichtungen",
  "Interne Akademien und Schulungsbereiche",
  "Projekt- und Dokumentationsteams",
  "Kommunikations- und Accessibility-Verantwortliche",
  "Regulierte Organisationen mit sensiblen Inhalten",
];

const documentLinks = [
  {
    title: "Produktüberblick",
    description: "Module, Einsatzbereiche und Nutzen für die interne Erstbewertung.",
    href: "/features",
  },
  {
    title: "Sicherheit & Datenschutz",
    description: "Technische und organisatorische Grundlagen für IT, Datenschutz und Informationssicherheit.",
    href: "/behoerden#sicherheit-betrieb",
  },
  {
    title: "Pilot & Einführung",
    description: "Schrittweiser Einstieg vom begrenzten Pilot bis zum breiteren Rollout.",
    href: "/behoerden#pilot-einfuehrung",
  },
  {
    title: "Unterlagen für Beschaffung",
    description: "Leistungsbeschreibung, SLA, AVV und weitere Unterlagen für die Weiterleitung.",
    href: "/behoerden#unterlagen",
  },
];

export default function Home() {
  return (
    <PageLayout bg="white" nav={false}>
      <SEO
        title="Barrierefreie digitale Inhalte. Lokal. Sicher. Für Behörden gemacht."
        description="VoxDrop unterstützt Behörden und regulierte Organisationen bei Screen Recordings, Untertiteln, Alt-Texten und barrierefreien PDF-Workflows direkt in der eigenen IT-Umgebung."
        canonical="/"
      />
      <OrganizationSchema />
      <WebSiteSchema />

      <div className="border-b border-violet-300/60 bg-gradient-to-r from-violet-700 via-purple-700 to-indigo-700 text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-3 text-sm md:flex-row md:items-center md:justify-between">
          <div>Für Behörden, Sozialversicherungsträger und regulierte Organisationen</div>
          <div className="text-white/80">Lokal betreibbar · Deutsche Infrastruktur · Demo auf Anfrage</div>
        </div>
      </div>

      <Navigation />

      <header className="relative overflow-hidden border-b border-violet-100 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.18),transparent_34%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.12),transparent_28%),linear-gradient(180deg,#faf7ff_0%,#ffffff_42%,#f8fafc_100%)] px-6 pb-16 pt-16">
        <div className="mx-auto max-w-4xl">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700 shadow-sm">
              <ShieldCheck className="h-4 w-4 text-violet-700" />
              Lokale Accessibility- und Produktionssuite
            </div>
            <h1 className="mt-8 max-w-4xl text-4xl font-semibold tracking-tight text-slate-900 md:text-6xl md:leading-[1.05]">
              Barrierefreie digitale Inhalte. Lokal. Sicher. Für Behörden gemacht.
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-relaxed text-slate-600 md:text-xl">
              VoxDrop unterstützt öffentliche Stellen und regulierte Organisationen bei Screen Recordings,
              Untertiteln, Alt-Texten und barrierefreien PDF-Workflows direkt in der eigenen IT-Umgebung,
              ohne Cloud-Zwang und ohne unnötigen Datenabfluss.
            </p>

            <div className="mt-8 flex flex-wrap gap-2">
              {trustBadges.map((badge) => (
                <span key={badge} className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/90 px-3 py-1 text-sm text-slate-700 shadow-sm">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-violet-100">
                    <Check className="h-3 w-3 text-violet-700" />
                  </span>
                  {badge}
                </span>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main id="main-content" className="bg-white">
        <section id="produkt" className="border-b border-violet-100 bg-gradient-to-b from-violet-50/70 to-white px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-500">Der Ansatz</div>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
                Ein lokaler Workflow für barrierearme digitale Inhalte
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-600">
                VoxDrop bündelt zentrale Arbeitsschritte in einem System: Inhalte erfassen, aufbereiten, prüfen,
                exportieren und intern weitergeben. So entsteht ein konsistenter Workflow für Teams, die unter
                erhöhten Anforderungen an Datenschutz, Barrierefreiheit und Nachvollziehbarkeit arbeiten.
              </p>
            </div>

            <ol className="grid gap-5 lg:grid-cols-4">
              {workflowSteps.map((step) => (
                <li key={step.step} className="rounded-3xl border border-violet-100 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-purple-700 text-sm font-semibold text-white">
                      {step.step}
                    </span>
                    <MoveRight className="h-5 w-5 text-violet-300" />
                  </div>
                  <h3 className="mt-5 text-xl font-semibold text-slate-900">{step.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">{step.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="einsatzbereiche" className="border-b border-slate-100 px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-500">Einsatzbereiche</div>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
                Wofür Organisationen VoxDrop konkret einsetzen
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-600">
                VoxDrop ist kein Einzweck-Tool, sondern ein produktiver Arbeitskontext für konkrete Aufgaben im Alltag
                von Behörden, Sozialversicherungsträgern und anderen regulierten Organisationen.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {useCases.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="rounded-3xl border border-violet-100 bg-white p-7 shadow-sm hover:shadow-md">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50">
                      <Icon className="h-6 w-6 text-violet-700" />
                    </div>
                    <h3 className="mt-5 text-xl font-semibold text-slate-900">{item.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-slate-600">{item.description}</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-10 text-center">
              <Button asChild variant="outline" className="h-12 rounded-xl border-violet-200 bg-white px-6 text-violet-700 hover:bg-violet-50">
                <Link href="/behoerden">Alle Einsatzbereiche ansehen</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="border-b border-violet-100 bg-gradient-to-b from-white to-violet-50/60 px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-500">Module</div>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
                Funktionen, die in der Praxis zusammengehören
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-600">
                VoxDrop verbindet Funktionen, die in vielen Organisationen bisher getrennt gedacht und bearbeitet werden.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {modules.map((module) => (
                <Link
                  key={module.href}
                  href={module.href}
                  className="group block rounded-3xl border border-violet-100 bg-white p-7 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md hover:border-violet-200"
                >
                  <div className="inline-flex rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-violet-600">
                    Modul
                  </div>
                  <h3 className="mt-5 text-xl font-semibold text-slate-900">{module.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">{module.description}</p>
                  <div className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-violet-700">
                    Modul ansehen
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </Link>
              ))}
            </div>

            <div className="mt-10 text-center">
              <Button asChild variant="outline" className="h-12 rounded-xl border-violet-200 bg-white px-6 text-violet-700 hover:bg-violet-50">
                <Link href="/features">Produktmodule ansehen</Link>
              </Button>
            </div>
          </div>
        </section>

        <section id="sicherheit-betrieb" className="border-b border-slate-100 px-6 py-20">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-500">Sicherheit und Betrieb</div>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
                Datensouveränität ist kein Extra, sondern Voraussetzung
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-600">
                VoxDrop ist für sensible und regulierte Umgebungen konzipiert. Inhalte müssen für zentrale
                Verarbeitungsschritte nicht unnötig in öffentliche Cloud-Dienste ausgelagert werden.
              </p>
              <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <Button asChild className="h-12 rounded-xl bg-violet-600 px-6 hover:bg-violet-700">
                  <Link href="/behoerden">Sicherheit & Betrieb ansehen</Link>
                </Button>
                <Button asChild variant="outline" className="h-12 rounded-xl border-violet-200 bg-white px-6 text-violet-700 hover:bg-violet-50">
                  <a href="#kontakt">Unterlagen für IT und Beschaffung</a>
                </Button>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              {trustBlocks.map((block) => (
                <div key={block.title} className="rounded-3xl border border-violet-100 bg-gradient-to-br from-violet-50/80 to-white p-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-sm">
                      <Check className="h-4 w-4 text-violet-700" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900">{block.title}</h3>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-slate-600">{block.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-violet-100 bg-violet-50/60 px-6 py-16">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto mb-10 max-w-3xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">So hilft VoxDrop im Alltag</h2>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {benefitCards.map((card) => (
                <div key={card.title} className="rounded-3xl border border-violet-100 bg-white p-7 shadow-sm">
                  <h3 className="text-xl font-semibold text-slate-900">{card.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">{card.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="pilot-einfuehrung" className="border-b border-slate-100 px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-500">Einführung</div>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
                Vom Pilot zum Rollout
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-600">
                VoxDrop kann schrittweise eingeführt werden, vom klar umrissenen Pilot über den Einsatz im Fachbereich
                bis hin zum größeren Rollout in einer Organisation.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {rolloutCards.map((card) => (
                <div key={card.title} className="rounded-3xl border border-violet-100 bg-white p-7 shadow-sm hover:shadow-md">
                  <h3 className="text-xl font-semibold text-slate-900">{card.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">{card.description}</p>
                </div>
              ))}
            </div>

            <div className="mt-10 text-center">
              <Button asChild className="h-12 rounded-xl bg-violet-600 px-6 hover:bg-violet-700">
                <a href="mailto:anfrage@voxdrop.live?subject=Pilotgespr%C3%A4ch%20VoxDrop">Pilotgespräch vereinbaren</a>
              </Button>
            </div>
          </div>
        </section>

        <section className="border-b border-violet-100 bg-gradient-to-b from-violet-50/60 to-white px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto mb-10 max-w-3xl text-center">
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-500">Für wen</div>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
                Besonders relevant für Organisationen mit sensiblen Inhalten
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-600">
                VoxDrop eignet sich besonders für Umgebungen, in denen digitale Inhalte unter erhöhten Anforderungen
                an Datenschutz, Nachvollziehbarkeit und Barrierefreiheit entstehen.
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-3">
              {audienceItems.map((item) => (
                <span key={item} className="rounded-full border border-violet-100 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm">
                  {item}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section id="kontakt" className="border-b border-slate-100 px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-500">Unterlagen</div>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
                Unterlagen für IT und Beschaffung anfordern
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-600">
                Gerne stellen wir Ihnen strukturierte Unterlagen zur internen Bewertung zur Verfügung für Fachbereich,
                IT, Informationssicherheit, Datenschutz und Beschaffung.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              {documentLinks.map((item) => (
                <a
                  key={item.title}
                  href={item.href}
                  className="group rounded-3xl border border-violet-100 bg-gradient-to-br from-violet-50/70 to-white p-6 transition hover:-translate-y-0.5 hover:border-violet-200 hover:bg-white"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
                    <FileText className="h-6 w-6 text-violet-700" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-slate-900">{item.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">{item.description}</p>
                  <div className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-violet-700">
                    Unterlage ansehen
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </a>
              ))}
            </div>

            <div className="mt-10 text-center">
              <p className="text-sm text-slate-500">Ideal zur internen Weiterleitung und Erstbewertung.</p>
              <div className="mt-5 flex flex-col justify-center gap-4 sm:flex-row">
                <Button asChild className="h-12 rounded-xl bg-violet-600 px-6 hover:bg-violet-700">
                  <a href="mailto:anfrage@voxdrop.live?subject=Unterlagen%20VoxDrop">Unterlagen anfordern</a>
                </Button>
                <Button asChild variant="outline" className="h-12 rounded-xl border-violet-200 bg-white px-6 text-violet-700 hover:bg-violet-50">
                  <a href="mailto:anfrage@voxdrop.live?subject=Beh%C3%B6rdendemo%20VoxDrop">Behördendemo anfragen</a>
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 py-20">
          <div className="mx-auto max-w-5xl rounded-[2rem] bg-gradient-to-br from-violet-600 via-purple-700 to-indigo-700 px-8 py-12 text-center text-white md:px-12 shadow-xl shadow-violet-200/60">
            <div className="mx-auto max-w-3xl">
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                Sie möchten prüfen, ob VoxDrop zu Ihrer Umgebung passt?
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-white/75">
                Gerne zeigen wir Ihnen anhand eines konkreten Szenarios, wie sich lokale Screen-Recording-,
                Untertitel-, Alt-Text- und PDF-Workflows in Ihrer Organisation abbilden lassen.
              </p>
            </div>

            <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
              <Button asChild size="lg" className="h-12 rounded-xl bg-white px-6 text-violet-700 hover:bg-violet-50">
                <a href="mailto:anfrage@voxdrop.live?subject=Beh%C3%B6rdendemo%20VoxDrop">Behördendemo anfragen</a>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 rounded-xl border-white/20 px-6 text-white hover:bg-white/10">
                <a href="#pilot-einfuehrung">Pilotmodell ansehen</a>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 rounded-xl border-white/20 px-6 text-white hover:bg-white/10">
                <a href="#kontakt">Unterlagen anfordern</a>
              </Button>
            </div>
          </div>
        </section>
      </main>
    </PageLayout>
  );
}
