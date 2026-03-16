"""
Vision Model Captioner for alt-text generation.

Legacy Ollama-based captioner. Vision tasks are now handled by vLLM
(see pdfua-service vlm_captioner.py). Kept for backwards compatibility.

Key features:
- Generate vision seeds for image elements
- Handle various image formats
- Batch processing support
- Fallback handling when VLM is unavailable
"""

import base64
import os
import re
from typing import Any, Dict, List, Optional, Tuple

import httpx


# =============================================================================
# CONFIGURATION
# =============================================================================

DEFAULT_VLM_MODEL = "qwen2.5vl:7b"
DEFAULT_TIMEOUT = 120.0
MAX_CAPTION_LENGTH = 300


# =============================================================================
# VISION CAPTIONER
# =============================================================================

class VisionCaptioner:
    """
    Vision-Language Model captioner for generating image descriptions.

    Uses Ollama with a vision model to analyze images and generate
    descriptive text that serves as a "vision seed" for alt-text generation.
    """

    def __init__(
        self,
        llm_host: Optional[str] = None,
        vlm_model: Optional[str] = None,
        timeout: float = DEFAULT_TIMEOUT,
        language: str = "de",
    ):
        """
        Initialize the vision captioner.

        Args:
            llm_host: Ollama host URL.
            vlm_model: Vision model name (e.g., qwen2.5vl:7b).
            timeout: Request timeout in seconds.
            language: Output language for captions ("de" or "en").
        """
        self.llm_host = llm_host or os.getenv("OLLAMA_HOST", "http://localhost:11434")
        self.vlm_model = vlm_model or os.getenv("VLM_MODEL", DEFAULT_VLM_MODEL)
        self.timeout = timeout
        self.language = language

        self._available: Optional[bool] = None
        self._model_verified = False

    def is_available(self) -> bool:
        """
        Check if the vision model is available.

        Returns:
            True if the model is available and ready.
        """
        if self._available is not None:
            return self._available

        try:
            response = httpx.get(
                f"{self.llm_host}/api/tags",
                timeout=5.0,
            )
            response.raise_for_status()

            models = response.json().get("models", [])
            model_names = [m.get("name", "") for m in models]

            # Check if our model is available
            model_base = self.vlm_model.split(":")[0]
            self._available = any(
                self.vlm_model in name or model_base in name
                for name in model_names
            )

            if self._available:
                print(f"[VLM] Vision model available: {self.vlm_model}")
            else:
                print(f"[VLM] Vision model {self.vlm_model} not found. Available: {model_names}")

            return self._available

        except Exception as e:
            print(f"[VLM] Failed to check model availability: {e}")
            self._available = False
            return False

    def generate_caption(
        self,
        image_bytes: bytes,
        context: Optional[str] = None,
        shape_type: str = "image",
    ) -> Optional[str]:
        """
        Generate a caption for an image.

        Args:
            image_bytes: Raw image bytes.
            context: Optional context (slide title, nearby text).
            shape_type: Type of shape (image, chart, diagram, etc.).

        Returns:
            Generated caption or None if failed.
        """
        if not self.is_available():
            return None

        prompt = self._build_prompt(context, shape_type)
        image_b64 = base64.b64encode(image_bytes).decode("utf-8")

        try:
            response = httpx.post(
                f"{self.llm_host}/api/generate",
                json={
                    "model": self.vlm_model,
                    "prompt": prompt,
                    "images": [image_b64],
                    "stream": False,
                    "options": {
                        "num_predict": MAX_CAPTION_LENGTH,
                        "temperature": 0.5,
                    },
                },
                timeout=self.timeout,
            )
            response.raise_for_status()

            result = response.json()
            caption = result.get("response", "").strip()

            return self._clean_caption(caption)

        except httpx.TimeoutException:
            print("[VLM] Request timed out")
            return None
        except Exception as e:
            print(f"[VLM] Error generating caption: {e}")
            return None

    def generate_batch(
        self,
        images: List[Dict[str, Any]],
    ) -> Dict[str, Optional[str]]:
        """
        Generate captions for multiple images.

        Args:
            images: List of dicts with keys:
                - shape_id: Unique identifier
                - image_bytes: Raw image bytes
                - context: Optional context string
                - shape_type: Type of shape

        Returns:
            Dictionary mapping shape_id to caption (or None).
        """
        results: Dict[str, Optional[str]] = {}

        for img in images:
            shape_id = img.get("shape_id", "")
            image_bytes = img.get("image_bytes")
            context = img.get("context")
            shape_type = img.get("shape_type", "image")

            if not image_bytes:
                results[shape_id] = None
                continue

            caption = self.generate_caption(
                image_bytes=image_bytes,
                context=context,
                shape_type=shape_type,
            )
            results[shape_id] = caption

        return results

    def _build_prompt(
        self,
        context: Optional[str] = None,
        shape_type: str = "image",
    ) -> str:
        """Build the prompt for caption generation."""
        if self.language == "de":
            return self._build_prompt_de(context, shape_type)
        return self._build_prompt_en(context, shape_type)

    def _build_prompt_de(
        self,
        context: Optional[str] = None,
        shape_type: str = "image",
    ) -> str:
        """Build German prompt."""
        context_line = ""
        if context:
            context_line = f"\nKontext: {context}\n"

        if shape_type in ("chart", "diagram", "diagramm"):
            return f"""Beschreibe dieses Diagramm/Chart für einen Alt-Text.
{context_line}
Fokussiere dich auf:
1. Art des Diagramms (Balken, Linie, Kreis, etc.)
2. Was wird verglichen oder dargestellt
3. Wichtigste Datenpunkte oder Trends

Antworte in 1-2 Sätzen, maximal 200 Zeichen.
Kein "Das Diagramm zeigt" am Anfang."""

        if shape_type in ("timeline", "zeitstrahl"):
            return f"""Beschreibe diesen Zeitstrahl für einen Alt-Text.
{context_line}
Fokussiere dich auf:
1. Zeitraum (von-bis)
2. Wichtigste Meilensteine
3. Hauptthema

Antworte in 1-2 Sätzen, maximal 200 Zeichen."""

        if shape_type in ("infographic", "infografik"):
            return f"""Beschreibe diese Infografik für einen Alt-Text.
{context_line}
Fokussiere dich auf:
1. Hauptthema
2. Wichtigste Informationen
3. Visuelle Struktur (Anzahl Bereiche, etc.)

Antworte in 1-2 Sätzen, maximal 200 Zeichen."""

        # Default image prompt
        return f"""Beschreibe dieses Bild für einen Alt-Text.
{context_line}
Der Alt-Text soll:
- Den Inhalt sachlich beschreiben
- Für Screenreader-Nutzer verständlich sein
- Maximal 150 Zeichen lang sein

Antworte NUR mit der Beschreibung, ohne "Das Bild zeigt"."""

    def _build_prompt_en(
        self,
        context: Optional[str] = None,
        shape_type: str = "image",
    ) -> str:
        """Build English prompt."""
        context_line = ""
        if context:
            context_line = f"\nContext: {context}\n"

        if shape_type in ("chart", "diagram"):
            return f"""Describe this diagram/chart for alt-text.
{context_line}
Focus on:
1. Type of diagram (bar, line, pie, etc.)
2. What is being compared or shown
3. Key data points or trends

Reply in 1-2 sentences, max 200 characters.
Don't start with "The diagram shows"."""

        # Default image prompt
        return f"""Describe this image for alt-text.
{context_line}
The alt-text should:
- Describe the content objectively
- Be understandable for screen reader users
- Be max 150 characters

Reply ONLY with the description, without "The image shows"."""

    def _clean_caption(self, text: str) -> str:
        """Clean and validate the generated caption."""
        if not text:
            return ""

        text = text.strip()

        # Remove soft hyphens and special Unicode
        text = text.replace('\u00AD', '')
        text = text.replace('\u200B', '')
        text = text.replace('\u200C', '')
        text = text.replace('\u200D', '')
        text = text.replace('\uFEFF', '')

        # Remove repeated characters (hallucination pattern)
        text = re.sub(r'(.)\1{3,}', r'\1\1', text)

        # Remove common unwanted prefixes
        prefixes_to_remove = [
            "Das Bild zeigt ",
            "Die Grafik zeigt ",
            "Das Diagramm zeigt ",
            "Auf dem Bild ist ",
            "Zu sehen ist ",
            "The image shows ",
            "This image depicts ",
            "The diagram shows ",
        ]

        for prefix in prefixes_to_remove:
            if text.lower().startswith(prefix.lower()):
                text = text[len(prefix):]
                if text:
                    text = text[0].upper() + text[1:]
                break

        # Remove markdown formatting
        text = text.replace("**", "").replace("*", "")

        # Clean up whitespace
        text = re.sub(r'\s+', ' ', text).strip()

        # Ensure proper punctuation
        if text and text[-1] not in '.!?':
            text += '.'

        # Truncate if too long
        if len(text) > MAX_CAPTION_LENGTH:
            text = text[:MAX_CAPTION_LENGTH - 3] + "..."

        # Quality check
        if len(text) < 10:
            return ""

        return text


# =============================================================================
# SINGLETON ACCESS
# =============================================================================

_captioner_instance: Optional[VisionCaptioner] = None


def get_vision_captioner(
    llm_host: Optional[str] = None,
    vlm_model: Optional[str] = None,
    language: str = "de",
) -> VisionCaptioner:
    """
    Get or create the VisionCaptioner singleton.

    Args:
        llm_host: Optional Ollama host URL.
        vlm_model: Optional vision model name.
        language: Output language.

    Returns:
        The singleton VisionCaptioner instance.
    """
    global _captioner_instance

    if _captioner_instance is None:
        _captioner_instance = VisionCaptioner(
            llm_host=llm_host,
            vlm_model=vlm_model,
            language=language,
        )

    return _captioner_instance


def reset_captioner() -> None:
    """Reset the captioner singleton (useful for testing)."""
    global _captioner_instance
    _captioner_instance = None
