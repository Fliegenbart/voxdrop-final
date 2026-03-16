"""
PDF/UA Conversion Service - FastAPI Entry Point
Converts PPTX to accessible PDF/UA with smart alt-text generation.
"""
import os
import uuid
import asyncio
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, Any, Optional, List, Set, Tuple
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from .config import (
    DEBUG,
    LOG_LEVEL,
    UPLOAD_DIR,
    JOBS_DIR,
    OUTPUT_DIR,
    VLM_CONFIG,
    PDFUA_JAVA_URL,
    MAX_FILE_SIZE_MB,
    MAX_SLIDES,
    MAX_PDF_PAGES,
    PDF_RENDER_DPI,
    PROCESS_VERSION,
    PDF_VLM_MAX_PAGES,
    PDF_VLM_MAX_TARGETS,
    PDF_VLM_TEXT_THRESHOLD,
    GPU_LOCK_WAIT_MS,
    GPU_LOCK_QUEUE_UPDATE_MS,
    GPU_LOCK_WATCHDOG_INTERVAL,
    GPU_QUEUE_AVG_SECONDS_STANDARD,
    GPU_QUEUE_AVG_SECONDS_HIGH,
    DEDUPLICATION_THRESHOLD,
    VLM_MAX_SLIDES,
    VLM_MAX_RENDER_SLIDES,
    VLM_MAX_IMAGES_PER_SLIDE,
    VLM_MIN_IMAGE_AREA_RATIO,
    VLM_SKIP_TEXT_THRESHOLD,
    PDFUA_LANG,
    VISION_ANALYZER_ENABLED,
    DETECT_DECORATIVE_IMAGES,
    INTERNAL_COMMENT_WHITELIST,
    PODCAST_PACK_MAX_LLM_SLIDES,
    PODCAST_PACK_SUMMARY_TIMEOUT_SECONDS,
    PODCAST_PACK_OVERVIEW_TIMEOUT_SECONDS,
)
from .utils.gpu_lock import (
    acquire_gpu_lock,
    release_gpu_lock,
    get_gpu_lock_token,
    release_gpu_lock_token,
    GpuLock,
    enqueue_gpu_queue,
    dequeue_gpu_queue,
    touch_gpu_queue,
    get_gpu_queue_position,
)

# Create directories
for directory in [UPLOAD_DIR, JOBS_DIR, OUTPUT_DIR]:
    os.makedirs(directory, exist_ok=True)

# ----------------------------
# Metadata inference / hygiene
# ----------------------------

def _normalize_meta_string(value: object | None) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    return text


def _looks_like_template_title(title: str) -> bool:
    """Heuristics for PPT template/master titles that should not become the PDF title."""
    if not title:
        return False
    lowered = title.strip().lower()
    bad_markers = (
        "ppt master",
        "powerpoint",
        "presentation",
        "template",
        "vorlage",
        "masterfolie",
        "folienmaster",
    )
    return any(marker in lowered for marker in bad_markers)


def _strip_filename_ext(name: str) -> str:
    return str(name or "").rsplit(".", 1)[0]


def _derive_document_title(
    slides: list[dict[str, object]] | None,
    filename: str,
    doc_meta: object | None,
) -> str:
    """
    Prefer the content of the first slide (title placeholder / inferred title).
    Only fall back to PPTX metadata when the first slide doesn't provide a meaningful title.
    """
    fallback = _strip_filename_ext(filename)

    first_slide_title = ""
    if slides:
        first_slide_title = _normalize_meta_string(slides[0].get("title"))
        # Avoid placeholder titles like "Folie 1".
        if first_slide_title.lower() in {"folie 1", "slide 1", "folie", "slide"}:
            first_slide_title = ""

    if first_slide_title:
        return first_slide_title

    if isinstance(doc_meta, dict):
        meta_title = _normalize_meta_string(doc_meta.get("title"))
        if meta_title and not _looks_like_template_title(meta_title):
            return meta_title

    return fallback


def _sanitize_author(author: object | None, document_title: str, doc_meta: object | None) -> str | None:
    value = _normalize_meta_string(author)
    if not value:
        return None

    title_norm = _normalize_meta_string(document_title).lower()
    value_norm = value.lower()
    if title_norm and value_norm == title_norm:
        return None

    if isinstance(doc_meta, dict):
        meta_title = _normalize_meta_string(doc_meta.get("title")).lower()
        if meta_title and value_norm == meta_title:
            return None

    # Drop obvious template/master placeholders.
    if _looks_like_template_title(value):
        return None

    return value


def _sanitize_subject(subject: object | None, document_title: str, doc_meta: object | None) -> str | None:
    value = _normalize_meta_string(subject)
    if not value:
        return None

    lowered = value.lower().strip()
    bad_markers = (
        "ppt template",
        "ppt",
        "template",
        "vorlage",
        "master",
        "powerpoint",
        "presentation",
    )
    if any(marker in lowered for marker in bad_markers) and len(lowered) <= 40:
        return None

    title_norm = _normalize_meta_string(document_title).lower()
    if title_norm and lowered == title_norm:
        return None

    if isinstance(doc_meta, dict):
        meta_title = _normalize_meta_string(doc_meta.get("title")).lower()
        if meta_title and lowered == meta_title:
            return None

    return value

# In-memory job storage
jobs: Dict[str, Dict[str, Any]] = {}

# VLM Captioner (lazy loaded)
vlm_captioner = None
vision_analyzer = None


class JobCancelled(Exception):
    pass


@dataclass(frozen=True)
class QualitySettings:
    name: str
    render_dpi: int
    vlm_max_slides: int
    vlm_max_render_slides: int
    vlm_max_images_per_slide: int
    vlm_min_image_area_ratio: float
    vlm_skip_text_threshold: int
    pdf_vlm_max_targets: int
    pdf_vlm_text_threshold: int
    queue_avg_seconds: int


def _normalize_quality(value: Optional[str]) -> str:
    label = (value or "").strip().lower()
    if label in {"high", "hq", "beste", "quality"}:
        return "high"
    return "standard"


def _normalize_process_version(value: Optional[str]) -> str:
    return "2" if str(value).strip() == "2" else "1"


def _allow_non_placeholder_title_correction(job: Dict[str, Any]) -> bool:
    """
    Enable strict title correction only for the smart summary scope.

    Scope:
    - PPTX conversion
    - processVersion=2
    - summary mode enabled
    """
    return bool(
        job.get("input_type") == "pptx"
        and _normalize_process_version(job.get("process_version")) == "2"
        and bool(job.get("summary_mode"))
    )


def _get_quality_settings(value: Optional[str]) -> QualitySettings:
    quality = _normalize_quality(value)
    if quality == "high":
        return QualitySettings(
            name="high",
            render_dpi=PDF_RENDER_DPI,
            vlm_max_slides=max(1, int(VLM_MAX_SLIDES)),
            vlm_max_render_slides=max(1, int(VLM_MAX_RENDER_SLIDES)),
            vlm_max_images_per_slide=max(1, int(VLM_MAX_IMAGES_PER_SLIDE)),
            vlm_min_image_area_ratio=float(VLM_MIN_IMAGE_AREA_RATIO),
            vlm_skip_text_threshold=int(VLM_SKIP_TEXT_THRESHOLD),
            pdf_vlm_max_targets=max(1, int(PDF_VLM_MAX_TARGETS)),
            pdf_vlm_text_threshold=int(PDF_VLM_TEXT_THRESHOLD),
            queue_avg_seconds=max(30, int(GPU_QUEUE_AVG_SECONDS_HIGH)),
        )

    return QualitySettings(
        name="standard",
        render_dpi=max(96, int(PDF_RENDER_DPI * 0.75)),
        # Standard quality should still be bounded, but not so low that larger PPTX decks lose context.
        vlm_max_slides=max(1, min(12, int(VLM_MAX_SLIDES))),
        vlm_max_render_slides=max(1, min(8, int(VLM_MAX_RENDER_SLIDES))),
        vlm_max_images_per_slide=max(1, min(2, int(VLM_MAX_IMAGES_PER_SLIDE))),
        vlm_min_image_area_ratio=max(float(VLM_MIN_IMAGE_AREA_RATIO), 0.02),
        vlm_skip_text_threshold=max(600, min(1200, int(VLM_SKIP_TEXT_THRESHOLD))),
        pdf_vlm_max_targets=max(1, min(4, int(PDF_VLM_MAX_TARGETS))),
        pdf_vlm_text_threshold=max(400, min(600, int(PDF_VLM_TEXT_THRESHOLD))),
        queue_avg_seconds=max(30, int(GPU_QUEUE_AVG_SECONDS_STANDARD)),
    )


def get_vlm_captioner():
    """Lazy load VLM captioner to avoid startup delay."""
    global vlm_captioner
    if vlm_captioner is None:
        from .processors.vlm_captioner import VLMCaptioner
        vlm_captioner = VLMCaptioner()
    return vlm_captioner


def get_vision_analyzer():
    global vision_analyzer
    if vision_analyzer is None:
        from .processors.vision_analyzer import VisionAnalyzer
        vision_analyzer = VisionAnalyzer()
    return vision_analyzer


def _is_cancelled(job_id: str) -> bool:
    job = jobs.get(job_id)
    return bool(job and job.get("cancelled"))


def _raise_if_cancelled(job_id: str) -> None:
    if _is_cancelled(job_id):
        raise JobCancelled("cancelled")


async def _safe_release_gpu_lock(lock: Optional[GpuLock]) -> None:
    if not lock:
        return
    try:
        await asyncio.shield(release_gpu_lock(lock))
    except Exception:
        pass


async def _gpu_lock_watchdog() -> None:
    if GPU_LOCK_WATCHDOG_INTERVAL <= 0:
        return
    while True:
        await asyncio.sleep(GPU_LOCK_WATCHDOG_INTERVAL)
        token = await get_gpu_lock_token()
        if not token or not token.startswith("pdfua:"):
            continue
        parts = token.split(":")
        if len(parts) < 6:
            continue
        job_id = parts[2]
        job = jobs.get(job_id)
        if not job or job.get("status") in ("completed", "failed"):
            released = await release_gpu_lock_token(token)
            if released:
                print(f"[GPULock] Released stale lock for job {job_id}")


def _text_blocks(slide: Dict[str, Any]) -> List[Dict[str, Any]]:
    blocks = slide.get("text_ordered") or slide.get("text_content") or []
    if not blocks:
        return []
    if slide.get("text_ordered"):
        return list(blocks)
    if any("top_norm" in b for b in blocks if isinstance(b, dict)):
        return sorted(
            [b for b in blocks if isinstance(b, dict)],
            key=lambda b: (
                float(b.get("top_norm") or 0.0),
                float(b.get("left_norm") or 0.0),
            ),
        )
    return [b for b in blocks if isinstance(b, dict)]


def _slide_text_len(slide: Dict[str, Any]) -> int:
    total = 0
    for block in _text_blocks(slide):
        total += len(str(block.get("content", "")))
    for shape in slide.get("shapes", []) or []:
        if isinstance(shape, dict) and shape.get("text"):
            total += len(str(shape.get("text")))
    return total


def _slide_extracted_text_for_vlm(slide: Dict[str, Any], max_chars: int = 1200) -> str:
    """
    Build a compact text context for the vision model.
    The VLM should *not* repeat this text; it should describe visual structure instead.
    """
    parts: List[str] = []

    # Prefer structured items (card/grid layouts).
    for item in slide.get("structured_items", []) or []:
        if not isinstance(item, dict):
            continue
        heading = str(item.get("heading") or "").strip()
        body_list = item.get("body") or []
        body = " ".join(str(t).strip() for t in body_list if str(t).strip()) if isinstance(body_list, list) else str(body_list).strip()
        if heading and body:
            parts.append(f"{heading}: {body}")
        elif heading:
            parts.append(heading)
        elif body:
            parts.append(body)

    # Raw text boxes.
    for block in _text_blocks(slide):
        content = str(block.get("content") or "").strip()
        if not content:
            continue
        parts.append(content.replace("\n", " ").strip())

    # Speaker notes are handled separately (passed explicitly to prompts when enabled).
    seen: set[str] = set()
    compact: List[str] = []
    for p in parts:
        value = " ".join(p.split())
        if not value:
            continue
        key = value.lower()
        if key in seen:
            continue
        seen.add(key)
        compact.append(value)

    text = "\n".join(compact).strip()
    if len(text) > max_chars:
        text = text[: max_chars - 3].rstrip() + "..."
    return text


def _speaker_notes_for_vlm(slide: Dict[str, Any], max_chars: int = 900) -> str:
    """
    Provide speaker notes as optional context to the VLM.

    Notes can be long and may contain editorial instructions; keep them short and clean.
    """
    notes = slide.get("speaker_notes")
    if not isinstance(notes, str):
        return ""
    value = " ".join(notes.split()).strip()
    if not value:
        return ""
    if len(value) > max_chars:
        value = value[: max_chars - 3].rstrip() + "..."
    return value



_GENERIC_PATTERNS = [
    "schema oder flussdiagramm",
    "visuelle darstellung mit mehreren",
    "diagramm mit mehreren elementen",
    "flussdiagramm mit verbindungen",
    "visuelles diagramm mit formen",
    "mehreren elementen und verbindungen",
    "infografik mit mehreren bereichen",
]

def _is_generic_description(text: str) -> bool:
    """Check if a VLM description is too generic to be useful."""
    if not text:
        return True
    lowered = text.strip().lower()
    if len(lowered) < 30:
        return True
    return any(pattern in lowered for pattern in _GENERIC_PATTERNS)


def _image_area_ratio(img: Dict[str, Any]) -> float:
    try:
        area = img.get("area_norm")
        if area is not None:
            return max(float(area), 0.0)
        width_norm = float(img.get("width_norm") or 0.0)
        height_norm = float(img.get("height_norm") or 0.0)
        return max(width_norm * height_norm, 0.0)
    except Exception:
        return 0.0


def _rank_slide(
    slide: Dict[str, Any],
    text_len: int,
    image_area: float,
) -> Tuple[int, int, float, int]:
    has_chart = bool(slide.get("has_chart"))
    has_diagram = bool(slide.get("is_visual_diagram"))
    visual_priority = 0 if (has_chart or has_diagram) else 1
    text_score = min(text_len, 8000)
    area_score = -float(image_area)
    slide_num = int(slide.get("slide_number") or 0)
    return (visual_priority, text_score, area_score, slide_num)


def _select_vlm_slides(
    slides: List[Dict[str, Any]],
    settings: QualitySettings,
) -> Tuple[Set[int], Dict[int, int], Dict[int, float], int]:
    scored: List[Tuple[Tuple[int, int, float, int], int]] = []
    text_lens: Dict[int, int] = {}
    image_areas: Dict[int, float] = {}

    for slide in slides:
        slide_num = int(slide.get("slide_number") or 0)
        text_len = _slide_text_len(slide)
        image_area = sum(_image_area_ratio(img) for img in slide.get("images", []) or [])
        text_lens[slide_num] = text_len
        image_areas[slide_num] = image_area

        has_visual = (
            slide.get("complexity") == "complex"
            or slide.get("has_chart")
            or slide.get("is_visual_diagram")
        )
        if not has_visual:
            continue

        if text_len > settings.vlm_skip_text_threshold and not (slide.get("has_chart") or slide.get("is_visual_diagram")):
            continue

        scored.append((_rank_slide(slide, text_len, image_area), slide_num))

    scored.sort(key=lambda item: item[0])
    limit = max(0, int(settings.vlm_max_slides))
    selected = {slide_num for _, slide_num in scored[:limit]} if limit > 0 else set()
    return selected, text_lens, image_areas, len(scored)


