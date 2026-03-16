"""
Unit tests for the AltTextQualityLayer.

Tests cover:
- Phase 1: Deterministic checks (duplicates, prefix, redundancy, length, placeholders)
- Phase 2: LLM review (mocked)
- Edge cases (empty inputs, malformed data)
"""

import pytest
from unittest.mock import patch, MagicMock

import sys
from pathlib import Path

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "src"))

from app.pipeline.qa.alttext_manager import (
    AltTextQualityLayer,
    AltTextEntry,
    AltTextIssue,
    IssueType,
    QAResult,
)


class TestAltTextQualityLayerInit:
    """Tests for AltTextQualityLayer initialization."""

    def test_default_initialization(self):
        """Test default initialization with environment defaults."""
        layer = AltTextQualityLayer()
        assert layer.llm_host == "http://localhost:11434"
        assert layer.llm_model == "qwen2.5:7b"
        assert layer.llm_timeout == 120.0

    def test_custom_initialization(self):
        """Test initialization with custom parameters."""
        layer = AltTextQualityLayer(
            llm_host="http://custom:8080",
            llm_model="qwen2.5:14b",
            llm_timeout=60.0,
        )
        assert layer.llm_host == "http://custom:8080"
        assert layer.llm_model == "qwen2.5:14b"
        assert layer.llm_timeout == 60.0


class TestDuplicateDetection:
    """Tests for duplicate alt-text detection."""

    def test_detects_duplicates_on_same_slide(self):
        """Duplicate alt-texts on the same slide should be flagged."""
        layer = AltTextQualityLayer()
        entries = [
            {
                "shape_id": "shape1",
                "slide_number": 1,
                "shape_type": "picture",
                "alt_text": "Bild: Ein Foto vom Team",
            },
            {
                "shape_id": "shape2",
                "slide_number": 1,
                "shape_type": "picture",
                "alt_text": "Bild: Ein Foto vom Team",
            },
        ]

        result = layer.process(entries)

        assert result.flagged_count == 2
        for entry in result.entries:
            assert entry.is_problematic
            assert any(i.issue_type == IssueType.DUPLICATE for i in entry.issues)

    def test_no_duplicates_on_different_slides(self):
        """Same alt-text on different slides should NOT be flagged as duplicate."""
        layer = AltTextQualityLayer()
        entries = [
            {
                "shape_id": "shape1",
                "slide_number": 1,
                "shape_type": "picture",
                "alt_text": "Bild: Ein wiederkehrendes Logo der Firma",
            },
            {
                "shape_id": "shape2",
                "slide_number": 2,
                "shape_type": "picture",
                "alt_text": "Bild: Ein wiederkehrendes Logo der Firma",
            },
        ]

        result = layer.process(entries)

        # Should not be flagged as duplicates (only other issues if any)
        for entry in result.entries:
            duplicate_issues = [i for i in entry.issues if i.issue_type == IssueType.DUPLICATE]
            assert len(duplicate_issues) == 0

    def test_case_insensitive_duplicate_detection(self):
        """Duplicate detection should be case-insensitive."""
        layer = AltTextQualityLayer()
        entries = [
            {
                "shape_id": "shape1",
                "slide_number": 1,
                "shape_type": "picture",
                "alt_text": "Bild: GROSSES FOTO",
            },
            {
                "shape_id": "shape2",
                "slide_number": 1,
                "shape_type": "picture",
                "alt_text": "Bild: grosses foto",
            },
        ]

        result = layer.process(entries)

        for entry in result.entries:
            assert any(i.issue_type == IssueType.DUPLICATE for i in entry.issues)


