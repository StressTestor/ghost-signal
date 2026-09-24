import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextFrame, GsFace } from '../../src/components/face.js';

test('the module imports in node', () => {
  assert.equal(typeof GsFace, 'function');
});

test('nextFrame maps ok to idle and blinks only on idle and ok', () => {
  assert.equal(nextFrame('idle'), 'idle');
  assert.equal(nextFrame('ok'), 'idle');
  assert.equal(nextFrame('idle', { blinking: true }), 'blink');
  assert.equal(nextFrame('ok', { blinking: true }), 'blink');
  assert.equal(nextFrame('deny', { blinking: true }), 'deny');
  for (const s of ['working', 'warn', 'deny', 'bypass', 'crash']) assert.equal(nextFrame(s), s);
});

test('nextFrame coerces unknown statuses to warn', (t) => {
  const err = t.mock.method(console, 'error', () => {});
  assert.equal(nextFrame('haunted'), 'warn');
  assert.equal(err.mock.callCount(), 1);
});
