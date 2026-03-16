"""
Accessibility Matcher - Compares text metrics against persona thresholds.
Determines how accessible a text is for each of the 7 personas.
"""

from typing import Dict, Any, List
from enum import Enum
from app.config import PERSONAS, PersonaDefinition


class PersonaStatus(str, Enum):
    ACCESSIBLE = "accessible"  # Can read the text fully
    LIMITED = "limited"        # Can read with some difficulties
    BLOCKED = "blocked"        # Cannot understand the text


class AccessibilityMatcher:
    """
    Matches text analysis results against persona accessibility requirements.
    """

    def __init__(self):
        self.personas = PERSONAS

        # Text-relevant thresholds for each persona
        self.thresholds = {
            "ingrid": {
                # Visual impairment - passive voice needs more cognitive energy
                "text_relevant": True,
                "passive_voice_sensitive": True,
                "max_passive_ratio": 0.20,  # 20% threshold
            },
            "mehmet": {
                # Refugee with B1 German, PTSD
                # Passive is often error-prone at B1 level
                "text_relevant": True,
                "max_sentence_length": 20,
                "min_flesch_score": 40,
                "max_complex_words_ratio": 0.1,  # 10% of words
                "jargon_sensitive": True,
                "passive_voice_sensitive": True,
                "max_passive_ratio": 0.20,  # 20% threshold
            },
            "fatima": {
                # Illiterate, A2 spoken German
                "text_relevant": True,
                "min_flesch_score": 60,  # Needs very simple language
                "max_sentence_length": 12,
                "requires_simple_language": True,
            },
            "thomas": {
                # ADHD & Dyslexia
                "text_relevant": True,
                "max_paragraph_length": 100,  # words
                "max_sentence_length": 15,
                "needs_structure": True,
            },
            "aisha": {
                # Deaf, DGS native speaker
                # Passive hides the subject - very hard for sign language speakers
                "text_relevant": True,
                "max_sentence_length": 15,
                "passive_voice_sensitive": True,
                "max_passive_ratio": 0.15,  # Stricter for Aisha (15%)
                "complex_grammar_sensitive": True,
            },
            "sandra": {
                # Single mom under time pressure
                "text_relevant": True,
                "needs_structure": True,
                "needs_clear_actions": True,
            },
            "viktor": {
                # Color-blind & depression
                "text_relevant": True,  # Partially - tonality matters
                "negative_tone_sensitive": True,
            },
        }

    def assess_text(self, stats: Dict[str, Any], issues: List[Dict]) -> List[Dict]:
        """
        Assess text accessibility for all personas.

        Args:
            stats: Text statistics from analysis
                - avgWordsPerSentence: float
                - words: int
                - sentences: int
                - complexWords: int
                - passiveConstructions: int
                - flesch_score: float (optional)
            issues: List of detected issues from analysis
                - Each issue has: type, text, suggestion

        Returns:
            List of PersonaAssessment dicts with:
                - personaId: str
                - status: 'accessible' | 'limited' | 'blocked'
                - matchScore: int (0-100)
                - specificIssues: List[str]
        """
        results = []

        # Count issue types for quick lookup
        issue_counts = self._count_issues(issues)

        for persona_id, persona in self.personas.items():
            threshold = self.thresholds.get(persona_id, {})

            # Skip non-text-relevant personas (automatic accessible)
            if not threshold.get("text_relevant", False):
                results.append({
                    "personaId": persona_id,
                    "status": PersonaStatus.ACCESSIBLE.value,
                    "matchScore": 100,
                    "specificIssues": [],
                })
                continue

            # Calculate match score and find specific issues
            match_score = 100
            specific_issues = []

            # Check sentence length
            avg_sentence_len = stats.get("avgWordsPerSentence", 0)
            max_allowed = threshold.get("max_sentence_length", 25)
            if avg_sentence_len > max_allowed:
                penalty = min(30, (avg_sentence_len - max_allowed) * 3)
                match_score -= penalty
                specific_issues.append(
                    f"Satzlänge zu hoch (Ø {avg_sentence_len:.0f} Wörter, max. {max_allowed})"
                )

            # Check Flesch reading ease
            flesch_score = stats.get("flesch_score", 50)
            min_flesch = threshold.get("min_flesch_score", 0)
            if min_flesch > 0 and flesch_score < min_flesch:
                penalty = min(40, (min_flesch - flesch_score) * 0.8)
                match_score -= penalty
                specific_issues.append(
                    f"Text zu komplex (Flesch {flesch_score:.0f}, min. {min_flesch} nötig)"
                )

            # Check complex words ratio
            if threshold.get("max_complex_words_ratio"):
                total_words = stats.get("words", 1)
                complex_words = stats.get("complexWords", 0)
                ratio = complex_words / max(total_words, 1)
                max_ratio = threshold["max_complex_words_ratio"]
                if ratio > max_ratio:
                    penalty = min(25, (ratio - max_ratio) * 200)
                    match_score -= penalty
                    specific_issues.append(
                        f"Zu viele Fremdwörter ({complex_words} komplexe Wörter)"
                    )

            # Check passive voice (ratio-based for more accurate assessment)
            if threshold.get("passive_voice_sensitive"):
                passive_count = stats.get("passiveConstructions", 0)
                sentence_count = stats.get("sentences", 1)
                passive_ratio = passive_count / max(sentence_count, 1)
                max_ratio = threshold.get("max_passive_ratio", 0.20)

                if passive_ratio > max_ratio:
                    # More than threshold - significant penalty, status "limited"
                    percentage = int(passive_ratio * 100)
                    penalty = min(35, (passive_ratio - max_ratio) * 150)
                    match_score -= penalty
                    specific_issues.append(
                        f"Zu viele Passiv-Sätze ({percentage}%, max. {int(max_ratio*100)}%)"
                    )
                elif passive_count > 0:
                    # Some passive but under threshold - minor penalty
                    penalty = min(10, passive_count * 2)
                    match_score -= penalty
                    specific_issues.append(
                        f"Passiv-Konstruktionen gefunden ({passive_count} Sätze)"
                    )

            # Check for jargon/technical terms
            if threshold.get("jargon_sensitive"):
                replaceable = stats.get("replaceableWords", 0)
                abbreviations = stats.get("abbreviations", 0)
                jargon_count = replaceable + abbreviations
                if jargon_count > 2:
                    penalty = min(25, jargon_count * 3)
                    match_score -= penalty
                    specific_issues.append(
                        f"Fachbegriffe/Abkürzungen erklären ({jargon_count} gefunden)"
                    )

            # Check structure needs
            if threshold.get("needs_structure"):
                # Check for long sentences (indicates poor structure)
                long_sentences = issue_counts.get("long_sentence", 0)
                if long_sentences > 2:
                    match_score -= 15
                    specific_issues.append(
                        f"Bessere Strukturierung nötig ({long_sentences} lange Sätze)"
                    )

            # Check for negative tone (Viktor)
            if threshold.get("negative_tone_sensitive"):
                # This would require AI analysis, use placeholder
                # In future: check for threatening/negative language
                pass

            # Ensure score stays in bounds
            match_score = max(0, min(100, match_score))

            # Determine status based on score
            if match_score >= 75:
                status = PersonaStatus.ACCESSIBLE.value
            elif match_score >= 40:
                status = PersonaStatus.LIMITED.value
            else:
                status = PersonaStatus.BLOCKED.value

            results.append({
                "personaId": persona_id,
                "status": status,
                "matchScore": int(match_score),
                "specificIssues": specific_issues,
            })

        return results

    def _count_issues(self, issues: List[Dict]) -> Dict[str, int]:
        """Count issues by type."""
        counts = {}
        for issue in issues:
            issue_type = issue.get("type", "unknown")
            counts[issue_type] = counts.get(issue_type, 0) + 1
        return counts


# Singleton instance
matcher = AccessibilityMatcher()


def assess_text_for_personas(stats: Dict[str, Any], issues: List[Dict]) -> List[Dict]:
    """
    Convenience function to assess text for all personas.

    Args:
        stats: Text statistics dict
        issues: List of detected issues

    Returns:
        List of persona assessments
    """
    return matcher.assess_text(stats, issues)
