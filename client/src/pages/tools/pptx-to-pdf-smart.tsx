import { PptxPdfModePage } from "@/components/tools/PptxPdfModePage";

export default function PptxToPdfSmart() {
  return (
    <PptxPdfModePage
      mode="narrative_summary"
      apiBase="/api/pptx-summary-pdf"
      canonical="/tools/pptx-to-pdf-smart"
      seoTitle="PPTX zu PDF/UA Narrative Summary"
      seoDescription="Narrative barrierefreie Lesefassung aus PowerPoint mit KI-Zusammenfassung, Alt-Texten und technischer PDF/UA-Prüfung."
      heroTitle="PPTX → PDF/UA Narrative Summary"
      heroDescription="Screenreader-optimierte Lesefassung mit Zusammenfassungen, Strukturhinweisen und technischer PDF/UA-Prüfung."
      accentClass="bg-gradient-to-br from-orange-500 to-red-500"
      introTitle="Narrative Summary"
      introDescription="Dieser Modus erzeugt eine lesefreundliche barrierefreie Fassung mit Überblick, Folienzusammenfassungen und semantischer Aufbereitung."
      detailNote="Speaker Notes werden nur als interner Kontext genutzt und nicht wörtlich in die sichtbare Ausgabe übernommen."
      submitLabel="Narratives PDF/UA erstellen"
      completionTitle="Narrative PDF/UA-Fassung erstellt"
      features={[
        "Barrierefreie Lesefassung mit Überblick und Folienzusammenfassungen",
        "Speaker Notes nur als Kontext, nicht als roher Ausgabetext",
        "Technischer PDF/UA-Gate vor Abschluss des Jobs",
        "Qualitätsstatus mit Risk Flags und Degraded-Hinweisen",
        "Optimiert für Screenreader und nachvollziehbare Exportpfade",
      ]}
    />
  );
}
