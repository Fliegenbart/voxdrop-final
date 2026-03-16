"""
Qwen3-TTS Service - GPU microservice for text-to-speech generation.
"""
import gc
import io
import os
import threading
from typing import List, Optional, Tuple

from fastapi import FastAPI, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from pydantic import BaseModel

app = FastAPI(
    title="Qwen3-TTS Service",
    description="Generate speech audio using Qwen3-TTS",
    version="1.0.0",
)

# Primary profile: lively podcast output via CustomVoice.
MODEL_ID = os.getenv("QWEN_TTS_MODEL", "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice")
CLONE_ENABLED = os.getenv("QWEN_TTS_CLONE_ENABLED", "false").lower() == "true"

# Optional fallback profile: Base + voice clone material.
FALLBACK_MODEL_ID = os.getenv("QWEN_TTS_FALLBACK_MODEL", "Qwen/Qwen3-TTS-12Hz-1.7B-Base")
FALLBACK_CLONE_ENABLED = os.getenv("QWEN_TTS_FALLBACK_CLONE_ENABLED", "true").lower() == "true"
AUTO_FALLBACK = os.getenv("QWEN_TTS_AUTO_FALLBACK", "true").lower() == "true"
RESTORE_PRIMARY_AFTER_FALLBACK = os.getenv("QWEN_TTS_RESTORE_PRIMARY", "true").lower() == "true"

LANGUAGE = os.getenv("QWEN_TTS_LANGUAGE", "german")
DEVICE = os.getenv("QWEN_TTS_DEVICE", "cuda:0")
DTYPE = os.getenv("QWEN_TTS_DTYPE", "bfloat16").lower()
ATTN = os.getenv("QWEN_TTS_ATTN", "")
INSTRUCT = os.getenv("QWEN_TTS_INSTRUCT", "")
ALLOW_CPU = os.getenv("QWEN_TTS_ALLOW_CPU", "false").lower() == "true"

SPEAKER_MALE = os.getenv("QWEN_TTS_SPEAKER_MALE", "ryan")
SPEAKER_FEMALE = os.getenv("QWEN_TTS_SPEAKER_FEMALE", "serena")
SPEAKER_DEFAULT = os.getenv("QWEN_TTS_SPEAKER_DEFAULT", "")
FALLBACK_SPEAKER_MALE = os.getenv("QWEN_TTS_FALLBACK_SPEAKER_MALE", SPEAKER_MALE)
FALLBACK_SPEAKER_FEMALE = os.getenv("QWEN_TTS_FALLBACK_SPEAKER_FEMALE", SPEAKER_FEMALE)
FALLBACK_SPEAKER_DEFAULT = os.getenv("QWEN_TTS_FALLBACK_SPEAKER_DEFAULT", SPEAKER_DEFAULT)
FALLBACK_INSTRUCT = os.getenv("QWEN_TTS_FALLBACK_INSTRUCT", INSTRUCT)

REF_DIR = os.getenv("QWEN_TTS_REF_DIR", "/app/voices/samples")
REF_MALE = os.getenv("QWEN_TTS_MALE_SAMPLE", "male_sample.mp3")
REF_FEMALE = os.getenv("QWEN_TTS_FEMALE_SAMPLE", "female_sample.mp3")
REF_MALE_TEXT = os.getenv("QWEN_TTS_MALE_TEXT", "")
REF_FEMALE_TEXT = os.getenv("QWEN_TTS_FEMALE_TEXT", "")
FALLBACK_REF_DIR = os.getenv("QWEN_TTS_FALLBACK_REF_DIR", REF_DIR)
FALLBACK_REF_MALE = os.getenv("QWEN_TTS_FALLBACK_MALE_SAMPLE", REF_MALE)
FALLBACK_REF_FEMALE = os.getenv("QWEN_TTS_FALLBACK_FEMALE_SAMPLE", REF_FEMALE)
FALLBACK_REF_MALE_TEXT = os.getenv("QWEN_TTS_FALLBACK_MALE_TEXT", REF_MALE_TEXT)
FALLBACK_REF_FEMALE_TEXT = os.getenv("QWEN_TTS_FALLBACK_FEMALE_TEXT", REF_FEMALE_TEXT)

