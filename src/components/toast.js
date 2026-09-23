// toast stack. one lowercase line through gs-decode, optional trailing kaomoji, left bar in the
// status color. deny and bypass stick until dismissed; everything else leaves after 4s
import { coerceStatus, glitchOnce, moshOnce } from '../gs.js';
import './decode.js';

const Base = globalThis.HTMLElement ?? class {};
const STICKY = new Set(['deny', 'bypass']);
const AUTO_DISMISS_MS = 4000;

export class GsToast extends Base {
  #onEvent = (e) => this.toast(e.detail ?? {});

  connectedCallback() {
    this.setAttribute('aria-live', 'polite');
    document.addEventListener('gs-toast', this.#onEvent);
  }

  disconnectedCallback() {
    document.removeEventListener('gs-toast', this.#onEvent);
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

    if (sticky) {
      const ok = document.createElement('button');
      ok.setAttribute('part', 'ok');
      ok.setAttribute('data-variant', 'ghost');
      ok.textContent = 'ok';
      ok.addEventListener('click', () => item.remove());
      item.append(ok);
    } else {
      setTimeout(() => item.remove(), AUTO_DISMISS_MS);
    }

    this.append(item);
    if (s === 'bypass') glitchOnce(item);
    if (s === 'crash') moshOnce(item);
    return item;
  }
}

if (globalThis.customElements && customElements.get('gs-toast') === undefined) {
  customElements.define('gs-toast', GsToast);
}
