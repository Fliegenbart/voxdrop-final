from __future__ import annotations

from typing import Dict, Optional


GENERIC_ALT = {
    "image",
    "picture",
    "bild",
    "grafik",
    "abbildung",
}


def _area_ratio(img: Dict[str, object]) -> float:
    area = img.get("area_norm")
    if area is not None:
        try:
            return float(area)
        except Exception:
            return 0.0
    try:
        return float(img.get("width_norm") or 0.0) * float(img.get("height_norm") or 0.0)
    except Exception:
        return 0.0


def classify_decorative(
    img: Dict[str, object],
    image_counts: Optional[Dict[str, int]] = None,
    slide_number: int = 0,
) -> Optional[str]:
    """
    Return a reason string if the image should be treated as decorative.
    """
    alt_text = str(img.get("existing_alt_text") or "").strip().lower()
    area = _area_ratio(img)
    top = float(img.get("top_norm") or 0.0)
    left = float(img.get("left_norm") or 0.0)
    width = float(img.get("width_norm") or 0.0)
    height = float(img.get("height_norm") or 0.0)
    generic_or_empty_alt = not alt_text or alt_text in GENERIC_ALT

    if alt_text in GENERIC_ALT:
        return "generic-alt-text"

    # Full-slide or background images
    if area >= 0.85:
        return "background"

    # Repeated small images in corners -> logos
    img_hash = img.get("_hash")
    if image_counts and img_hash:
        count = image_counts.get(img_hash, 0)
        if count >= 3 and area <= 0.08 and (top <= 0.15 or top >= 0.85 or left <= 0.1):
            if slide_number == 1:
                return None
            return "repeated-logo"

    # Small icons next to text blocks
    if area <= 0.03 and width <= 0.18 and height <= 0.18 and generic_or_empty_alt:
        return "small-icon"

    # Corner branding or decorative badges on content slides.
    if area <= 0.06 and width <= 0.24 and height <= 0.18 and generic_or_empty_alt:
        if top <= 0.18 and (left <= 0.16 or left >= 0.74):
            return "corner-branding"

    return None


def apply_decorative_detection(slide: Dict[str, object], image_counts: Dict[str, int]) -> None:
    for img in slide.get("images") or []:
        reason = classify_decorative(img, image_counts, int(slide.get("slide_number") or 0))
        if reason:
            img["decorative"] = True
            img["decorative_reason"] = reason
