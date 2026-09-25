// the by-eye surface. renders every component in every status, wires the theme and glitch
// switches, mounts the probe app through the plug-in contract and nothing else (｡◕‿↼)
import { GS, STATUSES, registerCommands, registerSprite, injectIcons, listIcons, startAmbient } from '../src/gs.js';
import { KAOMOJI } from '../src/expressions.js';
import { copy } from '../src/copy.js';
import '../src/components/mosaic.js';
import '../src/components/face.js';
import '../src/components/decode.js';
import '../src/components/tape.js';
import '../src/components/window.js';
import '../src/components/toast.js';
import '../src/components/row.js';
import '../src/components/empty.js';
import '../src/components/error.js';
import '../src/components/splash.js';
import '../src/components/palette.js';

const html = document.documentElement;
const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs = {}, text = '') => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== '') node.textContent = text;
  return node;
};

let stopAmbient = () => {};

window.GS = GS;
window.gallery = {
  lastCommand: null,
  setTheme(theme) { html.dataset.theme = theme; },
  setGlitch(level) {
    html.dataset.glitch = String(level);
    for (const row of document.querySelectorAll('gs-row')) row.render();
    stopAmbient();
    stopAmbient = startAmbient();
  },
  setStatus(status) {
    for (const face of document.querySelectorAll('gs-face[data-gallery]')) face.setAttribute('status', status);
  },
  toast(status) {
    const slot = `${status}Toast`;
    const text = ['deny', 'bypass', 'crash'].includes(status) ? copy(slot) : `${status} toast`;
    // some copy slots already end in a kaomoji (bypassToast ends in ">:D", denyToast in "XX");
    // appending the status's own kaomoji on top doubles it, so skip the argument when the text
    // already carries one
    const detail = { status, text };
    if (Object.values(KAOMOJI).some((k) => text.trimEnd().endsWith(k)) === false) detail.kaomoji = KAOMOJI[status];
    document.dispatchEvent(new CustomEvent('gs-toast', { detail }));
  },
  ambient(options) {
    stopAmbient();
    stopAmbient = startAmbient(options);
    return stopAmbient;
  },
};

// icons: gs.js registered the core twenty on import; injectIcons writes the sprite they draw from
function renderIcons() {
  injectIcons();
  for (const name of listIcons()) {
    const card = el('span', { class: 'gs-chip' });
    card.insertAdjacentHTML('afterbegin', `<svg class="gs-icon"><use href="#gs-${name}"/></svg>`);
    card.append(name);
    $('#icon-grid').append(card);
  }
}

function renderStatuses() {
  for (const s of STATUSES) {
    const card = el('div', { class: 'face-card' });
    // .gs-label lowercases everything, which turns ">:D" into ">:d"; the kaomoji's case is the
    // point, so it lives in its own span that opts back out (.gs-kaomoji in base.css)
    const label = el('span', { class: 'gs-label' });
    label.append(`${s} `, el('span', { class: 'gs-kaomoji' }, KAOMOJI[s]));
    card.append(el('gs-face', { status: s, 'data-gallery': '' }), label);
    $('#face-grid').append(card);
    $('#status-grid').append(el('span', { class: 'gs-dot', 'data-status': s }), el('span', { class: 'gs-chip', 'data-status': s }, s));
    const b = el('button', { 'data-status-pick': s }, s);
    b.addEventListener('click', () => window.gallery.setStatus(s));
    $('#status-buttons').append(b);
    const t = el('button', { 'data-toast-pick': s }, `toast ${s}`);
    t.addEventListener('click', () => window.gallery.toast(s));
    $('#toast-buttons').append(t);
  }
  for (const s of [...STATUSES, 'loose']) {
    const row = el('gs-row', { status: s, label: `${s} row`, command: s === 'loose' ? 'ls -la' : 'cargo test --workspace', sigil: s === 'deny' ? '#' : '+' });
    row.append(`detail for the ${s} row`);
    $('#row-list').append(row);
  }
}

