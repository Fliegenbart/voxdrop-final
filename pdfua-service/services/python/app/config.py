"""
Configuration for PDF/UA Service
"""
import os

# Debug & Logging
DEBUG = os.getenv("VD_DEBUG", "false").lower() == "true"
LOG_LEVEL = os.getenv("VD_LOG_LEVEL", "INFO")
SAFE_LOGGING = os.getenv("VD_SAFE_LOGGING", "true").lower() == "true"
PROCESS_VERSION = os.getenv("VD_PROCESS_VERSION", "1")

# Redis / shared coordination
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

# GPU Configuration
GPU_DEVICE = os.getenv("VD_GPU_DEVICE", "cuda:0")

# VLM Configuration (Qwen3-VL for alt-text generation)
VLM_CONFIG = {
    "model": os.getenv("VD_VLM_MODEL", "Qwen/Qwen3-VL-8B-Instruct-FP8"),
    "quantization": os.getenv("VD_QUANTIZATION", "nf4"),  # nf4 = 4-bit, saves VRAM
    "lang": os.getenv("VD_VLM_LANG", "de"),
    "max_new_tokens": 150,
    "temperature": 0.7,
}

# Alt-Text Configuration
ALT_TEXT_LANG = os.getenv("VD_ALT_TEXT_LANG", "de")
ALT_TEXT_FALLBACK = "Abbildung auf Folie {slide_num}"

# OCR Configuration
OCR_CONFIG = {
    "engine": os.getenv("VD_OCR_ENGINE", "paddleocr"),
    "workers": int(os.getenv("VD_OCR_WORKERS", "4")),
    "lang": "de",
}

# PDF/UA Java Service
PDFUA_JAVA_URL = os.getenv("VD_PDFUA_URL", "http://pdfua-java:8080")
PDFUA_LANG = os.getenv("VD_PDFUA_LANG", "de-DE")

# Global GPU lock (shared across services via Redis)
GPU_LOCK_KEY = os.getenv("GPU_LOCK_KEY", "voxdrop:gpu-lock")
GPU_LOCK_WAIT_MS = int(os.getenv("GPU_LOCK_WAIT_MS", "900000"))  # 15 minutes
GPU_LOCK_TTL_MS = int(os.getenv("GPU_LOCK_TTL_MS", "1800000"))  # 30 minutes
GPU_LOCK_RETRY_MS = int(os.getenv("GPU_LOCK_RETRY_MS", "1500"))
GPU_LOCK_RENEW_MS = int(os.getenv("GPU_LOCK_RENEW_MS", "60000"))
GPU_LOCK_QUEUE_UPDATE_MS = int(os.getenv("GPU_LOCK_QUEUE_UPDATE_MS", "10000"))
GPU_LOCK_WATCHDOG_INTERVAL = int(os.getenv("GPU_LOCK_WATCHDOG_INTERVAL", "60"))
GPU_QUEUE_KEY = os.getenv("GPU_QUEUE_KEY", "voxdrop:gpu-queue")
GPU_QUEUE_HEARTBEAT_PREFIX = os.getenv("GPU_QUEUE_HEARTBEAT_PREFIX", "voxdrop:gpu-queue:hb:")
GPU_QUEUE_STALE_SECONDS = int(os.getenv("GPU_QUEUE_STALE_SECONDS", "900"))  # 15 minutes
GPU_QUEUE_AVG_SECONDS_STANDARD = int(os.getenv("GPU_QUEUE_AVG_SECONDS_STANDARD", "180"))
GPU_QUEUE_AVG_SECONDS_HIGH = int(os.getenv("GPU_QUEUE_AVG_SECONDS_HIGH", "240"))

# Summary LLM (text-only; vLLM preferred, Ollama fallback)
SUMMARY_LLM_PROVIDER = os.getenv("VD_SUMMARY_LLM_PROVIDER", "vllm")  # vllm|ollama
SUMMARY_LLM_URL = os.getenv("VD_SUMMARY_LLM_URL", "http://ollama:11434")
SUMMARY_LLM_MODEL = os.getenv("VD_SUMMARY_LLM_MODEL", "qwen2.5:14b")
# Slide summaries are consumed both by PDF/UA output and the PPTX->Podcast pipeline.
# Defaults are tuned for accessibility (enough detail without becoming verbose).
SUMMARY_MAX_CHARS = int(os.getenv("VD_SUMMARY_MAX_CHARS", "650"))
SUMMARY_MAX_POINTS = int(os.getenv("VD_SUMMARY_MAX_POINTS", "7"))
SUMMARY_TIMEOUT_SECONDS = int(os.getenv("VD_SUMMARY_TIMEOUT_SECONDS", "120"))
SUMMARY_MAX_CONCURRENT = int(os.getenv("VD_SUMMARY_MAX_CONCURRENT", "1"))
PODCAST_PACK_MAX_LLM_SLIDES = int(os.getenv("VD_PODCAST_PACK_MAX_LLM_SLIDES", "6"))
PODCAST_PACK_SUMMARY_TIMEOUT_SECONDS = int(os.getenv("VD_PODCAST_PACK_SUMMARY_TIMEOUT_SECONDS", "300"))
PODCAST_PACK_OVERVIEW_TIMEOUT_SECONDS = int(os.getenv("VD_PODCAST_PACK_OVERVIEW_TIMEOUT_SECONDS", "90"))

