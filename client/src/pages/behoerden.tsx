import { Button } from "@/components/ui/button";
import {
  Building2, Shield, CheckCircle2, FileText, Server, Users,
  Lock, Globe, Download, ArrowRight, Phone, Mail, Scale,
  ShieldCheck, Cloud, Database, FileCheck, Award, Clock,
  LogOut, Accessibility
} from "lucide-react";
import { Link } from "wouter";
import { SEO } from "@/components/SEO";
import { PageLayout } from "@/components/PageLayout";

const complianceFeatures = [
  {
    icon: Shield,
    title: "DSGVO-konform",
    description: "Vollständige Datenschutz-Grundverordnung Konformität mit dokumentierten technisch-organisatorischen Maßnahmen.",
  },
  {
    icon: Server,
    title: "Deutsche Server",
    description: "Alle Daten werden ausschließlich auf Servern in Deutschland verarbeitet und gespeichert.",
  },
  {
    icon: Lock,
    title: "Verschlüsselung (TLS)",
    description: "Alle Verbindungen sind per HTTPS/TLS verschlüsselt. Dateien werden auf deutschen Servern verarbeitet (keine Cloud-KI).",
  },
  {
    icon: Globe,
    title: "BITV 2.0 / WCAG 2.1",
    description: "Unsere Tools helfen Ihnen, die gesetzlichen Barrierefreiheitsanforderungen zu erfüllen.",
  },
  {
    icon: FileCheck,
    title: "Audit-Logging",
    description: "Vollständige Protokollierung aller Verarbeitungsvorgänge für Compliance-Nachweise.",
  },
  {
    icon: Download,
    title: "Datenportabilität",
    description: "Jederzeit vollständiger Export aller Daten – keine Vendor Lock-in Risiken.",
  },
];

const documents = [
  {
    title: "Leistungsbeschreibung",
    description: "Vollständige Servicebeschreibung für Ausschreibungen",
    href: "/leistungsbeschreibung",
    icon: FileText,
  },
  {
    title: "Service Level Agreement (SLA)",
    description: "Verfügbarkeit, Reaktionszeiten, Support",
    href: "/sla",
    icon: Clock,
  },
  {
    title: "Auftragsverarbeitungsvertrag (AVV)",
    description: "Vertrag nach Art. 28 DSGVO für die Auftragsverarbeitung",
    href: "/avv",
    icon: FileCheck,
  },
  {
    title: "Technisch-organisatorische Maßnahmen",
    description: "Dokumentation unserer Sicherheitsmaßnahmen (TOMs)",
    href: "/toms",
    icon: ShieldCheck,
  },
  {
    title: "BSI C5-Basiskriterien",
    description: "Cloud-Sicherheit nach BSI C5-Standard",
    href: "/c5-mapping",
    icon: Shield,
  },
  {
    title: "Exit- & Löschkonzept",
    description: "Datenportabilität und Löschprozesse",
    href: "/exit-konzept",
    icon: LogOut,
  },
  {
    title: "Subunternehmer-Verzeichnis",
    description: "Liste aller eingesetzten Unterauftragnehmer",
    href: "/subunternehmer",
    icon: Users,
  },
  {
    title: "Erklärung zur Barrierefreiheit",
    description: "WCAG 2.1 AA Konformität von VoxDrop selbst",
    href: "/barrierefreiheit-erklaerung",
    icon: Accessibility,
  },
  {
    title: "Datenschutzerklärung",
    description: "Informationen nach DSGVO (Art. 13/14) & Datenverarbeitung",
    href: "/datenschutz",
    icon: Lock,
  },
  {
    title: "Impressum",
    description: "Anbieterkennzeichnung & Kontakt",
    href: "/impressum",
    icon: Scale,
  },
];

