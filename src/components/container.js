// shared base for gs-empty, gs-error and gs-splash: strong dither and a default decode line
// from the copy slot. these three are the only places gs-wallpaper may live
import { copy } from '../copy.js';
import './decode.js';

const Base = globalThis.HTMLElement ?? class {};

export class GsContainer extends Base {
  static slot = 'empty';

  #built = false;

  connectedCallback() {
    if (this.#built) return;
    this.#built = true;
    this.classList.add('gs-dither-strong');
    if (this.querySelector('[part="copy"]') === null) {
      const line = document.createElement('gs-decode');
      line.setAttribute('part', 'copy');
      line.setAttribute('text', copy(this.constructor.slot));
      this.append(line);
    }
  }
}

export function defineContainer(tag, slot) {
  const cls = class extends GsContainer {
    static slot = slot;
  };
  if (globalThis.customElements && customElements.get(tag) === undefined) customElements.define(tag, cls);
  return cls;
}
