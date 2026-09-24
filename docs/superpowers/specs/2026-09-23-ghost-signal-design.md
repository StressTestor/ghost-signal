# ghost signal: design system spec

date: 2026-09-23
status: draft for joe's review
owner: joe (StressTestor)

## 1. what this is

ghost signal is the design system for every gui joe ships: the tauri desktop apps (seance, agora,
nova), the rust tuis (ghost, sentinel), the swiftui ios apps (static-field, nativeterm), and the
super app shell that will wrap the desktop apps into one window. it is a token set, a small css
layer, a handful of web components, and a schema that lets any app plug in without editing the
core.

the anchor is joe's persona: a hooded figure whose face is an led dot-matrix panel showing a green
grin, lit by magenta on one side and cyan on the other, with rgb glitch streaks on black. the
lineage is wrench and dedsec from watch dogs 2. every surface built on this system has to read as
coming from that mask.

### 1.1 goals

- one look across web, tui and ios, from a single source of truth.
- the mask is a living part of the ui, not a logo pasted in a corner.
- apps keep their own personality inside a shared family.
- new apps plug in with a manifest and a flavor file. the core never grows a per-app branch.
- dark first, offline, no build step for consumers, no cloud fonts.

### 1.2 non-goals for v1

- sound.
- the super app shell itself (separate spec; this spec defines the contract it consumes).
- swiftui component ports (the swift token file is generated; adoption is later).
- nova, promptpressure's report cards, light mode polish beyond passing contrast.

## 2. decisions and why

the full evidence trail is in the vault: `reference/persona-led-mask.md` and
`reference/brand-forensics-ghost-signal.md`. the calls that shape everything below:

| decision | why |
|---|---|
| shared base + per-app flavor (not one house style, not a fresh identity) | seance's look is the most complete gui expression of the persona already; forcing it on agora makes a debate feel like an incident; starting over throws away shipped work |
| led green `#0ec224` is the house accent everywhere | it is the mask's color. joe chose it over toxic chartreuse (seance's old bypass alarm) and over the rim magenta (5.2:1, too close to ember) |
| ok is the mask's cyan, bypass is the mask's magenta | green now means "me / click this", so status colors had to move off green. the mask had two colors to spare |
| the face always stays green | state goes on dots, bars and toasts. the face is the persona, and the persona is not a traffic light |
| cold 1-bit base, not seance's violet-black | the dedsec videos are black and white with color as a hit. the violet stack read as moody premium, which is a different product |
| stepped motion, hard cuts | dedsec never eases. smooth fades would fight the mask |
| doto for wordmarks | a free dot-matrix font built from the same dots as the mask. bundled, never fetched |
| lowercase chrome everywhere | it is how joe writes. all-caps tape strips are the one exception, because tape is shouting on purpose |
| flavors and manifests live in each app's repo | so app number twelve needs zero edits to ghost signal |

## 3. tokens

`tokens.json` is the only place a value is authored. everything else is generated (section 8).
names are semantic (`--gs-color-accent`), never raw (`--gs-green`). every token is prefixed `gs-`.

### 3.1 color, dark (default)

| token | hex | role |
|---|---|---|
| `--gs-color-void` | `#050505` | page canvas |
| `--gs-color-surface` | `#0c0c0d` | panels, sidebar |
| `--gs-color-raised` | `#151517` | rows that need lift, inputs, toasts |
| `--gs-color-hairline` | `#1e1f21` | 1px borders |
| `--gs-color-etch` | `#2a2c2f` | stronger borders, focus offset ring |
| `--gs-color-text` | `#eef1f2` | body text (17.9:1 on void) |
| `--gs-color-text-muted` | `#8e9396` | labels, secondary (6.6:1 on void) |
| `--gs-color-text-faint` | `#3a3e41` | idle dots and decoration only, never text (1.9:1) |
| `--gs-color-accent` | `#0ec224` | led green: primary buttons, active nav bar, links, the face |
| `--gs-color-accent-bloom` | `#b2fcba` | hover on accent, led hot centers, focus ring |
| `--gs-color-accent-dim` | `#257829` | unlit led cells, subtle accent fills |
| `--gs-color-ok` | `#0cc0cb` | live, pass, connected (9.1:1) |
| `--gs-color-warn` | `#e8a33d` | warn (9.3:1) |
| `--gs-color-deny` | `#ff5c4d` | deny, destructive (6.7:1) |
| `--gs-color-bypass` | `#f8098c` | bypass, breach, crash accents (5.3:1 on void, 5.0 on surface, 4.7 on raised) |
| `--gs-color-glitch-a` | `#f8098c` | left chromatic offset |
| `--gs-color-glitch-b` | `#0cc0cb` | right chromatic offset |
| `--gs-color-on-accent` | `#050505` | text on accent fills (8.5:1) |

