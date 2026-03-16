"""
TTS Generator - Unified interface for text-to-speech generation.

Supports XTTS v2 (primary, GPU), Qwen3-TTS (optional), and Piper TTS (fallback, CPU).

Enhanced with parallel segment generation for better performance.
"""
import os
import re
import subprocess
import tempfile
import time
from typing import List, Dict, Any, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

from app.config import PIPER_CONFIG, OUTPUT_CONFIG, TTS_ENGINE

# Configuration for parallel TTS
TTS_MAX_WORKERS = int(os.getenv("TTS_MAX_WORKERS", "3"))  # Parallel TTS threads
TTS_PARALLEL_ENABLED = os.getenv("TTS_PARALLEL", "true").lower() == "true"
QWEN_BATCH_MAX_SEGMENTS = max(1, int(os.getenv("QWEN_BATCH_MAX_SEGMENTS", "60")))


# Lazy import XTTS to avoid loading if not used
_xtts_generator = None
_qwen_generator = None


# Default pronunciation rules - empty, users provide their own via UI
DEFAULT_PRONUNCIATION_RULES = []


def apply_pronunciation_rules(
    text: str,
    custom_rules: Optional[List[Dict[str, str]]] = None
) -> str:
    """
    Apply pronunciation rules to text before TTS synthesis.

    Custom rules take precedence over default rules.
    Rules are applied in order, so more specific rules should come first.

    Args:
        text: Original text
        custom_rules: List of {"original": "...", "spoken": "..."} dicts

    Returns:
        Text with pronunciation substitutions applied
    """
    # Combine custom rules (priority) with default rules
    rules = []
    if custom_rules:
        rules.extend(custom_rules)
    rules.extend(DEFAULT_PRONUNCIATION_RULES)

    # Apply each rule (case-insensitive matching, but preserve case in output)
    for rule in rules:
        original = rule.get("original", "")
        spoken = rule.get("spoken", "")
        if original and spoken:
            # Use word boundary matching to avoid partial replacements
            pattern = re.compile(re.escape(original), re.IGNORECASE)
            text = pattern.sub(spoken, text)

    return text


def _get_xtts_generator():
    """Get XTTS generator with lazy loading."""
    global _xtts_generator
    if _xtts_generator is None:
        from app.generators.xtts_generator import get_xtts_generator
        _xtts_generator = get_xtts_generator()
    return _xtts_generator


def _get_qwen_generator():
    """Get Qwen3-TTS generator with lazy loading."""
    global _qwen_generator
    if _qwen_generator is None:
        from app.generators.qwen_tts_generator import get_qwen_tts_generator
        _qwen_generator = get_qwen_tts_generator()
    return _qwen_generator


def _normalize_engine(tts_engine: Optional[str]) -> str:
    """Normalize engine names to a supported value."""
    engine = (tts_engine or TTS_ENGINE or "piper").lower()
    if engine in ("qwen3tts", "qwen-tts", "qwen"):
        return "qwen3tts"
    if engine in ("xtts",):
        return "xtts"
    if engine in ("piper",):
        return "piper"
    return "piper"


