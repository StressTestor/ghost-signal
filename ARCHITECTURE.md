# architecture

ghost signal is the design system for joe's guis: a token set, a css layer, web components, and a
plug-in contract (manifest plus flavor) so new apps join without core edits. design:
`docs/superpowers/specs/2026-09-23-ghost-signal-design.md`. plan:
`docs/superpowers/plans/2026-09-23-ghost-signal-v0.1.0.md`.

## overview

one authored file, `tokens.json`, drives four generated surfaces (css, swift, rust, markdown) plus
a generated svg sprite. everything a consumer imports is plain, dependency-free source: es modules
and css for the web (seance, agora), a rust module for the ratatui tuis (ghost, sentinel), a swift
file for the swiftui apps (static-field, nativeterm). a small cli (`ghost-signal`) validates an
app's manifest and builds its flavor override; a gallery serves every component in every status,
theme and glitch level for by-eye checks. nothing here has a runtime dependency, and every generated
file is committed so a consumer can vendor the repo at a tag with no build step of its own.

## stack

| layer | choice | why |
|---|---|---|
| tokens | `tokens.json` -> `scripts/gen.js` -> css, swift, rust, markdown | one authored source, four surfaces, outputs committed and diffed by ci |
| web | plain es modules and css, light dom components, no bundler, no runtime deps | consumers import files as-is; global css styles `[part="x"]` attributes |
| generator and cli | node 22+, no dependencies | `scripts/gen.js`, `scripts/ghost-signal.js`, logic in `scripts/lib/` |
| fonts | doto (ofl) bundled as woff2 | offline, tauri csp, nothing fetched |
| tests | `node:test` + `@playwright/test` (chromium) against `scripts/serve.js`; the `feel` project runs alone | contrast, determinism, reduced motion, plug-in probe, feel budgets |
| ci | github actions, every action pinned to a commit sha | gen diff, unit, contrast, e2e, feel, runner baseline, report artifacts |

## tree

```
tokens.json               the only authored values
scripts/
  gen.js                  writes src/tokens.css gen/* src/icons.{svg,js} gallery/apps/probe/flavor.{css,js}
  check-contrast.js       exit 1 per failing pair or css rule
  ghost-signal.js         cli: check | flavor check | flavor build | lint-motion
  serve.js                static server on 127.0.0.1:4173 serving the repo root
  fetch-doto.sh           pinned font fetch + woff2 conversion (run once)
  sync-ghost-signal.sh    copies src/ gen/ schema/ into a no-bundler consumer
  feel-baseline.js        the clean control n times: the runner's frame cpu, stalls, drops, calibration
  record-feel-fixtures.js dev only: records the chromium traces the trace.js tests read
  lib/                    tokens.js contrast.js icons.js schema.js cli.js motion-lint.js
schema/                   app.v1.json flavor.v1.json
src/
  tokens.css base.css fx.css icons.svg icons.js (generated)
  icons/*.grid            twenty 16x16 glyph sources
  fonts/                  Doto-VariableFont.woff2 (~8.7kb) OFL.txt SOURCE
  gs.js grid.js expressions.js copy.js
  components/             mosaic face decode tape window toast row container empty error splash wallpaper palette (13 modules)
  feel/                   probe.js (in-page recorder) playwright.js (the fixture) trace.js budgets.js evaluate.js format.js errors.js index.js
gen/                      GhostSignal.swift ghost_signal.rs tokens.md
gallery/                  index.html gallery.js apps/probe/ screenshots/ (gitignored)
test/unit                 node:test
test/e2e                  playwright specs, pages/, fixtures/, __snapshots__/
test/feel                 playwright feel project: harness.spec.js (controls), pages/
```

## key patterns

- semantic tokens only, `gs-` prefix. `--gs-motion-<name>` durations, `--gs-step-<name>` step
  functions, `--gs-ease-<name>` curves, `--gs-distance-<name>` offsets. status aliases
  `--gs-color-idle|working|crash` point at their tokens. `loadTokens` runs `validateMotion`, so a
  stepped ease, an eased step, an overshooting curve or a spatial duration off the 60hz frame grid
  fails `npm run gen`. the `feel` group is read by `src/feel/budgets.js` and never reaches css. the
  hover pair (`--gs-motion-hover` 0ms, `--gs-ease-hover`) stays emitted until 0.3.
- the status vocabulary is `idle working ok warn deny bypass crash`. `coerceStatus` turns anything
  else into `warn` with a console error. the face is always green; status lives on dots, bars, toasts.
- motion is a hard cut. only `color`, `border-color`, `background-color` ease, on hover and focus.
  every animation in `fx.css` is gated on `:root[data-glitch="1"]` or `"2"`; reduced motion zeroes
  the motion tokens and `gs.js` forces `data-glitch="0"` on import.
- `gs-mosaic` has no rng and draws integer-aligned rects, so canvas hashes are pinned in
  `test/e2e/__snapshots__/`. `hash()` is `<width>x<height>:<fnv-1a of the getImageData rgba
  bytes>`, synchronous and free of the png encoder, so a browser changing its compression can't
  move a pin. the snapshot files hold that string as is. only dot mode is pixel-stable across platforms: ascii mode rasterizes
  through the platform's monospace font fallback, so its hash is never pinned. `gs-decode` and
  ambient glitch use `GS.seed` / `GS.random`.
