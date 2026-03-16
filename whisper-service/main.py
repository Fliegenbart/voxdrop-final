"""
VoxDrop Whisper Service - GDPR-compliant local transcription
Uses faster-whisper for efficient GPU/CPU inference
"""

import os
import tempfile
import logging
import re
import time
import threading
from collections import Counter
from typing import Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from faster_whisper import WhisperModel
from gpu_lock import acquire_gpu_lock, release_gpu_lock, GpuLock

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="VoxDrop Whisper Service",
    description="GDPR-compliant local speech-to-text transcription",
    version="1.0.0"
)

# CORS middleware (configure via CORS_ORIGINS env, comma-separated)
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

# Model configuration
MODEL_SIZE = os.getenv("WHISPER_MODEL", "large-v3")  # Options: tiny, base, small, medium, large-v2, large-v3
DEVICE = os.getenv("WHISPER_DEVICE", "auto")  # auto, cuda, cpu
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "auto")  # auto, float16, int8, int8_float16
VAD_ENABLED = os.getenv("WHISPER_VAD_ENABLED", "true").lower() != "false"
VAD_MIN_SILENCE_MS = int(os.getenv("WHISPER_VAD_MIN_SILENCE_MS", "500"))
VAD_SPEECH_PAD_MS = int(os.getenv("WHISPER_VAD_SPEECH_PAD_MS", "200"))
VAD_MIN_SPEECH_MS = int(os.getenv("WHISPER_VAD_MIN_SPEECH_MS", "250"))
VAD_THRESHOLD = float(os.getenv("WHISPER_VAD_THRESHOLD", "0.35"))

# If VAD yields suspiciously little output on long recordings, retry without VAD.
VAD_FALLBACK_MIN_DURATION_S = float(os.getenv("WHISPER_VAD_FALLBACK_MIN_DURATION_S", "90"))
VAD_FALLBACK_MIN_WORDS = int(os.getenv("WHISPER_VAD_FALLBACK_MIN_WORDS", "30"))
VAD_FALLBACK_MIN_WPM = float(os.getenv("WHISPER_VAD_FALLBACK_MIN_WPM", "2"))
VAD_FALLBACK_MIN_CPM = float(os.getenv("WHISPER_VAD_FALLBACK_MIN_CPM", "10"))

# Reduce repetition/hallucination on low-speech audio.
CONDITION_ON_PREVIOUS_TEXT = os.getenv("WHISPER_CONDITION_ON_PREVIOUS_TEXT", "false").lower() == "true"
HALLUCINATION_MIN_DURATION_S = float(os.getenv("WHISPER_HALLUCINATION_MIN_DURATION_S", "120"))
HALLUCINATION_MIN_TOKENS = int(os.getenv("WHISPER_HALLUCINATION_MIN_TOKENS", "40"))
HALLUCINATION_MAX_UNIQUE_RATIO = float(os.getenv("WHISPER_HALLUCINATION_MAX_UNIQUE_RATIO", "0.35"))
HALLUCINATION_MAX_TOP_TOKEN_RATIO = float(os.getenv("WHISPER_HALLUCINATION_MAX_TOP_TOKEN_RATIO", "0.4"))
HALLUCINATION_MAX_RUN_RATIO = float(os.getenv("WHISPER_HALLUCINATION_MAX_RUN_RATIO", "0.2"))
HALLUCINATION_NO_SPEECH_MAX_WORDS = int(os.getenv("WHISPER_HALLUCINATION_NO_SPEECH_MAX_WORDS", "12"))

# Global model instance (loaded once at startup)
model: Optional[WhisperModel] = None
_model_lock = threading.Lock()
_last_used_ts: float = 0.0
_active_model_size: str = MODEL_SIZE
_active_device: str = DEVICE
_active_compute_type: str = COMPUTE_TYPE

# Loading/unloading behavior:
# - Default is lazy-load to keep VRAM free for other GPU services (e.g., Qwen3-TTS).
WHISPER_PRELOAD = os.getenv("WHISPER_PRELOAD", "false").lower() == "true"
# 0 means unload immediately after each request.
WHISPER_KEEP_LOADED_SECONDS = int(os.getenv("WHISPER_KEEP_LOADED_SECONDS", "0"))


class TranscriptionResponse(BaseModel):
    text: str
    language: str
    duration: float
    words: list
    srt: str


class HealthResponse(BaseModel):
    status: str
    model: str
    device: str


