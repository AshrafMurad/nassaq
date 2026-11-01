/**
 * Phase 6 E2E — repair workflow: detect → suggest → preview → confirm →
 * apply → download, undo/reject/reset behavior, re-parse discard warning,
 * and privacy (zero non-app network requests across the whole flow).
 *
 * Synthetic data only (docs/07 fixture policy). Downloaded workbooks are
 * read back with an independent ExcelJS instance and compared cell-exactly.
 */

import { expect, test, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';

const REPAIR_CSV = [
  'Name,Code,Note',
  'أحمد,  00073  ,  padded  ',
  'سارة,٠٠١٢٣,clean',
].join('\n');

const TRIM_CODE = 'repair-suggestion-1:1:TRIM_SURROUNDING_WHITESPACE';
const TRIM_NOTE = 'repair-suggestion-1:2:TRIM_SURROUNDING_WHITESPACE';
const DIGITS = 'repair-suggestion-2:1:ARABIC_INDIC_TO_ASCII_DIGITS';

async function setInputFile(
  page: Page,
  content: string,
  name = 'repair.csv',
): Promise<void> {
  await page.getByTestId('file-input').setInputFiles({
    name,
    mimeType: 'text/csv',
    buffer: Buffer.from(content, 'utf-8'),
  });
}

async function waitForReviewReady(page: Page): Promise<void> {
  await expect(page.getByTestId('data-preview-table-container')).toBeVisible({
    timeout: 10_000,
  });
}

async function downloadAndLoad(
  page: Page,
): Promise<ExcelJS.Workbook> {
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('download-excel-button').click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(new Uint8Array(Buffer.concat(chunks)).buffer);
  return wb;
}

test.describe('Phase 6 — repair workflow', () => {
  test('detect → suggest → preview → confirm → apply → download writes original + approved diffs', async ({
    page,
  }) => {
    await page.goto('/');
    await setInputFile(page, REPAIR_CSV);
    await waitForReviewReady(page);

    // Suggestions detected for the padded and Arabic-Indic-digit cells.
    await expect(page.getByTestId(TRIM_CODE)).toBeVisible();
    await expect(page.getByTestId(TRIM_NOTE)).toBeVisible();
    await expect(page.getByTestId(DIGITS)).toBeVisible();
    await expect(page.getByTestId(TRIM_CODE)).toContainText('00073');
    await expect(page.getByTestId(DIGITS)).toContainText('00123');

    // Nothing is edited before confirmation.
    await expect(page.getByTestId('repair-history-count')).toContainText('0');
    await expect(page.getByTestId('repair-undo')).toBeDisabled();

    // Stage two suggestions → diff preview with affected-cell count.
    await page.getByTestId(`repair-stage-1:1:TRIM_SURROUNDING_WHITESPACE`).click();
    await page.getByTestId(`repair-stage-2:1:ARABIC_INDIC_TO_ASCII_DIGITS`).click();
    await expect(page.getByTestId('repair-staged-preview')).toBeVisible();
    await expect(page.getByTestId('repair-affected-count')).toContainText('2');
    await expect(page.getByTestId('repair-staged-1-1')).toContainText('00073');
    await expect(page.getByTestId('repair-staged-2-1')).toContainText('00123');

    // Explicit bulk confirmation applies the staged diffs.
    await page.getByTestId('repair-confirm-staged').click();
    await expect(page.getByTestId('cell-edited-1-1')).toBeVisible();
    await expect(page.getByTestId('cell-edited-2-1')).toBeVisible();
    await expect(page.getByTestId('repair-history-count')).toContainText('1');
    await expect(page.getByTestId('repair-undo')).toBeEnabled();

    // Worker regenerated suggestions over the effective table: the repaired
    // cells no longer appear as suggestions.
    await expect(page.getByTestId(TRIM_CODE)).not.toBeVisible();
    await expect(page.getByTestId(DIGITS)).not.toBeVisible();
    // The untouched padded cell keeps its suggestion.
    await expect(page.getByTestId(TRIM_NOTE)).toBeVisible();

    // Export the effective table and read the download back.
    await page.getByTestId('create-excel-button').click();
    await expect(page.getByTestId('validation-success')).toBeVisible({ timeout: 10_000 });
    const wb = await downloadAndLoad(page);
    const sheet = wb.getWorksheet('Data');
    expect(sheet?.rowCount).toBe(3);
    expect(sheet?.columnCount).toBe(3);

    // Approved diffs applied in the workbook.
    expect(sheet?.getCell(2, 1).value).toBe('أحمد');
    expect(sheet?.getCell(2, 2).value).toBe('00073'); // trimmed
    expect(sheet?.getCell(3, 2).value).toBe('00123'); // digits mapped
    // Untouched cells remain exactly as parsed.
    expect(sheet?.getCell(2, 3).value).toBe('  padded  ');
    expect(sheet?.getCell(3, 1).value).toBe('سارة');
    expect(sheet?.getCell(3, 3).value).toBe('clean');

    sheet?.eachRow((row) =>
      row.eachCell((cell) => {
        expect(cell.formula).toBeUndefined();
        expect(cell.hyperlink).toBeUndefined();
      }),
    );
  });

  test('undo reverts the applied edit and the download reflects reverted values', async ({
    page,
  }) => {
    await page.goto('/');
    await setInputFile(page, REPAIR_CSV);
    await waitForReviewReady(page);

    await page.getByTestId(`repair-stage-1:1:TRIM_SURROUNDING_WHITESPACE`).click();
    await page.getByTestId('repair-confirm-staged').click();
    await expect(page.getByTestId('cell-edited-1-1')).toBeVisible();

    await page.getByTestId('repair-undo').click();
    await expect(page.getByTestId('repair-history-count')).toContainText('0');
    await expect(page.getByTestId('repair-undo')).toBeDisabled();
    // Suggestion regenerated over the reverted effective table.
    await expect(page.getByTestId(TRIM_CODE)).toBeVisible();

    await page.getByTestId('create-excel-button').click();
    await expect(page.getByTestId('validation-success')).toBeVisible({ timeout: 10_000 });
    const wb = await downloadAndLoad(page);
    const sheet = wb.getWorksheet('Data');
    expect(sheet?.getCell(2, 2).value).toBe('  00073  ');
  });

  test('rejecting a suggestion leaves the export unchanged', async ({
    page,
  }) => {
    await page.goto('/');
    await setInputFile(page, REPAIR_CSV);
    await waitForReviewReady(page);

    await page.getByTestId(`repair-reject-2:1:ARABIC_INDIC_TO_ASCII_DIGITS`).click();
    // Rejected suggestion disappears; nothing is staged or applied.
    await expect(page.getByTestId(DIGITS)).not.toBeVisible();
    await expect(page.getByTestId('repair-history-count')).toContainText('0');

    await page.getByTestId('create-excel-button').click();
    await expect(page.getByTestId('validation-success')).toBeVisible({ timeout: 10_000 });
    const wb = await downloadAndLoad(page);
    const sheet = wb.getWorksheet('Data');
    expect(sheet?.getCell(3, 2).value).toBe('٠٠١٢٣');
  });

  test('manual cell edit exports a formula-like string as literal text', async ({
    page,
  }) => {
    await page.goto('/');
    await setInputFile(page, REPAIR_CSV);
    await waitForReviewReady(page);

    // Edit the first data row's Code cell manually.
    await page.getByTestId('cell-edit-1-1').click();
    const input = page.getByTestId('cell-input-1-1');
    await expect(input).toBeFocused();
    await input.fill('=1+1');
    await page.getByTestId('cell-confirm-1-1').click();

    // Applied after the explicit per-cell confirm.
    await expect(page.getByTestId('cell-edited-1-1')).toBeVisible();
    await expect(page.getByTestId('repair-history-count')).toContainText('1');

    await page.getByTestId('create-excel-button').click();
    await expect(page.getByTestId('validation-success')).toBeVisible({ timeout: 10_000 });
    const wb = await downloadAndLoad(page);
    const sheet = wb.getWorksheet('Data');
    const cell = sheet?.getCell(2, 2);
    expect(cell?.value).toBe('=1+1');
    expect(cell?.type).toBe(ExcelJS.ValueType.String);
    expect(cell?.formula).toBeUndefined();
  });

  test('changing the delimiter with confirmed edits warns before discarding them', async ({
    page,
  }) => {
    await page.goto('/');
    await setInputFile(page, REPAIR_CSV);
    await waitForReviewReady(page);

    await page.getByTestId(`repair-stage-1:1:TRIM_SURROUNDING_WHITESPACE`).click();
    await page.getByTestId('repair-confirm-staged').click();
    await expect(page.getByTestId('cell-edited-1-1')).toBeVisible();

    // Attempt a re-parse-triggering change → explicit discard warning.
    await page.getByTestId('delimiter-choice-;').click();
    const warning = page.getByTestId('repair-discard-warning');
    await expect(warning).toBeVisible();
    await expect(warning).toContainText('1');

    // Cancel keeps the edits.
    await page.getByTestId('repair-discard-cancel').click();
    await expect(warning).not.toBeVisible();
    await expect(page.getByTestId('cell-edited-1-1')).toBeVisible();

    // Confirm discards the diffs and re-parses from raw bytes.
    await page.getByTestId('delimiter-choice-;').click();
    await expect(warning).toBeVisible();
    await page.getByTestId('repair-discard-confirm').click();
    await waitForReviewReady(page);
    await expect(page.getByTestId('repair-history-count')).toContainText('0');
    await expect(page.getByTestId('cell-edited-1-1')).not.toBeVisible();
    // The file re-parsed under the semicolon delimiter (1 column now).
    await expect(page.getByTestId('parse-columns')).toHaveText('1');
  });

  test('cancel/reset discards all diffs (fresh re-select shows originals)', async ({
    page,
  }) => {
    await page.goto('/');
    await setInputFile(page, REPAIR_CSV);
    await waitForReviewReady(page);

    await page.getByTestId(`repair-stage-1:1:TRIM_SURROUNDING_WHITESPACE`).click();
    await page.getByTestId('repair-confirm-staged').click();
    await expect(page.getByTestId('cell-edited-1-1')).toBeVisible();

    // Full reset (U-8 flow): choose another file → fresh start.
    await page.getByTestId('choose-another').click();
    await expect(page.getByTestId('dropzone')).toBeVisible({ timeout: 10_000 });

    // Re-select the same synthetic file: no stale diffs survive.
    await setInputFile(page, REPAIR_CSV);
    await waitForReviewReady(page);
    await expect(page.getByTestId('repair-history-count')).toContainText('0');
    await expect(page.getByTestId('cell-edited-1-1')).not.toBeVisible();
    await expect(page.getByTestId(TRIM_CODE)).toBeVisible();
  });

  test('zero non-app network requests across the whole repair flow', async ({
    page,
  }) => {
    const external: string[] = [];
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.origin !== 'http://127.0.0.1:4173') external.push(req.url());
    });

    await page.goto('/');
    await setInputFile(page, REPAIR_CSV);
    await waitForReviewReady(page);

    // Full interaction mix: stage, reject, confirm, undo, redo, manual edit,
    // export and download — all strictly local.
    await page.getByTestId(`repair-stage-1:1:TRIM_SURROUNDING_WHITESPACE`).click();
    await page.getByTestId(`repair-reject-2:1:ARABIC_INDIC_TO_ASCII_DIGITS`).click();
    await page.getByTestId('repair-confirm-staged').click();
    await expect(page.getByTestId('cell-edited-1-1')).toBeVisible();
    await page.getByTestId('repair-undo').click();
    await expect(page.getByTestId('repair-history-count')).toContainText('0');
    await page.getByTestId('repair-redo').click();
    await expect(page.getByTestId('cell-edited-1-1')).toBeVisible();

    await page.getByTestId('create-excel-button').click();
    await expect(page.getByTestId('validation-success')).toBeVisible({ timeout: 10_000 });
    await downloadAndLoad(page);

    expect(external).toEqual([]);
  });
});
