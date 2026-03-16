import mammoth from 'mammoth';

export interface ScriptChunk {
  id: number;
  text: string;
}

// Marker syntax examples:
// - ((WEITER)), ((NEXT)), ((BREAK))
// - ---
const MARKER_REGEX = /\(\(\s*(WEITER|NEXT|BREAK)\s*\)\)|^\s*---\s*$/gim;

export async function parseScriptFile(fileBuffer: Buffer, mimeType: string): Promise<ScriptChunk[]> {
  let fullText = '';

  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    fullText = result.value || '';
  } else {
    fullText = fileBuffer.toString('utf-8');
  }

  return splitScriptText(fullText);
}

export function splitScriptText(text: string): ScriptChunk[] {
  const chunks: ScriptChunk[] = [];
  const s = String(text || '').replace(/\r\n/g, '\n');

  // Find markers and slice text between them.
  const matches = Array.from(s.matchAll(MARKER_REGEX));
  const boundaries: Array<{ start: number; end: number }> = [];

  let cursor = 0;
  for (const m of matches) {
    const idx = m.index ?? -1;
    if (idx < 0) continue;
    boundaries.push({ start: cursor, end: idx });
    cursor = idx + m[0].length;
  }
  boundaries.push({ start: cursor, end: s.length });

  let idCounter = 1;
  for (const b of boundaries) {
    const part = s.slice(b.start, b.end).trim();
    if (!part) continue;
    chunks.push({ id: idCounter++, text: part });
  }

  return chunks;
}