_active_model = None
_active_profile = ""
_active_speakers = None
_active_clone_prompts = {}
_model_lock = threading.Lock()
_generate_lock = threading.Lock()
_last_runtime_error = ""
_last_generation_path = "primary"


class GenerateRequest(BaseModel):
    text: str
    voice: str = "male"
    language: Optional[str] = None
    speaker: Optional[str] = None
    instruct: Optional[str] = None


class BatchGenerateRequest(BaseModel):
    items: List[GenerateRequest]


def _profile_config(profile: str) -> dict:
    if profile == "fallback":
        return {
            "model_id": FALLBACK_MODEL_ID,
            "clone_enabled": FALLBACK_CLONE_ENABLED,
            "speaker_male": FALLBACK_SPEAKER_MALE,
            "speaker_female": FALLBACK_SPEAKER_FEMALE,
            "speaker_default": FALLBACK_SPEAKER_DEFAULT,
            "instruct": FALLBACK_INSTRUCT,
            "ref_dir": FALLBACK_REF_DIR,
            "ref_male": FALLBACK_REF_MALE,
            "ref_female": FALLBACK_REF_FEMALE,
            "ref_male_text": FALLBACK_REF_MALE_TEXT,
            "ref_female_text": FALLBACK_REF_FEMALE_TEXT,
        }
    return {
        "model_id": MODEL_ID,
        "clone_enabled": CLONE_ENABLED,
        "speaker_male": SPEAKER_MALE,
        "speaker_female": SPEAKER_FEMALE,
        "speaker_default": SPEAKER_DEFAULT,
        "instruct": INSTRUCT,
        "ref_dir": REF_DIR,
        "ref_male": REF_MALE,
        "ref_female": REF_FEMALE,
        "ref_male_text": REF_MALE_TEXT,
        "ref_female_text": REF_FEMALE_TEXT,
    }


def _resolve_dtype(torch_module):
    if DTYPE in ("bfloat16", "bf16"):
        return torch_module.bfloat16
    if DTYPE in ("float16", "fp16", "half"):
        return torch_module.float16
    if DTYPE in ("float32", "fp32"):
        return torch_module.float32
    return torch_module.bfloat16


def _resolve_ref_path(sample: str, ref_dir: str) -> str:
    if not sample:
        return ""
    return sample if os.path.isabs(sample) else os.path.join(ref_dir, sample)


def _build_clone_prompt(model, sample_path: str, ref_text: str):
    if not sample_path or not os.path.exists(sample_path):
        print(f"[Qwen3-TTS] Voice clone sample missing: {sample_path}")
        return None
    try:
        use_ref_text = bool(ref_text and ref_text.strip())
        return model.create_voice_clone_prompt(
            ref_audio=sample_path,
            ref_text=ref_text.strip() if use_ref_text else None,
            x_vector_only_mode=not use_ref_text,
        )
    except Exception as e:
        print(f"[Qwen3-TTS] Failed to create voice clone prompt: {e}")
        return None


def _build_clone_prompts(model, cfg: dict) -> dict:
    prompts = {}
    male_path = _resolve_ref_path(cfg["ref_male"], cfg["ref_dir"])
    female_path = _resolve_ref_path(cfg["ref_female"], cfg["ref_dir"])

    male_prompt = _build_clone_prompt(model, male_path, cfg["ref_male_text"])
    if male_prompt:
        prompts["male"] = male_prompt
    female_prompt = _build_clone_prompt(model, female_path, cfg["ref_female_text"])
    if female_prompt:
        prompts["female"] = female_prompt

    return prompts


def _unload_active_model() -> None:
    global _active_model, _active_profile, _active_speakers, _active_clone_prompts
    if _active_model is None:
        return

    _active_model = None
    _active_profile = ""
    _active_speakers = None
    _active_clone_prompts = {}
    gc.collect()

    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass


