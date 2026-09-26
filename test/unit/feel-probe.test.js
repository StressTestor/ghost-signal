import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installProbe, PROBE_VERSION } from '../../src/feel/probe.js';

test('the page-side version literal matches PROBE_VERSION', () => {
  assert.match(installProbe.toString(), new RegExp(`const VERSION = ${PROBE_VERSION};`));
});

test('installProbe returns at once when a probe is already installed', () => {
  globalThis.window = { __gsFeel: { existing: true } };
  try {
    installProbe();
    assert.deepEqual(globalThis.window.__gsFeel, { existing: true });
  } finally {
    delete globalThis.window;
  }
});

test('installProbe closes over nothing from its module', () => {
  // playwright ships the function as source text into the page, so it can't reach module scope
  assert.doesNotMatch(installProbe.toString(), /PROBE_VERSION|import\(/);
});
