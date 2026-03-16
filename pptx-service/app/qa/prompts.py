"""
Prompt templates for alt-text generation and repair.

This module centralizes all LLM prompts used in the QA pipeline,
making them easier to maintain, version, and localize.
"""

from typing import List, Optional


# Valid prefixes for German alt-texts (PDF/UA compliance)
VALID_PREFIXES_DE = (
    "Folientitel:",
    "Liste:",
    "Bild:",
    "Diagramm:",
    "Tabelle:",
    "Grafik:",
    "Text:",
    "Form:",
    "SmartArt:",
    "Chart:",
    "Video:",
    "Audio:",
    "Zeitstrahl:",
    "Meilenstein:",
    "Logo:",
    "Icon:",
)

# Valid prefixes for English alt-texts
VALID_PREFIXES_EN = (
    "Slide title:",
    "List:",
    "Image:",
    "Diagram:",
    "Table:",
    "Graphic:",
    "Text:",
    "Shape:",
    "SmartArt:",
    "Chart:",
    "Video:",
    "Audio:",
    "Timeline:",
    "Milestone:",
    "Logo:",
    "Icon:",
)


def get_valid_prefixes(language: str = "de") -> tuple:
    """Get valid prefixes for the specified language."""
    if language.lower().startswith("en"):
        return VALID_PREFIXES_EN
    return VALID_PREFIXES_DE


# =============================================================================
# ALT-TEXT GENERATION SYSTEM PROMPT
# =============================================================================

ALT_TEXT_SYSTEM_PROMPT_DE = """Du bist ein Experte für Barrierefreiheit und PDF/UA-Compliance.
Deine Aufgabe ist es, Alt-Texte für Screenreader-Nutzer zu erstellen.

WICHTIGE REGELN:

1. NIEMALS den sichtbaren Text einfach kopieren!
   Erstelle stattdessen eine BESCHREIBUNG die erklärt:
   - WAS für ein Element es ist
   - WELCHE Bedeutung es im Kontext hat
   - WAS die Kernaussage ist

2. VERPFLICHTENDE PRÄFIXE - Jeder Alt-Text MUSS so beginnen:
   - Folientitel: [Titel] - [Einordnung im Gesamtkontext]
   - Text: [Thema/Funktion] - [Zusammenfassung der Kernaussage]
   - Liste: [Anzahl] Punkte zu [Thema]: [Die wichtigsten Punkte]
   - Zeitstrahl: [von-bis]: [Was zeigt die zeitliche Entwicklung]
   - Meilenstein: [Jahr]: [Was passiert in diesem Jahr]
   - Diagramm: [Typ]: [Kernaussage und wichtigste Datenpunkte]
   - Tabelle: [Zeilen x Spalten]: [Was vergleicht/zeigt die Tabelle]
   - Bild: [Was ist dargestellt und welche Bedeutung hat es]
   - Grafik: [Beschreibung der visuellen Darstellung]
   - Logo: [Firmen-/Organisationsname]
   - Icon: [Bedeutung des Symbols im Kontext]

3. DECORATIVE ELEMENTE:
   Wenn ein Element rein dekorativ ist (Linien, Hintergrundformen, kleine Icons ohne Bedeutung),
   antworte NUR mit dem Wort: DECORATIVE

4. LÄNGE:
   - Minimum: 20 Zeichen
   - Maximum: 500 Zeichen
   - Ideal: 50-200 Zeichen

5. KONTEXT NUTZEN:
   - Beachte den Folientitel für Kontext
   - Beachte den Präsentationskontext (Glossar, Thema)
   - Verweise auf vorherige/nachfolgende Inhalte wenn relevant

6. SPEAKER NOTES ALS PRIMÄRQUELLE:
   Wenn Speaker Notes verfügbar sind, nutze diese IMMER als Hauptevidenz:
   - Speaker Notes enthalten oft das "WARUM" hinter einem Diagramm
   - Sie erklären komplexe Zusammenhänge in einfachen Worten
   - Sie geben Kontext, der visuell nicht erkennbar ist
   - PRIORISIERE Speaker Notes über OCR und Vision Seeds

   Beispiel: Ein Balkendiagramm mit Speaker Note "Hier sehen wir, dass Q3
   durch die Lieferkettenprobleme einbrach" →
   "Diagramm: Umsatzentwicklung Q1-Q4 zeigt Einbruch in Q3 aufgrund von Lieferkettenproblemen"

BEISPIELE:

FALSCH: "2026"
RICHTIG: "Meilenstein 2026: Geplanter Abschluss der technischen Migration"

FALSCH: "Transformationsvorgehen für die Modernisierung"
RICHTIG: "Folientitel: Transformationsvorgehen für die Modernisierung - Einleitung zum Migrationskonzept"

FALSCH: "Pfeil nach rechts"
RICHTIG: DECORATIVE

FALSCH: "Kleines blaues Quadrat"
RICHTIG: DECORATIVE"""


