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
| `src/fx.css` | dither, glitch slice, mosh, flare, tape scroll, corrupt corners, pixel cursor. all gated on `data-glitch` |
| `src/icons.svg` | twenty 16x16 pixel glyphs as `<symbol id="gs-<name>">` |
| `src/gs.js` | statuses, `GS.seed`, grid parsing, registries, fx helpers |
| `src/components/*.js` | `gs-mosaic gs-face gs-decode gs-tape gs-window gs-toast gs-row gs-empty gs-error gs-splash gs-wallpaper gs-palette` |
| `gen/GhostSignal.swift` | swiftui colors, fonts, spacing, status |
| `gen/ghost_signal.rs` | ratatui `Color::Rgb` consts per theme and a `Status` enum |
| `schema/*.json` | `app.v1.json` and `flavor.v1.json` |

no runtime dependencies. no build for consumers. every generated file is committed.

## use it from vite (seance)

```json
{ "dependencies": { "ghost-signal": "github:StressTestor/ghost-signal#v0.1.0" } }
```

```js
import 'ghost-signal/tokens.css';
import 'ghost-signal/base.css';
import 'ghost-signal/fx.css';
import 'ghost-signal/components/face.js';
import { GS, registerCommands } from 'ghost-signal/gs.js';
```

then `<html data-theme="dark" data-glitch="1" data-app="seance">` and `<gs-face status="idle"></gs-face>`.

## use it without a bundler (agora)

```sh
DEST=vendor/ghost-signal scripts/sync-ghost-signal.sh v0.1.0
```

copies `src/`, `gen/` and `schema/` into `vendor/ghost-signal/` and writes the tag to
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
contrast on void, surface and raised in both themes, every referenced grid, and rejects any js file
that defines a `gs-*` element. `accent2` in `flavor.json` is `{ "dark": "#hex", "light": "#hex" }`,
one hex per theme: a single hex can't clear 4.5:1 contrast on both a near-black and a near-white
canvas, and the checker tests both. `flavor build` writes `flavor.css` (the `[data-app="<id>"]` block) and
`flavor.js` (registers expressions, icons, the sprite and copy overrides). exit codes: 0 ok, 1 check
failed, 2 usage or io error. the reference app is `gallery/apps/probe/`.

status vocabulary, everywhere: `idle working ok warn deny bypass crash`. anything else becomes `warn`
with a console error.

## gallery

```sh
npm run serve
```

open `http://127.0.0.1:4173/gallery/`. every component in every status, both themes, three glitch
levels, and the probe app. `window.gallery.setTheme('light')`, `window.gallery.setGlitch(2)`.

## develop

```sh
npm ci
npm run gen        # tokens.json -> css, swift, rust, md, icons.svg, probe flavor
npm test           # node:test
npm run check      # contrast over tokens and css
npm run e2e        # playwright against scripts/serve.js
```

edit `tokens.json`, never a generated file. ci diffs them.

## font

doto is bundled as `src/fonts/Doto-VariableFont.woff2` (about 8.7kb), converted from
`github.com/oliverlalan/Doto` at commit `1c587f2eed62cb257055540ac2a15f356070414f`
(`fonts/variable/Doto[ROND,wght].ttf`) with `scripts/fetch-doto.sh`. license: `src/fonts/OFL.txt`.
nothing is fetched at runtime.