class TestPrefixValidation:
    """Tests for alt-text prefix validation."""

    @pytest.mark.parametrize("prefix", [
        "Folientitel:",
        "Liste:",
        "Bild:",
        "Diagramm:",
        "Tabelle:",
        "Grafik:",
        "Text:",
        "Form:",
        "SmartArt:",
        "Chart:",
        "Video:",
        "Audio:",
    ])
    def test_valid_prefixes_not_flagged(self, prefix):
        """Alt-texts with valid prefixes should not be flagged for missing prefix."""
        layer = AltTextQualityLayer()
        entries = [{
            "shape_id": "shape1",
            "slide_number": 1,
            "shape_type": "picture",
            "alt_text": f"{prefix} Dies ist eine ausreichend lange Beschreibung des Elements.",
        }]

        result = layer.process(entries)

        entry = result.entries[0]
        prefix_issues = [i for i in entry.issues if i.issue_type == IssueType.MISSING_PREFIX]
        assert len(prefix_issues) == 0

    def test_missing_prefix_flagged(self):
        """Alt-texts without a valid prefix should be flagged."""
        layer = AltTextQualityLayer()
        entries = [{
            "shape_id": "shape1",
            "slide_number": 1,
            "shape_type": "picture",
            "alt_text": "Dies ist ein Bild ohne korrekten Prefix am Anfang.",
        }]

        result = layer.process(entries)

        entry = result.entries[0]
        assert entry.is_problematic
        assert any(i.issue_type == IssueType.MISSING_PREFIX for i in entry.issues)

    def test_prefix_must_be_at_start(self):
        """Prefix in the middle of text should still be flagged."""
        layer = AltTextQualityLayer()
        entries = [{
            "shape_id": "shape1",
            "slide_number": 1,
            "shape_type": "picture",
            "alt_text": "Dies ist ein Bild: mit dem Prefix in der Mitte.",
        }]

        result = layer.process(entries)

        entry = result.entries[0]
        assert any(i.issue_type == IssueType.MISSING_PREFIX for i in entry.issues)


class TestRedundantTextDetection:
    """Tests for redundant text detection (alt-text == original text)."""

    def test_identical_text_flagged(self):
        """Alt-text identical to original text should be flagged."""
        layer = AltTextQualityLayer()
        entries = [{
            "shape_id": "shape1",
            "slide_number": 1,
            "shape_type": "textbox",
            "alt_text": "Willkommen zur Präsentation",
            "original_text": "Willkommen zur Präsentation",
        }]

        result = layer.process(entries)

        entry = result.entries[0]
        assert entry.is_problematic
        assert any(i.issue_type == IssueType.REDUNDANT_TEXT for i in entry.issues)

    def test_case_insensitive_redundancy(self):
        """Redundancy check should be case-insensitive."""
        layer = AltTextQualityLayer()
        entries = [{
            "shape_id": "shape1",
            "slide_number": 1,
            "shape_type": "textbox",
            "alt_text": "WILLKOMMEN ZUR PRÄSENTATION",
            "original_text": "willkommen zur präsentation",
        }]

        result = layer.process(entries)

        entry = result.entries[0]
        assert any(i.issue_type == IssueType.REDUNDANT_TEXT for i in entry.issues)

    def test_different_text_not_flagged(self):
        """Different alt-text and original text should not be flagged as redundant."""
        layer = AltTextQualityLayer()
        entries = [{
            "shape_id": "shape1",
            "slide_number": 1,
            "shape_type": "textbox",
            "alt_text": "Folientitel: Begrüßungsfolie mit Titel",
            "original_text": "Willkommen zur Präsentation",
        }]

        result = layer.process(entries)

        entry = result.entries[0]
        redundant_issues = [i for i in entry.issues if i.issue_type == IssueType.REDUNDANT_TEXT]
        assert len(redundant_issues) == 0

    def test_empty_original_text_not_flagged(self):
        """Empty original text should not trigger redundancy check."""
        layer = AltTextQualityLayer()
        entries = [{
            "shape_id": "shape1",
            "slide_number": 1,
            "shape_type": "picture",
            "alt_text": "Bild: Foto eines Gebäudes",
            "original_text": "",
        }]

        result = layer.process(entries)

        entry = result.entries[0]
        redundant_issues = [i for i in entry.issues if i.issue_type == IssueType.REDUNDANT_TEXT]
        assert len(redundant_issues) == 0


