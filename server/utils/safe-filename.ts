import path from 'path';

// Keep this intentionally strict: only short ASCII extensions.
const SAFE_EXT_RE = /^\.[a-z0-9]{1,8}$/i;

const MIME_TO_EXT: Record<string, string> = {
  // Video
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/mpeg': '.mpeg',
  'video/quicktime': '.mov',
  'video/x-msvideo': '.avi',
  'video/x-matroska': '.mkv',

  // Audio
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/aac': '.aac',
  'audio/m4a': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/mp4': '.m4a',
  'audio/webm': '.webm',

  // Images
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',

  // Docs
  'application/pdf': '.pdf',
  'application/zip': '.zip',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-excel': '.xls',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'application/json': '.json',
  'image/svg+xml': '.svg',
};

export function safeExtensionFromMime(mimeType: string | undefined | null): string | null {
  if (!mimeType) return null;
  const mapped = MIME_TO_EXT[mimeType];
  if (!mapped) return null;
  return SAFE_EXT_RE.test(mapped) ? mapped.toLowerCase() : null;
}

export function safeExtensionFromOriginalName(originalName: string | undefined | null): string | null {
  if (!originalName) return null;
  const ext = path.extname(originalName).toLowerCase();
  if (!ext) return null;
  if (!SAFE_EXT_RE.test(ext)) return null;
  return ext;
}

export function safeStoredExtension(params: {
  mimeType?: string | null;
  originalName?: string | null;
  fallback?: string;
}): string {
  const fromMime = safeExtensionFromMime(params.mimeType);
  if (fromMime) return fromMime;

  const fromName = safeExtensionFromOriginalName(params.originalName);
  if (fromName) return fromName;

  const fallback = (params.fallback || '.bin').toLowerCase();
  if (SAFE_EXT_RE.test(fallback)) return fallback;
  return '.bin';
}

