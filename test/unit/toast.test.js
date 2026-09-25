import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stackOffsets, GsToast } from '../../src/components/toast.js';

test('the module imports in node', () => {
  assert.equal(typeof GsToast, 'function');
});

test('stackOffsets: the newest slot sits at the anchor, each older one above every newer one', () => {
  assert.deepEqual(stackOffsets([], 8), []);
  assert.deepEqual(stackOffsets([40], 8), [0]);
  assert.deepEqual(stackOffsets([40, 36, 52], 8), [-(36 + 8 + 52 + 8), -(52 + 8), 0]);
});
