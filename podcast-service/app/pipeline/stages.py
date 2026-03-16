from __future__ import annotations

from typing import Callable, Optional


def progress_scaled(cb: Optional[Callable[[int, str], None]], start: int, end: int):
    """
    Return a function(percent, stage) that maps 0-100 to [start..end].
    """

    def _inner(percent: int, stage: str) -> None:
        if not cb:
            return
        p = max(0, min(100, int(percent)))
        scaled = start + int((end - start) * (p / 100.0))
        cb(scaled, stage)

    return _inner

