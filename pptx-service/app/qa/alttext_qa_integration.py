"""
Integration module for AltTextQualityLayer with the pptx-service pipeline.

Adapts between the alt-text dict format used by pptx_generate_alttexts.py
and the QA layer's list-based format.

Key features:
- Extracts bbox data from modelpack for DECORATIVE detection
- Handles DECORATIVE elements (maps to empty alt-text for PDF/UA)
- Provides both full QA and deterministic-only modes
- Phase 2: GlobalContextManager for presentation-wide context
- Phase 2: VisionCaptioner for image analysis
"""

import os
from typing import Any, Dict, List, Optional, Tuple

from .alttext_manager import AltTextQualityLayer, QAResult, AltTextEntry, BoundingBox
from .context_engine import GlobalContextManager, get_context_manager
from .vision_captioner import VisionCaptioner, get_vision_captioner


# Configuration
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434")
LLM_MODEL = os.getenv("LLM_MODEL", "qwen2.5:14b")
VLM_MODEL = os.getenv("VLM_MODEL", "Qwen/Qwen3-VL-8B-Instruct-FP8")


def run_alttext_qa(
    alttexts: Dict[str, str],
    modelpack: Dict[str, Any],
    ir_data: Optional[Dict[str, Any]] = None,
    llm_host: Optional[str] = None,
    llm_model: Optional[str] = None,
    language: str = "de",
    use_context: bool = True,
    use_vision: bool = False,
    image_data: Optional[Dict[str, bytes]] = None,
) -> Tuple[Dict[str, str], Dict[str, Any]]:
    """
    Run QA validation and improvement on generated alt-texts.

    Args:
        alttexts: Dict mapping shape_id to alt-text string
        modelpack: The modelpack containing slide/shape metadata
        ir_data: Optional IR data containing bbox information
        llm_host: Optional LLM host URL (defaults to OLLAMA_URL env var)
        llm_model: Optional LLM model name (defaults to LLM_MODEL env var)
        language: Language for prompts ("de" or "en")
        use_context: If True, extract and use global context (Phase 2)
        use_vision: If True, generate vision seeds for images (Phase 2)
        image_data: Optional dict mapping shape_id to image bytes for vision

    Returns:
        Tuple of:
        - Improved alt-texts dict (with revised texts, DECORATIVE becomes "")
        - QA statistics dict
    """
    if not alttexts:
        return alttexts, {
            "total": 0,
            "flagged": 0,
            "improved": 0,
            "decorative": 0,
            "issues": {},
            "context_extracted": False,
            "vision_seeds_generated": 0,
        }

    host = llm_host or OLLAMA_URL
    model = llm_model or LLM_MODEL

    # Phase 2: Extract global context
    global_context = ""
    context_extracted = False
    if use_context:
        try:
            context_manager = get_context_manager(llm_host=host, llm_model=model)
            presentation_context = context_manager.extract_context(modelpack)
            global_context = presentation_context.to_context_string()
            context_extracted = bool(global_context)
            print(f"[QA] Extracted global context: {len(global_context)} chars")
        except Exception as e:
            print(f"[QA] Failed to extract global context: {e}")

    # Phase 2: Generate vision seeds for images
    vision_seeds: Dict[str, str] = {}
    if use_vision and image_data:
        try:
            vision_seeds = _generate_vision_seeds(
                image_data=image_data,
                modelpack=modelpack,
                llm_host=host,
                language=language,
            )
            print(f"[QA] Generated {len(vision_seeds)} vision seeds")
        except Exception as e:
            print(f"[QA] Failed to generate vision seeds: {e}")

    # Convert alt-texts dict to QA layer format (with bbox data and vision seeds)
    entries = _convert_to_qa_format(alttexts, modelpack, ir_data, vision_seeds)

    # Initialize QA layer
    qa_layer = AltTextQualityLayer(
        llm_host=host,
        llm_model=model,
        language=language,
    )

    # Run QA process with global context
    result = qa_layer.process(entries, global_context=global_context)

    # Convert back to alt-texts dict format
    improved_alttexts = _convert_from_qa_result(alttexts, result)

    # Prepare statistics
    stats = {
        "total": result.stats.total_processed,
        "flagged": result.stats.flagged_count,
        "improved": result.stats.repaired_count,
        "llm_reviewed": result.stats.llm_reviewed_count,
        "decorative": result.stats.decorative_count,
        "issues": result.stats.issues_by_type,
        "context_extracted": context_extracted,
        "vision_seeds_generated": len(vision_seeds),
    }

    return improved_alttexts, stats


