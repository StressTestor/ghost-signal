import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GsFeelConfigError, parseDuration, loadBudgets, mergeBudgets, isVsyncMiss, worstInteraction,
  isUnpromptedShift, animatedProperties, familyOf, isStepped,
} from '../../src/feel/budgets.js';

const LOOSEN = /budgets can only tighten\. declare an exemption on the step instead/;

test('the feel group loads from tokens.json with durations in ms', () => {
  assert.deepEqual({ ...loadBudgets() }, {
    frame: 16.7, vsyncMiss: 1.5, input: 50, task: 50, answer: 50, shift: 0, settle: 1000, runs: 3, properties: ['transform', 'opacity'],
  });
  assert.ok(Object.isFrozen(loadBudgets()));
});

test('a tokens file with no feel group is a config error', () => {
  assert.throws(() => loadBudgets(new URL('./fixtures/feel/no-feel-tokens.json', import.meta.url)), GsFeelConfigError);
});

test('parseDuration reads ms and s and rejects anything else', () => {
  assert.equal(parseDuration('16.7ms'), 16.7);
  assert.equal(parseDuration('1s'), 1000);
  assert.equal(parseDuration(8), 8);
  assert.throws(() => parseDuration('fast'), GsFeelConfigError);
});

test('a tighter override wins', () => {
  const b = mergeBudgets(loadBudgets(), { frame: '8ms', input: 40, properties: ['transform'] });
  assert.equal(b.frame, 8);
  assert.equal(b.input, 40);
  assert.deepEqual([...b.properties], ['transform']);
  assert.equal(b.task, 50);
});

test('a looser override throws, whatever the key', () => {
  const base = loadBudgets();
  for (const o of [{ input: '60ms' }, { frame: 20 }, { shift: 0.1 }, { vsyncMiss: 2 }, { settle: '2s' }, { properties: ['transform', 'opacity', 'width'] }]) {
    assert.throws(() => mergeBudgets(base, o), (e) => e instanceof GsFeelConfigError && LOOSEN.test(e.message), JSON.stringify(o));
  }
});

test('unknown keys and runs are config errors, not silent', () => {
  assert.throws(() => mergeBudgets(loadBudgets(), { fps: 60 }), /unknown budget "fps"/);
  assert.throws(() => mergeBudgets(loadBudgets(), { runs: 1 }), /GS_FEEL_RUNS=1/);
});

test('a vsync miss is a gap past 1.5 intervals', () => {
  assert.equal(isVsyncMiss(25, 16.7, 1.5), false);
  assert.equal(isVsyncMiss(25.1, 16.7, 1.5), true);
  assert.equal(isVsyncMiss(12.6, 8.33, 1.5), true);
});

test('worstInteraction takes the longest entry per interaction id and ignores id 0', () => {
  const e = (interactionId, name, duration) => ({ interactionId, name, duration, startTime: 0, processingStart: 0, processingEnd: 0 });
  assert.equal(worstInteraction([]), null);
  assert.equal(worstInteraction([e(0, 'pointermove', 200)]), null);
  const w = worstInteraction([e(3, 'pointerdown', 48), e(3, 'click', 56), e(4, 'keydown', 40), e(0, 'pointermove', 400)]);
  assert.deepEqual([w.interactionId, w.name, w.duration], [3, 'click', 56]);
  const tie = worstInteraction([
    { interactionId: 7, name: 'pointerdown', duration: 112, startTime: 0, processingStart: 0, processingEnd: 0.3 },
    { interactionId: 7, name: 'click', duration: 112, startTime: 1, processingStart: 1, processingEnd: 81 },
  ]);
  assert.equal(tie.name, 'click', 'on a tie the entry that did the work wins');
});

test('an unprompted shift has no recent input, a value over the limit, and a source nobody allowed', () => {
  const src = (allowedBy) => ({ path: 'div#list', allowedBy, previousRect: {}, currentRect: {} });
  assert.equal(isUnpromptedShift({ hadRecentInput: false, value: 0.01, sources: [src(null)] }, 0), true);
  assert.equal(isUnpromptedShift({ hadRecentInput: true, value: 0.01, sources: [src(null)] }, 0), false);
  assert.equal(isUnpromptedShift({ hadRecentInput: false, value: 0, sources: [src(null)] }, 0), false);
  assert.equal(isUnpromptedShift({ hadRecentInput: false, value: 0.01, sources: [src('#feed')] }, 0), false);
  assert.equal(isUnpromptedShift({ hadRecentInput: false, value: 0.01, sources: [src('#feed'), src(null)] }, 0), true);
  assert.equal(isUnpromptedShift({ hadRecentInput: false, value: 0.01, sources: [] }, 0), true);
});

test('animatedProperties drops keyframe bookkeeping keys', () => {
  assert.deepEqual(animatedProperties({ properties: ['transform', 'offset', 'computed-offset', 'easing', 'composite', 'opacity'] }), ['transform', 'opacity']);
});

test('familyOf: -event- is signal, -spatial-, transitions and gs-move:* are space, the rest unclassified', () => {
  assert.equal(familyOf({ kind: 'css-animation', name: 'gs-event-glitch-shift', id: '' }), 'signal');
  assert.equal(familyOf({ kind: 'css-animation', name: 'sn-spatial-edge', id: '' }), 'space');
  assert.equal(familyOf({ kind: 'css-transition', name: 'transform', id: '' }), 'space');
  assert.equal(familyOf({ kind: 'web-animation', name: '', id: 'gs-move:enter' }), 'space');
  assert.equal(familyOf({ kind: 'web-animation', name: '', id: 'sn-event-poke' }), 'signal');
  assert.equal(familyOf({ kind: 'web-animation', name: '', id: '' }), 'unclassified');
  assert.equal(familyOf({ kind: 'css-animation', name: 'gs-glitch-shift', id: '' }), 'unclassified');
});

test('isStepped looks for a steps() easing', () => {
  assert.equal(isStepped(['steps(3)']), true);
  assert.equal(isStepped(['steps(6, end)']), true);
  assert.equal(isStepped(['cubic-bezier(0.16, 1, 0.3, 1)']), false);
  assert.equal(isStepped([]), false);
});
