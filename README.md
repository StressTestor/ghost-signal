# ghost signal

design system for joe's guis: the tauri desktop apps, the rust tuis, the swiftui ios apps and the
super app shell. one token set, a small css layer, a handful of web components, and a plug-in
contract so a new app joins with a manifest and a flavor file and zero edits here.

the anchor is the led mask: green grin, magenta and cyan rim light, hard cuts, no shadows, no blur.
spec: `docs/superpowers/specs/2026-09-23-ghost-signal-design.md`.

## what ships

| path | what |
|---|---|
| `src/tokens.css` | generated tokens. dark default, `[data-theme="light"]`, reduced-motion block |
| `src/base.css` | doto font-face, native controls, `.gs-panel .gs-chip .gs-dot .gs-nav-item .gs-sticker .gs-label .gs-wordmark`, component rules |
| `src/fx.css` | dither, glitch slice, mosh, flare, tape scroll, corrupt corners, pixel cursor. all gated on `data-glitch`, keyframes named `gs-event-*` |
| `src/motion.css` | optional spatial layer: indicator, toast stack and value transitions, the scroll edge, and the `--gs-space` switch. nothing in it exists under reduced motion |
| `src/motion.js` | `enter exit enterView flip drawer indicator motionAllowed` |
| `src/feel/` | the feel harness: `playwright.js` (the fixture), `probe.js` (the in-page recorder), and the pure `trace budgets evaluate format` |
| `src/icons.svg` | twenty 16x16 pixel glyphs as `<symbol id="gs-<name>">` |
| `src/icons.js` | the same twenty grids as data. `gs.js` registers them on import |
| `src/gs.js` | statuses, `GS.seed`, grid parsing, registries, `injectIcons`, fx helpers |
| `src/grid.js` | `parseGrid` and `gridToSymbol` with no imports (re-exported by `gs.js`) |
| `src/components/*.js` | `gs-mosaic gs-face gs-decode gs-tape gs-window gs-toast gs-row gs-empty gs-error gs-splash gs-wallpaper gs-palette` |
| `gen/GhostSignal.swift` | swiftui colors, fonts, spacing, status |
| `gen/ghost_signal.rs` | ratatui `Color::Rgb` consts per theme and a `Status` enum |
| `schema/*.json` | `app.v1.json` and `flavor.v1.json` |

no runtime dependencies. no build for consumers. every generated file is committed.

## use it from vite (seance)

```json
{ "dependencies": { "ghost-signal": "github:StressTestor/ghost-signal#v0.2.0" } }
```

```js
import 'ghost-signal/tokens.css';
import 'ghost-signal/base.css';
import 'ghost-signal/fx.css';
import 'ghost-signal/motion.css';
import 'ghost-signal/components/face.js';
import { GS, registerCommands } from 'ghost-signal/gs.js';
```

then `<html data-theme="dark" data-glitch="1" data-app="seance">` and `<gs-face status="idle"></gs-face>`.

icons: core and app icons share one registry. `registerIcon(name, grid16x16)` adds one, and
`injectIcons()` writes a hidden sprite of every registered icon into `<body>` so
`<svg class="gs-icon"><use href="#gs-<name>"/></svg>` resolves. call it again after a flavor
registers more; it rewrites the sprite only when the registry changed.

## use it without a bundler (agora)

```sh
DEST=vendor/ghost-signal scripts/sync-ghost-signal.sh v0.2.0
```

copies `src/`, `gen/`, `schema/` and `tokens.json` into `vendor/ghost-signal/` and writes the tag to
`vendor/ghost-signal/VERSION`. import the files by relative path. copy the script itself into the
consumer repo so it runs without this checkout.

## rust (ghost, sentinel)

copy `gen/ghost_signal.rs` into the crate (the sync script does this into `$DEST/gen/`), then:

```rust
mod ghost_signal;
use ghost_signal::{dark, Status};

let bar = Status::Deny.color();
let face = dark::ACCENT;
let label = Status::Bypass.kaomoji();
```

## swift (static-field, nativeterm)

copy `gen/GhostSignal.swift` into the target:

```swift
Text("ghost signal").font(GhostSignal.Fonts.wordmark).foregroundStyle(GhostSignal.dark.accent)
Circle().fill(GhostSignal.Status.ok.color(GhostSignal.dark))
```

bundle `src/fonts/Doto-VariableFont.woff2` (or the upstream ttf) with the app for the wordmark font.

## plug an app in

an app ships `app.json` and `flavor.json` in its own repo. the core never grows a per-app branch.

```sh
npx ghost-signal check app.json
npx ghost-signal flavor check flavor.json
npx ghost-signal flavor build flavor.json --out src/theme --gs-import ghost-signal
```

