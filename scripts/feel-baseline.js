#!/usr/bin/env node
// the clean control, n times, at the m5 profile: frame cpu, tracing overhead, stalls, compositor
// drops and the calibration spread as one json line. it gates nothing. it tells the feel budgets
// what a machine can hold before anyone judges an app by them (spec 8.6) (¬‿¬)
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { TRACE_CATEGORIES, COMPOSITE_IGNORED, summarizeTrace, frameCosts } from '../src/feel/trace.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.slice(name.length + 3);
};
const RUNS = Number(arg('runs', '20'));
const DPR = Number(arg('dpr', '2'));
const PORT = Number(arg('port', '4174'));
// zero runs summarize to the greenest line possible (no frames, no drops, nothing over budget),
// and step 11 would read that as a pass. an empty measurement is a crash, never a result XX
for (const [name, v] of [['runs', RUNS], ['dpr', DPR], ['port', PORT]]) {
  if (!Number.isInteger(v) || v <= 0) {
    process.stderr.write(`feel-baseline: --${name} must be a positive integer, got ${JSON.stringify(arg(name, ''))}\n`);
    process.exit(1);
  }
}
const VIEWPORT = { width: 1470, height: 956 };

function serve() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/serve.js'], {
      cwd: root,
      env: { ...process.env, PORT: String(PORT) },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`serve.js exited with ${code} before it was ready`)));
    child.stdout.on('data', (d) => { if (String(d).includes('serving')) resolve(child); });
  });
}

const pct = (xs, p) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.round(p * (s.length - 1)))];
};
const r1 = (n) => Math.round(n * 10) / 10;

// page side: both run through page.evaluate, so they close over nothing
function steadyFrames(n) {
  return new Promise((resolve) => {
    const ts = [];
    const tick = (t) => {
      ts.push(t);
      if (ts.length <= n) { requestAnimationFrame(tick); return; }
      const d = ts.slice(1).map((v, i) => v - ts[i]);
      const interval = [...d].sort((a, b) => a - b)[Math.floor(d.length / 2)];
      resolve({ interval, misses: d.filter((x) => x > 1.5 * interval).length });
    };
    requestAnimationFrame(tick);
  });
}
function calibrate() {
  const t = performance.now();
  let x = 0;
  for (let i = 0; i < 5_000_000; i++) x = (x + i * 7) % 1_000_003;
  return { ms: performance.now() - t, x };
}

async function traced(page, drive) {
  const cdp = await page.context().newCDPSession(page);
  const events = [];
  cdp.on('Tracing.dataCollected', (e) => { for (const v of e.value) events.push(v); });
  await cdp.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { includedCategories: [...TRACE_CATEGORIES], excludedCategories: ['*'] } });
  const out = await drive();
  const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.end');
  await done;
  await cdp.detach();
  return { events, out };
}

// the renderer main thread, straight off the raw events. oneRun's RunTask guard needs it too, and
// task 2 deletes analyze() whole, so this can't ride on analyze()'s return shape (¬‿¬)
function rendererMain(events) {
  const started = events.find((e) => e.name === 'TracingStartedInBrowser');
  const pid = (started?.args?.data?.frames ?? []).find((f) => f.isOutermostMainFrame === true)?.processId;
  const tid = events.find((e) => e.ph === 'M' && e.name === 'thread_name' && e.pid === pid && e.args?.name === 'CrRendererMain')?.tid;
  if (pid === undefined || tid === undefined) throw new Error('trace has no renderer main thread. the trace format moved');
  return { pid, tid };
}

function analyze(events, startName, endName) {
  const s = summarizeTrace(events);
  const at = (n) => s.marks.find((m) => m.name === n)?.ts;
  const start = at(startName);
  const end = at(endName);
  if (start === undefined || end === undefined) throw new Error(`trace is missing the ${startName} or ${endName} mark`);
  const inside = s.tasks.filter((t) => t.ts >= start && t.ts <= end);
  return {
    cpu: frameCosts(s, start, end).map((f) => f.cpu),
    stalls: inside.filter((t) => t.dur > 50_000 && t.tdur <= 50_000).length,
    drops: s.drops.filter((d) => d.ts >= start && d.ts <= end).length,
    composite: s.animations.map((a) => a.compositeFailed & ~COMPOSITE_IGNORED).filter((b) => b !== 0),
  };
}

