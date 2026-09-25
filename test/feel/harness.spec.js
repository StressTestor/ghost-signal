import { test as base, expect } from '@playwright/test';
import { withFeel, feelUse } from '../../src/feel/playwright.js';

// the harness's own controls. a harness that passes a planted bug is broken, and one that fails
// the clean page is measuring itself; this file is what proves it does neither (spec 9.4)
const test = withFeel(base);
const url = (name) => `/test/feel/pages/${name}.html`;

test('the clean control passes every check, steady, and every step settles', async ({ page, feel }) => {
  test.setTimeout(120_000);
  const [report] = await feel.scenario('clean', {
    setup: async () => { await page.goto(url('clean')); },
    steps: async (s) => {
      await s.input('toggle', () => page.locator('#toggle').click());
      // spec p5: a fast key press may get no event timing entry at all. the step is evaluable anyway,
      // through the probe's trusted keydown and eventCounts, and an apparatus gap here would throw
      await s.input('press t', () => page.keyboard.press('t'));
      await s.event('flip insert', () => page.evaluate(() => window.cleanInsert()));
      await s.event('toast burst', () => page.evaluate(() => window.cleanToasts(5)));
      await s.scroll('scroll the scroller', async () => {
        await page.locator('#scroller').hover();
        await page.mouse.wheel(0, 600);
      });
      await s.idle('idle', 300);
    },
  });
  expect(report.result).toBe('pass');
  expect(report.violations).toEqual([]);
  for (const run of report.runs) for (const step of run.steps) expect(step.settled, `${step.name} settled`).toBe(true);
  expect(report.runs[0].seen.animations, 'the positive control: the harness saw the flip and the toasts').toBeGreaterThan(0);
  expect(report.runs[0].detail.answers.map((a) => a.what).every((w) => w !== null), 'both input steps were answered').toBe(true);
  expect(report.env.dpr, 'the page ran at the profile dpr').toBe(feelUse.deviceScaleFactor);
});

test('feel.measure() judges one window inside a functional spec: the clean insert passes', async ({ page, feel }) => {
  test.setTimeout(60_000);
  await page.goto(url('clean'));
  await page.evaluate(() => window.__gsFeel.ready());
  const m = await feel.measure();
  await page.evaluate(() => window.cleanInsert());
  const report = await m.stop();
  expect(report.result).toBe('pass');
  expect(report.runs[0].seen.animations, 'the positive control: measure saw the flip').toBeGreaterThan(0);
});

// an unprompted 40px row above everything, landed from evaluate with no input anywhere near it
const shiftNow = (page) => page.evaluate(() => {
  const d = document.createElement('div');
  d.style.height = '40px';
  d.textContent = 'earlier';
  document.body.prepend(d);
});

test('feel.measure() judges only its own window: a shift before it armed is not its business', async ({ page, feel }) => {
  test.setTimeout(60_000);
  await page.goto(url('clean'));
  await page.evaluate(() => window.__gsFeel.ready());
  await shiftNow(page);
  await page.waitForTimeout(300);
  const m = await feel.measure();
  await page.waitForTimeout(50);
  const report = await m.stop();
  expect(report.result).toBe('pass');
  expect(report.runs[0].seen.shifts, 'the earlier shift stays out of the window').toBe(0);
});

test('feel.selfTest() sees the planted shift on a page that already shifted', async ({ page, feel }) => {
  test.setTimeout(60_000);
  await page.goto(url('clean'));
  await page.evaluate(() => window.__gsFeel.ready());
  await shiftNow(page);
  await page.waitForTimeout(700);
  const result = await feel.selfTest();
  expect(result.seen).toEqual(expect.arrayContaining(['input', 'shift', 'task']));
});

test('feel.selfTest() never credits an earlier shift for the planted one', async ({ page, feel }) => {
  test.setTimeout(60_000);
  await page.goto(url('untrusted'));
  await page.evaluate(() => window.__gsFeel.ready());
  await shiftNow(page);
  await page.waitForTimeout(700);
  // nothing left in flow, so the planted row lands and moves nothing
  await page.evaluate(() => { for (const el of [...document.body.children]) if (el.localName !== 'script') el.remove(); });
  await page.waitForTimeout(200);
  const err = await feel.selfTest().then(() => null, (e) => e);
  expect(err?.name).toBe('GsFeelUnevaluable');
  expect(err.message).toContain('missed the planted shift');
});

// a live counter: a fixed span rewritten every frame. it's a non-ambient mutation, so a step that
// holds it never goes quiet and runs to its settle timeout. left-anchored at a fixed width, it never
// moves; right-anchored, its width changes with the text and it shifts itself a hair every frame
const tickNow = (page, side) => page.evaluate((sd) => {
  const t = document.createElement('span');
  t.style.cssText = sd === 'left' ? 'position:fixed;left:8px;top:8px;width:80px;display:block' : 'position:fixed;right:0;top:0';
  document.body.append(t);
  let n = 0;
  const f = () => { t.textContent = sd === 'left' ? String(n++) : 'x'.repeat((n++ % 5) + 1); requestAnimationFrame(f); };
  requestAnimationFrame(f);
}, side);

test('feel.selfTest() sees the planted shift on a page whose steps never go quiet', async ({ page, feel }) => {
  test.setTimeout(60_000);
  await page.goto(url('clean'));
  await page.evaluate(() => window.__gsFeel.ready());
  await tickNow(page, 'left');
  await page.waitForTimeout(300);
  const result = await feel.selfTest();
  expect(result.seen).toEqual(expect.arrayContaining(['input', 'shift', 'task']));
});

test("feel.selfTest() never credits the page's own shift for the planted one", async ({ page, feel }) => {
  test.setTimeout(60_000);
  await page.goto(url('untrusted'));
  await page.evaluate(() => window.__gsFeel.ready());
  // nothing left in flow, so the planted row lands and moves nothing, while the badge shifts itself
  // on every frame, inside the window where the row lands too
  await page.evaluate(() => { for (const el of [...document.body.children]) if (el.localName !== 'script') el.remove(); });
  await tickNow(page, 'right');
  await page.waitForTimeout(300);
  const err = await feel.selfTest().then(() => null, (e) => e);
  expect(err?.name).toBe('GsFeelUnevaluable');
  expect(err.message).toContain('missed the planted shift');
});

test('the warm-up leaves focus where setup put it', async ({ page, feel }) => {
  test.setTimeout(60_000);
  const seen = [];
  await feel.scenario('focus', {
    setup: async () => {
      await page.goto(url('untrusted'));
      await page.locator('#b').focus();
    },
    steps: async (s) => {
      seen.push(await page.evaluate(() => `${document.activeElement.localName}#${document.activeElement.id}`));
      await s.idle('idle', 100);
    },
  });
  expect(seen.length, 'the warm-up run and at least one measured run').toBeGreaterThanOrEqual(2);
  for (const f of seen) expect(f, 'focus at the first step').toBe('button#b');
});

test('an input step driven by evaluate is unevaluable, never a pass', async ({ page, feel }) => {
  test.setTimeout(60_000);
  const err = await feel.scenario('untrusted', {
    setup: async () => { await page.goto(url('untrusted')); },
    steps: async (s) => { await s.input('fake click', () => page.evaluate(() => document.getElementById('b').click())); },
  }).then(() => null, (e) => e);
  expect(err?.name).toBe('GsFeelUnevaluable');
  expect(err.message).toContain('no trusted pointerdown or keydown');
});
