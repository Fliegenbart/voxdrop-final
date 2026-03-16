import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { Link } from "wouter";
import { Navigation } from "@/components/Navigation";
import { SEO } from "@/components/SEO";
import {
  ArrowRight,
  BriefcaseBusiness,
  FileText,
  Lock,
  User,
} from "lucide-react";
import "./voxdrop-2030.css";

const PAGE_TOC = [
  { href: "#prolog", label: "Prolog" },
  { href: "#warum", label: "Warum jetzt?" },
  { href: "#thesen", label: "Thesen" },
  { href: "#menschen", label: "Menschen" },
  { href: "#infrastruktur", label: "Infrastruktur" },
  { href: "#ki", label: "Souveräne KI" },
  { href: "#kosten", label: "Kosten" },
  { href: "#roadmap", label: "Roadmap" },
  { href: "#ehrlichkeit", label: "Grenzen" },
  { href: "#oekosystem", label: "Ökosystem" },
  { href: "#mitgestalten", label: "Mitgestalten" },
  { href: "#epilog", label: "Epilog" },
];

const STATS = [
  { value: "95%", label: "der Behörden-PDFs", sublabel: "nicht barrierefrei" },
  { value: "7,9 Mio", label: "schwerbehinderte", sublabel: "Menschen in DE" },
  { value: "5–10×", label: "Mehrkosten bei", sublabel: "nachträglicher Korrektur" },
  { value: "2025", label: "BFSG in Kraft", sublabel: "Compliance-Pflicht" },
];

const THESES = [
  {
    number: "01",
    title: "Barrierefreiheit ist kein Projekt, sondern ein Betriebszustand.",
    body:
      "Wer Accessibility als „Projekt“ denkt, hat schon verloren. Projekte haben ein Ende. Barrierefreiheit hat nur einen Anfang – und dann die Aufgabe, den Zustand zu halten. Es gibt kein „fertig“. Es gibt nur „aktuell konform“ oder „nicht konform“.",
  },
  {
    number: "02",
    title: "Daten über Bürgerinnen und Bürger gehören nicht in amerikanische Clouds.",
    body:
      "Jedes Dokument, das durch einen Accessibility-Check läuft, kann sensible Inhalte enthalten – Rentenbescheide, Gesundheitsdaten, Sozialhilfeanträge. VoxDrop verarbeitet alles in Deutschland. Punkt.",
  },
  {
    number: "03",
    title: "KI ohne Erklärung ist Willkür.",
    body:
      "Wenn ein System sagt „dieses PDF ist nicht barrierefrei“, muss es genau erklären können: welche Regel, welches Element, welcher Impact, welcher Fix. Alles andere ist eine Black Box, der niemand vertrauen sollte.",
  },
  {
    number: "04",
    title: "Der beste Accessibility-Check ist der, den niemand manuell anstoßen muss.",
    body:
      "Eine Behörde, die 10.000 PDFs pro Jahr veröffentlicht, kann nicht jedes einzeln von Hand prüfen. Automatisierung ist kein Luxus – sie ist die einzige Möglichkeit, Barrierefreiheit bei realistischen Mengen durchzuhalten.",
  },
  {
    number: "05",
    title: "Standards sind Mindestanforderungen, keine Ziele.",
    body:
      "WCAG AA-Konformität bedeutet nicht, dass ein Dokument gut nutzbar ist. Wir optimieren für echte Nutzbarkeit, nicht für Checkbox-Compliance.",
  },
  {
    number: "06",
    title: "Toolwechsel ist der Feind von Qualität.",
    body:
      "Jeder Medienbruch – vom CMS zum PDF-Tool zum Prüftool zum Report – ist eine Fehlerquelle. Durchgängige Pipelines sind kein Feature, sondern Grundvoraussetzung.",
  },
  {
    number: "07",
    title: "Wir bauen mit Betroffenen, nicht nur für sie.",
    body:
      "„Nothing About Us Without Us“ ist kein Slogan – es ist ein Qualitätsmerkmal. Wir testen mit Screenreader-Nutzern, mit Sprachsteuerung, mit reiner Tastaturnavigation. Nicht einmal, sondern regelmäßig.",
  },
];

