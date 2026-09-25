// chromium trace events in, the numbers the frame, task and composite checks judge out. pure: no
// io, no clock. every chromium internal it leans on is checked on the way in, so a playwright bump
// that moves one fails loudly instead of measuring nothing (spec 7.8, 13 risk 3) >:[
import { GsFeelUnevaluable } from './errors.js';

export const TRACE_CATEGORIES = Object.freeze([
  'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame',
  'devtools.timeline',
  'blink.animations',
  'blink.user_timing',
  'input',
]);

// the bits we name. the rest print by number. bit 16 fires for animations with no visible change
// (hidden elements) and isn't a failure to composite anything (spec 7.7)
const COMPOSITE_REASONS = Object.freeze({
  5: 'target has invalid compositing state',
  // a web animation outranks a css transition in composite order, and a finished one still counts
  // until it's cancelled or collected. motion.js cancels on finish for exactly this (plan task 15)
  6: 'another animation on the same property of this element blocks it (a finished web animation still attached counts)',
  10: 'transform cannot be accelerated on the target',
  13: 'unsupported css property',
});
export const COMPOSITE_IGNORED = 1 << 16;
const CHILD_NAMES = new Set(['Layout', 'UpdateLayoutTree', 'Paint', 'FunctionCall', 'EventDispatch', 'TimerFire']);
const r1 = (n) => Math.round(n * 10) / 10;

export function rendererPid(events) {
  const started = events.find((e) => e.name === 'TracingStartedInBrowser');
  if (started === undefined) throw new GsFeelUnevaluable('the trace has no TracingStartedInBrowser event. the trace format moved: re-record the fixtures and update trace.js');
  const frames = started.args?.data?.frames ?? [];
  const main = frames.find((f) => f.isOutermostMainFrame === true) ?? frames[0];
  if (main?.processId === undefined) throw new GsFeelUnevaluable('TracingStartedInBrowser names no main frame process, so the renderer pid is unknown');
  return main.processId;
}

export function mainThread(events, pid) {
  const meta = events.find((e) => e.ph === 'M' && e.name === 'thread_name' && e.pid === pid && e.args?.name === 'CrRendererMain');
  if (meta === undefined) throw new GsFeelUnevaluable(`the trace has no CrRendererMain thread name for renderer pid ${pid}`);
  return meta.tid;
}

export function topLevelTasks(events, pid, tid) {
  const all = events.filter((e) => e.name === 'RunTask' && e.ph === 'X' && e.pid === pid && e.tid === tid).sort((a, b) => a.ts - b.ts);
  if (all.length > 0 && all.every((t) => typeof t.tdur !== 'number')) throw new GsFeelUnevaluable('no RunTask carries tdur. thread time is what the frame and task budgets judge (spec 8.4)');
  const out = [];
  let edge = -Infinity;
  for (const t of all) {
    if (t.ts < edge) continue; // nested inside the task before it
    // a task too short to carry thread time (chromium drops tdur on 1us tasks) counts its wall time
    out.push({ ts: t.ts, dur: t.dur, tdur: typeof t.tdur === 'number' ? t.tdur : t.dur });
    edge = t.ts + t.dur;
  }
  return out;
}

export function beginFrames(events, pid, tid) {
  return events.filter((e) => e.name === 'BeginMainThreadFrame' && e.pid === pid && e.tid === tid).map((e) => e.ts).sort((a, b) => a - b);
}

