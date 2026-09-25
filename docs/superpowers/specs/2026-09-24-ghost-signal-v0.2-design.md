# ghost signal v0.2: hybrid motion and the feel harness

date: 2026-09-24
status: approved by joe 2026-09-24 with every open-question default, and the m5 panel corrected to 1470x956 css px @2x, 60hz (measured on his machine)
base: `/Volumes/T7/ghost-signal` main `3c213b5` (v0.1.0). seance read at `/Volumes/T7/seance-look` branch `feat/ghost-signal`
target: 0.2.0 (a breaking minor on 0.x: anything pinned `^0.1` is refused by the checker until it moves to `^0.2`)
lineage: synthesized from three competing designs and three judge passes. the base is the consumer-first design (judge totals 19, against 18.5 for measurement-first and 17.5 for tokens-first). grafted from measurement-first: the trace-based frame and task gates, the isolated feel project, noise control, apparatus checks and tighten-only budgets. grafted from tokens-first: family enforcement (event timing stays stepped, spatial timing stays eased), frame-aligned durations, the house curve, the eventCounts positive control, the mosh rewrite. where the base bent joe's brief (a wider property list, `@starting-style` exits, dead hover transitions) this doc holds the brief literally.

## 1. the two decisions and why

both were made by joe on 2026-09-24 and recorded in the vault note `reference/brand-forensics-ghost-signal.md`, section "decision: hybrid motion + a feel budget (2026-09-24)". joe's requirement behind both: the whole program must feel buttery and satisfying, and every action answers back.

### 1.1 hybrid motion

motion that moves space eases smoothly on the gpu: tab and view transitions, the palette sliding in, the timeline and row drawer opening, scroll-linked movement, toasts entering. motion that signals an event stays stepped and glitchy: deny flare, bypass glitch, the face changing expression, decode reveals, the tape.

why: v0.1 (spec 3.6 of `2026-09-23-ghost-signal-design.md`) made every change a hard cut and allowed easing only on hover and focus color. hard cuts on spatial changes lose the thread: a palette that pops in, or rows that jump 224px when a drawer opens, give the eye nothing to follow, and the result reads as abrupt more than as deliberate. the dedsec look lives in the event motion, so that half keeps its steps, and the spatial half gets the smoothness joe asked for. this revises v0.1's rule. reduced motion still kills all of it. glitch 0 still kills the event motion and leaves the spatial motion running.

### 1.2 a shared feel harness enforced in ci

every app inherits one harness that fails the build on:

