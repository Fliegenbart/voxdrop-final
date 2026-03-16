/**
 * Regeln und Wörterbuch für Leichte Sprache
 * Basierend auf den Empfehlungen des Netzwerks Leichte Sprache
 */

// Wörterbuch: Komplexe Wörter → Einfache Alternativen
export const WORD_REPLACEMENTS: Record<string, string> = {
  // Behördensprache
  "unverzüglich": "sofort",
  "zeitnah": "bald",
  "umgehend": "sofort",
  "alsbald": "bald",
  "schnellstmöglich": "so schnell wie möglich",
  "baldmöglichst": "so bald wie möglich",

  // Verben
  "beantragen": "einen Antrag stellen",
  "genehmigen": "erlauben",
  "bewilligen": "erlauben",
  "ablehnen": "nein sagen",
  "veranlassen": "dafür sorgen",
  "verweigern": "nicht erlauben",
  "untersagen": "verbieten",
  "gestatten": "erlauben",
  "gewähren": "geben",
  "erteilen": "geben",
  "einreichen": "abgeben",
  "übermitteln": "schicken",
  "übersenden": "schicken",
  "zuschicken": "schicken",
  "zukommen lassen": "schicken",
  "in Kenntnis setzen": "informieren",
  "benachrichtigen": "Bescheid sagen",
  "unterrichten": "informieren",
  "mitteilen": "sagen",
  "bekanntgeben": "sagen",
  "anzeigen": "melden",
  "melden": "Bescheid sagen",
  "erstatten": "zurückgeben",
  "entrichten": "bezahlen",
  "begleichen": "bezahlen",
  "überweisen": "Geld schicken",
  "einzahlen": "Geld geben",
  "auszahlen": "Geld geben",
  "anfordern": "bitten um",
  "ersuchen": "bitten",
  "auffordern": "bitten",
  "ermächtigen": "erlauben",
  "bevollmächtigen": "erlauben",
  "beauftragen": "bitten etwas zu tun",

  // Substantive
  "Bescheid": "Brief vom Amt",
  "Antrag": "Bitte an das Amt",
  "Antragsteller": "die Person die fragt",
  "Antragstellerin": "die Person die fragt",
  "Behörde": "Amt",
  "Verwaltung": "Amt",
  "Dienststelle": "Amt",
  "Sachbearbeiter": "Mitarbeiter vom Amt",
  "Sachbearbeiterin": "Mitarbeiterin vom Amt",
  "Angelegenheit": "Sache",
  "Sachverhalt": "Sache",
  "Vorgang": "Sache",
  "Maßnahme": "was getan wird",
  "Bestimmung": "Regel",
  "Vorschrift": "Regel",
  "Regelung": "Regel",
  "Verordnung": "Regel",
  "Richtlinie": "Regel",
  "Gesetz": "Regel vom Staat",
  "Paragraph": "Teil von einem Gesetz",
  "Frist": "Zeit bis wann",
  "Termin": "Zeit wann",
  "Zeitraum": "Zeit von bis",
  "Dauer": "wie lange",
  "Gültigkeit": "wie lange es gilt",
  "Laufzeit": "wie lange es dauert",
  "Gebühr": "Geld das man bezahlen muss",
  "Kosten": "Geld das man bezahlen muss",
  "Betrag": "Geld",
  "Summe": "Geld zusammen",
  "Entgelt": "Geld für etwas",
  "Vergütung": "Geld für Arbeit",
  "Zuschuss": "Geld als Hilfe",
  "Beihilfe": "Geld als Hilfe",
  "Förderung": "Hilfe",
  "Unterstützung": "Hilfe",
  "Leistung": "Hilfe oder Geld",
  "Anspruch": "Recht auf etwas",
  "Berechtigung": "Recht auf etwas",
  "Befugnis": "darf etwas tun",
  "Ermächtigung": "darf etwas tun",
  "Vollmacht": "darf für jemand anders handeln",
  "Genehmigung": "Erlaubnis",
  "Erlaubnis": "man darf etwas",
  "Zustimmung": "ja sagen",
  "Einwilligung": "ja sagen",
  "Nachweis": "Beweis",
  "Beleg": "Papier als Beweis",
  "Dokument": "wichtiges Papier",
  "Unterlage": "wichtiges Papier",
  "Formular": "Papier zum Ausfüllen",
  "Vordruck": "Papier zum Ausfüllen",
  "Erklärung": "was man sagt oder schreibt",
  "Mitteilung": "Nachricht",
  "Benachrichtigung": "Nachricht",
  "Information": "was man wissen muss",
  "Auskunft": "Antwort auf eine Frage",
  "Hinweis": "wichtige Info",
  "Vermerk": "kurze Notiz",
  "Anmerkung": "Notiz dazu",

  // Adjektive
  "erforderlich": "nötig",
  "notwendig": "nötig",
  "obligatorisch": "muss sein",
  "verpflichtend": "muss sein",
  "freiwillig": "wenn man will",
  "optional": "wenn man will",
  "möglich": "kann sein",
  "unmöglich": "geht nicht",
  "zulässig": "erlaubt",
  "unzulässig": "nicht erlaubt",
  "rechtmäßig": "nach den Regeln",
  "rechtswidrig": "gegen die Regeln",
  "gültig": "gilt",
  "ungültig": "gilt nicht",
  "wirksam": "funktioniert",
  "unwirksam": "funktioniert nicht",
  "zuständig": "dafür verantwortlich",
  "befugt": "darf das",
  "berechtigt": "hat das Recht",
  "verpflichtet": "muss das tun",
  "entsprechend": "so wie",
  "gemäß": "so wie es steht in",
  "laut": "so wie es steht in",
  "aufgrund": "weil",
  "infolge": "weil",
  "wegen": "weil",
  "bezüglich": "über",
  "hinsichtlich": "über",
  "betreffend": "über",
  "diesbezüglich": "dazu",
  "dahingehend": "so",
  "insofern": "so",
  "sofern": "wenn",
  "soweit": "wenn",
  "falls": "wenn",
  "gegebenenfalls": "vielleicht",
  "eventuell": "vielleicht",
  "möglicherweise": "vielleicht",
  "unter Umständen": "vielleicht",
  "grundsätzlich": "meistens",
  "prinzipiell": "meistens",
  "generell": "meistens",
  "üblicherweise": "meistens",
  "in der Regel": "meistens",
  "ausnahmsweise": "nur dieses Mal",
  "vorübergehend": "für kurze Zeit",
  "dauerhaft": "für immer",
  "endgültig": "für immer",
  "vorläufig": "erst mal",
  "abschließend": "zum Schluss",
  "letztendlich": "am Ende",

  // Phrasen
  "zur Kenntnis nehmen": "wissen",
  "in Betracht ziehen": "überlegen",
  "in Erwägung ziehen": "überlegen",
  "Folge leisten": "tun was gesagt wird",
  "Rechnung tragen": "beachten",
  "in Anspruch nehmen": "nutzen",
  "zur Verfügung stellen": "geben",
  "zur Verfügung stehen": "da sein",
  "in Kraft treten": "anfangen zu gelten",
  "außer Kraft treten": "nicht mehr gelten",
  "Geltung haben": "gelten",
  "von Bedeutung sein": "wichtig sein",
  "Voraussetzung sein": "nötig sein",
  "zum Tragen kommen": "wirken",
  "zum Ausdruck bringen": "sagen",
  "in Verbindung setzen": "kontaktieren",
  "Stellung nehmen": "seine Meinung sagen",
  "zum Gegenstand haben": "handeln von",
};

