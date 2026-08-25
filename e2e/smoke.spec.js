import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('generates a code as you type and reflects it in the URL', async ({ page }) => {
  await page.fill('.text-input', 'hello');
  await expect(page.locator('.preview svg')).toBeVisible();
  await expect(page).toHaveURL(/\?t=hello/);
});

test('restores the same state from a pasted URL', async ({ page }) => {
  await page.goto('/?s=code128&t=ABC-123&scale=5');
  await expect(page.locator('.symbology')).toHaveValue('code128');
  await expect(page.locator('.text-input')).toHaveValue('ABC-123');
  await expect(page.locator('[data-k="scale"]')).toHaveValue('5');
  await expect(page.locator('.preview svg')).toBeVisible();
});

test('shows a clean error and keeps the previous code on screen', async ({ page }) => {
  await page.goto('/?s=ean13&t=5901234123457');
  await expect(page.locator('.preview svg')).toBeVisible();
  await page.fill('.text-input', '123');
  await expect(page.locator('.error')).toHaveText('EAN-13 must be 12 or 13 digits');
  await expect(page.locator('.preview')).toHaveClass(/is-stale/);
  await expect(page.locator('.preview svg')).toBeVisible();
});

test('downloads every offered format with real bytes', async ({ page }) => {
  await page.goto('/?t=hello');
  await expect(page.locator('.preview svg')).toBeVisible();

  const buttons = page.locator('.downloads button');
  const count = await buttons.count();
  expect(count).toBeGreaterThanOrEqual(4);

  for (let i = 0; i < count; i += 1) {
    const button = buttons.nth(i);
    const format = await button.getAttribute('data-format');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      button.click(),
    ]);
    expect(download.suggestedFilename(), format).toMatch(/^qrcode-hello\.\w+$/);
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    expect(bytes.length, format).toBeGreaterThan(200);
    if (format === 'pdf') expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    if (format === 'png') expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  }
});

test('exports a linear code as vectors that actually contain bars', async ({ page }) => {
  await page.goto('/?s=code128&t=ABC-123');
  await expect(page.locator('.preview svg')).toBeVisible();

  const read = async (format) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click(`.downloads [data-format="${format}"]`),
    ]);
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks).toString('latin1');
  };

  // bwip-js draws linear bars as zero-area stroked lines; the vector exporters
  // must widen them into closed, fillable outlines or the file renders blank.
  const pdf = await read('pdf');
  expect(pdf.startsWith('%PDF-')).toBe(true);
  expect((pdf.match(/^h$/gm) || []).length).toBeGreaterThan(30);

  const xml = await read('xml');
  expect(xml).not.toContain('stroke');
  const bars = [...xml.matchAll(/android:fillColor="#FF000000" android:pathData="([^"]+)"/g)];
  expect(bars.length).toBeGreaterThan(0);
  expect(bars.reduce((n, [, d]) => n + (d.match(/Z/g) || []).length, 0)).toBeGreaterThan(30);
});

test('opens and closes the fullscreen display dialog', async ({ page }) => {
  await page.goto('/?t=hello');
  await page.click('.preview');
  const dialog = page.locator('dialog.display');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('svg')).toBeVisible();
  await page.click('dialog.display button.close');
  await expect(dialog).toBeHidden();
});

test('honours the manual theme toggle', async ({ page }) => {
  const before = await page.getAttribute('html', 'data-theme');
  await page.click('button.theme');
  const after = await page.getAttribute('html', 'data-theme');
  expect(after).not.toBe(before);
  await page.reload();
  expect(await page.getAttribute('html', 'data-theme')).toBe(after);
});
