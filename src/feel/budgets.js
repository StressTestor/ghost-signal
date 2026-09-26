// the feel budgets and the small rules every check shares. the numbers live in tokens.json, so an
// app gets the budgets of the ghost signal tag it pins, and an override can only tighten them.
// there is no loosening knob. that's the point (¬_¬)
import { readFileSync } from 'node:fs';
import { GsFeelConfigError } from './errors.js';

export { GsFeelConfigError, GsFeelUnevaluable, GsFeelError } from './errors.js';

const TOKENS_URL = new URL('../../tokens.json', import.meta.url);
const DURATIONS = ['frame', 'input', 'task', 'answer', 'settle'];
const LOOSEN = 'budgets can only tighten. declare an exemption on the step instead';
export const BOOKKEEPING_KEYS = Object.freeze(['offset', 'computedOffset', 'computed-offset', 'easing', 'composite']);

export function parseDuration(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const m = /^(\d+(?:\.\d+)?)(ms|s)$/.exec(String(v).trim());
  if (m === null) throw new GsFeelConfigError(`not a duration: ${JSON.stringify(v)}`);
  return Number(m[1]) * (m[2] === 's' ? 1000 : 1);
}

// tokens.json sits next to src/, outside it. a vendored copy synced before the script carried it
// has no such file, and a bare node ENOENT names neither the harness nor the fix
function readTokens(url) {
  try {
    return readFileSync(url, 'utf8');
  } catch (e) {
    if (e?.code !== 'ENOENT') throw e;
    throw new GsFeelConfigError(`${url} is missing. a vendored copy needs tokens.json next to src/ (scripts/sync-ghost-signal.sh copies it)`);
  }
}

export function loadBudgets(url = TOKENS_URL) {
  const feel = JSON.parse(readTokens(url)).feel;
  if (feel === undefined) throw new GsFeelConfigError(`${url} has no feel group`);
  return Object.freeze({
    frame: parseDuration(feel.frame),
    vsyncMiss: feel.vsyncMiss,
    input: parseDuration(feel.input),
    task: parseDuration(feel.task),
    answer: parseDuration(feel.answer),
    shift: feel.shift,
    settle: parseDuration(feel.settle),
    runs: feel.runs,
    properties: Object.freeze([...feel.properties]),
  });
}

export function mergeBudgets(base, overrides = {}) {
  const out = { ...base };
  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (Object.hasOwn(base, key) === false) throw new GsFeelConfigError(`unknown budget "${key}"`);
    if (key === 'runs') throw new GsFeelConfigError('runs is not a budget. set GS_FEEL_RUNS=1 for the strict single-run mode');
    if (key === 'properties') {
      if (Array.isArray(value) === false || value.some((p) => base.properties.includes(p) === false)) throw new GsFeelConfigError(LOOSEN);
      out.properties = Object.freeze([...value]);
      continue;
    }
    const n = DURATIONS.includes(key) ? parseDuration(value) : value;
    if (typeof n !== 'number' || Number.isFinite(n) === false || n > base[key]) throw new GsFeelConfigError(LOOSEN);
    out[key] = n;
  }
  return Object.freeze(out);
}

// a frame is late when it misses a vsync, not when its delta passes 16.7: idle rAF jitters (spec p2)
export const isVsyncMiss = (delta, interval, factor) => delta > factor * interval;

// the inp definition: an interaction's latency is the longest event timing entry sharing its id.
// durations round to 8ms, so pointerdown and click often tie; the one that did the work wins the
// tie, so the phase split points at the handler that ran
const busy = (e) => e.processingEnd - e.processingStart;
export function worstInteraction(entries) {
  const byId = new Map();
  for (const e of entries) {
    if (!(e.interactionId > 0)) continue;
    const cur = byId.get(e.interactionId);
    if (cur === undefined || e.duration > cur.duration || (e.duration === cur.duration && busy(e) > busy(cur))) byId.set(e.interactionId, e);
  }
  let worst = null;
  for (const e of byId.values()) if (worst === null || e.duration > worst.duration) worst = e;
  return worst;
}

// chrome sets hadRecentInput for 500ms after a discrete input: that's the ui answering, and passes
export function isUnpromptedShift(shift, limit = 0) {
  if (shift.hadRecentInput === true || !(shift.value > limit)) return false;
  return shift.sources.length === 0 || shift.sources.some((s) => s.allowedBy === null);
}

export function animatedProperties(record) {
  return record.properties.filter((p) => BOOKKEEPING_KEYS.includes(p) === false);
}

// signal lives in -event- keyframes, space in -spatial- keyframes, css transitions and gs-move:*
// web animations. anything else can't be judged, so it fails as unclassified (spec 7.7)
export function familyOf(record) {
  if (record.kind === 'css-transition') return 'space';
  const name = record.kind === 'web-animation' ? record.id : record.name;
  if (record.kind === 'web-animation' && name.startsWith('gs-move:')) return 'space';
  if (/-event-/.test(name)) return 'signal';
  if (/-spatial-/.test(name)) return 'space';
  return 'unclassified';
}

// chromium serializes step-end and step-start as steps(1) and steps(1, start), so the prefix is enough
const isSteps = (easing) => easing.startsWith('steps(');

// the curve a record draws, one easing per segment. a keyframe's easing runs to the next keyframe, so
// the last one's covers nothing (css copies the shorthand onto it anyway, harmless), and a first
// keyframe past 0 means an implicit linear one before it. read from chromium 145, spec 7.7 (¬_¬)
function segmentsOf(record) {
  const { effectEasing, keyframes } = record;
  if (typeof effectEasing !== 'string' || Array.isArray(keyframes) === false) {
    throw new TypeError('an animation record needs effectEasing and keyframes: [{ offset, easing }] (the probe shape, task 6)');
  }
  const segments = keyframes.filter((k) => k.offset < 1).map((k) => k.easing);
  if (keyframes.length > 0 && keyframes[0].offset > 0) segments.unshift('linear');
  return { effectEasing, segments };
}

// steps() quantizes whatever it wraps: a stepped effect easing makes every segment stepped, and a
// stepped segment stays stepped under any effect easing. a curve with both kinds of segment is
// stepped AND eased, so it fails in either family. the two checks are not each other's negation XX
export function isStepped(record) {
  const { effectEasing, segments } = segmentsOf(record);
  return isSteps(effectEasing) || segments.some(isSteps);
}

export function isEased(record) {
  const { effectEasing, segments } = segmentsOf(record);
  if (isSteps(effectEasing)) return false;
  return segments.length === 0 || segments.some((e) => isSteps(e) === false);
}
