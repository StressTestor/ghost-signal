import { test as base, expect } from '@playwright/test';
import { withFeel, feelUse } from '../../src/feel/playwright.js';

// the harness's own controls. a harness that passes a planted bug is broken, and one that fails
// the clean page is measuring itself; this file is what proves it does neither (spec 9.4)
const test = withFeel(base);
const url = (name) => `/test/feel/pages/${name}.html`;

test('the clean control passes every check, steady, and every step settles', async ({ page, feel }) => {
  test.setTimeout(120_000);
  const [report] = await feel.scenario('clean', {
    setup: async () => { await page.goto(url('clean')); },
    steps: async (s) => {
      await s.input('toggle', () => page.locator('#toggle').click());
      // spec p5: a fast key press may get no event timing entry at all. the step is evaluable anyway,
      // through the probe's trusted keydown and eventCounts, and an apparatus gap here would throw
      await s.input('press t', () => page.keyboard.press('t'));
      await s.event('flip insert', () => page.evaluate(() => window.cleanInsert()));
      await s.event('toast burst', () => page.evaluate(() => window.cleanToasts(5)));
      await s.scroll('scroll the scroller', async () => {
        await page.locator('#scroller').hover();
        await page.mouse.wheel(0, 600);
      });
      await s.idle('idle', 300);
    },
  });
  expect(report.result).toBe('pass');
  expect(report.violations).toEqual([]);
  for (const run of report.runs) for (const step of run.steps) expect(step.settled, `${step.name} settled`).toBe(true);
  expect(report.runs[0].seen.animations, 'the positive control: the harness saw the flip and the toasts').toBeGreaterThan(0);
  expect(report.runs[0].detail.answers.map((a) => a.what).every((w) => w !== null), 'both input steps were answered').toBe(true);
  expect(report.env.dpr, 'the page ran at the profile dpr').toBe(feelUse.deviceScaleFactor);
});

test('feel.measure() judges one window inside a functional spec: the clean insert passes', async ({ page, feel }) => {
  test.setTimeout(60_000);
  await page.goto(url('clean'));
  await page.evaluate(() => window.__gsFeel.ready());
  const m = await feel.measure();
  await page.evaluate(() => window.cleanInsert());
  const report = await m.stop();
  expect(report.result).toBe('pass');
  expect(report.runs[0].seen.animations, 'the positive control: measure saw the flip').toBeGreaterThan(0);
});

// an unprompted 40px row above everything, landed from evaluate with no input anywhere near it
const shiftNow = (page) => page.evaluate(() => {
  const d = document.createElement('div');
  d.style.height = '40px';
  d.textContent = 'earlier';
  document.body.prepend(d);
});

test('feel.measure() judges only its own window: a shift before it armed is not its business', async ({ page, feel }) => {
  test.setTimeout(60_000);
  await page.goto(url('clean'));
  await page.evaluate(() => window.__gsFeel.ready());
  await shiftNow(page);
  await page.waitForTimeout(300);
  const m = await feel.measure();
  await page.waitForTimeout(50);
  const report = await m.stop();
  expect(report.result).toBe('pass');
  expect(report.runs[0].seen.shifts, 'the earlier shift stays out of the window').toBe(0);
});

test('feel.selfTest() sees the planted shift on a page that already shifted', async ({ page, feel }) => {
  test.setTimeout(60_000);
  await page.goto(url('clean'));
  await page.evaluate(() => window.__gsFeel.ready());
  await shiftNow(page);
  await page.waitForTimeout(700);
  const result = await feel.selfTest();
  expect(result.seen).toEqual(expect.arrayContaining(['input', 'shift', 'task']));
});

