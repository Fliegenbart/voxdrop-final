from __future__ import annotations

import os
from typing import Any, Callable, Dict, List, Optional, Tuple

from app.pipeline.disfluency import add_light_disfluencies
from app.pipeline.llm import dumps, generate as llm_generate, model_validate, parse_json_or_repair
from app.pipeline.models import (
    Beat,
    Chapter,
    ChapterBrief,
    ChapterPlan,
    Digest,
    Fact,
    DialogueOutline,
    ScriptSegment,
    Slide,
)
from app.pipeline.normalize import normalize_slides
from app.pipeline.stages import progress_scaled

LEGACY_SPEED_PROFILE = str(os.getenv("PODCAST_LEGACY_SPEED_PROFILE", "balanced")).strip().lower()
LEGACY_MAX_CHAPTERS = max(1, int(os.getenv("PODCAST_LEGACY_MAX_CHAPTERS", "8")))
LEGACY_DEFAULT_BRIEF_MODE = "deterministic" if LEGACY_SPEED_PROFILE == "balanced" else "llm"
LEGACY_BRIEF_MODE = str(os.getenv("PODCAST_LEGACY_BRIEF_MODE", LEGACY_DEFAULT_BRIEF_MODE)).strip().lower()
LEGACY_CHAPTER_CONTEXT_CHARS = max(
    4000,
    int(os.getenv("PODCAST_LEGACY_CHAPTER_CONTEXT_CHARS", "12000" if LEGACY_SPEED_PROFILE == "balanced" else "30000")),
)
LEGACY_BEATS_MIN = max(1, int(os.getenv("PODCAST_LEGACY_BEATS_MIN", "1" if LEGACY_SPEED_PROFILE == "balanced" else "2")))
LEGACY_BEATS_MAX = max(
    LEGACY_BEATS_MIN,
    int(os.getenv("PODCAST_LEGACY_BEATS_MAX", "3" if LEGACY_SPEED_PROFILE == "balanced" else "5")),
)
LEGACY_BEAT_BATCH_SIZE = max(
    1,
    int(os.getenv("PODCAST_LEGACY_BEAT_BATCH_SIZE", "3" if LEGACY_SPEED_PROFILE == "balanced" else "1")),
)


def run_pptx_to_podcast_pipeline(
    raw_slides: List[Dict[str, Any]],
    *,
    style: str,
    speaker_style: str,
    progress_callback: Optional[Callable[[int, str], None]] = None,
    disfluencies: bool = True,
) -> Tuple[List[ScriptSegment], Dict[str, Any]]:
    """
    High-quality pipeline inspired by NotebookLM:
    - Normalize + denoise slides
    - Digest (grounded)
    - Chapter plan (grounded)
    - Chapter briefs (grounded)
    - Dialogue outline
    - Script segments (TTS-ready)
    - Optional light disfluency layer

    Returns segments + artifacts dict (for debugging).
    """
    artifacts: Dict[str, Any] = {}
    p = progress_scaled(progress_callback, 0, 100)

    try:
        artifacts["speed_profile"] = LEGACY_SPEED_PROFILE
        artifacts["brief_mode"] = LEGACY_BRIEF_MODE
        artifacts["beat_batch_size"] = LEGACY_BEAT_BATCH_SIZE

        p(2, "Folien werden normalisiert...")
        slides = normalize_slides(raw_slides)
        artifacts["slides_count"] = len(slides)

        p(8, "Praesentation wird verstanden (Digest)...")
        digest = _build_digest(slides, speaker_style)
        artifacts["digest"] = digest.model_dump()

        p(18, "Kapitelstruktur wird geplant...")
        plan = _build_chapter_plan(slides, digest, style, speaker_style)
        if len(plan.chapters) > LEGACY_MAX_CHAPTERS:
            plan = _merge_adjacent_chapters(plan, max_chapters=LEGACY_MAX_CHAPTERS)
        artifacts["plan"] = plan.model_dump()

        p(30, "Kapitel werden zusammengefasst...")
        briefs = _build_chapter_briefs(
            slides,
            plan,
            digest,
            speaker_style,
            progress_callback=progress_scaled(progress_callback, 30, 50),
        )
        artifacts["briefs"] = [b.model_dump() for b in briefs]

        p(55, "Dialog wird skizziert...")
        outline = _build_dialogue_outline(plan, briefs, style, speaker_style)
        artifacts["outline"] = outline.model_dump()

        p(65, "Skript wird geschrieben...")
        segments = _build_script(
            slides,
            digest,
            plan,
            briefs,
            outline,
            style,
            speaker_style,
            progress_callback=progress_scaled(progress_callback, 65, 85),
        )
        artifacts["segments_count"] = len(segments)

        if disfluencies:
            p(88, "Skript bekommt leichten Podcast-Flow...")
            segments = add_light_disfluencies(segments)

        p(100, "Skript fertig")
        return segments, artifacts
    except Exception as e:
        # Robust fallback: generate a safe, deterministic script from slide titles/bullets.
        artifacts["error"] = str(e)
        try:
            p(70, "LLM Pipeline fehlgeschlagen, nutze Fallback-Skript...")
        except Exception:
            pass
        slides = normalize_slides(raw_slides)
        segments = _fallback_script_from_slides(slides, style=style, speaker_style=speaker_style)
        artifacts["fallback_segments_count"] = len(segments)
        if disfluencies:
            try:
                segments = add_light_disfluencies(segments)
            except Exception:
                pass
        try:
            p(100, "Fallback-Skript fertig")
        except Exception:
            pass
        return segments, artifacts


