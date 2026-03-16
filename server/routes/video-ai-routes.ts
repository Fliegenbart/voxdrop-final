import { Router, Request, Response } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { requireAuth, gpuRateLimit, requireMinPlan } from "../auth/middleware";
import { UnsafeLlmRequestError, checkOllamaHealth, suggestChaptersFromSrtWithOllama, interpretVideoEditCommandWithOllama, chatWithOllama } from "../services/ollama";
import { getTmpDir } from "../utils/tmp";
import { safeExtensionFromOriginalName } from "../utils/safe-filename";
import { parseScriptFile } from "../services/script-parser";
import { generateVoiceoverChunkToFile } from "../services/smart-sync";
import { getSession, getSessionFile, addFileToSession } from "../services/session-storage";
import { syncScreenRecordingToAudio, getVideoMetadata } from "../services/video-processor";

const router = Router();

const scriptStorage = multer.diskStorage({
  destination: getTmpDir(),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = safeExtensionFromOriginalName(file.originalname) || "";
    cb(null, `smart-sync-script-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: scriptStorage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Suggest chapter starts + titles from an SRT transcript via local Ollama.
router.post(
  "/suggest-chapters",
  requireAuth,
  gpuRateLimit("simplify"),
  async (req: Request, res: Response) => {
    const { srt, maxChapters } = req.body || {};

    if (!srt || typeof srt !== "string") {
      return res.status(400).json({ error: "SRT ist erforderlich" });
    }

    // Basic payload guard (avoid huge prompt payloads)
    if (srt.length > 2_000_000) {
      return res.status(400).json({ error: "SRT ist zu groß (max 2MB)" });
    }

    const max = Number.isFinite(Number(maxChapters)) ? Number(maxChapters) : 8;
    const clampedMax = Math.max(3, Math.min(15, Math.floor(max)));

    const health = await checkOllamaHealth();
    if (!health.available) {
      return res.status(503).json({
        error: "LLM-Service nicht erreichbar",
        details: health.error,
      });
    }
    if (!health.model) {
      return res.status(503).json({
        error: "KI-Modell nicht geladen",
        details: health.error,
      });
    }

    try {
      const chapters = await suggestChaptersFromSrtWithOllama(srt, { maxChapters: clampedMax });
      return res.json({ chapters });
    } catch (err: any) {
      console.error("[VideoAI] suggest-chapters failed:", err);
      return res.status(500).json({
        error: "Kapitelvorschlag fehlgeschlagen",
        message: err?.message || "Unbekannter Fehler",
      });
    }
  }
);

// Interpret a natural-language edit command and return structured JSON.
router.post(
  "/interpret-command",
  requireAuth,
  gpuRateLimit("simplify"),
  async (req: Request, res: Response) => {
    const {
      prompt,
      durationSeconds,
      currentTimeSeconds,
      mode,
      trimStartSeconds,
      trimEndSeconds,
      transcript,
    } = req.body || {};

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "prompt ist erforderlich" });
    }
    if (prompt.length > 10_000) {
      return res.status(400).json({ error: "prompt ist zu lang" });
    }

    const health = await checkOllamaHealth();
    if (!health.available) {
      return res.status(503).json({
        error: "LLM-Service nicht erreichbar",
        details: health.error,
      });
    }
    if (!health.model) {
      return res.status(503).json({
        error: "KI-Modell nicht geladen",
        details: health.error,
      });
    }

    try {
      const command = await interpretVideoEditCommandWithOllama(prompt, {
        durationSeconds,
        currentTimeSeconds,
        mode,
        trimStartSeconds,
        trimEndSeconds,
        transcript: typeof transcript === 'string' ? transcript.slice(0, 5000) : undefined,
      });
      return res.json({ command });
    } catch (err: any) {
      const msg = err?.message || "Unbekannter Fehler";
      console.error("[VideoAI] interpret-command failed:", msg, err);
      if (err instanceof UnsafeLlmRequestError) {
        return res.status(400).json({
          error: "Regie-Anweisung aus Sicherheitsgründen abgelehnt",
          message: msg,
        });
      }
      // Surface Ollama-specific errors as 503 so the frontend can show a helpful message.
      const isOllamaError = msg.includes("Ollama error") || msg.includes("fetch failed") || msg.includes("AbortError");
      return res.status(isOllamaError ? 503 : 500).json({
        error: isOllamaError ? "LLM-Service Fehler" : "Regie-Interpretation fehlgeschlagen",
        message: msg,
      });
    }
  }
);

// Chat-based AI assistant for guided video editing.
router.post(
  "/chat",
  requireAuth,
  gpuRateLimit("simplify"),
  async (req: Request, res: Response) => {
    const { messages, projectContext } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages ist erforderlich" });
    }

    // Limit conversation length to prevent huge prompts
    const recentMessages = messages.slice(-20).map((m: any) => ({
      role: String(m?.role || "user"),
      content: String(m?.content || "").slice(0, 2000),
    }));

    const health = await checkOllamaHealth();
    if (!health.available) {
      return res.status(503).json({
        error: "LLM-Service nicht erreichbar",
        details: health.error,
      });
    }
    if (!health.model) {
      return res.status(503).json({
        error: "KI-Modell nicht geladen",
        details: health.error,
      });
    }

    try {
      const reply = await chatWithOllama(recentMessages, projectContext);
      return res.json({ reply });
    } catch (err: any) {
      const msg = err?.message || "Unbekannter Fehler";
      console.error("[VideoAI] chat failed:", msg, err);
      if (err instanceof UnsafeLlmRequestError) {
        return res.status(400).json({
          error: "Chat-Anfrage aus Sicherheitsgründen abgelehnt",
          message: msg,
        });
      }
      const isOllamaError = msg.includes("Ollama error") || msg.includes("fetch failed") || msg.includes("AbortError");
      return res.status(isOllamaError ? 503 : 500).json({
        error: isOllamaError ? "LLM-Service Fehler" : "Chat fehlgeschlagen",
        message: msg,
      });
    }
  }
);

// Smart-Sync ("Erklaervideo-Autopilot"): generate TTS chunks from a script and elastically sync a screen recording.
router.post(
  "/smart-sync",
  requireAuth,
  requireMinPlan("pro"),
  gpuRateLimit("voiceover"),
  upload.single("script"),
  async (req: Request, res: Response) => {
    const sessionId = req.headers["x-session-id"] as string;
    const { videoFileId, voice, ttsEngine, sceneThreshold } = req.body || {};
    const script = req.file;

    if (!sessionId) return res.status(400).json({ error: "Session ID required" });
    if (!videoFileId || typeof videoFileId !== "string") return res.status(400).json({ error: "videoFileId ist erforderlich" });
    if (!script) return res.status(400).json({ error: "Skript ist erforderlich" });

    const v = (voice === "male" || voice === "female") ? voice : "female";
    const te = (ttsEngine === "qwen3tts" || ttsEngine === "xtts" || ttsEngine === "piper") ? ttsEngine : undefined;
    const threshold = Number.isFinite(Number(sceneThreshold)) ? Number(sceneThreshold) : undefined;

    const session = getSession(sessionId, req.user!.id);
    if (!session) return res.status(404).json({ error: "Session not found" });

    const videoFile = getSessionFile(sessionId, videoFileId, req.user!.id);
    if (!videoFile) return res.status(404).json({ error: "Video file not found" });
    if (!videoFile.mimeType?.startsWith("video/")) return res.status(400).json({ error: "videoFileId muss ein Video sein" });

    const tmpAudioFiles: string[] = [];
    try {
      const scriptBuf = fs.readFileSync(script.path);
      const chunks = await parseScriptFile(scriptBuf, script.mimetype);
      if (chunks.length === 0) return res.status(400).json({ error: "Kein Text im Skript gefunden" });

      // Safety guard: avoid runaway chunk counts.
      const maxChunks = 40;
      if (chunks.length > maxChunks) {
        return res.status(400).json({ error: `Zu viele Abschnitte (${chunks.length}). Bitte weniger Marker nutzen (max ${maxChunks}).` });
      }

      // Generate TTS per chunk (small parallelism so we don't overload).
      const concurrency = 2;
      const results: Array<{ filePath: string; durationSeconds: number }> = new Array(chunks.length);

      let next = 0;
      const workers = Array.from({ length: concurrency }, async () => {
        while (true) {
          const i = next++;
          if (i >= chunks.length) break;
          const text = chunks[i].text;
          const r = await generateVoiceoverChunkToFile({ text, voice: v, ttsEngine: te, timeoutMs: 240_000 });
          results[i] = { filePath: r.filePath, durationSeconds: r.durationSeconds };
          tmpAudioFiles.push(r.filePath);
        }
      });

      await Promise.all(workers);

      const outputDir = path.dirname(videoFile.path);
      const outputPath = path.join(outputDir, `${uuidv4()}.mp4`);

      const sync = await syncScreenRecordingToAudio(
        videoFile.path,
        results.map((r) => ({ path: r.filePath, durationSeconds: r.durationSeconds })),
        outputPath,
        { sceneThreshold: threshold }
      );

      if (!sync.success || !sync.outputPath) {
        return res.status(500).json({ error: sync.error || "Smart-Sync fehlgeschlagen" });
      }

      const baseName = path.basename(videoFile.originalName, path.extname(videoFile.originalName));
      const outputFileName = `${baseName}_autopilot_${uuidv4().slice(0, 8)}.mp4`;

      const sessionFile = addFileToSession(sessionId, sync.outputPath, outputFileName, "video/mp4");
      if (!sessionFile) {
        return res.status(500).json({ error: "Failed to save output video" });
      }

      const metadata = await getVideoMetadata(sessionFile.path);
      return res.json({
        success: true,
        file: {
          id: sessionFile.id,
          name: sessionFile.originalName,
          mimeType: sessionFile.mimeType,
          size: sessionFile.size,
          createdAt: sessionFile.createdAt,
          metadata
        }
      });
    } catch (err: any) {
      console.error("[VideoAI] smart-sync failed:", err);
      return res.status(500).json({ error: err?.message || "Smart-Sync fehlgeschlagen" });
    } finally {
      // Cleanup uploaded script + temp audio files.
      try { if (script?.path && fs.existsSync(script.path)) fs.unlinkSync(script.path); } catch {}
      for (const p of tmpAudioFiles) {
        try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch {}
      }
    }
  }
);

export default router;
