import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatReport } from '../../src/feel/format.js';

const env = { chromium: 'chromium 145.0.7632.6', headlessShell: true, platform: 'linux x64', viewport: { width: 1470, height: 956 }, dpr: 2, interval: 16.7, calibration: 38, steady: true };
const step6 = { index: 6, name: 'click status bypass', kind: 'input', inputType: 'click' };
const step21 = { index: 21, name: '5 toasts arrive', kind: 'event', inputType: null };
const base = {
  version: 1, scenario: 'gallery', matrix: 'g1-dark', mode: 'motion', env, budgets: {}, exemptions: [],
  runs: [{ index: 1, steps: Array.from({ length: 20 }, (_, i) => ({ index: i })), seen: { animations: 14 }, info: [] }],
};

test('a failing report prints the spec 7.9 shape', () => {
  const report = {
    ...base, runsPlanned: 3, runsDone: 2, result: 'fail',
    violations: [
      { check: 'frame', step: step6, limit: 16.7, values: [{ run: 1, value: 31.2 }, { run: 2, value: 29.8 }], runs: [1, 2],
        data: { count: 2, worst: 31.2, at: 18, heavy: [{ name: 'Layout', ms: 11.4, count: 8, forcedFrom: 'src/gs.js:169 fxOnce' }, { name: 'UpdateLayoutTree', ms: 9.1, count: 8, forcedFrom: null }] } },
      { check: 'input', step: step6, limit: 50, values: [{ run: 1, value: 72 }, { run: 2, value: 72 }], runs: [1, 2],
        data: { name: 'click', duration: 72, inputDelay: 1, processing: 58, presentation: 13, scripts: [] } },
      { check: 'shift', step: step21, runs: [1], data: { value: 0.0031, sources: [{ path: 'gs-toast#toasts > div[part="slot"]:nth-child(1)', dx: 0, dy: -44 }] } },
    ],
    unconfirmed: [{ check: 'frame', step: { index: 12, name: 'arrow down', kind: 'input', inputType: 'key' }, limit: 16.7, values: [{ run: 1, value: 18.9 }, { run: 2, value: 12 }] }],
    stalls: [{ step: step6, what: 'a 40ms rAF gap with no cpu behind it', run: 1 }, { step: step6, what: 'a 38ms rAF gap with no cpu behind it', run: 2 }],
  };
  assert.equal(formatReport(report), [
    'feel: gallery / g1-dark failed 3 checks in 2 steps. runs 1 and 2 agree, run 3 skipped',
    'chromium 145.0.7632.6 headless shell, linux x64, 1470x956 @2x, vsync 16.7ms, calibration 38ms, steady',
    '',
    'step 6 "click status bypass" (input: click)',
    '  frame      2 frames over 16.7ms. worst 31.2ms main-thread cpu at +18ms (run 1 31.2, run 2 29.8)',
    '             inside: Layout 11.4ms x8, UpdateLayoutTree 9.1ms x8, forced from src/gs.js:169 fxOnce',
    '  input      click painted after 72ms (limit 50, rounded to 8ms). input delay 1, processing 58, presentation 13',
    '',
    'step 21 "5 toasts arrive" (event)',
    '  shift      0.0031 with no recent input. gs-toast#toasts > div[part="slot"]:nth-child(1) moved 0,-44',
    '             if intended, feel.allowShift(selector, why)',
    '',
    'unconfirmed: step 12 frame 18.9ms in run 1 only. annotated feel-unconfirmed',
    'stalls: 2 rAF gaps with no cpu behind them (runner descheduled chromium). informational',
    'exemptions: none',
    'passed: 18 other steps. 14 animations, all transform or opacity, all composited',
    '',
  ].join('\n'));
});

test('a passing strict report prints its exemptions and nothing else', () => {
  const report = {
    ...base, runsPlanned: 1, runsDone: 1, result: 'pass', violations: [], unconfirmed: [], stalls: [],
    exemptions: [{ kind: 'shift', target: '#feed', why: 'the feed grows by design', used: true }],
    runs: [{ index: 1, steps: [{ index: 0 }, { index: 1 }, { index: 2 }], seen: { animations: 3 }, info: [] }],
  };
  assert.equal(formatReport(report), [
    'feel: gallery / g1-dark passed. one run, strict',
    'chromium 145.0.7632.6 headless shell, linux x64, 1470x956 @2x, vsync 16.7ms, calibration 38ms, steady',
    '',
    'unconfirmed: none',
    'stalls: none',
    'exemptions: shift #feed (the feed grows by design)',
    'passed: 3 steps. 3 animations, all transform or opacity, all composited',
    '',
  ].join('\n'));
});

