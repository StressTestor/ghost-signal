import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTokens } from '../../scripts/lib/tokens.js';
import { hexToRgb, luminance, ratio, checkTokens, scanCss } from '../../scripts/lib/contrast.js';

test('luminance and ratio match the wcag reference points', () => {
  assert.deepEqual(hexToRgb('#ff5c4d'), [255, 92, 77]);
  assert.equal(luminance('#000000'), 0);
  assert.equal(luminance('#ffffff'), 1);
  assert.equal(ratio('#000000', '#ffffff'), 21);
  assert.equal(ratio('#ffffff', '#000000'), 21);
  assert.ok(Math.abs(ratio('#eef1f2', '#050505') - 17.9) < 0.2);
  assert.throws(() => hexToRgb('#fff'), /6 hex digits/);
});

test('checkTokens passes the shipped tokens in both themes', async () => {
  assert.deepEqual(checkTokens(await loadTokens()), []);
});

test('checkTokens reports an injected failure with its ratio', async () => {
  const t = await loadTokens();
  t.color.light.warn = '#c8b070';
  const failures = checkTokens(t);
  assert.equal(failures.length, 3);
  assert.deepEqual(failures.map((f) => f.bg), ['void', 'surface', 'raised']);
  assert.equal(failures[0].theme, 'light');
  assert.equal(failures[0].fg, 'warn');
  assert.ok(failures[0].ratio < 4.5);
});

test('scanCss flags neverText tokens used as color', async () => {
  const t = await loadTokens();
  const css = '.a { color: var(--gs-color-text-faint); }\n.b { color: var(--gs-color-text); }';
  const out = scanCss(css, t);
  assert.equal(out.length, 1);
  assert.equal(out[0].selector, '.a');
  assert.equal(out[0].token, 'text-faint');
});

test('scanCss flags text not allowed on a raised background', async () => {
  const t = await loadTokens();
  const bad = '.x { background-color: var(--gs-color-raised); color: var(--gs-color-deny); }';
  const good = '.y { background: var(--gs-color-raised); color: var(--gs-color-text); }';
  assert.equal(scanCss(bad, t).length, 1);
  assert.equal(scanCss(bad, t)[0].reason, 'not allowed as text on raised');
  assert.deepEqual(scanCss(good, t), []);
});

test('scanCss sees rules nested in @media and skips @font-face', async () => {
  const t = await loadTokens();
  const css = '@font-face { font-family: "Doto"; }\n@media (hover: hover) { .z { color: var(--gs-color-etch); } }';
  const out = scanCss(css, t);
  assert.equal(out.length, 1);
  assert.equal(out[0].selector, '.z');
});

test('scanCss refuses a sheet whose braces do not balance, naming the file', async () => {
  const t = await loadTokens();
  // a brace in an unquoted url() closes .z early; reading on would check half the sheet
  const css = '.z { background: url(a}b.png); color: var(--gs-color-etch); }';
  assert.throws(() => scanCss(css, t, 'src/fx.css'), { code: 'ERR_CSS_UNBALANCED', message: /src\/fx\.css line 1: a '}' that closes nothing/ });
});
