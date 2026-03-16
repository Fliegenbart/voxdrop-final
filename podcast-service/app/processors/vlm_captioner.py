"""
VLM Captioner - Generates spoken-friendly image descriptions for podcasts using vLLM (OpenAI-compatible).

Adapted from pdfua-service's VLM captioner but optimized for:
- Shorter, more natural descriptions for audio
- Context-aware descriptions that fit into spoken narration
- German language output
"""
import base64
import asyncio
import aiohttp
from typing import Optional, List, Dict, Any
from concurrent.futures import ThreadPoolExecutor

from app.config import VLM_CONFIG


class VLMCaptioner:
    """
    Vision-Language Model for generating podcast-friendly image descriptions.
    Uses a shared OpenAI-compatible vLLM vision server to avoid loading separate vision models in Ollama.
    """

    def __init__(self):
        self.vllm_url = (VLM_CONFIG["host"] or "").rstrip("/")
        if not self.vllm_url.endswith("/v1"):
            self.vllm_url = f"{self.vllm_url}/v1"
        self.model = VLM_CONFIG["model"]
        self.timeout = VLM_CONFIG["timeout"]
        self._verified = False
        self._executor = ThreadPoolExecutor(max_workers=VLM_CONFIG["max_workers"])

    async def verify_vllm(self) -> bool:
        """Verify vLLM is available and the model is served."""
        if self._verified:
            return True

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.vllm_url}/models",
                    timeout=aiohttp.ClientTimeout(total=5)
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        models = [m.get("id") for m in data.get("data", []) if isinstance(m, dict)]
                        if self.model in models:
                            self._verified = True
                            print(f"[VLM-Podcast] vLLM connected, using {self.model}")
                            return True
                        else:
                            print(f"[VLM-Podcast] Model {self.model} not found on vLLM. Available: {models}")
                            return False
        except Exception as e:
            print(f"[VLM-Podcast] vLLM connection error: {e}")
            return False

        return False

    def _image_to_base64(self, image_bytes: bytes) -> str:
        """Convert image bytes to base64 string."""
        if isinstance(image_bytes, str):
            # Already base64 encoded
            return image_bytes
        return base64.b64encode(image_bytes).decode("utf-8")

    async def _call_vllm_async(
        self,
        prompt: str,
        image_b64: str,
        max_tokens: int = 220,
        session: Optional[aiohttp.ClientSession] = None,
        overflow_retry: bool = True,
    ) -> str:
        """Call vLLM OpenAI-compatible API asynchronously with image and prompt."""
        if not await self.verify_vllm():
            raise RuntimeError("vLLM VLM not available")

        data_uri = f"data:image/png;base64,{image_b64}"
        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": data_uri}},
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
            "max_tokens": max_tokens,
            "temperature": 0.3,
        }

        try:
            timeout = aiohttp.ClientTimeout(total=self.timeout)
            if session is None:
                async with aiohttp.ClientSession(timeout=timeout) as owned_session:
                    return await self._call_vllm_async(
                        prompt,
                        image_b64,
                        max_tokens=max_tokens,
                        session=owned_session,
                        overflow_retry=overflow_retry,
                    )

            async with session.post(
                f"{self.vllm_url}/chat/completions",
                json=payload,
                timeout=timeout,
            ) as response:
                if response.status >= 400:
                    body = await response.text()
                    lower = (body or "").lower()
                    is_overflow = (
                        "context length" in lower
                        or "maximum context length" in lower
                        or ("max_tokens" in lower and "context" in lower)
                    )
                    if overflow_retry and is_overflow:
                        shortened = prompt[-max(160, int(len(prompt) * 0.65)) :]
                        return await self._call_vllm_async(
                            shortened,
                            image_b64,
                            max_tokens=max(96, min(max_tokens, 140)),
                            session=session,
                            overflow_retry=False,
                        )
                    raise RuntimeError(body[:1000] or f"HTTP {response.status}")
                result = await response.json()
                return (
                    result.get("choices", [{}])[0]
                    .get("message", {})
                    .get("content", "")
                    .strip()
                )

        except asyncio.TimeoutError:
            print(f"[VLM-Podcast] Request timed out after {self.timeout}s")
            raise
        except Exception as e:
            print(f"[VLM-Podcast] vLLM API error: {e}")
            raise

    async def describe_image_for_podcast(
        self,
        image_b64: str,
        slide_title: str = "",
        slide_content: str = "",
        session: Optional[aiohttp.ClientSession] = None,
    ) -> str:
        """
        Generate a spoken-friendly description of an image for a podcast.

        Args:
            image_b64: Base64 encoded image data
            slide_title: Title of the slide (for context)
            slide_content: Text content of the slide (for context)

        Returns:
            German description suitable for podcast narration (1-2 sentences)
        """
        try:
            context = ""
            if slide_title:
                context = f"Folientitel: {slide_title}\n"
            if slide_content:
                # Truncate long content
                content_preview = slide_content[:200] + "..." if len(slide_content) > 200 else slide_content
                context += f"Folieninhalt: {content_preview}\n"

            prompt = f"""{context}
Beschreibe dieses Bild kurz fuer einen gesprochenen Podcast (1-2 Saetze, max 100 Woerter).

Regeln:
- Fuer Hoerer verstaendlich (kein "Das Bild zeigt")
- Beschreibe was zu SEHEN ist, nicht was zu lesen ist
- Bei Diagrammen: Art und Hauptaussage
- Bei Fotos: Wer/was ist abgebildet
- Deutsch, natuerliche Sprache

Beschreibung:"""

            output_text = await self._call_vllm_async(prompt, image_b64, max_tokens=220, session=session)
            return self._clean_description(output_text)

        except Exception as e:
            print(f"[VLM-Podcast] Error describing image: {e}")
            # Fallback
            if slide_title:
                return f"Eine Grafik zum Thema {slide_title}."
            return "Eine visuelle Darstellung."

    async def describe_images_batch(
        self,
        images: List[Dict[str, Any]],
        slide_context: Dict[str, str],
        session: Optional[aiohttp.ClientSession] = None,
        semaphore: Optional[asyncio.Semaphore] = None,
    ) -> List[str]:
        """
        Describe multiple images in parallel.

        Args:
            images: List of image dicts with "data" (base64) key
            slide_context: Dict with "title" and "content" keys

        Returns:
            List of descriptions in same order as input images
        """
        if not images:
            return []

        async def _describe(img: Dict[str, Any]) -> str:
            if semaphore is None:
                return await self.describe_image_for_podcast(
                    img.get("data", ""),
                    slide_context.get("title", ""),
                    slide_context.get("content", ""),
                    session=session,
                )
            async with semaphore:
                return await self.describe_image_for_podcast(
                    img.get("data", ""),
                    slide_context.get("title", ""),
                    slide_context.get("content", ""),
                    session=session,
                )

        tasks = [_describe(img) for img in images]

        descriptions = await asyncio.gather(*tasks, return_exceptions=True)

        # Handle any exceptions
        results = []
        for desc in descriptions:
            if isinstance(desc, Exception):
                print(f"[VLM-Podcast] Batch description error: {desc}")
                results.append("Eine visuelle Darstellung.")
            else:
                results.append(desc)

        return results

    def _clean_description(self, text: str) -> str:
        """Clean up the generated description for spoken use."""
        text = text.strip()

        # Remove soft hyphens and problematic Unicode
        text = text.replace('\u00AD', '')
        text = text.replace('\u200B', '')
        text = text.replace('\u200C', '')
        text = text.replace('\u200D', '')
        text = text.replace('\uFEFF', '')

        # Remove common prefixes
        prefixes_to_remove = [
            "Das Bild zeigt ",
            "Auf dem Bild ist ",
            "Zu sehen ist ",
            "Die Grafik zeigt ",
            "Das Diagramm zeigt ",
            "Hier sieht man ",
            "Beschreibung: ",
        ]

        text_lower = text.lower()
        for prefix in prefixes_to_remove:
            if text_lower.startswith(prefix.lower()):
                text = text[len(prefix):]
                if text:
                    text = text[0].upper() + text[1:]
                break

        # Remove markdown
        text = text.replace("**", "").replace("*", "")

        # Clean up multiple spaces
        import re
        text = re.sub(r'\s+', ' ', text).strip()

        # Ensure proper ending
        if text and text[-1] not in '.!?':
            text += '.'

        # Truncate if too long (keep podcast-friendly)
        if len(text) > 250:
            text = text[:247] + '...'

        return text


