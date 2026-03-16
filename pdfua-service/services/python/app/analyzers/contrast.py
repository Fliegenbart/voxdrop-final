"""
WCAG Contrast Ratio Calculator and Color Fix Suggestions.
"""

from typing import Tuple, Dict, Any, Optional
import math


def calculate_luminance(rgb: Tuple[int, int, int]) -> float:
    """
    Calculate relative luminance according to WCAG 2.1.

    Args:
        rgb: Tuple of (R, G, B) values from 0-255

    Returns:
        Relative luminance value from 0 to 1
    """
    r, g, b = [x / 255.0 for x in rgb]

    r = r / 12.92 if r <= 0.03928 else ((r + 0.055) / 1.055) ** 2.4
    g = g / 12.92 if g <= 0.03928 else ((g + 0.055) / 1.055) ** 2.4
    b = b / 12.92 if b <= 0.03928 else ((b + 0.055) / 1.055) ** 2.4

    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def calculate_contrast_ratio(
    fg: Tuple[int, int, int],
    bg: Tuple[int, int, int]
) -> float:
    """
    Calculate WCAG 2.1 contrast ratio between two colors.

    Args:
        fg: Foreground color as (R, G, B) tuple
        bg: Background color as (R, G, B) tuple

    Returns:
        Contrast ratio from 1.0 to 21.0
    """
    lum1 = calculate_luminance(fg)
    lum2 = calculate_luminance(bg)

    lighter = max(lum1, lum2)
    darker = min(lum1, lum2)

    return (lighter + 0.05) / (darker + 0.05)


def check_wcag(ratio: float) -> Dict[str, bool]:
    """
    Check WCAG compliance levels for a given contrast ratio.

    Args:
        ratio: Contrast ratio value

    Returns:
        Dict with compliance status for each WCAG level
    """
    return {
        'aa_large': ratio >= 3.0,      # AA for large text (18pt+ or 14pt+ bold)
        'aa_normal': ratio >= 4.5,     # AA for normal text
        'aaa_large': ratio >= 4.5,     # AAA for large text
        'aaa_normal': ratio >= 7.0,    # AAA for normal text
    }


def get_wcag_level(ratio: float) -> str:
    """
    Get the highest WCAG level achieved.

    Args:
        ratio: Contrast ratio value

    Returns:
        String describing the achieved level
    """
    if ratio >= 7.0:
        return "AAA"
    elif ratio >= 4.5:
        return "AA"
    elif ratio >= 3.0:
        return "AA (nur grosse Schrift)"
    else:
        return "Nicht bestanden"


