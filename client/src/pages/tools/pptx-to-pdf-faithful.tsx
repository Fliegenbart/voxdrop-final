import { PptxPdfModePage } from "@/components/tools/PptxPdfModePage";

export default function PptxToPdfFaithful() {
  return (
    <PptxPdfModePage
      mode="faithful_accessible"
      apiBase="/api/pptx-faithful-pdf"
      canonical="/tools/pptx-to-pdf-faithful"
      seoTitle="PPTX zu PDF/UA Folientreu"
      seoDescription="Folientreuer barrierefreier Export von PowerPoint nach PDF/UA mit technischer Prüfung."
      heroTitle="PPTX → PDF/UA Folientreu"
      heroDescription="Barrierefreier Export mit Fokus auf foliennahe Struktur, stabile Lesereihenfolge und technische PDF/UA-Prüfung."
      accentClass="bg-gradient-to-br from-emerald-500 to-teal-600"
      introTitle="Faithful Accessible Export"
      introDescription="Dieser Modus erzeugt eine foliennahe barrierefreie Fassung. Narrative Zusammenfassungen und Kernpunkte stehen nicht im Vordergrund."
      detailNote="Speaker Notes werden standardmäßig ignoriert. Qualitätsrisiken und degradierte GPU-Schritte werden im Jobstatus ausgewiesen."
      submitLabel="Folientreues PDF/UA erstellen"
      completionTitle="Folientreues PDF/UA erstellt"
      features={[
        "Foliennahe Struktur statt narrative Lesefassung",
        "Speaker Notes werden standardmäßig ignoriert",
        "Technischer PDF/UA-Gate vor Abschluss des Jobs",
        "Qualitätsstatus mit Risk Flags und Degraded-Hinweisen",
        "Optimiert für Screenreader, Fokusreihenfolge und nachvollziehbare Exporte",
      ]}
    />
  );
}
