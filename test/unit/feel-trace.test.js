import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GsFeelUnevaluable } from '../../src/feel/errors.js';
import {
  TRACE_CATEGORIES, rendererPid, mainThread, topLevelTasks, beginFrames, compositeResults, decodeComposite,
  eventLatencies, summarizeTrace, frameCosts, childEvents,
} from '../../src/feel/trace.js';

const load = async (name) => JSON.parse(await readFile(new URL(`./fixtures/feel/${name}.trace.json`, import.meta.url), 'utf8')).traceEvents;
const click = await load('click-70ms');
const comp = await load('composite');
const reuse = await load('reuse');

// synthetic events for the shapes a fixture can't hold
const started = (pid) => ({ name: 'TracingStartedInBrowser', ph: 'I', pid: 99, tid: 1, ts: 0, args: { data: { frames: [{ processId: pid, isOutermostMainFrame: true }] } } });
const thread = (pid, tid) => ({ name: 'thread_name', ph: 'M', pid, tid, ts: 0, args: { name: 'CrRendererMain' } });
const task = (pid, tid, ts, dur, tdur) => ({ name: 'RunTask', ph: 'X', pid, tid, ts, dur, tdur });
const frame = (pid, tid, ts) => ({ name: 'BeginMainThreadFrame', ph: 'I', pid, tid, ts });
const mark = (pid, name, ts, startTime) => ({ name, cat: 'blink.user_timing', ph: 'I', pid, tid: 7, ts, args: { data: { startTime } } });

test('the six trace categories are exactly the ones spec 7.5 names', () => {
  assert.deepEqual([...TRACE_CATEGORIES], [
    'disabled-by-default-devtools.timeline',
    'disabled-by-default-devtools.timeline.frame',
    'devtools.timeline',
    'blink.animations',
    'blink.user_timing',
    'input',
  ]);
});

test('the renderer pid comes from the outermost main frame, never the browser pid', () => {
  const pid = rendererPid(click);
  const tsib = click.find((e) => e.name === 'TracingStartedInBrowser');
  assert.notEqual(pid, tsib.pid);
  assert.equal(pid, tsib.args.data.frames.find((f) => f.isOutermostMainFrame).processId);
  assert.ok(click.some((e) => e.name === 'RunTask' && e.pid !== pid), 'the fixture keeps decoy tasks from other pids');
  const tid = mainThread(click, pid);
  assert.ok(topLevelTasks(click, pid, tid).length > 0);
});

test('top-level tasks never overlap, and the 70ms click is one task over 60ms of thread time', () => {
  const pid = rendererPid(click);
  const tasks = topLevelTasks(click, pid, mainThread(click, pid));
  for (let i = 1; i < tasks.length; i++) assert.ok(tasks[i].ts >= tasks[i - 1].ts + tasks[i - 1].dur, `task ${i} starts inside task ${i - 1}`);
  assert.ok(tasks.some((t) => t.tdur / 1000 > 60));
});

test('a 1us RunTask with no tdur counts its wall time; a trace where none carries tdur is unevaluable', () => {
  const ev = [started(1), thread(1, 7), task(1, 7, 0, 100, 90), { name: 'RunTask', ph: 'X', pid: 1, tid: 7, ts: 200, dur: 1 }];
  assert.deepEqual(topLevelTasks(ev, 1, 7).map((t) => t.tdur), [90, 1]);
});

test('a RunTask nested inside another is folded into its parent', () => {
  const ev = [started(1), thread(1, 7), task(1, 7, 0, 100, 90), task(1, 7, 10, 20, 18), task(1, 7, 200, 10, 9)];
  assert.deepEqual(topLevelTasks(ev, 1, 7).map((t) => t.ts), [0, 200]);
});

test('per-frame cpu sums the thread time of tasks between two BeginMainThreadFrames', () => {
  const ev = [started(1), thread(1, 7), frame(1, 7, 0), task(1, 7, 1000, 15000, 2000), frame(1, 7, 16700), task(1, 7, 17000, 30000, 30000), frame(1, 7, 50000)];
  const summary = { frames: beginFrames(ev, 1, 7), tasks: topLevelTasks(ev, 1, 7), children: [] };
  const costs = frameCosts(summary, 0, 60000);
  assert.deepEqual(costs.map((c) => c.cpu), [2, 30, 0]);
  assert.deepEqual(costs.map((c) => c.wall), [16.7, 33.3, 10]);
});