- icons live in one registry. `src/icons.js` is generated data (no imports) and `gs.js` registers
  all twenty core grids from it on import, so `getIcon('ghost')` and `<gs-wallpaper sprite="ghost">`
  work with nothing hand-registered. `injectIcons(root = document.body)` writes one hidden
  `svg[data-gs-icons]` sprite of every registered icon (core + app) through `gridToSymbol`, and
  rewrites it only when the registry changed. `gen.js` reads grids through `src/grid.js` (no
  imports) and loads `cli.js`, which pulls in `gs.js`, only after writing `src/icons.js`, so a
  checkout missing that file still regenerates.
- a canvas reads its colors only when it renders, so `gs.js` keeps one `MutationObserver` on
  `<html>`'s `data-theme` (created on the first `watchTheme`, never without a document) and
  repaints every connected `gs-mosaic`; mosaics `watchTheme` on connect and `unwatchTheme` on
  disconnect. a mosaic with an explicit `lit` attribute keeps that color across the flip.
- components are light dom. every component module guards `HTMLElement` and
  `customElements.define` so node can import it. component rules in `base.css` key on `[part]`,
  `data-status`, `open`, `aria-expanded`, `aria-selected`. `.gs-label` and
  related chrome classes lowercase their text, but `.gs-kaomoji` opts back out of that
  transform, since a kaomoji's case is part of its meaning (`>:D` is not `>:d`).
- flavors override a fixed allow-list (`accent2 {dark,light}`, `display`, `texture`, `sprite`,
  `expressions`, `icons`, `copy`); the schema's `additionalProperties: false` rejects everything
  else. `accent2` is a pair of hexes, one per theme, because a single hex can't clear 4.5:1 contrast
  on both a near-black and a near-white canvas and the checker tests both. `flavor build` emits
  `[data-app="<id>"]` css and a js registration module. `check app.json` scans `.js`/`.mjs`/`.ts`
  under the manifest's dir for a `gs-*` define, skipping `node_modules dist build target .git` and
  any subdirectory holding `VERSION` + `src/gs.js` (a synced ghost-signal copy). the light block carries two selectors,
  `:root[data-theme="light"][data-app="<id>"]` for `data-app` on `<html>` (the consumer layout) and
  `:root[data-theme="light"] [data-app="<id>"]` for an app mounted in a subtree (the gallery probe).
- `gs-wallpaper` throws `GsWallpaperPlacementError` outside `gs-empty gs-error gs-splash`. absent
  `cols`/`rows` attributes it sizes itself from its own box (`ResizeObserver`) so it tiles edge to
  edge instead of a fixed patch; `cols`/`rows` are explicit overrides for callers that want a fixed
  grid. its step timer always runs, but each tick checks `glitchLevel()` and `reducedMotion()` and
  stops stepping at glitch `0` without needing a remount.

## env vars

none. the generator, cli, gallery server and test suite all run with no environment configuration.
`GS_REPO` and `DEST` are the only env-driven inputs in the repo, and both belong to
`scripts/sync-ghost-signal.sh`, a consumer-side convenience script for vendoring a release.

## deployment / ci

no deployment: this repo ships source for consumers to import or vendor. `.github/workflows/ci.yml` runs on
push to `main` and on every pull request, `ubuntu-latest`, and every action is pinned to a full
commit sha with the version in a trailing comment:

| action | pinned sha | version |
|---|---|---|
| `actions/checkout` | `d23441a48e516b6c34aea4fa41551a30e30af803` | v6.1.0 |
| `actions/setup-node` | `249970729cb0ef3589644e2896645e5dc5ba9c38` | v6.5.0 |
| `actions/upload-artifact` | `b7c566a772e6b6bfb58ed0dc250532a479d7789f` | v6.0.0 |

steps: `npm ci` -> `npm run gen && git diff --exit-code` (generated files must already be current)
-> `npm test` -> `npm run check` -> `npx playwright install --with-deps --only-shell chromium` -> `npm run e2e` -> `npm run feel` (10 minute cap) -> upload `test-results/**/feel-*` as `feel-reports` -> `node scripts/feel-baseline.js --runs=5` (informational, continue-on-error) -> upload `feel-baseline` (job capped at 40 minutes)
-> upload `gallery/screenshots` as an artifact (`if: always()`, ignored if absent). releasing is a
git tag (`v0.1.0`) pushed to `origin`; consumers pin to it via `github:StressTestor/ghost-signal#v0.1.0`
or `scripts/sync-ghost-signal.sh`.

## integrations

none beyond the consumer apps themselves (seance, agora, ghost, sentinel, static-field, nativeterm).
no external services, no analytics, no telemetry, no network calls anywhere in `src/`, `scripts/`
or `gallery/`.

## gotchas

- problem: a custom element throws a null-deref on first paint. cause: `attributeChangedCallback`
  fires for markup attributes before `connectedCallback` on upgrade, so a handler that assumes the
  element's internals already exist dereferences nothing. fix: every attribute handler returns early
  (no throw) until `connectedCallback` has built the element's internals.