def generate_audio_segment(
    text: str,
    voice: str,
    output_path: str,
    tts_engine: Optional[str] = None,
    qwen_instruct: Optional[str] = None,
    *,
    strict_engine: bool = False,
) -> bool:
    """
    Generate audio for a text segment using the configured TTS engine.

    Args:
        text: Text to synthesize
        voice: Voice identifier ("male", "female", or Piper voice name)
        output_path: Path to save the audio file

    Returns:
        True if successful, False otherwise
    """
    engine = _normalize_engine(tts_engine)
    allow_fallback = not strict_engine

    # XTTS
    if engine == "xtts":
        xtts = _get_xtts_generator()
        if xtts.is_available():
            return xtts.generate(text, voice, output_path)
        if allow_fallback:
            print("[TTS] XTTS not available, falling back to Piper")
            return _generate_with_piper(text, voice, output_path)
        return False

    # Qwen3-TTS
    if engine == "qwen3tts":
        qwen = _get_qwen_generator()
        # Qwen3-TTS can intermittently OOM on shared GPUs. Retry a few times before failing.
        for attempt in range(4):
            success = qwen.generate(text, voice, output_path, instruct=qwen_instruct)
            if success:
                return True

            err = getattr(qwen, "last_error", "") or ""
            oom_like = ("out of memory" in err.lower()) or ("cuda" in err.lower() and "memory" in err.lower())
            if not oom_like:
                break

            sleep_s = 6 * (attempt + 1)
            print(f"[TTS] Qwen3-TTS OOM-like failure, retrying in {sleep_s}s (attempt {attempt+1}/4)")
            time.sleep(sleep_s)

        if allow_fallback:
            print("[TTS] Qwen3-TTS failed, falling back to Piper")
            return _generate_with_piper(text, voice, output_path)
        return False

    # Piper
    return _generate_with_piper(text, voice, output_path)


def _generate_with_piper(text: str, voice: str, output_path: str) -> bool:
    """
    Generate audio using Piper TTS (fallback).

    Args:
        text: Text to synthesize
        voice: Voice type or Piper voice name
        output_path: Path to save the audio file

    Returns:
        True if successful, False otherwise
    """
    voices_dir = PIPER_CONFIG["voices_dir"]

    # Map generic voice names to Piper voices
    if voice in ("male", "female"):
        # Piper doesn't have good female German voices, use Thorsten for both
        piper_voice = "de_DE-thorsten-high"
    else:
        piper_voice = voice

    voice_model = os.path.join(voices_dir, f"{piper_voice}.onnx")
    voice_config = os.path.join(voices_dir, f"{piper_voice}.onnx.json")

    # Check if voice exists
    if not os.path.exists(voice_model):
        print(f"[Piper] Voice model not found: {voice_model}")
        if not _download_piper_voice(piper_voice, voices_dir):
            return False

    try:
        cmd = [
            "piper",
            "--model", voice_model,
            "--output_file", output_path,
        ]

        process = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        stdout, stderr = process.communicate(input=text.encode('utf-8'))

        if process.returncode != 0:
            print(f"[Piper] Error: {stderr.decode('utf-8')}")
            return False

        return os.path.exists(output_path) and os.path.getsize(output_path) > 0

    except Exception as e:
        print(f"[Piper] Error generating audio: {e}")
        return False


def generate_podcast_audio(
    segments: List[Dict[str, Any]],
    style: str,  # 'dialog' or 'monolog'
    output_path: str,
    progress_callback: Optional[callable] = None,
    pronunciation_rules: Optional[List[Dict[str, str]]] = None,
    tts_engine: Optional[str] = None,
    qwen_instruct: Optional[str] = None,
    strict_engine: bool = False,
) -> Dict[str, Any]:
    """
    Generate complete podcast audio from script segments.

    Uses parallel generation when TTS_PARALLEL_ENABLED=true (default).

    For dialog style:
    - host -> male voice
    - expert -> female voice

    For monolog style:
    - narrator -> male voice (single speaker)

    Args:
        segments: List of script segments with speaker and text
        style: 'dialog' or 'monolog'
        output_path: Path for final output file
        progress_callback: Optional callback for progress updates
        pronunciation_rules: Custom pronunciation rules [{"original": "...", "spoken": "..."}]

    Returns:
        Dict with success status and metadata
    """
    # Use parallel generation if enabled and we have multiple segments
    require_complete = tts_engine is not None
    engine = _normalize_engine(tts_engine)

    # Qwen3-TTS: use the batch endpoint to reduce HTTP overhead and improve stability.
    if engine == "qwen3tts" and len(segments) > 0:
        return _generate_podcast_audio_qwen_batch(
            segments,
            style,
            output_path,
            progress_callback,
            pronunciation_rules,
            tts_engine,
            qwen_instruct,
            require_complete,
            strict_engine,
        )

    # Qwen3-TTS is served via a single-worker microservice; keep it sequential to avoid timeouts.
    parallel_allowed = TTS_PARALLEL_ENABLED and len(segments) > 1 and engine != "qwen3tts"

    if parallel_allowed:
        return _generate_podcast_audio_parallel(
            segments,
            style,
            output_path,
            progress_callback,
            pronunciation_rules,
            tts_engine,
            qwen_instruct,
            require_complete,
            strict_engine,
        )

    # Sequential fallback
    return _generate_podcast_audio_sequential(
        segments,
        style,
        output_path,
        progress_callback,
        pronunciation_rules,
        tts_engine,
        qwen_instruct,
        require_complete,
        strict_engine,
    )


