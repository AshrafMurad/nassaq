import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const report = JSON.parse(await readFile(new URL('test-results/results.json', root), 'utf8'));
const cases = [];
function visit(suites) {
  for (const suite of suites) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        const result = test.results.at(-1);
        const attachment = result?.attachments.find(item => item.name === 'metrics');
        cases.push({ test: spec.title, browser: test.projectName, status: result?.status,
          ...(attachment?.body ? JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8')) : {}) });
      }
    }
    visit(suite.suites ?? []);
  }
}
visit(report.suites);
if (!cases.length || cases.some(item => item.status !== 'passed')) throw new Error('BROWSER_GATE_FAILED');
await writeFile(new URL('evidence/browser-results.json', root), JSON.stringify({ cases }, null, 2) + '\n');
console.log(`Recorded ${cases.length} passing browser cases.`);