def analyze_color_pair(
    fg: Dict[str, Any],
    bg: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Analyze a foreground/background color pair.

    Args:
        fg: Foreground color dict with r, g, b keys
        bg: Background color dict with r, g, b keys

    Returns:
        Analysis result with ratio, compliance, and suggestions
    """
    fg_rgb = (fg['r'], fg['g'], fg['b'])
    bg_rgb = (bg['r'], bg['g'], bg['b'])

    ratio = calculate_contrast_ratio(fg_rgb, bg_rgb)
    wcag = check_wcag(ratio)

    result = {
        'ratio': round(ratio, 2),
        'wcag': wcag,
        'level': get_wcag_level(ratio),
        'passes_aa': wcag['aa_normal'],
        'passes_aaa': wcag['aaa_normal'],
    }

    # Add suggestions if not passing AA
    if not wcag['aa_normal']:
        result['suggestions'] = {
            'aa': suggest_better_contrast(fg_rgb, bg_rgb, target_ratio=4.5),
            'aaa': suggest_better_contrast(fg_rgb, bg_rgb, target_ratio=7.0),
        }

    return result


def suggest_better_contrast(
    fg: Tuple[int, int, int],
    bg: Tuple[int, int, int],
    target_ratio: float = 4.5
) -> Dict[str, Any]:
    """
    Suggest a modified foreground color to achieve target contrast ratio.

    Tries to maintain the hue while adjusting brightness.

    Args:
        fg: Foreground color as (R, G, B) tuple
        bg: Background color as (R, G, B) tuple
        target_ratio: Target contrast ratio (default 4.5 for AA)

    Returns:
        Dict with suggested color and achieved ratio
    """
    current_ratio = calculate_contrast_ratio(fg, bg)

    if current_ratio >= target_ratio:
        return {
            'color': {'r': fg[0], 'g': fg[1], 'b': fg[2]},
            'hex': f"#{fg[0]:02x}{fg[1]:02x}{fg[2]:02x}",
            'ratio': round(current_ratio, 2),
            'changed': False
        }

    fg_luminance = calculate_luminance(fg)
    bg_luminance = calculate_luminance(bg)

    # Determine direction: move foreground AWAY from background to increase contrast
    # If fg is darker than bg, make it even darker (towards black)
    # If fg is lighter than bg, make it even lighter (towards white)
    should_darken = fg_luminance < bg_luminance

    best_color = fg
    best_ratio = current_ratio

    # Try adjusting the color in the primary direction
    for step in range(1, 101):
        factor = step / 100.0

        if should_darken:
            # Darken: move towards black
            new_r = max(0, int(fg[0] * (1 - factor)))
            new_g = max(0, int(fg[1] * (1 - factor)))
            new_b = max(0, int(fg[2] * (1 - factor)))
        else:
            # Lighten: move towards white
            new_r = min(255, int(fg[0] + (255 - fg[0]) * factor))
            new_g = min(255, int(fg[1] + (255 - fg[1]) * factor))
            new_b = min(255, int(fg[2] + (255 - fg[2]) * factor))

        new_color = (new_r, new_g, new_b)
        new_ratio = calculate_contrast_ratio(new_color, bg)

        if new_ratio >= target_ratio:
            best_color = new_color
            best_ratio = new_ratio
            break

        if new_ratio > best_ratio:
            best_color = new_color
            best_ratio = new_ratio

    # If still not meeting target, try the opposite direction
    # BUT only if it actually improves contrast (don't make it worse!)
    if best_ratio < target_ratio:
        # First check if opposite direction helps at all
        test_factor = 0.1
        if not should_darken:
            test_r = max(0, int(fg[0] * (1 - test_factor)))
            test_g = max(0, int(fg[1] * (1 - test_factor)))
            test_b = max(0, int(fg[2] * (1 - test_factor)))
        else:
            test_r = min(255, int(fg[0] + (255 - fg[0]) * test_factor))
            test_g = min(255, int(fg[1] + (255 - fg[1]) * test_factor))
            test_b = min(255, int(fg[2] + (255 - fg[2]) * test_factor))

        test_ratio = calculate_contrast_ratio((test_r, test_g, test_b), bg)

        # Only try opposite direction if it would improve contrast
        if test_ratio > current_ratio:
            for step in range(1, 101):
                factor = step / 100.0

                if not should_darken:
                    new_r = max(0, int(fg[0] * (1 - factor)))
                    new_g = max(0, int(fg[1] * (1 - factor)))
                    new_b = max(0, int(fg[2] * (1 - factor)))
                else:
                    new_r = min(255, int(fg[0] + (255 - fg[0]) * factor))
                    new_g = min(255, int(fg[1] + (255 - fg[1]) * factor))
                    new_b = min(255, int(fg[2] + (255 - fg[2]) * factor))

                new_color = (new_r, new_g, new_b)
                new_ratio = calculate_contrast_ratio(new_color, bg)

                if new_ratio >= target_ratio:
                    best_color = new_color
                    best_ratio = new_ratio
                    break

                if new_ratio > best_ratio:
                    best_color = new_color
                    best_ratio = new_ratio

    return {
        'color': {'r': best_color[0], 'g': best_color[1], 'b': best_color[2]},
        'hex': f"#{best_color[0]:02x}{best_color[1]:02x}{best_color[2]:02x}",
        'ratio': round(best_ratio, 2),
        'changed': best_color != fg,
        'meets_target': best_ratio >= target_ratio
    }


def simulate_colorblindness(
    rgb: Tuple[int, int, int],
    blindness_type: str
) -> Tuple[int, int, int]:
    """
    Simulate how a color appears to someone with color blindness.

    Args:
        rgb: Original color as (R, G, B) tuple
        blindness_type: One of 'protanopia', 'deuteranopia', 'tritanopia'

    Returns:
        Simulated color as (R, G, B) tuple
    """
    r, g, b = [x / 255.0 for x in rgb]

    # Transformation matrices for different types of color blindness
    if blindness_type == 'protanopia':
        # Red-blind
        new_r = 0.567 * r + 0.433 * g
        new_g = 0.558 * r + 0.442 * g
        new_b = 0.242 * g + 0.758 * b
    elif blindness_type == 'deuteranopia':
        # Green-blind
        new_r = 0.625 * r + 0.375 * g
        new_g = 0.7 * r + 0.3 * g
        new_b = 0.3 * g + 0.7 * b
    elif blindness_type == 'tritanopia':
        # Blue-blind
        new_r = 0.95 * r + 0.05 * g
        new_g = 0.433 * g + 0.567 * b
        new_b = 0.475 * g + 0.525 * b
    else:
        new_r, new_g, new_b = r, g, b

    return (
        min(255, max(0, int(new_r * 255))),
        min(255, max(0, int(new_g * 255))),
        min(255, max(0, int(new_b * 255)))
    )


def check_colorblind_contrast(
    fg: Tuple[int, int, int],
    bg: Tuple[int, int, int]
) -> Dict[str, Any]:
    """
    Check contrast ratios under different types of color blindness simulation.

    Args:
        fg: Foreground color
        bg: Background color

    Returns:
        Dict with contrast ratios for each simulation type
    """
    results = {
        'normal': {
            'ratio': round(calculate_contrast_ratio(fg, bg), 2),
            'passes_aa': calculate_contrast_ratio(fg, bg) >= 4.5
        }
    }

    for blindness_type in ['protanopia', 'deuteranopia', 'tritanopia']:
        sim_fg = simulate_colorblindness(fg, blindness_type)
        sim_bg = simulate_colorblindness(bg, blindness_type)
        ratio = calculate_contrast_ratio(sim_fg, sim_bg)
        results[blindness_type] = {
            'ratio': round(ratio, 2),
            'passes_aa': ratio >= 4.5,
            'simulated_fg': {'r': sim_fg[0], 'g': sim_fg[1], 'b': sim_fg[2]},
            'simulated_bg': {'r': sim_bg[0], 'g': sim_bg[1], 'b': sim_bg[2]}
        }

    return results
