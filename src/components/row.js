// timeline row: 3px status bar, sigil, label, mono command, expandable detail.
// "loose" is a row status only (a hook that never reported back), not a face status
import { coerceStatus, flareOnce, glitchLevel } from '../gs.js';
import { drawer, motionAllowed } from '../motion.js';
import './decode.js';

const Base = globalThis.HTMLElement ?? class {};
const LOOSE_SIGIL = '◌';

// the rows after this one that are on screen now. rows below the fold move as a cut: nobody sees them
function visibleFollowers(row) {
  const out = [];
  const bottom = window.innerHeight;
  for (let el = row.nextElementSibling; el !== null; el = el.nextElementSibling) {
    const r = el.getBoundingClientRect();
    if (r.top > bottom) break;
    if (r.bottom >= 0) out.push(el);
  }
  return out;
}

export class GsRow extends Base {
  static observedAttributes = ['status', 'label', 'command', 'sigil'];

  #head = null;
  #sigil = null;
  #label = null;
  #command = null;
  #detail = null;
  #clip = null;
  #drawer = drawer();

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
    this.#clip = document.createElement('div');
    this.#clip.setAttribute('part', 'clip');
    this.#clip.append(this.#detail);
    this.append(this.#head, this.#clip);
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
    const moving = open !== this.expanded && motionAllowed();
    // measured before the layout flips: the rows below start where they are on screen
    const followers = moving ? visibleFollowers(this) : [];
    this.#head.setAttribute('aria-expanded', String(open));
    this.dispatchEvent(new CustomEvent('gs-row-toggle', { bubbles: true, detail: { open } }));
    if (moving) this.#move(open, followers);
    return open;
  }

  #move(open, followers) {
    if (open) this.#clip.removeAttribute('data-leaving');
    else this.#clip.setAttribute('data-leaving', '');
    this.#drawer.play({ inner: this.#detail, followers, open, height: this.#clip.offsetHeight }).then((done) => {
      if (done && this.expanded === false) this.#clip.removeAttribute('data-leaving');
    });
  }
}

if (globalThis.customElements && customElements.get('gs-row') === undefined) {
  customElements.define('gs-row', GsRow);
}
