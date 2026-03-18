import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import yauzl from 'yauzl';
import archiver from 'archiver';
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

const COMMENT_ENTRY_RE = /^ppt\/comments\/comment\d+\.xml$/i;
const COMMENT_AUTHOR_ENTRY_RE = /^ppt\/commentAuthors\.xml$/i;
const NOTES_ENTRY_RE = /^ppt\/notesSlides\/notesSlide\d+\.xml$/i;
const NOTES_MASTER_ENTRY_RE = /^ppt\/notesMasters\/notesMaster\d+\.xml$/i;
const RELS_ENTRY_RE = /(^ppt\/slides\/_rels\/slide\d+\.xml\.rels$)|(^ppt\/_rels\/presentation\.xml\.rels$)|(^ppt\/notesSlides\/_rels\/notesSlide\d+\.xml\.rels$)/i;
const CONTENT_TYPES_ENTRY = '[Content_Types].xml';

function collectStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.once('end', () => resolve(Buffer.concat(chunks)));
    stream.once('error', reject);
  });
}

function openZip(filePath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        reject(err || new Error('unable_to_open_pptx'));
        return;
      }
      resolve(zipfile);
    });
  });
}

function shouldSkipEntry(fileName: string, includeSpeakerNotes: boolean): 'comments' | 'notes' | null {
  if (COMMENT_ENTRY_RE.test(fileName) || COMMENT_AUTHOR_ENTRY_RE.test(fileName)) {
    return 'comments';
  }
  if (!includeSpeakerNotes && (NOTES_ENTRY_RE.test(fileName) || NOTES_MASTER_ENTRY_RE.test(fileName))) {
    return 'notes';
  }
  return null;
}

function scrubRelationshipsXml(xml: string, includeSpeakerNotes: boolean) {
  let nextXml = xml;
  nextXml = nextXml.replace(
    /<Relationship\b[^>]*Target="(?:\.\.\/)?comments\/[^"]+"[^>]*\/>/gi,
    '',
  );
  nextXml = nextXml.replace(
    /<Relationship\b[^>]*Target="(?:\.\.\/)?commentAuthors\.xml"[^>]*\/>/gi,
    '',
  );
  if (!includeSpeakerNotes) {
    nextXml = nextXml.replace(
      /<Relationship\b[^>]*Target="(?:\.\.\/)?notesSlides\/[^"]+"[^>]*\/>/gi,
      '',
    );
    nextXml = nextXml.replace(
      /<Relationship\b[^>]*Target="(?:\.\.\/)?notesMasters\/[^"]+"[^>]*\/>/gi,
      '',
    );
  }
  return nextXml;
}

function scrubContentTypesXml(xml: string, includeSpeakerNotes: boolean) {
  let nextXml = xml;
  nextXml = nextXml.replace(
    /<Override\b[^>]*PartName="\/ppt\/comments\/comment\d+\.xml"[^>]*\/>\s*/gi,
    '',
  );
  nextXml = nextXml.replace(
    /<Override\b[^>]*PartName="\/ppt\/commentAuthors\.xml"[^>]*\/>\s*/gi,
    '',
  );
  if (!includeSpeakerNotes) {
    nextXml = nextXml.replace(
      /<Override\b[^>]*PartName="\/ppt\/notesSlides\/notesSlide\d+\.xml"[^>]*\/>\s*/gi,
      '',
    );
    nextXml = nextXml.replace(
      /<Override\b[^>]*PartName="\/ppt\/notesMasters\/notesMaster\d+\.xml"[^>]*\/>\s*/gi,
      '',
    );
  }
  return nextXml;
}

async function appendEntry(
  archive: archiver.Archiver,
  zipfile: yauzl.ZipFile,
  entry: yauzl.Entry,
  includeSpeakerNotes: boolean,
): Promise<'comments' | 'notes' | null> {
  const skipReason = shouldSkipEntry(entry.fileName, includeSpeakerNotes);
  if (skipReason) {
    return skipReason;
  }

  const entryBuffer = await new Promise<Buffer>((resolve, reject) => {
    zipfile.openReadStream(entry, (err, readStream) => {
      if (err || !readStream) {
        reject(err || new Error(`unable_to_read_entry:${entry.fileName}`));
        return;
      }
      void collectStream(readStream).then(resolve, reject);
    });
  });

  const isXml = entry.fileName.toLowerCase().endsWith('.xml') || entry.fileName.toLowerCase().endsWith('.rels');
  if (isXml && (entry.fileName === CONTENT_TYPES_ENTRY || RELS_ENTRY_RE.test(entry.fileName))) {
    const raw = entryBuffer.toString('utf8');
    const scrubbed = entry.fileName === CONTENT_TYPES_ENTRY
      ? scrubContentTypesXml(raw, includeSpeakerNotes)
      : scrubRelationshipsXml(raw, includeSpeakerNotes);
    archive.append(Buffer.from(scrubbed, 'utf8'), { name: entry.fileName });
    return null;
  }

  archive.append(entryBuffer, { name: entry.fileName });
  return null;
}

export async function sanitizePptxToFile(
  inputPath: string,
  options: SanitizePptxOptions = {},
): Promise<SanitizePptxResult> {
  const includeSpeakerNotes = Boolean(options.includeSpeakerNotes);
  const ext = path.extname(inputPath) || '.pptx';
  const sanitizedPath = tmpPath(`sanitized-${randomUUID()}${ext}`);
  const zipfile = await openZip(inputPath);
  const output = createWriteStream(sanitizedPath);
  const archive = archiver('zip', {
    zlib: { level: 9 },
  });

  const stats: SanitizePptxStats = {
    removedCommentFiles: 0,
    removedNotes: 0,
  };

  await new Promise<void>((resolve, reject) => {
    output.once('close', resolve);
    output.once('error', reject);
    archive.once('error', reject);
    archive.pipe(output);

    zipfile.on('error', reject);
    zipfile.on('entry', (entry) => {
      void appendEntry(archive, zipfile, entry, includeSpeakerNotes)
        .then((skipReason) => {
          if (skipReason === 'comments') {
            stats.removedCommentFiles += 1;
          } else if (skipReason === 'notes') {
            stats.removedNotes += 1;
          }
          zipfile.readEntry();
        })
        .catch(reject);
    });
    zipfile.on('end', () => {
      void archive.finalize();
    });

    zipfile.readEntry();
  }).catch(async (error) => {
    try {
      zipfile.close();
    } catch {}
    try {
      await fs.unlink(sanitizedPath);
    } catch {}
    throw error;
  });

  try {
    zipfile.close();
  } catch {}

  return {
    sanitizedPath,
    stats,
  };
}
