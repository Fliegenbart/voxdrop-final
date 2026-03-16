import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voxdrop-db-verify-'));
const dataDir = path.join(tempDir, 'data');
const databasePath = path.join(dataDir, 'voxdrop.db');
const tsxBin = path.join(repoRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');

fs.mkdirSync(dataDir, { recursive: true });

try {
  const result = spawnSync(tsxBin, ['-e', "import './server/db/init.ts'; setTimeout(() => process.exit(0), 500);"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      DATABASE_PATH: databasePath,
    },
    encoding: 'utf8',
  });

  const combinedOutput = `${result.stdout || ''}\n${result.stderr || ''}`;
  const migrationErrors = combinedOutput.match(/\[DB\].*(migration error|Failed to seed EN 301 549 criteria)/gi) || [];

  if (result.status !== 0) {
    console.error(combinedOutput.trim());
    throw new Error(`Database init exited with status ${result.status}`);
  }

  if (migrationErrors.length > 0) {
    console.error(combinedOutput.trim());
    throw new Error(`Database init reported migration errors: ${migrationErrors.join(', ')}`);
  }

  if (!fs.existsSync(databasePath)) {
    throw new Error(`Database init did not create ${databasePath}`);
  }

  console.log(`Database init verification passed using ${databasePath}`);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