ALT_TEXT_SYSTEM_PROMPT_EN = """You are an expert in accessibility and PDF/UA compliance.
Your task is to create alt-texts for screen reader users.

IMPORTANT RULES:

1. NEVER simply copy the visible text!
   Instead, create a DESCRIPTION that explains:
   - WHAT type of element it is
   - WHAT meaning it has in context
   - WHAT the key message is

2. REQUIRED PREFIXES - Every alt-text MUST start with:
   - Slide title: [Title] - [Context within presentation]
   - Text: [Topic/Function] - [Summary of key message]
   - List: [Count] items about [Topic]: [Key points]
   - Timeline: [from-to]: [What the timeline shows]
   - Milestone: [Year]: [What happens in this year]
   - Diagram: [Type]: [Key message and important data points]
   - Table: [Rows x Columns]: [What the table compares/shows]
   - Image: [What is depicted and its significance]
   - Graphic: [Description of visual representation]
   - Logo: [Company/Organization name]
   - Icon: [Meaning of symbol in context]

3. DECORATIVE ELEMENTS:
   If an element is purely decorative (lines, background shapes, small meaningless icons),
   respond ONLY with the word: DECORATIVE

4. LENGTH:
   - Minimum: 20 characters
   - Maximum: 500 characters
   - Ideal: 50-200 characters

5. USE CONTEXT:
   - Consider the slide title for context
   - Consider presentation context (glossary, theme)
   - Reference previous/following content when relevant

6. SPEAKER NOTES AS PRIMARY SOURCE:
   When speaker notes are available, ALWAYS use them as primary evidence:
   - Speaker notes often contain the "WHY" behind a diagram
   - They explain complex relationships in simple terms
   - They provide context not visible in the visual
   - PRIORITIZE speaker notes over OCR and vision seeds

   Example: A bar chart with speaker note "Here we see Q3 dropped due to
   supply chain issues" →
   "Diagram: Revenue Q1-Q4 shows Q3 decline due to supply chain problems\""""


def get_alttext_system_prompt(language: str = "de") -> str:
    """Get the alt-text system prompt for the specified language."""
    if language.lower().startswith("en"):
        return ALT_TEXT_SYSTEM_PROMPT_EN
    return ALT_TEXT_SYSTEM_PROMPT_DE


# =============================================================================
# ALT-TEXT REPAIR PROMPT
# =============================================================================

ALT_TEXT_REPAIR_PROMPT_TEMPLATE = """Verbessere den folgenden Alt-Text.

AKTUELLER ALT-TEXT:
{current_alttext}

ERKANNTE PROBLEME:
{issues}

KONTEXT/EVIDENZ:
- Folientitel: {slide_title}
- Form-Typ: {shape_type}
- Sichtbarer Text: {visible_text}
- OCR-Text (falls Bild): {ocr_text}
- Bildanalyse (falls verfügbar): {vision_seed}
- Speaker Notes (WICHTIGSTE QUELLE): {speaker_notes}

GLOBALER KONTEXT:
{global_context}

ANWEISUNG:
Erstelle einen verbesserten Alt-Text der alle Probleme behebt.
PRIORISIERE die Information aus den Speaker Notes - sie enthalten oft
das "Warum" und die Kernaussage, die im Bild nicht sichtbar ist.
Wenn das Element rein dekorativ ist, antworte nur mit: DECORATIVE

Gib NUR den verbesserten Alt-Text aus, ohne Erklärungen:"""


def build_repair_prompt(
    current_alttext: str,
    issues: List[str],
    slide_title: str = "",
    shape_type: str = "",
    visible_text: str = "",
    ocr_text: str = "",
    vision_seed: str = "",
    global_context: str = "",
    speaker_notes: str = "",
) -> str:
    """Build a repair prompt with all available context."""
    return ALT_TEXT_REPAIR_PROMPT_TEMPLATE.format(
        current_alttext=current_alttext or "(leer)",
        issues="\n".join(f"- {issue}" for issue in issues) if issues else "Keine",
        slide_title=slide_title or "(nicht verfügbar)",
        shape_type=shape_type or "(unbekannt)",
        visible_text=visible_text[:200] if visible_text else "(kein Text)",
        ocr_text=ocr_text[:200] if ocr_text else "(kein OCR)",
        vision_seed=vision_seed[:300] if vision_seed else "(keine Bildanalyse)",
        speaker_notes=speaker_notes[:500] if speaker_notes else "(keine Speaker Notes)",
        global_context=global_context[:500] if global_context else "(kein globaler Kontext)",
    )


# =============================================================================
# SLIDE SUMMARY PROMPT (Summary-First Strategy)
# =============================================================================

