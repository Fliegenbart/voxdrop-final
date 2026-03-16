"""
Voice-Over Generator - Simple text-to-speech generation.

Unlike the podcast generator, this module provides direct text-to-audio conversion
without script generation. Users provide the text and select a voice.
"""
import os
import uuid
import tempfile
from typing import Dict, Any, Optional, List

from app.generators.tts_generator import (
    generate_audio_segment,
    apply_pronunciation_rules,
    _concatenate_audio,
    _get_audio_duration,
)
from app.config import OUTPUT_DIR


# Maximum text length (characters) for voice-over generation
MAX_TEXT_LENGTH = 50000  # ~10,000 words


def generate_voiceover(
    text: str,
    voice: str,
    pronunciation_rules: Optional[List[Dict[str, str]]] = None,
    output_path: Optional[str] = None,
    progress_callback: Optional[callable] = None,
    tts_engine: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Generate voice-over audio from text.

    Args:
        text: Text to synthesize
        voice: Voice to use ("male" or "female")
        pronunciation_rules: Optional list of {"original": "...", "spoken": "..."} dicts
        output_path: Optional output file path (auto-generated if not provided)
        progress_callback: Optional callback(progress: int, stage: str)

    Returns:
        Dict with success status, output_path, duration_seconds, etc.
    """
    if not text or not text.strip():
        return {"success": False, "error": "Kein Text angegeben"}

    if len(text) > MAX_TEXT_LENGTH:
        return {
            "success": False,
            "error": f"Text zu lang. Maximum: {MAX_TEXT_LENGTH} Zeichen"
        }

    if voice not in ("male", "female"):
        return {"success": False, "error": "Ungueltige Stimme. Erlaubt: male, female"}

    # Generate output path if not provided
    if not output_path:
        job_id = str(uuid.uuid4())
        output_path = os.path.join(OUTPUT_DIR, f"voiceover_{job_id}.mp3")

    # Apply pronunciation rules
    if progress_callback:
        progress_callback(5, "Aussprache-Regeln werden angewendet...")

    processed_text = apply_pronunciation_rules(text, pronunciation_rules)
    require_complete = tts_engine is not None

    # Split text into chunks for long texts
    # XTTS works best with shorter segments (~200-500 chars)
    chunks = _split_text_into_chunks(processed_text, max_chars=400)

    if len(chunks) == 1:
        # Single chunk - generate directly
        if progress_callback:
            progress_callback(10, "Audio wird generiert...")

        temp_path = tempfile.mktemp(suffix=".wav")
        success = generate_audio_segment(chunks[0], voice, temp_path, tts_engine)

        if not success or not os.path.exists(temp_path):
            return {"success": False, "error": "Audio-Generierung fehlgeschlagen"}

        # Convert to MP3
        if progress_callback:
            progress_callback(90, "Audio wird finalisiert...")

        success = _concatenate_audio([temp_path], output_path)

        # Cleanup
        try:
            os.remove(temp_path)
        except:
            pass

        if not success:
            return {"success": False, "error": "Audio-Konvertierung fehlgeschlagen"}

    else:
        # Multiple chunks - generate each and concatenate
        temp_dir = tempfile.mkdtemp(prefix="voiceover_")
        audio_files = []

        try:
            total_chunks = len(chunks)

            for idx, chunk in enumerate(chunks):
                if progress_callback:
                    progress = 10 + int((idx / total_chunks) * 80)
                    progress_callback(progress, f"Audio {idx + 1}/{total_chunks}...")

                chunk_path = os.path.join(temp_dir, f"chunk_{idx:04d}.wav")
                success = generate_audio_segment(chunk, voice, chunk_path, tts_engine)

                if success and os.path.exists(chunk_path):
                    audio_files.append(chunk_path)
                else:
                    print(f"[VoiceOver] Chunk {idx} failed")
                    if require_complete:
                        return {"success": False, "error": f"Chunk {idx} failed"}

            if not audio_files:
                return {"success": False, "error": "Keine Audio-Segmente generiert"}

            # Concatenate all chunks
            if progress_callback:
                progress_callback(90, "Audio wird zusammengefuegt...")

            success = _concatenate_audio(audio_files, output_path)

            if not success:
                return {"success": False, "error": "Audio-Zusammenfuehrung fehlgeschlagen"}

        finally:
            # Cleanup temp files
            import shutil
            try:
                shutil.rmtree(temp_dir)
            except:
                pass

    # Get duration
    duration = _get_audio_duration(output_path)

    if progress_callback:
        progress_callback(100, "Fertig")

    return {
        "success": True,
        "output_path": output_path,
        "duration_seconds": duration,
        "voice": voice,
        "character_count": len(text),
        "chunk_count": len(chunks),
    }


def _split_text_into_chunks(text: str, max_chars: int = 400) -> List[str]:
    """
    Split text into chunks suitable for TTS generation.

    Tries to split at sentence boundaries for natural pauses.
    Falls back to word boundaries if sentences are too long.

    Args:
        text: Text to split
        max_chars: Maximum characters per chunk

    Returns:
        List of text chunks
    """
    if len(text) <= max_chars:
        return [text]

    chunks = []
    current_chunk = ""

    # Split by sentences first (. ! ?)
    import re
    sentences = re.split(r'(?<=[.!?])\s+', text)

    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue

        # If sentence itself is too long, split by words
        if len(sentence) > max_chars:
            words = sentence.split()
            for word in words:
                if len(current_chunk) + len(word) + 1 > max_chars:
                    if current_chunk:
                        chunks.append(current_chunk.strip())
                    current_chunk = word
                else:
                    current_chunk += " " + word if current_chunk else word

        # Normal case: add sentence to chunk
        elif len(current_chunk) + len(sentence) + 1 > max_chars:
            if current_chunk:
                chunks.append(current_chunk.strip())
            current_chunk = sentence
        else:
            current_chunk += " " + sentence if current_chunk else sentence

    # Don't forget the last chunk
    if current_chunk:
        chunks.append(current_chunk.strip())

    return chunks


def extract_text_from_docx(file_path: str) -> Dict[str, Any]:
    """
    Extract text content from a Word document.

    Args:
        file_path: Path to .docx file

    Returns:
        Dict with text, word_count, and metadata
    """
    try:
        from docx import Document

        doc = Document(file_path)

        # Extract all paragraph text
        paragraphs = []
        for para in doc.paragraphs:
            text = para.text.strip()
            if text:
                paragraphs.append(text)

        full_text = "\n\n".join(paragraphs)
        word_count = len(full_text.split())

        # Extract metadata
        metadata = {}
        if doc.core_properties:
            if doc.core_properties.title:
                metadata["title"] = doc.core_properties.title
            if doc.core_properties.author:
                metadata["author"] = doc.core_properties.author
            if doc.core_properties.subject:
                metadata["subject"] = doc.core_properties.subject

        return {
            "success": True,
            "text": full_text,
            "word_count": word_count,
            "paragraph_count": len(paragraphs),
            "metadata": metadata,
        }

    except Exception as e:
        return {
            "success": False,
            "error": f"Fehler beim Lesen der Datei: {str(e)}",
        }
