"""
Vision Analyzer - Uses a vision-capable LLM (vLLM OpenAI-compatible API)
to refine reading order, classify images, and produce slide summaries.
"""
from __future__ import annotations

import asyncio
import base64
import json
import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Callable, Tuple

import httpx

from ..config import (
    VISION_ANALYZER_ENABLED,
    VISION_VLLM_URL,
    VISION_MODEL,
    VISION_TIMEOUT_SECONDS,
    VISION_MAX_TOKENS,
    VISION_MAX_CONCURRENCY,
    VISION_MAX_SLIDES,
    VISION_OVERRIDE_READING_ORDER,
)


JsonDict = Dict[str, Any]
ProgressFn = Callable[[int, int, int], None]


@dataclass
class VisionAnalysisResult:
    reading_order: List[Dict[str, Any]]
    images: List[Dict[str, Any]]
    summary: str
    errors: List[str]


class VisionAnalyzer:
    def __init__(self) -> None:
        self.enabled = VISION_ANALYZER_ENABLED
        self.base_url = VISION_VLLM_URL.rstrip("/")
        if not self.base_url.endswith("/v1"):
            self.base_url = f"{self.base_url}/v1"
        self.model = VISION_MODEL
        self.timeout = VISION_TIMEOUT_SECONDS
        self.max_tokens = VISION_MAX_TOKENS
        self.max_concurrency = max(1, VISION_MAX_CONCURRENCY)
        self.max_slides = VISION_MAX_SLIDES

    async def analyze_slides(
        self,
        slides: List[Dict[str, Any]],
        image_paths: List[str],
        lang: str = "de",
        on_progress: Optional[ProgressFn] = None,
    ) -> None:
        if not self.enabled:
            return
        if not slides or not image_paths:
            return

        total = min(len(slides), len(image_paths), self.max_slides)
        if total <= 0:
            return

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            if not await self._is_available(client):
                return

            semaphore = asyncio.Semaphore(self.max_concurrency)
            progress_lock = asyncio.Lock()
            processed = 0

            async def _process(idx: int) -> None:
                nonlocal processed
                slide = slides[idx]
                slide_num = int(slide.get("slide_number") or idx + 1)
                image_path = image_paths[idx]

                async with semaphore:
                    try:
                        with open(image_path, "rb") as f:
                            image_bytes = f.read()
                    except Exception as exc:
                        self._attach_error(slide, f"vision:load_failed:{exc}")
                        return

                    result = await self._analyze_slide(client, slide, image_bytes, lang)
                    self._apply_result(slide, result)

                if on_progress:
                    async with progress_lock:
                        processed += 1
                        count = processed
                    on_progress(slide_num, count, total)

                await asyncio.sleep(0)  # allow cancellation

            tasks = [asyncio.create_task(_process(idx)) for idx in range(total)]
            for task in asyncio.as_completed(tasks):
                await task

    async def _is_available(self, client: httpx.AsyncClient) -> bool:
        try:
            response = await client.get(f"{self.base_url}/models", timeout=10)
            return response.status_code == 200
        except Exception:
            return False

    async def _analyze_slide(
        self,
        client: httpx.AsyncClient,
        slide: Dict[str, Any],
        image_bytes: bytes,
        lang: str,
    ) -> VisionAnalysisResult:
        errors: List[str] = []
        reading_order: List[Dict[str, Any]] = []
        images: List[Dict[str, Any]] = []
        summary_text = ""

        slide_title = str(slide.get("title") or f"Folie {slide.get('slide_number', '')}").strip()
        text_candidates = _collect_text_candidates(slide)
        visible_text = "\n".join(text_candidates[:30])

        structure_prompt = _build_structure_prompt(slide_title, text_candidates, lang)
        summary_prompt = _build_summary_prompt(slide_title, visible_text, lang)

        prompts: List[Tuple[str, str]] = []
        if _should_request_structure_prompt(text_candidates):
            prompts.append(("structure", structure_prompt))
        else:
            slide.setdefault("vision_analysis", {})["structure_skipped"] = True

        if _should_request_image_prompt(slide):
            prompts.append(("images", _build_image_prompt(slide_title, visible_text, lang)))
        else:
            slide.setdefault("vision_analysis", {})["images_skipped"] = True
        prompts.append(("summary", summary_prompt))

        for key, prompt in prompts:
            try:
                raw = await self._call_vllm(client, prompt, image_bytes)
                parsed = _parse_json_response(raw)
                if key == "structure" and parsed:
                    reading_order = parsed.get("reading_order") or []
                elif key == "images" and parsed:
                    images = parsed.get("images") or []
                elif key == "summary" and parsed:
                    summary_text = str(parsed.get("summary") or "").strip()
            except Exception as exc:
                errors.append(f"{key}:{exc}")

        return VisionAnalysisResult(
            reading_order=_normalize_reading_order(reading_order),
            images=_normalize_image_classifications(images),
            summary=summary_text,
            errors=errors,
        )

    async def _call_vllm(self, client: httpx.AsyncClient, prompt: str, image_bytes: bytes) -> str:
        image_b64 = base64.b64encode(image_bytes).decode("utf-8")
        data_uri = f"data:image/png;base64,{image_b64}"

        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": data_uri}},
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
            "max_tokens": self.max_tokens,
            "temperature": 0.2,
        }

        response = await client.post(f"{self.base_url}/chat/completions", json=payload)
        response.raise_for_status()
        data = response.json()
        return str(data.get("choices", [{}])[0].get("message", {}).get("content", ""))

    def _apply_result(self, slide: Dict[str, Any], result: VisionAnalysisResult) -> None:
        slide.setdefault("vision_analysis", {})
        slide["vision_analysis"].update(
            {
                "reading_order": result.reading_order,
                "images": result.images,
                "summary": result.summary,
                "errors": result.errors,
            }
        )

        if VISION_OVERRIDE_READING_ORDER:
            applied = _apply_reading_order(slide, result.reading_order)
            slide["vision_analysis"]["reading_order_applied"] = applied

        applied_images = _apply_image_classifications(slide, result.images)
        slide["vision_analysis"]["images_applied"] = applied_images

        if result.summary:
            slide["vision_summary"] = result.summary
            if not slide.get("slide_summary") and not slide.get("diagram_summary"):
                slide["diagram_summary"] = result.summary

        if result.errors:
            slide["vision_analysis"]["status"] = "partial"
        else:
            slide["vision_analysis"]["status"] = "ok"


