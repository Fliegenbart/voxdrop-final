from __future__ import annotations

import hashlib
from typing import List

from app.pipeline.models import ScriptSegment


HOST_PREFIXES = [
    "Also,",
    "Okay,",
    "Kurz gesagt,",
    "Lass uns mal schauen,",
]

EXPERT_PREFIXES = [
    "Genau,",
    "Guter Punkt,",
    "Wenn man so will,",
    "Interessant ist dabei:",
]

NARRATOR_PREFIXES = [
    "Also,",
    "Okay,",
    "Kurz gesagt,",
    "Lass uns mal schauen,",
    "Wichtig ist:",
    "Unterm Strich:",
]


def add_light_disfluencies(segments: List[ScriptSegment]) -> List[ScriptSegment]:
    """
    Add a few controlled, low-risk disfluencies to improve natural flow.
    We keep it conservative (mostly sentence starters) to avoid changing meaning.
    """
    out: List[ScriptSegment] = []
    for seg in segments:
        text = seg.text.strip()
        if not text:
            out.append(seg)
            continue

        prefix = _choose_prefix(seg.speaker, text)
        if prefix and not _already_has_prefix(text):
            text = f"{prefix} {text}"

        out.append(seg.model_copy(update={"text": text}))
    return out


def _already_has_prefix(text: str) -> bool:
    lowered = text.lower()
    starters = ["also", "okay", "kurz gesagt", "lass uns", "genau", "guter punkt", "wenn man so will", "interessant ist"]
    return any(lowered.startswith(s) for s in starters)


def _choose_prefix(speaker: str, text: str) -> str:
    # Deterministic: hash-based "randomness".
    h = hashlib.sha1(text.encode("utf-8")).digest()
    dice = h[0] / 255.0

    if speaker == "host" and dice < 0.22:
        return HOST_PREFIXES[h[1] % len(HOST_PREFIXES)]
    if speaker == "expert" and dice < 0.18:
        return EXPERT_PREFIXES[h[1] % len(EXPERT_PREFIXES)]
    if speaker == "narrator" and dice < 0.20:
        return NARRATOR_PREFIXES[h[1] % len(NARRATOR_PREFIXES)]
    return ""
