from __future__ import annotations

import asyncio
from io import BytesIO

import httpx
from PIL import Image

from app.processors.vision_analyzer import VisionAnalyzer


def _make_image_bytes(fmt: str = "PNG", size: tuple[int, int] = (1800, 1400), color: str = "white") -> bytes:
    image = Image.new("RGB", size, color=color)
    buf = BytesIO()
    image.save(buf, format=fmt)
    return buf.getvalue()


class _FakeResponse:
    def __init__(self, status_code: int, body: str):
        self.status_code = status_code
        self.text = body
        self._body = body

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
                        "content": '{"summary": "Kurze Zusammenfassung"}'
                    }
                }
            ]
        }


class _FakeAsyncClient:
    def __init__(self, responses: list[_FakeResponse], payloads: list[dict]):
        self._responses = responses
        self._payloads = payloads

    async def post(self, url: str, json: dict):
        self._payloads.append(json)
        return self._responses.pop(0)


def test_prepare_image_bytes_downscales_to_configured_edge():
    analyzer = VisionAnalyzer()

    prepared_bytes, mime_type = analyzer._prepare_image_bytes(
        _make_image_bytes("PNG", size=(2000, 1600)),
        max_edge=640,
    )

    image = Image.open(BytesIO(prepared_bytes))
    assert mime_type in {"image/jpeg", "image/png"}
    assert max(image.size) <= 640


def test_call_vllm_retries_with_smaller_image_after_length_error():
    analyzer = VisionAnalyzer()
    payloads: list[dict] = []
    client = _FakeAsyncClient(
        [
            _FakeResponse(
                400,
                '{"error":{"message":"The decoder prompt (length 5041) is longer than the maximum model length of 4096.","type":"BadRequestError","code":400}}',
            ),
            _FakeResponse(200, '{"choices":[{"message":{"content":"{\\"summary\\": \\"Kurze Zusammenfassung\\"}"}}]}'),
        ],
        payloads,
    )

    result = asyncio.run(analyzer._call_vllm(client, "Bitte kurz zusammenfassen", _make_image_bytes("JPEG", size=(2200, 1700))))

    assert '"summary"' in result
    assert len(payloads) == 2


def test_call_vllm_retries_after_internal_server_error():
    analyzer = VisionAnalyzer()
    payloads: list[dict] = []
    client = _FakeAsyncClient(
        [
            _FakeResponse(500, '{"error":{"message":"Internal server error","type":"InternalServerError","code":500}}'),
            _FakeResponse(200, '{"choices":[{"message":{"content":"{\\"summary\\": \\"Kurze Zusammenfassung\\"}"}}]}'),
        ],
        payloads,
    )

    result = asyncio.run(analyzer._call_vllm(client, "Bitte kurz zusammenfassen", _make_image_bytes("PNG", size=(2200, 2200))))

    assert '"summary"' in result
    assert len(payloads) == 2
