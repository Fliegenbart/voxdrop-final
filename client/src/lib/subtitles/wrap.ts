export interface WrapSubtitleOptions {
  maxLineLength: number;
  maxLines: number;
}

export interface WrapSubtitleResult {
  text: string;
  changed: boolean;
  overflow: boolean;
  lineCount: number;
  maxLineLength: number;
}

function breakLongWord(word: string, maxLineLength: number): string[] {
  if (word.length <= maxLineLength) return [word];
  const parts: string[] = [];
  for (let i = 0; i < word.length; i += maxLineLength) {
    parts.push(word.slice(i, i + maxLineLength));
  }
  return parts;
}

export function wrapSubtitleText(input: string, opts: WrapSubtitleOptions): WrapSubtitleResult {
  const normalized = input.replace(/\r\n/g, "\n").trim();
  const flattened = normalized.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
  if (!flattened) {
    return { text: "", changed: normalized !== "", overflow: false, lineCount: 0, maxLineLength: 0 };
  }

  const words: string[] = [];
  for (const raw of flattened.split(" ")) {
    for (const part of breakLongWord(raw, opts.maxLineLength)) words.push(part);
  }

  const lines: string[] = [];
  let current = "";

  for (const w of words) {
    if (!current) {
      current = w;
      continue;
    }
    const candidate = `${current} ${w}`;
    if (candidate.length <= opts.maxLineLength) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = w;
  }
  if (current) lines.push(current);

  // Enforce maxLines without dropping content.
  let overflow = false;
  let clampedLines = lines;
  if (lines.length > opts.maxLines) {
    overflow = true;
    clampedLines = lines.slice(0, opts.maxLines);
    // Merge remaining lines into the last line.
    const tail = lines.slice(opts.maxLines).join(" ");
    clampedLines[opts.maxLines - 1] = `${clampedLines[opts.maxLines - 1]} ${tail}`.replace(/\s+/g, " ").trim();
  }

  const out = clampedLines.join("\n").trim();
  const changed = out !== normalized;
  const maxLen = clampedLines.reduce((m, l) => Math.max(m, l.length), 0);

  // If we had to merge into last line, maxLen can exceed maxLineLength.
  if (maxLen > opts.maxLineLength) overflow = true;

  return {
    text: out,
    changed,
    overflow,
    lineCount: clampedLines.length,
    maxLineLength: maxLen,
  };
}

