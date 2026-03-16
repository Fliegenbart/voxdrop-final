from __future__ import annotations

import re


INTERNAL_LINE_PATTERNS = [
    re.compile(r"^\s*(todo|fixme|hack|xxx|note)\s*[:：]", re.IGNORECASE),
    re.compile(r"\bfalls diese folie gewünscht\b", re.IGNORECASE),
    re.compile(r"\b(wird|werden)\s+noch\s+(ue|ü)berarbeitet\b", re.IGNORECASE),
    re.compile(r"\b(wird|werden)\s+noch\s+angepasst\b", re.IGNORECASE),
    re.compile(r"\bnoch\s+in\s+arbeit\b", re.IGNORECASE),
    re.compile(r"\bplatzhalter\s+f(ue|ü)r\b", re.IGNORECASE),
    re.compile(r"\banmerkung\s+f(ue|ü)r\b", re.IGNORECASE),
    re.compile(r"\bhinweis\s+f(ue|ü)r\b", re.IGNORECASE),
    re.compile(r"\bhinweis:\s*diese folie\b", re.IGNORECASE),
    re.compile(r"\[(intern|entwurf|draft|wip)\]", re.IGNORECASE),
]


INTERNAL_SENTENCE_PATTERNS = [
    re.compile(r"\bfolie\b.*\b(angepasst|ueberarbeitet|überarbeitet|ergänzt)\b", re.IGNORECASE),
    re.compile(r"\b(vorlage|layout|layouter|designer|grafiker)\b", re.IGNORECASE),
]
