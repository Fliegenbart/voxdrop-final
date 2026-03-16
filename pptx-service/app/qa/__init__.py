"""QA module for alt-text validation and improvement."""

from .alttext_manager import (
    AltTextEntry,
    AltTextIssue,
    AltTextQualityLayer,
    BoundingBox,
    IssueSeverity,
    IssueType,
    QAResult,
    QAStats,
)
from .alttext_qa_integration import (
    run_alttext_qa,
    run_alttext_qa_deterministic_only,
    get_decorative_shape_ids,
    extract_presentation_context,
)
from .prompts import (
    VALID_PREFIXES_DE,
    VALID_PREFIXES_EN,
    get_valid_prefixes,
    get_alttext_system_prompt,
    build_repair_prompt,
    GLOSSARY_EXTRACTION_PROMPT,
)
from .context_engine import (
    GlobalContextManager,
    PresentationContext,
    GlossaryEntry,
    get_context_manager,
)
from .vision_captioner import (
    VisionCaptioner,
    get_vision_captioner,
    reset_captioner,
)
from .compliance_checker import (
    AccessibilityValidator,
    ComplianceReport,
    validate_pdf_accessibility,
    validate_pdf_accessibility_async,
)

__all__ = [
    # Core classes
    "AltTextQualityLayer",
    "AltTextEntry",
    "AltTextIssue",
    "BoundingBox",
    "IssueSeverity",
    "IssueType",
    "QAResult",
    "QAStats",
    # Integration functions
    "run_alttext_qa",
    "run_alttext_qa_deterministic_only",
    "get_decorative_shape_ids",
    "extract_presentation_context",
    # Prompt utilities
    "VALID_PREFIXES_DE",
    "VALID_PREFIXES_EN",
    "get_valid_prefixes",
    "get_alttext_system_prompt",
    "build_repair_prompt",
    "GLOSSARY_EXTRACTION_PROMPT",
    # Context engine
    "GlobalContextManager",
    "PresentationContext",
    "GlossaryEntry",
    "get_context_manager",
    # Vision captioner
    "VisionCaptioner",
    "get_vision_captioner",
    "reset_captioner",
    # Compliance checker
    "AccessibilityValidator",
    "ComplianceReport",
    "validate_pdf_accessibility",
    "validate_pdf_accessibility_async",
]
