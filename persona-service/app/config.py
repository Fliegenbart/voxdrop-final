"""
Persona definitions for the Accessibility Persona Matcher.
7 realistic personas representing different accessibility needs.
"""

import os
from typing import List, Dict, Any
from pydantic import BaseModel
from enum import Enum


class PersonaStatus(str, Enum):
    ACCESSIBLE = "accessible"  # Can use the document fully
    LIMITED = "limited"  # Can use with some difficulties
    BLOCKED = "blocked"  # Cannot use the document


class IssueSeverity(str, Enum):
    CRITICAL = "critical"  # Blocks usage completely
    MAJOR = "major"  # Significant barrier
    MINOR = "minor"  # Inconvenience


class TestCategory(str, Enum):
    VISUAL = "visual"
    COGNITIVE = "cognitive"
    LANGUAGE = "language"
    EMOTIONAL = "emotional"
    NAVIGATION = "navigation"
    STRUCTURE = "structure"
    MOBILE = "mobile"
    AUDIO = "audio"


class PersonaDefinition(BaseModel):
    id: str
    name: str
    age: int
    description: str
    core_limitation: str
    friction_points: List[Dict[str, Any]]
    relevant_tests: List[str]
    icon: str  # Emoji for display


# The 7 Personas
PERSONAS: Dict[str, PersonaDefinition] = {
    "ingrid": PersonaDefinition(
        id="ingrid",
        name="Ingrid",
        age=78,
        description="Sehbeeinträchtigung & Digital Immigrant",
        core_limitation="Altersbedingte Makuladegeneration, nutzt Bildschirmlupe (200-300% Zoom)",
        icon="👵",
        friction_points=[
            {"category": "visual", "test": "contrast", "threshold": 4.5, "description": "Kontrast zu niedrig"},
            {"category": "visual", "test": "font_size", "threshold": 12, "description": "Schriftgröße zu klein"},
            {"category": "visual", "test": "color_only", "description": "Informationen nur durch Farbe"},
            {"category": "visual", "test": "alt_texts", "description": "Bilder ohne Beschreibung"},
            {"category": "navigation", "test": "tab_order", "description": "Keine logische Tab-Reihenfolge"},
            {"category": "cognitive", "test": "passive_voice", "description": "Passiv-Sätze erfordern mehr kognitive Energie"},
        ],
        relevant_tests=["contrast", "font_size", "color_only", "alt_texts", "zoomable", "passive_voice"]
    ),
    "mehmet": PersonaDefinition(
        id="mehmet",
        name="Mehmet",
        age=34,
        description="Geflüchteter mit Traumahintergrund",
        core_limitation="Deutsch B1, komplexe PTBS, Smartphone als Hauptgerät",
        icon="👨",
        friction_points=[
            {"category": "language", "test": "flesch_index", "threshold": 40, "description": "Text zu komplex"},
            {"category": "language", "test": "sentence_length", "threshold": 20, "description": "Sätze zu lang"},
            {"category": "language", "test": "technical_terms", "description": "Fachbegriffe ohne Erklärung"},
            {"category": "emotional", "test": "tonality", "description": "Bedrohliche Tonalität"},
            {"category": "cognitive", "test": "information_density", "threshold": 5, "description": "Zu viele Themen"},
            {"category": "mobile", "test": "responsive", "description": "Nicht mobiloptimiert"},
            {"category": "language", "test": "passive_voice", "description": "Passiv ist auf B1-Niveau fehleranfällig"},
        ],
        relevant_tests=["flesch_index", "sentence_length", "technical_terms", "tonality", "cultural_assumptions", "passive_voice"]
    ),
    "fatima": PersonaDefinition(
        id="fatima",
        name="Fatima",
        age=29,
        description="Analphabetin mit Fluchthintergrund",
        core_limitation="Keine formale Schulbildung, kann nicht lesen, Deutsch A2 mündlich",
        icon="👩",
        friction_points=[
            {"category": "audio", "test": "audio_alternative", "description": "Keine Audio-Alternative"},
            {"category": "visual", "test": "pictograms", "description": "Keine Piktogramme"},
            {"category": "navigation", "test": "menu_depth", "threshold": 2, "description": "Zu komplexe Navigation"},
            {"category": "language", "test": "simple_language", "description": "Nicht in Leichter Sprache"},
        ],
        relevant_tests=["audio_alternative", "pictograms", "simple_language", "video_explanation"]
    ),
    "thomas": PersonaDefinition(
        id="thomas",
        name="Thomas",
        age=42,
        description="ADHS & Legasthenie",
        core_limitation="Diagnostizierte ADHS und Legasthenie, braucht klare Struktur",
        icon="👨‍💼",
        friction_points=[
            {"category": "structure", "test": "visual_anchors", "description": "Keine visuellen Anker"},
            {"category": "structure", "test": "hierarchy", "description": "Unklare Hierarchie"},
            {"category": "cognitive", "test": "paragraph_length", "threshold": 100, "description": "Absätze zu lang"},
            {"category": "structure", "test": "checklists", "description": "Keine Checklisten"},
            {"category": "cognitive", "test": "progress_indicator", "description": "Kein Fortschrittsindikator"},
            {"category": "cognitive", "test": "time_estimate", "description": "Keine Zeitschätzung"},
        ],
        relevant_tests=["visual_anchors", "hierarchy", "paragraph_length", "headings", "lists"]
    ),
    "aisha": PersonaDefinition(
        id="aisha",
        name="Aisha",
        age=67,
        description="Gehörlose Rentnerin",
        core_limitation="Von Geburt an gehörlos, DGS als Muttersprache, Schriftdeutsch ist Zweitsprache",
        icon="👵",
        friction_points=[
            {"category": "audio", "test": "captions", "description": "Videos ohne Untertitel"},
            {"category": "audio", "test": "audio_only", "description": "Nur telefonische Kontaktmöglichkeit"},
            {"category": "audio", "test": "transcripts", "description": "Audio ohne Transkript"},
            {"category": "language", "test": "complex_grammar", "description": "Komplexe Schriftsprache"},
            {"category": "audio", "test": "dgs_video", "description": "Keine DGS-Videos"},
            {"category": "language", "test": "passive_voice", "description": "Passiv versteckt das Subjekt - schwer für DGS-Sprecher"},
        ],
        relevant_tests=["captions", "transcripts", "sentence_length", "passive_voice"]
    ),
    "sandra": PersonaDefinition(
        id="sandra",
        name="Sandra",
        age=35,
        description="Alleinerziehende unter Zeitdruck",
        core_limitation="Chronischer Zeitmangel, füllt Formulare abends am Handy aus",
        icon="👩‍👧",
        friction_points=[
            {"category": "cognitive", "test": "save_progress", "description": "Kein Zwischenspeichern"},
            {"category": "cognitive", "test": "time_estimate", "description": "Keine Zeitschätzung"},
            {"category": "mobile", "test": "responsive", "description": "Nicht mobiloptimiert"},
            {"category": "cognitive", "test": "tooltips", "description": "Keine Erklärungen"},
            {"category": "cognitive", "test": "redundant_input", "description": "Redundante Dateneingabe"},
            {"category": "cognitive", "test": "error_messages", "description": "Unklare Fehlermeldungen"},
        ],
        relevant_tests=["responsive", "time_estimate", "structure", "error_handling"]
    ),
    "viktor": PersonaDefinition(
        id="viktor",
        name="Viktor",
        age=52,
        description="Farbenblindheit & Depression",
        core_limitation="Rot-Grün-Schwäche, mittelschwere Depression",
        icon="👨‍🦳",
        friction_points=[
            {"category": "visual", "test": "color_only", "description": "Rot-Grün-Kodierung ohne Symbol"},
            {"category": "visual", "test": "color_patterns", "description": "Diagramme nur farbkodiert"},
            {"category": "emotional", "test": "overwhelming", "description": "Überwältigende Formulare"},
            {"category": "emotional", "test": "negative_tone", "description": "Negative Formulierungen"},
            {"category": "emotional", "test": "quick_wins", "description": "Keine einfachen ersten Schritte"},
        ],
        relevant_tests=["color_only", "tonality", "structure", "motivation"]
    ),
}


