import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBudgets, GsFeelUnevaluable } from '../../src/feel/budgets.js';
import { stepWindows } from '../../src/feel/trace.js';
import { evaluateRun, needsThirdRun, combineRuns, DROPS_GATE } from '../../src/feel/evaluate.js';

const B = loadBudgets();

// a run where step i spans [1000(i + 1), 1000(i + 1) + 500] ms and the trace clock is
// performance.now() in microseconds, so offsetMs is 0. a step's BeginMainThreadFrames start on its
// start mark unless it sets lead, the ms between the mark and its first one
// a run whose probe saw animations gets one clean composite record by default, the way a real trace
// always carries an Animation event per animation. the composite apparatus test passes [] on purpose
const cleanComposite = { id: '0x1', nodeName: 'div', displayName: '', compositeFailed: 0, unsupportedProperties: [], ts: 1_100_000 };
function build({ index = 1, steps = [{}], shifts = [], animations = [], overlaps = [], calm = [], events = [], loafs = [], composites = animations.length > 0 ? [cleanComposite] : [], fcp = 50, drops = [] } = {}) {
  const sampleSteps = steps.map((st, i) => {
    const start = 1000 * (i + 1);
    const kind = st.kind ?? 'event';
    const input = kind === 'input';
    return {
      index: i, name: st.name ?? `step ${i}`, kind, answerExpected: st.answerExpected ?? true, why: st.why ?? null,
      start, end: start + 500, settled: st.settled ?? true,
      frames: st.frames?.map((f) => start + f) ?? Array.from({ length: 30 }, (_, k) => start + k * 16.7),
      trusted: st.trusted ?? { pointerdown: input ? 1 : 0, keydown: 0 },
      inputAt: input ? start + 5 : null, inputType: input ? 'click' : null,
      answerAt: st.answerAt === null ? null : st.answerAt !== undefined ? start + st.answerAt : input ? start + 20 : null,
      answerWhat: 'mutation', answerCount: 1,
      countsBefore: { pointerdown: 0, keydown: 0 },
      countsAfter: st.countsAfter ?? { pointerdown: input ? 1 : 0, keydown: 0 },
    };
  });
  const marks = [];
  const frames = [];
  const tasks = [];
  sampleSteps.forEach((s, i) => {
    marks.push({ name: `gs-feel:${index}:${i}:start`, ts: s.start * 1000, startTime: s.start });
    marks.push({ name: `gs-feel:${index}:${i}:end`, ts: s.end * 1000, startTime: s.end });
    for (let k = 0; k < 30; k++) frames.push(Math.round((s.start + (steps[i].lead ?? 0) + k * 16.7) * 1000));
    for (const t of steps[i].tasks ?? []) tasks.push({ ts: (s.start + t.at) * 1000, dur: t.dur * 1000, tdur: (t.tdur ?? t.dur) * 1000 });
  });
  tasks.sort((a, b) => a.ts - b.ts);
  return {
    index,
    samples: { version: 1, run: index, mode: 'motion', fcp, steps: sampleSteps, events, shifts, longtasks: [], loafs, animations, overlaps, calm },
    trace: { pid: 1, tid: 7, frames, tasks, children: [], animations: composites, latencies: [], marks, windows: stepWindows(marks), offsetMs: 0, drops },
    steady: { interval: 16.7, misses: 0 },
    calibration: 30,
  };
}
const meta = (extra = {}) => ({ scenario: 'unit', matrix: 'm', mode: 'motion', env: {}, runsPlanned: 3, allowShift: [], ...extra });
const fold = (runs, { mode = 'motion', ...extra } = {}) => combineRuns(B, runs.map((r) => evaluateRun(B, r, { mode })), meta({ mode, ...extra }));
const checks = (report) => report.violations.map((v) => v.check).sort();
// the probe's curve fields: css copies the shorthand onto every keyframe, a transition or a web
// animation carries its easing on the effect (both shapes read from chromium 145 in task 3)
const cssCurve = (easing) => ({ easings: easing === 'linear' ? [] : [easing], effectEasing: 'linear', keyframes: [{ offset: 0, easing }, { offset: 1, easing }] });
const effectCurve = (easing) => ({ easings: easing === 'linear' ? [] : [easing], effectEasing: easing, keyframes: [{ offset: 0, easing: 'linear' }, { offset: 1, easing: 'linear' }] });
const anim = (o) => ({ at: 1100, step: 0, kind: 'css-animation', name: 'gs-event-x', id: '', target: 'div#a', pseudo: null, properties: ['transform'], ...cssCurve('steps(3)'), iterations: 1, glitch: '1', origin: 'armed', ...o });
const shift = (o) => ({ startTime: 1100, value: 0.01, hadRecentInput: false, sources: [{ path: 'div#list', allowedBy: null, previousRect: { x: 0, y: 0 }, currentRect: { x: 0, y: 28 } }], ...o });

