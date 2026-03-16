export interface SeoMeta {
  title: string;
  description: string;
  ogType?: "website" | "article";
  ogImage?: string;
  noIndex?: boolean;
}

const BASE_URL = "https://voxdrop.live";
const DEFAULT_OG_IMAGE = `${BASE_URL}/og-image.png`;

const DEFAULT_META: SeoMeta = {
  title: "VoxDrop - Die Barrierefreiheits-Suite",
  description:
    "Die umfassende Suite an Barrierefreiheits-Tools: Automatische Untertitel, Kontrastprüfung und mehr. DSGVO-konform und KRITIS-ready. Made in Germany.",
  ogType: "website",
  ogImage: DEFAULT_OG_IMAGE,
};

const NOT_FOUND_META: SeoMeta = {
  title: "Seite nicht gefunden",
  description: "Die angeforderte Seite konnte nicht gefunden werden.",
  ogType: "website",
  ogImage: DEFAULT_OG_IMAGE,
  noIndex: true,
};

const SEO_META: Record<string, SeoMeta> = {
  "/": {
    title: "VoxDrop - Barrierefreiheit als Suite",
    description:
      "VoxDrop macht digitale Barrierefreiheit messbar, sicher und skalierbar. Eine Suite für Dokumente, Videos und Webinhalte. DSGVO-konform und KRITIS-ready.",
  },
  "/preise": {
    title: "Preise",
    description:
      "VoxDrop Preise für barrierefreie Dokumente, Video und Web. Passende Pakete für Prüfung, laufende Accessibility-Arbeit und größere Organisationen.",
  },
  "/behoerden": {
    title: "Für Behörden - EVB-IT Cloud Ready",
    description:
      "VoxDrop für öffentliche Auftraggeber: EVB-IT Cloud konform, DSGVO-sicher, deutsche Server. Barrierefreiheits-Tools für Behörden und öffentliche Einrichtungen.",
  },
  "/datenschutz": {
    title: "Datenschutzerklärung",
    description:
      "DSGVO-konforme Datenverarbeitung bei VoxDrop. Lokale Verarbeitung auf deutschen Servern, keine US-Cloud, sofortige Löschung nach Verarbeitung.",
  },
  "/impressum": {
    title: "Impressum",
    description:
      "Impressum der David Wegener Marketing Consulting GmbH. Angaben gemäß Paragraph 5 TMG für VoxDrop.",
  },
  "/avv": {
    title: "Auftragsverarbeitungsvertrag (AVV)",
    description:
      "Auftragsverarbeitungsvertrag nach Art. 28 DSGVO für VoxDrop. Rechtssichere Datenverarbeitung für Behörden und Unternehmen.",
  },
  "/toms": {
    title: "Technisch-organisatorische Maßnahmen (TOMs)",
    description:
      "Dokumentation der technischen und organisatorischen Maßnahmen von VoxDrop nach Art. 32 DSGVO. Sicherheitsmaßnahmen für den Schutz personenbezogener Daten.",
  },
  "/subunternehmer": {
    title: "Subunternehmer-Verzeichnis",
    description:
      "Liste aller Unterauftragnehmer von VoxDrop gemäß Art. 28 DSGVO. Transparente Dokumentation aller Dienstleister die personenbezogene Daten verarbeiten.",
  },
  "/leistungsbeschreibung": {
    title: "Leistungsbeschreibung - VoxDrop Accessibility Suite",
    description:
      "Vollständige Servicebeschreibung der VoxDrop Accessibility Suite für öffentliche Ausschreibungen. EVB-IT Cloud kompatibel.",
  },
  "/sla": {
    title: "Service Level Agreement (SLA)",
    description:
      "Service Level Agreement für VoxDrop. Verfügbarkeit, Reaktionszeiten, Support und Wartung für öffentliche Auftraggeber.",
  },
  "/exit-konzept": {
    title: "Exit- und Löschkonzept",
    description:
      "Detailliertes Konzept für Vertragsende, Datenexport und sichere Löschung bei VoxDrop. EVB-IT Cloud konform.",
  },
  "/c5-mapping": {
    title: "BSI C5-Basiskriterien Mapping",
    description:
      "Mapping der BSI C5-Basiskriterien auf VoxDrop-Sicherheitsmaßnahmen. Dokumentation für EVB-IT Cloud Compliance.",
  },
  "/barrierefreiheit-erklärung": {
    title: "Erklärung zur Barrierefreiheit",
    description:
      "Erklärung zur Barrierefreiheit der VoxDrop-Webanwendung gemäß BITV 2.0 und EN 301 549. WCAG 2.1 AA Konformität.",
  },
  "/features": {
    title: "Alle Features auf einen Blick",
    description:
      "Alle VoxDrop Features strukturiert nach Arbeitsphasen: Planen, Prüfen, Konvertieren und Dokumentieren.",
  },
  "/bfsg-check": {
    title: "BFSG-Check: Ist Ihre Website barrierefrei? | Kostenlos prüfen",
    description:
      "Interaktiver BFSG-Kompass: Prüfen Sie in 60 Sekunden die Betroffenheit und erhalten Sie einen automatisierten WCAG 2.1 AA Quick-Scan Ihrer Website.",
  },
  "/voxdrop-2030": {
    title: "VoxDrop 2030",
    description:
      "Unsere Vision: lokale KI, smartere Workflows und belastbare Nachweise für digitale Barrierefreiheit.",
  },
  "/login": {
    title: "Login",
    description: "Melden Sie sich bei VoxDrop an.",
    noIndex: true,
  },
  "/register": {
    title: "Registrieren",
    description: "Erstellen Sie ein VoxDrop-Konto.",
    noIndex: true,
  },
  "/settings": {
    title: "Einstellungen",
    description: "Kontoeinstellungen und Sicherheit.",
    noIndex: true,
  },
  "/dashboard/compliance": {
    title: "Compliance Timeline",
    description: "Übersicht und Verlauf Ihrer Barrierefreiheits-Audits.",
    noIndex: true,
  },
  "/blog": {
    title: "Blog - VoxDrop",
    description:
      "Neuigkeiten, Tipps und Wissen rund um digitale Barrierefreiheit. Erfahren Sie alles über WCAG, BITV, Leichte Sprache und barrierefreie Dokumente.",
  },
  "/blog/barrierefreiheit-ist-ux": {
    title: "Warum Barrierefreiheit kein Compliance-Thema ist, sondern ein UX-Thema",
    description:
      "Die meisten Organisationen behandeln digitale Barrierefreiheit wie eine lästige Vorschrift. Das ist nicht nur falsch gedacht - es kostet sie bares Geld und bessere Produkte.",
    ogType: "article",
  },
  "/blog/bfsg-2025-leitfaden": {
    title: "BFSG 2025: Leitfaden zum Barrierefreiheitsstärkungsgesetz",
    description:
      "Das Barrierefreiheitsstärkungsgesetz ist seit Juni 2025 in Kraft. Wer nicht handelt, riskiert Bußgelder bis 100.000 Euro. Vollständiger Leitfaden zu Pflichten und Umsetzung.",
    ogType: "article",
  },
  "/blog/fakten-zur-barrierefreiheit": {
    title: "Fakten zur Barrierefreiheit - VoxDrop",
    description:
      "7,8 Millionen schwerbehinderte Menschen in Deutschland. Barrierefreiheit ist kein Nice-to-have - es ist ein Grundrecht.",
    ogType: "article",
  },
  "/tools": {
    title: "Barrierefreiheits-Tools",
    description:
      "Alle VoxDrop Tools für barrierefreie Inhalte: Untertitel, Einfache Sprache, Kontrastprüfung, PDF/UA und mehr.",
  },
  "/video": {
    title: "Video-Tools - VoxDrop",
    description:
      "Alle VoxDrop-Video-Tools an einem Ort: Untertitel, Videoschnitt, Voiceover und VoxCut für schnelle, DSGVO-konforme KI-gestützte Workflows.",
  },
  "/tools/untertitel": {
    title: "Video Untertitel Tool",
    description:
      "Automatische Transkription und Untertitelung für Videos. Bildschirm aufnehmen, transkribieren und Untertitel einbetten. DSGVO-konform mit lokaler KI.",
  },
  "/tools/voxcut": {
    title: "VoxCut - KI Video Cutter",
    description:
      "Schnelles, KI-gestütztes Videoschnitt-Tool für präzises Kürzen, Kombinieren und Exportieren von Clips direkt im Browser.",
  },
  "/tools/untertitel/videoschnitt": {
    title: "Schnitt & Struktur - VoxDrop",
    description: "Videos aufnehmen, schneiden, untertiteln und barrierefrei bereitstellen. Verarbeitung auf VoxDrop-Servern, DSGVO-konform.",
  },
  "/tools/voiceover": {
    title: "Voiceover - VoxDrop",
    description:
      "Text-to-Speech mit Qwen3: Voiceover erzeugen und direkt als Tonspur im Videoschnitt nutzen. DSGVO-konform.",
  },
  "/tools/pptx-podcast": {
    title: "PowerPoint to Podcast - VoxDrop",
    description:
      "Manche Präsentationen sind zu komplex, um sie vollständig barrierefrei zu gestalten. Wandeln Sie sie einfach in eine Podcast-Episode um - mit KI-generierten Bildbeschreibungen und natürlicher Sprachausgabe.",
  },
  "/tools/pptx-to-pdf-smart": {
    title: "PPTX oder PDF zu PDF/UA Smart",
    description:
      "Konvertieren Sie PowerPoint oder PDF-Exporte (z. B. aus Confluence) in barrierefreies PDF/UA mit smarten Zusammenfassungen.",
  },
  "/tools/pptx-summary": {
    title: "PPTX Zusammenfassung",
    description:
      "Analysiert PowerPoint-Präsentationen und erstellt barrierefreie Zusammenfassungen mit KI, Glossar und Timeline.",
  },
  "/tools/einfache-sprache": {
    title: "Einfache Sprache - VoxDrop",
    description:
      "Wandeln Sie komplexe Texte in Einfache Sprache um. Textanalyse mit Verständlichkeits-Score und KI-gestützte Vereinfachung.",
  },
  "/tools/kontrastchecker": {
    title: "PPTX Kontrast-Audit",
    description:
      "Analysieren Sie PowerPoint-Präsentationen auf Kontrastprobleme und korrigieren Sie diese automatisch für WCAG-Konformität.",
  },
  "/tools/persona-check": {
    title: "Persona-Check - VoxDrop",
    description:
      "Analysieren Sie Ihre Dokumente gegen 7 realistische Personas. Erfahren Sie, wer Ihre Inhalte nutzen kann und wo Barrieren bestehen.",
  },
  "/tools/alt-text": {
    title: "Alt-Text Generator",
    description: "Generieren Sie barrierefreie Alternativtexte für Ihre Bilder mit KI. WCAG-konform auf Deutsch.",
  },
  "/tools/aria-checker": {
    title: "ARIA-Checker",
    description:
      "Prüfen Sie HTML auf fehlende oder falsche ARIA-Attribute. Mit WCAG-Referenzen, Schweregrad und konkreten Fix-Vorschlägen.",
  },
  "/tools/web-pruefung": {
    title: "Web-Prüfung",
    description:
      "ARIA-, Keyboard- und Screenreader-Smoke-Test für Webseiten. Schnelle Checks plus manuelle Checkliste.",
  },
  "/tools/formular-check": {
    title: "PDF/UA Checker",
    description:
      "Umfassender PDF/UA-1 Check (ISO 14289-1) mit Kategorien für Metadaten, Strukturbaum, Alt-Texte, Links, Tabellen und mehr.",
  },
  "/tools/filesharing": {
    title: "Barrierefreies Filesharing",
    description: "Dateien sicher teilen. Barrierefrei, DSGVO-konform, mit automatischer Löschung.",
  },
  "/tools/url-shortener": {
    title: "URL-Shortener - VoxDrop",
    description:
      "Erstellen Sie barrierefreie Kurzlinks mit verwechslungssicheren URLs, Ablaufdatum, Passwortschutz und QR-Codes.",
  },
  "/tools/vpat-checker": {
    title: "VPAT & BITV Checker",
    description: "EN 301 549 Konformität dokumentieren und VPAT/BITV-Erklärungen exportieren.",
  },
  "/tools/proxy-test": {
    title: "Proxy-Test (intern)",
    description: "Interner Upload-Limit Test für Proxies und Gateways.",
    noIndex: true,
  },
  "/tools/pdfua-check": {
    title: "PDF/UA Checker",
    description:
      "Prüfen Sie PDFs auf PDF/UA-1 (ISO 14289-1) und erhalten Sie einen strukturierten Bericht zu Metadaten, Strukturbaum, Alt-Texten, Links, Tabellen und mehr.",
  },
  "/tools/audiodeskription": {
    title: "Audiodeskription - bald verfügbar",
    description: "Automatische Audiodeskriptionen für Videos. Bald verfügbar.",
  },
  "/tools/confluence": {
    title: "Confluence Makros",
    description: "Barrierefreiheits-Makros und Checklisten für Confluence-Seiten.",
  },
  "/tools/live-transkription": {
    title: "Live-Transkription - bald verfügbar",
    description: "Live-Transkription für Meetings und Streams. Bald verfügbar.",
  },
};

