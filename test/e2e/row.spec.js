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

// the layout-shift observer can come back empty for a reason that has nothing to do with the
// drawer (a toggle in the first paint's frame records nothing, even for a hard cut), so it proves
// it can see a shift first: a control spacer that must record one, then a clean slate
async function startShiftProbe() {
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const probe = { shifts: [], obs: null };
  const drain = () => { for (const e of probe.obs.takeRecords()) probe.shifts.push(e.value); };
  probe.obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) probe.shifts.push(e.value); });
  probe.obs.observe({ type: 'layout-shift', buffered: true });
  const block = document.createElement('div');
  block.style.cssText = 'width: 200px; height: 40px; background: #888;';
  document.body.prepend(block);
  await frame();
  const spacer = document.createElement('div');
  spacer.style.height = '100px';
  block.before(spacer);
  await frame();
  drain();
  const control = probe.shifts.slice();
  spacer.remove();
  block.remove();
  await frame();
  drain();
  probe.shifts.length = 0;
  window.shiftProbe = probe;
  return { supported: PerformanceObserver.supportedEntryTypes.includes('layout-shift'), control };
}

// entries still queued when the scenario ends are read too, then the observer goes away
async function readShiftProbe() {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const probe = window.shiftProbe;
  for (const e of probe.obs.takeRecords()) probe.shifts.push(e.value);
  probe.obs.disconnect();
  return probe.shifts;
}

// r1 opened on a list that runs well past the fold, then shut `turn` ms later: settled or mid open.
// read in the task that shuts it, a row with no drawer move sits where the collapse leaves it, so
// one on screen with no move is a row that cut into view over the followers still sliding up
async function collapsePastTheFold(page, turn) {
  return page.evaluate(async (wait) => {
    const lines = Array.from({ length: 6 }, (_, i) => `line ${i + 1} of the detail`).join('\n');
    for (let i = 12; i < 42; i++) {
      const row = document.createElement('gs-row');
      row.id = `r${i}`;
      row.setAttribute('status', 'ok');
      row.setAttribute('label', `row ${i}`);
      row.setAttribute('command', 'cargo test --workspace');
      row.append(lines);
      document.body.append(row);
    }
    const row = document.getElementById('r1');
    const rows = [...document.querySelectorAll('gs-row')].slice(2);
    const top = (el) => el.getBoundingClientRect().top;
    row.toggle(true);
    await new Promise((res) => setTimeout(res, wait));
    const below = rows.filter((el) => top(el) >= innerHeight);
    row.toggle(false);
    const moves = (el) => el.getAnimations().some((a) => a.id === 'gs-move:drawer');
    const cutIn = rows.filter((el) => top(el) < innerHeight && moves(el) === false).map((el) => el.id);
    await new Promise((res) => setTimeout(res, 400));
    return { cutIn, pulledUp: below.filter((el) => top(el) < innerHeight).map((el) => el.id), expanded: row.expanded };
  }, turn);
}

test.describe('drawer motion', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test/e2e/pages/drawer.html');
    await page.waitForFunction(() => window.ready === true);
  });

  test('a drawer opened with no input records no layout shift: the rows below move by transform', async ({ page }) => {
    const live = await page.evaluate(startShiftProbe);
    expect(live.supported).toBe(true);
    expect(live.control.length).toBeGreaterThan(0);
    const r = await page.evaluate(async () => {
      // past the first paint, or a cut in the same frame records no shift either
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const row = document.getElementById('r1');
      row.toggle(true);
      const follower = document.getElementById('r2').getAnimations().map((a) => a.id);
      await new Promise((res) => setTimeout(res, 400));
      return { follower, expanded: row.expanded };
    });
    expect(r.follower).toEqual(['gs-move:drawer']);
    expect(r.expanded).toBe(true);
    expect(await page.evaluate(readShiftProbe)).toEqual([]);
  });

  test('toggling 60ms into an opening reverses from where the rows are, with no jump', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const row = document.getElementById('r1');
      const next = document.getElementById('r2');
      const top = () => next.getBoundingClientRect().top;
      const series = (ms, during) => new Promise((resolve) => {
        const out = [];
        const t0 = performance.now();
        during();
        const f = () => {
          out.push(top());
          if (performance.now() - t0 < ms) requestAnimationFrame(f);
          else resolve(out);
        };
        requestAnimationFrame(f);
      });
      const fresh = await series(350, () => row.toggle(true));
      const h = row.querySelector('[part="clip"]').offsetHeight;
      await series(350, () => row.toggle(false));
      const base = top();
      let jump = null;
      const turned = await series(450, () => {
        row.toggle(true);
        // read in the task that turns it: the reverse starts where r2 is, whatever frame it lands on
        setTimeout(() => {
          const before = top();
          row.toggle(false);
          jump = Math.abs(top() - before);
        }, 60);
      });
      return { fresh, turned, base, h, jump };
    });
    const steps = (xs) => xs.slice(1).map((v, i) => Math.abs(v - xs[i]));
    // an empty series has a max of -Infinity and passes anything
    expect(r.fresh.length).toBeGreaterThan(5);
    expect(r.turned.length).toBeGreaterThan(5);
    expect(Math.max(...steps(r.fresh))).toBeGreaterThan(0);
    expect(r.h).toBeGreaterThan(0);
    expect(r.jump).toBeLessThan(1);
    // a cut is one step the size of the drawer; a smooth reverse stays near its steepest frame, about 0.4 of it
    expect(Math.max(...steps(r.turned))).toBeLessThan(0.6 * r.h);
    expect(r.turned.at(-1)).toBeCloseTo(r.base, 0);
  });

  test('collapsing keeps the clip out of flow until the drawer is shut, then hides it', async ({ page }) => {
    await page.evaluate(() => document.getElementById('r1').toggle(true));
    await page.waitForTimeout(300);
    const during = await page.evaluate(() => {
      const row = document.getElementById('r1');
      row.toggle(false);
      const clip = row.querySelector('[part="clip"]');
      return { leaving: clip.hasAttribute('data-leaving'), position: getComputedStyle(clip).position, expanded: row.expanded };
    });
    expect(during).toEqual({ leaving: true, position: 'absolute', expanded: false });
    await expect(page.locator('#r1 [part="detail"]')).toBeHidden();
    expect(await page.locator('#r1 [part="clip"]').evaluate((el) => el.hasAttribute('data-leaving'))).toBe(false);
  });

  test('a collapse slides the rows it pulls up from below the fold instead of cutting them in', async ({ page }) => {
    const r = await collapsePastTheFold(page, 400);
    // the scenario has to reach past the fold, or an empty cut list passes on nothing
    expect(r.pulledUp.length).toBeGreaterThan(0);
    expect(r.cutIn).toEqual([]);
    expect(r.expanded).toBe(false);
  });

  test('a reverse 120ms into an opening slides the rows it pulls up from below the fold too', async ({ page }) => {
    const r = await collapsePastTheFold(page, 120);
    expect(r.pulledUp.length).toBeGreaterThan(0);
    expect(r.cutIn).toEqual([]);
    expect(r.expanded).toBe(false);
  });
});
