from __future__ import annotations

import re
from typing import Any, Dict, List


PLACEHOLDER_RE = re.compile(r"^(folie|slide)\s*\d+$", re.IGNORECASE)
WORD_RE = re.compile(r"[A-Za-zÄÖÜäöüß]+", re.UNICODE)
CARD_HEADING_RE = re.compile(r"^[A-ZÄÖÜ0-9][A-ZÄÖÜ0-9/&+\\\- ]{1,24}$", re.UNICODE)
LIST_MARKER_RE = re.compile(r"^([\-•*]|[0-9]{1,2}[.)])\s+")
NUMBER_ONLY_RE = re.compile(r"^\d{1,3}$")


def _normalize_title(title: str) -> str:
    value = re.sub(r"\s+", " ", str(title or "").strip().lower())
    value = re.sub(r"[^\w\säöüß-]", "", value)
    return value


def _is_placeholder(title: str, slide_number: int) -> bool:
    if not title or not str(title).strip():
        return True
    cleaned = str(title).strip()
    if cleaned.isdigit():
        return True
    if PLACEHOLDER_RE.match(cleaned):
        return True
    if _normalize_title(cleaned) in {f"folie {slide_number}", f"slide {slide_number}"}:
        return True
    return False


def _contains_noun_like(text: str) -> bool:
    tokens = WORD_RE.findall(text)
    if not tokens:
        return False
    if len(tokens) >= 2 and sum(len(token) for token in tokens) >= 10:
        return True

    # Heuristic: at least one token starting with uppercase not at start.
    for idx, token in enumerate(tokens):
        if idx == 0:
            continue
        if token[0].isupper() and len(token) > 2:
            return True
    # Fallback: any mid-word uppercase (e.g. rvEvolution)
    return any(any(ch.isupper() for ch in token[1:]) for token in tokens)


def _first_sentence(text: str, max_len: int = 100) -> str:
    value = re.sub(r"\s+", " ", str(text or "").strip())
    if not value:
        return ""
    sentence = re.split(r"(?<=[.!?])\s+", value)[0]
    sentence = sentence.strip()
    if len(sentence) > max_len:
        sentence = sentence[: max_len - 1].rstrip() + "…"
    return sentence


def _line_head(text: str) -> str:
    lines = [part.strip() for part in str(text or "").replace("\r", "\n").split("\n")]
    for line in lines:
        if line:
            return line
    return ""


def _is_card_heading_like(text: str) -> bool:
    value = _line_head(text)
    if not value:
        return False
    if len(value) > 28:
        return False
    words = [w for w in re.split(r"\s+", value) if w]
    if len(words) > 3:
        return False
    return bool(CARD_HEADING_RE.match(value))


def _is_bad_candidate(text: str) -> bool:
    value = _line_head(text)
    if not value:
        return True
    if NUMBER_ONLY_RE.match(value):
        return True
    if PLACEHOLDER_RE.match(value):
        return True
    if LIST_MARKER_RE.match(value):
        return True
    if len(value) <= 2:
        return True
    if value.lower() in {"agenda", "inhaltsverzeichnis"}:
        return False
    return False


def _is_quality_candidate(text: str) -> bool:
    value = _line_head(text)
    if not value or _is_bad_candidate(value):
        return False
    words = WORD_RE.findall(value)
    if len(words) >= 2 and sum(len(w) for w in words) >= 8:
        return True
    return _contains_noun_like(value)


def _block_top_norm(block: Dict[str, Any], fallback: float = 0.5) -> float:
    try:
        return float(block.get("top_norm") or fallback)
    except Exception:
        return fallback


