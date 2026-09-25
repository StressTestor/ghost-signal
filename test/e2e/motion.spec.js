import { test, expect } from '@playwright/test';

const BOOK = ['offset', 'computedOffset', 'easing', 'composite'];

test.beforeEach(async ({ page }) => {
  await page.goto('/test/e2e/pages/motion.html');
  await page.waitForFunction(() => window.ready === true);
});

test('enter moves only transform and opacity, tagged gs-move:enter, on the house curve', async ({ page }) => {
  const r = await page.evaluate((book) => {
    const box = document.getElementById('box');
    window.motion.enter(box, { from: 'above' });
    return box.getAnimations().map((a) => ({
      id: a.id,
      easing: a.effect.getTiming().easing,
      duration: a.effect.getTiming().duration,
      props: [...new Set(a.effect.getKeyframes().flatMap((f) => Object.keys(f)))].filter((k) => book.includes(k) === false).sort(),
      first: a.effect.getKeyframes()[0].transform,
    }));
  }, BOOK);
  expect(r).toEqual([{ id: 'gs-move:enter', easing: 'cubic-bezier(0.16, 1, 0.3, 1)', duration: 167, props: ['opacity', 'transform'], first: 'translate(0px, -8px)' }]);
});

test('exit resolves true at its end and leaves nothing running', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const box = document.getElementById('box');
    const t0 = performance.now();
    const done = await window.motion.exit(box, { to: 'above' });
    return { done, ms: performance.now() - t0, left: box.getAnimations().length };
  });
  expect(r.done).toBe(true);
  expect(r.ms).toBeGreaterThanOrEqual(95);
  expect(r.left).toBe(0);
});

test('an enter during an exit turns around from where the box is, never from the start', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const box = document.getElementById('box');
    const { enter, exit } = window.motion;
    const series = (ms, during) => new Promise((resolve) => {
      const out = [];
      const t0 = performance.now();
      during();
      const f = () => {
        out.push({ t: performance.now(), o: Number(getComputedStyle(box).opacity) });
        if (performance.now() - t0 < ms) requestAnimationFrame(f);
        else resolve(out);
      };
      requestAnimationFrame(f);
    });
    const fresh = await series(300, () => enter(box, { from: 'above' }));
    let turnAt = 0;
    const turned = await series(400, () => {
      exit(box, { to: 'above' });
      setTimeout(() => { turnAt = performance.now(); enter(box, { from: 'above' }); }, 50);
    });
    return { fresh, turned, turnAt };
  });
  const steps = (xs) => xs.slice(1).map((v, i) => Math.abs(v.o - xs[i].o));
  const before = r.turned.filter((s) => s.t <= r.turnAt);
  const after = r.turned.filter((s) => s.t > r.turnAt);
  expect(before.length).toBeGreaterThan(0);
  const exitStep = Math.max(0, ...steps(before));
  expect(Math.min(...after.map((s) => s.o))).toBeGreaterThanOrEqual(before.at(-1).o - exitStep - 0.01);
  expect(Math.max(...steps(r.turned))).toBeLessThanOrEqual(Math.max(...steps(r.fresh)) + 0.01);
  expect(r.turned.at(-1).o).toBe(1);
});

test('glitch 0 kills signal, never space: enter still moves at glitch 0', async ({ page }) => {
  const n = await page.evaluate(() => {
    document.documentElement.dataset.glitch = '0';
    const box = document.getElementById('box');
    window.motion.enterView(box, 'right');
    return box.getAnimations().map((a) => a.id);
  });
  expect(n).toEqual(['gs-move:view']);
});

test('data-gs-still stops a toast slot transition, on the toast or on the slot', async ({ page }) => {
  const r = await page.evaluate(() => {
    document.body.insertAdjacentHTML('beforeend', `
      <gs-toast><div part="slot" id="moving"></div></gs-toast>
      <gs-toast data-gs-still><div part="slot" id="still-toast"></div></gs-toast>
      <gs-toast><div part="slot" id="still-slot" data-gs-still></div></gs-toast>`);
    const read = (id) => getComputedStyle(document.getElementById(id)).transitionProperty;
    return { moving: read('moving'), stillToast: read('still-toast'), stillSlot: read('still-slot') };
  });
  expect(r).toEqual({ moving: 'transform', stillToast: 'none', stillSlot: 'none' });
});

