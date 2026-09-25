import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feelProject, feelUse } from '../../src/feel/playwright.js';

// spec 8.1: feelProject carries the isolation to consumers, so a config that runs everything else
// in parallel still runs feel specs alone, unretried and untraced
test('feelProject runs feel specs on one worker, in order, never retried', () => {
  const p = feelProject();
  assert.equal(p.name, 'feel');
  assert.equal(p.workers, 1);
  assert.equal(p.fullyParallel, false);
  assert.equal(p.retries, 0);
  assert.deepEqual(p.use, { ...feelUse });
});

test('feelProject overrides merge into use without dropping the isolation', () => {
  const p = feelProject({ testDir: 'e2e', use: { baseURL: 'http://127.0.0.1:1420' } });
  assert.equal(p.testDir, 'e2e');
  assert.equal(p.workers, 1);
  assert.equal(p.use.trace, 'off');
  assert.equal(p.use.baseURL, 'http://127.0.0.1:1420');
});
