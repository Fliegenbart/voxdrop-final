from __future__ import annotations

import json
from typing import Any, Callable, Dict, List, Optional, Tuple

from app.pipeline.disfluency import add_light_disfluencies
from app.pipeline.llm import generate as llm_generate, model_validate, parse_json_or_repair
from app.pipeline.models import ScriptSegment
from app.pipeline.stages import progress_scaled


def run_pack_to_podcast_pipeline(
    pack: Dict[str, Any],
    *,
    style: str,
    speaker_style: str,
    progress_callback: Optional[Callable[[int, str], None]] = None,
    disfluencies: bool = True,
) -> Tuple[List[ScriptSegment], Dict[str, Any]]:
    """
    Fast path: turn a precomputed summary pack (from pdfua-service) into a podcast script.

    Design goals:
    - Must cover ALL slides (no premature cut-off).
    - Keep prompts small so it works even with a small vLLM max-model-len.
    - Prefer grounded output: slide summaries are the source of truth.
    """
    artifacts: Dict[str, Any] = {}
    p = progress_scaled(progress_callback, 0, 100)

    p(5, "Podcast-Pack wird vorbereitet...")
    style_norm = "monolog" if style == "monolog" else "dialog"

    doc = pack.get("document") if isinstance(pack.get("document"), dict) else {}
    slides = _sorted_pack_slides(pack)

    document_title = str(doc.get("title") or "Praesentation").strip()
    document_summary = str(doc.get("summary") or "").strip()

    artifacts["slides_count"] = len(slides)

    if not slides:
        segments: List[ScriptSegment] = [
            ScriptSegment(speaker="narrator", text=f"Hallo. Heute geht es um {document_title}.", slide_numbers=[])
        ]
        if disfluencies:
            segments = add_light_disfluencies(segments)
        return segments, {**artifacts, "segments_count": len(segments)}

    # Chunk slides so prompts stay small enough for the vLLM text backend.
    # (We also want to avoid overly long outputs that tend to truncate mid-story.)
    # Production vLLM can run with a very small context length; keep chunks conservative.
    max_slides = 7 if style_norm == "monolog" else 4
    max_chars = 3800 if style_norm == "monolog" else 3000
    chunks = _chunk_pack_slides(slides, max_slides=max_slides, max_chars=max_chars)
    artifacts["chunks"] = len(chunks)

    p(18, "Skript wird geschrieben...")
    segments = _build_script_from_pack_chunks(
        document_title=document_title,
        document_summary=document_summary,
        chunks=chunks,
        style=style_norm,
        speaker_style=speaker_style,
        progress_callback=progress_scaled(progress_callback, 18, 82),
    )

    if not segments:
        p(40, "LLM Skript fehlgeschlagen, nutze Fallback...")
        segments = _fallback_script_from_pack(pack, style=style_norm)

    # Ensure we never miss slides (reliability > style).
    segments = _ensure_slide_coverage(segments, slides, style=style_norm)

    # Add a small intro/outro if missing and normalize whitespace.
    segments = _postprocess_segments(
        segments,
        style_norm,
        document_title=document_title,
        document_summary=document_summary,
    )

    artifacts["segments_count"] = len(segments)
    artifacts["covered_slides"] = sorted({n for s in segments for n in (s.slide_numbers or []) if isinstance(n, int)})

    if disfluencies:
        p(88, "Skript bekommt leichten Podcast-Flow...")
        segments = add_light_disfluencies(segments)

    p(100, "Skript fertig")
    return segments, artifacts


def _sorted_pack_slides(pack: Dict[str, Any]) -> List[Dict[str, Any]]:
    slides = pack.get("slides") if isinstance(pack.get("slides"), list) else []
    out: List[Dict[str, Any]] = []
    for s in slides:
        if not isinstance(s, dict):
            continue
        try:
            n = int(s.get("slide_number") or 0)
        except Exception:
            n = 0
        out.append({**s, "slide_number": n})
    out.sort(key=lambda x: int(x.get("slide_number") or 0))
    return out


