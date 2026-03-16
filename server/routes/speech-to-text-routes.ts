/**
 * Speech-to-Text Download Routes
 *
 * Provides SRT and DOCX download endpoints for completed transcription jobs.
 * The actual transcription is handled by the existing /api/jobs/transcribe endpoint.
 */

import { Express, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { requireAuth } from '../auth/middleware';
import { getJobForUserOrWorkspace } from '../queue/job-store';

interface TranscriptionResult {
  text: string;
  srt: string;
  duration: number;
  language: string;
  words?: Array<{ word: string; start: number; end: number }>;
  mode?: string;
}

const readTranscriptionResult = (job: any, userId: number): TranscriptionResult | null => {
  if (!job || job.status !== 'completed' || !job.result_file_path) return null;
  if (!fs.existsSync(job.result_file_path)) return null;

  try {
    const raw = fs.readFileSync(job.result_file_path, 'utf-8');
    return JSON.parse(raw) as TranscriptionResult;
  } catch {
    return null;
  }
};

const getOriginalName = (job: any): string => {
  try {
    const inputData = JSON.parse(job.input_data || '{}');
    const name = inputData.originalName || 'audio';
    return path.basename(name, path.extname(name));
  } catch {
    return 'audio';
  }
};

const formatDuration = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const buildTranscriptDocx = async (result: TranscriptionResult, originalName: string): Promise<Buffer> => {
  const now = new Date().toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' });

  const children: Paragraph[] = [
    new Paragraph({
      text: 'Transkription',
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Quelldatei: ', bold: true }),
        new TextRun({ text: originalName }),
      ],
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Sprache: ', bold: true }),
        new TextRun({ text: result.language || 'auto' }),
        new TextRun({ text: '  |  Dauer: ', bold: true }),
        new TextRun({ text: formatDuration(result.duration) }),
      ],
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Erstellt am: ', bold: true }),
        new TextRun({ text: now }),
        new TextRun({ text: '  |  Erstellt mit: ', bold: true }),
        new TextRun({ text: 'VoxDrop Speech-to-Text' }),
      ],
      spacing: { after: 400 },
    }),
    new Paragraph({
      text: 'Volltext',
      heading: HeadingLevel.HEADING_2,
      spacing: { after: 200 },
    }),
  ];

  // Split text into paragraphs (by double newline or sentence boundaries)
  const textParagraphs = result.text
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  for (const para of textParagraphs) {
    children.push(
      new Paragraph({
        text: para,
        spacing: { after: 200 },
      }),
    );
  }

  const doc = new Document({
    creator: 'VoxDrop',
    title: `Transkription - ${originalName}`,
    description: 'Automatische Transkription erstellt mit VoxDrop Speech-to-Text',
    sections: [{ children }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
};

export function registerSpeechToTextRoutes(app: Express) {
  // Download SRT
  app.get('/api/speech-to-text/:jobId/srt', requireAuth, (req: Request, res: Response) => {
    const { jobId } = req.params;
    const userId = (req as any).userId as number;

    const job = getJobForUserOrWorkspace(jobId, userId);
    if (!job) return res.status(404).json({ error: 'Job nicht gefunden' });

    const result = readTranscriptionResult(job, userId);
    if (!result) return res.status(400).json({ error: 'Ergebnis nicht verfügbar' });

    if (!result.srt) return res.status(400).json({ error: 'Keine Untertitel vorhanden' });

    const baseName = getOriginalName(job);
    res.setHeader('Content-Type', 'text/srt; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.srt"`);
    res.send(result.srt);
  });

  // Download DOCX
  app.get('/api/speech-to-text/:jobId/docx', requireAuth, async (req: Request, res: Response) => {
    const { jobId } = req.params;
    const userId = (req as any).userId as number;

    const job = getJobForUserOrWorkspace(jobId, userId);
    if (!job) return res.status(404).json({ error: 'Job nicht gefunden' });

    const result = readTranscriptionResult(job, userId);
    if (!result) return res.status(400).json({ error: 'Ergebnis nicht verfügbar' });

    if (!result.text) return res.status(400).json({ error: 'Kein Text vorhanden' });

    try {
      const baseName = getOriginalName(job);
      const buffer = await buildTranscriptDocx(result, baseName);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}_transkription.docx"`);
      res.send(buffer);
    } catch (error) {
      console.error('[Speech-to-Text] DOCX generation error:', error);
      res.status(500).json({ error: 'DOCX-Erstellung fehlgeschlagen' });
    }
  });
}
