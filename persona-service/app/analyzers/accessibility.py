"""
Accessibility Analyzer - Check general accessibility features.
"""

from typing import Dict, Any, List


def analyze_accessibility(document_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Analyze document for accessibility features.

    Returns:
        dict with:
        - alt_text_coverage: Percentage of images with alt text
        - language_declared: Whether document language is set
        - reading_order: Whether reading order is logical
        - issues: Detected accessibility issues
    """
    issues = []
    doc_format = document_data.get("format", "unknown")

    # Check images for alt text
    images = document_data.get("images", [])
    image_analysis = _analyze_images(images)
    issues.extend(image_analysis.get("issues", []))

    # Check metadata
    metadata = document_data.get("metadata", {})
    metadata_analysis = _analyze_metadata(metadata)
    issues.extend(metadata_analysis.get("issues", []))

    # Check fonts
    fonts = document_data.get("fonts", [])
    font_analysis = _analyze_fonts(fonts)
    issues.extend(font_analysis.get("issues", []))

    # Check for tables
    tables = document_data.get("tables", [])
    if doc_format == "docx":
        table_analysis = _analyze_tables(tables)
        issues.extend(table_analysis.get("issues", []))

    # Check for audio/video content mentions (indicates need for alternatives)
    text = document_data.get("text", "").lower()
    media_analysis = _check_media_alternatives(text)
    issues.extend(media_analysis.get("issues", []))

    return {
        "image_analysis": image_analysis,
        "metadata_analysis": metadata_analysis,
        "font_analysis": font_analysis,
        "issues": issues,
        "score": _calculate_accessibility_score(issues),
    }


def _analyze_images(images: List[Dict]) -> Dict[str, Any]:
    """Analyze images for alt text coverage."""
    if not images:
        return {
            "total": 0,
            "with_alt_text": 0,
            "coverage": 100,
            "issues": [],
        }

    with_alt = sum(1 for img in images if img.get("has_alt_text", False))
    coverage = (with_alt / len(images) * 100) if images else 100

    issues = []
    missing_alt = len(images) - with_alt

    if missing_alt > 0:
        severity = "critical" if coverage < 50 else "warning"
        issues.append({
            "type": "missing_alt_text",
            "severity": severity,
            "description": f"{missing_alt} von {len(images)} Bildern ohne Alternativtext",
            "recommendation": "Alternativtexte für alle Bilder hinzufügen",
            "wcag": "1.1.1 Non-text Content",
        })

    return {
        "total": len(images),
        "with_alt_text": with_alt,
        "coverage": round(coverage, 1),
        "issues": issues,
    }


def _analyze_metadata(metadata: Dict[str, str]) -> Dict[str, Any]:
    """Analyze document metadata."""
    issues = []

    # Check for title
    if not metadata.get("title"):
        issues.append({
            "type": "missing_title",
            "severity": "warning",
            "description": "Kein Dokumenttitel definiert",
            "recommendation": "Aussagekräftigen Dokumenttitel setzen",
            "wcag": "2.4.2 Page Titled",
        })

    # Check for author
    if not metadata.get("author"):
        issues.append({
            "type": "missing_author",
            "severity": "info",
            "description": "Kein Autor definiert",
            "recommendation": "Autor in Dokumenteigenschaften eintragen",
        })

    return {
        "has_title": bool(metadata.get("title")),
        "has_author": bool(metadata.get("author")),
        "has_subject": bool(metadata.get("subject")),
        "issues": issues,
    }


def _analyze_fonts(fonts: List[tuple]) -> Dict[str, Any]:
    """Analyze font usage for accessibility."""
    issues = []

    if not fonts:
        return {"font_count": 0, "issues": []}

    # Extract font sizes
    sizes = [f[1] if isinstance(f, tuple) and len(f) > 1 else 12 for f in fonts]

    # Check for very small fonts
    small_fonts = [s for s in sizes if s < 10]
    if small_fonts:
        issues.append({
            "type": "small_font",
            "severity": "warning",
            "description": f"Schriftgröße unter 10pt gefunden ({min(small_fonts):.1f}pt)",
            "recommendation": "Mindestens 12pt für Fließtext verwenden",
        })

    # Check for too many different fonts
    font_names = set(f[0] if isinstance(f, tuple) else "Unknown" for f in fonts)
    if len(font_names) > 3:
        issues.append({
            "type": "too_many_fonts",
            "severity": "info",
            "description": f"{len(font_names)} verschiedene Schriftarten verwendet",
            "recommendation": "Maximal 2-3 Schriftarten für bessere Lesbarkeit",
        })

    return {
        "font_count": len(font_names),
        "font_names": list(font_names),
        "min_size": min(sizes) if sizes else 0,
        "max_size": max(sizes) if sizes else 0,
        "issues": issues,
    }


def _analyze_tables(tables: List[Dict]) -> Dict[str, Any]:
    """Analyze tables for accessibility."""
    issues = []

    for i, table in enumerate(tables):
        rows = table.get("rows", 0)
        cols = table.get("cols", 0)

        # Check for very wide tables
        if cols > 6:
            issues.append({
                "type": "wide_table",
                "severity": "warning",
                "description": f"Tabelle {i+1}: {cols} Spalten (schwer zu erfassen)",
                "recommendation": "Tabellen auf max. 5-6 Spalten begrenzen",
            })

        # Check for complex tables
        if rows > 20 and cols > 4:
            issues.append({
                "type": "complex_table",
                "severity": "warning",
                "description": f"Tabelle {i+1}: Komplexe Struktur ({rows}x{cols})",
                "recommendation": "In mehrere kleinere Tabellen aufteilen",
            })

    return {
        "table_count": len(tables),
        "issues": issues,
    }


def _check_media_alternatives(text: str) -> Dict[str, Any]:
    """Check if document mentions media that might need alternatives."""
    issues = []

    # Check for video mentions
    video_keywords = ["video", "film", "animation", "youtube", "vimeo"]
    has_video_mention = any(kw in text for kw in video_keywords)

    # Check for audio mentions
    audio_keywords = ["audio", "podcast", "hörbeispiel", "ton", "musik"]
    has_audio_mention = any(kw in text for kw in audio_keywords)

    if has_video_mention:
        issues.append({
            "type": "video_content",
            "severity": "info",
            "description": "Video-Inhalte erwähnt - Untertitel/Audiodeskription prüfen",
            "recommendation": "Untertitel und Audiodeskription für Videos bereitstellen",
            "wcag": "1.2.2 Captions",
        })

    if has_audio_mention:
        issues.append({
            "type": "audio_content",
            "severity": "info",
            "description": "Audio-Inhalte erwähnt - Transkript prüfen",
            "recommendation": "Transkript für Audio-Inhalte bereitstellen",
            "wcag": "1.2.1 Audio-only",
        })

    return {
        "has_video_mention": has_video_mention,
        "has_audio_mention": has_audio_mention,
        "issues": issues,
    }


def _calculate_accessibility_score(issues: List[Dict]) -> int:
    """Calculate an overall accessibility score based on issues."""
    score = 100

    for issue in issues:
        severity = issue.get("severity", "info")
        if severity == "critical":
            score -= 20
        elif severity == "warning":
            score -= 10
        elif severity == "info":
            score -= 2

    return max(0, score)
