"""
PDF/UA Compliance Validator using PyMuPDF.

This module provides validation of PDF files for accessibility compliance,
checking metadata, tagging, structure tree, and viewer preferences.
"""

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None


@dataclass
class ComplianceReport:
    """Result of PDF/UA compliance validation."""

    is_compliant: bool = True
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    stats: Dict[str, Any] = field(default_factory=dict)

    def add_error(self, message: str) -> None:
        """Add an error and mark as non-compliant."""
        self.errors.append(message)
        self.is_compliant = False

    def add_warning(self, message: str) -> None:
        """Add a warning (does not affect compliance status)."""
        self.warnings.append(message)

    @property
    def status(self) -> str:
        """Return compliance status string."""
        return "COMPLIANT" if self.is_compliant else "INCOMPLETE_COMPLIANCE"


class AccessibilityValidator:
    """PDF/UA Compliance Validator using PyMuPDF."""

    def __init__(self, pdf_path: str):
        """
        Initialize validator with PDF path.

        Args:
            pdf_path: Path to the PDF file to validate

        Raises:
            ImportError: If PyMuPDF is not installed
            FileNotFoundError: If PDF file does not exist
        """
        if fitz is None:
            raise ImportError(
                "PyMuPDF (fitz) is required for PDF validation. "
                "Install with: pip install PyMuPDF"
            )

        self.pdf_path = Path(pdf_path)
        if not self.pdf_path.exists():
            raise FileNotFoundError(f"PDF not found: {pdf_path}")

        self.doc = fitz.open(str(pdf_path))
        self.report = ComplianceReport()

    def check_metadata(self) -> None:
        """Check document title and language metadata."""
        meta = self.doc.metadata or {}

        # Title Check - must exist and not be just the filename
        title = meta.get("title", "")
        if not title:
            self.report.add_error(
                "PDF/UA Error: Dokumenttitel fehlt (dc:title nicht gesetzt)."
            )
        elif title == self.pdf_path.stem:
            self.report.add_error(
                f"PDF/UA Error: Dokumenttitel ist nur der Dateiname '{title}'. "
                "Ein aussagekräftiger Titel wird benötigt."
            )
        else:
            self.report.stats["title"] = title

        # Language Check (Root-Level /Lang)
        try:
            cat = self.doc.pdf_catalog()
            lang_keys = self.doc.xref_get_keys(cat)
            if "Lang" in lang_keys:
                lang_ref = self.doc.xref_get_key(cat, "Lang")
                if lang_ref and lang_ref[1]:
                    self.report.stats["language"] = str(lang_ref[1])
            else:
                self.report.add_error(
                    "PDF/UA Error: Hauptsprache (Lang) nicht im PDF-Root definiert."
                )
        except Exception as e:
            self.report.add_warning(f"Konnte /Lang nicht prüfen: {e}")

    def check_tag_tree(self) -> None:
        """Check if document is tagged (MarkInfo/Marked)."""
        try:
            cat = self.doc.pdf_catalog()
            mark_info = self.doc.xref_get_key(cat, "MarkInfo")

            if mark_info and mark_info[0] != "null" and mark_info[1]:
                # Parse the MarkInfo dictionary
                mark_text = str(mark_info[1]).lower()

                # Check for Marked=true in various formats
                if "marked" in mark_text:
                    if "true" in mark_text:
                        self.report.stats["is_tagged"] = True
                    else:
                        self.report.add_error(
                            "Critical Error: Dokument ist nicht als 'Getaggt' markiert "
                            "(MarkInfo/Marked != true)."
                        )
                        self.report.stats["is_tagged"] = False
                else:
                    self.report.add_warning(
                        "MarkInfo vorhanden, aber 'Marked' Key nicht gefunden."
                    )
            else:
                self.report.add_error(
                    "Critical Error: MarkInfo fehlt - Dokument nicht getaggt."
                )
                self.report.stats["is_tagged"] = False
        except Exception as e:
            self.report.add_warning(f"Konnte MarkInfo nicht prüfen: {e}")

    def check_structure_tree(self) -> None:
        """Check for presence of PDF structure tree (StructTreeRoot)."""
        try:
            cat = self.doc.pdf_catalog()
            struct_tree = self.doc.xref_get_key(cat, "StructTreeRoot")

            if struct_tree and struct_tree[0] != "null" and struct_tree[1]:
                self.report.stats["has_structure_tree"] = True

                # Try to get structure info
                try:
                    # Count structure elements if possible
                    struct_ref = struct_tree[1]
                    self.report.stats["structure_tree_ref"] = str(struct_ref)[:50]
                except Exception:
                    pass
            else:
                self.report.add_error(
                    "PDF/UA Error: Kein StructTreeRoot vorhanden - "
                    "Dokument hat keine Strukturinformationen."
                )
                self.report.stats["has_structure_tree"] = False
        except Exception as e:
            self.report.add_warning(f"Konnte StructTreeRoot nicht prüfen: {e}")

    def check_display_doc_title(self) -> None:
        """Check ViewerPreferences.DisplayDocTitle setting."""
        try:
            cat = self.doc.pdf_catalog()
            vp = self.doc.xref_get_key(cat, "ViewerPreferences")

            if vp and vp[0] != "null" and vp[1]:
                vp_text = str(vp[1]).lower()

                if "displaydoctitle" in vp_text:
                    if "true" in vp_text:
                        self.report.stats["display_doc_title"] = True
                    else:
                        self.report.add_warning(
                            "DisplayDocTitle ist auf false gesetzt - "
                            "PDF-Viewer zeigt Dateiname statt Titel."
                        )
                        self.report.stats["display_doc_title"] = False
                else:
                    self.report.add_warning(
                        "DisplayDocTitle nicht in ViewerPreferences definiert."
                    )
            else:
                self.report.add_warning(
                    "ViewerPreferences fehlt - Empfehlung: DisplayDocTitle=true setzen."
                )
        except Exception:
            pass  # Non-critical

    def check_pdf_ua_identifier(self) -> None:
        """Check for PDF/UA identifier in XMP metadata."""
        try:
            # Get XMP metadata
            xmp = self.doc.xref_xml_metadata()
            if xmp:
                # Look for pdfuaid:part
                if "pdfuaid:part" in xmp.lower() or "pdfua" in xmp.lower():
                    self.report.stats["has_pdfua_marker"] = True
                else:
                    self.report.add_warning(
                        "PDF/UA Identifier (pdfuaid:part) nicht in XMP Metadata gefunden."
                    )
                    self.report.stats["has_pdfua_marker"] = False
            else:
                self.report.add_warning("Keine XMP Metadata im Dokument.")
        except Exception:
            pass  # Non-critical for basic compliance

    def run_all_checks(self) -> ComplianceReport:
        """
        Run all compliance checks and return report.

        Returns:
            ComplianceReport with all findings
        """
        try:
            self.check_metadata()
            self.check_tag_tree()
            self.check_structure_tree()
            self.check_display_doc_title()
            self.check_pdf_ua_identifier()

            # Add general stats
            self.report.stats["total_pages"] = len(self.doc)
            self.report.stats["pdf_path"] = str(self.pdf_path)

        finally:
            self.doc.close()

        return self.report


def validate_pdf_accessibility(pdf_path: str) -> ComplianceReport:
    """
    Validate PDF for accessibility compliance.

    Synchronous wrapper function for pipeline integration.

    Args:
        pdf_path: Path to PDF file

    Returns:
        ComplianceReport with validation results
    """
    try:
        validator = AccessibilityValidator(pdf_path)
        return validator.run_all_checks()
    except ImportError as e:
        report = ComplianceReport(is_compliant=False)
        report.add_error(f"Validator nicht verfügbar: {e}")
        return report
    except FileNotFoundError as e:
        report = ComplianceReport(is_compliant=False)
        report.add_error(str(e))
        return report
    except Exception as e:
        report = ComplianceReport(is_compliant=False)
        report.add_error(f"Validierung fehlgeschlagen: {e}")
        return report


async def validate_pdf_accessibility_async(pdf_path: str) -> ComplianceReport:
    """
    Async wrapper for PDF validation.

    Note: The actual validation is synchronous (file I/O),
    but this wrapper allows use in async contexts.
    """
    return validate_pdf_accessibility(pdf_path)
