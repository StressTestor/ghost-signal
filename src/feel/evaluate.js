// one run's probe samples and trace summary in, violations out; then the runs folded into one
// report. pure: the unit tests hand it built runs and the fixture hands it real ones. the median
// lives here and nowhere else (spec 8.5) (¬‿¬)
import { GsFeelUnevaluable } from './errors.js';
import { isVsyncMiss, worstInteraction, isUnpromptedShift, animatedProperties, familyOf, isStepped, isEased } from './budgets.js';
import { frameCosts, decodeComposite, COMPOSITE_IGNORED } from './trace.js';

export const REPORT_VERSION = 1;
export const TIMING_CHECKS = Object.freeze(['frame', 'input', 'task', 'answer']);
// spec 8.7 decided this one: the ubuntu clean control dropped compositor frames in 20 of 20 runs
// at both dprs, so a drop can't tell the page from the runner. drops stay informational XX
export const DROPS_GATE = false;

const LOAD = Object.freeze({ index: null, name: 'load', kind: 'load', inputType: null });
const BETWEEN = Object.freeze({ index: null, name: 'between steps', kind: 'armed', inputType: null });
const r1 = (n) => Math.round(n * 10) / 10;
const refOf = (s) => ({ index: s.index, name: s.name, kind: s.kind, inputType: s.inputType ?? null });
const shortUrl = (u) => String(u ?? '').replace(/^https?:\/\/[^/]+\//, '');

function stepAt(steps, t) {
  let hit = null;
  for (const s of steps) if (s.start <= t) hit = s;
  return hit;
}

function loafScripts(loafs, start, duration) {
  return loafs
    .filter((l) => l.startTime < start + duration && l.startTime + l.duration > start)
    .flatMap((l) => l.scripts)
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 3)
    .map((s) => ({ invoker: s.invoker, source: `${shortUrl(s.sourceURL)} ${s.sourceFunctionName ?? ''}`.trim(), ms: r1(s.duration) }));
}

// the apparatus checks that live on the samples (spec 7.8): a harness that measured nothing must
// not report a pass, so each gap throws instead of reading as clean XX
function windowFor(samples, trace, s) {
  if (s.frames.length === 0) throw new GsFeelUnevaluable(`step ${s.index} "${s.name}" recorded zero animation frames. the page stopped rendering or the probe's rAF loop died`);
  if (s.kind === 'input') {
    const trusted = s.trusted.pointerdown + s.trusted.keydown;
    const grew = ['pointerdown', 'keydown'].some((t) => (s.countsAfter?.[t] ?? 0) > (s.countsBefore?.[t] ?? 0));
    if (trusted === 0 || grew === false) throw new GsFeelUnevaluable(`step ${s.index} "${s.name}" is an input step, but no trusted pointerdown or keydown landed. drive it with locator.click, page.keyboard or page.mouse, never page.evaluate`);
  }
  const w = trace.windows.get(`${samples.run}:${s.index}`);
  if (w === undefined || w.start === null || w.end === null) throw new GsFeelUnevaluable(`the trace has no start and end marks for step ${s.index} "${s.name}"`);
  return w;
}

function stepForTrace(samples, trace, ts) {
  for (const s of samples.steps) {
    const w = trace.windows.get(`${samples.run}:${s.index}`);
    if (w !== undefined && ts >= w.start && ts <= w.end) return refOf(s);
  }
  const at = stepAt(samples.steps, ts / 1000 - trace.offsetMs);
  return at === null ? BETWEEN : refOf(at);
}

