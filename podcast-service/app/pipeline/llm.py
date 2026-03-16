from __future__ import annotations

import json
import os
import socket
import urllib.error
import urllib.request
from typing import Any, Optional, Type, TypeVar

import ollama

from app.config import OLLAMA_CONFIG, VLM_CONFIG
from app.pipeline.json_utils import extract_first_json

T = TypeVar("T")


PODCAST_LLM_PROVIDER = os.getenv("PODCAST_LLM_PROVIDER", "vllm").lower()  # vllm|ollama
PODCAST_LLM_CONTEXT_LENGTH = max(256, int(os.getenv("PODCAST_LLM_CONTEXT_LENGTH", "1024")))
PODCAST_LLM_OUTPUT_RESERVED_RATIO = 0.25


def _estimate_tokens(text: str) -> int:
    # Conservative approximation for mixed DE/EN text.
    return max(1, int(len(text) / 4))


def _compact_prompt_for_context(prompt: str, max_chars: int) -> str:
    if len(prompt) <= max_chars:
        return prompt
    if max_chars <= 120:
        return prompt[-max_chars:]
    head = prompt[: max_chars // 3]
    tail = prompt[-(max_chars - len(head) - 30) :]
    return f"{head}\n...\n[Prompt gekuerzt]\n...\n{tail}"


def _is_context_overflow_message(message: str) -> bool:
    lower = (message or "").lower()
    return (
        "context length" in lower
        or "maximum context length" in lower
        or "max_tokens" in lower and "context" in lower
        or "llm_context_overflow" in lower
    )


def _vllm_generate(
    prompt: str,
    *,
    temperature: float,
    num_predict: int,
    overflow_retry: bool = True,
) -> str:
    """
    Use the existing OpenAI-compatible vLLM endpoint (same as vision) for text-only generation.
    This avoids loading a separate Ollama model into GPU VRAM.
    """
    host = (VLM_CONFIG.get("host") or "").rstrip("/")
    if not host:
        raise RuntimeError("VLM_HOST not configured for vLLM text generation")
    if not host.endswith("/v1"):
        host = f"{host}/v1"
    model = VLM_CONFIG.get("model") or "Qwen/Qwen3-VL-8B-Instruct-FP8"

    reserved_for_output = max(64, int(PODCAST_LLM_CONTEXT_LENGTH * PODCAST_LLM_OUTPUT_RESERVED_RATIO))
    max_tokens = max(32, min(int(num_predict), reserved_for_output))
    prompt_tokens = _estimate_tokens(prompt)
    if prompt_tokens + max_tokens >= PODCAST_LLM_CONTEXT_LENGTH:
        allowed_prompt_tokens = max(64, PODCAST_LLM_CONTEXT_LENGTH - max_tokens - 16)
        allowed_chars = max(256, allowed_prompt_tokens * 4)
        prompt = _compact_prompt_for_context(prompt, allowed_chars)

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": float(temperature),
        "max_tokens": int(max_tokens),
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{host}/chat/completions",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    # vLLM can be slow on cold-start due to torch.compile; keep it generous.
    timeout_s = float(os.getenv("PODCAST_LLM_TIMEOUT", str(VLM_CONFIG.get("timeout", 120))))
    old_timeout = socket.getdefaulttimeout()
    try:
        socket.setdefaulttimeout(timeout_s)
        try:
            with urllib.request.urlopen(req) as resp:
                body = resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            body = ""
            try:
                body = e.read().decode("utf-8", errors="replace")
            except Exception:
                body = str(e)
            if overflow_retry and _is_context_overflow_message(body):
                reduced_prompt = _compact_prompt_for_context(prompt, max(256, int(len(prompt) * 0.6)))
                if reduced_prompt != prompt:
                    return _vllm_generate(
                        reduced_prompt,
                        temperature=temperature,
                        num_predict=max(64, int(max_tokens * 0.75)),
                        overflow_retry=False,
                    )
                raise RuntimeError(f"llm_context_overflow: {body[:500]}")
            raise RuntimeError(body[:1000] or str(e))
        j = json.loads(body)
        return (
            (j.get("choices") or [{}])[0]
            .get("message", {})
            .get("content", "")
            .strip()
        )
    finally:
        socket.setdefaulttimeout(old_timeout)


def _ollama_generate(prompt: str, *, temperature: float, num_predict: int) -> str:
    client = ollama.Client(host=OLLAMA_CONFIG["host"])
    resp = client.generate(
        model=OLLAMA_CONFIG["model"],
        prompt=prompt,
        options={"temperature": temperature, "num_predict": num_predict},
    )
    return (resp.get("response") or "").strip()


def generate(prompt: str, *, temperature: float, num_predict: int) -> str:
    if PODCAST_LLM_PROVIDER == "ollama":
        return _ollama_generate(prompt, temperature=temperature, num_predict=num_predict)
    try:
        return _vllm_generate(prompt, temperature=temperature, num_predict=num_predict)
    except Exception as e:
        # Fallback to Ollama if vLLM is unavailable for any reason.
        return _ollama_generate(prompt, temperature=temperature, num_predict=num_predict)


def parse_json_or_repair(text: str, schema_hint: str, *, temperature: float = 0.1) -> Any:
    # 1) Try to parse directly (robust extractor handles fences/extra text).
    data = extract_first_json(text)
    if data is not None:
        return data

    # 2) Common cleanup pass (sometimes the model returns leading/trailing junk).
    cleaned = (text or "").strip()
    cleaned = cleaned.replace("\u00ad", "").replace("\u200b", "").replace("\ufeff", "")
    data = extract_first_json(cleaned)
    if data is not None:
        return data

    def _repair_once(input_text: str, attempt: int) -> Any:
        repair_prompt = f"""Du bist ein JSON-Reparatur-Tool.

Konvertiere den folgenden Text in STRICTES JSON entsprechend diesem Schema-Hinweis:
{schema_hint}

Regeln:
- Gib NUR JSON aus (keine Erklaerung, kein Markdown).
- Wenn Informationen fehlen, nutze leere Strings/Arrays, aber bleibe im Schema.
- Keine Trailing Commas.
- Strings in doppelten Anfuehrungszeichen.

TEXT:
{input_text}
"""
        # Keep repair outputs within constrained vLLM contexts used in production.
        repaired = generate(repair_prompt, temperature=temperature, num_predict=800)
        data = extract_first_json(repaired)
        if data is None:
            raise ValueError(f"Could not parse/repair JSON from LLM output (attempt {attempt})")
        return data

    # 3) Repair attempts (some models need 2 rounds).
    last_err: Optional[Exception] = None
    for attempt in (1, 2):
        try:
            return _repair_once(cleaned, attempt)
        except Exception as e:
            last_err = e

    raise ValueError("Could not parse/repair JSON from LLM output") from last_err


def model_validate(cls: Type[T], data: Any) -> T:
    # Pydantic v2 provides model_validate. Keep a small shim for safety.
    if hasattr(cls, "model_validate"):
        return getattr(cls, "model_validate")(data)  # type: ignore[misc]
    return cls.parse_obj(data)  # type: ignore[call-arg]


def dumps(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2)
