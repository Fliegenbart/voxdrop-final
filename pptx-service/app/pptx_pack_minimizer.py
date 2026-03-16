#!/usr/bin/env python3
"""
pptx_pack_minimizer.py
Creates a token-efficient "model input pack" per slide from:
- PPTX IR JSON (pptx_extract_ir.py output)
- Semantic pack JSON (pptx_semantic_pack.py output)

Output: JSON with per-slide compact content, in suggested reading order,
plus timeline candidates, notes, and complexity flags.

Usage:
  python pptx_pack_minimizer.py deck.ir.json deck.semantic.json -o deck.modelpack.json --pretty
"""

import argparse
import json
import re
from typing import Any, Dict, List, Optional, Tuple

WHITESPACE_RE = re.compile(r"[ \t]+")
NEWLINES_RE = re.compile(r"\n{3,}")


def load_json(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: str, data: Dict[str, Any], pretty: bool = False) -> None:
    with open(path, "w", encoding="utf-8") as f:
        if pretty:
            json.dump(data, f, ensure_ascii=False, indent=2)
        else:
            json.dump(data, f, ensure_ascii=False)


def flatten_shapes(shapes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out = []
    for s in shapes:
        out.append(s)
        children = s.get("children") or []
        if children:
            out.extend(flatten_shapes(children))
    return out


def normalize_text(t: str) -> str:
    t = t.replace("\r\n", "\n").replace("\r", "\n")
    t = WHITESPACE_RE.sub(" ", t)
    t = NEWLINES_RE.sub("\n\n", t)
    return t.strip()


def get_shape_text(shape: Dict[str, Any]) -> str:
    tf = shape.get("text_frame")
    if not tf:
        return ""
    return normalize_text(tf.get("text") or "")


def shape_bbox(shape: Dict[str, Any]) -> Dict[str, Any]:
    return shape.get("bbox") or {}


def bbox_tuple(b: Dict[str, Any]) -> Tuple[float, float, float, float]:
    def f(x): return float(x) if x is not None else 0.0
    return (f(b.get("left_pt")), f(b.get("top_pt")), f(b.get("width_pt")), f(b.get("height_pt")))


def clip(s: str, max_chars: int) -> str:
    s = s.strip()
    return s if len(s) <= max_chars else s[: max_chars - 1].rstrip() + "…"


def build_shape_index(deck_ir: Dict[str, Any]) -> Dict[Tuple[int, str], Dict[str, Any]]:
    idx: Dict[Tuple[int, str], Dict[str, Any]] = {}
    for slide in deck_ir.get("slides", []):
        sidx = slide.get("slide_index")
        shapes_flat = flatten_shapes(slide.get("shapes") or [])
        for sh in shapes_flat:
            sid = sh.get("shape_id")
            if sid is None:
                continue
            idx[(int(sidx), str(sid))] = sh
    return idx


def extract_links(shape: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    hl = shape.get("hyperlink")
    if not hl:
        return None
    if not (hl.get("address") or hl.get("sub_address")):
        return None
    return {"address": hl.get("address"), "sub_address": hl.get("sub_address")}


def make_compact_elements(
    slide_index: int,
    reading_order: List[str],
    shape_idx: Dict[Tuple[int, str], Dict[str, Any]],
    max_text_chars_per_elem: int,
    include_bbox: bool,
    include_style_hints: bool
) -> List[Dict[str, Any]]:
    elems: List[Dict[str, Any]] = []
    for sid in reading_order:
        sh = shape_idx.get((slide_index, sid))
        if not sh:
            continue

        txt = get_shape_text(sh)
        if not txt:
            continue

        item: Dict[str, Any] = {"shape_id": sid, "text": clip(txt, max_text_chars_per_elem)}

        if include_bbox:
            b = shape_bbox(sh)
            l, t, w, h = bbox_tuple(b)
            item["bbox_pt"] = {"left": round(l, 2), "top": round(t, 2), "width": round(w, 2), "height": round(h, 2)}

        link = extract_links(sh)
        if link:
            item["hyperlink"] = link

        if include_style_hints:
            item["rotation_deg"] = sh.get("rotation_deg")
            item["is_placeholder"] = sh.get("is_placeholder")

        elems.append(item)

    return elems


def make_slide_modelpack(
    slide_ir: Dict[str, Any],
    slide_sem: Dict[str, Any],
    shape_idx: Dict[Tuple[int, str], Dict[str, Any]],
    max_text_chars_per_elem: int,
    max_notes_chars: int,
    include_bbox: bool,
    include_style_hints: bool
) -> Dict[str, Any]:
    sidx = int(slide_ir.get("slide_index", 0))
    notes = normalize_text(slide_ir.get("notes_text") or "")
    if notes:
        notes = clip(notes, max_notes_chars)

    ro = (slide_sem.get("reading_order") or {}).get("reading_order_suggested") or []
    elements = make_compact_elements(
        slide_index=sidx,
        reading_order=ro,
        shape_idx=shape_idx,
        max_text_chars_per_elem=max_text_chars_per_elem,
        include_bbox=include_bbox,
        include_style_hints=include_style_hints
    )

    timeline = slide_sem.get("timeline_candidates") or []
    complexity = slide_sem.get("complexity") or {}
    reading = slide_sem.get("reading_order") or {}

    return {
        "slide_index": sidx,
        "notes_text": notes or None,
        "reading_order": {
            "suggested_shape_ids": ro,
            "confidence": reading.get("confidence"),
            "used_numeric_override": reading.get("used_numeric_override"),
        },
        "complexity": complexity,
        "timeline_candidates": timeline,
        "elements_in_reading_order": elements,
    }


def main():
    ap = argparse.ArgumentParser(description="Build token-efficient model input packs per slide")
    ap.add_argument("ir_json", help="Path to *.ir.json")
    ap.add_argument("semantic_json", help="Path to *.semantic.json")
    ap.add_argument("-o", "--out", default=None, help="Output path (default: <ir>.modelpack.json)")
    ap.add_argument("--pretty", action="store_true", help="Pretty-print JSON")

    ap.add_argument("--max-text-chars", type=int, default=700, help="Max chars per text element")
    ap.add_argument("--max-notes-chars", type=int, default=1200, help="Max chars for speaker notes")
    ap.add_argument("--include-bbox", action="store_true", help="Include bbox points per element")
    ap.add_argument("--include-style", action="store_true", help="Include rotation/placeholder hints per element")

    args = ap.parse_args()

    deck_ir = load_json(args.ir_json)
    deck_sem = load_json(args.semantic_json)

    if len(deck_ir.get("slides", [])) != len(deck_sem.get("slides", [])):
        raise SystemExit("Slide count mismatch between IR and semantic pack JSON.")

    shape_idx = build_shape_index(deck_ir)

    out: Dict[str, Any] = {
        "source_file": deck_ir.get("source_file"),
        "extracted_at_utc": deck_ir.get("extracted_at_utc"),
        "slide_size": deck_ir.get("slide_size"),
        "modelpack_version": "0.1",
        "slides": [],
    }

    for slide_ir, slide_sem in zip(deck_ir.get("slides", []), deck_sem.get("slides", [])):
        out["slides"].append(
            make_slide_modelpack(
                slide_ir=slide_ir,
                slide_sem=slide_sem,
                shape_idx=shape_idx,
                max_text_chars_per_elem=args.max_text_chars,
                max_notes_chars=args.max_notes_chars,
                include_bbox=args.include_bbox,
                include_style_hints=args.include_style,
            )
        )

    out_path = args.out or (args.ir_json.rsplit(".json", 1)[0] + ".modelpack.json")
    save_json(out_path, out, pretty=args.pretty)

    print(f"Wrote model pack: {out_path}")
    print(f"Slides: {len(out['slides'])}")


if __name__ == "__main__":
    main()
