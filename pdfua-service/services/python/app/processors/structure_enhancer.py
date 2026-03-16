"""
Structure Enhancer - Builds stronger reading structure for screenreaders.

Adds heading/body groupings for card/grid layouts where titles and texts
belong together but are not numerically labeled.
"""
from __future__ import annotations

import re
from statistics import median
from typing import Any, Dict, List, Set, Tuple


BULLET_PREFIXES = ("•", "-", "*", "–", "—")
NUMBER_RE = re.compile(r"^\s*\d{1,2}[.)]?\s*$")


def _is_number_like(text: str) -> bool:
    return bool(NUMBER_RE.match(text or ""))


def _content_length(block: Dict[str, Any]) -> int:
    return len(str(block.get("content") or "").strip())


def _split_text_lines(raw: str | None) -> List[str]:
    if not raw:
        return []
    text = str(raw)
    text = (
        text.replace("\r\n", "\n")
        .replace("\r", "\n")
        .replace("\v", "\n")
        .replace("\x0b", "\n")
        .replace("\x0c", "\n")
        .replace("\u2028", "\n")
        .replace("\u2029", "\n")
    )
    parts = [part.strip() for part in text.split("\n")]
    return [part for part in parts if part]


def _heading_candidates(blocks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    sizes = [
        float(b.get("font_size_max_pt"))
        for b in blocks
        if b.get("font_size_max_pt")
    ]
    median_size = median(sizes) if sizes else None

    candidates = []
    for block in blocks:
        content = str(block.get("content") or "").strip()
        if not content:
            continue
        if len(content) > 120:
            continue
        if _is_number_like(content):
            continue
        if content.startswith(BULLET_PREFIXES):
            continue

        size = block.get("font_size_max_pt") or block.get("font_size_avg_pt")
        is_bold = bool(block.get("is_bold"))

        size_match = False
        if size and median_size:
            size_match = float(size) >= float(median_size) + 2
        elif size:
            size_match = float(size) >= 18.0

        if size_match or is_bold:
            candidates.append(block)

    return candidates


def _bounds_for_heading(
    heading: Dict[str, Any],
    headings: List[Dict[str, Any]],
) -> Tuple[float, float, float, float]:
    left = float(heading.get("left_norm") or 0.0)
    top = float(heading.get("top_norm") or 0.0)
    width = float(heading.get("width_norm") or 0.0)
    height = float(heading.get("height_norm") or 0.0)
    cx = float(heading.get("center_x_norm") or (left + width / 2.0))

    min_x = max(0.0, left - 0.02)
    max_x = min(1.0, left + max(width, 0.2) + 0.08)
    min_y = max(0.0, top - 0.01)
    max_y = min(1.0, top + max(height, 0.18) + 0.35)

    # Clamp vertically to the next heading in the same column.
    below = [
        h
        for h in headings
        if h is not heading
        and float(h.get("top_norm") or 0.0) > top
        and abs(float(h.get("center_x_norm") or 0.0) - cx) < 0.18
    ]
    if below:
        next_heading = min(below, key=lambda h: float(h.get("top_norm") or 1.0))
        next_top = float(next_heading.get("top_norm") or max_y)
        max_y = min(max_y, next_top - 0.02)

    return min_x, max_x, min_y, max_y


def _in_bounds(block: Dict[str, Any], bounds: Tuple[float, float, float, float]) -> bool:
    min_x, max_x, min_y, max_y = bounds
    cx = float(block.get("center_x_norm") or 0.0)
    cy = float(block.get("center_y_norm") or 0.0)
    return min_x <= cx <= max_x and min_y <= cy <= max_y


def detect_heading_groups(
    blocks: List[Dict[str, Any]],
    used_indices: Set[int] | None = None,
) -> Tuple[List[Dict[str, Any]], Set[int]]:
    """
    Group heading + body blocks without numeric markers (card/tile layouts).
    """
    if not blocks:
        return [], set()

    used_indices = set(used_indices or set())
    headings = _heading_candidates(blocks)
    if len(headings) < 2:
        return [], set()

    structured_items: List[Dict[str, Any]] = []
    new_used: Set[int] = set()

    for heading in headings:
        heading_idx = heading.get("index")
        if not isinstance(heading_idx, int):
            continue
        if heading_idx in used_indices or heading_idx in new_used:
            continue

        bounds = _bounds_for_heading(heading, headings)
        candidates = [
            b for b in blocks
            if b is not heading
            and isinstance(b.get("index"), int)
            and b.get("index") not in used_indices
            and b.get("index") not in new_used
            and _in_bounds(b, bounds)
        ]

        if not candidates:
            continue

        candidates.sort(key=lambda b: float(b.get("top_norm") or 0.0))
        body_blocks = []
        for block in candidates:
            content = str(block.get("content") or "").strip()
            if not content:
                continue
            if _is_number_like(content):
                continue
            body_blocks.append(block)
            if len(body_blocks) >= 4:
                break

        heading_lines = _split_text_lines(heading.get("content"))
        heading_text = heading_lines[0] if heading_lines else str(heading.get("content") or "").strip()
        heading_body_lines = heading_lines[1:]

        body_texts: List[str] = []
        for b in body_blocks:
            if b.get("content"):
                body_texts.extend(_split_text_lines(b.get("content")))
        if heading_body_lines:
            body_texts = heading_body_lines + body_texts
        if not body_texts:
            continue

        source_indices = {heading_idx}
        for b in body_blocks:
            if isinstance(b.get("index"), int):
                source_indices.add(int(b.get("index")))

        new_used.update(source_indices)
        structured_items.append(
            {
                "number": None,
                "heading": heading_text,
                "body": body_texts,
                "source_indices": sorted(source_indices),
            }
        )

    structured_items.sort(
        key=lambda item: (
            min(
                (
                    float(next((b.get("top_norm") for b in blocks if b.get("index") == idx), 0.0))
                    for idx in item.get("source_indices", [])
                ),
                default=0.0,
            ),
            min(
                (
                    float(next((b.get("left_norm") for b in blocks if b.get("index") == idx), 0.0))
                    for idx in item.get("source_indices", [])
                ),
                default=0.0,
            ),
        )
    )

    return structured_items, new_used


def enhance_slide_structure(slides: List[Dict[str, Any]]) -> None:
    for slide in slides:
        blocks = slide.get("text_ordered") or slide.get("text_content") or []
        if not blocks:
            continue

        used_indices = set(slide.get("structured_used_indices") or [])
        existing_items = list(slide.get("structured_items") or [])

        new_items, new_used = detect_heading_groups(blocks, used_indices)
        if not new_items:
            continue

        merged_items = existing_items + new_items
        merged_used = used_indices | new_used

        slide["structured_items"] = merged_items
        slide["structured_used_indices"] = sorted(merged_used)
        slide["structured_text"] = _build_structured_text(merged_items)


def _build_structured_text(structured_items: List[Dict[str, Any]]) -> str:
    lines: List[str] = []
    for item in structured_items:
        number = str(item.get("number") or "").strip()
        heading = str(item.get("heading") or "").strip()
        body = " ".join(str(t).strip() for t in item.get("body") or [] if str(t).strip())

        prefix = f"{number}. " if number else ""
        if heading and body:
            lines.append(f"{prefix}{heading}: {body}".strip())
        elif heading:
            lines.append(f"{prefix}{heading}".strip())
        elif body:
            lines.append(f"{prefix}{body}".strip())

    return "\n".join(line for line in lines if line)