test('a frame lists the children of the tasks it counts, even a task that began before its BeginMainThreadFrame', () => {
  // the rendering task starts a hair before the BeginMainThreadFrame it emits, so its cpu counts in
  // the interval before. its children have to follow it there, or the inside: line names the
  // neighbouring frame's work (the first draft printed the probe's own loop for a 30ms rAF burn)
  const summary = { frames: [0, 1000, 20000], tasks: [{ ts: 900, dur: 15000, tdur: 15000 }], children: [{ name: 'FunctionCall', ts: 1100, dur: 14000, source: 'x.html:16 burn' }] };
  assert.deepEqual(frameCosts(summary, 0, 30000).map((c) => [c.cpu, c.heavy.map((h) => h.name)]), [[15, ['FunctionCall x.html:16 burn']], [0, []], [0, []]]);
});

test('the fixture frame holding the 70ms click costs over 60ms, and the key window has frames', () => {
  const s = summarizeTrace(click);
  const w = s.windows.get('1:0');
  const costs = frameCosts(s, w.start, w.end);
  assert.ok(costs.length > 3);
  assert.ok(costs.some((f) => f.cpu > 60));
  const k = s.windows.get('1:1');
  assert.ok(frameCosts(s, k.start, k.end).length > 3);
});

test('compositeFailed: 1056 on the inline span, 8224 on the v0.1 color hover, 0 on a block', () => {
  const results = compositeResults(comp, rendererPid(comp));
  assert.equal(results.find((r) => r.nodeName.startsWith('span')).compositeFailed, 1056);
  assert.ok(results.some((r) => r.nodeName.startsWith('button') && r.compositeFailed === 8224));
  assert.ok(results.some((r) => r.nodeName.startsWith('div') && r.compositeFailed === 0));
  for (const r of results) assert.equal(r.nodeName, r.nodeName.toLowerCase());
});

test('a reused id opens a new record on each begin: one animation per record, bits never merged', () => {
  // the recorded fixture: chromium handed the span, div a and div b the same id2.local in turn
  const begins = reuse.filter((e) => e.name === 'Animation' && e.ph === 'b');
  assert.equal(begins.length, 3);
  const results = compositeResults(reuse, rendererPid(reuse));
  assert.equal(results.length, 3);
  assert.deepEqual(results.map((r) => [r.nodeName.split(' ')[0], r.compositeFailed]), [['span', 1056], ['div', 0], ['div', 0]]);
  // the same shape built by hand, so the rule holds even on a chromium that stops reusing ids
  const anim = (ph, ts, data) => ({ name: 'Animation', ph, pid: 1, tid: 9, ts, id2: { local: '0x2b' }, args: { data } });
  const ev = [
    anim('b', 10, { nodeName: "DIV class='slot'", displayName: 'transform' }), anim('n', 20, { compositeFailed: 64 }), anim('e', 30, {}),
    anim('b', 40, { nodeName: "DIV class='motion-view-body'", displayName: '' }), anim('n', 50, { compositeFailed: 0 }), anim('e', 60, {}),
  ];
  assert.deepEqual(compositeResults(ev, 1).map((r) => [r.nodeName, r.compositeFailed, r.ts]), [["div class='slot'", 64, 10], ["div class='motion-view-body'", 0, 40]]);
});

test('decodeComposite names bits 5, 6, 10 and 13, numbers the rest, and drops bit 16', () => {
  assert.deepEqual(decodeComposite(1056), [
    { bit: 5, reason: 'target has invalid compositing state' },
    { bit: 10, reason: 'transform cannot be accelerated on the target' },
  ]);
  assert.deepEqual(decodeComposite(8224).map((r) => r.bit), [5, 13]);
  assert.match(decodeComposite(64)[0].reason, /another animation on the same property/);
  assert.deepEqual(decodeComposite(1 << 16), []);
  assert.deepEqual(decodeComposite((1 << 3) | (1 << 16)), [{ bit: 3, reason: 'bit 3' }]);
});

test('EventLatency pairs begin and end by id on the renderer', () => {
  const pressed = eventLatencies(click, rendererPid(click)).find((l) => l.type === 'MOUSE_PRESSED');
  assert.ok(pressed !== undefined);
  assert.ok(pressed.dur > 60, `mouse pressed took ${pressed.dur}ms`);
});