# Test thresholds and configuration
TEST_CONFIG = {
    "contrast": {
        "wcag_aa": 4.5,
        "wcag_aa_large": 3.0,
        "wcag_aaa": 7.0,
    },
    "font_size": {
        "minimum": 12,  # pt
        "recommended": 14,
    },
    "flesch_index": {
        "very_easy": 80,  # Leichte Sprache
        "easy": 60,
        "medium": 40,
        "difficult": 20,
    },
    "sentence_length": {
        "simple_language": 10,  # Leichte Sprache
        "recommended": 15,
        "maximum": 20,
    },
    "paragraph_length": {
        "recommended": 80,  # words
        "maximum": 100,
    },
    "passive_voice": {
        "max_ratio_info": 0.10,      # 10%: Info
        "max_ratio_warning": 0.20,   # 20%: Warnung
        "max_ratio_critical": 0.30,  # 30%: Kritisch
    },
}


# Ollama model configuration
OLLAMA_CONFIG = {
    "host": os.environ.get("OLLAMA_HOST", "http://voxdrop-ollama:11434"),
    "model": os.environ.get("OLLAMA_MODEL", "qwen2.5:14b"),
    "timeout": 60,
}

# vLLM (OpenAI-compatible) model configuration
VLM_CONFIG = {
    "host": os.environ.get("VLM_HOST", "http://vllm-vision:8000/v1"),
    "model": os.environ.get("VLM_MODEL", "Qwen/Qwen3-VL-8B-Instruct-FP8"),
    "timeout": int(os.environ.get("VLM_TIMEOUT", "120")),
}

# LLM provider selection: "vllm" (default) or "ollama"
PERSONA_LLM_PROVIDER = os.environ.get("PERSONA_LLM_PROVIDER", "vllm")
