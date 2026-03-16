"""
Alt-Text Quality Assurance Layer for voxdrop-pptx2pdfua.

This module provides validation and improvement of generated alt-texts
through a two-phase approach:
1. Deterministic checks (fast, rule-based)
2. Targeted LLM review (only for flagged entries)

Key features:
- DECORATIVE detection for PDF/UA compliance
- Pydantic models for type safety and validation
- Configurable prompts via prompts.py
"""

import os
import re
from collections import Counter
from enum import Enum
from typing import Any, Dict, List, Optional

import httpx
from pydantic import BaseModel, Field

from .prompts import (
    get_valid_prefixes,
    get_alttext_system_prompt,
    build_repair_prompt,
)


# =============================================================================
# ENUMS
# =============================================================================

class IssueType(str, Enum):
    """Types of issues that can be detected in alt-texts."""
    DUPLICATE = "duplicate"
    MISSING_PREFIX = "missing_prefix"
    REDUNDANT_TEXT = "redundant_text"
    TOO_SHORT = "too_short"
    TOO_LONG = "too_long"
    PLACEHOLDER = "placeholder"
    DECORATIVE = "decorative"  # NEW: Element should be marked as decorative


class IssueSeverity(str, Enum):
    """Severity levels for issues."""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


# =============================================================================
# PYDANTIC MODELS
# =============================================================================

class BoundingBox(BaseModel):
    """Bounding box for a shape (in points)."""
    left: float = 0.0
    top: float = 0.0
    width: float = 100.0
    height: float = 100.0

    @property
    def area(self) -> float:
        """Calculate area in square points."""
        return self.width * self.height

    @property
    def is_tiny(self) -> bool:
        """Check if element is tiny (likely decorative)."""
        return self.width < 20 and self.height < 20

    @property
    def is_line_like(self) -> bool:
        """Check if element is line-like (very thin)."""
        return self.width < 5 or self.height < 5


class AltTextIssue(BaseModel):
    """Represents a detected issue with an alt-text."""
    issue_type: IssueType
    description: str
    severity: IssueSeverity = IssueSeverity.WARNING

    class Config:
        use_enum_values = True


class AltTextEntry(BaseModel):
    """Represents an alt-text entry for a shape."""
    shape_id: str
    slide_number: int
    shape_type: str
    alt_text: str
    original_text: str = ""
    slide_title: str = ""
    ocr_snippet: str = ""
    vision_seed: Optional[str] = None  # NEW: From vision model analysis
    bbox: Optional[BoundingBox] = None  # NEW: Bounding box for size checks
    issues: List[AltTextIssue] = Field(default_factory=list)
    is_problematic: bool = False
    is_decorative: bool = False  # NEW: Flag for decorative elements
    revised_alt_text: Optional[str] = None

    class Config:
        use_enum_values = True


class QAStats(BaseModel):
    """Statistics from the QA process."""
    total_processed: int = 0
    flagged_count: int = 0
    repaired_count: int = 0
    llm_reviewed_count: int = 0
    decorative_count: int = 0  # NEW: Count of decorative elements
    issues_by_type: Dict[str, int] = Field(default_factory=dict)


class QAResult(BaseModel):
    """Result of the QA process."""
    entries: List[AltTextEntry]
    stats: QAStats

    class Config:
        use_enum_values = True


# =============================================================================
# MAIN QA LAYER CLASS
# =============================================================================