`check` validates the schema, the `ghostSignal` range against the installed version, accent2
contrast on void, surface and raised in both themes, every referenced grid, and rejects any `.js`,
`.mjs` or `.ts` file under the manifest's directory that defines a `gs-*` element. it skips
`node_modules`, `dist`, `build`, `target`, `.git` and a vendored copy (a directory holding the
`VERSION` and `src/gs.js` that `sync-ghost-signal.sh` writes). `accent2` in `flavor.json` is `{ "dark": "#hex", "light": "#hex" }`,
one hex per theme: a single hex can't clear 4.5:1 contrast on both a near-black and a near-white
canvas, and the checker tests both. `flavor build` writes `flavor.css` (the `[data-app="<id>"]` block, plus
a light block that matches `data-app` on `<html>` itself or on any element under a light root) and
`flavor.js` (registers expressions, icons, the sprite and copy overrides). exit codes: 0 ok, 1 check
failed, 2 usage or io error. the reference app is `gallery/apps/probe/`.

status vocabulary, everywhere: `idle working ok warn deny bypass crash`. anything else becomes `warn`
with a console error.

## motion

three classes, and every animation belongs to one.

| class | what | how it moves | glitch 0 | reduced motion |
|---|---|---|---|---|
| space | something arrives, leaves or changes place: views, the palette, toasts, drawers, indicators, bars | web animations or css transitions on `transform` and `opacity`, eased with `--gs-ease-*`, timed with `--gs-motion-*` | runs | off |
| signal | the system reports that something happened: glitch, mosh, flare, the face, decode, the tape | `steps()` keyframes on `transform` and `opacity`, or js timers over text and canvas | off | off |
| cut | hover and focus color, `aria-current`, the 1px press, filtering | nothing animates | cut | cut |

only `transform` and `opacity` ever animate. a spatial transform and a signal transform never share
an element: whatever moves through space carries the space motion, and the glitch plays on its
content.

import `motion.css` to turn space on. without it every spatial change is a cut, the v0.1 look.

```js
import { enter, exit, enterView, flip, drawer, indicator } from 'ghost-signal/motion.js';

enter(panel, { from: 'above' });              // resolves true when it lands
exit(panel, { to: 'above' }).then(hide);      // resolves false if a later motion took it over
enterView(view, 'right');                      // a tab's view, 16px in from its side
flip(rows, () => list.prepend(row));           // rows ease from where they were
const bar = indicator(tabs);                   // slides under [aria-current]
```

name your own keyframes like the core does: `<ns>-event-*` for signal (stepped, gated on
`:root[data-glitch="1"]` or `"2"`), `<ns>-spatial-*` for space (eased).
`npx ghost-signal lint-motion 'src/**/*.css'` fails anything else and prints nothing when it passes.

## the feel harness

a playwright fixture that fails the build when an app stops feeling right: a frame over 16.7ms of
main-thread cpu, input to paint over 50ms, a main-thread task over 50ms, a layout shift nobody asked
for, an animation on anything but `transform` or `opacity`, one chromium can't composite, an eased
event or a stepped move, and an input that nothing answers within 50ms. the budgets live in
`tokens.json`, ship with the tag you pin, and only tighten.

```js
// playwright.config.js
import { defineConfig } from '@playwright/test';
import { feelProject } from 'ghost-signal/feel/playwright.js';

export default defineConfig({
  projects: [
    { name: 'chromium', testMatch: '*.spec.js', use: { browserName: 'chromium' } },
    feelProject({ testMatch: '*.feel.js' }),
  ],
});
```

```js
// e2e/palette.feel.js
import { test as base } from '@playwright/test';
import { withFeel } from 'ghost-signal/feel/playwright.js';

const test = withFeel(base);

test('the palette answers back', async ({ page, feel }) => {
  await feel.scenario('palette', {
    matrix: [{ name: 'g1', glitch: '1' }, { name: 'still', media: { reducedMotion: 'reduce' }, mode: 'still' }],
    setup: async () => { await page.goto('/'); },
    steps: async (s) => {
      await s.input('open', () => page.keyboard.press('Meta+k'));
      await s.input('filter', () => page.keyboard.type('tim'));
      await s.input('close', () => page.keyboard.press('Escape'));
    },
  });
});
```

step options: `{ answer: false, why }` for a control whose only answer is the 1px press, and
`{ frame: false, why }` for a step whose over-budget frame you've decided to accept. ghost signal's
own gallery puts the second one on its theme and glitch switches, where a whole-page restyle of
~3700 elements costs 10.7 to 17ms of style recalc on an m5. both need a why and print in every
report with what they covered.

