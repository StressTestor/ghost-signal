import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAYER4, bayerThreshold, imageToGrid, textToGrid, fnv1a, GsMosaic } from '../../src/components/mosaic.js';

test('the module imports in node and exports the class', () => {
  assert.equal(typeof GsMosaic, 'function');
  assert.equal(BAYER4.length, 4);
  assert.deepEqual(BAYER4[0], [0, 8, 2, 10]);
});

test('bayerThreshold is ordered: brighter values light more cells, black lights none, white lights all', () => {
  const count = (v) => {
    let n = 0;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (bayerThreshold(v, x, y)) n++;
    return n;
  };
  assert.equal(count(0), 0);
  assert.equal(count(1), 16);
  assert.equal(count(0.5), 8);
  assert.ok(count(0.25) < count(0.75));
  assert.equal(bayerThreshold(0.6, 4, 4), bayerThreshold(0.6, 0, 0));
});

test('imageToGrid samples cell centers so a 1:1 image maps exactly', () => {
  const w = 2;
  const h = 2;
  const px = new Uint8ClampedArray([
    255, 255, 255, 255, 0, 0, 0, 255,
    0, 0, 0, 255, 255, 255, 255, 255,
  ]);
  assert.deepEqual(imageToGrid(px, w, h, 2, 2), ['#.', '.#']);
  assert.deepEqual(imageToGrid(px, w, h, 4, 4), ['##..', '##..', '..##', '..##']);
});

test('imageToGrid treats transparent pixels as dark', () => {
  const px = new Uint8ClampedArray([255, 255, 255, 0]);
  assert.deepEqual(imageToGrid(px, 1, 1, 1, 1), ['.']);
});

test('textToGrid lights every non-space character and pads or crops to the grid', () => {
  assert.deepEqual(textToGrid('ab\n c', 3, 3), ['##.', '.#.', '...']);
  assert.deepEqual(textToGrid('abcdef', 3, 1), ['###']);
});

test('fnv1a is the 32-bit fnv-1a of the bytes as 8 hex digits', () => {
  const bytes = (str) => new TextEncoder().encode(str);
  assert.equal(fnv1a(bytes('')), '811c9dc5');
  assert.equal(fnv1a(bytes('a')), 'e40c292c');
  assert.equal(fnv1a(bytes('foobar')), 'bf9cf968');
  assert.equal(fnv1a(new Uint8ClampedArray([0, 0, 0, 0])), fnv1a(new Uint8Array(4)));
});
