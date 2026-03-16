"""
VLM Captioner - Generates alt-text for images using the shared vLLM vision server.

This avoids requiring a separate vision model in Ollama (which is often not installed)
and keeps the vision stack consistent across PDF/UA processing.
"""
import base64
from typing import Optional

import httpx

from ..config import ALT_TEXT_LANG, VISION_VLLM_URL, VISION_MODEL

DEFAULT_TIMEOUT_SECONDS = 180


class VLMCaptioner:
    """
    Vision-Language Model for generating image alt-text.
    Uses an OpenAI-compatible vision endpoint (vLLM) for better understanding of complex slides.
    """

    def __init__(self):
        self.base_url = VISION_VLLM_URL.rstrip("/")
        if not self.base_url.endswith("/v1"):
            self.base_url = f"{self.base_url}/v1"
        self.model = VISION_MODEL
        self._verified = False

    def _verify_vllm(self) -> bool:
        """Verify vLLM is available and the model is served."""
        if self._verified:
            return True

        try:
            with httpx.Client(timeout=5.0) as client:
                resp = client.get(f"{self.base_url}/models")
            if resp.status_code == 200:
                data = resp.json()
                models = [m.get("id") for m in data.get("data", []) if isinstance(m, dict)]
                if self.model in models:
                    self._verified = True
                    print(f"[VLM] vLLM connected, using {self.model}")
                    return True
                print(f"[VLM] Model {self.model} not found on vLLM. Available: {models}")
                return False
        except Exception as e:
            print(f"[VLM] vLLM connection error: {e}")
            return False

    def _image_to_base64(self, image_bytes: bytes) -> str:
        """Convert image bytes to base64 string."""
        return base64.b64encode(image_bytes).decode("utf-8")

    def _call_vllm(self, prompt: str, image_bytes: bytes, max_tokens: int = 300, slide_context_bytes: bytes | None = None) -> str:
        """Call vLLM OpenAI-compatible API with image and prompt."""
        if not self._verify_vllm():
            raise RuntimeError("vLLM not available")

        image_b64 = self._image_to_base64(image_bytes)
        data_uri = f"data:image/png;base64,{image_b64}"
        content = []
        if slide_context_bytes:
            slide_b64 = self._image_to_base64(slide_context_bytes)
            content.append({"type": "image_url", "image_url": {"url": f"data:image/png;base64,{slide_b64}"}})
        content.append({"type": "image_url", "image_url": {"url": data_uri}})
        content.append({"type": "text", "text": prompt})
        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "user",
                    "content": content,
                }
            ],
            "max_tokens": max_tokens,
            "temperature": 0.3,
        }

        try:
            with httpx.Client(timeout=float(DEFAULT_TIMEOUT_SECONDS)) as client:
                resp = client.post(f"{self.base_url}/chat/completions", json=payload)
            resp.raise_for_status()
            data = resp.json()
            return str(data.get("choices", [{}])[0].get("message", {}).get("content", "")).strip()

        except httpx.TimeoutException:
            print("[VLM] vLLM request timed out")
            raise
        except Exception as e:
            print(f"[VLM] vLLM API error: {e}")
            raise

    def generate_caption(
        self,
        image_bytes: bytes,
        visual_type: str = "image",
        context_text: str | None = None,
        slide_title: str | None = None,
        speaker_notes: str | None = None,
        slide_context_bytes: bytes | None = None,
    ) -> str:
        """
        Generate a German alt-text description for an image.

        Args:
            image_bytes: Raw image bytes
            slide_context_bytes: Optional full slide render for additional context

        Returns:
            German alt-text description
        """
        try:
            prompt = self._get_prompt(
                visual_type=visual_type,
                context_text=context_text,
                slide_title=slide_title,
                speaker_notes=speaker_notes,
                has_slide_context=slide_context_bytes is not None,
            )
            output_text = self._call_vllm(prompt, image_bytes, max_tokens=180, slide_context_bytes=slide_context_bytes)
            caption = self._clean_caption(output_text)
            return caption

        except Exception as e:
            print(f"[VLM] Error generating caption: {e}")
            raise

    def _get_prompt(
        self,
        visual_type: str = "image",
        context_text: str | None = None,
        slide_title: str | None = None,
        speaker_notes: str | None = None,
        has_slide_context: bool = False,
    ) -> str:
        """Get the prompt for alt-text generation (short)."""
        vt = (visual_type or "image").strip().lower()
        slide_context_prefix = (
            "Das erste Bild zeigt die gesamte Folie als Kontext. "
            "Das zweite Bild zeigt das zu beschreibende Element.\n\n"
        ) if has_slide_context else ""
        title_line = f"Folientitel: {slide_title}\n" if slide_title else ""
        context_block = ""
        if context_text:
            ctx = str(context_text).strip()
            if len(ctx) > 1400:
                ctx = ctx[:1397] + "..."
            context_block = (
                "\nText auf der Folie (steht bereits als normaler Text im Dokument und muss NICHT wiederholt werden):\n"
                f"\"\"\"\n{ctx}\n\"\"\"\n"
            )

        notes_block = ""
        if speaker_notes:
            notes = str(speaker_notes).strip()
            if len(notes) > 1000:
                notes = notes[:997] + "..."
            notes_block = (
                "\nSpeaker Notes (zusätzlicher Kontext, nicht wörtlich wiederholen):\n"
                f"\"\"\"\n{notes}\n\"\"\"\n"
            )

        if ALT_TEXT_LANG == "de":
            # Keep this short (single sentence). Use visual_type for routing.
            focus = "Beschreibe das wichtigste informative Bildelement mit seiner Kernaussage."
            if vt in ("chart", "diagram", "timeline", "org", "infographic"):
                focus = (
                    "Beschreibe die visuelle Struktur (z.B. Zeitleiste, Flussdiagramm, Organigramm, Raster/Boxen) "
                    "und nenne die Kernaussage und 1-2 zentrale Elemente (z.B. Phasen, Meilensteine, Hauptknoten)."
                )
            elif vt == "screenshot":
                focus = "Beschreibe kurz, welche Anwendung/Ansicht zu sehen ist und welchen Zweck die Ansicht hat."
            elif vt == "photo":
                focus = "Beschreibe kurz die Szene (ohne Identifizierung von Personen)."

            return f"""{slide_context_prefix}{title_line}{context_block}{notes_block}Du bist Barrierefreiheits-Experte (BITV 2.0 / WCAG 2.1).
Erstelle einen kurzen deutschen Alternativtext (Alt-Text) in EINEM Satz.

Regeln:
- Maximal 220 Zeichen
- Beginne NICHT mit: "Bild von", "Grafik zeigt", "Screenshot von", "Abbildung", "Grafik zur Folie"
- Nenne den Visualtyp explizit (z.B. Diagramm, Foto, Screenshot, Tabelle, Zeitleiste, Organigramm)
- Nutze Folientext und Speaker Notes nur als Kontext zum Verstehen; NICHT wörtlich wiederholen
- Keine Floskeln, keine Foliennummern, keine Meta-Sätze ("auf der Folie")
- Keine Meinungen; nur beobachtbare Struktur + Kernaussage

Fokus: {focus}

Antworte NUR mit dem Alt-Text."""
        else:
            return f"""{slide_context_prefix}{title_line}{context_block}Write ONE short sentence as alt text.

Rules:
- Max 180 characters
- Name the visual type (diagram, photo, screenshot, table, timeline, org chart)
- Do NOT repeat the provided context text
- No lead-in like "The image shows"

Reply ONLY with the alt text."""

    def generate_diagram_summary(
        self,
        image_bytes: bytes,
        visual_type_hint: str = None,
        chart_title: str = None,
        context_text: str | None = None,
        speaker_notes: str | None = None,
    ) -> str:
        """
        Generate a detailed summary for a complex diagram, infographic, or slide.

        This creates a longer, more informative description that captures:
        1. The TYPE of visualization (timeline, process, infographic, etc.)
        2. A GLOBAL SUMMARY of what the slide is about
        3. The KEY DETAILS in logical order

        Args:
            image_bytes: Raw image bytes of the chart/diagram/slide
            chart_type: Optional type hint
            chart_title: Optional title of the slide

        Returns:
            German summary description (up to 600 characters)
        """
        try:
            prompt = self._get_diagram_prompt(
                visual_type_hint,
                chart_title,
                context_text=context_text,
                speaker_notes=speaker_notes,
            )
            output_text = self._call_vllm(prompt, image_bytes, max_tokens=800)
            summary = self._clean_summary(output_text)
            return summary

        except Exception as e:
            print(f"[VLM] Error generating diagram summary: {e}")
            # Fallback
            if chart_title:
                return f"Folie: {chart_title}"
            return "Komplexe Visualisierung"

    def _get_diagram_prompt(
        self,
        visual_type_hint: str = None,
        chart_title: str = None,
        context_text: str | None = None,
        speaker_notes: str | None = None,
    ) -> str:
        """Prompt for slide-level visual description (2-3 sentences)."""
        context = ""
        if chart_title:
            context = f"Folientitel: {chart_title}\n\n"
        if context_text:
            ctx = str(context_text).strip()
            if len(ctx) > 1600:
                ctx = ctx[:1597] + "..."
            context += (
                "Text auf der Folie (bereits im Dokument vorhanden, NICHT wiederholen):\n"
                f"\"\"\"\n{ctx}\n\"\"\"\n\n"
            )
        if speaker_notes:
            notes = str(speaker_notes).strip()
            if len(notes) > 1400:
                notes = notes[:1397] + "..."
            context += (
                "Speaker Notes (zusätzlicher Kontext, nicht wörtlich wiederholen):\n"
                f"\"\"\"\n{notes}\n\"\"\"\n\n"
            )

        vt = (visual_type_hint or "").strip().lower()
        type_line = ""
        if vt:
            type_line = f"Hinweis: Folienart = {vt}.\n"

        templates = {
            "timeline": "Satz 1: Zeitleiste/Achse (Start/Ende) und Segmentierung. Satz 2-3: Meilensteine/Phasen in chronologischer Reihenfolge.",
            "chart": "Satz 1: Diagrammtyp (Balken/Linie/Kreis) und Achsen/Legende Position. Satz 2-3: auffällige Werte/Trends, falls lesbar.",
            "org": "Satz 1: Organigramm mit Ebenen und Anzahl Hauptknoten. Satz 2-3: Hierarchie (oben -> unten).",
            "diagram": "Satz 1: Fluss-/Prozessdiagramm oder Schema (Boxen + Pfeile) und Richtung. Satz 2-3: Schritte/Verzweigungen in Reihenfolge.",
            "infographic": "Satz 1: Infografik/Übersicht (Spalten/Boxen/Raster) und Anordnung. Satz 2-3: wichtigste Blöcke und Beziehungen (links/rechts/oben/unten).",
        }
        instruction = templates.get(vt, "Satz 1: Visualtyp und Struktur. Satz 2-3: wichtigste Inhalte in visueller Reihenfolge.")

        return f"""{context}{type_line}Du bist Barrierefreiheits-Experte (BITV 2.0 / WCAG 2.1).
Beschreibe den KONKRETEN INHALT dieser Folie in 2-4 deutschen Sätzen für Screenreader.

{instruction}

Beispiel (Organigramm):
"Organigramm mit drei Ebenen. Oben: KS rvSystem (Gesamtleitung). Mitte: Multiprojektleitung. Unten: ART Versicherung, ART Rente und ART Reha als drei parallele Teams."

Beispiel (Timeline):
"Horizontale Zeitachse von 2025 bis 2029. Drei parallele Workstreams: Versicherung (2025-2027), Rente (2026-2028) und Reha (2027-2029)."

Regeln:
- Nenne KONKRETE Begriffe, Namen, Zahlen und Beschriftungen die im Bild sichtbar sind
- Beschreibe Hierarchie/Reihenfolge/Beziehungen zwischen den Elementen
- Nutze Folientext/Speaker Notes als Kontext, aber wiederhole sie NICHT woertlich
- Antworte NICHT mit generischen Beschreibungen wie "Schema mit mehreren Elementen"
- Maximal 800 Zeichen
- Beginne NICHT mit "Die Folie zeigt" oder "Zu sehen ist"

Deine Beschreibung:"""

    def _clean_summary(self, text: str) -> str:
        """Clean up the generated summary."""
        text = text.strip()

        # Remove soft hyphens and other problematic Unicode characters
        text = text.replace('\u00AD', '')  # Soft hyphen
        text = text.replace('\u200B', '')  # Zero-width space
        text = text.replace('\u200C', '')  # Zero-width non-joiner
        text = text.replace('\u200D', '')  # Zero-width joiner
        text = text.replace('\uFEFF', '')  # BOM

        # Remove repeated characters (VLM hallucination pattern)
        import re
        # Remove patterns like "­­­­­" or "…………" (3+ repeating chars)
        text = re.sub(r'(.)\1{3,}', r'\1\1', text)
        # Remove patterns like "Es… Es… Es…" (repeated words/phrases)
        text = re.sub(r'(\b\w+\.{0,3}\s*)\1{2,}', r'\1', text)

        # Remove common prefixes
        prefixes_to_remove = [
            "Das Diagramm zeigt ",
            "Die Grafik zeigt ",
            "Das Schaubild zeigt ",
            "Die Folie zeigt ",
            "Zu sehen ist ",
            "Hier ist ",
            "Diese Folie zeigt ",
        ]

        for prefix in prefixes_to_remove:
            if text.lower().startswith(prefix.lower()):
                text = text[len(prefix):]
                text = text[0].upper() + text[1:] if text else text
                break

        # Remove markdown formatting if present
        text = text.replace("**", "").replace("*", "")

        # Remove numbered lists formatting
        import re
        text = re.sub(r'^\d+\.\s*', '', text, flags=re.MULTILINE)
        text = re.sub(r'\n\d+\.\s*', ' ', text)

        # Clean up multiple spaces/newlines
        text = re.sub(r'\s+', ' ', text).strip()

        # Ensure it ends with proper punctuation
        if text and not text[-1] in '.!?':
            text += '.'

        # Truncate if too long (allow more for structured descriptions)
        if len(text) > 800:
            text = text[:797] + '...'

        # Quality check: if the text is too short or mostly non-alphanumeric, it's garbage
        alphanumeric_ratio = sum(c.isalnum() or c.isspace() for c in text) / len(text) if text else 0
        if len(text) < 20 or alphanumeric_ratio < 0.5:
            print(f"[VLM] Warning: Generated summary seems low quality (len={len(text)}, ratio={alphanumeric_ratio:.2f})")
            return ""  # Return empty to trigger fallback

        return text

    def _clean_caption(self, text: str) -> str:
        """Clean up the generated caption."""
        text = text.strip()

        # Remove soft hyphens and other problematic Unicode characters
        text = text.replace('\u00AD', '')  # Soft hyphen
        text = text.replace('\u200B', '')  # Zero-width space
        text = text.replace('\u200C', '')  # Zero-width non-joiner
        text = text.replace('\u200D', '')  # Zero-width joiner
        text = text.replace('\uFEFF', '')  # BOM

        # Remove repeated characters (VLM hallucination pattern)
        import re
        text = re.sub(r'(.)\1{3,}', r'\1\1', text)

        # Remove common prefixes
        prefixes_to_remove = [
            "Das Bild zeigt ",
            "Auf dem Bild ist ",
            "Zu sehen ist ",
            "The image shows ",
            "This image depicts ",
        ]

        for prefix in prefixes_to_remove:
            if text.lower().startswith(prefix.lower()):
                text = text[len(prefix):]
                # Capitalize first letter
                text = text[0].upper() + text[1:] if text else text
                break

        # Remove markdown
        text = text.replace("**", "").replace("*", "")

        # Ensure it ends with proper punctuation
        if text and not text[-1] in '.!?':
            text += '.'

        # Truncate if too long
        if len(text) > 200:
            text = text[:197] + '...'

        return text


# Singleton instance for reuse
_captioner_instance: Optional[VLMCaptioner] = None


def get_captioner() -> VLMCaptioner:
    """Get or create the VLM captioner singleton."""
    global _captioner_instance
    if _captioner_instance is None:
        _captioner_instance = VLMCaptioner()
    return _captioner_instance
