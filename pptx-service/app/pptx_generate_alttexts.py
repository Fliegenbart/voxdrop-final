#!/usr/bin/env python3
"""
pptx_generate_alttexts.py
Generates context-aware alt-texts for all shapes using LLM.

Takes the modelpack (which has presentation context) and generates
meaningful alt-texts that understand the whole presentation, not just
individual shapes.

Usage:
  python pptx_generate_alttexts.py modelpack.json -o alttexts.json
"""

import argparse
import json
import os
from pathlib import Path
from typing import Any, Dict, List

import httpx

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434")
LLM_MODEL = os.getenv("LLM_MODEL", "qwen2.5:14b")

ALTTEXT_SYSTEM_PROMPT = """Du bist ein Experte für Barrierefreiheit und generierst Alt-Texte für Screenreader-Nutzer.

WICHTIG: Kopiere NIEMALS einfach den Text! Erstelle stattdessen eine BESCHREIBUNG die erklärt:
1. WAS für ein Element es ist (Titel, Liste, Grafik, Zeitstrahl, etc.)
2. WELCHE Bedeutung es im Kontext der Präsentation hat
3. WAS die Kernaussage ist

VERPFLICHTENDE Formate - IMMER so beginnen:

Folientitel → "Folientitel: [Titel] - [Einordnung im Gesamtkontext]"
Textblock → "Textabschnitt: [Thema/Funktion] - [Zusammenfassung der Kernaussage]"
Aufzählung → "Liste mit [X] Punkten zu [Thema]: [Die wichtigsten Punkte zusammengefasst]"
Zeitstrahl → "Zeitstrahl [von-bis]: [Was zeigt die zeitliche Entwicklung]"
Jahreszahl → "Meilenstein [Jahr]: [Was passiert in diesem Jahr laut Präsentation]"
Diagramm → "Diagramm [Typ]: [Kernaussage und wichtigste Datenpunkte]"
Tabelle → "Tabelle [Zeilen x Spalten]: [Was vergleicht/zeigt die Tabelle]"
Grafik/Bild → "Grafik: [Was ist dargestellt und welche Bedeutung hat es]"
Legende → "Legende: Erklärt [was] mit [X] Einträgen"

BEISPIELE:

FALSCH: "2026"
RICHTIG: "Meilenstein 2026: Geplanter Abschluss der technischen Migration laut Projektplan"

FALSCH: "Transformationsvorgehen für die Modernisierung von rvSystem"
RICHTIG: "Folientitel: Transformationsvorgehen für die Modernisierung von rvSystem - Einleitung zum technischen Migrationskonzept"

FALSCH: "REHA"
RICHTIG: "Textabschnitt: REHA-Modul - Eines der Kernmodule die modernisiert werden"

Antworte NUR mit JSON:
{
  "alttexts": {
    "SHAPE_ID": "Beschreibender Alt-Text nach obigem Format"
  }
}
"""


def load_json(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: str, data: Dict[str, Any]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def extract_all_shape_ids(modelpack: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Extract all shapes with their text and slide context."""
    shapes = []
    for slide in modelpack.get("slides", []):
        slide_idx = slide.get("slide_index", 0)
        for elem in slide.get("elements_in_reading_order", []):
            shapes.append({
                "slide_index": slide_idx,
                "shape_id": elem.get("shape_id"),
                "text": elem.get("text", ""),
                "has_hyperlink": bool(elem.get("hyperlink")),
            })
    return shapes


def build_prompt(modelpack: Dict[str, Any], shapes: List[Dict[str, Any]]) -> str:
    """Build a prompt for the LLM to generate alt-texts."""

    # Create a summary of the presentation
    slides_summary = []
    for slide in modelpack.get("slides", []):
        slide_idx = slide.get("slide_index", 0)
        elements = slide.get("elements_in_reading_order", [])
        texts = [e.get("text", "")[:100] for e in elements[:5]]  # First 5 elements, 100 chars each
        slides_summary.append(f"Folie {slide_idx}: {' | '.join(texts)}")

    # Create list of shapes that need alt-texts
    shapes_list = []
    for s in shapes:
        text_preview = s["text"][:150] if s["text"] else "(kein Text)"
        shapes_list.append(f'- Shape {s["shape_id"]} (Folie {s["slide_index"]}): "{text_preview}"')

    prompt = f"""Hier ist eine Übersicht der Präsentation:

{chr(10).join(slides_summary[:10])}

Generiere jetzt Alt-Texte für diese Elemente:

{chr(10).join(shapes_list)}

Antworte mit einem JSON-Objekt das für jede shape_id einen Alt-Text enthält."""

    return prompt


async def generate_alttexts_async(modelpack: Dict[str, Any]) -> Dict[str, str]:
    """Generate alt-texts using LLM asynchronously."""
    shapes = extract_all_shape_ids(modelpack)

    if not shapes:
        return {}

    prompt = build_prompt(modelpack, shapes)

    async with httpx.AsyncClient(timeout=300.0) as client:
        response = await client.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": LLM_MODEL,
                "prompt": prompt,
                "system": ALTTEXT_SYSTEM_PROMPT,
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
        return parsed.get("alttexts", parsed)
    except json.JSONDecodeError:
        # Try to extract JSON from the response
        return {}


def generate_alttexts_sync(modelpack: Dict[str, Any]) -> Dict[str, str]:
    """Generate alt-texts using LLM synchronously."""
    import asyncio
    return asyncio.run(generate_alttexts_async(modelpack))


def main():
    ap = argparse.ArgumentParser(description="Generate alt-texts for PPTX shapes using LLM")
    ap.add_argument("modelpack_json", help="Path to modelpack.json")
    ap.add_argument("-o", "--out", default=None, help="Output path (default: <input>.alttexts.json)")
    ap.add_argument("--ollama-url", default=None, help="Ollama URL")
    ap.add_argument("--model", default=None, help="LLM model name")

    args = ap.parse_args()

    global OLLAMA_URL, LLM_MODEL
    if args.ollama_url:
        OLLAMA_URL = args.ollama_url
    if args.model:
        LLM_MODEL = args.model

    modelpack = load_json(args.modelpack_json)
    alttexts = generate_alttexts_sync(modelpack)

    out_path = args.out or (args.modelpack_json.rsplit(".json", 1)[0] + ".alttexts.json")
    save_json(out_path, {"alttexts": alttexts})

    print(f"Generated {len(alttexts)} alt-texts")
    print(f"Wrote: {out_path}")


if __name__ == "__main__":
    main()
