import { test, expect } from '@playwright/test';

// gs-palette declares no observed attributes, so there is no attributeChangedCallback-before-
// connectedCallback upgrade hazard here, but every e2e spec collects pageerror regardless.
test('declarative markup upgrades with no page errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/test/e2e/pages/palette.html');
  await page.waitForFunction(() => window.ready === true);
  await expect(page.locator('#p')).toBeHidden();
  await expect(page.locator('#p [part="box"]')).toBeHidden();
  expect(errors).toEqual([]);
});

test.beforeEach(async ({ page }) => {
  await page.goto('/test/e2e/pages/palette.html');
  await page.waitForFunction(() => window.ready === true);
});

test('ctrl+k and meta+k toggle the palette, the overlay sits at 60% void', async ({ page }) => {
  await expect(page.locator('#p')).toBeHidden();
  await expect(page.locator('#p [part="box"]')).toBeHidden();
  await page.keyboard.press('Control+k');
  await expect(page.locator('#p')).toHaveAttribute('open', '');
  await expect(page.locator('#p')).toBeVisible();
  await expect(page.locator('#p [part="box"]')).toBeVisible();
  await expect(page.locator('#p [part="overlay"]')).toBeVisible();
  await expect(page.locator('#p [part="input"]')).toBeFocused();
  expect(await page.locator('#p [part="overlay"]').evaluate((el) => getComputedStyle(el).opacity)).toBe('0.6');
  await page.keyboard.press('Meta+k');
  await expect(page.locator('#p')).not.toHaveAttribute('open', '');
  await expect(page.locator('#p')).toBeHidden();
  await expect(page.locator('#p [part="box"]')).toBeHidden();
});

test('rows list every registered command, filter by substring and move with arrows', async ({ page }) => {
  await page.evaluate(() => document.getElementById('p').open());
  await expect(page.locator('#p [part="box"]')).toBeVisible();
  const rows = page.locator('#p [part="row"]');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.type('the');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveAttribute('data-id', 'probe.ping');
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(0)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowUp');
  await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true');
});

test('enter dispatches gs-command with id and app on document and closes; escape closes', async ({ page }) => {
  const detail = page.evaluate(() => new Promise((r) => document.addEventListener('gs-command', (e) => r(e.detail), { once: true })));
  await page.evaluate(() => document.getElementById('p').open());
  await expect(page.locator('#p [part="box"]')).toBeVisible();
  await page.keyboard.type('theme');
  await page.keyboard.press('Enter');
  expect(await detail).toEqual({ id: 'shell.theme', app: 'shell' });
  await expect(page.locator('#p')).not.toHaveAttribute('open', '');
  await expect(page.locator('#p')).toBeHidden();
  await expect(page.locator('#p [part="box"]')).toBeHidden();
  await page.evaluate(() => document.getElementById('p').open());
  await expect(page.locator('#p [part="box"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#p')).not.toHaveAttribute('open', '');
  await expect(page.locator('#p')).toBeHidden();
  await expect(page.locator('#p [part="box"]')).toBeHidden();
});