const benefits = [
  {
    title: "EVB-IT Cloud konform",
    description: "Vertragsabschluss nach EVB-IT Cloud Mustervertrag möglich – kein aufwendiges Ausschreibungsverfahren für Standardleistungen.",
    icon: Scale,
  },
  {
    title: "Schnelle Beschaffung",
    description: "Alle erforderlichen Dokumente (AVV, TOMs, SLA) sind vorbereitet. Direkte Beschaffung oder Rahmenvertrag möglich.",
    icon: Award,
  },
  {
    title: "Behörden-Erfahrung",
    description: "Wir verstehen die Anforderungen öffentlicher Auftraggeber und bieten maßgeschneiderte Lösungen.",
    icon: Building2,
  },
];

export default function Behörden() {
  return (
    <PageLayout>
      <SEO
        title="Für Behörden – Unterlagen, Sicherheit und Betrieb"
        description="VoxDrop für öffentliche Auftraggeber: Unterlagen für Beschaffung, Sicherheit, Datenschutz und schrittweise Einführung in sensiblen Umgebungen."
        canonical="/behoerden"
      />

      {/* Skip Link */}

      {/* Hero Section */}
      <header className="pt-16 pb-12 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-violet-50 text-violet-700 rounded-full text-sm font-medium mb-6">
            <Building2 className="w-4 h-4" />
            Für öffentliche Auftraggeber
          </div>
          <h1 className="text-4xl md:text-5xl font-semibold text-slate-900 tracking-tight mb-4">
            Unterlagen und Betriebsmodelle<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-purple-700">
              für Ihre Behörde.
            </span>
          </h1>
          <p className="text-xl text-slate-600 font-light max-w-2xl mx-auto mb-8">
            Diese Seite vertieft Sicherheit, Beschaffung, Unterlagen und Einführungswege für öffentliche Auftraggeber,
            die VoxDrop in einer sensiblen Umgebung bewerten möchten.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg" className="bg-violet-600 hover:bg-violet-700">
              <a href="mailto:anfrage@voxdrop.live?subject=Unterlagen%20VoxDrop">
                <Mail className="w-4 h-4 mr-2" />
                Unterlagen anfordern
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="mailto:anfrage@voxdrop.live?subject=Pilotgespr%C3%A4ch%20VoxDrop">
                <Phone className="w-4 h-4 mr-2" />
                Pilotgespräch vereinbaren
              </a>
            </Button>
          </div>
        </div>
      </header>

      <main id="main-content" className="max-w-6xl mx-auto px-6 pb-24" tabIndex={-1}>

        {/* Trust Badges */}
        <div className="flex flex-wrap justify-center gap-4 mb-16">
          {[
            { icon: Cloud, label: "EVB-IT Cloud" },
            { icon: Shield, label: "DSGVO" },
            { icon: Server, label: "Server in DE" },
            { icon: Globe, label: "BITV 2.0" },
          ].map((badge, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm border border-slate-200"
            >
              <badge.icon className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-slate-700">{badge.label}</span>
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            </div>
          ))}
        </div>

        {/* Benefits Section */}
        <section className="mb-20" id="pilot-einfuehrung">
          <h2 className="text-2xl font-semibold text-slate-900 text-center mb-4">
            Pilot und Einführung
          </h2>
          <p className="text-slate-600 text-center mb-10 max-w-2xl mx-auto">
            VoxDrop kann schrittweise eingeführt werden, vom abgegrenzten Pilot bis zum geregelten Betrieb.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                title: "Pilot",
                description: "Konkreter Use Case, kleine Nutzergruppe und klare Bewertungskriterien für die fachliche und technische Erstprüfung.",
              },
              {
                title: "Fachbereich",
                description: "Regelbetrieb für Teams mit wiederkehrendem Bedarf in Dokumentation, Schulung, Kommunikation oder Accessibility.",
              },
              {
                title: "Organisation",
                description: "Erweiterter Betrieb mit abgestimmten Verantwortlichkeiten, Unterlagen und Skalierungsoptionen.",
              },
            ].map((item) => (
              <div key={item.title} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                <h3 className="text-lg font-semibold text-slate-900 mb-2">{item.title}</h3>
                <p className="text-slate-600">{item.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-20">
          <h2 className="text-2xl font-semibold text-slate-900 text-center mb-10">
            Warum VoxDrop für Behörden?
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {benefits.map((benefit, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200"
              >
                <div className="w-12 h-12 bg-violet-50 rounded-xl flex items-center justify-center mb-4">
                  <benefit.icon className="w-6 h-6 text-violet-600" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  {benefit.title}
                </h3>
                <p className="text-slate-600">
                  {benefit.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Compliance Features Grid */}
        <section className="mb-20" id="sicherheit-betrieb">
          <h2 className="text-2xl font-semibold text-slate-900 text-center mb-4">
            Sicherheit & Compliance
          </h2>
          <p className="text-slate-600 text-center mb-10 max-w-2xl mx-auto">
            VoxDrop erfüllt die hohen Anforderungen öffentlicher Auftraggeber an Datenschutz und IT-Sicherheit.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {complianceFeatures.map((feature, i) => (
              <div
                key={i}
                className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 flex gap-4"
              >
                <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <feature.icon className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 mb-1">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-slate-600">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Documents Section */}
        <section className="mb-20" id="unterlagen">
          <h2 className="text-2xl font-semibold text-slate-900 text-center mb-4">
            Unterlagen für Beschaffung und Bewertung
          </h2>
          <p className="text-slate-600 text-center mb-10 max-w-2xl mx-auto">
            Alle für die Beschaffung erforderlichen Dokumente stehen Ihnen zur Verfügung.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            {documents.map((doc, i) => (
              <Link key={i} href={doc.href}>
                <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-violet-50 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-violet-100 transition-colors">
                      <doc.icon className="w-5 h-5 text-violet-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-900 mb-1 group-hover:text-violet-600 transition-colors">
                        {doc.title}
                      </h3>
                      <p className="text-sm text-slate-600">
                        {doc.description}
                      </p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-violet-600 transition-colors" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* SLA Preview */}
        <section className="mb-20">
          <div className="bg-gradient-to-br from-violet-600 to-purple-700 rounded-2xl p-8 text-white">
            <h2 className="text-2xl font-semibold mb-6 text-center">
              Service Level Agreement (SLA)
            </h2>
            <div className="grid md:grid-cols-4 gap-6">
              {[
                { value: "99,5%", label: "Verfügbarkeit" },
                { value: "< 4h", label: "Reaktionszeit kritisch" },
                { value: "< 24h", label: "Reaktionszeit normal" },
                { value: "DSGVO", label: "Datenlöschung auf Anfrage" },
              ].map((item, i) => (
                <div key={i} className="text-center">
                  <div className="text-3xl font-bold mb-1">{item.value}</div>
                  <div className="text-blue-100 text-sm">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Contact Section */}
        <section id="kontakt" className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">
              Interesse an VoxDrop für Ihre Behörde?
            </h2>
            <p className="text-slate-600 mb-8">
              Wir beraten Sie gerne zu den Einsatzmöglichkeiten und erstellen Ihnen ein
              individuelles Angebot. Für Rahmenverträge und größere Volumen bieten wir
              attraktive Konditionen.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
              <Button asChild size="lg" className="bg-violet-600 hover:bg-violet-700">
                <a href="mailto:anfrage@voxdrop.live">
                  <Mail className="w-4 h-4 mr-2" />
                  anfrage@voxdrop.live
                </a>
              </Button>
              <Button size="lg" variant="outline" disabled>
                <Phone className="w-4 h-4 mr-2" />
                Telefon auf Anfrage
              </Button>
            </div>
            <div className="flex items-center justify-center gap-6 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4" />
                <span>Deutsche Server</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4" />
                <span>DSGVO-konform</span>
              </div>
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4" />
                <span>EVB-IT Cloud</span>
              </div>
            </div>
          </div>
        </section>

      </main>
    </PageLayout>
  );
}