def _select_render_slides(
    slides: List[Dict[str, Any]],
    text_lens: Dict[int, int],
    image_areas: Dict[int, float],
    settings: QualitySettings,
) -> Tuple[Set[int], int]:
    candidates: List[Tuple[Tuple[int, int, float, int], int]] = []
    for slide in slides:
        if not (slide.get("has_chart") or slide.get("is_visual_diagram")):
            continue
        slide_num = int(slide.get("slide_number") or 0)
        rank = _rank_slide(slide, text_lens.get(slide_num, 0), image_areas.get(slide_num, 0.0))
        candidates.append((rank, slide_num))

    candidates.sort(key=lambda item: item[0])
    limit = max(0, int(settings.vlm_max_render_slides))
    selected = {slide_num for _, slide_num in candidates[:limit]} if limit > 0 else set()
    return selected, len(candidates)


def _select_images_for_vlm(slide: Dict[str, Any], settings: QualitySettings) -> List[Dict[str, Any]]:
    images = slide.get("images", []) or []
    if not images:
        return []

    # Skip decorative images and those already handled by vision analysis
    images = [
        img
        for img in images
        if not img.get("decorative")
        and img.get("alt_text_source") != "vision"
    ]
    if not images:
        return []

    scored = sorted(
        [(_image_area_ratio(img), img) for img in images],
        key=lambda item: item[0],
        reverse=True,
    )
    filtered = [img for area, img in scored if area >= settings.vlm_min_image_area_ratio]
    chosen = filtered or [img for _, img in scored]
    limit = max(1, int(settings.vlm_max_images_per_slide))
    return chosen[:limit]


