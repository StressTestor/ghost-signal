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
| tests | `node:test` + `@playwright/test` (chromium) against `scripts/serve.js` | contrast, determinism, reduced motion, plug-in probe |
| ci | github actions, every action pinned to a commit sha | gen diff, unit, contrast, e2e, screenshot artifact |

## tree

```
tokens.json               the only authored values
scripts/
  gen.js                  writes src/tokens.css gen/* src/icons.svg gallery/apps/probe/flavor.{css,js}
  check-contrast.js       exit 1 per failing pair or css rule
  ghost-signal.js         cli: check | flavor check | flavor build
  serve.js                static server on 127.0.0.1:4173 serving the repo root
  fetch-doto.sh           pinned font fetch + woff2 conversion (run once)
  sync-ghost-signal.sh    copies src/ gen/ schema/ into a no-bundler consumer
  lib/                    tokens.js contrast.js icons.js schema.js cli.js
schema/                   app.v1.json flavor.v1.json
src/
  tokens.css base.css fx.css icons.svg
  icons/*.grid            twenty 16x16 glyph sources
  fonts/                  Doto-VariableFont.woff2 (~8.7kb) OFL.txt SOURCE
  gs.js expressions.js copy.js
  components/             mosaic face decode tape window toast row container empty error splash wallpaper palette (13 modules)
gen/                      GhostSignal.swift ghost_signal.rs tokens.md
gallery/                  index.html gallery.js apps/probe/ screenshots/ (gitignored)
test/unit                 node:test
test/e2e                  playwright specs, pages/, fixtures/, __snapshots__/
```

## key patterns

- semantic tokens only, `gs-` prefix. `--gs-motion-<name>` durations, `--gs-step-<name>` step
  functions, `--gs-ease-hover`. status aliases `--gs-color-idle|working|crash` point at their tokens.
- the status vocabulary is `idle working ok warn deny bypass crash`. `coerceStatus` turns anything
  else into `warn` with a console error. the face is always green; status lives on dots, bars, toasts.
- motion is a hard cut. only `color`, `border-color`, `background-color` ease, on hover and focus.
  every animation in `fx.css` is gated on `:root[data-glitch="1"]` or `"2"`; reduced motion zeroes
  the motion tokens and `gs.js` forces `data-glitch="0"` on import.
- `gs-mosaic` has no rng and draws integer-aligned rects, so canvas hashes are pinned in
  `test/e2e/__snapshots__/`. only dot mode is pixel-stable across platforms: ascii mode rasterizes
  through the platform's monospace font fallback, so its hash is never pinned. `gs-decode` and
  ambient glitch use `GS.seed` / `GS.random`.
- components are light dom. every component module guards `HTMLElement` and
  `customElements.define` so node can import it. component rules in `base.css` key on `[part]`,
  `data-status`, `open`, `aria-expanded`, `aria-selected`. `.gs-label` and
  related chrome classes lowercase their text, but `.gs-kaomoji` opts back out of that
  transform, since a kaomoji's case is part of its meaning (`>:D` is not `>:d`).
- flavors override a fixed allow-list (`accent2 {dark,light}`, `display`, `texture`, `sprite`,
  `expressions`, `icons`, `copy`); the schema's `additionalProperties: false` rejects everything
  else. `accent2` is a pair of hexes, one per theme, because a single hex can't clear 4.5:1 contrast
  on both a near-black and a near-white canvas and the checker tests both. `flavor build` emits
  `[data-app="<id>"]` css and a js registration module. the light block carries two selectors,
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
-> `npm test` -> `npm run check` -> `npx playwright install --with-deps chromium` -> `npm run e2e`
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
  `src/icons.svg` or a probe flavor file directly instead of `tokens.json` or a grid file. fix:
  revert the generated file, edit the real source, run `npm run gen`; ci catches this with
  `git diff --exit-code`.
- problem: a pinned face or mosaic hash differs on ci but the screenshot looks identical. cause: the
  png encoder or a font fallback changed, not the grid; ascii-mode canvas text is never pinned for
  this exact reason. fix: compare `gallery/screenshots` artifacts; if the pixels match, hash
  `getImageData` bytes instead of the png and re-pin only dot-mode snapshots.
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
- problem: a local e2e run and a ci run can exercise a different chromium binary. cause: `@playwright/test`
  runs its default headless mode through `chromium_headless_shell` locally, while ci's
  `npx playwright install --with-deps chromium` installs and runs full chromium. fix: none needed,
  both satisfy `browserName: 'chromium'` in `playwright.config.js`; know which one ran when
  debugging a rendering difference between a local pass and a ci failure.
- problem: `flavor build` throws instead of writing files. cause: it runs `check` internally first.
  fix: read the reported line, fix the manifest or flavor file, re-run.
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
npm run e2e
npm run serve
node scripts/ghost-signal.js check gallery/apps/probe/app.json
DEST=vendor/ghost-signal scripts/sync-ghost-signal.sh v0.1.0
```

last updated: 2026-09-23 (v0.1.0)
