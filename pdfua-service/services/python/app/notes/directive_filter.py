from __future__ import annotations

import re
from typing import List


DIRECTIVE_PATTERNS = [
    re.compile(r"^\s*[→\-–>]+\s*", re.UNICODE),
    re.compile(r"\bbmas[-\s]?frage\b", re.IGNORECASE),
    re.compile(r"\bfrage:\b", re.IGNORECASE),
    re.compile(r"\bhinweis:\b", re.IGNORECASE),
    re.compile(r"\banmerkung:\b", re.IGNORECASE),
]


def strip_directives(lines: List[str]) -> List[str]:
    cleaned: List[str] = []
    for line in lines:
        value = line.strip()
        if not value:
            continue
        if "bmas" in value.lower():
            cleaned.append(value)
            continue
        if any(pattern.search(value) for pattern in DIRECTIVE_PATTERNS):
            continue
        cleaned.append(value)
    return cleaned
