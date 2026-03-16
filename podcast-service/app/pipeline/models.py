from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class SlideImage(BaseModel):
    description: Optional[str] = None


class Slide(BaseModel):
    slide_number: int
    title: str = ""
    content: List[str] = Field(default_factory=list)
    speaker_notes: str = ""
    images: List[SlideImage] = Field(default_factory=list)


class Fact(BaseModel):
    text: str
    slide_numbers: List[int] = Field(default_factory=list)


class Digest(BaseModel):
    main_topic: str
    target_audience: str = ""
    key_messages: List[str] = Field(default_factory=list)
    important_facts: List[Fact] = Field(default_factory=list)
    glossary: List[Dict[str, str]] = Field(default_factory=list)


class Chapter(BaseModel):
    id: str
    name: str
    slide_numbers: List[int] = Field(default_factory=list)
    learning_goal: str = ""
    key_points: List[Fact] = Field(default_factory=list)


class ChapterPlan(BaseModel):
    podcast_title: str
    chapters: List[Chapter] = Field(default_factory=list)
    narrative_notes: str = ""


class ChapterBrief(BaseModel):
    chapter_id: str
    summary: str
    must_mention_facts: List[Fact] = Field(default_factory=list)
    do_not_invent: List[str] = Field(default_factory=list)


class Beat(BaseModel):
    chapter_id: str
    beat_id: str
    question: str
    answer_bullets: List[str] = Field(default_factory=list)
    slide_numbers: List[int] = Field(default_factory=list)


class DialogueOutline(BaseModel):
    beats: List[Beat] = Field(default_factory=list)


Speaker = Literal["host", "expert", "narrator"]


class ScriptSegment(BaseModel):
    speaker: Speaker
    text: str
    slide_numbers: List[int] = Field(default_factory=list)

    # Used for debugging/quality checks. Not needed for TTS.
    meta: Dict[str, Any] = Field(default_factory=dict)

