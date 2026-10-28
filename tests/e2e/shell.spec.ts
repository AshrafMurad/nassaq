import { expect, test, type Page } from '@playwright/test';

const SYNTHETIC_CSV = 'name,age\r\nأحمد,30\r\nسارة,28\r\n';

async function dropCsvFile(page: Page, name = 'members.csv'): Promise<void> {
  const dataTransfer = await page.evaluateHandle(
    ({ fileName, content }) => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([content], fileName, { type: 'text/csv' }),
      );
      return transfer;
    },
    { fileName: name, content: SYNTHETIC_CSV },
  );
  await page.dispatchEvent('[data-testid="dropzone"]', 'drop', {
    dataTransfer,
  });
}

test.describe('Nassaq static shell', () => {
  test('defaults to Arabic and RTL', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(
      page.getByRole('heading', { level: 1 }),
    ).toHaveText('نسّق ملفاتك بأمان');
    await expect(page).toHaveTitle('نسّق — حوّل ملفاتك بأمان');
  });

  test('language toggle switches document to English and LTR', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('language-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(
      page.getByRole('heading', { level: 1 }),
    ).toHaveText('Import your CSV safely');
    await expect(page).toHaveTitle('Nassaq — import your CSV safely');
  });

  test('language toggle returns to Arabic and RTL', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('language-toggle').click();
    await page.getByTestId('language-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });

  test('file input is keyboard reachable and labelled', async ({ page }) => {
    await page.goto('/');
    const input = page.getByTestId('file-input');
    await expect(input).toHaveAccessibleName(/CSV/);
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const reached = await input.evaluate(
        (element) => document.activeElement === element,
      );
      if (reached) break;
      await page.keyboard.press('Tab');
    }
    await expect(input).toBeFocused();
  });

  test('drag and drop shows file name and size', async ({ page }) => {
    await page.goto('/');
    await dropCsvFile(page);
    await expect(page.getByTestId('file-name')).toHaveText('members.csv');
    await expect(page.getByTestId('file-size')).toContainText(
      /[\d\u0660-\u0669]/,
    );
    await expect(page.getByTestId('file-name')).toHaveAttribute('dir', 'auto');
  });

  test('choose another file resets and accepts the same file again', async ({
    page,
  }) => {
    await page.goto('/');
    await dropCsvFile(page);
    await expect(page.getByTestId('file-name')).toHaveText('members.csv');
    await page.getByTestId('choose-another').click();
    await expect(page.getByTestId('dropzone')).toBeVisible();
    await dropCsvFile(page);
    await expect(page.getByTestId('file-name')).toHaveText('members.csv');
  });

  test('makes no network requests beyond the app itself', async ({ page }) => {
    const externalRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin !== 'http://127.0.0.1:4173') {
        externalRequests.push(request.url());
      }
    });
    await page.goto('/');
    await dropCsvFile(page);
    await expect(page.getByTestId('file-name')).toHaveText('members.csv');
    expect(externalRequests).toEqual([]);
  });
});
