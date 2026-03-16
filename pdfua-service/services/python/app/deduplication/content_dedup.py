from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple

from .similarity import is_redundant


VISUAL_KEYWORDS = (
    "diagramm",
    "grafik",
    "screenshot",
    "abbildung",
    "tabelle",
    "zeitleiste",
    "prozess",
    "flussdiagramm",
    "organigramm",
    "schema",
    "icon",
    "foto",
    "darstellung",
)


def _clean(text: str) -> str:
    if not text:
        return ""
    value = str(text)
    value = value.replace("\u00ad", "")
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def _join_points(points: List[str]) -> str:
    cleaned = [p.strip() for p in points if str(p).strip()]
    return " • ".join(cleaned)


def _looks_visual(text: str, slide: Dict[str, Any]) -> bool:
    if not text:
        return False
    lowered = text.lower()
    if any(keyword in lowered for keyword in VISUAL_KEYWORDS):
        return True
    if slide.get("has_chart") or slide.get("is_visual_diagram"):
        return True
    if slide.get("images"):
        return True
    return False


def _content_candidates(slide: Dict[str, Any]) -> List[Tuple[str, str]]:
    summary = _clean(slide.get("slide_summary") or "")
    key_points_raw = slide.get("summary_points") or []
    key_points = _clean(_join_points(key_points_raw)) if key_points_raw else ""
    structured = _clean(slide.get("structured_text") or slide.get("structured_content") or "")

    # Visual details are usually stored as diagram_summary when a slide summary exists.
    visual_details = ""
    if slide.get("slide_summary"):
        visual_details = _clean(slide.get("diagram_summary") or "")

    speaker_notes = _clean(slide.get("speaker_notes") or "")

    return [
        ("structured_content", structured),
        ("key_points", key_points),
        ("summary", summary),
        ("visual_details", visual_details),
        ("speaker_notes", speaker_notes),
    ]


def deduplicate_slide_content(
    slide: Dict[str, Any],
    threshold: float = 0.6,
) -> Dict[str, Any]:
    """
    Remove redundant slide content blocks based on overlap heuristics.

    Mutates slide in-place and returns a dict with consolidated_content.
    """
    candidates = _content_candidates(slide)
    kept: List[Tuple[str, str]] = []

    summary_structure = str(slide.get("summary_structure") or "")
    keep_key_points = summary_structure in ("timeline", "process")

    for block_type, text in candidates:
        if not text:
            continue

        if block_type == "visual_details" and not _looks_visual(text, slide):
            continue

        if block_type == "summary":
            kept.append((block_type, text))
            continue

        if block_type == "key_points" and keep_key_points:
            kept.append((block_type, text))
            continue

        redundant = False
        for _, kept_text in kept:
            if is_redundant(text, kept_text, threshold=threshold):
                redundant = True
                break
        if redundant:
            continue

        kept.append((block_type, text))

    consolidated = [{"type": t, "text": txt} for t, txt in kept]
    slide["consolidated_content"] = consolidated

    # Update slide fields to avoid rendering redundant sections.
    keep_types = {t for t, _ in kept}

    if "summary" not in keep_types:
        slide["slide_summary"] = None
    if "key_points" not in keep_types:
        slide["summary_points"] = []
    if "visual_details" not in keep_types:
        slide["diagram_summary"] = None
    if "speaker_notes" not in keep_types:
        slide["speaker_notes"] = None

    return {"consolidated_content": consolidated}
