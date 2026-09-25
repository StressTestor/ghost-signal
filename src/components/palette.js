// command palette. meta+k or ctrl+k toggles it, substring filter over every registered manifest,
// arrows move, enter dispatches gs-command on document and closes, escape closes
import { getCommands } from '../gs.js';
import { enter, exit, indicator } from '../motion.js';

const Base = globalThis.HTMLElement ?? class {};

export function filterCommands(list, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (q === '') return list;
  return list.filter((c) => c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
}

export class GsPalette extends Base {
  #built = false;
  #input = null;
  #box = null;
  #overlay = null;
  #list = null;
  #items = [];
  #index = 0;
  #onKey = (e) => this.#globalKey(e);

  connectedCallback() {
    if (this.#built === false) this.#build();
    document.addEventListener('keydown', this.#onKey);
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this.#onKey);
  }

  #globalKey(e) {
    // a held ctrl+k auto-repeats keydown; toggling on each one would flicker the palette
    if (e.repeat) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (this.hasAttribute('open')) this.close();
      else this.open();
    }
  }

  #build() {
    const overlay = document.createElement('div');
    overlay.setAttribute('part', 'overlay');
    overlay.addEventListener('click', () => this.close());
    this.#overlay = overlay;

    const box = document.createElement('div');
    box.setAttribute('part', 'box');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'commands');
    this.#box = box;

    this.#input = document.createElement('input');
    this.#input.setAttribute('part', 'input');
    this.#input.type = 'text';
    this.#input.placeholder = 'run a command';
    this.#input.spellcheck = false;
    this.#input.setAttribute('aria-autocomplete', 'list');
    this.#input.addEventListener('input', () => this.refresh());
    this.#input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.#move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this.#move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); this.run(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    });

    this.#list = document.createElement('ul');
    this.#list.setAttribute('part', 'list');
    this.#list.setAttribute('role', 'listbox');

    box.append(this.#input, this.#list);
    this.append(overlay, box);
    // the highlight slides between rows; the row's text color stays a cut
    indicator(this.#list, { axis: 'y', selector: '[aria-selected="true"]' });
    this.#built = true;
  }

  open() {
    this.removeAttribute('data-leaving');
    this.setAttribute('open', '');
    this.#input.value = '';
    this.refresh();
    // focus first: typing never waits on motion
    this.#input.focus();
    enter(this.#box, { from: 'above' });
    enter(this.#overlay, { distance: 0 });
  }

  close() {
    if (this.hasAttribute('open') === false) return;
    this.removeAttribute('open');
    // displayed through the exit, then gone. a reopen takes the exit over and keeps it open
    this.setAttribute('data-leaving', '');
    Promise.all([exit(this.#box, { to: 'above' }), exit(this.#overlay, { distance: 0 })]).then(([done]) => {
      if (done && this.hasAttribute('open') === false) this.removeAttribute('data-leaving');
    });
  }

  refresh() {
    this.#items = filterCommands(getCommands(), this.#input.value);
    for (const li of this.#list.querySelectorAll(':scope > [part="row"]')) li.remove();
    this.#items.forEach((c, i) => {
      const li = document.createElement('li');
      li.setAttribute('part', 'row');
      li.setAttribute('role', 'option');
      li.dataset.id = c.id;
      li.dataset.app = c.app;
      const title = document.createElement('span');
      title.textContent = c.title;
      const kbd = document.createElement('kbd');
      kbd.textContent = c.shortcut;
      li.append(title, kbd);
      li.addEventListener('click', () => this.run(i));
      this.#list.append(li);
    });
    this.#index = Math.min(this.#index, Math.max(0, this.#items.length - 1));
    this.#paint();
  }

  #move(delta) {
    const n = this.#items.length;
    if (n === 0) return;
    this.#index = (this.#index + delta + n) % n;
    this.#paint();
  }

  #paint() {
    this.#list.querySelectorAll(':scope > [part="row"]').forEach((li, i) => li.setAttribute('aria-selected', String(i === this.#index)));
  }

  run(index = this.#index) {
    const c = this.#items[index];
    if (c === undefined) return null;
    document.dispatchEvent(new CustomEvent('gs-command', { detail: { id: c.id, app: c.app } }));
    this.close();
    return c;
  }
}

if (globalThis.customElements && customElements.get('gs-palette') === undefined) {
  customElements.define('gs-palette', GsPalette);
}
