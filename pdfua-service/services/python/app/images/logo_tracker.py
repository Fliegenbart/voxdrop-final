from __future__ import annotations

import hashlib
from typing import Dict, List, Optional


def _hash_image(image_bytes: Optional[bytes]) -> Optional[str]:
    if not image_bytes:
        return None
    digest = hashlib.sha1(image_bytes).hexdigest()
    return digest


def build_image_index(slides: List[dict]) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for slide in slides:
        for img in slide.get("images") or []:
            digest = _hash_image(img.get("image_bytes"))
            if not digest:
                continue
            img["_hash"] = digest
            counts[digest] = counts.get(digest, 0) + 1
    return counts