class TestLengthValidation:
    """Tests for alt-text length validation."""

    def test_too_short_flagged(self):
        """Alt-texts shorter than 20 characters should be flagged."""
        layer = AltTextQualityLayer()
        entries = [{
            "shape_id": "shape1",
            "slide_number": 1,
            "shape_type": "picture",
            "alt_text": "Bild: kurz",  # 10 chars
        }]

        result = layer.process(entries)

        entry = result.entries[0]
        assert entry.is_problematic
        assert any(i.issue_type == IssueType.TOO_SHORT for i in entry.issues)

    def test_too_long_flagged(self):
        """Alt-texts longer than 500 characters should be flagged."""
        layer = AltTextQualityLayer()
        long_text = "Bild: " + "x" * 500  # > 500 chars
        entries = [{
            "shape_id": "shape1",
            "slide_number": 1,
            "shape_type": "picture",
            "alt_text": long_text,
        }]

        result = layer.process(entries)

        entry = result.entries[0]
        assert entry.is_problematic
        assert any(i.issue_type == IssueType.TOO_LONG for i in entry.issues)

    def test_valid_length_not_flagged(self):
        """Alt-texts within valid length range should not be flagged for length."""
        layer = AltTextQualityLayer()
        entries = [{
            "shape_id": "shape1",
            "slide_number": 1,
            "shape_type": "picture",
            "alt_text": "Bild: Dies ist eine Beschreibung mit angemessener Länge.",  # ~55 chars
        }]

        result = layer.process(entries)

        entry = result.entries[0]
        length_issues = [i for i in entry.issues if i.issue_type in (IssueType.TOO_SHORT, IssueType.TOO_LONG)]
        assert len(length_issues) == 0

    def test_exactly_20_chars_valid(self):
        """Alt-text with exactly 20 characters should be valid."""
        layer = AltTextQualityLayer()
        entries = [{
            "shape_id": "shape1",
            "slide_number": 1,
            "shape_type": "picture",
            "alt_text": "Bild: 12345678901234",  # exactly 20 chars
        }]

        result = layer.process(entries)

        entry = result.entries[0]
        length_issues = [i for i in entry.issues if i.issue_type == IssueType.TOO_SHORT]
        assert len(length_issues) == 0

    def test_exactly_500_chars_valid(self):
        """Alt-text with exactly 500 characters should be valid."""
        layer = AltTextQualityLayer()
        entries = [{
            "shape_id": "shape1",
            "slide_number": 1,
            "shape_type": "picture",
            "alt_text": "Bild: " + "x" * 494,  # exactly 500 chars
        }]

        result = layer.process(entries)

        entry = result.entries[0]
        length_issues = [i for i in entry.issues if i.issue_type == IssueType.TOO_LONG]
        assert len(length_issues) == 0


class TestPlaceholderDetection:
    """Tests for generic placeholder detection."""

    @pytest.mark.parametrize("placeholder", [
        "Bild",
        "Bild 1",
        "Bild1",
        "Grafik",
        "Grafik 2",
        "Objekt",
        "Objekt 3",
        "Unbenannt",
        "Unbenannt 4",
        "Image",
        "Image 5",
        "Picture",
        "Picture 6",
        "Object",
        "Unnamed",
        "Placeholder",
        "Platzhalter",
    ])
    def test_placeholders_flagged(self, placeholder):
        """Generic placeholder terms should be flagged."""
        layer = AltTextQualityLayer()
        entries = [{
            "shape_id": "shape1",
            "slide_number": 1,
            "shape_type": "picture",
            "alt_text": placeholder,
        }]

        result = layer.process(entries)

        entry = result.entries[0]
        assert entry.is_problematic
        assert any(i.issue_type == IssueType.PLACEHOLDER for i in entry.issues)

    def test_placeholder_case_insensitive(self):
        """Placeholder detection should be case-insensitive."""
        layer = AltTextQualityLayer()
        entries = [{
            "shape_id": "shape1",
            "slide_number": 1,
            "shape_type": "picture",
            "alt_text": "BILD",
        }]

        result = layer.process(entries)

        entry = result.entries[0]
        assert any(i.issue_type == IssueType.PLACEHOLDER for i in entry.issues)

    def test_non_placeholder_not_flagged(self):
        """Descriptive text containing 'Bild' should not be flagged as placeholder."""
        layer = AltTextQualityLayer()
        entries = [{
            "shape_id": "shape1",
            "slide_number": 1,
            "shape_type": "picture",
            "alt_text": "Bild: Ein Foto des Firmengebäudes bei Sonnenuntergang",
        }]

        result = layer.process(entries)

        entry = result.entries[0]
        placeholder_issues = [i for i in entry.issues if i.issue_type == IssueType.PLACEHOLDER]
        assert len(placeholder_issues) == 0


