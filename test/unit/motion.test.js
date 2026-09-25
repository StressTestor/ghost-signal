import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMs, parsePx, offsetFor, retargetDuration, motionAllowed, enter, exit, enterView, flip, drawer, drawerProgress } from '../../src/motion.js';

test('motion.js imports in node, and with no document motion is off', () => {
  assert.equal(motionAllowed(), false);
});

test('parseMs and parsePx read token values', () => {
  assert.equal(parseMs('167ms'), 167);
  assert.equal(parseMs('0.2s'), 200);
  assert.equal(parseMs(''), 0);
  assert.equal(parsePx('24px'), 24);
  assert.equal(parsePx(''), 0);
});

test('offsetFor points the away position at the named side', () => {
  assert.deepEqual(offsetFor('left', 16), [-16, 0]);
  assert.deepEqual(offsetFor('right', 24), [24, 0]);
  assert.deepEqual(offsetFor('above', 8), [0, -8]);
  assert.deepEqual(offsetFor('below', 8), [0, 8]);
});

test('retargetDuration scales by the share of the trip left, never under a frame, never over the full', () => {
  assert.equal(retargetDuration(200, 1), 200);
  assert.equal(retargetDuration(200, 0.5), 100);
  assert.equal(retargetDuration(200, 0.01), 1000 / 60);
  assert.equal(retargetDuration(200, 2), 200);
  assert.equal(retargetDuration(0, 1), 0);
  assert.equal(retargetDuration(200, 0), 0);
});

test('under reduced motion every helper resolves at once, cancels what ran, and never animates', async () => {
  const saved = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  globalThis.document = { documentElement: {} };
  globalThis.matchMedia = () => ({ matches: true });
  try {
    const cancelled = [];
    const running = { id: 'gs-move:enter', cancel() { cancelled.push(this.id); } };
    const el = { getAnimations: () => [running], animate() { throw new Error('animate called under reduced motion'); } };
    assert.equal(motionAllowed(), false);
    assert.equal(await enter(el), true);
    assert.equal(await exit(el), true);
    assert.equal(await enterView(el, 'left'), true);
    assert.deepEqual(cancelled, ['gs-move:enter', 'gs-move:enter', 'gs-move:enter']);
  } finally {
    globalThis.document = saved.document;
    globalThis.matchMedia = saved.matchMedia;
    if (saved.document === undefined) delete globalThis.document;
    if (saved.matchMedia === undefined) delete globalThis.matchMedia;
  }
});

test('drawerProgress reads the open fraction from a follower, clamped to 0..1', () => {
  assert.equal(drawerProgress(-224, 224, true), 0);
  assert.equal(drawerProgress(-56, 224, true), 0.75);
  assert.equal(drawerProgress(0, 224, true), 1);
  assert.equal(drawerProgress(56, 224, false), 0.25);
  assert.equal(drawerProgress(300, 224, false), 1);
  assert.equal(drawerProgress(0, 0, true), 1);
  assert.equal(drawerProgress(0, 0, false), 0);
});

test('under reduced motion flip runs the mutation and the drawer resolves at once', async () => {
  const saved = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  globalThis.document = { documentElement: {} };
  globalThis.matchMedia = () => ({ matches: true });
  try {
    const el = { getAnimations: () => [], animate() { throw new Error('animate called under reduced motion'); } };
    let mutated = 0;
    assert.equal(await flip([el], () => { mutated += 1; }), true);
    assert.equal(mutated, 1);
    assert.equal(await flip([el], async () => { mutated += 1; return [el]; }), true);
    assert.equal(mutated, 2);
    const d = drawer({ height: 224 });
    assert.equal(await d.play({ inner: el, followers: [el], open: true }), true);
    assert.equal(d.running, false);
    assert.equal(d.progress, 1);
  } finally {
    globalThis.document = saved.document;
    globalThis.matchMedia = saved.matchMedia;
    if (saved.document === undefined) delete globalThis.document;
    if (saved.matchMedia === undefined) delete globalThis.matchMedia;
  }
});
