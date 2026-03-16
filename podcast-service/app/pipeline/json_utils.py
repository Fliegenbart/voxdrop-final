from __future__ import annotations

import json
from typing import Any, Optional


def extract_first_json(text: str) -> Optional[Any]:
    """
    Extract the first valid JSON object/array from a text blob.

    LLMs often wrap JSON with extra text, code fences, or emit multiple JSON blobs.
    This function scans for the first syntactically complete JSON value and parses it.
    """
    if not text:
        return None

    s = text.strip()

    # Strip common markdown wrappers.
    s = s.replace("```json", "```").replace("```JSON", "```")
    if "```" in s:
        # Keep the largest fenced block if present.
        parts = s.split("```")
        if len(parts) >= 3:
            # Prefer the first fenced content that contains a JSON start.
            fenced = None
            for i in range(1, len(parts), 2):
                if "{" in parts[i] or "[" in parts[i]:
                    fenced = parts[i]
                    break
            if fenced is not None:
                s = fenced.strip()

    def _try_parse(snippet: str) -> Optional[Any]:
        try:
            return json.loads(snippet)
        except Exception:
            return None

    # Fast-path: entire string is JSON.
    direct = _try_parse(s)
    if direct is not None:
        return direct

    # Scan for first complete JSON object/array using a small state machine.
    starts = [i for i, ch in enumerate(s) if ch in "{["]
    for start in starts:
        open_ch = s[start]
        close_ch = "}" if open_ch == "{" else "]"
        depth = 0
        in_str = False
        esc = False
        for end in range(start, len(s)):
            ch = s[end]
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == "\"":
                    in_str = False
                continue

            if ch == "\"":
                in_str = True
                continue

            if ch == open_ch:
                depth += 1
            elif ch == close_ch:
                depth -= 1
                if depth == 0:
                    candidate = s[start : end + 1].strip()
                    parsed = _try_parse(candidate)
                    if parsed is not None:
                        return parsed
                    break

    return None
