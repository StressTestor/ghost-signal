import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTokens, toCss, validateMotion, wholeFrames, SPATIAL_MOTION, GsTokenError } from '../../scripts/lib/tokens.js';

test('loadTokens returns both themes with the same keys', async () => {
  const t = await loadTokens();
  assert.deepEqual(Object.keys(t.color.dark), Object.keys(t.color.light));
  assert.equal(t.color.dark.accent, '#0ec224');
  assert.equal(t.color.light.accent, '#08701a');
  assert.equal(t.contrast.minimum, 4.5);
});

test('toCss emits :root dark, a light block and a reduced-motion block', async () => {
  const css = toCss(await loadTokens());
  assert.match(css, /^:root \{/m);
  assert.match(css, /--gs-color-void: #050505;/);
  assert.match(css, /:root\[data-theme="light"\] \{[^}]*--gs-color-void: #f2f4f5;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /data-app/);
});

test('toCss emits every token group with the gs- prefix', async () => {
  const css = toCss(await loadTokens());
  for (const name of [
    '--gs-font-display', '--gs-font-mono', '--gs-size-label', '--gs-tracking-label',
    '--gs-space-1', '--gs-space-6', '--gs-radius-pill', '--gs-border', '--gs-bar',
    '--gs-motion-sprite', '--gs-motion-decode', '--gs-motion-ambient-min', '--gs-motion-ambient-max',
    '--gs-step-decode', '--gs-ease-hover',
  ]) assert.match(css, new RegExp(`${name}: `), name);
  assert.match(css, /--gs-border: 1px solid var\(--gs-color-hairline\);/);
});

test('status aliases point at their tokens and skip same-name statuses', async () => {
  const css = toCss(await loadTokens());
  assert.match(css, /--gs-color-idle: var\(--gs-color-text-faint\);/);
  assert.match(css, /--gs-color-working: var\(--gs-color-accent\);/);
  assert.match(css, /--gs-color-crash: var\(--gs-color-bypass\);/);
  assert.doesNotMatch(css, /--gs-color-ok: var\(--gs-color-ok\)/);
});

test('reduced motion zeroes every motion token and forces glitch 0', async () => {
  const t = await loadTokens();
  const css = toCss(t);
  const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  for (const name of Object.keys(t.motion)) assert.match(block, new RegExp(`--gs-motion-${name}: 0ms;`));
  assert.match(block, /--gs-glitch-forced: 0;/);
  assert.doesNotMatch(css.slice(0, css.indexOf('@media')), /--gs-glitch-forced/);
});

test('generated css carries no timestamp', async () => {
  const css = toCss(await loadTokens());
  assert.doesNotMatch(css, /20\d\d-\d\d-\d\d/);
});

const SPATIAL = { enter: '167ms', exit: '100ms', view: '183ms', shift: '200ms', indicator: '117ms', value: '233ms' };

test('the six spatial durations are emitted, whole frames at 60hz, and zeroed under reduced motion', async () => {
  const t = await loadTokens();
  const css = toCss(t);
  const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  for (const [k, v] of Object.entries(SPATIAL)) {
    assert.equal(t.motion[k], v, k);
    assert.match(css, new RegExp(`--gs-motion-${k}: ${v};`));
    assert.match(block, new RegExp(`--gs-motion-${k}: 0ms;`));
  }
  assert.deepEqual([...SPATIAL_MOTION], Object.keys(SPATIAL));
  for (const k of SPATIAL_MOTION) assert.ok(wholeFrames(parseFloat(t.motion[k])), k);
});

test('the hover pair stays emitted and inert: 0ms, ease-out', async () => {
  const t = await loadTokens();
  const css = toCss(t);
  assert.equal(t.motion.hover, '0ms');
  assert.match(css, /--gs-motion-hover: 0ms;/);
  assert.match(css, /--gs-ease-hover: ease-out;/);
});

test('the house curve for enter and move, accelerate out for exit, and no curve overshoots', async () => {
  const t = await loadTokens();
  assert.equal(t.ease.enter, 'cubic-bezier(0.16, 1, 0.3, 1)');
  assert.equal(t.ease.move, 'cubic-bezier(0.16, 1, 0.3, 1)');
  assert.equal(t.ease.exit, 'cubic-bezier(0.4, 0, 1, 1)');
  for (const [k, v] of Object.entries(t.ease)) {
    const m = /^cubic-bezier\(([^)]*)\)$/.exec(v);
    if (m === null) continue;
    const [, y1, , y2] = m[1].split(',').map(Number);
    assert.ok(y1 >= 0 && y1 <= 1 && y2 >= 0 && y2 <= 1, `${k} overshoots`);
  }
});

test('distance tokens are emitted and the feel budgets never reach css', async () => {
  const css = toCss(await loadTokens());
  assert.match(css, /--gs-distance-enter: 8px;/);
  assert.match(css, /--gs-distance-toast: 24px;/);
  assert.match(css, /--gs-distance-view: 16px;/);
  assert.doesNotMatch(css, /--gs-feel|--gs-frame|vsyncMiss/);
});

test('validateMotion rejects each bad shape and names it', () => {
  const ok = { motion: { enter: '167ms' }, step: { glitch: 'steps(3)' }, ease: { enter: 'cubic-bezier(0.16, 1, 0.3, 1)', hover: 'ease-out' } };
  assert.doesNotThrow(() => validateMotion(ok));
  assert.doesNotThrow(() => validateMotion({}));
  const bad = (patch, pattern) => assert.throws(() => validateMotion({ ...ok, ...patch }), (e) => e instanceof GsTokenError && pattern.test(e.message), pattern.source);
  bad({ ease: { enter: 'steps(4)' } }, /ease\.enter is stepped/);
  bad({ step: { glitch: 'ease-in' } }, /step\.glitch must be steps\(<int>\)/);
  bad({ step: { enter: 'steps(3)' }, ease: { enter: 'ease-out' } }, /enter is in both step and ease/);
  bad({ ease: { enter: 'cubic-bezier(0.3, 1.4, 0.6, 1)' } }, /ease\.enter overshoots/);
  bad({ motion: { shift: '190ms' } }, /motion\.shift is 190ms, not a whole number of frames/);
  assert.doesNotThrow(() => validateMotion({ ...ok, step: { hover: 'steps(2)' }, ease: { hover: 'ease-out' } }));
});

test('loadTokens refuses a tokens file with a bad motion token', async () => {
  await assert.rejects(loadTokens(new URL('./fixtures/tokens-bad-motion.json', import.meta.url)), /motion\.enter is 160ms/);
});