an unused `answer: false` fails the test. an unused frame exemption prints
`exemption on '<step>' unused this run; the flip fit the budget` and passes, because the same flip
costs 6ms in one session and 21ms in the next. an exempt frame over two vsync intervals (two of
the interval the run measured, 33.4ms at 60hz) fails like any other frame, so the exemption only
ever covers one style recalc. "used" counts over the scenario's whole matrix by step name, and an
entry whose flip stayed fast says which entries needed it.

run it alone: `playwright test --project=feel --workers=1`. each scenario runs once unmeasured, then
twice measured, and a third time when the two disagree. timing checks take the median, structural
checks fail on the first run that shows them, and `GS_FEEL_RUNS=1` is the strict single-run mode
for the machine the app ships to. a failure prints the step, the check, how far over and what the
page was doing, and attaches the report and the trace under `test-results/`. `feel.selfTest()`
plants a slow click and a layout shift in your own page and fails if the harness can't see them.

a vendored copy (`scripts/sync-ghost-signal.sh`) carries `tokens.json` next to `src/`, because the
harness reads its budgets from it.

supported: `@playwright/test` 1.58.2 and chromium. ghost signal pins that version and imports
nothing from it. install browsers under node 24: 1.58.2's extraction hangs forever under node 26.
tauri apps ship in wkwebview, so the frame and input numbers are a chromium stand-in; run the
scripted interactions by hand in the installed app before a release.

## upgrading from 0.1

`"ghostSignal": "^0.1"` no longer matches: a 0.x caret pins the minor, so move `app.json` and
`flavor.json` to `^0.2` in the same change as the bump. then check your css and tests for these:

| what changed | why it can break you |
|---|---|
| keyframes renamed: `gs-glitch-shift`, `gs-glitch-a`, `gs-glitch-b`, `gs-mosh`, `gs-flare`, `gs-tape-scroll` are now `gs-event-glitch-shift`, `gs-event-glitch-a`, `gs-event-glitch-b`, `gs-event-mosh` (plus `-a` and `-b`), `gs-event-flare`, `gs-event-tape` | css or tests that name a keyframe. the classes `.gs-glitch`, `.gs-mosh`, `.gs-flare` stay |
| `.gs-flare` sets `position: relative; isolation: isolate` and `.gs-mosh` sets `position: relative` at glitch 1 and 2 while they run | `flareOnce` or `moshOnce` on an absolutely positioned or sticky element changes its layout for 640ms or 420ms. v0.1 did this only for `.gs-glitch` |
| `gs-palette [part="list"]` starts with the highlight's `<span part="indicator">` | `:first-child` and `nth-child` row selectors shift by one. select rows by `[part="row"]` |
| `gs-palette.close()` does nothing when the palette isn't open | code that relied on `close()` firing its side effects on a closed palette |
| toasts sit in `[part="slot"]`, a row's detail in `[part="clip"]`, and `gs-decode` sets `data-final` while it plays | child combinators (`gs-toast > [part="item"]`) and snapshots of the dom. descendant selectors keep working |
| a toast's slot starts its enter a microtask after `toast()` returns, so a burst in one task restacks once | a test that reads the slot's animations synchronously right after `toast()`. await a microtask first |
| hover and focus color are cuts: `base.css` has no transitions, and `--gs-motion-hover` is 0ms (removed in 0.3) | a consumer transition on `var(--gs-motion-hover)` now does nothing |
| buttons, row heads and palette rows drop 1px on `:active` | pixel snapshots taken mid click |

## gallery

```sh
npm run serve
```

open `http://127.0.0.1:4173/gallery/`. every component in every status, both themes, three glitch
levels, and the probe app. `window.gallery.setTheme('light')`, `window.gallery.setGlitch(2)`.
`?glitch=2&theme=light` lands on a glitch level and theme in one navigation. `npm run showcase`
records every space and event motion at glitch 0, 1 and 2 into `gallery/showcase/` as mp4 clips and
stills (git-ignored, needs ffmpeg).

## develop

```sh
npm ci
npm run gen        # tokens.json -> css, swift, rust, md; icon grids -> icons.svg, icons.js; probe flavor
npm test           # node:test
npm run check      # contrast over tokens and css
npm run e2e        # playwright against scripts/serve.js
npm run feel       # the feel harness, alone, one worker: controls plus the gallery scenario
npm run showcase   # video of every motion, for looking at before a tag
```

edit `tokens.json`, never a generated file. ci diffs them.

## font

doto is bundled as `src/fonts/Doto-VariableFont.woff2` (about 8.7kb), converted from
`github.com/oliverlalan/Doto` at commit `1c587f2eed62cb257055540ac2a15f356070414f`
(`fonts/variable/Doto[ROND,wght].ttf`) with `scripts/fetch-doto.sh`. license: `src/fonts/OFL.txt`.
nothing is fetched at runtime.
