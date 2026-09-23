import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { ICON_NAMES, buildSprite } from '../../scripts/lib/icons.js';
import { gridToSymbol, parseGrid } from '../../src/gs.js';

const iconsDir = new URL('../../src/icons/', import.meta.url);

test('the twenty icon names from the spec each have a 16x16 grid file', async () => {
  assert.equal(ICON_NAMES.length, 20);
  for (const name of ICON_NAMES) {
    const file = new URL(`${name}.grid`, iconsDir);
    await stat(file);
    const grid = parseGrid(await readFile(file, 'utf8'), 16, 16);
    assert.ok(grid.some((r) => r.includes('#')), `${name} is blank`);
  }
});

test('gridToSymbol emits one unit rect per lit cell inside a viewBox of the grid size', () => {
  const svg = gridToSymbol('x', ['#.', '.#']);
  assert.match(svg, /^<symbol id="gs-x" viewBox="0 0 2 2" shape-rendering="crispEdges">/);
  assert.equal((svg.match(/<rect /g) ?? []).length, 2);
  assert.match(svg, /<rect x="1" y="1" width="1" height="1"\/>/);
});

test('buildSprite contains a symbol for every icon and the committed sprite is current', async () => {
  const sprite = await buildSprite(iconsDir);
  for (const name of ICON_NAMES) assert.match(sprite, new RegExp(`<symbol id="gs-${name}" `), name);
  assert.equal((sprite.match(/<symbol /g) ?? []).length, ICON_NAMES.length);
  assert.match(sprite, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="0" height="0"/);
  assert.equal(await readFile(new URL('../../src/icons.svg', import.meta.url), 'utf8'), sprite);
});