test('every check kind renders, in lowercase, with no em dash and no exclamation point', () => {
  const load = { index: null, name: 'load', kind: 'load', inputType: null };
  const s0 = { index: 0, name: 'open drawer', kind: 'input', inputType: 'click' };
  const report = {
    ...base, runsPlanned: 3, runsDone: 3, result: 'fail', unconfirmed: [],
    stalls: [{ step: s0, what: 'a 60ms task with 10ms of cpu', run: 2 }],
    exemptions: [{ kind: 'answer', target: 'step 0 "open drawer"', why: 'the press is the answer', used: false }],
    violations: [
      { check: 'shift', step: load, runs: [1], data: { value: 0.3313, sources: [{ path: 'section#faces', dx: 0, dy: 59.2 }] } },
      { check: 'task', step: s0, limit: 50, values: [{ run: 1, value: 73 }, { run: 2, value: 71 }, { run: 3, value: 12 }], runs: [1, 2], data: { worst: 73, over: [{ at: 4, tdur: 73, dur: 74 }], scripts: [{ invoker: 'button#slow.onclick', source: 'test/feel/pages/bad-input.html slowclick', ms: 70 }] } },
      { check: 'answer', step: s0, limit: 50, values: [{ run: 1, value: 64 }, { run: 2, value: 60 }, { run: 3, value: 61 }], runs: [1, 2, 3], data: { latency: 64, what: 'mutation' } },
      { check: 'silent', step: s0, runs: [1], data: {} },
      { check: 'settle', step: s0, runs: [1], data: { timeout: 1000 } },
      { check: 'property', step: s0, runs: [1], data: { target: 'button', pseudo: null, name: 'color', kind: 'css-transition', properties: ['color'] } },
      { check: 'composite', step: s0, runs: [1], data: { nodeName: "span id='inl'", displayName: '', bits: 1056, reasons: ['target has invalid compositing state', 'transform cannot be accelerated on the target'], unsupportedProperties: [] } },
      { check: 'family', step: s0, runs: [1], data: { rule: 'event eased', target: 'div#a', pseudo: '::after', name: 'sn-event-eased', kind: 'css-animation', easings: ['ease-out'] } },
      { check: 'drops', step: s0, runs: [1], data: { count: 2 } },
      { check: 'exemption', step: s0, runs: [], data: { kind: 'answer', target: 'step 0 "open drawer"', why: 'the press is the answer' } },
    ],
  };
  const text = formatReport(report);
  for (const line of [
    'load (after first paint)',
    '  shift      0.3313 with no recent input. section#faces moved 0,59.2',
    'step 0 "open drawer" (input: click)',
    '  task       1 task over 50ms of main-thread cpu. worst 73ms (run 1 73, run 2 71, run 3 12)',
    '             scripts: button#slow.onclick test/feel/pages/bad-input.html slowclick 70ms',
    '  answer     first answer 64ms after the input (mutation, limit 50)',
    '  silent     nothing answered the input. if intended, { answer: false, why }',
    '  settle     never settled within 1000ms. something kept animating or mutating',
    '  property   color animates color on button. only transform and opacity may animate',
    "  composite  an animation on span id='inl' ran on the main thread: target has invalid compositing state, transform cannot be accelerated on the target",
    '  family     event eased: sn-event-eased on div#a::after (ease-out)',
    '  drops      2 compositor frames dropped while this step ran',
    '  exemption  answer exemption on step 0 "open drawer" was declared and no run used it (the press is the answer)',
    'stalls: 1 task long on the wall clock only (runner descheduled chromium). informational',
    'exemptions: answer step 0 "open drawer" (the press is the answer), unused',
    'passed: 19 other steps. 14 animations, not all transform or opacity, not all composited',
  ]) assert.ok(text.includes(line), `missing: ${line}`);
  assert.equal(text.replaceAll('allowShift', ''), text.replaceAll('allowShift', '').toLowerCase());
  assert.doesNotMatch(text, /\u2014/);
  assert.doesNotMatch(text, /!/);
  assert.match(text, /^feel: gallery \/ g1-dark failed 10 checks in 2 steps\. runs 1 and 2 disagreed, run 3 decided\n/);
});

test('the stalls line counts rAF gaps and wall-clock-only tasks apart, and agrees at 1', () => {
  const s0 = { index: 0, name: 'open drawer', kind: 'input', inputType: 'click' };
  const stalls = [
    { step: s0, what: 'a 40ms rAF gap with no cpu behind it', run: 1 },
    { step: s0, what: 'a 60ms task with 10ms of cpu', run: 1 },
    { step: s0, what: 'a 72ms task with 30ms of cpu', run: 2 },
  ];
  const line = (st) => formatReport({ ...base, runsPlanned: 1, runsDone: 1, result: 'pass', violations: [], unconfirmed: [], stalls: st })
    .split('\n').find((l) => l.startsWith('stalls:'));
  assert.equal(line(stalls), 'stalls: 1 rAF gap with no cpu behind it, 2 tasks long on the wall clock only (runner descheduled chromium). informational');
  assert.equal(line(stalls.slice(0, 1)), 'stalls: 1 rAF gap with no cpu behind it (runner descheduled chromium). informational');
  assert.equal(line(stalls.slice(1)), 'stalls: 2 tasks long on the wall clock only (runner descheduled chromium). informational');
});