def _chunk_pack_slides(
    slides: List[Dict[str, Any]],
    *,
    max_slides: int,
    max_chars: int,
) -> List[List[Dict[str, Any]]]:
    chunks: List[List[Dict[str, Any]]] = []
    current: List[Dict[str, Any]] = []
    used = 0

    def _estimate(s: Dict[str, Any]) -> int:
        title = str(s.get("title") or "")
        summary = str(s.get("summary") or "")
        points = s.get("key_points") if isinstance(s.get("key_points"), list) else []
        points_txt = " ".join(str(p) for p in points[:3])
        return len(title) + len(summary) + len(points_txt) + 60

    for s in slides:
        est = _estimate(s)
        if current and (len(current) >= max_slides or used + est > max_chars):
            chunks.append(current)
            current = [s]
            used = est
        else:
            current.append(s)
            used += est

    if current:
        chunks.append(current)
    return chunks


def _build_script_from_pack_chunks(
    *,
    document_title: str,
    document_summary: str,
    chunks: List[List[Dict[str, Any]]],
    style: str,
    speaker_style: str,
    progress_callback: Optional[Callable[[int, str], None]] = None,
) -> List[ScriptSegment]:
    segments: List[ScriptSegment] = []
    total = max(1, len(chunks))
    for idx, chunk in enumerate(chunks):
        if progress_callback:
            progress_callback(int((idx / total) * 100), f"Skript: Abschnitt {idx+1}/{total}")
        chunk_segments = _build_script_from_pack_chunk(
            document_title=document_title,
            document_summary=document_summary,
            slides=chunk,
            style=style,
            speaker_style=speaker_style,
            # We inject a deterministic intro/outro later. Keep chunk prompts focused.
            allow_intro=False,
        )
        if not chunk_segments:
            chunk_segments = _fallback_segments_for_pack_slides(chunk, style=style)
        segments.extend(chunk_segments)

    if progress_callback:
        progress_callback(100, "Skript Segmente fertig")
    return segments


def _build_script_from_pack_chunk(
    *,
    document_title: str,
    document_summary: str,
    slides: List[Dict[str, Any]],
    style: str,
    speaker_style: str,
    allow_intro: bool,
) -> List[ScriptSegment]:
    schema_hint = """JSON array:
[
  {"speaker":"host|expert|narrator","text":"string","slide_numbers":[1,2]}
]"""
    style_norm = "monolog" if style == "monolog" else "dialog"

    # Keep payload compact (vLLM max-model-len may be small in production).
    payload = {
        "document": {
            "title": document_title,
            "summary": (document_summary or "")[:600],
        },
        "slides": [
            {
                "slide_number": int(s.get("slide_number") or 0),
                "title": str(s.get("title") or "").strip(),
                "summary": str(s.get("summary") or "").strip()[:420],
                "key_points": [str(p).strip() for p in (s.get("key_points") or []) if str(p).strip()][:3],
                "visual_hint": str(s.get("visual_hint") or "").strip()[:160],
            }
            for s in slides
            if isinstance(s, dict)
        ],
    }
    payload_json = json.dumps(payload, ensure_ascii=False)

    intro_rule = (
        "- KEINE Begruessung/kein Vorstellen (kein \"Hallo, ich bin...\").\n"
        if not allow_intro
        else ""
    )
    outro_rule = "- KEIN Outro/keine Abschlussformel (kein \"Danke\", kein \"Bis zum naechsten Mal\").\n" if not allow_intro else ""

    if style_norm == "monolog":
        per_slide_rule = "Pro Folie GENAU ein Segment, speaker=narrator, slide_numbers=[foliennummer]."
    else:
        per_slide_rule = (
            "Pro Folie GENAU zwei Segmente in dieser Reihenfolge: "
            "1) host stellt eine kurze Frage, 2) expert antwortet. "
            "Beide Segmente haben slide_numbers=[foliennummer]."
        )

    prompt = f"""Du schreibst ein Podcast-Skript auf Deutsch auf Basis von Folien-Summaries (ground truth).

WICHTIG:
- Erfinde NICHTS. Nutze nur die Daten.
- Keine Foliennummern oder \"Folie X\" im gesprochenen Text.
- Sprecherstil: {speaker_style}
- Kurze Segmente (max 2 Saetze pro Segment).
{intro_rule}{outro_rule}- {per_slide_rule}

style={style_norm}

DATEN (JSON):
{payload_json}

SCHEMA:
{schema_hint}

Gib NUR JSON aus (kein Markdown, keine Erklaerung):"""

    try:
        # Keep output small enough for constrained vLLM contexts while still allowing valid JSON.
        base = 220 if style_norm == "monolog" else 260
        per_slide = 75 if style_norm == "monolog" else 110
        num_predict = min(650 if style_norm == "monolog" else 750, base + per_slide * max(1, len(slides)))

        out = llm_generate(prompt, temperature=0.35, num_predict=num_predict)
        data = parse_json_or_repair(out, schema_hint)
        if not isinstance(data, list):
            return []
        segments: List[ScriptSegment] = []
        for item in data:
            if not isinstance(item, dict):
                continue
            try:
                seg = model_validate(ScriptSegment, item)
            except Exception:
                continue
            if not seg.text or not seg.text.strip():
                continue
            # We inject a deterministic intro/outro later; drop ungrounded meta segments here.
            if not allow_intro and not (seg.slide_numbers or []):
                continue
            if style_norm == "monolog":
                seg = seg.model_copy(update={"speaker": "narrator"})
            else:
                # Guard against unexpected speakers so TTS voice mapping stays consistent.
                if seg.speaker not in ("host", "expert"):
                    seg = seg.model_copy(update={"speaker": "expert"})
            segments.append(seg)
        return segments
    except Exception:
        return []