test('a clean run passes and says so', () => {
  const report = fold([build({ steps: [{ kind: 'input' }, {}] }), build({ index: 2, steps: [{ kind: 'input' }, {}] })]);
  assert.equal(report.result, 'pass');
  assert.deepEqual(report.violations, []);
  assert.deepEqual(report.unconfirmed, []);
  assert.equal(report.runsDone, 2);
  // spec 7.9: the json keeps what each run saw, not only counts
  assert.deepEqual(Object.keys(report.runs[0].detail).sort(), ['animations', 'answers', 'shifts']);
  assert.deepEqual(report.runs[0].detail.answers.map((a) => [a.step, a.what]), [[0, 'mutation']]);
});

test('a 30ms frame in both runs fails the frame check with both values', () => {
  const heavy = { steps: [{ tasks: [{ at: 100, dur: 30 }] }] };
  const report = fold([build(heavy), build({ index: 2, ...heavy })]);
  assert.deepEqual(checks(report), ['frame']);
  assert.deepEqual(report.violations[0].values, [{ run: 1, value: 30 }, { run: 2, value: 30 }]);
  assert.equal(report.violations[0].data.count, 1);
});

test('a timing violation in one run of three is unconfirmed, two of three fails', () => {
  const heavy = { steps: [{ tasks: [{ at: 100, dur: 30 }] }] };
  const one = fold([build(heavy), build({ index: 2 }), build({ index: 3 })]);
  assert.equal(one.result, 'pass');
  assert.deepEqual(one.unconfirmed.map((u) => u.check), ['frame']);
  const two = fold([build(heavy), build({ index: 2 }), build({ index: 3, ...heavy })]);
  assert.deepEqual(checks(two), ['frame']);
});

test('the fast path: runs that agree need no third run, runs that disagree do', () => {
  const heavy = { steps: [{ tasks: [{ at: 100, dur: 30 }] }] };
  const e = (r) => evaluateRun(B, r, { mode: 'motion' });
  assert.equal(needsThirdRun(B, [e(build()), e(build({ index: 2 }))]), false);
  assert.equal(needsThirdRun(B, [e(build(heavy)), e(build({ index: 2, ...heavy }))]), false);
  assert.equal(needsThirdRun(B, [e(build(heavy)), e(build({ index: 2 }))]), true);
});

test('the frame check sees the lead: cpu between the start mark and the first frame is a frame', () => {
  // page.keyboard.press has no actionability wait, so the handler runs before the first
  // BeginMainThreadFrame of the window. it holds that frame back all the same
  const report = fold([build({ steps: [{ lead: 8, tasks: [{ at: 2, dur: 30 }] }] })], { runsPlanned: 1 });
  assert.deepEqual(checks(report), ['frame']);
  assert.equal(report.violations[0].data.worst, 30);
  assert.equal(report.violations[0].data.at, 0);
  assert.deepEqual(report.stalls, []);
  // the lead interval is ours, not the trace's: a window with no BeginMainThreadFrame still throws
  assert.throws(() => evaluateRun(B, build({ steps: [{ lead: 600 }] }), { mode: 'motion' }), (e) => e instanceof GsFeelUnevaluable && /no BeginMainThreadFrame/.test(e.message));
});

test('strict mode: one run, any timing violation fails', () => {
  const report = fold([build({ steps: [{ tasks: [{ at: 100, dur: 30 }] }] })], { runsPlanned: 1 });
  assert.deepEqual(checks(report), ['frame']);
});

