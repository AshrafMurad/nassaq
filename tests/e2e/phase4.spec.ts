import { expect, test, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import Papa from 'papaparse';

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

async function waitForReviewReady(page: Page): Promise<void> {
  await expect(page.getByTestId('data-preview-table-container')).toBeVisible({
    timeout: 10_000,
  });
}

test.describe('Phase 4 — Safe XLSX and mandatory verification', () => {
  test('download preserves literal XLSX escapes, headers, and values beyond the preview', async ({ page }) => {
    const csv = readFileSync('tests/fixtures/literal-xlsx-escapes.csv', 'utf-8');
    const parsed = Papa.parse<string[]>(csv, { header: false, dynamicTyping: false, skipEmptyLines: false });
    expect(parsed.errors).toEqual([]);
    const records = parsed.data;
    if (records.at(-1)?.length === 1 && records.at(-1)?.[0] === '') records.pop();

    await page.goto('/');
    await setInputFile(page, csv, 'literal-xlsx-escapes.csv');
    await waitForReviewReady(page);
    await page.getByTestId('column-type-select-2').selectOption('number');
    await page.getByTestId('create-excel-button').click();
    await expect(page.getByTestId('validation-success')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('manifest-number-cells')).toHaveText('26');

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('download-excel-button').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('literal-xlsx-escapes.xlsx');
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(new Uint8Array(Buffer.concat(chunks)).buffer);
    expect(workbook.worksheets).toHaveLength(1);
    const sheet = workbook.getWorksheet('Data');
    expect(sheet?.rowCount).toBe(records.length);
    expect(sheet?.columnCount).toBe(3);
    records.forEach((row, r) => row.forEach((value, c) => {
      const numeric = r > 0 && c === 2;
      const cell = sheet?.getCell(r + 1, c + 1);
      expect(cell?.value).toBe(numeric ? Number(value) : value);
      expect(cell?.type).toBe(numeric ? ExcelJS.ValueType.Number : ExcelJS.ValueType.String);
      expect(cell?.formula).toBeUndefined();
      expect(cell?.hyperlink).toBeUndefined();
    }));
  });

  test('end-to-end: generates, verifies, downloads, and preserves exact data', async ({
    page,
  }) => {
    await page.goto('/');

    const csv = [
      'Name,Code,ID,DateLike,FormulaLike,Amount,Empty',
      'أحمد,00073,12345678901234567890,03-04,=1+1,42.5,',
      'سارة,00100,98765432109876543210,12/31/2026,+SUM(A1),-15,',
    ].join('\n');

    await setInputFile(page, csv, 'inventory-2026.csv');
    await waitForReviewReady(page);

    // Initial action button is "Create safe Excel"
    const createBtn = page.getByTestId('create-excel-button');
    await expect(createBtn).toBeVisible();

    // Select Number mode for column 5 (Amount)
    const typeSelectCol5 = page.getByTestId('column-type-select-5');
    await typeSelectCol5.selectOption('number');

    // Click "Create safe Excel"
    await createBtn.click();

    // Verification result card appears
    const validationSuccess = page.getByTestId('validation-success');
    await expect(validationSuccess).toBeVisible({ timeout: 10_000 });

    // Verify manifest summary counters in UI
    await expect(page.getByTestId('manifest-total-cells')).toHaveText('21');
    await expect(page.getByTestId('manifest-number-cells')).toHaveText('2');
    await expect(page.getByTestId('manifest-empty-cells')).toHaveText('2');

    // The download button is now visible
    const downloadBtn = page.getByTestId('download-excel-button');
    await expect(downloadBtn).toBeVisible();

    // Trigger download and intercept
    const downloadPromise = page.waitForEvent('download');
    await downloadBtn.click();
    const download = await downloadPromise;

    // Check sanitized filename
    expect(download.suggestedFilename()).toBe('inventory-2026.xlsx');

    // Read back downloaded buffer with independent ExcelJS instance
    const downloadStream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of downloadStream) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const downloadedBuffer = Buffer.concat(chunks);

    const independentWb = new ExcelJS.Workbook();
    const arrayBuffer = new Uint8Array(downloadedBuffer).buffer;
    await independentWb.xlsx.load(arrayBuffer);

    // 1. Exactly 1 worksheet named 'Data'
    expect(independentWb.worksheets.length).toBe(1);
    const sheet = independentWb.worksheets[0];
    expect(sheet?.name).toBe('Data');

    // 2. Exact row and column bounds
    expect(sheet?.rowCount).toBe(3);
    expect(sheet?.columnCount).toBe(7);

    // 3. Header row values
    expect(sheet?.getCell(1, 1).value).toBe('Name');
    expect(sheet?.getCell(1, 6).value).toBe('Amount'); // Header remains string

    // 4. Data Row 1 (Excel row 2) checks:
    // Arabic text
    expect(sheet?.getCell(2, 1).value).toBe('أحمد');
    expect(sheet?.getCell(2, 1).type).toBe(ExcelJS.ValueType.String);

    // Leading zeros preserved
    expect(sheet?.getCell(2, 2).value).toBe('00073');
    expect(sheet?.getCell(2, 2).type).toBe(ExcelJS.ValueType.String);

    // 20-digit ID preserved
    expect(sheet?.getCell(2, 3).value).toBe('12345678901234567890');
    expect(sheet?.getCell(2, 3).type).toBe(ExcelJS.ValueType.String);

    // Date-like string preserved
    expect(sheet?.getCell(2, 4).value).toBe('03-04');
    expect(sheet?.getCell(2, 4).type).toBe(ExcelJS.ValueType.String);

    // Formula-like string is literal string, formula is undefined!
    const formulaCell = sheet?.getCell(2, 5);
    expect(formulaCell?.value).toBe('=1+1');
    expect(formulaCell?.type).toBe(ExcelJS.ValueType.String);
    expect(formulaCell?.formula).toBeUndefined();

    // Approved numeric cell is primitive number
    const numCell = sheet?.getCell(2, 6);
    expect(numCell?.value).toBe(42.5);
    expect(numCell?.type).toBe(ExcelJS.ValueType.Number);

    // Empty cell is string ""
    const emptyCell = sheet?.getCell(2, 7);
    expect(emptyCell?.value).toBe('');
    expect(emptyCell?.type).toBe(ExcelJS.ValueType.String);
  });

  test('resets verified download state when user modifies column types', async ({
    page,
  }) => {
    await page.goto('/');

    const csv = 'Qty,Item\n10,Apple\n20,Banana\n';
    await setInputFile(page, csv, 'items.csv');
    await waitForReviewReady(page);

    // Generate verified XLSX
    await page.getByTestId('create-excel-button').click();
    await expect(page.getByTestId('download-excel-button')).toBeVisible();

    // User changes column 0 to Number
    await page.getByTestId('column-type-select-0').selectOption('number');

    // Download button is invalidated and replaced back by Create button
    await expect(page.getByTestId('download-excel-button')).not.toBeVisible();
    await expect(page.getByTestId('create-excel-button')).toBeVisible();
  });

  test('resets verified download state when header toggle changes', async ({
    page,
  }) => {
    await page.goto('/');

    const csv = 'A,B\n1,2\n';
    await setInputFile(page, csv, 'test.csv');
    await waitForReviewReady(page);

    await page.getByTestId('create-excel-button').click();
    await expect(page.getByTestId('download-excel-button')).toBeVisible();

    // Toggle header mode
    await page.getByTestId('header-toggle').click();

    // Download button invalidated
    await expect(page.getByTestId('download-excel-button')).not.toBeVisible();
    await expect(page.getByTestId('create-excel-button')).toBeVisible();
  });
});