def _generate_podcast_audio_qwen_batch(
    segments: List[Dict[str, Any]],
    style: str,
    output_path: str,
    progress_callback: Optional[callable] = None,
    pronunciation_rules: Optional[List[Dict[str, str]]] = None,
    tts_engine: Optional[str] = None,
    qwen_instruct: Optional[str] = None,
    require_complete: bool = False,
    strict_engine: bool = False,
) -> Dict[str, Any]:
    """
    Generate podcast audio via Qwen3-TTS batch endpoint (single HTTP request).
    """
    temp_dir = tempfile.mkdtemp(prefix="podcast_qwen_batch_")
    audio_files: List[str] = []

    try:
        items = []
        out_paths = []
        for idx, segment in enumerate(segments):
            speaker = segment["speaker"]
            text = apply_pronunciation_rules(segment["text"], pronunciation_rules)
            if style == "dialog":
                voice = "male" if speaker == "host" else "female"
            else:
                voice = "male"

            segment_path = os.path.join(temp_dir, f"segment_{idx:04d}.wav")
            item = {"text": text, "voice": voice}
            if qwen_instruct:
                item["instruct"] = qwen_instruct
            items.append(item)
            out_paths.append(segment_path)

        qwen = _get_qwen_generator()
        if not qwen.is_available():
            if strict_engine:
                return {"success": False, "error": "Qwen3-TTS not available"}
            print("[TTS] Qwen3-TTS not available, falling back to Piper")
            return _generate_podcast_audio_sequential(
                segments,
                style,
                output_path,
                progress_callback,
                pronunciation_rules,
                "piper",
                qwen_instruct,
                require_complete,
                strict_engine,
            )

        if progress_callback:
            progress_callback(5, f"Qwen3-TTS Batch: {len(items)} Segmente")

        ok = [False] * len(items)
        for chunk_start in range(0, len(items), QWEN_BATCH_MAX_SEGMENTS):
            chunk_end = min(chunk_start + QWEN_BATCH_MAX_SEGMENTS, len(items))
            chunk_items = items[chunk_start:chunk_end]
            chunk_paths = out_paths[chunk_start:chunk_end]
            chunk_ok = qwen.generate_batch(chunk_items, chunk_paths)
            for offset, success in enumerate(chunk_ok):
                ok[chunk_start + offset] = bool(success)
            if progress_callback:
                chunk_progress = 5 + int((chunk_end / max(1, len(items))) * 70)
                progress_callback(min(chunk_progress, 75), f"Qwen3-TTS Batch: {chunk_end}/{len(items)} Segmente")

        failed_idx: List[int] = []
        succeeded: set[str] = set()
        for idx, success in enumerate(ok):
            if success:
                succeeded.add(out_paths[idx])
            else:
                failed_idx.append(idx)

        # If batch fails for some segments, try Piper fallback unless strict.
        if failed_idx and not strict_engine:
            for idx in failed_idx:
                try:
                    text = items[idx].get("text") or ""
                    voice = items[idx].get("voice") or "male"
                    segment_path = out_paths[idx]
                    if _generate_with_piper(text, voice, segment_path):
                        succeeded.add(segment_path)
                except Exception:
                    pass

        # Build ordered list of audio files to concatenate (always preserve segment order).
        audio_files = []
        for p in out_paths:
            try:
                if p in succeeded and os.path.exists(p) and os.path.getsize(p) > 0:
                    audio_files.append(p)
            except Exception:
                continue

        if require_complete:
            for idx in range(len(items)):
                if out_paths[idx] not in audio_files:
                    return {"success": False, "error": f"TTS failed for segment {idx}"}

        if not audio_files:
            if strict_engine:
                return {"success": False, "error": "Qwen3-TTS batch produced no audio"}
            print("[TTS] Qwen3-TTS batch produced no audio, falling back to Piper")
            return _generate_podcast_audio_sequential(
                segments,
                style,
                output_path,
                progress_callback,
                pronunciation_rules,
                "piper",
                qwen_instruct,
                require_complete,
                strict_engine,
            )

        if progress_callback:
            progress_callback(90, "Audio wird zusammengefuegt")

        success = _concatenate_audio(audio_files, output_path)
        if not success:
            return {"success": False, "error": "Failed to concatenate audio"}

        duration = _get_audio_duration(output_path)
        return {
            "success": True,
            "output_path": output_path,
            "segment_count": len(audio_files),
            "duration_seconds": duration,
            "parallel": False,
            "engine": "qwen3tts",
            "batch": True,
        }
    finally:
        try:
            import shutil
            shutil.rmtree(temp_dir)
        except Exception:
            pass

