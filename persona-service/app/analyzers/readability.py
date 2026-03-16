"""
Readability Analyzer - Calculate text readability metrics.
Uses textstat library for German text analysis.
"""

import textstat
import re
from typing import Dict, Any, List


def analyze_readability(text: str) -> Dict[str, Any]:
    """
    Analyze text readability with multiple metrics.

    Returns:
        dict with:
        - flesch_reading_ease: Flesch score (higher = easier)
        - flesch_kincaid_grade: Grade level
        - avg_sentence_length: Average words per sentence
        - avg_word_length: Average characters per word
        - complex_word_percentage: % of words with 3+ syllables
        - long_sentences: Sentences with 25+ words
        - issues: List of detected issues
    """
    if not text or len(text.strip()) < 10:
        return {
            "flesch_reading_ease": 0,
            "flesch_kincaid_grade": 0,
            "avg_sentence_length": 0,
            "avg_word_length": 0,
            "complex_word_percentage": 0,
            "long_sentences": [],
            "issues": ["Text zu kurz für Analyse"],
        }

    # Set language to German
    textstat.set_lang("de")

    # Basic metrics
    sentences = _split_sentences(text)
    words = text.split()
    word_count = len(words)
    sentence_count = len(sentences)

    # Calculate averages
    avg_sentence_length = word_count / sentence_count if sentence_count > 0 else 0
    avg_word_length = sum(len(w) for w in words) / word_count if word_count > 0 else 0

    # Flesch metrics
    flesch_reading_ease = textstat.flesch_reading_ease(text)
    flesch_kincaid_grade = textstat.flesch_kincaid_grade(text)

    # Complex words (3+ syllables)
    complex_words = [w for w in words if textstat.syllable_count(w) >= 3]
    complex_word_percentage = (len(complex_words) / word_count * 100) if word_count > 0 else 0

    # Find long sentences (25+ words)
    long_sentences = []
    for i, sentence in enumerate(sentences):
        word_in_sentence = len(sentence.split())
        if word_in_sentence >= 25:
            long_sentences.append({
                "index": i + 1,
                "word_count": word_in_sentence,
                "text": sentence[:100] + "..." if len(sentence) > 100 else sentence,
            })

    # Identify issues
    issues = []

    # Flesch score interpretation for German
    if flesch_reading_ease < 30:
        issues.append({
            "type": "readability",
            "severity": "critical",
            "description": f"Sehr schwer verständlich (Flesch: {flesch_reading_ease:.0f})",
            "recommendation": "Text vereinfachen, kürzere Sätze verwenden",
        })
    elif flesch_reading_ease < 50:
        issues.append({
            "type": "readability",
            "severity": "warning",
            "description": f"Schwer verständlich (Flesch: {flesch_reading_ease:.0f})",
            "recommendation": "Satzlänge und Fachbegriffe reduzieren",
        })

    if avg_sentence_length > 20:
        issues.append({
            "type": "sentence_length",
            "severity": "warning" if avg_sentence_length < 25 else "critical",
            "description": f"Durchschnittliche Satzlänge: {avg_sentence_length:.1f} Wörter",
            "recommendation": "Sätze auf max. 15-20 Wörter kürzen",
        })

    if len(long_sentences) > 0:
        issues.append({
            "type": "long_sentences",
            "severity": "warning",
            "description": f"{len(long_sentences)} Sätze mit 25+ Wörtern",
            "recommendation": "Lange Sätze aufteilen",
            "examples": long_sentences[:3],
        })

    if complex_word_percentage > 20:
        issues.append({
            "type": "complex_words",
            "severity": "warning",
            "description": f"{complex_word_percentage:.0f}% komplexe Wörter (3+ Silben)",
            "recommendation": "Einfachere Wörter verwenden",
        })

    return {
        "flesch_reading_ease": round(flesch_reading_ease, 1),
        "flesch_kincaid_grade": round(flesch_kincaid_grade, 1),
        "avg_sentence_length": round(avg_sentence_length, 1),
        "avg_word_length": round(avg_word_length, 1),
        "complex_word_percentage": round(complex_word_percentage, 1),
        "word_count": word_count,
        "sentence_count": sentence_count,
        "long_sentences": long_sentences,
        "issues": issues,
    }


def _split_sentences(text: str) -> List[str]:
    """Split text into sentences."""
    # Simple sentence splitting for German
    sentences = re.split(r'[.!?]+\s+', text)
    return [s.strip() for s in sentences if s.strip()]


def get_readability_level(flesch_score: float) -> str:
    """Convert Flesch score to readability level."""
    if flesch_score >= 70:
        return "sehr_leicht"  # Very easy
    elif flesch_score >= 60:
        return "leicht"  # Easy
    elif flesch_score >= 50:
        return "mittel"  # Medium
    elif flesch_score >= 30:
        return "schwer"  # Difficult
    else:
        return "sehr_schwer"  # Very difficult
