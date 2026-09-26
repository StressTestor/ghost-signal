// the public feel api. it touches only what a playwright test hands it (page, testInfo), so ghost
// signal never imports @playwright/test and a consumer never loads a second copy of it (spec 7.1)
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { installProbe, PROBE_VERSION } from './probe.js';
import { TRACE_CATEGORIES, summarizeTrace } from './trace.js';
import { loadBudgets, mergeBudgets } from './budgets.js';
import { GsFeelConfigError, GsFeelUnevaluable, GsFeelError } from './errors.js';
import { evaluateRun, needsThirdRun, combineRuns, REPORT_VERSION } from './evaluate.js';
import { formatReport } from './format.js';

// spec 8.7: at most this many of 30 idle frames may miss a vsync before a run is unevaluable
export const STEADY_MISSES = 1;
// spec 8.7: the dpr ci runs the feel project at. joe's strict mac runs stay at the m5's 2
const CI_DPR = 2;
// chrome keeps hadRecentInput true for 500ms after a discrete input (spec 7.7), and the warm-up's
// Shift is one. arming waits it out, so a shift in the first step is the app's, never the warm-up's
const INPUT_QUIET_MS = 600;

export const FEEL_PROFILES = Object.freeze({
  m5: Object.freeze({ viewport: Object.freeze({ width: 1470, height: 956 }), deviceScaleFactor: 2, hz: 60 }),
  ci: Object.freeze({ viewport: Object.freeze({ width: 1470, height: 956 }), deviceScaleFactor: CI_DPR, hz: 60 }),
});
const PROFILE = process.env.CI ? FEEL_PROFILES.ci : FEEL_PROFILES.m5;

// playwright's own trace snapshots the dom around every action on the page's main thread, which
// would land inside the budgets, so trace, video and screenshots are off for feel specs (spec 7.2)
export const feelUse = Object.freeze({
  browserName: 'chromium',
  viewport: PROFILE.viewport,
  deviceScaleFactor: PROFILE.deviceScaleFactor,
  trace: 'off',
  video: 'off',
  screenshot: 'off',
});

// workers: 1 rides along so a consumer with a parallel config still runs feel specs alone. a second
// worker inside the budgets is jank the harness would pin on the app (spec 8.1, 11)
export function feelProject(overrides = {}) {
  const { use, ...rest } = overrides;
  return { name: 'feel', testMatch: '*.feel.js', retries: 0, fullyParallel: false, workers: 1, ...rest, use: { ...feelUse, ...(use ?? {}) } };
}

// measure() and selfTest() arm on a page that has lived a while. its earlier shifts happened before
// anyone was watching, so only what landed after arm() is judged. scenario() keeps load shifts:
// every run there starts from its own goto
function sinceArm(samples) {
  if (typeof samples.armedAt !== 'number') throw new GsFeelUnevaluable('the probe returned no arm time, so its shifts can not be cut to the window');
  return { ...samples, shifts: samples.shifts.filter((s) => s.startTime >= samples.armedAt) };
}

// the planted row's shift reports on the first frame after the prepend. the bound is loose on
// purpose for a slow runner; the moves match, on both axes, is what keeps a page's own shift out of it
const PLANT_LANDS_MS = 500;
export function plantedShift(v, samples) {
  if (v.check !== 'shift' || typeof samples.plantedAt !== 'number' || typeof v.data?.at !== 'number') return false;
  if (v.data.at < samples.plantedAt || v.data.at >= samples.plantedAt + PLANT_LANDS_MS) return false;
  return v.data.sources.some((s) => (s.dx !== 0 || s.dy !== 0) && samples.plantedMoves.some((m) => Math.abs(s.dx - m.dx) <= 1 && Math.abs(s.dy - m.dy) <= 1));
}