const PERSONAS = [
  {
    title: "Die Redakteurin",
    description: "Morgens 15 PDFs veröffentlichen, keine zwei Stunden pro Dokument für manuelle Prüfung.",
    icon: FileText,
  },
  {
    title: "Der IT-Leiter",
    description: "BITV-Audit in drei Monaten. Keine Ahnung, wo anfangen – nicht aus Inkompetenz, sondern weil die Tools fehlen.",
    icon: Lock,
  },
  {
    title: "Die Beauftragte",
    description: "Dem Ministerium einen Maßnahmenplan vorlegen – aber keine Datengrundlage haben.",
    icon: BriefcaseBusiness,
  },
  {
    title: "Der Bürger",
    description: "Seinen Steuerbescheid selbst lesen wollen, ohne jemanden um Hilfe bitten zu müssen.",
    icon: User,
  },
];

const KI_PILLARS = [
  {
    number: "Säule 01",
    title: "Daten-Residenz",
    description: "Alle Verarbeitung auf deutschen Servern. Kein Cloud Act. Kein Datentransfer in die USA.",
  },
  {
    number: "Säule 02",
    title: "Modell-Transparenz",
    description: "Dokumentiert, welche Modelle laufen, wie sie trainiert wurden, wo ihre Grenzen liegen.",
  },
  {
    number: "Säule 03",
    title: "Kein Vendor Lock-in",
    description: "Open-Weight-Modelle. Austauschbar ohne Abhängigkeit von US-Konzernen.",
  },
  {
    number: "Säule 04",
    title: "Auditierbare Entscheidungen",
    description: "Jede KI-Entscheidung geloggt: Modell, Input, Output, Konfidenz.",
  },
  {
    number: "Säule 05",
    title: "Schrittweise Automation",
    description: "Von KI-Assistenz über KI-Empfehlung zu KI-Automation. Vertrauensgesteuert.",
  },
];

const AUTOMATION_STEPS = [
  { step: "Stufe 1", title: "KI-Assistenz", description: "KI schlägt vor, Mensch entscheidet" },
  { step: "Stufe 2", title: "KI-Empfehlung", description: "KI priorisiert, Mensch bestätigt" },
  { step: "Stufe 3", title: "KI-Automation", description: "KI handelt, Mensch kontrolliert" },
];

const COST_CARDS = [
  {
    tag: "Rechtliches Risiko",
    title: "Verbandsklagen & Sanktionen",
    description: "Mahnverfahren, Abmahnungen und Reputationsschäden sind keine Theorie mehr – sie sind Tagesgeschäft.",
  },
  {
    tag: "Nachbesserung",
    title: "5–10× Mehrkosten",
    description: "Ein PDF nachträglich barrierefrei zu machen kostet ein Vielfaches mehr, als es von Anfang an richtig zu machen.",
  },
  {
    tag: "Support",
    title: "15–25 EUR pro Anruf",
    description: "Jeder Anruf einer Bürgerin, die ein PDF nicht lesen kann. Bei tausenden Dokumenten: sechsstellige Beträge.",
  },
  {
    tag: "Gutachten",
    title: "5.000–15.000 EUR pro Audit",
    description: "Ein BITV-Audit für eine Website. Nach dem nächsten Deploy potenziell veraltet.",
  },
];