def _collect_text_candidates(slide: Dict[str, Any]) -> List[str]:
    texts: List[str] = []
    for block in slide.get("text_content", []) or []:
        content = str(block.get("content") or "").strip()
        if content:
            texts.extend([line.strip() for line in content.split("\n") if line.strip()])
    for shape in slide.get("shapes", []) or []:
        if isinstance(shape, dict) and shape.get("text"):
            text = str(shape.get("text")).strip()
            if text:
                texts.append(text)
    title = str(slide.get("title") or "").strip()
    if title:
        texts.insert(0, title)
    # Deduplicate while preserving order
    seen = set()
    deduped = []
    for t in texts:
        if t not in seen:
            seen.add(t)
            deduped.append(t)
    return deduped


def _build_structure_prompt(title: str, candidates: List[str], lang: str) -> str:
    prompt_lines = [
        "Analysiere die Folie visuell und gib die optimale Lesereihenfolge zurück.",
        "Nutze nur die erkannten Texte unten, keine neuen Wörter erfinden.",
        "Antworte NUR mit JSON im Format:",
        '{"reading_order": [{"text": "...", "role": "heading|body|list_item"}]}',
        f"Titel: {title}",
        "Erkannte Texte:",
    ]
    for text in candidates[:40]:
        prompt_lines.append(f"- {text}")
    if lang.lower().startswith("en"):
        prompt_lines[0] = "Visually analyze the slide and return the optimal reading order."
        prompt_lines[1] = "Use ONLY the detected texts below, do not invent new words."
        prompt_lines[2] = "Reply ONLY with JSON format:"
        prompt_lines[4] = f"Title: {title}"
        prompt_lines[5] = "Detected texts:"
    return "\n".join(prompt_lines)