def run_alttext_qa_deterministic_only(
    alttexts: Dict[str, str],
    modelpack: Dict[str, Any],
    ir_data: Optional[Dict[str, Any]] = None,
) -> Tuple[Dict[str, str], Dict[str, Any]]:
    """
    Run only deterministic QA checks (no LLM calls).

    Useful for quick validation without the overhead of LLM revision.
    Still detects DECORATIVE elements.

    Args:
        alttexts: Dict mapping shape_id to alt-text string
        modelpack: The modelpack containing slide/shape metadata
        ir_data: Optional IR data containing bbox information

    Returns:
        Tuple of:
        - Alt-texts dict (DECORATIVE elements become "")
        - QA statistics dict with flagged issues
    """
    if not alttexts:
        return alttexts, {"total": 0, "flagged": 0, "decorative": 0, "issues": {}}

    # Convert alt-texts dict to QA layer format
    entries = _convert_to_qa_format(alttexts, modelpack, ir_data)

    # Initialize QA layer
    qa_layer = AltTextQualityLayer()

    # Convert to AltTextEntry objects
    qa_entries = [qa_layer._dict_to_entry(e) for e in entries]

    # Run only deterministic checks
    checked_entries = qa_layer.deterministic_repair(qa_entries)

    # Build result dict - convert DECORATIVE to empty string
    result_alttexts = dict(alttexts)
    decorative_count = 0
    for entry in checked_entries:
        if entry.is_decorative:
            result_alttexts[entry.shape_id] = ""  # Empty for PDF/UA
            decorative_count += 1

    # Count issues
    flagged = sum(1 for e in checked_entries if e.is_problematic and not e.is_decorative)
    issues: Dict[str, int] = {}
    for entry in checked_entries:
        for issue in entry.issues:
            issue_type = issue.issue_type if isinstance(issue.issue_type, str) else issue.issue_type.value
            issues[issue_type] = issues.get(issue_type, 0) + 1

    stats = {
        "total": len(checked_entries),
        "flagged": flagged,
        "decorative": decorative_count,
        "issues": issues,
    }

    return result_alttexts, stats


def _generate_vision_seeds(
    image_data: Dict[str, bytes],
    modelpack: Dict[str, Any],
    llm_host: str,
    language: str = "de",
) -> Dict[str, str]:
    """
    Generate vision seeds for image elements using VLM.

    Args:
        image_data: Dict mapping shape_id to image bytes
        modelpack: The modelpack for context
        llm_host: Ollama host URL
        language: Output language

    Returns:
        Dict mapping shape_id to vision description
    """
    if not image_data:
        return {}

    captioner = get_vision_captioner(
        llm_host=llm_host,
        language=language,
    )

    if not captioner.is_available():
        print("[QA] Vision model not available, skipping vision seeds")
        return {}

    # Build context lookup from modelpack
    shape_context: Dict[str, str] = {}
    for slide in modelpack.get("slides", []):
        slide_title = ""
        elements = slide.get("elements_in_reading_order", [])
        if elements:
            first_text = elements[0].get("text", "")
            if len(first_text) < 100:
                slide_title = first_text

        for elem in elements:
            shape_id = str(elem.get("shape_id", ""))
            if shape_id:
                shape_context[shape_id] = slide_title

    # Generate captions
    vision_seeds: Dict[str, str] = {}
    for shape_id, img_bytes in image_data.items():
        try:
            context = shape_context.get(shape_id, "")
            caption = captioner.generate_caption(
                image_bytes=img_bytes,
                context=context,
                shape_type="image",
            )
            if caption:
                vision_seeds[shape_id] = caption
        except Exception as e:
            print(f"[QA] Failed to generate vision seed for {shape_id}: {e}")

    return vision_seeds


