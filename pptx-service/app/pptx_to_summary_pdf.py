#!/usr/bin/env python3
"""
pptx_to_summary_pdf.py
Generates an accessible PDF summary of a PPTX presentation.

Takes the modelpack (with presentation context) and alt-texts,
sends content to LLM for intelligent summarization per slide,
then generates a clean, accessible PDF document.

Usage:
  python pptx_to_summary_pdf.py modelpack.json alttexts.json -o summary.pdf
"""

import argparse
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434")
LLM_MODEL = os.getenv("LLM_MODEL", "qwen2.5:14b")

SUMMARY_SYSTEM_PROMPT = """Du bist ein Experte für Barrierefreiheit und fasst Präsentationsfolien für blinde Menschen zusammen.

Für jede Folie erstellst du eine KURZE, PRÄGNANTE Zusammenfassung (2-4 Sätze), die:
1. Den Hauptinhalt der Folie erklärt
2. Visuelle Elemente beschreibt (basierend auf den Alt-Texten)
3. Die Bedeutung im Kontext der Gesamtpräsentation einordnet

WICHTIG:
- Schreibe in vollständigen, flüssigen Sätzen
- Vermeide Aufzählungen - schreibe Fließtext
- Erkläre WAS auf der Folie ist und WARUM es wichtig ist
- Sei prägnant aber informativ

Antworte NUR mit JSON:
{
  "summaries": [
    {
      "slide_index": 0,
      "title": "Folientitel",
      "summary": "Die Zusammenfassung in 2-4 Sätzen..."
    }
  ]
}
"""


def load_json(path: str) -> Dict[str, Any]:
    """Load JSON file."""
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def detect_visual_structures(alttexts: List[str]) -> List[str]:
    """
    Detect visual structures from alt-texts and return human-readable descriptions.

    Args:
        alttexts: List of alt-text strings for the slide

    Returns:
        List of structure descriptions (e.g., ["einen Zeitstrahl", "eine Tabelle"])
    """
    structures = []
    seen = set()

    # Mapping from prefix patterns to German descriptions
    structure_patterns = [
        ("Zeitstrahl", "einen Zeitstrahl"),
        ("Timeline", "einen Zeitstrahl"),
        ("Tabelle", "eine Tabelle"),
        ("Table", "eine Tabelle"),
        ("Diagramm", "ein Diagramm"),
        ("Diagram", "ein Diagramm"),
        ("Grafik", "eine Grafik"),
        ("Chart", "ein Diagramm"),
        ("Balkendiagramm", "ein Balkendiagramm"),
        ("Kreisdiagramm", "ein Kreisdiagramm"),
        ("Liniendiagramm", "ein Liniendiagramm"),
        ("Organigramm", "ein Organigramm"),
        ("Flowchart", "ein Flussdiagramm"),
        ("Flussdiagramm", "ein Flussdiagramm"),
        ("Infografik", "eine Infografik"),
        ("Schaubild", "ein Schaubild"),
        ("Prozessübersicht", "eine Prozessübersicht"),
        ("Meilenstein", "Meilensteine"),
    ]

    for alt in alttexts:
        if not alt:
            continue

        for prefix, description in structure_patterns:
            if alt.startswith(prefix) and description not in seen:
                structures.append(description)
                seen.add(description)
                break

    return structures


def format_visual_hint(structures: List[str]) -> str:
    """
    Format a list of visual structures into a readable sentence.

    Args:
        structures: List of structure descriptions

    Returns:
        Formatted sentence like "Diese Folie enthält einen Zeitstrahl und eine Tabelle."
    """
    if not structures:
        return ""

    if len(structures) == 1:
        return f"Diese Folie enthält {structures[0]}."
    elif len(structures) == 2:
        return f"Diese Folie enthält {structures[0]} und {structures[1]}."
    else:
        return f"Diese Folie enthält {', '.join(structures[:-1])} und {structures[-1]}."


