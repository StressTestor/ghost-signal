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

test('an input step driven by evaluate is unevaluable, never a pass', async ({ page, feel }) => {
  test.setTimeout(60_000);
  const err = await feel.scenario('untrusted', {
    setup: async () => { await page.goto(url('untrusted')); },
    steps: async (s) => { await s.input('fake click', () => page.evaluate(() => document.getElementById('b').click())); },
  }).then(() => null, (e) => e);
  expect(err?.name).toBe('GsFeelUnevaluable');
  expect(err.message).toContain('no trusted pointerdown or keydown');
});
