// the in-page half of the feel harness. playwright installs it with page.addInitScript, so it runs
// before any app module and before first paint, and it ships as source text: installProbe must
// close over nothing from this module. it never writes to the console, so a consumer's console
// guard never trips on it (spec 7.1, 7.5) 👻
export const PROBE_VERSION = 1;

export function installProbe() {
  if (window.__gsFeel !== undefined) return;
  const VERSION = 1;
  const BOOK = new Set(['offset', 'computedOffset', 'easing', 'composite']);
  const now = () => performance.now();
  const kebab = (k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  const state = {
    armed: false, armedAt: null, run: 0, mode: 'motion', allow: [], step: null, steps: [],
    events: [], shifts: [], shiftNodes: [], longtasks: [], loafs: [],
    animations: [], overlaps: [], overlapKeys: new Set(), calm: [],
    fcp: null, lastMutation: 0, seen: new WeakSet(), props: new WeakMap(), sink: 0,
  };
  const rafListeners = new Set();
  const postListeners = new Set();

  const elementOf = (node) => (node === null || node === undefined ? null : node.nodeType === 1 ? node : node.parentElement);
  const cssPath = (node) => {
    let el = elementOf(node);
    if (el === null) return '(detached)';
    const parts = [];
    while (el !== null && parts.length < 6) {
      if (el.id) { parts.unshift(`${el.localName}#${el.id}`); break; }
      let part = el.localName;
      const p = el.getAttribute('part');
      if (p) part += `[part="${p}"]`;
      const parent = el.parentElement;
      if (parent !== null && [...parent.children].filter((c) => c.localName === el.localName).length > 1) {
        part += `:nth-child(${[...parent.children].indexOf(el) + 1})`;
      }
      parts.unshift(part);
      el = parent;
    }
    return parts.join(' > ');
  };
  const rect = (r) => ({ x: r.x, y: r.y, width: r.width, height: r.height });
  const ambientTarget = (el) => el !== null && el.closest('gs-wallpaper, gs-tape, [data-gs-ambient], [data-gs-ambient-source], [data-gs-feel-warmup]') !== null;

  // performance entries. a type this browser lacks is skipped here and reported by apparatus()
  const observe = (type, fn, extra = {}) => {
    if (PerformanceObserver.supportedEntryTypes.includes(type) === false) return;
    new PerformanceObserver((list) => { for (const e of list.getEntries()) fn(e); }).observe({ type, buffered: true, ...extra });
  };
  const matchAllow = (rec, nodes) => {
    rec.sources.forEach((s, i) => {
      const el = elementOf(nodes[i]);
      const hit = el === null ? undefined : state.allow.find((a) => el.closest(a.selector) !== null);
      s.allowedBy = hit === undefined ? null : hit.selector;
    });
  };
  observe('paint', (e) => { if (e.name === 'first-contentful-paint') state.fcp = e.startTime; });
  observe('event', (e) => {
    if (state.armed) state.events.push({ name: e.name, interactionId: e.interactionId, startTime: e.startTime, duration: e.duration, processingStart: e.processingStart, processingEnd: e.processingEnd });
  }, { durationThreshold: 16 });
  observe('layout-shift', (e) => {
    const nodes = (e.sources ?? []).map((s) => s.node ?? null);
    const rec = {
      startTime: e.startTime, value: e.value, hadRecentInput: e.hadRecentInput,
      sources: (e.sources ?? []).map((s) => ({ path: cssPath(s.node), allowedBy: null, previousRect: rect(s.previousRect), currentRect: rect(s.currentRect) })),
    };
    matchAllow(rec, nodes);
    state.shifts.push(rec);
    state.shiftNodes.push(nodes);
  });
  observe('longtask', (e) => { if (state.armed) state.longtasks.push({ startTime: e.startTime, duration: e.duration }); });
  observe('long-animation-frame', (e) => {
    if (state.armed === false) return;
    state.loafs.push({
      startTime: e.startTime, duration: e.duration,
      scripts: (e.scripts ?? []).map((s) => ({ invoker: s.invoker, sourceURL: s.sourceURL, sourceFunctionName: s.sourceFunctionName, duration: s.duration })),
    });
  });

  // the first answer after a trusted input, and the trusted input itself (spec p12)
  const answered = (what) => {
    const s = state.step;
    if (state.armed === false || s === null || s.inputAt === null) return;
    s.answerCount += 1;
    if (s.answerAt === null) { s.answerAt = now(); s.answerWhat = what; }
  };
  for (const type of ['pointerdown', 'keydown']) {
    window.addEventListener(type, (e) => {
      const s = state.step;
      if (state.armed === false || s === null || e.isTrusted !== true) return;
      s.trusted[type] += 1;
      if (s.inputAt === null) { s.inputAt = e.timeStamp; s.inputType = type === 'keydown' ? 'key' : 'click'; }
    }, { capture: true });
  }
  window.addEventListener('input', () => answered('input'), { capture: true });
  window.addEventListener('focusin', () => answered('focus'), { capture: true });
  window.addEventListener('scroll', () => answered('scroll'), { capture: true });
  document.addEventListener('selectionchange', () => answered('selection'));

  // mutations. ambient sources change on their own clock, so they never answer an input and never
  // hold a step open. a bypass toast's glitch toggles the same class as ambient glitch, so only
  // [data-gs-ambient] targets are dropped, not every .gs-glitch
  const ambient = (m) => {
    const el = elementOf(m.target);
    if (el === null) return true;
    if (el.closest('gs-wallpaper, gs-tape, [data-gs-ambient-source], [data-gs-feel-warmup]') !== null) return true;
    if (m.type === 'childList') {
      const nodes = [...m.addedNodes, ...m.removedNodes];
      if (nodes.length > 0 && nodes.every((n) => n.nodeType === 1 && n.hasAttribute('data-gs-feel-warmup'))) return true;
    }
    if (m.type !== 'attributes') return false;
    if (m.attributeName === 'data-drawn') return true;
    if (m.attributeName === 'data-frame' && el.localName === 'gs-face' && (m.oldValue === 'blink' || el.getAttribute('data-frame') === 'blink')) return true;
    return (m.attributeName === 'class' || m.attributeName === 'data-t') && el.matches('[data-gs-ambient]');
  };
  const calmCheck = (m) => {
    if (m.type !== 'attributes' || document.documentElement?.dataset.glitch !== '0') return;
    const el = elementOf(m.target);
    if (el === null) return;
    if (m.attributeName === 'data-playing' && el.localName === 'gs-decode' && el.hasAttribute('data-playing')) state.calm.push({ at: now(), what: 'gs-decode played', target: cssPath(el) });
    if (m.attributeName === 'data-step' && el.localName === 'gs-wallpaper') state.calm.push({ at: now(), what: 'wallpaper stepped', target: cssPath(el) });
  };
  new MutationObserver((records) => {
    if (state.armed === false) return;
    let real = false;
    for (const m of records) {
      calmCheck(m);
      if (real === false && ambient(m) === false) real = true;
    }
    if (real) {
      state.lastMutation = now();
      answered('mutation');
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true });

  // animations: listeners catch the short ones getAnimations() has already dropped, the wrapper
  // catches web animations, and the post-frame sweep catches what started before arming (spec 7.5)
  const propsOf = (a) => {
    if (state.props.has(a)) return state.props.get(a);
    const keys = new Set();
    const easings = new Set();
    const keyframes = [];
    for (const f of a.effect?.getKeyframes?.() ?? []) {
      for (const k of Object.keys(f)) if (BOOK.has(k) === false) keys.add(kebab(k));
      if (typeof f.easing === 'string' && f.easing !== 'linear') easings.add(f.easing);
      keyframes.push({ offset: f.computedOffset, easing: typeof f.easing === 'string' ? f.easing : 'linear' });
    }
    if (typeof CSSTransition !== 'undefined' && a instanceof CSSTransition) keys.add(a.transitionProperty);
    const timing = a.effect?.getTiming?.() ?? {};
    if (typeof timing.easing === 'string' && timing.easing !== 'linear') easings.add(timing.easing);
    // easings is for reading. the family check needs the curve itself, in order with linear kept:
    // which keyframe carries the steps() decides whether a signal eases (task 3)
    const effectEasing = typeof timing.easing === 'string' ? timing.easing : 'linear';
    const out = { properties: [...keys], easings: [...easings], effectEasing, keyframes, iterations: timing.iterations ?? 1 };
    state.props.set(a, out);
    return out;
  };
  const describe = (a) => {
    if (typeof CSSAnimation !== 'undefined' && a instanceof CSSAnimation) return { kind: 'css-animation', name: a.animationName, id: '' };
    if (typeof CSSTransition !== 'undefined' && a instanceof CSSTransition) return { kind: 'css-transition', name: a.transitionProperty, id: '' };
    return { kind: 'web-animation', name: '', id: typeof a.id === 'string' ? a.id : '' };
  };
  // answers: false is the arm-time seed. those animations ran before any step's input, so they're
  // checked for property and family and never count as an answer. the sweep can also find an
  // animation a frame late, so one that began before the input never answers it either
  const record = (a, { answers = true, origin = 'armed' } = {}) => {
    if (state.armed === false || state.seen.has(a)) return;
    state.seen.add(a);
    const target = a.effect?.target ?? null;
    const p = propsOf(a);
    state.animations.push({
      at: now(), step: state.step === null ? null : state.step.index, ...describe(a),
      target: cssPath(target), pseudo: a.effect?.pseudoElement ?? null,
      properties: p.properties, easings: p.easings, effectEasing: p.effectEasing, keyframes: p.keyframes, iterations: p.iterations,
      glitch: document.documentElement?.dataset.glitch ?? null, origin,
    });
    if (answers === false || ambientTarget(elementOf(target))) return;
    const s = state.step;
    const began = typeof a.startTime === 'number' ? a.startTime : now();
    if (s !== null && s.inputAt !== null && began < s.inputAt) return;
    answered('animation');
  };
  const original = Element.prototype.animate;
  Element.prototype.animate = function animate(...args) {
    const a = original.apply(this, args);
    record(a);
    return a;
  };
  window.addEventListener('transitionrun', (e) => {
    if (state.armed === false) return;
    const pseudo = e.pseudoElement || null;
    const hit = (e.target.getAnimations?.({ subtree: true }) ?? []).find((x) => typeof CSSTransition !== 'undefined' && x instanceof CSSTransition
      && x.transitionProperty === e.propertyName && (x.effect?.pseudoElement ?? null) === pseudo);
    if (hit !== undefined) { record(hit); return; }
    const easing = getComputedStyle(e.target, pseudo).transitionTimingFunction;
    state.animations.push({
      at: now(), step: state.step === null ? null : state.step.index, kind: 'css-transition', name: e.propertyName, id: '',
      target: cssPath(e.target), pseudo, properties: [e.propertyName], easings: easing === 'linear' ? [] : [easing],
      effectEasing: easing, keyframes: [{ offset: 0, easing: 'linear' }, { offset: 1, easing: 'linear' }], iterations: 1, // a real transition's shape
      glitch: document.documentElement?.dataset.glitch ?? null, origin: 'armed',
    });
    answered('animation');
  }, { capture: true });
  window.addEventListener('animationstart', (e) => {
    if (state.armed === false) return;
    const pseudo = e.pseudoElement || null;
    for (const x of e.target.getAnimations?.({ subtree: true }) ?? []) {
      if (typeof CSSAnimation !== 'undefined' && x instanceof CSSAnimation && x.animationName === e.animationName && (x.effect?.pseudoElement ?? null) === pseudo) record(x);
    }
  }, { capture: true });

  const busy = () => document.getAnimations().some((a) => a.playState === 'running' && a.timeline === document.timeline
    && Number.isFinite(a.effect?.getTiming?.().iterations ?? 1)) || document.querySelector('gs-decode[data-playing]') !== null;

  // one sample per frame, after rendering, when style is clean and the call forces no recalc
  const sweep = () => {
    if (state.armed) {
      const groups = new Map();
      for (const a of document.getAnimations()) {
        record(a);
        const target = a.effect?.target ?? null;
        if (a.playState !== 'running' || target === null || propsOf(a).properties.includes('transform') === false) continue;
        const key = `${cssPath(target)}|${a.effect.pseudoElement ?? ''}`;
        if (groups.has(key) === false) groups.set(key, { target: cssPath(target), pseudo: a.effect.pseudoElement ?? null, anims: [] });
        groups.get(key).anims.push(describe(a));
      }
      for (const [key, g] of groups) {
        if (g.anims.length < 2) continue;
        const dedupe = `${key}|${g.anims.map((x) => x.id || x.name).sort().join(',')}`;
        if (state.overlapKeys.has(dedupe)) continue;
        state.overlapKeys.add(dedupe);
        state.overlaps.push({ at: now(), step: state.step === null ? null : state.step.index, ...g });
      }
    }
    for (const f of postListeners) f();
  };
  const channel = new MessageChannel();
  channel.port1.onmessage = sweep;
  const loop = (ts) => {
    if (state.armed && state.step !== null) state.step.frames.push(ts);
    for (const f of rafListeners) f(ts);
    channel.port2.postMessage(0);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  const counts = () => {
    const c = {};
    for (const t of ['pointerdown', 'pointerup', 'click', 'keydown', 'keyup']) c[t] = performance.eventCounts?.get(t) ?? 0;
    return c;
  };

  window.__gsFeel = {
    apparatus() {
      return {
        version: VERSION,
        entryTypes: [...PerformanceObserver.supportedEntryTypes],
        visibility: document.visibilityState,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        glitch: document.documentElement?.dataset.glitch ?? null,
      };
    },
    async ready(timeout = 5000) {
      const began = now();
      await document.fonts.ready;
      await new Promise((resolve, reject) => {
        const f = () => {
          if (state.fcp !== null && busy() === false) { postListeners.delete(f); resolve(); return; }
          if (now() - began > timeout) {
            postListeners.delete(f);
            reject(new Error(state.fcp === null ? 'no first-contentful-paint within the timeout' : 'finite animations were still running'));
          }
        };
        postListeners.add(f);
      });
    },
    mountWarmup() {
      const el = document.createElement('div');
      el.setAttribute('data-gs-feel-warmup', '');
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;z-index:2147483647;opacity:0.01';
      for (const t of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click']) el.addEventListener(t, (e) => e.stopPropagation());
      // mousedown's default moves focus to body, and setup may have placed it (the palette focuses
      // its input on frame 0). the warm-up leaves focus exactly where it found it (¬‿¬)
      el.addEventListener('mousedown', (e) => e.preventDefault());
      document.body.append(el);
    },
    unmountWarmup() {
      document.querySelector('[data-gs-feel-warmup]')?.remove();
    },
    steady(n, factor) {
      return new Promise((resolve) => {
        const ts = [];
        const f = (t) => {
          ts.push(t);
          if (ts.length <= n) return;
          rafListeners.delete(f);
          const deltas = ts.slice(1).map((v, i) => v - ts[i]);
          const interval = [...deltas].sort((a, b) => a - b)[Math.floor(deltas.length / 2)];
          resolve({ interval, misses: deltas.filter((d) => d > factor * interval).length, deltas });
        };
        rafListeners.add(f);
      });
    },
    // a fixed integer loop. it gates nothing; it makes a slow runner recognizable in a report
    calibrate() {
      const t = now();
      let x = 0;
      for (let i = 0; i < 5_000_000; i++) x = (x + i * 7) % 1_000_003;
      state.sink = x;
      return now() - t;
    },
    arm({ run, allowShift = [], mode = 'motion' }) {
      Object.assign(state, {
        armed: true, armedAt: now(), run, mode, allow: allowShift, step: null, steps: [], events: [], longtasks: [], loafs: [],
        animations: [], overlaps: [], overlapKeys: new Set(), calm: [], seen: new WeakSet(), lastMutation: 0,
      });
      // shifts stay from page load on purpose: a scenario's fresh goto owns its load shifts. armedAt
      // lets measure() and selfTest() cut theirs to the window they actually watched
      state.shifts.forEach((rec, i) => matchAllow(rec, state.shiftNodes[i]));
      // what already runs gets recorded now, for the property and family checks, and can never be
      // an answer: a scroll edge or an infinite loop would otherwise answer the first step's input
      for (const a of document.getAnimations()) record(a, { answers: false, origin: 'before arm' });
      // node re-checks visibility, reduced motion and the glitch level on this snapshot (spec 8.2:
      // the probe checks visibility when arming)
      return window.__gsFeel.apparatus();
    },
    stepStart({ index, name, kind, answer, why }) {
      performance.mark(`gs-feel:${state.run}:${index}:start`);
      state.step = {
        index, name, kind, answerExpected: answer, why, start: now(), end: null, settled: false, frames: [],
        trusted: { pointerdown: 0, keydown: 0 }, inputAt: null, inputType: null,
        answerAt: null, answerWhat: null, answerCount: 0, countsBefore: counts(), countsAfter: null,
      };
    },
    // quiet: no running finite animation on the document timeline, no gs-decode playing, no
    // non-ambient mutation for 3 frames, and at least 150ms after the input (spec 7.6)
    stepEnd(timeout) {
      const s = state.step;
      if (s === null) return Promise.reject(new Error('stepEnd without stepStart'));
      return new Promise((resolve) => {
        const began = now();
        let calmFrames = 0;
        let last = now();
        const f = () => {
          const t = now();
          calmFrames = state.lastMutation >= last ? 0 : calmFrames + 1;
          last = t;
          const settled = calmFrames >= 3 && t >= (s.inputAt ?? s.start) + 150 && busy() === false;
          if (settled === false && t - began <= timeout) return;
          postListeners.delete(f);
          Object.assign(s, { settled, end: now(), countsAfter: counts() });
          performance.mark(`gs-feel:${state.run}:${s.index}:end`);
          state.steps.push(s);
          state.step = null;
          resolve({ index: s.index, settled });
        };
        postListeners.add(f);
      });
    },
    disarm() {
      state.armed = false;
      return JSON.parse(JSON.stringify({
        version: VERSION, run: state.run, mode: state.mode, fcp: state.fcp, armedAt: state.armedAt, steps: state.steps,
        events: state.events, shifts: state.shifts, longtasks: state.longtasks, loafs: state.loafs,
        animations: state.animations, overlaps: state.overlaps, calm: state.calm,
      }));
    },
    // feel.selfTest's planted bug: an 80ms click that lands a row above the fold 600ms later, past
    // the 500ms hadRecentInput window, with no flip. a harness that misses it proves nothing
    plant() {
      const b = document.createElement('button');
      b.setAttribute('data-gs-feel-planted', '');
      b.textContent = 'planted';
      b.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483647';
      b.addEventListener('click', function plantedclick() {
        const t = performance.now();
        while (performance.now() - t < 80) state.sink += 1;
        setTimeout(() => {
          const row = document.createElement('div');
          row.setAttribute('data-gs-feel-planted', '');
          row.textContent = 'planted row';
          row.style.cssText = 'height:40px';
          document.body.prepend(row);
        }, 600);
      });
      document.body.append(b);
    },
    unplant() {
      for (const el of document.querySelectorAll('[data-gs-feel-planted]')) el.remove();
    },
  };
}
