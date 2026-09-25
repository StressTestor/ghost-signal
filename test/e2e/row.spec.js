import { test, expect } from '@playwright/test';

// gs-row and the containers declare static attributes, so on load the browser upgrades
// already-attributed elements: attributeChangedCallback fires before connectedCallback builds
// internals. a regression here throws. gs-wallpaper mounted correctly (inside gs-empty) must
// not throw either, unlike the deliberately-misplaced one covered below.
test('declarative markup upgrades with no page errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/test/e2e/pages/row.html');
  await page.waitForFunction(() => window.ready === true);
  await page.waitForSelector('#r1 [part="head"]');
  await page.waitForSelector('#wp gs-mosaic[data-drawn]');
  expect(errors).toEqual([]);
});

test.beforeEach(async ({ page }) => {
  await page.goto('/test/e2e/pages/row.html');
  await page.waitForFunction(() => window.ready === true);
  await page.waitForSelector('#r1 [part="head"]');
});

test('a row renders its parts and toggles detail by click, enter and space', async ({ page }) => {
  const head = page.locator('#r1 [part="head"]');
  const detail = page.locator('#r1 [part="detail"]');
  await expect(page.locator('#r1 [part="sigil"]')).toHaveText('+');
  await expect(page.locator('#r1 [part="label"]')).toHaveText('cargo test');
  await expect(page.locator('#r1 [part="command"]')).toHaveText('cargo test --workspace');
  await expect(head).toHaveAttribute('aria-expanded', 'false');
  await expect(detail).toBeHidden();
  await head.click();
  await expect(head).toHaveAttribute('aria-expanded', 'true');
  await expect(detail).toBeVisible();
  await expect(detail).toHaveText('42 passed');
  await head.focus();
  await page.keyboard.press('Enter');
  await expect(head).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Space');
  await expect(head).toHaveAttribute('aria-expanded', 'true');
  expect(await page.locator('#r1').evaluate((el) => getComputedStyle(el).borderLeftColor)).toBe('rgb(12, 192, 203)');
});

test('loose rows draw a dashed faint bar and the ◌ sigil; unknown statuses become warn', async ({ page }) => {
  await expect(page.locator('#r2 [part="sigil"]')).toHaveText('◌');
  const style = await page.locator('#r2').evaluate((el) => [getComputedStyle(el).borderLeftStyle, getComputedStyle(el).borderLeftColor]);
  expect(style).toEqual(['dashed', 'rgb(58, 62, 65)']);
  await expect(page.locator('#r3')).toHaveAttribute('status', 'warn');
});

test('deny rows flare on connect and at glitch 2 the label decodes', async ({ page }) => {
  const flared = await page.evaluate(() => {
    const row = document.createElement('gs-row');
    row.setAttribute('status', 'deny');
    row.setAttribute('label', 'blocked');
    document.body.append(row);
    return row.classList.contains('gs-flare');
  });
  expect(flared).toBe(true);
  await page.evaluate(() => {
    document.documentElement.dataset.glitch = '2';
    const row = document.createElement('gs-row');
    row.id = 'r4';
    row.setAttribute('status', 'bypass');
    row.setAttribute('label', 'through');
    document.body.append(row);
  });
  await expect(page.locator('#r4 [part="label"] gs-decode')).toHaveText('through');
});

test('the deny flare flashes opacity on the row\'s ::after and nothing else', async ({ page }) => {
  const flare = await page.evaluate(() => {
    const row = document.createElement('gs-row');
    row.setAttribute('status', 'deny');
    row.setAttribute('label', 'blocked');
    document.body.append(row);
    return row.getAnimations({ subtree: true }).map((a) => ({
      name: a.animationName,
      pseudo: a.effect.pseudoElement,
      props: [...new Set(a.effect.getKeyframes().flatMap((f) => Object.keys(f)))].filter((k) => ['offset', 'computedOffset', 'easing', 'composite'].includes(k) === false).sort(),
    }));
  });
  expect(flare).toEqual([{ name: 'gs-event-flare', pseudo: '::after', props: ['opacity'] }]);
});

test('containers carry the strong dither and the core copy unless given their own', async ({ page }) => {
  for (const id of ['empty', 'error', 'splash']) await expect(page.locator(`#${id}`)).toHaveClass(/gs-dither-strong/);
  await expect(page.locator('#empty gs-decode[part="copy"]')).toHaveText('nothing here yet. run something and the feed will wake up');
  await expect(page.locator('#error gs-decode[part="copy"]')).toHaveText('that failed. check the path and try once');
  await expect(page.locator('#splash [part="copy"]')).toHaveText('custom line');
  await expect(page.locator('#splash gs-decode')).toHaveCount(0);
});

test('wallpaper tiles the registered sprite and steps at 4fps at glitch 1', async ({ page }) => {
  await page.waitForSelector('#wp gs-mosaic[data-drawn]');
  const grid = await page.evaluate(() => document.querySelector('#wp gs-mosaic').grid);
  expect(grid.length).toBe(3);
  expect(grid[0].length).toBe(9);
  const step0 = Number(await page.locator('#wp').getAttribute('data-step'));
  await page.waitForTimeout(600);
  const step1 = Number(await page.locator('#wp').getAttribute('data-step'));
  expect(step1).toBeGreaterThanOrEqual(step0 + 2);
});

test('wallpaper outside the three containers throws GsWallpaperPlacementError', async ({ page }) => {
  const [err] = await Promise.all([
    page.waitForEvent('pageerror'),
    page.evaluate(() => {
      const wp = document.createElement('gs-wallpaper');
      wp.setAttribute('sprite', 'checks');
      document.getElementById('panel').append(wp);
    }),
  ]);
  expect(err.name).toBe('GsWallpaperPlacementError');
  expect(err.message).toContain('gs-wallpaper mounts only inside');
  expect(await page.locator('#panel gs-wallpaper gs-mosaic').count()).toBe(0);
});

test.describe('reduced motion', () => {
  // reducedMotion is only reachable through contextOptions (or page.emulateMedia) in
  // playwright, not a top-level use() option in any version, so it goes through the
  // generic contextOptions escape hatch here
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('wallpaper does not step and deny rows do not flare', async ({ page }) => {
    await page.waitForSelector('#wp gs-mosaic[data-drawn]');
    await page.waitForTimeout(600);
    expect(await page.locator('#wp').getAttribute('data-step')).toBe('0');
    const flared = await page.evaluate(() => {
      const row = document.createElement('gs-row');
      row.setAttribute('status', 'deny');
      document.body.append(row);
      return row.classList.contains('gs-flare');
    });
    expect(flared).toBe(false);
  });
});