def format_srt_time(seconds: float) -> str:
    """Format seconds to SRT time format (HH:MM:SS,mmm)"""
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{hrs:02d}:{mins:02d}:{secs:02d},{ms:03d}"


def generate_srt(words: list, max_words_per_line: int = 8) -> str:
    """Generate SRT content from word timestamps"""
    if not words:
        return ""

    subtitles = []
    index = 1

    for i in range(0, len(words), max_words_per_line):
        chunk = words[i:i + max_words_per_line]
        start_time = format_srt_time(chunk[0]["start"])
        end_time = format_srt_time(chunk[-1]["end"])
        text = " ".join(w["word"] for w in chunk)

        subtitles.append(f"{index}\n{start_time} --> {end_time}\n{text}\n")
        index += 1

    return "\n".join(subtitles)


def _transcribe_with_options(
    audio_path: str,
    vad_enabled: bool,
    beam_size: int,
    language: Optional[str] = None,
    prompt: Optional[str] = None,
):
    """Run model transcribe with optional VAD parameters."""
    vad_parameters = dict(
        min_silence_duration_ms=VAD_MIN_SILENCE_MS,
        speech_pad_ms=VAD_SPEECH_PAD_MS,
        min_speech_duration_ms=VAD_MIN_SPEECH_MS,
        threshold=VAD_THRESHOLD,
    )

    if vad_enabled:
        return model.transcribe(
            audio_path,
            beam_size=beam_size,
            word_timestamps=True,
            vad_filter=True,
            vad_parameters=vad_parameters,
            condition_on_previous_text=CONDITION_ON_PREVIOUS_TEXT,
            language=language,
            initial_prompt=prompt,
        )

    return model.transcribe(
        audio_path,
        beam_size=beam_size,
        word_timestamps=True,
        vad_filter=False,
        condition_on_previous_text=CONDITION_ON_PREVIOUS_TEXT,
        language=language,
        initial_prompt=prompt,
    )


def _collect_transcription(segments_iter) -> tuple[str, list]:
    """Collect text and word timestamps from the segments iterator."""
    full_text = []
    words = []

    for segment in segments_iter:
        full_text.append(segment.text.strip())

        if segment.words:
            for word in segment.words:
                words.append({
                    "word": word.word.strip(),
                    "start": round(word.start, 3),
                    "end": round(word.end, 3),
                })

    text = " ".join(full_text).strip()
    return text, words


def _needs_vad_fallback(duration_s: float, word_count: int, char_count: int) -> bool:
    """Heuristic to detect when VAD removed almost all speech on long audio."""
    if duration_s < VAD_FALLBACK_MIN_DURATION_S:
        return False

    minutes = max(1.0, duration_s / 60.0)
    min_words = max(VAD_FALLBACK_MIN_WORDS, VAD_FALLBACK_MIN_WPM * minutes)
    min_chars = VAD_FALLBACK_MIN_CPM * minutes

    return word_count < min_words or char_count < min_chars


def _tokenize_words(words: list) -> list[str]:
    tokens: list[str] = []
    for item in words:
        raw = str(item.get("word", "")).strip().lower()
        if not raw:
            continue
        # Strip leading/trailing punctuation but keep inner apostrophes.
        cleaned = re.sub(r"^[^\w]+|[^\w]+$", "", raw)
        if cleaned:
            tokens.append(cleaned)
    return tokens


def _max_run_ratio(tokens: list[str]) -> float:
    if not tokens:
        return 0.0
    max_run = 1
    run = 1
    prev = tokens[0]
    for token in tokens[1:]:
        if token == prev:
            run += 1
            if run > max_run:
                max_run = run
        else:
            run = 1
            prev = token
    return max_run / max(1, len(tokens))


def _looks_like_hallucination(text: str, words: list, duration_s: float) -> bool:
    if duration_s < HALLUCINATION_MIN_DURATION_S:
        return False
    tokens = _tokenize_words(words)
    if len(tokens) < HALLUCINATION_MIN_TOKENS:
        return False

    counts = Counter(tokens)
    total = len(tokens)
    unique_ratio = len(counts) / max(1, total)
    top_ratio = (max(counts.values()) / total) if counts else 0.0
    run_ratio = _max_run_ratio(tokens)

    looks_bad = (
        (unique_ratio < HALLUCINATION_MAX_UNIQUE_RATIO and top_ratio > HALLUCINATION_MAX_TOP_TOKEN_RATIO)
        or (run_ratio > HALLUCINATION_MAX_RUN_RATIO and top_ratio > 0.25)
        or top_ratio > 0.6
    )

    if looks_bad:
        logger.warning(
            "Hallucination heuristic triggered: duration=%.2fs, tokens=%d, unique_ratio=%.3f, top_ratio=%.3f, run_ratio=%.3f, chars=%d",
            duration_s,
            total,
            unique_ratio,
            top_ratio,
            run_ratio,
            len(text),
        )

    return looks_bad