class TestLLMReviewTargeted:
    """Tests for LLM-based alt-text revision."""

    @patch("httpx.post")
    def test_llm_called_for_problematic_entries(self, mock_post):
        """LLM should be called only for problematic entries."""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "response": "Bild: Eine verbesserte Beschreibung des Bildes mit ausreichender Länge."
        }
        mock_response.raise_for_status = MagicMock()
        mock_post.return_value = mock_response

        layer = AltTextQualityLayer()
        entries = [
            {
                "shape_id": "shape1",
                "slide_number": 1,
                "shape_type": "picture",
                "alt_text": "Bild",  # Placeholder - will be flagged
            },
            {
                "shape_id": "shape2",
                "slide_number": 1,
                "shape_type": "picture",
                "alt_text": "Bild: Eine ausreichend lange und gute Beschreibung.",  # Valid
            },
        ]

        result = layer.process(entries)

        # LLM should only be called once (for the problematic entry)
        assert mock_post.call_count == 1

        # The problematic entry should have a revised alt-text
        problematic_entry = next(e for e in result.entries if e.shape_id == "shape1")
        assert problematic_entry.revised_alt_text is not None

    @patch("httpx.post")
    def test_llm_not_called_when_no_issues(self, mock_post):
        """LLM should not be called when there are no problematic entries."""
        layer = AltTextQualityLayer()
        entries = [{
            "shape_id": "shape1",
            "slide_number": 1,
            "shape_type": "picture",
            "alt_text": "Bild: Eine perfekte Beschreibung mit korrektem Prefix und Länge.",
        }]

        result = layer.process(entries)

        mock_post.assert_not_called()
        assert result.llm_reviewed_count == 0

    @patch("httpx.post")
    def test_llm_revision_stored(self, mock_post):
        """Successful LLM revision should be stored in the entry."""
        revised_text = "Bild: Eine vom LLM verbesserte Beschreibung des Elements."
        mock_response = MagicMock()
        mock_response.json.return_value = {"response": revised_text}
        mock_response.raise_for_status = MagicMock()
        mock_post.return_value = mock_response

        layer = AltTextQualityLayer()
        entries = [{
            "shape_id": "shape1",
            "slide_number": 1,
            "shape_type": "picture",
            "alt_text": "Bild",  # Placeholder
        }]

        result = layer.process(entries)

        assert result.entries[0].revised_alt_text == revised_text

    @patch("httpx.post")
    def test_llm_error_handled_gracefully(self, mock_post):
        """LLM errors should not crash the pipeline."""
        mock_post.side_effect = Exception("Connection refused")

        layer = AltTextQualityLayer()
        entries = [{
            "shape_id": "shape1",
            "slide_number": 1,
            "shape_type": "picture",
            "alt_text": "Bild",  # Placeholder
        }]

        # Should not raise
        result = layer.process(entries)

        # Entry should still be marked as problematic but no revision
        assert result.entries[0].is_problematic
        assert result.entries[0].revised_alt_text is None

    @patch("httpx.post")
    def test_llm_short_response_rejected(self, mock_post):
        """LLM responses that are too short should be rejected."""
        mock_response = MagicMock()
        mock_response.json.return_value = {"response": "Kurz"}  # Too short
        mock_response.raise_for_status = MagicMock()
        mock_post.return_value = mock_response

        layer = AltTextQualityLayer()
        entries = [{
            "shape_id": "shape1",
            "slide_number": 1,
            "shape_type": "picture",
            "alt_text": "Bild",
        }]

        result = layer.process(entries)

        # Revision should be rejected due to length
        assert result.entries[0].revised_alt_text is None


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    def test_empty_entries_list(self):
        """Empty entries list should return empty result."""
        layer = AltTextQualityLayer()
        result = layer.process([])

        assert result.total_processed == 0
        assert result.flagged_count == 0
        assert result.entries == []

    def test_empty_alt_text(self):
        """Empty alt-text should not crash the checks."""
        layer = AltTextQualityLayer()
        entries = [{
            "shape_id": "shape1",
            "slide_number": 1,
            "shape_type": "picture",
            "alt_text": "",
        }]

        # Should not raise
        result = layer.process(entries)
        assert result.total_processed == 1

    def test_whitespace_only_alt_text(self):
        """Whitespace-only alt-text should be handled."""
        layer = AltTextQualityLayer()
        entries = [{
            "shape_id": "shape1",
            "slide_number": 1,
            "shape_type": "picture",
            "alt_text": "   ",
        }]

        result = layer.process(entries)
        assert result.total_processed == 1

    def test_missing_optional_fields(self):
        """Missing optional fields should not crash."""
        layer = AltTextQualityLayer()
        entries = [{
            "shape_id": "shape1",
            "slide_number": 1,
            "shape_type": "picture",
            "alt_text": "Bild: Test",
            # Missing: original_text, slide_title, ocr_snippet
        }]

        result = layer.process(entries)
        assert result.total_processed == 1

    def test_none_values_handled(self):
        """None values in optional fields should be handled."""
        layer = AltTextQualityLayer()
        entries = [{
            "shape_id": "shape1",
            "slide_number": 1,
            "shape_type": "picture",
            "alt_text": "Bild: Test description here",
            "original_text": None,
            "slide_title": None,
            "ocr_snippet": None,
        }]

        result = layer.process(entries)
        assert result.total_processed == 1

    def test_multiple_issues_detected(self):
        """An entry can have multiple issues."""
        layer = AltTextQualityLayer()
        entries = [{
            "shape_id": "shape1",
            "slide_number": 1,
            "shape_type": "picture",
            "alt_text": "kurz",  # Too short + No prefix + Potentially placeholder-like
        }]

        result = layer.process(entries)

        entry = result.entries[0]
        assert len(entry.issues) >= 2  # At least TOO_SHORT and MISSING_PREFIX


