"""
Slide Summary Generator - Creates concise, screenreader-friendly summaries for every slide.
Uses a text-only LLM (vLLM preferred, Ollama fallback) with robust fallbacks.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, Dict, List, Optional

import httpx

from ..config import (
    SUMMARY_LLM_PROVIDER,
    SUMMARY_LLM_URL,
    SUMMARY_LLM_MODEL,
    SUMMARY_MAX_CHARS,
    SUMMARY_MAX_POINTS,
    SUMMARY_TIMEOUT_SECONDS,
    SUMMARY_MAX_CONCURRENT,
    PDFUA_LANG,
    MAX_SUMMARY_SENTENCES,
    VISION_VLLM_URL,
    VISION_MODEL,
)

logger = logging.getLogger(__name__)


SUMMARY_SYSTEM_PROMPT_DE = """Du bist ein Experte für barrierefreie Dokumentation.
Erstelle für jede Folie eine kurze, klare Zusammenfassung für Screenreader-Nutzer.

REGELN:
- 3-6 Sätze, Fließtext, maximal {max_chars} Zeichen
- Nutze sichtbaren Text und strukturierte Bereiche als Basis.
- Wenn Speaker Notes vorhanden sind, nutze sie als Kontext/Erklärung (ignoriere Regieanweisungen wie "klicken", "sagen", "zeigen").
- Erkläre den Inhalt und die Kernaussage, ohne zentrale Aussagen wegzulassen.
- Nenne relevante visuelle Strukturen (Diagramm, Zeitstrahl, Tabelle, Prozess)
- Verwende korrekte deutsche Umlaute (ä, ö, ü, ß), keine Umschreibungen wie ae/oe/ue/ss
- Halte nummerierte Bereiche (z. B. 1/2/3/4) mit ihren Überschriften und Texten zusammen
- Keine Einleitung wie \"Zusammenfassung:\" oder \"Die Folie zeigt\"
- Gib IMMER 3-7 kurze Kernpunkte zurück, die die wichtigsten Fakten/Zahlen/Begriffe abdecken.
- Wenn es eine Timeline oder einen Prozess gibt: gib 2-7 geordnete Punkte (in key_points) zurück.

Antworte NUR im JSON-Format:
{{
  \"summary\": \"...\",
  \"key_points\": [\"...\"] ,
  \"structure\": \"timeline|process|chart|table|org|infographic|none\"
}}
"""

SUMMARY_SYSTEM_PROMPT_EN = """You are an expert in accessible documentation.
Create a short, clear summary for each slide for screenreader users.

RULES:
- 3-6 sentences, prose, max {max_chars} characters
- Use visible text and structured content as the base.
- If speaker notes exist, use them for context/explanations (ignore stage directions like "click", "say", "show").
- Explain the content and key message without omitting central points.
- Mention visual structures (chart, timeline, table, process)
- No lead-in like \"Summary:\" or \"This slide shows\"
- ALWAYS return 3-7 short key points covering the most important facts/numbers/terms.
- If there's a timeline/process: return 2-7 ordered points (in key_points).

Return ONLY JSON:
{{
  \"summary\": \"...\",
  \"key_points\": [\"...\"] ,
  \"structure\": \"timeline|process|chart|table|org|infographic|none\"
}}
"""

DOCUMENT_SYSTEM_PROMPT_DE = """Du bist ein Experte für barrierefreie Dokumentation.
Erstelle eine kurze Gesamtübersicht der Präsentation.

REGELN:
- 2-4 Sätze, maximal {max_chars} Zeichen
- Nenne das Thema/den Zweck und die wichtigsten Bereiche
- Keine Einleitung wie "Zusammenfassung:" oder "Diese Präsentation zeigt"
- Verwende korrekte deutsche Umlaute (ä, ö, ü, ß)

Antworte NUR im JSON-Format:
{{
  "summary": "..."
}}
"""

DOCUMENT_SYSTEM_PROMPT_EN = """You are an expert in accessible documentation.
Create a short overall summary of the presentation.

RULES:
- 2-4 sentences, max {max_chars} characters
- State the topic/purpose and the main areas
- No lead-in like "Summary:" or "This presentation shows"