test('without motion.css every helper cuts', async ({ page }) => {
  const r = await page.evaluate(async () => {
    document.querySelector('link[href$="motion.css"]').remove();
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const box = document.getElementById('box');
    const done = await window.motion.enter(box);
    return { allowed: window.motion.motionAllowed(), done, anims: box.getAnimations().length };
  });
  expect(r).toEqual({ allowed: false, done: true, anims: 0 });
});

test.describe('reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('every helper resolves at once and document.getAnimations() stays empty', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const box = document.getElementById('box');
      const results = [await window.motion.enter(box), await window.motion.exit(box), await window.motion.enterView(box, 'right')];
      const root = getComputedStyle(document.documentElement);
      return { results, anims: document.getAnimations().length, space: root.getPropertyValue('--gs-space').trim(), enter: root.getPropertyValue('--gs-motion-enter').trim() };
    });
    expect(r).toEqual({ results: [true, true, true], anims: 0, space: '', enter: '0ms' });
  });
});

test('flip: rows pushed down by an insert start where they were, move by transform on the house curve, and shift nothing', async ({ page }) => {
  const r = await page.evaluate(async (book) => {
    const t0 = performance.now();
    const shifts = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.startTime > t0) shifts.push(e.value); }).observe({ type: 'layout-shift', buffered: true });
    const list = document.getElementById('list');
    const rows = [...list.children];
    const top0 = rows[0].getBoundingClientRect().top;
    const done = window.motion.flip(rows, () => {
      list.prepend(Object.assign(document.createElement('div'), { className: 'row', textContent: 'new' }));
    });
    const topNow = rows[0].getBoundingClientRect().top;
    const anims = rows[0].getAnimations().map((a) => ({
      id: a.id,
      easing: a.effect.getTiming().easing,
      duration: a.effect.getTiming().duration,
      props: [...new Set(a.effect.getKeyframes().flatMap((f) => Object.keys(f)))].filter((k) => book.includes(k) === false).sort(),
    }));
    const ok = await done;
    return { shifts, held: Math.abs(topNow - top0), anims, ok, moved: rows[0].getBoundingClientRect().top - top0 };
  }, BOOK);
  expect(r.held).toBeLessThan(1);
  expect(r.anims).toEqual([{ id: 'gs-move:flip', easing: 'cubic-bezier(0.16, 1, 0.3, 1)', duration: 200, props: ['transform'] }]);
  expect(r.ok).toBe(true);
  expect(r.moved).toBeCloseTo(28, 0);
  expect(r.shifts).toEqual([]);
});

// mutate's return is the rebuilt target list only when it's an iterable object that isn't a node.
// insertBefore hands back the node it moved, an assignment arrow hands back a string, and a form is
// a node that iterates its own controls
for (const what of ['a node', 'a string', 'a form']) {
  test(`flip: a mutate that returns ${what} still animates the targets it was given`, async ({ page }) => {
    const r = await page.evaluate(async (kind) => {
      const list = document.getElementById('list');
      const rows = [...list.children];
      const row = Object.assign(document.createElement('div'), { className: 'row', textContent: 'new' });
      const form = Object.assign(document.createElement('form'), { className: 'row' });
      const mutate = {
        'a node': () => list.insertBefore(row, list.firstChild),
        'a string': () => { list.prepend(row); return 'moved'; },
        'a form': () => list.insertBefore(form, list.firstChild),
      }[kind];
      let thrown = null;
      let done = null;
      try { done = window.motion.flip(rows, mutate); } catch (e) { thrown = String(e); }
      const ids = rows[0].getAnimations().map((a) => a.id);
      return { thrown, ids, ok: done === null ? null : await done };
    }, what);
    expect(r).toEqual({ thrown: null, ids: ['gs-move:flip'], ok: true });
  });
}

