// spatial motion: things arriving, leaving and changing place. web animations on transform and
// opacity, eased with --gs-ease-*, timed with --gs-motion-*, each one tagged id 'gs-move:<kind>' so
// the feel harness files it as space. reduced motion, or a page that never imported motion.css,
// gets the end state at once: the v0.1 hard cut (spec 3.3, 6.2) (¬‿¬)
import { reducedMotion } from './gs.js';

const FRAME = 1000 / 60;
const hasDocument = () => typeof document !== 'undefined' && document.documentElement !== null && document.documentElement !== undefined;

// token reads are memoized until the next frame, so a loop of helpers forces one style read
const memo = new Map();
let memoArmed = false;
function token(name) {
  if (memo.has(name)) return memo.get(name);
  if (memoArmed === false) {
    memoArmed = true;
    requestAnimationFrame(() => {
      memo.clear();
      memoArmed = false;
    });
  }
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  memo.set(name, value);
  return value;
}

export function parseMs(v) {
  const m = /^(-?\d*\.?\d+)(ms|s)$/.exec(String(v).trim());
  return m === null ? 0 : Number(m[1]) * (m[2] === 's' ? 1000 : 1);
}

export function parsePx(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

// ignores data-glitch on purpose: glitch 0 kills signal motion and leaves space running
export function motionAllowed() {
  return hasDocument() && reducedMotion() === false && token('--gs-space') === '1';
}

export function offsetFor(side, distance) {
  if (side === 'left') return [-distance, 0];
  if (side === 'right') return [distance, 0];
  if (side === 'above') return [0, -distance];
  return [0, distance];
}

// a motion that starts part of the way there gets the share of the full time its trip needs
export function retargetDuration(full, remaining) {
  if (full <= 0 || remaining <= 0) return 0;
  return Math.max(FRAME, Math.min(full, full * remaining));
}

const isMove = (a) => typeof a.id === 'string' && a.id.startsWith('gs-move:');
const translateOf = (transform) => {
  if (transform === 'none' || transform === '') return { x: 0, y: 0 };
  const m = new DOMMatrixReadOnly(transform);
  return { x: m.m41, y: m.m42 };
};

// where the element is right now, then stop whatever was moving it: the next motion starts here.
// the latest intent wins and nothing queues (spec 3.2)
function takeOver(el) {
  const live = el.getAnimations().filter(isMove);
  if (live.length === 0) return null;
  const cs = getComputedStyle(el);
  const at = { ...translateOf(cs.transform), opacity: Number(cs.opacity) };
  for (const a of live) a.cancel();
  return at;
}

function slide(el, kind, { side, distance, duration, easing, fade, entering }) {
  if (motionAllowed() === false) {
    for (const a of el.getAnimations?.() ?? []) if (isMove(a)) a.cancel();
    return Promise.resolve(true);
  }
  const d = typeof distance === 'number' ? distance : parsePx(token(`--gs-distance-${distance}`));
  const full = parseMs(token(`--gs-motion-${duration}`));
  const curve = token(`--gs-ease-${easing}`) || 'linear';
  const from = takeOver(el);
  const cs = getComputedStyle(el);
  const base = translateOf(cs.transform);
  const opacity = fade ? Number(cs.opacity) : 1;
  const [ox, oy] = offsetFor(side, d);
  const home = { x: base.x, y: base.y, opacity };
  const away = { x: base.x + ox, y: base.y + oy, opacity: 0 };
  const start = from ?? (entering ? away : home);
  const end = entering ? home : away;
  if (d === 0 && fade === false) return Promise.resolve(true);
  const trip = Math.max(d > 0 ? Math.hypot(end.x - start.x, end.y - start.y) / d : 0, fade && opacity > 0 ? Math.abs(end.opacity - start.opacity) / opacity : 0);
  const time = from === null ? full : retargetDuration(full, trip);
  if (time === 0) return Promise.resolve(true);
  const frame = (p) => {
    const f = {};
    if (d > 0) f.transform = `translate(${p.x}px, ${p.y}px)`;
    if (fade) f.opacity = p.opacity;
    return f;
  };
  const anim = el.animate([frame(start), frame(end)], { duration: time, easing: curve, fill: entering ? 'none' : 'forwards', id: `gs-move:${kind}` });
  // cancelled the moment it lands, both ways. an exit holds its away frame until then, and the
  // caller's own .then (hide, remove) runs in the same microtask checkpoint, so nothing flashes
  // back. an enter ends at the element's own style, so cancelling it changes nothing on screen, and
  // it has to go: a finished web animation still attached outranks a css transition on the same
  // property, and chromium runs the toast's restack on the main thread behind it (bit 6) >:[
  return anim.finished.then(() => {
    anim.cancel();
    return true;
  }, () => false);
}

export function enter(el, { from = 'below', distance = 'enter', duration = 'enter', easing = 'enter', fade = true } = {}) {
  return slide(el, 'enter', { side: from, distance, duration, easing, fade, entering: true });
}

export function exit(el, { to = 'below', distance = 'enter', duration = 'exit', easing = 'exit', fade = true } = {}) {
  return slide(el, 'exit', { side: to, distance, duration, easing, fade, entering: false });
}

// a view or an app pane arriving from its tab's side. the outgoing one is the caller's to cut
export function enterView(el, from) {
  return slide(el, 'view', { side: from, distance: 'view', duration: 'view', easing: 'enter', fade: true, entering: true });
}

// measure, mutate, then play every target from where it was to where layout put it. one forced
// layout after the mutation, and chrome records no layout shift for it (spec p9). callers pass
// only targets on screen, so a 5000-row list measures the dozen that can move
export function flip(targets, mutate, { duration = 'shift', easing = 'move', key } = {}) {
  const list = [...targets];
  if (motionAllowed() === false) return Promise.resolve(mutate()).then(() => true);
  const keyOf = key ?? ((el) => el);
  const before = new Map(list.map((el) => [keyOf(el), el.getBoundingClientRect()]));
  for (const el of list) for (const a of el.getAnimations().filter(isMove)) a.cancel();
  const settle = (next) => {
    const full = parseMs(token(`--gs-motion-${duration}`));
    const curve = token(`--gs-ease-${easing}`) || 'linear';
    const moves = [];
    for (const el of next) {
      const was = before.get(keyOf(el));
      if (was === undefined || el.isConnected === false) continue;
      const now = el.getBoundingClientRect();
      const dx = was.left - now.left;
      const dy = was.top - now.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      const a = el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }], { duration: full, easing: curve, id: 'gs-move:flip' });
      // cancelled when it lands, like every motion.js animation: a finished one left attached makes
      // chromium run a later transform transition on this element on the main thread (task 15)
      moves.push(a.finished.then(() => { a.cancel(); return true; }, () => false));
    }
    return Promise.all(moves).then((all) => all.every(Boolean));
  };
  const result = mutate();
  if (result !== null && result !== undefined && typeof result.then === 'function') return result.then((next) => settle(next ?? list));
  return settle(result ?? list);
}

