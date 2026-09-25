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
const gated = (selector) => /\[data-glitch="[12]"\]/.test(selector);
const stepped = (value) => /steps\(|var\(--[a-z0-9-]*step-[a-z0-9-]+\)/.test(value);
// split a transition list on its top-level commas only: cubic-bezier(0.16, 1, 0.3, 1) is one value
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
    for (const d of decls(r.body)) {
      if (ALLOWED.has(d.property) === false && d.property !== 'animation-timing-function') say('keyframe property', `@keyframes ${name} animates ${d.property}`);
    }
  }
  for (const name of keyframes) {
    if (/-(event|spatial)-/.test(name) === false) say('unclassified keyframes', `@keyframes ${name} is neither -event- nor -spatial-`);
  }
  for (const r of rules) {
    if (r.parents.some((p) => p.startsWith('@keyframes'))) continue;
    for (const d of decls(r.body)) {
      if (d.property === 'transition' || d.property === 'transition-property') {
        if (d.value === 'none') continue;
        for (const part of splitTop(d.value)) {
          const prop = d.property === 'transition' ? part.split(/\s+/)[0] : part;
          if (ALLOWED.has(prop) === false) say('transition property', `${r.selector} transitions ${prop}`);
          if (d.property === 'transition' && stepped(part)) say('spatial stepped', `${r.selector} transition ${part} uses steps()`);
        }
      }
      if (d.property === 'transition-timing-function' && stepped(d.value)) say('spatial stepped', `${r.selector} transition timing ${d.value} uses steps()`);
      if (d.property === 'animation' || d.property === 'animation-name') {
        for (const name of d.value.match(NAMED) ?? []) {
          if (name.includes('-event-')) {
            if (d.property === 'animation' && stepped(d.value) === false) say('event eased', `${r.selector} runs ${name} without steps()`);
            if (gated(r.selector) === false) say('ungated event', `${r.selector} runs ${name} outside :root[data-glitch="1"] or "2"`);
          } else if (d.property === 'animation' && stepped(d.value)) {
            say('spatial stepped', `${r.selector} runs ${name} with steps()`);
          }
        }
      }
    }
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
