// tiled sprite field behind empty, error and splash states. steps one column every 250ms
// (4fps) at glitch 1+. anywhere else it throws: wallpaper never sits behind data 💀
import { GsWallpaperPlacementError, getSprite, getIcon, glitchLevel, reducedMotion } from '../gs.js';
import './mosaic.js';

const Base = globalThis.HTMLElement ?? class {};
const STEP_MS = 250;
const HOSTS = 'gs-empty, gs-error, gs-splash';
const CELL = 4;
const GAP = 1;
const PITCH = CELL + GAP;

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
  #sprite = null;
  #cols = 0;
  #rows = 0;
  #resizeObserver = null;

  connectedCallback() {
    if (this.closest(HOSTS) === null) {
      throw new GsWallpaperPlacementError('gs-wallpaper mounts only inside gs-empty, gs-error or gs-splash');
    }
    const name = this.getAttribute('sprite') ?? '';
    const sprite = getSprite(name) ?? getIcon(name);
    if (sprite === undefined) throw new RangeError(`ghost-signal: no sprite or icon registered as "${name}"`);
    this.#sprite = sprite;
    if (this.#mosaic === null) {
      this.#mosaic = document.createElement('gs-mosaic');
      this.#mosaic.setAttribute('cell', String(CELL));
      this.#mosaic.setAttribute('gap', String(GAP));
      this.append(this.#mosaic);
    }
    this.#measure();
    if (typeof ResizeObserver === 'function') {
      this.#resizeObserver = new ResizeObserver(() => this.#measure());
      this.#resizeObserver.observe(this);
    }
    clearInterval(this.#timer);
    // the timer always runs; each tick decides for itself whether to step, so flipping glitch
    // to 0 stops the motion immediately without a remount (a mount-time-only check can't see that)
    this.#timer = setInterval(() => {
      if (glitchLevel() === '0' || reducedMotion()) return;
      this.#offset += 1;
      this.#draw();
    }, STEP_MS);
  }

  disconnectedCallback() {
    clearInterval(this.#timer);
    if (this.#resizeObserver !== null) {
      this.#resizeObserver.disconnect();
      this.#resizeObserver = null;
    }
  }

  // cols/rows attributes are explicit overrides; absent, the wallpaper sizes itself from its
  // own box so a 24x6-less <gs-wallpaper> still tiles edge to edge instead of a fixed 119x29
  // patch pinned in the corner of whatever container it's given
  #measure() {
    const explicitCols = this.getAttribute('cols');
    const explicitRows = this.getAttribute('rows');
    const cols = explicitCols !== null ? Number(explicitCols) : Math.max(1, Math.ceil(this.clientWidth / PITCH));
    const rows = explicitRows !== null ? Number(explicitRows) : Math.max(1, Math.ceil(this.clientHeight / PITCH));
    if (cols === this.#cols && rows === this.#rows) return;
    this.#cols = cols;
    this.#rows = rows;
    this.#mosaic.setAttribute('cols', String(cols));
    this.#mosaic.setAttribute('rows', String(rows));
    this.#draw();
  }

  #draw() {
    if (this.#sprite === null) return;
    this.#mosaic.grid = tileGrid(this.#sprite, this.#cols, this.#rows, this.#offset);
    this.dataset.step = String(this.#offset);
  }
}

if (globalThis.customElements && customElements.get('gs-wallpaper') === undefined) {
  customElements.define('gs-wallpaper', GsWallpaper);
}
