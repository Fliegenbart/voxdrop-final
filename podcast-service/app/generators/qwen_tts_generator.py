"""
Qwen3-TTS Generator - Optional TTS engine via external microservice.
"""
from __future__ import annotations

import os
import io
import json
import zipfile
from typing import Optional

import httpx

from app.config import QWEN_TTS_CONFIG, QWEN_TTS_SERVICE_URL


class QwenTTSGenerator:
    """HTTP proxy to the Qwen3-TTS service."""

    _instance: Optional["QwenTTSGenerator"] = None

    def __init__(self) -> None:
        self.base_url = QWEN_TTS_SERVICE_URL
        self.timeout = float(os.getenv("QWEN_TTS_TIMEOUT", "600"))
        self.last_error: str = ""

    def generate(self, text: str, voice: str, output_path: str, instruct: Optional[str] = None) -> bool:
        try:
            self.last_error = ""
            payload = {
                "text": text,
                "voice": voice,
                "language": QWEN_TTS_CONFIG.get("language") or "german",
            }
            effective_instruct = instruct or QWEN_TTS_CONFIG.get("instruct")
            if effective_instruct:
                payload["instruct"] = effective_instruct

            response = httpx.post(
                f"{self.base_url}/generate",
                json=payload,
                timeout=self.timeout,
            )

            if response.status_code != 200:
                self.last_error = f"{response.status_code} {response.text}"
                print(f"[Qwen3-TTS] Service error: {response.status_code} {response.text}")
                return False

            with open(output_path, "wb") as f:
                f.write(response.content)

            return os.path.exists(output_path) and os.path.getsize(output_path) > 0
        except Exception as e:
            self.last_error = str(e)
            print(f"[Qwen3-TTS] Error generating audio: {e}")
            return False

    def generate_batch(self, items: list[dict], output_paths: list[str]) -> list[bool]:
        """
        Generate multiple wav files in one HTTP request.

        items: [{"text": "...", "voice": "male|female", ...}, ...]
        output_paths: list of file paths where wav bytes are written (same length as items)
        """
        ok = [False] * len(items)
        if not items:
            return ok
        if len(items) != len(output_paths):
            raise ValueError("items/output_paths length mismatch")

        try:
            self.last_error = ""
            payload = {"items": []}
            for item in items:
                entry = {
                    "text": item.get("text", ""),
                    "voice": item.get("voice", "male"),
                    "language": item.get("language") or QWEN_TTS_CONFIG.get("language") or "german",
                }
                if item.get("speaker"):
                    entry["speaker"] = item["speaker"]
                instruct = item.get("instruct") or QWEN_TTS_CONFIG.get("instruct")
                if instruct:
                    entry["instruct"] = instruct
                payload["items"].append(entry)

            response = httpx.post(
                f"{self.base_url}/generate-batch",
                json=payload,
                timeout=self.timeout,
            )

            if response.status_code != 200:
                self.last_error = f"{response.status_code} {response.text}"
                print(f"[Qwen3-TTS] Batch service error: {response.status_code} {response.text}")
                return ok

            zf = zipfile.ZipFile(io.BytesIO(response.content))
            manifest = json.loads(zf.read("manifest.json").decode("utf-8"))
            manifest_by_idx = {int(m.get("index")): m for m in manifest if isinstance(m, dict) and "index" in m}

            for idx, out_path in enumerate(output_paths):
                info = manifest_by_idx.get(idx) or {}
                if not info.get("success"):
                    continue
                name = f"{idx:04d}.wav"
                if name not in zf.namelist():
                    continue
                data = zf.read(name)
                with open(out_path, "wb") as f:
                    f.write(data)
                ok[idx] = os.path.exists(out_path) and os.path.getsize(out_path) > 0

            return ok
        except Exception as e:
            self.last_error = str(e)
            print(f"[Qwen3-TTS] Error generating batch audio: {e}")
            return ok

    def is_available(self) -> bool:
        try:
            response = httpx.get(f"{self.base_url}/health", timeout=5.0)
            if response.status_code != 200:
                return False
            data = response.json()
            return bool(data.get("available"))
        except Exception as e:
            print(f"[Qwen3-TTS] Availability check failed: {e}")
            return False

    @classmethod
    def get_instance(cls) -> "QwenTTSGenerator":
        if cls._instance is None:
            cls._instance = QwenTTSGenerator()
        return cls._instance


def get_qwen_tts_generator() -> QwenTTSGenerator:
    return QwenTTSGenerator.get_instance()
