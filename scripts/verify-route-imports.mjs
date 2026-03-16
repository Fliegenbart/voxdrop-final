import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const routesTsPath = path.join(repoRoot, 'server', 'routes.ts');
const routesDir = path.join(repoRoot, 'server', 'routes');
const routesTs = fs.readFileSync(routesTsPath, 'utf8');

const matches = [...routesTs.matchAll(/from ['"]\.\/routes\/([^'"]+)['"]/g)];
const routeImports = [...new Set(matches.map((match) => match[1]))].sort();
const missing = routeImports.filter((routeFile) => !fs.existsSync(path.join(routesDir, `${routeFile}.ts`)));

if (missing.length > 0) {
  console.error('Missing route files referenced by server/routes.ts:');
  for (const routeFile of missing) {
    console.error(`- server/routes/${routeFile}.ts`);
  }
  process.exit(1);
}

console.log(`Route import verification passed for ${routeImports.length} route modules.`);
