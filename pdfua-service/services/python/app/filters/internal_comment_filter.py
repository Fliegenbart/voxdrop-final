from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from .patterns import INTERNAL_LINE_PATTERNS, INTERNAL_SENTENCE_PATTERNS


SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")


@dataclass
class RemovedItem:
    text: str
    reason: str
    confidence: float


def _matches_any(patterns: List[re.Pattern], text: str) -> Optional[re.Pattern]:
    for pattern in patterns:
        if pattern.search(text):
            return pattern
    return None


def _is_whitelisted(text: str, whitelist: Optional[List[str]]) -> bool:
    if not whitelist:
        return False
    lowered = text.lower()
    return any(token.lower() in lowered for token in whitelist)


def filter_internal_comments(
    text: str,
    confidence_threshold: float = 0.8,
    whitelist: Optional[List[str]] = None,
) -> Tuple[str, List[RemovedItem]]:
    if not text:
        return "", []

    removed: List[RemovedItem] = []
    cleaned_lines: List[str] = []

    lines = [line.strip() for line in str(text).splitlines()]
    for line in lines:
        if not line:
            continue
        if _is_whitelisted(line, whitelist):
            cleaned_lines.append(line)
            continue

        line_pattern = _matches_any(INTERNAL_LINE_PATTERNS, line)
        if line_pattern:
            removed.append(RemovedItem(text=line, reason=line_pattern.pattern, confidence=0.95))
            continue

        # Sentence-level filtering for mixed lines.
        sentences = [s.strip() for s in SENTENCE_SPLIT_RE.split(line) if s.strip()]
        if len(sentences) == 1:
            sentence_pattern = _matches_any(INTERNAL_SENTENCE_PATTERNS, line)
            if sentence_pattern:
                confidence = 0.7
                if confidence >= confidence_threshold:
                    removed.append(RemovedItem(text=line, reason=sentence_pattern.pattern, confidence=confidence))
                    continue
                cleaned_lines.append(f"[PRÜFEN] {line}")
                continue
            cleaned_lines.append(line)
            continue

        kept_sentences: List[str] = []
        for sentence in sentences:
            if _is_whitelisted(sentence, whitelist):
                kept_sentences.append(sentence)
                continue
            sentence_pattern = _matches_any(INTERNAL_SENTENCE_PATTERNS, sentence)
            if sentence_pattern:
                confidence = 0.7
                if confidence >= confidence_threshold:
                    removed.append(RemovedItem(text=sentence, reason=sentence_pattern.pattern, confidence=confidence))
                    continue
                kept_sentences.append(f"[PRÜFEN] {sentence}")
                continue
            kept_sentences.append(sentence)

        if kept_sentences:
            cleaned_lines.append(" ".join(kept_sentences))

    cleaned_text = "\n".join(cleaned_lines).strip()
    return cleaned_text, removed


def filter_slide_internal_comments(
    slide: Dict[str, object],
    whitelist: Optional[List[str]] = None,
) -> None:
    """Apply internal-comment filtering to slide text blocks and speaker notes."""
    removed_items: List[RemovedItem] = []

    # Speaker notes
    notes = slide.get("speaker_notes")
    if isinstance(notes, str):
        cleaned, removed = filter_internal_comments(notes, whitelist=whitelist)
        if cleaned != notes:
            slide["speaker_notes"] = cleaned or None
        removed_items.extend(removed)

    # Text blocks (content)
    blocks = slide.get("text_content") or []
    for block in blocks:
        if not isinstance(block, dict):
            continue
        content = block.get("content")
        if not isinstance(content, str):
            continue
        cleaned, removed = filter_internal_comments(content, whitelist=whitelist)
        if cleaned != content:
            block["content"] = cleaned
        removed_items.extend(removed)

    # Structured items (heading/body)
    for item in slide.get("structured_items") or []:
        if not isinstance(item, dict):
            continue
        heading = item.get("heading")
        if isinstance(heading, str):
            cleaned, removed = filter_internal_comments(heading, whitelist=whitelist)
            if cleaned != heading:
                item["heading"] = cleaned
            removed_items.extend(removed)
        body = item.get("body") or []
        if isinstance(body, list):
            new_body: List[str] = []
            for entry in body:
                if not isinstance(entry, str):
                    continue
                cleaned, removed = filter_internal_comments(entry, whitelist=whitelist)
                if cleaned:
                    new_body.append(cleaned)
                removed_items.extend(removed)
            item["body"] = new_body

    if removed_items:
        slide["internal_comments_removed"] = [
            {"text": r.text, "reason": r.reason, "confidence": r.confidence}
            for r in removed_items
        ]
