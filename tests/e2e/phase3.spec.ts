import { expect, test, type Page } from '@playwright/test';

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
  await expect(page.getByTestId('data-preview-table-container')).toBeVisible({ timeout: 10_000 });
}

test.describe('Phase 3 — Risk review UI and safe type policy', () => {
  test('displays risk summary with categories and counts', async ({ page }) => {
    await page.goto('/');

    const csv = [
      'id,code,date,formula,normal',
      '00123,12345678901234567890,03-04,=1+1,hello',
      '00456,98765432109876543210,01/02/2026,+SUM(A1),world',
    ].join('\n');

    await setInputFile(page, csv, 'risks.csv');
    await waitForReviewReady(page);

    const riskSummary = page.getByTestId('risk-summary');
    await expect(riskSummary).toBeVisible();

    // Check specific risk badges
    await expect(page.getByTestId('risk-badge-LEADING_ZERO')).toContainText('2');
    await expect(page.getByTestId('risk-badge-LONG_NUMBER')).toContainText('2');
    await expect(page.getByTestId('risk-badge-DATE_SHAPED')).toContainText('2');
    await expect(page.getByTestId('risk-badge-FORMULA_LIKE')).toContainText('2');
  });

  test('displays clean preview table with bdi isolation and cell indicators', async ({ page }) => {
    await page.goto('/');

    const csv = [
      'Name,Notes,Empty',
      'أحمد,"Line 1\nLine 2",',
      'Sara,  padded  ,',
    ].join('\n');

    await setInputFile(page, csv, 'preview.csv');
    await waitForReviewReady(page);

    const table = page.getByTestId('preview-scroll-area');
    await expect(table).toBeVisible();

    // Check header labels and letters
    await expect(page.getByTestId('column-header-0')).toContainText('A');
    await expect(page.getByTestId('column-header-0')).toContainText('Name');
    await expect(page.getByTestId('column-header-1')).toContainText('B');
    await expect(page.getByTestId('column-header-1')).toContainText('Notes');

    // Check row numbers
    await expect(page.getByTestId('preview-row-0')).toContainText('2'); // Header is row 1
    await expect(page.getByTestId('preview-row-1')).toContainText('3');

    // Check newline indicator on row 0 column 1
    const cellMultiline = page.getByTestId('cell-0-1');
    await expect(cellMultiline).toContainText('↵');

    // Check empty cell indicator on row 0 column 2
    const cellEmpty = page.getByTestId('cell-0-2');
    await expect(cellEmpty).toContainText('(فارغ)');
  });

  test('delimiter selector switches delimiter and re-parses from raw bytes', async ({ page }) => {
    await page.goto('/');

    // Semicolon-separated CSV
    const csv = 'col1;col2;col3\na;b;c\n1;2;3\n';
    await setInputFile(page, csv, 'semi.csv');
    await waitForReviewReady(page);

    // Auto-detection selects semicolon
    await expect(page.getByTestId('parse-columns')).toHaveText('3');

    // Delimiter labels are localized (Arabic default UI)
    await expect(page.getByTestId('delimiter-choice-;')).toContainText('فاصلة منقوطة');
    await expect(page.getByTestId('delimiter-choice-,')).toContainText('فاصلة');

    // User manually clicks Comma
    await page.getByTestId('delimiter-choice-,').click();

    // Under comma delimiter, col1;col2;col3 is 1 column
    await expect(page.getByTestId('parse-columns')).toHaveText('1');

    // User switches back to Semicolon
    await page.getByTestId('delimiter-choice-;').click();
    await expect(page.getByTestId('parse-columns')).toHaveText('3');
  });

  test('blocks Number mode on columns with leading zeros and reports failing row indices', async ({ page }) => {
    await page.goto('/');

    const csv = [
      'ValidNum,LeadingZero',
      '10,001',
      '20,002',
      '30,003',
    ].join('\n');

    await setInputFile(page, csv, 'numbers.csv');
    await waitForReviewReady(page);

    // Column 0 is ValidNum, Column 1 is LeadingZero
    const col1Select = page.getByTestId('column-type-select-1');
    await expect(col1Select).toHaveValue('text');

    // Try to convert Column 1 to number
    await col1Select.selectOption('number');

    // Conversion is blocked
    const alert = page.getByTestId('column-blocked-alert-1');
    await expect(alert).toBeVisible();
    // Identifies row coordinates (rows 2, 3, 4)
    await expect(alert).toContainText('2');
    // Does NOT disclose private cell value
    await expect(alert).not.toContainText('001');

    // Select should remain/revert to text
    await expect(col1Select).toHaveValue('text');

    // Dismiss alert
    await page.getByTestId('column-blocked-dismiss-1').click();
    await expect(alert).not.toBeVisible();
  });

  test('blocks Number mode on columns with trailing decimal zeros (0.10 lexical loss)', async ({ page }) => {
    await page.goto('/');

    const csv = [
      'Item,Amount',
      'A,1.5',
      'B,0.10',
    ].join('\n');

    await setInputFile(page, csv, 'decimals.csv');
    await waitForReviewReady(page);

    const col1Select = page.getByTestId('column-type-select-1');
    await col1Select.selectOption('number');

    // Blocked due to lexical roundtrip mismatch (row 3: 0.10)
    const alert = page.getByTestId('column-blocked-alert-1');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('3');
    await expect(col1Select).toHaveValue('text');
  });

  test('blocks Number mode on columns with >15 digit IDs', async ({ page }) => {
    await page.goto('/');

    const csv = [
      'Name,NationalID',
      'أحمد,12345678901234567890',
    ].join('\n');

    await setInputFile(page, csv, 'national_id.csv');
    await waitForReviewReady(page);

    const col1Select = page.getByTestId('column-type-select-1');
    await col1Select.selectOption('number');

    const alert = page.getByTestId('column-blocked-alert-1');
    await expect(alert).toBeVisible();
    await expect(col1Select).toHaveValue('text');
  });

  test('shows the precision message for >15 significant digit decimals (F-5)', async ({ page }) => {
    await page.goto('/');

    // 16 significant digits with a fraction: not IDENTIFIER_RISK (integer
    // run < 16), so the rejection reason is SIGNIFICANT_DIGITS_EXCEEDED and
    // the precision explanation must display (not the generic grammar one).
    const csv = ['Name,Value', 'أحمد,0.1234567890123456'].join('\n');

    await setInputFile(page, csv, 'precision.csv');
    await waitForReviewReady(page);

    const col1Select = page.getByTestId('column-type-select-1');
    await col1Select.selectOption('number');

    const alert = page.getByTestId('column-blocked-alert-1');
    await expect(alert).toBeVisible();
    // Precision message mentions the 15-digit threshold in both locales
    await expect(alert).toContainText('15');
    await expect(col1Select).toHaveValue('text');
  });

  test('allows Number mode on valid numeric column and shows approved indicator', async ({ page }) => {
    await page.goto('/');

    const csv = [
      'Item,Amount',
      'A,10',
      'B,2.5',
      'C,-17',
      'D,',
    ].join('\n');

    await setInputFile(page, csv, 'valid_numbers.csv');
    await waitForReviewReady(page);

    const col1Select = page.getByTestId('column-type-select-1');
    await col1Select.selectOption('number');

    // Successfully converted to number
    await expect(col1Select).toHaveValue('number');
    await expect(page.getByTestId('column-numeric-approved-1')).toBeVisible();
  });

  test('keyboard accessibility: scrollable preview table and selects are focusable', async ({ page }) => {
    await page.goto('/');

    const csv = 'colA,colB\n1,2\n3,4\n';
    await setInputFile(page, csv, 'kb.csv');
    await waitForReviewReady(page);

    const scrollArea = page.getByTestId('preview-scroll-area');
    await scrollArea.focus();
    await expect(scrollArea).toBeFocused();

    const col0Select = page.getByTestId('column-type-select-0');
    await col0Select.focus();
    await expect(col0Select).toBeFocused();
  });

  test('no network requests during review and configuration changes', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.origin !== 'http://127.0.0.1:4173') external.push(req.url());
    });

    await page.goto('/');
    const csv = 'Name,Age\nأحمد,25\nسارة,30\n';
    await setInputFile(page, csv, 'privacy_review.csv');
    await waitForReviewReady(page);

    // Switch delimiter
    await page.getByTestId('delimiter-choice-;').click();
    await page.getByTestId('delimiter-choice-,').click();

    // Toggle header
    await page.getByTestId('header-checkbox').click();
    await page.getByTestId('header-checkbox').click();

    expect(external).toEqual([]);
  });
});