SLIDE_SUMMARY_SYSTEM_PROMPT_DE = """Du bist ein Experte für barrierefreie Dokumentation.
Deine Aufgabe ist es, für Screenreader-Nutzer eine narrative Zusammenfassung jeder Folie zu erstellen.

Diese Zusammenfassung erscheint VOR dem eigentlichen Folieninhalt und gibt dem Nutzer
einen schnellen Überblick, BEVOR er sich durch die Details navigiert.

REGELN:

1. NUTZE SPEAKER NOTES ALS HAUPTQUELLE:
   - Speaker Notes enthalten die Intention des Vortragenden
   - Sie erklären das "Warum" hinter den visuellen Elementen
   - Paraphrasiere sie in natürlicher, erzählender Sprache

2. STIL:
   - Schreibe in der 3. Person ("Diese Folie zeigt...", "Hier wird erklärt...")
   - 2-4 Sätze, max. 300 Zeichen
   - Fließtext, KEINE Aufzählungen
   - Beginne NICHT mit "Zusammenfassung:" oder ähnlichem

3. INHALT:
   - Was ist das Hauptthema der Folie?
   - Welche visuellen Elemente gibt es? (Diagramm, Zeitstrahl, Tabelle?)
   - Was ist die Kernaussage?

BEISPIEL:
Folientitel: "Q3 Finanzergebnisse"
Speaker Notes: "In Q3 hatten wir den Einbruch wegen der Lieferkettenprobleme. Die
Grafik zeigt, dass wir uns in Q4 erholt haben."
Visuelle Elemente: Balkendiagramm

GUTE ZUSAMMENFASSUNG:
"Diese Folie präsentiert die Finanzergebnisse des dritten Quartals anhand eines
Balkendiagramms. Sie zeigt den Umsatzeinbruch in Q3, der auf Lieferkettenprobleme
zurückzuführen war, sowie die Erholung im vierten Quartal."
"""

SLIDE_SUMMARY_SYSTEM_PROMPT_EN = """You are an expert in accessible documentation.
Your task is to create a narrative summary of each slide for screen reader users.

This summary appears BEFORE the actual slide content, giving users a quick
overview BEFORE navigating through the details.

RULES:

1. USE SPEAKER NOTES AS PRIMARY SOURCE:
   - Speaker notes contain the presenter's intention
   - They explain the "why" behind visual elements
   - Paraphrase them in natural, narrative language

2. STYLE:
   - Write in 3rd person ("This slide shows...", "Here we see...")
   - 2-4 sentences, max 300 characters
   - Flowing prose, NO bullet points
   - Do NOT start with "Summary:" or similar

3. CONTENT:
   - What is the main topic of the slide?
   - What visual elements are present? (diagram, timeline, table?)
   - What is the key message?
"""


SLIDE_SUMMARY_PROMPT_TEMPLATE = """Erstelle eine narrative Zusammenfassung für diese Folie.

FOLIENTITEL: {slide_title}
FOLIENNUMMER: {slide_number}

SPEAKER NOTES (WICHTIGSTE QUELLE):
{speaker_notes}

SICHTBARER TEXT:
{visible_text}

VISUELLE ELEMENTE:
{visual_elements}

ALT-TEXTE DER VISUELLEN ELEMENTE:
{alt_texts}

Schreibe NUR die Zusammenfassung (2-4 Sätze, Fließtext):"""


def get_slide_summary_system_prompt(language: str = "de") -> str:
    """Get the slide summary system prompt for the specified language."""
    if language.lower().startswith("en"):
        return SLIDE_SUMMARY_SYSTEM_PROMPT_EN
    return SLIDE_SUMMARY_SYSTEM_PROMPT_DE


def build_slide_summary_prompt(
    slide_title: str,
    slide_number: int,
    speaker_notes: str = "",
    visible_text: str = "",
    visual_elements: List[str] = None,
    alt_texts: List[str] = None,
) -> str:
    """Build a prompt for generating a slide summary."""
    visual_elements = visual_elements or []
    alt_texts = alt_texts or []

    return SLIDE_SUMMARY_PROMPT_TEMPLATE.format(
        slide_title=slide_title or "(Kein Titel)",
        slide_number=slide_number,
        speaker_notes=speaker_notes[:800] if speaker_notes else "(Keine Speaker Notes verfügbar)",
        visible_text=visible_text[:500] if visible_text else "(Kein Text)",
        visual_elements=", ".join(visual_elements) if visual_elements else "(Keine)",
        alt_texts="\n".join(f"- {alt}" for alt in alt_texts[:5]) if alt_texts else "(Keine)",
    )


# =============================================================================
# GLOSSARY EXTRACTION PROMPT
# =============================================================================

GLOSSARY_EXTRACTION_PROMPT = """Analysiere den folgenden Text aus einer Präsentation und extrahiere:
1. Abkürzungen und ihre Bedeutungen
2. Fachbegriffe die erklärt werden sollten
3. Wiederkehrende Schlüsselbegriffe

Text:
{text}

Antworte im JSON-Format:
{{
  "acronyms": {{"ABK": "Ausgeschriebene Bedeutung"}},
  "terms": {{"Fachbegriff": "Kurze Erklärung"}},
  "keywords": ["Schlüsselwort1", "Schlüsselwort2"]
}}"""
