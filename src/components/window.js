// retro os popup. modal, traps tab, escape closes, title bar in the display font.
// the element's own children become the body on first connect
import { injectIcons } from '../gs.js';
import { enter, exit } from '../motion.js';

const Base = globalThis.HTMLElement ?? class {};

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export class GsWindow extends Base {
  static observedAttributes = ['open', 'heading'];

  #built = false;
  #frame = null;
  #backdrop = null;
  #title = null;
  #body = null;
  #closeButton = null;
  #restore = null;
  #onKey = (e) => this.#key(e);

  connectedCallback() {
    if (this.#built === false) this.#build();
    if (this.hasAttribute('open')) this.#activate();
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this.#onKey);
  }

  attributeChangedCallback(name) {
    if (this.#built === false) return;
    if (name === 'heading') this.#title.textContent = this.getAttribute('heading') ?? '';
    if (name === 'open') {
      if (this.hasAttribute('open')) this.#activate();
      else this.#deactivate();
    }
  }

  #build() {
    const children = [...this.childNodes];
    const backdrop = document.createElement('div');
    backdrop.setAttribute('part', 'backdrop');
    backdrop.addEventListener('click', () => this.close());
    this.#backdrop = backdrop;

    this.#frame = document.createElement('div');
    this.#frame.setAttribute('part', 'frame');
    this.#frame.setAttribute('role', 'dialog');
    this.#frame.setAttribute('aria-modal', 'true');
    this.#frame.tabIndex = -1;

    const bar = document.createElement('div');
    bar.setAttribute('part', 'titlebar');
    this.#title = document.createElement('span');
    this.#title.setAttribute('part', 'title');
    this.#title.id = `gs-window-title-${Math.floor(Math.random() * 1e9)}`;
    this.#title.textContent = this.getAttribute('heading') ?? '';
    this.#closeButton = document.createElement('button');
    this.#closeButton.setAttribute('part', 'close');
    this.#closeButton.setAttribute('data-variant', 'ghost');
    this.#closeButton.setAttribute('aria-label', 'close');
    // the close pixel glyph from the shared sprite. injectIcons is idempotent, so a page that never
    // called it still gets #gs-close, and one that did keeps its single sprite
    injectIcons();
    this.#closeButton.innerHTML = '<svg class="gs-icon" aria-hidden="true"><use href="#gs-close"/></svg>';
    this.#closeButton.addEventListener('click', () => this.close());
    bar.append(this.#title, this.#closeButton);
    this.#frame.setAttribute('aria-labelledby', this.#title.id);

    this.#body = document.createElement('div');
    this.#body.setAttribute('part', 'body');
    this.#body.append(...children);

    this.#frame.append(bar, this.#body);
    this.append(backdrop, this.#frame);
    this.#built = true;
  }

  open() { this.setAttribute('open', ''); }
  close() { this.removeAttribute('open'); }

  #focusables() {
    return [...this.#frame.querySelectorAll(FOCUSABLE)].filter((el) => el.disabled !== true);
  }

  #activate() {
    this.removeAttribute('data-leaving');
    this.#restore = document.activeElement;
    document.addEventListener('keydown', this.#onKey);
    const inBody = this.#focusables().filter((el) => this.#body.contains(el));
    (inBody[0] ?? this.#closeButton).focus();
    enter(this.#frame, { from: 'above' });
    enter(this.#backdrop, { distance: 0 });
  }

  #deactivate() {
    document.removeEventListener('keydown', this.#onKey);
    this.setAttribute('data-leaving', '');
    Promise.all([exit(this.#frame, { to: 'above' }), exit(this.#backdrop, { distance: 0 })]).then(([done]) => {
      if (done && this.hasAttribute('open') === false) this.removeAttribute('data-leaving');
    });
    this.dispatchEvent(new CustomEvent('gs-close', { bubbles: true }));
    if (this.#restore !== null && typeof this.#restore.focus === 'function') this.#restore.focus();
    this.#restore = null;
  }

  #key(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
      return;
    }
    if (e.key !== 'Tab') return;
    const list = this.#focusables();
    if (list.length === 0) {
      e.preventDefault();
      return;
    }
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement;
    if (this.#frame.contains(active) === false) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (e.shiftKey === false && active === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

if (globalThis.customElements && customElements.get('gs-window') === undefined) {
  customElements.define('gs-window', GsWindow);
}
