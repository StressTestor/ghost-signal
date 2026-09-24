// ghost signal core: status vocabulary, seeded prng, grid parsing, registries, fx helpers.
// importable from node (no DOM access at module scope beyond a guarded init) so the unit
// tests and the cli share it with the browser. they ALL import eventually XX

export const STATUSES = Object.freeze(['idle', 'working', 'ok', 'warn', 'deny', 'bypass', 'crash']);
export const CORE_EXPRESSION_NAMES = Object.freeze([...STATUSES, 'blink']);

export function isStatus(s) {
  return STATUSES.includes(s);
}

export function coerceStatus(s) {
  if (isStatus(s)) return s;
  console.error(`ghost-signal: unknown status ${JSON.stringify(s)}, using warn`);
  return 'warn';
}

export class GsGridError extends Error {
  constructor(message) { super(message); this.name = 'GsGridError'; }
}
export class GsCoreExpressionError extends Error {
  constructor(message) { super(message); this.name = 'GsCoreExpressionError'; }
}
export class GsWallpaperPlacementError extends Error {
  constructor(message) { super(message); this.name = 'GsWallpaperPlacementError'; }
}

// mulberry32: tiny, seedable, good enough for glyph soup. never used by gs-mosaic (¬‿¬)
function mulberry32(a) {
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let rng = mulberry32(1);

export const GS = Object.freeze({
  seed(n) { rng = mulberry32(n >>> 0); },
  random() { return rng(); },
});

export function parseGrid(textOrRows, cols, rows) {
  const raw = Array.isArray(textOrRows) ? textOrRows : String(textOrRows).split(/[\n/]/);
  const lines = raw.map((r) => String(r).trim()).filter((r) => r.length > 0);
  const width = cols ?? (lines[0]?.length ?? 0);
  const height = rows ?? lines.length;
  if (lines.length !== height) throw new GsGridError(`expected ${height} rows, got ${lines.length}`);
  lines.forEach((line, i) => {
    if (line.length !== width) throw new GsGridError(`row ${i} has ${line.length} cells, expected ${width}`);
    if (/^[.#]+$/.test(line) === false) throw new GsGridError(`row ${i} has a character other than . or #`);
  });
  return lines;
}

const expressions = new Map();
const icons = new Map();
const sprites = new Map();
const commands = new Map();

export function registerExpression(name, grid) {
  if (CORE_EXPRESSION_NAMES.includes(name)) {
    throw new GsCoreExpressionError(`"${name}" is a core expression and cannot be replaced`);
  }
  expressions.set(name, parseGrid(grid, 16, 10));
}
export function getExpression(name) {
  return expressions.get(name);
}

export function registerIcon(name, grid) {
  icons.set(name, parseGrid(grid, 16, 16));
}
export function getIcon(name) {
  return icons.get(name);
}
export function listIcons() {
  return [...icons.keys()].sort();
}

export function registerSprite(name, grid) {
  sprites.set(name, parseGrid(grid));
}
export function getSprite(name) {
  return sprites.get(name);
}

export function registerCommands(appId, list) {
  const clean = list.map((c) => {
    if (typeof c?.id !== 'string' || typeof c?.title !== 'string') {
      throw new TypeError(`ghost-signal: command in ${appId} needs string id and title`);
    }
    return { id: c.id, title: c.title, shortcut: c.shortcut ?? '' };
  });
  commands.set(appId, clean);
}
export function getCommands() {
  return [...commands.entries()].flatMap(([app, list]) => list.map((c) => ({ ...c, app })));
}

// a grid as an svg symbol: one unit rect per lit cell. fill is inherited so currentColor works
export function gridToSymbol(name, grid) {
  const rects = [];
  grid.forEach((row, y) => {
    [...row].forEach((c, x) => {
      if (c === '#') rects.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
    });
  });
  return `<symbol id="gs-${name}" viewBox="0 0 ${grid[0].length} ${grid.length}" shape-rendering="crispEdges">${rects.join('')}</symbol>`;
}

const hasDocument = () => typeof document !== 'undefined';

// canvases paint their colors once per render, so a live data-theme flip leaves them stale.
// one observer on <html> repaints every watched element (gs-mosaic registers on connect and
// leaves on disconnect). created lazily, and never without a document, so node stays clean 👻
const themed = new Set();
let themeObserver = null;

export function watchTheme(el) {
  themed.add(el);
  if (themeObserver !== null || hasDocument() === false || typeof MutationObserver !== 'function') return;
  themeObserver = new MutationObserver(() => {
    for (const item of themed) item.render();
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

export function unwatchTheme(el) {
  themed.delete(el);
}

export function glitchLevel() {
  return hasDocument() ? (document.documentElement.dataset.glitch ?? '1') : '1';
}

export function reducedMotion() {
  return typeof globalThis.matchMedia === 'function'
    && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches === true;
}

export function motionMs(name) {
  if (hasDocument() === false) return 0;
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--gs-motion-${name}`).trim();
  if (v.endsWith('ms')) return parseFloat(v);
  if (v.endsWith('s')) return parseFloat(v) * 1000;
  return 0;
}

function fxAllowed() {
  return glitchLevel() !== '0' && reducedMotion() === false;
}

function fxOnce(el, cls, motion, { start = () => {}, end = () => {} } = {}) {
  if (fxAllowed() === false) return false;
  const ms = motionMs(motion);
  if (ms === 0) return false;
  start();
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => {
    el.classList.remove(cls);
    end();
  }, ms);
  return true;
}

// the slice's two clipped copies print attr(data-t), so the text rides in data-t for exactly the
// glitch's length. no text (a canvas face) means no copies, just the translate shift (¬‿¬)
export function glitchOnce(el) {
  const text = (el.textContent ?? '').trim();
  if (text === '') return fxOnce(el, 'gs-glitch', 'glitch');
  return fxOnce(el, 'gs-glitch', 'glitch', {
    start: () => el.setAttribute('data-t', text),
    end: () => el.removeAttribute('data-t'),
  });
}
export const moshOnce = (el) => fxOnce(el, 'gs-mosh', 'mosh');
export const flareOnce = (el) => fxOnce(el, 'gs-flare', 'flare');

// one-frame micro glitch on a random [data-gs-ambient] element every 20 to 40 seconds.
// seeded through GS.random so a test can make it deterministic. returns a stop function.
export function startAmbient({ root, min, max } = {}) {
  if (hasDocument() === false || fxAllowed() === false) return () => {};
  const scope = root ?? document;
  const lo = min ?? motionMs('ambient-min');
  const hi = max ?? motionMs('ambient-max');
  if (hi <= 0) return () => {};
  let timer = 0;
  const schedule = () => {
    const wait = lo + GS.random() * Math.max(0, hi - lo);
    timer = setTimeout(() => {
      const targets = scope.querySelectorAll('[data-gs-ambient]');
      if (targets.length > 0) glitchOnce(targets[Math.floor(GS.random() * targets.length)]);
      schedule();
    }, wait);
  };
  schedule();
  return () => clearTimeout(timer);
}

if (hasDocument()) {
  const html = document.documentElement;
  if (html.dataset.glitch === undefined) html.dataset.glitch = '1';
  if (reducedMotion()) html.dataset.glitch = '0';
}