// Bekannte Abkürzungen die vermieden werden sollten
export const ABBREVIATIONS: Record<string, string> = {
  "z.B.": "zum Beispiel",
  "z. B.": "zum Beispiel",
  "d.h.": "das heißt",
  "d. h.": "das heißt",
  "u.a.": "unter anderem",
  "u. a.": "unter anderem",
  "usw.": "und so weiter",
  "etc.": "und so weiter",
  "bzgl.": "bezüglich",
  "ggf.": "gegebenenfalls",
  "evtl.": "eventuell",
  "ca.": "circa",
  "inkl.": "inklusive",
  "exkl.": "ohne",
  "i.d.R.": "in der Regel",
  "i. d. R.": "in der Regel",
  "gem.": "gemäß",
  "lt.": "laut",
  "s.o.": "siehe oben",
  "s.u.": "siehe unten",
  "vgl.": "vergleiche",
  "zzgl.": "zuzüglich",
  "abzgl.": "abzüglich",
  "max.": "maximal",
  "min.": "mindestens",
  "mind.": "mindestens",
  "Nr.": "Nummer",
  "Tel.": "Telefon",
  "Str.": "Straße",
  "Abs.": "Absatz",
  "Art.": "Artikel",
  "Anl.": "Anlage",
  "Abt.": "Abteilung",
  "Az.": "Aktenzeichen",
  "Bsp.": "Beispiel",
  "Hrsg.": "Herausgeber",
  "Jg.": "Jahrgang",
  "Kap.": "Kapitel",
  "S.": "Seite",
  "sog.": "sogenannt",
  "u.U.": "unter Umständen",
  "v.a.": "vor allem",
  "z.T.": "zum Teil",
  "z. T.": "zum Teil",
};

