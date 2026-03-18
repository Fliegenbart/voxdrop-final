import asyncio
import importlib.util
import sys
import uuid
from pathlib import Path
from types import ModuleType, SimpleNamespace


MAIN_PATH = Path(__file__).resolve().parents[1] / "main.py"


class FakeWhisperModelFactory:
    def __init__(self, failures=None):
        self.calls = []
        self.failures = list(failures or [])

    def __call__(self, model_name, device, compute_type, download_root):
        self.calls.append(
            {
                "model_name": model_name,
                "device": device,
                "compute_type": compute_type,
                "download_root": download_root,
            }
        )
        if self.failures:
            failure = self.failures.pop(0)
            if failure is not None:
                raise failure
        return SimpleNamespace(
            transcribe=lambda *args, **kwargs: ([], SimpleNamespace(language="de", duration=0.0))
        )


def load_main_module(monkeypatch, *, cuda_device_count, model_failures=None, env=None):
    factory = FakeWhisperModelFactory(model_failures)

    fake_faster_whisper = ModuleType("faster_whisper")
    fake_faster_whisper.WhisperModel = factory

    fake_ctranslate2 = ModuleType("ctranslate2")
    fake_ctranslate2.get_cuda_device_count = lambda: cuda_device_count

    fake_gpu_lock = ModuleType("gpu_lock")

    class FakeGpuLock:
        pass

    async def acquire_gpu_lock(_operation):
        return FakeGpuLock()

    async def release_gpu_lock(_lock):
        return None

    fake_gpu_lock.acquire_gpu_lock = acquire_gpu_lock
    fake_gpu_lock.release_gpu_lock = release_gpu_lock
    fake_gpu_lock.GpuLock = FakeGpuLock

    monkeypatch.setitem(sys.modules, "faster_whisper", fake_faster_whisper)
    monkeypatch.setitem(sys.modules, "ctranslate2", fake_ctranslate2)
    monkeypatch.setitem(sys.modules, "gpu_lock", fake_gpu_lock)

    monkeypatch.setenv("WHISPER_MODEL", "large-v3-turbo")
    monkeypatch.setenv("WHISPER_DEVICE", "cuda")
    monkeypatch.setenv("WHISPER_COMPUTE_TYPE", "int8_float16")
    monkeypatch.setenv("WHISPER_FALLBACK_MODEL", "medium")
    monkeypatch.setenv("WHISPER_FALLBACK_COMPUTE_TYPE_CPU", "int8")
    monkeypatch.setenv("WHISPER_FALLBACK_COMPUTE_TYPE_GPU", "int8_float16")
    monkeypatch.setenv("WHISPER_PRELOAD", "false")
    monkeypatch.setenv("WHISPER_KEEP_LOADED_SECONDS", "0")

    for key, value in (env or {}).items():
        monkeypatch.setenv(key, value)

    module_name = f"whisper_service_main_test_{uuid.uuid4().hex}"
    spec = importlib.util.spec_from_file_location(module_name, MAIN_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module, factory


def test_ensure_model_loaded_falls_back_to_cpu_when_cuda_is_unavailable(monkeypatch):
    module, factory = load_main_module(monkeypatch, cuda_device_count=0)

    module._ensure_model_loaded()

    assert [call["device"] for call in factory.calls] == ["cpu"]
    assert module._active_device == "cpu"
    assert module._active_model_size == "medium"
    assert module._degraded_reason == "gpu_unavailable"
    assert module._last_load_error == "Configured device cuda but ctranslate2 reports 0 CUDA devices"


def test_ensure_model_loaded_retries_gpu_after_oom(monkeypatch):
    module, factory = load_main_module(
        monkeypatch,
        cuda_device_count=1,
        model_failures=[RuntimeError("CUDA out of memory"), None],
        env={
            "WHISPER_COMPUTE_TYPE": "float16",
            "WHISPER_FALLBACK_COMPUTE_TYPE_GPU": "int8_float16",
        },
    )

    module._ensure_model_loaded()

    assert [(call["device"], call["compute_type"]) for call in factory.calls] == [
        ("cuda", "float16"),
        ("cuda", "int8_float16"),
    ]
    assert module._active_device == "cuda"
    assert module._active_compute_type == "int8_float16"
    assert module._degraded_reason == "gpu_oom_reduced_precision"


def test_health_reports_not_ready_without_cuda_devices(monkeypatch):
    module, _factory = load_main_module(monkeypatch, cuda_device_count=0)

    health = asyncio.run(module.health_check())

    assert health.status == "degraded"
    assert health.transcribeReady is False
    assert health.cudaDeviceCount == 0
    assert health.activeDevice is None


def test_health_reports_cpu_fallback_when_loaded(monkeypatch):
    module, _factory = load_main_module(monkeypatch, cuda_device_count=0)
    module._ensure_model_loaded()

    health = asyncio.run(module.health_check())

    assert health.status == "degraded"
    assert health.transcribeReady is True
    assert health.modelLoaded is True
    assert health.activeDevice == "cpu"
    assert health.degradedReason == "gpu_unavailable"
