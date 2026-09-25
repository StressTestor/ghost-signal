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

test('drawer: moves on the house curve, and a helper that takes one node over still lets the run land true with nothing attached', async ({ page }) => {
  const r = await page.evaluate(async (book) => {
    const rows = [...document.getElementById('list').children];
    const d = window.motion.drawer({ height: 28 });
    d.play({ inner: rows[0], followers: [rows[1], rows[2]], open: false, from: 1 });
    const cls = [rows[0], rows[1]].map((el) => el.getAnimations().map((a) => ({
      id: a.id,
      easing: a.effect.getTiming().easing,
      duration: a.effect.getTiming().duration,
      props: [...new Set(a.effect.getKeyframes().flatMap((f) => Object.keys(f)))].filter((k) => book.includes(k) === false).sort(),
    })));
    for (const el of rows.slice(0, 3)) for (const a of el.getAnimations()) a.currentTime = 50;
    // flip's sweep cancels any gs-move:* on its targets, the drawer's included, and plays the row home
    // from where the drawer left it. that takes one node over; it doesn't supersede the drawer
    window.motion.flip([rows[1]], () => {});
    const settled = await Promise.race([d.finished.then((v) => ({ v })), new Promise((res) => setTimeout(() => res('hung'), 2000))]);
    const ids = rows.slice(0, 3).map((el) => el.getAnimations().map((a) => a.id));
    return { cls, settled, running: d.running, progress: d.progress, ids, inner: getComputedStyle(rows[0]).transform };
  }, BOOK);
  const move = [{ id: 'gs-move:drawer', easing: 'cubic-bezier(0.16, 1, 0.3, 1)', duration: 200, props: ['transform'] }];
  expect(r.cls).toEqual([move, move]);
  expect(r.settled).toEqual({ v: true });
  expect(r.running).toBe(false);
  expect(r.progress).toBe(0);
  expect(r.ids.map((xs) => xs.filter((id) => id === 'gs-move:drawer'))).toEqual([[], [], []]);
  expect(r.inner).toBe('none');
});

test('drawer: a reverse supersedes the play, so the play resolves false and the reverse true', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const rows = [...document.getElementById('list').children];
    const d = window.motion.drawer({ height: 28 });
    const first = d.play({ inner: rows[0], followers: [rows[1]], open: true, from: 0 });
    for (const el of rows.slice(0, 2)) for (const a of el.getAnimations()) a.currentTime = 40;
    const second = d.reverse();
    return { first: await first, second: await second, left: rows.flatMap((el) => el.getAnimations()).length };
  });
  expect(r).toEqual({ first: false, second: true, left: 0 });
});

test('drawer: adopting after a helper took one node over keeps the drawer clock', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const yOf = (el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42;
    const [a, b, c, e] = [...document.getElementById('list').children];
    const d = window.motion.drawer({ height: 28 });
    d.play({ inner: null, followers: [a, b], open: true, from: 0 });
    for (const el of [a, b]) for (const x of el.getAnimations()) x.currentTime = 100;
    const bBefore = yOf(b);
    // flip takes a over: the drawer's first move is cancelled, its clock reads null from here on
    window.motion.flip([a], () => {});
    d.adopt({ inner: null, followers: [c, e] });
    const drawerAt = e.getAnimations().filter((x) => x.id === 'gs-move:drawer').map((x) => x.currentTime);
    return { bBefore, cAfter: yOf(c), eAfter: yOf(e), drawerAt };
  });
  expect(r.bBefore).toBeLessThan(-0.3);
  expect(r.eAfter).toBeCloseTo(r.bBefore, 1);
  expect(r.cAfter).toBeCloseTo(r.bBefore, 1);
  expect(r.drawerAt).toHaveLength(1);
  expect(r.drawerAt[0]).toBeCloseTo(100, 0);
});

