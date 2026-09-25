import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { loadTokens } from '../../scripts/lib/tokens.js';
import { scanCss, cssRules } from '../../scripts/lib/contrast.js';
import { lintMotion } from '../../scripts/lib/motion-lint.js';

const src = new URL('../../src/', import.meta.url);
const base = await readFile(new URL('base.css', src), 'utf8');
const fx = await readFile(new URL('fx.css', src), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

test('font-face points at the bundled doto file and nothing is fetched', async () => {
  assert.match(base, /@font-face\s*\{[^}]*font-family:\s*"Doto"/);
  assert.match(base, /src:\s*url\("\.\/fonts\/Doto-VariableFont\.woff2"\)\s*format\("woff2"\)/);
  assert.doesNotMatch(base, /https?:\/\//);
  assert.doesNotMatch((base + fx).replace(/url\("data:[^"]*"\)/g, ''), /googleapis|https?:\/\//);
  const info = await stat(new URL('fonts/Doto-VariableFont.woff2', src));
  assert.ok(info.size > 5_000);
});

test('base.css and fx.css declare no transition: hover and focus color are cuts', () => {
  assert.doesNotMatch(strip(base + fx), /(^|[\s;{])transition(-[a-z]+)?\s*:/);
});

test('base.css lints clean', () => {
  assert.deepEqual(lintMotion(base, 'src/base.css'), []);
});

test('the press is a 1px cut on buttons, row heads and palette rows', () => {
  const press = cssRules(base).find((r) => r.selector.includes('button:active:not(:disabled)'));
  assert.ok(press, 'no press rule');
  assert.match(press.selector, /gs-row \[part="head"\]:active/);
  assert.match(press.selector, /gs-palette \[part="row"\]:active/);
  assert.match(press.body, /transform:\s*translateY\(1px\)/);
});

test('no shadows, no blur, no glass', () => {
  for (const m of (base + fx).matchAll(/box-shadow:\s*([^;]+);/g)) assert.equal(m[1].trim(), 'none');
  assert.doesNotMatch(base + fx, /backdrop-filter|filter:\s*blur|blur\(/);
});

test('every animated selector in fx.css is gated on a glitch level', () => {
  const animated = cssRules(fx).filter((r) => /(^|;)\s*animation(-name)?:/.test(r.body));
  assert.ok(animated.length >= 5);
  for (const r of animated) {
    assert.ok(r.selector.includes('[data-glitch="1"]') || r.selector.includes('[data-glitch="2"]'), r.selector);
  }
});

test('base.css has no animation at all', () => {
  assert.doesNotMatch(base, /animation/);
});

test('the contrast scanner finds nothing in either file', async () => {
  const t = await loadTokens();
  assert.deepEqual(scanCss(base, t), []);
  assert.deepEqual(scanCss(fx, t), []);
});

test('text-shadow is confined to the glitch-2 hover chroma split, with no blur radius', () => {
  const hasTextShadow = (r) => /(^|;)\s*text-shadow:/.test(r.body);
  assert.equal(cssRules(base).filter(hasTextShadow).length, 0);
  const shadowRules = cssRules(fx).filter(hasTextShadow);
  assert.ok(shadowRules.length >= 1);
  for (const r of shadowRules) {
    assert.match(r.selector, /\[data-glitch="2"\]/, r.selector);
    const decl = r.body.match(/text-shadow:\s*([^;]+);/)[1];
    for (const shadow of decl.split(',').map((s) => s.trim())) {
      const parts = shadow.split(/\s+/);
      assert.equal(parts.length, 3, shadow); // offset-x offset-y color: no third length (blur radius)
    }
  }
});

test('the texture tokens live in fx.css as data uris and no hex appears outside them', () => {
  assert.match(fx, /--gs-dither:\s*url\("data:image\/svg\+xml,/);
  assert.match(fx, /--gs-dither-strong:/);
  assert.match(fx, /--gs-block-corner:\s*url\("data:image\/svg\+xml,/);
  const outsideUris = (base + fx).replace(/url\("data:[^"]*"\)/g, '');
  assert.doesNotMatch(outsideUris, /#[0-9a-f]{6}\b/i);
});