// PipelineReporter comes from the browser pid too, and the fixtures only hold the renderer's. each
// decoy goes in twice: on the browser pid it must change nothing, and the same event on the renderer
// pid must count, so a decoy that's malformed can't pass by being ignored for the wrong reason
test('drops, latencies and composite results ignore the same events from the browser pid', () => {
  const browser = (ev) => ev.find((e) => e.name === 'TracingStartedInBrowser').pid;
  const plus = (ev, extra) => [...ev, ...extra];

  const cp = rendererPid(click);
  const w = summarizeTrace(click).windows.get('1:0');
  const drop = (pid) => ({ name: 'PipelineReporter', ph: 'b', pid, tid: 1, ts: w.start + 1, id2: { local: '0xdecoy' }, args: { frame_reporter: { state: 'STATE_DROPPED', affects_smoothness: true } } });
  const drops = summarizeTrace(click).drops.length;
  assert.notEqual(browser(click), cp);
  assert.equal(summarizeTrace(plus(click, [drop(browser(click))])).drops.length, drops);
  assert.equal(summarizeTrace(plus(click, [drop(cp)])).drops.length, drops + 1);

  const lat = (pid) => [
    { name: 'EventLatency', ph: 'b', pid, tid: 2, ts: w.start + 1, id2: { local: '0xdecoy' }, args: { event_latency: { event_type: 'MOUSE_PRESSED' } } },
    { name: 'EventLatency', ph: 'e', pid, tid: 2, ts: w.start + 80_001, id2: { local: '0xdecoy' }, args: {} },
  ];
  const pressed = (ev) => eventLatencies(ev, cp).filter((l) => l.type === 'MOUSE_PRESSED').length;
  assert.equal(pressed(plus(click, lat(browser(click)))), pressed(click));
  assert.equal(pressed(plus(click, lat(cp))), pressed(click) + 1);

  const kp = rendererPid(comp);
  const t0 = Math.min(...comp.filter((e) => e.name === 'Animation').map((e) => e.ts));
  const anim = (pid) => [
    { name: 'Animation', ph: 'b', pid, tid: 3, ts: t0 + 1, id2: { local: '0xdecoy' }, args: { data: { nodeName: "DIV id='decoy'", displayName: '' } } },
    { name: 'Animation', ph: 'n', pid, tid: 3, ts: t0 + 2, id2: { local: '0xdecoy' }, args: { data: { compositeFailed: 64 } } },
  ];
  assert.deepEqual(compositeResults(plus(comp, anim(browser(comp))), kp), compositeResults(comp, kp));
  const planted = compositeResults(plus(comp, anim(kp)), kp);
  assert.equal(planted.length, compositeResults(comp, kp).length + 1);
  assert.ok(planted.some((r) => r.nodeName === "div id='decoy'" && r.compositeFailed === 64));
});

// spec 7.9's `forced from` line, and task 23 applies the fxOnce fix only when it names fxOnce. the
// layout runs inside both calls, and the innermost one is the script that asked for it
test('a forced layout is pinned on the innermost function call around it, and a free one on none', () => {
  const call = (ts, dur, url, lineNumber, functionName) => ({ name: 'FunctionCall', ph: 'X', pid: 1, tid: 7, ts, dur, args: { data: { url, lineNumber, functionName } } });
  const ev = [
    started(1), thread(1, 7), task(1, 7, 0, 1000, 900),
    call(10, 900, 'http://h/outer.js', 0, 'outer'),
    call(20, 500, 'http://h/src/gs.js', 168, 'fxOnce'),
    { name: 'Layout', ph: 'X', pid: 1, tid: 7, ts: 30, dur: 100 },
    { name: 'UpdateLayoutTree', ph: 'X', pid: 1, tid: 7, ts: 950, dur: 20 },
  ];
  const kids = childEvents(ev, 1, 7);
  assert.equal(kids.find((c) => c.name === 'Layout').forcedFrom, 'src/gs.js:169 fxOnce');
  assert.equal(kids.find((c) => c.name === 'UpdateLayoutTree').forcedFrom, undefined);
  // the recorded one: the fixture's click listener forces a style recalc
  const forced = summarizeTrace(comp).children.filter((c) => c.forcedFrom !== undefined);
  assert.deepEqual(forced.map((c) => [c.name, c.forcedFrom]), [['UpdateLayoutTree', '(inline):7730 listener']]);
});

test('the clock maps trace microseconds to performance.now() through the marks', () => {
  const s = summarizeTrace(click);
  assert.ok(s.marks.length >= 4);
  for (const m of s.marks) assert.ok(Math.abs(m.ts / 1000 - m.startTime - s.offsetMs) < 1, m.name);
  const w = s.windows.get('1:0');
  assert.ok(w.start < w.end);
});

test('a trace missing any piece the decoder needs is unevaluable, never empty', () => {
  const unevaluable = (events, pattern) => assert.throws(() => summarizeTrace(events), (e) => e instanceof GsFeelUnevaluable && pattern.test(e.message));
  unevaluable(click.filter((e) => e.name !== 'TracingStartedInBrowser'), /TracingStartedInBrowser/);
  unevaluable(click.filter((e) => !(e.ph === 'M' && e.args?.name === 'CrRendererMain')), /CrRendererMain/);
  unevaluable([started(1), thread(1, 7), frame(1, 7, 0), { name: 'RunTask', ph: 'X', pid: 1, tid: 7, ts: 5, dur: 10 }, mark(1, 'gs-feel:1:0:start', 0, 0)], /tdur/);
  unevaluable([started(1), thread(1, 7), frame(1, 7, 0), task(1, 7, 5, 10, 9)], /marks/);
});
