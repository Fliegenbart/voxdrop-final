from __future__ import annotations

from typing import Dict, List, Tuple

from .directive_filter import strip_directives
from .redundancy_checker import split_sentences, is_redundant_sentence


def _slide_context(slide: Dict[str, object]) -> str:
    parts: List[str] = []
    for key in ("slide_summary", "structured_text", "diagram_summary"):
        value = slide.get(key)
        if isinstance(value, str) and value.strip():
            parts.append(value.strip())
    # Text blocks
    for block in slide.get("text_content") or []:
        if isinstance(block, dict):
            content = str(block.get("content") or "").strip()
            if content:
                parts.append(content)
    return " ".join(parts)


def process_speaker_notes(
    slide: Dict[str, object],
    threshold: float = 0.7,
) -> Tuple[str, List[str]]:
    notes = slide.get("speaker_notes")
    if not isinstance(notes, str) or not notes.strip():
        return "", []

    removed: List[str] = []
    lines = [line.strip() for line in notes.splitlines() if line.strip()]
    lines = strip_directives(lines)
    if not lines:
        slide["speaker_notes"] = None
        return "", removed

    context = _slide_context(slide)
    cleaned_sentences: List[str] = []
    for line in lines:
        for sentence in split_sentences(line):
            if is_redundant_sentence(sentence, context, threshold=threshold):
                removed.append(sentence)
                continue
            cleaned_sentences.append(sentence)

    cleaned = " ".join(cleaned_sentences).strip()
    if cleaned:
        slide["speaker_notes"] = cleaned
    else:
        slide["speaker_notes"] = None
    if removed:
        slide["speaker_notes_removed"] = removed
    return cleaned, removed