const requireWhy = (why, what) => {
  if (typeof why !== 'string' || why.trim() === '') throw new GsFeelConfigError(`${what} needs a why: every exemption prints in every report`);
};
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function startTrace(page) {
  const cdp = await page.context().newCDPSession(page);
  const events = [];
  cdp.on('Tracing.dataCollected', (e) => { for (const v of e.value) events.push(v); });
  await cdp.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { includedCategories: [...TRACE_CATEGORIES], excludedCategories: ['*'] } });
  return {
    async stop() {
      const done = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
      await cdp.send('Tracing.end');
      await done;
      await cdp.detach();
      return events;
    },
  };
}

// the page's apparatus snapshot, judged here. it runs after setup and again on what arm() returns,
// so a page that drifts between the two is caught where the measuring starts (spec 7.8, 8.2) XX
function judgeApparatus(a, mode, m) {
  if (a === null) throw new GsFeelUnevaluable('window.__gsFeel is missing. the page was created before the feel fixture ran, or navigation reached a context the init script never saw');
  if (a.version !== PROBE_VERSION) throw new GsFeelUnevaluable(`probe version ${a.version} in the page, ${PROBE_VERSION} in node. two ghost signal copies are loaded`);
  const missing = ['event', 'layout-shift', 'longtask', 'long-animation-frame'].filter((t) => a.entryTypes.includes(t) === false);
  if (missing.length > 0) throw new GsFeelUnevaluable(`this browser has no ${missing.join(', ')} performance entries`);
  if (a.visibility !== 'visible') throw new GsFeelUnevaluable(`the page is ${a.visibility}. a hidden page throttles its timers and frames`);
  if (mode === 'still' && a.reducedMotion !== true) throw new GsFeelUnevaluable("mode 'still' but prefers-reduced-motion: reduce does not match. set media: { reducedMotion: 'reduce' } on the matrix entry");
  // calm judges signal at glitch 0. on a page at glitch 1 its rules pass on nothing
  if (mode === 'calm' && a.glitch !== '0') throw new GsFeelUnevaluable(`mode 'calm' but the page is at data-glitch="${a.glitch ?? ''}". setup has to land the page at glitch 0; the fixture never sets it`);
  if (m?.glitch !== undefined && a.glitch !== String(m.glitch)) throw new GsFeelUnevaluable(`matrix entry "${m.name}" says glitch ${m.glitch}, the page is at data-glitch="${a.glitch ?? ''}". setup has to land the page there`);
}

async function apparatus(page, mode, m) {
  judgeApparatus(await page.evaluate(() => (window.__gsFeel === undefined ? null : window.__gsFeel.apparatus())), mode, m);
}

async function armProbe(page, cfg, m) {
  judgeApparatus(await page.evaluate((c) => window.__gsFeel.arm(c), cfg), cfg.mode, m);
}

// the first input of a cold page pays setup costs (spec p4). pay them on a 1x1 corner element the
// app never sees, with real input, so no app control gets clicked for it
async function warmUp(page) {
  await page.evaluate(() => window.__gsFeel.mountWarmup());
  await page.locator('[data-gs-feel-warmup]').click({ position: { x: 0, y: 0 } });
  await page.keyboard.press('Shift');
  await page.evaluate(() => window.__gsFeel.unmountWarmup());
}

async function steady(page, budgets) {
  const deadline = Date.now() + 3000;
  for (;;) {
    const s = await page.evaluate((f) => window.__gsFeel.steady(30, f), budgets.vsyncMiss);
    if (s.misses <= STEADY_MISSES) return s;
    if (Date.now() > deadline) throw new GsFeelUnevaluable(`runner unsteady: ${s.misses} of 30 idle frames missed a vsync (at most ${STEADY_MISSES} allowed). the machine is busy, not the app`);
  }
}