class TestQAResultSerialization:
    """Tests for QAResult serialization."""

    def test_to_dict_format(self):
        """to_dict should produce correct dictionary format."""
        layer = AltTextQualityLayer()
        entries = [{
            "shape_id": "shape1",
            "slide_number": 1,
            "shape_type": "picture",
            "alt_text": "Bild: Eine ausreichend lange Beschreibung.",
        }]

        result = layer.process(entries)
        result_dict = layer.to_dict(result)

        assert "total_processed" in result_dict
        assert "flagged_count" in result_dict
        assert "repaired_count" in result_dict
        assert "llm_reviewed_count" in result_dict
        assert "entries" in result_dict
        assert isinstance(result_dict["entries"], list)

    def test_to_dict_entry_format(self):
        """Entry dictionaries should have correct format."""
        layer = AltTextQualityLayer()
        entries = [{
            "shape_id": "shape1",
            "slide_number": 1,
            "shape_type": "picture",
            "alt_text": "Bild",  # Will be flagged
        }]

        result = layer.process(entries)
        result_dict = layer.to_dict(result)

        entry_dict = result_dict["entries"][0]
        assert "shape_id" in entry_dict
        assert "slide_number" in entry_dict
        assert "shape_type" in entry_dict
        assert "original_alt_text" in entry_dict
        assert "revised_alt_text" in entry_dict
        assert "is_problematic" in entry_dict
        assert "issues" in entry_dict

    def test_to_dict_issue_format(self):
        """Issue dictionaries should have correct format."""
        layer = AltTextQualityLayer()
        entries = [{
            "shape_id": "shape1",
            "slide_number": 1,
            "shape_type": "picture",
            "alt_text": "Bild",  # Placeholder
        }]

        result = layer.process(entries)
        result_dict = layer.to_dict(result)

        issues = result_dict["entries"][0]["issues"]
        assert len(issues) > 0

        issue = issues[0]
        assert "type" in issue
        assert "description" in issue
        assert "severity" in issue


class TestDeterministicRepairOnly:
    """Tests for running only the deterministic repair phase."""

    def test_deterministic_repair_without_llm(self):
        """deterministic_repair can be called independently."""
        layer = AltTextQualityLayer()

        # Create entries directly
        entries = [
            AltTextEntry(
                shape_id="shape1",
                slide_number=1,
                shape_type="picture",
                alt_text="Bild",
            ),
            AltTextEntry(
                shape_id="shape2",
                slide_number=1,
                shape_type="picture",
                alt_text="Bild: Eine gute Beschreibung.",
            ),
        ]

        result = layer.deterministic_repair(entries)

        assert result[0].is_problematic  # Placeholder
        assert not result[1].is_problematic  # Valid (short but might pass other checks)

    def test_empty_list_deterministic_repair(self):
        """deterministic_repair handles empty list."""
        layer = AltTextQualityLayer()
        result = layer.deterministic_repair([])
        assert result == []
