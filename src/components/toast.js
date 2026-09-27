// toast stack. one lowercase line through gs-decode, optional trailing kaomoji, left bar in the
// status color. deny and bypass stick until dismissed; everything else leaves after 4s. each item
// rides in a [part="slot"] pinned to a zero-height anchor, and its stack place is a translateY, so
// an arrival never moves anything by layout and can't register as a layout shift (spec p7, p10) 👻
import { coerceStatus, glitchOnce, moshOnce } from '../gs.js';
import { enter, exit, motionAllowed } from '../motion.js';
import './decode.js';

const Base = globalThis.HTMLElement ?? class {};
const STICKY = new Set(['deny', 'bypass']);
const AUTO_DISMISS_MS = 4000;

// heights oldest first. the newest slot sits at the anchor, each older one above every newer one
export function stackOffsets(heights, gap) {
  const out = new Array(heights.length).fill(0);
  let above = 0;
  for (let i = heights.length - 1; i >= 0; i--) {
    out[i] = above === 0 ? 0 : -above;
    above += heights[i] + gap;
  }
  return out;
}

export class GsToast extends Base {
  #onEvent = (e) => this.toast(e.detail ?? {});
  #timers = new Set();
  // slots appended this task whose enter hasn't started, and whether the flush is queued
  #pending = new Set();
  #queued = false;
  // offsets come from heights, so any height change after the insert (a resize rewrapping a sticky
  // toast, a zoom, a toast added while hidden) restacks. the restack only writes translateY, which
  // never changes a slot's box, so the observer can't feed itself (¬‿¬). node has no ResizeObserver
  #ro = globalThis.ResizeObserver ? new ResizeObserver(() => this.#restack()) : null;

  connectedCallback() {
    this.setAttribute('aria-live', 'polite');
    document.addEventListener('gs-toast', this.#onEvent);
    // disconnect dropped every observation, and a toast added while detached read every height as 0
    for (const slot of this.#slots()) this.#ro?.observe(slot);
    this.#restack();
  }

  disconnectedCallback() {
    document.removeEventListener('gs-toast', this.#onEvent);
    for (const timer of this.#timers) clearTimeout(timer);
    this.#timers.clear();
    this.#ro?.disconnect();
  }

  #slots() {
    return [...this.querySelectorAll(':scope > [part="slot"]')].filter((s) => s.hasAttribute('data-leaving') === false);
  }

  // one forced layout per insert, removal or slot resize: every height read together, then every
  // offset written. a settled slot eases to its place through the slot transition. an entering slot
  // (new this task, or still mid enter) gets its place under data-gs-still, so no transition starts
  // under its web animation, then a fresh enter: a new slot slides in at its place, and one still
  // entering retargets from where it is with no jump (spec 4.1, 6.6) (¬‿¬)
  #restack() {
    const slots = this.#slots();
    const gap = parseFloat(getComputedStyle(this).getPropertyValue('--gs-space-2')) || 8;
    const offsets = stackOffsets(slots.map((s) => s.offsetHeight), gap);
    const placed = [];
    slots.forEach((s, i) => {
      // gallery.spec.js's layout-move control patches this line by its text, so it stays spelled out
      if (s.hasAttribute('data-entering') === false) s.style.transform = `translateY(${offsets[i]}px)`;
      else if (this.#pending.has(s) || s.style.transform !== `translateY(${offsets[i]}px)`) placed.push([s, `translateY(${offsets[i]}px)`]);
    });
    if (placed.length === 0) return;
    for (const [s, place] of placed) {
      s.setAttribute('data-gs-still', '');
      s.style.transform = place;
    }
    // the style read lands every place with transitions off; only then does the opt out go
    for (const [s] of placed) void getComputedStyle(s).transform;
    for (const [s] of placed) s.removeAttribute('data-gs-still');
    for (const [s] of placed) this.#enter(s);
  }

  // a burst in one task is one restack: every toast() call queues the same microtask, which runs
  // before the next frame, so each slot of the burst enters at its final place
  #queueRestack() {
    if (this.#queued) return;
    this.#queued = true;
    queueMicrotask(() => {
      this.#queued = false;
      this.#restack();
    });
  }

  #enter(slot) {
    this.#pending.delete(slot);
    enter(slot, { from: 'right', distance: 'toast' }).then((landed) => {
      // a later restack retargets a slot mid enter with a fresh enter, which cancels this one. only
      // the enter that lands hands the slot back to the stack, or the next restack would write a
      // transitioned transform under the running animation and cut the slot when it's cancelled XX
      if (landed === false) return;
      slot.removeAttribute('data-entering');
      if (slot.isConnected) this.#restack();
    });
  }

  #dismiss(slot) {
    if (slot.hasAttribute('data-leaving')) return;
    this.#ro?.unobserve(slot);
    this.#pending.delete(slot);
    // out of #slots from here on, so no restack places it again. its remove, after the exit, restacks the rest
    slot.setAttribute('data-leaving', '');
    exit(slot, { to: 'right', distance: 'toast' }).then(() => {
      slot.remove();
      this.#restack();
    });
  }

  toast({ status = 'idle', text = '', kaomoji = '' } = {}) {
    const s = coerceStatus(status);
    const sticky = STICKY.has(s);
    const item = document.createElement('div');
    item.setAttribute('part', 'item');
    item.dataset.status = s;
    item.setAttribute('role', sticky ? 'alert' : 'status');

    const line = document.createElement('gs-decode');
    line.setAttribute('text', text);
    item.append(line);

    if (kaomoji !== '') {
      const k = document.createElement('span');
      k.setAttribute('part', 'kaomoji');
      k.textContent = kaomoji;
      item.append(k);
    }

    const slot = document.createElement('div');
    slot.setAttribute('part', 'slot');
    // the newest slot sits at the anchor. set before insertion, so the first restack writes the same
    // value and starts no transition from none
    slot.style.transform = 'translateY(0px)';
    slot.append(item);

    if (sticky) {
      const ok = document.createElement('button');
      ok.setAttribute('part', 'ok');
      ok.setAttribute('data-variant', 'ghost');
      ok.textContent = 'ok';
      ok.addEventListener('click', () => this.#dismiss(slot));
      item.append(ok);
    } else {
      const timer = setTimeout(() => {
        this.#timers.delete(timer);
        this.#dismiss(slot);
      }, AUTO_DISMISS_MS);
      this.#timers.add(timer);
    }

    this.append(slot);
    this.#ro?.observe(slot);
    // the enter owns the slot's transform until it lands; the stack writes its place under
    // data-gs-still and hands it to a fresh enter instead of transitioning it
    if (motionAllowed()) {
      slot.setAttribute('data-entering', '');
      this.#pending.add(slot);
    }
    this.#queueRestack();
    // fx play on the item, never the slot: the slot's transform is its stack place (one carrier)
    if (s === 'bypass') glitchOnce(item);
    if (s === 'crash') moshOnce(item);
    return item;
  }
}

if (globalThis.customElements && customElements.get('gs-toast') === undefined) {
  customElements.define('gs-toast', GsToast);
}