def _podcast_pack_complexity_score(slide: Dict[str, Any]) -> int:
    score = 0
    if slide.get("has_chart"):
        score += 120
    if slide.get("is_visual_diagram"):
        score += 110
    if slide.get("has_table"):
        score += 90

    images = slide.get("images", []) or []
    score += min(len(images) * 18, 54)

    structured_items = slide.get("structured_items", []) or []
    score += min(len(structured_items) * 8, 40)

    shapes = slide.get("shapes", []) or []
    score += min(len(shapes) * 2, 20)

    text_blocks = _text_blocks(slide)
    score += min(len(text_blocks) * 5, 35)

    text_len = _slide_text_len(slide)
    score += min(text_len // 120, 30)

    notes_len = len(str(slide.get("speaker_notes") or ""))
    score += min(notes_len // 240, 15)

    title = str(slide.get("title") or "").strip()
    if title and text_len < 180 and len(text_blocks) <= 2 and not images and not shapes:
        score = max(0, score - 20)

    return int(score)


def _split_podcast_pack_slides(
    slides: List[Dict[str, Any]],
    max_llm_slides: int,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Set[int]]:
    if not slides:
        return [], [], set()

    limit = max(0, min(int(max_llm_slides), len(slides)))
    if limit <= 0:
        return [], list(slides), set()

    scored: List[Tuple[int, int, int]] = []
    for idx, slide in enumerate(slides):
        slide_num = int(slide.get("slide_number") or (idx + 1))
        scored.append((_podcast_pack_complexity_score(slide), idx, slide_num))

    scored.sort(key=lambda item: (-item[0], item[1]))
    selected_indices = {idx for _, idx, _ in scored[:limit]}
    selected_slide_nums = {slide_num for _, idx, slide_num in scored[:limit] if idx in selected_indices}

    llm_slides: List[Dict[str, Any]] = []
    fallback_slides: List[Dict[str, Any]] = []
    for idx, slide in enumerate(slides):
        if idx in selected_indices:
            llm_slides.append(slide)
        else:
            fallback_slides.append(slide)

    return llm_slides, fallback_slides, selected_slide_nums


def _effective_podcast_pack_llm_limit(
    total_slides: int,
    configured_limit: int,
    summary_timeout_seconds: int,
) -> int:
    hard_cap = max(0, min(int(configured_limit), int(total_slides)))
    if hard_cap <= 0:
        return 0

    # Conservative budget so pack jobs stay within timeout envelopes.
    # A single LLM summary can take ~1 minute on loaded systems.
    per_slide_budget_seconds = 55
    timeout_cap = max(1, int(summary_timeout_seconds) // per_slide_budget_seconds)
    return max(1, min(hard_cap, timeout_cap))


def _build_podcast_pack_overview_slides(
    slides: List[Dict[str, Any]],
    llm_slide_nums: Set[int],
    max_slides: int = 16,
) -> List[Dict[str, Any]]:
    if len(slides) <= max_slides:
        return slides

    selected_indices: Set[int] = set()
    selected_indices.add(0)
    selected_indices.add(len(slides) - 1)

    for idx, slide in enumerate(slides):
        slide_num = int(slide.get("slide_number") or (idx + 1))
        if slide_num in llm_slide_nums:
            selected_indices.add(idx)
        if len(selected_indices) >= max_slides:
            break

    idx = 0
    while len(selected_indices) < max_slides and idx < len(slides):
        selected_indices.add(idx)
        idx += 1

    return [slides[i] for i in sorted(selected_indices)]


async def acquire_gpu_lock_with_progress(
    job_id: str,
    operation: str,
    queue_phase: str,
    queue_percent: int,
    queue_message: str,
    priority: int = 2,
    avg_wait_seconds: int = 240,
) -> Tuple[Optional[GpuLock], bool]:
    """
    Acquire the shared GPU lock while keeping the job in a visible queue state.

    Returns (lock, degraded). When degraded is True, GPU-heavy steps should be skipped.
    """
    wait_budget_ms = max(int(GPU_LOCK_WAIT_MS), 30000)
    segment_wait_ms = max(5000, min(30000, int(GPU_LOCK_QUEUE_UPDATE_MS) * 2))
    started = time.monotonic()
    last_update = 0.0
    enqueued_at_ms = int(time.time() * 1000)

    await enqueue_gpu_queue(job_id, priority, enqueued_at_ms=enqueued_at_ms)

    while True:
        if _is_cancelled(job_id):
            await dequeue_gpu_queue(job_id)
            raise JobCancelled("cancelled")
        elapsed_ms = int((time.monotonic() - started) * 1000)
        remaining_ms = wait_budget_ms - elapsed_ms
        if remaining_ms <= 0:
            await dequeue_gpu_queue(job_id)
            update_progress(
                job_id,
                "gpu_degraded",
                queue_percent,
                "GPU ausgelastet - KI Schritte werden uebersprungen.",
            )
            return None, True

        await touch_gpu_queue(job_id)
        position, total = await get_gpu_queue_position(job_id)
        if position is None:
            await enqueue_gpu_queue(job_id, priority, enqueued_at_ms=enqueued_at_ms)
            position, total = await get_gpu_queue_position(job_id)

        active_lock = await get_gpu_lock_token()
        active_count = 1 if active_lock else 0
        wait_seconds = max(0, (position or 0) + active_count) * max(avg_wait_seconds, 30)
        queue_info = {
            "position": (position + 1) if position is not None else max(total, 1),
            "total": max(total, 1),
            "estimated_wait_seconds": wait_seconds,
        }

        lock = None
        if position == 0:
            lock = await acquire_gpu_lock(operation, wait_ms=min(2000, remaining_ms))
        if lock:
            await dequeue_gpu_queue(job_id)
            if _is_cancelled(job_id):
                await _safe_release_gpu_lock(lock)
                raise JobCancelled("cancelled")
            return lock, False

        now = time.monotonic()
        if now - last_update >= max(GPU_LOCK_QUEUE_UPDATE_MS, 2000) / 1000.0:
            waited_s = int(now - started)
            update_progress(
                job_id,
                queue_phase,
                queue_percent,
                f"{queue_message} (warte {waited_s}s auf GPU)",
                queue=queue_info,
            )
            last_update = now
        await asyncio.sleep(max(1.5, min(segment_wait_ms, 5000)) / 1000.0)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    print(f"[PDFUA] Starting PDF/UA Service...")
    print(f"[PDFUA] VLM Model: {VLM_CONFIG['model']}")
    print(f"[PDFUA] Quantization: {VLM_CONFIG['quantization']}")
    print(f"[PDFUA] Java Service: {PDFUA_JAVA_URL}")
    watchdog_task = None
    if GPU_LOCK_WATCHDOG_INTERVAL > 0:
        watchdog_task = asyncio.create_task(_gpu_lock_watchdog())
    yield
    if watchdog_task:
        watchdog_task.cancel()
        try:
            await watchdog_task
        except asyncio.CancelledError:
            pass
    print("[PDFUA] Shutting down PDF/UA Service...")


app = FastAPI(
    title="VoxDrop PDF/UA Service",
    description="Converts PPTX and PDF to accessible PDF/UA with AI-generated summaries and alt-text",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS (configure via CORS_ORIGINS env, comma-separated)
cors_origins_env = os.getenv("CORS_ORIGINS", "")
cors_origins = [origin.strip() for origin in cors_origins_env.split(",") if origin.strip()]
if "*" in cors_origins:
    cors_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Models
class ConvertResponse(BaseModel):
    job_id: str
    status: str
    message: str


class JobStatus(BaseModel):
    job_id: str
    status: str
    progress: Optional[dict] = None
    result: Optional[dict] = None
    error: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None


# Health Check
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    import torch

    gpu_available = torch.cuda.is_available()
    gpu_name = torch.cuda.get_device_name(0) if gpu_available else None

    # Check Java service
    java_available = False
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{PDFUA_JAVA_URL}/health")
            java_available = resp.status_code == 200
    except Exception:
        pass

    return {
        "status": "ok" if gpu_available and java_available else "degraded",
        "service": "pdfua-service",
        "gpu": {
            "available": gpu_available,
            "device": gpu_name,
        },
        "java_service": {
            "available": java_available,
            "url": PDFUA_JAVA_URL,
        },
        "vlm": {
            "model": VLM_CONFIG["model"],
            "quantization": VLM_CONFIG["quantization"],
        },
    }


def _init_job(
    file: UploadFile,
    input_path: str,
    job_id: str,
    summary_mode: bool,
    input_type: str,
    quality: str,
    priority: int,
    process_version: str,
    include_speaker_notes: bool,
) -> None:
    jobs[job_id] = {
        "job_id": job_id,
        "filename": file.filename,
        "input_type": input_type,
        "status": "pending",
        "progress": {
            "phase": "queued",
            "percentage": 0,
            "current_slide": 0,
            "total_slides": 0,
            "message": "In der Warteschlange...",
        },
        "result": None,
        "error": None,
        "cancelled": False,
        "quality": quality,
        "priority": priority,
        "process_version": process_version,
        "include_speaker_notes": bool(include_speaker_notes),
        "created_at": datetime.utcnow().isoformat(),
        "completed_at": None,
        "input_path": input_path,
        "summary_mode": summary_mode,
    }


async def _handle_convert(
    background_tasks: BackgroundTasks,
    file: UploadFile,
    summary_mode: bool,
    quality: str,
    priority: int,
    process_version: str,
    include_speaker_notes: bool,
) -> ConvertResponse:
    """Shared handler for conversion endpoints."""
    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename required")

    ext = file.filename.lower().split(".")[-1]
    if ext not in {"pptx", "pdf"}:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {ext}. Only PPTX and PDF supported."
        )

    # Check file size
    content = await file.read()
    file_size_mb = len(content) / (1024 * 1024)
    if file_size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(
            status_code=400,
            detail=f"File too large: {file_size_mb:.1f}MB. Max: {MAX_FILE_SIZE_MB}MB"
        )

    # Early PDF page limit validation to fail fast for huge documents
    if ext == "pdf":
        try:
            from pypdf import PdfReader
            import io

            reader = PdfReader(io.BytesIO(content), strict=False)
            total_pages = len(reader.pages)
            if total_pages > MAX_PDF_PAGES:
                raise HTTPException(
                    status_code=400,
                    detail=f"Too many pages: {total_pages}. Max: {MAX_PDF_PAGES}"
                )
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Invalid PDF: {exc}")

    # Generate job ID and save file
    job_id = str(uuid.uuid4())
    input_path = os.path.join(UPLOAD_DIR, f"{job_id}.{ext}")

    with open(input_path, "wb") as f:
        f.write(content)

    # Initialize job
    normalized_quality = _normalize_quality(quality)
    normalized_process = _normalize_process_version(process_version or PROCESS_VERSION)
    try:
        priority_value = int(priority)
    except Exception:
        priority_value = 2
    priority_value = max(1, min(priority_value, 9))

    _init_job(
        file,
        input_path,
        job_id,
        summary_mode,
        ext,
        normalized_quality,
        priority_value,
        normalized_process,
        include_speaker_notes=bool(include_speaker_notes),
    )

    # Start background processing
    background_tasks.add_task(process_conversion, job_id)

    return ConvertResponse(
        job_id=job_id,
        status="pending",
        message="Conversion started"
    )


# Convert Endpoint
@app.post("/convert", response_model=ConvertResponse)
async def convert_pptx(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    quality: str = Form("standard"),
    priority: int = Form(2),
    processVersion: str = Form("1"),
    includeSpeakerNotes: bool = Form(True),
):
    """Upload PPTX or PDF and start conversion to PDF/UA."""
    return await _handle_convert(
        background_tasks,
        file,
        summary_mode=False,
        quality=quality,
        priority=priority,
        process_version=processVersion,
        include_speaker_notes=includeSpeakerNotes,
    )


# Convert Endpoint (Summary-first PDF/UA)
@app.post("/convert-summary", response_model=ConvertResponse)
async def convert_pptx_summary(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    quality: str = Form("standard"),
    priority: int = Form(2),
    processVersion: str = Form("1"),
    includeSpeakerNotes: bool = Form(True),
):
    """Upload PPTX or PDF and start conversion to PDF/UA with summaries."""
    return await _handle_convert(
        background_tasks,
        file,
        summary_mode=True,
        quality=quality,
        priority=priority,
        process_version=processVersion,
        include_speaker_notes=includeSpeakerNotes,
    )


# Podcast Pack (fast, structured summaries for downstream audio generation)
@app.post("/podcast-pack", response_model=ConvertResponse)
async def create_podcast_pack(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    includeSpeakerNotes: bool = Form(True),
):
    """
    Upload PPTX and create a lightweight "podcast pack" JSON:
    - Outline (TOC)
    - Per-slide short summaries (fallback-only; no extra LLM calls by default)
    - Global summary (fallback-only by default)

    This endpoint is designed for speed and can be used by the PPTX->Podcast pipeline.
    """
    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename required")

    ext = file.filename.lower().split(".")[-1]
    if ext != "pptx":
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {ext}. Only PPTX supported.",
        )

    # Check file size
    content = await file.read()
    file_size_mb = len(content) / (1024 * 1024)
    if file_size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(
            status_code=400,
            detail=f"File too large: {file_size_mb:.1f}MB. Max: {MAX_FILE_SIZE_MB}MB",
        )

    # Create job
    job_id = str(uuid.uuid4())
    input_path = os.path.join(UPLOAD_DIR, f"{job_id}_{file.filename}")
    with open(input_path, "wb") as f:
        f.write(content)

    # Reuse the shared job model for status polling.
    _init_job(
        file,
        input_path,
        job_id,
        summary_mode=True,
        input_type="pptx",
        quality="standard",
        priority=2,
        process_version="podcast-pack",
        include_speaker_notes=bool(includeSpeakerNotes),
    )
    jobs[job_id]["kind"] = "podcast-pack"

    # Start background processing
    background_tasks.add_task(process_podcast_pack, job_id)

    return ConvertResponse(
        job_id=job_id,
        status="pending",
        message="Podcast pack started",
    )


# Job Status
@app.get("/jobs/{job_id}")
async def get_job_status(job_id: str):
    """Get status of a conversion job."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs[job_id]
    return {
        "job_id": job_id,
        "status": job["status"],
        "progress": job["progress"],
        "result": job["result"],
        "error": job["error"],
        "queue": job.get("queue"),
        "created_at": job["created_at"],
        "completed_at": job["completed_at"],
    }


@app.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str):
    """Cancel a conversion job."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs[job_id]
    if job["status"] in ("completed", "failed"):
        return {
            "job_id": job_id,
            "status": job["status"],
            "message": "Job already finished",
        }

    job["cancelled"] = True
    await dequeue_gpu_queue(job_id)
    job["status"] = "failed"
    job["error"] = "cancelled"
    job["progress"] = {
        "phase": "cancelled",
        "percentage": 0,
        "message": "Abgebrochen",
        "current_slide": 0,
        "total_slides": job.get("progress", {}).get("total_slides", 0),
    }
    job["completed_at"] = datetime.utcnow().isoformat()

    return {
        "job_id": job_id,
        "status": "cancelled",
    }


# Download Result
@app.get("/jobs/{job_id}/download")
async def download_result(job_id: str):
    """Download the converted PDF/UA file."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs[job_id]

    if job["status"] != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Job not completed. Status: {job['status']}"
        )

    output_path = job.get("result", {}).get("output_path")
    if not output_path or not os.path.exists(output_path):
        raise HTTPException(status_code=404, detail="Output file not found")

    # Generate download filename
    original_name = job["filename"].rsplit(".", 1)[0]
    download_name = f"{original_name}_pdfua.pdf"

    return FileResponse(
        output_path,
        media_type="application/pdf",
        filename=download_name,
    )


# Background Processing
async def process_pdf_conversion(job_id: str) -> None:
    """Background task to process PDF to PDF/UA conversion."""
    job = jobs[job_id]
    input_path = job["input_path"]
    quality_settings = _get_quality_settings(job.get("quality"))
    process_version = job.get("process_version") or "1"
    use_process_v2 = str(process_version) == "2"

    try:
        # Keep API parity with the PPTX pipeline: downstream HTML/PDF builders expect
        # a `doc_meta` object (PPTX metadata). For PDFs, this is optional but must exist.
        doc_meta: object | None = None

        # Phase 1: Parse PDF (5-20%)
        update_progress(job_id, "parsing", 5, "PDF wird analysiert...")

        from .parsers import parse_pdf

        slides, total_pages, rendered_pages = await asyncio.to_thread(
            parse_pdf,
            input_path,
            quality_settings.render_dpi,
            PDF_VLM_MAX_PAGES,
            quality_settings.pdf_vlm_max_targets,
        )

        # Best-effort: extract PDF metadata (title/author/subject) for nicer document properties.
        # This should never block conversion.
        try:
            from pypdf import PdfReader

            reader = PdfReader(input_path, strict=False)
            meta_raw = reader.metadata
            title = getattr(meta_raw, "title", None) if meta_raw else None
            author = getattr(meta_raw, "author", None) if meta_raw else None
            subject = getattr(meta_raw, "subject", None) if meta_raw else None

            # pypdf also stores keys like "/Title" in a dict-like structure.
            if meta_raw and hasattr(meta_raw, "get"):
                title = title or meta_raw.get("/Title")
                author = author or meta_raw.get("/Author")
                subject = subject or meta_raw.get("/Subject")

            doc_meta_candidate = {
                "title": title,
                "author": author,
                "subject": subject,
            }
            doc_meta_candidate = {k: v for k, v in doc_meta_candidate.items() if v}
            doc_meta = doc_meta_candidate or None
        except Exception as exc:
            print(f"[PDFUA] PDF metadata extraction failed: {exc}")

        if total_pages > MAX_PDF_PAGES:
            raise ValueError(f"Zu viele Seiten: {total_pages}. Max: {MAX_PDF_PAGES}")

        update_progress(
            job_id,
            "parsing",
            20,
            f"{total_pages} Seiten erkannt",
            total_slides=total_pages,
        )

        # Phase 2: Determine visual pages (20-30%)
        update_progress(job_id, "classifying", 20, "Seiten werden vorbereitet...")

        rendered_candidates = [s for s in slides if s.get("images")]

        def _slide_text_len(slide: dict) -> int:
            total = 0
            for block in slide.get("text_content", []) or []:
                if isinstance(block, dict):
                    total += len(str(block.get("content", "")))
                elif isinstance(block, str):
                    total += len(block)
            return total

        target_limit = max(0, min(quality_settings.pdf_vlm_max_targets, PDF_VLM_MAX_PAGES))
        threshold_candidates = [
            s for s in rendered_candidates if _slide_text_len(s) <= quality_settings.pdf_vlm_text_threshold
        ]
        candidate_pool = threshold_candidates or rendered_candidates
        ranked_candidates = sorted(candidate_pool, key=_slide_text_len)
        visual_pages = ranked_candidates[:target_limit] if target_limit > 0 else []
        selected_pages = {s.get("slide_number") for s in visual_pages}

        # Drop heavy rendered images for non-selected pages to keep HTML small.
        if rendered_candidates:
            for slide in rendered_candidates:
                if slide.get("slide_number") not in selected_pages:
                    slide["images"] = []
                    slide.pop("is_visual_diagram", None)

        for slide in slides:
            slide["complexity"] = "complex" if slide.get("images") else "simple"

        rendered_count = len(rendered_candidates)
        visual_count = len(visual_pages)
        if rendered_count:
            classifying_msg = (
                f"{visual_count} Seiten visuell analysiert (von {rendered_count}, max {target_limit})"
            )
            if threshold_candidates and len(threshold_candidates) < rendered_count:
                classifying_msg += (
                    f" - Fokus auf visuelle Seiten (Textlimit {PDF_VLM_TEXT_THRESHOLD})"
                )
        else:
            classifying_msg = "Keine visuellen Seiten erkannt"
        update_progress(
            job_id,
            "classifying",
            30,
            classifying_msg,
        )

        needs_gpu = bool(visual_pages) or bool(job.get("summary_mode"))
        gpu_lock: Optional[GpuLock] = None
        gpu_degraded = False

        if needs_gpu:
            gpu_lock, gpu_degraded = await acquire_gpu_lock_with_progress(
                job_id,
                operation=f"pdfua:pdf:{job_id}",
                queue_phase="gpu_queue",
                queue_percent=28,
                queue_message="GPU ausgelastet, Job wartet in der Warteschlange",
                priority=int(job.get("priority") or 2),
                avg_wait_seconds=quality_settings.queue_avg_seconds,
            )

        try:
            # Phase 3: Visual summaries for rendered pages (30-65%)
            if visual_pages and not gpu_degraded:
                update_progress(job_id, "vlm", 30, "Visuelle Analyse startet...")
                captioner = get_vlm_captioner()
                processed = 0
                total_targets = len(visual_pages)

                for slide in visual_pages:
                    _raise_if_cancelled(job_id)
                    page_num = slide.get("slide_number", processed + 1)
                    page_title = slide.get("title")
                    page_image = slide.get("images", [None])[0]

                    if page_image and page_image.get("image_bytes"):
                        try:
                            summary = await asyncio.to_thread(
                                captioner.generate_diagram_summary,
                                page_image["image_bytes"],
                                "Dokumentseite",
                                page_title,
                            )
                            slide["diagram_summary"] = summary
                            page_image["alt_text"] = summary
                        except Exception as exc:
                            print(f"[PDFUA] Visual summary failed for page {page_num}: {exc}")
                            slide["diagram_summary"] = f"Dokumentseite {page_num}"

                    processed += 1
                    progress = 30 + int((processed / max(total_targets, 1)) * 35)
                    update_progress(
                        job_id,
                        "vlm",
                        min(progress, 65),
                        f"Visuelle Analyse: Seite {page_num}/{total_pages}",
                        current_slide=page_num,
                        total_slides=total_pages,
                    )
            elif visual_pages:
                update_progress(job_id, "vlm", 65, "GPU belegt - visuelle Analyse uebersprungen")
            else:
                update_progress(job_id, "vlm", 65, "Keine visuellen Seiten erkannt - uebersprungen")

            # Phase 4: Generate summaries (65-75%) - summary mode only
            if job.get("summary_mode"):
                _raise_if_cancelled(job_id)
                try:
                    from .processors import generate_slide_summaries

                    update_progress(job_id, "summary", 65, "Zusammenfassungen werden erstellt...")
                    summaries = await generate_slide_summaries(
                        slides,
                        PDFUA_LANG,
                        force_fallback=gpu_degraded,
                    )

                    for slide in slides:
                        page_num = slide.get("slide_number", 0)
                        summary_data = summaries.get(page_num, {})
                        if summary_data:
                            slide["slide_summary"] = summary_data.get("summary")
                            slide["summary_points"] = summary_data.get("key_points", [])
                            slide["summary_structure"] = summary_data.get("structure", "none")
                            slide["visual_hint"] = summary_data.get("visual_hint")

                    update_progress(job_id, "summary", 75, "Zusammenfassungen erstellt")
                except Exception as exc:
                    print(f"[PDFUA] Summary generation failed for PDF: {exc}")
                    update_progress(job_id, "summary", 75, "Zusammenfassungen uebersprungen")
            else:
                update_progress(job_id, "summary", 75, "Zusammenfassungen uebersprungen")
        finally:
            await _safe_release_gpu_lock(gpu_lock)

        # Phase 5: Build HTML (75-85%)
        _raise_if_cancelled(job_id)
        update_progress(job_id, "building", 75, "HTML wird generiert...")

        from .processors import build_html, build_html_v2, generate_document_overview
        from .title_inference import ensure_slide_titles
        from .deduplication.content_dedup import deduplicate_slide_content
        from .notes import process_speaker_notes

        try:
            ensure_slide_titles(slides)
        except Exception as exc:
            print(f"[PDFUA] Title inference failed: {exc}")

        try:
            for slide in slides:
                process_speaker_notes(slide)
        except Exception as exc:
            print(f"[PDFUA] Speaker notes processing failed: {exc}")

        try:
            for slide in slides:
                deduplicate_slide_content(slide, threshold=DEDUPLICATION_THRESHOLD)
        except Exception as exc:
            print(f"[PDFUA] Deduplication failed: {exc}")
        from .title_inference import ensure_slide_titles
        from .deduplication.content_dedup import deduplicate_slide_content
        from .notes import process_speaker_notes

        try:
            ensure_slide_titles(slides)
        except Exception as exc:
            print(f"[PDFUA] Title inference failed: {exc}")

        try:
            for slide in slides:
                process_speaker_notes(slide)
        except Exception as exc:
            print(f"[PDFUA] Speaker notes processing failed: {exc}")

        try:
            for slide in slides:
                deduplicate_slide_content(slide, threshold=DEDUPLICATION_THRESHOLD)
        except Exception as exc:
            print(f"[PDFUA] Deduplication failed: {exc}")
        from .title_inference import ensure_slide_titles
        from .deduplication.content_dedup import deduplicate_slide_content

        try:
            ensure_slide_titles(slides)
        except Exception as exc:
            print(f"[PDFUA] Title inference failed: {exc}")

        try:
            for slide in slides:
                deduplicate_slide_content(slide, threshold=DEDUPLICATION_THRESHOLD)
        except Exception as exc:
            print(f"[PDFUA] Deduplication failed: {exc}")

        if not bool(job.get("include_speaker_notes", True)):
            for slide in slides:
                slide["speaker_notes"] = None

        document_title = _derive_document_title(slides, job["filename"], doc_meta)
        subject = None
        creator = "VoxDrop PDF/UA Service"
        author = None
        if isinstance(doc_meta, dict):
            author = doc_meta.get("author") or doc_meta.get("last_modified_by")
            subject = doc_meta.get("subject") or doc_meta.get("category")
        author = _sanitize_author(author, document_title, doc_meta)
        subject = _sanitize_subject(subject, document_title, doc_meta)
        if not (isinstance(subject, str) and subject.strip()):
            today = datetime.utcnow().strftime("%Y-%m-%d")
            subject = f"{document_title} – Barrierefreies PDF/UA (erstellt {today})"

        if use_process_v2:
            # Document overview uses a text LLM by default; only do that when summary_mode is requested.
            overview = await generate_document_overview(
                slides,
                PDFUA_LANG,
                force_fallback=bool(gpu_degraded) or (not bool(job.get("summary_mode"))),
            )
            html_content = build_html_v2(
                slides,
                document_title,
                PDFUA_LANG,
                overview.get("summary"),
                overview.get("outline"),
            )
        else:
            html_content = build_html(slides, document_title, PDFUA_LANG)

        update_progress(job_id, "building", 85, "HTML generiert")

        # Phase 6: Convert to PDF/UA via Java service (85-95%)
        _raise_if_cancelled(job_id)
        update_progress(job_id, "pdfua", 85, "PDF/UA wird erstellt...")

        import httpx

        async with httpx.AsyncClient(timeout=300.0) as client:
            response = await client.post(
                f"{PDFUA_JAVA_URL}/convert",
                json={
                    "html": html_content,
                    "filename": job["filename"],
                    "lang": PDFUA_LANG,
                    "title": document_title,
                    "author": author,
                    "subject": subject,
                    "creator": creator,
                },
            )

            if response.status_code != 200:
                raise Exception(f"Java service error: {response.text}")

            pdf_bytes = response.content

        update_progress(job_id, "pdfua", 95, "PDF/UA erstellt")

        # Phase 7: Save output (95-100%)
        _raise_if_cancelled(job_id)
        update_progress(job_id, "finalizing", 95, "Wird abgeschlossen...")

        output_path = os.path.join(OUTPUT_DIR, f"{job_id}.pdf")
        with open(output_path, "wb") as f:
            f.write(pdf_bytes)

        # Complete
        job["status"] = "completed"
        job["progress"] = {
            "phase": "done",
            "percentage": 100,
            "message": "Fertig!",
        }
        job["result"] = {
            "output_path": output_path,
            "pdfua_compliant": True,
            "total_slides": total_pages,
            "complex_slides": len(visual_pages),
            "rendered_pages": rendered_pages,
            "processing_time_seconds": (
                datetime.utcnow() - datetime.fromisoformat(job["created_at"])
            ).total_seconds(),
        }
        job["completed_at"] = datetime.utcnow().isoformat()

        print(f"[PDFUA] PDF job {job_id} completed successfully")

        # Cleanup input file
        if os.path.exists(input_path):
            os.remove(input_path)

    except JobCancelled:
        job["status"] = "failed"
        job["error"] = "cancelled"
        job["progress"] = {
            "phase": "cancelled",
            "percentage": 0,
            "message": "Abgebrochen",
            "current_slide": 0,
            "total_slides": job.get("progress", {}).get("total_slides", 0),
        }
        job["completed_at"] = datetime.utcnow().isoformat()
        if os.path.exists(input_path):
            os.remove(input_path)
    except Exception as exc:
        print(f"[PDFUA] PDF job {job_id} failed: {exc}")
        job["status"] = "failed"
        job["error"] = str(exc)
        job["completed_at"] = datetime.utcnow().isoformat()

        # Cleanup input file
        if os.path.exists(input_path):
            os.remove(input_path)


async def process_podcast_pack(job_id: str) -> None:
    """
    Background task to generate a lightweight "podcast pack" JSON from a PPTX.

    Goals:
    - Fast (no image embedding, no VLM)
    - Deterministic, structured output for downstream podcast generation
    - Reuse existing PPTX parsing + robust summary fallbacks
    """
    job = jobs[job_id]
    input_path = job["input_path"]

    try:
        update_progress(job_id, "parsing", 5, "PPTX wird analysiert...")

        from .parsers import parse_pptx, extract_pptx_metadata

        # For podcasts we don't need embedded images; skip them to avoid base64 overhead.
        slides = await asyncio.to_thread(parse_pptx, input_path, include_images=False)
        doc_meta = await asyncio.to_thread(extract_pptx_metadata, input_path)

        total_slides = len(slides)
        if total_slides > MAX_SLIDES:
            raise ValueError(f"Zu viele Folien: {total_slides}. Max: {MAX_SLIDES}")

        update_progress(
            job_id,
            "parsing",
            25,
            f"{total_slides} Folien erkannt",
            total_slides=total_slides,
        )

        # Remove internal production notes early (affects summaries + output).
        try:
            from .filters import filter_slide_internal_comments
            for slide in slides:
                filter_slide_internal_comments(slide, whitelist=INTERNAL_COMMENT_WHITELIST)
        except Exception as exc:
            print(f"[PDFUA] Internal comment filter failed (podcast-pack): {exc}")

        # Infer missing/placeholder titles before building the outline.
        try:
            from .title_inference import ensure_slide_titles
            ensure_slide_titles(slides)
        except Exception as exc:
            print(f"[PDFUA] Title inference failed (podcast-pack): {exc}")

        # Normalize speaker notes and deduplicate visible content so summaries are less repetitive.
        try:
            from .notes import process_speaker_notes
            for slide in slides:
                process_speaker_notes(slide)
        except Exception as exc:
            print(f"[PDFUA] Speaker notes processing failed (podcast-pack): {exc}")

        try:
            from .deduplication.content_dedup import deduplicate_slide_content
            for slide in slides:
                deduplicate_slide_content(slide, threshold=DEDUPLICATION_THRESHOLD)
        except Exception as exc:
            print(f"[PDFUA] Deduplication failed (podcast-pack): {exc}")

        update_progress(job_id, "summary", 40, "Inhaltsverzeichnis wird erstellt...")

        # Generate high-quality summaries (LLM when available; robust fallback when GPU-degraded).
        from .processors.summary_generator import generate_document_overview, generate_slide_summaries

        # Respect includeSpeakerNotes: if disabled, exclude notes from the summary prompt as well.
        if not bool(job.get("include_speaker_notes", True)):
            for slide in slides:
                slide["speaker_notes"] = None

        gpu_lock: Optional[GpuLock] = None
        gpu_degraded = False
        summaries: Dict[int, Dict[str, Any]] = {}
        overview: Dict[str, Any] = {}
        try:
            gpu_lock, gpu_degraded = await acquire_gpu_lock_with_progress(
                job_id,
                operation=f"pdfua:podcast-pack:{job_id}",
                queue_phase="gpu_queue",
                queue_percent=45,
                queue_message="GPU ausgelastet, Job wartet in der Warteschlange",
                priority=int(job.get("priority") or 2),
                avg_wait_seconds=240,
            )

            max_llm_slides = _effective_podcast_pack_llm_limit(
                total_slides=total_slides,
                configured_limit=int(PODCAST_PACK_MAX_LLM_SLIDES),
                summary_timeout_seconds=int(PODCAST_PACK_SUMMARY_TIMEOUT_SECONDS),
            )
            llm_slides, fallback_slides, llm_slide_nums = _split_podcast_pack_slides(
                slides,
                max_llm_slides=max_llm_slides,
            )

            update_progress(
                job_id,
                "summary",
                55,
                f"Zusammenfassungen werden erstellt (KI: {len(llm_slides)}, Fallback: {len(fallback_slides)})...",
            )

            if gpu_degraded:
                summaries = await generate_slide_summaries(
                    slides,
                    PDFUA_LANG,
                    force_fallback=True,
                )
                llm_slide_nums = set()
            else:
                unresolved_llm_slides = list(llm_slides)
                if llm_slides:
                    llm_timeout_seconds = max(60, int(PODCAST_PACK_SUMMARY_TIMEOUT_SECONDS))
                    try:
                        llm_summaries = await asyncio.wait_for(
                            generate_slide_summaries(
                                llm_slides,
                                PDFUA_LANG,
                                force_fallback=False,
                            ),
                            timeout=llm_timeout_seconds,
                        )
                        summaries.update(llm_summaries)
                        resolved_nums = {
                            int(slide_num)
                            for slide_num, data in llm_summaries.items()
                            if isinstance(data, dict) and str(data.get("summary") or "").strip()
                        }
                        unresolved_llm_slides = [
                            slide
                            for slide in unresolved_llm_slides
                            if int(slide.get("slide_number") or 0) not in resolved_nums
                        ]
                    except asyncio.TimeoutError:
                        reduced_count = max(1, len(unresolved_llm_slides) // 2)
                        unresolved_llm_slides = unresolved_llm_slides[:reduced_count]
                        print(
                            f"[PDFUA] podcast-pack LLM summary timed out for job {job_id}; "
                            f"retrying with reduced set ({reduced_count} slides)"
                        )
                        update_progress(
                            job_id,
                            "summary",
                            60,
                            f"KI langsam - zweiter Versuch mit {reduced_count} Folien...",
                        )
                        try:
                            retry_timeout_seconds = max(45, llm_timeout_seconds // 2)
                            retry_summaries = await asyncio.wait_for(
                                generate_slide_summaries(
                                    unresolved_llm_slides,
                                    PDFUA_LANG,
                                    force_fallback=False,
                                ),
                                timeout=retry_timeout_seconds,
                            )
                            summaries.update(retry_summaries)
                            resolved_nums = {
                                int(slide_num)
                                for slide_num, data in retry_summaries.items()
                                if isinstance(data, dict) and str(data.get("summary") or "").strip()
                            }
                            unresolved_llm_slides = [
                                slide
                                for slide in unresolved_llm_slides
                                if int(slide.get("slide_number") or 0) not in resolved_nums
                            ]
                        except Exception as retry_exc:
                            print(f"[PDFUA] podcast-pack LLM summary retry failed for job {job_id}: {retry_exc}")
                    except Exception as llm_exc:
                        print(f"[PDFUA] podcast-pack LLM summary failed for job {job_id}: {llm_exc}")

                if unresolved_llm_slides:
                    fallback_llm_summaries = await generate_slide_summaries(
                        unresolved_llm_slides,
                        PDFUA_LANG,
                        force_fallback=True,
                    )
                    summaries.update(fallback_llm_summaries)
                if fallback_slides:
                    fallback_summaries = await generate_slide_summaries(
                        fallback_slides,
                        PDFUA_LANG,
                        force_fallback=True,
                    )
                    summaries.update(fallback_summaries)

            # Attach summaries to slide dicts so the overview can use them.
            for slide in slides:
                slide_num = int(slide.get("slide_number") or 0)
                summary_data = summaries.get(slide_num, {}) if isinstance(summaries, dict) else {}
                if summary_data:
                    slide["slide_summary"] = summary_data.get("summary")
                    slide["summary_points"] = summary_data.get("key_points", [])
                    slide["summary_structure"] = summary_data.get("structure", "none")
                    slide["visual_hint"] = summary_data.get("visual_hint")

            update_progress(job_id, "summary", 68, "Gesamtzusammenfassung wird erstellt...")

            overview_input_slides = _build_podcast_pack_overview_slides(
                slides,
                llm_slide_nums if not gpu_degraded else set(),
                max_slides=16,
            )
            overview_timeout_seconds = max(30, int(PODCAST_PACK_OVERVIEW_TIMEOUT_SECONDS))
            try:
                overview = await asyncio.wait_for(
                    generate_document_overview(
                        overview_input_slides,
                        PDFUA_LANG,
                        force_fallback=bool(gpu_degraded),
                    ),
                    timeout=overview_timeout_seconds,
                )
            except Exception as overview_exc:
                print(f"[PDFUA] podcast-pack overview fallback for job {job_id}: {overview_exc}")
                overview = {
                    "summary": "",
                    "outline": [
                        {
                            "slide_number": int(slide.get("slide_number") or (idx + 1)),
                            "title": str(slide.get("title") or f"Folie {idx + 1}"),
                        }
                        for idx, slide in enumerate(overview_input_slides)
                    ],
                }
        finally:
            await _safe_release_gpu_lock(gpu_lock)

        update_progress(job_id, "summary", 75, "Zusammenfassungen erstellt")

        document_title = _derive_document_title(slides, job.get("filename") or "", doc_meta)
        fallback_doc_summary = f"Diese Präsentation enthält {total_slides} Folien."

        pack_slides: List[Dict[str, Any]] = []
        for slide in slides:
            slide_num = int(slide.get("slide_number") or 0)
            summary_data = summaries.get(slide_num, {}) if isinstance(summaries, dict) else {}

            pack_slides.append({
                "slide_number": slide_num,
                "title": str(slide.get("title") or f"Folie {slide_num}"),
                "summary": str(summary_data.get("summary") or "").strip(),
                "key_points": summary_data.get("key_points") or [],
                "structure": summary_data.get("structure") or "none",
                "visual_hint": summary_data.get("visual_hint"),
            })

        pack = {
            "document": {
                "title": document_title,
                "summary": (overview.get("summary") if isinstance(overview, dict) else "") or fallback_doc_summary,
                "outline": (overview.get("outline") if isinstance(overview, dict) else []) or [],
                "total_slides": total_slides,
                "lang": PDFUA_LANG,
            },
            "slides": pack_slides,
        }

        job["status"] = "completed"
        job["progress"] = {
            "phase": "done",
            "percentage": 100,
            "message": "Fertig!",
        }
        job["result"] = {
            "pack": pack,
            "total_slides": total_slides,
        }
        job["completed_at"] = datetime.utcnow().isoformat()

        # Cleanup input file
        if os.path.exists(input_path):
            os.remove(input_path)

    except JobCancelled:
        job["status"] = "failed"
        job["error"] = "cancelled"
        job["progress"] = {
            "phase": "cancelled",
            "percentage": 0,
            "message": "Abgebrochen",
            "current_slide": 0,
            "total_slides": job.get("progress", {}).get("total_slides", 0),
        }
        job["completed_at"] = datetime.utcnow().isoformat()
        if os.path.exists(input_path):
            os.remove(input_path)

    except Exception as exc:
        print(f"[PDFUA] Podcast pack job {job_id} failed: {exc}")
        job["status"] = "failed"
        job["error"] = str(exc)
        job["completed_at"] = datetime.utcnow().isoformat()
        if os.path.exists(input_path):
            os.remove(input_path)


async def process_conversion(job_id: str):
    """Background task to process PPTX to PDF/UA conversion."""
    job = jobs[job_id]
    if job.get("input_type") == "pdf":
        await process_pdf_conversion(job_id)
        return
    input_path = job["input_path"]
    quality_settings = _get_quality_settings(job.get("quality"))
    process_version = job.get("process_version") or "1"
    use_process_v2 = str(process_version) == "2"

    try:
        # Phase 1: Parse PPTX (5-15%)
        update_progress(job_id, "parsing", 5, "PPTX wird analysiert...")

        from .parsers import parse_pptx, extract_pptx_metadata
        slides = await asyncio.to_thread(parse_pptx, input_path)
        doc_meta = await asyncio.to_thread(extract_pptx_metadata, input_path)

        # Remove internal production notes early (affects summaries + output).
        try:
            from .filters import filter_slide_internal_comments
            for slide in slides:
                filter_slide_internal_comments(slide, whitelist=INTERNAL_COMMENT_WHITELIST)
        except Exception as exc:
            print(f"[PDFUA] Internal comment filter failed: {exc}")

        # Detect decorative images (logos, background, icons).
        if DETECT_DECORATIVE_IMAGES:
            try:
                from .images import build_image_index, apply_decorative_detection
                image_counts = build_image_index(slides)
                for slide in slides:
                    apply_decorative_detection(slide, image_counts)
            except Exception as exc:
                print(f"[PDFUA] Decorative image detection failed: {exc}")

        strict_title_correction = _allow_non_placeholder_title_correction(job)

        # Infer missing/placeholder titles before summaries.
        try:
            from .title_inference import ensure_slide_titles
            ensure_slide_titles(
                slides,
                allow_non_placeholder_correction=strict_title_correction,
            )
        except Exception as exc:
            print(f"[PDFUA] Title inference failed: {exc}")

        total_slides = len(slides)
        if total_slides > MAX_SLIDES:
            raise ValueError(f"Zu viele Folien: {total_slides}. Max: {MAX_SLIDES}")

        update_progress(job_id, "parsing", 15, f"{total_slides} Folien erkannt",
                       total_slides=total_slides)

        # Phase 2: Classify Slides (15-20%)
        update_progress(job_id, "classifying", 15, "Folien werden klassifiziert...")

        from .processors import classify_slide, enhance_slide_structure
        complex_count = 0
        for slide in slides:
            _raise_if_cancelled(job_id)
            slide["complexity"] = classify_slide(slide)
            if slide["complexity"] == "complex":
                complex_count += 1

        update_progress(job_id, "classifying", 20,
                       f"{complex_count} komplexe Folien erkannt")

        # Phase 3: Plan GPU work and limit VLM usage (20-25%)
        vision_enabled = VISION_ANALYZER_ENABLED
        selected_vlm_slides, text_lens, image_areas, vlm_candidate_count = _select_vlm_slides(slides, quality_settings)
        render_slide_nums, render_candidate_count = _select_render_slides(slides, text_lens, image_areas, quality_settings)
        vlm_target_slides = selected_vlm_slides | render_slide_nums

        selected_image_count = 0
        for slide in slides:
            _raise_if_cancelled(job_id)
            slide_num = int(slide.get("slide_number") or 0)
            if slide_num in selected_vlm_slides:
                vlm_images = _select_images_for_vlm(slide, quality_settings)
                slide["_vlm_images"] = vlm_images
                selected_image_count += len(vlm_images)
            else:
                slide["_vlm_images"] = []

        print(
            "[PDFUA] VLM candidates=%d selected_slides=%d selected_images=%d render_candidates=%d render_selected=%d"
            % (
                vlm_candidate_count,
                len(selected_vlm_slides),
                selected_image_count,
                render_candidate_count,
                len(render_slide_nums),
            )
        )

        update_progress(
            job_id,
            "classifying",
            20,
            f"{complex_count} komplexe Folien erkannt - VLM: {len(selected_vlm_slides)} Folien / {selected_image_count} Bilder, Render: {len(render_slide_nums)}",
        )

        render_task = None
        render_dir = None
        cleanup_render_dir_fn = None
        if render_slide_nums or vision_enabled:
            try:
                from .processors.slide_renderer import render_slides_to_images, cleanup_render_dir
                import tempfile

                render_dir = tempfile.mkdtemp(prefix="pdfua_render_")
                cleanup_render_dir_fn = cleanup_render_dir
                update_progress(
                    job_id,
                    "classifying",
                    22,
                    "Folien werden gerendert (CPU parallel)...",
                )
                render_task = asyncio.create_task(
                    asyncio.to_thread(
                        render_slides_to_images,
                        input_path,
                        render_dir,
                        quality_settings.render_dpi,
                    )
                )
            except Exception as e:
                print(f"[PDFUA] Failed to start slide rendering: {e}")
                render_task = None
                render_dir = None

        # Ensure render_task is always a Task (asyncio.to_thread returns a coroutine)
        if render_task and asyncio.iscoroutine(render_task):
            render_task = asyncio.create_task(render_task)

        needs_vlm = bool(vlm_target_slides)
        # Slide summaries are expensive; only generate "LLM-style" summaries when explicitly requested.
        # HTML builder always has a robust fallback based on parsed text + speaker notes.
        needs_summary = bool(job.get("summary_mode"))
        needs_vision = bool(vision_enabled)
        gpu_lock: Optional[GpuLock] = None
        gpu_degraded = False

        # Summary generation uses the text LLM (often GPU-backed via Ollama). Treat it like a GPU step so
        # we don't run it concurrently with other GPU-heavy services (vLLM vision, Whisper, Qwen3-TTS).
        if needs_vlm or needs_vision or needs_summary:
            gpu_lock, gpu_degraded = await acquire_gpu_lock_with_progress(
                job_id,
                operation=f"pdfua:pptx:{job_id}",
                queue_phase="gpu_queue",
                queue_percent=22,
                queue_message="GPU ausgelastet, Job wartet in der Warteschlange",
                priority=int(job.get("priority") or 2),
                avg_wait_seconds=quality_settings.queue_avg_seconds,
            )

        try:
            image_paths: List[str] = []

            # Vision analysis (optional, runs before text-based VLM)
            if needs_vision and not gpu_degraded:
                update_progress(job_id, "vision", 20, "Visuelle Analyse wird vorbereitet...")

                if render_task:
                    if not render_task.done():
                        # Release GPU lock while waiting for CPU rendering.
                        await _safe_release_gpu_lock(gpu_lock)
                        gpu_lock = None
                    try:
                        image_paths = await render_task
                    except Exception as e:
                        print(f"[PDFUA] Slide rendering failed: {e}")
                        image_paths = []

                if image_paths:
                    if gpu_lock is None:
                        gpu_lock, gpu_degraded = await acquire_gpu_lock_with_progress(
                            job_id,
                            operation=f"pdfua:pptx:{job_id}",
                            queue_phase="gpu_queue",
                            queue_percent=24,
                            queue_message="GPU belegt - warte auf Vision-Analyse",
                            priority=int(job.get("priority") or 2),
                            avg_wait_seconds=quality_settings.queue_avg_seconds,
                        )

                if image_paths and not gpu_degraded and gpu_lock is not None:
                    analyzer = get_vision_analyzer()
                    total_vision = min(len(slides), len(image_paths))

                    def _vision_progress(slide_num: int, processed: int, total: int) -> None:
                        percent = 20 + int((processed / max(total, 1)) * 10)
                        update_progress(
                            job_id,
                            "vision",
                            min(percent, 30),
                            f"Vision-Analyse: Folie {slide_num}/{total_vision}",
                            current_slide=slide_num,
                            total_slides=total_slides,
                        )

                    await analyzer.analyze_slides(
                        slides,
                        image_paths,
                        PDFUA_LANG,
                        on_progress=_vision_progress,
                    )

                    update_progress(job_id, "vision", 30, "Visuelle Analyse abgeschlossen")
                elif needs_vision:
                    update_progress(job_id, "vision", 30, "Visuelle Analyse uebersprungen")
            elif needs_vision:
                update_progress(job_id, "vision", 30, "GPU belegt - Vision Analyse uebersprungen")

            # Phase 3: Generate alt-text and diagram summaries (20-70%)
            if needs_vlm and not gpu_degraded:
                vlm_progress_base = 30 if vision_enabled else 20
                vlm_progress_range = 40 if vision_enabled else 50
                update_progress(job_id, "vlm", vlm_progress_base, "KI-Analyse wird vorbereitet...")
                captioner = get_vlm_captioner()
                processed = 0
                processed_slides: set[int] = set()
                total_targets = max(len(vlm_target_slides), 1)

                def _mark_processed(slide_num: int, message: str) -> None:
                    nonlocal processed
                    if slide_num not in processed_slides:
                        processed_slides.add(slide_num)
                        processed += 1
                    progress = vlm_progress_base + int((processed / total_targets) * vlm_progress_range)
                    update_progress(
                        job_id,
                        "vlm",
                        min(progress, 70),
                        message,
                        current_slide=slide_num,
                        total_slides=total_slides,
                    )

                # Pass 1: Alt-text for embedded images (does not require rendering)
                for slide in slides:
                    _raise_if_cancelled(job_id)
                    slide_num = int(slide.get("slide_number") or 0)
                    did_gpu_work = False
                    context_text = _slide_extracted_text_for_vlm(slide)
                    notes_ctx = _speaker_notes_for_vlm(slide) if bool(job.get("include_speaker_notes", True)) else ""
                    visual_type = str(slide.get("visual_type") or "image")
                    slide_title = str(slide.get("title") or "").strip() or None

                    # Load rendered slide image for VLM context if available
                    slide_render: bytes | None = None
                    if image_paths and 0 < slide_num <= len(image_paths):
                        try:
                            with open(image_paths[slide_num - 1], "rb") as _rf:
                                slide_render = _rf.read()
                        except Exception:
                            slide_render = None

                    for img in slide.get("_vlm_images", []):
                        if img.get("image_bytes"):
                            try:
                                alt_text = await asyncio.to_thread(
                                    captioner.generate_caption,
                                    img["image_bytes"],
                                    visual_type,
                                    context_text,
                                    slide_title,
                                    notes_ctx,
                                    slide_context_bytes=slide_render,
                                )
                                img["alt_text"] = alt_text
                                did_gpu_work = True
                            except Exception as e:
                                img["alt_text"] = f"Abbildung auf Folie {slide_num}"
                                print(f"[PDFUA] VLM failed for image on slide {slide_num}: {e}")

                    if did_gpu_work or slide_num in selected_vlm_slides:
                        _mark_processed(
                            slide_num,
                            f"Bildanalyse: Folie {slide_num}/{total_slides}",
                        )

                # Render slides with charts/diagrams for VLM analysis (CPU)
                rendered_slides: Dict[int, bytes] = {}
                if render_task and not image_paths:
                    if not render_task.done():
                        # Release GPU lock while waiting for CPU rendering.
                        await _safe_release_gpu_lock(gpu_lock)
                        gpu_lock = None
                    try:
                        image_paths = await render_task
                    except Exception as e:
                        print(f"[PDFUA] Slide rendering failed: {e}")
                        image_paths = []

                    # Load only the rendered slides we actually plan to analyze.
                    for idx, img_path in enumerate(image_paths):
                        slide_num = idx + 1
                        if slide_num not in render_slide_nums:
                            continue
                        try:
                            with open(img_path, "rb") as f:
                                rendered_slides[slide_num] = f.read()
                        except Exception as read_err:
                            print(f"[PDFUA] Failed to read rendered slide {slide_num}: {read_err}")

                    if render_dir and cleanup_render_dir_fn:
                        try:
                            cleanup_render_dir_fn(render_dir)
                        except Exception:
                            pass
                        render_dir = None

                if render_slide_nums and rendered_slides and not gpu_degraded:
                    if gpu_lock is None:
                        gpu_lock, gpu_degraded = await acquire_gpu_lock_with_progress(
                            job_id,
                            operation=f"pdfua:pptx:{job_id}",
                            queue_phase="gpu_queue",
                            queue_percent=24,
                            queue_message="GPU erneut belegt - warte auf Diagrammanalyse",
                            priority=int(job.get("priority") or 2),
                            avg_wait_seconds=quality_settings.queue_avg_seconds,
                        )

                if rendered_slides and not gpu_degraded and gpu_lock is not None:
                    for slide in slides:
                        _raise_if_cancelled(job_id)
                        slide_num = int(slide.get("slide_number") or 0)
                        if slide_num not in rendered_slides:
                            continue
                        did_gpu_work = False

                        # Generate semantic summary for charts using rendered slide image
                        if slide.get("has_chart"):
                            update_progress(
                                job_id,
                                "vlm",
                                25 + int((processed / total_targets) * 40),
                                f"Chart-Analyse: Folie {slide_num}/{total_slides}",
                                current_slide=slide_num,
                            )
                            for shape in slide.get("shapes", []):
                                if shape.get("type") == "chart":
                                    try:
                                        context_text = _slide_extracted_text_for_vlm(slide)
                                        chart_type_de = str(shape.get("chart_type_german") or "").strip()
                                        chart_title = str(shape.get("title") or "").strip()
                                        combined_title = chart_title
                                        if chart_type_de and chart_title:
                                            combined_title = f"{chart_type_de}: {chart_title}"
                                        elif chart_type_de:
                                            combined_title = chart_type_de
                                        summary = await asyncio.to_thread(
                                            captioner.generate_diagram_summary,
                                            rendered_slides[slide_num],
                                            "chart",
                                            combined_title or None,
                                            context_text,
                                            notes_ctx,
                                        )
                                        shape["summary"] = summary
                                        did_gpu_work = True
                                    except Exception as e:
                                        print(f"[PDFUA] Chart summary failed for slide {slide_num}: {e}")
                                        shape["summary"] = None

                        # Generate summary for visual diagrams
                        if slide.get("is_visual_diagram"):
                            update_progress(
                                job_id,
                                "vlm",
                                25 + int((processed / total_targets) * 40),
                                f"Diagramm-Analyse: Folie {slide_num}/{total_slides}",
                                current_slide=slide_num,
                            )
                            try:
                                context_text = _slide_extracted_text_for_vlm(slide)
                                notes_ctx = _speaker_notes_for_vlm(slide) if bool(job.get("include_speaker_notes", True)) else ""
                                visual_type = str(slide.get("visual_type") or "diagram")
                                diagram_summary = await asyncio.to_thread(
                                    captioner.generate_diagram_summary,
                                    rendered_slides[slide_num],
                                    visual_type,
                                    slide.get("title"),
                                    context_text,
                                    notes_ctx,
                                )
                                if not _is_generic_description(diagram_summary):
                                    slide["diagram_summary"] = diagram_summary
                                else:
                                    print(f"[PDFUA] Generic VLM description rejected for slide {slide_num}")
                                did_gpu_work = True
                            except Exception as e:
                                print(f"[PDFUA] Diagram summary failed for slide {slide_num}: {e}")
                                slide["diagram_summary"] = "Visuelles Diagramm mit Formen und Verbindungen"

                        if did_gpu_work or slide_num in render_slide_nums:
                            _mark_processed(
                                slide_num,
                                f"Diagramm-Analyse: Folie {slide_num}/{total_slides}",
                            )
            elif needs_vlm:
                if render_task and render_dir and cleanup_render_dir_fn:
                    async def _cleanup_render(task: asyncio.Task, tmp_dir: str) -> None:
                        try:
                            await task
                        finally:
                            try:
                                cleanup_render_dir_fn(tmp_dir)
                            except Exception:
                                pass
                    asyncio.create_task(_cleanup_render(render_task, render_dir))
                    render_dir = None
                update_progress(job_id, "vlm", 70, "GPU belegt - KI Analyse uebersprungen")
            else:
                update_progress(job_id, "vlm", 70, "Keine KI Analyse noetig - uebersprungen")

            if use_process_v2:
                enhance_slide_structure(slides)

            # Normalize speaker notes before LLM summaries so we remove directives and redundancy.
            if bool(job.get("include_speaker_notes", True)):
                try:
                    from .notes import process_speaker_notes
                    for slide in slides:
                        process_speaker_notes(slide)
                except Exception as exc:
                    print(f"[PDFUA] Speaker notes processing failed: {exc}")

            # Phase 4: Slide summaries (70-75%) - only in summary mode.
            if needs_summary:
                _raise_if_cancelled(job_id)
                update_progress(job_id, "summary", 70, "Zusammenfassungen werden erstellt...")

                # Respect includeSpeakerNotes: if disabled, exclude notes from the summary prompt as well.
                if not bool(job.get("include_speaker_notes", True)):
                    for slide in slides:
                        slide["speaker_notes"] = None

                try:
                    from .title_inference import ensure_slide_titles
                    from .processors.summary_generator import generate_slide_summaries

                    print("[PDFUA] Pre-summary title inference pass")
                    ensure_slide_titles(
                        slides,
                        allow_non_placeholder_correction=strict_title_correction,
                    )

                    summaries = await generate_slide_summaries(
                        slides,
                        PDFUA_LANG,
                        force_fallback=bool(gpu_degraded),
                    )

                    for slide in slides:
                        page_num = int(slide.get("slide_number", 0) or 0)
                        summary_data = summaries.get(page_num, {}) if isinstance(summaries, dict) else {}
                        if summary_data:
                            slide["slide_summary"] = summary_data.get("summary")
                            slide["summary_points"] = summary_data.get("key_points", [])
                            slide["summary_structure"] = summary_data.get("structure", "none")
                            slide["visual_hint"] = summary_data.get("visual_hint")

                    update_progress(job_id, "summary", 75, "Zusammenfassungen erstellt")
                except Exception as exc:
                    print(f"[PDFUA] Slide summary generation failed: {exc}")
                    update_progress(job_id, "summary", 75, "Zusammenfassungen uebersprungen")
            else:
                update_progress(job_id, "summary", 75, "Zusammenfassungen uebersprungen")
        finally:
            await _safe_release_gpu_lock(gpu_lock)
            # Remove temporary planning fields before HTML generation.
            for slide in slides:
                slide.pop("_vlm_images", None)
            if render_task and render_dir and cleanup_render_dir_fn and render_task.done():
                try:
                    cleanup_render_dir_fn(render_dir)
                except Exception:
                    pass

        # Phase 5: Build HTML (75-85%)
        _raise_if_cancelled(job_id)
        update_progress(job_id, "building", 75, "HTML wird generiert...")

        from .processors import build_html, build_html_v2, generate_document_overview
        if not bool(job.get("include_speaker_notes", True)):
            for slide in slides:
                slide["speaker_notes"] = None
        document_title = _derive_document_title(slides, job["filename"], doc_meta)
        subject = None
        creator = "VoxDrop PDF/UA Service"
        author = None
        if isinstance(doc_meta, dict):
            author = doc_meta.get("author") or doc_meta.get("last_modified_by")
            subject = doc_meta.get("subject") or doc_meta.get("category")
        author = _sanitize_author(author, document_title, doc_meta)
        subject = _sanitize_subject(subject, document_title, doc_meta)
        if not (isinstance(subject, str) and subject.strip()):
            today = datetime.utcnow().strftime("%Y-%m-%d")
            subject = f"{document_title} – Barrierefreies PDF/UA (erstellt {today})"
        if use_process_v2:
            overview = await generate_document_overview(
                slides,
                PDFUA_LANG,
                force_fallback=bool(gpu_degraded) or (not bool(job.get("summary_mode"))),
            )
            html_content = build_html_v2(
                slides,
                document_title,
                PDFUA_LANG,
                overview.get("summary"),
                overview.get("outline"),
            )
        else:
            html_content = build_html(slides, document_title, PDFUA_LANG)

        update_progress(job_id, "building", 85, "HTML generiert")

        # Phase 6: Convert to PDF/UA via Java service (85-95%)
        _raise_if_cancelled(job_id)
        update_progress(job_id, "pdfua", 85, "PDF/UA wird erstellt...")

        import httpx
        async with httpx.AsyncClient(timeout=300.0) as client:
            response = await client.post(
                f"{PDFUA_JAVA_URL}/convert",
                json={
                    "html": html_content,
                    "filename": job["filename"],
                    "lang": PDFUA_LANG,
                    "title": document_title,
                    "author": author,
                    "subject": subject,
                    "creator": creator,
                }
            )

            if response.status_code != 200:
                raise Exception(f"Java service error: {response.text}")

            pdf_bytes = response.content

        update_progress(job_id, "pdfua", 95, "PDF/UA erstellt")

        # Phase 7: Save output (95-100%)
        _raise_if_cancelled(job_id)
        update_progress(job_id, "finalizing", 95, "Wird abgeschlossen...")

        output_path = os.path.join(OUTPUT_DIR, f"{job_id}.pdf")
        with open(output_path, "wb") as f:
            f.write(pdf_bytes)

        # Complete
        job["status"] = "completed"
        job["progress"] = {
            "phase": "done",
            "percentage": 100,
            "message": "Fertig!",
        }
        job["result"] = {
            "output_path": output_path,
            "pdfua_compliant": True,
            "total_slides": total_slides,
            "complex_slides": complex_count,
            "processing_time_seconds": (
                datetime.utcnow() - datetime.fromisoformat(job["created_at"])
            ).total_seconds(),
        }
        job["completed_at"] = datetime.utcnow().isoformat()

        print(f"[PDFUA] Job {job_id} completed successfully")

        # Cleanup input file
        if os.path.exists(input_path):
            os.remove(input_path)

    except JobCancelled:
        job["status"] = "failed"
        job["error"] = "cancelled"
        job["progress"] = {
            "phase": "cancelled",
            "percentage": 0,
            "message": "Abgebrochen",
            "current_slide": 0,
            "total_slides": job.get("progress", {}).get("total_slides", 0),
        }
        job["completed_at"] = datetime.utcnow().isoformat()

        if os.path.exists(input_path):
            os.remove(input_path)
    except Exception as e:
        print(f"[PDFUA] Job {job_id} failed: {e}")
        job["status"] = "failed"
        job["error"] = str(e)
        job["completed_at"] = datetime.utcnow().isoformat()

        # Cleanup input file
        if os.path.exists(input_path):
            os.remove(input_path)


def update_progress(
    job_id: str,
    phase: str,
    percentage: int,
    message: str,
    current_slide: int = 0,
    total_slides: int = None,
    queue: Optional[dict] = None,
):
    """Update job progress."""
    if job_id in jobs:
        if jobs[job_id].get("cancelled"):
            return
        jobs[job_id]["status"] = "processing"
        jobs[job_id]["progress"]["phase"] = phase
        jobs[job_id]["progress"]["percentage"] = percentage
        jobs[job_id]["progress"]["message"] = message
        jobs[job_id]["progress"]["current_slide"] = current_slide
        if total_slides is not None:
            jobs[job_id]["progress"]["total_slides"] = total_slides
        if queue is not None:
            jobs[job_id]["queue"] = queue
        elif phase != "gpu_queue":
            jobs[job_id].pop("queue", None)


# ============================================================================
# COLOR ANALYSIS ENDPOINTS
# ============================================================================

# Color analysis job storage (separate from conversion jobs)
color_jobs: Dict[str, Dict[str, Any]] = {}
# Form analysis job storage
form_jobs: Dict[str, Dict[str, Any]] = {}


class ColorAnalysisResponse(BaseModel):
    job_id: str
    status: str
    message: str


class ColorFixRequest(BaseModel):
    job_id: str
    replacements: list
    target_level: Optional[str] = None  # 'aa' or 'aaa' for auto-fix


class FormAnalysisResponse(BaseModel):
    job_id: str
    status: str
    message: str


@app.post("/analyze-colors", response_model=ColorAnalysisResponse)
async def analyze_colors(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    """Upload PPTX and analyze colors for accessibility issues."""
    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename required")

    ext = file.filename.lower().split(".")[-1]
    if ext != "pptx":
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {ext}. Only PPTX supported."
        )

    # Check file size
    content = await file.read()
    file_size_mb = len(content) / (1024 * 1024)
    if file_size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(
            status_code=400,
            detail=f"File too large: {file_size_mb:.1f}MB. Max: {MAX_FILE_SIZE_MB}MB"
        )

    # Generate job ID and save file
    job_id = str(uuid.uuid4())
    input_path = os.path.join(UPLOAD_DIR, f"{job_id}_colors.pptx")

    with open(input_path, "wb") as f:
        f.write(content)

    # Initialize job
    color_jobs[job_id] = {
        "job_id": job_id,
        "filename": file.filename,
        "status": "pending",
        "progress": {
            "phase": "queued",
            "percentage": 0,
            "message": "In der Warteschlange...",
        },
        "result": None,
        "error": None,
        "created_at": datetime.utcnow().isoformat(),
        "completed_at": None,
        "input_path": input_path,
    }

    # Start background processing
    background_tasks.add_task(process_color_analysis, job_id)

    return ColorAnalysisResponse(
        job_id=job_id,
        status="pending",
        message="Color analysis started"
    )


@app.get("/analyze-colors/{job_id}")
async def get_color_analysis_status(job_id: str):
    """Get status of a color analysis job."""
    if job_id not in color_jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = color_jobs[job_id]
    return {
        "job_id": job_id,
        "status": job["status"],
        "progress": job["progress"],
        "result": job["result"],
        "error": job["error"],
        "created_at": job["created_at"],
        "completed_at": job["completed_at"],
    }


@app.get("/analyze-colors/{job_id}/thumbnail/{slide_num}")
async def get_slide_thumbnail(job_id: str, slide_num: int):
    """Get thumbnail image for a specific slide."""
    if job_id not in color_jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = color_jobs[job_id]
    thumbnails_dir = job.get("thumbnails_dir")

    if not thumbnails_dir:
        raise HTTPException(status_code=404, detail="Thumbnails not available")

    # Find thumbnail file
    thumb_path = os.path.join(thumbnails_dir, f"slide_{slide_num}.png")
    if not os.path.exists(thumb_path):
        # Try alternative naming
        thumb_path = os.path.join(thumbnails_dir, f"slide-{slide_num}.png")

    if not os.path.exists(thumb_path):
        raise HTTPException(status_code=404, detail="Thumbnail not found")

    return FileResponse(thumb_path, media_type="image/png")


@app.post("/fix-colors")
async def fix_colors(
    background_tasks: BackgroundTasks,
    request: ColorFixRequest,
):
    """Apply color fixes to a previously analyzed PPTX."""
    job_id = request.job_id

    if job_id not in color_jobs:
        raise HTTPException(status_code=404, detail="Analysis job not found")

    analysis_job = color_jobs[job_id]
    if analysis_job["status"] != "completed":
        raise HTTPException(
            status_code=400,
            detail="Color analysis not completed yet"
        )

    input_path = analysis_job.get("input_path")
    if not input_path or not os.path.exists(input_path):
        raise HTTPException(status_code=404, detail="Original file not found")

    # Create fix job
    fix_job_id = f"{job_id}_fix"
    color_jobs[fix_job_id] = {
        "job_id": fix_job_id,
        "parent_job_id": job_id,
        "status": "pending",
        "progress": {
            "phase": "queued",
            "percentage": 0,
            "message": "Farben werden korrigiert...",
        },
        "result": None,
        "error": None,
        "created_at": datetime.utcnow().isoformat(),
        "completed_at": None,
        "input_path": input_path,
        "replacements": request.replacements,
        "target_level": request.target_level,
    }

    # Start background processing
    background_tasks.add_task(process_color_fix, fix_job_id)

    return {
        "job_id": fix_job_id,
        "status": "pending",
        "message": "Color fix started"
    }


@app.get("/fix-colors/{job_id}/download")
async def download_fixed_pptx(job_id: str):
    """Download the fixed PPTX file."""
    if job_id not in color_jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = color_jobs[job_id]

    if job["status"] != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Job not completed. Status: {job['status']}"
        )

    output_path = job.get("result", {}).get("output_path")
    if not output_path or not os.path.exists(output_path):
        raise HTTPException(status_code=404, detail="Output file not found")

    # Get original filename from parent job
    parent_job_id = job.get("parent_job_id", job_id.replace("_fix", ""))
    parent_job = color_jobs.get(parent_job_id, {})
    original_name = parent_job.get("filename", "presentation").rsplit(".", 1)[0]
    download_name = f"{original_name}_barrierefrei.pptx"

    return FileResponse(
        output_path,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename=download_name,
    )


# ============================================================================
# FORM ANALYSIS ENDPOINTS
# ============================================================================

@app.post("/analyze-forms", response_model=FormAnalysisResponse)
async def analyze_forms(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    """Upload PDF and analyze form fields for accessibility issues."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename required")

    ext = file.filename.lower().split(".")[-1]
    if ext != "pdf":
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {ext}. Only PDF supported."
        )

    content = await file.read()
    file_size_mb = len(content) / (1024 * 1024)
    if file_size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(
            status_code=400,
            detail=f"File too large: {file_size_mb:.1f}MB. Max: {MAX_FILE_SIZE_MB}MB"
        )

    job_id = str(uuid.uuid4())
    input_path = os.path.join(UPLOAD_DIR, f"{job_id}_forms.pdf")

    with open(input_path, "wb") as f:
        f.write(content)

    form_jobs[job_id] = {
        "job_id": job_id,
        "filename": file.filename,
        "status": "pending",
        "progress": {
            "phase": "queued",
            "percentage": 0,
            "message": "In der Warteschlange...",
        },
        "result": None,
        "error": None,
        "created_at": datetime.utcnow().isoformat(),
        "completed_at": None,
        "input_path": input_path,
    }

    background_tasks.add_task(process_form_analysis, job_id)

    return FormAnalysisResponse(
        job_id=job_id,
        status="pending",
        message="Form analysis started"
    )


