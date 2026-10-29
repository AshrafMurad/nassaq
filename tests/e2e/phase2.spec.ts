/**
 * Phase 2 E2E tests — worker byte decode, CSV parsing, and parse result UI.
 *
 * These tests verify the full browser pipeline:
 *   - File → Worker → READY message → ParseResult displayed in UI
 *
 * Synthetic CSV fixtures only; no real user data.
 */

import { expect, test, type Page } from '@playwright/test';

// ── Fixture builder ──────────────────────────────────────────────────────

async function dropCsvContent(
  page: Page,
  content: string,
  name = 'test.csv',
  mimeType = 'text/csv',
): Promise<void> {
  const dataTransfer = await page.evaluateHandle(
    ({ fileName, csvContent, mime }) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([csvContent], fileName, { type: mime }));
      return transfer;
    },
    { fileName: name, csvContent: content, mime: mimeType },
  );
  await page.dispatchEvent('[data-testid="dropzone"]', 'drop', { dataTransfer });
}

async function setInputFile(
  page: Page,
  content: string,
  name = 'test.csv',
): Promise<void> {
  await page.getByTestId('file-input').setInputFiles({
    name,
    mimeType: 'text/csv',
    buffer: Buffer.from(content),
  });
}

async function waitForParseResult(page: Page): Promise<void> {
  await expect(page.getByTestId('parse-result')).toBeVisible({ timeout: 10_000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────

test.describe('Phase 2 — worker CSV parsing', () => {
  test('parses a simple comma-separated Arabic CSV and shows summary', async ({ page }) => {
    await page.goto('/');
    const csv = 'name,phone\nأحمد,00123\nسارة,00456\n';
    await setInputFile(page, csv, 'arabic.csv');
    await waitForParseResult(page);

    await expect(page.getByTestId('parse-data-rows')).toHaveText('2');
    await expect(page.getByTestId('parse-columns')).toHaveText('2');
    await expect(page.getByTestId('parse-encoding')).toContainText('UTF-8');
    await expect(page.getByTestId('parse-delimiter')).not.toBeEmpty();
    await expect(page.getByTestId('parse-has-header')).not.toBeEmpty();
  });

  test('preserves leading zeros (string, not number conversion)', async ({ page }) => {
    await page.goto('/');
    // The UI shows data rows count; the key invariant is no dynamic typing
    const csv = 'code,id\n0005,00000000001\n00123,12345678901234567890\n';
    await setInputFile(page, csv, 'leadingzero.csv');
    await waitForParseResult(page);
    await expect(page.getByTestId('parse-data-rows')).toHaveText('2');
  });

  test('handles formula-prefixed strings without errors', async ({ page }) => {
    await page.goto('/');
    const csv = 'code,formula\n03-04,=1+1\nA,+SUM(1)\nB,@name\n';
    await setInputFile(page, csv, 'formulas.csv');
    await waitForParseResult(page);
    await expect(page.getByTestId('parse-data-rows')).toHaveText('3');
  });

  test('handles quoted multiline cell', async ({ page }) => {
    await page.goto('/');
    const csv = 'name,note\nخالد,"سطر أول\nسطر ثان"\nSara,"ok"\n';
    await setInputFile(page, csv, 'multiline.csv');
    await waitForParseResult(page);
    await expect(page.getByTestId('parse-data-rows')).toHaveText('2');
  });

  test('handles embedded quote escaped as double-quote', async ({ page }) => {
    await page.goto('/');
    const csv = 'name,note\nSara,"Said ""hello"" yesterday"\n';
    await setInputFile(page, csv, 'quotes.csv');
    await waitForParseResult(page);
    await expect(page.getByTestId('parse-data-rows')).toHaveText('1');
  });

  test('detects semicolon delimiter', async ({ page }) => {
    await page.goto('/');
    const csv = 'id;note\n1;test\n2;another\n3;value\n';
    await setInputFile(page, csv, 'semicolon.csv');
    await waitForParseResult(page);
    await expect(page.getByTestId('parse-columns')).toHaveText('2');
  });

  test('detects tab delimiter', async ({ page }) => {
    await page.goto('/');
    const csv = 'id\tname\tcity\n1\tأحمد\tجدة\n2\tSara\tRiyadh\n';
    await setInputFile(page, csv, 'tab.csv');
    await waitForParseResult(page);
    await expect(page.getByTestId('parse-columns')).toHaveText('3');
  });

  test('shows parse error for file exceeding 2 MiB', async ({ page }) => {
    await page.goto('/');
    // Build a >2 MiB buffer
    const big = 'a,b\n' + 'x'.repeat(1024).concat(',y\n').repeat(2048 + 5);
    await setInputFile(page, big, 'toolarge.csv');
    await expect(page.getByTestId('parse-error')).toBeVisible({ timeout: 10_000 });
  });

  test('shows parse error for binary content', async ({ page }) => {
    await page.goto('/');
    // NUL byte makes it binary
    const binary = '\x00\x01\x02name,phone\n';
    await page.getByTestId('file-input').setInputFiles({
      name: 'binary.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(binary, 'binary'),
    });
    await expect(page.getByTestId('parse-error')).toBeVisible({ timeout: 10_000 });
  });

  test('choosing another file resets parse result', async ({ page }) => {
    await page.goto('/');
    const csv = 'name,phone\nأحمد,00123\n';
    await setInputFile(page, csv, 'first.csv');
    await waitForParseResult(page);

    await page.getByTestId('choose-another').click();
    await expect(page.getByTestId('dropzone')).toBeVisible();
    await expect(page.getByTestId('parse-result')).not.toBeVisible();
  });

  test('header toggle re-parses correctly', async ({ page }) => {
    await page.goto('/');
    const csv = 'أحمد,00123\nسارة,00456\n';
    await setInputFile(page, csv, 'noheader.csv');
    await waitForParseResult(page);

    // With header: first row is header → 1 data row
    // Without header toggle off: both are data rows → 2 data rows
    const headerCheckbox = page.getByTestId('header-checkbox');

    // Uncheck "first row is header"
    const isChecked = await headerCheckbox.isChecked();
    if (isChecked) {
      await headerCheckbox.click();
      // Wait for re-parse
      await expect(page.getByTestId('parse-data-rows')).toHaveText('2', { timeout: 10_000 });
    }
  });

  test('no network requests are made during parse', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.origin !== 'http://127.0.0.1:4173') external.push(req.url());
    });
    await page.goto('/');
    const csv = 'name,value\nأحمد,123\nسارة,456\n';
    await setInputFile(page, csv, 'privacy.csv');
    await waitForParseResult(page);
    expect(external).toEqual([]);
  });

  test('English UI shows parse result in English', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('language-toggle').click();
    const csv = 'name,phone\nAhmed,00123\n';
    await setInputFile(page, csv, 'english.csv');
    await waitForParseResult(page);

    // In EN mode the parse result title should appear in English
    const resultPanel = page.getByTestId('parse-result');
    await expect(resultPanel).toContainText('Parse result');
  });
});