function judgeStep(budgets, run, s, out) {
  const { samples, trace } = run;
  const interval = run.steady?.interval ?? 1000 / 60;
  const ref = refOf(s);
  const w = windowFor(samples, trace, s);
  if (trace.frames.some((ts) => ts >= w.start && ts <= w.end) === false) throw new GsFeelUnevaluable(`the trace has no BeginMainThreadFrame inside step ${s.index} "${s.name}"`);
  // the first interval opens on the start mark, the way the last closes on the end mark (spec 7.7).
  // an input handler that runs before the window's first BeginMainThreadFrame holds that frame back,
  // and without the lead it counted toward no frame at all. no free frames for the fast ones >:[
  const frames = frameCosts({ ...trace, frames: [w.start, ...trace.frames.filter((ts) => ts > w.start)] }, w.start, w.end);
  const overFrames = frames.filter((f) => f.cpu > budgets.frame);
  const tasks = trace.tasks.filter((t) => t.ts >= w.start && t.ts <= w.end);
  const overTasks = tasks.filter((t) => t.tdur / 1000 > budgets.task).sort((a, b) => b.tdur - a.tdur);
  for (const t of tasks) {
    if (t.dur / 1000 > budgets.task && t.tdur / 1000 <= budgets.task) out.stalls.push({ step: ref, what: `a ${r1(t.dur / 1000)}ms task with ${r1(t.tdur / 1000)}ms of cpu` });
  }
  for (let i = 1; i < s.frames.length; i++) {
    const a = s.frames[i - 1];
    const b = s.frames[i];
    if (isVsyncMiss(b - a, interval, budgets.vsyncMiss) === false) continue;
    const busy = overFrames.some((f) => f.ts / 1000 - trace.offsetMs < b && f.end / 1000 - trace.offsetMs > a);
    if (busy === false) out.stalls.push({ step: ref, what: `a ${r1(b - a)}ms rAF gap with no cpu behind it` });
  }
  // input to paint belongs to s.input alone (spec 7.4): a PageDown scroll makes interactions too,
  // and a scroll step doesn't get to fail a check its kind never runs (¬‿¬)
  const worst = s.kind === 'input' ? worstInteraction(samples.events.filter((e) => e.startTime >= s.start && e.startTime <= s.end)) : null;
  let input = null;
  if (worst !== null) {
    input = {
      name: worst.name,
      duration: worst.duration,
      inputDelay: r1(worst.processingStart - worst.startTime),
      processing: r1(worst.processingEnd - worst.processingStart),
      presentation: r1(worst.startTime + worst.duration - worst.processingEnd),
      scripts: loafScripts(samples.loafs, worst.startTime, worst.duration),
    };
  } else if (s.kind === 'input') {
    const slow = trace.latencies.find((l) => l.ts >= w.start && l.ts <= w.end && l.dur > budgets.input);
    if (slow !== undefined) out.info.push(`step ${s.index} "${s.name}": event timing has no entry, but the trace saw ${slow.type.toLowerCase()} take ${slow.dur}ms`);
  }
  let answer = null;
  const silent = s.kind === 'input' && s.answerAt === null;
  if (s.kind === 'input' && s.answerAt !== null && s.inputAt !== null) answer = { latency: r1(Math.max(0, s.answerAt - s.inputAt)), what: s.answerWhat };
  if (s.kind === 'input' && s.answerExpected === false) {
    if (silent || (answer !== null && answer.latency > budgets.answer)) out.used.answers.add(s.index);
    answer = null;
  } else if (silent) {
    out.deterministic.push({ check: 'silent', step: ref, data: {} });
  }
  if (s.settled === false) out.deterministic.push({ check: 'settle', step: ref, data: { timeout: budgets.settle } });
  const drops = trace.drops.filter((d) => d.ts >= w.start && d.ts <= w.end).length;
  if (drops > 0) {
    if (DROPS_GATE) out.deterministic.push({ check: 'drops', step: ref, data: { count: drops } });
    else out.info.push(`step ${s.index} "${s.name}": ${drops} compositor frames dropped (informational until the baseline says drops can gate)`);
  }
  const worstTask = overTasks[0];
  return {
    ...ref,
    settled: s.settled,
    answerExpected: s.answerExpected,
    why: s.why ?? null,
    frame: { worst: r1(Math.max(0, ...frames.map((f) => f.cpu))), over: overFrames.map((f) => ({ at: r1((f.ts - w.start) / 1000), cpu: f.cpu, heavy: f.heavy })) },
    input,
    task: {
      worst: r1(Math.max(0, ...tasks.map((t) => t.tdur / 1000))),
      over: overTasks.map((t) => ({ at: r1((t.ts - w.start) / 1000), tdur: r1(t.tdur / 1000), dur: r1(t.dur / 1000) })),
      scripts: worstTask === undefined ? [] : loafScripts(samples.loafs, worstTask.ts / 1000 - trace.offsetMs, worstTask.dur / 1000),
    },
    answer,
  };
}