test('drawer: playing over a row mid flip takes the flip over from where the row is, with no jump', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const yOf = (el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42;
    const list = document.getElementById('list');
    const rows = [...list.children];
    window.motion.flip(rows, () => list.prepend(Object.assign(document.createElement('div'), { className: 'row', textContent: 'new' })));
    // seeked, not waited on: 50ms into the flip on any runner, however late a timer would fire
    for (const el of rows) for (const a of el.getAnimations()) a.currentTime = 50;
    const d = window.motion.drawer({ height: 28 });
    const before = yOf(rows[1]);
    const done = d.play({ inner: rows[0], followers: rows.slice(1), open: true, from: 0.9 });
    const after = yOf(rows[1]);
    const ids = rows[1].getAnimations().map((a) => a.id);
    const ok = await done;
    return { before, after, ids, ok, end: yOf(rows[1]), left: rows.flatMap((el) => el.getAnimations()).length };
  });
  // a fresh drawer from 0.9 starts at -(1 - 0.9) * 28 = -2.8. the flip's offset rides on top of it
  expect(r.before).toBeLessThan(-3);
  expect(r.after).toBeCloseTo(r.before - 2.8, 0);
  expect(r.ids).toEqual(['gs-move:drawer']);
  expect(r.ok).toBe(true);
  expect(r.end).toBe(0);
  expect(r.left).toBe(0);
});

test('drawer: adopting rebuilt nodes mid flip keeps each one where it is', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const yOf = (el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42;
    const [a, b, c, e] = [...document.getElementById('list').children];
    const d = window.motion.drawer({ height: 28 });
    d.play({ inner: null, followers: [a, b], open: true, from: 0 });
    // seeked, not waited on, so a busy runner can't let the drawer land first
    for (const el of [a, b]) for (const x of el.getAnimations()) x.currentTime = 60;
    // c and e stand in for the rebuilt a and b. c is mid flip when the drawer adopts it
    window.motion.flip([c], () => { c.style.marginTop = '20px'; });
    for (const x of c.getAnimations()) x.currentTime = 16;
    const drawerAt = yOf(a);
    const cBefore = yOf(c);
    const eBefore = yOf(e);
    d.adopt({ inner: null, followers: [c, e] });
    const cAfter = yOf(c);
    const eAfter = yOf(e);
    const ids = c.getAnimations().map((x) => x.id);
    const ok = await d.finished;
    return { drawerAt, cBefore, eBefore, cAfter, eAfter, ids, ok, left: [a, b, c, e].flatMap((el) => el.getAnimations()).length, cEnd: yOf(c) };
  });
  expect(r.drawerAt).toBeLessThan(-1);
  expect(r.cBefore).toBeLessThan(-3);
  expect(r.eBefore).toBe(0);
  expect(r.eAfter).toBeCloseTo(r.drawerAt, 0);
  expect(r.cAfter).toBeCloseTo(r.drawerAt + r.cBefore, 0);
  expect(r.ids).toEqual(['gs-move:drawer']);
  expect(r.ok).toBe(true);
  expect(r.left).toBe(0);
  expect(r.cEnd).toBe(0);
});

test('drawer: a helper that cancels one of its moves still leaves nothing attached once the rest land', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const rows = [...document.getElementById('list').children];
    const d = window.motion.drawer({ height: 28 });
    d.play({ inner: rows[0], followers: [rows[1], rows[2]], open: false, from: 1 });
    for (const el of rows.slice(0, 3)) for (const a of el.getAnimations()) a.currentTime = 50;
    // flip's sweep cancels any gs-move:* on its targets, the drawer's included, and plays the row home
    // from where the drawer left it
    window.motion.flip([rows[1]], () => {});
    const settled = await Promise.race([d.finished.then((v) => ({ v })), new Promise((res) => setTimeout(() => res('hung'), 2000))]);
    const ids = rows.slice(0, 3).map((el) => el.getAnimations().map((a) => a.id));
    return { settled, running: d.running, progress: d.progress, ids, inner: getComputedStyle(rows[0]).transform };
  });
  expect(r.settled).toEqual({ v: false });
  expect(r.running).toBe(false);
  expect(r.progress).toBe(0);
  expect(r.ids.map((xs) => xs.filter((id) => id === 'gs-move:drawer'))).toEqual([[], [], []]);
  expect(r.inner).toBe('none');
});