# Speaker notes
INCLUDE_SPEAKER_NOTES = os.getenv("VD_INCLUDE_SPEAKER_NOTES", "true").lower() == "true"
INCLUDE_VISUAL_DESCRIPTIONS = os.getenv("VD_INCLUDE_VISUAL_DESCRIPTIONS", "true").lower() == "true"
GENERATE_TOC = os.getenv("VD_GENERATE_TOC", "true").lower() == "true"
BACKUP_SLIDES_AS_APPENDIX = os.getenv("VD_BACKUP_SLIDES_AS_APPENDIX", "true").lower() == "true"
MAX_SUMMARY_SENTENCES = int(os.getenv("VD_MAX_SUMMARY_SENTENCES", "5"))
ENABLE_LANGUAGE_TAGGING = os.getenv("VD_ENABLE_LANGUAGE_TAGGING", "true").lower() == "true"
DETECT_DECORATIVE_IMAGES = os.getenv("VD_DETECT_DECORATIVE_IMAGES", "true").lower() == "true"
ENABLE_KPI_DETECTION = os.getenv("VD_ENABLE_KPI_DETECTION", "true").lower() == "true"
INTERNAL_COMMENT_WHITELIST = [
    token.strip()
    for token in os.getenv("VD_INTERNAL_COMMENT_WHITELIST", "BMAS").split(",")
    if token.strip()
]

# Vision Analyzer (vLLM OpenAI-compatible)
VISION_ANALYZER_ENABLED = os.getenv("VD_VISION_ANALYZER_ENABLED", "false").lower() == "true"
VISION_VLLM_URL = os.getenv("VD_VISION_VLLM_URL", "http://vllm-vision:8000/v1")
VISION_MODEL = os.getenv("VD_VISION_MODEL", "Qwen/Qwen3-VL-8B-Instruct-FP8")
VISION_TIMEOUT_SECONDS = int(os.getenv("VD_VISION_TIMEOUT_SECONDS", "180"))
VISION_MAX_TOKENS = int(os.getenv("VD_VISION_MAX_TOKENS", "1024"))
VISION_OVERRIDE_READING_ORDER = os.getenv("VD_VISION_OVERRIDE_READING_ORDER", "true").lower() == "true"
VISION_MAX_CONCURRENCY = int(os.getenv("VD_VISION_MAX_CONCURRENCY", "2"))

# Model Cache Directories
TRANSFORMERS_CACHE = os.getenv("TRANSFORMERS_CACHE", "/models/transformers")
HF_HOME = os.getenv("HF_HOME", "/models/huggingface")

# File paths
UPLOAD_DIR = "/data/uploads"
JOBS_DIR = "/data/jobs"
OUTPUT_DIR = "/data/outputs"

# Processing settings
MAX_SLIDES = 200  # Maximum slides per presentation
MAX_FILE_SIZE_MB = 150  # Maximum file size in MB
JOB_TIMEOUT_SECONDS = 1200  # 20 minutes timeout
MAX_PDF_PAGES = int(os.getenv("VD_MAX_PDF_PAGES", "120"))
PDF_RENDER_DPI = int(os.getenv("VD_PDF_RENDER_DPI", "144"))
PDF_VLM_MAX_PAGES = int(os.getenv("VD_PDF_VLM_MAX_PAGES", "40"))
PDF_VLM_MAX_TARGETS = int(os.getenv("VD_PDF_VLM_MAX_TARGETS", "6"))
PDF_VLM_TEXT_THRESHOLD = int(os.getenv("VD_PDF_VLM_TEXT_THRESHOLD", "750"))
VISION_MAX_SLIDES = int(os.getenv("VD_VISION_MAX_SLIDES", str(MAX_SLIDES)))

# PPTX VLM throttling to protect GPU VRAM
VLM_MAX_SLIDES = int(os.getenv("VD_VLM_MAX_SLIDES", "10"))
VLM_MAX_RENDER_SLIDES = int(os.getenv("VD_VLM_MAX_RENDER_SLIDES", "8"))
VLM_MAX_IMAGES_PER_SLIDE = int(os.getenv("VD_VLM_MAX_IMAGES_PER_SLIDE", "2"))
VLM_MIN_IMAGE_AREA_RATIO = float(os.getenv("VD_VLM_MIN_IMAGE_AREA_RATIO", "0.015"))
VLM_SKIP_TEXT_THRESHOLD = int(os.getenv("VD_VLM_SKIP_TEXT_THRESHOLD", "1600"))

# Deduplication
DEDUPLICATION_THRESHOLD = float(os.getenv("VD_DEDUP_THRESHOLD", "0.8"))
