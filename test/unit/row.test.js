import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GsRow } from '../../src/components/row.js';
import { GsContainer, defineContainer } from '../../src/components/container.js';
import { GsEmpty } from '../../src/components/empty.js';
import { GsError } from '../../src/components/error.js';
import { GsSplash } from '../../src/components/splash.js';
import { tileGrid, GsWallpaper } from '../../src/components/wallpaper.js';

test('every module imports in node', () => {
  for (const c of [GsRow, GsContainer, GsEmpty, GsError, GsSplash, GsWallpaper]) assert.equal(typeof c, 'function');
  assert.equal(typeof defineContainer, 'function');
  assert.equal(GsEmpty.slot, 'empty');
  assert.equal(GsError.slot, 'error');
  assert.equal(GsSplash.slot, 'loading');
});

test('tileGrid repeats a sprite across the field and shifts by offset', () => {
  const sprite = ['#..', '.#.'];
  assert.deepEqual(tileGrid(sprite, 7, 3, 0), ['#..#..#', '.#..#..', '#..#..#']);
  assert.deepEqual(tileGrid(sprite, 7, 2, 1), ['..#..#.', '#..#..#']);
  assert.deepEqual(tileGrid(sprite, 3, 2, 3), sprite);
});
