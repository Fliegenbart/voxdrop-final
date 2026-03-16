#!/usr/bin/env python3
"""
pptx_semantic_pack.py
Builds a deterministic "semantic pack" from the IR JSON produced by pptx_extract_ir.py.

Outputs, per slide:
- suggested reading order (layout heuristic)
- timeline candidates (year extraction)
- complexity metrics and flags (dense layouts, image-only suspicion)

Usage:
  python pptx_semantic_pack.py input.ir.json -o input.semantic.json --pretty
"""

import argparse
import json
import re
from typing import Any, Dict, List, Tuple

YEAR_RE = re.compile(r"\b(19\d{2}|20\d{2})\b")
NUM_PREFIX_RE = re.compile(r"^\s*(\d{1,3})\s*[\)\.\:\-]\s*")


def load_json(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: str, data: Dict[str, Any], pretty: bool = False) -> None:
    with open(path, "w", encoding="utf-8") as f:
        if pretty:
            json.dump(data, f, ensure_ascii=False, indent=2)
        else:
            json.dump(data, f, ensure_ascii=False)


def bbox_area(b: Dict[str, Any]) -> float:
    w = b.get("width_pt")
    h = b.get("height_pt")
    if w is None or h is None:
        return 0.0
    return float(w) * float(h)


def bbox_intersection(a: Dict[str, Any], b: Dict[str, Any]) -> float:
    ax1, ay1 = a.get("left_pt"), a.get("top_pt")
    aw, ah = a.get("width_pt"), a.get("height_pt")
    bx1, by1 = b.get("left_pt"), b.get("top_pt")
    bw, bh = b.get("width_pt"), b.get("height_pt")
    if None in (ax1, ay1, aw, ah, bx1, by1, bw, bh):
        return 0.0
    ax2, ay2 = ax1 + aw, ay1 + ah
    bx2, by2 = bx1 + bw, by1 + bh
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    return iw * ih


def get_shape_text(shape: Dict[str, Any]) -> str:
    tf = shape.get("text_frame")
    if not tf:
        return ""
    return (tf.get("text") or "").strip()


def is_meaningful_text(shape: Dict[str, Any]) -> bool:
    t = get_shape_text(shape)
    return len(t.strip()) > 0


def is_picture(shape: Dict[str, Any]) -> bool:
    return shape.get("image") is not None and isinstance(shape.get("image"), dict)


