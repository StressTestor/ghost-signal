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

// the drawer's own clock. a starved renderer draws late, so a wall clock wait can land before a
// move has even started or after it is gone; the moves only advance when frames do. `settle` waits
// frames until no drawer move is left, `turn` seeks every drawer move to `ms` into its run once a
// frame has drawn it, and `ease` is chromium's own reading of --gs-ease-move at a fraction of the trip
function installDrawerClock() {
  const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
  const moves = () => document.getAnimations().filter((a) => a.id === 'gs-move:drawer');
  const root = getComputedStyle(document.documentElement);
  const curve = new Animation(new KeyframeEffect(null, null, { duration: 1000, easing: root.getPropertyValue('--gs-ease-move').trim(), fill: 'both' }), null);
  window.drawerClock = {
    frame,
    moves,
    shift: parseFloat(root.getPropertyValue('--gs-motion-shift')),
    async settle() {
      while (moves().length > 0) await frame();
      await frame();
    },
    async turn(ms) {
      await frame();
      for (const a of moves()) a.currentTime = ms;
    },
    ease(x) {
      curve.currentTime = Math.min(1, Math.max(0, x)) * 1000;
      return curve.effect.getComputedTiming().progress;
    },
  };
}

// r1 opened on a list that runs well past the fold, then shut once it has settled (turn null) or
// `turn` ms into the opening. read in the task that shuts it, a row with no drawer move sits where
// the collapse leaves it, so one on screen with no move is a row that cut into view over the
// followers still sliding up. mid open r2 has to sit strictly between its shut and open tops, or the
// turn landed on a drawer that was not moving
async function collapsePastTheFold(page, turn) {
  return page.evaluate(async (turn) => {
    const { settle } = window.drawerClock;
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
    const shut = top(rows[0]);
    row.toggle(true);
    const h = row.querySelector('[part="clip"]').offsetHeight;
    if (turn === null) await settle();
    else await window.drawerClock.turn(turn);
    const at = top(rows[0]);
    const below = rows.filter((el) => top(el) >= innerHeight);
    row.toggle(false);
    const moves = (el) => el.getAnimations().some((a) => a.id === 'gs-move:drawer');
    const cutIn = rows.filter((el) => top(el) < innerHeight && moves(el) === false).map((el) => el.id);
    await settle();
    return {
      cutIn,
      pulledUp: below.filter((el) => top(el) < innerHeight).map((el) => el.id),
      expanded: row.expanded,
      midway: at > shut + 1 && at < shut + h - 1,
    };
  }, turn);
}

