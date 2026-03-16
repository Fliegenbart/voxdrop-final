"""
VoxDrop Avatar API
Barrierefreier Sprachassistent mit animiertem Avatar
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import uuid
import os
import asyncio
from pathlib import Path
from datetime import datetime
import shutil
import logging
import io
import re
import httpx
from contextlib import asynccontextmanager
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, UnidentifiedImageError

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Thread Pool for synchronous TTS calls
_tts_executor = ThreadPoolExecutor(max_workers=2)

# ============================================================
# Qwen TTS Setup - Lazy Loading
# ============================================================
_qwen_tts_model = None

QWEN_TTS_DEVICE = os.getenv("QWEN_TTS_DEVICE", "cuda")
QWEN_TTS_MODEL_NAME = os.getenv("QWEN_TTS_MODEL_NAME")
QWEN_TTS_SERVICE_URL = os.getenv("QWEN_TTS_SERVICE_URL", "").rstrip("/")
QWEN_TTS_LANGUAGE = os.getenv("QWEN_TTS_LANGUAGE", "german")
QWEN_TTS_INSTRUCT = os.getenv("QWEN_TTS_INSTRUCT", "")
QWEN_TTS_TIMEOUT = float(os.getenv("QWEN_TTS_TIMEOUT", "120"))


def get_qwen_tts():
    """
    Lazy loading of the Qwen TTS model.
    Loaded on first request and kept in GPU memory.
    """
    global _qwen_tts_model

    if _qwen_tts_model is None:
        logger.info("Loading Qwen TTS model (first request)...")
        try:
            from qwen_tts import QwenTTS

            kwargs = {
                "device": QWEN_TTS_DEVICE,
            }
            if QWEN_TTS_MODEL_NAME:
                kwargs["model_name"] = QWEN_TTS_MODEL_NAME

            _qwen_tts_model = QwenTTS(**kwargs)
            logger.info("Qwen TTS model loaded.")

        except ImportError:
            logger.error("qwen-tts package not installed. pip install qwen-tts")
            raise
        except Exception as exc:
            logger.error(f"Error loading Qwen TTS: {exc}")
            raise

    return _qwen_tts_model


# ============================================================
# Paths and configuration
# ============================================================
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.getenv("AVATAR_DATA_DIR", BASE_DIR / "data"))
OUTPUT_DIR = Path(os.getenv("AVATAR_OUTPUT_DIR", DATA_DIR / "outputs"))
AVATAR_DIR = Path(os.getenv("AVATAR_DIR", BASE_DIR / "avatars"))
VOICES_DIR = Path(os.getenv("AVATAR_VOICES_DIR", "/app/voices/samples"))
SADTALKER_DIR = Path(os.getenv("SADTALKER_DIR", "/opt/SadTalker"))
SADTALKER_ENHANCER = os.getenv("SADTALKER_ENHANCER", "gfpgan")
MAX_TEXT_LENGTH = int(os.getenv("AVATAR_MAX_TEXT_LENGTH", "2000"))
MAX_IMAGE_MB = int(os.getenv("AVATAR_MAX_IMAGE_MB", "10"))
MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024

ALLOWED_IMAGE_TYPES = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
}

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
AVATAR_DIR.mkdir(parents=True, exist_ok=True)

# Status tracking
jobs: dict[str, dict] = {}

# Available voices
VOICE_SAMPLES = {
    "default": None,
    "male": VOICES_DIR / "male_sample.mp3",
    "female": VOICES_DIR / "female_sample.mp3",
}


class TextInput(BaseModel):
    text: str
    avatar: str = "default"
    voice: str = "default"
    speed: float = 1.0


class JobStatus(BaseModel):
    job_id: str
    status: str
    progress: int
    video_url: str | None = None
    error: str | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("VoxDrop Avatar API starting...")
    yield
    logger.info("VoxDrop Avatar API shutting down.")
    _tts_executor.shutdown(wait=False)


app = FastAPI(
    title="VoxDrop Avatar API",
    description="Barrierefreier Sprachassistent mit animiertem Avatar",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # restrict to voxdrop.live in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _run_tts_sync(text: str, output_path: Path, voice: str = "default", speed: float = 1.0) -> bool:
    """
    Synchronous TTS for ThreadPool.
    Qwen TTS with optional voice cloning.
    """
    try:
        if QWEN_TTS_SERVICE_URL:
            service_voice = "male" if voice == "default" else voice
            payload = {
                "text": text,
                "voice": service_voice,
                "language": QWEN_TTS_LANGUAGE,
                "instruct": QWEN_TTS_INSTRUCT or None,
            }
            try:
                response = httpx.post(
                    f"{QWEN_TTS_SERVICE_URL}/generate",
                    json=payload,
                    timeout=QWEN_TTS_TIMEOUT,
                )
                if response.status_code == 200 and response.content:
                    output_path.write_bytes(response.content)
                    logger.info("TTS generated via Qwen-TTS service: %s", output_path)
                    return output_path.exists()
                logger.error("Qwen-TTS service error (%s): %s", response.status_code, response.text)
                return False
            except Exception as exc:
                logger.error("Qwen-TTS service request failed: %s", exc)
                return False

        tts = get_qwen_tts()

        voice_sample = None
        if voice in VOICE_SAMPLES and VOICE_SAMPLES[voice] is not None:
            sample_path = VOICE_SAMPLES[voice]
            if sample_path.exists():
                voice_sample = str(sample_path)
                logger.info("Voice cloning with sample: %s", voice_sample)

        if voice_sample:
            audio = tts.generate(
                text=text,
                speaker_audio=voice_sample,
                speed=speed,
            )
        else:
            audio = tts.generate(
                text=text,
                speed=speed,
            )

        tts.save(audio, str(output_path))

        logger.info("TTS generated: %s", output_path)
        return output_path.exists()

    except Exception as exc:
        logger.error("TTS error: %s", exc)
        return False


async def run_tts(text: str, output_path: Path, voice: str = "default", speed: float = 1.0) -> bool:
    """
    Async wrapper for TTS.
    Runs sync TTS in ThreadPool to avoid blocking event loop.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        _tts_executor,
        _run_tts_sync,
        text,
        output_path,
        voice,
        speed,
    )