def _fallback_script_from_slides(slides: List[Slide], *, style: str, speaker_style: str) -> List[ScriptSegment]:
    """
    Deterministic fallback when the LLM output is unusable.
    Keep it short, grounded, and always produce something playable.
    """
    style_norm = "monolog" if style == "monolog" else "dialog"
    title = (slides[0].title if slides else "") or "Praesentation"

    out: List[ScriptSegment] = []
    if style_norm == "monolog":
        out.append(ScriptSegment(speaker="narrator", text=f"Hallo. Heute geht es um {title}.", slide_numbers=[]))
        for s in slides:
            bits: List[str] = []
            if s.title:
                bits.append(s.title)
            # Use a few bullet points; avoid reading entire slide.
            for line in (s.content or [])[:3]:
                line = " ".join(str(line).split()).strip()
                if line:
                    bits.append(line)
            if not bits:
                continue
            text = ". ".join(bits)
            out.append(ScriptSegment(speaker="narrator", text=text, slide_numbers=[s.slide_number]))
        out.append(ScriptSegment(speaker="narrator", text="Das war der Ueberblick. Danke fuers Zuhoeren.", slide_numbers=[]))
        return out

    # dialog fallback
    out.append(ScriptSegment(speaker="host", text=f"Hallo, ich bin Marc. Heute geht es um {title}.", slide_numbers=[]))
    out.append(ScriptSegment(speaker="expert", text="Hi, ich bin Tina. Lass uns die Inhalte strukturiert durchgehen.", slide_numbers=[]))
    for s in slides:
        q = s.title or f"Folie {s.slide_number}"
        out.append(ScriptSegment(speaker="host", text=f"Was ist der wichtigste Punkt bei {q}?", slide_numbers=[s.slide_number]))
        ans_bits: List[str] = []
        for line in (s.content or [])[:4]:
            line = " ".join(str(line).split()).strip()
            if line:
                ans_bits.append(line)
        if s.speaker_notes:
            note = " ".join(s.speaker_notes.split()).strip()
            if note:
                ans_bits.append(note[:180] + ("..." if len(note) > 180 else ""))
        answer = " ".join(ans_bits) if ans_bits else "Hier geht es um einen wichtigen Aspekt, der auf der Folie dargestellt ist."
        out.append(ScriptSegment(speaker="expert", text=answer, slide_numbers=[s.slide_number]))
    out.append(ScriptSegment(speaker="host", text="Danke, Tina. Das war der Ueberblick. Bis zum naechsten Mal.", slide_numbers=[]))
    return out