test('drawer: a reverse after a helper took the first follower over turns around from the drawer clock, with no jump', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const topOf = (el) => el.getBoundingClientRect().top;
    const rows = [...document.getElementById('list').children];
    const [inner, f0, f1] = rows;
    const d = window.motion.drawer({ height: 28 });
    d.play({ inner, followers: [f0, f1], open: true, from: 0 });
    for (const el of rows.slice(0, 3)) for (const a of el.getAnimations()) a.currentTime = 40;
    window.motion.flip([f0], () => {});
    for (const a of f0.getAnimations()) a.currentTime = 150;
    const progress = d.progress;
    const before = { inner: topOf(inner), f1: topOf(f1) };
    // the caller's layout flip before a reverse to closed: the drawer leaves the flow, the rows
    // below it move up by its height in layout
    inner.style.position = 'absolute';
    d.reverse();
    return { progress, before, after: { inner: topOf(inner), f1: topOf(f1) } };
  });
  // 40ms into 200 on the move curve the drawer is 3/4 open, whatever f0's own flip reads
  expect(r.progress).toBeGreaterThan(0.6);
  expect(r.progress).toBeLessThan(0.9);
  expect(r.after.inner).toBeCloseTo(r.before.inner, 0);
  expect(r.after.f1).toBeCloseTo(r.before.f1, 0);
});

test('flip: a keyed rebuild that adopts the drawer inside mutate starts every fresh row where the old one was, on one move', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const list = document.getElementById('list');
    const box = document.getElementById('box');
    const rows = [...list.children];
    for (const el of rows) el.dataset.key = el.textContent;
    const d = window.motion.drawer({ height: 28 });
    // the inner isn't a row, so flip never touches it and the drawer is still live inside mutate
    d.play({ inner: box, followers: rows.slice(1), open: true, from: 0 });
    for (const el of [box, ...rows]) for (const a of el.getAnimations()) a.currentTime = 40;
    const was = rows.map((el) => el.getBoundingClientRect().top);
    let fresh = [];
    window.motion.flip(rows, () => {
      fresh = rows.map((el) => Object.assign(document.createElement('div'), { className: 'row', textContent: el.textContent }));
      for (const el of fresh) el.dataset.key = el.textContent;
      list.replaceChildren(Object.assign(document.createElement('div'), { className: 'row', textContent: 'new' }), ...fresh);
      d.adopt({ inner: box, followers: fresh.slice(1) });
      return fresh;
    }, { key: (el) => el.dataset.key });
    const now = fresh.map((el) => el.getBoundingClientRect().top);
    const ids = fresh.map((el) => el.getAnimations().map((a) => a.id));
    return { was, now, ids, offset: was[1] - was[0] - 28 };
  });
  // the followers were mid drawer, a few px above their layout slot
  expect(r.offset).toBeLessThan(-3);
  for (const [i, top] of r.now.entries()) expect(top).toBeCloseTo(r.was[i], 0);
  expect(r.ids).toEqual([['gs-move:flip'], ['gs-move:flip'], ['gs-move:flip'], ['gs-move:flip']]);
});
// seance flips live rows by added * ROW_H, so a row the drawer took over can carry a row-sized
// offset. `plain` pins the drawer's own curve after the call: a residue read against the wrong
// part, direction or height moves both rows by the same amount, and only the plain one shows it
const CARRY = [
  { op: 'reverse', plainAt: (p) => p * 28 },
  { op: 'play closed', plainAt: (p) => p * 28 },
  { op: 'play taller', plainAt: (p) => -(1 - p) * 56 },
  { op: 'reverse twice', plainAt: (p) => -(1 - p) * 28 },
];
for (const { op, plainAt } of CARRY) {
  test(`drawer: a ${op} over a live run keeps the offset a row still carries from a flip it took over`, async ({ page }) => {
    const r = await page.evaluate(async (op) => {
      const yOf = (el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42;
      const rows = [...document.getElementById('list').children];
      const [, plain, carried] = rows;
      const followers = [plain, carried];
      window.motion.flip([carried], () => { carried.style.marginTop = '84px'; });
      for (const a of carried.getAnimations()) a.currentTime = 16;
      const d = window.motion.drawer({ height: 28 });
      d.play({ inner: null, followers, open: true, from: 0 });
      for (const el of rows) for (const a of el.getAnimations()) a.currentTime = 40;
      // the second reverse reads the residue off a closing run
      if (op === 'reverse twice') {
        d.reverse();
        for (const el of rows) for (const a of el.getAnimations()) a.currentTime = 20;
      }
      const p = d.progress;
      const before = yOf(carried) - yOf(plain);
      if (op === 'play closed') d.play({ inner: null, followers, open: false });
      else if (op === 'play taller') d.play({ inner: null, followers, open: true, height: 56 });
      else d.reverse();
      const after = yOf(carried) - yOf(plain);
      const plainY = yOf(plain);
      const ids = carried.getAnimations().map((a) => a.id);
      const ok = await d.finished;
      return { p, before, after, plainY, ids, ok, left: rows.flatMap((el) => el.getAnimations()).length };
    }, op);
    // the flip's offset is still riding the drawer at the call, well over a pixel
    expect(r.before).toBeLessThan(-3);
    expect(Math.abs(r.after - r.before)).toBeLessThan(0.5);
    expect(Math.abs(r.plainY - plainAt(r.p))).toBeLessThan(0.5);
    expect(r.ids).toEqual(['gs-move:drawer']);
    expect(r.ok).toBe(true);
    expect(r.left).toBe(0);
  });
}

test('the indicator lands on the current tab without sliding in, then slides by transition', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const tabs = document.getElementById('tabs');
    window.motion.indicator(tabs);
    const bar = tabs.querySelector('[part="indicator"]');
    const [a, , c] = tabs.querySelectorAll('button');
    const first = { anims: bar.getAnimations().length, transform: bar.style.transform, want: `translateX(${a.offsetLeft}px) scaleX(${a.offsetWidth / 100})` };
    a.removeAttribute('aria-current');
    c.setAttribute('aria-current', 'page');
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const moving = bar.getAnimations().map((x) => ({ kind: x.constructor.name, property: x.transitionProperty }));
    return { first, moving, hiddenAttr: bar.hidden, axis: bar.dataset.axis };
  });
  expect(r.first.anims).toBe(0);
  expect(r.first.transform).toBe(r.first.want);
  expect(r.moving).toEqual([{ kind: 'CSSTransition', property: 'transform' }]);
  expect(r.hiddenAttr).toBe(false);
  expect(r.axis).toBe('x');
});