// an app shell lays the body out in a row, so the planted row lands as a column and pushes its
// siblings sideways with no vertical move at all. selfTest has to see that shift too
test('feel.selfTest() sees the planted shift on a page laid out in a row', async ({ page, feel }) => {
  test.setTimeout(60_000);
  await page.goto(url('clean'));
  await page.evaluate(() => window.__gsFeel.ready());
  await page.evaluate(() => {
    for (const el of [...document.body.children]) if (el.localName !== 'script') el.remove();
    document.body.style.cssText = 'display:flex;flex-direction:row;align-items:flex-start;gap:8px;margin:0';
    const aside = document.createElement('aside');
    aside.style.cssText = 'width:200px;height:400px';
    aside.textContent = 'sidebar';
    const main = document.createElement('main');
    main.style.cssText = 'width:600px;height:400px';
    main.textContent = 'main';
    document.body.append(aside, main);
  });
  await page.waitForTimeout(300);
  const result = await feel.selfTest();
  expect(result.seen).toEqual(expect.arrayContaining(['input', 'shift', 'task']));
});

test('feel.selfTest() never credits an earlier shift for the planted one', async ({ page, feel }) => {
  test.setTimeout(60_000);
  await page.goto(url('untrusted'));
  await page.evaluate(() => window.__gsFeel.ready());
  await shiftNow(page);
  await page.waitForTimeout(700);
  // nothing left in flow, so the planted row lands and moves nothing
  await page.evaluate(() => { for (const el of [...document.body.children]) if (el.localName !== 'script') el.remove(); });
  await page.waitForTimeout(200);
  const err = await feel.selfTest().then(() => null, (e) => e);
  expect(err?.name).toBe('GsFeelUnevaluable');
  expect(err.message).toContain('missed the planted shift');
});

// a live counter: a fixed span rewritten every frame. it's a non-ambient mutation, so a step that
// holds it never goes quiet and runs to its settle timeout. left-anchored at a fixed width, it never
// moves; right-anchored, its width changes with the text and it shifts itself a hair every frame
const tickNow = (page, side) => page.evaluate((sd) => {
  const t = document.createElement('span');
  t.style.cssText = sd === 'left' ? 'position:fixed;left:8px;top:8px;width:80px;display:block' : 'position:fixed;right:0;top:0';
  document.body.append(t);
  let n = 0;
  const f = () => { t.textContent = sd === 'left' ? String(n++) : 'x'.repeat((n++ % 5) + 1); requestAnimationFrame(f); };
  requestAnimationFrame(f);
}, side);

test('feel.selfTest() sees the planted shift on a page whose steps never go quiet', async ({ page, feel }) => {
  test.setTimeout(60_000);
  await page.goto(url('clean'));
  await page.evaluate(() => window.__gsFeel.ready());
  await tickNow(page, 'left');
  await page.waitForTimeout(300);
  const result = await feel.selfTest();
  expect(result.seen).toEqual(expect.arrayContaining(['input', 'shift', 'task']));
});

test("feel.selfTest() never credits the page's own shift for the planted one", async ({ page, feel }) => {
  test.setTimeout(60_000);
  await page.goto(url('untrusted'));
  await page.evaluate(() => window.__gsFeel.ready());
  // nothing left in flow, so the planted row lands and moves nothing, while the badge shifts itself
  // on every frame, inside the window where the row lands too
  await page.evaluate(() => { for (const el of [...document.body.children]) if (el.localName !== 'script') el.remove(); });
  await tickNow(page, 'right');
  await page.waitForTimeout(300);
  const err = await feel.selfTest().then(() => null, (e) => e);
  expect(err?.name).toBe('GsFeelUnevaluable');
  expect(err.message).toContain('missed the planted shift');
});

test('the warm-up leaves focus where setup put it', async ({ page, feel }) => {
  test.setTimeout(60_000);
  const seen = [];
  await feel.scenario('focus', {
    setup: async () => {
      await page.goto(url('untrusted'));
      await page.locator('#b').focus();
    },
    steps: async (s) => {
      seen.push(await page.evaluate(() => `${document.activeElement.localName}#${document.activeElement.id}`));
      await s.idle('idle', 100);
    },
  });
  expect(seen.length, 'the warm-up run and at least one measured run').toBeGreaterThanOrEqual(2);
  for (const f of seen) expect(f, 'focus at the first step').toBe('button#b');
});

