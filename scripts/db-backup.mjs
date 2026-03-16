import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const sourceDbPath = process.env.DATABASE_PATH || path.join(repoRoot, 'data', 'voxdrop.db');
const backupDir = process.env.DB_BACKUP_DIR || path.join(repoRoot, 'backups', 'db');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const targetPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(backupDir, `voxdrop-${timestamp}.sqlite`);

if (!fs.existsSync(sourceDbPath)) {
  console.error(`Database not found: ${sourceDbPath}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(targetPath), { recursive: true });

const db = new Database(sourceDbPath, { readonly: true, fileMustExist: true });
try {
  await db.backup(targetPath);
  console.log(`Database backup written to ${targetPath}`);
} finally {
  db.close();
}