test.describe('drawer motion', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test/e2e/pages/drawer.html');
    await page.waitForFunction(() => window.ready === true);
    await page.evaluate(installDrawerClock);
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
      await window.drawerClock.settle();
      return { follower, expanded: row.expanded };
    });
    expect(r.follower).toEqual(['gs-move:drawer']);
    expect(r.expanded).toBe(true);
    expect(await page.evaluate(readShiftProbe)).toEqual([]);
  });

  test('toggling 60ms into an opening reverses from where the rows are, with no jump', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const { frame, settle, turn, moves, shift, ease } = window.drawerClock;
      const row = document.getElementById('r1');
      const next = document.getElementById('r2');
      const top = () => next.getBoundingClientRect().top;
      // r2's top on every frame from the toggle until the drawer lets go, stamped with the frame's time
      const series = async (first) => {
        const out = [first];
        for (;;) {
          const t = await frame();
          out.push({ t, y: top() });
          if (moves().length === 0) break;
        }
        out.push({ t: await frame(), y: top() });
        return out;
      };
      const base = top();
      row.toggle(true);
      const fresh = await series({ t: document.timeline.currentTime, y: top() });
      const h = row.querySelector('[part="clip"]').offsetHeight;
      row.toggle(false);
      await settle();
      const shut = top();
      row.toggle(true);
      await turn(60);
      // read in the task that turns it: the reverse starts where r2 is
      const before = top();
      row.toggle(false);
      const after = top();
      const turned = await series({ t: document.timeline.currentTime, y: after });
      // the most a plain trip of h moves in each frame's gap, from the steepest start of the curve
      const over = (xs) => xs.slice(1).map((v, i) => Math.abs(v.y - xs[i].y) - (h * ease((v.t - xs[i].t) / shift) + 2)).filter((d) => d > 0);
      return { base, shut, h, before, jump: Math.abs(after - before), fresh: fresh.length, turned: turned.length, freshMoved: fresh.some((v) => Math.abs(v.y - base) > 1), freshOver: over(fresh), turnedOver: over(turned), end: turned.at(-1).y, shift };
    });
    // the scenario has to happen: r2 moved on the plain open, and the turn caught it mid open
    expect(r.shift).toBeGreaterThan(0);
    expect(r.h).toBeGreaterThan(0);
    expect(r.fresh).toBeGreaterThanOrEqual(3);
    expect(r.turned).toBeGreaterThanOrEqual(3);
    expect(r.freshMoved).toBe(true);
    expect(Math.abs(r.shut - r.base)).toBeLessThan(1);
    expect(r.before).toBeGreaterThan(r.base + 1);
    expect(r.before).toBeLessThan(r.base + r.h - 1);
    expect(r.jump).toBeLessThan(1);
    // a cut is one step the size of the drawer; each frame of a smooth run stays under the curve's
    // share of h for that frame's gap, dropped frames and all. the plain open is the control
    expect(r.freshOver).toEqual([]);
    expect(r.turnedOver).toEqual([]);
    expect(r.end).toBeCloseTo(r.base, 0);
  });

  test('collapsing keeps the clip out of flow until the drawer is shut, then hides it', async ({ page }) => {
    await page.evaluate(async () => {
      document.getElementById('r1').toggle(true);
      await window.drawerClock.settle();
    });
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
    const r = await collapsePastTheFold(page, null);
    // the scenario has to reach past the fold, or an empty cut list passes on nothing
    expect(r.pulledUp.length).toBeGreaterThan(0);
    expect(r.cutIn).toEqual([]);
    expect(r.expanded).toBe(false);
  });

  test('a reverse 120ms into an opening slides the rows it pulls up from below the fold too', async ({ page }) => {
    const r = await collapsePastTheFold(page, 120);
    expect(r.midway).toBe(true);
    expect(r.pulledUp.length).toBeGreaterThan(0);
    expect(r.cutIn).toEqual([]);
    expect(r.expanded).toBe(false);
  });

  // at the bottom of the page a collapse shrinks the document under the scroller, which clamps
  // scrollTop and moves every row at once. a slide there clamps twice (at the flip, and again when
  // the out of flow clip and the held follower moves let go), so it has to be the one cut reduced
  // motion makes. a wrapper whose overflow-y computes to anything but visible is a scroll container
  // that never scrolls (overflow-x: hidden turns overflow-y to auto; a rounded card clips with
  // overflow: hidden), and the document still clamps through it
  for (const wrapper of ['', 'overflow-x: hidden', 'overflow: hidden']) {
    const inside = wrapper === '' ? '' : ` (rows in a main with ${wrapper})`;
    test(`a collapse at the bottom of the scroll is one cut, the same as reduced motion${inside}`, async ({ page }) => {
      const r = await page.evaluate(async (wrapper) => {
        const { frame, settle } = window.drawerClock;
        const lines = Array.from({ length: 6 }, (_, i) => `line ${i + 1} of the detail`).join('\n');
        for (let i = 12; i < 42; i++) {
          const row = document.createElement('gs-row');
          row.id = `r${i}`;
          row.setAttribute('status', 'ok');
          row.setAttribute('label', `row ${i}`);
          row.append(lines);
          document.body.append(row);
        }
        if (wrapper !== '') {
          const main = document.createElement('main');
          main.style.cssText = wrapper;
          main.append(...document.querySelectorAll('gs-row'));
          document.body.append(main);
        }
        const overflowY = getComputedStyle(document.getElementById('r39').parentElement).overflowY;
        const row = document.getElementById('r39');
        const t = (id) => document.getElementById(id).getBoundingClientRect().top;
        row.toggle(true);
        await settle();
        scrollTo(0, document.documentElement.scrollHeight);
        await frame();
        await frame();
        const scrolled = scrollY;
        row.toggle(false);
        await frame();
        const first = { r38: t('r38'), r40: t('r40') };
        await settle();
        const settled = { r38: t('r38'), r40: t('r40') };
        return { overflowY, scrolled, clamped: scrolled - scrollY, first, settled, expanded: row.expanded };
      }, wrapper);
      // the scenario has to reach the clamp, or a still page passes on nothing; and the wrapper has
      // to really be a scroll container, or it tests the plain page twice
      expect(r.overflowY).toBe(wrapper === '' ? 'visible' : wrapper === 'overflow-x: hidden' ? 'auto' : 'hidden');
      expect(r.scrolled).toBeGreaterThan(0);
      expect(r.clamped).toBeGreaterThan(0);
      expect(r.expanded).toBe(false);
      expect(Math.abs(r.first.r38 - r.settled.r38)).toBeLessThan(1);
      expect(Math.abs(r.first.r40 - r.settled.r40)).toBeLessThan(1);
    });
  }

  // the clamp can be in any scroller between the row and the page: a fixed-height one at its own
  // bottom clamps while the page above it has room to spare
  test('a collapse at the bottom of a nested scroller is one cut too', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const { frame, settle } = window.drawerClock;
      const lines = Array.from({ length: 6 }, (_, i) => `line ${i + 1} of the detail`).join('\n');
      const box = document.createElement('div');
      box.style.cssText = 'height: 400px; overflow-y: auto;';
      box.append(...document.querySelectorAll('gs-row'));
      for (let i = 12; i < 42; i++) {
        const row = document.createElement('gs-row');
        row.id = `r${i}`;
        row.setAttribute('status', 'ok');
        row.setAttribute('label', `row ${i}`);
        row.append(lines);
        box.append(row);
      }
      const spacer = document.createElement('div');
      spacer.style.height = '1500px';
      document.body.append(box, spacer);
      const row = document.getElementById('r39');
      const t = (id) => document.getElementById(id).getBoundingClientRect().top;
      row.toggle(true);
      await settle();
      box.scrollTop = box.scrollHeight;
      await frame();
      await frame();
      const inner = box.scrollTop;
      const room = document.documentElement.scrollHeight - innerHeight - scrollY;
      const h = row.querySelector('[part="clip"]').offsetHeight;
      row.toggle(false);
      await frame();
      const first = { r38: t('r38'), r40: t('r40') };
      await settle();
      const settled = { r38: t('r38'), r40: t('r40') };
      return { inner, clamped: inner - box.scrollTop, room, h, first, settled };
    });
    // the scroller clamped and the page had room: only the nested box can call the cut
    expect(r.inner).toBeGreaterThan(0);
    expect(r.clamped).toBeGreaterThan(0);
    expect(r.room).toBeGreaterThan(r.h);
    expect(Math.abs(r.first.r38 - r.settled.r38)).toBeLessThan(1);
    expect(Math.abs(r.first.r40 - r.settled.r40)).toBeLessThan(1);
  });

  // the other side of the clamp: a fixed-height scroller with room keeps its own height when a row
  // inside it collapses, so the document never shrinks and nothing clamps, even with the page at its
  // bottom. predicting the clamp from the page's room would cut this; it has to slide
  test('a collapse inside a scroller with room still slides with the page at its bottom', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const { frame, settle } = window.drawerClock;
      const lines = Array.from({ length: 6 }, (_, i) => `line ${i + 1} of the detail`).join('\n');
      const spacer = document.createElement('div');
      spacer.style.height = '1500px';
      const box = document.createElement('div');
      box.style.cssText = 'height: 400px; overflow-y: auto;';
      box.append(...document.querySelectorAll('gs-row'));
      for (let i = 12; i < 42; i++) {
        const row = document.createElement('gs-row');
        row.id = `r${i}`;
        row.setAttribute('status', 'ok');
        row.setAttribute('label', `row ${i}`);
        row.append(lines);
        box.append(row);
      }
      document.body.append(spacer, box);
      const row = document.getElementById('r20');
      const t = (id) => document.getElementById(id).getBoundingClientRect().top;
      row.toggle(true);
      await settle();
      box.scrollTop = row.offsetTop - box.offsetTop;
      scrollTo(0, document.documentElement.scrollHeight);
      await frame();
      await frame();
      const page = { y: scrollY, room: document.documentElement.scrollHeight - innerHeight - scrollY };
      const inner = { y: box.scrollTop, room: box.scrollHeight - box.clientHeight - box.scrollTop };
      const h = row.querySelector('[part="clip"]').offsetHeight;
      const before = t('r21');
      row.toggle(false);
      const follower = document.getElementById('r21').getAnimations().map((a) => a.id);
      await frame();
      const first = t('r21');
      await settle();
      return { page, inner, h, before, first, settled: t('r21'), pageAfter: scrollY, innerAfter: box.scrollTop, follower };
    });
    // the page sits at its bottom and the scroller has more room than the drawer is tall
    expect(r.page.y).toBeGreaterThan(0);
    expect(r.page.room).toBeLessThan(1);
    expect(r.inner.y).toBeGreaterThan(0);
    expect(r.inner.room).toBeGreaterThan(r.h);
    expect(r.pageAfter).toBe(r.page.y);
    expect(r.innerAfter).toBe(r.inner.y);
    expect(r.follower).toEqual(['gs-move:drawer']);
    // r21 climbs the drawer's height, and on the first frame it is still on its way
    expect(r.before - r.settled).toBeCloseTo(r.h, 0);
    expect(r.first).toBeGreaterThan(r.settled + 1);
  });
});
