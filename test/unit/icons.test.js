import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { ICON_NAMES, buildSprite, buildIconsModule } from '../../scripts/lib/icons.js';
import { gridToSymbol, parseGrid, getIcon, listIcons, injectIcons } from '../../src/gs.js';

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

test('buildIconsModule emits every core grid and the committed src/icons.js is current', async () => {
  const mod = await buildIconsModule(iconsDir);
  assert.match(mod, /^\/\/ generated from src\/icons\/\*\.grid by scripts\/gen\.js\. do not edit/);
  for (const name of ICON_NAMES) assert.match(mod, new RegExp(`^  ${name}: \\[`, 'm'), name);
  assert.equal(await readFile(new URL('../../src/icons.js', import.meta.url), 'utf8'), mod);
});

test('importing gs.js registers all twenty core icons as 16x16 grids', async () => {
  const ghost = getIcon('ghost');
  assert.equal(ghost.length, 16);
  for (const row of ghost) assert.match(row, /^[.#]{16}$/);
  assert.deepEqual(ghost, parseGrid(await readFile(new URL('ghost.grid', iconsDir), 'utf8'), 16, 16));
  for (const name of ICON_NAMES) assert.ok(listIcons().includes(name), name);
});

test('injectIcons is inert without a document', () => {
  assert.equal(injectIcons(), null);
});

test('the icon generator never loads gs.js, so it can rebuild a missing src/icons.js', async () => {
  // gs.js imports src/icons.js; a generator that went through gs.js could not recreate it
  const grid = await readFile(new URL('../../src/grid.js', import.meta.url), 'utf8');
  const lib = await readFile(new URL('../../scripts/lib/icons.js', import.meta.url), 'utf8');
  assert.doesNotMatch(grid, /^import /m);
  assert.match(lib, /from '\.\.\/\.\.\/src\/grid\.js'/);
  assert.doesNotMatch(lib, /src\/gs\.js/);
});