def _generate_podcast_audio_parallel(
    segments: List[Dict[str, Any]],
    style: str,
    output_path: str,
    progress_callback: Optional[callable] = None,
    pronunciation_rules: Optional[List[Dict[str, str]]] = None,
    tts_engine: Optional[str] = None,
    qwen_instruct: Optional[str] = None,
    require_complete: bool = False,
    strict_engine: bool = False,
) -> Dict[str, Any]:
    """
    Generate podcast audio using parallel thread pool for TTS segments.

    This significantly speeds up generation for long presentations.
    """
    temp_dir = tempfile.mkdtemp(prefix="podcast_parallel_")
    total_segments = len(segments)
    completed_count = 0
    completed_lock = threading.Lock()

    # Prepare all segment data upfront
    segment_tasks = []
    for idx, segment in enumerate(segments):
        speaker = segment["speaker"]
        text = segment["text"]

        # Apply pronunciation rules
        text = apply_pronunciation_rules(text, pronunciation_rules)

        # Determine voice
        if style == "dialog":
            voice = "male" if speaker == "host" else "female"
        else:
            voice = "male"

        segment_path = os.path.join(temp_dir, f"segment_{idx:04d}.wav")
        segment_tasks.append((idx, text, voice, segment_path))

    # Generate segments in parallel
    results = {}  # idx -> path
    failed = []

    def generate_segment_task(task):
        nonlocal completed_count
        idx, text, voice, segment_path = task
        try:
            success = generate_audio_segment(
                text,
                voice,
                segment_path,
                tts_engine,
                qwen_instruct=qwen_instruct,
                strict_engine=strict_engine,
            )
            if success and os.path.exists(segment_path):
                return (idx, segment_path, None)
            if not strict_engine and _normalize_engine(tts_engine) == "xtts":
                # XTTS can crash the CUDA context; finish the job by falling back to Piper.
                if _generate_with_piper(text, voice, segment_path):
                    return (idx, segment_path, "xtts_failed_fallback_piper")
            return (idx, None, "Generation failed")
        except Exception as e:
            return (idx, None, str(e))

    print(f"[TTS] Starting parallel generation with {TTS_MAX_WORKERS} workers for {total_segments} segments")

    with ThreadPoolExecutor(max_workers=TTS_MAX_WORKERS) as executor:
        futures = {executor.submit(generate_segment_task, task): task[0] for task in segment_tasks}

        for future in as_completed(futures):
            idx, path, error = future.result()

            with completed_lock:
                completed_count += 1
                if path:
                    results[idx] = path
                else:
                    failed.append((idx, error))
                    print(f"[TTS] Segment {idx} failed: {error}")

                # Progress callback
                if progress_callback:
                    progress = int(completed_count / total_segments * 100)
                    progress_callback(progress, f"Audio {completed_count}/{total_segments}")

    # Build ordered list of audio files
    audio_files = []
    for idx in range(total_segments):
        if idx in results:
            audio_files.append(results[idx])

    if require_complete and failed:
        try:
            import shutil
            shutil.rmtree(temp_dir)
        except:
            pass
        return {"success": False, "error": f"TTS failed for {len(failed)} segments"}

    if not audio_files:
        # Cleanup
        try:
            import shutil
            shutil.rmtree(temp_dir)
        except:
            pass
        return {"success": False, "error": "No audio segments generated"}

    print(f"[TTS] Generated {len(audio_files)}/{total_segments} segments successfully")

    # Concatenate audio files
    try:
        success = _concatenate_audio(audio_files, output_path)

        if not success:
            return {"success": False, "error": "Failed to concatenate audio"}

        # Get duration
        duration = _get_audio_duration(output_path)

        return {
            "success": True,
            "output_path": output_path,
            "segment_count": len(audio_files),
            "duration_seconds": duration,
            "parallel": True,
            "workers": TTS_MAX_WORKERS,
        }

    finally:
        # Cleanup temp files
        try:
            import shutil
            shutil.rmtree(temp_dir)
        except:
            pass