- problem: a generated file has been hand edited. cause: someone edited `src/tokens.css`, `gen/*`,
  `src/icons.svg`, `src/icons.js` or a probe flavor file directly instead of `tokens.json` or a grid file. fix:
  revert the generated file, edit the real source, run `npm run gen`; ci catches this with
  `git diff --exit-code`.
- problem: a pinned face or mosaic hash differs on ci but the screenshot looks identical. cause: the
  hash already covers raw rgba bytes, not png output, so the likely suspect is the unlit cells:
  they draw at `globalAlpha` 0.25 on a transparent canvas, and `getImageData` un-premultiplies
  those pixels, which a different canvas backend can round differently. ascii-mode text is never
  pinned for the same kind of reason (font fallback). fix: compare `gallery/screenshots` artifacts;
  if only the dim cells differ, draw them opaque (pre-blend the dim color) and re-pin the dot-mode
  snapshots by deleting them and running `npm run e2e` twice.
- problem: `npm test` fails with "directory argument not allowed". cause: node 26 rejects a bare
  directory passed to `--test`. fix: the script passes a quoted glob (`'test/unit/**/*.test.js'`);
  keep it quoted.
- problem: `document.fonts.check('900 34px Doto')` returns false in a test. cause: the face element
  rendered before the font finished loading. fix: `await document.fonts.load(...)` first, as the
  gallery test does.
- problem: an e2e snapshot is reported "missing" on ci but exists locally. cause:
  `snapshotPathTemplate` grew a `{platform}` segment, or `test/e2e/__snapshots__/` wasn't committed.
  fix: keep the template platform-free and commit the snapshots directory.
- problem: `test.use({ reducedMotion: 'reduce' })` has no effect on an e2e spec. cause: that
  top-level option is a no-op on the pinned `@playwright/test` 1.58.2. fix: use
  `test.use({ contextOptions: { reducedMotion: 'reduce' } })` instead, as every reduced-motion
  describe block in `test/e2e/*.spec.js` does.
- problem: a page error "cannot read properties of undefined (reading '0')" from `GsMosaic.render`
  during a resize. cause: `gs-wallpaper` writes `cols`, then `rows`, then the matching grid; each
  attribute write re-renders synchronously, so for one render the mosaic holds a grid smaller than
  its new `cols x rows`. a full-page screenshot reflows the page and triggers it. fix: `render()`
  reads `grid[y]?.[x]`, so cells past the old grid draw unlit until the wallpaper sets the new grid.
- problem: `playwright install chromium` downloads to 100% and then never exits (ci hung 27 and 8
  minutes in pr #1; locally it left a 1.5M partial browser dir). cause: `@playwright/test` 1.58.2's
  archive extraction hangs under node 26. under node 24.21 the same install finishes in about 6s.
  fix: ci runs on node 24 with `playwright install --with-deps --only-shell chromium` under a step
  timeout. locally, install browsers with node 24 (`npx -y node@24 node_modules/playwright/cli.js
  install --only-shell chromium`); running the tests on node 26 afterwards is fine.
- problem: `flavor build` throws instead of writing files. cause: it runs `check` internally first.
  fix: read the reported line, fix the manifest or flavor file, re-run.
- problem: `lint-motion` exits 2 with "nested rules aren't supported". cause: it reads sheets
  through the flat `cssRules` walker, which would glue a parent's declarations onto a nested
  rule's selector and drop an `@media` written inside a rule, so a nested sheet would lint clean
  without being read. fix: flatten the sheet (write each rule's full selector at the top level or
  inside plain `@media` / `@supports`), then lint again.
- problem: `lint-motion` exits 2, or `npm run check` exits 2, with "unbalanced braces (<file> line
  N: ...)". cause: `cssRules` reads strings, escapes and comments as text but counts every other
  brace, and a count that doesn't come out even would mean part of the sheet went unread. the usual
  culprit is a brace inside an unquoted `url(...)`. fix: quote the url (`url("a}b.png")`) or
  close the rule the message names, then run it again.
- problem: `gs-decode` renders empty text. cause: its text only comes from the `text` attribute;
  child text content is read once on first connect and never again. fix: set the `text` attribute,
  not element children.
- problem: `.superpowers/` shows up in a diff or a grep sweep. cause: it's the sdd scratch directory
  for this plan (task briefs, reports, controller notes), not part of the shipped repo. fix: it's
  already in `.gitignore`; nothing under it is ever committed.

## commands

```
npm ci
npm run gen && git diff --exit-code
npm test
npm run check
npm run e2e   # the chromium project only
npm run feel
GS_FEEL_RUNS=1 npm run feel
npm run serve
node scripts/ghost-signal.js check gallery/apps/probe/app.json
node scripts/ghost-signal.js lint-motion 'src/*.css'
DEST=vendor/ghost-signal scripts/sync-ghost-signal.sh v0.1.0
node scripts/feel-baseline.js --runs=20 --dpr=2
node scripts/record-feel-fixtures.js
```

last updated: 2026-09-25 (v0.2 in progress, plan task 9)