@app.get("/analyze-forms/{job_id}")
async def get_form_analysis_status(job_id: str):
    """Get status of a form analysis job."""
    if job_id not in form_jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = form_jobs[job_id]
    return {
        "job_id": job_id,
        "status": job["status"],
        "progress": job["progress"],
        "result": job["result"],
        "error": job["error"],
        "created_at": job["created_at"],
        "completed_at": job["completed_at"],
    }


async def process_form_analysis(job_id: str):
    """Background task to analyze form fields in a PDF."""
    job = form_jobs[job_id]
    input_path = job["input_path"]

    try:
        job["status"] = "processing"
        job["progress"] = {
            "phase": "parsing",
            "percentage": 15,
            "message": "PDF wird gelesen...",
        }

        from pypdf import PdfReader

        reader = PdfReader(input_path, strict=False)
        num_pages = len(reader.pages)

        root = reader.trailer.get("/Root", {})
        mark_info = root.get("/MarkInfo", {}) if isinstance(root, dict) else {}
        struct_tree = root.get("/StructTreeRoot") if isinstance(root, dict) else None
        is_tagged = bool(struct_tree) or bool(mark_info.get("/Marked"))

        acro_form = root.get("/AcroForm") if isinstance(root, dict) else None
        has_xfa = bool(acro_form.get("/XFA")) if isinstance(acro_form, dict) else False
        need_appearances = bool(acro_form.get("/NeedAppearances")) if isinstance(acro_form, dict) else False

        fields = reader.get_fields() or {}
        total_fields = len(fields)

        job["progress"]["percentage"] = 45
        job["progress"]["message"] = f"{total_fields} Formularfelder gefunden"

        issues = []
        field_items = []
        stats = {
            "total_fields": total_fields,
            "missing_tooltip": 0,
            "missing_name": 0,
            "required_fields": 0,
            "read_only_fields": 0,
        }

        def _field_type_label(ftype: str, flags: int) -> str:
            if ftype == "/Tx":
                return "text"
            if ftype == "/Sig":
                return "signature"
            if ftype == "/Ch":
                return "combo" if (flags & (1 << 17)) else "list"
            if ftype == "/Btn":
                if flags & (1 << 16):
                    return "button"
                if flags & (1 << 15):
                    return "radio"
                return "checkbox"
            return "other"

        for name, field in fields.items():
            field_dict = field
            try:
                getter = field.get  # type: ignore[attr-defined]
            except Exception:
                getter = None

            def _get(key, default=None):
                if getter:
                    return field.get(key, default)
                if isinstance(field_dict, dict):
                    return field_dict.get(key, default)
                return default

            raw_type = _get("/FT")
            flags = int(_get("/Ff") or 0)
            field_type = _field_type_label(raw_type, flags)
            field_name = _get("/T") or name or ""
            tooltip = _get("/TU") or ""
            required = bool(flags & 0x2)
            read_only = bool(flags & 0x1)

            if required:
                stats["required_fields"] += 1
            if read_only:
                stats["read_only_fields"] += 1

            field_issues = []
            if not field_name:
                stats["missing_name"] += 1
                field_issues.append("Kein Feldname (T)")
                issues.append({
                    "severity": "serious",
                    "message": "Formularfeld ohne Namen",
                    "field": name or "unbenannt",
                })

            if not tooltip:
                stats["missing_tooltip"] += 1
                field_issues.append("Kein Tooltip (TU)")
                issues.append({
                    "severity": "moderate",
                    "message": "Formularfeld ohne Tooltip/Alternativtext",
                    "field": field_name or name or "unbenannt",
                })

            field_items.append({
                "name": field_name or name or "unbenannt",
                "type": field_type,
                "tooltip": tooltip,
                "required": required,
                "read_only": read_only,
                "issues": field_issues,
            })

        if total_fields == 0:
            issues.append({
                "severity": "minor",
                "message": "Keine Formularfelder gefunden",
                "field": None,
            })

        if not is_tagged:
            issues.append({
                "severity": "serious",
                "message": "PDF ist nicht getaggt (Strukturbaum fehlt)",
                "field": None,
            })

        if has_xfa:
            issues.append({
                "severity": "serious",
                "message": "XFA-Formulare erkannt (schlecht unterstützt von Screenreadern)",
                "field": None,
            })

        result = {
            "summary": {
                "pages": num_pages,
                "tagged": is_tagged,
                "has_forms": total_fields > 0,
                "need_appearances": need_appearances,
                "xfa": has_xfa,
            },
            "stats": stats,
            "fields": field_items,
            "issues": issues,
        }

        job["status"] = "completed"
        job["progress"] = {
            "phase": "done",
            "percentage": 100,
            "message": "Analyse abgeschlossen",
        }
        job["result"] = result
        job["completed_at"] = datetime.utcnow().isoformat()

        if os.path.exists(input_path):
            os.remove(input_path)

    except Exception as e:
        print(f"[PDFUA] Form analysis {job_id} failed: {e}")
        job["status"] = "failed"
        job["error"] = str(e)
        job["completed_at"] = datetime.utcnow().isoformat()

        if os.path.exists(input_path):
            os.remove(input_path)