def _convert_to_qa_format(
    alttexts: Dict[str, str],
    modelpack: Dict[str, Any],
    ir_data: Optional[Dict[str, Any]] = None,
    vision_seeds: Optional[Dict[str, str]] = None,
) -> List[Dict[str, Any]]:
    """
    Convert alt-texts dict to QA layer's expected list format.

    Enriches entries with metadata from the modelpack and IR data.
    Extracts bbox information for DECORATIVE detection.
    Includes vision seeds if available.
    """
    entries = []
    vision_seeds = vision_seeds or {}

    # Build a lookup of shape metadata from modelpack
    shape_metadata: Dict[str, Dict[str, Any]] = {}
    for slide in modelpack.get("slides", []):
        slide_number = slide.get("slide_index", 0) + 1  # Convert to 1-indexed
        slide_title = ""

        # Get slide title from first element if it looks like a title
        elements = slide.get("elements_in_reading_order", [])
        if elements:
            first_elem = elements[0]
            first_text = first_elem.get("text", "")
            if len(first_text) < 100:  # Titles are usually short
                slide_title = first_text

        for elem in elements:
            shape_id = str(elem.get("shape_id", ""))
            if shape_id:
                shape_metadata[shape_id] = {
                    "slide_number": slide_number,
                    "slide_title": slide_title,
                    "original_text": elem.get("text", ""),
                    "shape_type": _infer_shape_type(elem),
                    "has_hyperlink": bool(elem.get("hyperlink")),
                }

    # Build bbox lookup from IR data if available
    bbox_lookup: Dict[str, Dict[str, float]] = {}
    if ir_data:
        for slide in ir_data.get("slides", []):
            for shape in slide.get("shapes", []):
                shape_id = str(shape.get("shape_id", ""))
                bbox = shape.get("bbox", {})
                if shape_id and bbox:
                    bbox_lookup[shape_id] = {
                        "left": bbox.get("left_pt", 0),
                        "top": bbox.get("top_pt", 0),
                        "width": bbox.get("width_pt", 100),
                        "height": bbox.get("height_pt", 100),
                    }
                # Also check for shape type from IR
                if shape_id and shape.get("shape_type"):
                    if shape_id in shape_metadata:
                        shape_metadata[shape_id]["ir_shape_type"] = shape.get("shape_type")

    # Create entries for each alt-text
    for shape_id, alt_text in alttexts.items():
        metadata = shape_metadata.get(str(shape_id), {})
        bbox = bbox_lookup.get(str(shape_id))

        # Determine shape type (prefer IR data if available)
        shape_type = metadata.get("ir_shape_type") or metadata.get("shape_type", "unknown")

        entry = {
            "shape_id": shape_id,
            "slide_number": metadata.get("slide_number", 0),
            "shape_type": shape_type,
            "alt_text": alt_text,
            "original_text": metadata.get("original_text", ""),
            "slide_title": metadata.get("slide_title", ""),
        }

        # Add bbox if available
        if bbox:
            entry["bbox"] = bbox

        # Add vision seed if available (Phase 2)
        if shape_id in vision_seeds:
            entry["vision_seed"] = vision_seeds[shape_id]

        entries.append(entry)

    return entries


def _infer_shape_type(elem: Dict[str, Any]) -> str:
    """Infer the shape type from element properties."""
    text = elem.get("text", "")

    # Check for common patterns
    if elem.get("hyperlink"):
        return "link"

    # Check text patterns
    if not text:
        return "picture"

    # Check for list-like content (multiple lines with bullets/numbers)
    lines = text.strip().split("\n")
    if len(lines) > 2:
        first_chars = [l.strip()[0] if l.strip() else "" for l in lines[:5]]
        if all(c in "•-–—*123456789" for c in first_chars if c):
            return "list"

    # Check for year/date patterns (timeline elements)
    text_stripped = text.strip()
    if text_stripped.isdigit() and len(text_stripped) == 4:
        return "timeline_year"

    # Check for short text (likely title or label)
    if len(text) < 50:
        return "title"

    return "textbox"


def _convert_from_qa_result(
    original_alttexts: Dict[str, str],
    qa_result: QAResult,
) -> Dict[str, str]:
    """
    Convert QA result back to alt-texts dict format.

    - Uses revised alt-texts where available
    - Converts DECORATIVE to empty string (for PDF/UA compliance)
    - Keeps original otherwise
    """
    improved = dict(original_alttexts)

    for entry in qa_result.entries:
        if entry.is_decorative:
            # DECORATIVE elements get empty alt-text for PDF/UA
            improved[entry.shape_id] = ""
        elif entry.revised_alt_text and entry.revised_alt_text.upper() != "DECORATIVE":
            improved[entry.shape_id] = entry.revised_alt_text

    return improved


def get_decorative_shape_ids(qa_result: QAResult) -> List[str]:
    """
    Get list of shape IDs that should be marked as decorative.

    Useful for the PPTX injection step to properly mark these elements.
    """
    return [
        entry.shape_id
        for entry in qa_result.entries
        if entry.is_decorative
    ]


def extract_presentation_context(
    modelpack: Dict[str, Any],
    llm_host: Optional[str] = None,
    llm_model: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Extract global context from a presentation.

    Useful for getting glossary, acronyms, and key terms separately.

    Args:
        modelpack: The modelpack containing slide/shape metadata
        llm_host: Optional LLM host URL
        llm_model: Optional LLM model name

    Returns:
        Dict with acronyms, terms, keywords, title, theme
    """
    context_manager = get_context_manager(
        llm_host=llm_host or OLLAMA_URL,
        llm_model=llm_model or LLM_MODEL,
    )

    context = context_manager.extract_context(modelpack)

    return {
        "title": context.title,
        "theme": context.theme,
        "acronyms": context.acronyms,
        "terms": context.terms,
        "keywords": context.keywords,
        "slide_count": context.slide_count,
        "recurring_phrases": context.recurring_phrases,
    }