def _get_model(profile: str):
    global _active_model, _active_profile, _active_speakers, _active_clone_prompts

    cfg = _profile_config(profile)
    model_id = cfg["model_id"]
    if not model_id:
        raise RuntimeError(f"Model for profile '{profile}' is not configured")

    if _active_model is not None and _active_profile == profile:
        return _active_model, _active_speakers, _active_clone_prompts

    with _model_lock:
        if _active_model is not None and _active_profile == profile:
            return _active_model, _active_speakers, _active_clone_prompts

        _unload_active_model()

        import torch
        from qwen_tts import Qwen3TTSModel

        device_map = DEVICE
        if not torch.cuda.is_available():
            if not ALLOW_CPU:
                raise RuntimeError("CUDA not available and CPU use is disabled")
            device_map = "cpu"

        kwargs = {}
        if ATTN:
            kwargs["attn_implementation"] = ATTN

        model = Qwen3TTSModel.from_pretrained(
            model_id,
            device_map=device_map,
            torch_dtype=_resolve_dtype(torch),
            **kwargs,
        )
        speakers = getattr(model, "speakers", None)
        clone_prompts = {}
        if cfg["clone_enabled"]:
            clone_prompts = _build_clone_prompts(model, cfg)
            if not clone_prompts:
                raise RuntimeError(
                    f"Voice clone prompts not available for profile '{profile}' "
                    f"(model={model_id})"
                )

        _active_model = model
        _active_profile = profile
        _active_speakers = speakers
        _active_clone_prompts = clone_prompts
        return _active_model, _active_speakers, _active_clone_prompts


def _resolve_speaker(
    voice: str,
    explicit: Optional[str],
    available_speakers,
    cfg: dict,
) -> str:
    speaker = explicit
    if not speaker:
        if voice == "female":
            speaker = cfg["speaker_female"]
        elif voice == "male":
            speaker = cfg["speaker_male"]
        else:
            speaker = voice

    if not speaker:
        speaker = cfg["speaker_default"] or cfg["speaker_male"]

    if available_speakers and speaker not in available_speakers:
        lowered = speaker.lower()
        match = next((s for s in available_speakers if s.lower() == lowered), None)
        speaker = match or available_speakers[0]

    return speaker


def _to_audio_bytes(result) -> Tuple[bytes, int]:
    if isinstance(result, tuple) and len(result) == 2:
        wavs, sample_rate = result
    else:
        wavs, sample_rate = result, None

    audio = wavs[0] if isinstance(wavs, list) else wavs
    if audio is None:
        raise RuntimeError("Keine Audiodaten erzeugt")
    if sample_rate is None:
        sample_rate = 22050

    import soundfile as sf

    buffer = io.BytesIO()
    sf.write(buffer, audio, sample_rate, format="WAV")
    return buffer.getvalue(), sample_rate


def _generate_with_profile(request: GenerateRequest, profile: str) -> Tuple[bytes, int]:
    cfg = _profile_config(profile)
    model, available_speakers, clone_prompts = _get_model(profile)
    language = request.language or LANGUAGE
    instruct = request.instruct or cfg["instruct"]

    if cfg["clone_enabled"]:
        clone_prompt = clone_prompts.get(request.voice) or clone_prompts.get("male")
        if not clone_prompt:
            raise RuntimeError(f"Voice clone prompt missing for profile '{profile}'")
        result = model.generate_voice_clone(
            request.text,
            language=language,
            voice_clone_prompt=clone_prompt,
        )
    else:
        speaker = _resolve_speaker(request.voice, request.speaker, available_speakers, cfg)
        result = model.generate_custom_voice(
            request.text,
            language=language,
            speaker=speaker,
            instruct=instruct or "",
        )

    return _to_audio_bytes(result)


def _has_fallback() -> bool:
    return bool(AUTO_FALLBACK and FALLBACK_MODEL_ID)


def _maybe_restore_primary() -> None:
    if not RESTORE_PRIMARY_AFTER_FALLBACK:
        return
    try:
        _get_model("primary")
    except Exception as e:
        print(f"[Qwen3-TTS] Failed to restore primary model after fallback: {e}")


