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
// mutate hands back the rebuilt targets only as an iterable object that isn't a node. insertBefore
// returns the node it moved, an assignment arrow returns a string, and a form or a select iterates
// its own controls: all of them mean "same targets"
const isTargets = (r) => r !== null && typeof r === 'object' && typeof r[Symbol.iterator] === 'function' && typeof r.nodeType !== 'number';
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
    const els = [...next].filter((el) => before.has(keyOf(el)) && el.isConnected);
    // a rebuild inside mutate can hand these nodes a move of their own (a drawer adopting them). it
    // stops here, before any rect is read: `was` is where the eye last saw the row, and a move left
    // running would skew `now` and stack under this one. a fresh node with no key keeps its enter
    for (const el of els) for (const a of el.getAnimations().filter(isMove)) a.cancel();
    const nows = els.map((el) => el.getBoundingClientRect());
    for (const [i, el] of els.entries()) {
      const was = before.get(keyOf(el));
      const now = nows[i];
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
  const targetsOf = (r) => (isTargets(r) ? r : list);
  const result = mutate();
  if (result !== null && result !== undefined && typeof result.then === 'function') return result.then((next) => settle(targetsOf(next)));
  return settle(targetsOf(result));
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
  let last = { inner: null, followers: [], from: 0, h };
  let done = Promise.resolve(true);

  // the drawer's own clock, never a node's transform: a flip can own any one node, and a carried
  // offset skews the one it rides. every move shares one timing and its keyframes are linear in
  // offset, so the eased progress getComputedTiming reports is the open fraction's share of the trip
  const live = () => anims.find((a) => a.playState !== 'idle');
  const progress = () => {
    const a = live();
    if (a === undefined) return opening ? 1 : 0;
    const e = a.effect.getComputedTiming().progress ?? 1;
    return opening ? last.from + (1 - last.from) * e : last.from * (1 - e);
  };

  // what a node carries on top of the drawer's own curve right now: an offset a ride took over
  // from a flip or a slide, still fading out on the drawer's frames. read before anything is
  // cancelled, since the cancel is what drops it. the plain curve comes from the run that's live:
  // its direction, its height (a play can hand in a new one) and the part the node played in it.
  // `own` is that plain curve for every node the run named, a helper's takeover included: a flip
  // that took a follower over measured it with the drawer's offset already in, so its y is the
  // curve plus the residue, never the residue alone
  function residues(incoming) {
    const out = new Map();
    const own = new Map();
    if (live() === undefined) return { out, own };
    const p = progress();
    for (const el of incoming) {
      if (last.inner !== el && last.followers.includes(el) === false) continue;
      // named twice, the follower move is the later one and wins the composite
      own.set(el, opening || last.followers.includes(el) === false ? -(1 - p) * last.h : p * last.h);
    }
    for (const a of anims) {
      const el = a.effect?.target;
      if (a.playState === 'idle' || incoming.has(el) === false || out.has(el)) continue;
      const r = translateOf(getComputedStyle(el).transform).y - own.get(el);
      // matrix read noise stays 0, so a plain node keeps its two keyframes
      out.set(el, Math.abs(r) < 0.01 ? 0 : r);
    }
    return { out, own };
  }

  function start({ inner, followers, open, from, currentTime = 0 }) {
    const nodes = inner === null ? followers : [inner, ...followers];
    const { out: residue, own } = residues(new Set(nodes));
    for (const a of anims) a.cancel();
    anims = [];
    opening = open;
    last = { inner, followers: [...followers], from, h };
    if (motionAllowed() === false || h <= 0) {
      done = Promise.resolve(true);
      return done;
    }
    const time = retargetDuration(parseMs(token(`--gs-motion-${duration}`)), open ? 1 - from : from);
    if (time === 0) {
      done = Promise.resolve(true);
      return done;
    }
    // a flip or a slide still moving one of these nodes stops here, and the offset it had rides the
    // drawer's frames: the latest intent wins, from where the node is (spec 3.2, 6.2). a node the
    // last run was already carrying keeps its residue the same way, or a reverse drops a row-sized
    // flip in one frame. all read before any animate, so a node named twice never takes over the
    // drawer's own move. a helper's y on a node this run named already holds the drawer's part,
    // so only what's past the curve rides, or the drawer offset lands twice in one frame (¬‿¬)
    const carried = new Map();
    for (const el of nodes) {
      if (carried.has(el)) continue;
      const f = takeOver(el);
      carried.set(el, f === null ? residue.get(el) ?? 0 : f.y - (own.get(el) ?? 0));
    }
    const y = (v) => ({ transform: `translateY(${v}px)` });
    const options = { duration: time, easing: token(`--gs-ease-${easing}`) || 'linear', id: 'gs-move:drawer', fill: open ? 'none' : 'forwards' };
    const ride = (el, a, b) => {
      const anim = el.animate([y(a), y(b)], options);
      anim.currentTime = currentTime;
      const extra = carried.get(el);
      // adopt lands mid motion, so the offset goes in at the eased progress it lands on and fades out
      // from there. keyframe offsets read eased progress, which is what getComputedTiming reports
      const e = extra === 0 ? 1 : (anim.effect.getComputedTiming().progress ?? 0);
      if (e === 0) anim.effect.setKeyframes([y(a + extra), y(b)]);
      else if (e < 1) anim.effect.setKeyframes([y(a), { offset: e, ...y(a + (b - a) * e + extra) }, y(b)]);
      anims.push(anim);
    };
    if (inner !== null) ride(inner, -(1 - from) * h, open ? 0 : -h);
    for (const f of followers) ride(f, open ? -(1 - from) * h : from * h, 0);
    const mine = anims;
    // settled, not all: a helper that cancels one of these (flip's sweep, slide's takeOver) owns that
    // node now, and the rest still land. false means only that a later play, reverse or adopt
    // replaced this run: a caller holding data-leaving until true would leave the detail overlaying
    // the rows below on a foreign cancel. left attached, a finished move holds its fill and outranks
    // a later transition (task 15) >:[
    done = Promise.allSettled(mine.map((a) => a.finished)).then(() => {
      const current = anims === mine;
      if (current) {
        for (const a of mine) a.cancel();
        anims = [];
      }
      return current;
    });
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
    // the clock comes off a move still attached: one a helper cancelled reads null. with none left
    // every node was taken over, and there's no motion to re-attach
    adopt({ inner = null, followers = [] } = {}) {
      const a = live();
      if (a === undefined) return done;
      return start({ inner, followers, open: opening, from: last.from, currentTime: a.currentTime ?? 0 });
    },
    get progress() { return progress(); },
    get running() { return anims.some((a) => a.playState === 'running'); },
    get finished() { return done; },
  };
}