async def process_color_analysis(job_id: str):
    """Background task to analyze colors in a PPTX file."""
    job = color_jobs[job_id]
    input_path = job["input_path"]

    try:
        # Phase 1: Extract colors (0-40%)
        job["status"] = "processing"
        job["progress"] = {
            "phase": "extracting",
            "percentage": 10,
            "message": "Farben werden extrahiert...",
        }

        from .analyzers.color_analyzer import ColorExtractor
        extractor = ColorExtractor()
        color_data = await asyncio.to_thread(extractor.extract_all_colors, input_path)

        job["progress"]["percentage"] = 40
        job["progress"]["message"] = f"{len(color_data['slides'])} Folien analysiert"

        # Phase 2: Analyze contrast (40-60%)
        job["progress"]["phase"] = "analyzing"
        job["progress"]["percentage"] = 50
        job["progress"]["message"] = "Kontraste werden berechnet..."

        from .analyzers.contrast import analyze_color_pair, check_colorblind_contrast

        issues = []
        total_pairs = 0
        failing_pairs = 0

        for slide in color_data["slides"]:
            for pair in slide.get("color_pairs", []):
                total_pairs += 1
                analysis = analyze_color_pair(pair["foreground"], pair["background"])
                pair["analysis"] = analysis

                if not analysis["passes_aa"]:
                    failing_pairs += 1
                    issues.append({
                        "slide": slide["slide_number"],
                        "type": pair.get("type", "unknown"),
                        "foreground": pair["foreground"],
                        "background": pair["background"],
                        "ratio": analysis["ratio"],
                        "text_preview": pair.get("text_preview", ""),
                        "suggestions": analysis.get("suggestions", {}),
                    })

                # Add colorblind analysis
                fg_rgb = (pair["foreground"]["r"], pair["foreground"]["g"], pair["foreground"]["b"])
                bg_rgb = (pair["background"]["r"], pair["background"]["g"], pair["background"]["b"])
                pair["colorblind"] = check_colorblind_contrast(fg_rgb, bg_rgb)

        job["progress"]["percentage"] = 60

        # Phase 3: Render thumbnails (60-90%)
        job["progress"]["phase"] = "thumbnails"
        job["progress"]["percentage"] = 65
        job["progress"]["message"] = "Vorschaubilder werden erstellt..."

        thumbnails_dir = None
        try:
            from .processors.slide_renderer import render_slides_to_images
            import tempfile

            thumbnails_dir = tempfile.mkdtemp(prefix="pdfua_thumbs_")
            thumb_paths = await asyncio.to_thread(
                render_slides_to_images, input_path, thumbnails_dir
            )

            # Rename to consistent naming
            for idx, path in enumerate(thumb_paths):
                new_path = os.path.join(thumbnails_dir, f"slide_{idx + 1}.png")
                if path != new_path and os.path.exists(path):
                    os.rename(path, new_path)

            job["thumbnails_dir"] = thumbnails_dir
            job["progress"]["percentage"] = 90

        except Exception as e:
            print(f"[PDFUA] Thumbnail generation failed: {e}")
            job["progress"]["message"] = "Vorschaubilder konnten nicht erstellt werden"

        # Phase 4: Finalize (90-100%)
        job["progress"]["phase"] = "finalizing"
        job["progress"]["percentage"] = 95
        job["progress"]["message"] = "Analyse wird abgeschlossen..."

        # Complete
        job["status"] = "completed"
        job["progress"] = {
            "phase": "done",
            "percentage": 100,
            "message": "Fertig!",
        }
        job["result"] = {
            "slides": color_data["slides"],
            "total_slides": color_data["total_slides"],
            "total_color_pairs": total_pairs,
            "failing_pairs": failing_pairs,
            "issues": issues,
            "has_thumbnails": thumbnails_dir is not None,
            "summary": {
                "passes_wcag_aa": failing_pairs == 0,
                "compliance_rate": round((1 - failing_pairs / max(total_pairs, 1)) * 100, 1),
            }
        }
        job["completed_at"] = datetime.utcnow().isoformat()

        print(f"[PDFUA] Color analysis {job_id} completed: {failing_pairs}/{total_pairs} issues")

    except Exception as e:
        print(f"[PDFUA] Color analysis {job_id} failed: {e}")
        import traceback
        traceback.print_exc()
        job["status"] = "failed"
        job["error"] = str(e)
        job["completed_at"] = datetime.utcnow().isoformat()


