import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const root = new URL('../', import.meta.url);
const map = JSON.parse(await readFile(new URL('node_modules/exceljs/dist/exceljs.min.js.map', root), 'utf8'));
const sources = map.sources;
const excluded = ['buffers/', 'unzipper/', 'archiver/', 'uuid/'];
const assets = [];
for (const name of await readdir(new URL('dist/assets/', root))) {
  const bytes = await readFile(new URL(`dist/assets/${name}`, root));
  assets.push({ name, bytes: bytes.byteLength, gzipBytes: gzipSync(bytes).byteLength });
}
const evidence = {
  browserEntry: 'exceljs/dist/exceljs.min.js',
  sourceMap: 'exceljs/dist/exceljs.min.js.map',
  sourceCount: sources.length,
  dependencySources: sources.filter(source => source.includes('node_modules/')),
  inspectedPaths: Object.fromEntries(excluded.map(name => [name, sources.filter(source => source.includes(name))])),
  assets,
};
await mkdir(new URL('evidence/', root), { recursive: true });
await writeFile(new URL('evidence/bundle-evidence.json', root), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ ...evidence, dependencySources: `${evidence.dependencySources.length} paths recorded in evidence` }, null, 2));
