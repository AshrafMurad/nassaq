import { readFile, mkdir, writeFile } from 'node:fs/promises';

const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
const inventory = Object.entries(lock.packages).filter(([path]) => path).map(([path, entry]) => ({
  path, version: entry.version, license: entry.license ?? 'UNDECLARED',
  dev: entry.dev ?? false, hasInstallScript: entry.hasInstallScript ?? false,
  integrity: Boolean(entry.integrity), resolved: entry.resolved,
}));
await mkdir(new URL('../evidence/', import.meta.url), { recursive: true });
await writeFile(new URL('../evidence/dependency-inventory.json', import.meta.url), JSON.stringify(inventory, null, 2) + '\n');
console.log(JSON.stringify({ packages: inventory.length,
  licenses: [...new Set(inventory.map(entry => entry.license))],
  installScripts: inventory.filter(entry => entry.hasInstallScript),
  missingIntegrity: inventory.filter(entry => !entry.integrity),
}, null, 2));
