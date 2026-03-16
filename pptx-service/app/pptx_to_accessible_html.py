#!/usr/bin/env python3
"""
pptx_to_accessible_html.py
Generates fully accessible HTML from PPTX pipeline data.

Implements the 'Summary-First' Tag-Tree strategy for optimal
Screenreader navigation:
1. Each slide wrapped in <section aria-labelledby="...">
2. First element: Summary heading + narrative summary
3. Semantic mapping: titles→h2, lists→ul/li, tables→proper table markup, images→figure/figcaption

Usage:
  python pptx_to_accessible_html.py modelpack.json alttexts.json -o output.html
"""

import argparse
import html
import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


def load_json(path: str) -> Dict[str, Any]:
    """Load JSON file."""
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def escape_html(text: str) -> str:
    """Escape HTML special characters and convert umlauts."""
    if not text:
        return ""
    # First convert umlauts, then escape HTML
    return html.escape(convert_umlauts(str(text)))


def convert_umlauts(text: str) -> str:
    """
    Convert German umlauts to ASCII equivalents.

    ä → ae, ö → oe, ü → ue, ß → ss
    Also handles uppercase variants.
    """
    if not text:
        return ""

    replacements = {
        "ä": "ae",
        "ö": "oe",
        "ü": "ue",
        "ß": "ss",
        "Ä": "Ae",
        "Ö": "Oe",
        "Ü": "Ue",
    }

    result = text
    for umlaut, replacement in replacements.items():
        result = result.replace(umlaut, replacement)

    return result


def cleanup_llm_artifacts(text: str) -> str:
    """
    Remove technical LLM artifacts from generated text.

    Common artifacts include special tokens, markdown formatting,
    and other model-specific markers that shouldn't appear in output.
    """
    if not text:
        return ""

    # Known LLM markers to remove
    artifacts = [
        "<|end|>",
        "<|im_end|>",
        "<|im_start|>",
        "<|assistant|>",
        "<|user|>",
        "<|system|>",
        "[/INST]",
        "[INST]",
        "<<SYS>>",
        "<</SYS>>",
        "```",
        "---",
        "<end_of_turn>",
        "<start_of_turn>",
    ]

    result = text
    for artifact in artifacts:
        result = result.replace(artifact, "")

    # Remove any remaining angle-bracket tokens like <|...|>
    result = re.sub(r'<\|[^|]+\|>', '', result)

    # Normalize multiple newlines/spaces
    result = re.sub(r'\n{3,}', '\n\n', result)
    result = re.sub(r' {2,}', ' ', result)

    # Convert umlauts to ASCII (ä→ae, ö→oe, ü→ue, ß→ss)
    result = convert_umlauts(result)

    return result.strip()


def detect_list_items(text: str) -> Optional[List[str]]:
    """
    Detect if text contains a bullet list and return items.
    Returns None if not a list.
    """
    if not text:
        return None

    lines = text.strip().split('\n')
    if len(lines) < 2:
        return None

    bullet_patterns = [
        r'^[\-\•\*\◦\▪\▸]\s+',  # Common bullets
        r'^\d+[\.\)]\s+',        # Numbered lists
        r'^[a-zA-Z][\.\)]\s+',   # Letter lists
    ]

    list_items = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        is_bullet = any(re.match(p, line) for p in bullet_patterns)
        if is_bullet:
            for p in bullet_patterns:
                line = re.sub(p, '', line)
            list_items.append(line.strip())
        else:
            return None

    return list_items if len(list_items) >= 2 else None


def detect_visual_structures(alttexts: List[str]) -> List[str]:
    """
    Detect visual structures from alt-texts and return human-readable descriptions.
    """
    structures = []
    seen = set()

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
    """Format a list of visual structures into a readable sentence."""
    if not structures:
        return ""
    if len(structures) == 1:
        return f"Diese Folie enthält {structures[0]}."
    elif len(structures) == 2:
        return f"Diese Folie enthält {structures[0]} und {structures[1]}."
    else:
        return f"Diese Folie enthält {', '.join(structures[:-1])} und {structures[-1]}."