rules the checker enforces (section 9):

- text uses only `text`, `text-muted`, or a semantic color on `void` or `surface`.
- `bypass` and `deny` on `raised` appear as bars, borders or dots, never as text.
- `text-faint` is never a text color.

### 3.2 color, light

`[data-theme="light"]` on `:root`. a cold near-white, never parchment.

| token | hex |
|---|---|
| void | `#f2f4f5` |
| surface | `#e9ecee` |
| raised | `#e4e7e9` |
| hairline | `#d3d7da` |
| etch | `#b9bec2` |
| text | `#0b0c0d` |
| text-muted | `#4b5054` |
| text-faint | `#b0b5b9` |
| accent | `#08701a` (5.7:1) |
| accent-bloom | `#0ec224` |
| accent-dim | `#c6ecc9` |
| ok | `#08666c` (6.1:1) |
| warn | `#7f560b` (5.9:1) |
| deny | `#ad2a23` |
| bypass | `#b0065f` (6.3:1) |
| on-accent | `#f2f4f5` (5.7:1 on light accent) |

the contrast numbers above are computed against `void`. the checker is the authority; if a value
here fails in ci, the value changes, not the threshold.

### 3.3 type

| token | value | use |
|---|---|---|
| `--gs-font-display` | `"Doto", var(--gs-font-mono)` | wordmarks, hero lines, gs-window titles. never body |
| `--gs-font-ui` | `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif` | chrome, body |
| `--gs-font-label` | `"Avenir Next Condensed", "SF Compact Text", "Arial Narrow", var(--gs-font-ui)` | small tracked labels |
| `--gs-font-mono` | `ui-monospace, "SF Mono", "Cascadia Code", "JetBrains Mono", Menlo, monospace` | commands, data, roasts, palette input |
| `--gs-size-label` | 11px | letter-spacing 0.08em |
| `--gs-size-mono` | 12px | |
| `--gs-size-body` | 13px | |
| `--gs-size-title` | 18px | panel titles |
| `--gs-size-wordmark` | 34px | doto 900 |

doto (ofl) ships in the package as woff2 and is declared with `@font-face` in `base.css`. nothing
is fetched from google fonts. source is the upstream repo `oliverlalan/Doto` at a pinned commit
(`googlefonts/doto` does not exist). tauri's default csp would block it anyway.

case: lowercase everywhere in chrome, including labels. all caps only inside `<gs-tape>`. shouting
caps in content is ghost's business, not the chrome's.

### 3.4 space, radius, border

| token | value |
|---|---|
| `--gs-space-1..6` | 4, 8, 12, 16, 24, 40px |
| `--gs-radius-control` | 4px (buttons, chips, inputs) |
| `--gs-radius-panel` | 8px |
| `--gs-radius-pill` | 999px (status dots only) |
| `--gs-border` | 1px solid var(--gs-color-hairline) |
| `--gs-bar` | 3px (verdict bars, active nav) |

no drop shadows. no elevation. the only glow in the system is the face's leds and the focus ring.

### 3.5 texture

| token | value |
|---|---|
| `--gs-dither` | 4x4 ordered bayer pattern as an inline svg data uri, applied at 6% opacity on `surface` |
| `--gs-dither-strong` | same pattern at 18%, for `gs-splash`, `gs-empty`, `gs-error` backgrounds |
| `--gs-block-corner` | 6x6 pixel-block fragment in glitch-a and glitch-b, used by `.gs-panel[data-corrupt]` corners |

no scanlines in chrome. no grain. no blur. no glass.

### 3.6 motion