function wireChrome() {
  for (const b of document.querySelectorAll('[data-theme-pick]')) b.addEventListener('click', () => window.gallery.setTheme(b.dataset.themePick));
  for (const b of document.querySelectorAll('[data-glitch-pick]')) b.addEventListener('click', () => window.gallery.setGlitch(b.dataset.glitchPick));
  $('#open-window').addEventListener('click', () => $('#window').open());
  $('#window-yes').addEventListener('click', () => $('#window').close());
  $('#window-no').addEventListener('click', () => $('#window').close());
  $('#open-palette').addEventListener('click', () => $('#palette').open());
  registerCommands('gallery', [
    { id: 'gallery.theme', title: 'toggle theme', shortcut: 't' },
    { id: 'gallery.glitch', title: 'cycle glitch', shortcut: 'g' },
  ]);
  document.addEventListener('gs-command', (e) => {
    window.gallery.lastCommand = e.detail;
    if (e.detail.id === 'gallery.theme') window.gallery.setTheme(html.dataset.theme === 'light' ? 'dark' : 'light');
    if (e.detail.id === 'gallery.glitch') window.gallery.setGlitch((Number(html.dataset.glitch) + 1) % 3);
    document.dispatchEvent(new CustomEvent('gs-toast', { detail: { status: 'ok', text: `${e.detail.id} from ${e.detail.app}` } }));
  });
}

// the plug-in contract, end to end: manifest, flavor css, flavor js, commands, status event
async function mountProbe() {
  const app = await (await fetch('./apps/probe/app.json')).json();
  // wait for the flavor sheet: the art below reads --gs-color-accent-2 through computed style
  await new Promise((resolve, reject) => {
    const link = el('link', { rel: 'stylesheet', href: './apps/probe/flavor.css' });
    link.onload = resolve;
    link.onerror = () => reject(new Error('probe flavor.css failed to load'));
    document.head.append(link);
  });
  const flavor = await import('./apps/probe/flavor.js');
  registerCommands(app.id, app.commands);
  // flavor.js registered the probe's sigil; the same call that wrote the core sprite adds it
  injectIcons();
  const section = $('#probe');
  section.dataset.app = flavor.app;
  const grid = el('div', { class: 'grid' });
  const expressionFace = el('gs-face', { id: 'probe-face', status: 'idle', expression: 'probing' });
  const statusFace = el('gs-face', { id: 'probe-status-face', status: 'idle' });
  const accent = el('span', { id: 'probe-accent', class: 'gs-chip', style: 'color: var(--gs-color-accent-2)' }, 'accent2');
  accent.insertAdjacentHTML('afterbegin', '<svg class="gs-icon"><use href="#gs-sigil"/></svg>');
  const empty = el('gs-empty', { id: 'probe-empty' });
  empty.append(el('gs-wallpaper', { sprite: app.id }));
  const art = el('gs-mosaic', { cols: '12', rows: '12', text: 'art\n in\n  a\n   c\n    c\n     e\n      n\n       t\n        2' });
  art.setAttribute('lit', getComputedStyle(section).getPropertyValue('--gs-color-accent-2').trim());
  grid.append(expressionFace, statusFace, accent, art, empty);
  section.append(grid);
  window.addEventListener(app.status.name, (e) => {
    statusFace.setAttribute('status', e.detail.status);
  });
}

renderStatuses();
wireChrome();
renderIcons();
registerSprite('checks', ['#...', '.#..', '..#.', '...#']);
// wallpaper is imported last, after its sprites exist: defining the element upgrades the two
// static wallpapers in index.html on the spot, and an unregistered sprite name throws. "ghost"
// is a core icon, registered by gs.js itself
await import('../src/components/wallpaper.js');
await mountProbe();
stopAmbient = startAmbient();
// doto is font-display: block, so a late load would swap the wordmark's metrics after the reveal
await document.fonts.ready;
html.dataset.galleryReady = '1';