def _ensure_slide_coverage(
    segments: List[ScriptSegment],
    slides: List[Dict[str, Any]],
    *,
    style: str,
) -> List[ScriptSegment]:
    expected = [int(s.get("slide_number") or 0) for s in slides if isinstance(s, dict)]
    expected = [n for n in expected if n > 0]
    if not expected:
        return segments

    covered: set[int] = set()
    for s in segments:
        for n in s.slide_numbers or []:
            if isinstance(n, int):
                covered.add(n)

    missing = [n for n in expected if n not in covered]
    if not missing:
        return segments

    by_num: Dict[int, Dict[str, Any]] = {int(s.get("slide_number") or 0): s for s in slides if isinstance(s, dict)}

    insert_at = len(segments)
    for i in range(len(segments) - 1, -1, -1):
        if segments[i].slide_numbers:
            insert_at = i + 1
            break

    additions: List[ScriptSegment] = []
    for n in missing:
        slide = by_num.get(n) or {}
        title = str(slide.get("title") or "").strip()
        summary = str(slide.get("summary") or "").strip()
        text = f"{title}. {summary}".strip().strip(".")
        if not text:
            text = title or summary or f"Inhalt der Folie {n}"

        if style == "dialog":
            q = title or "diesem Punkt"
            additions.append(ScriptSegment(speaker="host", text=f"Was ist hier wichtig bei {q}?", slide_numbers=[n]))
            additions.append(ScriptSegment(speaker="expert", text=text, slide_numbers=[n]))
        else:
            additions.append(ScriptSegment(speaker="narrator", text=text, slide_numbers=[n]))

    return segments[:insert_at] + additions + segments[insert_at:]


def _postprocess_segments(
    segments: List[ScriptSegment],
    style: str,
    *,
    document_title: str,
    document_summary: str,
) -> List[ScriptSegment]:
    # Normalize whitespace and drop empty segments.
    out: List[ScriptSegment] = []
    for s in segments:
        txt = " ".join((s.text or "").split()).strip()
        if len(txt) < 3:
            continue
        out.append(s.model_copy(update={"text": txt}))

    # Intro/Outro (deterministic, grounded).
    doc_title = (document_title or "").strip() or "Praesentation"
    doc_sum = " ".join((document_summary or "").split()).strip()
    if len(doc_sum) > 420:
        doc_sum = doc_sum[:417].rstrip() + "..."

    if style == "monolog":
        if not out or out[0].speaker != "narrator":
            out.insert(0, ScriptSegment(speaker="narrator", text=f"Hallo. Heute geht es um {doc_title}.", slide_numbers=[]))
        if doc_sum:
            # Avoid repeating if the first segment already includes a similar summary.
            if len(out) < 2 or (doc_sum[:40].lower() not in out[0].text.lower() and doc_sum[:40].lower() not in out[1].text.lower()):
                out.insert(1, ScriptSegment(speaker="narrator", text=doc_sum, slide_numbers=[]))
        if out and "danke" not in out[-1].text.lower():
            out.append(ScriptSegment(speaker="narrator", text="Das war der Ueberblick. Danke fuers Zuhoeren.", slide_numbers=[]))

    # Keep the existing "NotebookLM vibe" intro for dialog mode.
    if style == "dialog":
        if out and out[0].speaker != "host":
            out.insert(0, ScriptSegment(speaker="host", text="Hallo, ich bin Marc.", slide_numbers=[]))
        if len(out) > 1 and out[1].speaker != "expert":
            out.insert(1, ScriptSegment(speaker="expert", text="Hi, ich bin Tina.", slide_numbers=[]))
        # Topic + short overview (grounded).
        topic_line = f"Heute geht es um {doc_title}."
        if len(out) < 3 or topic_line.lower() not in out[2].text.lower():
            out.insert(2, ScriptSegment(speaker="host", text=topic_line, slide_numbers=[]))
        if doc_sum:
            out.insert(3, ScriptSegment(speaker="expert", text=doc_sum, slide_numbers=[]))
        if out and "bis zum" not in out[-1].text.lower():
            out.append(ScriptSegment(speaker="host", text="Danke, Tina. Das war der Ueberblick. Bis zum naechsten Mal.", slide_numbers=[]))
    return out


