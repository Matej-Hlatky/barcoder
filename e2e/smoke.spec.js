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

test('exports PNG as a one-bit greyscale file, not an eight-bit one', async ({ page }) => {
  // A linear code is the demanding case: its human-readable text is the only
  // antialiased ink, so it compresses worse than a 2D code's hard modules.
  await page.goto('/?s=code128&t=BARCODER-42');
  await expect(page.locator('.preview svg')).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-format="png"]').click(),
  ]);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const png = Buffer.concat(chunks);

  // IHDR is always the first chunk: 8 signature bytes, 4 length, 4 type, then
  // width, height, bit depth, colour type.
  expect(png.subarray(12, 16).toString()).toBe('IHDR');
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  expect(png[24]).toBe(1); // bit depth
  expect(png[25]).toBe(0); // colour type: greyscale
  expect(png[28]).toBe(0); // not interlaced

  expect(width).toBeGreaterThanOrEqual(1024);
  expect(height).toBeGreaterThan(0);

  // The 8-bit encoder produced ~26 KB for this code; 1-bit lands near 1.7 KB.
  // The ceiling catches a silent revert to canvas.toBlob without being so tight
  // that a font metric change fails it.
  expect(png.length).toBeLessThan(8000);
  expect(png.length).toBeGreaterThan(200);
});

test('falls back to an eight-bit PNG where CompressionStream is missing', async ({ browser }) => {
  const context = await browser.newContext({ acceptDownloads: true });
  await context.addInitScript(() => { delete window.CompressionStream; });
  const page = await context.newPage();
  await page.goto('/?s=code128&t=BARCODER-42');
  await expect(page.locator('.preview svg')).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-format="png"]').click(),
  ]);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const png = Buffer.concat(chunks);

  // Still a real PNG, just the unoptimised one canvas.toBlob produces.
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect(png[24]).toBe(8);
  await context.close();
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
  const toggle = page.locator('button.theme');
  await expect(toggle).toHaveAttribute('role', 'switch');
  const before = await page.getAttribute('html', 'data-theme');
  const checkedBefore = await toggle.getAttribute('aria-checked');
  await page.click('button.theme');
  const after = await page.getAttribute('html', 'data-theme');
  expect(after).not.toBe(before);
  expect(await toggle.getAttribute('aria-checked')).not.toBe(checkedBefore);
  expect(await toggle.getAttribute('aria-checked')).toBe(String(after === 'dark'));
  await page.reload();
  expect(await page.getAttribute('html', 'data-theme')).toBe(after);
});

test('reserves the scrollbar gutter without painting a dead scrollbar', async ({ page }) => {
  const style = await page.evaluate(() => {
    const computed = getComputedStyle(document.documentElement);
    return {
      overflowY: computed.overflowY,
      scrollbarGutter: computed.scrollbarGutter,
      scrollable: document.documentElement.scrollHeight > document.documentElement.clientHeight,
    };
  });
  expect(style.scrollbarGutter).toBe('stable');
  // `overflow-y: scroll` would force a scrollbar the user cannot move whenever the
  // page fits — most visibly behind the fullscreen dialog.
  expect(style.overflowY).not.toBe('scroll');
  expect(style.scrollable).toBe(false);
});

test('right-aligns numeric option fields', async ({ page }) => {
  await page.click('.options summary');
  const align = await page.locator('[data-k="scale"]').evaluate((el) => getComputedStyle(el).textAlign);
  expect(align).toBe('right');
});

test('replaces the native select arrow with the caret icon', async ({ page }) => {
  const select = page.locator('.symbology');
  expect(await select.evaluate((el) => getComputedStyle(el).appearance)).toBe('none');
  const image = await select.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(image).toContain('data:image/svg+xml');

  // Computed style reports the URI even when the SVG cannot be decoded, so paint it:
  // an inline SVG missing its xmlns is parsed as XML, fails, and draws nothing.
  const decoded = await select.evaluate((el) => {
    const url = getComputedStyle(el).backgroundImage.slice(5, -2);
    return new Promise((resolve) => {
      const probe = new Image();
      probe.onload = () => resolve({ ok: true, w: probe.naturalWidth, h: probe.naturalHeight });
      probe.onerror = () => resolve({ ok: false, w: 0, h: 0 });
      probe.src = url;
    });
  });
  // 150x150 is the default intrinsic size for an SVG carrying only a viewBox;
  // what matters is that it decoded at all, which it does not without the xmlns.
  expect(decoded.ok).toBe(true);
  expect(decoded.w).toBeGreaterThan(0);
});

test('rasterises the caret to actual ink', async ({ page }) => {
  // -1 = the SVG could not be decoded, 0 = it decoded but drew nothing.
  const opaquePixels = await page.locator('.symbology').evaluate((el) => {
    const url = getComputedStyle(el).backgroundImage.slice(5, -2);
    return new Promise((resolve) => {
      const probe = new Image();
      probe.onerror = () => resolve(-1);
      probe.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 20;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(probe, 0, 0, 20, 20);
        const { data } = ctx.getImageData(0, 0, 20, 20);
        let opaque = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] > 0) opaque++;
        resolve(opaque);
      };
      probe.src = url;
    });
  });
  expect(opaquePixels).toBeGreaterThan(20);
});

test('keeps every download button on one row on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 720 });
  await page.fill('.text-input', 'hello');
  await expect(page.locator('.preview svg')).toBeVisible();
  const tops = await page.locator('.downloads button').evaluateAll((els) =>
    els.map((el) => Math.round(el.getBoundingClientRect().top))
  );
  expect(tops.length).toBeGreaterThan(1);
  expect(new Set(tops).size).toBe(1);

  const fit = await page.evaluate(() => {
    const downloads = document.querySelector('.downloads');
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      lastRight: Math.ceil(document.querySelector('.downloads button:last-child').getBoundingClientRect().right),
      downloadsScrollWidth: downloads.scrollWidth,
      downloadsClientWidth: downloads.clientWidth,
    };
  });
  expect(fit.scrollWidth).toBeLessThanOrEqual(fit.clientWidth);
  expect(fit.lastRight).toBeLessThanOrEqual(fit.clientWidth);
  expect(fit.downloadsScrollWidth).toBeLessThanOrEqual(fit.downloadsClientWidth);
});

test('makes the interface unselectable but leaves text inputs selectable', async ({ page }) => {
  await page.fill('.text-input', 'hello');
  const styles = await page.evaluate(() => ({
    body: getComputedStyle(document.body).userSelect,
    heading: getComputedStyle(document.querySelector('h1')).userSelect,
    button: getComputedStyle(document.querySelector('.downloads button')).userSelect,
    input: getComputedStyle(document.querySelector('.text-input')).userSelect,
  }));
  expect(styles.body).toBe('none');
  expect(styles.heading).toBe('none');
  expect(styles.button).toBe('none');
  expect(styles.input).toBe('text');
});
