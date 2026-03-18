import sys
from types import SimpleNamespace

sys.modules.setdefault("pdf2image", SimpleNamespace(convert_from_path=lambda *args, **kwargs: []))
sys.modules.setdefault("pypdf", SimpleNamespace(PdfReader=object))

from app.processors.html_builder import build_slide_html_v2


def test_build_slide_html_does_not_render_pseudo_tables_without_header_evidence():
    slide = {
        "slide_number": 12,
        "title": "Gemeinsam gestalten wir rvSystem",
        "text_content": [
            {"index": 0, "content": "Phase 1", "top_norm": 0.2, "left_norm": 0.12},
            {"index": 1, "content": "Analyse der aktuellen Prozesse", "top_norm": 0.2, "left_norm": 0.45},
            {"index": 2, "content": "Phase 2", "top_norm": 0.34, "left_norm": 0.12},
            {"index": 3, "content": "Gemeinsame Umsetzung und Governance", "top_norm": 0.34, "left_norm": 0.45},
        ],
        "text_ordered": [
            {"index": 0, "content": "Phase 1", "top_norm": 0.2, "left_norm": 0.12},
            {"index": 1, "content": "Analyse der aktuellen Prozesse", "top_norm": 0.2, "left_norm": 0.45},
            {"index": 2, "content": "Phase 2", "top_norm": 0.34, "left_norm": 0.12},
            {"index": 3, "content": "Gemeinsame Umsetzung und Governance", "top_norm": 0.34, "left_norm": 0.45},
        ],
        "images": [],
        "shapes": [],
        "risk_flags": [],
        "speaker_notes_visibility": "ignored",
    }

    html = build_slide_html_v2(slide, lang="de", output_mode="faithful_accessible")

    assert "<table" not in html
    assert "pseudo_table" in slide["risk_flags"]


def test_build_slide_html_renders_timeline_as_list_not_table():
    slide = {
        "slide_number": 8,
        "title": "Umsetzungsplanung",
        "slide_summary": "Die Folie zeigt die wichtigsten Umsetzungsschritte bis 2029.",
        "summary_structure": "timeline",
        "summary_points": [
            "2025: Start der Entwicklung",
            "2026 bis 2027: Umsetzung der Kernfunktionen",
            "2028 bis 2029: Rollout in die Linie",
        ],
        "text_content": [],
        "text_ordered": [],
        "images": [],
        "shapes": [],
        "risk_flags": [],
        "speaker_notes_visibility": "ignored",
    }

    html = build_slide_html_v2(slide, lang="de", output_mode="narrative_summary")

    assert "Zeitleiste" in html
    assert "<ol>" in html
    assert "<table" not in html


def test_build_slide_html_skips_visual_description_for_decorative_only_slide():
    slide = {
        "slide_number": 4,
        "title": "Projektstatus",
        "slide_summary": "Die Folie gibt einen kurzen Projektstatus.",
        "text_content": [],
        "text_ordered": [],
        "images": [
            {
                "decorative": True,
                "decorative_reason": "small-icon",
                "area_norm": 0.01,
                "width_norm": 0.08,
                "height_norm": 0.08,
                "data_uri": "data:image/png;base64,abc",
            }
        ],
        "shapes": [],
        "risk_flags": [],
        "speaker_notes_visibility": "ignored",
    }

    html = build_slide_html_v2(slide, lang="de", output_mode="narrative_summary")

    assert "Bildbeschreibung" not in html
    assert "decorative-image" not in html
    assert "<img" not in html


def test_build_slide_html_skips_small_generic_icon_images_in_narrative_mode():
    slide = {
        "slide_number": 9,
        "title": "Status",
        "slide_summary": "Die Folie fasst den Status zusammen.",
        "text_content": [],
        "text_ordered": [],
        "images": [
            {
                "existing_alt_text": "",
                "area_norm": 0.018,
                "width_norm": 0.12,
                "height_norm": 0.12,
                "data_uri": "data:image/png;base64,abc",
            }
        ],
        "shapes": [],
        "risk_flags": [],
        "speaker_notes_visibility": "ignored",
    }

    html = build_slide_html_v2(slide, lang="de", output_mode="narrative_summary")

    assert "<img" not in html
    assert "Bildbeschreibung" not in html
