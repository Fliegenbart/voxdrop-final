import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const FALLBACK_TMP_DIR = path.join(DATA_DIR, 'tmp');
const TMP_DIR =
  process.env.TMPDIR ||
  process.env.TMP_DIR ||
  process.env.VOXDROP_TMP_DIR ||
  FALLBACK_TMP_DIR;

export function getTmpDir(): string {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
  return TMP_DIR;
}

export function tmpPath(...segments: string[]): string {
  return path.join(getTmpDir(), ...segments);
}
