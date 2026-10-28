import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { expect, test } from '@playwright/test';
import { csvBytes, longFixture, maxFixture, textFixture, wideFixture } from '../fixtures';
import { verifyProbe } from '../probe';

for (const size of ['small', 'max', 'wide', 'long'] as const) {
  test(`${size}: static worker → verified transfer → local download`, async ({ page, context, browser }, testInfo) => {
    const requests: string[] = [];
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    context.on('request', request => requests.push(request.url()));
    await page.goto('/');
    await page.waitForFunction(() => 'runProbe' in window);
    const expected = { small: textFixture, max: maxFixture, wide: wideFixture, long: longFixture }[size]();
    const bytes = csvBytes(expected);
    expect(bytes.byteLength).toBeLessThanOrEqual(2_097_152);
    // Load and warm the retained worker, then process without any network access.
    await page.evaluate(async () => {
      if ('runProbe' in window && typeof window.runProbe === 'function') {
        await window.runProbe(new TextEncoder().encode('warmup'));
      }
    });
    const requestsBefore = requests.length;
    await context.setOffline(true);
    const downloadEvent = page.waitForEvent('download');
    const metrics = await page.evaluate(async (input) => {
      if (!('runProbe' in window) || typeof window.runProbe !== 'function') throw new Error('NO_HARNESS');
      let ticks = 0;
      const timer = setInterval(() => ticks++, 10);
      const result: unknown = await window.runProbe(new Uint8Array(input));
      clearInterval(timer);
      if (typeof result !== 'object' || result === null || !('kind' in result) || result.kind !== 'READY' ||
          !('buffer' in result) || !(result.buffer instanceof ArrayBuffer) || !('elapsedMs' in result)) {
        throw new Error('NO_VERIFIED_BYTES');
      }
      const url = URL.createObjectURL(new Blob([result.buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'synthetic-nassaq.xlsx';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return { elapsedMs: result.elapsedMs, ticks, outputBytes: result.buffer.byteLength };
    }, Array.from(bytes));
    const download = await downloadEvent;
    const path = await download.path();
    if (!path) throw new Error('NO_DOWNLOAD');
    const workbook = new ExcelJS.Workbook();
    const downloaded = await readFile(path);
    const buffer = new ArrayBuffer(downloaded.byteLength);
    new Uint8Array(buffer).set(downloaded);
    await workbook.xlsx.load(buffer);
    verifyProbe(workbook, expected);
    // Independent package-level checks supplement ExcelJS reading its own output.
    const zip = await JSZip.loadAsync(buffer, { checkCRC32: true });
    const sheetXml = await zip.file('xl/worksheets/sheet1.xml')?.async('string');
    expect(sheetXml).toBeDefined();
    expect(sheetXml).not.toMatch(/<f(?:\s|>)/);
    expect(sheetXml).not.toMatch(/<hyperlink(?:\s|>)/);
    expect((sheetXml?.match(/<c\s/g) ?? []).length).toBe(expected.length * (expected[0]?.length ?? 0));
    expect((sheetXml?.match(/t="s"/g) ?? []).length).toBe(expected.length * (expected[0]?.length ?? 0));
    for (const [name, file] of Object.entries(zip.files)) {
      expect(name).not.toMatch(/vbaProject|externalLinks|connections/i);
      if (name.endsWith('.rels')) expect(await file.async('string')).not.toMatch(/TargetMode="External"/);
    }
    expect(errors).toEqual([]);
    expect(metrics.ticks).toBeGreaterThan(0);
    expect(requests.slice(requestsBefore)).toEqual([]);
    expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })))
      .toEqual({ local: 0, session: 0 });
    await testInfo.attach('metrics', { body: JSON.stringify({ ...metrics, inputBytes: bytes.byteLength, browserVersion: browser.version() }), contentType: 'application/json' });
    console.log(`${testInfo.project.name}/${size}: ${JSON.stringify(metrics)}; inputBytes=${bytes.byteLength}`);
  });
}

test('browser decoder availability and fail-closed invalid bytes', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => 'runProbe' in window);
  const result = await page.evaluate(async () => {
    const windows = new TextDecoder('windows-1256', { fatal: true }).decode(new Uint8Array([0xe3, 0xcd, 0xe3, 0xcf]));
    const iso = new TextDecoder('iso-8859-6', { fatal: true }).decode(new Uint8Array([0xe5, 0xcd, 0xe5, 0xcf]));
    if (!('runProbe' in window) || typeof window.runProbe !== 'function') throw new Error('NO_HARNESS');
    const invalid: unknown = await window.runProbe(new Uint8Array([0xc3, 0x28]));
    return { windows, iso, invalid };
  });
  expect(result).toEqual({ windows: 'محمد', iso: 'محمد', invalid: { kind: 'ERROR', jobId: 1, code: 'PROBE_FAILED' } });
});
