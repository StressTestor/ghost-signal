import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GsFeelConfigError, parseDuration, loadBudgets, mergeBudgets, isVsyncMiss, worstInteraction,
  isUnpromptedShift, animatedProperties, familyOf, isStepped, isEased,
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

// each row is what chromium 145 reported for a real animation (effect easing, then offset:easing per
// keyframe), and whether its sampled curve was stepped, eased or both. css copies the shorthand onto
// every keyframe, a transition or web animation carries it on the effect
const curve = (effectEasing, kf) => ({
  effectEasing,
  keyframes: kf.split(' ').map((k) => {
    const at = k.indexOf(':');
    return { offset: Number(k.slice(0, at)), easing: k.slice(at + 1) };
  }),
});
const CURVES = [
  ['css steps(3)', curve('linear', '0:steps(3) 1:steps(3)'), 'stepped'],
  ['css step-end', curve('linear', '0:steps(1) 1:steps(1)'), 'stepped'],
  ['css ease-out', curve('linear', '0:ease-out 1:ease-out'), 'eased'],
  ['css linear', curve('linear', '0:linear 1:linear'), 'eased'],
  ['css steps(3) then ease at 50%', curve('linear', '0:steps(3) 0.5:ease 1:linear'), 'mixed'],
  ['css steps(3) shorthand, ease-out at 50%', curve('linear', '0:steps(3) 0.5:ease-out 1:steps(3)'), 'mixed'],
  ['css steps(3) shorthand, linear at 50%', curve('linear', '0:steps(3) 0.5:linear 1:steps(3)'), 'mixed'],
  ['css ease only on the last keyframe', curve('linear', '0:steps(3) 1:ease'), 'stepped'],
  ['css steps(2) shorthand under an eased first keyframe', curve('linear', '0:ease 1:steps(2)'), 'eased'],
  ['transition step-end', curve('steps(1)', '0:linear 1:linear'), 'stepped'],
  ['transition ease-out', curve('ease-out', '0:linear 1:linear'), 'eased'],
  ['web animation, steps(3) on the effect', curve('steps(3)', '0:linear 1:linear'), 'stepped'],
  ['web animation, steps(3) on the first keyframe', curve('linear', '0:steps(3) 1:linear'), 'stepped'],
  ['web animation, linear', curve('linear', '0:linear 1:linear'), 'eased'],
  ['web animation, one keyframe', curve('linear', '1:linear'), 'eased'],
  ['web animation, steps(3) then ease at 50%', curve('linear', '0:steps(3) 0.5:ease 1:linear'), 'mixed'],
  ['web animation, ease-in over stepped keyframes', curve('ease-in', '0:steps(3) 1:steps(2)'), 'stepped'],
  ['web animation, one keyframe, steps(3) on the effect', curve('steps(3)', '1:linear'), 'stepped'],
  ['web animation, one keyframe carrying steps(3) at offset 1', curve('linear', '1:steps(3)'), 'eased'],
  ['web animation, one keyframe carrying steps(3) at offset 0', curve('linear', '0:steps(3)'), 'stepped'],
  ['web animation, first keyframe at 50%', curve('linear', '0.5:steps(3) 1:linear'), 'mixed'],
];

test('isStepped: any stepped segment, which is what fails a space animation', () => {
  for (const [label, record, truth] of CURVES) assert.equal(isStepped(record), truth !== 'eased', label);
});

test('isEased: any eased segment, which is what fails a signal animation', () => {
  for (const [label, record, truth] of CURVES) assert.equal(isEased(record), truth !== 'stepped', label);
});

test('a mixed curve is both stepped and eased, so it fails in either family', () => {
  const mixed = curve('linear', '0:steps(3) 0.5:ease 1:linear');
  assert.deepEqual([isStepped(mixed), isEased(mixed)], [true, true]);
});

test('a record without the curve fields is a bug upstream, not a pass', () => {
  const shape = /needs effectEasing and keyframes/;
  assert.throws(() => isEased({ easings: ['steps(3)'] }), shape);
  assert.throws(() => isStepped({ effectEasing: 'linear' }), shape);
  assert.throws(() => isEased({ keyframes: [{ offset: 0, easing: 'steps(3)' }] }), shape);
});