the default is a hard cut. easing is an exception that has to be listed here.

| token | value | applies to |
|---|---|---|
| `--gs-step-sprite` | `steps(4)` over 800ms | face blink, wallpaper sprites, `gs-decode` |
| `--gs-cut` | 0ms | app switch, panel swap, state change |
| `--gs-glitch` | 180ms `steps(3)` | slice displacement on bypass, crash, face expression change, app switch (one frame) |
| `--gs-mosh` | 420ms `steps(6)` | datamosh smear on crash |
| `--gs-flare` | 640ms `steps(8)` | deny flare on a row |
| `--gs-hover` | 80ms ease-out | color and border on hover/focus only |
| `--gs-motion-decode` | 250ms `steps(6)` | `<gs-decode>` scramble reveal |
| `--gs-motion-ambient-min/max` | 20s / 40s | ambient one-frame micro-glitch interval |

allowed to ease: `color`, `border-color`, `background-color` on hover and focus. nothing else.
no transforms ease. no opacity fades between views.

`@media (prefers-reduced-motion: reduce)` sets every duration above to 0ms, disables ambient
glitch, disables the blink, and forces `data-glitch="0"`. color and kaomoji carry the meaning.

### 3.7 hooks on `:root`

| attribute | values | effect |
|---|---|---|
| `data-theme` | `dark` (default), `light` | swaps 3.1 for 3.2 |
| `data-glitch` | `0`, `1` (default), `2` | 0: no glitch, no decode, no ambient, no wallpaper animation. 1: glitch on state changes, decode on wordmarks and toasts, ambient on. 2: adds chromatic hover split, pixel cursor, decode on verdict labels, corrupt corners on all panels |
| `data-app` | app id from its manifest | selects the flavor css generated from that app's `flavor.json` |

## 4. the face and the mosaic engine

### 4.1 `<gs-mosaic>`

one renderer for every dotted or ascii image in the system. it draws to a canvas.

- input: an image, a text string, or a grid literal (rows of `.`/`#`).
- `mode="dot"` (default) or `mode="ascii"`.
- `cols`, `rows`: grid size. a cell is `cell` px (default 7) with `gap` px (default 2).
- lit cell color is `--gs-color-accent`, hot center `--gs-color-accent-bloom`, unlit
  `--gs-color-accent-dim` at 25%. a flavor may set `lit` to its second accent for non-face art.
- images are thresholded with an ordered bayer dither. there is no random number generator inside
  this component. same input, same output, always. this is what makes the snapshot test possible.

### 4.2 `<gs-face>`

the mask, built on `<gs-mosaic>` with a 16x10 grid. it lives at the top of the shell sidebar and in
each standalone app's header.

core expressions, fixed and not overridable:

| status | expression | kaomoji label |
|---|---|---|
| `idle` | slanted eyes, wide grin | `(｡◕‿↼)` |
| `working` | flat eyes looking aside, smirk | `(¬‿¬)` |
| `ok` | idle grin plus a single blink | `(｡◕‿↼)` |
| `warn` | flat eyes, flat mouth | `(¬_¬)` |
| `deny` | v brows, square frown | `>:[` |
| `bypass` | v brows, wide manic grin, glitch | `>:D` |
| `crash` | x eyes, flat mouth, mosh | `XX` |

- the face is always green. status never recolors it.
- idle blink every 7s (`--gs-step-sprite`), off under reduced motion.
- expression changes fire one `--gs-glitch`.
- `registerExpression(name, grid16x10)` adds app-specific expressions (agora: `debating`). a
  registration that reuses a core name throws.
- attribute `status` drives it. the shell and apps set it from the status vocabulary (section 6.1).

### 4.3 pixel icons

`icons.svg` is a sprite of 16x16 1-bit glyphs on the same grid as the face. v1 ships about 20:
watch, filter, search, close, expand, collapse, copy, settings, terminal, log, deny, bypass, warn,
ok, idle, app, palette, window, tape, ghost. apps register more via `registerIcon(name, grid16x16)`.

## 5. css layer and components

rule: native elements are styled with css. a web component exists only where there is behavior
html does not already have.

### 5.1 files

