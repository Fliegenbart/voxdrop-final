from app.images.decorative_detector import classify_decorative


def test_classify_decorative_marks_small_generic_icon():
    reason = classify_decorative(
        {
            "existing_alt_text": "",
            "area_norm": 0.02,
            "width_norm": 0.12,
            "height_norm": 0.12,
            "top_norm": 0.42,
            "left_norm": 0.33,
        },
        image_counts={},
        slide_number=5,
    )

    assert reason == "small-icon"


def test_classify_decorative_marks_corner_branding_with_generic_alt():
    reason = classify_decorative(
        {
            "existing_alt_text": "",
            "area_norm": 0.04,
            "width_norm": 0.2,
            "height_norm": 0.12,
            "top_norm": 0.08,
            "left_norm": 0.8,
        },
        image_counts={},
        slide_number=6,
    )

    assert reason == "corner-branding"
