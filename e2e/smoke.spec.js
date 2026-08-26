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
    expect(download.suggestedFilename(), format).toMatch(/^hello-qrcode\.\w+$/);
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

test('opens an option explanation on tap and dismisses it by tapping away', async ({ page }) => {
  await page.locator('details.options summary').click();
  const info = page.locator('.field', { hasText: 'Margin' }).locator('button.info');

  // The panel animates open, so poll rather than measure the first frame.
  await expect
    .poll(async () => (await info.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(48);
  expect((await info.boundingBox()).width).toBeGreaterThanOrEqual(48);

  await info.click();
  const tip = page.locator('.tip:popover-open');
  await expect(tip).toHaveCount(1);
  await expect(tip).toContainText('quiet zone');

  // Placed against its own row rather than left in the viewport centre, and
  // never hanging off the edge of a phone screen. Measured inside the page:
  // Playwright's boundingBox intermittently reports 0,0 for a top-layer popover.
  const geom = await page.evaluate(() => {
    const tip = document.querySelector('.tip:popover-open').getBoundingClientRect();
    const btn = document.querySelector('.tip:popover-open').parentElement
      .querySelector('button.info').getBoundingClientRect();
    return { tip, btn, width: window.innerWidth };
  });
  expect(geom.tip.x).toBeGreaterThanOrEqual(0);
  expect(geom.tip.x + geom.tip.width).toBeLessThanOrEqual(geom.width);
  expect(Math.abs((geom.tip.y + geom.tip.height / 2) - (geom.btn.y + geom.btn.height / 2)))
    .toBeLessThan(200);

  await page.mouse.click(10, 10);
  await expect(page.locator('.tip:popover-open')).toHaveCount(0);
});

test('dismisses an option explanation on scroll instead of letting it drift', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 500 });
  await page.locator('details.options summary').click();
  const info = page.locator('.field', { hasText: 'Margin' }).locator('button.info');
  await expect.poll(async () => (await info.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48);

  await info.click();
  await expect(page.locator('.tip:popover-open')).toHaveCount(1);

  await page.mouse.wheel(0, 150);
  await expect(page.locator('.tip:popover-open')).toHaveCount(0);
});

const opaque = (color) => !/rgba\(.*,\s*0\)$/.test(color) && color !== 'transparent';

test('gives a focused checkbox a focus ring, which its native appearance would otherwise swallow', async ({ page }) => {
  await page.goto('/?s=code128&t=HELLO');
  await page.locator('details.options summary').click();
  const box = page.locator(".options input[type='checkbox']").first();
  await expect.poll(async () => (await box.boundingBox())?.height ?? 0).toBeGreaterThan(0);

  for (let i = 0; i < 30 && !(await box.evaluate((e) => e === document.activeElement)); i += 1) {
    await page.keyboard.press('Tab');
  }
  const style = await box.evaluate((e) => {
    const cs = getComputedStyle(e);
    return { focusVisible: e.matches(':focus-visible'), outline: cs.outlineColor, width: cs.outlineWidth };
  });
  expect(style.focusVisible).toBe(true);
  expect(opaque(style.outline), `outline was ${style.outline}`).toBe(true);
  expect(parseFloat(style.width)).toBeGreaterThanOrEqual(2);
});

test('marks the focused pressed group button with the ink colour, not its own fill', async ({ page }) => {
  // Set the attribute directly: the app resolves its theme at load, so
  // emulateMedia afterwards changes nothing.
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  // Border colours cross-fade over 0.5s; measuring early reads the light value.
  await page.waitForTimeout(700);
  await page.keyboard.press('Tab');   // theme switch
  await page.keyboard.press('Tab');   // Linear
  await page.keyboard.press('Tab');   // 2D, pressed by default since QR is the default code
  await page.waitForTimeout(250);     // the focus edge fades in over 0.15s
  const seen = await page.evaluate(() => {
    const el = document.activeElement;
    const cs = getComputedStyle(el);
    return {
      label: el.textContent,
      pressed: el.getAttribute('aria-pressed'),
      focusVisible: el.matches(':focus-visible'),
      border: cs.borderTopColor,
      shadow: cs.boxShadow,
      fill: cs.backgroundColor,
    };
  });
  expect(seen.label).toBe('2D');
  expect(seen.pressed).toBe('true');
  expect(seen.focusVisible).toBe(true);
  // --focus and --accent are the same colour here, so the edge must not be either.
  expect(seen.border).not.toBe(seen.fill);
  expect(seen.shadow).not.toContain(seen.fill.replace(/\s/g, ''));
});