// Passiv-Indikatoren (wird/werden + Partizip II)
export const PASSIVE_INDICATORS = [
  "wird", "werden", "wurde", "wurden", "werde", "werdet",
  "ist worden", "sind worden", "war worden", "waren worden"
];

// Genitiv-Indikatoren
export const GENITIVE_INDICATORS = [
  "des", "der", "dessen", "deren"
];

// System-Prompt für die KI-Vereinfachung
export const SIMPLE_LANGUAGE_SYSTEM_PROMPT = `Du bist ein Experte für Barrierefreie Kommunikation und Einfache Sprache.

DEINE ZIELGRUPPEN (denke beim Schreiben an diese Menschen):
- Mehmet (34): Geflüchteter mit Deutsch B1 - versteht keine Fachbegriffe
- Thomas (42): ADHS & Legasthenie - braucht klare Struktur und kurze Absätze
- Aisha (67): Gehörlos, DGS-Muttersprachlerin - Passiv-Sätze sind schwer
- Fatima (29): Geringe Lesekompetenz - braucht sehr einfache Sprache

WICHTIGE REGELN:

1. SATZEBENE
- Maximal 15-20 Wörter pro Satz
- Möglichst nur ein Komma pro Satz
- Keine Einschübe und Schachtelsätze
- Aktive Verben, kein Passiv (wichtig für Aisha!)
- Eindeutige Sätze

2. WORTEBENE
- Möglichst keine Fremdwörter (wichtig für Mehmet!)
- Schwierige Wörter erklären oder ersetzen
- Lange Wörter mit Bindestrich trennen (z.B. Kranken-Versicherung)
- Keine Sprichwörter, Ironie und Metaphern
- Abkürzungen immer ausschreiben
- Negationen vermeiden
- Keine Synonyme - bei einem Begriff bleiben

3. STRUKTUR (wichtig für Thomas!)
- Überschriften verwenden
- Kurze Absätze (max. 3-4 Sätze)
- Listen für Aufzählungen
- Wichtiges zuerst
- Klare visuelle Gliederung

4. ANREDE & TON
- Direkte Anrede mit "Sie"
- Freundlich und einladend (nicht bürokratisch)
- Keine bedrohlichen Formulierungen

DEINE AUFGABE:
Wandle den folgenden Text in Einfache Sprache um. Behalte alle wichtigen Informationen, aber formuliere sie so, dass alle oben genannten Zielgruppen den Text verstehen können.

Gib NUR den vereinfachten Text zurück, ohne Erklärungen oder Kommentare.`;

// Schwellenwerte für die Analyse (Einfache Sprache, NICHT Leichte Sprache)
export const ANALYSIS_THRESHOLDS = {
  // Satzlänge: 15-20 Wörter sind ok, darüber wird gewarnt
  maxWordsPerSentence: 20,
  // Komplexe Wörter ab 15 Zeichen
  maxCharactersPerWord: 15,
  complexWordMinLength: 15,
  // Max. 1 Komma pro Satz empfohlen
  maxCommasPerSentence: 1,

  // Score-Gewichtung (niedriger = toleranter)
  // Der Score wird relativ zur Textlänge berechnet
  weights: {
    longSentences: 5,       // Pro Satz >20 Wörter
    tooManyCommas: 3,       // Pro Satz mit >1 Komma
    complexWords: 2,        // Pro komplexes Wort (>15 Zeichen)
    passiveVoice: 4,        // Pro Passiv-Konstruktion
    genitiveCase: 2,        // Pro Genitiv (weniger streng)
    abbreviations: 3,       // Pro Abkürzung
    replaceableWords: 1,    // Pro ersetzbares Wort (nur Hinweis)
  },

  // Score-Level
  levels: {
    easy: { min: 75, label: "leicht", color: "green" },
    medium: { min: 50, label: "mittel", color: "yellow" },
    hard: { min: 0, label: "schwer", color: "red" },
  }
};

// Legacy/free cap (in characters) for the Einfache Sprache tool.
// Paid plans use a word-based limit enforced in the route handler.
export const MAX_TEXT_LENGTH = 10000;
