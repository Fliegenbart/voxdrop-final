from app.filters.internal_comment_filter import filter_internal_comments


def test_filter_removes_todo_lines():
    text = "TODO: Titel anpassen\nInhalt bleibt."
    cleaned, removed = filter_internal_comments(text)
    assert "TODO" not in cleaned
    assert removed


def test_filter_flags_uncertain_sentences():
    text = "Die Folie wird noch überarbeitet und angepasst."
    cleaned, removed = filter_internal_comments(text)
    # Heuristic path uses [PRÜFEN] if below threshold.
    assert "[PRÜFEN]" in cleaned or removed


def test_filter_keeps_regular_text():
    text = "Das ist ein normaler Satz ohne Hinweise."
    cleaned, removed = filter_internal_comments(text)
    assert cleaned == text
    assert not removed