class AltTextQualityLayer:
    """
    Quality Assurance layer for alt-text validation and improvement.

    Implements a two-phase approach:
    - Phase 1: Deterministic rule-based checks (including DECORATIVE detection)
    - Phase 2: Targeted LLM review for problematic entries
    """

    # Generic placeholder terms to detect
    PLACEHOLDER_PATTERNS = [
        r"^Bild\s*\d*$",
        r"^Grafik\s*\d*$",
        r"^Objekt\s*\d*$",
        r"^Unbenannt\s*\d*$",
        r"^Image\s*\d*$",
        r"^Picture\s*\d*$",
        r"^Object\s*\d*$",
        r"^Unnamed\s*\d*$",
        r"^Placeholder\s*\d*$",
        r"^Platzhalter\s*\d*$",
        r"^Foto\s*\d*$",
        r"^Photo\s*\d*$",
    ]

    # Shape types that are typically decorative
    DECORATIVE_SHAPE_TYPES = {
        "line",
        "connector",
        "freeform",
        "straightconnector",
        "curvedconnector",
        "elbowconnector",
    }

    # Length constraints
    MIN_LENGTH = 20
    MAX_LENGTH = 500

    def __init__(
        self,
        llm_host: Optional[str] = None,
        llm_model: Optional[str] = None,
        llm_timeout: float = 120.0,
        language: str = "de",
    ):
        """
        Initialize the QA layer.

        Args:
            llm_host: Ollama/LLM server host URL. Defaults to env var or localhost.
            llm_model: Model name to use. Defaults to env var or qwen2.5:14b.
            llm_timeout: Timeout for LLM requests in seconds.
            language: Language for prompts and prefixes ("de" or "en").
        """
        self.llm_host = llm_host or os.getenv("OLLAMA_HOST", "http://localhost:11434")
        self.llm_model = llm_model or os.getenv("LLM_MODEL", "qwen2.5:14b")
        self.llm_timeout = llm_timeout
        self.language = language

        # Get valid prefixes for the language
        self.valid_prefixes = get_valid_prefixes(language)

        # Compile placeholder patterns for efficiency
        self._placeholder_regex = [
            re.compile(pattern, re.IGNORECASE)
            for pattern in self.PLACEHOLDER_PATTERNS
        ]

        # Global context for repair prompts (set via set_global_context)
        self._global_context: str = ""

    def set_global_context(self, context: str) -> None:
        """
        Set the global context for repair prompts.

        This context is included in all LLM repair requests to provide
        presentation-wide information (glossary, themes, key terms).

        Args:
            context: The global context string.
        """
        self._global_context = context or ""

    def process(
        self,
        entries: List[Dict[str, Any]],
        global_context: Optional[str] = None,
    ) -> QAResult:
        """
        Run the full QA pipeline on alt-text entries.

        Args:
            entries: List of alt-text entries as dictionaries.
            global_context: Optional global context string for repair prompts.

        Returns:
            QAResult with processed entries and statistics.
        """
        # Set global context if provided
        if global_context is not None:
            self.set_global_context(global_context)

        if not entries:
            return QAResult(entries=[], stats=QAStats())

        # Convert dicts to AltTextEntry objects
        alt_entries = [self._dict_to_entry(e) for e in entries]

        # Phase 1: Deterministic checks (including DECORATIVE detection)
        alt_entries = self.deterministic_repair(alt_entries)

        # Phase 2: LLM review for problematic entries (skip decorative)
        alt_entries = self.llm_review_targeted(alt_entries)

        # Calculate statistics
        stats = self._calculate_stats(alt_entries)

        return QAResult(entries=alt_entries, stats=stats)

    def _dict_to_entry(self, data: Dict[str, Any]) -> AltTextEntry:
        """Convert a dictionary to an AltTextEntry object."""
        # Handle bbox if present
        bbox = None
        if "bbox" in data and data["bbox"]:
            bbox_data = data["bbox"]
            bbox = BoundingBox(
                left=float(bbox_data.get("left", bbox_data.get("left_pt", 0))),
                top=float(bbox_data.get("top", bbox_data.get("top_pt", 0))),
                width=float(bbox_data.get("width", bbox_data.get("width_pt", 100))),
                height=float(bbox_data.get("height", bbox_data.get("height_pt", 100))),
            )

        return AltTextEntry(
            shape_id=str(data.get("shape_id", "")),
            slide_number=int(data.get("slide_number", 0)),
            shape_type=str(data.get("shape_type", "")),
            alt_text=str(data.get("alt_text", "") or ""),
            original_text=str(data.get("original_text", "") or ""),
            slide_title=str(data.get("slide_title", "") or ""),
            ocr_snippet=str(data.get("ocr_snippet", "") or ""),
            vision_seed=data.get("vision_seed"),
            bbox=bbox,
        )

    def _calculate_stats(self, entries: List[AltTextEntry]) -> QAStats:
        """Calculate statistics from processed entries."""
        issues_by_type: Dict[str, int] = {}

        for entry in entries:
            for issue in entry.issues:
                issue_type = issue.issue_type if isinstance(issue.issue_type, str) else issue.issue_type.value
                issues_by_type[issue_type] = issues_by_type.get(issue_type, 0) + 1

        return QAStats(
            total_processed=len(entries),
            flagged_count=sum(1 for e in entries if e.is_problematic),
            repaired_count=sum(1 for e in entries if e.revised_alt_text is not None),
            llm_reviewed_count=sum(
                1 for e in entries
                if e.is_problematic and e.revised_alt_text is not None and not e.is_decorative
            ),
            decorative_count=sum(1 for e in entries if e.is_decorative),
            issues_by_type=issues_by_type,
        )

    # =========================================================================
    # PHASE 1: DETERMINISTIC CHECKS
    # =========================================================================

    def deterministic_repair(
        self,
        entries: List[AltTextEntry],
    ) -> List[AltTextEntry]:
        """
        Phase 1: Run deterministic checks on all entries.

        Checks performed:
        - DECORATIVE detection (tiny elements, lines, connectors)
        - Duplicate detection across slides
        - Format validation (prefix check)
        - Redundant text detection (alt-text == original text)
        - Length validation
        - Placeholder detection

        Args:
            entries: List of AltTextEntry objects to validate.

        Returns:
            The same entries with issues populated and flags set.
        """
        if not entries:
            return entries

        # Group entries by slide for duplicate detection
        slides: Dict[int, List[AltTextEntry]] = {}
        for entry in entries:
            if entry.slide_number not in slides:
                slides[entry.slide_number] = []
            slides[entry.slide_number].append(entry)

        # Check each entry
        for entry in entries:
            # First check if decorative (skips other checks if true)
            if self._check_decorative(entry):
                entry.is_decorative = True
                entry.revised_alt_text = "DECORATIVE"
                continue

            # Regular checks for non-decorative elements
            self._check_duplicates(entry, slides.get(entry.slide_number, []))
            self._check_prefix(entry)
            self._check_redundant_text(entry)
            self._check_length(entry)
            self._check_placeholder(entry)

            # Mark as problematic if any issues found
            entry.is_problematic = len(entry.issues) > 0

        return entries

    def _check_decorative(self, entry: AltTextEntry) -> bool:
        """
        Check if element should be marked as decorative.

        Decorative elements include:
        - Tiny elements (< 20x20 px)
        - Lines and connectors
        - Shapes with no content that are very thin
        - Background shapes (very large with no text)

        Returns:
            True if element should be marked as DECORATIVE.
        """
        # Check by shape type
        shape_type_lower = entry.shape_type.lower()
        if shape_type_lower in self.DECORATIVE_SHAPE_TYPES:
            entry.issues.append(AltTextIssue(
                issue_type=IssueType.DECORATIVE,
                description=f"Shape type '{entry.shape_type}' is typically decorative",
                severity=IssueSeverity.INFO,
            ))
            return True

        # Check by bounding box
        if entry.bbox:
            # Tiny elements (icons, bullets)
            if entry.bbox.is_tiny:
                entry.issues.append(AltTextIssue(
                    issue_type=IssueType.DECORATIVE,
                    description=f"Element is tiny ({entry.bbox.width:.0f}x{entry.bbox.height:.0f} pt)",
                    severity=IssueSeverity.INFO,
                ))
                return True

            # Line-like elements (very thin)
            if entry.bbox.is_line_like:
                entry.issues.append(AltTextIssue(
                    issue_type=IssueType.DECORATIVE,
                    description="Element is line-like (very thin)",
                    severity=IssueSeverity.INFO,
                ))
                return True

            # Large background shapes with no text
            if (entry.bbox.area > 100000 and  # Large area
                not entry.original_text.strip() and
                not entry.ocr_snippet.strip() and
                shape_type_lower in ("rectangle", "shape", "autoshape")):
                entry.issues.append(AltTextIssue(
                    issue_type=IssueType.DECORATIVE,
                    description="Large background shape without content",
                    severity=IssueSeverity.INFO,
                ))
                return True

        # Check alt-text itself for DECORATIVE marker
        if entry.alt_text.strip().upper() == "DECORATIVE":
            return True

        return False

    def _check_duplicates(
        self,
        entry: AltTextEntry,
        slide_entries: List[AltTextEntry],
    ) -> None:
        """Check if this alt-text is duplicated on the same slide."""
        if not entry.alt_text.strip():
            return

        # Skip decorative entries in duplicate check
        non_decorative = [e for e in slide_entries if not e.is_decorative]
        if not non_decorative:
            return

        # Count occurrences of this alt-text on the slide
        alt_texts = [e.alt_text.strip().lower() for e in non_decorative]
        count = Counter(alt_texts)[entry.alt_text.strip().lower()]

        if count > 1:
            entry.issues.append(AltTextIssue(
                issue_type=IssueType.DUPLICATE,
                description=f"Alt-text appears {count} times on slide {entry.slide_number}",
                severity=IssueSeverity.WARNING,
            ))

    def _check_prefix(self, entry: AltTextEntry) -> None:
        """Check if alt-text starts with a valid prefix."""
        if not entry.alt_text.strip():
            return

        text = entry.alt_text.strip()
        has_valid_prefix = any(
            text.startswith(prefix) for prefix in self.valid_prefixes
        )

        if not has_valid_prefix:
            entry.issues.append(AltTextIssue(
                issue_type=IssueType.MISSING_PREFIX,
                description=f"Alt-text should start with a prefix like {', '.join(self.valid_prefixes[:3])}...",
                severity=IssueSeverity.WARNING,
            ))

    def _check_redundant_text(self, entry: AltTextEntry) -> None:
        """Check if alt-text is identical to the original text or OCR text."""
        if not entry.alt_text.strip():
            return

        alt_normalized = entry.alt_text.strip().lower()

        # Check against original text
        if entry.original_text.strip():
            orig_normalized = entry.original_text.strip().lower()
            if alt_normalized == orig_normalized:
                entry.issues.append(AltTextIssue(
                    issue_type=IssueType.REDUNDANT_TEXT,
                    description="Alt-text is identical to the shape's visible text content",
                    severity=IssueSeverity.ERROR,
                ))
                return

        # Check against OCR text
        if entry.ocr_snippet.strip():
            ocr_normalized = entry.ocr_snippet.strip().lower()
            if alt_normalized == ocr_normalized:
                entry.issues.append(AltTextIssue(
                    issue_type=IssueType.REDUNDANT_TEXT,
                    description="Alt-text is identical to OCR-extracted text",
                    severity=IssueSeverity.ERROR,
                ))

    def _check_length(self, entry: AltTextEntry) -> None:
        """Check if alt-text length is within acceptable bounds."""
        if not entry.alt_text.strip():
            return

        length = len(entry.alt_text.strip())

        if length < self.MIN_LENGTH:
            entry.issues.append(AltTextIssue(
                issue_type=IssueType.TOO_SHORT,
                description=f"Alt-text is too short ({length} chars, minimum {self.MIN_LENGTH})",
                severity=IssueSeverity.WARNING,
            ))
        elif length > self.MAX_LENGTH:
            entry.issues.append(AltTextIssue(
                issue_type=IssueType.TOO_LONG,
                description=f"Alt-text is too long ({length} chars, maximum {self.MAX_LENGTH})",
                severity=IssueSeverity.WARNING,
            ))

    def _check_placeholder(self, entry: AltTextEntry) -> None:
        """Check if alt-text is a generic placeholder."""
        if not entry.alt_text.strip():
            return

        text = entry.alt_text.strip()

        for pattern in self._placeholder_regex:
            if pattern.match(text):
                entry.issues.append(AltTextIssue(
                    issue_type=IssueType.PLACEHOLDER,
                    description=f"Alt-text appears to be a generic placeholder: '{text}'",
                    severity=IssueSeverity.ERROR,
                ))
                break

    # =========================================================================
    # PHASE 2: LLM REVIEW
    # =========================================================================

    def llm_review_targeted(
        self,
        entries: List[AltTextEntry],
    ) -> List[AltTextEntry]:
        """
        Phase 2: Use LLM to rewrite problematic alt-texts.

        Only processes entries flagged as problematic in Phase 1.
        Skips decorative elements (they don't need alt-text).

        Args:
            entries: List of AltTextEntry objects (some may be flagged).

        Returns:
            Entries with revised_alt_text populated for successfully reviewed items.
        """
        # Filter to only problematic, non-decorative entries
        problematic = [
            e for e in entries
            if e.is_problematic and not e.is_decorative
        ]

        if not problematic:
            return entries

        # Process each problematic entry
        for entry in problematic:
            try:
                revised = self._request_llm_revision(entry)
                if revised:
                    # Check if LLM marked as decorative
                    if revised.strip().upper() == "DECORATIVE":
                        entry.is_decorative = True
                        entry.revised_alt_text = "DECORATIVE"
                    else:
                        entry.revised_alt_text = revised
            except Exception:
                # Log error but continue processing other entries
                pass

        return entries

    def _request_llm_revision(self, entry: AltTextEntry) -> Optional[str]:
        """
        Request the LLM to revise a problematic alt-text.

        Args:
            entry: The alt-text entry to revise.

        Returns:
            The revised alt-text, or None if the request failed.
        """
        # Build issue descriptions
        issues = [
            f"{issue.issue_type}: {issue.description}"
            for issue in entry.issues
        ]

        # Build the repair prompt using the template
        user_prompt = build_repair_prompt(
            current_alttext=entry.alt_text,
            issues=issues,
            slide_title=entry.slide_title,
            shape_type=entry.shape_type,
            visible_text=entry.original_text,
            ocr_text=entry.ocr_snippet,
            vision_seed=entry.vision_seed or "",
            global_context=self._global_context,
        )

        system_prompt = get_alttext_system_prompt(self.language)

        try:
            response = httpx.post(
                f"{self.llm_host}/api/generate",
                json={
                    "model": self.llm_model,
                    "prompt": user_prompt,
                    "system": system_prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.3,
                        "num_ctx": 4096,
                    },
                },
                timeout=self.llm_timeout,
            )
            response.raise_for_status()

            result = response.json()
            revised = result.get("response", "").strip()

            # Accept DECORATIVE responses
            if revised.upper() == "DECORATIVE":
                return "DECORATIVE"

            # Validate the revised text
            if revised and len(revised) >= self.MIN_LENGTH:
                return revised

            return None

        except (httpx.HTTPError, KeyError, ValueError):
            return None

    # =========================================================================
    # SERIALIZATION
    # =========================================================================

    def to_dict(self, result: QAResult) -> Dict[str, Any]:
        """
        Convert QAResult to a dictionary for JSON serialization.

        Args:
            result: The QAResult to convert.

        Returns:
            Dictionary representation of the result.
        """
        return {
            "stats": result.stats.model_dump(),
            "entries": [
                {
                    "shape_id": e.shape_id,
                    "slide_number": e.slide_number,
                    "shape_type": e.shape_type,
                    "original_alt_text": e.alt_text,
                    "revised_alt_text": e.revised_alt_text,
                    "is_problematic": e.is_problematic,
                    "is_decorative": e.is_decorative,
                    "issues": [
                        {
                            "type": i.issue_type if isinstance(i.issue_type, str) else i.issue_type.value,
                            "description": i.description,
                            "severity": i.severity if isinstance(i.severity, str) else i.severity.value,
                        }
                        for i in e.issues
                    ],
                }
                for e in result.entries
            ],
        }


# =============================================================================
# BACKWARDS COMPATIBILITY - Keep old dataclass-style interface working
# =============================================================================

# Re-export for backwards compatibility
__all__ = [
    "IssueType",
    "IssueSeverity",
    "BoundingBox",
    "AltTextIssue",
    "AltTextEntry",
    "QAStats",
    "QAResult",
    "AltTextQualityLayer",
]
