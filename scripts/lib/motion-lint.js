// the static twin of the feel harness's property and family checks, for css files. an app runs it
// in gs:check so a bad keyframe fails before any browser opens (spec 7.4). the names are the
// classification: -event- keyframes are signal and step, -spatial- keyframes are space and ease
import { glob } from 'node:fs/promises';
import { cssRules } from './contrast.js';

const ALLOWED = new Set(['transform', 'opacity']);
const NAMED = /\b[a-z][a-z0-9]*(?:-[a-z0-9]+)*-(?:event|spatial)-[a-z0-9-]+/g;

const decls = (body) => body.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
  const i = d.indexOf(':');
  return { property: d.slice(0, i).trim().toLowerCase(), value: d.slice(i + 1).trim() };
});
// step-end and step-start are steps(1) and steps(1, start) in a trench coat. the harness counts them, so do we
const stepped = (value) => /steps\(|\bstep-(?:start|end)\b|var\(--[a-z0-9-]*step-[a-z0-9-]+\)/.test(value);
// split a list on its top-level commas only: cubic-bezier(0.16, 1, 0.3, 1) is one value, and
// :root:is(.a, .b) .c is one selector
const splitTop = (value) => {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of value) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim() !== '') out.push(cur.trim());
  return out;
};
// :root:not([data-glitch="1"]) is the gate turned inside out, so a :not(...) never counts as one
const dropNot = (selector) => {
  let out = '';
  for (let i = 0; i < selector.length; i += 1) {
    if (selector.startsWith(':not(', i)) {
      let depth = 0;
      let j = i + 4;
      for (; j < selector.length; j += 1) {
        if (selector[j] === '(') depth += 1;
        if (selector[j] === ')') { depth -= 1; if (depth === 0) break; }
      }
      i = j;
      continue;
    }
    out += selector[i];
  }
  return out;
};
const GATE = /^:root[^\s>+~]*\[data-glitch\s*=\s*(["']?)[12]\1\s*\]/;
// every branch of a selector list has to carry the gate on :root. one bare branch and the event
// runs at glitch 0 while its gated sibling looks innocent (¬‿¬)
const ungated = (selector) => splitTop(selector).filter((branch) => GATE.test(dropNot(branch)) === false);
// the keyframes name one animation of a list runs. a var() is skipped so --x-event-y never reads as a name
const nameOf = (part) => part.replace(/var\([^()]*\)/g, '').match(NAMED)?.[0];

export function lintMotion(css, file) {
  const findings = [];
  const say = (rule, detail) => findings.push(`${file}: ${rule}: ${detail}`);
  const rules = cssRules(css);
  const keyframes = new Set();
  for (const r of rules) {
    const kf = r.parents.find((p) => p.startsWith('@keyframes'));
    if (kf === undefined) continue;
    const name = kf.slice('@keyframes'.length).trim();
    keyframes.add(name);
    // a keyframe's timing runs to the next keyframe, so the last one's covers nothing (the harness agrees)
    const last = r.selector.split(',').every((s) => /^(?:to|100%)$/i.test(s.trim()));
    for (const d of decls(r.body)) {
      if (d.property === 'animation-timing-function') {
        if (last) continue;
        if (name.includes('-event-') && stepped(d.value) === false) say('event eased', `@keyframes ${name} eases a step with ${d.value}`);
        if (name.includes('-spatial-') && stepped(d.value)) say('spatial stepped', `@keyframes ${name} steps with ${d.value}`);
        continue;
      }
      if (ALLOWED.has(d.property) === false) say('keyframe property', `@keyframes ${name} animates ${d.property}`);
    }
  }
  for (const name of keyframes) {
    if (/-(event|spatial)-/.test(name) === false) say('unclassified keyframes', `@keyframes ${name} is neither -event- nor -spatial-`);
  }
  for (const r of rules) {
    if (r.parents.some((p) => p.startsWith('@keyframes'))) continue;
    // one entry per animation in the list, in declaration order: a later shorthand resets the
    // timing, a later longhand overrides it. null means this rule never set it
    let names = null;
    let timings = null;
    for (const d of decls(r.body)) {
      if (d.property === 'animation') {
        const parts = splitTop(d.value);
        names = parts.map(nameOf);
        timings = parts;
      }
      if (d.property === 'animation-name') names = splitTop(d.value).map(nameOf);
      if (d.property === 'animation-timing-function') timings = splitTop(d.value);
      if (d.property === 'transition' || d.property === 'transition-property') {
        if (d.value === 'none') continue;
        for (const part of splitTop(d.value)) {
          const prop = d.property === 'transition' ? part.split(/\s+/)[0] : part;
          if (ALLOWED.has(prop) === false) say('transition property', `${r.selector} transitions ${prop}`);
          if (d.property === 'transition' && stepped(part)) say('spatial stepped', `${r.selector} transition ${part} uses steps()`);
        }
      }
      if (d.property === 'transition-timing-function' && stepped(d.value)) say('spatial stepped', `${r.selector} transition timing ${d.value} uses steps()`);
    }
    if (names === null) continue;
    names.forEach((name, i) => {
      if (name === undefined) return;
      // timings repeat to fill the names, like the cascade does. a rule that sets only the name may
      // get its timing from another rule, so its easing isn't judged here; the harness still sees it
      const timing = timings === null ? null : timings[i % timings.length];
      if (name.includes('-event-')) {
        if (timing !== null && stepped(timing) === false) say('event eased', `${r.selector} runs ${name} without steps()`);
        for (const branch of ungated(r.selector)) say('ungated event', `${branch} runs ${name} outside :root[data-glitch="1"] or "2"`);
      } else if (timing !== null && stepped(timing)) {
        say('spatial stepped', `${r.selector} runs ${name} with steps()`);
      }
    });
  }
  return findings;
}

// consumers quote their globs (lint-motion 'src/**/*.css') so the shell leaves them alone
export async function expandGlobs(args) {
  const out = new Set();
  for (const a of args) {
    if (/[*?[]/.test(a) === false) { out.add(a); continue; }
    for await (const f of glob(a)) out.add(f);
  }
  return [...out].sort();
}
