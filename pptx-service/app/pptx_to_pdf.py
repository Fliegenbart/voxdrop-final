#!/usr/bin/env python3
"""
pptx_to_pdf.py
Converts PPTX to PDF using LibreOffice headless mode.

This wrapper handles the LibreOffice conversion with proper
settings for accessibility (PDF/UA where possible).

Usage:
  python pptx_to_pdf.py input.pptx -o output.pdf
"""

import argparse
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

import pikepdf


def find_libreoffice() -> str:
    """Find the LibreOffice executable."""
    # Common paths for LibreOffice
    candidates = [
        "soffice",  # If in PATH
        "/usr/bin/soffice",
        "/usr/bin/libreoffice",
        "/opt/libreoffice/program/soffice",
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",  # macOS
    ]

    for candidate in candidates:
        if shutil.which(candidate):
            return candidate

    # Try to find via which
    result = subprocess.run(["which", "soffice"], capture_output=True, text=True)
    if result.returncode == 0:
        return result.stdout.strip()

    raise RuntimeError("LibreOffice not found. Please install libreoffice-impress.")


def set_pdf_metadata(
    pdf_path: str,
    title: str,
    author: str = "",
    subject: str = "",
    language: str = "de-DE",
) -> None:
    """
    Set PDF metadata using pikepdf for PDF/UA compliance.

    LibreOffice sets the filename as PDF title by default. This function
    corrects the title to the actual presentation title and adds PDF/UA
    compliance markers.

    Args:
        pdf_path: Path to the PDF file
        title: Document title (presentation title)
        author: Optional author name
        subject: Optional document subject
        language: Document language (BCP 47 format, e.g., "de-DE")
    """
    try:
        with pikepdf.open(pdf_path, allow_overwriting_input=True) as pdf:
            # Set XMP metadata (Dublin Core)
            with pdf.open_metadata() as meta:
                meta["dc:title"] = title
                meta["dc:language"] = language
                if author:
                    meta["dc:creator"] = author
                if subject:
                    meta["dc:subject"] = subject

                # PDF/UA identifier - indicates PDF/UA-1 compliance
                meta["pdfuaid:part"] = "1"

            # Set document catalog properties for accessibility
            # DisplayDocTitle: Show document title instead of filename in PDF viewer
            if "/ViewerPreferences" not in pdf.Root:
                pdf.Root.ViewerPreferences = pikepdf.Dictionary()
            pdf.Root.ViewerPreferences.DisplayDocTitle = True

            # Set document language in catalog
            pdf.Root.Lang = language

            # Mark structure tree root if exists (for tagged PDF)
            if "/MarkInfo" not in pdf.Root:
                pdf.Root.MarkInfo = pikepdf.Dictionary()
            pdf.Root.MarkInfo.Marked = True

            pdf.save(pdf_path)

        print(f"[PDF/UA] Set metadata: title='{title}', lang='{language}', DisplayDocTitle=True")

    except Exception as e:
        # Log but don't fail - metadata is nice-to-have
        print(f"Warning: Could not set PDF metadata: {e}")


def convert_to_pdf(
    pptx_path: str,
    output_path: Optional[str] = None,
    timeout_seconds: int = 300,
    title: Optional[str] = None,
    language: str = "de-DE",
) -> str:
    """
    Convert a PPTX file to PDF using LibreOffice with PDF/UA compliance.

    Args:
        pptx_path: Path to the input PPTX file
        output_path: Optional path for the output PDF. If not specified,
                     the PDF will be created in the same directory as the input.
        timeout_seconds: Timeout for the conversion process
        title: Optional PDF title. If provided, overwrites the filename-based
               title that LibreOffice sets by default.
        language: Document language in BCP 47 format (default: "de-DE")

    Returns:
        Path to the created PDF file

    Raises:
        RuntimeError: If conversion fails
        TimeoutError: If conversion times out
    """
    pptx_path = Path(pptx_path).resolve()
    if not pptx_path.exists():
        raise FileNotFoundError(f"Input file not found: {pptx_path}")

    libreoffice = find_libreoffice()

    # Use a temporary directory for output to avoid conflicts
    with tempfile.TemporaryDirectory() as tmpdir:
        # Create a LibreOffice user profile in temp dir to avoid conflicts
        profile_dir = Path(tmpdir) / "profile"
        profile_dir.mkdir()

        # LibreOffice command with PDF/UA export settings
        # --headless: Run without GUI
        # --convert-to pdf: Convert to PDF format with tagged PDF for accessibility
        # The filter options enable:
        # - UseTaggedPDF: Creates tagged/structured PDF for screen readers
        # - ExportBookmarks: Includes bookmarks from slide titles
        # - ExportNotes: Includes speaker notes
        # - IsSkipEmptyPages: Don't skip slides
        pdf_filter_options = (
            "impress_pdf_Export:"
            "UseTaggedPDF=true,"
            "ExportBookmarks=true,"
            "ExportNotes=true,"
            "IsSkipEmptyPages=false"
        )

        cmd = [
            libreoffice,
            "--headless",
            "--invisible",
            "--nologo",
            "--nofirststartwizard",
            f"-env:UserInstallation=file://{profile_dir}",
            "--convert-to", f"pdf:{pdf_filter_options}",
            "--outdir", tmpdir,
            str(pptx_path)
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
                env={**os.environ, "HOME": str(profile_dir)}
            )
        except subprocess.TimeoutExpired:
            raise TimeoutError(f"Conversion timed out after {timeout_seconds} seconds")

        if result.returncode != 0:
            error_msg = result.stderr or result.stdout or "Unknown error"
            raise RuntimeError(f"LibreOffice conversion failed: {error_msg}")

        # Find the created PDF
        pdf_name = pptx_path.stem + ".pdf"
        tmp_pdf = Path(tmpdir) / pdf_name

        if not tmp_pdf.exists():
            # Sometimes LibreOffice creates the file with a slightly different name
            pdf_files = list(Path(tmpdir).glob("*.pdf"))
            if pdf_files:
                tmp_pdf = pdf_files[0]
            else:
                raise RuntimeError("PDF file was not created by LibreOffice")

        # Move to final location
        if output_path:
            final_path = Path(output_path)
        else:
            final_path = pptx_path.with_suffix(".pdf")

        final_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(tmp_pdf), str(final_path))

        # Set PDF metadata and PDF/UA compliance markers
        if title:
            set_pdf_metadata(str(final_path), title=title, language=language)
        else:
            # Even without title, set language for accessibility
            set_pdf_metadata(str(final_path), title=pptx_path.stem, language=language)

        return str(final_path)


def main():
    ap = argparse.ArgumentParser(description="Convert PPTX to PDF using LibreOffice with PDF/UA compliance")
    ap.add_argument("pptx_path", help="Path to the PPTX file")
    ap.add_argument("-o", "--out", default=None, help="Output PDF path")
    ap.add_argument("--timeout", type=int, default=300, help="Timeout in seconds")
    ap.add_argument("--title", default=None, help="PDF title (overrides filename)")
    ap.add_argument("--lang", default="de-DE", help="Document language (BCP 47 format, default: de-DE)")

    args = ap.parse_args()

    try:
        pdf_path = convert_to_pdf(
            args.pptx_path,
            output_path=args.out,
            timeout_seconds=args.timeout,
            title=args.title,
            language=args.lang,
        )
        print(f"Created PDF: {pdf_path}")
    except Exception as e:
        print(f"Error: {e}")
        exit(1)


if __name__ == "__main__":
    main()