test('a task over 50ms of thread time fails; wall over 50 with cpu under is a stall', () => {
  const long = fold([build({ steps: [{ tasks: [{ at: 100, dur: 60 }] }] })], { runsPlanned: 1 });
  assert.ok(checks(long).includes('task'));
  const stalled = fold([build({ steps: [{ tasks: [{ at: 100, dur: 60, tdur: 10 }] }] })], { runsPlanned: 1 });
  assert.deepEqual(checks(stalled), []);
  assert.match(stalled.stalls[0].what, /60ms task with 10ms of cpu/);
});

test('a rAF gap with no cpu behind it is a stall, not a frame violation', () => {
  const frames = [0, 16.7, 60, 76.7, 93.4, 110.1];
  const report = fold([build({ steps: [{ frames }] })], { runsPlanned: 1 });
  assert.deepEqual(checks(report), []);
  assert.match(report.stalls[0].what, /43.3ms rAF gap with no cpu behind it/);
});

test('input is judged on input steps only: a keyboard scroll with a 70ms interaction has no input check', () => {
  const entry = { name: 'keydown', interactionId: 9, startTime: 1005, duration: 70, processingStart: 1006, processingEnd: 1010 };
  const report = fold([build({ steps: [{ kind: 'scroll' }], events: [entry] })], { runsPlanned: 1 });
  assert.deepEqual(checks(report), []);
  assert.equal(report.runs[0].steps[0].input, null);
});

test('input: the worst entry of an interaction over 50 fails, so 56 fails and 48 passes', () => {
  const entry = (duration) => ({ name: 'click', interactionId: 5, startTime: 1005, duration, processingStart: 1006, processingEnd: 1050 });
  const slow = fold([build({ steps: [{ kind: 'input' }], events: [entry(48), { ...entry(56), name: 'pointerup' }] })], { runsPlanned: 1 });
  assert.deepEqual(checks(slow), ['input']);
  assert.equal(slow.violations[0].data.duration, 56);
  assert.equal(slow.violations[0].data.inputDelay, 1);
  const fine = fold([build({ steps: [{ kind: 'input' }], events: [entry(48)] })], { runsPlanned: 1 });
  assert.deepEqual(checks(fine), []);
});

test('answer: nothing is silent, late is slow, and an exemption must be used', () => {
  assert.deepEqual(checks(fold([build({ steps: [{ kind: 'input', answerAt: null }] })], { runsPlanned: 1 })), ['silent']);
  assert.deepEqual(checks(fold([build({ steps: [{ kind: 'input', answerAt: 80 }] })], { runsPlanned: 1 })), ['answer']);
  const exempt = fold([build({ steps: [{ kind: 'input', answerAt: null, answerExpected: false, why: 'the press is the answer' }] })], { runsPlanned: 1 });
  assert.equal(exempt.result, 'pass');
  assert.deepEqual(exempt.exemptions, [{ kind: 'answer', target: 'step 0 "step 0"', why: 'the press is the answer', used: true }]);
  const unused = fold([build({ steps: [{ kind: 'input', answerExpected: false, why: 'the press is the answer' }] })], { runsPlanned: 1 });
  assert.deepEqual(checks(unused), ['exemption']);
});

test('shifts: recent input passes, before fcp is ignored, before the first step is load', () => {
  // the pre-fcp shift gets its own source: sharing div#list with the load shift, the fold would
  // merge the two and the cutoff could vanish without a test noticing
  const early = shift({ startTime: 40, sources: [{ path: 'div#early', allowedBy: null, previousRect: { x: 0, y: 0 }, currentRect: { x: 0, y: 28 } }] });
  const run = build({ shifts: [shift({ hadRecentInput: true }), early, shift({ startTime: 400 }), shift({ startTime: 1100 })] });
  const report = fold([run], { runsPlanned: 1 });
  assert.deepEqual(report.violations.map((v) => [v.check, v.step.name]), [['shift', 'load'], ['shift', 'step 0']]);
  assert.equal(report.violations.some((v) => v.data.sources.some((x) => x.path === 'div#early')), false);
});

test('allowShift: a used exemption passes, a declared and unused one fails', () => {
  const allowed = shift({ sources: [{ path: 'div#feed', allowedBy: '#feed', previousRect: { x: 0, y: 0 }, currentRect: { x: 0, y: 28 } }] });
  const used = fold([build({ shifts: [allowed] })], { runsPlanned: 1, allowShift: [{ selector: '#feed', why: 'the feed grows by design' }] });
  assert.equal(used.result, 'pass');
  assert.deepEqual(used.exemptions, [{ kind: 'shift', target: '#feed', why: 'the feed grows by design', used: true }]);
  const unused = fold([build()], { runsPlanned: 1, allowShift: [{ selector: '#feed', why: 'the feed grows by design' }] });
  assert.deepEqual(checks(unused), ['exemption']);
});