def _build_image_prompt(title: str, visible_text: str, lang: str) -> str:
    if lang.lower().startswith("en"):
        return (
            "Classify each visual element on the slide as content, decorative, diagram, or screenshot.\n"
            "Return JSON: {\"images\": [{\"label\": \"content|decorative|diagram|screenshot\","
            " \"bbox\": [x,y,w,h], \"alt_text\": \"...\", \"description\": \"...\", \"ocr_text\": \"...\"}]}\n"
            "bbox is relative (0-1) with x/y at top-left.\n"
            f"Title: {title}\n"
            f"Visible text:\n{visible_text}"
        )
    return (
        "Klassifiziere jedes visuelle Element als content, decorative, diagram oder screenshot.\n"
        "Antworte mit JSON: {\"images\": [{\"label\": \"content|decorative|diagram|screenshot\","
        " \"bbox\": [x,y,w,h], \"alt_text\": \"...\", \"description\": \"...\", \"ocr_text\": \"...\"}]}\n"
        "bbox ist relativ (0-1) mit x/y links oben.\n"
        f"Titel: {title}\n"
        f"Sichtbarer Text:\n{visible_text}"
    )


def _build_summary_prompt(title: str, visible_text: str, lang: str) -> str:
    if lang.lower().startswith("en"):
        return (
            "Write a 2-3 sentence summary for a German public administration audience.\n"
            "Reply ONLY with JSON: {\"summary\": \"...\"}\n"
            f"Title: {title}\n"
            f"Visible text:\n{visible_text}"
        )
    return (
        "Schreibe eine 2-3 Satz Zusammenfassung für Sachbearbeiter:innen der DRV.\n"
        "Antworte NUR mit JSON: {\"summary\": \"...\"}\n"
        f"Titel: {title}\n"
        f"Sichtbarer Text:\n{visible_text}"
    )


def _parse_json_response(raw: str) -> Optional[JsonDict]:
    if not raw:
        return None
    raw = raw.strip()
    try:
        return json.loads(raw)
    except Exception:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            return None
        try:
            return json.loads(match.group(0))
        except Exception:
            return None


def _normalize_reading_order(order: Any) -> List[Dict[str, Any]]:
    if not order:
        return []
    normalized: List[Dict[str, Any]] = []
    if isinstance(order, list):
        for item in order:
            if isinstance(item, dict):
                text = str(item.get("text") or "").strip()
                if text:
                    normalized.append({"text": text, "role": item.get("role")})
            elif isinstance(item, str):
                text = item.strip()
                if text:
                    normalized.append({"text": text, "role": None})
    return normalized


def _normalize_image_classifications(items: Any) -> List[Dict[str, Any]]:
    if not items:
        return []
    normalized: List[Dict[str, Any]] = []
    if isinstance(items, list):
        for item in items:
            if not isinstance(item, dict):
                continue
            label = str(item.get("label") or "").strip().lower()
            bbox = item.get("bbox") or item.get("box") or []
            alt_text = str(item.get("alt_text") or "").strip()
            description = str(item.get("description") or "").strip()
            ocr_text = str(item.get("ocr_text") or "").strip()
            if label:
                normalized.append(
                    {
                        "label": label,
                        "bbox": bbox,
                        "alt_text": alt_text,
                        "description": description,
                        "ocr_text": ocr_text,
                    }
                )
    return normalized


