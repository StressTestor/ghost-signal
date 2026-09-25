import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { lintMotion } from '../../scripts/lib/motion-lint.js';
import { cssRules } from '../../scripts/lib/contrast.js';

const run = promisify(execFile);
const dir = fileURLToPath(new URL('./fixtures/motion-lint/', import.meta.url));
const bin = fileURLToPath(new URL('../../scripts/ghost-signal.js', import.meta.url));
const lint = async (name) => lintMotion(await readFile(`${dir}${name}`, 'utf8'), name);
const rulesOf = (findings) => findings.map((f) => f.split(': ')[1]);

test('cssRules records the enclosing at-rules of each block', () => {
  const rules = cssRules('@media (x) { @supports (y) { .a { color: red; } } } @keyframes k { from { opacity: 0; } }');
  assert.deepEqual(rules.map((r) => [r.selector, r.parents]), [['.a', ['@media (x)', '@supports (y)']], ['from', ['@keyframes k']]]);
});

test('each rule fires on its own fixture and nothing else fires', async () => {
  assert.deepEqual(rulesOf(await lint('keyframe-left.css')), ['keyframe property', 'keyframe property']);
  assert.deepEqual(rulesOf(await lint('transition-all.css')), ['transition property']);
  assert.deepEqual(rulesOf(await lint('event-eased.css')), ['event eased']);
  assert.deepEqual(rulesOf(await lint('spatial-stepped.css')), ['spatial stepped', 'spatial stepped']);
  assert.deepEqual(rulesOf(await lint('ungated-event.css')), ['ungated event']);
  assert.deepEqual(rulesOf(await lint('unclassified.css')), ['unclassified keyframes']);
  assert.deepEqual(await lint('clean.css'), []);
});

test('a literal cubic-bezier in a transition list is one value, not four', () => {
  assert.deepEqual(lintMotion('.a { transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1), opacity 100ms cubic-bezier(0.4, 0, 1, 1); }', 'inline.css'), []);
});

test('a finding names the file, the rule and the culprit', async () => {
  assert.deepEqual(await lint('keyframe-left.css'), [
    'keyframe-left.css: keyframe property: @keyframes sn-spatial-slide animates left',
    'keyframe-left.css: keyframe property: @keyframes sn-spatial-slide animates left',
  ]);
  assert.deepEqual(await lint('transition-all.css'), ['transition-all.css: transition property: .card transitions all']);
});

test('the cli exits 1 with findings, 0 and silent when clean, 2 when nothing matched', async () => {
  const bad = await run(process.execPath, [bin, 'lint-motion', `${dir}event-eased.css`]).catch((e) => e);
  assert.equal(bad.code, 1);
  assert.match(bad.stdout, /event eased: :root\[data-glitch="1"\] \.poke runs sn-event-poke without steps\(\)/);
  const good = await run(process.execPath, [bin, 'lint-motion', `${dir}clean.css`]);
  assert.equal(good.stdout, '');
  const globbed = await run(process.execPath, [bin, 'lint-motion', `${dir}clean*.css`]);
  assert.equal(globbed.stdout, '');
  const none = await run(process.execPath, [bin, 'lint-motion', `${dir}nothing-*.css`]).catch((e) => e);
  assert.equal(none.code, 2);
});