async def process_color_fix(job_id: str):
    """Background task to fix colors in a PPTX file."""
    job = color_jobs[job_id]
    input_path = job["input_path"]

    try:
        job["status"] = "processing"
        job["progress"] = {
            "phase": "fixing",
            "percentage": 20,
            "message": "Farben werden korrigiert...",
        }

        from .analyzers.color_fixer import ColorFixer
        fixer = ColorFixer()

        output_path = os.path.join(OUTPUT_DIR, f"{job_id}.pptx")

        if job.get("target_level"):
            # Auto-fix mode
            result = await asyncio.to_thread(
                fixer.auto_fix_contrast,
                input_path,
                job["target_level"],
                output_path
            )
            job["progress"]["percentage"] = 80
        else:
            # Manual replacements
            result = await asyncio.to_thread(
                fixer.apply_fixes,
                input_path,
                job["replacements"],
                output_path
            )
            result = {"output_path": result, "fixes_applied": job["replacements"]}
            job["progress"]["percentage"] = 80

        # Complete
        job["status"] = "completed"
        job["progress"] = {
            "phase": "done",
            "percentage": 100,
            "message": "Fertig!",
        }
        job["result"] = result
        job["completed_at"] = datetime.utcnow().isoformat()

        print(f"[PDFUA] Color fix {job_id} completed")

    except Exception as e:
        print(f"[PDFUA] Color fix {job_id} failed: {e}")
        import traceback
        traceback.print_exc()
        job["status"] = "failed"
        job["error"] = str(e)
        job["completed_at"] = datetime.utcnow().isoformat()


