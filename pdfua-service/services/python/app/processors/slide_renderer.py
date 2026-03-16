"""
Slide Renderer - Renders PPTX slides to images using LibreOffice.

Used for complex slides (charts, diagrams) that need visual AI analysis.
"""
import os
import subprocess
import tempfile
import shutil
from typing import List, Optional
from pathlib import Path


def render_slides_to_images(pptx_path: str, output_dir: str = None, dpi: int = 150) -> List[str]:
    """
    Render all slides from a PPTX to PNG images using LibreOffice.

    Args:
        pptx_path: Path to the PPTX file
        output_dir: Directory to save images (temp dir if None)

    Returns:
        List of paths to rendered slide images (sorted by slide number)
    """
    if output_dir is None:
        output_dir = tempfile.mkdtemp(prefix="slides_")

    os.makedirs(output_dir, exist_ok=True)

    try:
        # Always use PDF method - it's more reliable for multi-slide presentations
        # Direct PPTX->PNG only creates a single image for the first slide
        print(f"[SlideRenderer] Rendering via PDF method for reliability")
        return render_via_pdf(pptx_path, output_dir, dpi=dpi)

    except Exception as e:
        print(f"[SlideRenderer] Error: {e}")
        return []


def render_via_pdf(pptx_path: str, output_dir: str, dpi: int = 150) -> List[str]:
    """
    Rendering: PPTX -> PDF -> PNG images.
    This handles multi-slide presentations correctly.
    """
    try:
        # First convert to PDF
        print(f"[SlideRenderer] Step 1: Converting PPTX to PDF...")
        pdf_dir = tempfile.mkdtemp(prefix="pdf_")
        result = subprocess.run(
            [
                "libreoffice",
                "--headless",
                "--invisible",
                "--convert-to", "pdf",
                "--outdir", pdf_dir,
                pptx_path
            ],
            capture_output=True,
            text=True,
            timeout=300
        )

        if result.returncode != 0:
            print(f"[SlideRenderer] PDF conversion failed: {result.stderr}")
            return []

        # Find the PDF file
        pdf_files = list(Path(pdf_dir).glob("*.pdf"))
        if not pdf_files:
            print(f"[SlideRenderer] No PDF file created")
            return []

        pdf_path = str(pdf_files[0])
        print(f"[SlideRenderer] Step 2: PDF created at {pdf_path}")

        # Convert PDF pages to images using pdf2image
        print(f"[SlideRenderer] Step 3: Converting PDF pages to PNG...")
        try:
            from pdf2image import convert_from_path
            images = convert_from_path(pdf_path, dpi=dpi)
            print(f"[SlideRenderer] pdf2image found {len(images)} pages")

            image_paths = []
            for i, img in enumerate(images):
                img_path = os.path.join(output_dir, f"slide_{i+1:03d}.png")
                img.save(img_path, "PNG")
                image_paths.append(img_path)

            print(f"[SlideRenderer] Successfully rendered {len(image_paths)} slide images")
            return image_paths

        except ImportError as ie:
            print(f"[SlideRenderer] pdf2image not available: {ie}, trying pdftoppm...")
            # pdf2image not available, try pdftoppm
            result = subprocess.run(
                [
                    "pdftoppm",
                    "-png",
                    "-r", str(dpi),
                    pdf_path,
                    os.path.join(output_dir, "slide")
                ],
                capture_output=True,
                timeout=300
            )

            if result.returncode == 0:
                png_files = sorted(Path(output_dir).glob("slide-*.png"))
                print(f"[SlideRenderer] pdftoppm created {len(png_files)} images")
                return [str(f) for f in png_files]

            print(f"[SlideRenderer] pdftoppm failed: {result.stderr}")
            return []

    except Exception as e:
        print(f"[SlideRenderer] PDF rendering error: {e}")
        import traceback
        traceback.print_exc()
        return []
    finally:
        # Cleanup temp PDF dir
        if 'pdf_dir' in locals():
            shutil.rmtree(pdf_dir, ignore_errors=True)


def render_single_slide(pptx_path: str, slide_number: int) -> Optional[bytes]:
    """
    Render a single slide to PNG bytes.

    Args:
        pptx_path: Path to PPTX file
        slide_number: 1-based slide number

    Returns:
        PNG image bytes or None on failure
    """
    temp_dir = None
    try:
        temp_dir = tempfile.mkdtemp(prefix="slide_render_")
        image_paths = render_slides_to_images(pptx_path, temp_dir)

        if slide_number <= len(image_paths):
            img_path = image_paths[slide_number - 1]
            with open(img_path, "rb") as f:
                return f.read()

        return None

    except Exception as e:
        print(f"[SlideRenderer] Single slide render error: {e}")
        return None
    finally:
        if temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)


def cleanup_render_dir(output_dir: str):
    """Clean up temporary render directory."""
    if output_dir and os.path.exists(output_dir):
        shutil.rmtree(output_dir, ignore_errors=True)
