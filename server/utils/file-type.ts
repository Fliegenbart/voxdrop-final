import fs from 'fs/promises';
import { fileTypeFromBuffer } from 'file-type';

const DEFAULT_BYTES = 4100;

export async function detectFileType(filePath: string, bytes: number = DEFAULT_BYTES) {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    await handle.read(buffer, 0, bytes, 0);
    return fileTypeFromBuffer(buffer);
  } finally {
    await handle.close();
  }
}