def _slides_to_context(slides: List[Slide], *, limit_chars: int = 60000) -> str:
    """
    Build a compact, grounded context string for LLM steps.

    IMPORTANT: Always include an outline of *all* slides so later slides don't disappear just because
    earlier slides consumed the char budget. Detailed content is included only as space allows.
    """
    parts: List[str] = []

    parts.append("=== OUTLINE (ALLE FOLIEN) ===")
    for s in slides:
        title = (s.title or "").strip()
        if title:
            parts.append(f"{s.slide_number}: {title}")
        else:
            parts.append(f"{s.slide_number}: (ohne Titel)")

    parts.append("")
    parts.append("=== DETAILS (AUSZUG) ===")

    used = sum(len(x) + 1 for x in parts)
    for s in slides:
        block = [f"--- FOLIE {s.slide_number} ---"]
        if s.title:
            block.append(f"Titel: {s.title}")
        for line in s.content[:25]:
            block.append(f"- {line}")
        if s.speaker_notes:
            notes = s.speaker_notes.strip()
            if len(notes) > 800:
                notes = notes[:800] + "..."
            block.append(f"Notizen: {notes}")
        for img in s.images[:3]:
            if img.description:
                block.append(f"Bild: {img.description}")
        block.append("")
        txt = "\n".join(block)
        if used + len(txt) > limit_chars:
            break
        parts.append(txt)
        used += len(txt)

    return "\n".join(parts).strip()


def _build_digest(slides: List[Slide], speaker_style: str) -> Digest:
    schema_hint = """JSON object:
{
  "main_topic": "string",
  "target_audience": "string",
  "key_messages": ["string", "..."],
  "important_facts": [{"text":"string","slide_numbers":[1,2]}],
  "glossary": [{"term":"string","explanation":"string"}]
}"""
    context = _slides_to_context(slides)
    prompt = f"""Du bist ein sehr strenger Analyst fuer Praesentationen.

Aufgabe:
1) Verstehe die Praesentation als Ganzes.
2) Extrahiere nur belastbare Kernaussagen und Fakten.
3) Jede wichtige Fakt-Aussage MUSS slide_numbers enthalten (wo steht das?).

WICHTIG:
- Erfinde NICHTS.
- Wenn etwas nicht klar ist: lasse es weg.
- Antworte NUR als JSON im folgenden Schema.

PRAESENTATION:
{context}

SCHEMA:
{schema_hint}
"""
    out = llm_generate(prompt, temperature=0.2, num_predict=1800)
    data = parse_json_or_repair(out, schema_hint)
    digest = model_validate(Digest, data)
    if not digest.main_topic:
        digest.main_topic = slides[0].title or "Praesentation"
    return digest


def _build_chapter_plan(slides: List[Slide], digest: Digest, style: str, speaker_style: str) -> ChapterPlan:
    schema_hint = """JSON object:
{
  "podcast_title": "string",
  "narrative_notes": "string",
  "chapters": [
    {
      "id": "ch1",
      "name": "string",
      "slide_numbers": [1,2,3],
      "learning_goal": "string",
      "key_points": [{"text":"string","slide_numbers":[1,2]}]
    }
  ]
}"""
    context = _slides_to_context(slides)
    prompt = f"""Du strukturierst eine Praesentation in eine Podcast-Kapitelstruktur.

Ziel: Nicht Folie-fuer-Folie, sondern in sinnvollen Kapiteln, die fuer Hoerer verstaendlich sind.

WICHTIG:
- Erfinde nichts.
- Jede Key-Point-Aussage bekommt slide_numbers.
- Slide-Numbers muessen existieren.

DIGEST:
{dumps(digest.model_dump())}

PRAESENTATION (Auszug):
{context}

SCHEMA:
{schema_hint}

Gib NUR JSON aus:"""
    out = llm_generate(prompt, temperature=0.3, num_predict=2000)
    data = parse_json_or_repair(out, schema_hint)
    plan = model_validate(ChapterPlan, data)
    if not plan.podcast_title:
        plan.podcast_title = digest.main_topic or "Podcast"
    # Basic sanity: if chapters empty, build a single chapter.
    if not plan.chapters:
        plan.chapters = [
            Chapter(
                id="ch1",
                name="Hauptteil",
                slide_numbers=[s.slide_number for s in slides],
                learning_goal="Kernaussagen verstaendlich vermitteln",
                key_points=[Fact(text=km, slide_numbers=[]) for km in digest.key_messages[:5]],
            )
        ]
        return plan

    # Coverage guard: ensure no slides are silently dropped by the planner.
    all_slide_nums = [s.slide_number for s in slides]
    planned: set[int] = set()
    for ch in plan.chapters:
        for n in ch.slide_numbers or []:
            if isinstance(n, int):
                planned.add(n)
    missing = [n for n in all_slide_nums if n not in planned]
    if missing:
        # Attach to last chapter as "Appendix" slides to keep a linear story.
        last = plan.chapters[-1]
        merged = sorted({*(last.slide_numbers or []), *missing})
        plan.chapters[-1] = last.model_copy(update={"slide_numbers": merged})
    return plan


