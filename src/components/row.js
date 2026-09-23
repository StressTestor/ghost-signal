// timeline row: 3px status bar, sigil, label, mono command, expandable detail.
// "loose" is a row status only (a hook that never reported back), not a face status
import { coerceStatus, flareOnce, glitchLevel } from '../gs.js';
import './decode.js';

const Base = globalThis.HTMLElement ?? class {};
const LOOSE_SIGIL = '◌';

export class GsRow extends Base {
  static observedAttributes = ['status', 'label', 'command', 'sigil'];

  #head = null;
  #sigil = null;
  #label = null;
  #command = null;
  #detail = null;

  connectedCallback() {
    if (this.#head === null) this.#build();
    this.render();
    if (this.getAttribute('status') === 'deny') flareOnce(this);
  }

  attributeChangedCallback() {
    if (this.#head !== null) this.render();
  }

  #build() {
    const children = [...this.childNodes];
    this.#head = document.createElement('div');
    this.#head.setAttribute('part', 'head');
    this.#head.setAttribute('role', 'button');
    this.#head.setAttribute('aria-expanded', 'false');
    this.#head.tabIndex = 0;
    this.#sigil = document.createElement('span');
    this.#sigil.setAttribute('part', 'sigil');
    this.#label = document.createElement('span');
    this.#label.setAttribute('part', 'label');
    this.#command = document.createElement('code');
    this.#command.setAttribute('part', 'command');
    this.#head.append(this.#sigil, this.#label, this.#command);
    this.#detail = document.createElement('div');
    this.#detail.setAttribute('part', 'detail');
    this.#detail.append(...children);
    this.append(this.#head, this.#detail);
    this.#head.addEventListener('click', () => this.toggle());
    this.#head.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  render() {
    const raw = this.getAttribute('status') ?? 'idle';
    const status = raw === 'loose' ? 'loose' : coerceStatus(raw);
    if (raw !== status) {
      this.setAttribute('status', status);
      return;
    }
    this.#sigil.textContent = status === 'loose' ? LOOSE_SIGIL : (this.getAttribute('sigil') ?? '');
    const label = this.getAttribute('label') ?? '';
    if (glitchLevel() === '2') {
      let line = this.#label.querySelector('gs-decode');
      if (line === null) {
        this.#label.textContent = '';
        line = document.createElement('gs-decode');
        this.#label.append(line);
      }
      line.setAttribute('text', label);
    } else {
      this.#label.textContent = label;
    }
    const command = this.getAttribute('command') ?? '';
    this.#command.textContent = command;
    this.#command.hidden = command === '';
  }

  get expanded() {
    return this.#head?.getAttribute('aria-expanded') === 'true';
  }

  toggle(force) {
    const open = force ?? this.expanded === false;
    this.#head.setAttribute('aria-expanded', String(open));
    this.dispatchEvent(new CustomEvent('gs-row-toggle', { bubbles: true, detail: { open } }));
    return open;
  }
}

if (globalThis.customElements && customElements.get('gs-row') === undefined) {
  customElements.define('gs-row', GsRow);
}