function judgeShifts(budgets, samples, out) {
  const fcp = samples.fcp ?? 0;
  const first = samples.steps.length > 0 ? samples.steps[0].start : Infinity;
  for (const sh of samples.shifts) {
    if (sh.startTime <= fcp) continue;
    for (const src of sh.sources) if (src.allowedBy !== null) out.used.shifts.add(src.allowedBy);
    if (isUnpromptedShift(sh, budgets.shift) === false) continue;
    const at = sh.startTime < first ? null : stepAt(samples.steps, sh.startTime);
    out.deterministic.push({
      check: 'shift',
      step: at === null ? LOAD : refOf(at),
      data: {
        value: sh.value,
        sources: sh.sources.filter((x) => x.allowedBy === null).map((x) => ({ path: x.path, dx: r1(x.currentRect.x - x.previousRect.x), dy: r1(x.currentRect.y - x.previousRect.y) })),
      },
    });
  }
}

function judgeAnimations(budgets, samples, mode, out) {
  const byIndex = new Map(samples.steps.map((s) => [s.index, s]));
  const where = (a) => {
    const s = a.step !== null && byIndex.has(a.step) ? byIndex.get(a.step) : stepAt(samples.steps, a.at);
    return s === null ? BETWEEN : refOf(s);
  };
  const family = (a, rule) => out.deterministic.push({
    check: 'family',
    step: where(a),
    data: { rule, target: a.target, pseudo: a.pseudo, name: a.kind === 'web-animation' ? a.id || '(no id)' : a.name, kind: a.kind, easings: a.easings },
  });
  // one property violation per target and step: border-color alone is four longhand transitions
  const props = new Map();
  for (const a of samples.animations) {
    const bad = animatedProperties(a).filter((p) => budgets.properties.includes(p) === false);
    if (bad.length > 0) {
      const at = where(a);
      const key = `${at.index}|${a.target}|${a.pseudo}`;
      const name = a.kind === 'web-animation' ? a.id || '(no id)' : a.name;
      const v = props.get(key) ?? { check: 'property', step: at, data: { target: a.target, pseudo: a.pseudo, name: '', kind: a.kind, properties: [] }, names: [] };
      if (v.names.includes(name) === false) v.names.push(name);
      for (const p of bad) if (v.data.properties.includes(p) === false) v.data.properties.push(p);
      props.set(key, v);
    }
    // a curve with a stepped and an eased segment is both, so each family asks its own question
    const fam = familyOf(a);
    if (fam === 'unclassified') family(a, 'unclassified');
    else if (fam === 'signal' && isEased(a)) family(a, 'event eased');
    else if (fam === 'space' && isStepped(a)) family(a, 'spatial stepped');
    if (mode === 'calm' && fam === 'signal' && a.glitch === '0') family(a, 'signal at glitch 0');
    if (mode === 'still') family(a, 'motion under still');
  }
  for (const { names, ...v } of props.values()) {
    v.data.name = names.join(', ');
    out.deterministic.push(v);
  }
  if (mode === 'calm') {
    for (const c of samples.calm) {
      const s = stepAt(samples.steps, c.at);
      out.deterministic.push({ check: 'family', step: s === null ? BETWEEN : refOf(s), data: { rule: 'signal at glitch 0', target: c.target, pseudo: null, name: c.what, kind: 'dom', easings: [] } });
    }
  }
  for (const o of samples.overlaps) {
    const fams = new Set(o.anims.map((x) => familyOf(x)));
    if (fams.has('space') === false || fams.has('signal') === false) continue;
    const s = o.step !== null && byIndex.has(o.step) ? byIndex.get(o.step) : stepAt(samples.steps, o.at);
    out.deterministic.push({
      check: 'family',
      step: s === null ? BETWEEN : refOf(s),
      data: { rule: 'one carrier', target: o.target, pseudo: o.pseudo, name: o.anims.map((x) => (x.kind === 'web-animation' ? x.id : x.name)).join(' + '), kind: 'overlap', easings: [] },
    });
  }
}