test('an input step driven by evaluate is unevaluable, never a pass', async ({ page, feel }) => {
  test.setTimeout(60_000);
  const err = await feel.scenario('untrusted', {
    setup: async () => { await page.goto(url('untrusted')); },
    steps: async (s) => { await s.input('fake click', () => page.evaluate(() => document.getElementById('b').click())); },
  }).then(() => null, (e) => e);
  expect(err?.name).toBe('GsFeelUnevaluable');
  expect(err.message).toContain('no trusted pointerdown or keydown');
});

// spec 8.7: the compositeFailed bits the pinned chromium reports for a transform on an inline span
const BAD_COMPOSITE_BITS = 1056;

async function failing(promise) {
  const err = await promise.then(() => null, (e) => e);
  expect(err, 'the scenario should have failed').not.toBeNull();
  expect(err.name, err.message).toBe('GsFeelError');
  return err;
}
const fired = (err) => err.report.violations.map((v) => `${v.check}@${v.step?.name ?? 'scenario'}`);
const one = (page, name, stepName, fn) => ({
  setup: async () => { await page.goto(url(name)); },
  steps: async (s) => { await s.event(stepName, fn); },
});

test('transform moves and flip inserts register no layout shift at all', async ({ page, feel }) => {
  test.setTimeout(90_000);
  const [report] = await feel.scenario('transform-no-shift', {
    setup: async () => { await page.goto(url('transform-no-shift')); },
    steps: async (s) => {
      await s.event('move by transform', () => page.evaluate(() => window.moveByTransform()));
      await s.event('flip insert, no input', () => page.evaluate(() => window.flipInsert()));
    },
  });
  expect(report.result).toBe('pass');
  for (const run of report.runs) expect(run.seen.shifts).toBe(0);
});

test('bad-frame: ten 30ms frames fail the frame check and name the callback', async ({ page, feel }) => {
  test.setTimeout(90_000);
  const err = await failing(feel.scenario('bad-frame', one(page, 'bad-frame', 'ten slow frames', () => page.evaluate(() => window.burnFrames(10)))));
  expect(fired(err)).toContain('frame@ten slow frames');
  expect(fired(err)).not.toContain('task@ten slow frames');
  // the step name says nothing about the callback, so only the inside: line can name it
  const inside = err.message.split('\n').find((l) => l.trim().startsWith('inside:'));
  expect(inside).toMatch(/FunctionCall test\/feel\/pages\/bad-frame\.html:\d+ burn \d/);
});

test('bad-input: an 80ms click fails input and task and names the handler', async ({ page, feel }) => {
  test.setTimeout(90_000);
  const err = await failing(feel.scenario('bad-input', {
    setup: async () => { await page.goto(url('bad-input')); },
    steps: async (s) => { await s.input('click slow', () => page.locator('#slow').click()); },
  }));
  expect(fired(err)).toEqual(expect.arrayContaining(['input@click slow', 'task@click slow']));
  expect(err.message).toContain('slowclick');
});

test('bad-key: an 80ms keydown fails input on the key path', async ({ page, feel }) => {
  test.setTimeout(90_000);
  const err = await failing(feel.scenario('bad-key', {
    setup: async () => { await page.goto(url('bad-key')); },
    steps: async (s) => { await s.input('press a', () => page.keyboard.press('a')); },
  }));
  expect(fired(err)).toContain('input@press a');
  expect(err.message).toContain('slowkey');
});

test('bad-task: a 70ms timer fails task, and no input or answer check fires', async ({ page, feel }) => {
  test.setTimeout(90_000);
  const err = await failing(feel.scenario('bad-task', one(page, 'bad-task', 'timer burns 70ms', () => page.evaluate(() => window.later()))));
  expect(fired(err)).toContain('task@timer burns 70ms');
  expect(fired(err).some((f) => f.startsWith('input@') || f.startsWith('answer@') || f.startsWith('silent@'))).toBe(false);
  expect(err.message).toContain('slowtimer');
});