@app.get("/health")
async def health_check():
    try:
        import torch

        cuda_available = torch.cuda.is_available()
    except Exception:
        cuda_available = False

    active_cfg = _profile_config(_active_profile) if _active_profile else None
    return {
        "available": cuda_available or ALLOW_CPU,
        "cuda": cuda_available,
        "profiles": {
            "primary": {
                "model": MODEL_ID,
                "clone_enabled": CLONE_ENABLED,
            },
            "fallback": {
                "enabled": _has_fallback(),
                "model": FALLBACK_MODEL_ID,
                "clone_enabled": FALLBACK_CLONE_ENABLED,
            },
        },
        "active": {
            "profile": _active_profile or "none",
            "model": active_cfg["model_id"] if active_cfg else "",
            "model_loaded": _active_model is not None,
            "clone_ready": bool(_active_clone_prompts) if active_cfg and active_cfg["clone_enabled"] else False,
        },
        "last_generation_path": _last_generation_path,
        "last_error": _last_runtime_error,
    }


def _generate_audio_bytes(request: GenerateRequest) -> Tuple[bytes, int]:
    global _last_runtime_error, _last_generation_path
    with _generate_lock:
        try:
            audio_bytes, sample_rate = _generate_with_profile(request, "primary")
            _last_generation_path = "primary"
            _last_runtime_error = ""
            return audio_bytes, sample_rate
        except Exception as primary_error:
            if not _has_fallback():
                _last_runtime_error = str(primary_error)
                raise RuntimeError(str(primary_error))

            print(f"[Qwen3-TTS] Primary generation failed, trying fallback: {primary_error}")
            try:
                audio_bytes, sample_rate = _generate_with_profile(request, "fallback")
                _last_generation_path = "fallback"
                _last_runtime_error = f"primary_failed:{primary_error}"
                _maybe_restore_primary()
                return audio_bytes, sample_rate
            except Exception as fallback_error:
                _last_runtime_error = (
                    f"primary_failed:{primary_error} | fallback_failed:{fallback_error}"
                )
                raise RuntimeError(_last_runtime_error)


def _generate_batch_zip(requests: List[GenerateRequest]) -> bytes:
    import json
    import zipfile

    if not requests:
        raise RuntimeError("Keine Items angegeben")

    out_files = {}
    manifest = []
    active_profile = "primary"
    fallback_used = False

    with _generate_lock:
        for idx, req in enumerate(requests):
            try:
                audio_bytes, sample_rate = _generate_with_profile(req, active_profile)
                out_files[f"{idx:04d}.wav"] = audio_bytes
                manifest.append(
                    {
                        "index": idx,
                        "success": True,
                        "sample_rate": sample_rate,
                        "profile": active_profile,
                    }
                )
                continue
            except Exception as primary_error:
                if active_profile != "primary" or not _has_fallback():
                    manifest.append({"index": idx, "success": False, "error": str(primary_error)})
                    continue

                try:
                    audio_bytes, sample_rate = _generate_with_profile(req, "fallback")
                    active_profile = "fallback"
                    fallback_used = True
                    out_files[f"{idx:04d}.wav"] = audio_bytes
                    manifest.append(
                        {
                            "index": idx,
                            "success": True,
                            "sample_rate": sample_rate,
                            "profile": "fallback",
                            "fallback_reason": str(primary_error),
                        }
                    )
                except Exception as fallback_error:
                    manifest.append(
                        {
                            "index": idx,
                            "success": False,
                            "error": f"primary:{primary_error} | fallback:{fallback_error}",
                        }
                    )

        if fallback_used:
            _maybe_restore_primary()

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", compression=zipfile.ZIP_STORED) as zf:
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False))
        for name, data in out_files.items():
            zf.writestr(name, data)
    return zip_buf.getvalue()


@app.post("/generate")
async def generate_audio(request: GenerateRequest):
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Kein Text angegeben")

    try:
        audio_bytes, sample_rate = await run_in_threadpool(_generate_audio_bytes, request)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

    return Response(
        content=audio_bytes,
        media_type="audio/wav",
        headers={"X-Sample-Rate": str(sample_rate)},
    )


@app.post("/generate-batch")
async def generate_audio_batch(request: BatchGenerateRequest):
    if not request.items:
        raise HTTPException(status_code=400, detail="Keine Items angegeben")
    for item in request.items:
        if not item.text or not item.text.strip():
            raise HTTPException(status_code=400, detail="Leerer Text in Batch-Request")

    try:
        zip_bytes = await run_in_threadpool(_generate_batch_zip, request.items)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

    return Response(
        content=zip_bytes,
        media_type="application/zip",
    )
