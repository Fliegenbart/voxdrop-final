import type { LucideIcon } from "lucide-react";
import {
  FileText,
  Type,
  Palette,
  Image,
  Headphones,
  Users,
  Link2,
  Code2,
  Share2,
  Zap,
  Scissors,
  LayoutDashboard,
  FileCheck,
  Brain,
} from "lucide-react";

export interface ToolItem {
  id: string;
  name: string;
  description: string;
  href: string;
  icon: LucideIcon;
  color: string;
  available: boolean;
  highlight?: boolean;
}

export interface ToolGroup {
  id: string;
  title: string;
  description: string;
  tools: ToolItem[];
}

export const toolGroups: ToolGroup[] = [
  {
    id: "planen",
    title: "Planen & Erstellen",
    description: "Texte und Inhalte für verschiedene Zielgruppen vorbereiten.",
    tools: [
      {
        id: "einfache-sprache",
        name: "Einfache Sprache",
        description: "Komplexe Texte automatisch vereinfachen.",
        href: "/tools/einfache-sprache",
        icon: Type,
        color: "from-green-500 to-emerald-600",
        available: true,
      },
      {
        id: "text-optimierung",
        name: "Text-Optimierung",
        description: "Formulierungen verbessern und Barrieren reduzieren.",
        href: "/tools/text-optimierung",
        icon: Zap,
        color: "from-amber-500 to-orange-600",
        available: false,
      },
      {
        id: "persona-check",
        name: "Persona-Check",
        description: "Texte für verschiedene Zielgruppen prüfen.",
        href: "/tools/persona-check",
        icon: Users,
        color: "from-cyan-500 to-blue-600",
        available: true,
      },
    ],
  },
  {
    id: "prüfen",
    title: "Prüfen & Verbessern",
    description: "Schnelle Checks für Standards und Inhalte.",
    tools: [
      {
        id: "kontrastchecker",
        name: "Kontrastchecker",
        description: "Farbkontraste nach WCAG prüfen.",
        href: "/tools/kontrastchecker",
        icon: Palette,
        color: "from-pink-500 to-rose-600",
        available: true,
      },
      {
        id: "aria-checker",
        name: "ARIA Checker",
        description: "ARIA-Semantik automatisch prüfen.",
        href: "/tools/aria-checker",
        icon: Code2,
        color: "from-indigo-500 to-violet-600",
        available: true,
      },
      {
        id: "web-pruefung",
        name: "Web-Prüfung",
        description: "ARIA, Keyboard & Screenreader Smoke-Test.",
        href: "/tools/web-pruefung",
        icon: LayoutDashboard,
        color: "from-slate-600 to-zinc-700",
        available: true,
      },
      {
        id: "formular-check",
        name: "PDF/UA-Check",
        description: "PDFs auf PDF/UA-Konformität prüfen (ISO 14289).",
        href: "/tools/formular-check",
        icon: FileCheck,
        color: "from-emerald-500 to-teal-600",
        available: true,
      },
      {
        id: "alt-text",
        name: "Alt-Text Generator",
        description: "Bildbeschreibungen mit KI erstellen.",
        href: "/tools/alt-text",
        icon: Image,
        color: "from-sky-500 to-blue-600",
        available: true,
      },
    ],
  },
  {
    id: "konvertieren",
    title: "Konvertieren & Veröffentlichen",
    description: "Medien und Dokumente barrierefrei exportieren.",
    tools: [
      {
        id: "pptx-to-pdf-faithful",
        name: "PPTX zu PDF/UA Folientreu",
        description: "Foliennahe barrierefreie PDF/UA-Ausgabe mit technischer Prüfung.",
        href: "/tools/pptx-to-pdf-faithful",
        icon: FileCheck,
        color: "from-emerald-500 to-teal-600",
        available: true,
        highlight: true,
      },
      {
        id: "pptx-to-pdf-smart",
        name: "PPTX zu PDF/UA Narrative Summary",
        description: "Screenreader-optimierte Lesefassung mit Zusammenfassungen und Alt-Texten.",
        href: "/tools/pptx-to-pdf-smart",
        icon: FileText,
        color: "from-orange-500 to-red-500",
        available: true,
      },
      {
        id: "word-to-pdfua",
        name: "Word zu PDF/UA",
        description: "Word-Dokumente barrierefrei exportieren.",
        href: "/tools/word-to-pdfua",
        icon: FileText,
        color: "from-amber-400 to-orange-500",
        available: false,
      },
      {
        id: "videoschnitt",
        name: "Schnitt & Struktur",
        description: "Aufnehmen oder Upload, schneiden und Untertitel als SRT/VTT/TTML exportieren - barrierefrei für alle Nutzenden.",
        href: "/tools/untertitel",
        icon: Scissors,
        color: "from-slate-500 to-slate-700",
        available: true,
        highlight: true,
      },
      {
        id: "voxcut",
        name: "VoxCut",
        description: "Erweiterte KI-Schnittfunktionen als separates Modul.",
        href: "/tools/voxcut",
        icon: Brain,
        color: "from-cyan-500 to-blue-600",
        available: false,
      },
      {
        id: "pptx-podcast",
        name: "PPTX zu Podcast",
        description: "Folien als Audio veröffentlichen.",
        href: "/tools/pptx-podcast",
        icon: Headphones,
        color: "from-amber-500 to-orange-600",
        available: false,
      },
    ],
  },
  {
    id: "teilen",
    title: "Teilen & Dokumentieren",
    description: "Sicher teilen und Nachweise erstellen.",
    tools: [
      {
        id: "filesharing",
        name: "Bereitstellen & Teilen",
        description: "Exporte paketieren und sicher zur Freigabe bereitstellen.",
        href: "/tools/filesharing",
        icon: Share2,
        color: "from-emerald-500 to-green-600",
        available: true,
      },
      {
        id: "url-shortener",
        name: "URL-Shortener",
        description: "Kurze, gut lesbare Links erstellen.",
        href: "/tools/url-shortener",
        icon: Link2,
        color: "from-teal-500 to-cyan-600",
        available: true,
      },
      {
        id: "reports-nachweise",
        name: "VPAT & BITV Checker",
        description: "EN 301 549 Checklisten, VPAT-Export und BITV-Erklaerung.",
        href: "/tools/reports",
        icon: LayoutDashboard,
        color: "from-emerald-500 to-teal-600",
        available: true,
        highlight: true,
      },
    ],
  },
];
