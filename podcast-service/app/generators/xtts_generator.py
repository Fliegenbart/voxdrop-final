"""
XTTS v2 Generator - High-quality TTS with voice cloning using Coqui TTS.
"""
import os
import torch
from typing import Optional
from TTS.api import TTS

from app.config import XTTS_CONFIG


class XTTSGenerator:
    """
    XTTS v2 Text-to-Speech generator with voice cloning.

    Uses reference audio samples to clone voices for natural-sounding
    dialog podcasts with distinct male and female speakers.
    """

    _instance: Optional['XTTSGenerator'] = None

    def __init__(self):
        self.device = XTTS_CONFIG["device"] if torch.cuda.is_available() else "cpu"
        self.language = XTTS_CONFIG["language"]
        self.samples_dir = XTTS_CONFIG["samples_dir"]

        # Voice sample paths
        self.male_sample = os.path.join(self.samples_dir, XTTS_CONFIG["male_sample"])
        self.female_sample = os.path.join(self.samples_dir, XTTS_CONFIG["female_sample"])

        self.tts: Optional[TTS] = None
        self._initialized = False

    def _ensure_initialized(self) -> bool:
        """Lazy initialization of the TTS model."""
        if self._initialized:
            return True

        try:
            print(f"[XTTS] Loading model on {self.device}...")
            self.tts = TTS(XTTS_CONFIG["model"]).to(self.device)
            self._initialized = True
            print(f"[XTTS] Model loaded successfully")
            return True
        except Exception as e:
            print(f"[XTTS] Failed to load model: {e}")
            return False

    def _get_sample_path(self, voice: str) -> str:
        """Get the reference audio sample path for a voice."""
        if voice == "male":
            return self.male_sample
        elif voice == "female":
            return self.female_sample
        else:
            # Default to male for unknown voices
            return self.male_sample

    def _check_sample_exists(self, sample_path: str) -> bool:
        """Check if a voice sample file exists."""
        if not os.path.exists(sample_path):
            print(f"[XTTS] Voice sample not found: {sample_path}")
            return False
        return True

    def generate(self, text: str, voice: str, output_path: str) -> bool:
        """
        Generate audio for text using XTTS v2 with voice cloning.

        Args:
            text: Text to synthesize
            voice: Voice type ("male" or "female")
            output_path: Path to save the output WAV file

        Returns:
            True if successful, False otherwise
        """
        if not self._ensure_initialized():
            return False

        sample_path = self._get_sample_path(voice)

        if not self._check_sample_exists(sample_path):
            return False

        try:
            print(f"[XTTS] Generating audio for {voice} voice ({len(text)} chars)")

            self.tts.tts_to_file(
                text=text,
                speaker_wav=sample_path,
                language=self.language,
                file_path=output_path
            )

            if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
                print(f"[XTTS] Audio generated: {output_path}")
                return True
            else:
                print(f"[XTTS] Output file missing or empty")
                return False

        except Exception as e:
            print(f"[XTTS] Error generating audio: {e}")
            return False

    def is_available(self) -> bool:
        """Check if XTTS is available and voice samples exist."""
        if not torch.cuda.is_available():
            print("[XTTS] CUDA not available")
            return False

        if not os.path.exists(self.male_sample):
            print(f"[XTTS] Male voice sample missing: {self.male_sample}")
            return False

        if not os.path.exists(self.female_sample):
            print(f"[XTTS] Female voice sample missing: {self.female_sample}")
            return False

        return True

    @classmethod
    def get_instance(cls) -> 'XTTSGenerator':
        """Get or create the singleton instance."""
        if cls._instance is None:
            cls._instance = XTTSGenerator()
        return cls._instance


def get_xtts_generator() -> XTTSGenerator:
    """Get the XTTS generator singleton."""
    return XTTSGenerator.get_instance()
