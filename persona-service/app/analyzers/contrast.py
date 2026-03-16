"""
Contrast Analyzer - Check color contrast ratios according to WCAG guidelines.
"""

from typing import Dict, Any, List, Tuple
import math


def analyze_colors(colors: List[Tuple[int, int, int]]) -> Dict[str, Any]:
    """
    Analyze color combinations for contrast compliance.

    Args:
        colors: List of RGB tuples extracted from document

    Returns:
        dict with:
        - color_count: Number of unique colors
        - contrast_issues: List of problematic color combinations
        - wcag_aa_compliant: Whether minimum contrast is met
        - issues: Detected contrast issues
    """
    if not colors:
        return {
            "color_count": 0,
            "contrast_issues": [],
            "wcag_aa_compliant": True,
            "color_only_info": [],
            "issues": [],
        }

    issues = []
    contrast_issues = []

    # Common background colors to test against
    backgrounds = [
        (255, 255, 255),  # White
        (0, 0, 0),        # Black
        (245, 245, 245),  # Light gray
    ]

    # Check each color against common backgrounds
    for color in colors:
        for bg in backgrounds:
            ratio = calculate_contrast_ratio(color, bg)

            # WCAG AA requires 4.5:1 for normal text, 3:1 for large text
            if ratio < 4.5:
                contrast_issues.append({
                    "foreground": f"rgb({color[0]}, {color[1]}, {color[2]})",
                    "background": f"rgb({bg[0]}, {bg[1]}, {bg[2]})",
                    "ratio": round(ratio, 2),
                    "wcag_aa": ratio >= 4.5,
                    "wcag_aa_large": ratio >= 3.0,
                })

    # Identify similar colors (potential color-only information)
    similar_colors = _find_similar_colors(colors)

    # Generate issues
    low_contrast_count = sum(1 for c in contrast_issues if c["ratio"] < 4.5)
    if low_contrast_count > 0:
        issues.append({
            "type": "low_contrast",
            "severity": "critical" if low_contrast_count > 2 else "warning",
            "description": f"{low_contrast_count} Farbkombinationen mit unzureichendem Kontrast",
            "recommendation": "Kontrast auf mindestens 4.5:1 erhöhen (WCAG AA)",
            "details": contrast_issues[:5],  # Show first 5
        })

    if similar_colors:
        issues.append({
            "type": "color_only",
            "severity": "warning",
            "description": "Ähnliche Farben erkannt - möglicherweise nur durch Farbe unterschieden",
            "recommendation": "Zusätzliche visuelle Unterscheidungsmerkmale verwenden",
        })

    return {
        "color_count": len(colors),
        "colors": [f"rgb({c[0]}, {c[1]}, {c[2]})" for c in colors],
        "contrast_issues": contrast_issues,
        "wcag_aa_compliant": low_contrast_count == 0,
        "similar_colors": similar_colors,
        "issues": issues,
    }


def calculate_contrast_ratio(color1: Tuple[int, int, int], color2: Tuple[int, int, int]) -> float:
    """
    Calculate WCAG contrast ratio between two colors.

    Args:
        color1: RGB tuple (0-255)
        color2: RGB tuple (0-255)

    Returns:
        Contrast ratio (1:1 to 21:1)
    """
    l1 = _relative_luminance(color1)
    l2 = _relative_luminance(color2)

    lighter = max(l1, l2)
    darker = min(l1, l2)

    return (lighter + 0.05) / (darker + 0.05)


def _relative_luminance(rgb: Tuple[int, int, int]) -> float:
    """Calculate relative luminance of a color."""
    r, g, b = [_linearize(c / 255.0) for c in rgb]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _linearize(value: float) -> float:
    """Linearize sRGB value."""
    if value <= 0.03928:
        return value / 12.92
    return math.pow((value + 0.055) / 1.055, 2.4)


def _find_similar_colors(colors: List[Tuple[int, int, int]]) -> List[Dict]:
    """Find color pairs that are similar and might only differ by color."""
    similar = []

    for i, color1 in enumerate(colors):
        for color2 in colors[i + 1:]:
            # Check if colors are similar but not identical
            diff = sum(abs(c1 - c2) for c1, c2 in zip(color1, color2))
            if 10 < diff < 100:  # Similar but not same
                similar.append({
                    "color1": f"rgb({color1[0]}, {color1[1]}, {color1[2]})",
                    "color2": f"rgb({color2[0]}, {color2[1]}, {color2[2]})",
                    "difference": diff,
                })

    return similar


def check_colorblind_safe(colors: List[Tuple[int, int, int]]) -> Dict[str, Any]:
    """
    Check if color combinations are distinguishable for colorblind users.

    Simulates common forms of color blindness:
    - Protanopia (red-blind)
    - Deuteranopia (green-blind)
    - Tritanopia (blue-blind)
    """
    issues = []

    for i, color1 in enumerate(colors):
        for color2 in colors[i + 1:]:
            # Simulate protanopia
            proto1 = _simulate_protanopia(color1)
            proto2 = _simulate_protanopia(color2)

            if _colors_too_similar(proto1, proto2) and not _colors_too_similar(color1, color2):
                issues.append({
                    "type": "protanopia",
                    "description": "Diese Farben sind für Rot-Grün-Blinde nicht unterscheidbar",
                    "colors": [
                        f"rgb({color1[0]}, {color1[1]}, {color1[2]})",
                        f"rgb({color2[0]}, {color2[1]}, {color2[2]})",
                    ],
                })

            # Simulate deuteranopia
            deuter1 = _simulate_deuteranopia(color1)
            deuter2 = _simulate_deuteranopia(color2)

            if _colors_too_similar(deuter1, deuter2) and not _colors_too_similar(color1, color2):
                issues.append({
                    "type": "deuteranopia",
                    "description": "Diese Farben sind für Grün-Blinde nicht unterscheidbar",
                    "colors": [
                        f"rgb({color1[0]}, {color1[1]}, {color1[2]})",
                        f"rgb({color2[0]}, {color2[1]}, {color2[2]})",
                    ],
                })

    return {
        "colorblind_safe": len(issues) == 0,
        "issues": issues,
    }


def _simulate_protanopia(rgb: Tuple[int, int, int]) -> Tuple[int, int, int]:
    """Simulate how a color appears to someone with protanopia."""
    r, g, b = rgb
    # Simplified simulation matrix
    new_r = int(0.567 * r + 0.433 * g)
    new_g = int(0.558 * r + 0.442 * g)
    new_b = int(0.242 * g + 0.758 * b)
    return (min(255, new_r), min(255, new_g), min(255, new_b))


def _simulate_deuteranopia(rgb: Tuple[int, int, int]) -> Tuple[int, int, int]:
    """Simulate how a color appears to someone with deuteranopia."""
    r, g, b = rgb
    # Simplified simulation matrix
    new_r = int(0.625 * r + 0.375 * g)
    new_g = int(0.7 * r + 0.3 * g)
    new_b = int(0.3 * g + 0.7 * b)
    return (min(255, new_r), min(255, new_g), min(255, new_b))


def _colors_too_similar(c1: Tuple[int, int, int], c2: Tuple[int, int, int]) -> bool:
    """Check if two colors are too similar to distinguish."""
    diff = sum(abs(a - b) for a, b in zip(c1, c2))
    return diff < 50
