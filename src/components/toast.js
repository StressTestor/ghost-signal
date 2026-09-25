// toast stack. one lowercase line through gs-decode, optional trailing kaomoji, left bar in the
// status color. deny and bypass stick until dismissed; everything else leaves after 4s. each item
// rides in a [part="slot"] pinned to a zero-height anchor, and its stack place is a translateY, so
// an arrival never moves anything by layout and can't register as a layout shift (spec p7, p10) 👻
import { coerceStatus, glitchOnce, moshOnce } from '../gs.js';
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

  connectedCallback() {
    this.setAttribute('aria-live', 'polite');
    document.addEventListener('gs-toast', this.#onEvent);
  }

  disconnectedCallback() {
    document.removeEventListener('gs-toast', this.#onEvent);
    for (const timer of this.#timers) clearTimeout(timer);
    this.#timers.clear();
  }

  #slots() {
    return [...this.querySelectorAll(':scope > [part="slot"]')].filter((s) => s.hasAttribute('data-leaving') === false);
  }

  // one forced layout per insert or removal: every height read together, then every offset written
  #restack() {
    const slots = this.#slots();
    const gap = parseFloat(getComputedStyle(this).getPropertyValue('--gs-space-2')) || 8;
    const offsets = stackOffsets(slots.map((s) => s.offsetHeight), gap);
    slots.forEach((s, i) => {
      if (s.hasAttribute('data-entering') === false) s.style.transform = `translateY(${offsets[i]}px)`;
    });
  }

  #dismiss(slot) {
    slot.remove();
    this.#restack();
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
    this.#restack();
    // fx play on the item, never the slot: the slot's transform is its stack place (one carrier)
    if (s === 'bypass') glitchOnce(item);
    if (s === 'crash') moshOnce(item);
    return item;
  }
}

if (globalThis.customElements && customElements.get('gs-toast') === undefined) {
  customElements.define('gs-toast', GsToast);
}
