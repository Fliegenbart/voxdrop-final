"""
Redis-backed GPU lock to serialize VRAM-heavy work across services.
"""
from __future__ import annotations

import asyncio
import logging
import os
import socket
import time
import uuid
from dataclasses import dataclass
from typing import Optional

from redis import asyncio as redis_async

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
GPU_LOCK_KEY = os.getenv("GPU_LOCK_KEY", "voxdrop:gpu-lock")
GPU_LOCK_WAIT_MS = int(os.getenv("GPU_LOCK_WAIT_MS", "900000"))  # 15 minutes
GPU_LOCK_TTL_MS = int(os.getenv("GPU_LOCK_TTL_MS", "1800000"))  # 30 minutes
GPU_LOCK_RETRY_MS = int(os.getenv("GPU_LOCK_RETRY_MS", "1500"))
GPU_LOCK_RENEW_MS = int(os.getenv("GPU_LOCK_RENEW_MS", "60000"))

_redis_client: Optional[redis_async.Redis] = None

_RELEASE_SCRIPT = """
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
else
  return 0
end
"""

_RENEW_SCRIPT = """
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('pexpire', KEYS[1], ARGV[2])
else
  return 0
end
"""


async def _get_client() -> redis_async.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis_async.from_url(REDIS_URL, decode_responses=True)
    return _redis_client


def _lock_token(operation: str) -> str:
    host = socket.gethostname()
    pid = os.getpid()
    rand = uuid.uuid4().hex[:10]
    return f"{operation}:{host}:{pid}:{rand}"


@dataclass
class GpuLock:
    token: str
    renew_task: asyncio.Task
    stop_event: asyncio.Event
    ttl_ms: int


async def _renew_loop(client: redis_async.Redis, lock: GpuLock) -> None:
    try:
        while not lock.stop_event.is_set():
            await asyncio.sleep(max(GPU_LOCK_RENEW_MS, 1000) / 1000.0)
            try:
                await client.eval(_RENEW_SCRIPT, 1, GPU_LOCK_KEY, lock.token, lock.ttl_ms)
            except Exception as exc:  # pragma: no cover - best-effort renewal
                logger.warning("[GPULock] Renewal failed: %s", exc)
    except asyncio.CancelledError:  # pragma: no cover - shutdown path
        return


async def acquire_gpu_lock(operation: str, wait_ms: Optional[int] = None, ttl_ms: Optional[int] = None) -> Optional[GpuLock]:
    wait_ms = int(wait_ms or GPU_LOCK_WAIT_MS)
    ttl_ms = int(ttl_ms or GPU_LOCK_TTL_MS)
    retry_ms = max(int(GPU_LOCK_RETRY_MS), 200)

    client = await _get_client()
    token = _lock_token(operation)
    deadline = time.monotonic() + (wait_ms / 1000.0)
    attempt = 0

    while time.monotonic() < deadline:
        attempt += 1
        try:
            acquired = await client.set(GPU_LOCK_KEY, token, nx=True, px=ttl_ms)
            if acquired:
                stop_event = asyncio.Event()
                renew_task = asyncio.create_task(_renew_loop(client, GpuLock(token, None, stop_event, ttl_ms)))
                lock = GpuLock(token=token, renew_task=renew_task, stop_event=stop_event, ttl_ms=ttl_ms)
                logger.info("[GPULock] Acquired for %s after %d attempts", operation, attempt)
                return lock
        except Exception as exc:
            logger.warning("[GPULock] Redis error while acquiring lock: %s", exc)
            break

        if attempt == 1 or attempt % 20 == 0:
            remaining = max(0.0, deadline - time.monotonic())
            logger.info("[GPULock] Waiting for lock (%s), remaining %.1fs", operation, remaining)
        await asyncio.sleep(retry_ms / 1000.0)

    logger.warning("[GPULock] Timed out waiting for lock (%s)", operation)
    return None


async def release_gpu_lock(lock: Optional[GpuLock]) -> None:
    if not lock:
        return

    try:
        lock.stop_event.set()
        if lock.renew_task:
            lock.renew_task.cancel()
            try:
                await lock.renew_task
            except asyncio.CancelledError:
                pass
    except Exception:
        pass

    try:
        client = await _get_client()
        await client.eval(_RELEASE_SCRIPT, 1, GPU_LOCK_KEY, lock.token)
        logger.info("[GPULock] Released")
    except Exception as exc:  # pragma: no cover - best-effort release
        logger.warning("[GPULock] Failed to release lock: %s", exc)