const NOINDEX_ROUTES = new Set([
  "/login",
  "/register",
  "/settings",
  "/documents",
  "/dashboard/compliance",
  "/admin/blog",
]);

const NOINDEX_PREFIXES = ["/f/", "/dashboard"];

const TOOL_ROUTE_PATTERN = /^\/tools\/[^/]+(?:\/[^/]+)?$/;

const ROUTE_PATTERNS: RegExp[] = [
  /^\/f\/[^/]+$/,
  /^\/blog\/[^/]+$/,
  /^\/bfsg-check\/.+$/,
  TOOL_ROUTE_PATTERN,
];

const KNOWN_ROUTES = new Set([
  ...Object.keys(SEO_META),
  ...NOINDEX_ROUTES,
  "/tools/reports",
  "/tools/pptx-pdf",
]);

export function normalizePath(inputPath: string): string {
  if (!inputPath) return "/";
  const pathOnly = inputPath.split("?")[0].split("#")[0];
  if (pathOnly.length > 1 && pathOnly.endsWith("/")) {
    return pathOnly.slice(0, -1);
  }
  return pathOnly;
}

export function isKnownRoute(path: string): boolean {
  const normalized = normalizePath(path);
  if (KNOWN_ROUTES.has(normalized)) return true;
  return ROUTE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function hasExplicitSeoMeta(path: string): boolean {
  return Object.prototype.hasOwnProperty.call(SEO_META, path);
}

export function shouldNoIndex(path: string): boolean {
  const normalized = normalizePath(path);
  if (NOINDEX_ROUTES.has(normalized)) return true;
  return NOINDEX_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function formatTitle(title: string): string {
  return title.includes("VoxDrop") ? title : `${title} | VoxDrop`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function replaceMetaTag(html: string, attr: "name" | "property", name: string, content: string): string {
  const safeContent = escapeHtml(content);
  const tagPattern = new RegExp(`<meta[^>]+${attr}="${name}"[^>]*>`, "i");
  if (!tagPattern.test(html)) return html;
  return html.replace(tagPattern, (tag) => {
    if (/content="[^"]*"/i.test(tag)) {
      return tag.replace(/content="[^"]*"/i, `content="${safeContent}"`);
    }
    return tag.replace(/>$/, ` content="${safeContent}">`);
  });
}

function replaceLinkTag(html: string, rel: string, href: string): string {
  const safeHref = escapeHtml(href);
  const tagPattern = new RegExp(`<link[^>]+rel="${rel}"[^>]*>`, "i");
  if (!tagPattern.test(html)) return html;
  return html.replace(tagPattern, (tag) => {
    if (/href="[^"]*"/i.test(tag)) {
      return tag.replace(/href="[^"]*"/i, `href="${safeHref}"`);
    }
    return tag.replace(/>$/, ` href="${safeHref}">`);
  });
}

function upsertSchema(html: string, schemaJson: string | null): string {
  const schemaId = "schema-softwareapplication";
  const scriptPattern = new RegExp(`<script[^>]+id="${schemaId}"[^>]*>[\\s\\S]*?<\\/script>`, "i");

  let output = html;
  if (scriptPattern.test(output)) {
    output = output.replace(scriptPattern, "");
  }

  if (!schemaJson) return output;

  const scriptTag = `<script type="application/ld+json" id="${schemaId}">${schemaJson}</script>`;
  return output.replace("</head>", `${scriptTag}</head>`);
}

export function applySeoMeta(html: string, path: string): string {
  const normalized = normalizePath(path);
  const isKnown = isKnownRoute(normalized);
  const hasExplicitMeta = hasExplicitSeoMeta(normalized);
  const baseMeta = !isKnown
    ? NOT_FOUND_META
    : hasExplicitMeta
      ? (SEO_META[normalized] as SeoMeta)
      : DEFAULT_META;
  const noIndex =
    shouldNoIndex(normalized) ||
    baseMeta.noIndex ||
    (TOOL_ROUTE_PATTERN.test(normalized) && !hasExplicitMeta);

  const title = formatTitle(baseMeta.title);
  const description = baseMeta.description;
  const ogType = baseMeta.ogType || "website";
  const ogImage = baseMeta.ogImage || DEFAULT_OG_IMAGE;
  const canonical = `${BASE_URL}${normalized === "/" ? "/" : normalized}`;

  let output = html;
  output = output.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  output = replaceMetaTag(output, "name", "description", description);
  output = replaceMetaTag(output, "name", "robots", noIndex ? "noindex, nofollow" : "index, follow");
  output = replaceLinkTag(output, "canonical", canonical);
  output = replaceMetaTag(output, "property", "og:title", title);
  output = replaceMetaTag(output, "property", "og:description", description);
  output = replaceMetaTag(output, "property", "og:type", ogType);
  output = replaceMetaTag(output, "property", "og:image", ogImage);
  output = replaceMetaTag(output, "property", "og:url", canonical);
  output = replaceMetaTag(output, "name", "twitter:title", title);
  output = replaceMetaTag(output, "name", "twitter:description", description);
  output = replaceMetaTag(output, "name", "twitter:image", ogImage);

  const shouldInjectToolSchema = normalized.startsWith("/tools/") && !noIndex;
  const schemaJson = shouldInjectToolSchema
    ? JSON.stringify({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: baseMeta.title,
        description: baseMeta.description,
        url: canonical,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        provider: {
          "@type": "Organization",
          name: "VoxDrop",
          url: BASE_URL,
        },
      })
    : null;
  output = upsertSchema(output, schemaJson);

  return output;
}
