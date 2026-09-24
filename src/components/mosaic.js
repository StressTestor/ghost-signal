// one renderer for every dotted or ascii image. no rng in here, ever: same grid, same pixels,
// same hash on every machine. cells are integer aligned fillRects so nothing antialiases (｡◕‿↼)
import { parseGrid, watchTheme, unwatchTheme } from '../gs.js';

const Base = globalThis.HTMLElement ?? class {};

export const BAYER4 = Object.freeze([
  Object.freeze([0, 8, 2, 10]),
  Object.freeze([12, 4, 14, 6]),
  Object.freeze([3, 11, 1, 9]),
  Object.freeze([15, 7, 13, 5]),
]);

export function bayerThreshold(value, x, y) {
  return value > (BAYER4[y & 3][x & 3] + 0.5) / 16;
}

export function imageToGrid(pixels, width, height, cols, rows) {
  const out = [];
  for (let y = 0; y < rows; y++) {
    let row = '';
    for (let x = 0; x < cols; x++) {
      const px = Math.min(width - 1, Math.floor(((x + 0.5) * width) / cols));
      const py = Math.min(height - 1, Math.floor(((y + 0.5) * height) / rows));
      const i = (py * width + px) * 4;
      const lum = ((0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]) / 255) * (pixels[i + 3] / 255);
      row += bayerThreshold(lum, x, y) ? '#' : '.';
    }
    out.push(row);
  }
  return out;
}

export function textToGrid(text, cols, rows) {
  const lines = String(text).split('\n');
  const out = [];
  for (let y = 0; y < rows; y++) {
    const line = lines[y] ?? '';
    let row = '';
    for (let x = 0; x < cols; x++) row += (line[x] ?? ' ') === ' ' ? '.' : '#';
    out.push(row);
  }
  return out;
}

function blank(cols, rows) {
  return Array.from({ length: rows }, () => '.'.repeat(cols));
}

export class GsMosaic extends Base {
  static observedAttributes = ['mode', 'cols', 'rows', 'cell', 'gap', 'grid', 'text', 'lit'];

  #grid = null;
  #canvas = null;
  #drawn = 0;

  connectedCallback() {
    if (this.#canvas === null) {
      this.#canvas = document.createElement('canvas');
      this.append(this.#canvas);
    }
    watchTheme(this);
    this.render();
  }

  disconnectedCallback() {
    unwatchTheme(this);
  }

  attributeChangedCallback() {
    if (this.isConnected) this.render();
  }

  #num(name, fallback) {
    const v = Number(this.getAttribute(name));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  }

  get mode() { return this.getAttribute('mode') === 'ascii' ? 'ascii' : 'dot'; }
  get cols() { return this.#num('cols', 16); }
  get rows() { return this.#num('rows', 10); }
  get cell() { return this.#num('cell', 7); }
  get gap() { return this.hasAttribute('gap') ? Math.max(0, Number(this.getAttribute('gap'))) : 2; }

  get grid() {
    if (this.#grid !== null) return this.#grid;
    const attr = this.getAttribute('grid');
    if (attr !== null) return parseGrid(attr, this.cols, this.rows);
    const text = this.getAttribute('text');
    if (text !== null) return textToGrid(text, this.cols, this.rows);
    return blank(this.cols, this.rows);
  }

  set grid(rows) {
    this.#grid = rows === null ? null : parseGrid(rows, this.cols, this.rows);
    if (this.isConnected) this.render();
  }

  // source: HTMLImageElement, ImageBitmap or canvas. scaled to cols x rows without smoothing,
  // then thresholded. a source already at cols x rows maps 1:1
  setImage(source) {
    const off = document.createElement('canvas');
    off.width = this.cols;
    off.height = this.rows;
    const ctx = off.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, 0, 0, this.cols, this.rows);
    const data = ctx.getImageData(0, 0, this.cols, this.rows).data;
    this.grid = imageToGrid(data, this.cols, this.rows, this.cols, this.rows);
  }

  #colors() {
    const cs = getComputedStyle(this);
    const read = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
    const lit = this.getAttribute('lit');
    if (lit !== null) return { lit, bloom: lit, dim: lit };
    return {
      lit: read('--gs-color-accent', 'lime'),
      bloom: read('--gs-color-accent-bloom', 'white'),
      dim: read('--gs-color-accent-dim', 'green'),
    };
  }

  render() {
    if (this.#canvas === null) return;
    const { cols, rows, cell, gap } = this;
    const pitch = cell + gap;
    const grid = this.grid;
    const c = this.#canvas;
    c.width = cols * pitch - gap;
    c.height = rows * pitch - gap;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    const colors = this.#colors();
    if (this.mode === 'ascii') {
      // glyph rasterization rides the platform's monospace fallback, so ascii output is not
      // pixel-stable across operating systems (¬‿¬) never pin an ascii hash in a snapshot
      ctx.font = `${cell + gap}px ui-monospace, Menlo, monospace`;
      ctx.textBaseline = 'top';
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const on = grid[y][x] === '#';
          ctx.fillStyle = on ? colors.lit : colors.dim;
          ctx.fillText(on ? '#' : '.', x * pitch, y * pitch);
        }
      }
    } else {
      const inset = Math.floor(cell / 3);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const px = x * pitch;
          const py = y * pitch;
          if (grid[y][x] === '#') {
            ctx.fillStyle = colors.lit;
            ctx.fillRect(px, py, cell, cell);
            if (cell >= 5) {
              ctx.fillStyle = colors.bloom;
              ctx.fillRect(px + inset, py + inset, cell - 2 * inset, cell - 2 * inset);
            }
          } else {
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = colors.dim;
            ctx.fillRect(px, py, cell, cell);
            ctx.globalAlpha = 1;
          }
        }
      }
    }
    this.#drawn += 1;
    this.dataset.drawn = String(this.#drawn);
  }

  // only dot mode is pixel-stable across platforms, that's what the pinned snapshots cover XX
  hash() {
    return this.#canvas === null ? '' : this.#canvas.toDataURL('image/png');
  }
}

if (globalThis.customElements && customElements.get('gs-mosaic') === undefined) {
  customElements.define('gs-mosaic', GsMosaic);
}
