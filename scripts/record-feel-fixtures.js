#!/usr/bin/env node
// records the chromium traces the trace.js unit tests read, filtered to what trace.js consumes.
// dev only, run on demand. re-record after any @playwright/test bump and commit the result
// (spec 13, risk 3): a pinned chromium is what makes these files mean anything XX
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const out = new URL('../test/unit/fixtures/feel/', import.meta.url);
const CATEGORIES = [
  'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame',
  'devtools.timeline',
  'blink.animations',
  'blink.user_timing',
  'input',
];
const KEEP = new Set([
  'RunTask', 'BeginMainThreadFrame', 'PipelineReporter', 'Animation', 'EventLatency',
  'Layout', 'UpdateLayoutTree', 'Paint', 'FunctionCall', 'EventDispatch', 'TimerFire',
]);

const mark = (page, name) => page.evaluate((n) => performance.mark(n), name);
// an idle page only begins a main-thread frame when something asks for one. the feel probe's rAF
// loop asks every vsync, so the fixture pages run the same loop or their traces hold almost no
// BeginMainThreadFrame to judge
const RAF_LOOP = '<script>requestAnimationFrame(function tick() { requestAnimationFrame(tick); });</script>';

const PAGES = {
  'click-70ms': {
    html: `<!doctype html><html><body>
      <button id="slow">slow</button>
      <script>
        document.getElementById('slow').addEventListener('click', function slowclick() {
          const t = performance.now(); while (performance.now() - t < 70) {}
          document.body.dataset.clicked = '1';
        });
        document.addEventListener('keydown', function slowkey() {
          const t = performance.now(); while (performance.now() - t < 60) {}
        });
      </script>${RAF_LOOP}</body></html>`,
    async drive(page) {
      await mark(page, 'gs-feel:1:0:start');
      await page.locator('#slow').click();
      await page.waitForTimeout(200);
      await mark(page, 'gs-feel:1:0:end');
      await mark(page, 'gs-feel:1:1:start');
      await page.keyboard.press('a');
      await page.waitForTimeout(200);
      await mark(page, 'gs-feel:1:1:end');
    },
  },
  composite: {
    html: `<!doctype html><html><head><style>
      #hover { color: #eef1f2; background: #0c0c0d; transition: color 80ms ease-out; }
      #hover:hover { color: #0ec224; }
      #blk { width: 80px; height: 40px; background: #0ec224; }
    </style></head><body>
      <button id="hover">v0.1 hover</button>
      <div id="blk"></div>
      <span id="inl">inline span</span>
      ${RAF_LOOP}
    </body></html>`,
    async drive(page) {
      await mark(page, 'gs-feel:1:0:start');
      await page.locator('#hover').hover();
      await page.evaluate(() => {
        document.getElementById('inl').animate([{ transform: 'translateX(0)' }, { transform: 'translateX(40px)' }], { duration: 200, id: 'gs-move:inline' });
        document.getElementById('blk').animate([{ transform: 'translateX(0)' }, { transform: 'translateX(40px)' }], { duration: 200, id: 'gs-move:block' });
      });
      await page.waitForTimeout(400);
      await mark(page, 'gs-feel:1:0:end');
    },
  },
  // three animations one after another: chromium hands the second and third the id2.local the
  // first one freed, so a decoder keyed on the id alone merges three animations into one record
  reuse: {
    html: `<!doctype html><html><body>
      <div id="a" style="width:80px;height:40px;background:#0ec224">a</div>
      <p>an <span id="inl">inline span</span></p>
      <div id="b" style="width:80px;height:40px;background:#0ec224">b</div>
      ${RAF_LOOP}
    </body></html>`,
    async drive(page) {
      await mark(page, 'gs-feel:1:0:start');
      for (const id of ['inl', 'a', 'b']) {
        await page.evaluate((i) => document.getElementById(i).animate([{ transform: 'translateX(0)' }, { transform: 'translateX(40px)' }], { duration: 100, id: `gs-move:${i}` }), id);
        await page.waitForTimeout(300);
      }
      await mark(page, 'gs-feel:1:0:end');
    },
  },
};

async function record(browser, name, { html, drive }) {
  const context = await browser.newContext({ viewport: { width: 1470, height: 956 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.setContent(html);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const cdp = await context.newCDPSession(page);
  const events = [];
  cdp.on('Tracing.dataCollected', (e) => { for (const v of e.value) events.push(v); });
  await cdp.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { includedCategories: CATEGORIES, excludedCategories: ['*'] } });
  await drive(page);
  const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.end');
  await done;
  await context.close();
  const started = events.find((e) => e.name === 'TracingStartedInBrowser');
  const renderer = started?.args?.data?.frames?.find((f) => f.isOutermostMainFrame === true)?.processId;
  if (renderer === undefined) throw new Error(`${name}: no TracingStartedInBrowser with a main frame`);
  // other pids' RunTasks stay too, a few hundred of them, so the pid selection test has decoys
  const kept = events.filter((e) => e.ph === 'M' || e === started
    || (e.name === 'RunTask' && e.pid !== renderer && e.dur > 1000)
    || (e.pid === renderer && (KEEP.has(e.name) || e.cat === 'blink.user_timing')));
  const body = `{"chromium":${JSON.stringify(browser.version())},"traceEvents":[\n${kept.map((e) => JSON.stringify(e)).join(',\n')}\n]}\n`;
  await writeFile(new URL(`${name}.trace.json`, out), body);
  process.stdout.write(`wrote test/unit/fixtures/feel/${name}.trace.json (${kept.length} events)\n`);
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
try {
  for (const [name, spec] of Object.entries(PAGES)) await record(browser, name, spec);
} finally {
  await browser.close();
}
