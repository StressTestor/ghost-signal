// repeating text strip. the one place caps are allowed: tape is shouting on purpose.
// the track holds the text an even number of times so the -50% scroll in fx.css is seamless
import { coerceStatus } from '../gs.js';

const Base = globalThis.HTMLElement ?? class {};

export class GsTape extends Base {
  static observedAttributes = ['text', 'status'];

  #track = null;

  connectedCallback() {
    if (this.#track === null) {
      const initial = this.textContent.trim();
      this.textContent = '';
      this.#track = document.createElement('span');
      this.#track.setAttribute('part', 'track');
      this.append(this.#track);
      if (this.hasAttribute('text') === false && initial !== '') this.setAttribute('text', initial);
    }
    this.render();
  }

  attributeChangedCallback() {
    if (this.isConnected && this.#track !== null) this.render();
  }

  render() {
    const text = (this.getAttribute('text') ?? '').toUpperCase();
    const status = coerceStatus(this.getAttribute('status') ?? 'bypass');
    this.style.setProperty('--gs-tape-color', `var(--gs-color-${status})`);
    const unit = `${text}  //  `;
    const pairs = text.length === 0 ? 0 : Math.ceil(120 / unit.length);
    this.#track.textContent = unit.repeat(pairs * 2);
  }
}

if (globalThis.customElements && customElements.get('gs-tape') === undefined) {
  customElements.define('gs-tape', GsTape);
}
