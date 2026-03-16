import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const backupPath = process.argv[2] ? path.resolve(process.argv[2]) : '';
const targetDbPath = process.env.DATABASE_PATH || path.join(repoRoot, 'data', 'voxdrop.db');

if (!backupPath) {
  console.error('Usage: npm run db:restore -- /absolute/path/to/backup.sqlite');
  process.exit(1);
}

if (!fs.existsSync(backupPath)) {
  console.error(`Backup file not found: ${backupPath}`);
  process.exit(1);
}

if (process.env.DB_RESTORE_CONFIRMED !== 'yes') {
  console.error('Refusing to restore without DB_RESTORE_CONFIRMED=yes. Stop the app before restoring.');
  process.exit(1);
}

fs.mkdirSync(path.dirname(targetDbPath), { recursive: true });

if (fs.existsSync(targetDbPath)) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const emergencyCopy = `${targetDbPath}.pre-restore-${timestamp}.bak`;
  fs.copyFileSync(targetDbPath, emergencyCopy);
  console.log(`Existing database copied to ${emergencyCopy}`);
}

for (const suffix of ['', '-wal', '-shm']) {
  const candidate = `${targetDbPath}${suffix}`;
  if (fs.existsSync(candidate)) {
    fs.rmSync(candidate, { force: true });
  }
}

fs.copyFileSync(backupPath, targetDbPath);
console.log(`Database restored from ${backupPath} to ${targetDbPath}`);
