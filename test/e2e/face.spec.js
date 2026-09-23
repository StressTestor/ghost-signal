import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';

const STATUSES = ['idle', 'working', 'ok', 'warn', 'deny', 'bypass', 'crash'];
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

async function hashFor(page, status) {
  await page.evaluate((s) => {
    window.GS.seed(1);
    document.getElementById('face').setAttribute('status', s);
  }, status);
  const frame = status === 'ok' ? 'idle' : status;
  await expect(page.locator('#face')).toHaveAttribute('data-frame', frame);
  return page.evaluate(() => document.getElementById('face').hash());
}

test('every status has a pinned hash, ok equals idle, six are distinct, the face stays green', async ({ page }) => {
  await page.goto('/test/e2e/pages/face.html');
  await page.waitForSelector('#face gs-mosaic[data-drawn]');
  const hashes = {};
  for (const s of STATUSES) hashes[s] = await hashFor(page, s);
  for (const s of STATUSES) expect(sha256(hashes[s])).toMatchSnapshot(`face-${s}.txt`);
  expect(hashes.ok).toBe(hashes.idle);
  expect(new Set(['idle', 'working', 'warn', 'deny', 'bypass', 'crash'].map((s) => hashes[s])).size).toBe(6);
  expect(await page.locator('#face gs-mosaic').getAttribute('lit')).toBeNull();
});

test('a status change fires gs-face-change and one gs-glitch class at glitch 1', async ({ page }) => {
  await page.goto('/test/e2e/pages/face-motion.html');
  await page.waitForSelector('#face gs-mosaic[data-drawn]');
  expect(await page.evaluate(() => document.documentElement.dataset.glitch)).toBe('1');
  const result = await page.evaluate(() => new Promise((resolve) => {
    const face = document.getElementById('face');
    face.addEventListener('gs-face-change', (e) => {
      resolve({ detail: e.detail, glitching: face.classList.contains('gs-glitch') });
    }, { once: true });
    face.setAttribute('status', 'deny');
  }));
  expect(result.detail).toEqual({ status: 'deny', frame: 'deny' });
  expect(result.glitching).toBe(true);
  await expect(page.locator('#face')).not.toHaveClass(/gs-glitch/, { timeout: 2000 });
});

test('blink draws the blink frame for one sprite step and returns to idle', async ({ page }) => {
  await page.goto('/test/e2e/pages/face-motion.html');
  await page.waitForSelector('#face gs-mosaic[data-drawn]');
  const blinked = await page.evaluate(() => document.getElementById('face').blink());
  expect(blinked).toBe(true);
  await expect(page.locator('#face')).toHaveAttribute('data-frame', 'blink');
  await expect(page.locator('#face')).toHaveAttribute('data-frame', 'idle', { timeout: 2000 });
});

test('an unregistered expression override falls back to the status', async ({ page }) => {
  await page.goto('/test/e2e/pages/face.html');
  await page.waitForSelector('#face gs-mosaic[data-drawn]');
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.evaluate(() => document.getElementById('face').setAttribute('expression', 'haunting'));
  await expect(page.locator('#face')).toHaveAttribute('data-frame', 'idle');
  expect(errors.some((e) => e.includes('"haunting"'))).toBe(true);
});

test.describe('reduced motion', () => {
  // this pinned playwright build has no top-level `reducedMotion` fixture shortcut
  // (unlike current playwright, it isn't in @playwright/test's built-in use() list),
  // so the override has to go through the generic contextOptions escape hatch instead
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('forces glitch 0, never blinks, never glitches, runs no animation', async ({ page }) => {
    await page.goto('/test/e2e/pages/face-motion.html');
    await page.waitForSelector('#face gs-mosaic[data-drawn]');
    expect(await page.evaluate(() => document.documentElement.dataset.glitch)).toBe('0');
    for (const s of STATUSES) {
      await page.evaluate((v) => document.getElementById('face').setAttribute('status', v), s);
      await expect(page.locator('#face')).toHaveAttribute('data-frame', s === 'ok' ? 'idle' : s);
      expect(await page.locator('#face').getAttribute('class') ?? '').not.toContain('gs-glitch');
    }
    expect(await page.evaluate(() => document.getElementById('face').blink())).toBe(false);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });
});
