import { expect, test, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';

async function setInputFile(
  page: Page,
  content: string | Buffer,
  name = 'test.csv',
): Promise<void> {
  await page.getByTestId('file-input').setInputFiles({
    name,
    mimeType: 'text/csv',
    buffer: typeof content === 'string' ? Buffer.from(content) : content,
  });
}

async function waitForReviewReady(page: Page): Promise<void> {
  await expect(page.getByTestId('data-preview-table-container')).toBeVisible({
    timeout: 10_000,
  });
}

test.describe('Phase 5 — Security, privacy, offline capabilities, and final QA', () => {
  test('privacy audit: zero network transmission of sentinel, filename, or cell data', async ({
    page,
  }) => {
    const SENTINEL = 'CONFIDENTIAL_SENTINEL_TOKEN_998877';
    const TEST_FILENAME = 'secret-payroll-sentinel-2026.csv';

    const outgoingRequests: Array<{ url: string; method: string; postData: string | null }> = [];

    // Track every request made by the browser
    page.on('request', (req) => {
      outgoingRequests.push({
        url: req.url(),
        method: req.method(),
        postData: req.postData(),
      });
    });

    await page.goto('/');

    const initialRequestCount = outgoingRequests.length;

    // Construct synthetic CSV with unique confidential sentinel
    const csvContent = [
      'EmpID,Name,Phone,Token,Amount',
      `101,أحمد,001234,${SENTINEL},1500`,
      '102,سارة,005678,REGULAR_TOKEN,2200',
    ].join('\n');

    await setInputFile(page, csvContent, TEST_FILENAME);
    await waitForReviewReady(page);

    // Review options and select Number for Amount
    await page.getByTestId('column-type-select-4').selectOption('number');

    // Create safe Excel
    await page.getByTestId('create-excel-button').click();
    await expect(page.getByTestId('validation-success')).toBeVisible({ timeout: 10_000 });

    // Download verified XLSX
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('download-excel-button').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('secret-payroll-sentinel-2026-nassaq.xlsx');

    // Strict audit: Inspect all requests made during and after the file processing
    const requestsDuringProcessing = outgoingRequests.slice(initialRequestCount);

    // 1. Zero requests should have been made to external endpoints during processing
    for (const req of requestsDuringProcessing) {
      // Must not contain sentinel in URL or POST body
      expect(req.url).not.toContain(SENTINEL);
      expect(req.url).not.toContain('secret-payroll');
      if (req.postData) {
        expect(req.postData).not.toContain(SENTINEL);
        expect(req.postData).not.toContain(TEST_FILENAME);
        expect(req.postData).not.toContain('أحمد');
      }
    }

    // 2. Also assert across ALL recorded requests in the session
    for (const req of outgoingRequests) {
      expect(req.url).not.toContain(SENTINEL);
      if (req.postData) {
        expect(req.postData).not.toContain(SENTINEL);
      }
    }
  });

  test('offline verification: entire workflow functions with network disabled after load', async ({
    page,
    context,
  }) => {
    const recordedRequests: string[] = [];
    context.on('request', (req) => recordedRequests.push(req.url()));

    await page.goto('/');

    const offlineCsv = [
      'Item,Code,Qty',
      'دفتر,0099,42',
      'قلم,0088,15',
    ].join('\n');

    await setInputFile(page, offlineCsv, 'offline-catalog.csv');
    await waitForReviewReady(page);

    const requestsBefore = recordedRequests.length;

    // Disconnect network completely (simulating offline device)
    await context.setOffline(true);

    // Verify preview renders in offline mode
    await expect(page.getByText('دفتر')).toBeVisible();

    // Toggle column type to number for Qty while offline
    await page.getByTestId('column-type-select-2').selectOption('number');

    // Create Excel while offline
    await page.getByTestId('create-excel-button').click();
    await expect(page.getByTestId('validation-success')).toBeVisible({ timeout: 10_000 });

    // Download while offline
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('download-excel-button').click();
    const download = await downloadPromise;

    // Assert zero new network requests occurred during offline processing
    const requestsAfter = recordedRequests.slice(requestsBefore);
    expect(requestsAfter).toEqual([]);

    // Verify downloaded workbook is complete and readable
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const buf = Buffer.concat(chunks);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(new Uint8Array(buf).buffer);
    const sheet = wb.worksheets[0];
    expect(sheet?.name).toBe('Data');
    expect(sheet?.getCell(2, 1).value).toBe('دفتر');
    expect(sheet?.getCell(2, 2).value).toBe('0099'); // string
    expect(sheet?.getCell(2, 3).value).toBe(42); // number

    // Re-enable network
    await context.setOffline(false);
  });

  test('storage audit: zero client storage persistence of file content or metadata', async ({
    page,
  }) => {
    await page.goto('/');

    const csvContent = 'SecretCol,Value\nPII_DATA,001234\n';
    await setInputFile(page, csvContent, 'client-secrets.csv');
    await waitForReviewReady(page);

    // Check localStorage, sessionStorage, and IndexedDB
    const storageState = await page.evaluate(async () => {
      const localKeys = Object.keys(localStorage);
      const sessionKeys = Object.keys(sessionStorage);

      let indexedDbCount = 0;
      if (window.indexedDB && typeof window.indexedDB.databases === 'function') {
        const dbs = await window.indexedDB.databases();
        indexedDbCount = dbs.length;
      }

      return {
        localKeys,
        sessionKeys,
        indexedDbCount,
      };
    });

    expect(storageState.localKeys.length).toBe(0);
    expect(storageState.sessionKeys.length).toBe(0);
    expect(storageState.indexedDbCount).toBe(0);
  });

  test('privacy disclosure modal opens, displays all required assurances, and closes', async ({
    page,
  }) => {
    await page.goto('/');

    // 1. Open via header button
    const openBtn = page.getByTestId('privacy-open-button');
    await expect(openBtn).toBeVisible();
    await openBtn.click();

    const modal = page.getByTestId('privacy-modal');
    await expect(modal).toBeVisible();

    // Check headings and copy
    await expect(page.getByText('معالجة محلية 100% داخل جهازك')).toBeVisible();
    await expect(page.getByText('بدون أي تتبع أو إعلانات أو ملفات تعريف')).toBeVisible();
    await expect(page.getByText('بيانات مؤقتة تنتهي بانتهاء الجلسة')).toBeVisible();

    // Close via close button
    const closeBtn = page.getByTestId('privacy-modal-close');
    await closeBtn.click();
    await expect(modal).not.toBeVisible();

    // 2. Open via footer link
    const footerBtn = page.getByTestId('footer-privacy-button');
    await footerBtn.click();
    await expect(modal).toBeVisible();

    // Close via confirmation button at bottom
    const confirmBtn = page.getByTestId('privacy-modal-confirm');
    await confirmBtn.click();
    await expect(modal).not.toBeVisible();
  });

  test('hostile filename sanitization prevents path traversal and strips bidi overrides', async ({
    page,
  }) => {
    await page.goto('/');

    const csvContent = 'ID,Name\n1,Test\n';
    // Filename with path traversal and RLO bidi override
    const hostileName = '../../test\u202Eevil.csv';

    await setInputFile(page, csvContent, hostileName);
    await waitForReviewReady(page);

    await page.getByTestId('create-excel-button').click();
    await expect(page.getByTestId('validation-success')).toBeVisible({ timeout: 10_000 });

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('download-excel-button').click();
    const download = await downloadPromise;

    const filename = download.suggestedFilename();
    // Path traversal characters stripped
    expect(filename).not.toContain('..');
    expect(filename).not.toContain('/');
    expect(filename).not.toContain('\\');
    // Bidi override stripped
    expect(filename).not.toContain('\u202E');
    expect(filename).toBe('testevil-nassaq.xlsx');
  });

  test('error recovery: handles malformed CSV and allows user to reset cleanly', async ({
    page,
  }) => {
    await page.goto('/');

    // Upload broken quote
    await setInputFile(page, 'a,b\n"unclosed quote,value\n', 'broken.csv');

    // docs/03 §3 (D-2): detection refuses candidates with quote parse errors,
    // so the delimiter review is shown first instead of a confident guess.
    await expect(page.getByTestId('delimiter-review')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('delimiter-option-,').click();

    // After explicit confirmation, the full parse reports the malformed CSV error
    await expect(page.getByTestId('parse-error')).toBeVisible({ timeout: 10_000 });

    // Reset via "Choose another file"
    const resetBtn = page.getByTestId('choose-another');
    await expect(resetBtn).toBeVisible();
    await resetBtn.click();

    // Dropzone reappears in clean state
    await expect(page.getByTestId('dropzone')).toBeVisible();

    // Upload valid CSV
    await setInputFile(page, 'Name,Score\nSara,100\n', 'valid.csv');
    await waitForReviewReady(page);
    await expect(page.getByText('Sara')).toBeVisible();
  });
});
