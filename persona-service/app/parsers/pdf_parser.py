"""
PDF Parser - Extract text, structure, and metadata from PDF files.
Uses PyMuPDF (fitz) for parsing.
"""

import fitz  # PyMuPDF
from typing import Dict, Any, List


async def parse_pdf(file_path: str) -> Dict[str, Any]:
    """
    Parse a PDF file and extract relevant content.

    Returns:
        dict with:
        - text: Full text content
        - pages: List of page contents
        - headings: Detected headings
        - images: Image information (count, has_alt_text)
        - colors: Detected colors (for contrast analysis)
        - fonts: Font information
        - metadata: Document metadata
    """
    doc = fitz.open(file_path)

    full_text = ""
    pages = []
    headings = []
    images = []
    colors = set()
    fonts = set()

    for page_num, page in enumerate(doc):
        # Extract text
        page_text = page.get_text()
        full_text += page_text + "\n"

        # Extract text blocks with formatting
        blocks = page.get_text("dict")["blocks"]
        page_content = {
            "page_number": page_num + 1,
            "text": page_text,
            "blocks": [],
        }

        for block in blocks:
            if block["type"] == 0:  # Text block
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        # Collect font info
                        font_size = span.get("size", 12)
                        font_name = span.get("font", "")
                        fonts.add((font_name, font_size))

                        # Collect colors
                        color = span.get("color", 0)
                        if color:
                            colors.add(color)

                        # Detect headings (larger fonts or bold)
                        text = span.get("text", "").strip()
                        if text and font_size >= 14:
                            headings.append({
                                "text": text,
                                "level": 1 if font_size >= 18 else 2,
                                "page": page_num + 1,
                            })

            elif block["type"] == 1:  # Image block
                images.append({
                    "page": page_num + 1,
                    "bbox": block.get("bbox"),
                    "has_alt_text": False,  # PDFs typically don't have alt text
                })

        pages.append(page_content)

    # Get metadata
    metadata = doc.metadata or {}

    doc.close()

    # Convert colors from int to RGB
    color_list = []
    for color in colors:
        if isinstance(color, int):
            r = (color >> 16) & 255
            g = (color >> 8) & 255
            b = color & 255
            color_list.append((r, g, b))

    return {
        "text": full_text.strip(),
        "pages": pages,
        "page_count": len(pages),
        "headings": headings,
        "images": images,
        "image_count": len(images),
        "colors": color_list,
        "fonts": list(fonts),
        "metadata": {
            "title": metadata.get("title", ""),
            "author": metadata.get("author", ""),
            "subject": metadata.get("subject", ""),
        },
        "format": "pdf",
    }
