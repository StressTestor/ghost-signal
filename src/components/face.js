// the mask. a 16x10 gs-mosaic that is always green: status picks the expression, never the color.
// the persona is not a traffic light (｡◕‿↼)
import { coerceStatus, glitchOnce, glitchLevel, reducedMotion, motionMs, getExpression } from '../gs.js';
import { resolveExpression } from '../expressions.js';
import './mosaic.js';

const Base = globalThis.HTMLElement ?? class {};
const BLINK_EVERY_MS = 7000;

export function nextFrame(status, { blinking = false } = {}) {
  const s = coerceStatus(status);
  if (blinking && (s === 'idle' || s === 'ok')) return 'blink';
  return s === 'ok' ? 'idle' : s;
}

export class GsFace extends Base {
  static observedAttributes = ['status', 'expression'];

  #mosaic = null;
  #blinkTimer = 0;
  #blinkBack = 0;
  #lastFrame = null;

  connectedCallback() {
    if (this.#mosaic === null) {
      this.#mosaic = document.createElement('gs-mosaic');
      this.#mosaic.setAttribute('cols', '16');
      this.#mosaic.setAttribute('rows', '10');
      this.append(this.#mosaic);
    }
    this.draw();
    this.#startBlink();
  }

  disconnectedCallback() {
    clearInterval(this.#blinkTimer);
    clearTimeout(this.#blinkBack);
    this.#blinkBack = 0;
  }

  attributeChangedCallback() {
    if (this.isConnected) this.draw();
  }

  get status() {
    return coerceStatus(this.getAttribute('status') ?? 'idle');
  }

  set status(value) {
    this.setAttribute('status', value);
  }

  #frameName(blinking) {
    const override = this.getAttribute('expression');
    if (override !== null) {
      if (getExpression(override) !== undefined) return override;
      console.error(`ghost-signal: expression "${override}" is not registered, using status`);
    }
    return nextFrame(this.getAttribute('status') ?? 'idle', { blinking });
  }

  #show(name) {
    const resolved = resolveExpression(name);
    this.#mosaic.grid = resolved.grid;
    this.dataset.frame = name;
  }

  draw() {
    const name = this.#frameName(false);
    const changed = this.#lastFrame !== null && this.#lastFrame !== name;
    this.#show(name);
    this.#lastFrame = name;
    if (changed) {
      glitchOnce(this);
      this.dispatchEvent(new CustomEvent('gs-face-change', { bubbles: true, detail: { status: this.status, frame: name } }));
      if (this.status === 'ok' && this.hasAttribute('expression') === false) this.blink();
    }
  }

  #blinkAllowed() {
    return glitchLevel() !== '0' && reducedMotion() === false;
  }

  // one sprite step (800ms / 4) of the blink frame, then back. returns false when it did nothing
  blink() {
    if (this.#blinkAllowed() === false || this.#blinkBack !== 0) return false;
    if (this.#frameName(true) !== 'blink') return false;
    this.#show('blink');
    this.#blinkBack = setTimeout(() => {
      this.#blinkBack = 0;
      if (this.isConnected) this.#show(this.#frameName(false));
    }, motionMs('sprite') / 4);
    return true;
  }

  #startBlink() {
    clearInterval(this.#blinkTimer);
    if (this.#blinkAllowed()) this.#blinkTimer = setInterval(() => this.blink(), BLINK_EVERY_MS);
  }

  hash() {
    return this.#mosaic === null ? '' : this.#mosaic.hash();
  }
}

if (globalThis.customElements && customElements.get('gs-face') === undefined) {
  customElements.define('gs-face', GsFace);
}
