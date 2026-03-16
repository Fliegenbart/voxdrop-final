"""
Global Context Engine for alt-text generation.

This module extracts presentation-wide context (glossary, themes, acronyms)
to provide consistent and informed alt-text generation across all elements.

Key features:
- Extract and analyze all text from the modelpack
- Use LLM to identify acronyms, technical terms, and keywords
- Build context strings for repair prompts
- Cache results for efficient reuse
"""

import json
import os
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set

import httpx

from .prompts import GLOSSARY_EXTRACTION_PROMPT


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class GlossaryEntry:
    """A single glossary entry."""
    term: str
    meaning: str
    certainty: str = "medium"  # high, medium, low
    source_slides: List[int] = field(default_factory=list)


@dataclass
class PresentationContext:
    """Extracted context from a presentation."""
    # Glossary items
    acronyms: Dict[str, str] = field(default_factory=dict)  # ABK -> "Ausgeschrieben"
    terms: Dict[str, str] = field(default_factory=dict)  # Term -> "Definition"
    keywords: List[str] = field(default_factory=list)

    # Presentation metadata
    title: str = ""
    theme: str = ""
    slide_count: int = 0

    # Text analysis
    total_text_length: int = 0
    recurring_phrases: List[str] = field(default_factory=list)

    def to_context_string(self, max_length: int = 500) -> str:
        """
        Build a context string for inclusion in prompts.

        Returns a formatted string with the most relevant context.
        """
        parts = []

        # Add title and theme if available
        if self.title:
            parts.append(f"Präsentation: {self.title}")
        if self.theme:
            parts.append(f"Thema: {self.theme}")

        # Add acronyms (most useful for alt-text)
        if self.acronyms:
            acronym_list = ", ".join(
                f"{k}={v}" for k, v in list(self.acronyms.items())[:5]
            )
            parts.append(f"Abkürzungen: {acronym_list}")

        # Add key terms
        if self.terms:
            term_list = ", ".join(list(self.terms.keys())[:5])
            parts.append(f"Schlüsselbegriffe: {term_list}")

        # Add keywords
        if self.keywords:
            kw_list = ", ".join(self.keywords[:8])
            parts.append(f"Keywords: {kw_list}")

        context = "\n".join(parts)

        # Truncate if necessary
        if len(context) > max_length:
            context = context[:max_length - 3] + "..."

        return context

    def get_acronym_expansion(self, text: str) -> Optional[str]:
        """
        Check if text contains a known acronym and return its expansion.

        Args:
            text: Text that might contain an acronym.

        Returns:
            The expansion if found, None otherwise.
        """
        # Check exact match
        text_upper = text.strip().upper()
        for acronym, expansion in self.acronyms.items():
            if acronym.upper() == text_upper:
                return expansion

        return None


# =============================================================================
# GLOBAL CONTEXT MANAGER
# =============================================================================