test('keeps a focus ring on the fullscreen close button', async ({ page }) => {
  await page.fill('.text-input', 'HELLO');
  await page.locator('.preview').click();
  const close = page.locator('dialog.display .close');
  await expect(close).toBeVisible();

  // The dialog autofocuses this button, so there is no unfocused state to
  // compare against: check the colour itself. Its own border-color declaration
  // outranks the shared focus rule, which is what silently removed the ring.
  for (let i = 0; i < 10 && !(await close.evaluate((e) => e.matches(':focus-visible'))); i += 1) {
    await page.keyboard.press('Tab');
  }
  await page.waitForTimeout(250);
  const focused = await close.evaluate((e) => ({
    visible: e.matches(':focus-visible'),
    border: getComputedStyle(e).borderTopColor,
    width: getComputedStyle(e).borderTopWidth,
  }));
  expect(focused.visible).toBe(true);
  expect(focused.border).toBe('rgb(63, 125, 88)');     // --focus, light value
  expect(focused.border).not.toBe('rgb(132, 132, 141)'); // the resting #84848d
  expect(parseFloat(focused.width)).toBe(2);
});

test('closes an open explanation when the options are re-rendered under it', async ({ page }) => {
  // Count the window scroll listeners, which is the leak the fix prevents.
  await page.addInitScript(() => {
    window.__scrollListeners = 0;
    const { addEventListener: add, removeEventListener: remove } = EventTarget.prototype;
    EventTarget.prototype.addEventListener = function (type, ...rest) {
      if (this === window && type === 'scroll') window.__scrollListeners += 1;
      return add.call(this, type, ...rest);
    };
    EventTarget.prototype.removeEventListener = function (type, ...rest) {
      if (this === window && type === 'scroll') window.__scrollListeners -= 1;
      return remove.call(this, type, ...rest);
    };
  });
  await page.goto('/');

  const baseline = await page.evaluate(() => window.__scrollListeners);
  await page.locator('details.options summary').click();
  await expect
    .poll(async () => (await page.locator('.fields').boundingBox())?.height ?? 0)
    .toBeGreaterThan(100);
  await page.waitForTimeout(400);

  // Shown directly rather than by clicking: a click scrolls, and a scroll
  // dismisses the tip, which would tidy the listener without the fix.
  await page.evaluate(() => document.querySelectorAll('.tip')[1].showPopover());
  await page.waitForTimeout(100);   // the scroll listener is armed a frame late
  expect(await page.evaluate(() => window.__scrollListeners)).toBe(baseline + 1);

  // Re-rendering drops the row. Removing a showing popover from the document
  // hides it without firing beforetoggle, so its listeners would never come off.
  await page.evaluate(() => {
    const select = document.querySelector('select.symbology');
    select.value = 'datamatrix';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('.tip:popover-open')).toHaveCount(0);
  expect(await page.evaluate(() => window.__scrollListeners)).toBe(baseline);
});

test('draws a focus edge on the group button that has no left border of its own', async ({ page }) => {
  await page.keyboard.press('Tab');   // theme switch
  await page.keyboard.press('Tab');   // Linear
  await page.keyboard.press('Tab');   // 2D
  await page.waitForTimeout(250);
  const focused = await page.evaluate(() => {
    const el = document.activeElement;
    const cs = getComputedStyle(el);
    return {
      label: el.textContent,
      first: el === el.parentElement.firstElementChild,
      borderLeft: cs.borderLeftWidth,
      boxShadow: cs.boxShadow,
      focusVisible: el.matches(':focus-visible'),
    };
  });
  expect(focused.label).toBe('2D');
  expect(focused.focusVisible).toBe(true);
  expect(focused.first).toBe(false);
  expect(focused.borderLeft).toBe('0px');          // the shared divider
  expect(focused.boxShadow).toContain('inset');    // ...so the edge is drawn inside
});

test('does not move the theme switch or the select caret when they take focus', async ({ page }) => {
  const thumb = page.locator('.theme .thumb');
  const before = await thumb.boundingBox();
  const caretBefore = await page.locator('select.symbology').evaluate((e) => {
    const r = e.getBoundingClientRect();
    return r.right - parseFloat(getComputedStyle(e).borderRightWidth);
  });

  await page.keyboard.press('Tab');
  await expect.poll(() => page.evaluate(() => document.activeElement.className)).toContain('theme');
  await page.waitForTimeout(250);
  const after = await thumb.boundingBox();
  expect(after.x).toBe(before.x);
  expect(after.y).toBe(before.y);

  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');   // the symbology select
  await page.waitForTimeout(250);
  const focusedCaret = await page.locator('select.symbology').evaluate((e) => {
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    return {
      isSelect: e.tagName,
      edge: r.right - parseFloat(cs.borderRightWidth),
      position: cs.backgroundPosition,
    };
  });
  expect(focusedCaret.isSelect).toBe('SELECT');
  // The caret is placed from the padding edge, which moves inward as the border
  // grows -- the offset has to shrink by the same pixel.
  expect(focusedCaret.edge).toBeCloseTo(caretBefore - 1, 1);
  expect(focusedCaret.position).toBe('calc(100% - 13px) 50%');
});

test('honours reduced motion for focus feedback, not just theme changes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => ({
    tag: document.activeElement.tagName,
    transition: getComputedStyle(document.activeElement).transition,
  }));
  expect(focused.tag).toBe('BUTTON');
  expect(focused.transition).not.toContain('0.15s');
  expect(focused.transition).not.toContain('border-color');
});

