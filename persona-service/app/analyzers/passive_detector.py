"""
Passiv-Detektor für deutsche Texte.
Erkennt Passiv-Konstruktionen ohne schwere NLP-Bibliotheken.

Warum Passiv problematisch ist:
- Versteckt den Handelnden (das Subjekt)
- Bläht die Satzstruktur durch Hilfsverben auf
- Erschwert das Verständnis für:
  - Mehmet (B1-Deutsch): Passiv ist im B1-Niveau fehleranfällig
  - Aisha (Gehörlose): Schriftsprache als Zweitsprache, Passiv versteckt Subjekt
  - Ingrid (78): Benötigt mehr kognitive Energie
"""

import re
from typing import List, Dict, Any


class PassiveVoiceDetector:
    """
    Erkennt Passiv-Konstruktionen im Deutschen.
    Sucht nach: Hilfsverb (werden/wurde/ist worden) + Partizip II.
    """

    # Formen von 'werden' im Präsens, Präteritum und Perfekt
    PASSIVE_AUXILIARIES = [
        r"\bwird\b", r"\bwerden\b", r"\bwurde\b",
        r"\bwurden\b", r"\bworden\b", r"\bwerdet\b",
        r"\bwerde\b"
    ]

    # Partizip II Muster:
    # - ge...t (gekauft, gemacht)
    # - ge...en (geschrieben, gelesen)
    # - ...iert (informiert, organisiert)
    # - be...t/en (bezahlt, besprochen)
    # - ver...t/en (verkauft, vergessen)
    # - ent...t/en (entwickelt, entschieden)
    PARTICIPLE_PATTERNS = [
        r"\bge\w{2,}(?:t|en)\b",      # ge-Präfix: gekauft, geschrieben
        r"\b\w+iert\b",                # -iert Endung: informiert, organisiert
        r"\bbe\w{2,}(?:t|en)\b",       # be-Präfix: bezahlt, besprochen
        r"\bver\w{2,}(?:t|en)\b",      # ver-Präfix: verkauft, vergessen
        r"\bent\w{2,}(?:t|en)\b",      # ent-Präfix: entwickelt, entschieden
        r"\ber\w{2,}(?:t|en)\b",       # er-Präfix: erledigt, erhalten
        r"\bauf\w{2,}(?:t|en)\b",      # auf-Präfix: aufgeführt, aufgenommen
        r"\bab\w{2,}(?:t|en)\b",       # ab-Präfix: abgelehnt, abgeschlossen
        r"\ban\w{2,}(?:t|en)\b",       # an-Präfix: angenommen, angezeigt
    ]

    def __init__(self):
        # Kompilierte Regex für bessere Performance
        self.aux_patterns = [re.compile(p, re.IGNORECASE) for p in self.PASSIVE_AUXILIARIES]
        self.participle_pattern = re.compile(
            "|".join(self.PARTICIPLE_PATTERNS),
            re.IGNORECASE
        )

    def detect(self, text: str) -> Dict[str, Any]:
        """
        Analysiert Text auf Passiv-Konstruktionen.

        Returns:
            dict mit:
            - passive_sentences: Liste der Passiv-Sätze
            - passive_count: Anzahl der Passiv-Konstruktionen
            - sentence_count: Gesamtzahl der Sätze
            - passive_ratio: Verhältnis Passiv/Gesamt
            - issues: Liste von Issues für den Report
        """
        sentences = self._split_sentences(text)
        passive_sentences = []

        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence or len(sentence) < 5:
                continue

            if self._is_passive(sentence):
                # Extrahiere das gefundene Passiv-Verb
                aux_match = self._find_auxiliary(sentence)
                participle_match = self.participle_pattern.search(sentence)

                passive_sentences.append({
                    "text": sentence[:150] + ("..." if len(sentence) > 150 else ""),
                    "auxiliary": aux_match.group() if aux_match else None,
                    "participle": participle_match.group() if participle_match else None,
                })

        sentence_count = len([s for s in sentences if s.strip()])
        passive_count = len(passive_sentences)
        passive_ratio = passive_count / max(sentence_count, 1)

        # Generiere Issues basierend auf Ratio
        issues = self._generate_issues(passive_count, passive_ratio, passive_sentences)

        return {
            "passive_sentences": passive_sentences,
            "passive_count": passive_count,
            "sentence_count": sentence_count,
            "passive_ratio": round(passive_ratio, 3),
            "passive_percentage": round(passive_ratio * 100, 1),
            "issues": issues,
        }

    def _is_passive(self, sentence: str) -> bool:
        """Prüft ob ein Satz Passiv enthält."""
        has_auxiliary = self._find_auxiliary(sentence) is not None
        has_participle = self.participle_pattern.search(sentence) is not None
        return has_auxiliary and has_participle

    def _find_auxiliary(self, sentence: str) -> re.Match | None:
        """Findet das Passiv-Hilfsverb im Satz."""
        for pattern in self.aux_patterns:
            match = pattern.search(sentence)
            if match:
                return match
        return None

    def _split_sentences(self, text: str) -> List[str]:
        """Teilt Text in Sätze auf."""
        # Berücksichtigt Abkürzungen wie z.B., d.h., etc.
        text = re.sub(r'(z\.B\.|d\.h\.|u\.a\.|bzw\.|etc\.|usw\.)', r'\1<ABBR>', text)
        sentences = re.split(r'[.!?]+\s+', text)
        return [s.replace('<ABBR>', '') for s in sentences if s.strip()]

    def _generate_issues(
        self,
        passive_count: int,
        passive_ratio: float,
        passive_sentences: List[Dict]
    ) -> List[Dict[str, Any]]:
        """Generiert Issues basierend auf den Ergebnissen."""
        issues = []

        if passive_ratio > 0.30:
            # Über 30%: Kritisch
            issues.append({
                "type": "passive_voice",
                "severity": "critical",
                "description": f"{int(passive_ratio*100)}% der Sätze im Passiv ({passive_count} Sätze)",
                "recommendation": "Sätze im Aktiv formulieren: Wer macht was?",
                "examples": [s["text"] for s in passive_sentences[:3]],
            })
        elif passive_ratio > 0.20:
            # 20-30%: Warnung
            issues.append({
                "type": "passive_voice",
                "severity": "warning",
                "description": f"{int(passive_ratio*100)}% der Sätze im Passiv ({passive_count} Sätze)",
                "recommendation": "Mehr Aktiv-Formulierungen verwenden",
                "examples": [s["text"] for s in passive_sentences[:2]],
            })
        elif passive_count > 0:
            # Unter 20%: Info
            issues.append({
                "type": "passive_voice",
                "severity": "info",
                "description": f"{passive_count} Passiv-Konstruktion(en) gefunden",
                "recommendation": "Prüfen Sie, ob Aktiv-Formulierungen möglich sind",
            })

        return issues


# Singleton-Instanz für einfache Verwendung
_detector = PassiveVoiceDetector()


def analyze_passive_voice(text: str) -> Dict[str, Any]:
    """
    Convenience-Funktion zur Passiv-Analyse.

    Args:
        text: Der zu analysierende Text

    Returns:
        Analyse-Ergebnis mit passive_count, passive_ratio, issues etc.
    """
    return _detector.detect(text)
