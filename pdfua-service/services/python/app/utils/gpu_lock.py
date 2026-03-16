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

from ..config import (
    REDIS_URL,
    GPU_LOCK_KEY,
    GPU_LOCK_WAIT_MS,
    GPU_LOCK_TTL_MS,
    GPU_LOCK_RETRY_MS,
    GPU_LOCK_RENEW_MS,
    GPU_QUEUE_KEY,
    GPU_QUEUE_HEARTBEAT_PREFIX,
    GPU_QUEUE_STALE_SECONDS,
)

logger = logging.getLogger(__name__)

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


async def get_gpu_lock_token() -> Optional[str]:
    client = await _get_client()
    try:
        return await client.get(GPU_LOCK_KEY)
    except Exception as exc:  # pragma: no cover - best-effort read
        logger.warning("[GPULock] Failed to read lock token: %s", exc)
        return None


async def release_gpu_lock_token(token: str) -> bool:
    if not token:
        return False
    client = await _get_client()
    try:
        deleted = await client.eval(_RELEASE_SCRIPT, 1, GPU_LOCK_KEY, token)
        return bool(deleted)
    except Exception as exc:  # pragma: no cover - best-effort release
        logger.warning("[GPULock] Failed to release lock token: %s", exc)
        return False


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
    # Keep the lock alive while the GPU work is running.
    try:
        while not lock.stop_event.is_set():
            await asyncio.sleep(max(GPU_LOCK_RENEW_MS, 1000) / 1000.0)
            try:
                await client.eval(_RENEW_SCRIPT, 1, GPU_LOCK_KEY, lock.token, lock.ttl_ms)
            except Exception as exc:  # pragma: no cover - best-effort renewal
                logger.warning("[GPULock] Renewal failed: %s", exc)
    except asyncio.CancelledError:  # pragma: no cover - shutdown path
        return


async def acquire_gpu_lock(
    operation: str,
    wait_ms: Optional[int] = None,
    ttl_ms: Optional[int] = None,
) -> Optional[GpuLock]:
    """
    Acquire the global GPU lock, waiting up to wait_ms.

    Returns a GpuLock handle if acquired, otherwise None.
    """
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

        # Log occasionally so we can see queueing behavior in logs.
        if attempt == 1 or attempt % 20 == 0:
            remaining = max(0.0, deadline - time.monotonic())
            logger.info(
                "[GPULock] Waiting for lock (%s), remaining %.1fs",
                operation,
                remaining,
            )
        await asyncio.sleep(retry_ms / 1000.0)

    logger.warning("[GPULock] Timed out waiting for lock (%s)", operation)
    return None


def _queue_score(priority: int, enqueued_at_ms: int) -> int:
    # Lower priority number = higher priority.
    safe_priority = max(1, min(int(priority or 2), 9))
    return safe_priority * 1_000_000_000_000 + int(enqueued_at_ms)


async def enqueue_gpu_queue(job_id: str, priority: int = 2, enqueued_at_ms: Optional[int] = None) -> None:
    if not job_id:
        return
    client = await _get_client()
    timestamp_ms = int(enqueued_at_ms or time.time() * 1000)
    score = _queue_score(priority, timestamp_ms)
    try:
        await client.zadd(GPU_QUEUE_KEY, {job_id: score}, nx=True)
        await client.setex(f"{GPU_QUEUE_HEARTBEAT_PREFIX}{job_id}", GPU_QUEUE_STALE_SECONDS, "1")
    except Exception as exc:  # pragma: no cover - best-effort queueing
        logger.warning("[GPUQueue] Failed to enqueue job %s: %s", job_id, exc)


async def touch_gpu_queue(job_id: str) -> None:
    if not job_id:
        return
    client = await _get_client()
    try:
        await client.setex(f"{GPU_QUEUE_HEARTBEAT_PREFIX}{job_id}", GPU_QUEUE_STALE_SECONDS, "1")
    except Exception as exc:  # pragma: no cover
        logger.warning("[GPUQueue] Failed to heartbeat job %s: %s", job_id, exc)


async def dequeue_gpu_queue(job_id: str) -> None:
    if not job_id:
        return
    client = await _get_client()
    try:
        await client.zrem(GPU_QUEUE_KEY, job_id)
        await client.delete(f"{GPU_QUEUE_HEARTBEAT_PREFIX}{job_id}")
    except Exception as exc:  # pragma: no cover
        logger.warning("[GPUQueue] Failed to dequeue job %s: %s", job_id, exc)


async def _cleanup_stale_queue_entries(client: redis_async.Redis, members: list[str]) -> list[str]:
    if not members:
        return members
    try:
        pipeline = client.pipeline()
        for member in members:
            pipeline.exists(f"{GPU_QUEUE_HEARTBEAT_PREFIX}{member}")
        exists_flags = await pipeline.execute()
        stale = [m for m, exists in zip(members, exists_flags) if not exists]
        if stale:
            await client.zrem(GPU_QUEUE_KEY, *stale)
            members = [m for m in members if m not in stale]
        return members
    except Exception as exc:  # pragma: no cover
        logger.warning("[GPUQueue] Cleanup failed: %s", exc)
        return members


async def get_gpu_queue_position(job_id: str) -> tuple[Optional[int], int]:
    if not job_id:
        return None, 0
    client = await _get_client()
    try:
        members = await client.zrange(GPU_QUEUE_KEY, 0, -1)
        members = await _cleanup_stale_queue_entries(client, members)
        if not members:
            return None, 0
        try:
            position = members.index(job_id)
        except ValueError:
            return None, len(members)
        return position, len(members)
    except Exception as exc:  # pragma: no cover
        logger.warning("[GPUQueue] Failed to read position for %s: %s", job_id, exc)
        return None, 0


async def release_gpu_lock(lock: Optional[GpuLock]) -> None:
    """Release the GPU lock if we hold it."""
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