1. any frame over 16.7ms during scripted interactions (joe's screen is a 60hz m5 retina)
2. input to paint over 50ms for any click or keypress
3. any main-thread task over 50ms during interaction
4. any layout shift after first paint
5. any animation that touches a property other than `transform` or `opacity`

why: "buttery" can't be reviewed by eye on every pr in every app. the numbers turn it into a gate, the gate lives in ghost signal so seance, agora and the super app share one definition, and it ships as code an app's own playwright e2e calls, so it runs against real app code as well as ghost signal's gallery.

## 2. what the design round measured

every design was checked against the pinned stack with throwaway probes (scratch only, nothing in the repo): `@playwright/test` 1.58.2, its chromium 145.0.7632.6 headless shell, dpr 2, on joe's mac. plan task 1 (section 15) turns these probes into committed fixtures, so each row below gets re-proved in the repo before anything is judged by it.

| # | probe | result | consequence |
|---|---|---|---|
| p1 | `PerformanceObserver.supportedEntryTypes` | `event`, `layout-shift`, `longtask`, `long-animation-frame`, `paint` present | every in-page observer exists. absence is an apparatus failure |
| p2 | idle rAF deltas | median 16.7, max 17.8, 29 of 60 above 16.7 | a raw `delta > 16.7` fails an idle page. a frame is late when it misses a vsync |
| p3 | event timing, `durationThreshold: 16`, click with a 70ms handler | `click` 80, pointerdown/pointerup/click share one `interactionId`, durations rounded to 8ms | input to paint comes from event timing. "over 50" means 56 or more |
| p4 | event timing, trivial click on a cold page | 48 to 56ms. after one warm-up click: 32. steady: 16 | the first input of a run needs an unmeasured warm-up |
| p5 | event timing, fast `keyboard.press` | no entry at all | a missing entry proves nothing. the probe needs its own proof the key landed |
| p6 | event timing, keydown handler burning 60ms | entries at 80 and 64 | slow key input is caught |
| p7 | layout shift, appending to the v0.1 bottom-anchored toast column | 0.00033, `hadRecentInput: false` | the v0.1 toast stack fails the shift budget whenever a toast arrives from the bridge |
| p8 | layout shift, a row inserted above 30 rows with no input | 0.0236, `hadRecentInput: false` | live rows landing above visible rows fail |
| p9 | the same insert done flip style (measure, insert, animate transform from the old offset to zero) | no entry, with or without input | flip removes the shift. the mechanism for toasts, drawers and live rows |
| p10 | a pure transform move | no entry | transform-stacked toasts can't shift |
| p11 | `longtask` and `long-animation-frame` on a 70ms click | longtask 73ms. loaf 86ms with `scripts[0].invoker = "BUTTON#slow.onclick"` | loaf names the function for free |
| p12 | capture listeners from `addInitScript` | every playwright input arrives `isTrusted: true` | the probe can prove each input step's input landed |
| p13 | `transitionrun` during a click on a v0.1 button | two `color` transitions (hover in, hover out) | every click on a v0.1 control fails the property budget through its hover |
| p14 | `animationstart` on a `::after`, then `target.getAnimations()` | empty. `getAnimations({ subtree: true })` returns it with `pseudoElement` | property capture must use `subtree: true` |
| p15 | trace `blink.animations` | an `Animation` event per animation with `compositeFailed` and `unsupportedProperties`. the v0.1 hover: 8224 and `["color"]`. transform animations, stepped ones included: 0 | the trace says whether chromium composited each animation, and why |
| p16 | trace top-level `RunTask` on `CrRendererMain` | one task at 19.8ms wall and 1.96ms thread time (`tdur`). the 70ms click: 73.4 wall, 68.5 thread | wall time includes the os descheduling the thread. main-thread budgets are judged on `tdur` |
| p17 | trace `PipelineReporter` | `frame_reporter.state` includes `STATE_DROPPED` with `affects_smoothness`. a 70ms handler during a transform animation produced 2 | the trace sees compositor drops rAF can't |
| p18 | trace `EventLatency` for the 60ms keydown | `KEY_PRESSED` 83.6ms, event timing said 80 | an unrounded second source that also exists for fast key presses |
| p19 | `performance.mark` in the page | lands in the trace as `blink.user_timing` on the trace clock | step windows align across the two instruments |
| p20 | `transition: color 0ms` vs `80ms`, then hover | 0ms: `getAnimations()` empty. 80ms: one `CSSTransition` | a 0ms transition creates no Animation object |
| p21 | gallery at glitch 1, sampled `getAnimations()` | `gs-flare` animates `backgroundColor`, `gs-mosh` `clipPath` + `transform`, the rest transform only | flare and mosh fail the property budget today |
| p22 | gallery load | a 0.43 shift at 263ms, after first contentful paint at 156ms, sources: the five gallery `section`s | the gallery itself fails the shift budget today. cause pinned in plan task 5 |

## 3. the motion rule

### 3.1 three classes

| class | what it is | examples | how it moves | glitch 0 | reduced motion |
|---|---|---|---|---|---|
| space | something arrives, leaves, or changes place | view and tab entry, palette and window entering and leaving, the row drawer, toasts entering, leaving and restacking, the tab and nav indicator, the palette highlight, data bars growing, the scroll edge | web animations or css transitions on `transform` and `opacity`, eased with `--gs-ease-*`, timed with `--gs-motion-*` | runs | off |
| signal | the system reports that something happened | deny flare, bypass glitch, crash mosh, face expression change and blink, decode reveal, the tape, ambient micro glitch, wallpaper stepping | css keyframes in `steps()` on `transform` and `opacity`, or js timers over text and canvas | off | off |
| cut | a state change with no motion | hover and focus color, `aria-pressed` and `aria-current` color, the button press, filtering a list | nothing animates. the next frame shows the new state | cut | cut |

### 3.2 rules that hold everywhere

- nothing animates a property other than `transform` or `opacity`. no discrete companions (`display`, `visibility`), no individual transform properties. that is joe's budget read literally; widening it is open question 2.
- space is eased and signal is stepped, and the harness checks both directions (7.7). a `steps()` curve on a spatial animation fails, and so does an eased curve on a signal animation.
- one carrier per family. a spatial transform and a signal transform never run on the same element, because two `transform` animations on one element replace each other. the element that moves through space is the carrier (a toast's `[part="slot"]`, a row, a view), and the signal plays on its content (`[part="item"]`, the `.gs-glitch` target). the harness checks this.
- the latest intent wins. motion never queues. an interrupted motion retargets from where it visually is.
- no overshoot. every curve's y stays inside 0..1, pinned by a unit test. a bounce reads as a toy against a hard-cut brand and lengthens the settle the harness waits on.
- enters get more time than exits. the eye follows what arrives and doesn't need to watch what leaves.
- the press is a cut: `button:active`, `gs-row [part="head"]:active` and `gs-palette [part="row"]:active` drop 1px with no transition. it paints on the frame after pointerdown, the fastest answer there is.

### 3.3 gates

| condition | space | signal |
|---|---|---|
| `data-glitch="0"` (seance calm) | runs | off |
| `data-glitch="1"` | runs | on |
| `data-glitch="2"` | runs | on, plus the glitch 2 extras |
| `prefers-reduced-motion: reduce` | off, twice over: every `--gs-motion-*` token is 0ms, `motion.css` declares no animation or transition outside `@media (prefers-reduced-motion: no-preference)`, and `motion.js` helpers apply the end state at once | off (tokens 0ms, `gs.js` forces glitch 0, as in v0.1) |
| `motion.css` not imported | off: every spatial change is a cut, which is the v0.1 look. `motion.js` checks the `--gs-space` flag that only `motion.css` sets | unchanged |

the double gate under reduced motion exists because the reduced-motion e2e blocks assert `document.getAnimations().length === 0`. a 0ms transition creates no Animation (p20), and the helpers never call `animate()`.

## 4. consumer inventory

the tokens and primitives come from what the apps do. this is the whole v0.2 motion surface.

### 4.1 seance (vite, tauri, ships in wkwebview on macos)

read from `src/main.ts`, `src/render/timeline.ts`, `src/render/presence.ts`, `src/render/overview.ts`.

| interaction | today | v0.2 | class | tokens | interrupted by |
|---|---|---|---|---|---|
| tab switch (`1`, `2`, tab click, palette command, overview cross nav, bypass alarm) | `clear(content)` then append | incoming view enters from its tab's side (overview left, timeline right). outgoing view cuts. the tab indicator slides | space | view 183ms, 16px on x. indicator 117ms | another switch: the half-entered view is removed with its animation, the new one enters from full offset. the indicator retargets from its current position |
| timeline row click (224px drawer) | full `renderWindow()` rebuild | rows below slide down while the drawer unrolls under them. collapse: rows below slide up into the gap | space | shift 200ms | a second click mid motion reverses from current progress. a live batch mid motion: `drawer.adopt()` re-attaches the running motion to the rebuilt nodes |
| verdict and category chips, tool select, search | color cut, list rebuilt | unchanged. the press drops 1px | cut | none | n/a |
| cmd+k palette | display flip | overlay fades in, box drops 8px and fades in. the input has focus on frame 0, so typing never waits on motion. the highlight slides between rows | space | enter 167ms, exit 100ms, indicator 117ms | cmd+k during the exit retargets back in. a held arrow key (about 30hz) retargets the highlight every 33ms |
| bypass toast arrives (live data) | appended to a flex column, older toasts shift by layout | slot slides in from the right and fades in, then the bypass glitch plays on the item. older slots move up by transform | space, then signal | enter 167ms, 24px. restack: shift 200ms | a burst restacks from current offsets |
| toast `ok` click | item removed, stack shifts by layout | slot slides out right and fades, the gap closes by transform | space | exit 100ms, shift 200ms | a new toast mid exit: restack retargets |
| live events at the top of the timeline | rebuild | at the top: rows on screen ease down by one row height through `flip` (open question 7). scrolled away: seance anchors `scrollTop` and shows an "n new" pill that enters | space | shift 200ms, enter 167ms | a new batch retargets from current offsets |
| overview bars, ratio, category fills (2hz refresh) | full panel rebuild, heights in px | retained nodes, `transform: scaleY()` / `scaleX()` from the base | space | value 233ms | the next refresh retargets |
| header mini face on the timeline | `visibility` toggle | fades in and out through opacity, slot reserved | space | enter 167ms, exit 100ms | reverses |
| boot splash to first view | splash replaced | first view enters like a tab switch. the splash wallpaper stays stepped | space | view 183ms | n/a |
| `c` calm toggle | glitch attribute flips, often nothing visible | an `ok` toast, "calm. glitch off" or "glitch back on", so the key answers back | space | toast enter | n/a |
| face reacts, poke, blink, wordmark decode, roast typing | stepped | unchanged | signal | v0.1 tokens | a new status replaces the frame at once |

### 4.2 the super app shell (no spec yet, so this is the contract it will consume)

| interaction | v0.2 | tokens |
|---|---|---|
| app switch | panes stay mounted (they are likely iframes, and remounting reloads them). outgoing pane gets `inert` and cuts, incoming pane enters 16px on y, direction by sidebar order | view 183ms |
| sidebar active bar | `indicator(sidebar, { axis: 'y' })` | indicator 117ms |
| each app's face in the sidebar | signal, stepped, from the app's status event | v0.1 tokens |
| global palette and toasts | the same `gs-palette` and `gs-toast` | as seance |
| sidebar collapse | a cut. a width change is layout, and faking it with scale smears the text | none |

## 5. tokens

`tokens.json` stays the only authored file. every token added or changed:

### 5.1 motion (durations)

| token | v0.1 | v0.2 | frames at 60hz | used by |
|---|---|---|---|---|
| `--gs-motion-hover` | 80ms | 0ms, deprecated, removed in 0.3 | 0 | nothing in the core. kept so a consumer's `var()` still resolves, and at 0ms any leftover consumer transition creates no Animation (p20) |
| `--gs-motion-enter` | | 167ms | 10 | palette box and overlay, window frame and backdrop, toast arrival, "n new" pill, mini face |
| `--gs-motion-exit` | | 100ms | 6 | the same things leaving |
| `--gs-motion-view` | | 183ms | 11 | a view or app pane entering |
| `--gs-motion-shift` | | 200ms | 12 | flip relocations: drawer followers, toast restack, live rows |
| `--gs-motion-indicator` | | 117ms | 7 | tab, nav and sidebar indicator, palette highlight. short because key repeat retargets it about 30 times a second |
| `--gs-motion-value` | | 233ms | 14 | data-driven bars and fills |

every spatial duration is a whole number of frames at 60hz (`Math.round(frames * 1000 / 60)`), so no motion ends between two vsyncs. the signal durations (`sprite 800ms`, `glitch 180ms`, `mosh 420ms`, `flare 640ms`, `decode 250ms`, `ambient-min 20s`, `ambient-max 40s`), `cut 0ms` and every `step` value are unchanged: the e2e face and decode specs are tuned to them, and `gen.test.js` pins `--gs-motion-decode | 250ms`.

why these lengths: under 100ms a move reads as a flicker, past 250ms a switch starts to feel like waiting. enters sit at 10 to 12 frames so the eye can track direction, exits at 6.

### 5.2 ease (curves)

| token | v0.1 | v0.2 | feel |
|---|---|---|---|
| `--gs-ease-hover` | `ease-out` | `ease-out`, deprecated, removed in 0.3 | inert at 0ms. `tokens.test.js` still pins that it's emitted |
| `--gs-ease-enter` | | `cubic-bezier(0.16, 1, 0.3, 1)` | the house curve, an exponential ease out. the first control point sits at y = 1, so it leaves at full speed and the answer shows on frame 1, then it settles hard into place |
| `--gs-ease-exit` | | `cubic-bezier(0.4, 0, 1, 1)` | accelerate out. moves on frame 1 and leaves fast |
| `--gs-ease-move` | | `cubic-bezier(0.16, 1, 0.3, 1)` | things already on screen changing place: drawers, indicators, restacks, bars. same value as `enter` today, a separate name so the two can diverge |

the common material curve `cubic-bezier(0.2, 0, 0, 1)` was considered for `move` and rejected: its flat starting tangent is a brief ease-in that reads as lag at these durations. no spring: nothing may overshoot (3.2).

### 5.3 distance (new group, `--gs-distance-*`)

| token | value | used by |
|---|---|---|
| `--gs-distance-enter` | 8px | palette box and window frame drop in from above, drawer content |
| `--gs-distance-toast` | 24px | toasts in from and out to the right |
| `--gs-distance-view` | 16px | a view entering along its axis |

distances are px, so no motion depends on the moving box's size.

### 5.4 feel (budgets, new group, never emitted to css)

```json
"feel": {
  "frame": "16.7ms",
  "vsyncMiss": 1.5,
  "input": "50ms",
  "task": "50ms",
  "answer": "50ms",
  "shift": 0,
  "settle": "1000ms",
  "runs": 3,
  "properties": ["transform", "opacity"]
}
```

`src/feel/budgets.js` reads this group from the package's own `tokens.json` at run time (`new URL('../../tokens.json', import.meta.url)`; `tokens.json` already ships in `files`), so every app gets the budgets of the tag it pins.

### 5.5 generator (`scripts/lib/tokens.js`)

- `toCss`: one added line, `...groupLines('distance-', t.distance)`. the new motion and ease keys ride the existing groups. the reduced-motion block already loops `Object.keys(t.motion)`, so all six new durations zero with no new code. `feel` is skipped (`toCss` lists groups explicitly, so skipping is the default).
- `toMarkdown`: a `distance` group, a "feel budgets" table, and "deprecated, removed in 0.3" on the hover pair.
- `toSwift`, `toRust`: unchanged, byte-identical output. neither emits motion in v0.1, the tuis only step, and the swift component ports come later; motion output lands with them.
- `validateMotion(t)`, called from `loadTokens`, throws on: an `ease` value containing `steps(`; a `step` value that isn't `steps(<int>)`; a key present in both `step` and `ease` other than the deprecated `hover`; a `cubic-bezier` whose y1 or y2 leaves 0..1; a spatial duration (a `motion` key with an `ease` entry, `hover` excepted) that isn't a whole number of frames at 60hz. a bad `tokens.json` fails `npm run gen`, which fails ci's first step.

## 6. css, js and components

### 6.1 `src/motion.css` (new, optional import)

holds every spatial css rule, and nothing else. everything sits inside `@media (prefers-reduced-motion: no-preference)`. it has no `data-glitch` selector.

```css
@media (prefers-reduced-motion: no-preference) {
  :root { --gs-space: 1; }  /* motion.js reads this. absent flag, every spatial change cuts */

  [part="indicator"] { transition: transform var(--gs-motion-indicator) var(--gs-ease-move); }
  gs-toast [part="slot"] { transition: transform var(--gs-motion-shift) var(--gs-ease-move); }
  [data-gs-value] { transition: transform var(--gs-motion-value) var(--gs-ease-move); }
  [data-gs-still], [data-gs-still] * { transition: none; }

  @supports (animation-timeline: scroll()) {
    .gs-scroll-edge { animation: gs-spatial-edge linear both; animation-timeline: scroll(nearest); animation-range: 0 24px; }
  }
}
@keyframes gs-spatial-edge { from { opacity: 0; } to { opacity: 1; } }
```

`.gs-scroll-edge` is the scroll-linked piece: a sticky header's hairline fades in over the first 24px of scroll, driven by the scroll timeline on the compositor. content itself never moves with scroll. `[data-gs-still]` is the per-subtree opt out.

enters, exits and view entry are web animations in `motion.js`, never css. that keeps the palette's `open` attribute synchronous, gives exits a `finished` promise, and needs neither `@starting-style` nor `transition-behavior: allow-discrete` (both are newer in webkit, and a `display` transition would fail the property budget). view transitions are out for the same reason: the default group animates `width` and `height`.

### 6.2 `src/motion.js` (new)

plain es module, node-importable with the same guards as the components, no dependencies beyond `gs.js`. every animation it creates carries `id: 'gs-move:<kind>'`, which is how the harness classifies it as space.

```js
export function motionAllowed()                  // reduced motion off and the --gs-space flag set. ignores data-glitch on purpose
export function enter(el, { from = 'below', distance = 'enter', duration = 'enter', easing = 'enter', fade = true } = {})
export function exit(el, { to = 'below', distance = 'enter', duration = 'exit', easing = 'exit', fade = true } = {})
export function enterView(el, from)              // 'left' | 'right' | 'above' | 'below', distance view, duration view
export function indicator(container, { selector, axis = 'x' } = {})
export function flip(targets, mutate, { duration = 'shift', easing = 'move', key } = {})
export function drawer({ height, duration = 'shift' })
```

- each motion returns a promise that resolves when it ends, and resolves at once with the end state applied when `motionAllowed()` is false.
- retargeting: before starting, each helper reads the element's running `gs-move:*` animation, takes its current computed `transform` and `opacity`, cancels it, and animates from those values with the duration scaled to the remaining distance. a reopen during an exit therefore turns around mid-flight with no jump.
- `indicator` appends `<span part="indicator" aria-hidden="true">` to a `position: relative` container, places it on the current item (default `[aria-current="page"], [aria-current="true"], [aria-selected="true"]`) through `translate` and `scale` from a 100px base inside one `transform`, and follows attribute (MutationObserver) and size (ResizeObserver) changes. its first placement sets `data-gs-still` for one frame so it doesn't slide in from 0. returns `{ update(), disconnect() }`.
- `flip` reads each target's visual rect, runs `mutate()`, reads the new rect, and animates `transform` from the delta to none. `key(el)` matches targets across a rebuild by key instead of node identity. callers pass only elements that intersect the viewport, so a 5000-row timeline measures the dozen on screen. one forced layout after the mutation (p9 shows the result registers no shift).
- `drawer` controls a drawer plus the rows after it, for components and virtualized lists: `play({ inner, followers })`, `reverse()` from current progress with the remaining time, `adopt({ inner, followers })` to re-attach a running motion to rebuilt nodes at the same `currentTime`, plus `progress`, `running`, `finished`. geometry: opening, followers run `translateY(-h)` to `0` while the inner content runs `translateY(-h)` to `0` inside a clip that is already full height. at progress p the inner shows `[top, top + p·h]` and the followers start at `top + p·h`, so the two never overlap and neither needs an opaque background. closing runs the pair backwards with the clip out of flow (`data-leaving`, absolute).
- token reads are memoized for the current frame, so a loop of helpers forces at most one style read.

### 6.3 `src/base.css`

- remove the four color transitions (`button` line 53, `input, select, textarea` line 72, `.gs-nav-item` line 155, `gs-row [part="head"]` line 262). hover and focus color become cuts (open question 1).
- the press: `button:active:not(:disabled), gs-row [part="head"]:active, gs-palette [part="row"]:active { transform: translateY(1px); }`, no transition.
- `gs-palette [part="box"]` and `gs-window [part="frame"]` move centering off `transform: translateX(-50%)` to `left: 0; right: 0; margin-inline: auto`, so motion owns `transform` with no composed transforms.
- `gs-palette[data-leaving], gs-window[data-leaving] { display: block; pointer-events: none; }` keeps an overlay displayed through its 100ms exit after `open` is gone.
- `gs-palette [part="list"]` gets `position: relative` for the highlight indicator. `[part="row"][aria-selected="true"]` keeps its text color cut and loses its background to the indicator.
- `gs-toast` becomes a zero-height anchor at bottom right. each item sits in `[part="slot"]` at `position: absolute; right: 0; bottom: 0; width: 100%`, and its stack place is a `translateY` written by `toast.js`. layout positions never change, so arrivals, dismissals and restacks can't register as layout shifts (p10).
- `gs-row` gets `position: relative`. the detail moves into a clip wrapper, `[part="clip"] { overflow: hidden }`, and the expanded selector becomes `[part="head"][aria-expanded="true"] + [part="clip"]`. `[part="clip"][data-leaving] { display: block; position: absolute; inset-inline: 0 }` takes a collapsing drawer out of flow so the rows below can close up.
- `gs-decode` becomes `display: inline-block; position: relative`. while `[data-playing]`, the host carries `data-final` and `gs-decode[data-playing]::after { content: attr(data-final); visibility: hidden }` holds the box at the final text's size in the final font, while `[part="text"]` (`position: absolute; inset: 0; overflow: hidden; font-family: var(--gs-font-mono)`) draws the scramble over it. host and overlay share the host's `white-space`, so a wrapping toast line wraps the same way in both. the mono switch moves from the host to the overlay, so the in-flow width never changes mid-decode. `textContent` still walks the scramble frames, and generated content is excluded from both `textContent` and `innerText`.

`base.css` still has no `animation` and, after this, no `transition` either.

### 6.4 `src/fx.css`

- rename every keyframe to the `gs-event-*` prefix: `gs-event-glitch-shift`, `gs-event-glitch-a`, `gs-event-glitch-b`, `gs-event-mosh`, `gs-event-mosh-a`, `gs-event-mosh-b`, `gs-event-flare`, `gs-event-tape`. the name is how the lint and the harness classify a css animation as signal, and consumers follow the same convention with their namespace (`sn-event-*`, `sn-spatial-*`, per v0.1 spec 6.4). class names (`.gs-glitch`, `.gs-mosh`, `.gs-flare`) are public api and stay.
- flare, rewritten from `background-color` to an opacity flash behind the row's content, same 8 steps, same on-off-on-off shape, same look:

```css
:root[data-glitch="1"] .gs-flare, :root[data-glitch="2"] .gs-flare { position: relative; isolation: isolate; }
:root[data-glitch="1"] .gs-flare::after, :root[data-glitch="2"] .gs-flare::after {
  content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;
  background-color: var(--gs-color-deny); opacity: 0;
  animation: gs-event-flare var(--gs-motion-flare) var(--gs-step-flare) 1;
}
@keyframes gs-event-flare { 0% { opacity: 1; } 25% { opacity: 0; } 50% { opacity: 1; } 100% { opacity: 0; } }
```

- mosh, rewritten from `clip-path` to the glitch trick: `moshOnce` puts the text in `data-t` like `glitchOnce`, `::before` and `::after` print it with static band clips (`inset(10% 0 60% 0)` and `inset(50% 0 20% 0)`, never animated), and `gs-event-mosh`, `gs-event-mosh-a`, `gs-event-mosh-b` step `transform` and `opacity` on the element and the two bands in `steps(6)` over 420ms. the smear keeps its band slicing. a canvas or empty-text target gets the element shift only, as glitch does. the look changes and needs joe's eye (open question 6).
- tape: the rule keeps `calc(var(--gs-motion-sprite) * 12) steps(48) infinite` and renames its keyframe.
- the glitch 2 chromatic `text-shadow` on hover, corrupt corners and the pixel cursor are static and unchanged.

### 6.5 `src/gs.js`

- `moshOnce` passes `data-t` the way `glitchOnce` does.
- nothing else changes up front. two changes are prepared and land only if the gallery scenario flags them (section 15, task 7): `fxOnce`'s `void el.offsetWidth` restart skipped when the class is absent (restart through `getAnimations({ subtree: true })` and `currentTime = 0` when present), and `motionMs` memoized per frame like `motion.js`. a status change hits 8 faces in the gallery in one task, and each forced reflow shows up in the frame and input budgets if it matters.

### 6.6 components

| component | change | public api change |
|---|---|---|
| `gs-palette` | `open()` sets `open` synchronously and calls `enter` on `[part="box"]` (from above, distance enter) and a fade on `[part="overlay"]`. `close()` removes `open` synchronously, sets `data-leaving`, runs `exit`, clears `data-leaving` when it finishes. reopening mid-exit retargets. the highlight becomes `indicator(list, { axis: 'y', selector: '[aria-selected="true"]' })`. focus lands on the input before any motion | none. `open()`, `close()`, `run()`, `gs-command` unchanged |
| `gs-window` | the same as the palette on `[part="frame"]` and `[part="backdrop"]`. focus trap unchanged | none |
| `gs-toast` | each item wrapped in `[part="slot"]`. arrival: `enter(slot, { from: 'right', distance: 'toast' })`, and the new slot's offset stays 0 until its enter finishes, so the enter and the restack transition never contend for one element. `toast()` measures slot heights once per insert or removal and writes `translateY(-(heights of newer slots + gaps))` per slot (pure `stackOffsets(heights, gap)`). dismissal (the `ok` click or the 4s timer) runs `exit(slot, { to: 'right', distance: 'toast' })`, removes the slot, then restacks. `glitchOnce` and `moshOnce` stay on `[part="item"]`, never the slot | dom only: `[part="slot"]` is new. `toast()` still returns the item. `[part="item"]`, `[part="kaomoji"]`, `[part="ok"]`, `data-status`, sticky rules unchanged |
| `gs-row` | detail wrapped in `[part="clip"]`. `toggle()` flips `aria-expanded` synchronously (tests read it) and runs `drawer()` over the clip and the following sibling rows that intersect the viewport. rows below the fold move as a cut. flare now drives `::after` | dom only: `[part="clip"]` is new. `toggle()`, `expanded`, `gs-row-toggle` unchanged |
| `gs-decode` | sets `data-final` while playing (6.3) | `data-final` exists only while `data-playing` does |
| `gs-face`, `gs-mosaic`, `gs-tape`, `gs-wallpaper`, `gs-splash`, `gs-empty`, `gs-error`, containers | unchanged in js | none |

## 7. the feel harness

### 7.1 files

everything ships under `src/feel/`, so it resolves through the existing `"./*": "./src/*"` export and `files: ["src", ...]`. `package.json` changes only its version and scripts, and `scripts/sync-ghost-signal.sh` already copies `src/` into agora's vendored copy.

| file | runs in | job |
|---|---|---|
| `src/feel/probe.js` | the page | one self-contained function installed with `page.addInitScript`, so it runs before any app module and before first paint. playwright injects it through cdp, outside the page's csp. owns `window.__gsFeel`. exports `PROBE_VERSION` |
| `src/feel/trace.js` | node, pure | trace events in; renderer pid, frames, top-level tasks, animation composite results, event latencies and step windows out |
| `src/feel/budgets.js` | node | loads `feel` from `tokens.json`, merges overrides that tighten, throws `GsFeelConfigError` on one that loosens. also the pure rule functions (`isVsyncMiss`, `worstInteraction`, `isUnpromptedShift`, `animatedProperties`, `familyOf`) |
| `src/feel/evaluate.js` | node, pure | probe samples + trace summary + budgets in, violations out. the median logic lives here |
| `src/feel/format.js` | node, pure | report in, the failure text (7.9) out |
| `src/feel/playwright.js` | node | the public api: `withFeel`, `feelFixture`, `feelProject`, `feelUse`, `FEEL_PROFILES` |
| `src/feel/index.js` | node | re-exports the pure parts for scripts and the cli |

no file imports `@playwright/test`. the fixture uses only what it's handed: `page.addInitScript`, `page.evaluate`, `page.emulateMedia`, `page.context().newCDPSession(page)`, `testInfo.attach`, `testInfo.annotations`. ghost signal keeps zero runtime dependencies, declares no peer dependency, and a consumer never loads a second copy of `@playwright/test`. `@playwright/test` stays a dev dependency pinned at 1.58.2, and the readme names that pin as the supported consumer version. the probe never writes to the console, so a consumer guard that fails on undeclared console errors (seance's `pageGuard`) never trips on it.

### 7.2 wiring it into an app

```js
// playwright.config.js in the consumer
import { defineConfig } from '@playwright/test';
import { feelProject } from 'ghost-signal/feel/playwright.js';

export default defineConfig({
  // ...existing config...
  projects: [
    { name: 'chromium', testMatch: '*.spec.js', use: { browserName: 'chromium' } },
    feelProject({ testMatch: '*.feel.js' }),
  ],
});
```

`feelProject(overrides)` returns `{ name: 'feel', testMatch, retries: 0, fullyParallel: false, use: { ...feelUse } }`. `feelUse` is `{ browserName: 'chromium', viewport: FEEL_PROFILES.m5.viewport, deviceScaleFactor: 2, trace: 'off', video: 'off', screenshot: 'off' }`. playwright's own trace snapshots the dom around every action on the page's main thread, which would land inside the budgets, and seance's default project sets `trace: 'retain-on-failure'`. run it with `playwright test --project=feel --workers=1`.

### 7.3 seance calling it

```js
// e2e/feel.js: seance's pageGuard keeps running under the feel specs
import { test as base } from './harness.js';
import { withFeel } from 'ghost-signal/feel/playwright.js';

export const test = withFeel(base);
export { expect } from './harness.js';
```

```js
// e2e/timeline.feel.js
import { test } from './feel.js';
import { openSeance } from './harness.js';
import { bulkFixture, batch, governing } from './fixtures.js';

test('timeline and palette answer back', async ({ page, feel }) => {
  let seance;
  await feel.scenario('timeline', {
    matrix: [
      { name: 'g1', glitch: '1' },
      { name: 'calm', glitch: '0', mode: 'calm' },
      { name: 'still', media: { reducedMotion: 'reduce' }, mode: 'still' },
    ],
    setup: async (m) => {
      seance = await openSeance(page, bulkFixture(5000));
      if (m.glitch === '0') await page.keyboard.press('c');
    },
    steps: async (s) => {
      await s.input('to timeline', () => page.keyboard.press('2'));
      await s.input('open drawer', () => page.locator('.tl-row').first().click());
      await s.input('close drawer', () => page.locator('.tl-row').first().click());
      await s.input('open palette', () => page.keyboard.press('Meta+k'));
      await s.input('filter palette', () => page.keyboard.type('tim'));
      await s.input('close palette', () => page.keyboard.press('Escape'));
      await s.event('live batch at the top', () =>
        seance.emit(batch([governing({ key: 'live-1', tsMs: Date.now(), decision: 'deny', command: 'ls' })], 2)));
      await s.scroll('scroll the timeline', () => page.mouse.wheel(0, 1200));
      await s.idle('toasts expire', 4300);
    },
  });
});
```

### 7.4 api

- `withFeel(test, { budgets })` extends a playwright `test` with a `feel` fixture. `feelFixture(options)` returns the raw fixture tuple for a `base.extend({ ... })` that composes it by hand.
- `feel.scenario(name, { matrix, setup, steps, budgets })` runs, per matrix entry: one unmeasured warm-up run, then up to `feel.runs` measured runs (7.8). each run calls `setup`, arms, runs `steps`, disarms. matrix keys: `name`, `glitch`, `theme`, `media` (passed to `page.emulateMedia`), `mode`.
- modes: `'motion'` (default) applies every budget. `'calm'` also fails on any signal motion. `'still'` also fails on any Animation of any kind, and throws `GsFeelUnevaluable` if `matchMedia('(prefers-reduced-motion: reduce)')` doesn't match, so a misconfigured spec can't pass silently.
- step kinds:

| kind | driven by | checks |
|---|---|---|
| `s.input(name, fn, opts)` | real playwright input only (`locator.click`, `page.keyboard`, `page.mouse`), proved by the probe | all |
| `s.event(name, fn, opts)` | anything, usually `page.evaluate` standing in for the bridge or a timer | frame, task, shift, property, composite, family |
| `s.scroll(name, fn, opts)` | `page.mouse.wheel` or keyboard scrolling | frame, task, shift, property, composite, family. wheel isn't a discrete input, so shifts during a scroll count |
| `s.idle(name, ms)` | nothing, the page's own timers | frame, task, shift, property, composite, family |

- step options: `{ answer: false, why }` for a step that shouldn't visibly answer, `{ settleTimeout }`. scenario option: `feel.allowShift(selector, why)`. both require a `why`, both print in every report passing or not, and a declared exemption that no run used fails the test, the same rule seance's `pageGuard` applies to `expectConsoleError`.
- budgets only tighten. a looser override throws `GsFeelConfigError: budgets can only tighten. declare an exemption on the step instead`.
- `feel.measure()` returns `{ stop() }` for a single unrepeated window inside an ordinary functional spec. `stop()` returns the report and throws only on deterministic violations (shift, property, composite, family, silent), so a functional spec picks those up without becoming a timing test.
- `feel.selfTest()` mounts a planted button whose click burns 80ms and appends a row above the fold with no flip, drives it with real input, and asserts the harness reports an input, a task and a shift violation. it runs in the consumer's own build, csp and config. if the harness can't see a bug planted on purpose, nothing it says about the app counts.
- `npx ghost-signal lint-motion <css files...>`: the static twin of the property and family checks (7.7), for `gs:check`.

### 7.5 two instruments

the probe records, while armed:

- rAF timestamps from a self-rescheduling rAF loop
- event timing entries (`type: 'event'`, `durationThreshold: 16`), `layout-shift` (buffered, each source's node turned into a css path at record time), `longtask`, `long-animation-frame` (with `scripts[]` flattened to invoker, source url, function, duration), `paint`
- trusted `pointerdown` and `keydown` (capture phase on `window`, `isTrusted` checked) with `event.timeStamp`, and `performance.eventCounts` snapshots before and after each input step
- animation starts: `transitionrun` (gives `propertyName`), `animationstart` followed by `target.getAnimations({ subtree: true })` (p14), and a transparent wrapper on `Element.prototype.animate` that records keyframe keys and calls the original with the same arguments. listeners are required: `getAnimations()` drops finished animations, so a sweep alone misses a 100ms exit
- one post-frame sample of `document.getAnimations()` per frame, scheduled with a `MessageChannel` message posted from the rAF callback so it runs after rendering, when style is clean and the call forces no recalc. this catches animations started before arming and scroll-driven ones
- the first answer after each trusted input: a dom mutation (one document `MutationObserver`, subtree, attributes, childList, characterData), an `input` event on a text control (a MutationObserver can't see `input.value`, and seance's search debounces 120ms before touching the dom), an animation start, a focus move, a scroll, a selection change. it stores only the first timestamp and a count per step. mutations from the ambient sources are excluded: `gs-wallpaper[data-step]`, `gs-face[data-frame]` blinks, `gs-tape`, the ambient `.gs-glitch` toggles from `startAmbient`, and any subtree a consumer marks `data-gs-ambient-source`
- step marks: `performance.mark('gs-feel:<run>:<step>:start|end')`, which also land in the trace (p19) and tie the two clocks together

the trace is one cdp trace per measured run, from `page.context().newCDPSession(page)` (a page session, so it never collides with another page): `Tracing.start` with `transferMode: 'ReportEvents'` and exactly these categories:

```
disabled-by-default-devtools.timeline        RunTask with tdur
disabled-by-default-devtools.timeline.frame  BeginMainThreadFrame, PipelineReporter, DrawFrame, TracingStartedInBrowser
devtools.timeline                            EventDispatch, FunctionCall, TimerFire, Layout, UpdateLayoutTree, Paint
blink.animations                             Animation (compositeFailed, unsupportedProperties)
blink.user_timing                            the step marks
input                                        EventLatency
```

`trace.js` picks the page's renderer pid from `TracingStartedInBrowser`, finds `CrRendererMain` through `thread_name` metadata, and maps trace microseconds to `performance.now()` milliseconds through the step marks.

### 7.6 windows and settling

a step's window opens at its start mark (one `evaluate` right before the action) and closes when the page is quiet: no running finite animation on the document timeline (`a.timeline === document.timeline` and `iterations` finite, so the tape and the scroll edge don't hold it open, and a finished animation held by `fill: both` doesn't either), no `gs-decode[data-playing]`, no non-ambient mutation for 3 consecutive frames, and at least 150ms after the input. the wait is one `evaluate` awaiting an in-page promise, so nothing polls across cdp while measuring. a step that isn't quiet by `feel.settle` (1000ms) closes and fails as `never settled`, which also catches a runaway spatial loop. frames, tasks and answers count inside windows, matching joe's "during scripted interactions". shift, property, composite and family rules count for the whole armed period.

### 7.7 how each budget is measured

| check | limit | gate source | fails when | corroboration and attribution | class |
|---|---|---|---|---|---|
| frame | `feel.frame` 16.7ms | trace: for each pair of consecutive `BeginMainThreadFrame` events on the page's `CrRendererMain` inside a window, the sum of `tdur` of top-level `RunTask`s (not nested in another `RunTask`) starting in that interval. the first interval opens on the window's start mark and the last closes on its end mark, so a task that runs before the window's first `BeginMainThreadFrame` counts toward the frame it holds back | a sum over 16.7ms: the main thread couldn't produce that frame on time, whatever the wall clock said | rAF gaps against the calibrated vsync interval `I` (a gap `> vsyncMiss × I`, 25ms at 60hz, with a cpu sum under budget and no compositor drop prints as `stall`, informational). `PipelineReporter` `STATE_DROPPED` with `affects_smoothness` (p17) is informational until the ubuntu baseline (8.6) shows the clean control produces none, then it becomes a gate. heaviest trace children per frame, counted when repeated (`Layout 11.4ms x8` is how a forced-reflow loop shows up) | timing |
| input to paint | `feel.input` 50ms | event timing entries with `interactionId > 0`, max `duration` per interaction (the inp definition) | `> 50`, so 56 or more given the 8ms rounding (p3) | the phase split: input delay, processing, presentation delay, plus overlapping loaf scripts. `EventLatency` (p18) prints a disagreement line when event timing has no entry but the trace says over 50 | timing |
| task | `feel.task` 50ms | trace: top-level `RunTask` `tdur` inside a window | `tdur > 50` | `dur > 50` with `tdur <= 50` is a runner stall and prints as one (p16). the matching loaf entry names the script (p11). `longtask` corroborates, on wall time | timing |
| layout shift | `feel.shift` 0 | `layout-shift` entries (buffered) with `startTime` after the `first-contentful-paint` entry. shifts during load after first paint belong to a pseudo step named `load` | `hadRecentInput === false` and `value > 0`, unless every source matches a declared `allowShift` | `hadRecentInput: true` (chrome sets it for 500ms after a discrete input) is the ui answering the input, listed as info and passing. sources print as css paths with before and after rects | deterministic |
| property | `feel.properties` | the probe's animation capture (7.5) | any animated property outside `transform` and `opacity` (keyframe bookkeeping keys `offset`, `computedOffset`, `easing`, `composite` ignored) | target path, pseudo element, animation name or transition property | deterministic |
| composite | `compositeFailed` 0 | trace `Animation` events (p15) | any nonzero `compositeFailed`, bits decoded (bit 13 unsupported css property, bit 5 invalid compositing state, bit 10 transform can't be accelerated on the target, the rest by number). bit 16 (no visible change, fires on hidden elements) is ignored | `unsupportedProperties`. this is what "eases on the gpu" means in practice: a transform animation on an inline `span` passes the property check and still runs on the main thread | deterministic |
| family | 3.2 | the animation capture, classified: a css animation whose name matches `/-event-/` is signal, `/-spatial-/` or any css transition or `gs-move:*` web animation is space, anything else is unclassified | `event eased` (a signal animation with a non-`steps()` easing), `spatial stepped`, `unclassified`, `signal at glitch 0` (any signal animation, `gs-decode[data-playing]` or wallpaper step while `data-glitch="0"` in `calm` mode), `motion under still` (any Animation in `still` mode), `one carrier` (a space and a signal animation both touching `transform` on one target at once) | target path, names, easings | deterministic |
| answer | `feel.answer` 50ms | the probe's first answer after the trusted input's `timeStamp` (7.5) | over 50ms fails as slow. nothing by the end of the step fails as silent | what answered, and when. the 1px press is a pseudo class the probe can't see, so a control whose only answer is the press opts out with a `why` | timing (latency), deterministic (silent) |

answer and composite go beyond joe's five budgets. answer is "every action answers back" made checkable, composite is "on the gpu" made checkable. both are on by default (open questions 3 and 4).

### 7.8 apparatus checks

a harness that measured nothing must not report a pass. each of these throws `GsFeelUnevaluable`, which fails the test with the missing piece and the fix:

- the browser isn't chromium
- `supportedEntryTypes` lacks `event`, `layout-shift`, `longtask` or `long-animation-frame`
- the trace lacks what the decoder needs: `TracingStartedInBrowser` for the page, a `CrRendererMain` thread name, `BeginMainThreadFrame` inside each step, `RunTask` with `tdur`. this checks the trace's shape directly, so a playwright bump that keeps the format keeps working and one that breaks it fails loudly. the chromium version prints in every report
- `window.__gsFeel` is missing (the page was created before the fixture, or navigation reached a context the init script didn't)
- a step recorded zero rAF frames
- an input step saw no trusted `pointerdown` or `keydown`, or `performance.eventCounts` didn't grow for the input type the action dispatched. this is the positive control for fast key presses, which emit no event timing entry at all (p5)
- the runner steadiness gate failed (8.3)

### 7.9 failure output

a failing scenario throws `GsFeelError` whose message is the text report, so the `list` reporter prints it into the ci log. the fixture attaches `feel-<scenario>-<matrix>.txt`, `feel-<scenario>-<matrix>.json` (versioned report: env, budgets, exemptions, per-run per-step frames, interactions, tasks, shifts, animations, answers, then violations, unconfirmed, stalls, result `pass | fail | unevaluable`) and `feel-<scenario>-<matrix>-run<n>.trace.json` for each run with a violation, which loads in chrome devtools with the step marks on the timings track.

```
feel: gallery / g1-dark failed 3 checks in 2 steps. runs 1 and 2 agree, run 3 skipped
chromium 145.0.7632.6 headless shell, linux x64, 1470x956 @2x, vsync 16.7ms, calibration 38ms, steady

step 6 "click status bypass" (input: click [data-status-pick="bypass"])
  frame      2 frames over 16.7ms. worst 31.2ms main-thread cpu at +18ms (run 1 31.2, run 2 29.8)
             inside: Layout 11.4ms x8, UpdateLayoutTree 9.1ms x8, forced from src/gs.js:169 fxOnce
  input      click painted after 72ms (limit 50, rounded to 8ms). input delay 1, processing 58, presentation 13

step 21 "5 toasts arrive" (event)
  shift      0.0031 with no recent input. gs-toast#toasts > [part="slot"]:nth-child(1) moved 0,-44
             if intended, feel.allowShift(selector, why)

unconfirmed: step 12 frame 18.9ms in run 1 only. annotated feel-unconfirmed
stalls: 2 rAF gaps with no cpu behind them (runner descheduled chromium). informational
exemptions: none
passed: 18 other steps. 14 animations, all transform or opacity, all composited
```

## 8. flake control on ci runners

`ubuntu-latest` for a public repo is a shared 4 vcpu vm with no gpu, and the headless shell rasters in software. the design separates app jank from runner noise without loosening joe's numbers.

### 8.1 isolation

feel specs run in their own playwright project, alone: `workers: 1`, `fullyParallel: false`, `retries: 0` (a playwright retry would hide a confirmed failure; the harness does its own repeats), and playwright's trace, video and screenshots off (7.2). `feelProject` carries this to consumers so nobody has to remember it.

### 8.2 a fixed environment

- profile `m5`: viewport 1470x956 css px, `deviceScaleFactor: 2`, 60hz (measured on joe's m5: 1470x956 looks-like, 2x, 60hz). one object, `FEEL_PROFILES.m5`
- `page.emulateMedia({ reducedMotion, colorScheme })` set explicitly per matrix entry
- no cpu throttling in ci. `cpuSlowdown` exists for local stress runs only
- the probe asserts `document.visibilityState === 'visible'` when arming. playwright's chromium flags already disable background timer throttling
- the app runs as shipped: blink, ambient glitch and the tape stay on. a scenario that depends on which element ambient glitch hits calls `GS.seed(1)` in setup

### 8.3 settle, warm, then arm

each run's setup ends with: `document.fonts.ready`, a `first-contentful-paint` entry, no running finite animations, then a warm-up interaction and 30 steady frames.

- the warm-up: the probe mounts a 1x1 `data-gs-feel-warmup` element in a corner, clicks it and presses `Shift` through real input, then removes it. this pays the cold first-input cost (p4) without clicking into the app's own ui. excluded from scoring
- the vsync interval `I` is the median rAF delta of the 30 frames, so the budget stays right on a 120hz panel
- steadiness gate: at most 1 of the 30 deltas may miss a vsync. retry for up to 3s, then throw `GsFeelUnevaluable: runner unsteady`. the build goes red under a name that points at the machine, and nobody spends an hour on app code that was fine
- a calibration number (a fixed integer loop timed in the page) goes in every report. it gates nothing and makes a slow-runner failure recognizable when comparing two ci logs

### 8.4 cpu time over wall time, and quantization

frame and task gates read `tdur` (p16). a vm stealing the cpu shows up in `dur` and in rAF gaps, and those print as stalls. rAF gaps count in whole vsyncs, event timing compares its 8ms-rounded durations, and both facts are in the failure text so nobody reads `56ms` as a precise number.

### 8.5 warm-up run, then median of runs

each matrix entry runs once unmeasured (jit, style caches, font and image decode, first layer raster), then measured runs, each through `setup` from a fresh navigation and a fresh probe.

- timing checks (frame, input, task, answer latency) take, per step and check, the worst value inside a run, then the median across runs. with three runs the median is over the limit exactly when two of three are, so a failure has to reproduce. fast path: runs 1 and 2 agree (both pass or both fail) and run 3 never happens; disagreement runs 3
- a violation in one run of three is `unconfirmed`: printed, attached as a `feel-unconfirmed` annotation, and appended to `$GITHUB_STEP_SUMMARY` when that variable exists, so it's visible on a green build's summary page instead of buried in a log. the json report keeps it so a one-in-three regression shows as a pattern across runs
- deterministic checks (shift, property, composite, family, silent) fail on the first run that shows them
- `GS_FEEL_RUNS=1` on joe's mac: one measured run, any violation fails. that's the strict mode for the machine the apps ship to, and the pre-tag gate uses it
- there is no timing scale and no loosening knob. the budgets in ci are joe's numbers

### 8.6 the baseline plan task 1 has to produce

run the clean control page 20 times on `ubuntu-latest` at the `m5` profile and record frame cpu p50 and p99, the tracing overhead inside `tdur`, stall counts, compositor drops and the calibration spread. that data decides what this doc can't know yet: whether "1 of 30" holds on github's runners, whether compositor drops can gate, and whether ci stays at dpr 2 (if software raster at dpr 2 makes the clean control unsteady, the ci profile drops to dpr 1 and the doc says so; joe's strict runs stay at dpr 2). the budgets don't move to absorb tracing overhead. if the clean control can't hold joe's numbers on ubuntu at all, that goes to joe before anything changes (open question 8).

### 8.7 baseline results (plan task 1)

measured on `ubuntu-latest` (linux x64), chromium 145.0.7632.6 headless shell, 20 runs of
`test/feel/pages/clean.html` per dpr, run 36112359837 at 5d69ed0. each run drives a rAF loop
the way the probe will, so the frame rows count every vsync, and calibrate runs before
`baseline:start`, so its task sits outside every frame.

| | dpr 2 | dpr 1 |
|---|---|---|
| runs with at most 1 of 30 frames missing a vsync | 20 of 20 | 20 of 20 |
| frame cpu p50 / p99 / max (ms) | 0.5 / 9.3 / 9.7 | 0.5 / 9.2 / 9.8 |
| frames over 16.7ms | 0 of 622 | 0 of 622 |
| tracing overhead, calibration loop off / on p50 (ms) | 23.5 / 23.5 | 23.5 / 23.5 |
| runner stalls (wall over 50ms, cpu under) | 0 | 0 |
| compositor drops affecting smoothness | 20 in 20 of 20 runs | 20 in 20 of 20 runs |
| calibration min / p50 / max (ms) | 23.4 / 23.5 / 23.6 | 23.4 / 23.5 / 23.6 |
| inline span `compositeFailed` | 1056 | 1056 |

the off / on row is wall time for one settled call each (calibrate repeats until two calls agree
within 5%, so neither side pays for the jit or a cold clock). the p50 of on minus off is 0.1ms at
both dprs. the first recording (run 36110576196 at 2219a88) compared a cold call with a warm one,
drove no rAF loop and put calibrate inside the frame window, so its rows don't compare with these.
its decisions came out the same.

decisions: the steadiness gate stays at 1 of 30. ci runs the feel project at dpr 2. compositor
drops stay informational. `bad-composite.html` asserts bits 1056.

## 9. tests

### 9.1 the one existing test that changes

`test/unit/css.test.js`, "every transition eases only color, border-color and background-color with the hover tokens", encodes the v0.1 rule this release replaces and requires at least four such transitions. it's rewritten as:

- no `transition` declaration in `base.css` or `fx.css`
- every `@keyframes` in `base.css`, `fx.css` and `motion.css` touches only `transform` and `opacity` (the `lint-motion` scanner)
- every `transition` in `motion.css` is `none` or names only `transform` or `opacity`, with a `--gs-motion-*` duration and a `--gs-ease-*` curve, and `motion.css` has no `data-glitch` selector and nothing outside the `no-preference` media query except `@keyframes`

every other existing test keeps passing unchanged, and why:

- "base.css has no animation at all": it gains none
- "every animated selector in fx.css is gated on a glitch level": flare and mosh stay gated, the new `::after` and band rules are gated too
- "the contrast scanner finds nothing in either file": no color token changes. `scanCss` also runs over `motion.css`, which sets no color
- `tokens.test.js` pins `--gs-ease-hover` (still emitted) and loops the reduced block over `t.motion` (covers the new keys)
- `gen.test.js` pins `--gs-motion-decode | 250ms` (unchanged). swift and rust stay byte-identical
- `decode.spec.js` reads `textContent` frames: the scramble still lives in `[part="text"]`, and the size holder is generated content
- `gallery.spec.js` "bypass and crash toasts do not double their kaomoji": `innerText` excludes the mosh bands' generated content, as it already does for the bypass glitch copies
- `window.spec.js` and `gallery.spec.js` toast selectors are descendant selectors (`#toasts [part="item"]`), so the slot wrapper doesn't break them, and `toast()` still returns the item
- `palette.spec.js` "a held ctrl+k does not flicker" reads `hasAttribute('open')` synchronously, which `close()` still flips at once. `toBeHidden()` assertions auto-wait past the 100ms exit
- `row.spec.js`: `aria-expanded` flips synchronously, `[part="detail"]` keeps its text inside the clip, `.gs-flare` still lands on connect
- every reduced-motion block asserting `getAnimations().length === 0`: tokens are 0ms, `motion.css` declares nothing, the helpers never call `animate()`

### 9.2 new unit tests (`node:test`, no browser)

| file | asserts |
|---|---|
| `tokens.test.js` (extended) | the six new durations emitted and zeroed in the reduced block. `--gs-distance-*` emitted, no `--gs-feel` in css. `motion.hover` is 0ms. `validateMotion` rejects each shape in 5.5, one fixture each. every spatial duration is a whole frame count. every `cubic-bezier` y stays in 0..1 |
| `gen.test.js` (extended) | swift and rust output byte-identical to v0.1. markdown has the `distance` group and the feel budgets table |
| `motion-lint.test.js` | `lint-motion` fails on its own fixture for each rule (non-transform/opacity keyframe, `transition: all`, a `-event-` keyframe with an eased timing, a `-spatial-` or transition with `steps(`, an ungated `-event-` animation, an unclassified keyframe name) and passes on `base.css`, `motion.css` and `fx.css` as shipped |
| `motion.test.js` | `motion.js` imports in node. with `matchMedia` stubbed to reduce, every helper resolves at once with the end state. pure `stackOffsets(heights, gap)`, `drawerProgress(transformY, height, opening)` and the retarget duration math |
| `feel-trace.test.js` | fixture traces recorded from chromium 145 by `scripts/record-feel-fixtures.js` (a dev script, run on demand, output committed under `test/unit/fixtures/feel/`): renderer pid selection, top-level `RunTask` nesting, per-frame cpu sums, `compositeFailed` decoding including 8224, `EventLatency` pairing, clock mapping through marks. synthetic arrays for a missing `thread_name` (unevaluable), nested tasks, and a stall (wall 20, thread 2) |
| `feel-evaluate.test.js` | median and the two-run fast path, unconfirmed classification, stalls, `hadRecentInput` filtering, the first-contentful-paint cutoff, `allowShift` declared but unused fails, each family violation, silent versus slow answer, ambient mutations excluded from answers and settling, deterministic checks failing on one run |
| `feel-budgets.test.js` | the `feel` group loads from `tokens.json`, a tighter override wins, a looser one throws `GsFeelConfigError` |
| `feel-format.test.js` | the 7.9 text for fixed reports. asserts lowercase, no em dash, no exclamation point |

### 9.3 new e2e (the existing `chromium` project, `test/e2e/`)

- `motion.spec.js`: palette open plays only transform and opacity; `close()` drops `open` at once and hides after the exit; reopening mid-exit retargets (the box's opacity, sampled every rAF, never jumps by more than the steepest single-frame step of a fresh run plus one frame of slack); glitch 0 still moves; reduced motion leaves `getAnimations()` empty; the tab indicator retargets mid slide under the same no-jump rule
- `toast.spec.js`: a burst of 5 then dismissing the middle one records zero `layout-shift` entries of any kind (observer read directly, independent of the harness); a bypass toast's glitch lands on `[part="item"]` and never on the slot
- `row.spec.js` gains: a drawer opened from `evaluate` (no input) records zero `layout-shift` entries; toggling at 60ms into an opening reverses with no jump on the first follower
- `decode.spec.js` gains: a decode in a flex row records zero shifts, and the host's width is the same on every scramble frame

### 9.4 the feel project (`test/feel/`)

`harness.spec.js` is the positive and negative control set, over pages in `test/feel/pages/`. each negative asserts the exact check, the step, and that the formatted text names the culprit. a harness that passes the jank pages is broken, and this spec is what proves it isn't. `feel.selfTest()` runs here too.

| page | planted problem | must report |
|---|---|---|
| `clean.html` | none: a button toggling a class, a flip'd list insert, a toast burst on transform slots, a scroller with `.gs-scroll-edge` | zero violations, steady, every step settles |
| `transform-no-shift.html` | a timer moving an element by transform, and a flip'd insert with no input | zero `layout-shift` entries. the assumption the toast, drawer and seance designs rest on, pinned on the pinned chromium |
| `bad-frame.html` | a rAF callback burning 30ms for 10 frames | frame |
| `bad-input.html` | a click handler burning 80ms | input and task |
| `bad-key.html` | a keydown handler burning 80ms | input on the key path (p6) |
| `bad-task.html` | a 70ms `setTimeout` with no input | task only |
| `bad-shift.html` | a row inserted above the fold from a timer | shift |
| `bad-property.html` | a `left` animation and a `background-color` transition | property |
| `bad-composite.html` | a transform animation on an inline `span` | composite (reason bits pinned in plan task 1) |
| `bad-family.html` | an `sn-event-*` keyframe with `ease-out`, an `sn-spatial-*` one with `steps(4)`, an event animation at glitch 0, a glitch on an element mid-slide | event eased, spatial stepped, signal at glitch 0, one carrier |
| `bad-silent.html` | a button with no effect, and one whose only change is a wallpaper tick | silent, both |
| `untrusted.html` | an input step driven by `evaluate(() => b.click())` | unevaluable |

`gallery.feel.js` is the real scenario: toast ok, deny, bypass, crash (clicks); status bypass (8 faces at once); row drawer open by click and close by enter; palette by `Control+k`, type, arrow, escape; window open and close; theme light and back; glitch 2 and back to 1; view swap by nav click; wheel scroll through a 300-row list; five toasts from `evaluate` as an event step; `idle` 4300ms for expiry and restack. matrix: `g1-dark` and `g2-dark` in full, `calm` and `still` on the subset that changes with them, `g1-light` on theme repaint, toasts and faces. expected run time about 4 minutes.

## 10. ci

`package.json` scripts: `"e2e": "playwright test --project=chromium"`, `"feel": "playwright test --project=feel --workers=1"`. `playwright.config.js` keeps its top-level `testDir: 'test/e2e'` for the existing `chromium` project and adds a second project, `{ name: 'feel', testDir: 'test/feel', ...feelProject-shaped settings }`. `snapshotPathTemplate` uses `{testDir}`, which resolves per project, so existing snapshot paths don't move.

`.github/workflows/ci.yml`, after the e2e step, with actions pinned to the same shas as today:

```yaml
      - run: npm run feel
        timeout-minutes: 10
      - uses: actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f # v6.0.0
        if: always()
        with:
          name: feel-reports
          path: test-results/**/feel-*
          if-no-files-found: ignore
```

node stays 24 in ci for the browser install. the node 26 extraction hang applies to consumers too, and the readme says so.

## 11. every file touched

| file | change |
|---|---|
| `tokens.json` | `motion`: 6 keys added, `hover` to 0ms. `ease`: 3 added. new `distance` and `feel` groups |
| `scripts/lib/tokens.js` | `distance` in `toCss` and `toMarkdown`, feel budgets table, deprecation notes, `validateMotion` |
| `src/tokens.css`, `gen/tokens.md` | regenerated. `gen/*.swift`, `gen/*.rs` unchanged |
| `src/motion.css` | new |
| `src/motion.js` | new |
| `src/base.css` | four transitions removed, press, overlay centering and `data-leaving`, toast slots, row clip, decode size holder, palette list positioning |
| `src/fx.css` | keyframes renamed `gs-event-*`, flare and mosh rewrites |
| `src/gs.js` | `moshOnce` sets `data-t`. `fxOnce` and `motionMs` only if the harness flags them |
| `src/components/palette.js`, `window.js`, `toast.js`, `row.js`, `decode.js` | as 6.6 |
| `src/feel/probe.js`, `trace.js`, `budgets.js`, `evaluate.js`, `format.js`, `playwright.js`, `index.js` | new |
| `scripts/ghost-signal.js`, `scripts/lib/motion-lint.js` | the `lint-motion` subcommand, on the existing `cssRules` parser in `scripts/lib/contrast.js` |
| `scripts/record-feel-fixtures.js` | new dev script |
| `gallery/index.html`, `gallery/gallery.js` | import `motion.css`, a motion section (tabs with indicator, `enterView`, drawer rows, a 300-row list, toast burst), `?glitch=&theme=` query params so a feel setup lands in a known state with one navigation, and the fix for the 0.43 load shift (p22). first thing to try: whether the shift tracks `document.fonts.ready`, since five sections moving together points at something above them growing, and doto's `font-display: block` swap is the obvious candidate |
| `gallery/apps/probe/app.json`, `flavor.json` | `"ghostSignal": "^0.2"`, probe flavor regenerated. same commit as the version bump: `scripts/gen.js:32` runs `flavorBuild` on the probe, and `satisfies('^0.1', '0.2.0')` is false (`scripts/lib/schema.js:51`, a 0.x caret pins the minor), so a bump without the range change breaks gen and ci's first step |
| `test/unit/*`, `test/e2e/*`, `test/feel/**`, `test/unit/fixtures/feel/*` | as section 9 |
| `playwright.config.js`, `package.json` | feel project, scripts, `"version": "0.2.0"` |
| `.github/workflows/ci.yml` | feel step and report artifact |
| `README.md` | the motion split, `motion.css` and `motion.js`, the feel harness, the supported playwright pin, the `-event-` / `-spatial-` keyframe convention, `v0.2.0` in usage lines |
| `scripts/sync-ghost-signal.sh` | usage line says `v0.2.0` |
| `ARCHITECTURE.md` | tree, the motion split and the one-carrier rule in key patterns, the harness in stack and commands, new gotchas (below), last updated |
| `docs/superpowers/specs/2026-09-23-ghost-signal-design.md` | 3.6 rewritten to section 3 here, 9.x gains the feel harness |

new gotchas for `ARCHITECTURE.md`:

- problem: the first click of a feel run fails input to paint at 48 to 56ms. cause: a cold page pays setup costs on its first input. fix: the warm-up in 8.3. don't disable it without a replacement.
- problem: frames "over 16.7ms" on an idle page. cause: rAF deltas jitter around the interval. fix: the gate is main-thread cpu per frame interval, and rAF gaps are judged against a missed vsync.
- problem: an overlay's `toBeHidden()` takes 100ms longer. cause: `data-leaving` keeps it displayed through the exit. fix: nothing, playwright waits. a synchronous check after `close()` reads `open`.
- problem: a toast jumps out of its slot during a glitch. cause: two sources animating one element's `transform`. fix: stacking lives on `[part="slot"]`, fx on `[part="item"]`.
- problem: a feel spec is flaky only when run with the other e2e specs. cause: playwright's trace or a second worker inside the budgets. fix: run feel specs only through `--project=feel --workers=1`.

## 12. seance migration

in the seance repo, on its own branch, after `v0.2.0` is tagged.

1. `package.json`: `"ghost-signal": "github:StressTestor/ghost-signal#v0.2.0"`, then `npm install`.
2. `app.json` and `flavor.json`: `"ghostSignal": "^0.2"`, or `npm run gs:check` and `npm run flavor` refuse the range. then `npm run flavor`.
3. `src/main.ts`: `import "ghost-signal/motion.css";` after `fx.css`. without it seance keeps v0.1 cuts and still passes the harness.
4. `gs:check` gains `ghost-signal lint-motion 'src/**/*.css'`. seance has no `transition` or `@keyframes` of its own today, so it should print nothing.
5. `src/shell/calm.ts` documents calm as killing "every fx animation". under v0.2 calm kills signal motion only; the palette still slides and toasts still ease. update the comment, and after `toggleCalm()` dispatch an `ok` toast ("calm. glitch off" or "glitch back on") so `c` answers back. the answer check will demand it.
6. tabs: `indicator(document.querySelector('.tabs'))` once after the header mounts. `.tabs` needs `position: relative`, and the accent edge moves from `.tab[aria-current] { border-color }` to the indicator (the text color stays a cut). in `showTab()`, call `enterView(view, next === 'timeline' ? 'right' : 'left')` right after inserting. the timeline's `ResizeObserver` on `.tl-list` still fires on remount, and a transform doesn't change `clientHeight`, so the windowing math is untouched.
7. drawer: one `drawer({ height: DET_H })` controller in `TimelineView`. on a row click, after `renderWindow()`, `play({ inner, followers })` with the new drawer's content and the mounted rows after it. in `renderWindow()`, if the controller is running, `adopt()` the rebuilt nodes; that's the path a 2hz live batch takes mid motion. collapse starts simpler: followers slide up into the gap through `flip` with `key: (el) => el.dataset.key` (rows get a `data-key`) and the drawer cuts. the full unroll needs a leaving drawer node that survives `clear(winEl)`, which can come later.
8. live rows: at the top of the list, the rows still on screen after a batch ease down through `flip` keyed by `data-key`. scrolled away, anchor with `scrollTop += added * ROW_H` so what's under the pointer stays put, and show an "n new" pill that enters and scrolls to top on click. the first feel run says whether the rebuild registers a layout shift at all; either way the flip makes the move readable.
9. overview: retain the panel nodes across the 2hz refresh and write values. bars and fills become fixed boxes with `transform: scaleY(var(--v))` and `transform-origin: bottom` (`scaleX` for the health fill) and `data-gs-value`, so `motion.css` eases them. growing a bottom-anchored bar through `height` moves its top edge by layout, which is a shift.
10. preload doto in `index.html` (`<link rel="preload" as="font" type="font/woff2" crossorigin>`). with `font-display: block`, a late doto load swaps the wordmark's metrics after first paint.
11. harness: `e2e/feel.js` and `e2e/timeline.feel.js` as in 7.3. the config's top-level `testMatch: "*.spec.js"` moves into the chromium project and `feelProject({ testMatch: '*.feel.js' })` joins it; seance's default project keeps `trace: 'retain-on-failure'`. new script `"feel": "playwright test --project=feel --workers=1"` and a ci step like section 10. `addInitScript` goes through cdp and is expected to run under the tauri csp the same way the existing bridge stub does; the probe's apparatus check confirms it on the first run.
12. the existing functional specs stay functional. only interactions a person does become `s.input`, and bridge traffic becomes `s.event`.
13. `ARCHITECTURE.md`: the feel project, the scenarios, and the wkwebview caveat (13, risk 1).

what the first seance feel run will likely report, read from the code:

| likely failure | where | fix direction |
|---|---|---|
| task over 50ms switching to overview | `showTab('overview')` runs `computeDashboard(store.flatList())` over every event synchronously | memoize per store version, or compute incrementally in `store.subscribe` |
| frames missed at the 2hz refresh | `OverviewView.update()` clears and rebuilds every panel twice a second | step 9 |
| unprompted shift while the roast types | `.presence-roast-line` is centered, so every typed character moves the line's start | left-align the roast inside its box, or type over a size holder the way `gs-decode` does |
| unprompted shift on boot | the wordmark `gs-decode` swaps mono to the display font at the end and pushes the tabs | fixed by the v0.2 `gs-decode` with no seance change |
| unprompted shift per bypass toast | the v0.1 flex column stack (p7) | fixed by the v0.2 `gs-toast` with no seance change |

## 13. risks

1. chromium stands in for the real surface. seance and agora ship in tauri, which is wkwebview on macos. the property, family, shift and answer rules transfer (webkit composites transform and opacity too), and v0.2 uses nothing newer than web animations, css transitions, `isolation` and an `@supports`-guarded scroll timeline. frame and input numbers are a proxy: webkit exposes none of event timing, layout instability or loaf. joe running the scripted interactions by hand in the installed app stays in the definition of done for each release, and a webkit property-and-rAF project is a follow-up blocked today by the node 26 install hang for any new browser download.
2. ci runner noise. 8.3 to 8.6 are the defense, and the baseline decides the unknowns. calibration catches a runner that can't idle at 60. it can't catch one that idles fine and chokes when a large layer rasters; if that shows up, the fix is smaller moving layers (enter only a view's content column).
3. trace format drift. `tdur`, `BeginMainThreadFrame`, `compositeFailed` bits and the renderer pid lookup are chromium internals. mitigations: the shape check in 7.8, fixture traces in unit tests, re-recording fixtures with any `@playwright/test` bump (which is pinned).
4. the median hides a real one-in-three regression. unconfirmed violations go to the step summary and the json report, and `GS_FEEL_RUNS=1` on the mac is the strict mode that gates the tag.
5. the probe perturbs what it measures: a rAF loop keeps main-thread frames coming, a document `MutationObserver` runs on every mutation, `Element.prototype.animate` is wrapped. the clean control measures the combined cost.
6. things the property rule can't see. a rAF loop writing `style.height` every frame creates no Animation. the frame and shift budgets usually catch the symptom and can't name the cause. canvas redraws (the wallpaper at 4 per second over a full-viewport splash) are the same class; if the gallery run flags the wallpaper, stepping moves to a compositor `translateX` over a canvas one sprite period wider, keeping the `data-step` writes the three wallpaper tests read.
7. the answer check's blind spot. it proves something changed, and a mutation inside a `display: none` subtree still counts. treat it as a floor.
8. visual change without a failing test. mosh looks different and hover no longer eases. the gallery screenshots are uploaded as artifacts and asserted by nothing, so joe has to look at glitch 1 and 2 before the tag.
9. ci time grows by about 4 minutes for the gallery matrix and the controls, inside a 10-minute step cap.
10. the frame check's blind lead: fixed in 7cb4761, pending joe. 7.7 opened no interval on the start mark, so a task between the start mark and the window's first `BeginMainThreadFrame` landed in no frame, and a 20 to 49ms burn there passed both the frame and the task check (on the recorded fixtures the composite window lost 5.59 of its 16.8ms of task cpu this way, and every window of a recorded gallery run had some lead cpu, up to 6.8ms). `page.keyboard` and `page.evaluate` steps are the exposed ones, since `locator.click`'s stability wait usually puts a frame ahead of the input. the plan task 4 review opened the first interval on the start mark in `src/feel/evaluate.js` and amended 7.7's frame row to match (commit 7cb4761). that wording change is the call this risk routed to joe (found in the plan task 2 review), and he hasn't made it: keep the amended frame row, or `git revert 7cb4761` and the lead goes back to counting toward no frame. until he answers, the amended row is provisional and this risk stays on the list.

## 14. open questions for joe

each has a default this doc already builds on. say so if one is wrong.

1. hover and focus color become cuts. the alternative keeps a smooth hover through an opacity fill layer under every control (`::before` at `opacity: 0` fading to 1 over 83ms, color itself still cutting), which costs one pseudo-element per control and changes how every button, nav item and row head is built. default: cut in 0.2.0, fill layer only if the cut reads harsh in the gallery.
2. the property budget is `transform` and `opacity`, literally. widening it to the individual transform properties (`translate`, `scale`, `rotate`, which composite the same way) would let helpers set them independently. default: literal, no widening.
3. the answer check (every input visibly answers within 50ms) is added on top of the five budgets and is on by default, with a visible per-step opt out. default: on.
4. the composite check (chromium must composite every animation) is added on top of the property budget and is on by default for consumers too. default: on.
5. the `m5` profile is 1470x956 css px at 2x, 60hz. confirm the panel; a different size is a one-object change. default: as written.
6. the rebuilt mosh (text copies with static bands, stepped transform and opacity) replaces the clip-path slicing. default: accept it after a look in the gallery at glitch 1 and 2.
7. seance live rows landing at the top of the timeline ease the visible rows down through flip, instead of cutting or holding them behind an "n new" pill until clicked. default: flip at the top, pill only when scrolled away.
8. if the plan task 1 baseline shows github's ubuntu runners can't hold the clean control at joe's timing numbers, the choice is between a self-hosted mac runner for the feel step and moving the timing budgets to the pre-tag `npm run feel` on the mac while structural budgets stay in ci. the second changes "enforced in ci". default: self-hosted mac runner, and nothing changes until joe picks.

## 15. plan order

a dependency-ordered series, each pr green on its own. measurement comes first so a red harness picks the fixes.

1. baseline and fixtures: the scratch probes become `scripts/record-feel-fixtures.js`; record chromium 145 fixture traces; run the clean control 20 times on `ubuntu-latest` at the `m5` profile. outputs: the steadiness threshold, tracing overhead in `tdur`, whether compositor drops can gate, the ci dpr, the `bad-composite` reason bits.
2. pure harness modules and their unit tests (trace, budgets, evaluate, format), test first.
3. probe, playwright fixture, `test/feel` controls, the feel project and its ci step. the harness goes green on the controls and red on the gallery.
4. tokens and generator (`motion`, `ease`, `distance`, `feel`, `validateMotion`) with tests; `lint-motion` and its tests.
5. the known violations: the four hover transitions, flare, mosh (keyframe rename in the same pr), toast slots, the decode size holder, the gallery load shift; the rewritten css test.
6. `motion.js`, `motion.css`, palette, window, row drawer, toast motion, indicator; the gallery motion section; the new e2e specs.
7. `gallery.feel.js` matrix green; apply the prepared fixes in 6.5 only where the harness asks.
8. docs and release: README, ARCHITECTURE.md, the v0.1 spec's 3.6 and 9.x, version 0.2.0 with the probe app's `^0.2` in the same commit.
9. joe runs `GS_FEEL_RUNS=1 npm run feel` on his mac and looks at the gallery (mosh, hover cuts, the space set at glitch 0, 1 and 2), then tags `v0.2.0`.
10. seance, on its own branch: section 12.
