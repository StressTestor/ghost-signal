import { test, expect } from '@playwright/test';

// gs-window declares heading= statically, so on load the browser upgrades an already-attributed
// element: attributeChangedCallback fires before connectedCallback has built #title. a regression
// here throws on the null internals.
test('declarative markup upgrades with no page errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/test/e2e/pages/window.html');
  // gs-window is display:none until [open] (base.css), so the frame is attached but hidden here
  await page.waitForSelector('gs-window [part="frame"]', { state: 'attached' });
  await expect(page.locator('#w [part="frame"]')).toBeHidden();
  expect(errors).toEqual([]);
});

test.beforeEach(async ({ page }) => {
  await page.goto('/test/e2e/pages/window.html');
  await page.waitForSelector('gs-window [part="frame"]', { state: 'attached' });
});

test('window opens, moves children into the body, traps tab and closes on escape with gs-close', async ({ page }) => {
  await expect(page.locator('#w [part="frame"]')).toBeHidden();
  await page.locator('#opener').focus();
  await page.evaluate(() => document.getElementById('w').open());
  await expect(page.locator('#w')).toHaveAttribute('open', '');
  await expect(page.locator('#w [part="frame"]')).toBeVisible();
  await expect(page.locator('#w [part="body"] #yes')).toBeVisible();
  await expect(page.locator('#yes')).toBeFocused();
  await expect(page.locator('#w [part="title"]')).toHaveText('confirm');
  expect(await page.locator('#w [part="titlebar"]').evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Doto');
  await page.keyboard.press('Tab');
  await expect(page.locator('#no')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#w [part="close"]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#yes')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#w [part="close"]')).toBeFocused();
  const closed = page.evaluate(() => new Promise((r) => document.getElementById('w').addEventListener('gs-close', () => r(true), { once: true })));
  await page.keyboard.press('Escape');
  expect(await closed).toBe(true);
  await expect(page.locator('#w')).not.toHaveAttribute('open', '');
  await expect(page.locator('#w [part="frame"]')).toBeHidden();
  await expect(page.locator('#opener')).toBeFocused();
});

test('the close button and the backdrop both close the window', async ({ page }) => {
  await page.evaluate(() => document.getElementById('w').open());
  await expect(page.locator('#w [part="frame"]')).toBeVisible();
  await page.locator('#w [part="close"]').click();
  await expect(page.locator('#w')).not.toHaveAttribute('open', '');
  await expect(page.locator('#w [part="frame"]')).toBeHidden();
  await expect(page.locator('#w [part="backdrop"]')).toBeHidden();
  await page.evaluate(() => document.getElementById('w').setAttribute('open', ''));
  await expect(page.locator('#w [part="backdrop"]')).toBeVisible();
  await page.locator('#w [part="backdrop"]').click({ position: { x: 5, y: 5 } });
  await expect(page.locator('#w')).not.toHaveAttribute('open', '');
  await expect(page.locator('#w [part="frame"]')).toBeHidden();
  await expect(page.locator('#w [part="backdrop"]')).toBeHidden();
});

test('ok toasts are role=status, decode their text and leave after 4s', async ({ page }) => {
  await page.evaluate(() => document.getElementById('toasts').toast({ status: 'ok', text: 'done', kaomoji: '(｡◕‿↼)' }));
  const item = page.locator('#toasts [part="item"]');
  await expect(item).toHaveAttribute('role', 'status');
  await expect(item).toHaveAttribute('data-status', 'ok');
  await expect(item.locator('gs-decode')).toHaveText('done');
  await expect(item.locator('[part="kaomoji"]')).toHaveText('(｡◕‿↼)');
  expect(await item.evaluate((el) => getComputedStyle(el).borderLeftColor)).toBe('rgb(12, 192, 203)');
  await expect(item).toHaveCount(0, { timeout: 6000 });
});

test('deny and bypass toasts are role=alert with an ok button and stay until dismissed', async ({ page }) => {
  const glitching = await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('gs-toast', { detail: { status: 'deny', text: 'denied. cute. try a quieter command XX' } }));
    const item = document.getElementById('toasts').toast({ status: 'bypass', text: 'something got through' });
    return item.classList.contains('gs-glitch');
  });
  expect(glitching).toBe(true);
  const items = page.locator('#toasts [part="item"]');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toHaveAttribute('role', 'alert');
  await expect(items.nth(0)).toHaveAttribute('data-status', 'deny');
  expect(await items.nth(0).evaluate((el) => getComputedStyle(el).borderLeftColor)).toBe('rgb(255, 92, 77)');
  await page.waitForTimeout(4500);
  await expect(items).toHaveCount(2);
  await items.nth(0).locator('[part="ok"]').click();
  await expect(items).toHaveCount(1);
});

test('an unknown status becomes warn with a console error', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.evaluate(() => document.getElementById('toasts').toast({ status: 'exploded', text: 'hm' }));
  await expect(page.locator('#toasts [part="item"]')).toHaveAttribute('data-status', 'warn');
  expect(errors.some((e) => e.includes('unknown status'))).toBe(true);
});

test('the close button is the close pixel glyph from the shared sprite, labelled close', async ({ page }) => {
  await page.evaluate(() => document.getElementById('w').open());
  const close = await page.evaluate(() => {
    const b = document.querySelector('#w [part="close"]');
    const use = b.querySelector('svg.gs-icon use');
    const box = b.querySelector('svg.gs-icon').getBoundingClientRect();
    return {
      label: b.getAttribute('aria-label'),
      text: b.textContent.trim(),
      href: use?.getAttribute('href') ?? null,
      symbol: document.querySelector('svg[data-gs-icons] symbol#gs-close') !== null,
      size: [box.width, box.height],
    };
  });
  // the page never calls injectIcons itself: gs-window makes sure the glyph it draws exists
  expect(close).toEqual({ label: 'close', text: '', href: '#gs-close', symbol: true, size: [16, 16] });
});