# Singleton instance
_captioner_instance: Optional[VLMCaptioner] = None


def get_vlm_captioner() -> VLMCaptioner:
    """Get or create the VLM captioner singleton."""
    global _captioner_instance
    if _captioner_instance is None:
        _captioner_instance = VLMCaptioner()
    return _captioner_instance


async def describe_slide_images(
    slides_data: List[Dict[str, Any]],
    progress_callback=None
) -> List[Dict[str, Any]]:
    """
    Add image descriptions to all slides with images.

    Args:
        slides_data: List of slide dicts from pptx_parser
        progress_callback: Optional callback(percent, stage)

    Returns:
        Same slides_data with added image descriptions
    """
    captioner = get_vlm_captioner()

    # Check if VLM is available
    if not await captioner.verify_vllm():
        print("[VLM-Podcast] VLM not available, skipping image descriptions")
        return slides_data

    total_images = sum(len(s.get("images", [])) for s in slides_data)
    if total_images == 0:
        return slides_data

    processed = 0
    processed_lock = asyncio.Lock()
    sem = asyncio.Semaphore(max(1, int(VLM_CONFIG.get("max_workers") or 3)))
    min_area_ratio = float(VLM_CONFIG.get("min_area_ratio") or 0.0)

    def _is_tiny_icon(slide: Dict[str, Any], img: Dict[str, Any]) -> bool:
        try:
            sw = int(slide.get("slide_width") or 0)
            sh = int(slide.get("slide_height") or 0)
            iw = int(img.get("width") or 0)
            ih = int(img.get("height") or 0)
            if sw <= 0 or sh <= 0 or iw <= 0 or ih <= 0:
                return False
            ratio = (iw * ih) / float(sw * sh)
            return ratio < min_area_ratio
        except Exception:
            return False

    connector = aiohttp.TCPConnector(limit=max(4, sem._value * 3), ttl_dns_cache=300)
    timeout = aiohttp.ClientTimeout(total=float(VLM_CONFIG.get("timeout") or 120))
    async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:

        async def _process_image(slide: Dict[str, Any], img: Dict[str, Any]) -> None:
            nonlocal processed
            if _is_tiny_icon(slide, img):
                # Skip tiny icons/logos; script should rely on slide text.
                img["description"] = ""
                async with processed_lock:
                    processed += 1
                    if progress_callback:
                        progress_callback(int(100 * processed / total_images), f"Bilder beschreiben ({processed}/{total_images})")
                return

            context = {
                "title": slide.get("title", ""),
                "content": "\n".join(slide.get("content", [])),
            }
            try:
                desc = await captioner.describe_images_batch([img], context, session=session, semaphore=sem)
                img["description"] = (desc[0] if desc else "") or ""
            except Exception:
                img["description"] = ""
            async with processed_lock:
                processed += 1
                if progress_callback:
                    progress_callback(int(100 * processed / total_images), f"Bilder beschreiben ({processed}/{total_images})")

        tasks = []
        for slide in slides_data:
            for img in (slide.get("images", []) or []):
                tasks.append(asyncio.create_task(_process_image(slide, img)))

        for task in asyncio.as_completed(tasks):
            await task

    return slides_data
