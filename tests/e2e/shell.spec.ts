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

  test('file selection and reset preserve keyboard focus in both languages', async ({ page }) => {
    await page.goto('/');
    for (const locale of ['ar', 'en']) {
      if (locale === 'en') await page.getByTestId('language-toggle').click();
      const input = page.getByTestId('file-input');
      await input.focus();
      await input.setInputFiles({
        name: 'synthetic.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(SYNTHETIC_CSV),
      });
      await expect(page.getByRole('heading', { level: 2 }).first()).toBeFocused();
      await page.getByTestId('choose-another').focus();
      await page.keyboard.press('Enter');
      await expect(input).toBeFocused();
      const label = page.locator('label[for]');
      await expect(label).not.toHaveCSS('box-shadow', 'none');
      await expect(label).toHaveCSS('transition-duration', '0s');
    }
  });

  test('push-button motion is pointer-only and respects reduced motion', async ({ page }) => {
    await page.goto('/');
    const toggle = page.getByTestId('language-toggle');
    await expect(toggle).toHaveCSS('border-top-width', '2px');
    await expect(toggle).toHaveCSS('box-shadow', 'rgb(0, 0, 0) 4px 4px 0px 0px');
    await toggle.hover();
    await expect(toggle).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 4, 4)');
    await expect(toggle).toHaveCSS('box-shadow', 'none');

    for (let attempt = 0; attempt < 12; attempt += 1) {
      if (await toggle.evaluate((element) => element === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveCSS('transform', 'none');
    await expect(toggle).toHaveCSS('transition-duration', '0s');
    await expect(toggle).toHaveCSS('outline-style', 'solid');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await toggle.evaluate((element) => element.blur());
    await toggle.hover();
    await expect(toggle).toHaveCSS('transform', 'none');
    await expect(toggle).toHaveCSS('transition-duration', '0s');
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

test.describe('responsive shell interactions', () => {
  test.use({ viewport: { width: 320, height: 800 }, hasTouch: true });

  test('touch controls, long filenames, and selection layout work in both directions', async ({ page }) => {
    await page.goto('/');
    const filename = `سجل-ABC-${'synthetic-long-name-'.repeat(10)}.csv`;
    for (const locale of ['ar', 'en']) {
      if (locale === 'en') await page.getByTestId('language-toggle').click();
      for (const control of await page.locator('header [data-slot="button"]').all()) {
        const box = await control.boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }
      const picker = await page.locator('label[for]').boundingBox();
      const dropzone = await page.getByTestId('dropzone').boundingBox();
      expect(picker?.width).toBeGreaterThan(200);
      await dropCsvFile(page, filename);
      const card = await page.getByTestId('import-details').boundingBox();
      expect(card?.height).toBe(dropzone?.height);
      const reset = await page.getByTestId('choose-another').boundingBox();
      expect(reset?.height).toBeGreaterThanOrEqual(44);

      const disclosure = page.locator('summary');
      await disclosure.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('details')).toHaveAttribute('open', '');
      await expect(page.locator('details bdi')).toHaveText(filename);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
      await page.getByTestId('choose-another').click();
    }
  });

  test('reduced motion keeps file changes and control feedback immediate', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    for (const control of await page.locator('.control-feedback').all()) {
      await expect(control).toHaveCSS('transition-duration', '0s');
      await expect(control).toHaveCSS('transform', 'none');
    }
    await expect(page.getByTestId('dropzone')).toHaveCSS('transition-duration', '0s');
    await dropCsvFile(page);
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeFocused();
    await page.getByTestId('choose-another').click();
    await expect(page.getByTestId('file-input')).toBeFocused();
  });
});