def build_summary_prompt(modelpack: Dict[str, Any], alttexts: Dict[str, str]) -> str:
    """Build a prompt for the LLM to summarize all slides."""
    slides_info = []

    for slide in modelpack.get("slides", []):
        slide_idx = slide.get("slide_index", 0)
        elements = slide.get("elements_in_reading_order", [])

        # Collect all text and alt-texts for this slide
        slide_content = []
        slide_alttexts = []

        for elem in elements:
            shape_id = elem.get("shape_id", "")
            text = elem.get("text", "").strip()
            alt = alttexts.get(shape_id, "")

            if text:
                slide_content.append(text)
            if alt:
                slide_alttexts.append(alt)

        slides_info.append({
            "slide_index": slide_idx,
            "content": "\n".join(slide_content[:500]),  # Limit content length
            "visual_descriptions": slide_alttexts[:10],  # Limit number of alt-texts
        })

    prompt = f"""Hier ist der Inhalt einer Präsentation. Erstelle für jede Folie eine Zusammenfassung.

Präsentation: {modelpack.get("presentation_title", "Unbekannt")}

Folien:
{json.dumps(slides_info, ensure_ascii=False, indent=2)}

Erstelle jetzt eine Zusammenfassung für jede Folie."""

    return prompt


async def generate_summaries_async(
    modelpack: Dict[str, Any],
    alttexts: Dict[str, str]
) -> List[Dict[str, Any]]:
    """Generate slide summaries using LLM asynchronously."""
    prompt = build_summary_prompt(modelpack, alttexts)

    async with httpx.AsyncClient(timeout=300.0) as client:
        response = await client.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": LLM_MODEL,
                "prompt": prompt,
                "system": SUMMARY_SYSTEM_PROMPT,
                "stream": False,
                "format": "json",
                "options": {
                    "num_ctx": 16384,
                },
            },
        )
        response.raise_for_status()

    result = response.json()
    llm_output = result.get("response", "{}")

    try:
        parsed = json.loads(llm_output)
        return parsed.get("summaries", [])
    except json.JSONDecodeError:
        return []


def generate_summaries_sync(
    modelpack: Dict[str, Any],
    alttexts: Dict[str, str]
) -> List[Dict[str, Any]]:
    """Generate slide summaries using LLM synchronously."""
    import asyncio
    return asyncio.run(generate_summaries_async(modelpack, alttexts))


def generate_summary_html(
    summaries: List[Dict[str, Any]],
    presentation_title: str,
    language: str = "de"
) -> str:
    """Generate HTML document from summaries for PDF conversion."""
    import html as html_module

    def escape(text: str) -> str:
        return html_module.escape(str(text)) if text else ""

    css = """
    @page {
      size: A4;
      margin: 2.5cm 2cm;
      @bottom-center {
        content: "Seite " counter(page) " von " counter(pages);
        font-size: 10pt;
        color: #666;
      }
    }

    body {
      font-family: 'DejaVu Sans', 'Liberation Sans', Arial, sans-serif;
      font-size: 12pt;
      line-height: 1.6;
      color: #1a1a1a;
    }

    h1 {
      font-size: 20pt;
      color: #0a0a0a;
      border-bottom: 2pt solid #333;
      padding-bottom: 8pt;
      margin-bottom: 20pt;
    }

    .intro {
      background: #f5f5f5;
      padding: 12pt;
      border-radius: 4pt;
      margin-bottom: 20pt;
      font-style: italic;
    }

    .slide {
      margin-bottom: 24pt;
      page-break-inside: avoid;
    }

    .slide-header {
      display: flex;
      align-items: baseline;
      gap: 8pt;
      margin-bottom: 8pt;
    }

    .slide-number {
      background: #333;
      color: white;
      padding: 2pt 8pt;
      border-radius: 3pt;
      font-size: 10pt;
      font-weight: bold;
    }

    .slide-title {
      font-size: 14pt;
      font-weight: bold;
      color: #1a1a1a;
      margin: 0;
    }

    .slide-summary {
      margin-left: 0;
      padding: 12pt;
      background: #fafafa;
      border-left: 3pt solid #4a90d9;
      border-radius: 0 4pt 4pt 0;
    }

    .footer {
      margin-top: 40pt;
      padding-top: 12pt;
      border-top: 1pt solid #ccc;
      font-size: 10pt;
      color: #666;
    }

    .visual-hint {
      background: #e3f2fd;
      border-left: 3pt solid #2196f3;
      padding: 8pt 12pt;
      margin-bottom: 8pt;
      border-radius: 0 4pt 4pt 0;
      font-style: italic;
      color: #1565c0;
      font-size: 11pt;
    }
    """

    html_parts = [f"""<!DOCTYPE html>
<html lang="{language}">
<head>
  <meta charset="UTF-8">
  <title>{escape(presentation_title)} - Barrierefreie Zusammenfassung</title>
  <style>{css}</style>
</head>
<body>
  <main>
    <h1>{escape(presentation_title)}</h1>

    <div class="intro">
      Diese Zusammenfassung wurde automatisch erstellt, um den Inhalt der Präsentation
      für Screenreader-Nutzer zugänglich zu machen. Jede Folie wird in wenigen Sätzen
      zusammengefasst, einschließlich der Beschreibung visueller Elemente.
    </div>
"""]

    for summary in summaries:
        slide_idx = summary.get("slide_index", 0)
        title = summary.get("title", f"Folie {slide_idx + 1}")
        text = summary.get("summary", "Keine Zusammenfassung verfügbar.")
        visual_hint = summary.get("visual_hint", "")

        # Build visual hint HTML if present
        hint_html = ""
        if visual_hint:
            hint_html = f'\n      <p class="visual-hint">{escape(visual_hint)}</p>'

        html_parts.append(f"""
    <article class="slide" aria-label="Folie {slide_idx + 1}">
      <header class="slide-header">
        <span class="slide-number">{slide_idx + 1}</span>
        <h2 class="slide-title">{escape(title)}</h2>
      </header>{hint_html}
      <div class="slide-summary">
        <p>{escape(text)}</p>
      </div>
    </article>
""")

    html_parts.append("""
    <footer class="footer">
      <p>Erstellt mit VoxDrop - Barrierefreie Präsentationszusammenfassung</p>
    </footer>
  </main>
</body>
</html>
""")

    return "".join(html_parts)