test('a deterministic violation fails on the first run that shows it, even one of three', () => {
  const report = fold([build(), build({ index: 2, shifts: [shift()] }), build({ index: 3 })]);
  assert.deepEqual(checks(report), ['shift']);
  assert.deepEqual(report.violations[0].runs, [2]);
});

test('property: only transform and opacity may animate, one violation per target', () => {
  const report = fold([build({ animations: [anim({ properties: ['left'] }), anim({ properties: ['transform', 'opacity'] })] })], { runsPlanned: 1 });
  assert.deepEqual(checks(report), ['property']);
  assert.deepEqual(report.violations[0].data.properties, ['left']);
  const border = ['top', 'right', 'bottom', 'left'].map((side) => anim({ kind: 'css-transition', name: `border-${side}-color`, target: 'button#go', properties: [`border-${side}-color`], ...effectCurve('ease-out') }));
  const grouped = fold([build({ animations: border })], { runsPlanned: 1 });
  assert.equal(grouped.violations.length, 1);
  assert.deepEqual(grouped.violations[0].data.properties, ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color']);
});

test('family: event eased, spatial stepped and unclassified each fail', () => {
  const report = fold([build({ animations: [
    anim({ name: 'sn-event-eased', ...cssCurve('ease-out') }),
    anim({ name: 'sn-spatial-stepped', ...cssCurve('steps(4)') }),
    anim({ kind: 'web-animation', name: '', id: '' }),
    anim({ name: 'gs-event-glitch-shift', ...cssCurve('steps(3)') }),
    anim({ kind: 'web-animation', name: '', id: 'gs-move:enter', ...effectCurve('cubic-bezier(0.16, 1, 0.3, 1)') }),
  ] })], { runsPlanned: 1 });
  assert.deepEqual(report.violations.map((v) => v.data.rule).sort(), ['event eased', 'spatial stepped', 'unclassified']);
});

test('family: a signal eased over part of its curve fails, one whose ease sits on the last keyframe does not', () => {
  const mixed = anim({ name: 'sn-event-mixed', easings: ['steps(3)', 'ease'], keyframes: [{ offset: 0, easing: 'steps(3)' }, { offset: 0.5, easing: 'ease' }, { offset: 1, easing: 'linear' }] });
  const tail = anim({ name: 'sn-event-tail', easings: ['steps(3)', 'ease'], keyframes: [{ offset: 0, easing: 'steps(3)' }, { offset: 1, easing: 'ease' }] });
  const poke = anim({ kind: 'web-animation', name: '', id: 'sn-event-poke', ...effectCurve('steps(3)') });
  const report = fold([build({ animations: [mixed, tail, poke] })], { runsPlanned: 1 });
  assert.deepEqual(report.violations.map((v) => [v.data.rule, v.data.name]), [['event eased', 'sn-event-mixed']]);
});

test('calm fails signal at glitch 0, motion mode does not; still fails any animation', () => {
  const zero = anim({ name: 'gs-event-glitch-shift', glitch: '0' });
  assert.deepEqual(fold([build({ animations: [zero] })], { runsPlanned: 1, mode: 'calm' }).violations.map((v) => v.data.rule), ['signal at glitch 0']);
  assert.equal(fold([build({ animations: [zero] })], { runsPlanned: 1 }).result, 'pass');
  const dom = fold([build({ calm: [{ at: 1100, what: 'gs-decode played', target: 'gs-decode#wordmark' }] })], { runsPlanned: 1, mode: 'calm' });
  assert.deepEqual(dom.violations.map((v) => [v.data.rule, v.data.name]), [['signal at glitch 0', 'gs-decode played']]);
  const moved = anim({ kind: 'web-animation', name: '', id: 'gs-move:enter', ...effectCurve('linear') });
  assert.deepEqual(fold([build({ animations: [moved] })], { runsPlanned: 1, mode: 'still' }).violations.map((v) => v.data.rule), ['motion under still']);
});

test('one carrier: a space and a signal animation on one target fail, two space ones do not', () => {
  const both = { at: 1100, step: 0, target: 'div#c', pseudo: null, anims: [{ kind: 'web-animation', name: '', id: 'gs-move:slide' }, { kind: 'css-animation', name: 'sn-event-glitch', id: '' }] };
  assert.deepEqual(fold([build({ overlaps: [both] })], { runsPlanned: 1 }).violations.map((v) => v.data.rule), ['one carrier']);
  const space = { ...both, anims: [{ kind: 'web-animation', name: '', id: 'gs-move:flip' }, { kind: 'css-transition', name: 'transform', id: '' }] };
  assert.equal(fold([build({ overlaps: [space] })], { runsPlanned: 1 }).result, 'pass');
});

test('composite: 1056 fails with both reasons, bit 16 alone passes', () => {
  const failed = { id: 'a', nodeName: "span id='inl'", displayName: '', compositeFailed: 1056, unsupportedProperties: [], ts: 1_100_000 };
  const report = fold([build({ composites: [failed, { ...failed, id: 'b', compositeFailed: 1 << 16 }] })], { runsPlanned: 1 });
  assert.deepEqual(checks(report), ['composite']);
  assert.deepEqual(report.violations[0].data.reasons, ['target has invalid compositing state', 'transform cannot be accelerated on the target']);
  assert.equal(report.violations[0].step.name, 'step 0');
});

test('a step that never settles fails as settle', () => {
  assert.deepEqual(checks(fold([build({ steps: [{ settled: false }] })], { runsPlanned: 1 })), ['settle']);
});

test('compositor drops gate only when the baseline said so', () => {
  const report = fold([build({ drops: [{ ts: 1_100_000 }] })], { runsPlanned: 1 });
  if (DROPS_GATE) assert.deepEqual(checks(report), ['drops']);
  else assert.match(report.runs[0].info.join('\n'), /1 compositor frames dropped/);
});

test('composite apparatus: animations started while armed and no Animation event in the trace is unevaluable', () => {
  const armed = build({ animations: [anim({})], composites: [] });
  assert.throws(() => evaluateRun(B, armed, { mode: 'motion' }), (e) => e instanceof GsFeelUnevaluable && /no Animation event/.test(e.message));
  // only animations that were already running when the probe armed: their trace events predate the trace
  const before = build({ animations: [anim({ origin: 'before arm' })], composites: [] });
  assert.equal(evaluateRun(B, before, { mode: 'motion' }).deterministic.length, 0);
});

test('apparatus: zero frames, an untrusted input, or counts that never grew are unevaluable', () => {
  const unevaluable = (run, pattern) => assert.throws(() => evaluateRun(B, run, { mode: 'motion' }), (e) => e instanceof GsFeelUnevaluable && pattern.test(e.message));
  unevaluable(build({ steps: [{ frames: [] }] }), /zero animation frames/);
  unevaluable(build({ steps: [{ kind: 'input', trusted: { pointerdown: 0, keydown: 0 } }] }), /no trusted pointerdown or keydown/);
  unevaluable(build({ steps: [{ kind: 'input', countsAfter: { pointerdown: 0, keydown: 0 } }] }), /no trusted pointerdown or keydown/);
});

test('apparatus: a run that recorded no steps is unevaluable, not a pass', () => {
  assert.throws(() => evaluateRun(B, build({ steps: [] }), { mode: 'motion' }), (e) => e instanceof GsFeelUnevaluable && /recorded no steps/.test(e.message));
});

test('runs that recorded different steps are unevaluable, never a median of something and nothing', () => {
  const heavy = { tasks: [{ at: 100, dur: 30 }] };
  const e = (r) => evaluateRun(B, r, { mode: 'motion' });
  const unevaluable = (fn) => assert.throws(fn, (err) => err instanceof GsFeelUnevaluable && /different steps/.test(err.message));
  // run 1 lost step 1 that runs 2 and 3 both fail
  const lost = [build({ steps: [{}] }), build({ index: 2, steps: [{}, heavy] }), build({ index: 3, steps: [{}, heavy] })];
  unevaluable(() => fold(lost));
  // run 2 lacks the step run 1 failed
  const missing = [build({ steps: [{}, heavy] }), build({ index: 2, steps: [{}] })];
  unevaluable(() => fold(missing, { runsPlanned: 2 }));
  unevaluable(() => needsThirdRun(B, missing.map(e)));
});
