// scramble reveal. glyph soup settles left to right over --gs-motion-decode in --gs-step-decode
// steps, seeded through GS.random. instant at glitch 0 or reduced motion. never body text (¬‿¬)
import { GS, glitchLevel, reducedMotion, motionMs } from '../gs.js';

const Base = globalThis.HTMLElement ?? class {};

export const GLYPHS = '#%&*+-./:;<=>?@[]^_{|}~0123456789abcdef';

export function scrambleFrames(text, frames, rng) {
  const chars = [...text];
  if (frames < 2) return [text];
  const out = [];
  for (let f = 0; f < frames; f++) {
    const settled = Math.round(((f + 1) / frames) * chars.length);
    out.push(chars.map((c, i) => (c === ' ' || i < settled ? c : GLYPHS[Math.floor(rng() * GLYPHS.length)])).join(''));
  }
  return out;
}

function decodeSteps() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--gs-step-decode');
  const m = v.match(/steps\((\d+)\)/);
  return m === null ? 6 : Number(m[1]);
}

export class GsDecode extends Base {
  static observedAttributes = ['text'];

  #span = null;
  #timer = 0;

  connectedCallback() {
    if (this.#span === null) {
      const initial = this.textContent.trim();
      this.textContent = '';
      this.#span = document.createElement('span');
      this.#span.setAttribute('part', 'text');
      this.append(this.#span);
      if (this.hasAttribute('text') === false && initial !== '') {
        this.setAttribute('text', initial);
        return;
      }
    }
    this.play();
  }

  disconnectedCallback() {
    clearTimeout(this.#timer);
  }

  attributeChangedCallback() {
    if (this.isConnected && this.#span !== null) this.play();
  }

  get text() { return this.getAttribute('text') ?? ''; }
  set text(value) { this.setAttribute('text', value); }

  play() {
    clearTimeout(this.#timer);
    const text = this.text;
    const total = motionMs('decode');
    const steps = decodeSteps();
    if (glitchLevel() === '0' || reducedMotion() || total === 0 || steps < 2) {
      this.#finish(text);
      return;
    }
    const frames = scrambleFrames(text, steps, GS.random);
    // the final text rides in data-final while the scramble plays: base.css prints it hidden in the
    // host's own font to hold the box, so the width never changes mid-decode (spec 6.3)
    this.setAttribute('data-final', text);
    this.setAttribute('data-playing', '');
    let i = 0;
    const tick = () => {
      this.#span.textContent = frames[i];
      i += 1;
      if (i < frames.length) this.#timer = setTimeout(tick, total / steps);
      else this.#finish(text);
    };
    tick();
  }

  #finish(text) {
    this.#span.textContent = text;
    this.removeAttribute('data-playing');
    this.removeAttribute('data-final');
    this.dispatchEvent(new CustomEvent('gs-decode-done', { bubbles: true }));
  }
}

if (globalThis.customElements && customElements.get('gs-decode') === undefined) {
  customElements.define('gs-decode', GsDecode);
}
