"""
Slide Classifier - Determines if a slide is simple (text-only) or complex (needs VLM).

Simple slides: Only text, no images or charts -> Skip VLM, save time
Complex slides: Has images, charts, or diagrams -> Needs VLM for alt-text
"""
from typing import Dict, Any, Literal, List
from statistics import median

SlideComplexity = Literal["simple", "complex"]
SlideVisualType = Literal["none", "image", "chart", "timeline", "diagram", "org", "infographic"]

# Thresholds for detecting complex slides
DIAGRAM_SHAPE_THRESHOLD = 5  # Slides with this many shapes might be diagrams
DIAGRAM_LINE_THRESHOLD = 2   # Slides with this many lines likely have connections/flowcharts
DIAGRAM_TOTAL_THRESHOLD = 10  # Total shapes including text boxes
MIN_ELEMENTS_FOR_SUMMARY = 5  # Slides with 5+ elements need a summary regardless of type

# NEW: Fragmentation thresholds (for timelines, infographics with many small text boxes)
FRAGMENTED_TEXT_BOX_THRESHOLD = 25  # Many text boxes
FRAGMENTED_MEDIAN_LEN_THRESHOLD = 15  # Short median text length
HIGH_SHAPE_COUNT_THRESHOLD = 35  # Very many shapes total


def _get_text_lengths(shapes: List[Dict[str, Any]]) -> List[int]:
    """Extract text lengths from all shapes that have text content."""
    lengths = []
    for shape in shapes:
        text = shape.get("text", "")
        if text and isinstance(text, str):
            text = text.strip()
            if text:
                lengths.append(len(text))
    return lengths


def _get_text_lengths_from_content(text_content: List[Dict[str, Any]]) -> List[int]:
    """Extract text lengths from text_content items (pure text shapes)."""
    lengths = []
    for item in text_content:
        content = item.get("content", "")
        if content and isinstance(content, str):
            # Split by newlines to count individual text blocks
            for line in content.split("\n"):
                line = line.strip()
                if line:
                    lengths.append(len(line))
    return lengths


def _count_text_containers(shapes: List[Dict[str, Any]]) -> int:
    """Count shapes that contain text (text boxes, placeholders, etc.)."""
    count = 0
    for shape in shapes:
        text = shape.get("text", "")
        if text and isinstance(text, str) and text.strip():
            count += 1
    return count


