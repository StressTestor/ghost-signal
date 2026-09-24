import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { loadTokens } from '../../scripts/lib/tokens.js';
import { scanCss, cssRules } from '../../scripts/lib/contrast.js';

const src = new URL('../../src/', import.meta.url);
const base = await readFile(new URL('base.css', src), 'utf8');
const fx = await readFile(new URL('fx.css', src), 'utf8');

test('font-face points at the bundled doto file and nothing is fetched', async () => {
  assert.match(base, /@font-face\s*\{[^}]*font-family:\s*"Doto"/);
  assert.match(base, /src:\s*url\("\.\/fonts\/Doto-VariableFont\.woff2"\)\s*format\("woff2"\)/);
  assert.doesNotMatch(base, /https?:\/\//);
  assert.doesNotMatch((base + fx).replace(/url\("data:[^"]*"\)/g, ''), /googleapis|https?:\/\//);
  const info = await stat(new URL('fonts/Doto-VariableFont.woff2', src));
  assert.ok(info.size > 5_000);
});

test('every transition eases only color, border-color and background-color with the hover tokens', () => {
  const values = [...(base + fx).matchAll(/transition:\s*([^;]+);/g)].map((m) => m[1]);
  assert.ok(values.length >= 4);
  for (const v of values) {
    for (const part of v.split(',').map((p) => p.trim())) {
      assert.match(part, /^(color|border-color|background-color) var\(--gs-motion-hover\) var\(--gs-ease-hover\)$/, part);
    }
  }
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