test('the indicator retargets mid slide from where it is, with no jump', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const tabs = document.getElementById('tabs');
    window.motion.indicator(tabs);
    const bar = tabs.querySelector('[part="indicator"]');
    const [a, b, c] = tabs.querySelectorAll('button');
    const x = () => new DOMMatrixReadOnly(getComputedStyle(bar).transform).m41;
    const pick = (el) => {
      for (const t of [a, b, c]) t.removeAttribute('aria-current');
      el.setAttribute('aria-current', 'page');
    };
    const series = (ms) => new Promise((resolve) => {
      const out = [];
      const t0 = performance.now();
      const f = () => {
        out.push({ t: performance.now(), x: x() });
        if (performance.now() - t0 < ms) requestAnimationFrame(f);
        else resolve(out);
      };
      requestAnimationFrame(f);
    });
    // the reference covers the same 56px the retarget does. an a to c reference has a first frame
    // of about 70px, which is bigger than any cut between neighbours, so it would wave a cut through
    pick(b);
    const fresh = await series(250);
    pick(a);
    await series(250);
    pick(c);
    // 30ms into a 117ms slide the bar sits 65 to 90% of the way to c, by frame alignment. 50ms sat
    // at 95%, 5px short of c, where one slow frame turns the retarget into a fresh c to b slide
    let start = NaN;
    let turnAt = Infinity;
    setTimeout(() => {
      start = x();
      turnAt = performance.now();
      pick(b);
    }, 30);
    const turned = await series(300);
    return { fresh, turned, start, turnAt, a: a.offsetLeft, b: b.offsetLeft, c: c.offsetLeft };
  });
  const steps = (xs) => xs.slice(1).map((v, i) => Math.abs(v.x - xs[i].x));
  const after = r.turned.filter((s) => s.t >= r.turnAt);
  const before = r.turned.filter((s) => s.t < r.turnAt);
  // the turn happened mid slide, from where the bar was
  expect(r.start).toBeGreaterThan(r.a);
  expect(r.start).toBeLessThan(r.c);
  // no jump across the turn: every step from the last frame before it is within a fresh run's steepest
  expect(Math.max(...steps([...before.slice(-1), ...after]))).toBeLessThanOrEqual(Math.max(...steps(r.fresh)) + 2);
  // and it travelled: a cut lands on b the next frame with nothing in between
  const lo = Math.min(r.start, r.b);
  const hi = Math.max(r.start, r.b);
  expect(after.filter((s) => s.x > lo && s.x < hi).length).toBeGreaterThanOrEqual(2);
  expect(r.turned.at(-1).x).toBeCloseTo(r.b, 0);
});