def _merge_adjacent_chapters(plan: ChapterPlan, *, max_chapters: int) -> ChapterPlan:
    chapters = list(plan.chapters or [])
    if len(chapters) <= max_chapters:
        return plan

    while len(chapters) > max_chapters:
        merge_idx = len(chapters) - 2
        left = chapters[merge_idx]
        right = chapters[merge_idx + 1]
        merged_id = left.id or f"ch{merge_idx+1}"
        merged_name = " / ".join(part for part in [left.name, right.name] if part).strip() or f"Kapitel {merge_idx+1}"
        merged_goal = " ".join(part for part in [left.learning_goal, right.learning_goal] if part).strip()
        merged_slides = sorted(
            {
                n
                for n in [*(left.slide_numbers or []), *(right.slide_numbers or [])]
                if isinstance(n, int)
            }
        )
        merged_key_points: List[Fact] = []
        for kp in [*(left.key_points or []), *(right.key_points or [])]:
            if isinstance(kp, Fact):
                merged_key_points.append(kp)
        chapters[merge_idx] = Chapter(
            id=merged_id,
            name=merged_name,
            slide_numbers=merged_slides,
            learning_goal=merged_goal,
            key_points=merged_key_points[:8],
        )
        del chapters[merge_idx + 1]

    return plan.model_copy(update={"chapters": chapters})


def _build_chapter_briefs(
    slides: List[Slide],
    plan: ChapterPlan,
    digest: Digest,
    speaker_style: str,
    *,
    progress_callback: Optional[Callable[[int, str], None]] = None,
) -> List[ChapterBrief]:
    briefs: List[ChapterBrief] = []
    total = max(1, len(plan.chapters))
    slides_by_number = {s.slide_number: s for s in slides}
    digest_json = dumps(digest.model_dump())
    for idx, ch in enumerate(plan.chapters):
        if progress_callback:
            progress_callback(int((idx / total) * 100), f"Kapitel: {ch.name}")

        chapter_slide_numbers = {
            n for n in (ch.slide_numbers or [])
            if isinstance(n, int)
        }
        ch_slides = [
            slides_by_number[n]
            for n in sorted(chapter_slide_numbers)
            if n in slides_by_number
        ]

        if LEGACY_BRIEF_MODE != "llm":
            briefs.append(_build_chapter_brief_deterministic(ch, ch_slides, digest))
            continue

        context = _slides_to_context(ch_slides, limit_chars=LEGACY_CHAPTER_CONTEXT_CHARS)
        schema_hint = """JSON object:
{
  "chapter_id":"string",
  "summary":"string",
  "must_mention_facts":[{"text":"string","slide_numbers":[1,2]}],
  "do_not_invent":["string","..."]
}"""
        prompt = f"""Du erstellst einen Kapitel-Brief fuer einen Podcast.

WICHTIG:
- Summary darf nur Inhalte aus den Folien enthalten.
- Must-mention Fakten muessen slide_numbers enthalten.
- Halte es kompakt, klar, hoerfreundlich.

DIGEST (Kontext):
{digest_json}

KAPITEL:
{dumps(ch.model_dump())}

FOLIEN (nur dieses Kapitel):
{context}

SCHEMA:
{schema_hint}

Nur JSON:"""
        out = llm_generate(prompt, temperature=0.25, num_predict=1600)
        data = parse_json_or_repair(out, schema_hint)
        brief = model_validate(ChapterBrief, data)
        if not brief.chapter_id:
            brief.chapter_id = ch.id
        briefs.append(brief)

    if progress_callback:
        progress_callback(100, "Kapitel-Briefs fertig")
    return briefs


