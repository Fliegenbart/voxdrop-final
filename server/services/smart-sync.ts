import fs from 'fs';
import path from 'path';
import { getTmpDir } from '../utils/tmp';

const PODCAST_SERVICE_URL = process.env.PODCAST_SERVICE_URL || 'http://podcast:8001';

type Voice = 'male' | 'female';
type TtsEngine = 'qwen3tts' | 'xtts' | 'piper';

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

export async function generateVoiceoverChunkToFile(params: {
  text: string;
  voice: Voice;
  ttsEngine?: TtsEngine;
  timeoutMs?: number;
}): Promise<{ jobId: string; filePath: string; durationSeconds: number }> {
  const { text, voice, ttsEngine } = params;
  const timeoutMs = Math.max(10_000, Math.min(10 * 60_000, Number(params.timeoutMs || 180_000)));

  const genRes = await fetch(`${PODCAST_SERVICE_URL}/voiceover/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      voice,
      pronunciationRules: [],
      ttsEngine
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!genRes.ok) {
    const err = await genRes.json().catch(() => ({ detail: 'Generierung fehlgeschlagen' }));
    throw new Error(err.detail || 'Generierung fehlgeschlagen');
  }

  const gen = await genRes.json() as { job_id: string; status: string };
  const jobId = gen.job_id;
  if (!jobId) throw new Error('TTS Job ID fehlt');

  const startedAt = Date.now();
  let durationSeconds = 0;

  while (true) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`TTS Timeout nach ${Math.round(timeoutMs / 1000)}s (job ${jobId})`);
    }

    const statusRes = await fetch(`${PODCAST_SERVICE_URL}/voiceover/status/${jobId}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!statusRes.ok) {
      throw new Error('Status-Abfrage fehlgeschlagen');
    }
    const st = await statusRes.json() as {
      status: string;
      duration_seconds?: number;
      error?: string;
    };

    durationSeconds = Number(st.duration_seconds || 0) || 0;
    if (st.status === 'completed') break;
    if (st.status === 'failed') throw new Error(st.error || 'TTS fehlgeschlagen');

    await sleep(800);
  }

  const audioRes = await fetch(`${PODCAST_SERVICE_URL}/voiceover/download/${jobId}`, {
    signal: AbortSignal.timeout(120_000),
  });
  if (!audioRes.ok) {
    throw new Error('TTS Download fehlgeschlagen');
  }

  const buf = Buffer.from(await audioRes.arrayBuffer());
  const tmpDir = getTmpDir();
  const filePath = path.join(tmpDir, `smart-sync-${jobId}.mp3`);
  fs.writeFileSync(filePath, buf);

  // Duration may not always be present; keep a sane fallback.
  const fallback = Math.max(1, Math.round(text.trim().split(/\s+/).filter(Boolean).length / 2.2)); // ~2.2 wps
  const resolvedDuration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : fallback;

  return { jobId, filePath, durationSeconds: resolvedDuration };
}

