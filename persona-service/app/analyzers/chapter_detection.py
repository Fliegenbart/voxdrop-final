"""
Chapter Detection - Use vLLM (default) or Ollama to detect logical chapter breaks in SRT subtitles.
Analyzes transcription text to find transitions between speakers, topics, or sections.
"""

import httpx
import ollama
from typing import Dict, Any, List
import json
import re

from app.config import OLLAMA_CONFIG, VLM_CONFIG, PERSONA_LLM_PROVIDER


# ---------------------------------------------------------------------------
# LLM generation helpers (same pattern as ai_analysis.py)
# ---------------------------------------------------------------------------

def _vllm_generate(prompt: str, temperature: float = 0.3, max_tokens: int = 1024) -> str:
    """Call the vLLM OpenAI-compatible chat/completions endpoint via httpx."""
    host = (VLM_CONFIG.get("host") or "").rstrip("/")
    if not host:
        raise RuntimeError("VLM_HOST not configured for vLLM text generation")
    if not host.endswith("/v1"):
        host = f"{host}/v1"
    model = VLM_CONFIG.get("model") or "Qwen/Qwen3-VL-8B-Instruct-FP8"
    timeout = float(VLM_CONFIG.get("timeout", 120))

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": float(temperature),
        "max_tokens": int(max_tokens),
    }

    resp = httpx.post(
        f"{host}/chat/completions",
        json=payload,
        headers={"Content-Type": "application/json"},
        timeout=timeout,
    )
    resp.raise_for_status()

    body = resp.json()
    return (
        (body.get("choices") or [{}])[0]
        .get("message", {})
        .get("content", "")
        .strip()
    )


def _ollama_generate(prompt: str, temperature: float = 0.3, max_tokens: int = 1024) -> str:
    """Call Ollama generate endpoint."""
    client = ollama.Client(host=OLLAMA_CONFIG["host"])
    resp = client.generate(
        model=OLLAMA_CONFIG["model"],
        prompt=prompt,
        options={"temperature": temperature, "num_predict": max_tokens},
    )
    return (resp.get("response") or "").strip()


def _generate(prompt: str, temperature: float = 0.3, max_tokens: int = 1024) -> str:
    """
    Unified LLM generation wrapper.
    Uses vLLM by default with automatic Ollama fallback.
    Set PERSONA_LLM_PROVIDER=ollama to use Ollama directly.
    """
    if PERSONA_LLM_PROVIDER == "ollama":
        return _ollama_generate(prompt, temperature=temperature, max_tokens=max_tokens)

    # vLLM first, Ollama fallback
    try:
        return _vllm_generate(prompt, temperature=temperature, max_tokens=max_tokens)
    except Exception:
        return _ollama_generate(prompt, temperature=temperature, max_tokens=max_tokens)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def detect_chapters(srt_content: str) -> List[Dict[str, Any]]:
    """
    Analyze SRT content and detect logical chapter breaks.

    Args:
        srt_content: Full SRT file content with timestamps and text

    Returns:
        List of chapter dictionaries with start, end, and title
    """
    try:
        # For very long SRT content, we might need to summarize or chunk
        # For now, limit to reasonable size for LLM context
        srt_sample = srt_content[:15000] if len(srt_content) > 15000 else srt_content

        prompt = f"""Analysiere diese deutschen Untertitel einer Präsentation oder eines Meetings.
Finde logische Kapitelwechsel und erstelle eine Kapitelliste.

WICHTIG: Achte auf diese Hinweise für Kapitelwechsel:
- Ankündigungen wie "Jetzt zeigt...", "Als nächstes...", "Vielen Dank, nun..."
- Begrüßungen neuer Sprecher oder Moderatorenansagen
- Themenwechsel (z.B. von Einleitung zu Hauptteil)
- Abschlussphrasen eines Abschnitts

Die Zeitstempel im SRT-Format sind: HH:MM:SS,mmm (Stunden:Minuten:Sekunden,Millisekunden)

Untertitel:
{srt_sample}

Antworte NUR mit einem JSON-Array. Jedes Kapitel hat:
- "start": Startzeit im SRT-Format (z.B. "00:00:00,000")
- "end": Endzeit im SRT-Format (z.B. "00:10:30,500")
- "title": Aussagekräftiger Kapiteltitel basierend auf dem Inhalt

Beispiel-Format:
[
  {{"start": "00:00:00,000", "end": "00:05:30,500", "title": "Begrüßung und Einführung"}},
  {{"start": "00:05:30,500", "end": "00:15:45,000", "title": "Team Frontend - Dashboard-Entwicklung"}},
  {{"start": "00:15:45,000", "end": "00:25:00,000", "title": "Team Backend - API-Integration"}}
]

WICHTIG:
- Das erste Kapitel muss bei 00:00:00,000 starten
- Das letzte Kapitel muss bis zum Ende des Videos gehen
- Kapitel dürfen sich nicht überlappen
- Erstelle mindestens 1 Kapitel, maximal ~10 Kapitel
- Generiere aussagekräftige Titel aus dem Kontext

Nur JSON-Array, keine Erklärung."""

        response = _generate(prompt)

        chapters = _parse_chapters_response(response, srt_content)

        # Validate and fix chapter structure
        chapters = _validate_chapters(chapters, srt_content)

        return chapters

    except Exception as e:
        print(f"[ChapterDetection] Error: {e}")
        # Return single chapter covering entire video as fallback
        return _create_fallback_chapter(srt_content)


