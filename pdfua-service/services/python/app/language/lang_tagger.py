from __future__ import annotations

import re
from pathlib import Path
from html import escape as html_escape
from typing import Dict, List, Tuple


DEFAULT_TERMS: Dict[str, str] = {
    # English terms
    "DevSecOps": "en-US",
    "Change-Management": "en-US",
    "Shared Service": "en-US",
    "Shared Services": "en-US",
    "Release Train": "en-US",
    "Go-Live": "en-US",
    "Solution Management": "en-US",
    "Single Point of Contact": "en-US",
    "Cloud": "en-US",
    "Gateway": "en-US",
    "Sprint": "en-US",
    "Scrum": "en-US",
    "MVP": "en-US",
    "ART": "en-US",
    "Preprocessing": "en-US",
    "Workflow": "en-US",
    "Design System": "en-US",
    "UX": "en-US",
    "AI": "en-US",
    # German acronyms (do not tag)
    "DRV": "de-DE",
    "BMAS": "de-DE",
    "NzV": "de-DE",
    "LEM": "de-DE",
    "KRITIS": "de-DE",
    "RZ-DRV": "de-DE",
}


def _normalize_lang(value: str) -> str:
    lowered = value.strip().lower()
    if lowered in {"en", "en-us", "en_us"}:
        return "en-US"
    if lowered in {"de", "de-de", "de_de"}:
        return "de-DE"
    return value.strip()


def _load_terms() -> Dict[str, str]:
    terms = dict(DEFAULT_TERMS)
    path = Path(__file__).with_name("dictionary.yaml")
    if not path.exists():
        return terms
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            key = key.strip().strip('"').strip("'")
            value = value.strip().strip('"').strip("'")
            if not key or not value:
                continue
            terms[key] = _normalize_lang(value)
    except Exception:
        return terms
    return terms


TERMS = _load_terms()


def _build_patterns() -> List[Tuple[re.Pattern, str]]:
    patterns: List[Tuple[re.Pattern, str]] = []
    for term, lang in TERMS.items():
        if lang != "en-US":
            continue
        escaped = re.escape(term)
        escaped = escaped.replace(r"\-", r"[-–—]")
        escaped = escaped.replace(r"\ ", r"\\s+")
        flags = re.IGNORECASE if not term.isupper() else 0
        pattern = re.compile(rf"\b{escaped}\b", flags)
        patterns.append((pattern, lang))
    # Longest first to avoid partial overlaps
    patterns.sort(key=lambda item: len(item[0].pattern), reverse=True)
    return patterns


PATTERNS = _build_patterns()


def apply_language_tags(text: str) -> str:
    """
    Wrap known English terms in <span lang="en-US">...</span>.
    Returns HTML-safe string.
    """
    if not text:
        return ""

    placeholders: Dict[str, str] = {}
    counter = 0
    temp = text

    for pattern, lang in PATTERNS:
        def _repl(match: re.Match) -> str:
            nonlocal counter
            token = match.group(0)
            key = f"@@LANG{counter}@@"
            placeholders[key] = f'<span lang="{lang}">{html_escape(token)}</span>'
            counter += 1
            return key

        temp = pattern.sub(_repl, temp)

    escaped = html_escape(temp)
    for key, value in placeholders.items():
        escaped = escaped.replace(key, value)
    return escaped
