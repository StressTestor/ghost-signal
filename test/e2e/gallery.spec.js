import { test, expect } from '@playwright/test';

const STATUSES = ['idle', 'working', 'ok', 'warn', 'deny', 'bypass', 'crash'];

async function open(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e));
  await page.goto('/gallery/');
  await page.waitForSelector('html[data-gallery-ready]');
  return errors;
}

test('the probe app plugs in with no core change', async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator('#probe-face')).toHaveAttribute('data-frame', 'probing');
  expect(await page.locator('body > svg symbol#gs-sigil').count()).toBe(1);
  await expect(page.locator('#probe')).toHaveAttribute('data-app', 'probe');
  const accentDark = await page.locator('#probe').evaluate((el) => getComputedStyle(el).getPropertyValue('--gs-color-accent-2').trim());
  expect(accentDark).toBe('#b78bff');
  await page.evaluate(() => window.gallery.setTheme('light'));
  const accentLight = await page.locator('#probe').evaluate((el) => getComputedStyle(el).getPropertyValue('--gs-color-accent-2').trim());
  expect(accentLight).toBe('#6b2fc9');
  await expect(page.locator('#probe-empty gs-decode[part="copy"]')).toHaveText('probe is listening. nothing has pinged yet');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('probe:status', { detail: { status: 'deny' } })));
  await expect(page.locator('#probe-status-face')).toHaveAttribute('data-frame', 'deny');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('run tests');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => window.gallery.lastCommand)).toEqual({ id: 'probe.tests', app: 'probe' });
  expect(await page.locator('#probe-empty gs-wallpaper gs-mosaic[data-drawn]').count()).toBe(1);
  expect(errors).toEqual([]);
});

test('doto is served from the bundle and used by the wordmark', async ({ page }) => {
  await open(page);
  const font = await page.evaluate(async () => {
    await document.fonts.load('900 34px Doto');
    return {
      loaded: document.fonts.check('900 34px Doto'),
      family: getComputedStyle(document.querySelector('.gs-wordmark')).fontFamily,
      sources: [...document.fonts].map((f) => f.family),
    };
  });
  expect(font.loaded).toBe(true);
  expect(font.family).toContain('Doto');
  expect(font.sources.some((f) => f.includes('Doto'))).toBe(true);
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.reload();
  await page.waitForSelector('html[data-gallery-ready]');
  expect(requests.some((u) => u.includes('fonts.googleapis') || u.includes('fonts.gstatic'))).toBe(false);
});

test('every status renders on every gallery face and the chrome switches work', async ({ page }) => {
  await open(page);
  for (const s of STATUSES) {
    await page.evaluate((v) => window.gallery.setStatus(v), s);
    await expect(page.locator('#hero-face')).toHaveAttribute('data-frame', s === 'ok' ? 'idle' : s);
  }
  await page.locator('[data-glitch-pick="2"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-glitch', '2');
  await expect(page.locator('#row-list gs-row[status="deny"] [part="label"] gs-decode')).toHaveCount(1);
  await page.locator('[data-theme-pick="light"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe('rgb(242, 244, 245)');
});

test('ambient glitch fires on a data-gs-ambient element at glitch 1', async ({ page }) => {
  await open(page);
  const hit = await page.evaluate(() => new Promise((resolve) => {
    window.GS.seed(1);
    const targets = [...document.querySelectorAll('[data-gs-ambient]')];
    const mo = new MutationObserver(() => {
      const t = targets.find((el) => el.classList.contains('gs-glitch'));
      if (t) { mo.disconnect(); resolve(true); }
    });
    for (const t of targets) mo.observe(t, { attributes: true, attributeFilter: ['class'] });
    window.gallery.ambient({ min: 10, max: 30 });
    setTimeout(() => resolve(false), 2000);
  }));
  expect(hit).toBe(true);
});

test('screenshots per theme and glitch level land in gallery/screenshots', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.GS.seed(1));
  for (const theme of ['dark', 'light']) {
    for (const glitch of [0, 1, 2]) {
      await page.evaluate(([t, g]) => { window.gallery.setTheme(t); window.gallery.setGlitch(g); }, [theme, glitch]);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `gallery/screenshots/${theme}-glitch${glitch}.png`, fullPage: true });
    }
  }
});

test.describe('reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('cycles every status, fires bypass and crash toasts, and nothing animates', async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => document.documentElement.dataset.glitch)).toBe('0');
    for (const s of STATUSES) {
      await page.evaluate((v) => window.gallery.setStatus(v), s);
      await expect(page.locator('#hero-face')).toHaveAttribute('data-frame', s === 'ok' ? 'idle' : s);
    }
    await page.evaluate(() => { window.gallery.toast('bypass'); window.gallery.toast('crash'); });
    await expect(page.locator('#toasts [part="item"]')).toHaveCount(2);
    await page.waitForTimeout(300);
    const state = await page.evaluate(() => ({
      animations: document.getAnimations().length,
      glitching: document.querySelectorAll('.gs-glitch, .gs-mosh, .gs-flare').length,
      glitch: document.documentElement.dataset.glitch,
      wordmark: document.getElementById('wordmark').textContent,
    }));
    expect(state).toEqual({ animations: 0, glitching: 0, glitch: '0', wordmark: 'ghost signal' });
  });
});
