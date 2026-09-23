import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTokens, toCss } from '../../scripts/lib/tokens.js';

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