export function drawerProgress(transformY, height, opening) {
  if (!(height > 0)) return opening ? 1 : 0;
  const p = opening ? 1 + transformY / height : transformY / height;
  return Math.min(1, Math.max(0, p));
}

// a drawer plus the rows after it. at open fraction p the inner shows [top, top + p * h] and the
// followers start at top + p * h, so the two never overlap and neither needs an opaque background.
// the caller owns the layout: clip in flow while open, out of flow (data-leaving) while closing
export function drawer({ height = 0, duration = 'shift', easing = 'move' } = {}) {
  let h = height;
  let anims = [];
  let opening = true;
  let last = { inner: null, followers: [], from: 0 };
  let done = Promise.resolve(true);

  const yOf = (el) => translateOf(getComputedStyle(el).transform).y;
  const progress = () => {
    if (anims.length === 0) return opening ? 1 : 0;
    if (last.followers.length > 0) return drawerProgress(yOf(last.followers[0]), h, opening);
    return last.inner === null ? (opening ? 1 : 0) : drawerProgress(yOf(last.inner), h, true);
  };

  function start({ inner, followers, open, from, currentTime = 0 }) {
    for (const a of anims) a.cancel();
    anims = [];
    opening = open;
    last = { inner, followers: [...followers], from };
    if (motionAllowed() === false || h <= 0) {
      done = Promise.resolve(true);
      return done;
    }
    const time = retargetDuration(parseMs(token(`--gs-motion-${duration}`)), open ? 1 - from : from);
    if (time === 0) {
      done = Promise.resolve(true);
      return done;
    }
    const y = (v) => ({ transform: `translateY(${v}px)` });
    const options = { duration: time, easing: token(`--gs-ease-${easing}`) || 'linear', id: 'gs-move:drawer', fill: open ? 'none' : 'forwards' };
    if (inner !== null) anims.push(inner.animate(open ? [y(-(1 - from) * h), y(0)] : [y(-(1 - from) * h), y(-h)], options));
    for (const f of followers) anims.push(f.animate(open ? [y(-(1 - from) * h), y(0)] : [y(from * h), y(0)], options));
    for (const a of anims) a.currentTime = currentTime;
    const mine = anims;
    done = Promise.all(mine.map((a) => a.finished)).then(() => {
      if (anims === mine) {
        for (const a of mine) a.cancel();
        anims = [];
      }
      return true;
    }, () => false);
    return done;
  }

  return {
    play({ inner = null, followers = [], open = true, from, height: next } = {}) {
      if (next !== undefined) h = next;
      const p = from ?? (anims.length > 0 ? progress() : open ? 0 : 1);
      return start({ inner, followers, open, from: p });
    },
    // the other way from where it is now, with the time that's left. flip the layout first
    reverse() {
      return start({ inner: last.inner, followers: last.followers, open: opening === false, from: progress() });
    },
    // a rebuild mid motion (seance's 2hz live batch) re-attaches the motion to the new nodes at the same time
    adopt({ inner = null, followers = [] } = {}) {
      if (anims.length === 0) return done;
      return start({ inner, followers, open: opening, from: last.from, currentTime: anims[0].currentTime ?? 0 });
    },
    get progress() { return progress(); },
    get running() { return anims.some((a) => a.playState === 'running'); },
    get finished() { return done; },
  };
}