async function oneRun(browser, index) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DPR });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/test/feel/pages/clean.html`);
  await page.evaluate(() => document.fonts.ready);
  const steady = await page.evaluate(steadyFrames, 30);
  // off has to be as warm as on, or off minus on measures warm-up and calls it tracing overhead.
  // the first call pays for the jit, and on the m5 the idle rAF stretch above drops the core's
  // clock: the next calls read about 27, 25, 19, 17, 16, 15ms. spin until two calls agree within
  // 5% (12 at most) before either number counts (¬‿¬)
  let prev = (await page.evaluate(calibrate)).ms;
  for (let i = 0; i < 12; i++) {
    const ms = (await page.evaluate(calibrate)).ms;
    if (Math.abs(ms - prev) <= 0.05 * prev) break;
    prev = ms;
  }
  const calOff = await page.evaluate(calibrate);
  // the feel probe asks for a frame every vsync. without the same loop this page only begins a
  // main-thread frame when something invalidates it, and each cpu bucket spans two vsyncs plus idle
  await page.evaluate(() => requestAnimationFrame(function tick() { requestAnimationFrame(tick); }));
  const { events, out } = await traced(page, async () => {
    // calibrate is one 15 to 30ms task. it runs before baseline:start so no frame's cpu can own it
    const calOn = await page.evaluate(calibrate);
    await page.evaluate(() => performance.mark('baseline:start'));
    await page.locator('#toggle').click();
    await page.evaluate(() => window.cleanInsert());
    await page.evaluate(() => window.cleanToasts(5));
    await page.locator('#scroller').hover();
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(400);
    await page.evaluate(() => performance.mark('baseline:end'));
    return { calOn };
  });
  await context.close();
  const { pid, tid } = rendererMain(events);
  const a = analyze(events, 'baseline:start', 'baseline:end');
  // these checks live here, outside analyze(), because task 2 swaps analyze() for trace.js whole.
  // they read analyze()'s four keys (cpu, stalls, drops, composite) and nothing else
  // a window with no frames or a trace with no reporter reads as 0 over budget and 0 drops, the
  // greenest possible lie. a chromium bump that renames a category would produce exactly that >:[
  if (a.cpu.length === 0) throw new Error(`run ${index}: no BeginMainThreadFrame between baseline:start and baseline:end. the trace format moved`);
  if (!events.some((e) => e.name === 'PipelineReporter')) throw new Error(`run ${index}: trace has no PipelineReporter events, so 0 drops would mean no reporter, not no drops`);
  // every cpu bucket is a sum of main-thread RunTask tdur. lose RunTask and each bucket sums to 0,
  // which reads as the fastest page ever measured. pid and tid come from rendererMain() and the
  // tasks from the raw events, so the check outlives analyze()
  if (!events.some((e) => e.name === 'RunTask' && e.ph === 'X' && e.pid === pid && e.tid === tid && typeof e.tdur === 'number')) {
    throw new Error(`run ${index}: no RunTask with tdur on the renderer main thread, so 0 over budget would mean no tasks, not a fast page`);
  }
  // frames exist and timed tasks exist, so a window where every bucket still sums to 0 means the join
  // between them broke (a filter, a pid, a tid). that's the script lying about the page (｡◕‿↼)
  // the cpu.length guard above has to run first: every() on no frames is true
  if (a.cpu.every((c) => c === 0)) throw new Error(`run ${index}: ${a.cpu.length} frames and every cpu bucket is 0, so tasks and frames aren't being joined, not a free page`);
  return { index, steady, calOff: calOff.ms, calOn: out.calOn.ms, ...a };
}

async function compositeBits(browser) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DPR });
  const page = await context.newPage();
  await page.setContent('<span id="inl">inline span</span>');
  const { events } = await traced(page, async () => {
    await page.evaluate(() => performance.mark('bits:start'));
    await page.evaluate(() => document.getElementById('inl').animate([{ transform: 'translateX(0)' }, { transform: 'translateX(40px)' }], { duration: 200, id: 'gs-move:probe' }));
    await page.waitForTimeout(300);
    await page.evaluate(() => performance.mark('bits:end'));
  });
  await context.close();
  const bits = analyze(events, 'bits:start', 'bits:end').composite;
  // task 7 asserts whatever lands here, so one animation must give exactly one failure reason
  if (bits.length !== 1) throw new Error(`the inline span probe gave ${bits.length} composite failures (${JSON.stringify(bits)}), expected exactly 1`);
  return bits;
}

const server = await serve();
const browser = await chromium.launch();
try {
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(await oneRun(browser, i));
  const frames = runs.flatMap((r) => r.cpu);
  const summary = {
    dpr: DPR,
    runs: RUNS,
    chromium: browser.version(),
    platform: `${process.platform} ${process.arch}`,
    steady: {
      runsWithAtMostOneMiss: runs.filter((r) => r.steady.misses <= 1).length,
      worstMisses: Math.max(...runs.map((r) => r.steady.misses)),
      intervalP50: r1(pct(runs.map((r) => r.steady.interval), 0.5)),
    },
    frameCpu: { p50: r1(pct(frames, 0.5)), p99: r1(pct(frames, 0.99)), max: r1(Math.max(...frames)), over16_7: frames.filter((f) => f > 16.7).length, frames: frames.length },
    tracingOverhead: {
      calOffP50: r1(pct(runs.map((r) => r.calOff), 0.5)),
      calOnP50: r1(pct(runs.map((r) => r.calOn), 0.5)),
      deltaP50: r1(pct(runs.map((r) => r.calOn - r.calOff), 0.5)),
    },
    stalls: runs.reduce((s, r) => s + r.stalls, 0),
    drops: runs.reduce((s, r) => s + r.drops, 0),
    runsWithDrops: runs.filter((r) => r.drops > 0).length,
    calibration: { min: r1(Math.min(...runs.map((r) => r.calOff))), p50: r1(pct(runs.map((r) => r.calOff), 0.5)), max: r1(Math.max(...runs.map((r) => r.calOff))) },
    cleanCompositeFailures: runs.reduce((s, r) => s + r.composite.length, 0),
    inlineSpanCompositeBits: await compositeBits(browser),
  };
  process.stdout.write(`feel-baseline ${JSON.stringify(summary)}\n`);
  await mkdir(`${root}test-results`, { recursive: true });
  await writeFile(`${root}test-results/feel-baseline-dpr${DPR}.json`, `${JSON.stringify({ summary, runs }, null, 2)}\n`);
} finally {
  await browser.close();
  server.kill();
}
