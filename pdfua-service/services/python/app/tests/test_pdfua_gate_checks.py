from pathlib import Path
from typing import Any, Dict, List, Set, Tuple


def _load_gate_helpers():
    source_path = Path(__file__).resolve().parents[1] / "main.py"
    source = source_path.read_text(encoding="utf-8")
    start = source.index("def _check_font_embedding")
    end = source.index("\n\nasync def process_pdfua_check")
    snippet = "from __future__ import annotations\n" + source[start:end]
    namespace = {
        "Any": Any,
        "Dict": Dict,
        "List": List,
        "Set": Set,
        "Tuple": Tuple,
    }
    exec(snippet, namespace)
    return namespace["_check_font_embedding"], namespace["_check_xmp_pdfua_identifier"]


_check_font_embedding, _check_xmp_pdfua_identifier = _load_gate_helpers()


class _FakeMetadataStream:
    def __init__(self, payload: bytes):
        self._payload = payload

    def get_data(self) -> bytes:
        return self._payload


class _FakeReader:
    def __init__(self, *, pages=None, trailer=None, xmp_metadata=None):
        self.pages = pages or []
        self.trailer = trailer or {}
        self.xmp_metadata = xmp_metadata


def test_xmp_identifier_check_reads_catalog_metadata_stream_without_reader_xmp_metadata():
    reader = _FakeReader(
        trailer={
            "/Root": {
                "/Metadata": _FakeMetadataStream(
                    b"<?xpacket?><rdf:Description xmlns:pdfuaid='http://www.aiim.org/pdfua/ns/id/'><pdfuaid:part>1</pdfuaid:part></rdf:Description>"
                )
            }
        },
        xmp_metadata=None,
    )

    passed, message = _check_xmp_pdfua_identifier(reader)

    assert passed is True
    assert "PDF/UA-Identifier" in message


def test_font_embedding_check_accepts_type0_fonts_with_embedded_descendant_fontfile():
    reader = _FakeReader(
        pages=[
            {
                "/Resources": {
                    "/Font": {
                        "/F1": {
                            "/BaseFont": "/AAYLGC+DejaVuSans",
                            "/Subtype": "/Type0",
                            "/Encoding": "/Identity-H",
                            "/ToUnicode": object(),
                            "/DescendantFonts": [
                                {
                                    "/Subtype": "/CIDFontType2",
                                    "/BaseFont": "/AAYLGC+DejaVuSans",
                                    "/FontDescriptor": {
                                        "/FontFile2": object(),
                                    },
                                }
                            ],
                        }
                    }
                }
            }
        ]
    )

    issues = _check_font_embedding(reader)

    assert [issue for issue in issues if issue["issue"] == "not_embedded"] == []
