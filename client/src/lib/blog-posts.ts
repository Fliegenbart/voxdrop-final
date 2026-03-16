/**
 * Blog Post Daten
 */

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  author: string;
  category: string;
  readingTime: string;
  image?: string;
}

export const blogPosts: BlogPost[] = [
  {
    slug: "digitale-teilhabe",
    title: "Digitale Teilhabe: Barrierefreiheit als Bürgerrecht",
    excerpt: "Ein Perspektivwechsel für Führungskräfte in der Verwaltung. Warum Barrierefreiheit keine IT-Aufgabe ist, sondern eine Frage der Haltung, Strategie und des Selbstverstaendnisses einer modernen Verwaltung.",
    date: "2026-02-01",
    author: "VoxDrop Team",
    category: "Grundlagen",
    readingTime: "15 min",
  },
  {
    slug: "leichte-sprache-ki",
    title: "Leichte Sprache auf Behörden-Websites: Der KI-Leitfaden 2026",
    excerpt: "Wie Kommunen ihre Websites endlich für alle zugänglich machen – und warum KI dabei zum Game-Changer wird. 97% aller kommunalen Websites haben Barrierefreiheits-Mängel.",
    date: "2026-02-01",
    author: "VoxDrop Team",
    category: "Best Practices",
    readingTime: "18 min",
  },
  {
    slug: "screenreader-test",
    title: "Screenreader-Test für Einsteiger: So prüfen Sie Ihre Website selbst",
    excerpt: "Automatisierte Tools finden nur 30-40% aller Probleme. Mit dieser Anleitung fuehren Sie in 30 Minuten einen aussagekraeftigen Screenreader-Test durch.",
    date: "2026-02-01",
    author: "VoxDrop Team",
    category: "Best Practices",
    readingTime: "14 min",
  },
  {
    slug: "text-to-speech",
    title: "Text-to-Speech für Behörden-Websites: Rechtliche Pflicht oder Nice-to-Have?",
    excerpt: "Eine Entscheidungshilfe für IT-Verantwortliche. TTS ist keine rechtliche Pflicht, aber oft der effektivste Weg zu echter Barrierefreiheit.",
    date: "2026-02-01",
    author: "VoxDrop Team",
    category: "Best Practices",
    readingTime: "12 min",
  },
  {
    slug: "bfsg-kommunen-leitfaden",
    title: "BFSG 2025: Was Kommunen jetzt wissen müssen",
    excerpt: "Das Barrierefreiheitstaerkungsgesetz betrifft auch Kommunen. Selbstbedienungsterminals, Bürgerkioske und digitale Beschaffung - der vollständige Leitfaden für IT-Leiter und Digitalisierungsbeauftragte.",
    date: "2026-02-01",
    author: "VoxDrop Team",
    category: "Recht & Compliance",
    readingTime: "15 min",
  },
  {
    slug: "bitv-checkliste",
    title: "BITV 2.0 Checkliste: 25 Schritte zur Konformitaet",
    excerpt: "Die praktische Pruefliste für IT-Leiter, Webmaster und Digitalisierungsbeauftragte. Alle 25 wesentlichen Pruefpunkte der BITV 2.0 mit konkreten Handlungsempfehlungen.",
    date: "2026-02-01",
    author: "VoxDrop Team",
    category: "Best Practices",
    readingTime: "12 min",
  },
  {
    slug: "barrierefreie-formulare",
    title: "Barrierefreie Online-Formulare: Der unterschätzte Stolperstein",
    excerpt: "Wenn die Überwachungsstelle anruft, geht es in 9 von 10 Fällen um Formulare. Die 10 häufigsten Formular-Fehler und wie Sie sie beheben - mit Code-Beispielen.",
    date: "2026-02-01",
    author: "VoxDrop Team",
    category: "Best Practices",
    readingTime: "14 min",
  },
  {
    slug: "barrierefreiheit-ist-ux",
    title: "Warum Barrierefreiheit kein Compliance-Thema ist, sondern ein UX-Thema",
    excerpt: "Die meisten Organisationen behandeln digitale Barrierefreiheit wie eine laestige Vorschrift. Das ist nicht nur falsch gedacht - es kostet sie bares Geld und bessere Produkte.",
    date: "2026-01-17",
    author: "David Wegener",
    category: "Grundlagen",
    readingTime: "8 min",
  },
  {
    slug: "bfsg-2025-leitfaden",
    title: "BFSG 2025: Was Unternehmen jetzt wissen müssen",
    excerpt: "Das Barrierefreiheitstaerkungsgesetz ist seit Juni 2025 in Kraft. Wer nicht handelt, riskiert Bussgelder bis 100.000 Euro. Der vollständige Leitfaden zu Pflichten, Fristen und Umsetzung.",
    date: "2026-01-17",
    author: "VoxDrop Team",
    category: "Recht & Compliance",
    readingTime: "12 min",
  },
  {
    slug: "fakten-zur-barrierefreiheit",
    title: "Fakten zur Barrierefreiheit",
    excerpt: "7,8 Millionen schwerbehinderte Menschen in Deutschland. Barrierefreiheit ist kein Nice-to-have - es ist ein Grundrecht. Alles was Sie wissen müssen.",
    date: "2026-01-15",
    author: "VoxDrop Team",
    category: "Grundlagen",
    readingTime: "5 min",
  },
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return blogPosts.find(post => post.slug === slug);
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}