test('bad-shift: a row landing above the fold fails shift and names the list', async ({ page, feel }) => {
  test.setTimeout(90_000);
  const err = await failing(feel.scenario('bad-shift', one(page, 'bad-shift', 'row lands above', () => page.evaluate(() => window.insertAbove()))));
  expect(fired(err)).toContain('shift@row lands above');
  expect(err.message).toContain('div#list');
  // the warm-up's Shift is 600ms or more behind the first step (task 6), so the planted shift can't
  // be excused as the ui answering an input
  expect(err.report.runs[0].detail.shifts.filter((x) => x.sources.some((src) => src.path.includes('div#list'))).every((x) => x.hadRecentInput === false)).toBe(true);
});

test('feel.measure() throws on a deterministic violation: the bad-shift row', async ({ page, feel }) => {
  test.setTimeout(60_000);
  await page.goto(url('bad-shift'));
  await page.evaluate(() => window.__gsFeel.ready());
  const m = await feel.measure();
  await page.evaluate(() => window.insertAbove());
  const err = await m.stop().then(() => null, (e) => e);
  expect(err?.name).toBe('GsFeelError');
  expect(fired(err)).toContain('shift@measure');
});

test('bad-property: left and background-color both fail the property check', async ({ page, feel }) => {
  test.setTimeout(90_000);
  const err = await failing(feel.scenario('bad-property', one(page, 'bad-property', 'left and background', () => page.evaluate(() => window.paint()))));
  const props = err.report.violations.filter((v) => v.check === 'property').flatMap((v) => v.data.properties);
  expect(props).toEqual(expect.arrayContaining(['left', 'background-color']));
  expect(err.message).toContain('animates left');
  expect(err.message).toContain('animates background-color');
  // spec p20: the 0ms transition on #zero changed in the same step and created no Animation
  expect(err.report.runs[0].detail.animations.some((a) => a.target.includes('div#zero'))).toBe(false);
  // spec p14: the ::after animation was found through getAnimations({ subtree: true }) and named
  expect(err.report.violations.some((v) => v.check === 'property' && v.data.target.includes('div#pseudo') && v.data.pseudo === '::after' && v.data.properties.includes('left'))).toBe(true);
});

test('bad-composite: transform on an inline span fails composite with the pinned bits', async ({ page, feel }) => {
  test.setTimeout(90_000);
  const err = await failing(feel.scenario('bad-composite', one(page, 'bad-composite', 'inline span slides', () => page.evaluate(() => window.slideInline()))));
  const v = err.report.violations.find((x) => x.check === 'composite');
  expect(v.data.bits).toBe(BAD_COMPOSITE_BITS);
  expect(v.data.nodeName).toContain('span');
  expect(fired(err).some((f) => f.startsWith('property@'))).toBe(false);
  expect(err.message).toContain('transform cannot be accelerated on the target');
});

test('bad-overlap: a restack transition behind a finished, attached enter fails composite bit 6 on that element', async ({ page, feel }) => {
  test.setTimeout(90_000);
  const err = await failing(feel.scenario('bad-overlap', {
    setup: async () => { await page.goto(url('bad-overlap')); },
    steps: async (s) => {
      await s.event('enter lands', () => page.evaluate(() => window.heldEnter()));
      await s.event('restack', () => page.evaluate(() => window.restack()));
    },
  }));
  const v = err.report.violations.filter((x) => x.check === 'composite');
  expect(v.map((x) => [x.step.name, x.data.nodeName, x.data.bits & 64])).toEqual([['restack', "div id='held' class='box'", 64]]);
  expect(err.message).toContain('another animation on the same property');
});