# ============================================================================
# PDF/UA CONFORMANCE CHECK ENDPOINTS
# ============================================================================

# Job storage for PDF/UA checks
pdfua_check_jobs: Dict[str, Dict[str, Any]] = {}


class PdfuaCheckResponse(BaseModel):
    job_id: str
    status: str
    message: str


@app.post("/check-pdfua", response_model=PdfuaCheckResponse)
async def check_pdfua(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    """Upload PDF and run comprehensive PDF/UA conformance checks."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename required")

    ext = file.filename.lower().split(".")[-1]
    if ext != "pdf":
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {ext}. Only PDF supported."
        )

    content = await file.read()
    file_size_mb = len(content) / (1024 * 1024)
    if file_size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(
            status_code=400,
            detail=f"File too large: {file_size_mb:.1f}MB. Max: {MAX_FILE_SIZE_MB}MB"
        )

    job_id = str(uuid.uuid4())
    input_path = os.path.join(UPLOAD_DIR, f"{job_id}_pdfua_check.pdf")

    with open(input_path, "wb") as f:
        f.write(content)

    pdfua_check_jobs[job_id] = {
        "job_id": job_id,
        "filename": file.filename,
        "status": "pending",
        "progress": {
            "phase": "queued",
            "percentage": 0,
            "message": "In der Warteschlange...",
        },
        "result": None,
        "error": None,
        "created_at": datetime.utcnow().isoformat(),
        "completed_at": None,
        "input_path": input_path,
    }

    background_tasks.add_task(process_pdfua_check, job_id)

    return PdfuaCheckResponse(
        job_id=job_id,
        status="pending",
        message="PDF/UA check started"
    )


@app.get("/check-pdfua/{job_id}")
async def get_pdfua_check_status(job_id: str):
    """Get status of a PDF/UA check job."""
    if job_id not in pdfua_check_jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = pdfua_check_jobs[job_id]
    return {
        "job_id": job_id,
        "status": job["status"],
        "progress": job["progress"],
        "result": job["result"],
        "error": job["error"],
        "created_at": job["created_at"],
        "completed_at": job["completed_at"],
    }


def _walk_structure_tree(element, depth: int = 0, max_depth: int = 50) -> List[Dict[str, Any]]:
    """Recursively walk the PDF structure tree and collect tag info."""
    if depth > max_depth:
        return []

    tags: List[Dict[str, Any]] = []

    try:
        tag_type = str(element.get("/S", "")) if hasattr(element, "get") else ""
        alt_text = ""
        actual_text = ""
        lang = ""

        if hasattr(element, "get"):
            alt_text = str(element.get("/Alt", "") or "")
            actual_text = str(element.get("/ActualText", "") or "")
            lang = str(element.get("/Lang", "") or "")

        tags.append({
            "type": tag_type,
            "alt": alt_text,
            "actual_text": actual_text,
            "lang": lang,
            "depth": depth,
        })

        kids = None
        if hasattr(element, "get"):
            kids = element.get("/K")

        if kids is not None:
            if isinstance(kids, list):
                for kid in kids:
                    if hasattr(kid, "get"):
                        tags.extend(_walk_structure_tree(kid, depth + 1, max_depth))
            elif hasattr(kids, "get"):
                tags.extend(_walk_structure_tree(kids, depth + 1, max_depth))
    except Exception:
        pass

    return tags


def _check_font_embedding(reader) -> List[Dict[str, Any]]:
    """Check if all fonts are embedded and have ToUnicode mapping."""
    font_issues: List[Dict[str, Any]] = []
    checked_fonts: Set[str] = set()

    try:
        for page_num, page in enumerate(reader.pages):
            resources = page.get("/Resources")
            if not resources:
                continue
            fonts = resources.get("/Font")
            if not fonts:
                continue

            font_dict = fonts
            if hasattr(fonts, "get_object"):
                font_dict = fonts.get_object()

            if not isinstance(font_dict, dict):
                continue

            for font_name, font_ref in font_dict.items():
                if font_name in checked_fonts:
                    continue
                checked_fonts.add(font_name)

                try:
                    font_obj = font_ref
                    if hasattr(font_ref, "get_object"):
                        font_obj = font_ref.get_object()

                    if not isinstance(font_obj, dict):
                        continue

                    base_font = str(font_obj.get("/BaseFont", font_name))
                    subtype = str(font_obj.get("/Subtype", ""))

                    # Check embedding
                    has_descriptor = font_obj.get("/FontDescriptor") is not None
                    descriptor = None
                    if has_descriptor:
                        descriptor = font_obj.get("/FontDescriptor")
                        if hasattr(descriptor, "get_object"):
                            descriptor = descriptor.get_object()

                    is_embedded = False
                    if descriptor and isinstance(descriptor, dict):
                        is_embedded = any(
                            descriptor.get(key) is not None
                            for key in ["/FontFile", "/FontFile2", "/FontFile3"]
                        )

                    # PDF/UA requires all fonts to be embedded
                    if not is_embedded and subtype != "/Type3":
                        font_issues.append({
                            "font": base_font,
                            "page": page_num + 1,
                            "issue": "not_embedded",
                            "message": f"Schrift '{base_font}' ist nicht eingebettet",
                        })

                    # Check ToUnicode
                    has_tounicode = font_obj.get("/ToUnicode") is not None
                    if not has_tounicode and subtype not in ["/Type3"]:
                        encoding = str(font_obj.get("/Encoding", ""))
                        if "Identity" in encoding or subtype == "/Type0":
                            font_issues.append({
                                "font": base_font,
                                "page": page_num + 1,
                                "issue": "no_tounicode",
                                "message": f"Schrift '{base_font}' hat kein ToUnicode-Mapping",
                            })

                except Exception:
                    continue
    except Exception:
        pass

    return font_issues


def _check_xmp_pdfua_identifier(reader) -> Tuple[bool, str]:
    """Check if PDF/UA identifier exists in XMP metadata."""
    try:
        if hasattr(reader, "xmp_metadata") and reader.xmp_metadata:
            xmp_data = reader.xmp_metadata
            xmp_raw = None
            if hasattr(xmp_data, "stream"):
                xmp_raw = xmp_data.stream
            elif hasattr(xmp_data, "get_data"):
                xmp_raw = xmp_data.get_data()

            if xmp_raw:
                xmp_str = xmp_raw if isinstance(xmp_raw, str) else xmp_raw.decode("utf-8", errors="replace")
                if "pdfuaid" in xmp_str.lower() or "pdfaid" in xmp_str.lower():
                    if "pdfuaid:part" in xmp_str.lower():
                        return True, "PDF/UA-Identifier gefunden"
                    if "pdfaid:part" in xmp_str.lower():
                        return False, "PDF/A-Identifier gefunden, aber kein PDF/UA-Identifier"
                return False, "XMP-Metadaten vorhanden, aber kein PDF/UA-Identifier"
        return False, "Kein XMP-Metadaten oder PDF/UA-Identifier"
    except Exception:
        return False, "XMP-Metadaten konnten nicht gelesen werden"


async def process_pdfua_check(job_id: str):
    """Background task to run comprehensive PDF/UA conformance checks."""
    job = pdfua_check_jobs[job_id]
    input_path = job["input_path"]

    try:
        job["status"] = "processing"
        job["progress"] = {
            "phase": "parsing",
            "percentage": 5,
            "message": "PDF wird gelesen...",
        }

        from pypdf import PdfReader

        reader = PdfReader(input_path, strict=False)
        num_pages = len(reader.pages)

        # ----------------------------------------------------------------
        # Category results collector
        # ----------------------------------------------------------------
        categories: Dict[str, Dict[str, Any]] = {}

        def add_check(category: str, check_id: str, name: str, passed: bool,
                       severity: str, message: str, details: Any = None):
            if category not in categories:
                categories[category] = {"checks": [], "passed": 0, "failed": 0, "total": 0}
            cat = categories[category]
            cat["total"] += 1
            if passed:
                cat["passed"] += 1
            else:
                cat["failed"] += 1
            cat["checks"].append({
                "id": check_id,
                "name": name,
                "passed": passed,
                "severity": severity,
                "message": message,
                "details": details,
            })

        # ----------------------------------------------------------------
        # 1. METADATA CHECKS (10%)
        # ----------------------------------------------------------------
        job["progress"] = {"phase": "metadata", "percentage": 10, "message": "Metadaten werden geprüft..."}

        root = reader.trailer.get("/Root", {})
        root_obj = root
        if hasattr(root, "get_object"):
            root_obj = root.get_object()

        # 1a. Document title
        meta = reader.metadata
        doc_title = ""
        if meta:
            doc_title = str(meta.title or "").strip()

        has_title = bool(doc_title)
        add_check("metadata", "meta-title", "Dokumenttitel",
                   has_title, "serious" if not has_title else "minor",
                   f"Titel: '{doc_title}'" if has_title else "Kein Dokumenttitel gesetzt (dc:title)")

        # 1b. Display title in viewer preferences
        viewer_prefs = root_obj.get("/ViewerPreferences") if isinstance(root_obj, dict) else None
        if hasattr(viewer_prefs, "get_object"):
            viewer_prefs = viewer_prefs.get_object()
        display_title = False
        if isinstance(viewer_prefs, dict):
            display_title = str(viewer_prefs.get("/DisplayDocTitle", "")).lower() == "true" or viewer_prefs.get("/DisplayDocTitle") is True
        add_check("metadata", "meta-display-title", "Titel in Titelleiste anzeigen",
                   display_title, "moderate" if not display_title else "minor",
                   "DisplayDocTitle ist aktiviert" if display_title else "DisplayDocTitle ist nicht gesetzt – Screenreader zeigt Dateinamen statt Titel")

        # 1c. Document language
        doc_lang = ""
        if isinstance(root_obj, dict):
            doc_lang = str(root_obj.get("/Lang", "") or "").strip()
        has_lang = bool(doc_lang)
        add_check("metadata", "meta-lang", "Dokumentsprache",
                   has_lang, "critical" if not has_lang else "minor",
                   f"Sprache: '{doc_lang}'" if has_lang else "Keine Dokumentsprache gesetzt (/Lang)")

        # 1d. PDF/UA identifier
        has_pdfua_id, pdfua_id_msg = _check_xmp_pdfua_identifier(reader)
        add_check("metadata", "meta-pdfua-id", "PDF/UA-Identifier",
                   has_pdfua_id, "serious" if not has_pdfua_id else "minor",
                   pdfua_id_msg)

        # ----------------------------------------------------------------
        # 2. STRUCTURE / TAG TREE (25%)
        # ----------------------------------------------------------------
        job["progress"] = {"phase": "structure", "percentage": 25, "message": "Strukturbaum wird analysiert..."}

        mark_info = root_obj.get("/MarkInfo", {}) if isinstance(root_obj, dict) else {}
        if hasattr(mark_info, "get_object"):
            mark_info = mark_info.get_object()
        struct_tree_root = root_obj.get("/StructTreeRoot") if isinstance(root_obj, dict) else None
        is_marked = False
        if isinstance(mark_info, dict):
            is_marked = bool(mark_info.get("/Marked"))

        has_struct_tree = struct_tree_root is not None
        is_tagged = has_struct_tree or is_marked

        add_check("structure", "struct-tagged", "Getaggtes PDF",
                   is_tagged, "critical" if not is_tagged else "minor",
                   "Dokument ist getaggt" if is_tagged else "Dokument ist NICHT getaggt – keine Barrierefreiheit möglich")

        add_check("structure", "struct-tree", "Strukturbaum vorhanden",
                   has_struct_tree, "critical" if not has_struct_tree else "minor",
                   "StructTreeRoot vorhanden" if has_struct_tree else "Kein StructTreeRoot – Tags fehlen komplett")

        # Walk the structure tree
        all_tags: List[Dict[str, Any]] = []
        if has_struct_tree:
            try:
                struct_obj = struct_tree_root
                if hasattr(struct_tree_root, "get_object"):
                    struct_obj = struct_tree_root.get_object()
                all_tags = _walk_structure_tree(struct_obj)
            except Exception as e:
                print(f"[PDFUA] Structure tree walk failed: {e}")

        tag_types = [t["type"] for t in all_tags if t["type"]]

        add_check("structure", "struct-tags-count", "Anzahl Struktur-Tags",
                   len(tag_types) > 0, "critical" if len(tag_types) == 0 and is_tagged else "minor",
                   f"{len(tag_types)} Tags gefunden" if tag_types else "Keine Struktur-Tags gefunden")

        # Role mapping
        role_map = {}
        if has_struct_tree:
            try:
                struct_obj = struct_tree_root
                if hasattr(struct_tree_root, "get_object"):
                    struct_obj = struct_tree_root.get_object()
                if isinstance(struct_obj, dict):
                    rm = struct_obj.get("/RoleMap")
                    if hasattr(rm, "get_object"):
                        rm = rm.get_object()
                    if isinstance(rm, dict):
                        role_map = {str(k): str(v) for k, v in rm.items()}
            except Exception:
                pass

        if role_map:
            add_check("structure", "struct-rolemap", "Role-Mapping",
                       True, "minor",
                       f"{len(role_map)} benutzerdefinierte Rollen gemappt")

        # ----------------------------------------------------------------
        # 3. HEADINGS (35%)
        # ----------------------------------------------------------------
        job["progress"] = {"phase": "headings", "percentage": 35, "message": "Überschriften werden geprüft..."}

        heading_tags = [t for t in tag_types if t.startswith("/H") and len(t) <= 3 and t[2:].isdigit()] if tag_types else []
        heading_levels = sorted(set(int(t[2:]) for t in heading_tags if t[2:].isdigit()))

        has_headings = len(heading_tags) > 0
        add_check("headings", "head-present", "Überschriften vorhanden",
                   has_headings, "serious" if not has_headings and num_pages > 1 else "moderate",
                   f"{len(heading_tags)} Überschriften-Tags gefunden (Ebenen: {', '.join(f'H{l}' for l in heading_levels)})" if has_headings else "Keine Überschriften-Tags (H1-H6) gefunden")

        # Check hierarchy
        if heading_levels:
            starts_with_h1 = heading_levels[0] == 1
            add_check("headings", "head-h1", "Beginnt mit H1",
                       starts_with_h1, "serious" if not starts_with_h1 else "minor",
                       "Überschriften beginnen mit H1" if starts_with_h1 else f"Überschriften beginnen mit H{heading_levels[0]} statt H1")

            skipped = []
            for i in range(len(heading_levels) - 1):
                if heading_levels[i + 1] - heading_levels[i] > 1:
                    skipped.append(f"H{heading_levels[i]} -> H{heading_levels[i+1]}")

            no_skips = len(skipped) == 0
            add_check("headings", "head-hierarchy", "Überschriften-Hierarchie",
                       no_skips, "moderate" if not no_skips else "minor",
                       "Keine übersprungenen Ebenen" if no_skips else f"Übersprungene Ebenen: {', '.join(skipped)}")

        # ----------------------------------------------------------------
        # 4. IMAGES / FIGURES (45%)
        # ----------------------------------------------------------------
        job["progress"] = {"phase": "images", "percentage": 45, "message": "Bilder werden geprüft..."}

        figure_tags = [t for t in all_tags if t["type"] == "/Figure"]
        total_figures = len(figure_tags)
        figures_with_alt = [f for f in figure_tags if f["alt"].strip()]
        figures_without_alt = total_figures - len(figures_with_alt)

        if total_figures > 0:
            all_have_alt = figures_without_alt == 0
            add_check("images", "img-alt", "Alternativtexte für Bilder",
                       all_have_alt, "critical" if not all_have_alt else "minor",
                       f"Alle {total_figures} Bilder haben Alt-Text" if all_have_alt else f"{figures_without_alt} von {total_figures} Bildern ohne Alt-Text",
                       {"total": total_figures, "missing_alt": figures_without_alt})
        else:
            add_check("images", "img-alt", "Alternativtexte für Bilder",
                       True, "minor",
                       "Keine Figure-Tags gefunden (keine Bilder oder Bilder nicht getaggt)")

        # ----------------------------------------------------------------
        # 5. TABLES (55%)
        # ----------------------------------------------------------------
        job["progress"] = {"phase": "tables", "percentage": 55, "message": "Tabellen werden geprüft..."}

        table_tags = [t for t in tag_types if t == "/Table"]
        th_tags = [t for t in tag_types if t == "/TH"]
        td_tags = [t for t in tag_types if t == "/TD"]
        tr_tags = [t for t in tag_types if t == "/TR"]

        if table_tags:
            has_headers = len(th_tags) > 0
            add_check("tables", "tbl-present", "Tabellen-Struktur",
                       True, "minor",
                       f"{len(table_tags)} Tabellen mit {len(tr_tags)} Zeilen gefunden")

            add_check("tables", "tbl-headers", "Tabellen-Kopfzellen (TH)",
                       has_headers, "serious" if not has_headers else "minor",
                       f"{len(th_tags)} TH-Tags gefunden" if has_headers else "Keine TH-Tags – Tabellen-Header fehlen für Screenreader")

            has_td = len(td_tags) > 0
            add_check("tables", "tbl-cells", "Tabellen-Datenzellen (TD)",
                       has_td, "moderate" if not has_td else "minor",
                       f"{len(td_tags)} TD-Tags gefunden" if has_td else "Keine TD-Tags gefunden")

        # ----------------------------------------------------------------
        # 6. LISTS (60%)
        # ----------------------------------------------------------------
        job["progress"] = {"phase": "lists", "percentage": 60, "message": "Listen werden geprüft..."}

        list_tags = [t for t in tag_types if t == "/L"]
        li_tags = [t for t in tag_types if t == "/LI"]
        lbody_tags = [t for t in tag_types if t == "/LBody"]

        if list_tags:
            has_li = len(li_tags) > 0
            add_check("lists", "list-structure", "Listen-Struktur",
                       has_li, "moderate" if not has_li else "minor",
                       f"{len(list_tags)} Listen mit {len(li_tags)} Einträgen" if has_li else "Listen-Tags ohne LI-Einträge")

            has_lbody = len(lbody_tags) > 0
            add_check("lists", "list-body", "Listen-Inhalt (LBody)",
                       has_lbody, "moderate" if not has_lbody else "minor",
                       f"{len(lbody_tags)} LBody-Tags" if has_lbody else "Keine LBody-Tags in Listen")

        # ----------------------------------------------------------------
        # 7. LINKS (65%)
        # ----------------------------------------------------------------
        job["progress"] = {"phase": "links", "percentage": 65, "message": "Links werden geprüft..."}

        link_tags = [t for t in all_tags if t["type"] == "/Link"]
        total_links = len(link_tags)

        # Count link annotations
        link_annots = 0
        for page in reader.pages:
            annots = page.get("/Annots")
            if annots:
                if hasattr(annots, "get_object"):
                    annots = annots.get_object()
                if isinstance(annots, list):
                    for annot in annots:
                        annot_obj = annot
                        if hasattr(annot, "get_object"):
                            annot_obj = annot.get_object()
                        if isinstance(annot_obj, dict) and str(annot_obj.get("/Subtype", "")) == "/Link":
                            link_annots += 1

        if link_annots > 0:
            links_tagged = total_links > 0
            add_check("links", "link-tags", "Link-Tags",
                       links_tagged, "serious" if not links_tagged else "minor",
                       f"{total_links} Link-Tags für {link_annots} Link-Annotationen" if links_tagged else f"{link_annots} Link-Annotationen ohne Link-Tags")

        # ----------------------------------------------------------------
        # 8. FORM FIELDS (72%)
        # ----------------------------------------------------------------
        job["progress"] = {"phase": "forms", "percentage": 72, "message": "Formularfelder werden geprüft..."}

        acro_form = root_obj.get("/AcroForm") if isinstance(root_obj, dict) else None
        fields_dict = reader.get_fields() or {}
        total_fields = len(fields_dict)

        if total_fields > 0:
            missing_tooltip = 0
            missing_name = 0
            for name, field in fields_dict.items():
                def _fget(key, default=None):
                    if hasattr(field, "get"):
                        return field.get(key, default)
                    if isinstance(field, dict):
                        return field.get(key, default)
                    return default

                field_name = _fget("/T") or name or ""
                tooltip = _fget("/TU") or ""
                if not field_name:
                    missing_name += 1
                if not tooltip:
                    missing_tooltip += 1

            add_check("forms", "form-present", "Formularfelder",
                       True, "minor",
                       f"{total_fields} Formularfelder gefunden")

            all_named = missing_name == 0
            add_check("forms", "form-names", "Feldnamen",
                       all_named, "serious" if not all_named else "minor",
                       "Alle Felder haben Namen" if all_named else f"{missing_name} Felder ohne Namen")

            all_tooltips = missing_tooltip == 0
            add_check("forms", "form-tooltips", "Feld-Tooltips (TU)",
                       all_tooltips, "moderate" if not all_tooltips else "minor",
                       "Alle Felder haben Tooltips" if all_tooltips else f"{missing_tooltip} Felder ohne Tooltip/Beschreibung")

            # XFA check
            has_xfa = False
            if acro_form:
                acro_obj = acro_form
                if hasattr(acro_form, "get_object"):
                    acro_obj = acro_form.get_object()
                has_xfa = bool(acro_obj.get("/XFA")) if isinstance(acro_obj, dict) else False

            add_check("forms", "form-xfa", "Keine XFA-Formulare",
                       not has_xfa, "serious" if has_xfa else "minor",
                       "Kein XFA (gut)" if not has_xfa else "XFA-Formulare erkannt – schlecht unterstützt von Screenreadern")

        # ----------------------------------------------------------------
        # 9. FONTS (80%)
        # ----------------------------------------------------------------
        job["progress"] = {"phase": "fonts", "percentage": 80, "message": "Schriften werden geprüft..."}

        font_issues = await asyncio.to_thread(_check_font_embedding, reader)

        not_embedded = [fi for fi in font_issues if fi["issue"] == "not_embedded"]
        no_tounicode = [fi for fi in font_issues if fi["issue"] == "no_tounicode"]

        all_embedded = len(not_embedded) == 0
        add_check("fonts", "font-embedded", "Schriften eingebettet",
                   all_embedded, "critical" if not all_embedded else "minor",
                   "Alle Schriften sind eingebettet" if all_embedded else f"{len(not_embedded)} Schriften nicht eingebettet",
                   {"missing": [fi["font"] for fi in not_embedded]} if not_embedded else None)

        all_unicode = len(no_tounicode) == 0
        add_check("fonts", "font-tounicode", "ToUnicode-Mapping",
                   all_unicode, "serious" if not all_unicode else "minor",
                   "Alle Schriften haben Unicode-Mapping" if all_unicode else f"{len(no_tounicode)} Schriften ohne ToUnicode-Mapping",
                   {"missing": [fi["font"] for fi in no_tounicode]} if no_tounicode else None)

        # ----------------------------------------------------------------
        # 10. BOOKMARKS / OUTLINES (87%)
        # ----------------------------------------------------------------
        job["progress"] = {"phase": "bookmarks", "percentage": 87, "message": "Lesezeichen werden geprüft..."}

        bookmarks = []
        try:
            bookmarks = reader.outline or []
            if not isinstance(bookmarks, list):
                bookmarks = []
        except Exception:
            bookmarks = []

        def count_bookmarks(items) -> int:
            count = 0
            for item in items:
                if isinstance(item, list):
                    count += count_bookmarks(item)
                else:
                    count += 1
            return count

        bookmark_count = count_bookmarks(bookmarks)
        needs_bookmarks = num_pages > 4
        has_bookmarks = bookmark_count > 0

        if needs_bookmarks:
            add_check("bookmarks", "bm-present", "Lesezeichen vorhanden",
                       has_bookmarks, "moderate" if not has_bookmarks else "minor",
                       f"{bookmark_count} Lesezeichen" if has_bookmarks else f"Keine Lesezeichen bei {num_pages} Seiten – Navigation erschwert")
        else:
            add_check("bookmarks", "bm-present", "Lesezeichen vorhanden",
                       has_bookmarks or not needs_bookmarks, "minor",
                       f"{bookmark_count} Lesezeichen" if has_bookmarks else f"Keine Lesezeichen ({num_pages} Seiten)")

        # ----------------------------------------------------------------
        # 11. TAB ORDER (92%)
        # ----------------------------------------------------------------
        job["progress"] = {"phase": "taborder", "percentage": 92, "message": "Tab-Reihenfolge wird geprüft..."}

        pages_with_struct_tabs = 0
        for page in reader.pages:
            tabs = page.get("/Tabs")
            if str(tabs) == "/S":
                pages_with_struct_tabs += 1

        all_struct_tabs = pages_with_struct_tabs == num_pages
        add_check("taborder", "tab-structure", "Tab-Reihenfolge folgt Struktur",
                   all_struct_tabs, "moderate" if not all_struct_tabs else "minor",
                   f"Alle {num_pages} Seiten nutzen Struktur-Tab-Reihenfolge" if all_struct_tabs else f"Nur {pages_with_struct_tabs} von {num_pages} Seiten mit Struktur-Tab-Reihenfolge (/Tabs /S)")

        # ----------------------------------------------------------------
        # SUMMARY (95%)
        # ----------------------------------------------------------------
        job["progress"] = {"phase": "summary", "percentage": 95, "message": "Ergebnisse werden zusammengefasst..."}

        total_checks = 0
        total_passed = 0
        total_failed = 0
        category_summaries = {}

        for cat_name, cat_data in categories.items():
            total_checks += cat_data["total"]
            total_passed += cat_data["passed"]
            total_failed += cat_data["failed"]
            category_summaries[cat_name] = {
                "passed": cat_data["passed"],
                "failed": cat_data["failed"],
                "total": cat_data["total"],
                "checks": cat_data["checks"],
            }

        score = round((total_passed / max(total_checks, 1)) * 100, 1)

        has_critical = any(
            c["severity"] == "critical" and not c["passed"]
            for cat in categories.values()
            for c in cat["checks"]
        )
        has_serious = any(
            c["severity"] == "serious" and not c["passed"]
            for cat in categories.values()
            for c in cat["checks"]
        )

        if has_critical:
            overall_status = "critical"
        elif has_serious:
            overall_status = "serious"
        elif total_failed > 0:
            overall_status = "moderate"
        else:
            overall_status = "pass"

        tag_type_counts: Dict[str, int] = {}
        for t in tag_types:
            tag_type_counts[t] = tag_type_counts.get(t, 0) + 1

        result = {
            "summary": {
                "pages": num_pages,
                "score": score,
                "status": overall_status,
                "total_checks": total_checks,
                "passed": total_passed,
                "failed": total_failed,
                "tagged": is_tagged,
                "has_pdfua_id": has_pdfua_id,
                "language": doc_lang,
                "title": doc_title,
            },
            "categories": category_summaries,
            "tag_statistics": tag_type_counts,
        }

        job["status"] = "completed"
        job["progress"] = {
            "phase": "done",
            "percentage": 100,
            "message": "PDF/UA-Prüfung abgeschlossen",
        }
        job["result"] = result
        job["completed_at"] = datetime.utcnow().isoformat()

        if os.path.exists(input_path):
            os.remove(input_path)

        print(f"[PDFUA] Check {job_id} completed: score={score}%, status={overall_status}")

    except Exception as e:
        print(f"[PDFUA] Check {job_id} failed: {e}")
        import traceback
        traceback.print_exc()
        job["status"] = "failed"
        job["error"] = str(e)
        job["completed_at"] = datetime.utcnow().isoformat()

        if os.path.exists(input_path):
            os.remove(input_path)
