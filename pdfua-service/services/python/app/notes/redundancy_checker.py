from __future__ import annotations

import re
from typing import List

from ..deduplication.similarity import overlap_ratio


SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")


def split_sentences(text: str) -> List[str]:
    if not text:
        return []
    sentences = [s.strip() for s in SENTENCE_SPLIT_RE.split(text) if s.strip()]
    return sentences


def is_redundant_sentence(sentence: str, context: str, threshold: float = 0.7) -> bool:
    if not sentence or not context:
        return False
    return overlap_ratio(sentence, context) >= threshold