def flatten_shapes(shapes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out = []
    for s in shapes:
        out.append(s)
        children = s.get("children") or []
        if children:
            out.extend(flatten_shapes(children))
    return out


def infer_font_max_pt(shape: Dict[str, Any]):
    tf = shape.get("text_frame")
    if not tf:
        return None
    mx = None
    for p in tf.get("paragraphs", []):
        for r in p.get("runs", []):
            fs = r.get("font_size_pt")
            if fs is None:
                continue
            mx = fs if mx is None else max(mx, fs)
    return mx


def classify_artifact(shape: Dict[str, Any], slide_h: float) -> bool:
    b = shape.get("bbox") or {}
    top = b.get("top_pt")
    h = b.get("height_pt")
    if top is None or h is None:
        return False
    txt = get_shape_text(shape)
    if not txt:
        return False
    if top > slide_h * 0.88 and len(txt) <= 60:
        return True
    if re.fullmatch(r"\d{1,3}", txt.strip()) and top > slide_h * 0.85:
        return True
    return False


def detect_columns(elements: List[Dict[str, Any]], slide_w: float) -> List[List[Dict[str, Any]]]:
    xs = []
    for e in elements:
        left = (e.get("bbox") or {}).get("left_pt")
        if left is not None:
            xs.append(float(left))
    if len(xs) < 6:
        return [elements]

    xs_sorted = sorted(xs)
    gaps = [(xs_sorted[i+1] - xs_sorted[i], i) for i in range(len(xs_sorted) - 1)]
    gaps.sort(reverse=True)
    largest_gap, idx = gaps[0]

    if largest_gap < max(90.0, slide_w * 0.12):
        return [elements]

    cut = xs_sorted[idx] + largest_gap / 2.0

    left_col, right_col = [], []
    for e in elements:
        left = (e.get("bbox") or {}).get("left_pt")
        if left is None:
            left_col.append(e)
        elif float(left) <= cut:
            left_col.append(e)
        else:
            right_col.append(e)

    return [left_col, right_col]


def cluster_rows(col_elems: List[Dict[str, Any]], y_tol: float = 10.0) -> List[List[Dict[str, Any]]]:
    elems = []
    for e in col_elems:
        top = (e.get("bbox") or {}).get("top_pt")
        if top is None:
            top = 0.0
        elems.append((float(top), e))
    elems.sort(key=lambda x: x[0])

    rows: List[List[Dict[str, Any]]] = []
    row_tops: List[float] = []

    for top, e in elems:
        placed = False
        for i, rt in enumerate(row_tops):
            if abs(top - rt) <= y_tol:
                rows[i].append(e)
                row_tops[i] = (row_tops[i] * (len(rows[i]) - 1) + top) / len(rows[i])
                placed = True
                break
        if not placed:
            rows.append([e])
            row_tops.append(top)

    for r in rows:
        r.sort(key=lambda e: float((e.get("bbox") or {}).get("left_pt") or 0.0))

    return rows


def numbered_order_override(elements: List[Dict[str, Any]]):
    scored = []
    for e in elements:
        txt = get_shape_text(e)
        m = NUM_PREFIX_RE.match(txt)
        if m:
            scored.append((int(m.group(1)), e))

    if len(scored) >= max(4, int(len(elements) * 0.35)):
        scored.sort(key=lambda x: x[0])
        return [e for _, e in scored]
    return None


def suggest_reading_order(shapes_flat: List[Dict[str, Any]], slide_w: float, slide_h: float) -> Dict[str, Any]:
    text_elems = []
    artifacts = []
    for s in shapes_flat:
        if is_meaningful_text(s):
            if classify_artifact(s, slide_h):
                artifacts.append(s)
            else:
                text_elems.append(s)

    title_candidates = []
    for e in text_elems:
        b = e.get("bbox") or {}
        top = b.get("top_pt")
        if top is None:
            continue
        fs = infer_font_max_pt(e) or 0.0
        if top <= slide_h * 0.18:
            title_candidates.append((fs, -float(top), e))
    title_candidates.sort(reverse=True)

    title = title_candidates[0][2] if title_candidates else None
    body = [e for e in text_elems if e is not title]

    num_override = numbered_order_override(body)
    if num_override is not None:
        body_ordered = num_override
    else:
        cols = detect_columns(body, slide_w)
        body_ordered = []
        for col in cols:
            rows = cluster_rows(col, y_tol=max(10.0, slide_h * 0.015))
            for r in rows:
                body_ordered.extend(r)

    order = []
    if title is not None:
        order.append(title)
    order.extend(body_ordered)
    order.extend(sorted(artifacts, key=lambda e: float((e.get("bbox") or {}).get("left_pt") or 0.0)))

    ordered_ids = []
    for e in order:
        sid = e.get("shape_id")
        if sid is None:
            continue
        ordered_ids.append(str(sid))

    confidence = 0.45
    if title is not None:
        confidence += 0.2
    if num_override is not None:
        confidence += 0.25
    if len(ordered_ids) >= 8:
        confidence += 0.05
    confidence = min(0.95, confidence)

    return {
        "text_shape_count": len(text_elems),
        "artifact_count": len(artifacts),
        "title_shape_id": str(title.get("shape_id")) if title else None,
        "reading_order_suggested": ordered_ids,
        "confidence": round(confidence, 2),
        "used_numeric_override": bool(num_override is not None),
    }


def extract_timeline_candidates(shapes_flat: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    events = []
    for s in shapes_flat:
        txt = get_shape_text(s)
        if not txt:
            continue
        years = YEAR_RE.findall(txt)
        if not years:
            continue
        seen = set()
        yrs = []
        for y in years:
            if y not in seen:
                seen.add(y)
                yrs.append(int(y))
        shape_id = s.get("shape_id")
        events.append({
            "years": yrs,
            "headline": txt.split("\\n", 1)[0].strip()[:180],
            "source_shape_id": str(shape_id) if shape_id is not None else None,
        })

    events.sort(key=lambda e: min(e["years"]) if e["years"] else 9999)
    return events


def compute_complexity(shapes_flat: List[Dict[str, Any]]) -> Dict[str, Any]:
    text_boxes = [s for s in shapes_flat if is_meaningful_text(s)]
    images = [s for s in shapes_flat if is_picture(s)]
    total = len(shapes_flat)

    overlaps = []
    for i in range(min(len(text_boxes), 40)):
        for j in range(i + 1, min(len(text_boxes), 40)):
            a = text_boxes[i].get("bbox") or {}
            b = text_boxes[j].get("bbox") or {}
            ia = bbox_intersection(a, b)
            if ia <= 0:
                continue
            amin = min(bbox_area(a), bbox_area(b))
            if amin > 0:
                overlaps.append(ia / amin)

    overlap_score = sum(overlaps) / len(overlaps) if overlaps else 0.0

    image_only_suspicion = (len(text_boxes) == 0 and len(images) >= 1)

    return {
        "shape_total": total,
        "text_boxes": len(text_boxes),
        "images": len(images),
        "text_overlap_score": round(overlap_score, 3),
        "image_only_suspicion": bool(image_only_suspicion),
        "dense_layout_flag": bool(len(text_boxes) >= 18 or overlap_score >= 0.35),
    }


def build_semantic_pack(deck_ir: Dict[str, Any]) -> Dict[str, Any]:
    slide_w = float(deck_ir.get("slide_size", {}).get("width_pt") or 0.0)
    slide_h = float(deck_ir.get("slide_size", {}).get("height_pt") or 0.0)

    out = {
        "source_file": deck_ir.get("source_file"),
        "extracted_at_utc": deck_ir.get("extracted_at_utc"),
        "slide_size": deck_ir.get("slide_size"),
        "slides": [],
    }

    for slide in deck_ir.get("slides", []):
        shapes = slide.get("shapes") or []
        shapes_flat = flatten_shapes(shapes)

        reading = suggest_reading_order(shapes_flat, slide_w, slide_h)
        timeline = extract_timeline_candidates(shapes_flat)
        complexity = compute_complexity(shapes_flat)

        slide_pack = {
            "slide_index": slide.get("slide_index"),
            "notes_text": slide.get("notes_text"),
            "reading_order": reading,
            "timeline_candidates": timeline,
            "complexity": complexity,
        }
        out["slides"].append(slide_pack)

    return out


def main():
    ap = argparse.ArgumentParser(description="Deterministic Semantic Pack builder from PPTX IR JSON")
    ap.add_argument("ir_json", help="Path to *.ir.json from pptx_extract_ir.py")
    ap.add_argument("-o", "--out", default=None, help="Output path (default: <input>.semantic.json)")
    ap.add_argument("--pretty", action="store_true", help="Pretty-print JSON")
    args = ap.parse_args()

    data = load_json(args.ir_json)
    out_path = args.out or (args.ir_json.rsplit(".json", 1)[0] + ".semantic.json")

    pack = build_semantic_pack(data)
    save_json(out_path, pack, pretty=args.pretty)

    print(f"Wrote semantic pack: {out_path}")
    print(f"Slides: {len(pack['slides'])}")


if __name__ == "__main__":
    main()