def is_title_element(element: Dict[str, Any], slide_idx: int) -> bool:
    """Check if element is likely a slide title."""
    shape_id = element.get("shape_id", "")
    if "title" in shape_id.lower():
        return True
    if shape_id.startswith("Title") or shape_id.startswith("title"):
        return True
    return False


def detect_table_structure(element: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Detect if element is a table and extract structure.
    Returns table data with headers marked.
    """
    # Check if element has table data in IR
    table_data = element.get("table_data")
    if not table_data:
        return None

    rows = table_data.get("rows", [])
    if not rows:
        return None

    # Detect header row (first row with has_header flag or heuristic)
    has_header = table_data.get("has_header", True)  # Default to first row as header

    return {
        "rows": rows,
        "has_header": has_header,
        "col_count": len(rows[0]) if rows else 0,
        "row_count": len(rows),
    }


def generate_css() -> str:
    """Generate accessible CSS styles with Summary-First design."""
    return """
    :root {
      --bg-color: #ffffff;
      --text-color: #1a1a1a;
      --heading-color: #0a0a0a;
      --link-color: #0066cc;
      --border-color: #cccccc;
      --slide-bg: #f8f9fa;
      --summary-bg: #fff8e1;
      --summary-border: #ffc107;
      --alt-text-bg: #e8f4e8;
      --visual-hint-bg: #e3f2fd;
      --visual-hint-border: #2196f3;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg-color: #1a1a1a;
        --text-color: #e0e0e0;
        --heading-color: #ffffff;
        --link-color: #66b3ff;
        --border-color: #444444;
        --slide-bg: #2a2a2a;
        --summary-bg: #3e2723;
        --summary-border: #ffb300;
        --alt-text-bg: #2a3a2a;
        --visual-hint-bg: #1a237e;
        --visual-hint-border: #64b5f6;
      }
    }

    * { box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: var(--text-color);
      background-color: var(--bg-color);
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem;
    }

    h1 {
      color: var(--heading-color);
      font-size: 2rem;
      border-bottom: 3px solid var(--border-color);
      padding-bottom: 0.5rem;
      margin-bottom: 2rem;
    }

    h2 { color: var(--heading-color); font-size: 1.5rem; margin-top: 0; }
    h3 { color: var(--heading-color); font-size: 1.2rem; margin-top: 0; }

    .skip-link {
      position: absolute;
      top: -40px;
      left: 0;
      background: var(--link-color);
      color: white;
      padding: 8px;
      z-index: 100;
      text-decoration: none;
    }
    .skip-link:focus { top: 0; }

    nav[aria-label="Folienübersicht"] {
      background: var(--slide-bg);
      padding: 1rem;
      border-radius: 8px;
      margin-bottom: 2rem;
    }
    nav[aria-label="Folienübersicht"] ol { margin: 0; padding-left: 1.5rem; }
    nav[aria-label="Folienübersicht"] a {
      color: var(--link-color);
      text-decoration: none;
    }
    nav[aria-label="Folienübersicht"] a:hover,
    nav[aria-label="Folienübersicht"] a:focus { text-decoration: underline; }

    /* Summary-First Slide Structure */
    .slide-section {
      background: var(--slide-bg);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 2rem;
      page-break-inside: avoid;
    }

    .slide-summary-header {
      font-size: 1rem;
      color: var(--heading-color);
      margin-bottom: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .slide-number-badge {
      background: var(--text-color);
      color: var(--bg-color);
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-size: 0.8rem;
      font-weight: bold;
    }

    /* Narrative Summary - FIRST ELEMENT for Screenreaders */
    .slide-summary {
      background: var(--summary-bg);
      border-left: 4px solid var(--summary-border);
      padding: 1rem;
      margin-bottom: 1.5rem;
      border-radius: 0 8px 8px 0;
      font-style: italic;
    }

    .visual-hint {
      background: var(--visual-hint-bg);
      border-left: 4px solid var(--visual-hint-border);
      padding: 0.5rem 1rem;
      margin-bottom: 1rem;
      border-radius: 0 4px 4px 0;
      font-size: 0.9rem;
    }

    /* Slide Content */
    .slide-content { margin-bottom: 1rem; }
    .slide-content p { margin: 0.5rem 0; }
    .slide-content ul, .slide-content ol { margin: 0.5rem 0; padding-left: 1.5rem; }

    /* Semantic Tables */
    .slide-table {
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0;
    }
    .slide-table th, .slide-table td {
      border: 1px solid var(--border-color);
      padding: 0.5rem;
      text-align: left;
    }
    .slide-table th {
      background: var(--text-color);
      color: var(--bg-color);
      font-weight: bold;
    }
    .slide-table thead th { scope: col; }
    .slide-table tbody th { scope: row; font-weight: normal; }

    /* Figures with Alt-Text */
    .slide-figure {
      margin: 1rem 0;
      padding: 1rem;
      background: var(--alt-text-bg);
      border-radius: 8px;
    }
    .slide-figure figcaption {
      font-style: italic;
      color: var(--text-color);
      margin-top: 0.5rem;
    }

    /* Visual Descriptions Section */
    .visual-descriptions {
      background: var(--alt-text-bg);
      border-left: 4px solid #4caf50;
      padding: 1rem;
      border-radius: 0 8px 8px 0;
      margin-top: 1rem;
    }
    .visual-descriptions h4 { margin-top: 0; font-size: 1rem; }
    .visual-descriptions p { margin: 0.5rem 0; font-style: italic; }

    /* Progressive Disclosure: Details/Summary */
    .slide-details {
      margin-top: 1rem;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      overflow: hidden;
    }

    .slide-details summary {
      padding: 0.75rem 1rem;
      background: var(--slide-bg);
      cursor: pointer;
      font-weight: 500;
      list-style: none;
    }

    .slide-details summary::-webkit-details-marker {
      display: none;
    }

    .slide-details summary::before {
      content: "▶ ";
      font-size: 0.8em;
    }

    .slide-details[open] summary::before {
      content: "▼ ";
    }

    .slide-details summary:hover {
      background: var(--border-color);
    }

    .slide-details[open] summary {
      border-bottom: 1px solid var(--border-color);
    }

    .slide-details-content {
      padding: 1rem;
    }

    /* Speaker Notes (role="note") */
    .speaker-notes {
      background: #f5f5dc;
      border-left: 4px solid #daa520;
      padding: 1rem;
      margin-top: 1rem;
      border-radius: 0 8px 8px 0;
    }

    .speaker-notes h4 {
      margin: 0 0 0.5rem 0;
      font-size: 0.9rem;
      color: #5d4e37;
    }

    .speaker-notes p {
      margin: 0;
      font-style: italic;
    }

    @media (prefers-color-scheme: dark) {
      .speaker-notes {
        background: #3d3d00;
        border-left-color: #ffd700;
      }
      .speaker-notes h4 {
        color: #ffd700;
      }
    }

    a { color: var(--link-color); }
    a:focus { outline: 3px solid var(--link-color); outline-offset: 2px; }

    @media print {
      body { max-width: none; padding: 1cm; }
      .skip-link, nav[aria-label="Folienübersicht"] { display: none; }
      .slide-section { page-break-inside: avoid; border: 1px solid #ccc; }
    }

    @media (max-width: 600px) {
      body { padding: 1rem; }
      h1 { font-size: 1.5rem; }
      h2 { font-size: 1.25rem; }
    }
"""


def generate_slide_summary(
    slide: Dict[str, Any],
    alttexts: Dict[str, str],
    slide_summaries: Optional[Dict[int, str]] = None,
) -> str:
    """
    Generate a narrative summary for a slide.
    Uses pre-generated LLM summaries if available, otherwise creates a basic one.
    """
    slide_idx = slide.get("slide_index", 0)

    # Use pre-generated summary if available
    if slide_summaries and slide_idx in slide_summaries:
        return slide_summaries[slide_idx]

    # Generate basic summary from available data
    elements = slide.get("elements_in_reading_order", [])
    notes = slide.get("notes_text", "")

    # Collect info for summary
    slide_title = ""
    text_content = []
    visual_types = []

    for elem in elements:
        shape_id = elem.get("shape_id", "")
        text = elem.get("text", "").strip()
        alt = alttexts.get(shape_id, "")

        if is_title_element(elem, slide_idx) and text:
            slide_title = text

        # Detect visual elements
        for prefix in ["Diagramm", "Zeitstrahl", "Tabelle", "Grafik", "Bild"]:
            if alt.startswith(prefix):
                visual_types.append(prefix)
                break

        if text and not is_title_element(elem, slide_idx):
            text_content.append(text[:100])

    # Build summary
    parts = []

    if slide_title:
        parts.append(f"Diese Folie behandelt das Thema '{slide_title}'.")

    if visual_types:
        visual_str = ", ".join(set(visual_types))
        parts.append(f"Sie enthält visuelle Elemente: {visual_str}.")

    if notes:
        # Use speaker notes as primary content
        notes_preview = notes[:200].replace("\n", " ").strip()
        parts.append(notes_preview)
    elif text_content:
        content_preview = " ".join(text_content)[:150]
        parts.append(content_preview)

    return " ".join(parts) if parts else f"Folie {slide_idx + 1} der Präsentation."


def render_table(table_data: Dict[str, Any], alt_text: str = "") -> str:
    """Render a table with proper accessibility markup."""
    rows = table_data.get("rows", [])
    has_header = table_data.get("has_header", True)

    if not rows:
        return ""

    html_parts = ['<table class="slide-table">\n']

    if alt_text:
        html_parts.append(f'  <caption class="visually-hidden">{escape_html(alt_text)}</caption>\n')

    for i, row in enumerate(rows):
        if i == 0 and has_header:
            html_parts.append('  <thead>\n    <tr>\n')
            for cell in row:
                html_parts.append(f'      <th scope="col">{escape_html(str(cell))}</th>\n')
            html_parts.append('    </tr>\n  </thead>\n  <tbody>\n')
        else:
            html_parts.append('    <tr>\n')
            for j, cell in enumerate(row):
                # First column could be row header
                if j == 0 and has_header:
                    html_parts.append(f'      <th scope="row">{escape_html(str(cell))}</th>\n')
                else:
                    html_parts.append(f'      <td>{escape_html(str(cell))}</td>\n')
            html_parts.append('    </tr>\n')

    if has_header and len(rows) > 1:
        html_parts.append('  </tbody>\n')

    html_parts.append('</table>\n')
    return ''.join(html_parts)


def render_figure(alt_text: str, shape_type: str = "image") -> str:
    """Render an image/chart as a figure with figcaption."""
    type_label = {
        "picture": "Bild",
        "chart": "Diagramm",
        "diagram": "Diagramm",
        "smartart": "SmartArt-Grafik",
    }.get(shape_type, "Grafik")

    return f'''<figure class="slide-figure" role="img" aria-label="{escape_html(alt_text)}">
  <div class="figure-placeholder">[{type_label}]</div>
  <figcaption>{escape_html(alt_text)}</figcaption>
</figure>
'''


def generate_accessible_html(
    modelpack: Dict[str, Any],
    alttexts: Dict[str, str],
    presentation_title: Optional[str] = None,
    language: str = "de",
    slide_summaries: Optional[Dict[int, str]] = None,
) -> str:
    """
    Generate fully accessible HTML with Summary-First structure.

    Args:
        modelpack: The modelpack JSON with slides and elements
        alttexts: Dictionary mapping shape_id to alt-text descriptions
        presentation_title: Optional title override
        language: HTML lang attribute (e.g., "de" or "de-DE")
        slide_summaries: Optional dict mapping slide_index to narrative summary

    Returns:
        Complete HTML document as string
    """
    # Normalize language to BCP 47 format
    if language == "de":
        language = "de-DE"
    elif language == "en":
        language = "en-US"

    # Extract presentation title
    title = presentation_title or modelpack.get("presentation_title", "Präsentation")
    if not title or title == "Präsentation":
        slides = modelpack.get("slides", [])
        if slides:
            for elem in slides[0].get("elements_in_reading_order", []):
                if is_title_element(elem, 0) and elem.get("text"):
                    title = elem["text"][:100]
                    break

    slides = modelpack.get("slides", [])
    html_parts = []

    # DOCTYPE and head
    html_parts.append(f"""<!DOCTYPE html>
<html lang="{language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="VoxDrop PDF/UA Converter">
  <title>{escape_html(title)}</title>
  <style>{generate_css()}</style>
</head>
<body>
  <a href="#main-content" class="skip-link">Zum Hauptinhalt springen</a>

  <header role="banner">
    <h1>{escape_html(title)}</h1>
  </header>
""")

    # Table of contents
    if len(slides) > 1:
        html_parts.append('  <nav aria-label="Folienübersicht" role="navigation">\n')
        html_parts.append('    <h2>Inhaltsverzeichnis</h2>\n')
        html_parts.append('    <ol>\n')

        for slide in slides:
            slide_idx = slide.get("slide_index", 0)
            slide_title = f"Folie {slide_idx + 1}"

            for elem in slide.get("elements_in_reading_order", []):
                if is_title_element(elem, slide_idx) and elem.get("text"):
                    slide_title = elem["text"][:80]
                    break

            html_parts.append(f'      <li><a href="#slide-{slide_idx + 1}">{escape_html(slide_title)}</a></li>\n')

        html_parts.append('    </ol>\n')
        html_parts.append('  </nav>\n\n')

    # Main content
    html_parts.append('  <main id="main-content" role="main">\n')

    for slide in slides:
        slide_idx = slide.get("slide_index", 0)
        elements = slide.get("elements_in_reading_order", [])
        header_id = f"slide-header-{slide_idx + 1}"

        # SUMMARY-FIRST: Wrap in section with aria-labelledby
        html_parts.append(f'    <section class="slide-section" id="slide-{slide_idx + 1}" aria-labelledby="{header_id}">\n')

        # Find slide title
        slide_title = None
        title_shape_id = None
        for elem in elements:
            if is_title_element(elem, slide_idx) and elem.get("text"):
                slide_title = elem["text"]
                title_shape_id = elem.get("shape_id")
                break

        # FIRST ELEMENT: Summary heading (h3)
        html_parts.append(f'      <h3 id="{header_id}" class="slide-summary-header">\n')
        html_parts.append(f'        <span class="slide-number-badge">{slide_idx + 1}</span>\n')
        html_parts.append(f'        Zusammenfassung Folie {slide_idx + 1}\n')
        html_parts.append('      </h3>\n\n')

        # SECOND ELEMENT: Narrative summary (p.slide-summary)
        summary_text = cleanup_llm_artifacts(generate_slide_summary(slide, alttexts, slide_summaries))
        html_parts.append(f'      <p class="slide-summary">{escape_html(summary_text)}</p>\n\n')

        # Visual structure hint
        slide_alttexts = [alttexts.get(elem.get("shape_id", ""), "") for elem in elements]
        visual_structures = detect_visual_structures(slide_alttexts)
        if visual_structures:
            hint_text = format_visual_hint(visual_structures)
            html_parts.append(f'      <p class="visual-hint" aria-label="Visuelle Struktur">{escape_html(hint_text)}</p>\n\n')

        # PROGRESSIVE DISCLOSURE: Wrap details in <details> element
        html_parts.append('      <details class="slide-details">\n')
        html_parts.append('        <summary>Vollständige Foliendetails und Rohdaten anzeigen</summary>\n')
        html_parts.append('        <div class="slide-details-content">\n')

        # Slide title as h2 (inside details)
        if slide_title:
            html_parts.append(f'          <h2>{escape_html(cleanup_llm_artifacts(slide_title))}</h2>\n\n')

        # Content section
        html_parts.append('          <div class="slide-content">\n')

        for elem in elements:
            shape_id = elem.get("shape_id", "")
            text = elem.get("text", "").strip()
            alt = cleanup_llm_artifacts(alttexts.get(shape_id, ""))
            elem_type = elem.get("type", "")

            # Skip title (already rendered)
            if shape_id == title_shape_id:
                continue

            # Handle tables
            table_data = detect_table_structure(elem)
            if table_data:
                html_parts.append(render_table(table_data, alt))
                continue

            # Handle images/charts/diagrams as figures
            if elem_type in ("picture", "chart", "diagram", "smartart") or \
               any(alt.startswith(p) for p in ["Bild:", "Diagramm:", "Grafik:", "Chart:"]):
                if alt:
                    html_parts.append(f'            {render_figure(alt, elem_type)}')
                continue

            # Handle lists
            if text:
                text = cleanup_llm_artifacts(text)
                list_items = detect_list_items(text)
                if list_items:
                    list_label = f' aria-label="{escape_html(alt)}"' if alt and alt.startswith("Liste") else ""
                    html_parts.append(f'            <ul{list_label}>\n')
                    for item in list_items:
                        html_parts.append(f'              <li>{escape_html(item)}</li>\n')
                    html_parts.append('            </ul>\n')
                else:
                    # Render as paragraphs
                    paragraphs = text.split('\n\n')
                    for para in paragraphs:
                        para = para.strip()
                        if para:
                            html_parts.append(f'            <p>{escape_html(para)}</p>\n')

        html_parts.append('          </div>\n')

        # Speaker Notes with role="note" (inside details)
        notes_text = slide.get("notes_text", "")
        if notes_text:
            notes_text = cleanup_llm_artifacts(notes_text)
            html_parts.append('\n          <aside class="speaker-notes" role="note">\n')
            html_parts.append('            <h4>Sprechernotizen</h4>\n')
            html_parts.append(f'            <p>{escape_html(notes_text)}</p>\n')
            html_parts.append('          </aside>\n')

        # Visual descriptions aside (inside details)
        visual_descriptions = [
            cleanup_llm_artifacts(alt) for elem in elements
            if (alt := alttexts.get(elem.get("shape_id", ""), "")) and
               any(alt.startswith(p) for p in ["Grafik:", "Diagramm:", "Zeitstrahl", "Meilenstein", "Tabelle:", "Bild:"])
        ]

        if visual_descriptions:
            html_parts.append('\n          <aside class="visual-descriptions" aria-label="Detaillierte Beschreibung visueller Elemente">\n')
            html_parts.append('            <h4>Visuelle Elemente im Detail</h4>\n')
            for desc in visual_descriptions:
                html_parts.append(f'            <p>{escape_html(desc)}</p>\n')
            html_parts.append('          </aside>\n')

        # Close details element
        html_parts.append('        </div>\n')
        html_parts.append('      </details>\n')

        html_parts.append('    </section>\n\n')

    # Close document
    html_parts.append('  </main>\n\n')
    html_parts.append('  <footer role="contentinfo">\n')
    html_parts.append('    <p>Erstellt mit VoxDrop - Barrierefreie Präsentationen</p>\n')
    html_parts.append('  </footer>\n')
    html_parts.append('</body>\n')
    html_parts.append('</html>\n')

    return ''.join(html_parts)


def main():
    ap = argparse.ArgumentParser(description="Generate accessible HTML from PPTX pipeline data (Summary-First)")
    ap.add_argument("modelpack_json", help="Path to modelpack.json")
    ap.add_argument("alttexts_json", help="Path to alttexts.json")
    ap.add_argument("-o", "--out", default=None, help="Output HTML path")
    ap.add_argument("--title", default=None, help="Presentation title override")
    ap.add_argument("--lang", default="de-DE", help="HTML language (default: de-DE)")
    ap.add_argument("--summaries", default=None, help="Path to slide summaries JSON")

    args = ap.parse_args()

    # Load data
    modelpack = load_json(args.modelpack_json)
    alttexts_data = load_json(args.alttexts_json)
    alttexts = alttexts_data.get("alttexts", alttexts_data)

    # Load slide summaries if provided
    slide_summaries = None
    if args.summaries:
        summaries_data = load_json(args.summaries)
        slide_summaries = {s["slide_index"]: s["summary"] for s in summaries_data.get("summaries", [])}

    # Generate HTML
    html_content = generate_accessible_html(
        modelpack=modelpack,
        alttexts=alttexts,
        presentation_title=args.title,
        language=args.lang,
        slide_summaries=slide_summaries,
    )

    # Write output
    out_path = args.out or args.modelpack_json.replace(".json", ".html")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html_content)

    print(f"Generated accessible HTML (Summary-First): {out_path}")


if __name__ == "__main__":
    main()
