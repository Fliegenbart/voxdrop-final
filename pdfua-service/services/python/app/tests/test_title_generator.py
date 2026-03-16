from app.title_inference.title_generator import ensure_slide_titles


def test_title_inference_prefers_top_placeholder_fallback_over_structured_card_heading():
    slides = [
        {
            "slide_number": 7,
            "title": "Folie 7",
            "text_content": [
                {
                    "content": "Unsere Ziele bis Ende 2029",
                    "top_norm": 0.08,
                    "font_size_max_pt": 34,
                    "is_bold": True,
                    "is_title": True,
                },
                {
                    "content": "AGILE",
                    "top_norm": 0.42,
                    "font_size_max_pt": 18,
                    "is_bold": True,
                },
            ],
            "structured_items": [{"heading": "AGILE", "body": ["Card content"]}],
        },
    ]

    ensure_slide_titles(slides)
    assert slides[0]["title"] == "Unsere Ziele bis Ende 2029"


def test_title_inference_can_correct_non_placeholder_when_top_band_strong():
    slides = [
        {
            "slide_number": 7,
            "title": "AGILE",
            "text_content": [
                {
                    "content": "Unsere Ziele bis Ende 2029",
                    "top_norm": 0.07,
                    "font_size_max_pt": 32,
                    "is_bold": True,
                    "is_title": True,
                },
                {"content": "AGILE", "top_norm": 0.35, "font_size_max_pt": 20, "is_bold": True},
            ],
            "structured_items": [{"heading": "AGILE", "body": ["Card content"]}],
        },
    ]

    ensure_slide_titles(slides, allow_non_placeholder_correction=True)
    assert slides[0]["title"] == "Unsere Ziele bis Ende 2029"


def test_title_inference_keeps_duplicate_title_stability():
    slides = [
        {"slide_number": 1, "title": "Agenda", "text_content": []},
        {"slide_number": 2, "title": "Agenda", "text_content": []},
    ]
    ensure_slide_titles(slides)
    assert slides[0]["title"] == "Agenda"
    assert slides[1]["title"] == "Agenda"


def test_title_inference_does_not_promote_card_heading_when_real_top_title_exists():
    slides = [
        {
            "slide_number": 9,
            "title": "Folie 9",
            "text_content": [
                {
                    "content": "Warum die Modernisierung dringend notwendig ist",
                    "top_norm": 0.10,
                    "font_size_max_pt": 28,
                    "is_bold": True,
                    "is_title": True,
                },
                {
                    "content": "AGILE",
                    "top_norm": 0.40,
                    "font_size_max_pt": 18,
                    "is_bold": True,
                },
            ],
            "structured_items": [{"heading": "AGILE", "body": ["x"]}],
        },
    ]

    ensure_slide_titles(slides)
    assert slides[0]["title"] == "Warum die Modernisierung dringend notwendig ist"
