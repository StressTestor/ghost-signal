// tiled sprite field behind empty, error and splash states. steps one column every 250ms
// (4fps) at glitch 1+. anywhere else it throws: wallpaper never sits behind data 💀
import { GsWallpaperPlacementError, getSprite, getIcon, glitchLevel, reducedMotion } from '../gs.js';
import './mosaic.js';

const Base = globalThis.HTMLElement ?? class {};
const STEP_MS = 250;
const HOSTS = 'gs-empty, gs-error, gs-splash';

export function tileGrid(sprite, cols, rows, offset = 0) {
  const sw = sprite[0].length;
  const sh = sprite.length;
  return Array.from({ length: rows }, (_, y) => (
    Array.from({ length: cols }, (_, x) => sprite[y % sh][(x + offset) % sw]).join('')
  ));
}

export class GsWallpaper extends Base {
  #mosaic = null;
  #timer = 0;
  #offset = 0;

  connectedCallback() {
    if (this.closest(HOSTS) === null) {
      throw new GsWallpaperPlacementError('gs-wallpaper mounts only inside gs-empty, gs-error or gs-splash');
    }
    const name = this.getAttribute('sprite') ?? '';
    const sprite = getSprite(name) ?? getIcon(name);
    if (sprite === undefined) throw new RangeError(`ghost-signal: no sprite or icon registered as "${name}"`);
    if (this.#mosaic === null) {
      this.#mosaic = document.createElement('gs-mosaic');
      this.#mosaic.setAttribute('cols', this.getAttribute('cols') ?? '32');
      this.#mosaic.setAttribute('rows', this.getAttribute('rows') ?? '12');
      this.#mosaic.setAttribute('cell', '4');
      this.#mosaic.setAttribute('gap', '1');
      this.append(this.#mosaic);
    }
    this.#draw(sprite);
    clearInterval(this.#timer);
    if (glitchLevel() !== '0' && reducedMotion() === false) {
      this.#timer = setInterval(() => {
        this.#offset += 1;
        this.#draw(sprite);
      }, STEP_MS);
    }
  }

  disconnectedCallback() {
    clearInterval(this.#timer);
  }

  #draw(sprite) {
    const cols = Number(this.#mosaic.getAttribute('cols'));
    const rows = Number(this.#mosaic.getAttribute('rows'));
    this.#mosaic.grid = tileGrid(sprite, cols, rows, this.#offset);
    this.dataset.step = String(this.#offset);
  }
}

if (globalThis.customElements && customElements.get('gs-wallpaper') === undefined) {
  customElements.define('gs-wallpaper', GsWallpaper);
}