def generate_summary_pdf(
    modelpack: Dict[str, Any],
    alttexts: Dict[str, str],
    output_path: str,
    presentation_title: Optional[str] = None,
    language: str = "de"
) -> Dict[str, Any]:
    """
    Generate accessible PDF summary from PPTX data.

    Args:
        modelpack: The modelpack JSON with slides and elements
        alttexts: Dictionary mapping shape_id to alt-text descriptions
        output_path: Path for the output PDF
        presentation_title: Optional title override
        language: Document language

    Returns:
        Statistics about the generation
    """
    from weasyprint import HTML, CSS

    # Get presentation title
    title = presentation_title or modelpack.get("presentation_title", "Präsentation")
    if not title or title == "Präsentation":
        slides = modelpack.get("slides", [])
        if slides:
            for elem in slides[0].get("elements_in_reading_order", []):
                if elem.get("text"):
                    title = elem["text"][:100]
                    break

    # Generate summaries with LLM
    summaries = generate_summaries_sync(modelpack, alttexts)

    # If LLM failed, create basic summaries from content
    if not summaries:
        summaries = []
        for slide in modelpack.get("slides", []):
            slide_idx = slide.get("slide_index", 0)
            elements = slide.get("elements_in_reading_order", [])

            # Get title and content
            slide_title = f"Folie {slide_idx + 1}"
            content_parts = []

            for elem in elements:
                text = elem.get("text", "").strip()
                if text:
                    if not content_parts:  # First text is often the title
                        slide_title = text[:80]
                    else:
                        content_parts.append(text)

            summary_text = " ".join(content_parts[:3])[:300] if content_parts else "Keine Inhalte verfügbar."

            summaries.append({
                "slide_index": slide_idx,
                "title": slide_title,
                "summary": summary_text
            })

    # Enrich summaries with visual structure hints
    for slide in modelpack.get("slides", []):
        slide_idx = slide.get("slide_index", 0)
        elements = slide.get("elements_in_reading_order", [])

        # Collect alt-texts for this slide
        slide_alttexts = []
        for elem in elements:
            shape_id = elem.get("shape_id", "")
            alt = alttexts.get(shape_id, "")
            if alt:
                slide_alttexts.append(alt)

        # Detect visual structures
        visual_structures = detect_visual_structures(slide_alttexts)

        # Find matching summary and add visual hint
        if visual_structures:
            hint = format_visual_hint(visual_structures)
            for summary in summaries:
                if summary.get("slide_index") == slide_idx:
                    summary["visual_hint"] = hint
                    break

    # Generate HTML
    html_content = generate_summary_html(summaries, title, language)

    # Convert to PDF
    html_doc = HTML(string=html_content)
    html_doc.write_pdf(output_path)

    return {
        "slides_summarized": len(summaries),
        "output_path": output_path,
        "title": title
    }