def _build_chapter_brief_deterministic(chapter: Chapter, slides: List[Slide], digest: Digest) -> ChapterBrief:
    slide_numbers = {
        n for n in (chapter.slide_numbers or [])
        if isinstance(n, int)
    }

    must_mention: List[Fact] = []
    for fact in chapter.key_points or []:
        if not isinstance(fact, Fact):
            continue
        if not (fact.text or "").strip():
            continue
        fact_nums = [n for n in (fact.slide_numbers or []) if isinstance(n, int)]
        nums = sorted(set(fact_nums)) if fact_nums else sorted(slide_numbers)[:2]
        must_mention.append(Fact(text=fact.text.strip(), slide_numbers=nums))
        if len(must_mention) >= 5:
            break

    if len(must_mention) < 5:
        for fact in digest.important_facts or []:
            text = (fact.text or "").strip()
            if not text:
                continue
            fact_nums = [n for n in (fact.slide_numbers or []) if isinstance(n, int)]
            if slide_numbers and fact_nums and not slide_numbers.intersection(fact_nums):
                continue
            nums = sorted(set(fact_nums)) if fact_nums else sorted(slide_numbers)[:2]
            must_mention.append(Fact(text=text, slide_numbers=nums))
            if len(must_mention) >= 5:
                break

    titles = [s.title.strip() for s in slides if (s.title or "").strip()]
    highlights: List[str] = []
    for s in slides:
        for line in (s.content or [])[:2]:
            cleaned = " ".join(str(line).split()).strip()
            if cleaned and cleaned not in highlights:
                highlights.append(cleaned)
            if len(highlights) >= 5:
                break
        if len(highlights) >= 5:
            break

    summary_parts: List[str] = []
    if (chapter.learning_goal or "").strip():
        summary_parts.append(chapter.learning_goal.strip())
    if titles:
        summary_parts.append("Themen: " + ", ".join(titles[:3]))
    if highlights:
        summary_parts.append("Kernaussagen: " + "; ".join(highlights[:4]))
    if not summary_parts:
        summary_parts.append(chapter.name or "Kapitelinhalt")

    return ChapterBrief(
        chapter_id=chapter.id or "chapter",
        summary=". ".join(summary_parts)[:1000],
        must_mention_facts=must_mention[:5],
        do_not_invent=[
            "Keine unbelegten Zahlen oder Behauptungen nennen.",
            "Nur Inhalte aus den zugeordneten Folien verwenden.",
        ],
    )


def _build_dialogue_outline(plan: ChapterPlan, briefs: List[ChapterBrief], style: str, speaker_style: str) -> DialogueOutline:
    # In monolog mode, we still create beats but they become narrator segments.
    schema_hint = """JSON object:
{
  "beats":[
    {
      "chapter_id":"ch1",
      "beat_id":"ch1_b1",
      "question":"string",
      "answer_bullets":["string","..."],
      "slide_numbers":[1,2]
    }
  ]
}"""
    prompt = f"""Du erstellst eine Dialog-Outline fuer einen Podcast.

Personas:
- MARC (Host): stellt gute, hoererorientierte Fragen.
- TINA (Expertin): antwortet klar, korrekt, erklaert.

WICHTIG:
- Nichts erfinden. Nutze nur Kapitel-Briefs.
- Jede Beat-Antwort bekommt slide_numbers, die dazu passen.
- Pro Kapitel {LEGACY_BEATS_MIN}-{LEGACY_BEATS_MAX} Beats.

KAPITELPLAN:
{dumps(plan.model_dump())}

KAPITEL-BRIEFS:
{dumps([b.model_dump() for b in briefs])}

SCHEMA:
{schema_hint}

Nur JSON:"""
    out = llm_generate(prompt, temperature=0.35, num_predict=1800)
    data = parse_json_or_repair(out, schema_hint)
    return model_validate(DialogueOutline, data)