async def run_sadtalker(audio_path: Path, avatar_path: Path, output_path: Path) -> bool:
    """
    SadTalker: audio + image -> video
    """
    try:
        result_dir = output_path.parent / f"sadtalker_{uuid.uuid4().hex[:8]}"

        process = await asyncio.create_subprocess_exec(
            "python",
            str(SADTALKER_DIR / "inference.py"),
            "--driven_audio",
            str(audio_path),
            "--source_image",
            str(avatar_path),
            "--result_dir",
            str(result_dir),
            "--still",
            "--preprocess",
            "crop",
            "--enhancer",
            SADTALKER_ENHANCER,
            cwd=str(SADTALKER_DIR),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        _stdout, stderr = await process.communicate()

        if process.returncode != 0:
            logger.error("SadTalker error: %s", stderr.decode())
            return False

        result_files = list(result_dir.glob("**/*.mp4"))
        if result_files:
            shutil.move(str(result_files[0]), str(output_path))
            shutil.rmtree(result_dir, ignore_errors=True)
            return True

        return False

    except Exception as exc:
        logger.error("SadTalker error: %s", exc)
        return False


async def process_avatar_job(job_id: str, text: str, avatar: str, voice: str, speed: float):
    """
    Execute the full pipeline.
    """
    try:
        job_dir = OUTPUT_DIR / job_id
        job_dir.mkdir(exist_ok=True)

        audio_path = job_dir / "speech.wav"
        video_path = job_dir / "avatar.mp4"
        avatar_path = AVATAR_DIR / f"{avatar}.png"

        if not avatar_path.exists():
            avatar_path = AVATAR_DIR / "default.png"

        if not avatar_path.exists():
            jobs[job_id]["status"] = "error"
            jobs[job_id]["error"] = "Avatar image not found"
            return

        jobs[job_id]["status"] = "processing_tts"
        jobs[job_id]["progress"] = 20

        tts_success = await run_tts(text, audio_path, voice, speed)
        if not tts_success:
            jobs[job_id]["status"] = "error"
            jobs[job_id]["error"] = "Text-to-Speech failed"
            return

        jobs[job_id]["status"] = "processing_avatar"
        jobs[job_id]["progress"] = 50

        avatar_success = await run_sadtalker(audio_path, avatar_path, video_path)
        if not avatar_success:
            jobs[job_id]["status"] = "error"
            jobs[job_id]["error"] = "Avatar animation failed"
            return

        jobs[job_id]["status"] = "completed"
        jobs[job_id]["progress"] = 100
        jobs[job_id]["video_url"] = f"/api/video/{job_id}"

    except Exception as exc:
        jobs[job_id]["status"] = "error"
        jobs[job_id]["error"] = str(exc)


@app.post("/api/generate", response_model=JobStatus)
async def generate_avatar(input_data: TextInput, background_tasks: BackgroundTasks):
    if not input_data.text.strip():
        raise HTTPException(status_code=400, detail="Text must not be empty")

    if len(input_data.text) > MAX_TEXT_LENGTH:
        raise HTTPException(status_code=400, detail=f"Text too long (max {MAX_TEXT_LENGTH} characters)")

    speed = max(0.5, min(2.0, input_data.speed))

    job_id = uuid.uuid4().hex
    jobs[job_id] = {
        "job_id": job_id,
        "status": "pending",
        "progress": 0,
        "video_url": None,
        "error": None,
        "created_at": datetime.now().isoformat(),
    }

    background_tasks.add_task(
        process_avatar_job,
        job_id,
        input_data.text,
        input_data.avatar,
        input_data.voice,
        speed,
    )

    return JobStatus(**jobs[job_id])


@app.get("/api/status/{job_id}", response_model=JobStatus)
async def get_job_status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    return JobStatus(**jobs[job_id])


@app.get("/api/video/{job_id}")
async def get_video(job_id: str):
    video_path = OUTPUT_DIR / job_id / "avatar.mp4"

    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Video not found")

    return FileResponse(
        video_path,
        media_type="video/mp4",
        filename=f"voxdrop_avatar_{job_id}.mp4",
    )


@app.get("/api/avatars")
async def list_avatars():
    avatars = []
    for file in AVATAR_DIR.glob("*.png"):
        avatars.append(
            {
                "id": file.stem,
                "name": file.stem.replace("_", " ").title(),
                "preview_url": f"/api/avatar-preview/{file.stem}",
            }
        )

    return {"avatars": avatars}


@app.get("/api/voices")
async def list_voices():
    voices = []

    for voice_id, sample_path in VOICE_SAMPLES.items():
        voice_info = {
            "id": voice_id,
            "name": voice_id.replace("_", " ").title(),
            "has_sample": sample_path is not None and sample_path.exists() if sample_path else False,
        }
        voices.append(voice_info)

    if VOICES_DIR.exists():
        for file in VOICES_DIR.glob("*.mp3"):
            voice_id = file.stem.replace("_sample", "")
            if voice_id not in VOICE_SAMPLES:
                voices.append(
                    {
                        "id": voice_id,
                        "name": voice_id.replace("_", " ").title(),
                        "has_sample": True,
                    }
                )

    return {"voices": voices}


def _slugify_filename(name: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9_-]+", "-", name).strip("-_").lower()
    return base or "avatar"


@app.post("/api/avatar-upload")
async def upload_avatar(file: UploadFile = File(...)):
    if not file:
        raise HTTPException(status_code=400, detail="No file uploaded")

    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported image type")

    data = bytearray()
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        data.extend(chunk)
        if len(data) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail=f"Image too large (max {MAX_IMAGE_MB} MB)")

    if not data:
        raise HTTPException(status_code=400, detail="Empty upload")

    try:
        image = Image.open(io.BytesIO(data))
        image = image.convert("RGB")
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail="Invalid image file")

    original_name = Path(file.filename or "avatar").stem
    safe_name = _slugify_filename(original_name)
    avatar_id = f"{safe_name}-{uuid.uuid4().hex[:6]}"
    avatar_path = AVATAR_DIR / f"{avatar_id}.png"

    image.save(avatar_path, format="PNG")

    return {
        "id": avatar_id,
        "name": avatar_id.replace("-", " ").title(),
        "preview_url": f"/api/avatar-preview/{avatar_id}",
    }


@app.get("/api/avatar-preview/{avatar_id}")
async def get_avatar_preview(avatar_id: str):
    avatar_path = AVATAR_DIR / f"{avatar_id}.png"

    if not avatar_path.exists():
        raise HTTPException(status_code=404, detail="Avatar not found")

    return FileResponse(avatar_path, media_type="image/png")


@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "sadtalker_available": SADTALKER_DIR.exists(),
        "avatars_count": len(list(AVATAR_DIR.glob("*.png"))),
    }
