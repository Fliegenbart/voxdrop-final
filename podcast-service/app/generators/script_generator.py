"""
Script Generator - Intelligent podcast script creation using Ollama

Multi-phase approach:
1. UNDERSTAND: Analyze the entire presentation as a whole
2. PLAN: Create a podcast dramaturgy plan
3. WRITE: Generate the script with full context awareness

The key principle: Ollama sees EVERYTHING before writing anything.
"""
import json
import ollama
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Any, Optional
from app.config import OLLAMA_CONFIG

SCRIPT_MAX_WORKERS = max(1, int(os.getenv("SCRIPT_MAX_WORKERS", "1")))
SCRIPT_MAX_WORDS_PER_SLIDE = max(40, int(os.getenv("SCRIPT_MAX_WORDS_PER_SLIDE", "180")))
SCRIPT_MAX_ITEMS_PER_SLIDE = max(3, int(os.getenv("SCRIPT_MAX_ITEMS_PER_SLIDE", "10")))
SCRIPT_MAX_IMAGES_PER_SLIDE = max(0, int(os.getenv("SCRIPT_MAX_IMAGES_PER_SLIDE", "2")))


def _trim_words(text: str, max_words: int) -> str:
    value = re.sub(r"\s+", " ", str(text or "").strip())
    if not value:
        return ""
    words = value.split(" ")
    if len(words) <= max_words:
        return value
    return " ".join(words[:max_words]).rstrip() + " […]"


def _trim_chars(text: str, max_chars: int) -> str:
    value = str(text or "").strip()
    if not value:
        return ""
    value = re.sub(r"\s+", " ", value).strip()
    if len(value) <= max_chars:
        return value
    return value[: max_chars - 1].rstrip() + "…"


def _ollama_generate(prompt: str, *, temperature: float, num_predict: int) -> str:
    # Create a per-call client: avoids thread-safety questions when parallelizing.
    client = ollama.Client(host=OLLAMA_CONFIG["host"])
    response = client.generate(
        model=OLLAMA_CONFIG["model"],
        prompt=prompt,
        options={
            "temperature": temperature,
            "num_predict": num_predict,
        },
    )
    return str(response.get("response", "") or "")


# Speaker style descriptions - STRONG influence on output
SPEAKER_STYLE_DESCRIPTIONS = {
    "sachlich": """STIL: SACHLICH & PROFESSIONELL

TONFALL:
- Neutral, distanziert, faktenbasiert
- Wie ein Nachrichtensprecher oder Wissenschaftler
- Keine persoenlichen Meinungen oder Emotionen
- Praezise Fachsprache verwenden

FORMULIERUNGEN:
✓ "Die Daten zeigen..."
✓ "Zusammenfassend laesst sich feststellen..."
✓ "Ein wichtiger Aspekt ist..."
✗ NIEMALS: "Das ist ja total spannend!"
✗ NIEMALS: "Wow, schaut euch das an!"
✗ NIEMALS: Witze oder lockere Sprueche

BEISPIEL:
"Die Praesentation behandelt drei zentrale Themenfelder. Zunaechst wird die Ausgangssituation analysiert. Anschliessend werden die Handlungsoptionen dargestellt."
""",

    "lebendig": """STIL: LEBENDIG & BEGEISTERT

TONFALL:
- Enthusiastisch, mitreissend, dynamisch
- Wie ein TED-Talk Sprecher
- Zeige echte Begeisterung fuer das Thema
- Energie und Leidenschaft vermitteln

FORMULIERUNGEN:
✓ "Das Spannende daran ist..."
✓ "Stellt euch mal vor..."
✓ "Und jetzt kommt der entscheidende Punkt!"
✓ "Das hat mich wirklich beeindruckt!"
✓ Rhetorische Fragen: "Warum ist das so wichtig?"

TECHNIKEN:
- Dramaturgische Pausen andeuten
- Superlative nutzen: "einer der wichtigsten Aspekte"
- Persoenliche Ansprache: "Sie werden sehen..."

BEISPIEL:
"Und jetzt wird es richtig interessant! Denn was die naechste Folie zeigt, hat das Potenzial, alles zu veraendern. Seid ihr bereit?"
""",

    "lustig": """STIL: HUMORVOLL & UNTERHALTSAM

TONFALL:
- Witzig, spielerisch, augenzwinkernd
- Wie ein Comedy-Podcast
- Selbstironie ist erlaubt
- Informativ, aber mit Spass

FORMULIERUNGEN:
✓ "Okay, jetzt wird's nerdig - aber auf die gute Art!"
✓ "Spoiler-Alarm: Es wird noch besser."
✓ "Falls ihr euch das auch schon gefragt habt..."
✓ "Keine Sorge, das klingt komplizierter als es ist."
✓ Wortspiele und Vergleiche einbauen

TECHNIKEN:
- Uebertreibungen fuer Effekt
- Unerwartete Vergleiche: "Das ist wie Netflix, nur fuer Daten"
- Selbstreferenzielle Kommentare: "Ja, ich weiss, schon wieder eine Grafik"

BEISPIEL:
"Also, schnallt euch an, denn jetzt kommt die Folie, auf die ihr alle gewartet habt! Okay, vielleicht nicht ALLE, aber definitiv die Zahlen-Nerds unter euch. Und mal ehrlich - wer liebt nicht eine gute Statistik?"
""",

    "locker": """STIL: ENTSPANNT & GESPRAECHIG

TONFALL:
- Casual, freundschaftlich, nahbar
- Wie ein Gespraech unter Kollegen beim Kaffee
- Du-Form bevorzugen (wenn passend)
- Authentisch und unkompliziert

FORMULIERUNGEN:
✓ "Also, kurz gesagt..."
✓ "Das Coole daran ist..."
✓ "Macht total Sinn, oder?"
✓ "Ich erklaer's mal ganz einfach..."
✓ "Lass uns mal schauen..."

TECHNIKEN:
- Fuellwoerter sind okay: "also", "quasi", "sozusagen"
- Direkte Ansprache: "du", "ihr", "wir"
- Umgangssprache erlaubt
- Kompliziertes vereinfachen

BEISPIEL:
"Okay, also das hier ist eigentlich ganz simpel. Im Grunde geht's darum, dass wir drei Sachen machen muessen. Erstens... na ja, schaut selbst, steht alles auf der Folie. Aber der wichtigste Punkt ist echt Nummer zwei."
"""
}