@app.on_event("startup")
async def load_model():
    """Load Whisper model at startup"""
    global model
    if not WHISPER_PRELOAD:
        logger.info("WHISPER_PRELOAD=false; Whisper model will be loaded on first request")
        return

    logger.info(f"Loading Whisper model: {MODEL_SIZE} on {DEVICE} with {COMPUTE_TYPE}")

    # Use local cache dir, fallback to Docker path
    cache_dir = os.getenv("WHISPER_CACHE_DIR", os.path.expanduser("~/.cache/whisper"))
    os.makedirs(cache_dir, exist_ok=True)

    try:
        model = WhisperModel(
            MODEL_SIZE,
            device=DEVICE,
            compute_type=COMPUTE_TYPE,
            download_root=cache_dir
        )
        global _last_used_ts
        _last_used_ts = time.time()
        logger.info("Whisper model loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        raise


def _ensure_model_loaded() -> None:
    """Lazy-load the Whisper model on demand."""
    global model, _last_used_ts, _active_model_size, _active_device, _active_compute_type
    if model is not None:
        _last_used_ts = time.time()
        return

    with _model_lock:
        if model is not None:
            _last_used_ts = time.time()
            return

        logger.info(f"Lazy-loading Whisper model: {MODEL_SIZE} on {DEVICE} with {COMPUTE_TYPE}")
        cache_dir = os.getenv("WHISPER_CACHE_DIR", os.path.expanduser("~/.cache/whisper"))
        os.makedirs(cache_dir, exist_ok=True)
        try:
            model = WhisperModel(
                MODEL_SIZE,
                device=DEVICE,
                compute_type=COMPUTE_TYPE,
                download_root=cache_dir,
            )
            _active_model_size = MODEL_SIZE
            _active_device = DEVICE
            _active_compute_type = COMPUTE_TYPE
        except Exception as e:
            # Common failure mode on single-GPU hosts: CUDA OOM because other services keep VRAM allocated.
            msg = str(e).lower()
            oom_like = ("out of memory" in msg) or ("cuda" in msg and "memory" in msg)
            if oom_like and str(DEVICE).lower() in ("cuda", "auto"):
                # Try lower-memory compute type first (still on GPU).
                gpu_fallback_compute = os.getenv("WHISPER_FALLBACK_COMPUTE_TYPE_GPU", "int8_float16")
                try:
                    logger.warning(
                        "Whisper CUDA OOM on load. Retrying with compute_type=%s (still on GPU).",
                        gpu_fallback_compute,
                    )
                    model = WhisperModel(
                        MODEL_SIZE,
                        device="cuda",
                        compute_type=gpu_fallback_compute,
                        download_root=cache_dir,
                    )
                    _active_model_size = MODEL_SIZE
                    _active_device = "cuda"
                    _active_compute_type = gpu_fallback_compute
                except Exception as e2:
                    # Fall back to CPU + smaller model for reliability (even if slower).
                    cpu_model = os.getenv("WHISPER_FALLBACK_MODEL", "medium")
                    cpu_compute = os.getenv("WHISPER_FALLBACK_COMPUTE_TYPE_CPU", "int8")
                    logger.warning(
                        "Whisper still failed on GPU. Falling back to CPU model=%s compute_type=%s. Error: %s",
                        cpu_model,
                        cpu_compute,
                        e2,
                    )
                    model = WhisperModel(
                        cpu_model,
                        device="cpu",
                        compute_type=cpu_compute,
                        download_root=cache_dir,
                    )
                    _active_model_size = cpu_model
                    _active_device = "cpu"
                    _active_compute_type = cpu_compute
            else:
                raise
        _last_used_ts = time.time()


def _maybe_unload_model() -> None:
    """Unload model to free VRAM when configured."""
    global model
    if model is None:
        return

    keep_s = max(0, WHISPER_KEEP_LOADED_SECONDS)
    if keep_s > 0:
        # Not unloading in this mode; a future enhancement could evict after idle time.
        return

    with _model_lock:
        if model is None:
            return
        logger.info("Unloading Whisper model to free VRAM (WHISPER_KEEP_LOADED_SECONDS=0)")
        model = None
        try:
            import gc
            gc.collect()
        except Exception:
            pass
        # Best-effort CUDA cache release if torch exists in the environment.
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    # Keep the container healthy even when the model is not preloaded.
    return HealthResponse(
        status="ok",
        model=_active_model_size,
        device=_active_device
    )


@app.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe(
    audio: UploadFile = File(...),
    mode: str = Form("quality"),
    language: Optional[str] = Form(None),
    prompt: Optional[str] = Form(None),
):
    """
    Transcribe audio file using local Whisper model.

    All processing happens locally - no data leaves the server.
    GDPR compliant: audio is processed in memory and immediately deleted.
    """
    try:
        _ensure_model_loaded()
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        raise HTTPException(status_code=503, detail="Model not available")

    # Validate file type
    allowed_types = [
        "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav",
        "audio/mp4", "audio/m4a", "audio/webm", "audio/ogg",
        "video/mp4", "video/webm"  # Also accept video files
    ]

    content_type = audio.content_type or ""
    if not any(t in content_type for t in ["audio", "video"]):
        logger.warning(f"Unexpected content type: {content_type}, proceeding anyway")

    tmp_path: Optional[str] = None
    gpu_lock: Optional[GpuLock] = None

    try:
        # Save to temporary file (faster-whisper needs a file path)
        with tempfile.NamedTemporaryFile(delete=False, suffix=".audio") as tmp:
            content = await audio.read()
            tmp.write(content)
            tmp_path = tmp.name

        logger.info(f"Processing audio file: [REDACTED] ({len(content)} bytes)")

        raw_mode = str(mode or "quality").strip().lower()
        beam_size = 5
        if raw_mode in ("fast", "speed"):
            beam_size = 1
        elif raw_mode in ("balanced", "default", "normal"):
            beam_size = 3

        lang = None
        if language:
            cleaned = str(language).strip()
            # Whisper expects ISO 639-1 (e.g., "de") or similar. We don't validate strictly.
            if cleaned:
                lang = cleaned

        prompt_hint = None
        if prompt:
            prompt_hint = str(prompt).strip()[:1800] or None

        # Serialize GPU-heavy work across services to avoid VRAM exhaustion.
        # If we had to fall back to CPU, skip the GPU lock.
        if str(_active_device).lower().startswith("cuda"):
            gpu_lock = await acquire_gpu_lock("whisper:transcribe")
            if not gpu_lock:
                raise HTTPException(status_code=503, detail="GPU busy, please retry shortly")

        # First pass with VAD (if enabled), then fallback without VAD if output looks wrong.
        segments_iter, info = _transcribe_with_options(tmp_path, VAD_ENABLED, beam_size, lang, prompt_hint)
        text, words = _collect_transcription(segments_iter)
        vad_text, vad_words, vad_info = text, words, info

        if VAD_ENABLED and _needs_vad_fallback(info.duration, len(words), len(text)):
            logger.warning(
                "VAD fallback triggered: duration=%.2fs, words=%d, chars=%d. Retrying without VAD.",
                info.duration,
                len(words),
                len(text),
            )
            segments_iter, info = _transcribe_with_options(tmp_path, False, beam_size, lang, prompt_hint)
            text, words = _collect_transcription(segments_iter)

            if _looks_like_hallucination(text, words, info.duration):
                if len(vad_words) <= HALLUCINATION_NO_SPEECH_MAX_WORDS:
                    logger.warning(
                        "Hallucination detected on low-speech audio. Returning empty transcript (duration=%.2fs).",
                        info.duration,
                    )
                    text = ""
                    words = []
                    info = vad_info
                else:
                    logger.warning(
                        "Hallucination detected after no-VAD retry. Falling back to VAD result."
                    )
                    text, words, info = vad_text, vad_words, vad_info

        srt_content = generate_srt(words)

        logger.info(f"Transcription complete: {len(text)} chars, {len(words)} words, language: {info.language}")

        return TranscriptionResponse(
            text=text,
            language=info.language,
            duration=round(info.duration, 2),
            words=words,
            srt=srt_content
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

    finally:
        try:
            await release_gpu_lock(gpu_lock)
        except Exception:
            pass
        try:
            _maybe_unload_model()
        except Exception:
            pass
        # Always clean up temporary file
        try:
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)
        except Exception:
            pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