const ROADMAP = [
  {
    year: "2026",
    motto: "Robust & Nachweisbar",
    description:
      "Was heute funktioniert, muss unter Last funktionieren. Was heute manuell nachvollzogen wird, muss automatisch dokumentiert sein.",
    features: ["Queue-System 100+ PDFs", "Audit-Logs", "Export PDF/Word/CSV/JSON", "Löschkonzept"],
    milestone: "Erste Behörde nutzt VoxDrop als primäres Nachweistool bei einem BITV-Audit.",
  },
  {
    year: "2027",
    motto: "Accessibility Workbench",
    description: "Von PDF-fokussiert zur umfassenden Werkbank. Web, Formulare, CMS-Inhalte – alles in einem System.",
    features: ["Web-Crawling + Prüfassistenz", "Formular-Checks", "TYPO3 / GSB Plugins", "Confluence-Workflow"],
    milestone: "Erste kommunale Verwaltung rollt VoxDrop flächendeckend aus.",
  },
  {
    year: "2028",
    motto: "Shift Left",
    description:
      "Barrierefreiheit wandert vom Ende des Prozesses an den Anfang. Probleme werden erkannt, bevor sie veröffentlicht werden.",
    features: ["CI/CD-Integration", "Regression-Checks", "Auto-Benachrichtigung", "Trend-Dashboard"],
    milestone: "Erste Landesbehörde integriert VoxDrop in ihre Deployment-Pipeline.",
  },
  {
    year: "2029",
    motto: "Compliance Intelligence",
    description:
      "Einzelprüfungen werden zur Organisationsperspektive. Nicht „ist dieses Dokument barrierefrei?“ sondern „wie steht unsere Organisation da?“",
    features: ["Multi-Mandanten", "Compliance-Timeline", "Maßnahmenplan", "Benchmarking", "Nachweisarchiv"],
    milestone: "Erste Bundesbehörde nutzt VoxDrop für die vollständige BITV-Berichterstattung.",
  },
  {
    year: "2030",
    motto: "Accessibility by Default",
    description: "Barrierefreiheit ist kein separater Arbeitsschritt mehr. Sie passiert automatisch – als Infrastruktur-Layer im Hintergrund.",
    features: ["Echtzeit-Feedback", "KI Auto-Fix", "Infrastruktur-Layer", "Offene Standards"],
    milestone: "Barrierefreiheit ist kein Thema mehr – weil sie so selbstverständlich funktioniert wie Rechtschreibprüfung.",
  },
];

const HONESTY = [
  {
    title: "Kein Ersatz für manuelle Prüfung",
    description:
      "Automatisierte Tests finden ca. 30–40% aller Barrieren. VoxDrop macht den automatisierbaren Teil schneller und den manuellen Teil einfacher – aber nicht überflüssig.",
  },
  {
    title: "Kein Zertifizierungs-Tool",
    description:
      "Wir liefern Daten, auf deren Basis Menschen entscheiden. Ein Tool, das seine eigene Arbeit zertifiziert, hat einen Interessenkonflikt.",
  },
  {
    title: "Kein Allheilmittel",
    description:
      "Wenn die Quelle schlecht ist – ein gescanntes PDF ohne OCR – kann auch VoxDrop nur begrenzt helfen. Wir sagen ehrlich, wo die Grenzen liegen.",
  },
];

const ECOSYSTEM = [
  {
    title: "Systeme",
    items: ["d.velop, nscale, enaio (DMS)", "Government Site Builder", "TYPO3, Liferay (CMS)", "Confluence, SharePoint", "openDesk (Bundescloud)"],
  },
  {
    title: "Partner",
    items: ["Accessibility-Beratungen", "Schulungsanbieter", "Dataport, ITDZ Berlin, ekom21", "BITV-Test, DIAS GmbH", "Selbsthilfeverbände"],
  },
  {
    title: "Architektur",
    items: ["API-First – offene Schnittstellen", "Webhook-Integration", "CI/CD Build-Gates", "EVB-IT-konforme Lizenzierung", "Multi-Mandanten-fähig"],
  },
];