Return ONLY JSON:
{
  "summary": "..."
}
"""


def _clean_summary_text(text: str) -> str:
    text = (text or "").strip()
    text = text.replace("\u00AD", "").replace("\u200B", "").replace("\uFEFF", "")
    text = re.sub(r"\s+", " ", text).strip()
    # Remove common prefixes
    for prefix in (
        "Zusammenfassung:",
        "Die Folie zeigt",
        "Diese Folie zeigt",
        "This slide shows",
        "Summary:",
    ):
        if text.lower().startswith(prefix.lower()):
            text = text[len(prefix):].strip()
            break
    text = _limit_sentences(text, MAX_SUMMARY_SENTENCES)
    if text and text[-1] not in ".!?":
        text += "."
    if len(text) > SUMMARY_MAX_CHARS:
        text = text[: SUMMARY_MAX_CHARS - 1].rstrip() + "…"
    return text


def _limit_sentences(text: str, max_sentences: int) -> str:
    if not text or max_sentences <= 0:
        return text
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    if len(sentences) <= max_sentences:
        return text
    return " ".join(sentences[:max_sentences]).strip()


def _build_document_outline(slides: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    outline: List[Dict[str, Any]] = []
    for slide in slides:
        title = str(slide.get("title") or "").strip()
        slide_num = int(slide.get("slide_number") or len(outline) + 1)
        outline.append({
            "slide_number": slide_num,
            "title": title or f"Folie {slide_num}",
        })
    return outline


def _collect_overview_context(slides: List[Dict[str, Any]], limit: int = 25) -> str:
    lines: List[str] = []
    for slide in slides[:limit]:
        slide_num = slide.get("slide_number", 0)
        title = str(slide.get("title") or "").strip()
        summary = str(slide.get("slide_summary") or "").strip()
        structured = str(slide.get("structured_text") or "").strip()
        snippet = summary or structured
        if title and snippet:
            lines.append(f"Folie {slide_num}: {title} – {snippet}")
        elif title:
            lines.append(f"Folie {slide_num}: {title}")
        elif snippet:
            lines.append(f"Folie {slide_num}: {snippet}")
    return "\n".join(lines)


async def generate_document_overview(
    slides: List[Dict[str, Any]],
    lang: Optional[str] = None,
    force_fallback: bool = False,
) -> Dict[str, Any]:
    if not slides:
        return {"summary": "", "outline": []}

    lang = lang or PDFUA_LANG or "de"
    outline = _build_document_outline(slides)
    fallback_summary = f"Diese Präsentation enthält {len(slides)} Folien."

    if force_fallback:
        return {"summary": fallback_summary, "outline": outline}

    system_prompt = (
        DOCUMENT_SYSTEM_PROMPT_DE if lang.lower().startswith("de") else DOCUMENT_SYSTEM_PROMPT_EN
    ).format(max_chars=max(SUMMARY_MAX_CHARS * 2, 500))
    context = _collect_overview_context(slides)
    if not context:
        return {"summary": fallback_summary, "outline": outline}

    user_prompt = f"Kontext:\n{context}\n\nAntwort:"

    try:
        raw = await _llm_generate(
            user_prompt,
            system=system_prompt,
            temperature=0.2,
            max_tokens=300,
            format_json=True,
        )
        parsed = _parse_json_response(raw)
        summary = _clean_summary_text(str(parsed.get("summary", ""))) if parsed else ""
        if not summary:
            summary = fallback_summary
        return {"summary": summary, "outline": outline}
    except Exception:
        return {"summary": fallback_summary, "outline": outline}


def _structured_items_to_text(items: List[Dict[str, Any]]) -> str:
    lines: List[str] = []
    for item in items:
        number = str(item.get("number") or "").strip()
        heading = str(item.get("heading") or "").strip()
        body_parts = [str(t).strip() for t in (item.get("body") or []) if str(t).strip()]
        body = " ".join(body_parts)

        prefix = f"{number}. " if number else ""
        if heading and body:
            lines.append(f"{prefix}{heading}: {body}".strip())
        elif heading:
            lines.append(f"{prefix}{heading}".strip())
        elif body:
            lines.append(f"{prefix}{body}".strip())

    return "\n".join(line for line in lines if line)


def _structured_used_indices(slide: Dict[str, Any]) -> set[int]:
    explicit = slide.get("structured_used_indices")
    if isinstance(explicit, list):
        return {int(x) for x in explicit if isinstance(x, (int, float, str)) and str(x).isdigit()}

    used: set[int] = set()
    for item in slide.get("structured_items", []) or []:
        for idx in item.get("source_indices", []) or []:
            try:
                used.add(int(idx))
            except Exception:
                continue
    return used


def _ordered_text_blocks(slide: Dict[str, Any]) -> List[Dict[str, Any]]:
    blocks = slide.get("text_ordered") or slide.get("text_content") or []
    if not blocks:
        return []

    # If positions exist but no explicit ordering, fall back to top/left sorting.
    if slide.get("text_ordered"):
        return list(blocks)

    if any("top_norm" in b for b in blocks):
        return sorted(
            blocks,
            key=lambda b: (
                float(b.get("top_norm") or 0.0),
                float(b.get("left_norm") or 0.0),
            ),
        )

    return list(blocks)


def _extract_visible_text(slide: Dict[str, Any]) -> str:
    texts: List[str] = []

    structured_items = slide.get("structured_items") or []
    structured_text = slide.get("structured_text") or _structured_items_to_text(structured_items)
    if structured_text:
        texts.append(structured_text)

    used_indices = _structured_used_indices(slide)

    for block in _ordered_text_blocks(slide):
        block_idx = block.get("index")
        if isinstance(block_idx, int) and block_idx in used_indices:
            continue
        content = block.get("content", "")
        if content:
            texts.append(str(content).strip())
    for shape in slide.get("shapes", []):
        if isinstance(shape, dict) and shape.get("text"):
            texts.append(str(shape.get("text")).strip())
    # Deduplicate while preserving order
    seen = set()
    deduped = []
    for t in texts:
        if t and t not in seen:
            seen.add(t)
            deduped.append(t)
    return "\n".join(deduped)


def _extract_alt_texts(slide: Dict[str, Any], limit: int = 6) -> List[str]:
    alts = []
    for img in slide.get("images", []):
        alt = img.get("alt_text")
        if alt:
            alts.append(str(alt).strip())
    return alts[:limit]


def _extract_chart_summaries(slide: Dict[str, Any], limit: int = 3) -> List[str]:
    summaries = []
    for shape in slide.get("shapes", []):
        if shape.get("type") == "chart" and shape.get("summary"):
            summaries.append(str(shape.get("summary")).strip())
    return summaries[:limit]


VISUAL_LABELS = {
    "timeline": {"de": "Zeitstrahl", "en": "timeline"},
    "flowchart": {"de": "Flussdiagramm", "en": "flowchart"},
    "process": {"de": "Prozessdarstellung", "en": "process"},
    "org": {"de": "Organigramm", "en": "organization chart"},
    "chart": {"de": "Diagramm", "en": "chart"},
    "table": {"de": "Tabelle", "en": "table"},
    "infographic": {"de": "Infografik", "en": "infographic"},
    "diagram": {"de": "Diagramm", "en": "diagram"},
}


def _detect_visual_structures(alt_texts: List[str], slide: Dict[str, Any]) -> List[str]:
    structures: List[str] = []
    seen = set()

    patterns = [
        ("zeitstrahl", "timeline"),
        ("timeline", "timeline"),
        ("flussdiagramm", "flowchart"),
        ("flowchart", "flowchart"),
        ("prozess", "process"),
        ("organigramm", "org"),
        ("diagramm", "diagram"),
        ("chart", "chart"),
        ("tabelle", "table"),
        ("infografik", "infographic"),
        ("schaubild", "diagram"),
    ]

    for alt in alt_texts:
        alt_lower = alt.lower()
        for key, label in patterns:
            if key in alt_lower and label not in seen:
                structures.append(label)
                seen.add(label)
                break

    if slide.get("has_chart") and "chart" not in seen:
        structures.append("chart")
        seen.add("chart")
    if slide.get("has_table") and "table" not in seen:
        structures.append("table")
        seen.add("table")
    if slide.get("is_visual_diagram") and "diagram" not in seen:
        structures.append("diagram")

    return structures


def _visual_labels(structures: List[str], lang: str) -> List[str]:
    lang_key = "en" if lang.lower().startswith("en") else "de"
    labels = []
    seen = set()
    for key in structures:
        label = VISUAL_LABELS.get(key, {}).get(lang_key, key)
        if label not in seen:
            labels.append(label)
            seen.add(label)
    return labels


def _format_visual_hint(structures: List[str], lang: str) -> str:
    if not structures:
        return ""
    labels = _visual_labels(structures, lang)
    if lang.lower().startswith("en"):
        return f"Contains: {', '.join(labels)}."
    return f"Enthält: {', '.join(labels)}."


def _build_prompt(slide: Dict[str, Any], lang: str) -> str:
    title = slide.get("title") or f"Folie {slide.get('slide_number', 0)}"
    speaker_notes = str(slide.get("speaker_notes") or "").strip()
    visible_text = _extract_visible_text(slide) or "(Kein Text)"
    alt_texts = _extract_alt_texts(slide)
    chart_summaries = _extract_chart_summaries(slide)
    diagram_summary = str(slide.get("diagram_summary") or "").strip()
    visual_elements = _visual_labels(_detect_visual_structures(alt_texts, slide), lang)
    structured_items = slide.get("structured_items") or []

    payload = {
        "title": title,
        "speaker_notes": (speaker_notes[:1800] if speaker_notes else None),
        "visible_text": visible_text[:2400],
        "visual_elements": visual_elements,
        "alt_texts": alt_texts,
        "chart_summaries": chart_summaries,
        "diagram_summary": (diagram_summary[:900] if diagram_summary else None),
    }

    if structured_items:
        payload["structured_items"] = [
            {
                "number": item.get("number"),
                "heading": item.get("heading"),
                "body": item.get("body"),
            }
            for item in structured_items[:8]
        ]

    if lang.lower().startswith("en"):
        return (
            "Create a short summary for this slide using the following data.\n"
            "Return ONLY JSON as specified in the system prompt.\n\n"
            f"{json.dumps(payload, ensure_ascii=False)}"
        )

    return (
        "Erstelle eine kurze Zusammenfassung für diese Folie anhand der folgenden Daten.\n"
        "Antworte NUR mit JSON wie im System-Prompt beschrieben.\n\n"
        f"{json.dumps(payload, ensure_ascii=False)}"
    )


def _fallback_summary(slide: Dict[str, Any]) -> Dict[str, Any]:
    text = _extract_visible_text(slide)
    title = slide.get("title") or f"Folie {slide.get('slide_number', 0)}"
    summary = ""
    if slide.get("speaker_notes"):
        summary = slide["speaker_notes"]
    elif text:
        summary = text
    else:
        summary = title
    summary = _clean_summary_text(summary)
    return {
        "summary": summary,
        "key_points": [],
        "structure": "none",
    }


def _parse_json_response(raw: str) -> Optional[Dict[str, Any]]:
    if not raw:
        return None
    raw = raw.strip()
    try:
        return json.loads(raw)
    except Exception:
        # Try to extract JSON block
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            return None
        try:
            return json.loads(match.group(0))
        except Exception:
            return None


# ---------------------------------------------------------------------------
# LLM provider abstraction (vLLM preferred, Ollama fallback)
# ---------------------------------------------------------------------------

async def _vllm_generate(
    prompt: str,
    system: Optional[str] = None,
    temperature: float = 0.2,
    max_tokens: int = 300,
) -> str:
    """
    Call the vLLM OpenAI-compatible /chat/completions endpoint.
    Reuses the same vLLM server that powers vision tasks.
    """
    base_url = VISION_VLLM_URL.rstrip("/")
    # Strip /v1 suffix if present – we append the full path ourselves.
    if base_url.endswith("/v1"):
        base_url = base_url[:-3]

    messages: List[Dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": VISION_MODEL,
        "messages": messages,
        "temperature": float(temperature),
        "max_tokens": int(max_tokens),
    }

    async with httpx.AsyncClient(timeout=SUMMARY_TIMEOUT_SECONDS) as client:
        response = await client.post(
            f"{base_url}/v1/chat/completions",
            json=payload,
            timeout=SUMMARY_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        data = response.json()
        return (
            (data.get("choices") or [{}])[0]
            .get("message", {})
            .get("content", "")
            .strip()
        )


async def _ollama_generate(
    prompt: str,
    system: Optional[str] = None,
    temperature: float = 0.2,
    max_tokens: int = 300,
    format_json: bool = False,
) -> str:
    """
    Call Ollama's /api/generate endpoint (existing behaviour, extracted).
    """
    payload: Dict[str, Any] = {
        "model": SUMMARY_LLM_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {
            "num_predict": max_tokens,
            "num_ctx": 8192,
            "temperature": temperature,
        },
    }
    if system:
        payload["system"] = system
    if format_json:
        payload["format"] = "json"

    async with httpx.AsyncClient(timeout=SUMMARY_TIMEOUT_SECONDS) as client:
        response = await client.post(
            f"{SUMMARY_LLM_URL}/api/generate",
            json=payload,
            timeout=SUMMARY_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return (response.json().get("response") or "").strip()


async def _llm_generate(
    prompt: str,
    system: Optional[str] = None,
    temperature: float = 0.2,
    max_tokens: int = 300,
    format_json: bool = False,
) -> str:
    """
    Unified LLM wrapper.  If SUMMARY_LLM_PROVIDER == 'ollama', use Ollama
    directly.  Otherwise try vLLM first and fall back to Ollama on any error.
    """
    if SUMMARY_LLM_PROVIDER == "ollama":
        return await _ollama_generate(
            prompt, system=system, temperature=temperature,
            max_tokens=max_tokens, format_json=format_json,
        )

    # vLLM-first path with Ollama fallback
    try:
        return await _vllm_generate(
            prompt, system=system, temperature=temperature,
            max_tokens=max_tokens,
        )
    except Exception:
        logger.warning("vLLM call failed, falling back to Ollama", exc_info=True)
        return await _ollama_generate(
            prompt, system=system, temperature=temperature,
            max_tokens=max_tokens, format_json=format_json,
        )


async def _summarize_slide(
    slide: Dict[str, Any],
    semaphore: asyncio.Semaphore,
    lang: str,
) -> Dict[str, Any]:
    async with semaphore:
        system_prompt = (
            SUMMARY_SYSTEM_PROMPT_EN if lang.lower().startswith("en") else SUMMARY_SYSTEM_PROMPT_DE
        ).format(max_chars=SUMMARY_MAX_CHARS)
        prompt = _build_prompt(slide, lang)

        try:
            raw = await _llm_generate(
                prompt,
                system=system_prompt,
                temperature=0.2,
                max_tokens=max(400, int(SUMMARY_MAX_CHARS / 2) + 220),
                format_json=True,
            )
            parsed = _parse_json_response(raw)
            if not parsed or "summary" not in parsed:
                return _fallback_summary(slide)

            summary = _clean_summary_text(parsed.get("summary", ""))
            key_points = parsed.get("key_points") or []
            if not isinstance(key_points, list):
                key_points = []
            key_points_clean = []
            for p in key_points:
                s = str(p).strip()
                if not s:
                    continue
                s = s.lstrip("-•* ").strip()
                if len(s) > 220:
                    s = s[:217].rstrip() + "..."
                key_points_clean.append(s)
            key_points = key_points_clean
            key_points = key_points[:SUMMARY_MAX_POINTS]

            structure = str(parsed.get("structure") or "none")
            if structure not in ["timeline", "process", "chart", "table", "org", "infographic", "none"]:
                structure = "none"

            return {
                "summary": summary,
                "key_points": key_points,
                "structure": structure,
            }
        except Exception:
            return _fallback_summary(slide)


async def _llm_available() -> bool:
    """Check whether at least one LLM backend is reachable."""
    async with httpx.AsyncClient(timeout=10) as client:
        # When vLLM is the primary provider, check that first.
        if SUMMARY_LLM_PROVIDER != "ollama":
            try:
                base_url = VISION_VLLM_URL.rstrip("/")
                if base_url.endswith("/v1"):
                    base_url = base_url[:-3]
                resp = await client.get(f"{base_url}/v1/models", timeout=5)
                if resp.status_code == 200:
                    return True
            except Exception:
                pass  # fall through to Ollama check

        # Ollama health check (also serves as fallback probe when vLLM is primary).
        try:
            resp = await client.get(f"{SUMMARY_LLM_URL}/api/tags", timeout=5)
            return resp.status_code == 200
        except Exception:
            return False


async def generate_slide_summaries(
    slides: List[Dict[str, Any]],
    lang: Optional[str] = None,
    force_fallback: bool = False,
) -> Dict[int, Dict[str, Any]]:
    """Generate summaries for all slides. Returns dict keyed by slide_number."""
    if not slides:
        return {}

    lang = lang or PDFUA_LANG or "de"
    semaphore = asyncio.Semaphore(max(1, SUMMARY_MAX_CONCURRENT))

    if force_fallback:
        results = [_fallback_summary(slide) for slide in slides]
    else:
        results = None

    if results is None:
        if await _llm_available():
            tasks = [
                _summarize_slide(slide, semaphore, lang)
                for slide in slides
            ]
            results = await asyncio.gather(*tasks, return_exceptions=False)
        else:
            results = [_fallback_summary(slide) for slide in slides]

    summaries: Dict[int, Dict[str, Any]] = {}
    for slide, result in zip(slides, results):
        slide_num = slide.get("slide_number", 0)
        alt_texts = _extract_alt_texts(slide)
        visual_structures = _detect_visual_structures(alt_texts, slide)
        visual_hint = _format_visual_hint(visual_structures, lang)
        summaries[slide_num] = {
            "summary": result.get("summary") if isinstance(result, dict) else "",
            "key_points": result.get("key_points", []) if isinstance(result, dict) else [],
            "structure": result.get("structure", "none") if isinstance(result, dict) else "none",
            "visual_hint": visual_hint,
        }

    return summaries
