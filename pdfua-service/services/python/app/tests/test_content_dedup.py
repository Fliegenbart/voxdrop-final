from app.deduplication.content_dedup import deduplicate_slide_content


def test_dedup_removes_redundant_blocks():
    slide = {
        "slide_summary": "Das Multiprojekt rvEvolution zielt darauf ab, das Kernsystem der DRV neu zu entwickeln.",
        "summary_points": [
            "Kernsystem der DRV wird modernisiert",
            "Zukunftsfähige Architektur",
        ],
        "diagram_summary": "Das Projekt rvEvolution zielt darauf ab, das Kernsystem der DRV zu modernisieren.",
        "structured_text": "rvEvolution: Kernsystem der DRV wird modernisiert und neu entwickelt.",
        "speaker_notes": "Zusätzlicher Kontext für das BMAS.",
    }

    result = deduplicate_slide_content(slide, threshold=0.6)
    types = [entry["type"] for entry in result["consolidated_content"]]

    # Structured content should survive; visual details are redundant and dropped.
    assert "structured_content" in types
    assert "visual_details" not in types
