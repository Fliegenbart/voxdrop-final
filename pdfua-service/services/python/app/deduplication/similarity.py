import re
from typing import Set


WORD_RE = re.compile(r"[A-Za-z0-9ÄÖÜäöüß]+", re.UNICODE)


def tokenize(text: str) -> Set[str]:
    if not text:
        return set()
    tokens = WORD_RE.findall(text.lower())
    return set(tokens)


def jaccard_similarity(a: str, b: str) -> float:
    ta = tokenize(a)
    tb = tokenize(b)
    if not ta or not tb:
        return 0.0
    intersection = len(ta & tb)
    union = len(ta | tb)
    return intersection / union if union else 0.0


def overlap_ratio(a: str, b: str) -> float:
    ta = tokenize(a)
    tb = tokenize(b)
    if not ta or not tb:
        return 0.0
    intersection = len(ta & tb)
    return intersection / max(len(ta), len(tb))


def is_redundant(a: str, b: str, threshold: float = 0.6) -> bool:
    if not a or not b:
        return False
    return overlap_ratio(a, b) >= threshold