def _collect_title_candidates(slide: Dict[str, object]) -> List[Dict[str, object]]:
    candidates: List[Dict[str, object]] = []
    blocks = slide.get("text_ordered") or slide.get("text_content") or []
    if not isinstance(blocks, list):
        blocks = []

    for block in blocks:
        if not isinstance(block, dict):
            continue
        raw = _line_head(str(block.get("content") or ""))
        if _is_bad_candidate(raw):
            continue
        top_norm = _block_top_norm(block, fallback=0.5)
        size = float(block.get("font_size_max_pt") or block.get("font_size_avg_pt") or 0.0)
        score = 0.0
        if block.get("is_title"):
            score += 10.0
        if top_norm <= 0.18:
            score += 8.0
        elif top_norm <= 0.30:
            score += 4.0
        score += min(size, 72.0) / 6.0
        if block.get("is_bold"):
            score += 3.0
        if _is_card_heading_like(raw):
            score -= 6.0
        if 4 <= len(raw) <= 120:
            score += 2.0
        candidates.append(
            {
                "text": raw,
                "source": "text_block",
                "score": score,
                "top_norm": top_norm,
                "is_top_band": top_norm <= 0.18,
                "card_heading_like": _is_card_heading_like(raw),
            }
        )

    structured_items = slide.get("structured_items") or []
    if isinstance(structured_items, list):
        for item in structured_items:
            if not isinstance(item, dict):
                continue
            heading = _line_head(str(item.get("heading") or ""))
            if _is_bad_candidate(heading):
                continue
            candidates.append(
                {
                    "text": heading,
                    "source": "structured_heading",
                    "score": 2.5 - (4.0 if _is_card_heading_like(heading) else 0.0),
                    "top_norm": 0.55,
                    "is_top_band": False,
                    "card_heading_like": _is_card_heading_like(heading),
                }
            )

    summary_text = _first_sentence(str(slide.get("slide_summary") or ""), max_len=90)
    if summary_text and _is_quality_candidate(summary_text):
        candidates.append(
            {
                "text": summary_text,
                "source": "summary",
                "score": 1.0,
                "top_norm": 0.9,
                "is_top_band": False,
                "card_heading_like": False,
            }
        )

    notes_text = _first_sentence(str(slide.get("speaker_notes") or ""), max_len=90)
    if notes_text and _is_quality_candidate(notes_text):
        candidates.append(
            {
                "text": notes_text,
                "source": "speaker_notes",
                "score": 0.5,
                "top_norm": 0.95,
                "is_top_band": False,
                "card_heading_like": False,
            }
        )

    deduped: List[Dict[str, object]] = []
    seen: set[str] = set()
    for candidate in sorted(
        candidates,
        key=lambda item: (
            float(item.get("score") or 0.0),
            -float(item.get("top_norm") or 1.0),
            len(str(item.get("text") or "")),
        ),
        reverse=True,
    ):
        normalized = _normalize_title(str(candidate.get("text") or ""))
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(candidate)

    top_band_exists = any(bool(c.get("is_top_band")) and _is_quality_candidate(str(c.get("text") or "")) for c in deduped)
    if top_band_exists:
        for candidate in deduped:
            if candidate.get("source") == "structured_heading" and not candidate.get("is_top_band"):
                candidate["score"] = float(candidate.get("score") or 0.0) - 3.0

    return sorted(deduped, key=lambda item: float(item.get("score") or 0.0), reverse=True)


def _sanitize_title(title: str) -> str:
    value = re.sub(r"\s+", " ", str(title or "").strip())
    for prefix in ("Die Folie", "Diese Folie"):
        if value.lower().startswith(prefix.lower()):
            value = value[len(prefix):].lstrip(" :.-")
            break
    return value[:100].strip()


def _make_unique(title: str, slide_number: int, seen: set[str]) -> str:
    normalized = _normalize_title(title)
    if normalized not in seen:
        seen.add(normalized)
        return title
    suffix = f" (Folie {slide_number})"
    candidate = f"{title}{suffix}"
    normalized_candidate = _normalize_title(candidate)
    if normalized_candidate in seen:
        candidate = f"{title} #{slide_number}"
    seen.add(_normalize_title(candidate))
    return candidate


