"""
Configuration for the Podcast Service
"""
import os

# Ollama configuration
OLLAMA_CONFIG = {
    "host": os.getenv("OLLAMA_HOST", "http://ollama:11434"),
    "model": os.getenv("OLLAMA_MODEL", "qwen2.5:14b"),
}

# VLM (Vision-Language Model) for image descriptions
VLM_CONFIG = {
    # Use the shared vLLM vision server by default (better quality + no extra Ollama vision model needed).
    # Must be OpenAI-compatible (/v1) and support image_url inputs.
    "host": os.getenv("VLM_HOST", "http://vllm-vision:8000/v1"),
    "model": os.getenv("VLM_MODEL", "Qwen/Qwen3-VL-8B-Instruct-FP8"),
    "enabled": os.getenv("VLM_ENABLED", "true").lower() == "true",
    "timeout": int(os.getenv("VLM_TIMEOUT", "120")),  # 2 minutes per image
    "max_workers": int(os.getenv("VLM_MAX_WORKERS", "3")),  # Parallel image descriptions
    # Skip tiny images (icons/logos) to save time; ratio is relative to slide area.
    "min_area_ratio": float(os.getenv("VLM_MIN_AREA_RATIO", "0.02")),
}

# TTS Engine selection
TTS_ENGINE = os.getenv("TTS_ENGINE", "xtts")  # "xtts", "qwen3tts", or "piper"
QWEN_TTS_SERVICE_URL = os.getenv("QWEN_TTS_SERVICE_URL", "http://qwen-tts:8004")

# XTTS v2 configuration (primary TTS engine)
XTTS_CONFIG = {
    "model": "tts_models/multilingual/multi-dataset/xtts_v2",
    "samples_dir": os.getenv("XTTS_SAMPLES_DIR", "/app/voices/samples"),
    "male_sample": "male_sample.mp3",
    "female_sample": "female_sample.mp3",
    "language": "de",
    "device": "cuda",
}

# Piper TTS configuration (fallback)
PIPER_CONFIG = {
    "voices_dir": os.getenv("PIPER_VOICES_DIR", "/app/voices/piper"),
    # All voices use Thorsten high quality (best German voice available)
    "host_voice": os.getenv("PIPER_HOST_VOICE", "de_DE-thorsten-high"),
    "expert_voice": os.getenv("PIPER_EXPERT_VOICE", "de_DE-thorsten-high"),
    "narrator_voice": os.getenv("PIPER_NARRATOR_VOICE", "de_DE-thorsten-high"),
}

# Qwen3-TTS configuration (optional)
QWEN_TTS_CONFIG = {
    "model": os.getenv("QWEN_TTS_MODEL", "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"),
    "language": os.getenv("QWEN_TTS_LANGUAGE", "german"),
    "device": os.getenv("QWEN_TTS_DEVICE", "cuda:0"),
    "dtype": os.getenv("QWEN_TTS_DTYPE", "bfloat16"),
    "attn_implementation": os.getenv("QWEN_TTS_ATTN", ""),
    "speaker_male": os.getenv("QWEN_TTS_SPEAKER_MALE", "ryan"),
    "speaker_female": os.getenv("QWEN_TTS_SPEAKER_FEMALE", "serena"),
    "speaker_default": os.getenv("QWEN_TTS_SPEAKER_DEFAULT", ""),
    "instruct": os.getenv("QWEN_TTS_INSTRUCT", "Sprich in klarem Hochdeutsch."),
    "allow_cpu": os.getenv("QWEN_TTS_ALLOW_CPU", "false").lower() == "true",
}

# Output configuration
OUTPUT_CONFIG = {
    "sample_rate": 22050,
    "format": "mp3",
    "bitrate": "192k",
}

# Job storage
UPLOAD_DIR = "/app/uploads"
OUTPUT_DIR = "/app/outputs"