async def generate_summary_pdf_async(
    modelpack: Dict[str, Any],
    alttexts: Dict[str, str],
    output_path: str,
    presentation_title: Optional[str] = None,
    language: str = "de"
) -> Dict[str, Any]:
    """Async version of generate_summary_pdf."""
    from weasyprint import HTML

    # Get presentation title
    title = presentation_title or modelpack.get("presentation_title", "Präsentation")
    if not title or title == "Präsentation":
        slides = modelpack.get("slides", [])
        if slides:
            for elem in slides[0].get("elements_in_reading_order", []):
                if elem.get("text"):
                    title = elem["text"][:100]
                    break

    # Generate summaries with LLM
    summaries = await generate_summaries_async(modelpack, alttexts)

    # Fallback if LLM failed
    if not summaries:
        summaries = []
        for slide in modelpack.get("slides", []):
            slide_idx = slide.get("slide_index", 0)
            elements = slide.get("elements_in_reading_order", [])

            slide_title = f"Folie {slide_idx + 1}"
            content_parts = []

            for elem in elements:
                text = elem.get("text", "").strip()
                if text:
                    if not content_parts:
                        slide_title = text[:80]
                    else:
                        content_parts.append(text)

            summary_text = " ".join(content_parts[:3])[:300] if content_parts else "Keine Inhalte."
            summaries.append({
                "slide_index": slide_idx,
                "title": slide_title,
                "summary": summary_text
            })

    # Enrich summaries with visual structure hints
    for slide in modelpack.get("slides", []):
        slide_idx = slide.get("slide_index", 0)
        elements = slide.get("elements_in_reading_order", [])

        # Collect alt-texts for this slide
        slide_alttexts = []
        for elem in elements:
            shape_id = elem.get("shape_id", "")
            alt = alttexts.get(shape_id, "")
            if alt:
                slide_alttexts.append(alt)

        # Detect visual structures
        visual_structures = detect_visual_structures(slide_alttexts)

        # Find matching summary and add visual hint
        if visual_structures:
            hint = format_visual_hint(visual_structures)
            for summary in summaries:
                if summary.get("slide_index") == slide_idx:
                    summary["visual_hint"] = hint
                    break

    # Generate HTML and PDF
    html_content = generate_summary_html(summaries, title, language)
    html_doc = HTML(string=html_content)
    html_doc.write_pdf(output_path)

    return {
        "slides_summarized": len(summaries),
        "output_path": output_path,
        "title": title
    }


def main():
    ap = argparse.ArgumentParser(description="Generate accessible PDF summary from PPTX")
    ap.add_argument("modelpack_json", help="Path to modelpack.json")
    ap.add_argument("alttexts_json", help="Path to alttexts.json")
    ap.add_argument("-o", "--out", default=None, help="Output PDF path")
    ap.add_argument("--title", default=None, help="Presentation title override")
    ap.add_argument("--lang", default="de", help="Document language (default: de)")
    ap.add_argument("--ollama-url", default=None, help="Ollama URL")
    ap.add_argument("--model", default=None, help="LLM model name")

    args = ap.parse_args()

    global OLLAMA_URL, LLM_MODEL
    if args.ollama_url:
        OLLAMA_URL = args.ollama_url
    if args.model:
        LLM_MODEL = args.model

    # Load data
    modelpack = load_json(args.modelpack_json)
    alttexts_data = load_json(args.alttexts_json)
    alttexts = alttexts_data.get("alttexts", alttexts_data)

    # Generate PDF
    out_path = args.out or args.modelpack_json.replace(".json", "_summary.pdf")
    stats = generate_summary_pdf(
        modelpack=modelpack,
        alttexts=alttexts,
        output_path=out_path,
        presentation_title=args.title,
        language=args.lang
    )

    print(f"Generated summary PDF with {stats['slides_summarized']} slides")
    print(f"Output: {stats['output_path']}")


if __name__ == "__main__":
    main()