def _generate_podcast_audio_sequential(
    segments: List[Dict[str, Any]],
    style: str,
    output_path: str,
    progress_callback: Optional[callable] = None,
    pronunciation_rules: Optional[List[Dict[str, str]]] = None,
    tts_engine: Optional[str] = None,
    qwen_instruct: Optional[str] = None,
    require_complete: bool = False,
    strict_engine: bool = False,
) -> Dict[str, Any]:
    """
    Generate podcast audio sequentially (original implementation).

    Used as fallback when parallel is disabled or for single segments.
    """
    temp_dir = tempfile.mkdtemp(prefix="podcast_")
    audio_files = []
    active_tts_engine = tts_engine
    switched_to_piper = False

    try:
        total_segments = len(segments)

        for idx, segment in enumerate(segments):
            speaker = segment["speaker"]
            text = segment["text"]

            # Apply pronunciation rules to text before TTS
            text = apply_pronunciation_rules(text, pronunciation_rules)

            # Determine voice based on speaker and style
            if style == "dialog":
                if speaker == "host":
                    voice = "male"
                else:  # expert
                    voice = "female"
            else:  # monolog
                voice = "male"

            # Generate audio file
            segment_path = os.path.join(temp_dir, f"segment_{idx:04d}.wav")

            success = generate_audio_segment(
                text,
                voice,
                segment_path,
                active_tts_engine,
                qwen_instruct=qwen_instruct,
                strict_engine=strict_engine,
            )

            # If Qwen/XTTS fails and strict_engine is false, switch to Piper for remaining segments.
            if (
                not success
                and not switched_to_piper
                and _normalize_engine(active_tts_engine) in ("xtts", "qwen3tts")
                and not strict_engine
            ):
                failed_engine = _normalize_engine(active_tts_engine)
                print(f"[TTS] {failed_engine} failed on segment {idx}, switching to Piper for remaining segments")
                switched_to_piper = True
                active_tts_engine = "piper"
                success = generate_audio_segment(
                    text,
                    voice,
                    segment_path,
                    active_tts_engine,
                    qwen_instruct=qwen_instruct,
                    strict_engine=strict_engine,
                )

            if not success:
                print(f"[TTS] Failed to generate segment {idx}")
                if require_complete:
                    return {"success": False, "error": f"Segment {idx} generation failed"}
                continue

            audio_files.append(segment_path)

            # Progress callback
            if progress_callback:
                progress = int((idx + 1) / total_segments * 100)
                progress_callback(progress, f"Audio {idx + 1}/{total_segments}")

        if not audio_files:
            return {"success": False, "error": "No audio segments generated"}

        # Concatenate audio files
        success = _concatenate_audio(audio_files, output_path)

        if not success:
            return {"success": False, "error": "Failed to concatenate audio"}

        # Get duration
        duration = _get_audio_duration(output_path)

        return {
            "success": True,
            "output_path": output_path,
            "segment_count": len(audio_files),
            "duration_seconds": duration,
            "parallel": False,
        }

    finally:
        # Cleanup temp files
        for f in audio_files:
            try:
                os.remove(f)
            except:
                pass
        try:
            os.rmdir(temp_dir)
        except:
            pass


