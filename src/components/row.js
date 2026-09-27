// timeline row: 3px status bar, sigil, label, mono command, expandable detail.
// "loose" is a row status only (a hook that never reported back), not a face status
import { coerceStatus, flareOnce, glitchLevel } from '../gs.js';
import { drawer, motionAllowed } from '../motion.js';
import './decode.js';

const Base = globalThis.HTMLElement ?? class {};
const LOOSE_SIGIL = '◌';

// the rows after this one that are on screen now, plus the ones `extra` px under the fold. a collapse
// pulls the rows just under the fold up into view, so it widens the window by the drawer's height:
// cut instead of slid, they'd land on top of the followers still sliding up >:[ opening only pushes
// rows down, so past the fold there it's a cut nobody sees
function visibleFollowers(row, extra = 0) {
  const out = [];
  const bottom = window.innerHeight + extra;
  for (let el = row.nextElementSibling; el !== null; el = el.nextElementSibling) {
    const r = el.getBoundingClientRect();
    if (r.top > bottom) break;
    if (r.bottom >= 0) out.push(el);
  }
  return out;
}

// the document's scroller and every ancestor that is a scroll container. overflow-y anything but
// visible or clip makes one, even a wrapper that never scrolls (overflow-x: hidden computes it to
// auto), so which of them clamps is measured after the flip, never predicted from one box's room:
// a fixed-height scroller keeps its height when a row in it shuts, and the page above it never moves.
// body counts like any ancestor: an app shell that holds html at overflow hidden makes body the
// scroller while scrollingElement stays html at 0. when body's overflow propagates to the viewport
// instead, body.scrollTop reads 0 before and after, so measuring it costs nothing
function scrollers(row) {
  const out = [document.scrollingElement ?? document.documentElement];
  for (let el = row.parentElement; el !== null && el !== document.documentElement; el = el.parentElement) {
    const y = getComputedStyle(el).overflowY;
    if (y !== 'visible' && y !== 'clip') out.push(el);
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
    const changed = open !== this.expanded;
    // measured before the layout flips: the rows below start where they are on screen. closing, the
    // clip is still in flow here, so its offsetHeight is the height the rows below are about to climb
    const moving = changed && motionAllowed();
    const followers = moving ? visibleFollowers(this, open ? 0 : this.#clip.offsetHeight) : [];
    const boxes = moving && open === false ? scrollers(this) : [];
    const tops = boxes.map((box) => box.scrollTop);
    if (boxes.length > 0) this.#clip.removeAttribute('data-leaving');
    this.#head.setAttribute('aria-expanded', String(open));
    // the clip is display: none now, and reading scrollTop lays that out: any scroller the collapse
    // clamps has already jumped, every row with it. a slide from there clamps twice (the out of flow
    // clip and the held follower moves keep the overflow up until they let go) and drags the rows
    // above along >:[ so a clamp is the one cut reduced motion makes. scroll anchoring pulls
    // scrollTop back the same way when the shut row sits above the anchor, and there the rows on
    // screen already hold still, so that's a cut too. read before the event, so a listener that
    // scrolls can't pass for a clamp. don't hoist this above the flip, it's the point
    const clamped = boxes.some((box, i) => box.scrollTop < tops[i] - 0.5);
    this.dispatchEvent(new CustomEvent('gs-row-toggle', { bubbles: true, detail: { open } }));
    if (moving && clamped === false) this.#move(open, followers);
    else if (changed) this.#cut();
    return open;
  }

  // a cut lands the layout in one frame, so nothing the drawer still runs may keep sliding a row from
  // where it was. a play with no height cancels every move and settles at once
  #cut() {
    this.#clip.removeAttribute('data-leaving');
    this.#drawer.play({ height: 0 });
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
