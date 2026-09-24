import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const fixture = async (name) => (await readFile(new URL(`./fixtures/${name}.grid`, import.meta.url), 'utf8')).trim().split('\n');

// every spec that loads a page asserts zero page errors, so an upgrade-time throw can't hide
// behind a mosaic that renders anyway. collected per test, asserted after each one
let errors = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/test/e2e/pages/mosaic.html');
  await page.waitForSelector('gs-mosaic#e[data-drawn]');
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

test('identical grids hash identical and the hashes are pinned', async ({ page }) => {
  const a = await fixture('ref-a');
  const b = await fixture('ref-b');
  const hashes = await page.evaluate(([ra, rb]) => {
    const el = (id) => document.getElementById(id);
    el('a').grid = ra;
    el('b').grid = ra;
    el('c').grid = ra;
    el('d').grid = rb;
    return ['a', 'b', 'c', 'd'].map((id) => el(id).hash());
  }, [a, b]);
  expect(hashes[0]).toBe(hashes[1]);
  // width x height : fnv-1a of the rgba bytes. no png encoder in the loop, so the pin can't drift
  // with the browser's compression settings
  expect(hashes[0]).toMatch(/^70x70:[0-9a-f]{8}$/);
  expect(hashes[2]).not.toBe(hashes[0]);
  expect(hashes[3]).not.toBe(hashes[0]);
  expect(hashes[0]).toMatchSnapshot('mosaic-ref-a.txt');
  expect(hashes[3]).toMatchSnapshot('mosaic-ref-b.txt');
});

test('the grid attribute uses / as the row separator and re-renders on change', async ({ page }) => {
  const before = await page.locator('#e').getAttribute('data-drawn');
  const size = await page.evaluate(() => {
    const c = document.querySelector('#e canvas');
    return [c.width, c.height];
  });
  expect(size).toEqual([4 * 9 - 2, 2 * 9 - 2]);
  await page.evaluate(() => document.getElementById('e').setAttribute('grid', '####/####'));
  const after = await page.locator('#e').getAttribute('data-drawn');
  expect(Number(after)).toBeGreaterThan(Number(before));
});

test('lit cells read the accent tokens and a lit attribute overrides them', async ({ page }) => {
  const colors = await page.evaluate(() => {
    const el = document.getElementById('e');
    const ctx = el.querySelector('canvas').getContext('2d');
    const at = (x, y) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3);
    const accent = at(3, 3);
    el.setAttribute('lit', 'rgb(1, 2, 3)');
    return { accent, lit: at(3, 3) };
  });
  expect(colors.accent).toEqual([178, 252, 186]);
  expect(colors.lit).toEqual([1, 2, 3]);
});