def _apply_reading_order(slide: Dict[str, Any], order: List[Dict[str, Any]]) -> bool:
    blocks = slide.get("text_content") or []
    if not blocks or not order:
        return False

    remaining = list(blocks)
    ordered_blocks: List[Dict[str, Any]] = []
    for item in order:
        target = _normalize_text(item.get("text") or "")
        if not target:
            continue
        match_idx, score = _find_best_match(target, remaining)
        if match_idx is not None and score >= 0.55:
            ordered_blocks.append(remaining.pop(match_idx))

    ordered_blocks.extend(remaining)
    if ordered_blocks:
        slide["text_ordered"] = ordered_blocks
        return True
    return False


def _find_best_match(target: str, blocks: List[Dict[str, Any]]) -> Tuple[Optional[int], float]:
    best_idx = None
    best_score = 0.0
    for idx, block in enumerate(blocks):
        content = _normalize_text(str(block.get("content") or ""))
        if not content:
            continue
        score = SequenceMatcher(None, target, content).ratio()
        if score > best_score:
            best_score = score
            best_idx = idx
    return best_idx, best_score


def _normalize_text(text: str) -> str:
    if not text:
        return ""
    value = text.lower()
    value = re.sub(r"[\s\-–—_:;.,!?()\\[\\]{}]", "", value)
    return value


def _should_request_structure_prompt(candidates: List[str]) -> bool:
    return len(candidates) > 1


def _should_request_image_prompt(slide: Dict[str, Any]) -> bool:
    # Run image prompt only when the slide likely contains visuals worth classifying.
    if slide.get("images"):
        return True
    if slide.get("complexity") == "complex":
        return True
    if slide.get("is_visual_diagram") or slide.get("is_fragmented"):
        return True
    if slide.get("has_chart") or slide.get("has_table"):
        return True
    return False


def _apply_image_classifications(slide: Dict[str, Any], items: List[Dict[str, Any]]) -> int:
    images = slide.get("images") or []
    if not images or not items:
        return 0

    matches = _match_images_to_boxes(images, items)
    applied = 0
    for img, item in matches:
        label = item.get("label")
        alt_text = item.get("alt_text") or item.get("description") or ""
        ocr_text = item.get("ocr_text") or ""

        img["vision_class"] = label
        img["vision_alt_text"] = alt_text
        img["vision_ocr_text"] = ocr_text
        img["alt_text_source"] = "vision"

        if label == "decorative":
            img["alt_text"] = ""
            img["decorative"] = True
        else:
            if alt_text:
                img["alt_text"] = alt_text
            img["decorative"] = False

        if label == "diagram" and alt_text:
            img["diagram_description"] = alt_text
        if label == "screenshot" and ocr_text:
            img["ocr_text"] = ocr_text

        applied += 1

    return applied


def _match_images_to_boxes(
    images: List[Dict[str, Any]],
    items: List[Dict[str, Any]],
) -> List[Tuple[Dict[str, Any], Dict[str, Any]]]:
    candidates = []
    for item in items:
        bbox = item.get("bbox") or []
        if len(bbox) != 4:
            continue
        x, y, w, h = bbox
        try:
            cx = float(x) + float(w) / 2.0
            cy = float(y) + float(h) / 2.0
        except Exception:
            continue
        candidates.append((item, cx, cy))

    if not candidates:
        return []

    matches: List[Tuple[Dict[str, Any], Dict[str, Any]]] = []
    used_items = set()
    for img in images:
        cx = float(img.get("center_x_norm") or 0.0)
        cy = float(img.get("center_y_norm") or 0.0)
        best_item = None
        best_dist = 1e9
        for item, bx, by in candidates:
            if id(item) in used_items:
                continue
            dist = (cx - bx) ** 2 + (cy - by) ** 2
            if dist < best_dist:
                best_dist = dist
                best_item = item
        if best_item is not None:
            used_items.add(id(best_item))
            matches.append((img, best_item))

    return matches


def _attach_error(slide: Dict[str, Any], message: str) -> None:
    slide.setdefault("vision_analysis", {})
    errors = slide["vision_analysis"].get("errors") or []
    errors.append(message)
    slide["vision_analysis"]["errors"] = errors