function callSource(e) {
  const d = e.args?.data ?? {};
  const file = String(d.url ?? '').replace(/^https?:\/\/[^/]+\//, '');
  return `${file || '(inline)'}:${(d.lineNumber ?? 0) + 1} ${d.functionName || '(anonymous)'}`;
}

// layout inside a function call is a layout that script forced. the innermost call names the culprit
export function childEvents(events, pid, tid) {
  const kids = events.filter((e) => CHILD_NAMES.has(e.name) && e.ph === 'X' && e.pid === pid && e.tid === tid).sort((a, b) => a.ts - b.ts);
  const calls = kids.filter((e) => e.name === 'FunctionCall');
  return kids.map((e) => {
    const out = { name: e.name, ts: e.ts, dur: e.dur ?? 0 };
    if (e.name === 'FunctionCall') out.source = callSource(e);
    if (e.name === 'Layout' || e.name === 'UpdateLayoutTree') {
      const inner = calls.filter((c) => c.ts <= e.ts && c.ts + c.dur >= e.ts + (e.dur ?? 0)).at(-1);
      if (inner !== undefined) out.forcedFrom = callSource(inner);
    }
    return out;
  });
}

// Animation is an async event: the begin names the target, a later instant carries the verdict.
// the trace drops a web animation's id, so attribution is by node name and css animation name.
// chromium hands an id2.local to the next animation the moment the last one's `e` lands, so a
// record opens on each `b` and closes on its `e`. keyed on the id alone, one toast slot's bit 6
// once got pinned on a view body, a tab indicator and eight faces that composited fine XX
export function compositeResults(events, pid) {
  const open = new Map();
  const out = [];
  for (const e of events.filter((x) => x.name === 'Animation' && x.pid === pid).sort((a, b) => a.ts - b.ts)) {
    const key = e.id2?.local ?? e.id;
    const data = e.args?.data ?? {};
    if (e.ph === 'b') {
      const rec = { id: key, nodeName: String(data.nodeName ?? '').toLowerCase(), displayName: String(data.displayName ?? ''), compositeFailed: 0, unsupportedProperties: [], ts: e.ts };
      open.set(key, rec);
      out.push(rec);
      continue;
    }
    const rec = open.get(key);
    if (rec === undefined) continue; // began before the trace did
    if (typeof data.compositeFailed === 'number') rec.compositeFailed |= data.compositeFailed;
    if (Array.isArray(data.unsupportedProperties)) rec.unsupportedProperties.push(...data.unsupportedProperties);
    if (e.ph === 'e') open.delete(key);
  }
  return out;
}

export function decodeComposite(bits) {
  const out = [];
  for (let b = 0; b < 31; b++) {
    if ((bits & (1 << b)) === 0 || (1 << b) === COMPOSITE_IGNORED) continue;
    out.push({ bit: b, reason: COMPOSITE_REASONS[b] ?? `bit ${b}` });
  }
  return out;
}

// EventLatency lives on the renderer's compositor thread, so it filters by pid only
export function eventLatencies(events, pid) {
  const open = new Map();
  const out = [];
  for (const e of events.filter((x) => x.name === 'EventLatency' && x.pid === pid).sort((a, b) => a.ts - b.ts)) {
    const key = e.id2?.local ?? e.id;
    if (e.ph === 'b') open.set(key, e);
    else if (e.ph === 'e' && open.has(key)) {
      const b = open.get(key);
      open.delete(key);
      out.push({ type: b.args?.event_latency?.event_type ?? 'UNKNOWN', ts: b.ts, dur: r1((e.ts - b.ts) / 1000) });
    }
  }
  return out;
}

export function userMarks(events, pid) {
  return events
    .filter((e) => e.pid === pid && typeof e.cat === 'string' && e.cat.includes('blink.user_timing') && typeof e.args?.data?.startTime === 'number')
    .map((e) => ({ name: e.name, ts: e.ts, startTime: e.args.data.startTime }))
    .sort((a, b) => a.ts - b.ts);
}

// a mark carries both clocks: ts in trace microseconds, startTime in performance.now() ms (spec p19)
export function clockOffset(marks) {
  if (marks.length === 0) throw new GsFeelUnevaluable('the trace holds no user timing marks, so its clock cannot be tied to performance.now()');
  const offsets = marks.map((m) => m.ts / 1000 - m.startTime).sort((a, b) => a - b);
  return offsets[Math.floor(offsets.length / 2)];
}

export function stepWindows(marks) {
  const out = new Map();
  for (const m of marks) {
    const hit = /^gs-feel:(\d+):(\d+):(start|end)$/.exec(m.name);
    if (hit === null) continue;
    const key = `${hit[1]}:${hit[2]}`;
    const w = out.get(key) ?? { start: null, end: null };
    w[hit[3]] = m.ts;
    out.set(key, w);
  }
  return out;
}

// PipelineReporter comes from the browser pid too. only the renderer's drops are this page's
export function compositorDrops(events, pid) {
  return events
    .filter((e) => e.name === 'PipelineReporter' && e.ph === 'b' && e.pid === pid
      && e.args?.frame_reporter?.state === 'STATE_DROPPED' && e.args?.frame_reporter?.affects_smoothness === true)
    .map((e) => ({ ts: e.ts }));
}

export function summarizeTrace(events) {
  const pid = rendererPid(events);
  const tid = mainThread(events, pid);
  const tasks = topLevelTasks(events, pid, tid);
  if (tasks.length === 0) throw new GsFeelUnevaluable('the trace has no RunTask on CrRendererMain');
  const marks = userMarks(events, pid);
  return {
    pid,
    tid,
    frames: beginFrames(events, pid, tid),
    tasks,
    children: childEvents(events, pid, tid),
    animations: compositeResults(events, pid),
    latencies: eventLatencies(events, pid),
    marks,
    windows: stepWindows(marks),
    offsetMs: clockOffset(marks),
    drops: compositorDrops(events, pid),
  };
}

function heaviest(kids) {
  const groups = new Map();
  for (const k of kids) {
    const name = k.name === 'FunctionCall' ? `FunctionCall ${k.source}` : k.name;
    const g = groups.get(name) ?? { name, ms: 0, count: 0, forcedFrom: null };
    g.ms += k.dur / 1000;
    g.count += 1;
    if (g.forcedFrom === null && k.forcedFrom !== undefined) g.forcedFrom = k.forcedFrom;
    groups.set(name, g);
  }
  return [...groups.values()].sort((a, b) => b.ms - a.ms).slice(0, 3).map((g) => ({ ...g, ms: r1(g.ms) }));
}

// what it cost the main thread to produce each frame inside [start, end]: the thread time of every
// top-level task that starts between one BeginMainThreadFrame and the next (spec 7.7, frame row).
// the heavy list comes from inside those same tasks, never from the interval's clock range: a task
// runs past the next BeginMainThreadFrame all the time, and its children go where its cpu went
export function frameCosts(summary, start, end) {
  const frames = summary.frames.filter((ts) => ts >= start && ts <= end);
  return frames.map((a, i) => {
    const b = frames[i + 1] ?? end;
    const mine = summary.tasks.filter((t) => t.ts >= a && t.ts < b);
    const cpu = mine.reduce((s, t) => s + t.tdur, 0) / 1000;
    const kids = summary.children.filter((k) => mine.some((t) => k.ts >= t.ts && k.ts < t.ts + t.dur));
    return { ts: a, end: b, cpu: r1(cpu), wall: r1((b - a) / 1000), heavy: heaviest(kids) };
  });
}