export default function VoxDrop2030() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [activeHref, setActiveHref] = useState<string>(PAGE_TOC[0]?.href ?? "#prolog");
  const activeHrefRef = useRef(activeHref);

  useEffect(() => {
    activeHrefRef.current = activeHref;
  }, [activeHref]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const elements = Array.from(root.querySelectorAll<HTMLElement>(".vd2030-reveal"));
    if (elements.length === 0) return;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    if (reduceMotion || typeof IntersectionObserver === "undefined") {
      elements.forEach((el) => el.classList.add("vd2030-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).classList.add("vd2030-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -50px 0px" }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const handleAnchorClick = useCallback((e: MouseEvent<HTMLAnchorElement>) => {
    const href = e.currentTarget.getAttribute("href");
    if (!href || !href.startsWith("#")) return;

    const root = rootRef.current;
    const target =
      (root?.querySelector(href) as HTMLElement | null) ??
      (document.querySelector(href) as HTMLElement | null);

    if (!target) return;

    e.preventDefault();
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    setActiveHref(href);
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const targets = PAGE_TOC
      .map((item) => {
        const localTarget = root?.querySelector(item.href) as HTMLElement | null;
        return localTarget ?? ((document.querySelector(item.href) as HTMLElement | null) ?? null);
      })
      .filter((el): el is HTMLElement => Boolean(el));

    if (targets.length === 0 || typeof IntersectionObserver === "undefined") return;

    const ratios = new Map<string, number>();
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).id;
          if (!id) continue;
          ratios.set(`#${id}`, entry.isIntersecting ? entry.intersectionRatio : 0);
        }

        let bestHref = activeHrefRef.current;
        let bestRatio = 0;
        for (const item of PAGE_TOC) {
          const ratio = ratios.get(item.href) ?? 0;
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestHref = item.href;
          }
        }

        if (bestRatio > 0 && bestHref !== activeHrefRef.current) {
          activeHrefRef.current = bestHref;
          setActiveHref(bestHref);
        }
      },
      {
        threshold: [0.05, 0.15, 0.3, 0.5, 0.75],
        // If the user prefers reduced motion, avoid aggressive "active" switching while scrolling.
        rootMargin: reduceMotion ? "-10% 0px -70% 0px" : "-20% 0px -65% 0px",
      }
    );

    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, []);

  const year = new Date().getFullYear();

  return (
    <>
      <SEO
        title="Vision 2030 - VoxDrop Manifest"
        description="Ein Manifest: Barrierefreiheit in der deutschen Verwaltung scheitert nicht am Willen, sondern an der Infrastruktur. Das muss aufhören."
        canonical="/voxdrop-2030"
      />

      <Navigation />

      <div ref={rootRef} className="vd2030">
        <nav className="vd2030-dotnav" aria-label="Vision 2030 Abschnitte">
          <ol className="vd2030-dotnav-list">
            {PAGE_TOC.map((item) => (
              <li key={item.href} className="vd2030-dotnav-item">
                <a
                  href={item.href}
                  onClick={handleAnchorClick}
                  className="vd2030-dotnav-dot"
                  aria-label={item.label}
                  aria-current={activeHref === item.href ? "location" : undefined}
                >
                  <span className="vd2030-dotnav-label" aria-hidden="true">
                    {item.label}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <header className="vd2030-hero" id="hero">
          <div className="vd2030-hero-inner">
            <div className="vd2030-hero-eyebrow">Ein Manifest</div>
            <h1 className="vd2030-hero-title">
              VoxDrop <em>2030</em>
            </h1>
            <p className="vd2030-hero-subtitle">
              Barrierefreiheit in der deutschen Verwaltung ist gescheitert, nicht am Willen, sondern an der Infrastruktur.
              Das muss aufhören.
            </p>
          </div>

          <a className="vd2030-hero-scroll" href="#prolog" onClick={handleAnchorClick}>
            <span className="vd2030-scroll-line" aria-hidden="true" />
            Weiterlesen
          </a>
        </header>

        <div className="vd2030-stats-bar vd2030-reveal" aria-label="Kennzahlen">
          {STATS.map((stat) => (
            <div key={stat.value} className="vd2030-stat-item">
              <div className="vd2030-stat-number">{stat.value}</div>
              <div className="vd2030-stat-unit">
                {stat.label}
                <br />
                {stat.sublabel}
              </div>
            </div>
          ))}
        </div>

        <main id="main-content" className="vd2030-main" tabIndex={-1}>
        <section className="prolog" id="prolog">
          <div className="section-inner">
            <div className="section-label">Prolog – Der Zustand</div>
            <div className="vd2030-reveal">
              <p>
                Hunderte Behörden stehen vor der gleichen Aufgabe, und jede erfindet das Rad neu. Mit lokalen Tools,
                manuellen Checklisten und externen Gutachten, die veralten, bevor die Tinte trocken ist.
              </p>
              <p>
                Redakteurinnen kämpfen sich durch PDFs, die nie für Screenreader gedacht waren. IT-Abteilungen jonglieren
                Compliance-Anforderungen, die sie kaum verstehen, nicht aus Inkompetenz, sondern weil niemand ihnen die
                richtigen Werkzeuge gibt.
              </p>

              <blockquote className="pullquote">
                Eine blinde Bürgerin will ihren Rentenbescheid prüfen. Das PDF ist nicht getaggt. Ihr Screenreader liest
                wirres Zeug. Sie ruft beim Amt an. Wartet 45 Minuten. Bekommt die Info mündlich und hat keinen Nachweis.
                Das ist kein Randfall. Das ist Alltag.
              </blockquote>

              <p>
                Das ist nicht nachhaltig. Das ist nicht skalierbar. Und es ist nicht fair gegenüber den Menschen, für
                die Barrierefreiheit kein Feature ist, sondern eine Voraussetzung für Teilhabe.
              </p>
            </div>
          </div>
        </section>

        <section id="warum">
          <div className="section-inner">
            <div className="section-label">Warum jetzt?</div>
            <h2 className="vd2030-reveal">
              Der regulatorische <em>Moment</em>
            </h2>
            <div className="vd2030-reveal">
              <p>
                Es gibt Zeitfenster, in denen sich grundlegende Veränderungen durchsetzen lassen. In der digitalen
                Barrierefreiheit ist dieses Fenster jetzt offen.
              </p>
              <p>
                Das <strong>Barrierefreiheitsstärkungsgesetz (BFSG)</strong> gilt seit Juni 2025 für die Privatwirtschaft.
                Die <strong>BITV 2.0</strong> wird für Bundesbehörden strenger durchgesetzt. Der{" "}
                <strong>European Accessibility Act</strong> zwingt alle EU-Staaten zum Handeln. Das <strong>OZG 2.0</strong>{" "}
                verlangt barrierefreie digitale Verwaltungsleistungen. Die <strong>EU-Richtlinie 2016/2102</strong> wird
                auditiert mit echten Konsequenzen.
              </p>
              <p>
                Barrierefreiheit ist kein &quot;Nice to have&quot; mehr. Es ist Compliance-Pflicht mit Haftungsrisiko.
                Und die Lücke zwischen Anforderung und Realität wird jeden Monat größer.
              </p>
              <p>
                Die Antwort kann nicht &quot;mehr Personal&quot; sein, dafür gibt es nicht genug Fachkräfte. Die Antwort
                kann nicht &quot;mehr Budget für externe Gutachter&quot; sein, dafür gibt es nicht genug Budget. Die
                Antwort muss <strong>Infrastruktur</strong> sein.
              </p>
            </div>
          </div>
        </section>

        <div className="vd2030-divider" aria-hidden="true" />

        <section className="thesen-section" id="thesen">
          <div className="section-wide">
            <div className="section-label">Unsere Überzeugungen</div>
            <h2 className="vd2030-reveal">
              7 <em>Thesen</em>
            </h2>

            {THESES.map((t) => (
              <div key={t.number} className="these vd2030-reveal">
                <div className="these-number">{t.number}</div>
                <div>
                  <div className="these-title">{t.title}</div>
                  <div className="these-body">
                    <p>{t.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="people-section" id="menschen">
          <div className="section-inner">
            <div className="section-label">Für wen wir bauen</div>
            <h2 className="vd2030-reveal">
              Die <em>Menschen</em> hinter den Zahlen
            </h2>
            <div className="vd2030-reveal">
              <p>
                7,9 Millionen schwerbehinderte Menschen. Millionen mit temporären Einschränkungen. Eine alternde
                Gesellschaft. Situative Behinderung, die jeden treffen kann: Sonnenlicht auf dem Screen, laute Umgebung,
                ein gebrochener Arm.
              </p>
              <p>
                Auf der anderen Seite stehen die Teams, die Barrierefreiheit umsetzen sollen. Nicht als Hindernis,
                sondern als Menschen, die bessere Werkzeuge verdienen.
              </p>
            </div>

            <div className="persona-grid vd2030-reveal">
              {PERSONAS.map((p) => (
                <div key={p.title} className="persona-card">
                  <div className="persona-icon" aria-hidden="true">
                    <p.icon />
                  </div>
                  <div className="persona-role">{p.title}</div>
                  <div className="persona-desc">{p.description}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="infrastruktur">
          <div className="section-inner">
            <div className="section-label">Was wir bauen</div>
            <h2 className="vd2030-reveal">
              Von Tools zur <em>Infrastruktur</em>
            </h2>
            <div className="vd2030-reveal">
              <p>
                Die meisten Organisationen behandeln Barrierefreiheit wie eine Inspektion: Am Ende wird geprüft. Was am
                Anfang fünf Minuten gekostet hätte, kostet am Ende fünf Stunden.
              </p>
              <p>
                VoxDrop macht Barrierefreiheit von einer späten Endkontrolle zu einem <strong>kontinuierlichen Prozess</strong>. Nicht als zusätzliche Last,
                sondern als Infrastruktur, die Teams entlastet und Nachweise automatisch erzeugt.
              </p>

              <h3>Erklärbare KI statt Black Box</h3>
              <p>
                Jedes Finding kommt mit <strong>Norm-Bezug</strong> (WCAG/EN 301 549), <strong>Impact-Analyse</strong> nach Nutzergruppen,{" "}
                <strong>konkretem Fix-Vorschlag</strong> und <strong>Priorisierung</strong> nach realem Impact. Von &quot;Problem erkannt&quot; zu
                &quot;Problem gelöst&quot; ohne Ratearbeit.
              </p>

              <h3>Nachweise als Nebenprodukt</h3>
              <p>
                VPAT/EN 301 549 als lebendes Dokument. Audit-Logs mit Zeitstempel und Entscheidungsgrund. Exporte für Stakeholder in PDF, Word, CSV, JSON,
                ein Klick, nicht eine Stunde.
              </p>

              <h3>Behörden-Realität als Designvorgabe</h3>
              <p>
                Edge/Firefox, langsame Clients, strenge Firewalls. VoxDrop setzt auf <strong>Hybrid-Architektur</strong>: Leichte Aufgaben im Browser,
                schwere Jobs serverseitig. Keine Installation, keine Admin-Rechte. EVB-IT-konforme Lizenzierung.
              </p>
            </div>
          </div>
        </section>

        <section className="prolog" id="ki">
          <div className="section-wide">
            <div className="section-label">Wie wir es bauen</div>
            <h2 className="vd2030-reveal">
              Souveräne <em>KI</em>
            </h2>
            <div className="vd2030-reveal">
              <p style={{ maxWidth: 700 }}>
                &quot;Lokale KI&quot; ist kein Buzzword. Es ist eine architektonische Entscheidung mit konkreten Konsequenzen.
              </p>
            </div>

            <div className="pillars-grid vd2030-reveal">
              {KI_PILLARS.map((p) => (
                <div key={p.title} className="pillar">
                  <div className="pillar-num">{p.number}</div>
                  <div className="pillar-title">{p.title}</div>
                  <div className="pillar-desc">{p.description}</div>
                </div>
              ))}
            </div>

            <div className="vd2030-reveal">
              <h3>Stufenmodell der Automation</h3>
            </div>

            <div className="steps-visual vd2030-reveal" aria-label="Stufenmodell der Automation">
              {AUTOMATION_STEPS.map((s) => (
                <div key={s.step} className="step-item">
                  <div className="step-dot" aria-hidden="true" />
                  <div className="step-label">{s.step}</div>
                  <div className="step-title">{s.title}</div>
                  <div className="step-desc">{s.description}</div>
                </div>
              ))}
            </div>

            <blockquote className="pullquote vd2030-reveal" style={{ maxWidth: 700 }}>
              Wenn deine Accessibility-Prüfung über eine US-Cloud läuft, hast du zwei Probleme: Du bist nicht DSGVO-konform,
              und du prüfst Barrierefreiheit mit einem Tool, das selbst nicht souverän ist.
            </blockquote>
          </div>
        </section>

        <section className="costs-section" id="kosten">
          <div className="section-inner">
            <div className="section-label">Was es kostet, nichts zu tun</div>
            <h2 className="vd2030-reveal">
              Die wahren <em>Kosten</em>
            </h2>
            <div className="vd2030-reveal">
              <p>Barrierefreiheit wird oft als Kostenfaktor betrachtet. Das Gegenteil ist der Fall.</p>
            </div>

            <div className="cost-grid vd2030-reveal">
              {COST_CARDS.map((c) => (
                <div key={c.title} className="cost-card">
                  <div className="cost-tag">{c.tag}</div>
                  <div className="cost-title">{c.title}</div>
                  <div className="cost-desc">{c.description}</div>
                </div>
              ))}
            </div>

            <div className="cost-grid vd2030-reveal" style={{ gridTemplateColumns: "1fr", marginTop: 0 }}>
              <div className="cost-card highlight">
                <div className="cost-tag">Die Gegenrechnung</div>
                <div className="cost-title">VoxDrop rechnet sich ab dem ersten Quartal</div>
                <div className="cost-desc">
                  Automatisierte Prüfung ersetzt manuelle Erstprüfung. Nachweise entstehen automatisch. Fehler werden früher erkannt. Das Team wird entlastet.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="roadmap-section" id="roadmap">
          <div className="section-inner">
            <div className="section-label">Wohin wir gehen</div>
            <h2 className="vd2030-reveal">
              Die <em>Roadmap</em>
            </h2>
            <div className="vd2030-reveal">
              <p>Jedes Jahr hat ein Thema, ein Ziel und einen Meilenstein.</p>
            </div>

            <div className="timeline">
              {ROADMAP.map((item) => (
                <div key={item.year} className="timeline-item vd2030-reveal">
                  <div className="timeline-dot" aria-hidden="true" />
                  <div className="timeline-year">{item.year}</div>
                  <div className="timeline-motto">{item.motto}</div>
                  <div className="timeline-content">
                    <p>{item.description}</p>
                  </div>
                  <div className="timeline-features">
                    {item.features.map((feature) => (
                      <span key={feature} className="timeline-feature">
                        {feature}
                      </span>
                    ))}
                  </div>
                  <div className="timeline-milestone">{item.milestone}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="honesty-section" id="ehrlichkeit">
          <div className="section-wide">
            <div className="section-label">Was VoxDrop nicht ist</div>
            <h2 className="vd2030-reveal">
              Ehrliche <em>Grenzen</em>
            </h2>
            <div className="vd2030-reveal">
              <p style={{ maxWidth: 700 }}>
                Ein starkes Manifest spricht auch über das, was es nicht kann. Nicht aus Schwäche, sondern aus Vertrauen.
              </p>
            </div>

            <div className="honesty-grid vd2030-reveal">
              {HONESTY.map((h) => (
                <div key={h.title} className="honesty-card">
                  <div className="not-label">Nicht</div>
                  <h4>{h.title}</h4>
                  <p>{h.description}</p>
                </div>
              ))}
            </div>

            <blockquote className="pullquote vd2030-reveal" style={{ maxWidth: 700, margin: "2rem auto" }}>
              Lieber eine ehrliche 70-Prozent-Lösung als ein falsches 100-Prozent-Versprechen.
            </blockquote>
          </div>
        </section>

        <section className="ecosystem-section" id="oekosystem">
          <div className="section-wide">
            <div className="section-label">Das Ökosystem</div>
            <h2 className="vd2030-reveal">
              VoxDrop ist kein <em>Silo</em>
            </h2>
            <div className="vd2030-reveal">
              <p style={{ maxWidth: 700 }}>
                Kein Tool löst Barrierefreiheit allein. VoxDrop wird in ein Ökosystem eingebettet, das die Realität der deutschen Verwaltungs-IT widerspiegelt.
              </p>
            </div>

            <div className="eco-categories vd2030-reveal">
              {ECOSYSTEM.map((c) => (
                <div key={c.title} className="eco-category">
                  <h4>{c.title}</h4>
                  {c.items.map((i) => (
                    <div key={i} className="eco-item">
                      {i}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="invitation-section" id="mitgestalten">
          <div className="invitation-inner vd2030-reveal">
            <div className="section-label" style={{ justifyContent: "center" }}>
              Die Einladung
            </div>
            <h2>
              <em>Mitgestalten</em>
            </h2>
            <p>
              Wir suchen 10 Pilotbehörden, die VoxDrop 2026 im Echtbetrieb testen und die Roadmap mitgestalten. Nicht als Kunden, als Partner.
            </p>

            <div className="cta-row">
              <a href="mailto:anfrage@voxdrop.live?subject=VoxDrop%202030%20Pilotbehörde" className="cta-btn">
                Lass uns sprechen
                <ArrowRight aria-hidden="true" />
              </a>
              <Link href="/features" className="cta-btn secondary">
                Alle Tools
              </Link>
            </div>
          </div>
        </section>

        <section className="epilog" id="epilog">
          <div className="epilog-inner">
            <div className="section-label">Epilog – 2030</div>
            <p className="epilog-text vd2030-reveal">
              Es ist 2030. Eine Redakteurin erstellt einen Bescheid. Während sie tippt, prüft VoxDrop im Hintergrund die Barrierefreiheit. Was automatisch korrigierbar ist, wird korrigiert. Was menschliches Urteil braucht, wird markiert.
            </p>
            <p className="epilog-text vd2030-reveal">
              Ein blinder Bürger ruft das Dokument ab. Sein Screenreader navigiert sauber durch die Überschriften, liest die Tabelle strukturiert vor, gibt den Alternativtext wieder. Er versteht den Bescheid. Er kann handeln. Ohne Anruf. Ohne Wartezeit. Ohne Hilfe.
            </p>
            <div className="epilog-closer vd2030-reveal">
              Das ist keine Utopie. Das ist ein Ingenieursproblem.
              <br />
              Und Ingenieursprobleme lassen sich lösen.
            </div>
            <div className="epilog-tagline vd2030-reveal">
              <div className="brand">VoxDrop</div>
              <div className="claim">Barrierefreiheit als Infrastruktur. Made in Germany. Für alle.</div>
            </div>
          </div>
        </section>

        <footer className="vd2030-footer">
          <div className="vd2030-footer-inner">
            <div className="vd2030-footer-copy">© {year} VoxDrop. Made in Germany.</div>
            <div className="vd2030-footer-links">
              <Link href="/features">Tools</Link>
              <Link href="/datenschutz">Datenschutz</Link>
              <Link href="/impressum">Impressum</Link>
            </div>
          </div>
          </footer>
        </main>
      </div>
    </>
  );
}