def _title_in_top_band(slide: Dict[str, object], title: str) -> bool:
    target = _normalize_title(title)
    if not target:
        return False
    blocks = slide.get("text_ordered") or slide.get("text_content") or []
    if not isinstance(blocks, list):
        return False
    for block in blocks:
        if not isinstance(block, dict):
            continue
        top_norm = _block_top_norm(block, fallback=1.0)
        if top_norm > 0.20:
            continue
        content = _normalize_title(_line_head(str(block.get("content") or "")))
        if content and (content == target or target in content or content in target):
            return True
    return False


def _is_structured_heading(slide: Dict[str, object], title: str) -> bool:
    target = _normalize_title(title)
    if not target:
        return False
    for item in slide.get("structured_items") or []:
        if not isinstance(item, dict):
            continue
        heading_norm = _normalize_title(str(item.get("heading") or ""))
        if heading_norm and heading_norm == target:
            return True
    return False


def _should_correct_existing_title(
    slide: Dict[str, object],
    current_title: str,
    best_candidate: Dict[str, object] | None,
) -> bool:
    if not current_title or not best_candidate:
        return False
    best_text = str(best_candidate.get("text") or "").strip()
    if not best_text or not _is_quality_candidate(best_text):
        return False
    if not bool(best_candidate.get("is_top_band")):
        return False
    if _title_in_top_band(slide, current_title):
        return False
    if _normalize_title(current_title) == _normalize_title(best_text):
        return False
    if _is_card_heading_like(current_title):
        return True
    if _is_structured_heading(slide, current_title):
        return True
    return False


def ensure_slide_titles(
    slides: List[Dict[str, object]],
    *,
    allow_non_placeholder_correction: bool = False,
) -> None:
    """Infer missing/placeholder titles and mutate slide titles in-place."""
    seen: set[str] = set()
    for slide in slides:
        title = str(slide.get("title") or "").strip()
        slide_number = int(slide.get("slide_number") or 0)
        candidates = _collect_title_candidates(slide)
        best_candidate = candidates[0] if candidates else None

        if not _is_placeholder(title, slide_number):
            if allow_non_placeholder_correction and _should_correct_existing_title(slide, title, best_candidate):
                corrected = _sanitize_title(str(best_candidate.get("text") or ""))
                if corrected and corrected != title:
                    print(
                        f"[TitleInference] Slide {slide_number}: '{title}' -> '{corrected}' (top_band_override)"
                    )
                    slide["title"] = corrected
                    slide["title_source"] = "top_band_override"
                    title = corrected
            seen.add(_normalize_title(title))
            continue

        candidate = str(best_candidate.get("text") or "").strip() if best_candidate else ""
        if not candidate or not _is_quality_candidate(candidate):
            summary = slide.get("slide_summary") or ""
            candidate = _first_sentence(summary, max_len=80)

        if (not candidate or not _is_quality_candidate(candidate)) and slide.get("speaker_notes"):
            candidate = _first_sentence(slide.get("speaker_notes"), max_len=80)

        if not candidate:
            fallback_source = ""
            blocks = slide.get("text_ordered") or slide.get("text_content") or []
            if isinstance(blocks, list):
                for block in blocks:
                    if not isinstance(block, dict):
                        continue
                    raw = _line_head(str(block.get("content") or ""))
                    if not _is_bad_candidate(raw):
                        fallback_source = raw
                        break
            words = WORD_RE.findall(fallback_source)[:5]
            candidate = " ".join(words)

        candidate = _sanitize_title(candidate)
        if not candidate:
            candidate = f"Folie {slide_number}"

        candidate = _make_unique(candidate, slide_number, seen)
        if candidate and candidate != title:
            print(f"[TitleInference] Slide {slide_number}: '{title}' -> '{candidate}'")
            slide["title"] = candidate
            if slide.get("title_source") in (None, "", "shape_title"):
                slide["title_source"] = "inferred"