async function environment(page, run) {
  const browser = page.context().browser();
  return {
    chromium: `chromium ${browser.version()}`,
    headlessShell: await page.evaluate(() => navigator.userAgent.includes('HeadlessChrome')),
    platform: `${process.platform} ${process.arch}`,
    viewport: page.viewportSize(),
    dpr: await page.evaluate(() => window.devicePixelRatio),
    interval: run?.steady?.interval ?? 16.7,
    calibration: run?.calibration ?? 0,
    steady: true,
  };
}

async function writeAttachment(testInfo, name, body, contentType) {
  const file = testInfo.outputPath(name);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, body);
  await testInfo.attach(name, { path: file, contentType });
}

async function attach(testInfo, report, runs) {
  const base = `feel-${slug(report.scenario)}-${slug(report.matrix)}`;
  await writeAttachment(testInfo, `${base}.txt`, formatReport(report), 'text/plain');
  await writeAttachment(testInfo, `${base}.json`, `${JSON.stringify(report, null, 2)}\n`, 'application/json');
  const failed = new Set(report.violations.flatMap((v) => v.runs ?? []));
  for (const r of runs) {
    if (failed.has(r.index)) await writeAttachment(testInfo, `${base}-run${r.index}.trace.json`, JSON.stringify({ traceEvents: r.events }), 'application/json');
  }
  for (const u of report.unconfirmed) {
    testInfo.annotations.push({ type: 'feel-unconfirmed', description: `${report.scenario} / ${report.matrix}: step ${u.step.index} "${u.step.name}" ${u.check} ${u.values.map((v) => `run ${v.run} ${v.value}`).join(', ')} (limit ${u.limit})` });
  }
  if (report.unconfirmed.length > 0 && process.env.GITHUB_STEP_SUMMARY) {
    const lines = report.unconfirmed.map((u) => `- step ${u.step.index} "${u.step.name}" ${u.check}: ${u.values.map((v) => `run ${v.run} ${v.value}`).join(', ')} (limit ${u.limit})`);
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `### feel unconfirmed: ${report.scenario} / ${report.matrix}\n\n${lines.join('\n')}\n\n`);
  }
}

async function drive(ctx, page) {
  let next = 0;
  const step = (kind) => async (name, fn, opts = {}) => {
    if (opts.answer === false) requireWhy(opts.why, `step "${name}" with answer: false`);
    const index = next;
    next += 1;
    await page.evaluate((a) => window.__gsFeel.stepStart(a), { index, name, kind, answer: opts.answer !== false, why: opts.why ?? null });
    await fn();
    await page.evaluate((t) => window.__gsFeel.stepEnd(t), opts.settleTimeout ?? ctx.budgets.settle);
  };
  const s = {
    input: step('input'),
    event: step('event'),
    scroll: step('scroll'),
    idle: (name, ms) => step('idle')(name, () => page.waitForTimeout(ms)),
  };
  await ctx.steps(s, ctx.matrix);
}

// one run: fresh setup, settle, warm, steady, then armed steps. only measured runs are traced
async function runOnce(ctx, index, measured) {
  const { page, matrix: m, budgets } = ctx;
  await page.emulateMedia({
    reducedMotion: m.media?.reducedMotion ?? 'no-preference',
    colorScheme: m.media?.colorScheme ?? (m.theme === 'light' ? 'light' : 'dark'),
  });
  await ctx.setup(m);
  await apparatus(page, ctx.mode, m);
  try {
    await page.evaluate(() => window.__gsFeel.ready());
  } catch (err) {
    throw new GsFeelUnevaluable(`the page never settled before arming: ${err.message}`);
  }
  await warmUp(page);
  const warmedAt = Date.now();
  const steadyResult = await steady(page, budgets);
  const calibration = await page.evaluate(() => window.__gsFeel.calibrate());
  const tracer = measured ? await startTrace(page) : null;
  const quiet = INPUT_QUIET_MS - (Date.now() - warmedAt);
  if (quiet > 0) await page.waitForTimeout(quiet);
  await armProbe(page, { run: index, allowShift: ctx.allowShift, mode: ctx.mode }, m);
  await drive(ctx, page);
  const samples = await page.evaluate(() => window.__gsFeel.disarm());
  if (tracer === null) return null;
  const events = await tracer.stop();
  return { index, samples, trace: summarizeTrace(events), events, steady: steadyResult, calibration };
}

