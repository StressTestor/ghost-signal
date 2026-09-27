import { test as base } from '@playwright/test';
import { withFeel } from '../../src/feel/playwright.js';

// the real scenario (spec 9.4): the gallery driven the way a person drives it, at every glitch
// level and theme that changes what moves
const test = withFeel(base);

const FLIPPING = [
  { name: 'g1-dark', glitch: '1', theme: 'dark', set: 'full' },
  { name: 'g2-dark', glitch: '2', theme: 'dark', set: 'full' },
  { name: 'g1-light', glitch: '1', theme: 'light', media: { colorScheme: 'light' }, set: 'light' },
];
const STILL = [
  { name: 'calm', glitch: '0', theme: 'dark', mode: 'calm', set: 'motion' },
  { name: 'still', glitch: '0', theme: 'dark', mode: 'still', media: { reducedMotion: 'reduce' }, set: 'motion' },
];

// plan decision d1 (2026-09-27): a whole-page theme or glitch flip restyles ~3700 elements in one
// frame, 10.7 to 17ms of style recalc on the m5 with nothing traced, and the same flip lands at 6ms
// in one session and 21ms in the next. the frames still print in every report, a flip over two
// vsync intervals fails anyway, and a flip that fit the budget prints a notice. "used" pools over
// the matrix by step name, so the flip steps are named for the flip, never the level: g1-dark's
// and g2-dark's same line of the walk, and light's dark to light, share a name
const FLIP = { frame: false, why: 'a whole-page theme or glitch flip restyles ~3700 elements in one frame (plan d1, accepted by joe)' };

async function walk(page, s, m) {
  const click = (sel) => () => page.locator(sel).first().click();
  for (const st of ['ok', 'deny', 'bypass', 'crash']) await s.input(`toast ${st}`, click(`[data-toast-pick="${st}"]`));
  await s.input('dismiss the oldest sticky toast', click('#toasts [part="ok"]'));
  await s.input('dismiss the next sticky toast', click('#toasts [part="ok"]'));
  await s.input('status bypass, 8 faces at once', click('[data-status-pick="bypass"]'));
  await s.input('status ok', click('[data-status-pick="ok"]'));
  if (m.set === 'light') {
    await s.input('theme dark', click('[data-theme-pick="dark"]'), FLIP);
    await s.input('theme light', click('[data-theme-pick="light"]'), FLIP);
    return;
  }
  await s.input('open a row drawer by click', click('#row-list gs-row[status="ok"] [part="head"]'));
  await s.input('close it by enter', () => page.keyboard.press('Enter'));
  await s.input('open the palette', () => page.keyboard.press('Control+k'));
  await s.input('filter the palette', () => page.keyboard.type('the'));
  await s.input('arrow down', () => page.keyboard.press('ArrowDown'));
  await s.input('close the palette', () => page.keyboard.press('Escape'));
  await s.input('open the window', click('#open-window'));
  await s.input('close the window', click('#window-no'));
  await s.input('view two', click('#motion-tabs [data-view="1"]'));
  await s.input('view three', click('#motion-tabs [data-view="2"]'));
  if (m.set === 'motion') return;
  const other = m.glitch === '2' ? '1' : '2';
  await s.input('theme light', click('[data-theme-pick="light"]'), FLIP);
  await s.input('theme dark', click('[data-theme-pick="dark"]'), FLIP);
  await s.input('glitch the other level', click(`[data-glitch-pick="${other}"]`), FLIP);
  await s.input('glitch back', click(`[data-glitch-pick="${m.glitch}"]`), FLIP);
  await s.scroll('wheel through the 300-row list', async () => {
    await page.locator('#motion-list').hover();
    await page.mouse.wheel(0, 1200);
  });
  await s.event('five toasts from the bridge', () => page.evaluate(() => window.gallery.burst(5)));
  await s.idle('toasts expire and restack', 4300);
}

function scenario(page, feel, matrix) {
  return feel.scenario('gallery', {
    matrix,
    setup: async (m) => {
      await page.goto(`/gallery/?glitch=${m.glitch}&theme=${m.theme}`);
      await page.waitForSelector('html[data-gallery-ready]');
      await page.evaluate(() => window.GS.seed(1));
    },
    steps: (s, m) => walk(page, s, m),
  });
}

// the three entries that flip share one scenario() call, so the frame exemption pools over them.
// they share one clock too: 5 minutes an entry
test('gallery g1-dark, g2-dark and g1-light', async ({ page, feel }) => {
  test.setTimeout(FLIPPING.length * 5 * 60_000);
  await scenario(page, feel, FLIPPING);
});

// calm and reduced motion never flip, so each keeps its own test and its own clock
for (const m of STILL) {
  test(`gallery ${m.name}`, async ({ page, feel }) => {
    test.setTimeout(5 * 60_000);
    await scenario(page, feel, [m]);
  });
}