test('closes an open explanation when the panel is collapsed', async ({ page }) => {
  await page.addInitScript(() => {
    window.__scrollListeners = 0;
    const { addEventListener: add, removeEventListener: remove } = EventTarget.prototype;
    EventTarget.prototype.addEventListener = function (type, ...rest) {
      if (this === window && type === 'scroll') window.__scrollListeners += 1;
      return add.call(this, type, ...rest);
    };
    EventTarget.prototype.removeEventListener = function (type, ...rest) {
      if (this === window && type === 'scroll') window.__scrollListeners -= 1;
      return remove.call(this, type, ...rest);
    };
  });
  await page.goto('/');
  const baseline = await page.evaluate(() => window.__scrollListeners);

  await page.locator('details.options summary').click();
  await expect
    .poll(async () => (await page.locator('.fields').boundingBox())?.height ?? 0)
    .toBeGreaterThan(100);
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelectorAll('.tip')[1].showPopover());
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__scrollListeners)).toBe(baseline + 1);

  // Collapsed without a pointer event outside the popover -- the keyboard path,
  // which light-dismiss never sees.
  await page.evaluate(() => { document.querySelector('details.options').open = false; });
  await expect(page.locator('.tip:popover-open')).toHaveCount(0);
  expect(await page.evaluate(() => window.__scrollListeners)).toBe(baseline);
});

test('slashes the zero in the payload field so 0 cannot be read as O', async ({ page }) => {
  const metrics = await page.evaluate(() => {
    const input = document.querySelector('.text-input');
    const cs = getComputedStyle(input);
    const width = (text) => {
      const span = document.createElement('span');
      span.style.cssText = `position:absolute;white-space:pre;font:${cs.font};font-family:${cs.fontFamily}`;
      span.textContent = text;
      document.body.append(span);
      const w = span.getBoundingClientRect().width;
      span.remove();
      return w;
    };
    return { narrow: width('iiii'), wide: width('WWWW'), family: cs.fontFamily };
  });
  expect(metrics.narrow).toBeCloseTo(metrics.wide, 1);
  expect(metrics.family.split(',')[0].trim()).toBe('Menlo');
});
