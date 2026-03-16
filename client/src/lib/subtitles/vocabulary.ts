import { escapeRegExp } from "@/lib/text/replace";
import { parseSrt, segmentsToSrt } from "./srt";

export interface VocabularyEntry {
  wrong: string;
  correct: string;
}

export function applyVocabularyCorrections(text: string, vocabulary: VocabularyEntry[]): string {
  let correctedText = text;
  for (const entry of vocabulary) {
    // Case-insensitive replacement, preserving word boundaries where possible
    const regex = new RegExp(escapeRegExp(entry.wrong), "gi");
    correctedText = correctedText.replace(regex, entry.correct);
  }
  return correctedText;
}

export function applyVocabularyToSrtContent(srtContent: string, vocabulary: VocabularyEntry[]): string {
  if (!srtContent || vocabulary.length === 0) return srtContent;
  const segments = parseSrt(srtContent);
  if (segments.length === 0) return srtContent;
  const updated = segments.map((seg) => ({
    ...seg,
    text: applyVocabularyCorrections(seg.text, vocabulary),
  }));
  return segmentsToSrt(updated);
}

function parseCsvRows(text: string): string[][] {
  const normalized = text.replace(/^\uFEFF/, "");
  const lines = normalized.split(/\r?\n/);
  const firstLine = lines.find((line) => line.trim().length > 0) || "";
  const delimiter = (() => {
    let comma = 0;
    let semicolon = 0;
    let inQuotes = false;
    for (let i = 0; i < firstLine.length; i++) {
      const char = firstLine[i];
      if (char === '"') {
        if (inQuotes && firstLine[i + 1] === '"') {
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (!inQuotes) {
        if (char === ",") comma++;
        if (char === ";") semicolon++;
      }
    }
    return semicolon > comma ? ";" : ",";
  })();

  const rows: string[][] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const row: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (char === delimiter && !inQuotes) {
        row.push(current.trim());
        current = "";
        continue;
      }
      current += char;
    }
    row.push(current.trim());
    rows.push(row);
  }

  return rows;
}

export function parseVocabularyCsv(data: ArrayBuffer): VocabularyEntry[] {
  const text = new TextDecoder("utf-8").decode(data);
  const rows = parseCsvRows(text);

  const vocabulary: VocabularyEntry[] = [];

  // Skip header row, parse remaining rows
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row && row.length >= 2 && row[0] && row[1]) {
      vocabulary.push({
        wrong: row[0].toString().trim(),
        correct: row[1].toString().trim(),
      });
    }
  }

  return vocabulary;
}