def generate_intelligent_script(
    slides_data: List[Dict[str, Any]],
    style: str = "dialog",
    speaker_style: str = "sachlich",
    progress_callback: Optional[callable] = None
) -> List[Dict[str, Any]]:
    """
    Generate a podcast script using a multi-phase intelligent approach.

    This is the main entry point that orchestrates:
    1. Understanding the presentation
    2. Planning the podcast structure
    3. Writing the actual script

    Args:
        slides_data: Extracted slide content with images
        style: "dialog" (two speakers) or "monolog" (narrator)
        speaker_style: Tone of voice
        progress_callback: Optional callback(percent, stage)

    Returns:
        List of script segments ready for TTS
    """
    if not slides_data:
        return []

    client = ollama.Client(host=OLLAMA_CONFIG["host"])

    # Phase 1: Understand the presentation (20%)
    if progress_callback:
        progress_callback(5, "Praesentation wird analysiert...")

    understanding = _phase1_understand_presentation(client, slides_data)
    print(f"[Script] Understanding: {understanding.get('main_topic', 'Unknown')}")

    if progress_callback:
        progress_callback(20, "Podcast-Struktur wird geplant...")

    # Phase 2: Plan the podcast (40%)
    plan = _phase2_plan_podcast(client, slides_data, understanding, style, speaker_style)
    print(f"[Script] Plan: {len(plan.get('sections', []))} sections")

    if progress_callback:
        progress_callback(40, "Script wird geschrieben...")

    # Phase 3: Write the script (100%)
    segments = _phase3_write_script(client, slides_data, understanding, plan, style, speaker_style, progress_callback)

    if progress_callback:
        progress_callback(100, "Script fertig")

    return segments