class GlobalContextManager:
    """
    Manages extraction and caching of presentation-wide context.

    Usage:
        manager = GlobalContextManager()
        context = manager.extract_context(modelpack)
        context_string = context.to_context_string()
    """

    def __init__(
        self,
        llm_host: Optional[str] = None,
        llm_model: Optional[str] = None,
        llm_timeout: float = 60.0,
    ):
        """
        Initialize the context manager.

        Args:
            llm_host: Ollama host URL for glossary extraction.
            llm_model: Model name for text analysis.
            llm_timeout: Timeout for LLM requests.
        """
        self.llm_host = llm_host or os.getenv("OLLAMA_HOST", "http://localhost:11434")
        self.llm_model = llm_model or os.getenv("LLM_MODEL", "qwen2.5:14b")
        self.llm_timeout = llm_timeout

        # Cache by source file
        self._cache: Dict[str, PresentationContext] = {}

    def extract_context(
        self,
        modelpack: Dict[str, Any],
        force_refresh: bool = False,
    ) -> PresentationContext:
        """
        Extract global context from a modelpack.

        Args:
            modelpack: The modelpack dictionary.
            force_refresh: If True, ignore cache and re-extract.

        Returns:
            PresentationContext with extracted information.
        """
        source_file = modelpack.get("source_file", "unknown")

        # Check cache
        if not force_refresh and source_file in self._cache:
            return self._cache[source_file]

        # Extract all text content
        all_text = self._extract_all_text(modelpack)

        # Create base context
        context = PresentationContext(
            title=self._extract_title(modelpack),
            slide_count=len(modelpack.get("slides", [])),
            total_text_length=len(all_text),
        )

        # Try to extract glossary via LLM
        try:
            glossary_data = self._extract_glossary_llm(all_text)
            context.acronyms = glossary_data.get("acronyms", {})
            context.terms = glossary_data.get("terms", {})
            context.keywords = glossary_data.get("keywords", [])
        except Exception as e:
            print(f"[ContextEngine] LLM glossary extraction failed: {e}")
            # Fall back to heuristic extraction
            context.acronyms = self._extract_acronyms_heuristic(all_text)
            context.keywords = self._extract_keywords_heuristic(all_text)

        # Try to identify theme
        context.theme = self._infer_theme(context)

        # Extract recurring phrases
        context.recurring_phrases = self._find_recurring_phrases(all_text)

        # Cache the result
        self._cache[source_file] = context

        return context

    def _extract_all_text(self, modelpack: Dict[str, Any]) -> str:
        """Extract all text content from the modelpack."""
        texts = []

        for slide in modelpack.get("slides", []):
            # Add notes
            if slide.get("notes_text"):
                texts.append(slide["notes_text"])

            # Add element text
            for elem in slide.get("elements_in_reading_order", []):
                text = elem.get("text", "")
                if text:
                    texts.append(text)

        return "\n".join(texts)

    def _extract_title(self, modelpack: Dict[str, Any]) -> str:
        """Extract the presentation title (usually from first slide)."""
        slides = modelpack.get("slides", [])
        if not slides:
            return ""

        # Check first slide's first element
        first_slide = slides[0]
        elements = first_slide.get("elements_in_reading_order", [])

        if elements:
            first_text = elements[0].get("text", "")
            # Title is usually short
            if len(first_text) < 100:
                return first_text.strip()

        return ""

    def _extract_glossary_llm(self, text: str) -> Dict[str, Any]:
        """
        Use LLM to extract glossary items.

        Args:
            text: All text from the presentation.

        Returns:
            Dictionary with acronyms, terms, and keywords.
        """
        # Limit text length to avoid token limits
        if len(text) > 8000:
            text = text[:8000]

        prompt = GLOSSARY_EXTRACTION_PROMPT.format(text=text)

        try:
            response = httpx.post(
                f"{self.llm_host}/api/generate",
                json={
                    "model": self.llm_model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.2,
                        "num_ctx": 8192,
                    },
                },
                timeout=self.llm_timeout,
            )
            response.raise_for_status()

            result = response.json()
            response_text = result.get("response", "")

            # Parse JSON response
            return self._parse_glossary_response(response_text)

        except httpx.HTTPError as e:
            print(f"[ContextEngine] HTTP error during glossary extraction: {e}")
            raise

    def _parse_glossary_response(self, response_text: str) -> Dict[str, Any]:
        """Parse the LLM's JSON response for glossary data."""
        # Try to find JSON in the response
        try:
            # First, try direct JSON parse
            return json.loads(response_text)
        except json.JSONDecodeError:
            pass

        # Try to extract JSON from markdown code block
        json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', response_text, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass

        # Try to find any JSON object
        json_match = re.search(r'\{[^{}]*"acronyms"[^{}]*\}', response_text, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(0))
            except json.JSONDecodeError:
                pass

        # Return empty if parsing fails
        return {"acronyms": {}, "terms": {}, "keywords": []}

    def _extract_acronyms_heuristic(self, text: str) -> Dict[str, str]:
        """
        Extract acronyms using heuristics (fallback).

        Looks for patterns like:
        - "ABC (Ausgeschriebene Bedeutung)"
        - "Ausgeschriebene Bedeutung (ABC)"
        """
        acronyms = {}

        # Pattern 1: ACRONYM (Expansion)
        pattern1 = re.compile(r'\b([A-ZÄÖÜ]{2,6})\s*\(([^)]+)\)')
        for match in pattern1.finditer(text):
            acronym = match.group(1)
            expansion = match.group(2).strip()
            if len(expansion) > 3 and len(expansion) < 100:
                acronyms[acronym] = expansion

        # Pattern 2: Expansion (ACRONYM)
        pattern2 = re.compile(r'([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-Za-zäöüÄÖÜß]+){1,5})\s*\(([A-ZÄÖÜ]{2,6})\)')
        for match in pattern2.finditer(text):
            expansion = match.group(1).strip()
            acronym = match.group(2)
            if acronym not in acronyms:
                acronyms[acronym] = expansion

        return acronyms

    def _extract_keywords_heuristic(self, text: str) -> List[str]:
        """
        Extract keywords using frequency analysis (fallback).
        """
        # Simple word frequency
        words = re.findall(r'\b[A-ZÄÖÜ][a-zäöüß]{4,}\b', text)
        word_counts: Dict[str, int] = {}

        for word in words:
            word_lower = word.lower()
            word_counts[word_lower] = word_counts.get(word_lower, 0) + 1

        # Get top words that appear multiple times
        keywords = [
            word for word, count in sorted(word_counts.items(), key=lambda x: -x[1])
            if count >= 3
        ][:10]

        return keywords

    def _infer_theme(self, context: PresentationContext) -> str:
        """Infer the presentation theme from title and keywords."""
        if context.title:
            # Use title as theme hint
            title_lower = context.title.lower()

            # Common theme patterns
            if any(kw in title_lower for kw in ["digital", "transformation", "modernisierung"]):
                return "Digitalisierung"
            if any(kw in title_lower for kw in ["strategie", "planung", "konzept"]):
                return "Strategie"
            if any(kw in title_lower for kw in ["projekt", "meilenstein", "timeline"]):
                return "Projektmanagement"
            if any(kw in title_lower for kw in ["schulung", "training", "workshop"]):
                return "Schulung"
            if any(kw in title_lower for kw in ["bericht", "report", "analyse"]):
                return "Analyse"

        return ""

    def _find_recurring_phrases(self, text: str) -> List[str]:
        """Find phrases that appear multiple times."""
        # Extract 2-4 word phrases
        words = text.split()
        phrases: Dict[str, int] = {}

        for i in range(len(words) - 1):
            # 2-word phrases
            phrase = " ".join(words[i:i+2])
            if len(phrase) > 10:
                phrases[phrase] = phrases.get(phrase, 0) + 1

        # Return phrases appearing 3+ times
        recurring = [
            phrase for phrase, count in phrases.items()
            if count >= 3
        ][:5]

        return recurring

    def clear_cache(self) -> None:
        """Clear the context cache."""
        self._cache.clear()

    def get_cached_context(self, source_file: str) -> Optional[PresentationContext]:
        """Get cached context for a source file if available."""
        return self._cache.get(source_file)


# =============================================================================
# SINGLETON ACCESS
# =============================================================================

_context_manager_instance: Optional[GlobalContextManager] = None


def get_context_manager(
    llm_host: Optional[str] = None,
    llm_model: Optional[str] = None,
) -> GlobalContextManager:
    """
    Get or create the GlobalContextManager singleton.

    Args:
        llm_host: Optional LLM host (only used on first call).
        llm_model: Optional LLM model (only used on first call).

    Returns:
        The singleton GlobalContextManager instance.
    """
    global _context_manager_instance

    if _context_manager_instance is None:
        _context_manager_instance = GlobalContextManager(
            llm_host=llm_host,
            llm_model=llm_model,
        )

    return _context_manager_instance
