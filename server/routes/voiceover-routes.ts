/**
 * Voice-Over Routes
 *
 * API endpoints for text-to-speech voice-over generation.
 * Proxies requests to the podcast-service.
 */

import { Express, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import { detectFileType } from '../utils/file-type';
import { getTmpDir } from '../utils/tmp';
import { safeExtensionFromOriginalName } from '../utils/safe-filename';

import { requireAuth, gpuRateLimit } from '../auth/middleware';

// Podcast service URL
const PODCAST_SERVICE_URL = process.env.PODCAST_SERVICE_URL || 'http://podcast:8001';

// Whisper service URL for transcription
const WHISPER_SERVICE_URL = process.env.WHISPER_SERVICE_URL || 'http://whisper:8765';

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: getTmpDir(),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = safeExtensionFromOriginalName(file.originalname) || '';
    cb(null, `voiceover-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max for DOCX
});

const audioUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB max for pronunciation audio
});

const ALLOWED_DOC_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.ms-office',
  'application/zip',
  'application/x-cfb'
]);

const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/webm',
  'audio/mp3',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/aac',
  'audio/m4a',
  'audio/x-m4a',
  'audio/mp4'
]);

export function registerVoiceoverRoutes(app: Express) {
  /**
   * POST /api/voiceover/extract-text
   * Extract text from a Word document
   */
  app.post('/api/voiceover/extract-text',
    requireAuth,
    gpuRateLimit('voiceover'),
    upload.single('file'),
    async (req: Request, res: Response) => {
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: 'Keine Datei hochgeladen' });
      }

      // Validate file type
      const ext = (safeExtensionFromOriginalName(file.originalname) || '').toLowerCase();
      if (ext !== '.docx' && ext !== '.doc') {
        // Cleanup
        fs.unlinkSync(file.path);
        return res.status(400).json({ error: 'Nur Word-Dokumente (.docx) werden unterstuetzt' });
      }

      // Validate file signature (magic bytes)
      const detected = await detectFileType(file.path);
      const detectedMime = detected?.mime;
      const declaredMime = file.mimetype;
      const effectiveMime = detectedMime || declaredMime;

      const isDocx = ext === '.docx';
      const isDoc = ext === '.doc';
      const hasAllowedMime = !!effectiveMime && ALLOWED_DOC_MIME_TYPES.has(effectiveMime);

      if (!hasAllowedMime || (!isDocx && !isDoc)) {
        fs.unlinkSync(file.path);
        return res.status(400).json({ error: 'Ungültiger Dateityp. Nur DOCX/DOC erlaubt.' });
      }
      if (effectiveMime === 'application/zip' && !isDocx) {
        fs.unlinkSync(file.path);
        return res.status(400).json({ error: 'Ungültiger Dateityp. ZIP ist nur für DOCX erlaubt.' });
      }

      try {
        // Read file as buffer
        const fileBuffer = fs.readFileSync(file.path);

        // Forward to podcast service using native FormData
        const formData = new FormData();
        const blob = new Blob([fileBuffer], { type: file.mimetype || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
        formData.append('file', blob, file.originalname);

        const response = await fetch(`${PODCAST_SERVICE_URL}/voiceover/extract-text`, {
          method: 'POST',
          body: formData,
          signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ detail: 'Extraktion fehlgeschlagen' }));
          throw new Error(error.detail || 'Extraktion fehlgeschlagen');
        }

        const result = await response.json();

        res.json({
          text: result.text,
          wordCount: result.word_count,
          paragraphCount: result.paragraph_count,
          metadata: result.metadata
        });

      } catch (error: any) {
        console.error('[VoiceOver] Extract text error:', error);
        res.status(500).json({ error: error.message || 'Fehler beim Extrahieren des Textes' });
      } finally {
        // Cleanup temp file
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }
    }
  );

  /**
   * POST /api/voiceover/transcribe
   * Transcribe a short audio snippet for pronunciation correction
   */
  app.post('/api/voiceover/transcribe',
    requireAuth,
    gpuRateLimit('voiceover'),
    audioUpload.single('audio'),
    async (req: Request, res: Response) => {
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: 'Keine Audio-Datei hochgeladen' });
      }

      try {
        const detected = await detectFileType(file.path);
        const detectedMime = detected?.mime;
        const declaredMime = file.mimetype;
        const effectiveMime = detectedMime || declaredMime;

        if (!effectiveMime || !ALLOWED_AUDIO_MIME_TYPES.has(effectiveMime)) {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
          return res.status(400).json({ error: 'Ungültiger Audio-Dateityp' });
        }

        // Read file as buffer
        const audioBuffer = fs.readFileSync(file.path);

        // Forward to Whisper service using native FormData
        const formData = new FormData();
        const blob = new Blob([audioBuffer], { type: file.mimetype || 'audio/webm' });
        formData.append('audio', blob, file.originalname || 'pronunciation.webm');

        const response = await fetch(`${WHISPER_SERVICE_URL}/transcribe`, {
          method: 'POST',
          body: formData,
          signal: AbortSignal.timeout(60000),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: 'Transkription fehlgeschlagen' }));
          throw new Error(error.error || 'Transkription fehlgeschlagen');
        }

        const result = await response.json();

        res.json({
          text: result.text?.trim() || ''
        });

      } catch (error: any) {
        console.error('[VoiceOver] Transcribe error:', error);
        res.status(500).json({ error: error.message || 'Fehler bei der Transkription' });
      } finally {
        // Cleanup temp file
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }
    }
  );

  /**
   * POST /api/voiceover/generate
   * Generate voice-over audio from text
   */
  app.post('/api/voiceover/generate',
    requireAuth,
    gpuRateLimit('voiceover'),
    async (req: Request, res: Response) => {
      const { text, voice, pronunciationRules, ttsEngine } = req.body;

      if (!text || !text.trim()) {
        return res.status(400).json({ error: 'Kein Text angegeben' });
      }

      if (text.length > 50000) {
        return res.status(400).json({ error: 'Text zu lang (max. 50.000 Zeichen)' });
      }

      if (voice && !['male', 'female'].includes(voice)) {
        return res.status(400).json({ error: 'Ungueltige Stimme. Erlaubt: male, female' });
      }

      const validTtsEngines = ['xtts', 'qwen3tts', 'piper'];
      if (ttsEngine && !validTtsEngines.includes(ttsEngine)) {
        return res.status(400).json({ error: 'Ungueltige TTS-Engine' });
      }

      try {
        const response = await fetch(`${PODCAST_SERVICE_URL}/voiceover/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            voice: voice || 'female',
            pronunciationRules: pronunciationRules || [],
            ttsEngine
          }),
          signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ detail: 'Generierung fehlgeschlagen' }));
          throw new Error(error.detail || 'Generierung fehlgeschlagen');
        }

        const result = await response.json();

        res.json({
          jobId: result.job_id,
          status: result.status,
          message: result.message
        });

      } catch (error: any) {
        console.error('[VoiceOver] Generate error:', error);
        res.status(500).json({ error: error.message || 'Fehler bei der Generierung' });
      }
    }
  );

  /**
   * GET /api/voiceover/status/:jobId
   * Get voice-over job status
   */
  app.get('/api/voiceover/status/:jobId',
    requireAuth,
    async (req: Request, res: Response) => {
      const { jobId } = req.params;

      try {
        const response = await fetch(`${PODCAST_SERVICE_URL}/voiceover/status/${jobId}`, {
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
          if (response.status === 404) {
            return res.status(404).json({ error: 'Job nicht gefunden' });
          }
          throw new Error('Status-Abfrage fehlgeschlagen');
        }

        const result = await response.json();

        res.json({
          jobId: result.job_id,
          status: result.status,
          progress: result.progress,
          currentStage: result.current_stage,
          createdAt: result.created_at,
          completedAt: result.completed_at,
          durationSeconds: result.duration_seconds,
          error: result.error,
          downloadUrl: result.status === 'completed' ? `/api/voiceover/download/${jobId}` : null
        });

      } catch (error: any) {
        console.error('[VoiceOver] Status error:', error);
        res.status(500).json({ error: error.message || 'Fehler bei der Status-Abfrage' });
      }
    }
  );

  /**
   * GET /api/voiceover/download/:jobId
   * Download completed voice-over audio
   */
  app.get('/api/voiceover/download/:jobId',
    requireAuth,
    async (req: Request, res: Response) => {
      const { jobId } = req.params;

      try {
        const response = await fetch(`${PODCAST_SERVICE_URL}/voiceover/download/${jobId}`, {
          signal: AbortSignal.timeout(120000),
        });

        if (!response.ok) {
          if (response.status === 404) {
            return res.status(404).json({ error: 'Datei nicht gefunden' });
          }
          if (response.status === 400) {
            return res.status(400).json({ error: 'Voice-Over noch nicht fertig' });
          }
          throw new Error('Download fehlgeschlagen');
        }

        // Stream the audio file
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', 'attachment; filename="voiceover.mp3"');

        // Get the response body as a readable stream and pipe to response
        const body = response.body;
        if (body) {
          // @ts-ignore - response.body is a ReadableStream in Node 20
          const reader = body.getReader();
          const pump = async () => {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(value);
            }
            res.end();
          };
          pump();
        } else {
          res.status(500).json({ error: 'Keine Daten erhalten' });
        }

      } catch (error: any) {
        console.error('[VoiceOver] Download error:', error);
        res.status(500).json({ error: error.message || 'Fehler beim Download' });
      }
    }
  );

  console.log('[VoiceOver] Routes registered');
}