// one sliding bar under the current item. it travels and stretches along one axis from a 100px
// base inside one transform; the cross axis comes from css, so a 3px bar stays 3px. the slide is
// the css transition in motion.css, which retargets natively when a held key moves it 30 times a
// second. first placement uses data-gs-still, so it never slides in from 0, and neither does the
// first placement after the container or the current item had no size
export function indicator(container, { selector = '[aria-current="page"], [aria-current="true"], [aria-selected="true"]', axis = 'x' } = {}) {
  const bar = document.createElement('span');
  bar.setAttribute('part', 'indicator');
  bar.setAttribute('aria-hidden', 'true');
  bar.dataset.axis = axis;
  container.prepend(bar);
  let placed = false;
  const place = () => {
    const item = container.querySelector(selector);
    // an item with no size on the travel axis (display: none, a custom element not upgraded yet)
    // counts as no item. placing it would park a bar with no length at 0 and slide it in later
    const size = item === null ? 0 : axis === 'y' ? item.offsetHeight : item.offsetWidth;
    bar.hidden = size === 0;
    if (size === 0 || container.offsetWidth === 0) {
      placed = false;
      return;
    }
    const t = axis === 'y'
      ? `translateY(${item.offsetTop}px) scaleY(${size / 100})`
      : `translateX(${item.offsetLeft}px) scaleX(${size / 100})`;
    if (placed === false) {
      bar.setAttribute('data-gs-still', '');
      bar.style.transform = t;
      void getComputedStyle(bar).transform; // style resolves with transitions off, so this placement cuts
      bar.removeAttribute('data-gs-still');
      placed = true;
      return;
    }
    if (bar.style.transform !== t) bar.style.transform = t;
  };
  // a tab can grow while a full-width nav keeps its size (a count badge, a class flip), and that
  // moves every tab after it. so the watch covers each child too, at border-box: content-box never
  // hears a padding change. the child list is rebuilt whenever the container's own children change
  const ro = new ResizeObserver(() => place());
  const watch = () => {
    ro.disconnect();
    ro.observe(container);
    for (const el of container.children) if (el !== bar) ro.observe(el, { box: 'border-box' });
  };
  const mo = new MutationObserver((records) => {
    if (records.some((m) => m.type === 'childList' && m.target === container)) watch();
    place();
  });
  mo.observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-current', 'aria-selected'] });
  watch();
  place();
  return {
    update: place,
    disconnect() {
      mo.disconnect();
      ro.disconnect();
      bar.remove();
    },
  };
}
