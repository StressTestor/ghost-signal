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

test('every branch of a selector list carries the gate on :root, and a negated gate is no gate', async () => {
  assert.deepEqual(await lint('ungated-list.css'), [
    'ungated-list.css: ungated event: .poke-too runs sn-event-poke outside :root[data-glitch="1"] or "2"',
  ]);
  const ev = 'animation: sn-event-poke 180ms steps(3) 1;';
  assert.deepEqual(rulesOf(lintMotion(`.p, :root[data-glitch="1"] .q { ${ev} }`, 'i.css')), ['ungated event']);
  assert.deepEqual(rulesOf(lintMotion(`:root:not([data-glitch="1"]) .p { ${ev} }`, 'i.css')), ['ungated event']);
  assert.deepEqual(rulesOf(lintMotion(`.p[data-glitch="1"] { ${ev} }`, 'i.css')), ['ungated event']);
  assert.deepEqual(lintMotion(`:root[data-glitch='1'] .p, :root[data-theme="dark"][data-glitch="2"] .p { ${ev} }`, 'i.css'), []);
  assert.deepEqual(lintMotion(`:root:not(.x)[data-glitch="1"] .p { ${ev} }`, 'i.css'), []);
});

test('each animation in a list is judged by its own timing', () => {
  assert.deepEqual(rulesOf(lintMotion(':root[data-glitch="1"] .a { animation: sn-event-poke 180ms ease-out 1, sn-spatial-slide 200ms steps(2) 1; }', 'i.css')), ['event eased', 'spatial stepped']);
  assert.deepEqual(lintMotion(':root[data-glitch="1"] .a { animation: sn-event-poke 180ms steps(3) 1, sn-spatial-slide 200ms ease-out 1; }', 'i.css'), []);
});

test('the timing longhand is paired with the name longhand, and the later declaration wins', async () => {
  assert.deepEqual(rulesOf(await lint('event-longhand.css')), ['event eased']);
  assert.deepEqual(rulesOf(await lint('spatial-longhand.css')), ['spatial stepped']);
  const g = ':root[data-glitch="1"] .a';
  assert.deepEqual(lintMotion(`${g} { animation-name: sn-event-poke, sn-spatial-slide; animation-timing-function: steps(3), ease-out; }`, 'i.css'), []);
  assert.deepEqual(rulesOf(lintMotion(`${g} { animation: sn-event-poke 180ms steps(3) 1; animation-timing-function: ease-out; }`, 'i.css')), ['event eased']);
  assert.deepEqual(lintMotion(`${g} { animation-timing-function: ease-out; animation: sn-event-poke 180ms steps(3) 1; }`, 'i.css'), []);
  // a name with no timing in the same rule may take its timing from another rule: not judged here
  assert.deepEqual(lintMotion(`${g} { animation-name: sn-event-poke; }`, 'i.css'), []);
});

test('a timing inside a keyframe block is judged by the keyframes family, except on the last keyframe', async () => {
  assert.deepEqual(await lint('event-mixed.css'), [
    'event-mixed.css: event eased: @keyframes sn-event-mixed eases a step with ease-out',
  ]);
  assert.deepEqual(rulesOf(lintMotion('@keyframes sn-spatial-x { 0% { transform: none; animation-timing-function: steps(2); } 100% { transform: translateX(4px); } }', 'i.css')), ['spatial stepped']);
  assert.deepEqual(lintMotion('@keyframes sn-event-x { 0% { transform: none; animation-timing-function: step-end; } to { transform: translateX(4px); animation-timing-function: ease; } }', 'i.css'), []);
});

test('step-end and step-start are stepped', () => {
  assert.deepEqual(lintMotion(':root[data-glitch="1"] .p { animation: sn-event-poke 200ms step-end 1; }', 'i.css'), []);
  assert.deepEqual(rulesOf(lintMotion('.b { transition: transform 200ms step-end; }', 'i.css')), ['spatial stepped']);
  assert.deepEqual(rulesOf(lintMotion('.b { transition: opacity 200ms; transition-timing-function: step-start; }', 'i.css')), ['spatial stepped']);
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
