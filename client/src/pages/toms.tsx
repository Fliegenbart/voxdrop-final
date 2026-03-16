import {
  Shield, Lock, Server, Key, Database,
  Activity, FileText, ArrowLeft, CheckCircle2, Download,
  Network, HardDrive, UserCheck, AlertTriangle
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import { PageLayout } from "@/components/PageLayout";

const tomCategories = [
  {
    title: "1. Zutrittskontrolle",
    icon: Key,
    description: "Maßnahmen zur Verhinderung des unbefugten Zutritts zu Datenverarbeitungsanlagen",
    measures: [
      "Serverstandort in zertifizierten deutschen Rechenzentren (ISO 27001)",
      "Zutrittskontrollsysteme mit elektronischen Schlüsselkarten",
      "24/7 Videoüberwachung der Serverräume",
      "Besucherprotokollierung und Begleitpflicht",
      "Mehrstufige Sicherheitszonen",
    ],
  },
  {
    title: "2. Zugangskontrolle",
    icon: Lock,
    description: "Maßnahmen zur Verhinderung der unbefugten Nutzung von Datenverarbeitungssystemen",
    measures: [
      "Passwortrichtlinien (min. 12 Zeichen, Komplexitätsanforderungen)",
      "Zwei-Faktor-Authentifizierung (2FA) für alle administrativen Zugänge",
      "Automatische Sperrung nach fehlgeschlagenen Anmeldeversuchen",
      "Verschlüsselte VPN-Verbindungen für Remote-Zugriffe",
      "Regelmäßige Überprüfung und Deaktivierung nicht mehr benötigter Accounts",
    ],
  },
  {
    title: "3. Zugriffskontrolle",
    icon: UserCheck,
    description: "Maßnahmen zur Gewährleistung, dass nur autorisierte Personen auf Daten zugreifen",
    measures: [
      "Rollenbasiertes Berechtigungskonzept (RBAC)",
      "Need-to-know-Prinzip für Datenzugriffe",
      "Protokollierung aller Datenzugriffe (Audit-Logs)",
      "Regelmäßige Überprüfung der Zugriffsberechtigungen",
      "Sichere Löschung von Daten nach Aufbewahrungsfristen",
    ],
  },
  {
    title: "4. Weitergabekontrolle",
    icon: Network,
    description: "Maßnahmen zum Schutz bei der elektronischen Übertragung von Daten",
    measures: [
      "HTTPS/TLS für alle Datenübertragungen",
      "Dateiverarbeitung auf deutschen Servern (keine Cloud-KI für Upload-Inhalte)",
      "Sichere API-Authentifizierung (z.B. JWT) und Rate-Limits",
      "Drittländer nur für notwendige Nebenleistungen (z.B. E-Mail-Versand) – siehe Subunternehmer-Verzeichnis",
      "Protokollierung sicherheitsrelevanter Vorgänge (Audit-Logs, Fehlerlogs)",
    ],
  },
  {
    title: "5. Eingabekontrolle",
    icon: Activity,
    description: "Maßnahmen zur Nachvollziehbarkeit von Dateneingaben und -änderungen",
    measures: [
      "Vollständige Protokollierung aller Eingaben mit Zeitstempel",
      "Benutzeridentifikation bei allen Vorgängen",
      "Unveränderbare Audit-Trails",
      "Versionierung von Dokumenten und Konfigurationen",
      "Regelmäßige Auswertung der Protokolle",
    ],
  },
  {
    title: "6. Auftragskontrolle",
    icon: FileText,
    description: "Maßnahmen zur weisungsgemäßen Verarbeitung durch Auftragnehmer",
    measures: [
      "Sorgfältige Auswahl von Unterauftragnehmern",
      "Abschluss von AVVs mit allen Unterauftragnehmern",
      "Regelmäßige Überprüfung der Unterauftragnehmer",
      "Dokumentation aller Weisungen",
      "Transparente Subunternehmer-Liste",
    ],
  },
  {
    title: "7. Verfügbarkeitskontrolle",
    icon: Server,
    description: "Maßnahmen zum Schutz gegen Datenverlust und zur Wiederherstellung",
    measures: [
      "Tägliche automatisierte Backups",
      "Geografisch getrennte Backup-Speicherung",
      "Regelmäßige Wiederherstellungstests",
      "Redundante Serverinfrastruktur",
      "USV und Notstromversorgung im Rechenzentrum",
      "Disaster Recovery Plan mit definierten RTO/RPO",
    ],
  },
  {
    title: "8. Trennungskontrolle",
    icon: Database,
    description: "Maßnahmen zur getrennten Verarbeitung von Daten verschiedener Auftraggeber",
    measures: [
      "Logische Mandantentrennung in der Datenbank",
      "Separate Verschlüsselungsschlüssel pro Mandant",
      "Isolierte Verarbeitungsumgebungen",
      "Strikte Trennung von Entwicklungs- und Produktionsumgebungen",
      "Keine mandantenübergreifenden Datenzugriffe",
    ],
  },
];

export default function TOMs() {
  return (
    <PageLayout>
      <SEO
        title="Technisch-organisatorische Maßnahmen (TOMs)"
        description="Dokumentation der technischen und organisatorischen Maßnahmen von VoxDrop nach Art. 32 DSGVO. Sicherheitsmaßnahmen für den Schutz personenbezogener Daten."
        canonical="/toms"
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
            <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center">
              <Shield className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                Technisch-organisatorische Maßnahmen (TOMs)
              </h1>
              <p className="text-slate-600 mt-1">
                Dokumentation gemäß Art. 32 DS-GVO
              </p>
            </div>
          </div>

          <p className="text-slate-600 mb-6">
            Die folgenden technischen und organisatorischen Maßnahmen wurden implementiert, um ein
            dem Risiko angemessenes Schutzniveau für die Verarbeitung personenbezogener Daten zu
            gewährleisten.
          </p>

          <Button
            className="bg-green-600 hover:bg-green-700"
            onClick={() => typeof window !== 'undefined' && window.print()}
          >
            <Download className="w-4 h-4 mr-2" />
            TOMs als PDF herunterladen
          </Button>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { icon: Server, label: "Serverstandort", value: "Deutschland" },
            { icon: Lock, label: "Verschlüsselung", value: "TLS (HTTPS)" },
            { icon: HardDrive, label: "Backups", value: "Nach Policy" },
            { icon: AlertTriangle, label: "Letzte Aktualisierung", value: "Jan 2026" },
          ].map((stat, i) => (
            <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
              <stat.icon className="w-5 h-5 text-slate-400 mb-2" />
              <div className="text-sm text-slate-600">{stat.label}</div>
              <div className="font-semibold text-slate-900">{stat.value}</div>
            </div>
          ))}
        </div>

        {/* TOM Categories */}
        <div className="space-y-6">
          {tomCategories.map((category, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-violet-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <category.icon className="w-5 h-5 text-violet-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      {category.title}
                    </h2>
                    <p className="text-sm text-slate-600 mt-1">
                      {category.description}
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-6 bg-slate-50">
                <ul className="space-y-3">
                  {category.measures.map((measure, j) => (
                    <li key={j} className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <span className="text-slate-700">{measure}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        {/* Additional Info */}
        <div className="mt-8 bg-violet-50 rounded-2xl p-6 border border-violet-100">
          <h2 className="text-lg font-semibold text-blue-900 mb-4">
            Regelmäßige Überprüfung
          </h2>
          <p className="text-violet-800 mb-4">
            Die technischen und organisatorischen Maßnahmen werden regelmäßig auf ihre Wirksamkeit
            geprüft und bei Bedarf angepasst. Änderungen werden dokumentiert und den Auftraggebern
            bei wesentlichen Änderungen mitgeteilt.
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2 text-violet-700">
              <CheckCircle2 className="w-4 h-4" />
              <span>Jährliches Sicherheitsaudit</span>
            </div>
            <div className="flex items-center gap-2 text-violet-700">
              <CheckCircle2 className="w-4 h-4" />
              <span>Kontinuierliche Überwachung</span>
            </div>
            <div className="flex items-center gap-2 text-violet-700">
              <CheckCircle2 className="w-4 h-4" />
              <span>Incident Response Plan</span>
            </div>
          </div>
        </div>

        {/* Footer Note */}
        <div className="mt-8 flex items-center gap-4 text-sm text-slate-600">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <span>Stand: Januar 2026 | Version 1.1</span>
        </div>
      </main>
    </PageLayout>
  );
}