function createFeel(page, testInfo, base) {
  const allowShift = [];
  const runsPlanned = Number(process.env.GS_FEEL_RUNS ?? base.runs);
  if ([1, 2, 3].includes(runsPlanned) === false) throw new GsFeelConfigError(`GS_FEEL_RUNS must be 1, 2 or 3, got ${process.env.GS_FEEL_RUNS}`);
  return {
    budgets: base,
    runs: runsPlanned,
    allowShift(selector, why) {
      requireWhy(why, `allowShift(${selector})`);
      allowShift.push({ selector, why });
    },
    async scenario(name, { matrix = [{ name: 'default' }], setup, steps, budgets: extra } = {}) {
      if (typeof setup !== 'function' || typeof steps !== 'function') throw new GsFeelConfigError(`scenario "${name}" needs setup and steps functions`);
      const budgets = extra === undefined ? base : mergeBudgets(base, extra);
      const reports = [];
      for (const m of matrix) {
        const ctx = { page, budgets, matrix: m, mode: m.mode ?? 'motion', allowShift: [...allowShift], setup, steps };
        let report;
        try {
          await runOnce(ctx, 0, false); // the unmeasured warm-up run: jit, caches, first raster (spec 8.5)
          const runs = [];
          for (let i = 1; i <= Math.min(2, runsPlanned); i++) runs.push(await runOnce(ctx, i, true));
          const judged = runs.map((r) => evaluateRun(budgets, r, { mode: ctx.mode }));
          if (runsPlanned === 3 && needsThirdRun(budgets, judged)) {
            const third = await runOnce(ctx, 3, true);
            runs.push(third);
            judged.push(evaluateRun(budgets, third, { mode: ctx.mode }));
          }
          report = combineRuns(budgets, judged, { scenario: name, matrix: m.name, mode: ctx.mode, env: await environment(page, runs[0]), runsPlanned, allowShift: ctx.allowShift });
          await attach(testInfo, report, runs);
        } catch (err) {
          if (err instanceof GsFeelUnevaluable) {
            // spec 7.9: an unevaluable run is a result too, in the same two files a pass or a fail gets
            const base = `feel-${slug(name)}-${slug(m.name)}`;
            await writeAttachment(testInfo, `${base}.txt`, `feel: ${name} / ${m.name} unevaluable. ${err.message}\n`, 'text/plain');
            const json = { version: REPORT_VERSION, scenario: name, matrix: m.name, mode: ctx.mode, result: 'unevaluable', reason: err.message };
            await writeAttachment(testInfo, `${base}.json`, `${JSON.stringify(json, null, 2)}\n`, 'application/json');
          }
          throw err;
        }
        if (report.result !== 'pass') throw new GsFeelError(formatReport(report), report);
        reports.push(report);
      }
      return reports;
    },
    // one unrepeated window inside a functional spec. deterministic checks only, so a functional
    // spec picks up shifts, properties, composites and families without becoming a timing test
    async measure({ mode = 'motion' } = {}) {
      await apparatus(page, mode, null);
      const tracer = await startTrace(page);
      await armProbe(page, { run: 0, allowShift: [...allowShift], mode }, null);
      await page.evaluate(() => window.__gsFeel.stepStart({ index: 0, name: 'measure', kind: 'event', answer: true, why: null }));
      return {
        async stop() {
          await page.evaluate((t) => window.__gsFeel.stepEnd(t), base.settle);
          const samples = sinceArm(await page.evaluate(() => window.__gsFeel.disarm()));
          const events = await tracer.stop();
          const run = evaluateRun(base, { index: 0, samples, trace: summarizeTrace(events), steady: null, calibration: 0 }, { mode });
          const structural = { ...run, steps: run.steps.map((s) => ({ ...s, frame: { worst: 0, over: [] }, input: null, task: { worst: 0, over: [], scripts: [] }, answer: null })) };
          const report = combineRuns(base, [structural], { scenario: 'measure', matrix: 'single window', mode, env: await environment(page, null), runsPlanned: 1, allowShift: [...allowShift] });
          if (report.result !== 'pass') throw new GsFeelError(formatReport(report), report);
          return report;
        },
      };
    },
    async selfTest() {
      await apparatus(page, 'motion', null);
      await page.evaluate(() => window.__gsFeel.plant());
      const tracer = await startTrace(page);
      await armProbe(page, { run: 0, allowShift: [], mode: 'motion' }, null);
      let samples;
      try {
        await page.evaluate(() => window.__gsFeel.stepStart({ index: 0, name: 'planted click', kind: 'input', answer: true, why: null }));
        await page.locator('button[data-gs-feel-planted]').click();
        await page.evaluate((t) => window.__gsFeel.stepEnd(t), base.settle);
        await page.evaluate(() => window.__gsFeel.stepStart({ index: 1, name: 'planted row lands', kind: 'idle', answer: true, why: null }));
        await page.waitForTimeout(800);
        await page.evaluate((t) => window.__gsFeel.stepEnd(t), base.settle);
      } finally {
        samples = await page.evaluate(() => window.__gsFeel.disarm());
      }
      const events = await tracer.stop();
      await page.evaluate(() => window.__gsFeel.unplant());
      const run = evaluateRun(base, { index: 0, samples: sinceArm(samples), trace: summarizeTrace(events), steady: null, calibration: 0 }, { mode: 'motion' });
      // each plant counts only as itself: the slow click on the step that clicked it, and the row by
      // what it is, a shift judged unprompted, landing within PLANT_LANDS_MS of the prepend and moving
      // a source by what the row moved the page. a violation from anywhere else is the page's, and
      // crediting it would let the harness pass on a bug it never saw XX
      if (typeof samples.plantedAt !== 'number') throw new GsFeelUnevaluable('self test: the planted row never landed inside the armed window, so there was no shift to see');
      const click = run.steps.find((s) => s.index === 0);
      const seen = new Set();
      if ((click?.input?.duration ?? 0) > base.input) seen.add('input');
      if ((click?.task.worst ?? 0) > base.task) seen.add('task');
      if (run.deterministic.some((v) => plantedShift(v, samples))) seen.add('shift');
      const missed = ['input', 'task', 'shift'].filter((c) => seen.has(c) === false);
      if (missed.length > 0) {
        const loud = run.steps.filter((s) => s.settled === false).map((s) => `step ${s.index} "${s.name}" never went quiet`);
        const moved = samples.plantedMoves.length === 0 ? ' the planted row moved nothing on this page.' : '';
        throw new GsFeelUnevaluable(`self test: the harness missed the planted ${missed.join(', ')}.${moved}${loud.length > 0 ? ` ${loud.join(', ')}.` : ''} nothing it says about this app counts until it sees a bug planted on purpose`);
      }
      return { seen: [...seen].sort() };
    },
  };
}

export function feelFixture({ budgets } = {}) {
  return [async ({ page }, use, testInfo) => {
    const name = page.context().browser()?.browserType().name();
    if (name !== 'chromium') throw new GsFeelUnevaluable(`the feel harness needs chromium, this run is ${name}. run it through feelProject()`);
    await page.addInitScript(installProbe);
    const base = budgets === undefined ? loadBudgets() : mergeBudgets(loadBudgets(), budgets);
    await use(createFeel(page, testInfo, base));
  }, { scope: 'test' }];
}

export function withFeel(test, options = {}) {
  return test.extend({ feel: feelFixture(options) });
}
