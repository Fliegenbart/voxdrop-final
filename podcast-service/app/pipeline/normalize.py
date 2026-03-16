from __future__ import annotations

from collections import Counter
from typing import Any, Dict, List

from app.pipeline.models import Slide, SlideImage


def normalize_slides(raw_slides: List[Dict[str, Any]]) -> List[Slide]:
    """
    Normalize slide data from the parser into a typed structure and remove common noise.
    """
    slides: List[Slide] = []
    for s in raw_slides:
        images = []
        for img in s.get("images", []) or []:
            images.append(SlideImage(description=img.get("description") or None))
        slides.append(
            Slide(
                slide_number=int(s.get("slide_number") or 0),
                title=str(s.get("title") or "").strip(),
                content=[str(x).strip() for x in (s.get("content") or []) if str(x).strip()],
                speaker_notes=str(s.get("speaker_notes") or "").strip(),
                images=images,
            )
        )

    slides = [s for s in slides if s.slide_number > 0]
    slides.sort(key=lambda x: x.slide_number)

    _strip_repeating_footer_lines(slides)
    _dedupe_lines(slides)
    return slides


def _strip_repeating_footer_lines(slides: List[Slide]) -> None:
    """
    Heuristic: Remove content lines that repeat on most slides (typical footer/header noise).
    """
    if len(slides) < 6:
        return

    lines: List[str] = []
    for s in slides:
        for line in s.content:
            if len(line) < 6:
                continue
            lines.append(line)

    counts = Counter(lines)
    threshold = max(4, int(len(slides) * 0.6))
    noisy = {line for line, c in counts.items() if c >= threshold}
    if not noisy:
        return

    for s in slides:
        s.content = [x for x in s.content if x not in noisy]


def _dedupe_lines(slides: List[Slide]) -> None:
    for s in slides:
        seen = set()
        deduped = []
        for line in s.content:
            key = line.strip()
            if not key:
                continue
            if key in seen:
                continue
            seen.add(key)
            deduped.append(key)
        s.content = deduped

