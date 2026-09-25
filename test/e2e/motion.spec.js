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