| file | contents |
|---|---|
| `tokens.css` | generated from `tokens.json`. dark + light + reduced-motion overrides. no app blocks |
| `base.css` | `@font-face` doto; `button` (primary, ghost, danger via `data-variant`), `input`, `select`, `textarea`, scrollbars, focus ring; classes `.gs-panel`, `.gs-chip`, `.gs-dot`, `.gs-nav-item`, `.gs-sticker` (tilt via `--gs-tilt`), `.gs-label` |
| `fx.css` | dither, glitch slice, mosh, flare, tape animation, wallpaper stepping, pixel cursor. every rule here is inside the glitch and reduced-motion gates |
| `icons.svg` | pixel glyph sprite |
| `components/*.js` | one plain es module per component, no bundler, no dependencies |

### 5.2 components

| component | job | notes |
|---|---|---|
| `<gs-face>` | the mask | section 4.2 |
| `<gs-mosaic>` | dot/ascii renderer | section 4.1 |
| `<gs-decode>` | scramble reveal | `--gs-motion-decode` (250ms, `steps(6)`), glyph pool from mono charset. seeded prng (section 9.3). wordmarks, toasts, and at glitch 2, verdict labels. never body |
| `<gs-window>` | retro os popup | pixel title bar in doto, close glyph, used for dialogs and confirms. modal by default, traps focus, `esc` closes |
| `<gs-tape>` | repeating-text tape strip | magenta by default, text repeats to fill, all caps allowed, scrolls in steps at glitch 1+, static at 0 |
| `<gs-toast>` | toast stack | lowercase one-liner, optional trailing kaomoji, left bar in status color, auto-dismiss 4s, `deny`/`bypass` persist until dismissed |
| `<gs-row>` | timeline row | 3px left bar by status, expandable, mono command block inset. `loose` status draws a dashed faint bar and `◌` |
| `<gs-palette>` | command palette | `cmd+k`, void overlay at 60%, mono input, dense rows, reads commands from every loaded manifest (section 6.2) |
| `<gs-empty>`, `<gs-error>`, `<gs-splash>` | state containers | the only places `<gs-wallpaper>` may mount. carry `--gs-dither-strong` |
| `<gs-wallpaper>` | tiled sprite field | steps at 4fps. mounting outside the three containers above throws `GsWallpaperPlacementError`. it never sits behind data |

### 5.3 microcopy

lowercase, deadpan, dry. no exclamation points, no em dashes, no "oops", no "successfully", no
"please". kaomoji at the end, sparingly. the core ships defaults; a flavor may override the
dialect (section 6.3).

| slot | core default |
|---|---|
| empty | `nothing here yet. run something and the feed will wake up` |
| loading | `tailing…` |
| error | `that failed. check the path and try once` |
| deny toast | `denied. cute. try a quieter command XX` |
| bypass toast | `something got through. zero chill detected >:D` |
| crash toast | `bridge unreachable. not answering` |
| confirm | `done` |

## 6. the plug-in contract

this is what makes the system open ended. ghost signal defines schemas; apps ship files that match
them; nothing app-specific is checked into the core except the gallery's test app.

### 6.1 status vocabulary

every app reports state with exactly these values:

`idle`, `working`, `ok`, `warn`, `deny`, `bypass`, `crash`

the face, `.gs-dot`, `<gs-toast>`, `<gs-row>` and the super app sidebar all key off this list. an
app that emits anything else gets `warn` and a console error.

### 6.2 `app.json` (manifest)

```json
{
  "$schema": "https://ghost-signal.local/schema/app.v1.json",
  "id": "seance",
  "name": "séance",
  "version": "0.4.0",
  "ghostSignal": "^0.1",
  "flavor": "./flavor.json",
  "entry": "./index.html",
  "status": { "kind": "event", "name": "seance:status" },
  "commands": [
    { "id": "seance.watch", "title": "watch", "shortcut": "w" },
    { "id": "seance.filter", "title": "filter", "shortcut": "f" }
  ],
  "icon": "ghost"
}
```

- `id` is the `data-app` value. lowercase, `[a-z0-9-]`.
- `status.kind` is `event` (a `CustomEvent` on `window` whose `detail.status` is from 6.1) in v1.
  the super app spec may add `file` (a jsonl tail) later without breaking v1 apps.