def _concatenate_audio(audio_files: List[str], output_path: str) -> bool:
    """Concatenate multiple audio files into one using FFmpeg."""
    if not audio_files:
        return False

    try:
        # Create a concat list file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            for audio_file in audio_files:
                f.write(f"file '{audio_file}'\n")
            concat_list = f.name

        # Run FFmpeg to concatenate and convert to MP3
        cmd = [
            "ffmpeg", "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", concat_list,
            "-acodec", "libmp3lame",
            "-b:a", OUTPUT_CONFIG["bitrate"],
            "-ar", str(OUTPUT_CONFIG["sample_rate"]),
            output_path,
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        # Cleanup concat list
        os.remove(concat_list)

        if result.returncode != 0:
            print(f"[TTS] FFmpeg error: {result.stderr}")
            return False

        return os.path.exists(output_path)

    except Exception as e:
        print(f"[TTS] Concatenation error: {e}")
        return False


def _get_audio_duration(audio_path: str) -> float:
    """Get duration of audio file in seconds."""
    try:
        cmd = [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            audio_path,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        return float(result.stdout.strip())
    except:
        return 0.0


def _download_piper_voice(voice: str, voices_dir: str) -> bool:
    """Download a Piper voice model."""
    base_url = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0"

    parts = voice.split("-")
    if len(parts) < 2:
        return False

    lang = parts[0].split("_")[0]
    locale = parts[0]
    name = parts[1]
    quality = parts[2] if len(parts) > 2 else "medium"

    model_url = f"{base_url}/{lang}/{locale}/{name}/{quality}/{voice}.onnx"
    config_url = f"{base_url}/{lang}/{locale}/{name}/{quality}/{voice}.onnx.json"

    model_path = os.path.join(voices_dir, f"{voice}.onnx")
    config_path = os.path.join(voices_dir, f"{voice}.onnx.json")

    os.makedirs(voices_dir, exist_ok=True)

    try:
        import urllib.request

        print(f"[Piper] Downloading voice: {voice}")
        urllib.request.urlretrieve(model_url, model_path)
        urllib.request.urlretrieve(config_url, config_path)

        return os.path.exists(model_path)

    except Exception as e:
        print(f"[Piper] Failed to download voice: {e}")
        return False


def list_available_voices() -> List[str]:
    """List locally available Piper voices."""
    voices_dir = PIPER_CONFIG["voices_dir"]

    if not os.path.exists(voices_dir):
        return []

    voices = []
    for f in os.listdir(voices_dir):
        if f.endswith(".onnx") and not f.endswith(".onnx.json"):
            voice_name = f.replace(".onnx", "")
            voices.append(voice_name)

    return voices


def get_tts_status() -> Dict[str, Any]:
    """Get TTS engine status information."""
    status = {
        "engine": TTS_ENGINE,
        "xtts_available": False,
        "qwen_available": False,
        "piper_available": False,
    }

    # Check XTTS
    try:
        xtts = _get_xtts_generator()
        status["xtts_available"] = xtts.is_available()
    except Exception as e:
        status["xtts_error"] = str(e)

    # Check Qwen3-TTS
    try:
        qwen = _get_qwen_generator()
        status["qwen_available"] = qwen.is_available()
    except Exception as e:
        status["qwen_error"] = str(e)

    # Check Piper
    piper_voices = list_available_voices()
    status["piper_available"] = len(piper_voices) > 0
    status["piper_voices"] = piper_voices

    return status
