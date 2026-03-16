"""
PDF Parser - extracts page text and renders pages for visual summaries.

This is optimized for "exported web pages" (e.g., Confluence PDFs):
- Keep all visible text
- Derive a simple page title from the first meaningful line
- Render a subset of pages to images for VLM-based summaries
"""
from __future__ import annotations

import base64
import io
import re
from typing import Any, Dict, List, Tuple

from pdf2image import convert_from_path
from PIL import Image
from pypdf import PdfReader

from ..config import PDF_RENDER_DPI, PDF_VLM_MAX_PAGES, PDF_VLM_MAX_TARGETS


def _normalize_text(text: str) -> str:
    """Normalize whitespace while keeping paragraph boundaries."""
    if not text:
        return ""
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    return normalized.strip()


def _split_paragraphs(text: str) -> List[str]:
    """Split text into paragraphs and drop obvious noise."""
    if not text:
        return []
    paragraphs = re.split(r"\n\s*\n", text)
    cleaned: List[str] = []
    seen = set()
    for para in paragraphs:
        p = re.sub(r"\s+", " ", para).strip()
        if not p:
            continue
        # Skip very short fragments and duplicates
        if len(p) < 3 or p in seen:
            continue
        seen.add(p)
        cleaned.append(p)
    return cleaned


def _derive_title(text: str, page_number: int) -> str:
    """Pick the first reasonable line as a page title."""
    if not text:
        return f"Seite {page_number}"
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.split("\n")]
    lines = [line for line in lines if line]
    if not lines:
        return f"Seite {page_number}"

    # Prefer the first line that looks like a heading.
    for candidate in lines[:5]:
        if 4 <= len(candidate) <= 120:
            return candidate
    return f"Seite {page_number}"


def _pil_to_png_bytes(img: Image.Image) -> Tuple[bytes, str, int, int]:
    """Convert a PIL image to PNG bytes and a data URI."""
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    data = buffer.getvalue()
    b64 = base64.b64encode(data).decode("utf-8")
    data_uri = f"data:image/png;base64,{b64}"
    width, height = img.size
    return data, data_uri, width, height


def _render_page_images(pdf_path: str, render_pages: int, render_dpi: int) -> Dict[int, Dict[str, Any]]:
    """
    Render the first N pages to PNG images.

    Rendering all pages can be expensive; we cap the number of VLM pages.
    """
    if render_pages <= 0:
        return {}
    rendered: Dict[int, Dict[str, Any]] = {}
    try:
        images = convert_from_path(
            pdf_path,
            dpi=render_dpi,
            fmt="png",
            first_page=1,
            last_page=render_pages,
        )
        for idx, img in enumerate(images, start=1):
            data, data_uri, width, height = _pil_to_png_bytes(img)
            rendered[idx] = {
                "image_bytes": data,
                "data_uri": data_uri,
                "content_type": "image/png",
                "width_px": width,
                "height_px": height,
            }
    except Exception as exc:
        print(f"[PDF Parser] Page rendering failed: {exc}")
    return rendered


def parse_pdf(
    file_path: str,
    render_dpi: int = PDF_RENDER_DPI,
    max_pages: int = PDF_VLM_MAX_PAGES,
    max_targets: int = PDF_VLM_MAX_TARGETS,
) -> Tuple[List[Dict[str, Any]], int, int]:
    """
    Parse PDF pages into slide-like structures.

    Returns:
    - slides: list of slide/page dictionaries compatible with html_builder
    - total_pages: total number of pages in the PDF
    - rendered_pages: number of pages successfully rendered for VLM
    """
    reader = PdfReader(file_path, strict=False)
    total_pages = len(reader.pages)
    render_cap = max(max_targets * 2, max_targets)
    render_limit = min(total_pages, max_pages, render_cap)
    rendered_pages = _render_page_images(file_path, render_limit, render_dpi)

    slides: List[Dict[str, Any]] = []

    for page_number, page in enumerate(reader.pages, start=1):
        raw_text = _normalize_text(page.extract_text() or "")
        paragraphs = _split_paragraphs(raw_text)
        title = _derive_title(raw_text, page_number)

        slide: Dict[str, Any] = {
            "slide_number": page_number,
            "title": title,
            "text_content": [{"type": "text", "content": p} for p in paragraphs],
            "images": [],
            "shapes": [],
            "speaker_notes": None,
            "has_table": False,
            "has_chart": False,
            "complexity": "complex" if len(paragraphs) < 2 else "simple",
        }

        rendered = rendered_pages.get(page_number)
        if rendered:
            # Treat the rendered page as a visual diagram for VLM summaries.
            slide["is_visual_diagram"] = True
            slide["images"].append(
                {
                    "type": "image",
                    "image_bytes": rendered["image_bytes"],
                    "data_uri": rendered["data_uri"],
                    "content_type": rendered["content_type"],
                    "extension": "png",
                    "width_inches": 0,
                    "height_inches": 0,
                    "existing_alt_text": None,
                    "alt_text": f"Seite {page_number}",
                    "slide_number": page_number,
                }
            )

        slides.append(slide)

    return slides, total_pages, len(rendered_pages)