function judgeComposites(samples, trace, out) {
  // the composite check's own apparatus check: without it a trace that lost blink.animations reads
  // as "all composited". animations already running at arm began before the trace did, so they
  // can't be asked to show up in it
  const fresh = samples.animations.filter((a) => a.origin !== 'before arm').length;
  if (fresh > 0 && trace.animations.length === 0) {
    throw new GsFeelUnevaluable(`the probe saw ${fresh} animations start while armed and the trace holds no Animation event. the blink.animations category is missing or its format moved, so the composite check measured nothing`);
  }
  for (const a of trace.animations) {
    const bits = a.compositeFailed & ~COMPOSITE_IGNORED;
    if (bits === 0) continue;
    out.deterministic.push({
      check: 'composite',
      step: stepForTrace(samples, trace, a.ts),
      data: { nodeName: a.nodeName, displayName: a.displayName, bits, reasons: decodeComposite(bits).map((r) => r.reason), unsupportedProperties: a.unsupportedProperties },
    });
  }
}

export function evaluateRun(budgets, run, { mode = 'motion' } = {}) {
  // zero steps means zero timing checks ran, and a harness that measured nothing doesn't pass (7.8)
  if (run.samples.steps.length === 0) throw new GsFeelUnevaluable(`run ${run.index} recorded no steps. a scenario needs at least one s.input, s.event, s.scroll or s.idle`);
  const out = { deterministic: [], stalls: [], info: [], used: { shifts: new Set(), answers: new Set() } };
  const steps = run.samples.steps.map((s) => judgeStep(budgets, run, s, out));
  judgeShifts(budgets, run.samples, out);
  judgeAnimations(budgets, run.samples, mode, out);
  judgeComposites(run.samples, run.trace, out);
  return {
    index: run.index,
    steps,
    deterministic: out.deterministic,
    stalls: out.stalls,
    info: out.info,
    used: { shifts: [...out.used.shifts], answers: [...out.used.answers] },
    seen: { animations: run.samples.animations.length, shifts: run.samples.shifts.length, composites: run.trace.animations.length },
    // spec 7.9: the json report keeps each run's shifts, animations and answers, so a pattern across
    // runs is readable after the fact
    detail: {
      shifts: run.samples.shifts,
      animations: run.samples.animations,
      answers: run.samples.steps.filter((s) => s.kind === 'input').map((s) => ({ step: s.index, inputAt: s.inputAt, answerAt: s.answerAt, what: s.answerWhat, count: s.answerCount })),
    },
  };
}

function valueOf(step, check) {
  if (check === 'frame') return step.frame.worst;
  if (check === 'input') return step.input?.duration ?? 0;
  if (check === 'task') return step.task.worst;
  return step.answer?.latency ?? 0;
}

function detailOf(step, check) {
  if (check === 'frame') {
    const worst = [...step.frame.over].sort((a, b) => b.cpu - a.cpu)[0] ?? null;
    return { count: step.frame.over.length, worst: step.frame.worst, at: worst?.at ?? 0, heavy: worst?.heavy ?? [] };
  }
  if (check === 'input') return step.input;
  if (check === 'task') return { worst: step.task.worst, over: step.task.over, scripts: step.task.scripts };
  return step.answer;
}

// a median lines up the same step across runs. a step one run skipped would read as a 0, which
// passes, so a missing measurement would quietly vote for green. they ALL show up or nobody folds XX
function sameSteps(runs) {
  const ids = (r) => r.steps.map((s) => s.index).join(',');
  if (runs.some((r) => ids(r) !== ids(runs[0]))) {
    throw new GsFeelUnevaluable(`runs recorded different steps (${runs.map((r) => `run ${r.index}: ${ids(r) || 'none'}`).join(', ')}), so their medians would compare something with nothing. steps() has to call the same steps in the same order every run`);
  }
}