def _fallback_script_from_pack(pack: Dict[str, Any], *, style: str) -> List[ScriptSegment]:
    """
    Deterministic fallback when the LLM is unavailable.
    Keep it simple and safe: mostly read the precomputed summaries.
    """
    doc = pack.get("document") if isinstance(pack.get("document"), dict) else {}
    slides = _sorted_pack_slides(pack)

    title = str(doc.get("title") or "Praesentation").strip()
    total = int(doc.get("total_slides") or len(slides) or 0)

    out: List[ScriptSegment] = []

    if style == "monolog":
        out.append(ScriptSegment(speaker="narrator", text=f"Hallo. Heute geht es um {title}.", slide_numbers=[]))
        if total:
            out.append(ScriptSegment(speaker="narrator", text=f"Die Praesentation hat insgesamt {total} Folien.", slide_numbers=[]))
        for s in slides:
            if not isinstance(s, dict):
                continue
            slide_num = int(s.get("slide_number") or 0)
            s_title = str(s.get("title") or "").strip()
            s_sum = str(s.get("summary") or "").strip()
            if not s_sum and not s_title:
                continue
            if s_title and s_sum:
                text = f"{s_title}. {s_sum}"
            else:
                text = s_sum or s_title
            out.append(ScriptSegment(speaker="narrator", text=text, slide_numbers=[slide_num] if slide_num else []))
        out.append(ScriptSegment(speaker="narrator", text="Das war die kurze Zusammenfassung. Danke fuers Zuhoeren.", slide_numbers=[]))
        return out

    # dialog fallback
    out.append(ScriptSegment(speaker="host", text=f"Hallo, ich bin Marc. Heute geht es um {title}.", slide_numbers=[]))
    out.append(ScriptSegment(speaker="expert", text="Hi, ich bin Tina. Lass uns die Kernaussagen gemeinsam durchgehen.", slide_numbers=[]))
    for s in slides:
        if not isinstance(s, dict):
            continue
        slide_num = int(s.get("slide_number") or 0)
        s_title = str(s.get("title") or "").strip()
        s_sum = str(s.get("summary") or "").strip()
        if not s_sum and not s_title:
            continue
        if s_title:
            out.append(ScriptSegment(speaker="host", text=f"Was ist hier der wichtigste Punkt bei {s_title}?", slide_numbers=[slide_num] if slide_num else []))
        else:
            out.append(ScriptSegment(speaker="host", text="Was ist hier der wichtigste Punkt?", slide_numbers=[slide_num] if slide_num else []))
        out.append(ScriptSegment(speaker="expert", text=s_sum or s_title, slide_numbers=[slide_num] if slide_num else []))
    out.append(ScriptSegment(speaker="host", text="Danke, Tina. Das war der Ueberblick. Bis zum naechsten Mal.", slide_numbers=[]))
    return out


def _fallback_segments_for_pack_slides(slides: List[Dict[str, Any]], *, style: str) -> List[ScriptSegment]:
    out: List[ScriptSegment] = []
    for s in slides:
        if not isinstance(s, dict):
            continue
        n = int(s.get("slide_number") or 0)
        title = str(s.get("title") or "").strip()
        summary = str(s.get("summary") or "").strip()
        text = f"{title}. {summary}".strip().strip(".")
        if not text:
            text = title or summary or f"Inhalt der Folie {n}"

        if style == "dialog":
            q = title or "diesem Punkt"
            out.append(ScriptSegment(speaker="host", text=f"Was ist hier wichtig bei {q}?", slide_numbers=[n] if n else []))
            out.append(ScriptSegment(speaker="expert", text=text, slide_numbers=[n] if n else []))
        else:
            out.append(ScriptSegment(speaker="narrator", text=text, slide_numbers=[n] if n else []))
    return out
