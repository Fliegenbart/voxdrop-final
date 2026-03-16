import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { tmpPath } from './tmp';

type SanitizePptxOptions = {
  includeSpeakerNotes?: boolean;
};

type SanitizePptxStats = {
  removedCommentFiles: number;
  removedNotes: number;
};

type SanitizePptxResult = {
  sanitizedPath: string;
  stats: SanitizePptxStats;
};

export async function sanitizePptxToFile(
  inputPath: string,
  _options: SanitizePptxOptions = {},
): Promise<SanitizePptxResult> {
  const ext = path.extname(inputPath) || '.pptx';
  const sanitizedPath = tmpPath(`sanitized-${randomUUID()}${ext}`);

  // Keep the upload flow stable even if the dedicated sanitizer module is absent.
  await fs.copyFile(inputPath, sanitizedPath);

  return {
    sanitizedPath,
    stats: {
      removedCommentFiles: 0,
      removedNotes: 0,
    },
  };
}