- `commands` feed `<gs-palette>` in the app and in the shell.
- `entry` is what the shell mounts. how it isolates it is the shell's spec.

### 6.3 `flavor.json`

```json
{
  "$schema": "https://ghost-signal.local/schema/flavor.v1.json",
  "app": "seance",
  "ghostSignal": "^0.1",
  "accent2": { "dark": "#b78bff", "light": "#5b2ea6" },
  "display": "\"Iowan Old Style\", Palatino, Georgia, serif",
  "texture": "dither",
  "sprite": "./sprites/ghost-sheet.grid",
  "expressions": { "haunting": "./expressions/haunting.grid" },
  "icons": { "sigil": "./icons/sigil.grid" },
  "copy": {
    "empty": "run a hooked tool call and the spirits will talk. they ALL talk eventually XX",
    "loading": "listening on the bridge"
  }
}
```

allowed: `accent2` as `{ dark, light }` (one hex cannot pass 4.5:1 on both themes), `display`
(wordmark font only), `texture` (`dither` | `none`), `sprite` (the wallpaper sprite), `expressions`,
`icons`, `copy` (any slot from 5.3). `ghostSignal` is required.

locked, and rejected by the checker if present: any base surface, any text color, `accent`,
`ok`, `warn`, `deny`, `bypass`, glitch colors, any motion value, any radius, any font other than
display.

`ghost-signal flavor build flavor.json` emits `[data-app="seance"] { --gs-color-accent-2: …; … }`
into the app's own css. `ghost-signal check flavor.json` runs schema plus contrast (accent2 on
void, surface and raised as text) and exits non-zero on failure.

### 6.4 namespaces

`gs-` is reserved. app components use their own prefix (`sn-` seance, `ag-` agora) and build on
the tokens. an app that defines a `gs-*` custom element fails the checker.

### 6.5 the plug-in test app

`gallery/apps/probe/` is a fake app with an `app.json`, a `flavor.json`, one extra expression and
one extra icon. it exists to prove an app can plug in with no core change. its ci test loads it
into the gallery shell and asserts its face expression, icon, accent2 and commands appear.

## 7. distribution and consumption

- repo `StressTestor/ghost-signal`, local `/Volumes/T7/ghost-signal`. semver tags. `main` is
  production.
- the package ships `src/` as-is: plain es modules and css. there is no build for consumers and no
  `dist/`. the only generated artifacts are the token outputs (section 8), committed.
- vite apps (seance) depend on `"ghost-signal": "github:StressTestor/ghost-signal#v0.1.0"` and
  import `ghost-signal/tokens.css`, `ghost-signal/base.css`, `ghost-signal/fx.css`,
  `ghost-signal/components/face.js`.
- no-bundler apps (agora) run `scripts/sync-ghost-signal.sh v0.1.0`, which copies `src/` into
  `vendor/ghost-signal/` and writes the tag to `vendor/ghost-signal/VERSION`. drift is a grep.
- rust tuis depend on the generated `ghost_signal.rs` copied into the crate by the same sync
  script. ios apps copy `GhostSignal.swift`.
- flavors declare `"ghostSignal": "^0.1"`; the checker refuses a flavor whose range excludes the
  installed version.

## 8. token pipeline

`tokens.json` -> `scripts/gen.js` (node, no dependencies) -> four committed outputs:

| output | consumer |
|---|---|
| `src/tokens.css` | web |
| `gen/GhostSignal.swift` | swiftui: a `GhostSignal` enum of `Color` and `Font` statics, plus `Theme` for light |
| `gen/ghost_signal.rs` | ratatui: `pub const` `Color::Rgb` values and a `Status` enum with `.color()` |
| `gen/tokens.md` | the human table |

ci runs `node scripts/gen.js && git diff --exit-code`. a hand edit to a generated file fails the
build. a change to `tokens.json` lands everywhere in one commit.

## 9. testing

runners: `node:test` for the generator, checker and schema; playwright against the gallery for
everything in a browser. no other test dependencies.

### 9.1 contrast

`scripts/check-contrast.js` walks every (text color, background) pair declared as allowed in
`tokens.json` for both themes and fails under 4.5:1. it also asserts the disallowed pairs are not
used in `base.css` or `fx.css` (a regex over `color:` declarations). the same code runs inside
`ghost-signal check flavor.json`.

