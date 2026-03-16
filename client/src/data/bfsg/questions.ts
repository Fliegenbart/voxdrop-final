export type QuestionOption = {
  value: string;
  label: string;
  description?: string;
};

export type Question = {
  id: string;
  title: string;
  description?: string;
  type: "single" | "multi";
  options: QuestionOption[];
};

// Hinweis: Texte sind bewusst in einer Datei gebündelt, damit Änderungen (Rechtslage/Leitlinien)
// nicht im UI-Code "vergraben" sind.
export const questions: Question[] = [
  {
    id: "q0",
    title: "Sind Sie eine öffentliche Stelle (Behörde, Kommune, öffentliche Einrichtung)?",
    description: "Für öffentliche Stellen gilt i.d.R. die BITV 2.0 (strenger als BFSG).",
    type: "single",
    options: [
      { value: "public", label: "Ja, öffentliche Stelle" },
      { value: "private", label: "Nein, privatwirtschaftlich" },
      { value: "unsicher", label: "Unsicher" },
    ],
  },
  {
    id: "q1",
    title: "Was beschreibt Ihr Unternehmen am besten?",
    type: "single",
    options: [
      { value: "produkte", label: "Wir stellen physische Produkte her (z.B. Geräte, Terminals)" },
      { value: "dienstleistungen", label: "Wir bieten digitale Dienstleistungen an (z.B. Online‑Shop, Buchung)" },
      { value: "import", label: "Wir importieren oder vertreiben Produkte anderer Hersteller" },
      { value: "intern", label: "Keines davon / Nur interne Software" },
    ],
  },
  {
    id: "q1a",
    title: "Um welche Art von Produkten handelt es sich?",
    description: "Nur relevant, wenn Sie Produkte herstellen oder vertreiben.",
    type: "single",
    options: [
      { value: "computer", label: "Computer, Laptops, Tablets oder Smartphones" },
      { value: "terminals", label: "Selbstbedienungsterminals (z.B. Geldautomaten, Ticketautomaten)" },
      { value: "telekom", label: "Endgeräte für Telekommunikation oder audiovisuelle Medien" },
      { value: "ebook", label: "E‑Book‑Reader oder E‑Book‑Software" },
      { value: "andere", label: "Andere Produkte" },
    ],
  },
  {
    id: "q2",
    title: "Welche digitalen Dienstleistungen bieten Sie für Verbraucher (B2C) an?",
    description: "Mehrfachauswahl möglich.",
    type: "multi",
    options: [
      { value: "ecommerce", label: "Online‑Shop / E‑Commerce" },
      { value: "termin", label: "Online‑Terminbuchung" },
      { value: "banking", label: "Online‑Banking / Finanzdienstleistungen" },
      { value: "telekom", label: "Telekommunikationsdienste" },
      { value: "ebooks", label: "E‑Books oder digitale Medien" },
      { value: "transport", label: "Personenbeförderung (digitale Buchung)" },
      { value: "other", label: "Andere verbrauchergerichtete Online‑Dienstleistung" },
      { value: "none", label: "Keine dieser Dienstleistungen" },
    ],
  },
  {
    id: "q3",
    title: "Richten sich Ihre Dienstleistungen an Verbraucher (B2C) oder ausschließlich an Unternehmen (B2B)?",
    type: "single",
    options: [
      { value: "b2b", label: "Ausschließlich B2B" },
      { value: "b2c", label: "B2C oder gemischt (B2B und B2C)" },
      { value: "unsicher", label: "Unsicher" },
    ],
  },
  {
    id: "q4",
    title: "Wie groß ist Ihr Unternehmen?",
    type: "single",
    options: [
      {
        value: "kleinst",
        label: "Weniger als 10 Mitarbeitende und < 2 Mio. € Umsatz/Bilanzsumme",
        description: "Kleinstunternehmen‑Ausnahme kann greifen (für Dienstleistungen).",
      },
      { value: "groesser", label: "10+ Mitarbeitende oder 2+ Mio. € Umsatz/Bilanzsumme" },
      { value: "unsicher", label: "Unsicher" },
    ],
  },
  {
    id: "q5",
    title: "Seit wann bieten Sie diese Online‑Dienstleistung an?",
    type: "single",
    options: [
      { value: "vor2025", label: "Vor dem 28. Juni 2025 gestartet und nicht wesentlich verändert" },
      { value: "nach2025", label: "Nach dem 28. Juni 2025 gestartet oder wesentlich verändert" },
      { value: "planung", label: "Noch in Planung" },
    ],
  },
  {
    id: "q6",
    title: "Nutzen Sie auf Ihrer Website eine der folgenden Funktionen?",
    description: "Mehrfachauswahl möglich (Risikoeinschätzung, nicht Betroffenheit).",
    type: "multi",
    options: [
      { value: "pdf", label: "PDF‑Downloads (Formulare, Kataloge, Preislisten)" },
      { value: "video", label: "Video‑ oder Audio‑Inhalte" },
      { value: "forms", label: "Interaktive Formulare oder Checkout‑Prozesse" },
      { value: "chat", label: "Chat‑Funktion oder Chatbot" },
      { value: "calendar", label: "Terminbuchung / Kalender‑Integration" },
      { value: "maps", label: "Karten oder interaktive Elemente" },
      { value: "none", label: "Keine davon" },
    ],
  },
];
