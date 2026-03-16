"""
Structure Analyzer - Analyze document structure and organization.
"""

from typing import Dict, Any, List


def analyze_structure(document_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Analyze document structure.

    Returns:
        dict with:
        - heading_hierarchy: Analysis of heading structure
        - paragraph_stats: Paragraph length statistics
        - has_toc: Whether document appears to have table of contents
        - list_usage: Analysis of list usage
        - issues: Detected structural issues
    """
    headings = document_data.get("headings", [])
    text = document_data.get("text", "")
    doc_format = document_data.get("format", "unknown")

    issues = []

    # Analyze heading hierarchy
    heading_analysis = _analyze_headings(headings)
    issues.extend(heading_analysis.get("issues", []))

    # Analyze paragraph structure
    paragraph_analysis = _analyze_paragraphs(document_data)
    issues.extend(paragraph_analysis.get("issues", []))

    # Check for table of contents
    has_toc = _detect_toc(text, headings)

    # Analyze list usage
    list_analysis = _analyze_lists(document_data)

    # Check overall structure
    if len(headings) == 0 and len(text) > 500:
        issues.append({
            "type": "no_headings",
            "severity": "critical",
            "description": "Keine Überschriften gefunden",
            "recommendation": "Überschriften hinzufügen um den Text zu strukturieren",
        })

    # Check for very long unbroken text
    paragraphs = text.split("\n\n")
    long_blocks = [p for p in paragraphs if len(p.split()) > 150]
    if long_blocks:
        issues.append({
            "type": "long_text_blocks",
            "severity": "warning",
            "description": f"{len(long_blocks)} Textblöcke mit 150+ Wörtern",
            "recommendation": "Lange Absätze aufteilen und mit Zwischenüberschriften gliedern",
        })

    return {
        "heading_count": len(headings),
        "heading_hierarchy": heading_analysis,
        "paragraph_stats": paragraph_analysis,
        "has_toc": has_toc,
        "list_usage": list_analysis,
        "issues": issues,
    }


def _analyze_headings(headings: List[Dict]) -> Dict[str, Any]:
    """Analyze heading hierarchy and structure."""
    if not headings:
        return {
            "levels_used": [],
            "hierarchy_valid": False,
            "issues": [],
        }

    levels_used = sorted(set(h.get("level", 1) for h in headings))
    issues = []

    # Check for skipped heading levels (e.g., H1 -> H3)
    for i in range(len(levels_used) - 1):
        if levels_used[i + 1] - levels_used[i] > 1:
            issues.append({
                "type": "skipped_heading_level",
                "severity": "warning",
                "description": f"Übersprungene Überschriftenebene: H{levels_used[i]} → H{levels_used[i+1]}",
                "recommendation": "Überschriftenhierarchie korrigieren",
            })

    # Check if document starts with H1
    if headings and headings[0].get("level", 1) != 1:
        issues.append({
            "type": "no_h1",
            "severity": "warning",
            "description": "Dokument beginnt nicht mit Hauptüberschrift (H1)",
            "recommendation": "Hauptüberschrift am Anfang hinzufügen",
        })

    # Check for multiple H1s
    h1_count = sum(1 for h in headings if h.get("level") == 1)
    if h1_count > 1:
        issues.append({
            "type": "multiple_h1",
            "severity": "info",
            "description": f"{h1_count} Hauptüberschriften (H1) gefunden",
            "recommendation": "Nur eine Hauptüberschrift verwenden",
        })

    return {
        "levels_used": levels_used,
        "hierarchy_valid": len(issues) == 0,
        "h1_count": h1_count,
        "total_headings": len(headings),
        "issues": issues,
    }


def _analyze_paragraphs(document_data: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze paragraph structure."""
    text = document_data.get("text", "")
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]

    if not paragraphs:
        return {
            "count": 0,
            "avg_length": 0,
            "max_length": 0,
            "issues": [],
        }

    # Calculate word counts
    word_counts = [len(p.split()) for p in paragraphs]
    avg_length = sum(word_counts) / len(word_counts)
    max_length = max(word_counts)

    issues = []

    # Check for very long paragraphs
    long_paragraphs = sum(1 for wc in word_counts if wc > 100)
    if long_paragraphs > 0:
        issues.append({
            "type": "long_paragraphs",
            "severity": "warning",
            "description": f"{long_paragraphs} Absätze mit 100+ Wörtern",
            "recommendation": "Absätze auf 50-80 Wörter begrenzen",
        })

    # Check if paragraphs are too uniform (wall of text)
    if len(word_counts) > 3:
        variance = sum((wc - avg_length) ** 2 for wc in word_counts) / len(word_counts)
        if variance < 100 and avg_length > 50:
            issues.append({
                "type": "uniform_paragraphs",
                "severity": "info",
                "description": "Gleichförmige Absatzstruktur erkannt",
                "recommendation": "Textblöcke mit Listen, Zitaten oder Grafiken auflockern",
            })

    return {
        "count": len(paragraphs),
        "avg_length": round(avg_length, 1),
        "max_length": max_length,
        "issues": issues,
    }


def _detect_toc(text: str, headings: List[Dict]) -> bool:
    """Detect if document has a table of contents."""
    toc_indicators = [
        "inhaltsverzeichnis",
        "inhalt",
        "table of contents",
        "gliederung",
        "übersicht",
    ]
    text_lower = text.lower()
    return any(indicator in text_lower for indicator in toc_indicators)


def _analyze_lists(document_data: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze list usage in document."""
    lists = document_data.get("lists", [])
    text = document_data.get("text", "")

    # Detect bullet points and numbered lists in text
    bullet_patterns = ["•", "●", "○", "■", "◆", "-", "*"]
    has_bullets = any(p in text for p in bullet_patterns)

    # Check for numbered lists
    import re
    numbered_pattern = r'^\s*\d+[.)]\s'
    has_numbered = bool(re.search(numbered_pattern, text, re.MULTILINE))

    return {
        "list_count": len(lists) if lists else 0,
        "has_bullets": has_bullets,
        "has_numbered": has_numbered,
        "uses_lists": has_bullets or has_numbered or len(lists) > 0,
    }