### 9.2 reduced motion

playwright opens the gallery with `reducedMotion: 'reduce'`, triggers every state on `<gs-face>`,
fires bypass and crash, and asserts `document.getAnimations()` is empty and `data-glitch` is `0`.

### 9.3 determinism

`<gs-mosaic>` has no rng. `<gs-decode>` and ambient glitch use a seeded prng exposed as
`GS.seed(n)`; tests call `GS.seed(1)` before screenshots. the mosaic snapshot test renders the
face in all seven statuses plus two reference grid fixtures and compares canvas hashes to committed
values. a hash is `<width>x<height>:<fnv-1a of the canvas's getImageData rgba bytes>`, so the png
encoder is not part of it.

### 9.4 placement

`<gs-wallpaper>` appended to a `.gs-panel` or `<gs-row>` throws `GsWallpaperPlacementError`.

### 9.5 gallery

`gallery/index.html` renders every component in every status, both themes, all three glitch
levels, and the probe app. it is the surface i check by eye before any tag. playwright screenshots
it per (theme, glitch) and stores them as artifacts, not as assertions.

## 10. repo layout

```
ghost-signal/
  ARCHITECTURE.md
  README.md
  tokens.json
  package.json              # name, version, "exports" for src/*, no deps
  scripts/
    gen.js                  # tokens.json -> css, swift, rust, md
    check-contrast.js
    ghost-signal.js         # cli: check | flavor build | flavor check
    sync-ghost-signal.sh    # copied into no-bundler apps
  schema/
    app.v1.json
    flavor.v1.json
  src/
    tokens.css              # generated
    base.css
    fx.css
    icons.svg
    fonts/Doto-VariableFont.woff2
    gs.js                   # GS.seed, registerExpression, registerIcon, status list
    components/
      mosaic.js face.js decode.js window.js tape.js toast.js row.js
      palette.js empty.js error.js splash.js wallpaper.js
  gen/
    GhostSignal.swift ghost_signal.rs tokens.md
  gallery/
    index.html
    apps/probe/{app.json,flavor.json,expressions/,icons/}
  test/
    unit/   (node:test)
    e2e/    (playwright)
  docs/superpowers/specs/
```

## 11. rollout

1. this repo: tokens pipeline, `tokens.css`, `base.css`, `fx.css`, `<gs-mosaic>`, `<gs-face>`,
   then the remaining components, then the gallery and the probe app. tag `v0.1.0`.
2. seance: depend on the tag, alias its `--seance-*` variables to `--gs-*`, write `flavor.json`
   and `app.json`, delete its violet stack and grain. proves the vite path.
3. agora: sync a vendored copy, replace the github-dark values, write flavor and manifest. proves
   the no-bundler path.
4. ghost and sentinel: adopt `ghost_signal.rs`. proves the rust output on the surfaces joe looks at
   most.
5. super app shell: its own spec, consuming section 6 as-is.

## 12. definition of done for v1

- `ghost-signal` tagged `v0.1.0`; ci green on generator diff, contrast, reduced motion, unit,
  mosaic snapshots, probe app; every github action pinned to a commit sha.
- the gallery renders every component in every status, both themes, three glitch levels, and the
  probe app, and i have looked at it in a real browser.
- seance and agora run on it, each with its own `flavor.json` and `app.json`, confirmed by
  screenshots of the installed apps, not by a passing build.
- `grep -rE '#[0-9a-f]{6}'` over seance's and agora's css finds nothing outside generated flavor
  css.
- ghost's tui uses `ghost_signal.rs`.
- `ARCHITECTURE.md` describes the repo as built.
- no debug logs, no todos, lint clean.

## 13. open questions for joe

none block v1. defaults are stated; say so if a default is wrong.

- the super app's name. default: nameless until its spec.
- serif wordmarks outside seance. default: no, doto everywhere else.
- kaomoji volume in desktop chrome. default: toasts and empty states only, never on buttons.
- occult vocabulary outside seance. default: seance only; the core copy is deadpan, not spooky.
- nova's location. default: out of v1 until pointed at.