# ---------------------------------------------------------------------------
# Parsing / validation helpers
# ---------------------------------------------------------------------------

def _parse_chapters_response(response: str, srt_content: str) -> List[Dict[str, Any]]:
    """Parse JSON array from LLM response."""
    try:
        # Try direct parsing first
        parsed = json.loads(response)
        if isinstance(parsed, list):
            return parsed
        if isinstance(parsed, dict) and "chapters" in parsed:
            return parsed["chapters"]
    except json.JSONDecodeError:
        pass

    # Try to extract JSON array from markdown code blocks
    json_match = re.search(r'```(?:json)?\s*(\[[\s\S]*?\])\s*```', response)
    if json_match:
        try:
            return json.loads(json_match.group(1))
        except json.JSONDecodeError:
            pass

    # Try to find JSON array in text
    json_match = re.search(r'\[[\s\S]*\]', response)
    if json_match:
        try:
            return json.loads(json_match.group(0))
        except json.JSONDecodeError:
            pass

    # Parsing failed, return fallback
    print(f"[ChapterDetection] Could not parse response: {response[:500]}")
    return _create_fallback_chapter(srt_content)


def _validate_chapters(chapters: List[Dict], srt_content: str) -> List[Dict[str, Any]]:
    """Validate and fix chapter structure."""
    if not chapters or not isinstance(chapters, list):
        return _create_fallback_chapter(srt_content)

    validated = []

    for i, chapter in enumerate(chapters):
        if not isinstance(chapter, dict):
            continue

        # Ensure required fields exist
        if "start" not in chapter or "end" not in chapter:
            continue

        # Add default title if missing
        if "title" not in chapter or not chapter["title"]:
            chapter["title"] = f"Kapitel {i + 1}"

        # Validate timestamp format
        if not _is_valid_srt_time(chapter["start"]) or not _is_valid_srt_time(chapter["end"]):
            continue

        validated.append({
            "start": chapter["start"],
            "end": chapter["end"],
            "title": chapter["title"].strip()
        })

    if not validated:
        return _create_fallback_chapter(srt_content)

    # Ensure first chapter starts at 00:00:00,000
    if validated[0]["start"] != "00:00:00,000":
        validated[0]["start"] = "00:00:00,000"

    return validated


def _is_valid_srt_time(time_str: str) -> bool:
    """Check if string is valid SRT timestamp format."""
    pattern = r'^\d{2}:\d{2}:\d{2},\d{3}$'
    return bool(re.match(pattern, time_str))


def _create_fallback_chapter(srt_content: str) -> List[Dict[str, Any]]:
    """Create single chapter covering entire video as fallback."""
    # Find the last timestamp in the SRT
    timestamps = re.findall(r'(\d{2}:\d{2}:\d{2},\d{3})', srt_content)

    end_time = "00:30:00,000"  # Default 30 min
    if timestamps:
        end_time = timestamps[-1]

    return [{
        "start": "00:00:00,000",
        "end": end_time,
        "title": "Gesamtes Video"
    }]


def srt_time_to_seconds(time_str: str) -> float:
    """Convert SRT timestamp to seconds."""
    match = re.match(r'(\d{2}):(\d{2}):(\d{2}),(\d{3})', time_str)
    if not match:
        return 0.0

    hours, minutes, seconds, ms = match.groups()
    return int(hours) * 3600 + int(minutes) * 60 + int(seconds) + int(ms) / 1000


def seconds_to_srt_time(seconds: float) -> str:
    """Convert seconds to SRT timestamp format."""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{ms:03d}"
