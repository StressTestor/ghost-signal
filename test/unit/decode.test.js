import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLYPHS, scrambleFrames, GsDecode } from '../../src/components/decode.js';
import { GsTape } from '../../src/components/tape.js';
import { GS } from '../../src/gs.js';

test('both modules import in node', () => {
  assert.equal(typeof GsDecode, 'function');
  assert.equal(typeof GsTape, 'function');
  assert.doesNotMatch(GLYPHS, /\s/);
});

test('scrambleFrames settles left to right, leaves spaces alone and ends on the text', () => {
  GS.seed(1);
  const text = 'zero chill';
  const frames = scrambleFrames(text, 5, GS.random);
  assert.equal(frames.length, 5);
  assert.equal(frames.at(-1), text);
  frames.forEach((frame, f) => {
    assert.equal([...frame].length, [...text].length);
    const settled = Math.round(((f + 1) / 5) * text.length);
    assert.equal(frame.slice(0, settled), text.slice(0, settled), `frame ${f} prefix`);
    [...text].forEach((c, i) => { if (c === ' ') assert.equal(frame[i], ' '); });
  });
});

test('scrambleFrames is deterministic under the same seed and differs under another', () => {
  GS.seed(7);
  const a = scrambleFrames('ghost signal', 6, GS.random);
  GS.seed(7);
  const b = scrambleFrames('ghost signal', 6, GS.random);
  GS.seed(8);
  const c = scrambleFrames('ghost signal', 6, GS.random);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.ok(a[0] !== 'ghost signal');
});

test('scrambleFrames with fewer than two frames returns the text once', () => {
  assert.deepEqual(scrambleFrames('x', 1, GS.random), ['x']);
  assert.deepEqual(scrambleFrames('x', 0, GS.random), ['x']);
});
