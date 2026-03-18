from __future__ import annotations

from io import BytesIO

import httpx
from PIL import Image

from app.processors.vlm_captioner import VLMCaptioner


def _make_image_bytes(fmt: str = "PNG", size: tuple[int, int] = (1600, 1200), color: str = "white") -> bytes:
    image = Image.new("RGB", size, color=color)
    buf = BytesIO()
    image.save(buf, format=fmt)
    return buf.getvalue()


class _FakeResponse:
    def __init__(self, status_code: int, body: str):
        self.status_code = status_code
        self._body = body
        self.text = body

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            request = httpx.Request("POST", "http://example.test/v1/chat/completions")
            response = httpx.Response(self.status_code, request=request, text=self._body)
            raise httpx.HTTPStatusError("request failed", request=request, response=response)

    def json(self):
        return {
            "choices": [
                {
                    "message": {
                        "content": "Kurzer Alt-Text"
                    }
                }
            ]
        }


class _FakeClient:
    def __init__(self, responses: list[_FakeResponse], payloads: list[dict]):
        self._responses = responses
        self._payloads = payloads

    def __enter__(self) -> "_FakeClient":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def post(self, url: str, json: dict):
        self._payloads.append(json)
        return self._responses.pop(0)


def test_call_vllm_retries_without_context_after_model_length_error(monkeypatch):
    payloads: list[dict] = []
    responses = [
        _FakeResponse(
            400,
            '{"error":{"message":"The decoder prompt (length 10880) is longer than the maximum model length of 4096.","type":"BadRequestError","code":400}}',
        ),
        _FakeResponse(200, '{"choices":[{"message":{"content":"Kurzer Alt-Text"}}]}'),
    ]

    monkeypatch.setattr(VLMCaptioner, "_verify_vllm", lambda self: True)
    monkeypatch.setattr(
        httpx,
        "Client",
        lambda timeout: _FakeClient(responses, payloads),
    )

    captioner = VLMCaptioner()
    result = captioner._call_vllm(
        "Bitte beschreiben",
        _make_image_bytes("JPEG", size=(2400, 1600)),
        slide_context_bytes=_make_image_bytes("PNG", size=(2000, 1200)),
    )

    assert result == "Kurzer Alt-Text"
    assert len(payloads) == 2
    assert len(payloads[0]["messages"][0]["content"]) == 3
    assert len(payloads[1]["messages"][0]["content"]) == 2


def test_call_vllm_retries_after_internal_server_error(monkeypatch):
    payloads: list[dict] = []
    responses = [
        _FakeResponse(500, '{"error":{"message":"Internal server error","type":"InternalServerError","code":500}}'),
        _FakeResponse(200, '{"choices":[{"message":{"content":"Kurzer Alt-Text"}}]}'),
    ]

    monkeypatch.setattr(VLMCaptioner, "_verify_vllm", lambda self: True)
    monkeypatch.setattr(
        httpx,
        "Client",
        lambda timeout: _FakeClient(responses, payloads),
    )

    captioner = VLMCaptioner()
    result = captioner._call_vllm(
        "Bitte beschreiben",
        _make_image_bytes("PNG", size=(2200, 2200)),
        slide_context_bytes=_make_image_bytes("PNG", size=(1600, 900)),
    )

    assert result == "Kurzer Alt-Text"
    assert len(payloads) == 2
    assert len(payloads[1]["messages"][0]["content"]) == 2


def test_prepare_image_bytes_downscales_to_configured_edge():
    captioner = VLMCaptioner()

    prepared_bytes, mime_type = captioner._prepare_image_bytes(
        _make_image_bytes("JPEG", size=(2200, 1600)),
        max_edge=640,
    )

    image = Image.open(BytesIO(prepared_bytes))
    assert mime_type in {"image/jpeg", "image/png"}
    assert max(image.size) <= 640