def _build_script(
    slides: List[Slide],
    digest: Digest,
    plan: ChapterPlan,
    briefs: List[ChapterBrief],
    outline: DialogueOutline,
    style: str,
    speaker_style: str,
    *,
    progress_callback: Optional[Callable[[int, str], None]] = None,
) -> List[ScriptSegment]:
    schema_hint = """JSON array:
[
  {"speaker":"host|expert|narrator","text":"string","slide_numbers":[1,2]}
]"""

    beats = outline.beats or []
    if not beats:
        # minimal fallback
        return [ScriptSegment(speaker="narrator", text=digest.main_topic or "Praesentation", slide_numbers=[])]

    briefs_by_chapter = {
        b.chapter_id: b
        for b in briefs
        if isinstance(getattr(b, "chapter_id", None), str) and b.chapter_id
    }
    segments: List[ScriptSegment] = []
    total = max(1, len(beats))
    batch_size = LEGACY_BEAT_BATCH_SIZE
    for batch_start in range(0, len(beats), batch_size):
        batch = beats[batch_start:batch_start + batch_size]
        if progress_callback:
            if len(batch) == 1:
                progress_callback(int((batch_start / total) * 100), f"Beat {batch_start+1}/{total}")
            else:
                progress_callback(
                    int((batch_start / total) * 100),
                    f"Beats {batch_start+1}-{batch_start+len(batch)}/{total}",
                )

        try:
            batch_segments = _build_script_batch(
                digest=digest,
                briefs_by_chapter=briefs_by_chapter,
                beats=batch,
                style=style,
                schema_hint=schema_hint,
            )
        except Exception:
            batch_segments = []

        if not batch_segments and len(batch) > 1:
            for beat in batch:
                try:
                    batch_segments.extend(
                        _build_script_batch(
                            digest=digest,
                            briefs_by_chapter=briefs_by_chapter,
                            beats=[beat],
                            style=style,
                            schema_hint=schema_hint,
                        )
                    )
                except Exception:
                    continue

        segments.extend([s for s in batch_segments if (s.text or "").strip()])

    if progress_callback:
        progress_callback(100, "Skript-Segmente fertig")

    return _postprocess_segments(segments, style)


def _build_script_batch(
    *,
    digest: Digest,
    briefs_by_chapter: Dict[str, ChapterBrief],
    beats: List[Beat],
    style: str,
    schema_hint: str,
) -> List[ScriptSegment]:
    if not beats:
        return []

    brief_payload = {
        beat.chapter_id: (briefs_by_chapter.get(beat.chapter_id).model_dump() if briefs_by_chapter.get(beat.chapter_id) else {})
        for beat in beats
    }
    beats_payload = [beat.model_dump() for beat in beats]
    digest_payload = digest.model_dump()

    prompt = f"""Schreibe Podcast-Skript-Segmente (TTS-ready) fuer einen oder mehrere Beats.

Regeln:
- Nichts erfinden. Basis: Digest + Kapitel-Briefs + Beats.
- Kurze Segmente (max 2 Saetze pro Segment).
- Deutsch, klar, angenehm zu hoeren.
- Keine Folienreferenzen im gesprochenen Text.
- Nutze ausschliesslich speaker=host|expert|narrator.
- Gib NUR JSON Array aus (Schema unten).

Kontext (Digest):
{dumps(digest_payload)}

Kapitel-Briefs:
{dumps(brief_payload)}

Beats:
{dumps(beats_payload)}

Wenn style=dialog:
- host = MARC
- expert = TINA

SCHEMA:
{schema_hint}
"""
    # Scale generation budget with beat count to avoid under-generation for larger batches.
    num_predict = min(2200, 600 + 340 * len(beats))
    out = llm_generate(prompt, temperature=0.45, num_predict=num_predict)
    data = parse_json_or_repair(out, schema_hint)

    try:
        parsed = [model_validate(ScriptSegment, x) for x in (data or []) if isinstance(x, dict)]
    except Exception:
        parsed = []

    if style == "monolog":
        parsed = [s.model_copy(update={"speaker": "narrator"}) for s in parsed]

    return [s for s in parsed if (s.text or "").strip()]


def _postprocess_segments(segments: List[ScriptSegment], style: str) -> List[ScriptSegment]:
    # Remove too-short segments and normalize whitespace.
    out: List[ScriptSegment] = []
    for s in segments:
        txt = " ".join(s.text.split()).strip()
        if len(txt) < 3:
            continue
        out.append(s.model_copy(update={"text": txt}))

    # Ensure the intro has brief self-intro (NotebookLM vibe) without inventing facts.
    if style == "dialog":
        if out and out[0].speaker != "host":
            out.insert(0, ScriptSegment(speaker="host", text="Hallo, ich bin Marc.", slide_numbers=[]))
        if len(out) > 1 and out[1].speaker != "expert":
            out.insert(1, ScriptSegment(speaker="expert", text="Hi, ich bin Tina.", slide_numbers=[]))
    return out