test('the indicator follows a tab that changes size while the container keeps its size', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const tabs = document.getElementById('tabs');
    window.motion.indicator(tabs);
    const bar = tabs.querySelector('[part="indicator"]');
    const [a, b] = tabs.querySelectorAll('button');
    a.removeAttribute('aria-current');
    b.setAttribute('aria-current', 'page');
    const want = () => `translateX(${b.offsetLeft}px) scaleX(${b.offsetWidth / 100})`;
    const settle = () => new Promise((resolve) => {
      const t0 = performance.now();
      const f = () => {
        if (bar.style.transform === want() || performance.now() - t0 > 500) resolve();
        else requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    });
    await settle();
    // observe() queues one first notification, delivered on the next frame or so. a resize before
    // it lands gets placed by that notification whether anything watches the tab or not
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(res))));
    const before = { w: tabs.offsetWidth, h: tabs.offsetHeight, transform: bar.style.transform };
    a.style.paddingLeft = '60px'; // a class flip or a count badge on an earlier tab does the same
    await settle();
    const grown = { w: tabs.offsetWidth, h: tabs.offsetHeight, transform: bar.style.transform, want: want() };
    // a tab added later is watched too, not only the ones there at mount
    const added = document.createElement('button');
    added.textContent = 'new';
    tabs.insertBefore(added, b);
    await settle();
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(res))));
    const inserted = bar.style.transform;
    added.style.paddingLeft = '40px';
    await settle();
    return {
      before,
      grown,
      inserted,
      late: { w: tabs.offsetWidth, h: tabs.offsetHeight, transform: bar.style.transform, want: want() },
    };
  });
  expect({ w: r.grown.w, h: r.grown.h }).toEqual({ w: r.before.w, h: r.before.h });
  expect(r.grown.transform).not.toBe(r.before.transform);
  expect(r.grown.transform).toBe(r.grown.want);
  expect({ w: r.late.w, h: r.late.h }).toEqual({ w: r.before.w, h: r.before.h });
  expect(r.late.transform).not.toBe(r.inserted);
  expect(r.late.transform).toBe(r.late.want);
});

test('the indicator lands without sliding in when the current tab had no size at mount', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const tabs = document.getElementById('tabs');
    const [a] = tabs.querySelectorAll('button');
    // a display: none tab, or a custom element that gains its size after indicator() runs
    a.style.display = 'none';
    window.motion.indicator(tabs);
    const bar = tabs.querySelector('[part="indicator"]');
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const mounted = { hidden: bar.hidden, transform: bar.style.transform };
    a.style.display = '';
    const want = () => `translateX(${a.offsetLeft}px) scaleX(${a.offsetWidth / 100})`;
    // polls on the transform, since a slide in reaches it too. the animations tell them apart
    await new Promise((resolve) => {
      const t0 = performance.now();
      const f = () => {
        if (bar.style.transform === want() || performance.now() - t0 > 500) resolve();
        else requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    });
    return {
      mounted,
      shown: { hidden: bar.hidden, transform: bar.style.transform, want: want() },
      anims: bar.getAnimations().map((x) => ({ kind: x.constructor.name, property: x.transitionProperty })),
    };
  });
  expect(r.mounted).toEqual({ hidden: true, transform: '' });
  expect(r.shown.hidden).toBe(false);
  expect(r.shown.transform).toBe(r.shown.want);
  expect(r.anims).toEqual([]);
});