// with two runs that agree on every timing check, a third can't change the median (spec 8.5)
export function needsThirdRun(budgets, runs) {
  if (runs.length !== 2) return false;
  sameSteps(runs);
  const [a, b] = runs;
  return a.steps.some((s) => {
    const t = b.steps.find((x) => x.index === s.index);
    return TIMING_CHECKS.some((c) => (valueOf(s, c) > budgets[c]) !== (valueOf(t, c) > budgets[c]));
  });
}

// the same animation or shift seen in several runs is one violation, listed with every run
function identity(v) {
  const d = v.data ?? {};
  const step = v.step === null ? null : v.step.index ?? v.step.name;
  if (v.check === 'shift') return JSON.stringify([v.check, step, d.sources.map((s) => s.path)]);
  if (v.check === 'property') return JSON.stringify([v.check, d.target, d.pseudo, d.name, d.properties]);
  if (v.check === 'composite') return JSON.stringify([v.check, d.nodeName, d.displayName, d.bits]);
  if (v.check === 'family') return JSON.stringify([v.check, d.rule, d.target, d.pseudo, d.name]);
  return JSON.stringify([v.check, step]);
}

export function combineRuns(budgets, runs, meta) {
  if (runs.length === 0) throw new GsFeelUnevaluable('no measured run finished');
  sameSteps(runs);
  const violations = [];
  const byKey = new Map();
  for (const r of runs) {
    for (const v of r.deterministic) {
      const key = identity(v);
      if (byKey.has(key)) {
        if (byKey.get(key).runs.includes(r.index) === false) byKey.get(key).runs.push(r.index);
        continue;
      }
      const entry = { ...v, runs: [r.index] };
      byKey.set(key, entry);
      violations.push(entry);
    }
  }
  const unconfirmed = [];
  for (const step of runs[0].steps) {
    for (const check of TIMING_CHECKS) {
      const limit = budgets[check];
      const values = runs.map((r) => ({ run: r.index, value: valueOf(r.steps.find((x) => x.index === step.index), check) }));
      const sorted = values.map((v) => v.value).sort((a, b) => a - b);
      const median = sorted[Math.floor((sorted.length - 1) / 2)];
      const over = values.filter((v) => v.value > limit);
      if (median > limit) {
        const worst = over.reduce((a, b) => (b.value > a.value ? b : a));
        const source = runs.find((r) => r.index === worst.run).steps.find((x) => x.index === step.index);
        violations.push({ check, step: refOf(step), limit, values, runs: over.map((v) => v.run), data: detailOf(source, check) });
      } else if (over.length > 0) {
        unconfirmed.push({ check, step: refOf(step), limit, values });
      }
    }
  }
  const exemptions = [];
  for (const d of meta.allowShift ?? []) {
    const used = runs.some((r) => r.used.shifts.includes(d.selector));
    exemptions.push({ kind: 'shift', target: d.selector, why: d.why, used });
    if (used === false) violations.push({ check: 'exemption', step: null, runs: [], data: { kind: 'shift', target: d.selector, why: d.why } });
  }
  for (const s of runs[0].steps) {
    if (s.answerExpected !== false) continue;
    const target = `step ${s.index} "${s.name}"`;
    const used = runs.some((r) => r.used.answers.includes(s.index));
    exemptions.push({ kind: 'answer', target, why: s.why, used });
    if (used === false) violations.push({ check: 'exemption', step: refOf(s), runs: [], data: { kind: 'answer', target, why: s.why } });
  }
  return {
    version: REPORT_VERSION,
    scenario: meta.scenario,
    matrix: meta.matrix,
    mode: meta.mode ?? 'motion',
    env: meta.env,
    budgets,
    runsPlanned: meta.runsPlanned,
    runsDone: runs.length,
    exemptions,
    runs: runs.map((r) => ({ index: r.index, steps: r.steps, seen: r.seen, info: r.info, detail: r.detail })),
    violations,
    unconfirmed,
    stalls: runs.flatMap((r) => r.stalls.map((s) => ({ ...s, run: r.index }))),
    result: violations.length > 0 ? 'fail' : 'pass',
  };
}