test('bad-family: eased event, stepped space and a shared carrier each fail', async ({ page, feel }) => {
  test.setTimeout(90_000);
  const err = await failing(feel.scenario('bad-family', {
    setup: async () => { await page.goto(url('bad-family')); },
    steps: async (s) => {
      await s.event('eased event', () => page.evaluate(() => window.eased()));
      await s.event('stepped space', () => page.evaluate(() => window.stepped()));
      await s.event('glitch mid slide', () => page.evaluate(() => window.glitchMidSlide()));
      await s.event('half eased event', () => page.evaluate(() => window.mixed()));
    },
  }));
  const rules = err.report.violations.filter((v) => v.check === 'family').map((v) => v.data.rule);
  expect(rules).toEqual(expect.arrayContaining(['event eased', 'spatial stepped', 'one carrier']));
  expect(err.message).toContain('sn-event-eased');
  // the stepped glitch is the negative's own control: the eased check has to tell the two apart
  const eased = err.report.violations.filter((v) => v.data.rule === 'event eased').map((v) => v.data.name);
  expect(eased).toContain('sn-event-mixed');
  expect(eased).not.toContain('sn-event-glitch');
});

test('bad-family in calm mode: a signal at glitch 0 fails', async ({ page, feel }) => {
  test.setTimeout(90_000);
  const err = await failing(feel.scenario('bad-family-calm', {
    matrix: [{ name: 'calm', glitch: '0', mode: 'calm' }],
    setup: async () => {
      await page.goto(url('bad-family'));
      await page.evaluate(() => { document.documentElement.dataset.glitch = '0'; });
    },
    steps: async (s) => { await s.event('glitch at zero', () => page.evaluate(() => window.glitchAtZero())); },
  }));
  expect(err.report.violations.map((v) => v.data.rule)).toContain('signal at glitch 0');
});

test('a calm scenario on a page not at glitch 0 is unevaluable, and so is a matrix glitch the page never reached', async ({ page, feel }) => {
  test.setTimeout(60_000);
  const setup = async () => {
    await page.goto(url('bad-family'));
    await page.evaluate(() => { document.documentElement.dataset.glitch = '1'; });
  };
  const steps = async (s) => { await s.event('glitch', () => page.evaluate(() => window.glitchAtZero())); };
  const calm = await feel.scenario('calm-at-glitch-1', { matrix: [{ name: 'calm', mode: 'calm' }], setup, steps }).then(() => null, (e) => e);
  expect(calm?.name).toBe('GsFeelUnevaluable');
  expect(calm.message).toContain("mode 'calm' but the page is at data-glitch=\"1\"");
  const drift = await feel.scenario('matrix-says-0', { matrix: [{ name: 'g0', glitch: '0' }], setup, steps }).then(() => null, (e) => e);
  expect(drift?.name).toBe('GsFeelUnevaluable');
  expect(drift.message).toContain('says glitch 0');
});

test('bad-silent: a dead control and an ambient-only change both fail as silent', async ({ page, feel }) => {
  test.setTimeout(90_000);
  const err = await failing(feel.scenario('bad-silent', {
    setup: async () => { await page.goto(url('bad-silent')); },
    steps: async (s) => {
      await s.input('dead control', () => page.locator('#dead').click());
      await s.input('wallpaper tick', () => page.locator('#tick').click());
    },
  }));
  expect(fired(err)).toEqual(expect.arrayContaining(['silent@dead control', 'silent@wallpaper tick']));
  // the #bg wallpaper stepped every 40ms through both steps; ambient mutations never hold a step open
  expect(fired(err).some((f) => f.startsWith('settle@'))).toBe(false);
});

test('a declared exemption no run uses fails the scenario', async ({ page, feel }) => {
  test.setTimeout(90_000);
  feel.allowShift('#nothing-shifts-here', 'a control for the unused-exemption rule');
  const err = await failing(feel.scenario('unused-exemption', {
    setup: async () => { await page.goto(url('clean')); },
    steps: async (s) => { await s.input('toggle', () => page.locator('#toggle').click()); },
  }));
  expect(fired(err)).toContain('exemption@scenario');
});

test('the self test sees the planted input, task and shift', async ({ page, feel }) => {
  test.setTimeout(60_000);
  await page.goto(url('clean'));
  await page.evaluate(() => window.__gsFeel.ready());
  const result = await feel.selfTest();
  expect(result.seen).toEqual(expect.arrayContaining(['input', 'shift', 'task']));
});