def _phase1_understand_presentation(
    client: ollama.Client,
    slides_data: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Phase 1: Deep understanding of the entire presentation.

    Ollama analyzes ALL slides at once to understand:
    - What is this presentation about?
    - What are the key messages?
    - What is the logical structure?
    - What are the most important points?
    """
    # Build complete presentation text
    full_content = _build_full_presentation_text(slides_data)

    prompt = f"""Du bist ein Experte fuer Praesentationsanalyse. Analysiere diese PowerPoint-Praesentation gruendlich.

WICHTIG: Basiere deine Analyse NUR auf dem, was in den Folien steht. Erfinde NICHTS dazu.

=== PRAESENTATION ({len(slides_data)} Folien) ===
{full_content}
=== ENDE PRAESENTATION ===

Analysiere und antworte als JSON:

{{
  "main_topic": "Das Hauptthema in einem Satz",
  "target_audience": "Fuer wen ist diese Praesentation gedacht?",
  "key_messages": [
    "Kernbotschaft 1",
    "Kernbotschaft 2",
    "Kernbotschaft 3"
  ],
  "structure": {{
    "intro_slides": [1],
    "main_content_slides": [2, 3, 4, 5],
    "conclusion_slides": [6]
  }},
  "important_details": [
    "Wichtiges Detail das erwaehnt werden muss",
    "Noch ein wichtiges Detail"
  ],
  "technical_terms": [
    {{"term": "Fachbegriff", "explanation": "Was bedeutet das?"}}
  ]
}}

Deine Analyse (nur JSON, keine Erklaerungen):"""

    try:
        result_text = _ollama_generate(prompt, temperature=0.3, num_predict=2000).strip()

        # Parse JSON
        json_start = result_text.find("{")
        json_end = result_text.rfind("}") + 1
        if json_start >= 0 and json_end > json_start:
            return json.loads(result_text[json_start:json_end])

    except Exception as e:
        print(f"[Script] Phase 1 error: {e}")

    # Fallback
    return {
        "main_topic": slides_data[0].get("title", "Praesentation") if slides_data else "Praesentation",
        "key_messages": [],
        "structure": {"intro_slides": [1], "main_content_slides": list(range(2, len(slides_data))), "conclusion_slides": [len(slides_data)]},
        "important_details": [],
        "technical_terms": []
    }


def _phase2_plan_podcast(
    client: ollama.Client,
    slides_data: List[Dict[str, Any]],
    understanding: Dict[str, Any],
    style: str,
    speaker_style: str
) -> Dict[str, Any]:
    """
    Phase 2: Plan the podcast dramaturgy.

    Based on the understanding, create a plan for the podcast:
    - How to structure the podcast
    - Which slides to combine/summarize
    - What to emphasize
    - How to create a compelling narrative
    """
    style_desc = SPEAKER_STYLE_DESCRIPTIONS.get(speaker_style, SPEAKER_STYLE_DESCRIPTIONS["sachlich"])
    format_desc = "Dialog zwischen MARC (Moderator, maennlich) und TINA (Expertin, weiblich)" if style == "dialog" else "Erzaehlung durch einen SPRECHER"

    prompt = f"""Du planst einen Podcast basierend auf einer Praesentation.

=== VERSTAENDNIS DER PRAESENTATION ===
Hauptthema: {understanding.get('main_topic', 'Unbekannt')}
Kernbotschaften: {json.dumps(understanding.get('key_messages', []), ensure_ascii=False)}
Wichtige Details: {json.dumps(understanding.get('important_details', []), ensure_ascii=False)}
Struktur: {json.dumps(understanding.get('structure', {}), ensure_ascii=False)}

=== PODCAST-FORMAT ===
Format: {format_desc}
Stil: {style_desc}
Anzahl Folien: {len(slides_data)}

=== AUFGABE ===
Erstelle einen Podcast-Plan. Der Podcast soll:
1. Die Kernbotschaften klar vermitteln
2. Einen roten Faden haben
3. Fuer Zuhoerer ohne Sicht auf die Folien verstaendlich sein
4. Nicht einfach Folie fuer Folie abarbeiten, sondern intelligent zusammenfassen

Antworte als JSON:

{{
  "podcast_title": "Titel des Podcasts",
  "estimated_duration_minutes": 5,
  "sections": [
    {{
      "name": "Einfuehrung",
      "covers_slides": [1],
      "purpose": "Thema vorstellen, Hoerer abholem",
      "key_points": ["Was soll vermittelt werden"]
    }},
    {{
      "name": "Hauptteil: [Thema]",
      "covers_slides": [2, 3, 4],
      "purpose": "Kerninhalt erklaeren",
      "key_points": ["Punkt 1", "Punkt 2"]
    }},
    {{
      "name": "Fazit",
      "covers_slides": [5, 6],
      "purpose": "Zusammenfassen, Ausblick geben",
      "key_points": ["Kernbotschaft wiederholen"]
    }}
  ],
  "narrative_notes": "Tipps fuer den Erzaehlfluss"
}}

Dein Plan (nur JSON):"""

    try:
        result_text = _ollama_generate(prompt, temperature=0.4, num_predict=2000).strip()

        json_start = result_text.find("{")
        json_end = result_text.rfind("}") + 1
        if json_start >= 0 and json_end > json_start:
            return json.loads(result_text[json_start:json_end])

    except Exception as e:
        print(f"[Script] Phase 2 error: {e}")

    # Fallback: Simple sequential plan
    return {
        "podcast_title": understanding.get("main_topic", "Podcast"),
        "sections": [
            {"name": "Hauptteil", "covers_slides": list(range(1, len(slides_data) + 1)), "purpose": "Inhalt vermitteln", "key_points": understanding.get("key_messages", [])}
        ]
    }


def _phase3_write_script(
    client: ollama.Client,
    slides_data: List[Dict[str, Any]],
    understanding: Dict[str, Any],
    plan: Dict[str, Any],
    style: str,
    speaker_style: str,
    progress_callback: Optional[callable] = None
) -> List[Dict[str, Any]]:
    """
    Phase 3: Write the actual script section by section.

    Each section is written with:
    - Full knowledge of the presentation
    - The planned structure in mind
    - Actual slide content for that section
    """
    style_desc = SPEAKER_STYLE_DESCRIPTIONS.get(speaker_style, SPEAKER_STYLE_DESCRIPTIONS["sachlich"])

    if style == "dialog":
        format_instruction = """FORMAT: Dialog zwischen zwei Sprechern
- MARC (Moderator, maennlich): Leitet ein, stellt Fragen, fasst zusammen. Stellt sich am Anfang als "Marc" vor.
- TINA (Expertin, weiblich): Erklaert Inhalte, gibt Details, beantwortet Fragen. Stellt sich am Anfang als "Tina" vor.

WICHTIG: Am Anfang des Podcasts stellen sich beide mit Namen vor!

Schreibe EXAKT so:
MARC: [Text]
TINA: [Text]
MARC: [Text]
..."""
    else:
        format_instruction = """FORMAT: Einzelsprecher-Erzaehlung
- SPRECHER: Erzaehlt alles in natuerlichem Fluss

Schreibe EXAKT so:
SPRECHER: [Text]
SPRECHER: [Text]
..."""

    all_segments = []
    sections = plan.get("sections", [])

    def _build_section_prompt(section_idx: int, section: Dict[str, Any]) -> str:
        # Get slide content for this section
        slide_nums = section.get("covers_slides", [])
        section_slides_content = _get_slides_content(slides_data, slide_nums)

        # Determine position for intro/outro handling
        is_first = section_idx == 0
        is_last = section_idx == len(sections) - 1

        position_hint = ""
        if is_first:
            if style == "dialog":
                position_hint = "Dies ist der ANFANG des Podcasts. Marc begruesst die Zuhoerer und stellt sich und Tina vor. Beide stellen sich kurz mit Namen vor, z.B. 'Hallo, ich bin Marc' und 'Hi, ich bin Tina'. Dann fuehren sie ins Thema ein."
            else:
                position_hint = "Dies ist der ANFANG des Podcasts. Beginne mit einer freundlichen Begruessung und fuehre ins Thema ein."
        elif is_last:
            position_hint = "Dies ist das ENDE des Podcasts. Fasse zusammen und verabschiede dich."
        else:
            position_hint = "Dies ist ein MITTELTEIL. Schaffe einen natuerlichen Uebergang vom vorherigen Abschnitt."

        # Keep turns low: this is the biggest TTS runtime lever.
        turn_rule = (
            "5. Schreibe NUR 2-4 Sprechbeitraege fuer diesen Abschnitt (wenige, aber gehaltvolle Turns)\n"
            "6. Jede Zeile maximal 2 Saetze. Keine Absatzumbrueche innerhalb einer Sprecherzeile.\n"
            "7. Schreibe KEINE Buehnenanweisungen und keine Klammern wie (lacht).\n"
        )

        return f"""Du schreibst einen Podcast-Abschnitt.

=== WICHTIG: STIL-VORGABE (UNBEDINGT EINHALTEN!) ===
{style_desc}

=== GESAMTKONTEXT ===
Thema: {understanding.get('main_topic', 'Unbekannt')}
Kernbotschaften: {json.dumps(understanding.get('key_messages', []), ensure_ascii=False)}
Podcast-Titel: {plan.get('podcast_title', 'Podcast')}

=== AKTUELLER ABSCHNITT ===
Name: {section.get('name', 'Abschnitt')}
Zweck: {section.get('purpose', '')}
Zu vermitteln: {json.dumps(section.get('key_points', []), ensure_ascii=False)}

=== FOLIENINHALTE FUER DIESEN ABSCHNITT ===
{section_slides_content}

=== POSITION ===
{position_hint}

{format_instruction}

=== REGELN ===
1. NUR Inhalte aus den Folien verwenden - NICHTS erfinden!
2. Bei Bildern: Beschreibe was zu sehen ist (steht in den Folieninhalten)
3. STIL-VORGABE STRIKT EINHALTEN! (siehe oben)
4. Halte dich an den geplanten Zweck dieses Abschnitts
{turn_rule}

ERINNERUNG: Schreibe im vorgegebenen STIL! Nutze die Beispiel-Formulierungen!

Schreibe jetzt den Podcast-Abschnitt:"""

    def _generate_one(section_idx: int, section: Dict[str, Any]) -> tuple[int, List[Dict[str, Any]]]:
        prompt = _build_section_prompt(section_idx, section)
        try:
            script_text = _ollama_generate(prompt, temperature=0.7, num_predict=1500)
            segments = _parse_script_output(script_text, style)
            return section_idx, segments or []
        except Exception as e:
            print(f"[Script] Phase 3 error for section {section_idx}: {e}")
            if style == "dialog":
                return section_idx, [{"speaker": "host", "text": f"Kommen wir zu {section.get('name', 'diesem Abschnitt')}."}]
            return section_idx, [{"speaker": "narrator", "text": f"Kommen wir zu {section.get('name', 'diesem Abschnitt')}."}]

    # Parallelize Phase 3 optionally. Keep conservative default to avoid overloading Ollama.
    max_workers = min(SCRIPT_MAX_WORKERS, max(1, len(sections)))
    if max_workers <= 1 or len(sections) <= 1:
        for section_idx, section in enumerate(sections):
            if progress_callback:
                progress = 40 + int(60 * (section_idx / max(len(sections), 1)))
                progress_callback(progress, f"Schreibe: {section.get('name', 'Abschnitt')}")
            _, segs = _generate_one(section_idx, section)
            all_segments.extend(segs)
        return all_segments

    results: List[List[Dict[str, Any]]] = [[] for _ in range(len(sections))]
    completed = 0
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(_generate_one, idx, sec): idx for idx, sec in enumerate(sections)}
        for future in as_completed(futures):
            idx, segs = future.result()
            results[idx] = segs
            completed += 1
            if progress_callback:
                progress = 40 + int(60 * (completed / max(len(sections), 1)))
                progress_callback(progress, f"Schreibe: {completed}/{len(sections)} Abschnitte")

    for segs in results:
        all_segments.extend(segs)

    return all_segments


def _build_full_presentation_text(slides_data: List[Dict[str, Any]]) -> str:
    """Build a complete text representation of all slides."""
    parts = []

    for slide in slides_data:
        slide_num = slide.get("slide_number", "?")
        parts.append(f"--- FOLIE {slide_num} ---")

        if slide.get("title"):
            parts.append(f"Titel: {_trim_chars(slide['title'], 140)}")

        content = slide.get("content", [])
        if content:
            parts.append("Inhalt:")
            # Limit total words per slide to keep Ollama context stable.
            items = [str(i).strip() for i in content if str(i).strip()][:SCRIPT_MAX_ITEMS_PER_SLIDE]
            collapsed = _trim_words(" ".join(items), SCRIPT_MAX_WORDS_PER_SLIDE)
            if collapsed:
                # Re-split into readable bullets.
                for item in items[: min(len(items), 6)]:
                    parts.append(f"  - {_trim_chars(item, 240)}")
                if len(" ".join(items).split()) > SCRIPT_MAX_WORDS_PER_SLIDE:
                    parts.append(f"  - {_trim_chars(collapsed, 240)}")

        # Include image descriptions
        images = slide.get("images", [])
        for i, img in enumerate(images[:SCRIPT_MAX_IMAGES_PER_SLIDE]):
            desc = img.get("description", "")
            if desc:
                parts.append(f"Bild {i+1}: {_trim_chars(desc, 260)}")
            else:
                # Keep silent to avoid noise when VLM skips icons.
                pass

        if slide.get("speaker_notes"):
            notes = _trim_words(slide["speaker_notes"], 120)
            if notes:
                parts.append(f"Notizen: {notes}")

        parts.append("")

    return "\n".join(parts)


def _get_slides_content(slides_data: List[Dict[str, Any]], slide_nums: List[int]) -> str:
    """Get content for specific slide numbers."""
    parts = []

    for slide in slides_data:
        slide_num = slide.get("slide_number", 0)
        if slide_num in slide_nums:
            parts.append(f"--- FOLIE {slide_num} ---")

            if slide.get("title"):
                parts.append(f"Titel: {_trim_chars(slide['title'], 140)}")

            content = slide.get("content", [])
            if content:
                items = [str(i).strip() for i in content if str(i).strip()][:SCRIPT_MAX_ITEMS_PER_SLIDE]
                for item in items[: min(len(items), 6)]:
                    parts.append(f"  - {_trim_chars(item, 220)}")

            images = slide.get("images", [])
            for i, img in enumerate(images[:SCRIPT_MAX_IMAGES_PER_SLIDE]):
                desc = img.get("description", "")
                if desc:
                    parts.append(f"Bild: {_trim_chars(desc, 240)}")

            parts.append("")

    return "\n".join(parts) if parts else "Keine Folieninhalte verfuegbar."


def _parse_script_output(script_text: str, style: str) -> List[Dict[str, Any]]:
    """Parse the script output into segments."""
    segments = []
    lines = script_text.strip().split("\n")

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Dialog format - Support both new (MARC/TINA) and legacy (MODERATOR/EXPERTE)
        if line.startswith("MARC:") or line.startswith("MODERATOR:"):
            text = line.replace("MARC:", "").replace("MODERATOR:", "").strip()
            if text:
                segments.append({"speaker": "host", "text": text})
        elif line.startswith("TINA:") or line.startswith("INA:") or line.startswith("EXPERTE:"):
            text = line.replace("TINA:", "").replace("INA:", "").replace("EXPERTE:", "").strip()
            if text:
                segments.append({"speaker": "expert", "text": text})
        # Monolog format
        elif line.startswith("SPRECHER:"):
            text = line.replace("SPRECHER:", "").strip()
            if text:
                segments.append({"speaker": "narrator", "text": text})
        # Handle variations
        elif ":" in line:
            parts = line.split(":", 1)
            if len(parts) == 2:
                speaker_hint = parts[0].lower().strip()
                text = parts[1].strip()
                if text and len(text) > 5:
                    if "moderator" in speaker_hint or "host" in speaker_hint or "marc" in speaker_hint:
                        segments.append({"speaker": "host", "text": text})
                    elif "experte" in speaker_hint or "expert" in speaker_hint or "tina" in speaker_hint or "ina" in speaker_hint:
                        segments.append({"speaker": "expert", "text": text})
                    elif "sprecher" in speaker_hint or "narrator" in speaker_hint:
                        segments.append({"speaker": "narrator", "text": text})
                    elif style == "dialog":
                        # Alternate if unclear
                        last_speaker = segments[-1]["speaker"] if segments else "expert"
                        next_speaker = "host" if last_speaker == "expert" else "expert"
                        segments.append({"speaker": next_speaker, "text": text})
                    else:
                        segments.append({"speaker": "narrator", "text": text})

    return segments


# Legacy functions for backwards compatibility
def generate_dialog_script(
    slides_data: List[Dict[str, Any]],
    title: str = "Praesentation",
    speaker_style: str = "sachlich"
) -> List[Dict[str, Any]]:
    """Generate dialog script - wrapper for new intelligent approach."""
    return generate_intelligent_script(slides_data, style="dialog", speaker_style=speaker_style)


def generate_monolog_script(
    slides_data: List[Dict[str, Any]],
    title: str = "Praesentation",
    speaker_style: str = "sachlich"
) -> List[Dict[str, Any]]:
    """Generate monolog script - wrapper for new intelligent approach."""
    return generate_intelligent_script(slides_data, style="monolog", speaker_style=speaker_style)