def classify_slide(slide: Dict[str, Any]) -> SlideComplexity:
    """
    Classify a slide as simple or complex based on its content.

    Simple slides:
    - Only text content
    - No images
    - No charts
    - Tables are considered simple (can be made accessible with HTML)

    Complex slides:
    - Contains images (need alt-text via VLM)
    - Contains charts (need description via VLM)
    - Contains grouped shapes with images
    - Contains many shapes that form a diagram (flowchart, org chart, etc.)
    - Highly fragmented text (many short text boxes = timeline/infographic)
    """
    shapes = slide.get("shapes", [])
    images = slide.get("images", [])
    text_content = slide.get("text_content", [])  # Text shapes are stored here!
    slide_num = slide.get('slide_number', '?')

    # Combine shapes and text_content for analysis
    # Text shapes go to text_content, other shapes go to shapes
    all_elements = shapes + text_content
    total_elements = len(all_elements) + len(images)

    # === DETAILED LOGGING FOR DEBUGGING ===
    # Count text from both shapes (auto shapes with text) and text_content (pure text boxes)
    text_container_count = _count_text_containers(shapes) + len(text_content)
    text_lengths = _get_text_lengths(shapes) + _get_text_lengths_from_content(text_content)
    total_text_chars = sum(text_lengths) if text_lengths else 0
    median_len = median(text_lengths) if text_lengths else 0
    short_boxes = sum(1 for l in text_lengths if l <= 3)  # Jahreszahlen, Häkchen, kurze Labels

    print(f"[Classifier] === SLIDE {slide_num} METRICS ===")
    print(f"[Classifier]   num_shapes: {len(shapes)}")
    print(f"[Classifier]   num_text_content: {len(text_content)}")
    print(f"[Classifier]   num_images: {len(images)}")
    print(f"[Classifier]   total_elements: {total_elements}")
    print(f"[Classifier]   num_text_containers: {text_container_count}")
    print(f"[Classifier]   total_text_chars: {total_text_chars}")
    print(f"[Classifier]   median_text_len: {median_len:.1f}")
    print(f"[Classifier]   num_short_boxes (<=3 chars): {short_boxes}")
    print(f"[Classifier]   text_lengths: {sorted(text_lengths)[:20]}{'...' if len(text_lengths) > 20 else ''}")

    # === CHECK 1: Total element count ===
    if total_elements >= MIN_ELEMENTS_FOR_SUMMARY:
        print(
            f"[Classifier] Slide {slide_num} has {total_elements} elements (>= {MIN_ELEMENTS_FOR_SUMMARY}) -> needs summary"
        )
        slide["needs_summary"] = True

    # === CHECK 2: Very high shape count (timeline, complex infographic) ===
    if len(shapes) >= HIGH_SHAPE_COUNT_THRESHOLD:
        print(f"[Classifier] Slide {slide_num} has {len(shapes)} shapes (>= {HIGH_SHAPE_COUNT_THRESHOLD}) -> complex infographic")
        slide["is_visual_diagram"] = True
        slide["visual_type"] = "infographic"
        return "complex"

    # === CHECK 3: Fragmentation detection (many small text boxes = timeline/infographic) ===
    # Note: text_container_count, text_lengths, median_len already calculated above in logging

    if text_lengths:
        # Many text boxes with short median length = highly fragmented (timeline, org chart, etc.)
        if text_container_count >= FRAGMENTED_TEXT_BOX_THRESHOLD and median_len <= FRAGMENTED_MEDIAN_LEN_THRESHOLD:
            print(f"[Classifier] Slide {slide_num} is fragmented: {text_container_count} text containers, median length {median_len:.1f} chars -> timeline/infographic")
            slide["is_visual_diagram"] = True
            slide["is_fragmented"] = True
            slide["visual_type"] = "timeline"
            return "complex"

    # Default visual type (will be refined below)
    slide["visual_type"] = "none"

    # === CHECK 4: Images without proper alt-text ===
    if images:
        slide["visual_type"] = "image"
        for img in images:
            existing_alt = img.get("existing_alt_text", "")
            if not existing_alt or len(existing_alt) < 10:
                return "complex"

    # === CHECK 5: Charts ===
    if slide.get("has_chart", False):
        slide["visual_type"] = "chart"
        return "complex"

    # === CHECK 6: Grouped shapes with images ===
    for shape in shapes:
        if shape.get("type") == "group":
            group_images = shape.get("images", [])
            if group_images:
                return "complex"
        if shape.get("type") == "chart":
            return "complex"

    # === CHECK 7: Diagram-like patterns (shape types) ===
    auto_shapes = 0
    lines = 0
    text_boxes = 0
    for shape in shapes:
        shape_type = shape.get("shape_type", "")
        if "AUTO_SHAPE" in shape_type or shape_type == "AUTO_SHAPE (1)":
            auto_shapes += 1
        if "LINE" in shape_type or shape_type == "LINE (9)":
            lines += 1
        if "TEXT_BOX" in shape_type or shape_type == "TEXT_BOX (17)":
            text_boxes += 1

    total_visual_shapes = auto_shapes + lines + text_boxes

    # Many shapes + lines = likely a diagram (flowchart, process, org chart)
    if auto_shapes >= DIAGRAM_SHAPE_THRESHOLD or lines >= DIAGRAM_LINE_THRESHOLD:
        print(f"[Classifier] Slide {slide_num} detected as diagram: {auto_shapes} shapes, {lines} lines, {text_boxes} text boxes")
        slide["is_visual_diagram"] = True
        slide["visual_type"] = "diagram"
        return "complex"

    # Many text boxes with shapes = infographic or complex overview
    if text_boxes >= 4 and auto_shapes >= 2:
        print(f"[Classifier] Slide {slide_num} detected as infographic: {auto_shapes} shapes, {text_boxes} text boxes")
        slide["is_visual_diagram"] = True
        slide["visual_type"] = "infographic"
        return "complex"

    # High total count of visual elements
    if total_visual_shapes >= DIAGRAM_TOTAL_THRESHOLD:
        print(f"[Classifier] Slide {slide_num} detected as complex: {total_visual_shapes} total visual shapes")
        slide["is_visual_diagram"] = True
        slide["visual_type"] = "infographic"
        return "complex"

    # Lots of shapes in general might be a complex visual
    if len(shapes) >= DIAGRAM_TOTAL_THRESHOLD:
        print(f"[Classifier] Slide {slide_num} detected as complex: {len(shapes)} total shapes")
        slide["is_visual_diagram"] = True
        slide["visual_type"] = "infographic"
        return "complex"

    # Fragmented slides tend to be timelines/infographics; keep that hint.
    if slide.get("is_fragmented"):
        slide["visual_type"] = "timeline"

    # No images or charts -> simple slide
    print(f"[Classifier] Slide {slide_num} -> SIMPLE (no triggers matched)")
    return "simple"


def get_slide_statistics(slides: list) -> Dict[str, Any]:
    """
    Get statistics about slide complexity distribution.
    """
    total = len(slides)
    simple = sum(1 for s in slides if s.get("complexity") == "simple")
    complex_slides = total - simple
    fragmented = sum(1 for s in slides if s.get("is_fragmented", False))

    total_images = sum(len(s.get("images", [])) for s in slides)
    charts = sum(1 for s in slides if s.get("has_chart", False))
    tables = sum(1 for s in slides if s.get("has_table", False))

    return {
        "total_slides": total,
        "simple_slides": simple,
        "complex_slides": complex_slides,
        "fragmented_slides": fragmented,
        "total_images": total_images,
        "charts": charts,
        "tables": tables,
        "vlm_calls_needed": total_images,
        "estimated_time_savings_seconds": simple * 1.5,
    }
