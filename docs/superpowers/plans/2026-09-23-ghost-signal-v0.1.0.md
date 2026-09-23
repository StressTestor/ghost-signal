# ghost signal v0.1.0 implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** take `/Volumes/T7/ghost-signal` from a spec and two stubs to a locally tagged `v0.1.0` with the token pipeline, css layer, every web component, the plug-in contract, the gallery, the probe app and green ci.

**Architecture:** `tokens.json` is the single authored source; `scripts/gen.js` writes `src/tokens.css`, `gen/GhostSignal.swift`, `gen/ghost_signal.rs`, `gen/tokens.md`, `src/icons.svg` and the probe flavor output, all committed and diffed by ci. `src/` ships as-is: plain es modules and css, light dom components (no shadow roots, so global css applies and `[part="x"]` is a plain attribute selector), no bundler, no runtime dependencies. `scripts/lib/*.js` holds the node logic (tokens, contrast, icons, schema, cli) so both the cli and the unit tests import the same functions.

**Tech Stack:** node 26.5 on macos, `node:test` for unit tests, `@playwright/test` 1.58.2 (chromium already installed) against a dependency-free static server on `127.0.0.1:4173`, python fonttools via `uvx` once for the font conversion, `gh` for resolving commit shas.

**Spec:** `/Volumes/T7/ghost-signal/docs/superpowers/specs/2026-09-23-ghost-signal-design.md`

**Scope:** this repo only, from its current state (spec committed, `ARCHITECTURE.md` stub, git initialised, remote `origin` at `https://github.com/StressTestor/ghost-signal.git`, branch `main`) through `git tag -a v0.1.0`. consumer migrations (seance, agora, ghost and sentinel tuis, the super app) are separate plans. pushing `main` and the tag is joe's call; this plan never pushes.

## global constraints

copied from the spec. every task's requirements include this section.

- every token is prefixed `gs-` and named semantically (`--gs-color-accent`), never by raw value (`--gs-green`).
- the status vocabulary is exactly `idle`, `working`, `ok`, `warn`, `deny`, `bypass`, `crash`. anything else becomes `warn` with a console error.
- the face is always green. status never recolors it; state goes on dots, bars and toasts.
- motion is a hard cut. the only things allowed to ease are `color`, `border-color` and `background-color` on hover and focus, at `var(--gs-motion-hover) var(--gs-ease-hover)`. no transforms ease, no opacity fades between views.
- no drop shadows, no elevation, no blur, no glass, no scanlines, no grain. the only glows are the face's leds and the focus ring.
- doto (ofl) is bundled as woff2 and declared with `@font-face` in `base.css`. nothing is fetched from google fonts.
- `<gs-mosaic>` contains no random number generator. same input, same output. `<gs-decode>` and ambient glitch use the seeded prng `GS.seed(n)` / `GS.random()`.
- `<gs-wallpaper>` mounts only inside `<gs-empty>`, `<gs-error>` or `<gs-splash>`; anywhere else it throws `GsWallpaperPlacementError`. it never sits behind data.
- `tokens.css` carries dark, light and reduced-motion blocks and no `[data-app]` block. per-app css comes only from `ghost-signal flavor build`.
- generated files (`src/tokens.css`, `src/icons.svg`, `gen/*`, `gallery/apps/probe/flavor.css`, `gallery/apps/probe/flavor.js`) are committed and ci runs `npm run gen && git diff --exit-code`. a hand edit to a generated file fails the build.
- microcopy is lowercase and deadpan: no exclamation points, no em dashes, no "oops", no "successfully", no "please". all caps only inside `<gs-tape>`.
- `gs-` is a reserved element prefix. an app that defines a `gs-*` custom element fails the checker.
- every github action is pinned to a full commit sha resolved with `gh api repos/<owner>/<repo>/git/ref/tags/<tag> --jq .object.sha`, never guessed. a `# vX.Y.Z` comment sits beside the sha.
- no runtime dependencies. the only dev dependency is `@playwright/test` pinned to `1.58.2`.
- commits are conventional: `type(scope): description`, lowercase, imperative, no period, with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. types: feat, fix, refactor, docs, test, chore, ci, perf, security.
- reduced motion (`prefers-reduced-motion: reduce`) zeroes every motion token, disables ambient glitch and the blink, and forces `data-glitch="0"`. color and kaomoji carry the meaning.

## deviations from the spec, decided up front

- `flavor.json` `accent2` is `{ "dark": "#hex", "light": "#hex" }`, not one string as in spec 6.3. one hex cannot pass 4.5:1 on both a near-black and a near-white canvas, and the checker tests both.
- the doto font comes from `github.com/oliverlalan/Doto` at commit `1c587f2eed62cb257055540ac2a15f356070414f` (`github.com/googlefonts/doto` is a 404). the variable ttf is converted to woff2 with python fonttools plus brotli, `OFL.txt` sits next to it, and the sha is recorded in `README.md`.
- motion token names follow one scheme: `--gs-motion-<name>` for durations, `--gs-step-<name>` for step functions, `--gs-ease-hover` for the one easing. spec 3.6 mixes `--gs-cut`, `--gs-glitch` and `--gs-step-sprite`; the generator emits the uniform names.
- `<gs-decode>` gets its own token `--gs-motion-decode: 250ms` with `--gs-step-decode: steps(6)`, zeroed under reduced motion, instead of riding `--gs-motion-sprite`.
- ambient tokens are `--gs-motion-ambient-min: 20s` and `--gs-motion-ambient-max: 40s`.
- texture tokens (`--gs-dither`, `--gs-dither-strong`, `--gs-block-corner`) are svg data uris authored in `fx.css`, since they are markup rather than scalar values. `--gs-block-corner` is a white mask applied with `mask-image` and colored with the glitch tokens, so no hex leaves `tokens.json`. the pixel-hand cursor uri is the one neutral black-and-white image with hardcoded fill.
- light-theme glitch colors are not in spec 3.2; they mirror the dark rule (glitch-a is bypass, glitch-b is ok).
- `gen/ghost_signal.rs` and `gen/GhostSignal.swift` carry the kaomoji per status. the kaomoji map is authored once in `tokens.json` and `src/expressions.js` repeats it with a unit test asserting equality, because browser modules do not read `tokens.json`.
- the "two reference images" of spec 9.3 are two committed grid fixtures, because a rasterized image passes through a per-platform decoder and would break the pinned hash. image input is covered by a node unit test on synthetic pixel data.
- "lint clean" (spec 12) with no lint dependency allowed means `node --check` on every js file plus the hygiene greps in task 16.
- the flavor schema requires `ghostSignal` (spec 7 says flavors declare it; the 6.3 example omits it).

## file structure

```
ghost-signal/
  .github/workflows/ci.yml
  .gitignore
  ARCHITECTURE.md
  README.md
  package.json  package-lock.json
  playwright.config.js
  tokens.json
  scripts/
    gen.js                 # tokens.json -> css, swift, rust, md, icons.svg, probe flavor
    check-contrast.js      # exits non-zero with one line per failure
    ghost-signal.js        # cli: check | flavor check | flavor build
    serve.js               # static server for playwright and by-eye checks
    fetch-doto.sh          # pinned font fetch + woff2 conversion
    sync-ghost-signal.sh   # copied into no-bundler consumers
    lib/
      tokens.js            # loadTokens, toCss, toSwift, toRust, toMarkdown
      contrast.js          # luminance, ratio, checkTokens, scanCss
      icons.js             # grid files -> icons.svg
      schema.js            # minimal json schema validator + satisfies
      cli.js               # check, flavorBuild
  schema/app.v1.json  schema/flavor.v1.json
  src/
    tokens.css             # generated
    base.css  fx.css
    icons.svg              # generated from src/icons/*.grid
    icons/<name>.grid      # twenty 16x16 grids
    fonts/Doto-VariableFont.woff2  fonts/OFL.txt  fonts/SOURCE
    gs.js                  # statuses, prng, registries, grid parsing, fx helpers
    expressions.js         # core face grids + kaomoji
    copy.js                # core microcopy + overrides
    components/
      mosaic.js face.js decode.js tape.js window.js toast.js row.js
      container.js empty.js error.js splash.js wallpaper.js palette.js
  gen/GhostSignal.swift  gen/ghost_signal.rs  gen/tokens.md
  gallery/
    index.html  gallery.js
    apps/probe/{app.json,flavor.json,index.html,flavor.css,flavor.js,expressions/probing.grid,icons/sigil.grid,sprites/probe.grid}
    screenshots/           # gitignored, ci artifact
  test/
    unit/*.test.js
    e2e/*.spec.js  e2e/pages/*.html  e2e/fixtures/*.grid  e2e/__snapshots__/
```

## shared names (use verbatim in every task)

| module | exports |
|---|---|
| `scripts/lib/tokens.js` | `loadTokens(path?)`, `toCss(tokens)`, `toSwift(tokens)`, `toRust(tokens)`, `toMarkdown(tokens)` |
| `scripts/lib/contrast.js` | `hexToRgb(hex)`, `luminance(hex)`, `ratio(a, b)`, `checkTokens(tokens)`, `scanCss(css, tokens)` |
| `scripts/lib/icons.js` | `buildSprite(dir)`, `ICON_NAMES` |
| `scripts/lib/schema.js` | `validate(schema, value)`, `satisfies(range, version)` |
| `scripts/lib/cli.js` | `check(file)`, `flavorBuild(file, { gsImport })` |
| `src/gs.js` | `STATUSES`, `isStatus`, `coerceStatus`, `GS.seed`, `GS.random`, `parseGrid`, `GsGridError`, `GsCoreExpressionError`, `GsWallpaperPlacementError`, `CORE_EXPRESSION_NAMES`, `registerExpression`, `getExpression`, `registerIcon`, `getIcon`, `listIcons`, `registerSprite`, `getSprite`, `registerCommands`, `getCommands`, `glitchLevel`, `reducedMotion`, `motionMs`, `glitchOnce`, `moshOnce`, `flareOnce`, `startAmbient`, `gridToSymbol` (added in task 9) |
| `src/expressions.js` | `CORE`, `KAOMOJI`, `resolveExpression` |
| `src/copy.js` | `CORE_COPY`, `setCopy`, `copy`, `resetCopy` |
| `src/components/mosaic.js` | `BAYER4`, `bayerThreshold`, `imageToGrid`, `textToGrid`, `GsMosaic` |
| `src/components/face.js` | `nextFrame`, `GsFace` |
| `src/components/decode.js` | `GLYPHS`, `scrambleFrames`, `GsDecode` |
| `src/components/wallpaper.js` | `tileGrid`, `GsWallpaper` |

a grid is always `string[]`: one string per row, `.` unlit, `#` lit, every row the same length.

every component module starts with `const Base = globalThis.HTMLElement ?? class {};` and ends with `if (globalThis.customElements && customElements.get('gs-x') === undefined) customElements.define('gs-x', GsX);` so node can import it for unit tests.

---

### task 1: scaffold, static server, playwright, ci

**Files:**
- Create: `package.json`, `.gitignore`, `README.md`, `playwright.config.js`, `scripts/serve.js`, `test/unit/smoke.test.js`, `test/e2e/smoke.spec.js`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: nothing.
- Produces: npm scripts `test`, `gen`, `check`, `e2e`, `serve`; the server at `http://127.0.0.1:4173/` serving the repo root; `playwright.config.js` with `webServer` and a platform-free snapshot path.

- [ ] **Step 1: write package.json**

```json
{
  "name": "ghost-signal",
  "version": "0.1.0",
  "description": "design system for joe's guis: tokens, css, web components, plug-in contract",
  "type": "module",
  "license": "MIT",
  "repository": "github:StressTestor/ghost-signal",
  "files": ["src", "gen", "schema", "scripts", "tokens.json"],
  "exports": {
    ".": "./src/gs.js",
    "./package.json": "./package.json",
    "./*": "./src/*"
  },
  "bin": {
    "ghost-signal": "./scripts/ghost-signal.js"
  },
  "scripts": {
    "test": "node --test 'test/unit/**/*.test.js'",
    "gen": "node scripts/gen.js",
    "check": "node scripts/check-contrast.js",
    "e2e": "playwright test",
    "serve": "node scripts/serve.js"
  },
  "engines": {
    "node": ">=22"
  },
  "devDependencies": {
    "@playwright/test": "1.58.2"
  }
}
```

`./*` maps `ghost-signal/tokens.css` to `./src/tokens.css` and `ghost-signal/components/face.js` to `./src/components/face.js`, which is the vite import path spec 7 promises. node 26 rejects a directory as the `--test` argument, so the script passes a quoted glob and node expands it.

- [ ] **Step 2: write .gitignore and the README stub**

`.gitignore`:

```
node_modules/
test-results/
playwright-report/
gallery/screenshots/
.doto.*
.DS_Store
```

`README.md`:

```markdown
# ghost signal

design system for joe's guis. tokens, a css layer, web components, and a plug-in contract.
spec: `docs/superpowers/specs/2026-09-23-ghost-signal-design.md`. usage lands with v0.1.0.
```

- [ ] **Step 3: write scripts/serve.js**

```js
#!/usr/bin/env node
// dependency-free static server for playwright and by-eye checks.
// serves the repo root so test pages can import ../../../src/*.js (｡◕‿↼)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT ?? 4173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.grid': 'text/plain; charset=utf-8',
};

async function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  if (clean.includes('..')) return null;
  let file = normalize(join(ROOT, clean));
  if (file.startsWith(ROOT) === false) return null;
  let info = await stat(file).catch(() => null);
  if (info?.isDirectory()) {
    file = join(file, 'index.html');
    info = await stat(file).catch(() => null);
  }
  return info?.isFile() ? file : null;
}

const server = createServer(async (req, res) => {
  const file = await resolveFile(req.url ?? '/');
  if (file === null) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('404');
    return;
  }
  const body = await readFile(file);
  res.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  res.end(body);
});

server.on('error', (err) => {
  process.stderr.write(`serve: ${err.message}\n`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`ghost-signal serving ${ROOT} at http://${HOST}:${PORT}/\n`);
});
```

- [ ] **Step 4: write playwright.config.js**

```js
import { defineConfig } from '@playwright/test';

// snapshot names carry no {platform} on purpose: a hash pinned on darwin
// has to be the same file ci reads on ubuntu (¬‿¬)
export default defineConfig({
  testDir: 'test/e2e',
  snapshotPathTemplate: '{testDir}/__snapshots__/{testFileName}/{arg}{ext}',
  updateSnapshots: process.env.CI ? 'none' : 'missing',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'node scripts/serve.js',
    url: 'http://127.0.0.1:4173/package.json',
    reuseExistingServer: process.env.CI ? false : true,
    timeout: 10_000,
  },
});
```

- [ ] **Step 5: write the smoke tests**

`test/unit/smoke.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('package.json has no runtime dependencies and one pinned dev dependency', async () => {
  const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.dependencies, undefined);
  assert.deepEqual(Object.keys(pkg.devDependencies), ['@playwright/test']);
  assert.match(pkg.devDependencies['@playwright/test'], /^\d+\.\d+\.\d+$/);
  assert.equal(pkg.type, 'module');
});
```

`test/e2e/smoke.spec.js`:

```js
import { test, expect } from '@playwright/test';

test('the static server serves the repo root with correct mime types', async ({ request }) => {
  const res = await request.get('/package.json');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('application/json');
  const missing = await request.get('/does-not-exist.js');
  expect(missing.status()).toBe(404);
  // a literal /../ is normalized away by the url parser before it leaves playwright;
  // the encoded slash survives, serve.js decodes it, and the .. check must catch it
  const escape = await request.get('/..%2Fpackage.json');
  expect(escape.status()).toBe(404);
});
```

- [ ] **Step 6: install and run both suites**

Run: `cd /Volumes/T7/ghost-signal && npm install && npm test && npm run e2e`

Expected: `npm install` writes `package-lock.json`; `npm test` prints `# pass 1` and `# fail 0`; `npm run e2e` prints `1 passed`.

- [ ] **Step 7: resolve action shas and write ci.yml**

Run each of these and paste the output beside the action. resolved on 2026-09-23 the values were `d23441a48e516b6c34aea4fa41551a30e30af803`, `249970729cb0ef3589644e2896645e5dc5ba9c38` and `b7c566a772e6b6bfb58ed0dc250532a479d7789f`; re-run to confirm before committing.

```bash
gh api repos/actions/checkout/git/ref/tags/v6.1.0 --jq '.object.type + " " + .object.sha'
gh api repos/actions/setup-node/git/ref/tags/v6.5.0 --jq '.object.type + " " + .object.sha'
gh api repos/actions/upload-artifact/git/ref/tags/v6.0.0 --jq '.object.type + " " + .object.sha'
```

Expected: each line starts with `commit`. if a line starts with `tag` the ref is annotated; dereference it with `gh api repos/<owner>/<repo>/git/tags/<sha> --jq .object.sha` and use that commit sha instead.

`.github/workflows/ci.yml`:

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6.1.0
      - uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6.5.0
        with:
          node-version: '26'
          cache: npm
      - run: npm ci
      - name: generated files are current
        run: |
          npm run gen
          git diff --exit-code
          test -z "$(git status --porcelain)"
      - run: npm test
      - run: npm run check
      - run: npx playwright install --with-deps chromium
      - run: npm run e2e
      - uses: actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f # v6.0.0
        if: always()
        with:
          name: gallery-screenshots
          path: gallery/screenshots
          if-no-files-found: ignore
```

`npm run gen` and `npm run check` do not exist until tasks 2 and 4; ci is red until then, which is expected for a repo nobody has pushed. `git status --porcelain` catches a generated file that is new rather than modified.

- [ ] **Step 8: commit**

```bash
cd /Volumes/T7/ghost-signal
git add package.json package-lock.json .gitignore README.md playwright.config.js scripts/serve.js test/unit/smoke.test.js test/e2e/smoke.spec.js .github/workflows/ci.yml
git commit -m "chore(scaffold): package, static server, playwright and pinned ci" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### task 2: tokens.json and the css generator

**Files:**
- Create: `tokens.json`, `scripts/lib/tokens.js`, `scripts/gen.js`, `src/tokens.css` (generated)
- Test: `test/unit/tokens.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `loadTokens(path = <repo>/tokens.json): Promise<object>`; `toCss(tokens): string`. the `tokens` object shape below is what every later task reads. custom property names: `--gs-color-<name>`, `--gs-color-<status>` aliases (`idle`, `working`, `crash`), `--gs-font-<name>`, `--gs-size-<name>`, `--gs-tracking-label`, `--gs-space-<n>`, `--gs-radius-<name>`, `--gs-border`, `--gs-bar`, `--gs-motion-<name>`, `--gs-step-<name>`, `--gs-ease-hover`, and `--gs-glitch-forced: 0` only under reduced motion.

- [ ] **Step 1: write tokens.json**

```json
{
  "$comment": "the only place a value is authored. src/tokens.css and gen/ are generated from this file by scripts/gen.js",
  "color": {
    "dark": {
      "void": "#050505",
      "surface": "#0c0c0d",
      "raised": "#151517",
      "hairline": "#1e1f21",
      "etch": "#2a2c2f",
      "text": "#eef1f2",
      "text-muted": "#8e9396",
      "text-faint": "#3a3e41",
      "accent": "#0ec224",
      "accent-bloom": "#b2fcba",
      "accent-dim": "#257829",
      "ok": "#0cc0cb",
      "warn": "#e8a33d",
      "deny": "#ff5c4d",
      "bypass": "#f8098c",
      "glitch-a": "#f8098c",
      "glitch-b": "#0cc0cb",
      "on-accent": "#050505"
    },
    "light": {
      "void": "#f2f4f5",
      "surface": "#e9ecee",
      "raised": "#e4e7e9",
      "hairline": "#d3d7da",
      "etch": "#b9bec2",
      "text": "#0b0c0d",
      "text-muted": "#4b5054",
      "text-faint": "#b0b5b9",
      "accent": "#08701a",
      "accent-bloom": "#0ec224",
      "accent-dim": "#c6ecc9",
      "ok": "#08666c",
      "warn": "#7f560b",
      "deny": "#ad2a23",
      "bypass": "#b0065f",
      "glitch-a": "#b0065f",
      "glitch-b": "#08666c",
      "on-accent": "#f2f4f5"
    }
  },
  "font": {
    "display": "\"Doto\", var(--gs-font-mono)",
    "ui": "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Segoe UI\", system-ui, sans-serif",
    "label": "\"Avenir Next Condensed\", \"SF Compact Text\", \"Arial Narrow\", var(--gs-font-ui)",
    "mono": "ui-monospace, \"SF Mono\", \"Cascadia Code\", \"JetBrains Mono\", Menlo, monospace"
  },
  "size": {
    "label": "11px",
    "mono": "12px",
    "body": "13px",
    "title": "18px",
    "wordmark": "34px"
  },
  "tracking": {
    "label": "0.08em"
  },
  "space": {
    "1": "4px",
    "2": "8px",
    "3": "12px",
    "4": "16px",
    "5": "24px",
    "6": "40px"
  },
  "radius": {
    "control": "4px",
    "panel": "8px",
    "pill": "999px"
  },
  "bare": {
    "border": "1px solid var(--gs-color-hairline)",
    "bar": "3px"
  },
  "motion": {
    "sprite": "800ms",
    "cut": "0ms",
    "glitch": "180ms",
    "mosh": "420ms",
    "flare": "640ms",
    "hover": "80ms",
    "decode": "250ms",
    "ambient-min": "20s",
    "ambient-max": "40s"
  },
  "step": {
    "sprite": "steps(4)",
    "glitch": "steps(3)",
    "mosh": "steps(6)",
    "flare": "steps(8)",
    "decode": "steps(6)"
  },
  "ease": {
    "hover": "ease-out"
  },
  "status": {
    "idle": "text-faint",
    "working": "accent",
    "ok": "ok",
    "warn": "warn",
    "deny": "deny",
    "bypass": "bypass",
    "crash": "bypass"
  },
  "kaomoji": {
    "idle": "(｡◕‿↼)",
    "working": "(¬‿¬)",
    "ok": "(｡◕‿↼)",
    "warn": "(¬_¬)",
    "deny": ">:[",
    "bypass": ">:D",
    "crash": "XX"
  },
  "contrast": {
    "minimum": 4.5,
    "textOn": {
      "void": ["text", "text-muted", "accent", "ok", "warn", "deny", "bypass"],
      "surface": ["text", "text-muted", "accent", "ok", "warn", "deny", "bypass"],
      "raised": ["text", "text-muted", "accent", "ok", "warn"],
      "accent": ["on-accent"],
      "deny": ["on-accent"]
    },
    "neverText": ["text-faint", "hairline", "etch", "accent-dim"]
  }
}
```

the `bare` group emits `--gs-border` and `--gs-bar` with no group segment, because those are the names the spec uses. `status` maps each status to the color token that stands for it on dots and bars; `idle` is `text-faint` (spec 3.1: idle dots only) and `crash` is `bypass` (spec 3.1: crash accents). `working` is `accent` since activity is the persona doing something. glitch colors are not in `neverText` because `fx.css` paints the glitch slice pseudo-layers with them.

- [ ] **Step 2: write the failing tokens test**

`test/unit/tokens.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTokens, toCss } from '../../scripts/lib/tokens.js';

test('loadTokens returns both themes with the same keys', async () => {
  const t = await loadTokens();
  assert.deepEqual(Object.keys(t.color.dark), Object.keys(t.color.light));
  assert.equal(t.color.dark.accent, '#0ec224');
  assert.equal(t.color.light.accent, '#08701a');
  assert.equal(t.contrast.minimum, 4.5);
});

test('toCss emits :root dark, a light block and a reduced-motion block', async () => {
  const css = toCss(await loadTokens());
  assert.match(css, /^:root \{/m);
  assert.match(css, /--gs-color-void: #050505;/);
  assert.match(css, /:root\[data-theme="light"\] \{[^}]*--gs-color-void: #f2f4f5;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /data-app/);
});

test('toCss emits every token group with the gs- prefix', async () => {
  const css = toCss(await loadTokens());
  for (const name of [
    '--gs-font-display', '--gs-font-mono', '--gs-size-label', '--gs-tracking-label',
    '--gs-space-1', '--gs-space-6', '--gs-radius-pill', '--gs-border', '--gs-bar',
    '--gs-motion-sprite', '--gs-motion-decode', '--gs-motion-ambient-min', '--gs-motion-ambient-max',
    '--gs-step-decode', '--gs-ease-hover',
  ]) assert.match(css, new RegExp(`${name}: `), name);
  assert.match(css, /--gs-border: 1px solid var\(--gs-color-hairline\);/);
});

test('status aliases point at their tokens and skip same-name statuses', async () => {
  const css = toCss(await loadTokens());
  assert.match(css, /--gs-color-idle: var\(--gs-color-text-faint\);/);
  assert.match(css, /--gs-color-working: var\(--gs-color-accent\);/);
  assert.match(css, /--gs-color-crash: var\(--gs-color-bypass\);/);
  assert.doesNotMatch(css, /--gs-color-ok: var\(--gs-color-ok\)/);
});

test('reduced motion zeroes every motion token and forces glitch 0', async () => {
  const t = await loadTokens();
  const css = toCss(t);
  const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  for (const name of Object.keys(t.motion)) assert.match(block, new RegExp(`--gs-motion-${name}: 0ms;`));
  assert.match(block, /--gs-glitch-forced: 0;/);
  assert.doesNotMatch(css.slice(0, css.indexOf('@media')), /--gs-glitch-forced/);
});

test('generated css carries no timestamp', async () => {
  const css = toCss(await loadTokens());
  assert.doesNotMatch(css, /20\d\d-\d\d-\d\d/);
});
```

- [ ] **Step 3: run the test to see it fail**

Run: `cd /Volumes/T7/ghost-signal && node --test test/unit/tokens.test.js`

Expected: fails with `Cannot find module '.../scripts/lib/tokens.js'`.

- [ ] **Step 4: write scripts/lib/tokens.js (css half)**

```js
// tokens.json is the source. every function here is pure: same object in, same string out,
// no dates, no env. ci diffs the outputs, so a timestamp would fail every build >:[
import { readFile } from 'node:fs/promises';

export const TOKENS_PATH = new URL('../../tokens.json', import.meta.url);
export const HEADER = 'generated from tokens.json by scripts/gen.js. do not edit';

export async function loadTokens(path = TOKENS_PATH) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function colorLines(theme) {
  return Object.entries(theme).map(([k, v]) => `  --gs-color-${k}: ${v};`);
}

function groupLines(prefix, group) {
  return Object.entries(group).map(([k, v]) => `  --gs-${prefix}${k}: ${v};`);
}

export function toCss(t) {
  const root = [
    ...colorLines(t.color.dark),
    ...Object.entries(t.status)
      .filter(([status, token]) => status !== token)
      .map(([status, token]) => `  --gs-color-${status}: var(--gs-color-${token});`),
    ...groupLines('font-', t.font),
    ...groupLines('size-', t.size),
    ...groupLines('tracking-', t.tracking),
    ...groupLines('space-', t.space),
    ...groupLines('radius-', t.radius),
    ...groupLines('', t.bare),
    ...groupLines('motion-', t.motion),
    ...groupLines('step-', t.step),
    ...groupLines('ease-', t.ease),
  ];
  const light = colorLines(t.color.light);
  const reduced = [
    ...Object.keys(t.motion).map((k) => `    --gs-motion-${k}: 0ms;`),
    '    --gs-glitch-forced: 0;',
  ];
  return [
    `/* ${HEADER} */`,
    ':root {', ...root, '}',
    '',
    ':root[data-theme="light"] {', ...light, '}',
    '',
    '@media (prefers-reduced-motion: reduce) {',
    '  :root {', ...reduced, '  }',
    '}',
    '',
  ].join('\n');
}
```

- [ ] **Step 5: run the test to see it pass**

Run: `cd /Volumes/T7/ghost-signal && node --test test/unit/tokens.test.js`

Expected: `# pass 6`, `# fail 0`.

- [ ] **Step 6: write scripts/gen.js and generate tokens.css**

```js
#!/usr/bin/env node
// writes every generated file. later tasks add outputs here; nothing else writes into gen/ or src/tokens.css
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadTokens, toCss } from './lib/tokens.js';

const root = fileURLToPath(new URL('..', import.meta.url));

export async function generate() {
  const tokens = await loadTokens();
  await mkdir(`${root}gen`, { recursive: true });
  const outputs = [
    ['src/tokens.css', toCss(tokens)],
  ];
  for (const [rel, body] of outputs) {
    await writeFile(`${root}${rel}`, body);
    process.stdout.write(`wrote ${rel}\n`);
  }
}

generate().catch((err) => {
  process.stderr.write(`gen: ${err.stack}\n`);
  process.exit(1);
});
```

Run: `cd /Volumes/T7/ghost-signal && npm run gen && head -5 src/tokens.css`

Expected: `wrote src/tokens.css`, then the header comment, `:root {` and `--gs-color-void: #050505;`.

- [ ] **Step 7: commit**

```bash
cd /Volumes/T7/ghost-signal
git add tokens.json scripts/lib/tokens.js scripts/gen.js src/tokens.css test/unit/tokens.test.js
git commit -m "feat(tokens): author tokens.json and generate tokens.css" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### task 3: swift, rust and markdown outputs

**Files:**
- Modify: `scripts/lib/tokens.js` (append `toSwift`, `toRust`, `toMarkdown`), `scripts/gen.js` (three more outputs)
- Create: `gen/GhostSignal.swift`, `gen/ghost_signal.rs`, `gen/tokens.md` (generated)
- Test: `test/unit/gen.test.js`

**Interfaces:**
- Consumes: `loadTokens`, `toCss`, `HEADER` from task 2.
- Produces: `toSwift(tokens): string`, `toRust(tokens): string`, `toMarkdown(tokens): string`. rust consumers get `ghost_signal::dark::ACCENT`, `ghost_signal::light::ACCENT`, `ghost_signal::Status::{Idle, ..}` with `.color()`, `.color_light()`, `.kaomoji()`, `.name()`, `Status::ALL`. swift consumers get `GhostSignal.dark.accent`, `GhostSignal.light.accent`, `GhostSignal.Fonts.wordmark`, `GhostSignal.Space.s1`, `GhostSignal.Status`.

- [ ] **Step 1: write the failing generator test**

`test/unit/gen.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTokens, toSwift, toRust, toMarkdown } from '../../scripts/lib/tokens.js';

test('toRust emits Color::Rgb consts per theme and a Status enum', async () => {
  const rs = toRust(await loadTokens());
  assert.match(rs, /pub mod dark \{/);
  assert.match(rs, /pub mod light \{/);
  assert.match(rs, /pub const ACCENT: Color = Color::Rgb\(14, 194, 36\);/);
  assert.match(rs, /pub const TEXT_MUTED: Color = Color::Rgb\(142, 147, 150\);/);
  assert.match(rs, /pub const ACCENT: Color = Color::Rgb\(8, 112, 26\);/);
  assert.match(rs, /pub enum Status \{\s*Idle,\s*Working,\s*Ok,\s*Warn,\s*Deny,\s*Bypass,\s*Crash,?\s*\}/);
  assert.match(rs, /pub fn color\(self\) -> Color/);
  assert.match(rs, /pub fn color_light\(self\) -> Color/);
  assert.match(rs, /pub fn kaomoji\(self\) -> &'static str/);
  assert.match(rs, /Status::Crash => dark::BYPASS/);
  assert.match(rs, /Status::Deny => ">:\["/);
  assert.match(rs, /pub const SPACE: \[u16; 6\] = \[4, 8, 12, 16, 24, 40\];/);
  assert.doesNotMatch(rs, /20\d\d-\d\d-\d\d/);
});

test('toSwift emits a GhostSignal enum with Theme, Fonts and Status', async () => {
  const swift = toSwift(await loadTokens());
  assert.match(swift, /public enum GhostSignal \{/);
  assert.match(swift, /public struct Theme \{/);
  assert.match(swift, /public static let dark = Theme\(/);
  assert.match(swift, /public static let light = Theme\(/);
  assert.match(swift, /accent: Color\(\.sRGB, red: 0\.0549, green: 0\.7608, blue: 0\.1412, opacity: 1\)/);
  assert.match(swift, /textMuted: Color\(/);
  assert.match(swift, /public static let wordmark = Font\.custom\("Doto", size: 34\)\.weight\(\.black\)/);
  assert.match(swift, /public static let s1: CGFloat = 4/);
  assert.match(swift, /public enum Status: String, CaseIterable \{/);
  assert.match(swift, /case \.crash: return theme\.bypass/);
  assert.match(swift, /case \.bypass: return ">:D"/);
});

test('toMarkdown lists both themes and every group', async () => {
  const md = toMarkdown(await loadTokens());
  assert.match(md, /^# ghost signal tokens/m);
  assert.match(md, /\| `--gs-color-accent` \| `#0ec224` \| `#08701a` \|/);
  assert.match(md, /\| `--gs-motion-decode` \| `250ms` \|/);
  assert.match(md, /\| `idle` \| `text-faint` \| `\(｡◕‿↼\)` \|/);
  assert.doesNotMatch(md, /\u2014/);
});
```

- [ ] **Step 2: run the test to see it fail**

Run: `cd /Volumes/T7/ghost-signal && node --test test/unit/gen.test.js`

Expected: fails with `toRust is not a function` (or `does not provide an export named 'toRust'`).

- [ ] **Step 3: append the three generators to scripts/lib/tokens.js**

```js
const STATUS_ORDER = ['idle', 'working', 'ok', 'warn', 'deny', 'bypass', 'crash'];

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const upperSnake = (k) => k.replace(/-/g, '_').toUpperCase();
const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const pascal = (k) => k[0].toUpperCase() + k.slice(1);
const rustLit = (s) => JSON.stringify(s);
const swiftLit = (s) => JSON.stringify(s);

export function toRust(t) {
  const mod = (name, theme) => [
    `pub mod ${name} {`,
    '    use super::Color;',
    ...Object.entries(theme).map(([k, v]) => {
      const [r, g, b] = hexToRgb(v);
      return `    pub const ${upperSnake(k)}: Color = Color::Rgb(${r}, ${g}, ${b});`;
    }),
    '}',
  ];
  const arm = (fn) => STATUS_ORDER.map((s) => `            Status::${pascal(s)} => ${fn(s)},`);
  const space = Object.values(t.space).map((v) => parseInt(v, 10));
  return [
    `// ${HEADER}`,
    '#![allow(dead_code)]',
    '',
    'use ratatui::style::Color;',
    '',
    ...mod('dark', t.color.dark),
    '',
    ...mod('light', t.color.light),
    '',
    `pub const SPACE: [u16; ${space.length}] = [${space.join(', ')}];`,
    '',
    '#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]',
    'pub enum Status {',
    ...STATUS_ORDER.map((s) => `    ${pascal(s)},`),
    '}',
    '',
    'impl Status {',
    `    pub const ALL: [Status; ${STATUS_ORDER.length}] = [${STATUS_ORDER.map((s) => `Status::${pascal(s)}`).join(', ')}];`,
    '',
    '    pub fn color(self) -> Color {',
    '        match self {',
    ...arm((s) => `dark::${upperSnake(t.status[s])}`),
    '        }',
    '    }',
    '',
    '    pub fn color_light(self) -> Color {',
    '        match self {',
    ...arm((s) => `light::${upperSnake(t.status[s])}`),
    '        }',
    '    }',
    '',
    "    pub fn kaomoji(self) -> &'static str {",
    '        match self {',
    ...arm((s) => rustLit(t.kaomoji[s])),
    '        }',
    '    }',
    '',
    "    pub fn name(self) -> &'static str {",
    '        match self {',
    ...arm((s) => rustLit(s)),
    '        }',
    '    }',
    '}',
    '',
  ].join('\n');
}

export function toSwift(t) {
  const names = Object.keys(t.color.dark);
  const color = (hex) => {
    const [r, g, b] = hexToRgb(hex).map((c) => (c / 255).toFixed(4));
    return `Color(.sRGB, red: ${r}, green: ${g}, blue: ${b}, opacity: 1)`;
  };
  const theme = (label, values) => [
    `    public static let ${label} = Theme(`,
    ...names.map((k, i) => `        ${camel(k)}: ${color(values[k])}${i < names.length - 1 ? ',' : ''}`),
    '    )',
  ];
  const px = (v) => parseInt(v, 10);
  return [
    `// ${HEADER}`,
    'import SwiftUI',
    '',
    'public enum GhostSignal {',
    '    public struct Theme {',
    ...names.map((k) => `        public let ${camel(k)}: Color`),
    '    }',
    '',
    ...theme('dark', t.color.dark),
    '',
    ...theme('light', t.color.light),
    '',
    '    public enum Fonts {',
    `        public static let wordmark = Font.custom("Doto", size: ${px(t.size.wordmark)}).weight(.black)`,
    `        public static let title = Font.system(size: ${px(t.size.title)}, weight: .semibold)`,
    `        public static let body = Font.system(size: ${px(t.size.body)})`,
    `        public static let label = Font.system(size: ${px(t.size.label)}).smallCaps()`,
    `        public static let mono = Font.system(size: ${px(t.size.mono)}, design: .monospaced)`,
    '    }',
    '',
    '    public enum Space {',
    ...Object.entries(t.space).map(([k, v]) => `        public static let s${k}: CGFloat = ${px(v)}`),
    '    }',
    '',
    '    public enum Radius {',
    ...Object.entries(t.radius).map(([k, v]) => `        public static let ${k}: CGFloat = ${px(v)}`),
    '    }',
    '',
    '    public enum Status: String, CaseIterable {',
    `        case ${STATUS_ORDER.join(', ')}`,
    '',
    '        public func color(_ theme: Theme) -> Color {',
    '            switch self {',
    ...STATUS_ORDER.map((s) => `            case .${s}: return theme.${camel(t.status[s])}`),
    '            }',
    '        }',
    '',
    '        public var kaomoji: String {',
    '            switch self {',
    ...STATUS_ORDER.map((s) => `            case .${s}: return ${swiftLit(t.kaomoji[s])}`),
    '            }',
    '        }',
    '    }',
    '}',
    '',
  ].join('\n');
}

export function toMarkdown(t) {
  const row = (...cells) => `| ${cells.join(' | ')} |`;
  const group = (title, prefix, obj) => [
    `## ${title}`, '', row('token', 'value'), row('---', '---'),
    ...Object.entries(obj).map(([k, v]) => row(`\`--gs-${prefix}${k}\``, `\`${v}\``)), '',
  ];
  return [
    '# ghost signal tokens', '',
    `${HEADER}.`, '',
    '## color', '', row('token', 'dark', 'light'), row('---', '---', '---'),
    ...Object.keys(t.color.dark).map((k) => row(`\`--gs-color-${k}\``, `\`${t.color.dark[k]}\``, `\`${t.color.light[k]}\``)), '',
    '## status', '', row('status', 'color token', 'kaomoji'), row('---', '---', '---'),
    ...STATUS_ORDER.map((s) => row(`\`${s}\``, `\`${t.status[s]}\``, `\`${t.kaomoji[s]}\``)), '',
    ...group('font', 'font-', t.font),
    ...group('size', 'size-', t.size),
    ...group('tracking', 'tracking-', t.tracking),
    ...group('space', 'space-', t.space),
    ...group('radius', 'radius-', t.radius),
    ...group('bare', '', t.bare),
    ...group('motion', 'motion-', t.motion),
    ...group('step', 'step-', t.step),
    ...group('ease', 'ease-', t.ease),
    '## contrast', '',
    `minimum ratio ${t.contrast.minimum}:1. text tokens allowed per background:`, '',
    ...Object.entries(t.contrast.textOn).map(([bg, fgs]) => `- \`${bg}\`: ${fgs.map((f) => `\`${f}\``).join(', ')}`),
    '', `never text: ${t.contrast.neverText.map((f) => `\`${f}\``).join(', ')}`, '',
  ].join('\n');
}
```

- [ ] **Step 4: run the test to see it pass**

Run: `cd /Volumes/T7/ghost-signal && node --test test/unit/gen.test.js`

Expected: `# pass 3`, `# fail 0`.

- [ ] **Step 5: wire the outputs into scripts/gen.js**

replace the import and the `outputs` array:

```js
import { loadTokens, toCss, toSwift, toRust, toMarkdown } from './lib/tokens.js';
```

```js
  const outputs = [
    ['src/tokens.css', toCss(tokens)],
    ['gen/GhostSignal.swift', toSwift(tokens)],
    ['gen/ghost_signal.rs', toRust(tokens)],
    ['gen/tokens.md', toMarkdown(tokens)],
  ];
```

Run: `cd /Volumes/T7/ghost-signal && npm run gen && npm run gen && git status --porcelain gen src/tokens.css`

Expected: four `wrote` lines twice; the status output lists the three new `gen/` files as untracked (`??`) and nothing modified, proving the generator is idempotent.

- [ ] **Step 6: commit**

```bash
cd /Volumes/T7/ghost-signal
git add scripts/lib/tokens.js scripts/gen.js gen/GhostSignal.swift gen/ghost_signal.rs gen/tokens.md test/unit/gen.test.js
git commit -m "feat(gen): emit swift, rust and markdown token outputs" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### task 4: contrast checker

**Files:**
- Create: `scripts/lib/contrast.js`, `scripts/check-contrast.js`
- Test: `test/unit/contrast.test.js`

**Interfaces:**
- Consumes: `loadTokens` from task 2 and the `contrast` block of `tokens.json`.
- Produces: `hexToRgb(hex): [r, g, b]`, `luminance(hex): number`, `ratio(a, b): number >= 1`, `checkTokens(tokens): Array<{ theme, fg, bg, ratio }>` (failures only), `scanCss(css, tokens): Array<{ selector, token, reason }>` (failures only). task 5's css test and task 14's flavor check both import from here.

- [ ] **Step 1: write the failing contrast test**

`test/unit/contrast.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTokens } from '../../scripts/lib/tokens.js';
import { hexToRgb, luminance, ratio, checkTokens, scanCss } from '../../scripts/lib/contrast.js';

test('luminance and ratio match the wcag reference points', () => {
  assert.deepEqual(hexToRgb('#ff5c4d'), [255, 92, 77]);
  assert.equal(luminance('#000000'), 0);
  assert.equal(luminance('#ffffff'), 1);
  assert.equal(ratio('#000000', '#ffffff'), 21);
  assert.equal(ratio('#ffffff', '#000000'), 21);
  assert.ok(Math.abs(ratio('#eef1f2', '#050505') - 17.9) < 0.2);
  assert.throws(() => hexToRgb('#fff'), /6 hex digits/);
});

test('checkTokens passes the shipped tokens in both themes', async () => {
  assert.deepEqual(checkTokens(await loadTokens()), []);
});

test('checkTokens reports an injected failure with its ratio', async () => {
  const t = await loadTokens();
  t.color.light.warn = '#c8b070';
  const failures = checkTokens(t);
  assert.equal(failures.length, 3);
  assert.deepEqual(failures.map((f) => f.bg), ['void', 'surface', 'raised']);
  assert.equal(failures[0].theme, 'light');
  assert.equal(failures[0].fg, 'warn');
  assert.ok(failures[0].ratio < 4.5);
});

test('scanCss flags neverText tokens used as color', async () => {
  const t = await loadTokens();
  const css = '.a { color: var(--gs-color-text-faint); }\n.b { color: var(--gs-color-text); }';
  const out = scanCss(css, t);
  assert.equal(out.length, 1);
  assert.equal(out[0].selector, '.a');
  assert.equal(out[0].token, 'text-faint');
});

test('scanCss flags text not allowed on a raised background', async () => {
  const t = await loadTokens();
  const bad = '.x { background-color: var(--gs-color-raised); color: var(--gs-color-deny); }';
  const good = '.y { background: var(--gs-color-raised); color: var(--gs-color-text); }';
  assert.equal(scanCss(bad, t).length, 1);
  assert.equal(scanCss(bad, t)[0].reason, 'not allowed as text on raised');
  assert.deepEqual(scanCss(good, t), []);
});

test('scanCss sees rules nested in @media and skips @font-face', async () => {
  const t = await loadTokens();
  const css = '@font-face { font-family: "Doto"; }\n@media (hover: hover) { .z { color: var(--gs-color-etch); } }';
  const out = scanCss(css, t);
  assert.equal(out.length, 1);
  assert.equal(out[0].selector, '.z');
});
```

- [ ] **Step 2: run the test to see it fail**

Run: `cd /Volumes/T7/ghost-signal && node --test test/unit/contrast.test.js`

Expected: fails with `Cannot find module '.../scripts/lib/contrast.js'`.

- [ ] **Step 3: write scripts/lib/contrast.js**

```js
// wcag 2.x relative luminance and contrast ratio. the checker is the authority:
// if a token fails here the token changes, never the threshold (¬_¬)

export function hexToRgb(hex) {
  if (/^#[0-9a-f]{6}$/i.test(hex) === false) throw new TypeError(`expected #rrggbb with 6 hex digits, got ${hex}`);
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function channel(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function ratio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function checkTokens(tokens) {
  const failures = [];
  const min = tokens.contrast.minimum;
  for (const theme of Object.keys(tokens.color)) {
    const palette = tokens.color[theme];
    for (const [bg, fgs] of Object.entries(tokens.contrast.textOn)) {
      for (const fg of fgs) {
        if (palette[fg] === undefined || palette[bg] === undefined) {
          throw new RangeError(`contrast.textOn names an unknown token: ${fg} on ${bg}`);
        }
        const r = ratio(palette[fg], palette[bg]);
        if (r < min) failures.push({ theme, fg, bg, ratio: Number(r.toFixed(2)) });
      }
    }
  }
  return failures;
}

// minimal css rule walker: enough for our own two files. handles nested @media,
// skips at-rules with declaration bodies (@font-face, @keyframes percent blocks are kept).
export function cssRules(css) {
  const out = [];
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const stack = [];
  let buf = '';
  for (const ch of src) {
    if (ch === '{') {
      stack.push(buf.trim());
      buf = '';
    } else if (ch === '}') {
      const selector = stack.pop();
      if (selector !== undefined && selector.startsWith('@') === false && buf.trim() !== '') {
        out.push({ selector, body: buf });
      }
      buf = '';
    } else {
      buf += ch;
    }
  }
  return out;
}

function declarations(body) {
  return body.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const i = d.indexOf(':');
    return { property: d.slice(0, i).trim(), value: d.slice(i + 1).trim() };
  });
}

const TOKEN_RE = /var\(--gs-color-([a-z0-9-]+)\)/;

export function scanCss(css, tokens) {
  const failures = [];
  const never = new Set(tokens.contrast.neverText);
  const onRaised = new Set(tokens.contrast.textOn.raised);
  for (const { selector, body } of cssRules(css)) {
    const decls = declarations(body);
    const bgDecl = decls.find((d) => d.property === 'background-color' || d.property === 'background');
    const bgToken = bgDecl?.value.match(TOKEN_RE)?.[1];
    for (const d of decls) {
      if (d.property !== 'color') continue;
      const token = d.value.match(TOKEN_RE)?.[1];
      if (token === undefined) continue;
      if (never.has(token)) failures.push({ selector, token, reason: 'never a text color' });
      else if (bgToken === 'raised' && onRaised.has(token) === false) failures.push({ selector, token, reason: 'not allowed as text on raised' });
    }
  }
  return failures;
}
```

- [ ] **Step 4: run the test to see it pass**

Run: `cd /Volumes/T7/ghost-signal && node --test test/unit/contrast.test.js`

Expected: `# pass 6`, `# fail 0`.

- [ ] **Step 5: write scripts/check-contrast.js**

```js
#!/usr/bin/env node
// exits 1 with one line per failure. exit 0 means every allowed pair clears 4.5:1
// and neither css file uses a forbidden text token. exits 2 if it cannot evaluate.
import { readFile } from 'node:fs/promises';
import { loadTokens } from './lib/tokens.js';
import { checkTokens, scanCss } from './lib/contrast.js';

const root = new URL('..', import.meta.url);

async function main() {
  // an optional path lets a test point the checker at a deliberately broken copy
  const tokens = await loadTokens(process.argv[2] ?? undefined);
  const lines = [];
  for (const f of checkTokens(tokens)) {
    lines.push(`tokens: ${f.theme} ${f.fg} on ${f.bg} is ${f.ratio}:1, needs ${tokens.contrast.minimum}:1`);
  }
  for (const file of ['src/base.css', 'src/fx.css']) {
    const css = await readFile(new URL(file, root), 'utf8').catch(() => null);
    if (css === null) continue;
    for (const f of scanCss(css, tokens)) lines.push(`${file}: ${f.selector} uses ${f.token}: ${f.reason}`);
  }
  if (lines.length > 0) {
    process.stdout.write(`${lines.join('\n')}\n`);
    process.exit(1);
  }
  process.stdout.write('contrast ok\n');
}

main().catch((err) => {
  process.stderr.write(`check-contrast: ${err.stack}\n`);
  process.exit(2);
});
```

`base.css` and `fx.css` do not exist until task 5; the checker skips missing files rather than failing, so `npm run check` is green from this task on.

Run: `cd /Volumes/T7/ghost-signal && npm run check; echo "exit $?"`

Expected: `contrast ok` then `exit 0`.

- [ ] **Step 6: prove the non-zero path with an injected failure**

Run:

```bash
cd /Volumes/T7/ghost-signal
node -e "
const fs=require('fs');const t=JSON.parse(fs.readFileSync('tokens.json','utf8'));
t.color.dark['text-muted']='#4a4d50';fs.mkdirSync('test-results',{recursive:true});
fs.writeFileSync('test-results/bad-tokens.json',JSON.stringify(t))"
node scripts/check-contrast.js test-results/bad-tokens.json; echo "exit $?"
```

Expected: three lines starting `tokens: dark text-muted on void`, `... on surface`, `... on raised`, then `exit 1`. `test-results/` is gitignored, so the broken copy never touches the real `tokens.json`.

- [ ] **Step 7: commit**

```bash
cd /Volumes/T7/ghost-signal
git add scripts/lib/contrast.js scripts/check-contrast.js test/unit/contrast.test.js
git commit -m "feat(contrast): wcag checker over token pairs and css text rules" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### task 5: doto font, base.css and fx.css

**Files:**
- Create: `scripts/fetch-doto.sh`, `src/fonts/Doto-VariableFont.woff2`, `src/fonts/OFL.txt`, `src/fonts/SOURCE`, `src/base.css`, `src/fx.css`
- Modify: `README.md` (font provenance section)
- Test: `test/unit/css.test.js`

**Interfaces:**
- Consumes: `loadTokens` (task 2), `scanCss` (task 4), the custom property names from task 2.
- Produces: every selector later components rely on. `base.css` is complete after this task; later tasks do not edit it. component element rules (`gs-window`, `gs-toast`, `gs-row`, `gs-palette`, `gs-tape`, `gs-empty`, `gs-error`, `gs-splash`, `gs-decode`, `gs-face`, `gs-mosaic`, `gs-wallpaper`) are all here, keyed on attributes the components set: `[part="..."]`, `data-status`, `open`, `aria-expanded`, `aria-selected`, `data-playing`.

- [ ] **Step 1: write scripts/fetch-doto.sh and run it once**

```bash
#!/usr/bin/env bash
# fetches doto at a pinned upstream commit and converts the variable ttf to woff2.
# the woff2 is committed; re-run only to bump DOTO_SHA. nothing runs at build or consume time.
set -euo pipefail

DOTO_SHA="1c587f2eed62cb257055540ac2a15f356070414f"
BASE="https://raw.githubusercontent.com/oliverlalan/Doto/${DOTO_SHA}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$HERE/src/fonts"
WORK="$(mktemp -d "$HERE/.doto.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$OUT"
curl -fsSL "$BASE/fonts/variable/Doto%5BROND%2Cwght%5D.ttf" -o "$WORK/Doto.ttf"
curl -fsSL "$BASE/OFL.txt" -o "$OUT/OFL.txt"
uvx --with brotli --from fonttools fonttools ttLib.woff2 compress -o "$OUT/Doto-VariableFont.woff2" "$WORK/Doto.ttf"
printf 'oliverlalan/Doto %s fonts/variable/Doto[ROND,wght].ttf\n' "$DOTO_SHA" > "$OUT/SOURCE"
printf 'wrote %s\n' "$OUT/Doto-VariableFont.woff2"
```

Run: `cd /Volumes/T7/ghost-signal && chmod +x scripts/fetch-doto.sh && ./scripts/fetch-doto.sh && ls -la src/fonts && head -3 src/fonts/OFL.txt`

Expected: `wrote .../src/fonts/Doto-VariableFont.woff2`; the listing shows `Doto-VariableFont.woff2` (tens of kilobytes), `OFL.txt`, `SOURCE`; the OFL head reads `Copyright 2024 The Doto Project Authors` (or the upstream year) and mentions `SIL OPEN FONT LICENSE`. the upstream path has brackets and a comma, hence the percent-encoding in the url.

append to `README.md`:

```markdown

## font

doto is bundled as `src/fonts/Doto-VariableFont.woff2`, converted from
`github.com/oliverlalan/Doto` at commit `1c587f2eed62cb257055540ac2a15f356070414f`
(`fonts/variable/Doto[ROND,wght].ttf`) with `scripts/fetch-doto.sh`. license: `src/fonts/OFL.txt`.
nothing is fetched at runtime.
```

- [ ] **Step 2: write the failing css test**

`test/unit/css.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { loadTokens } from '../../scripts/lib/tokens.js';
import { scanCss, cssRules } from '../../scripts/lib/contrast.js';

const src = new URL('../../src/', import.meta.url);
const base = await readFile(new URL('base.css', src), 'utf8');
const fx = await readFile(new URL('fx.css', src), 'utf8');

test('font-face points at the bundled doto file and nothing is fetched', async () => {
  assert.match(base, /@font-face\s*\{[^}]*font-family:\s*"Doto"/);
  assert.match(base, /src:\s*url\("\.\/fonts\/Doto-VariableFont\.woff2"\)\s*format\("woff2"\)/);
  assert.doesNotMatch(base, /https?:\/\//);
  assert.doesNotMatch((base + fx).replace(/url\("data:[^"]*"\)/g, ''), /googleapis|https?:\/\//);
  const info = await stat(new URL('fonts/Doto-VariableFont.woff2', src));
  assert.ok(info.size > 10_000);
});

test('every transition eases only color, border-color and background-color with the hover tokens', () => {
  const values = [...(base + fx).matchAll(/transition:\s*([^;]+);/g)].map((m) => m[1]);
  assert.ok(values.length >= 4);
  for (const v of values) {
    for (const part of v.split(',').map((p) => p.trim())) {
      assert.match(part, /^(color|border-color|background-color) var\(--gs-motion-hover\) var\(--gs-ease-hover\)$/, part);
    }
  }
});

test('no shadows, no blur, no glass', () => {
  for (const m of (base + fx).matchAll(/box-shadow:\s*([^;]+);/g)) assert.equal(m[1].trim(), 'none');
  assert.doesNotMatch(base + fx, /backdrop-filter|filter:\s*blur|blur\(/);
});

test('every animated selector in fx.css is gated on a glitch level', () => {
  const animated = cssRules(fx).filter((r) => /(^|;)\s*animation(-name)?:/.test(r.body));
  assert.ok(animated.length >= 5);
  for (const r of animated) {
    assert.ok(r.selector.includes('[data-glitch="1"]') || r.selector.includes('[data-glitch="2"]'), r.selector);
  }
});

test('base.css has no animation at all', () => {
  assert.doesNotMatch(base, /animation/);
});

test('the contrast scanner finds nothing in either file', async () => {
  const t = await loadTokens();
  assert.deepEqual(scanCss(base, t), []);
  assert.deepEqual(scanCss(fx, t), []);
});

test('the texture tokens live in fx.css as data uris and no hex appears outside them', () => {
  assert.match(fx, /--gs-dither:\s*url\("data:image\/svg\+xml,/);
  assert.match(fx, /--gs-dither-strong:/);
  assert.match(fx, /--gs-block-corner:\s*url\("data:image\/svg\+xml,/);
  const outsideUris = (base + fx).replace(/url\("data:[^"]*"\)/g, '');
  assert.doesNotMatch(outsideUris, /#[0-9a-f]{6}\b/i);
});
```

- [ ] **Step 3: run the test to see it fail**

Run: `cd /Volumes/T7/ghost-signal && node --test test/unit/css.test.js`

Expected: fails with `ENOENT ... src/base.css`.

- [ ] **Step 4: write src/base.css**

```css
/* ghost signal base layer. tokens come from tokens.css; this file authors no color value.
   easing exists only on the three properties below, only on hover and focus. everything else cuts (¬‿¬) */

@font-face {
  font-family: "Doto";
  src: url("./fonts/Doto-VariableFont.woff2") format("woff2");
  font-weight: 100 900;
  font-display: block;
}

*, *::before, *::after { box-sizing: border-box; }

html {
  background-color: var(--gs-color-void);
  color: var(--gs-color-text);
  font-family: var(--gs-font-ui);
  font-size: var(--gs-size-body);
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
}

body { margin: 0; }

::selection { background-color: var(--gs-color-accent); color: var(--gs-color-on-accent); }

/* the focus ring is one of the two glows the system allows. the other is the face */
:focus-visible { outline: 2px solid var(--gs-color-accent-bloom); outline-offset: 2px; }

* { scrollbar-width: thin; scrollbar-color: var(--gs-color-etch) var(--gs-color-void); }
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background-color: var(--gs-color-void); }
::-webkit-scrollbar-thumb { background-color: var(--gs-color-etch); border-radius: 0; }

a { color: var(--gs-color-accent); text-decoration: none; }
a:hover { color: var(--gs-color-accent-bloom); }

h1, h2, h3 { margin: 0 0 var(--gs-space-2); font-weight: 600; text-transform: lowercase; }
h2 { font-size: var(--gs-size-title); }
code, pre, kbd { font-family: var(--gs-font-mono); font-size: var(--gs-size-mono); }

button, input, select, textarea { font: inherit; color: inherit; margin: 0; }

button {
  font-family: var(--gs-font-ui);
  font-size: var(--gs-size-body);
  padding: var(--gs-space-1) var(--gs-space-3);
  border: 1px solid var(--gs-color-etch);
  border-radius: var(--gs-radius-control);
  background-color: var(--gs-color-surface);
  color: var(--gs-color-text);
  cursor: pointer;
  text-transform: lowercase;
  transition: color var(--gs-motion-hover) var(--gs-ease-hover), border-color var(--gs-motion-hover) var(--gs-ease-hover), background-color var(--gs-motion-hover) var(--gs-ease-hover);
}
button:hover { border-color: var(--gs-color-accent); }
button:disabled { cursor: not-allowed; color: var(--gs-color-text-muted); border-color: var(--gs-color-hairline); }
button[data-variant="primary"] { background-color: var(--gs-color-accent); border-color: var(--gs-color-accent); color: var(--gs-color-on-accent); }
button[data-variant="primary"]:hover { background-color: var(--gs-color-accent-bloom); border-color: var(--gs-color-accent-bloom); }
button[data-variant="ghost"] { background-color: transparent; border-color: transparent; color: var(--gs-color-text-muted); }
button[data-variant="ghost"]:hover { color: var(--gs-color-text); border-color: var(--gs-color-hairline); }
button[data-variant="danger"] { background-color: transparent; border-color: var(--gs-color-deny); color: var(--gs-color-deny); }
button[data-variant="danger"]:hover { background-color: var(--gs-color-deny); color: var(--gs-color-on-accent); }

input, select, textarea {
  font-family: var(--gs-font-mono);
  font-size: var(--gs-size-mono);
  padding: var(--gs-space-1) var(--gs-space-2);
  border: 1px solid var(--gs-color-etch);
  border-radius: var(--gs-radius-control);
  background-color: var(--gs-color-raised);
  color: var(--gs-color-text);
  transition: color var(--gs-motion-hover) var(--gs-ease-hover), border-color var(--gs-motion-hover) var(--gs-ease-hover), background-color var(--gs-motion-hover) var(--gs-ease-hover);
}
input::placeholder, textarea::placeholder { color: var(--gs-color-text-muted); }
input:hover, select:hover, textarea:hover { border-color: var(--gs-color-text-muted); }
input:focus-visible, select:focus-visible, textarea:focus-visible { border-color: var(--gs-color-accent); outline-offset: 0; }
select { appearance: none; padding-right: var(--gs-space-5); }
textarea { resize: vertical; min-height: 4em; }

.gs-panel {
  position: relative;
  background-color: var(--gs-color-surface);
  border: var(--gs-border);
  border-radius: var(--gs-radius-panel);
  padding: var(--gs-space-4);
}

.gs-label {
  font-family: var(--gs-font-label);
  font-size: var(--gs-size-label);
  letter-spacing: var(--gs-tracking-label);
  text-transform: lowercase;
  color: var(--gs-color-text-muted);
}

.gs-wordmark {
  font-family: var(--gs-font-display);
  font-weight: 900;
  font-size: var(--gs-size-wordmark);
  line-height: 1;
  letter-spacing: 0.02em;
  text-transform: lowercase;
  color: var(--gs-color-accent);
}

.gs-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--gs-space-1);
  padding: 2px var(--gs-space-2);
  font-family: var(--gs-font-label);
  font-size: var(--gs-size-label);
  letter-spacing: var(--gs-tracking-label);
  text-transform: lowercase;
  border: 1px solid currentColor;
  border-radius: var(--gs-radius-control);
  color: var(--gs-color-text-muted);
}
.gs-chip[data-status="working"] { color: var(--gs-color-working); }
.gs-chip[data-status="ok"] { color: var(--gs-color-ok); }
.gs-chip[data-status="warn"] { color: var(--gs-color-warn); }
.gs-chip[data-status="deny"] { color: var(--gs-color-deny); }
.gs-chip[data-status="bypass"] { color: var(--gs-color-bypass); }
.gs-chip[data-status="crash"] { color: var(--gs-color-crash); }

.gs-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: var(--gs-radius-pill);
  background-color: var(--gs-color-idle);
}
.gs-dot[data-status="working"] { background-color: var(--gs-color-working); }
.gs-dot[data-status="ok"] { background-color: var(--gs-color-ok); }
.gs-dot[data-status="warn"] { background-color: var(--gs-color-warn); }
.gs-dot[data-status="deny"] { background-color: var(--gs-color-deny); }
.gs-dot[data-status="bypass"] { background-color: var(--gs-color-bypass); }
.gs-dot[data-status="crash"] { background-color: var(--gs-color-crash); }

.gs-nav-item {
  display: flex;
  align-items: center;
  gap: var(--gs-space-2);
  padding: var(--gs-space-2) var(--gs-space-3);
  border-left: var(--gs-bar) solid transparent;
  color: var(--gs-color-text-muted);
  text-transform: lowercase;
  cursor: pointer;
  transition: color var(--gs-motion-hover) var(--gs-ease-hover), border-color var(--gs-motion-hover) var(--gs-ease-hover), background-color var(--gs-motion-hover) var(--gs-ease-hover);
}
.gs-nav-item:hover { color: var(--gs-color-text); background-color: var(--gs-color-surface); }
.gs-nav-item[aria-current="page"], .gs-nav-item[aria-current="true"] { border-left-color: var(--gs-color-accent); color: var(--gs-color-text); }

.gs-sticker {
  --gs-tilt: -2deg;
  display: inline-block;
  padding: var(--gs-space-1) var(--gs-space-2);
  border: 1px solid var(--gs-color-etch);
  background-color: var(--gs-color-raised);
  color: var(--gs-color-text);
  font-family: var(--gs-font-mono);
  font-size: var(--gs-size-mono);
  transform: rotate(var(--gs-tilt));
}

.gs-icon { width: 16px; height: 16px; fill: currentColor; vertical-align: -3px; }

/* components. light dom, so every rule is a plain attribute selector */

gs-mosaic, gs-face { display: inline-block; line-height: 0; }
gs-mosaic canvas { display: block; image-rendering: pixelated; }

gs-decode { display: inline; }
gs-decode[data-playing] { font-family: var(--gs-font-mono); }

gs-tape {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  padding: 2px 0;
  background-color: var(--gs-tape-color, var(--gs-color-bypass));
  color: var(--gs-color-on-accent);
  font-family: var(--gs-font-label);
  font-size: var(--gs-size-label);
  letter-spacing: var(--gs-tracking-label);
  text-transform: uppercase;
}
gs-tape [part="track"] { display: inline-block; }

gs-window { display: none; position: fixed; inset: 0; z-index: 100; }
gs-window[open] { display: block; }
gs-window [part="backdrop"] { position: absolute; inset: 0; background-color: var(--gs-color-void); opacity: 0.6; }
gs-window [part="frame"] {
  position: absolute;
  top: 20vh;
  left: 50%;
  transform: translateX(-50%);
  width: min(520px, calc(100vw - 2 * var(--gs-space-4)));
  background-color: var(--gs-color-surface);
  border: 1px solid var(--gs-color-etch);
  border-radius: var(--gs-radius-panel);
  overflow: hidden;
}
gs-window [part="titlebar"] {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--gs-space-2) var(--gs-space-3);
  background-color: var(--gs-color-raised);
  border-bottom: var(--gs-border);
  font-family: var(--gs-font-display);
  font-weight: 700;
  font-size: var(--gs-size-title);
  text-transform: lowercase;
  color: var(--gs-color-text);
}
gs-window [part="close"] { padding: 0 var(--gs-space-2); font-family: var(--gs-font-mono); line-height: 1.4; }
gs-window [part="body"] { padding: var(--gs-space-4); }

gs-toast { position: fixed; right: var(--gs-space-4); bottom: var(--gs-space-4); display: flex; flex-direction: column; gap: var(--gs-space-2); z-index: 90; width: min(360px, calc(100vw - 2 * var(--gs-space-4))); }
gs-toast [part="item"] {
  display: flex;
  align-items: center;
  gap: var(--gs-space-2);
  padding: var(--gs-space-2) var(--gs-space-3);
  border-left: var(--gs-bar) solid var(--gs-color-idle);
  background-color: var(--gs-color-raised);
  color: var(--gs-color-text);
  border-radius: 0 var(--gs-radius-control) var(--gs-radius-control) 0;
}
gs-toast [part="item"][data-status="working"] { border-left-color: var(--gs-color-working); }
gs-toast [part="item"][data-status="ok"] { border-left-color: var(--gs-color-ok); }
gs-toast [part="item"][data-status="warn"] { border-left-color: var(--gs-color-warn); }
gs-toast [part="item"][data-status="deny"] { border-left-color: var(--gs-color-deny); }
gs-toast [part="item"][data-status="bypass"] { border-left-color: var(--gs-color-bypass); }
gs-toast [part="item"][data-status="crash"] { border-left-color: var(--gs-color-crash); }
gs-toast [part="kaomoji"] { font-family: var(--gs-font-mono); color: var(--gs-color-text-muted); }
gs-toast [part="ok"] { margin-left: auto; }

gs-row { display: block; border-left: var(--gs-bar) solid var(--gs-color-idle); border-bottom: var(--gs-border); }
gs-row[status="working"] { border-left-color: var(--gs-color-working); }
gs-row[status="ok"] { border-left-color: var(--gs-color-ok); }
gs-row[status="warn"] { border-left-color: var(--gs-color-warn); }
gs-row[status="deny"] { border-left-color: var(--gs-color-deny); }
gs-row[status="bypass"] { border-left-color: var(--gs-color-bypass); }
gs-row[status="crash"] { border-left-color: var(--gs-color-crash); }
gs-row[status="loose"] { border-left-style: dashed; border-left-color: var(--gs-color-text-faint); }
gs-row [part="head"] {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--gs-space-3);
  padding: var(--gs-space-2) var(--gs-space-3);
  cursor: pointer;
  transition: color var(--gs-motion-hover) var(--gs-ease-hover), border-color var(--gs-motion-hover) var(--gs-ease-hover), background-color var(--gs-motion-hover) var(--gs-ease-hover);
}
gs-row [part="head"]:hover { background-color: var(--gs-color-surface); }
gs-row [part="sigil"] { font-family: var(--gs-font-mono); color: var(--gs-color-text-muted); min-width: 1.5em; }
gs-row [part="label"] { text-transform: lowercase; }
gs-row [part="command"] { font-family: var(--gs-font-mono); font-size: var(--gs-size-mono); color: var(--gs-color-text-muted); }
gs-row [part="detail"] { display: none; margin: 0 var(--gs-space-3) var(--gs-space-3) var(--gs-space-5); padding: var(--gs-space-3); background-color: var(--gs-color-raised); color: var(--gs-color-text); font-family: var(--gs-font-mono); font-size: var(--gs-size-mono); border-radius: var(--gs-radius-control); white-space: pre-wrap; }
gs-row [part="head"][aria-expanded="true"] + [part="detail"] { display: block; }

gs-palette { display: none; position: fixed; inset: 0; z-index: 110; }
gs-palette[open] { display: block; }
gs-palette [part="overlay"] { position: absolute; inset: 0; background-color: var(--gs-color-void); opacity: 0.6; }
gs-palette [part="box"] { position: absolute; top: 15vh; left: 50%; transform: translateX(-50%); width: min(560px, calc(100vw - 2 * var(--gs-space-4))); background-color: var(--gs-color-surface); border: 1px solid var(--gs-color-etch); border-radius: var(--gs-radius-panel); overflow: hidden; }
gs-palette [part="input"] { width: 100%; border: 0; border-bottom: var(--gs-border); border-radius: 0; padding: var(--gs-space-3); }
gs-palette [part="list"] { margin: 0; padding: var(--gs-space-1) 0; list-style: none; max-height: 40vh; overflow-y: auto; }
gs-palette [part="row"] { display: flex; justify-content: space-between; padding: var(--gs-space-1) var(--gs-space-3); cursor: pointer; text-transform: lowercase; }
gs-palette [part="row"][aria-selected="true"] { background-color: var(--gs-color-raised); color: var(--gs-color-text); }
gs-palette [part="row"] kbd { color: var(--gs-color-text-muted); }

gs-empty, gs-error, gs-splash {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 160px;
  padding: var(--gs-space-5);
  background-color: var(--gs-color-surface);
  border: var(--gs-border);
  border-radius: var(--gs-radius-panel);
  color: var(--gs-color-text-muted);
  text-align: center;
  overflow: hidden;
}
gs-error { color: var(--gs-color-deny); }
gs-empty > *, gs-error > *, gs-splash > * { position: relative; }
gs-wallpaper { display: block; position: absolute; inset: 0; z-index: 0; opacity: 0.35; pointer-events: none; }
gs-wallpaper gs-mosaic { position: absolute; top: 0; left: 0; }
```

- [ ] **Step 5: write src/fx.css**

```css
/* ghost signal fx layer. every animation is gated on :root[data-glitch="1"] or "2".
   under reduced motion the motion tokens are 0ms and gs.js forces data-glitch="0", so nothing here runs 👻 */

:root {
  --gs-dither: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4' shape-rendering='crispEdges'%3E%3Cg fill='%23fff'%3E%3Crect x='1' y='0' width='1' height='1' opacity='.5'/%3E%3Crect x='2' y='0' width='1' height='1' opacity='.125'/%3E%3Crect x='3' y='0' width='1' height='1' opacity='.625'/%3E%3Crect x='0' y='1' width='1' height='1' opacity='.75'/%3E%3Crect x='1' y='1' width='1' height='1' opacity='.25'/%3E%3Crect x='2' y='1' width='1' height='1' opacity='.875'/%3E%3Crect x='3' y='1' width='1' height='1' opacity='.375'/%3E%3Crect x='0' y='2' width='1' height='1' opacity='.1875'/%3E%3Crect x='1' y='2' width='1' height='1' opacity='.6875'/%3E%3Crect x='2' y='2' width='1' height='1' opacity='.0625'/%3E%3Crect x='3' y='2' width='1' height='1' opacity='.5625'/%3E%3Crect x='0' y='3' width='1' height='1' opacity='.9375'/%3E%3Crect x='1' y='3' width='1' height='1' opacity='.4375'/%3E%3Crect x='2' y='3' width='1' height='1' opacity='.8125'/%3E%3Crect x='3' y='3' width='1' height='1' opacity='.3125'/%3E%3C/g%3E%3C/svg%3E");
  --gs-dither-strong: var(--gs-dither);
  --gs-block-corner: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='6' shape-rendering='crispEdges' fill='%23fff'%3E%3Crect x='0' y='0' width='2' height='2'/%3E%3Crect x='4' y='0' width='2' height='2'/%3E%3Crect x='2' y='2' width='2' height='2'/%3E%3Crect x='0' y='4' width='2' height='2'/%3E%3Crect x='4' y='4' width='2' height='2'/%3E%3C/svg%3E");
}

/* the light canvas needs a dark dither or it vanishes */
:root[data-theme="light"] {
  --gs-dither: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4' shape-rendering='crispEdges'%3E%3Cg fill='%23000'%3E%3Crect x='1' y='0' width='1' height='1' opacity='.5'/%3E%3Crect x='2' y='0' width='1' height='1' opacity='.125'/%3E%3Crect x='3' y='0' width='1' height='1' opacity='.625'/%3E%3Crect x='0' y='1' width='1' height='1' opacity='.75'/%3E%3Crect x='1' y='1' width='1' height='1' opacity='.25'/%3E%3Crect x='2' y='1' width='1' height='1' opacity='.875'/%3E%3Crect x='3' y='1' width='1' height='1' opacity='.375'/%3E%3Crect x='0' y='2' width='1' height='1' opacity='.1875'/%3E%3Crect x='1' y='2' width='1' height='1' opacity='.6875'/%3E%3Crect x='2' y='2' width='1' height='1' opacity='.0625'/%3E%3Crect x='3' y='2' width='1' height='1' opacity='.5625'/%3E%3Crect x='0' y='3' width='1' height='1' opacity='.9375'/%3E%3Crect x='1' y='3' width='1' height='1' opacity='.4375'/%3E%3Crect x='2' y='3' width='1' height='1' opacity='.8125'/%3E%3Crect x='3' y='3' width='1' height='1' opacity='.3125'/%3E%3C/g%3E%3C/svg%3E");
}

/* dither overlays: static texture, no animation, allowed at every glitch level */
.gs-dither, .gs-dither-strong { position: relative; }
.gs-dither::before, .gs-dither-strong::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: var(--gs-dither);
  background-size: 4px 4px;
  opacity: 0.06;
}
.gs-dither-strong::before { background-image: var(--gs-dither-strong); opacity: 0.18; }

/* glitch slice: two clipped copies of the text in the glitch colors, displaced in 3 steps */
:root[data-glitch="1"] .gs-glitch, :root[data-glitch="2"] .gs-glitch {
  position: relative;
  animation: gs-glitch-shift var(--gs-motion-glitch) var(--gs-step-glitch) 1;
}
:root[data-glitch="1"] .gs-glitch::before, :root[data-glitch="2"] .gs-glitch::before,
:root[data-glitch="1"] .gs-glitch::after, :root[data-glitch="2"] .gs-glitch::after {
  content: attr(data-t);
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  background-color: inherit;
}
:root[data-glitch="1"] .gs-glitch::before, :root[data-glitch="2"] .gs-glitch::before {
  color: var(--gs-color-glitch-a);
  clip-path: inset(0 0 55% 0);
  animation: gs-glitch-a var(--gs-motion-glitch) var(--gs-step-glitch) 1;
}
:root[data-glitch="1"] .gs-glitch::after, :root[data-glitch="2"] .gs-glitch::after {
  color: var(--gs-color-glitch-b);
  clip-path: inset(45% 0 0 0);
  animation: gs-glitch-b var(--gs-motion-glitch) var(--gs-step-glitch) 1;
}
@keyframes gs-glitch-shift { 0% { transform: translateX(-2px); } 50% { transform: translateX(2px); } 100% { transform: translateX(0); } }
@keyframes gs-glitch-a { 0% { transform: translateX(-4px); } 50% { transform: translateX(3px); } 100% { transform: translateX(0); } }
@keyframes gs-glitch-b { 0% { transform: translateX(4px); } 50% { transform: translateX(-3px); } 100% { transform: translateX(0); } }

/* datamosh smear on crash: 6 hard steps of vertical slicing */
:root[data-glitch="1"] .gs-mosh, :root[data-glitch="2"] .gs-mosh {
  animation: gs-mosh var(--gs-motion-mosh) var(--gs-step-mosh) 1;
}
@keyframes gs-mosh {
  0% { clip-path: inset(0 0 0 0); transform: translate(0, 0); }
  20% { clip-path: inset(10% 0 60% 0); transform: translate(6px, 0); }
  40% { clip-path: inset(50% 0 20% 0); transform: translate(-5px, 0); }
  60% { clip-path: inset(30% 0 30% 0); transform: translate(3px, 0); }
  80% { clip-path: inset(70% 0 0 0); transform: translate(-2px, 0); }
  100% { clip-path: inset(0 0 0 0); transform: translate(0, 0); }
}

/* deny flare on a row: the bar and background flash in 8 steps */
:root[data-glitch="1"] .gs-flare, :root[data-glitch="2"] .gs-flare {
  animation: gs-flare var(--gs-motion-flare) var(--gs-step-flare) 1;
}
@keyframes gs-flare {
  0% { background-color: var(--gs-color-deny); }
  25% { background-color: transparent; }
  50% { background-color: var(--gs-color-deny); }
  100% { background-color: transparent; }
}

/* tape scroll: the track holds the text twice, so -50% is seamless. static at glitch 0 */
:root[data-glitch="1"] gs-tape [part="track"], :root[data-glitch="2"] gs-tape [part="track"] {
  animation: gs-tape-scroll calc(var(--gs-motion-sprite) * 12) steps(48) infinite;
}
@keyframes gs-tape-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }

/* corrupt corners: 6x6 block fragments masked in the glitch colors. opt-in per panel at 1, every panel at 2 */
.gs-panel[data-corrupt]::before, .gs-panel[data-corrupt]::after,
:root[data-glitch="2"] .gs-panel::before, :root[data-glitch="2"] .gs-panel::after {
  content: "";
  position: absolute;
  width: 12px;
  height: 12px;
  pointer-events: none;
  -webkit-mask-image: var(--gs-block-corner);
  mask-image: var(--gs-block-corner);
  -webkit-mask-size: 6px 6px;
  mask-size: 6px 6px;
}
.gs-panel[data-corrupt]::before, :root[data-glitch="2"] .gs-panel::before { top: -1px; left: -1px; background-color: var(--gs-color-glitch-a); }
.gs-panel[data-corrupt]::after, :root[data-glitch="2"] .gs-panel::after { right: -1px; bottom: -1px; background-color: var(--gs-color-glitch-b); }

/* glitch 2 only: chromatic hover split and the pixel hand */
:root[data-glitch="2"] button:hover, :root[data-glitch="2"] a:hover, :root[data-glitch="2"] .gs-nav-item:hover, :root[data-glitch="2"] gs-row [part="head"]:hover {
  text-shadow: -1px 0 var(--gs-color-glitch-a), 1px 0 var(--gs-color-glitch-b);
}
:root[data-glitch="2"] {
  cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' shape-rendering='crispEdges'%3E%3Cpath fill='%23000' d='M6 1h3v1h1v5h1v-1h2v1h1v1h1v5h-1v2h-1v1h-6v-1h-1v-2h-1v-2h-1v-3h2v1h1v-7h-1z'/%3E%3Cpath fill='%23fff' d='M7 2h1v7h1v-2h1v2h1v-1h1v1h1v1h1v3h-1v2h-1v1h-5v-1h-1v-2h-1v-2h-1v-2h1v1h1v-1h1z'/%3E%3C/svg%3E") 6 1, auto;
}
:root[data-glitch="2"] button, :root[data-glitch="2"] a, :root[data-glitch="2"] [part="head"], :root[data-glitch="2"] [part="row"] { cursor: inherit; }
```

- [ ] **Step 6: run the test to see it pass, then the checker**

Run: `cd /Volumes/T7/ghost-signal && node --test test/unit/css.test.js && npm run check`

Expected: `# pass 7`, `# fail 0`, then `contrast ok`. if the "no hex outside data uris" test fails, the offending hex is a value that belongs in `tokens.json`.

- [ ] **Step 7: commit**

```bash
cd /Volumes/T7/ghost-signal
git add scripts/fetch-doto.sh src/fonts src/base.css src/fx.css README.md test/unit/css.test.js
git commit -m "feat(css): bundle doto, base layer and gated fx layer" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### task 6: gs.js core and the face expressions

**Files:**
- Create: `src/gs.js`, `src/expressions.js`
- Test: `test/unit/gs.test.js`, `test/unit/expressions.test.js`

**Interfaces:**
- Consumes: `tokens.json` `kaomoji` map (test only).
- Produces: everything in the shared names table for `src/gs.js` except `gridToSymbol` (task 9), plus `CORE`, `KAOMOJI`, `resolveExpression(name): { name, grid } | null` from `src/expressions.js`. `glitchOnce(el)`, `moshOnce(el)`, `flareOnce(el)` return `true` when they added the class and `false` when motion is off. `startAmbient(options?)` returns a stop function. `registerCommands(appId, commands)` stores `[{ id, title, shortcut? }]`; `getCommands()` returns a flat `[{ id, title, shortcut, app }]`.

- [ ] **Step 1: write the failing gs.js test**

`test/unit/gs.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUSES, isStatus, coerceStatus, GS, parseGrid, GsGridError, GsCoreExpressionError,
  registerExpression, getExpression, registerIcon, getIcon, listIcons,
  registerSprite, getSprite, registerCommands, getCommands, motionMs, glitchOnce, startAmbient,
} from '../../src/gs.js';

test('STATUSES is the frozen seven', () => {
  assert.deepEqual([...STATUSES], ['idle', 'working', 'ok', 'warn', 'deny', 'bypass', 'crash']);
  assert.ok(Object.isFrozen(STATUSES));
  assert.ok(isStatus('bypass'));
  assert.equal(isStatus('error'), false);
});

test('coerceStatus returns warn and logs for anything unknown', (t) => {
  const err = t.mock.method(console, 'error', () => {});
  assert.equal(coerceStatus('ok'), 'ok');
  assert.equal(coerceStatus('exploded'), 'warn');
  assert.equal(coerceStatus(undefined), 'warn');
  assert.equal(err.mock.callCount(), 2);
  assert.match(err.mock.calls[0].arguments[0], /unknown status "exploded"/);
});

test('GS.seed makes GS.random repeatable', () => {
  GS.seed(1);
  const a = [GS.random(), GS.random(), GS.random()];
  GS.seed(1);
  const b = [GS.random(), GS.random(), GS.random()];
  assert.deepEqual(a, b);
  GS.seed(2);
  assert.notEqual(GS.random(), a[0]);
  for (const v of a) assert.ok(v >= 0 && v < 1);
});

test('parseGrid accepts strings with / or newline separators and arrays', () => {
  const rows = parseGrid('#./.#', 2, 2);
  assert.deepEqual(rows, ['#.', '.#']);
  assert.deepEqual(parseGrid('#.\n.#\n', 2, 2), ['#.', '.#']);
  assert.deepEqual(parseGrid(['#.', '.#']), ['#.', '.#']);
});

test('parseGrid throws GsGridError on the wrong shape or characters', () => {
  assert.throws(() => parseGrid('#.', 2, 2), GsGridError);
  assert.throws(() => parseGrid('#./.', 2, 2), (e) => e instanceof GsGridError && /row 1 has 1 cells/.test(e.message));
  assert.throws(() => parseGrid('#x/.#', 2, 2), /other than \. or #/);
});

test('registerExpression rejects core names and stores 16x10 grids', () => {
  const grid = Array.from({ length: 10 }, () => '#'.repeat(16));
  for (const name of ['idle', 'ok', 'blink']) assert.throws(() => registerExpression(name, grid), GsCoreExpressionError);
  registerExpression('debating', grid);
  assert.deepEqual(getExpression('debating'), grid);
  assert.equal(getExpression('nope'), undefined);
  assert.throws(() => registerExpression('short', grid.slice(0, 9)), GsGridError);
});

test('icons and sprites register by name', () => {
  const icon = Array.from({ length: 16 }, () => '.#'.repeat(8));
  registerIcon('sigil', icon);
  assert.deepEqual(getIcon('sigil'), icon);
  assert.deepEqual(listIcons(), ['sigil']);
  assert.throws(() => registerIcon('bad', icon.slice(0, 15)), GsGridError);
  registerSprite('probe', ['#..', '.#.', '..#']);
  assert.deepEqual(getSprite('probe'), ['#..', '.#.', '..#']);
});

test('commands are stored per app and flattened with the app id', () => {
  registerCommands('probe', [{ id: 'probe.ping', title: 'ping', shortcut: 'p' }]);
  registerCommands('other', [{ id: 'other.list', title: 'list' }]);
  assert.deepEqual(getCommands(), [
    { id: 'probe.ping', title: 'ping', shortcut: 'p', app: 'probe' },
    { id: 'other.list', title: 'list', shortcut: '', app: 'other' },
  ]);
  assert.throws(() => registerCommands('x', [{ title: 'no id' }]), TypeError);
});

test('motion helpers are inert without a document', () => {
  assert.equal(motionMs('glitch'), 0);
  assert.equal(glitchOnce({ classList: { add() {}, remove() {} } }), false);
  assert.equal(typeof startAmbient(), 'function');
});
```

- [ ] **Step 2: run the test to see it fail**

Run: `cd /Volumes/T7/ghost-signal && node --test test/unit/gs.test.js`

Expected: fails with `Cannot find module '.../src/gs.js'`.

- [ ] **Step 3: write src/gs.js**

```js
// ghost signal core: status vocabulary, seeded prng, grid parsing, registries, fx helpers.
// importable from node (no DOM access at module scope beyond a guarded init) so the unit
// tests and the cli share it with the browser. they ALL import eventually XX

export const STATUSES = Object.freeze(['idle', 'working', 'ok', 'warn', 'deny', 'bypass', 'crash']);
export const CORE_EXPRESSION_NAMES = Object.freeze([...STATUSES, 'blink']);

export function isStatus(s) {
  return STATUSES.includes(s);
}

export function coerceStatus(s) {
  if (isStatus(s)) return s;
  console.error(`ghost-signal: unknown status ${JSON.stringify(s)}, using warn`);
  return 'warn';
}

export class GsGridError extends Error {
  constructor(message) { super(message); this.name = 'GsGridError'; }
}
export class GsCoreExpressionError extends Error {
  constructor(message) { super(message); this.name = 'GsCoreExpressionError'; }
}
export class GsWallpaperPlacementError extends Error {
  constructor(message) { super(message); this.name = 'GsWallpaperPlacementError'; }
}

// mulberry32: tiny, seedable, good enough for glyph soup. never used by gs-mosaic (¬‿¬)
function mulberry32(a) {
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let rng = mulberry32(1);

export const GS = Object.freeze({
  seed(n) { rng = mulberry32(n >>> 0); },
  random() { return rng(); },
});

export function parseGrid(textOrRows, cols, rows) {
  const raw = Array.isArray(textOrRows) ? textOrRows : String(textOrRows).split(/[\n/]/);
  const lines = raw.map((r) => String(r).trim()).filter((r) => r.length > 0);
  const width = cols ?? (lines[0]?.length ?? 0);
  const height = rows ?? lines.length;
  if (lines.length !== height) throw new GsGridError(`expected ${height} rows, got ${lines.length}`);
  lines.forEach((line, i) => {
    if (line.length !== width) throw new GsGridError(`row ${i} has ${line.length} cells, expected ${width}`);
    if (/^[.#]+$/.test(line) === false) throw new GsGridError(`row ${i} has a character other than . or #`);
  });
  return lines;
}

const expressions = new Map();
const icons = new Map();
const sprites = new Map();
const commands = new Map();

export function registerExpression(name, grid) {
  if (CORE_EXPRESSION_NAMES.includes(name)) {
    throw new GsCoreExpressionError(`"${name}" is a core expression and cannot be replaced`);
  }
  expressions.set(name, parseGrid(grid, 16, 10));
}
export function getExpression(name) {
  return expressions.get(name);
}

export function registerIcon(name, grid) {
  icons.set(name, parseGrid(grid, 16, 16));
}
export function getIcon(name) {
  return icons.get(name);
}
export function listIcons() {
  return [...icons.keys()].sort();
}

export function registerSprite(name, grid) {
  sprites.set(name, parseGrid(grid));
}
export function getSprite(name) {
  return sprites.get(name);
}

export function registerCommands(appId, list) {
  const clean = list.map((c) => {
    if (typeof c?.id !== 'string' || typeof c?.title !== 'string') {
      throw new TypeError(`ghost-signal: command in ${appId} needs string id and title`);
    }
    return { id: c.id, title: c.title, shortcut: c.shortcut ?? '' };
  });
  commands.set(appId, clean);
}
export function getCommands() {
  return [...commands.entries()].flatMap(([app, list]) => list.map((c) => ({ ...c, app })));
}

const hasDocument = () => typeof document !== 'undefined';

export function glitchLevel() {
  return hasDocument() ? (document.documentElement.dataset.glitch ?? '1') : '1';
}

export function reducedMotion() {
  return typeof globalThis.matchMedia === 'function'
    && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches === true;
}

export function motionMs(name) {
  if (hasDocument() === false) return 0;
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--gs-motion-${name}`).trim();
  if (v.endsWith('ms')) return parseFloat(v);
  if (v.endsWith('s')) return parseFloat(v) * 1000;
  return 0;
}

function fxAllowed() {
  return glitchLevel() !== '0' && reducedMotion() === false;
}

function fxOnce(el, cls, motion) {
  if (fxAllowed() === false) return false;
  const ms = motionMs(motion);
  if (ms === 0) return false;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
  return true;
}

export const glitchOnce = (el) => fxOnce(el, 'gs-glitch', 'glitch');
export const moshOnce = (el) => fxOnce(el, 'gs-mosh', 'mosh');
export const flareOnce = (el) => fxOnce(el, 'gs-flare', 'flare');

// one-frame micro glitch on a random [data-gs-ambient] element every 20 to 40 seconds.
// seeded through GS.random so a test can make it deterministic. returns a stop function.
export function startAmbient({ root, min, max } = {}) {
  if (hasDocument() === false || fxAllowed() === false) return () => {};
  const scope = root ?? document;
  const lo = min ?? motionMs('ambient-min');
  const hi = max ?? motionMs('ambient-max');
  if (hi <= 0) return () => {};
  let timer = 0;
  const schedule = () => {
    const wait = lo + GS.random() * Math.max(0, hi - lo);
    timer = setTimeout(() => {
      const targets = scope.querySelectorAll('[data-gs-ambient]');
      if (targets.length > 0) glitchOnce(targets[Math.floor(GS.random() * targets.length)]);
      schedule();
    }, wait);
  };
  schedule();
  return () => clearTimeout(timer);
}

if (hasDocument()) {
  const html = document.documentElement;
  if (html.dataset.glitch === undefined) html.dataset.glitch = '1';
  if (reducedMotion()) html.dataset.glitch = '0';
}
```

- [ ] **Step 4: run the test to see it pass**

Run: `cd /Volumes/T7/ghost-signal && node --test test/unit/gs.test.js`

Expected: `# pass 9`, `# fail 0`.

- [ ] **Step 5: write the failing expressions test**

`test/unit/expressions.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTokens } from '../../scripts/lib/tokens.js';
import { CORE, KAOMOJI, resolveExpression } from '../../src/expressions.js';
import { registerExpression } from '../../src/gs.js';

test('every core expression is a 16x10 grid of . and #', () => {
  assert.deepEqual(Object.keys(CORE).sort(), ['blink', 'bypass', 'crash', 'deny', 'idle', 'warn', 'working']);
  for (const [name, grid] of Object.entries(CORE)) {
    assert.equal(grid.length, 10, name);
    for (const row of grid) assert.match(row, /^[.#]{16}$/, `${name}: ${row}`);
    assert.ok(grid.some((row) => row.includes('#')), `${name} is blank`);
  }
  assert.ok(Object.isFrozen(CORE));
});

test('the seven core grids are distinct', () => {
  const keys = new Set(Object.values(CORE).map((g) => g.join('/')));
  assert.equal(keys.size, 7);
});

test('KAOMOJI matches tokens.json exactly', async () => {
  const t = await loadTokens();
  assert.deepEqual({ ...KAOMOJI }, t.kaomoji);
  assert.equal(KAOMOJI.deny, '>:[');
});

test('resolveExpression maps ok to idle, finds registered app expressions, returns null otherwise', () => {
  assert.equal(resolveExpression('ok').name, 'idle');
  assert.deepEqual(resolveExpression('ok').grid, CORE.idle);
  assert.equal(resolveExpression('crash').name, 'crash');
  assert.equal(resolveExpression('haunting'), null);
  const grid = Array.from({ length: 10 }, () => '#'.repeat(16));
  registerExpression('haunting', grid);
  assert.deepEqual(resolveExpression('haunting'), { name: 'haunting', grid });
});
```

- [ ] **Step 6: run the test to see it fail**

Run: `cd /Volumes/T7/ghost-signal && node --test test/unit/expressions.test.js`

Expected: fails with `Cannot find module '.../src/expressions.js'`.

- [ ] **Step 7: write src/expressions.js**

each grid is 16 wide and 10 tall. eyes sit in rows 1 to 4, the mouth in rows 5 to 8.

```js
// the seven core faces plus the blink frame. fixed, not overridable: registerExpression
// throws on these names. the face is always green, so nothing here carries a color (｡◕‿↼)
import { parseGrid, getExpression } from './gs.js';

const grid = (rows) => Object.freeze(parseGrid(rows, 16, 10));

export const CORE = Object.freeze({
  // slanted eyes, wide grin
  idle: grid([
    '................',
    '..##........##..',
    '...##......##...',
    '................',
    '................',
    '.#............#.',
    '.##..........##.',
    '..###......###..',
    '....########....',
    '................',
  ]),
  // flat eyes looking aside, smirk
  working: grid([
    '................',
    '................',
    '..####....####..',
    '....##......##..',
    '................',
    '................',
    '................',
    '.......#########',
    '........#######.',
    '................',
  ]),
  // flat eyes, flat mouth
  warn: grid([
    '................',
    '................',
    '..####....####..',
    '................',
    '................',
    '................',
    '....########....',
    '................',
    '................',
    '................',
  ]),
  // v brows, square frown
  deny: grid([
    '.#............#.',
    '..#..........#..',
    '...#........#...',
    '..##........##..',
    '................',
    '................',
    '....########....',
    '....#......#....',
    '....#......#....',
    '................',
  ]),
  // v brows, wide manic grin with teeth
  bypass: grid([
    '.#............#.',
    '..#..........#..',
    '...##......##...',
    '....#......#....',
    '................',
    '.##############.',
    '.#.#.#.#.#.#.#.#',
    '..############..',
    '...##########...',
    '................',
  ]),
  // x eyes, flat mouth
  crash: grid([
    '................',
    '.#..#......#..#.',
    '..##........##..',
    '..##........##..',
    '.#..#......#..#.',
    '................',
    '................',
    '....########....',
    '................',
    '................',
  ]),
  // closed eyes over the idle grin. one frame of the 7s blink
  blink: grid([
    '................',
    '................',
    '................',
    '..####....####..',
    '................',
    '.#............#.',
    '.##..........##.',
    '..###......###..',
    '....########....',
    '................',
  ]),
});

// authored in tokens.json too; test/unit/expressions.test.js pins the two maps equal
export const KAOMOJI = Object.freeze({
  idle: '(｡◕‿↼)',
  working: '(¬‿¬)',
  ok: '(｡◕‿↼)',
  warn: '(¬_¬)',
  deny: '>:[',
  bypass: '>:D',
  crash: 'XX',
});

export function resolveExpression(name) {
  const core = name === 'ok' ? 'idle' : name;
  if (CORE[core] !== undefined) return { name: core, grid: CORE[core] };
  const registered = getExpression(name);
  return registered === undefined ? null : { name, grid: registered };
}
```

- [ ] **Step 8: run all unit tests**

Run: `cd /Volumes/T7/ghost-signal && npm test`

Expected: every file passes; the expressions file reports `# pass 4`. a `row N has M cells` failure means a grid line above lost or gained a character; count to 16.

- [ ] **Step 9: commit**

```bash
cd /Volumes/T7/ghost-signal
git add src/gs.js src/expressions.js test/unit/gs.test.js test/unit/expressions.test.js
git commit -m "feat(core): status vocabulary, seeded prng, registries and core expressions" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### task 7: gs-mosaic

**Files:**
- Create: `src/components/mosaic.js`, `test/e2e/pages/mosaic.html`, `test/e2e/fixtures/ref-a.grid`, `test/e2e/fixtures/ref-b.grid`, `test/e2e/__snapshots__/mosaic.spec.js/*.txt` (written by the first run, committed)
- Test: `test/unit/mosaic.test.js`, `test/e2e/mosaic.spec.js`

**Interfaces:**
- Consumes: `parseGrid` (task 6), `--gs-color-accent`, `--gs-color-accent-bloom`, `--gs-color-accent-dim` (task 2), `gs-mosaic canvas` rule (task 5).
- Produces: `BAYER4`, `bayerThreshold(value, x, y): boolean`, `imageToGrid(pixels, width, height, cols, rows): string[]`, `textToGrid(text, cols, rows): string[]`, class `GsMosaic` with attributes `mode` (`dot` | `ascii`), `cols` (16), `rows` (10), `cell` (7), `gap` (2), `grid` (rows joined by `/`), `text`, `lit`; property `grid` (get and set `string[]`); methods `render()`, `hash(): string` (png data url), `setImage(source)`; attribute `data-drawn` counting renders. task 8 wraps this; task 12 tiles it.

- [ ] **Step 1: write the failing unit test**

`test/unit/mosaic.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAYER4, bayerThreshold, imageToGrid, textToGrid, GsMosaic } from '../../src/components/mosaic.js';

test('the module imports in node and exports the class', () => {
  assert.equal(typeof GsMosaic, 'function');
  assert.equal(BAYER4.length, 4);
  assert.deepEqual(BAYER4[0], [0, 8, 2, 10]);
});

test('bayerThreshold is ordered: brighter values light more cells, black lights none, white lights all', () => {
  const count = (v) => {
    let n = 0;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (bayerThreshold(v, x, y)) n++;
    return n;
  };
  assert.equal(count(0), 0);
  assert.equal(count(1), 16);
  assert.equal(count(0.5), 8);
  assert.ok(count(0.25) < count(0.75));
  assert.equal(bayerThreshold(0.6, 4, 4), bayerThreshold(0.6, 0, 0));
});

test('imageToGrid samples cell centers so a 1:1 image maps exactly', () => {
  const w = 2;
  const h = 2;
  const px = new Uint8ClampedArray([
    255, 255, 255, 255, 0, 0, 0, 255,
    0, 0, 0, 255, 255, 255, 255, 255,
  ]);
  assert.deepEqual(imageToGrid(px, w, h, 2, 2), ['#.', '.#']);
  assert.deepEqual(imageToGrid(px, w, h, 4, 4), ['##..', '##..', '..##', '..##']);
});

test('imageToGrid treats transparent pixels as dark', () => {
  const px = new Uint8ClampedArray([255, 255, 255, 0]);
  assert.deepEqual(imageToGrid(px, 1, 1, 1, 1), ['.']);
});

test('textToGrid lights every non-space character and pads or crops to the grid', () => {
  assert.deepEqual(textToGrid('ab\n c', 3, 3), ['##.', '.#.', '...']);
  assert.deepEqual(textToGrid('abcdef', 3, 1), ['###']);
});
```

- [ ] **Step 2: run the test to see it fail**

Run: `cd /Volumes/T7/ghost-signal && node --test test/unit/mosaic.test.js`

Expected: fails with `Cannot find module '.../src/components/mosaic.js'`.

- [ ] **Step 3: write src/components/mosaic.js**

```js
// one renderer for every dotted or ascii image. no rng in here, ever: same grid, same pixels,
// same hash on every machine. cells are integer aligned fillRects so nothing antialiases (｡◕‿↼)
import { parseGrid } from '../gs.js';

const Base = globalThis.HTMLElement ?? class {};

export const BAYER4 = Object.freeze([
  Object.freeze([0, 8, 2, 10]),
  Object.freeze([12, 4, 14, 6]),
  Object.freeze([3, 11, 1, 9]),
  Object.freeze([15, 7, 13, 5]),
]);

export function bayerThreshold(value, x, y) {
  return value > (BAYER4[y & 3][x & 3] + 0.5) / 16;
}

export function imageToGrid(pixels, width, height, cols, rows) {
  const out = [];
  for (let y = 0; y < rows; y++) {
    let row = '';
    for (let x = 0; x < cols; x++) {
      const px = Math.min(width - 1, Math.floor(((x + 0.5) * width) / cols));
      const py = Math.min(height - 1, Math.floor(((y + 0.5) * height) / rows));
      const i = (py * width + px) * 4;
      const lum = ((0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]) / 255) * (pixels[i + 3] / 255);
      row += bayerThreshold(lum, x, y) ? '#' : '.';
    }
    out.push(row);
  }
  return out;
}

export function textToGrid(text, cols, rows) {
  const lines = String(text).split('\n');
  const out = [];
  for (let y = 0; y < rows; y++) {
    const line = lines[y] ?? '';
    let row = '';
    for (let x = 0; x < cols; x++) row += (line[x] ?? ' ') === ' ' ? '.' : '#';
    out.push(row);
  }
  return out;
}

function blank(cols, rows) {
  return Array.from({ length: rows }, () => '.'.repeat(cols));
}

export class GsMosaic extends Base {
  static observedAttributes = ['mode', 'cols', 'rows', 'cell', 'gap', 'grid', 'text', 'lit'];

  #grid = null;
  #canvas = null;
  #drawn = 0;

  connectedCallback() {
    if (this.#canvas === null) {
      this.#canvas = document.createElement('canvas');
      this.append(this.#canvas);
    }
    this.render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.render();
  }

  #num(name, fallback) {
    const v = Number(this.getAttribute(name));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  }

  get mode() { return this.getAttribute('mode') === 'ascii' ? 'ascii' : 'dot'; }
  get cols() { return this.#num('cols', 16); }
  get rows() { return this.#num('rows', 10); }
  get cell() { return this.#num('cell', 7); }
  get gap() { return this.hasAttribute('gap') ? Math.max(0, Number(this.getAttribute('gap'))) : 2; }

  get grid() {
    if (this.#grid !== null) return this.#grid;
    const attr = this.getAttribute('grid');
    if (attr !== null) return parseGrid(attr, this.cols, this.rows);
    const text = this.getAttribute('text');
    if (text !== null) return textToGrid(text, this.cols, this.rows);
    return blank(this.cols, this.rows);
  }

  set grid(rows) {
    this.#grid = rows === null ? null : parseGrid(rows, this.cols, this.rows);
    if (this.isConnected) this.render();
  }

  // source: HTMLImageElement, ImageBitmap or canvas. scaled to cols x rows without smoothing,
  // then thresholded. a source already at cols x rows maps 1:1
  setImage(source) {
    const off = document.createElement('canvas');
    off.width = this.cols;
    off.height = this.rows;
    const ctx = off.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, 0, 0, this.cols, this.rows);
    const data = ctx.getImageData(0, 0, this.cols, this.rows).data;
    this.grid = imageToGrid(data, this.cols, this.rows, this.cols, this.rows);
  }

  #colors() {
    const cs = getComputedStyle(this);
    const read = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
    const lit = this.getAttribute('lit');
    if (lit !== null) return { lit, bloom: lit, dim: lit };
    return {
      lit: read('--gs-color-accent', 'lime'),
      bloom: read('--gs-color-accent-bloom', 'white'),
      dim: read('--gs-color-accent-dim', 'green'),
    };
  }

  render() {
    if (this.#canvas === null) return;
    const { cols, rows, cell, gap } = this;
    const pitch = cell + gap;
    const grid = this.grid;
    const c = this.#canvas;
    c.width = cols * pitch - gap;
    c.height = rows * pitch - gap;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    const colors = this.#colors();
    if (this.mode === 'ascii') {
      ctx.font = `${cell + gap}px ui-monospace, Menlo, monospace`;
      ctx.textBaseline = 'top';
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const on = grid[y][x] === '#';
          ctx.fillStyle = on ? colors.lit : colors.dim;
          ctx.fillText(on ? '#' : '.', x * pitch, y * pitch);
        }
      }
    } else {
      const inset = Math.floor(cell / 3);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const px = x * pitch;
          const py = y * pitch;
          if (grid[y][x] === '#') {
            ctx.fillStyle = colors.lit;
            ctx.fillRect(px, py, cell, cell);
            if (cell >= 5) {
              ctx.fillStyle = colors.bloom;
              ctx.fillRect(px + inset, py + inset, cell - 2 * inset, cell - 2 * inset);
            }
          } else {
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = colors.dim;
            ctx.fillRect(px, py, cell, cell);
            ctx.globalAlpha = 1;
          }
        }
      }
    }
    this.#drawn += 1;
    this.dataset.drawn = String(this.#drawn);
  }

  hash() {
    return this.#canvas === null ? '' : this.#canvas.toDataURL('image/png');
  }
}

if (globalThis.customElements && customElements.get('gs-mosaic') === undefined) {
  customElements.define('gs-mosaic', GsMosaic);
}
```

- [ ] **Step 4: run the unit test to see it pass**

Run: `cd /Volumes/T7/ghost-signal && node --test test/unit/mosaic.test.js`

Expected: `# pass 5`, `# fail 0`.

- [ ] **Step 5: write the fixtures and the test page**

`test/e2e/fixtures/ref-a.grid`:

```
..####..
.######.
.#.##.#.
.######.
.######.
.######.
.#.##.#.
........
```

`test/e2e/fixtures/ref-b.grid`:

```
#.#.#.#.
.#.#.#.#
#.#.#.#.
.#.#.#.#
#.#.#.#.
.#.#.#.#
#.#.#.#.
.#.#.#.#
```

`test/e2e/pages/mosaic.html`:

```html
<!doctype html>
<html lang="en" data-glitch="0">
<head>
  <meta charset="utf-8">
  <title>gs-mosaic</title>
  <link rel="stylesheet" href="../../../src/tokens.css">
  <link rel="stylesheet" href="../../../src/base.css">
  <script type="module">
    import { GS } from '../../../src/gs.js';
    import '../../../src/components/mosaic.js';
    window.GS = GS;
  </script>
</head>
<body>
  <gs-mosaic id="a" cols="8" rows="8"></gs-mosaic>
  <gs-mosaic id="b" cols="8" rows="8"></gs-mosaic>
  <gs-mosaic id="c" cols="8" rows="8" mode="ascii"></gs-mosaic>
  <gs-mosaic id="d" cols="8" rows="8"></gs-mosaic>
  <gs-mosaic id="e" cols="4" rows="2" grid="#..#/.##."></gs-mosaic>
</body>
</html>
```

- [ ] **Step 6: write the playwright test**

`test/e2e/mosaic.spec.js`:

```js
import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const fixture = async (name) => (await readFile(new URL(`./fixtures/${name}.grid`, import.meta.url), 'utf8')).trim().split('\n');

test.beforeEach(async ({ page }) => {
  await page.goto('/test/e2e/pages/mosaic.html');
  await page.waitForSelector('gs-mosaic#e[data-drawn]');
});

test('identical grids hash identical and the hashes are pinned', async ({ page }) => {
  const a = await fixture('ref-a');
  const b = await fixture('ref-b');
  const hashes = await page.evaluate(([ra, rb]) => {
    const el = (id) => document.getElementById(id);
    el('a').grid = ra;
    el('b').grid = ra;
    el('c').grid = ra;
    el('d').grid = rb;
    return ['a', 'b', 'c', 'd'].map((id) => el(id).hash());
  }, [a, b]);
  expect(hashes[0]).toBe(hashes[1]);
  expect(hashes[0].startsWith('data:image/png;base64,')).toBe(true);
  expect(hashes[2]).not.toBe(hashes[0]);
  expect(hashes[3]).not.toBe(hashes[0]);
  expect(sha256(hashes[0])).toMatchSnapshot('mosaic-ref-a.txt');
  expect(sha256(hashes[3])).toMatchSnapshot('mosaic-ref-b.txt');
});

test('the grid attribute uses / as the row separator and re-renders on change', async ({ page }) => {
  const before = await page.locator('#e').getAttribute('data-drawn');
  const size = await page.evaluate(() => {
    const c = document.querySelector('#e canvas');
    return [c.width, c.height];
  });
  expect(size).toEqual([4 * 9 - 2, 2 * 9 - 2]);
  await page.evaluate(() => document.getElementById('e').setAttribute('grid', '####/####'));
  const after = await page.locator('#e').getAttribute('data-drawn');
  expect(Number(after)).toBeGreaterThan(Number(before));
});

test('lit cells read the accent tokens and a lit attribute overrides them', async ({ page }) => {
  const colors = await page.evaluate(() => {
    const el = document.getElementById('e');
    const ctx = el.querySelector('canvas').getContext('2d');
    const at = (x, y) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3);
    const accent = at(3, 3);
    el.setAttribute('lit', 'rgb(1, 2, 3)');
    return { accent, lit: at(3, 3) };
  });
  expect(colors.accent).toEqual([178, 252, 186]);
  expect(colors.lit).toEqual([1, 2, 3]);
});
```

pixel (3, 3) is inside the bloom center of cell (0, 0) with `cell` 7 and `inset` 2, so the expected color is `--gs-color-accent-bloom` `#b2fcba` = `[178, 252, 186]`.

- [ ] **Step 7: run the e2e twice**

Run: `cd /Volumes/T7/ghost-signal && npm run e2e; npm run e2e`

Expected: the first run reports the mosaic hash test as failed with `A snapshot doesn't exist at ... mosaic-ref-a.txt, writing actual` (playwright writes missing snapshots and fails once); the second run prints `4 passed` (smoke plus three mosaic tests). `ls test/e2e/__snapshots__/mosaic.spec.js/` shows `mosaic-ref-a.txt` and `mosaic-ref-b.txt`, each a 64-character hex string.

- [ ] **Step 8: commit**

```bash
cd /Volumes/T7/ghost-signal
git add src/components/mosaic.js test/unit/mosaic.test.js test/e2e/mosaic.spec.js test/e2e/pages/mosaic.html test/e2e/fixtures test/e2e/__snapshots__
git commit -m "feat(mosaic): deterministic dot and ascii renderer with pinned hashes" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### task 8: gs-face

**Files:**
- Create: `src/components/face.js`, `test/e2e/pages/face.html`, `test/e2e/pages/face-motion.html`, `test/e2e/__snapshots__/face.spec.js/*.txt` (first run, committed)
- Test: `test/unit/face.test.js`, `test/e2e/face.spec.js`

**Interfaces:**
- Consumes: `coerceStatus`, `glitchOnce`, `glitchLevel`, `reducedMotion`, `motionMs`, `getExpression` (task 6), `resolveExpression` (task 6), `GsMosaic` (task 7).
- Produces: `nextFrame(status, { blinking }): string`; class `GsFace` with attributes `status` and `expression`, property `status`, methods `draw()`, `blink(): boolean`, `hash(): string`, reflected `data-frame`, event `gs-face-change` (`detail: { status, frame }`, bubbles). the gallery and the probe test read `data-frame`.

- [ ] **Step 1: write the failing unit test**

`test/unit/face.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextFrame, GsFace } from '../../src/components/face.js';

test('the module imports in node', () => {
  assert.equal(typeof GsFace, 'function');
});

test('nextFrame maps ok to idle and blinks only on idle and ok', () => {
  assert.equal(nextFrame('idle'), 'idle');
  assert.equal(nextFrame('ok'), 'idle');
  assert.equal(nextFrame('idle', { blinking: true }), 'blink');
  assert.equal(nextFrame('ok', { blinking: true }), 'blink');
  assert.equal(nextFrame('deny', { blinking: true }), 'deny');
  for (const s of ['working', 'warn', 'deny', 'bypass', 'crash']) assert.equal(nextFrame(s), s);
});

test('nextFrame coerces unknown statuses to warn', (t) => {
  const err = t.mock.method(console, 'error', () => {});
  assert.equal(nextFrame('haunted'), 'warn');
  assert.equal(err.mock.callCount(), 1);
});
```

- [ ] **Step 2: run the test to see it fail**

Run: `cd /Volumes/T7/ghost-signal && node --test test/unit/face.test.js`

Expected: fails with `Cannot find module '.../src/components/face.js'`.

- [ ] **Step 3: write src/components/face.js**

```js
// the mask. a 16x10 gs-mosaic that is always green: status picks the expression, never the color.
// the persona is not a traffic light (｡◕‿↼)
import { coerceStatus, glitchOnce, glitchLevel, reducedMotion, motionMs, getExpression } from '../gs.js';
import { resolveExpression } from '../expressions.js';
import './mosaic.js';

const Base = globalThis.HTMLElement ?? class {};
const BLINK_EVERY_MS = 7000;

export function nextFrame(status, { blinking = false } = {}) {
  const s = coerceStatus(status);
  if (blinking && (s === 'idle' || s === 'ok')) return 'blink';
  return s === 'ok' ? 'idle' : s;
}

export class GsFace extends Base {
  static observedAttributes = ['status', 'expression'];

  #mosaic = null;
  #blinkTimer = 0;
  #blinkBack = 0;
  #lastFrame = null;

  connectedCallback() {
    if (this.#mosaic === null) {
      this.#mosaic = document.createElement('gs-mosaic');
      this.#mosaic.setAttribute('cols', '16');
      this.#mosaic.setAttribute('rows', '10');
      this.append(this.#mosaic);
    }
    this.draw();
    this.#startBlink();
  }

  disconnectedCallback() {
    clearInterval(this.#blinkTimer);
    clearTimeout(this.#blinkBack);
    this.#blinkBack = 0;
  }

  attributeChangedCallback() {
    if (this.isConnected) this.draw();
  }

  get status() {
    return coerceStatus(this.getAttribute('status') ?? 'idle');
  }

  set status(value) {
    this.setAttribute('status', value);
  }

  #frameName(blinking) {
    const override = this.getAttribute('expression');
    if (override !== null) {
      if (getExpression(override) !== undefined) return override;
      console.error(`ghost-signal: expression "${override}" is not registered, using status`);
    }
    return nextFrame(this.getAttribute('status') ?? 'idle', { blinking });
  }

  #show(name) {
    const resolved = resolveExpression(name);
    this.#mosaic.grid = resolved.grid;
    this.dataset.frame = name;
  }

  draw() {
    const name = this.#frameName(false);
    const changed = this.#lastFrame !== null && this.#lastFrame !== name;
    this.#show(name);
    this.#lastFrame = name;
    if (changed) {
      glitchOnce(this);
      this.dispatchEvent(new CustomEvent('gs-face-change', { bubbles: true, detail: { status: this.status, frame: name } }));
      if (this.status === 'ok' && this.hasAttribute('expression') === false) this.blink();
    }
  }

  #blinkAllowed() {
    return glitchLevel() !== '0' && reducedMotion() === false;
  }

  // one sprite step (800ms / 4) of the blink frame, then back. returns false when it did nothing
  blink() {
    if (this.#blinkAllowed() === false || this.#blinkBack !== 0) return false;
    if (this.#frameName(true) !== 'blink') return false;
    this.#show('blink');
    this.#blinkBack = setTimeout(() => {
      this.#blinkBack = 0;
      if (this.isConnected) this.#show(this.#frameName(false));
    }, motionMs('sprite') / 4);
    return true;
  }

  #startBlink() {
    clearInterval(this.#blinkTimer);
    if (this.#blinkAllowed()) this.#blinkTimer = setInterval(() => this.blink(), BLINK_EVERY_MS);
  }

  hash() {
    return this.#mosaic === null ? '' : this.#mosaic.hash();
  }
}

if (globalThis.customElements && customElements.get('gs-face') === undefined) {
  customElements.define('gs-face', GsFace);
}
```

- [ ] **Step 4: run the unit test to see it pass**

Run: `cd /Volumes/T7/ghost-signal && node --test test/unit/face.test.js`

Expected: `# pass 3`, `# fail 0`.

- [ ] **Step 5: write the two test pages**

`test/e2e/pages/face.html` (glitch pinned to 0 so the hashes never catch a blink frame):

```html
<!doctype html>
<html lang="en" data-glitch="0">
<head>
  <meta charset="utf-8">
  <title>gs-face</title>
  <link rel="stylesheet" href="../../../src/tokens.css">
  <link rel="stylesheet" href="../../../src/base.css">
  <link rel="stylesheet" href="../../../src/fx.css">
  <script type="module">
    import { GS } from '../../../src/gs.js';
    import '../../../src/components/face.js';
    window.GS = GS;
  </script>
</head>
<body>
  <gs-face id="face" status="idle"></gs-face>
</body>
</html>
```

`test/e2e/pages/face-motion.html` is the same file with the `data-glitch="0"` attribute removed from `<html>` and the title `gs-face motion`. gs.js then sets `data-glitch="1"` on import, or `0` under reduced motion.

- [ ] **Step 6: write the playwright test**

`test/e2e/face.spec.js`:

```js
import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';

const STATUSES = ['idle', 'working', 'ok', 'warn', 'deny', 'bypass', 'crash'];
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

async function hashFor(page, status) {
  await page.evaluate((s) => {
    window.GS.seed(1);
    document.getElementById('face').setAttribute('status', s);
  }, status);
  const frame = status === 'ok' ? 'idle' : status;
  await expect(page.locator('#face')).toHaveAttribute('data-frame', frame);
  return page.evaluate(() => document.getElementById('face').hash());
}

test('every status has a pinned hash, ok equals idle, six are distinct, the face stays green', async ({ page }) => {
  await page.goto('/test/e2e/pages/face.html');
  await page.waitForSelector('#face gs-mosaic[data-drawn]');
  const hashes = {};
  for (const s of STATUSES) hashes[s] = await hashFor(page, s);
  for (const s of STATUSES) expect(sha256(hashes[s])).toMatchSnapshot(`face-${s}.txt`);
  expect(hashes.ok).toBe(hashes.idle);
  expect(new Set(['idle', 'working', 'warn', 'deny', 'bypass', 'crash'].map((s) => hashes[s])).size).toBe(6);
  expect(await page.locator('#face gs-mosaic').getAttribute('lit')).toBeNull();
});

test('a status change fires gs-face-change and one gs-glitch class at glitch 1', async ({ page }) => {
  await page.goto('/test/e2e/pages/face-motion.html');
  await page.waitForSelector('#face gs-mosaic[data-drawn]');
  expect(await page.evaluate(() => document.documentElement.dataset.glitch)).toBe('1');
  const result = await page.evaluate(() => new Promise((resolve) => {
    const face = document.getElementById('face');
    face.addEventListener('gs-face-change', (e) => {
      resolve({ detail: e.detail, glitching: face.classList.contains('gs-glitch') });
    }, { once: true });
    face.setAttribute('status', 'deny');
  }));
  expect(result.detail).toEqual({ status: 'deny', frame: 'deny' });
  expect(result.glitching).toBe(true);
  await expect(page.locator('#face')).not.toHaveClass(/gs-glitch/, { timeout: 2000 });
});

test('blink draws the blink frame for one sprite step and returns to idle', async ({ page }) => {
  await page.goto('/test/e2e/pages/face-motion.html');
  await page.waitForSelector('#face gs-mosaic[data-drawn]');
  const blinked = await page.evaluate(() => document.getElementById('face').blink());
  expect(blinked).toBe(true);
  await expect(page.locator('#face')).toHaveAttribute('data-frame', 'blink');
  await expect(page.locator('#face')).toHaveAttribute('data-frame', 'idle', { timeout: 2000 });
});

test('an unregistered expression override falls back to the status', async ({ page }) => {
  await page.goto('/test/e2e/pages/face.html');
  await page.waitForSelector('#face gs-mosaic[data-drawn]');
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.evaluate(() => document.getElementById('face').setAttribute('expression', 'haunting'));
  await expect(page.locator('#face')).toHaveAttribute('data-frame', 'idle');
  expect(errors.some((e) => e.includes('"haunting"'))).toBe(true);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('forces glitch 0, never blinks, never glitches, runs no animation', async ({ page }) => {
    await page.goto('/test/e2e/pages/face-motion.html');
    await page.waitForSelector('#face gs-mosaic[data-drawn]');
    expect(await page.evaluate(() => document.documentElement.dataset.glitch)).toBe('0');
    for (const s of STATUSES) {
      await page.evaluate((v) => document.getElementById('face').setAttribute('status', v), s);
      await expect(page.locator('#face')).toHaveAttribute('data-frame', s === 'ok' ? 'idle' : s);
      expect(await page.locator('#face').getAttribute('class') ?? '').not.toContain('gs-glitch');
    }
    expect(await page.evaluate(() => document.getElementById('face').blink())).toBe(false);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });
});
```

- [ ] **Step 7: run the e2e twice**

Run: `cd /Volumes/T7/ghost-signal && npm run e2e; npm run e2e`

Expected: the first run fails the pinned-hash test once while writing seven `face-<status>.txt` snapshots; the second run prints `9 passed`.

- [ ] **Step 8: commit**

```bash
cd /Volumes/T7/ghost-signal
git add src/components/face.js test/unit/face.test.js test/e2e/face.spec.js test/e2e/pages/face.html test/e2e/pages/face-motion.html test/e2e/__snapshots__/face.spec.js
git commit -m "feat(face): status-driven mask with blink, glitch and pinned hashes" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### task 9: pixel icons and the svg sprite

**Files:**
- Create: `scripts/lib/icons.js`, `src/icons/<name>.grid` (twenty files), `src/icons.svg` (generated)
- Modify: `src/gs.js` (add `gridToSymbol`), `scripts/gen.js` (add the sprite output)
- Test: `test/unit/icons.test.js`

**Interfaces:**
- Consumes: `parseGrid` (task 6), `generate()` in `scripts/gen.js` (task 3).
- Produces: `gridToSymbol(name, grid): string` in `src/gs.js` (used by the sprite builder here and by the gallery for app icons in task 15); `ICON_NAMES` and `buildSprite(dirUrl): Promise<string>` in `scripts/lib/icons.js`; `src/icons.svg` with one `<symbol id="gs-<name>">` per grid. consumers inline the sprite once and reference `<svg class="gs-icon"><use href="#gs-search"/></svg>`.

- [ ] **Step 1: write the failing test**

`test/unit/icons.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { ICON_NAMES, buildSprite } from '../../scripts/lib/icons.js';
import { gridToSymbol, parseGrid } from '../../src/gs.js';

const iconsDir = new URL('../../src/icons/', import.meta.url);

test('the twenty icon names from the spec each have a 16x16 grid file', async () => {
  assert.equal(ICON_NAMES.length, 20);
  for (const name of ICON_NAMES) {
    const file = new URL(`${name}.grid`, iconsDir);
    await stat(file);
    const grid = parseGrid(await readFile(file, 'utf8'), 16, 16);
    assert.ok(grid.some((r) => r.includes('#')), `${name} is blank`);
  }
});

test('gridToSymbol emits one unit rect per lit cell inside a viewBox of the grid size', () => {
  const svg = gridToSymbol('x', ['#.', '.#']);
  assert.match(svg, /^<symbol id="gs-x" viewBox="0 0 2 2" shape-rendering="crispEdges">/);
  assert.equal((svg.match(/<rect /g) ?? []).length, 2);
  assert.match(svg, /<rect x="1" y="1" width="1" height="1"\/>/);
});

test('buildSprite contains a symbol for every icon and the committed sprite is current', async () => {
  const sprite = await buildSprite(iconsDir);
  for (const name of ICON_NAMES) assert.match(sprite, new RegExp(`<symbol id="gs-${name}" `), name);
  assert.equal((sprite.match(/<symbol /g) ?? []).length, ICON_NAMES.length);
  assert.match(sprite, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="0" height="0"/);
  assert.equal(await readFile(new URL('../../src/icons.svg', import.meta.url), 'utf8'), sprite);
});
```

- [ ] **Step 2: run the test to see it fail**

Run: `cd /Volumes/T7/ghost-signal && node --test test/unit/icons.test.js`

Expected: fails with `Cannot find module '.../scripts/lib/icons.js'`.

- [ ] **Step 3: add gridToSymbol to src/gs.js**

append before the `if (hasDocument())` block:

```js
// a grid as an svg symbol: one unit rect per lit cell. fill is inherited so currentColor works
export function gridToSymbol(name, grid) {
  const rects = [];
  grid.forEach((row, y) => {
    [...row].forEach((c, x) => {
      if (c === '#') rects.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
    });
  });
  return `<symbol id="gs-${name}" viewBox="0 0 ${grid[0].length} ${grid.length}" shape-rendering="crispEdges">${rects.join('')}</symbol>`;
}
```

- [ ] **Step 4: write scripts/lib/icons.js**

```js
// src/icons/<name>.grid -> src/icons.svg. one symbol per file, sorted by name so the output is stable
import { readdir, readFile } from 'node:fs/promises';
import { parseGrid, gridToSymbol } from '../../src/gs.js';

export const ICON_NAMES = Object.freeze([
  'watch', 'filter', 'search', 'close', 'expand', 'collapse', 'copy', 'settings', 'terminal', 'log',
  'deny', 'bypass', 'warn', 'ok', 'idle', 'app', 'palette', 'window', 'tape', 'ghost',
]);

export async function buildSprite(dirUrl) {
  const files = (await readdir(dirUrl)).filter((f) => f.endsWith('.grid')).sort();
  const symbols = [];
  for (const file of files) {
    const grid = parseGrid(await readFile(new URL(file, dirUrl), 'utf8'), 16, 16);
    symbols.push(gridToSymbol(file.slice(0, -'.grid'.length), grid));
  }
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true">',
    '<!-- generated from src/icons/*.grid by scripts/gen.js. do not edit -->',
    ...symbols,
    '</svg>',
    '',
  ].join('\n');
}
```

- [ ] **Step 5: draw the twenty grids**

rules for every icon: 16x16, a 1-cell empty margin on every side (content lives in columns 1 to 14 and rows 1 to 14), strokes 2 cells wide, curves may thin to 1 cell at the diagonals, lit cells are `#`, blank lines are not allowed. these four are drawn in full; the sixteen after them are specified by shape and must follow the same rules.

`src/icons/close.grid`:

```
................
................
..##........##..
..###......###..
...###....###...
....###..###....
.....######.....
......####......
......####......
.....######.....
....###..###....
...###....###...
..###......###..
..##........##..
................
................
```

`src/icons/search.grid`:

```
................
....######......
...########.....
..###....###....
..##......##....
..##......##....
..##......##....
..##......##....
..###....###....
...########.....
....######.##...
...........###..
............###.
.............##.
................
................
```

`src/icons/warn.grid`:

```
................
.......##.......
.......##.......
......####......
......#..#......
.....##..##.....
.....#.##.#.....
....##.##.##....
....#..##..#....
...##..##..##...
...#........#...
..##...##...##..
..############..
..############..
................
................
```

`src/icons/ghost.grid`:

```
................
.....######.....
....########....
...##########...
...##.####.##...
...##.####.##...
...##########...
...##########...
...##########...
...##########...
...##########...
...##########...
...##.####.##...
...#...##...#...
................
................
```

the remaining sixteen, each a 16x16 file under `src/icons/`:

| file | shape |
|---|---|
| `watch.grid` | an eye: almond outline 12 wide by 6 tall centered on row 7, 2-cell stroke, a 4x4 filled pupil at the center |
| `filter.grid` | a funnel: 12-wide bar on rows 2 and 3, sides converging to a 4-wide stem from row 8 to row 13 |
| `expand.grid` | four 2-cell-thick corner brackets pointing outward, each 5 cells per leg, in the four corners of the content box |
| `collapse.grid` | the same four brackets rotated to point inward toward the center |
| `copy.grid` | two overlapping 8x9 rectangle outlines, 2-cell stroke, the back one offset 3 up and 3 left |
| `settings.grid` | a gear: an 8-wide ring with 2-cell stroke and eight 2x2 teeth on the compass points and diagonals |
| `terminal.grid` | a 12x10 rectangle outline with a 2-cell chevron `>` on the left inside and a 3-wide underscore beside it |
| `log.grid` | four horizontal 2-cell-thick lines of widths 12, 9, 12, 7 on rows 2, 5, 8, 11 |
| `deny.grid` | a circle of 12 diameter with 2-cell stroke and a 2-cell diagonal slash from top-left to bottom-right |
| `bypass.grid` | a lightning bolt: 2-cell stroke, entering top-right at column 10, jogging left at row 7 to column 5, exiting bottom-left |
| `ok.grid` | a check mark: 2-cell stroke, short leg from (3, 8) to (6, 11), long leg from (6, 11) to (13, 4) |
| `idle.grid` | a 6x6 hollow square (2-cell stroke) centered on the box |
| `app.grid` | four 5x5 filled squares in a 2x2 layout with a 2-cell gap |
| `palette.grid` | a 12x10 rectangle outline with a 2-cell `>` chevron at row 4 and a filled 6x2 cursor bar on row 8 |
| `window.grid` | a 12x10 rectangle outline with a filled 12x3 title bar on rows 2 to 4 and a 2x2 close block at its right end |
| `tape.grid` | a full-width 12x4 filled band on rows 6 to 9 with three 2-cell gaps cut through it as diagonal stripes |

- [ ] **Step 6: wire the sprite into scripts/gen.js and generate**

add the import and the output entry in `scripts/gen.js`:

```js
import { buildSprite } from './lib/icons.js';
```

```js
  const outputs = [
    ['src/tokens.css', toCss(tokens)],
    ['gen/GhostSignal.swift', toSwift(tokens)],
    ['gen/ghost_signal.rs', toRust(tokens)],
    ['gen/tokens.md', toMarkdown(tokens)],
    ['src/icons.svg', await buildSprite(new URL('../src/icons/', import.meta.url))],
  ];
```

Run: `cd /Volumes/T7/ghost-signal && npm run gen && grep -c '<symbol' src/icons.svg && node --test test/unit/icons.test.js`

Expected: five `wrote` lines, `20`, then `# pass 3`, `# fail 0`. a `row N has M cells` error names the grid file to fix.

- [ ] **Step 7: commit**

```bash
cd /Volumes/T7/ghost-signal
git add scripts/lib/icons.js scripts/gen.js src/gs.js src/icons src/icons.svg test/unit/icons.test.js
git commit -m "feat(icons): twenty pixel glyphs generated into an svg sprite" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### task 10: gs-decode and gs-tape

**Files:**
- Create: `src/components/decode.js`, `src/components/tape.js`, `test/e2e/pages/decode.html`
- Test: `test/unit/decode.test.js`, `test/e2e/decode.spec.js`

**Interfaces:**
- Consumes: `GS`, `glitchLevel`, `reducedMotion`, `motionMs`, `coerceStatus` (task 6); `--gs-motion-decode`, `--gs-step-decode`, `--gs-color-<status>` (task 2); `gs-tape` and `gs-decode` rules (task 5).
- Produces: `GLYPHS`, `scrambleFrames(text, frames, rng): string[]`; class `GsDecode` with attribute and property `text`, method `play()`, attribute `data-playing` while running, event `gs-decode-done`; class `GsTape` with attributes `text` and `status` (default `bypass`), child `[part="track"]`, inline custom property `--gs-tape-color`. toasts (task 11), rows (task 12) and containers (task 12) render text through `<gs-decode>`.

- [ ] **Step 1: write the failing unit test**

`test/unit/decode.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLYPHS, scrambleFrames, GsDecode } from '../../src/components/decode.js';
import { GsTape } from '../../src/components/tape.js';
import { GS } from '../../src/gs.js';

test('both modules import in node', () => {
  assert.equal(typeof GsDecode, 'function');
  assert.equal(typeof GsTape, 'function');
  assert.doesNotMatch(GLYPHS, /\s/);
});

test('scrambleFrames settles left to right, leaves spaces alone and ends on the text', () => {
  GS.seed(1);
  const text = 'zero chill';
  const frames = scrambleFrames(text, 5, GS.random);
  assert.equal(frames.length, 5);
  assert.equal(frames.at(-1), text);
  frames.forEach((frame, f) => {
    assert.equal([...frame].length, [...text].length);
    const settled = Math.round(((f + 1) / 5) * text.length);
    assert.equal(frame.slice(0, settled), text.slice(0, settled), `frame ${f} prefix`);
    [...text].forEach((c, i) => { if (c === ' ') assert.equal(frame[i], ' '); });
  });
});

test('scrambleFrames is deterministic under the same seed and differs under another', () => {
  GS.seed(7);
  const a = scrambleFrames('ghost signal', 6, GS.random);
  GS.seed(7);
  const b = scrambleFrames('ghost signal', 6, GS.random);
  GS.seed(8);
  const c = scrambleFrames('ghost signal', 6, GS.random);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.ok(a[0] !== 'ghost signal');
});

test('scrambleFrames with fewer than two frames returns the text once', () => {
  assert.deepEqual(scrambleFrames('x', 1, GS.random), ['x']);
  assert.deepEqual(scrambleFrames('x', 0, GS.random), ['x']);
});
```

- [ ] **Step 2: run the test to see it fail**

Run: `cd /Volumes/T7/ghost-signal && node --test test/unit/decode.test.js`

Expected: fails with `Cannot find module '.../src/components/decode.js'`.

- [ ] **Step 3: write src/components/decode.js**

```js
// scramble reveal. glyph soup settles left to right over --gs-motion-decode in --gs-step-decode
// steps, seeded through GS.random. instant at glitch 0 or reduced motion. never body text (¬‿¬)
import { GS, glitchLevel, reducedMotion, motionMs } from '../gs.js';

const Base = globalThis.HTMLElement ?? class {};

export const GLYPHS = '#%&*+-./:;<=>?@[]^_{|}~0123456789abcdef';

export function scrambleFrames(text, frames, rng) {
  const chars = [...text];
  if (frames < 2) return [text];
  const out = [];
  for (let f = 0; f < frames; f++) {
    const settled = Math.round(((f + 1) / frames) * chars.length);
    out.push(chars.map((c, i) => (c === ' ' || i < settled ? c : GLYPHS[Math.floor(rng() * GLYPHS.length)])).join(''));
  }
  return out;
}

function decodeSteps() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--gs-step-decode');
  const m = v.match(/steps\((\d+)\)/);
  return m === null ? 6 : Number(m[1]);
}

export class GsDecode extends Base {
  static observedAttributes = ['text'];

  #span = null;
  #timer = 0;

  connectedCallback() {
    if (this.#span === null) {
      const initial = this.textContent.trim();
      this.textContent = '';
      this.#span = document.createElement('span');
      this.#span.setAttribute('part', 'text');
      this.append(this.#span);
      if (this.hasAttribute('text') === false && initial !== '') {
        this.setAttribute('text', initial);
        return;
      }
    }
    this.play();
  }

  disconnectedCallback() {
    clearTimeout(this.#timer);
  }

  attributeChangedCallback() {
    if (this.isConnected && this.#span !== null) this.play();
  }

  get text() { return this.getAttribute('text') ?? ''; }
  set text(value) { this.setAttribute('text', value); }

  play() {
    clearTimeout(this.#timer);
    const text = this.text;
    const total = motionMs('decode');
    const steps = decodeSteps();
    if (glitchLevel() === '0' || reducedMotion() || total === 0 || steps < 2) {
      this.#finish(text);
      return;
    }
    const frames = scrambleFrames(text, steps, GS.random);
    this.setAttribute('data-playing', '');
    let i = 0;
    const tick = () => {
      this.#span.textContent = frames[i];
      i += 1;
      if (i < frames.length) this.#timer = setTimeout(tick, total / steps);
      else this.#finish(text);
    };
    tick();
  }

  #finish(text) {
    this.#span.textContent = text;
    this.removeAttribute('data-playing');
    this.dispatchEvent(new CustomEvent('gs-decode-done', { bubbles: true }));
  }
}

if (globalThis.customElements && customElements.get('gs-decode') === undefined) {
  customElements.define('gs-decode', GsDecode);
}
```

- [ ] **Step 4: write src/components/tape.js**

```js
// repeating text strip. the one place caps are allowed: tape is shouting on purpose.
// the track holds the text an even number of times so the -50% scroll in fx.css is seamless
import { coerceStatus } from '../gs.js';

const Base = globalThis.HTMLElement ?? class {};

export class GsTape extends Base {
  static observedAttributes = ['text', 'status'];

  #track = null;

  connectedCallback() {
    if (this.#track === null) {
      const initial = this.textContent.trim();
      this.textContent = '';
      this.#track = document.createElement('span');
      this.#track.setAttribute('part', 'track');
      this.append(this.#track);
      if (this.hasAttribute('text') === false && initial !== '') this.setAttribute('text', initial);
    }
    this.render();
  }

  attributeChangedCallback() {
    if (this.isConnected && this.#track !== null) this.render();
  }

  render() {
    const text = (this.getAttribute('text') ?? '').toUpperCase();
    const status = coerceStatus(this.getAttribute('status') ?? 'bypass');
    this.style.setProperty('--gs-tape-color', `var(--gs-color-${status})`);
    const unit = `${text}  //  `;
    const pairs = text.length === 0 ? 0 : Math.ceil(120 / unit.length);
    this.#track.textContent = unit.repeat(pairs * 2);
  }
}

if (globalThis.customElements && customElements.get('gs-tape') === undefined) {
  customElements.define('gs-tape', GsTape);
}
```

- [ ] **Step 5: run the unit test to see it pass**

Run: `cd /Volumes/T7/ghost-signal && node --test test/unit/decode.test.js`

Expected: `# pass 4`, `# fail 0`.

- [ ] **Step 6: write the test page and the playwright test**

`test/e2e/pages/decode.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>gs-decode and gs-tape</title>
  <link rel="stylesheet" href="../../../src/tokens.css">
  <link rel="stylesheet" href="../../../src/base.css">
  <link rel="stylesheet" href="../../../src/fx.css">
  <script type="module">
    import { GS } from '../../../src/gs.js';
    import '../../../src/components/decode.js';
    import '../../../src/components/tape.js';
    window.GS = GS;
  </script>
</head>
<body>
  <gs-decode id="d" text="ghost signal"></gs-decode>
  <gs-decode id="inline">from content</gs-decode>
  <gs-tape id="t" text="zero chill detected"></gs-tape>
  <gs-tape id="t2" text="live" status="ok"></gs-tape>
</body>
</html>
```

`test/e2e/decode.spec.js`:

```js
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/test/e2e/pages/decode.html');
  await page.waitForSelector('gs-tape#t [part="track"]');
});

test('decode plays over the decode token and lands on the text', async ({ page }) => {
  const seen = await page.evaluate(() => new Promise((resolve) => {
    const el = document.getElementById('d');
    const frames = [];
    const mo = new MutationObserver(() => frames.push(el.textContent));
    mo.observe(el, { childList: true, characterData: true, subtree: true });
    el.addEventListener('gs-decode-done', () => {
      // the final tick's mutation record is still queued; take it before disconnecting
      for (const r of mo.takeRecords()) frames.push(r.target.textContent);
      frames.push(el.textContent);
      mo.disconnect();
      resolve({ frames, playing: el.hasAttribute('data-playing') });
    }, { once: true });
    window.GS.seed(1);
    el.setAttribute('text', 'zero chill');
  }));
  expect(seen.frames.at(-1)).toBe('zero chill');
  expect(seen.frames.length).toBeGreaterThan(2);
  expect(seen.frames[0]).not.toBe('zero chill');
  expect(seen.playing).toBe(false);
  await expect(page.locator('#inline')).toHaveText('from content');
});

test('decode is instant at glitch 0', async ({ page }) => {
  const result = await page.evaluate(() => {
    document.documentElement.dataset.glitch = '0';
    const el = document.getElementById('d');
    el.setAttribute('text', 'instant');
    return { text: el.textContent, playing: el.hasAttribute('data-playing') };
  });
  expect(result).toEqual({ text: 'instant', playing: false });
});

test('tape repeats caps text an even number of times and picks the status color', async ({ page }) => {
  const info = await page.evaluate(() => {
    const t = document.getElementById('t');
    const t2 = document.getElementById('t2');
    const track = t.querySelector('[part="track"]').textContent;
    return {
      count: track.split('ZERO CHILL DETECTED').length - 1,
      lower: track.includes('zero'),
      color: t.style.getPropertyValue('--gs-tape-color'),
      color2: t2.style.getPropertyValue('--gs-tape-color'),
      bg2: getComputedStyle(t2).backgroundColor,
      animated: t.querySelector('[part="track"]').getAnimations().length,
    };
  });
  expect(info.count).toBeGreaterThanOrEqual(2);
  expect(info.count % 2).toBe(0);
  expect(info.lower).toBe(false);
  expect(info.color).toBe('var(--gs-color-bypass)');
  expect(info.color2).toBe('var(--gs-color-ok)');
  expect(info.bg2).toBe('rgb(12, 192, 203)');
  expect(info.animated).toBe(1);
});

test('tape is static at glitch 0', async ({ page }) => {
  const animated = await page.evaluate(() => {
    document.documentElement.dataset.glitch = '0';
    return document.querySelector('#t [part="track"]').getAnimations().length;
  });
  expect(animated).toBe(0);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('decode is instant and nothing animates', async ({ page }) => {
    const result = await page.evaluate(() => {
      const el = document.getElementById('d');
      el.setAttribute('text', 'quiet');
      return { text: el.textContent, animations: document.getAnimations().length, glitch: document.documentElement.dataset.glitch };
    });
    expect(result).toEqual({ text: 'quiet', animations: 0, glitch: '0' });
  });
});
```

- [ ] **Step 7: run the e2e**

Run: `cd /Volumes/T7/ghost-signal && npm run e2e`

Expected: `14 passed` (1 smoke, 3 mosaic, 5 face, 5 decode).

- [ ] **Step 8: commit**

```bash
cd /Volumes/T7/ghost-signal
git add src/components/decode.js src/components/tape.js test/unit/decode.test.js test/e2e/decode.spec.js test/e2e/pages/decode.html
git commit -m "feat(decode): seeded scramble reveal and caps tape strip" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### task 11: microcopy, gs-window and gs-toast

**Files:**
- Create: `src/copy.js`, `src/components/window.js`, `src/components/toast.js`, `test/e2e/pages/window.html`
- Test: `test/unit/copy.test.js`, `test/e2e/window.spec.js`

**Interfaces:**
- Consumes: `coerceStatus`, `glitchOnce`, `moshOnce` (task 6), `GsDecode` (task 10), `gs-window` and `gs-toast` rules (task 5).
- Produces: `CORE_COPY`, `COPY_SLOTS`, `setCopy(slot, text)`, `copy(slot): string`, `resetCopy()`; class `GsWindow` with attribute `heading`, attribute `open`, methods `open()` and `close()`, event `gs-close`, parts `backdrop`, `frame`, `titlebar`, `title`, `close`, `body`; class `GsToast` with method `toast({ status, text, kaomoji }): HTMLElement`, listening for a document `gs-toast` CustomEvent with the same detail shape, parts `item`, `kaomoji`, `ok`. the flavor build (task 14) calls `setCopy`; containers (task 12) call `copy`.

- [ ] **Step 1: write the failing copy test**

`test/unit/copy.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CORE_COPY, COPY_SLOTS, setCopy, copy, resetCopy } from '../../src/copy.js';

test('the seven core slots match spec 5.3 exactly', () => {
  assert.deepEqual({ ...CORE_COPY }, {
    empty: 'nothing here yet. run something and the feed will wake up',
    loading: 'tailing…',
    error: 'that failed. check the path and try once',
    denyToast: 'denied. cute. try a quieter command XX',
    bypassToast: 'something got through. zero chill detected >:D',
    crashToast: 'bridge unreachable. not answering',
    confirm: 'done',
  });
  assert.deepEqual([...COPY_SLOTS], Object.keys(CORE_COPY));
  assert.ok(Object.isFrozen(CORE_COPY));
});

test('core copy is lowercase with no exclamation points, em dashes, oops, successfully or please', () => {
  for (const text of Object.values(CORE_COPY)) {
    assert.equal(text, text.toLowerCase().replace(/xx$/, 'XX').replace(/>:d$/, '>:D'), text);
    assert.doesNotMatch(text, /!|\u2014|oops|successfully|please/);
  }
});

test('setCopy overrides a known slot, rejects unknown slots and non-strings, resetCopy restores', () => {
  setCopy('empty', 'the spirits are quiet');
  assert.equal(copy('empty'), 'the spirits are quiet');
  assert.equal(copy('loading'), 'tailing…');
  assert.throws(() => setCopy('greeting', 'hi'), RangeError);
  assert.throws(() => setCopy('empty', 42), TypeError);
  assert.throws(() => copy('greeting'), RangeError);
  resetCopy();
  assert.equal(copy('empty'), CORE_COPY.empty);
});
```

- [ ] **Step 2: run the test to see it fail**

Run: `cd /Volumes/T7/ghost-signal && node --test test/unit/copy.test.js`

Expected: fails with `Cannot find module '.../src/copy.js'`.

- [ ] **Step 3: write src/copy.js**

```js
// core microcopy. lowercase, deadpan, dry. a flavor overrides a slot through setCopy;
// an unknown slot is a bug in the flavor, so it throws instead of inventing a slot >:[

export const CORE_COPY = Object.freeze({
  empty: 'nothing here yet. run something and the feed will wake up',
  loading: 'tailing…',
  error: 'that failed. check the path and try once',
  denyToast: 'denied. cute. try a quieter command XX',
  bypassToast: 'something got through. zero chill detected >:D',
  crashToast: 'bridge unreachable. not answering',
  confirm: 'done',
});

export const COPY_SLOTS = Object.freeze(Object.keys(CORE_COPY));

const overrides = new Map();

function assertSlot(slot) {
  if (Object.hasOwn(CORE_COPY, slot) === false) {
    throw new RangeError(`ghost-signal: unknown copy slot "${slot}". slots: ${COPY_SLOTS.join(', ')}`);
  }
}

export function setCopy(slot, text) {
  assertSlot(slot);
  if (typeof text !== 'string') throw new TypeError(`ghost-signal: copy for "${slot}" must be a string`);
  overrides.set(slot, text);
}

export function copy(slot) {
  assertSlot(slot);
  return overrides.get(slot) ?? CORE_COPY[slot];
}

export function resetCopy() {
  overrides.clear();
}
```

- [ ] **Step 4: run the test to see it pass**

Run: `cd /Volumes/T7/ghost-signal && node --test test/unit/copy.test.js`

Expected: `# pass 3`, `# fail 0`.

- [ ] **Step 5: write src/components/window.js**

```js
// retro os popup. modal, traps tab, escape closes, title bar in the display font.
// the element's own children become the body on first connect
const Base = globalThis.HTMLElement ?? class {};

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export class GsWindow extends Base {
  static observedAttributes = ['open', 'heading'];

  #built = false;
  #frame = null;
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
    this.#closeButton.textContent = 'x';
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
    this.#restore = document.activeElement;
    document.addEventListener('keydown', this.#onKey);
    const inBody = this.#focusables().filter((el) => this.#body.contains(el));
    (inBody[0] ?? this.#closeButton).focus();
  }

  #deactivate() {
    document.removeEventListener('keydown', this.#onKey);
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
```

`Math.random` here only mints a dom id for `aria-labelledby`; it never touches pixels or timing, so the determinism rule (which is about `gs-mosaic`, `gs-decode` and ambient) is untouched.

- [ ] **Step 6: write src/components/toast.js**

```js
// toast stack. one lowercase line through gs-decode, optional trailing kaomoji, left bar in the
// status color. deny and bypass stick until dismissed; everything else leaves after 4s
import { coerceStatus, glitchOnce, moshOnce } from '../gs.js';
import './decode.js';

const Base = globalThis.HTMLElement ?? class {};
const STICKY = new Set(['deny', 'bypass']);
const AUTO_DISMISS_MS = 4000;

export class GsToast extends Base {
  #onEvent = (e) => this.toast(e.detail ?? {});

  connectedCallback() {
    this.setAttribute('aria-live', 'polite');
    document.addEventListener('gs-toast', this.#onEvent);
  }

  disconnectedCallback() {
    document.removeEventListener('gs-toast', this.#onEvent);
  }

  toast({ status = 'idle', text = '', kaomoji = '' } = {}) {
    const s = coerceStatus(status);
    const sticky = STICKY.has(s);
    const item = document.createElement('div');
    item.setAttribute('part', 'item');
    item.dataset.status = s;
    item.setAttribute('role', sticky ? 'alert' : 'status');

    const line = document.createElement('gs-decode');
    line.setAttribute('text', text);
    item.append(line);

    if (kaomoji !== '') {
      const k = document.createElement('span');
      k.setAttribute('part', 'kaomoji');
      k.textContent = kaomoji;
      item.append(k);
    }

    if (sticky) {
      const ok = document.createElement('button');
      ok.setAttribute('part', 'ok');
      ok.setAttribute('data-variant', 'ghost');
      ok.textContent = 'ok';
      ok.addEventListener('click', () => item.remove());
      item.append(ok);
    } else {
      setTimeout(() => item.remove(), AUTO_DISMISS_MS);
    }

    this.append(item);
    if (s === 'bypass') glitchOnce(item);
    if (s === 'crash') moshOnce(item);
    return item;
  }
}

if (globalThis.customElements && customElements.get('gs-toast') === undefined) {
  customElements.define('gs-toast', GsToast);
}
```

- [ ] **Step 7: write the test page and the playwright test**

`test/e2e/pages/window.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>gs-window and gs-toast</title>
  <link rel="stylesheet" href="../../../src/tokens.css">
  <link rel="stylesheet" href="../../../src/base.css">
  <link rel="stylesheet" href="../../../src/fx.css">
  <script type="module">
    import { GS } from '../../../src/gs.js';
    import '../../../src/components/window.js';
    import '../../../src/components/toast.js';
    window.GS = GS;
  </script>
</head>
<body>
  <button id="opener">open</button>
  <gs-window id="w" heading="confirm">
    <p>run it?</p>
    <button id="yes" data-variant="primary">yes</button>
    <button id="no">no</button>
  </gs-window>
  <gs-toast id="toasts"></gs-toast>
</body>
</html>
```

`test/e2e/window.spec.js`:

```js
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/test/e2e/pages/window.html');
  await page.waitForSelector('gs-window [part="frame"]');
});

test('window opens, moves children into the body, traps tab and closes on escape with gs-close', async ({ page }) => {
  await page.locator('#opener').focus();
  await page.evaluate(() => document.getElementById('w').open());
  await expect(page.locator('#w')).toHaveAttribute('open', '');
  await expect(page.locator('#w [part="body"] #yes')).toBeVisible();
  await expect(page.locator('#yes')).toBeFocused();
  await expect(page.locator('#w [part="title"]')).toHaveText('confirm');
  expect(await page.locator('#w [part="titlebar"]').evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Doto');
  await page.keyboard.press('Tab');
  await expect(page.locator('#no')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#w [part="close"]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#yes')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#w [part="close"]')).toBeFocused();
  const closed = page.evaluate(() => new Promise((r) => document.getElementById('w').addEventListener('gs-close', () => r(true), { once: true })));
  await page.keyboard.press('Escape');
  expect(await closed).toBe(true);
  await expect(page.locator('#w')).not.toHaveAttribute('open', '');
  await expect(page.locator('#opener')).toBeFocused();
});

test('the close button and the backdrop both close the window', async ({ page }) => {
  await page.evaluate(() => document.getElementById('w').open());
  await page.locator('#w [part="close"]').click();
  await expect(page.locator('#w')).not.toHaveAttribute('open', '');
  await page.evaluate(() => document.getElementById('w').setAttribute('open', ''));
  await page.locator('#w [part="backdrop"]').click({ position: { x: 5, y: 5 } });
  await expect(page.locator('#w')).not.toHaveAttribute('open', '');
});

test('ok toasts are role=status, decode their text and leave after 4s', async ({ page }) => {
  await page.evaluate(() => document.getElementById('toasts').toast({ status: 'ok', text: 'done', kaomoji: '(｡◕‿↼)' }));
  const item = page.locator('#toasts [part="item"]');
  await expect(item).toHaveAttribute('role', 'status');
  await expect(item).toHaveAttribute('data-status', 'ok');
  await expect(item.locator('gs-decode')).toHaveText('done');
  await expect(item.locator('[part="kaomoji"]')).toHaveText('(｡◕‿↼)');
  expect(await item.evaluate((el) => getComputedStyle(el).borderLeftColor)).toBe('rgb(12, 192, 203)');
  await expect(item).toHaveCount(0, { timeout: 6000 });
});

test('deny and bypass toasts are role=alert with an ok button and stay until dismissed', async ({ page }) => {
  const glitching = await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('gs-toast', { detail: { status: 'deny', text: 'denied. cute. try a quieter command XX' } }));
    const item = document.getElementById('toasts').toast({ status: 'bypass', text: 'something got through' });
    return item.classList.contains('gs-glitch');
  });
  expect(glitching).toBe(true);
  const items = page.locator('#toasts [part="item"]');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toHaveAttribute('role', 'alert');
  await expect(items.nth(0)).toHaveAttribute('data-status', 'deny');
  expect(await items.nth(0).evaluate((el) => getComputedStyle(el).borderLeftColor)).toBe('rgb(255, 92, 77)');
  await page.waitForTimeout(4500);
  await expect(items).toHaveCount(2);
  await items.nth(0).locator('[part="ok"]').click();
  await expect(items).toHaveCount(1);
});

test('an unknown status becomes warn with a console error', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.evaluate(() => document.getElementById('toasts').toast({ status: 'exploded', text: 'hm' }));
  await expect(page.locator('#toasts [part="item"]')).toHaveAttribute('data-status', 'warn');
  expect(errors.some((e) => e.includes('unknown status'))).toBe(true);
});
```

- [ ] **Step 8: run the e2e**

Run: `cd /Volumes/T7/ghost-signal && npm run e2e`

Expected: `19 passed`.

- [ ] **Step 9: commit**

```bash
cd /Volumes/T7/ghost-signal
git add src/copy.js src/components/window.js src/components/toast.js test/unit/copy.test.js test/e2e/window.spec.js test/e2e/pages/window.html
git commit -m "feat(chrome): core copy, modal window and status toasts" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### task 12: gs-row, the state containers and gs-wallpaper

**Files:**
- Create: `src/components/row.js`, `src/components/container.js`, `src/components/empty.js`, `src/components/error.js`, `src/components/splash.js`, `src/components/wallpaper.js`, `test/e2e/pages/row.html`
- Test: `test/unit/row.test.js`, `test/e2e/row.spec.js`

**Interfaces:**
- Consumes: `coerceStatus`, `flareOnce`, `glitchLevel`, `reducedMotion`, `getSprite`, `getIcon`, `GsWallpaperPlacementError` (task 6), `copy` (task 11), `GsDecode` (task 10), `GsMosaic` (task 7), the `gs-row`, `gs-empty`, `gs-error`, `gs-splash`, `gs-wallpaper` and `.gs-dither-strong` rules (task 5).
- Produces: class `GsRow` (attributes `status` incl. `loose`, `label`, `command`, `sigil`; parts `head`, `sigil`, `label`, `command`, `detail`; method `toggle(force?)`; event `gs-row-toggle`); class `GsContainer` with static `slot` and `defineContainer(tag, slot)`; `GsEmpty`, `GsError`, `GsSplash`; `tileGrid(sprite, cols, rows, offset): string[]` and class `GsWallpaper` (attributes `sprite`, `cols` default 32, `rows` default 12, reflected `data-step`).

- [ ] **Step 1: write the failing unit test**

`test/unit/row.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GsRow } from '../../src/components/row.js';
import { GsContainer, defineContainer } from '../../src/components/container.js';
import { GsEmpty } from '../../src/components/empty.js';
import { GsError } from '../../src/components/error.js';
import { GsSplash } from '../../src/components/splash.js';
import { tileGrid, GsWallpaper } from '../../src/components/wallpaper.js';

test('every module imports in node', () => {
  for (const c of [GsRow, GsContainer, GsEmpty, GsError, GsSplash, GsWallpaper]) assert.equal(typeof c, 'function');
  assert.equal(typeof defineContainer, 'function');
  assert.equal(GsEmpty.slot, 'empty');
  assert.equal(GsError.slot, 'error');
  assert.equal(GsSplash.slot, 'loading');
});

test('tileGrid repeats a sprite across the field and shifts by offset', () => {
  const sprite = ['#..', '.#.'];
  assert.deepEqual(tileGrid(sprite, 7, 3, 0), ['#..#..#', '.#..#..', '#..#..#']);
  assert.deepEqual(tileGrid(sprite, 7, 2, 1), ['..#..#.', '#..#..#']);
  assert.deepEqual(tileGrid(sprite, 3, 2, 3), sprite);
});
```

- [ ] **Step 2: run the test to see it fail**

Run: `cd /Volumes/T7/ghost-signal && node --test test/unit/row.test.js`

Expected: fails with `Cannot find module '.../src/components/row.js'`.

- [ ] **Step 3: write src/components/row.js**

```js
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
```

- [ ] **Step 4: write the container base and the three containers**

`src/components/container.js`:

```js
// shared base for gs-empty, gs-error and gs-splash: strong dither and a default decode line
// from the copy slot. these three are the only places gs-wallpaper may live
import { copy } from '../copy.js';
import './decode.js';

const Base = globalThis.HTMLElement ?? class {};

export class GsContainer extends Base {
  static slot = 'empty';

  #built = false;

  connectedCallback() {
    if (this.#built) return;
    this.#built = true;
    this.classList.add('gs-dither-strong');
    if (this.querySelector('[part="copy"]') === null) {
      const line = document.createElement('gs-decode');
      line.setAttribute('part', 'copy');
      line.setAttribute('text', copy(this.constructor.slot));
      this.append(line);
    }
  }
}

export function defineContainer(tag, slot) {
  const cls = class extends GsContainer {
    static slot = slot;
  };
  if (globalThis.customElements && customElements.get(tag) === undefined) customElements.define(tag, cls);
  return cls;
}
```

`src/components/empty.js`:

```js
import { defineContainer } from './container.js';

export const GsEmpty = defineContainer('gs-empty', 'empty');
```

`src/components/error.js`:

```js
import { defineContainer } from './container.js';

export const GsError = defineContainer('gs-error', 'error');
```

`src/components/splash.js`:

```js
import { defineContainer } from './container.js';

export const GsSplash = defineContainer('gs-splash', 'loading');
```

- [ ] **Step 5: write src/components/wallpaper.js**

```js
// tiled sprite field behind empty, error and splash states. steps one column every 250ms
// (4fps) at glitch 1+. anywhere else it throws: wallpaper never sits behind data 💀
import { GsWallpaperPlacementError, getSprite, getIcon, glitchLevel, reducedMotion } from '../gs.js';
import './mosaic.js';

const Base = globalThis.HTMLElement ?? class {};
const STEP_MS = 250;
const HOSTS = 'gs-empty, gs-error, gs-splash';

export function tileGrid(sprite, cols, rows, offset = 0) {
  const sw = sprite[0].length;
  const sh = sprite.length;
  return Array.from({ length: rows }, (_, y) => (
    Array.from({ length: cols }, (_, x) => sprite[y % sh][(x + offset) % sw]).join('')
  ));
}

export class GsWallpaper extends Base {
  #mosaic = null;
  #timer = 0;
  #offset = 0;

  connectedCallback() {
    if (this.closest(HOSTS) === null) {
      throw new GsWallpaperPlacementError('gs-wallpaper mounts only inside gs-empty, gs-error or gs-splash');
    }
    const name = this.getAttribute('sprite') ?? '';
    const sprite = getSprite(name) ?? getIcon(name);
    if (sprite === undefined) throw new RangeError(`ghost-signal: no sprite or icon registered as "${name}"`);
    if (this.#mosaic === null) {
      this.#mosaic = document.createElement('gs-mosaic');
      this.#mosaic.setAttribute('cols', this.getAttribute('cols') ?? '32');
      this.#mosaic.setAttribute('rows', this.getAttribute('rows') ?? '12');
      this.#mosaic.setAttribute('cell', '4');
      this.#mosaic.setAttribute('gap', '1');
      this.append(this.#mosaic);
    }
    this.#draw(sprite);
    clearInterval(this.#timer);
    if (glitchLevel() !== '0' && reducedMotion() === false) {
      this.#timer = setInterval(() => {
        this.#offset += 1;
        this.#draw(sprite);
      }, STEP_MS);
    }
  }

  disconnectedCallback() {
    clearInterval(this.#timer);
  }

  #draw(sprite) {
    const cols = Number(this.#mosaic.getAttribute('cols'));
    const rows = Number(this.#mosaic.getAttribute('rows'));
    this.#mosaic.grid = tileGrid(sprite, cols, rows, this.#offset);
    this.dataset.step = String(this.#offset);
  }
}

if (globalThis.customElements && customElements.get('gs-wallpaper') === undefined) {
  customElements.define('gs-wallpaper', GsWallpaper);
}
```

- [ ] **Step 6: run the unit test to see it pass**

Run: `cd /Volumes/T7/ghost-signal && node --test test/unit/row.test.js`

Expected: `# pass 2`, `# fail 0`.

- [ ] **Step 7: write the test page and the playwright test**

`test/e2e/pages/row.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>gs-row and containers</title>
  <link rel="stylesheet" href="../../../src/tokens.css">
  <link rel="stylesheet" href="../../../src/base.css">
  <link rel="stylesheet" href="../../../src/fx.css">
  <script type="module">
    // first module: register the sprite before any element that needs it is defined
    import { GS, registerSprite } from '../../../src/gs.js';
    registerSprite('checks', ['#..', '.#.', '..#']);
    window.GS = GS;
  </script>
  <script type="module">
    // second module: defining gs-wallpaper upgrades the static one in the body, which reads the sprite
    import '../../../src/components/row.js';
    import '../../../src/components/empty.js';
    import '../../../src/components/error.js';
    import '../../../src/components/splash.js';
    import '../../../src/components/wallpaper.js';
    window.ready = true;
  </script>
</head>
<body>
  <gs-row id="r1" status="ok" label="cargo test" command="cargo test --workspace" sigil="+">42 passed</gs-row>
  <gs-row id="r2" status="loose" label="listing" command="ls -la"></gs-row>
  <gs-row id="r3" status="haunted" label="unknown"></gs-row>
  <gs-empty id="empty"><gs-wallpaper id="wp" sprite="checks" cols="9" rows="3"></gs-wallpaper></gs-empty>
  <gs-error id="error"></gs-error>
  <gs-splash id="splash"><span part="copy">custom line</span></gs-splash>
  <div class="gs-panel" id="panel"></div>
</body>
</html>
```

`test/e2e/row.spec.js`:

```js
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/test/e2e/pages/row.html');
  await page.waitForFunction(() => window.ready === true);
  await page.waitForSelector('#r1 [part="head"]');
});

test('a row renders its parts and toggles detail by click, enter and space', async ({ page }) => {
  const head = page.locator('#r1 [part="head"]');
  const detail = page.locator('#r1 [part="detail"]');
  await expect(page.locator('#r1 [part="sigil"]')).toHaveText('+');
  await expect(page.locator('#r1 [part="label"]')).toHaveText('cargo test');
  await expect(page.locator('#r1 [part="command"]')).toHaveText('cargo test --workspace');
  await expect(head).toHaveAttribute('aria-expanded', 'false');
  await expect(detail).toBeHidden();
  await head.click();
  await expect(head).toHaveAttribute('aria-expanded', 'true');
  await expect(detail).toBeVisible();
  await expect(detail).toHaveText('42 passed');
  await head.focus();
  await page.keyboard.press('Enter');
  await expect(head).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Space');
  await expect(head).toHaveAttribute('aria-expanded', 'true');
  expect(await page.locator('#r1').evaluate((el) => getComputedStyle(el).borderLeftColor)).toBe('rgb(12, 192, 203)');
});

test('loose rows draw a dashed faint bar and the ◌ sigil; unknown statuses become warn', async ({ page }) => {
  await expect(page.locator('#r2 [part="sigil"]')).toHaveText('◌');
  const style = await page.locator('#r2').evaluate((el) => [getComputedStyle(el).borderLeftStyle, getComputedStyle(el).borderLeftColor]);
  expect(style).toEqual(['dashed', 'rgb(58, 62, 65)']);
  await expect(page.locator('#r3')).toHaveAttribute('status', 'warn');
});

test('deny rows flare on connect and at glitch 2 the label decodes', async ({ page }) => {
  const flared = await page.evaluate(() => {
    const row = document.createElement('gs-row');
    row.setAttribute('status', 'deny');
    row.setAttribute('label', 'blocked');
    document.body.append(row);
    return row.classList.contains('gs-flare');
  });
  expect(flared).toBe(true);
  await page.evaluate(() => {
    document.documentElement.dataset.glitch = '2';
    const row = document.createElement('gs-row');
    row.id = 'r4';
    row.setAttribute('status', 'bypass');
    row.setAttribute('label', 'through');
    document.body.append(row);
  });
  await expect(page.locator('#r4 [part="label"] gs-decode')).toHaveText('through');
});

test('containers carry the strong dither and the core copy unless given their own', async ({ page }) => {
  for (const id of ['empty', 'error', 'splash']) await expect(page.locator(`#${id}`)).toHaveClass(/gs-dither-strong/);
  await expect(page.locator('#empty gs-decode[part="copy"]')).toHaveText('nothing here yet. run something and the feed will wake up');
  await expect(page.locator('#error gs-decode[part="copy"]')).toHaveText('that failed. check the path and try once');
  await expect(page.locator('#splash [part="copy"]')).toHaveText('custom line');
  await expect(page.locator('#splash gs-decode')).toHaveCount(0);
});

test('wallpaper tiles the registered sprite and steps at 4fps at glitch 1', async ({ page }) => {
  await page.waitForSelector('#wp gs-mosaic[data-drawn]');
  const grid = await page.evaluate(() => document.querySelector('#wp gs-mosaic').grid);
  expect(grid.length).toBe(3);
  expect(grid[0].length).toBe(9);
  const step0 = Number(await page.locator('#wp').getAttribute('data-step'));
  await page.waitForTimeout(600);
  const step1 = Number(await page.locator('#wp').getAttribute('data-step'));
  expect(step1).toBeGreaterThanOrEqual(step0 + 2);
});

test('wallpaper outside the three containers throws GsWallpaperPlacementError', async ({ page }) => {
  const [err] = await Promise.all([
    page.waitForEvent('pageerror'),
    page.evaluate(() => {
      const wp = document.createElement('gs-wallpaper');
      wp.setAttribute('sprite', 'checks');
      document.getElementById('panel').append(wp);
    }),
  ]);
  expect(err.name).toBe('GsWallpaperPlacementError');
  expect(err.message).toContain('gs-wallpaper mounts only inside');
  expect(await page.locator('#panel gs-wallpaper gs-mosaic').count()).toBe(0);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('wallpaper does not step and deny rows do not flare', async ({ page }) => {
    await page.waitForSelector('#wp gs-mosaic[data-drawn]');
    await page.waitForTimeout(600);
    expect(await page.locator('#wp').getAttribute('data-step')).toBe('0');
    const flared = await page.evaluate(() => {
      const row = document.createElement('gs-row');
      row.setAttribute('status', 'deny');
      document.body.append(row);
      return row.classList.contains('gs-flare');
    });
    expect(flared).toBe(false);
  });
});
```

an exception inside `connectedCallback` is a custom element reaction: the browser reports it as a page error and `append()` returns normally, so a `try/catch` around the append would see nothing. playwright's `pageerror` event is the only place the throw surfaces. the misplaced element stays in the dom, but its callback bailed before creating a mosaic, so the last assertion proves nothing drew.

- [ ] **Step 8: run the e2e**

Run: `cd /Volumes/T7/ghost-signal && npm run e2e`

Expected: `26 passed`.

- [ ] **Step 9: commit**

```bash
cd /Volumes/T7/ghost-signal
git add src/components/row.js src/components/container.js src/components/empty.js src/components/error.js src/components/splash.js src/components/wallpaper.js test/unit/row.test.js test/e2e/row.spec.js test/e2e/pages/row.html
git commit -m "feat(rows): timeline row, state containers and gated wallpaper" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### task 13: gs-palette

**Files:**
- Create: `src/components/palette.js`, `test/e2e/pages/palette.html`
- Test: `test/unit/palette.test.js`, `test/e2e/palette.spec.js`

**Interfaces:**
- Consumes: `getCommands` (task 6), the `gs-palette` rules (task 5).
- Produces: `filterCommands(list, query): list`; class `GsPalette` with attribute `open`, methods `open()`, `close()`, `refresh()`, `run(index?)`, parts `overlay`, `box`, `input`, `list`, `row`; document event `gs-command` with `detail: { id, app }`. the gallery (task 15) mounts one and the probe test drives it.

- [ ] **Step 1: write the failing unit test**

`test/unit/palette.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterCommands, GsPalette } from '../../src/components/palette.js';

const list = [
  { id: 'probe.ping', title: 'ping the bridge', shortcut: 'p', app: 'probe' },
  { id: 'probe.tests', title: 'run tests', shortcut: '', app: 'probe' },
  { id: 'shell.theme', title: 'toggle theme', shortcut: 't', app: 'shell' },
];

test('the module imports in node', () => {
  assert.equal(typeof GsPalette, 'function');
});

test('filterCommands matches a case-insensitive substring of title or id and keeps order', () => {
  assert.deepEqual(filterCommands(list, ''), list);
  assert.deepEqual(filterCommands(list, '  '), list);
  assert.deepEqual(filterCommands(list, 'THE').map((c) => c.id), ['probe.ping', 'shell.theme']);
  assert.deepEqual(filterCommands(list, 'tests').map((c) => c.id), ['probe.tests']);
  assert.deepEqual(filterCommands(list, 'shell.').map((c) => c.id), ['shell.theme']);
  assert.deepEqual(filterCommands(list, 'zzz'), []);
});
```

- [ ] **Step 2: run the test to see it fail**

Run: `cd /Volumes/T7/ghost-signal && node --test test/unit/palette.test.js`

Expected: fails with `Cannot find module '.../src/components/palette.js'`.

- [ ] **Step 3: write src/components/palette.js**

```js
// command palette. meta+k or ctrl+k toggles it, substring filter over every registered manifest,
// arrows move, enter dispatches gs-command on document and closes, escape closes
import { getCommands } from '../gs.js';

const Base = globalThis.HTMLElement ?? class {};

export function filterCommands(list, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (q === '') return list;
  return list.filter((c) => c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
}

export class GsPalette extends Base {
  #built = false;
  #input = null;
  #list = null;
  #items = [];
  #index = 0;
  #onKey = (e) => this.#globalKey(e);

  connectedCallback() {
    if (this.#built === false) this.#build();
    document.addEventListener('keydown', this.#onKey);
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this.#onKey);
  }

  #globalKey(e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (this.hasAttribute('open')) this.close();
      else this.open();
    }
  }

  #build() {
    const overlay = document.createElement('div');
    overlay.setAttribute('part', 'overlay');
    overlay.addEventListener('click', () => this.close());

    const box = document.createElement('div');
    box.setAttribute('part', 'box');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'commands');

    this.#input = document.createElement('input');
    this.#input.setAttribute('part', 'input');
    this.#input.type = 'text';
    this.#input.placeholder = 'run a command';
    this.#input.spellcheck = false;
    this.#input.setAttribute('aria-autocomplete', 'list');
    this.#input.addEventListener('input', () => this.refresh());
    this.#input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.#move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this.#move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); this.run(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    });

    this.#list = document.createElement('ul');
    this.#list.setAttribute('part', 'list');
    this.#list.setAttribute('role', 'listbox');

    box.append(this.#input, this.#list);
    this.append(overlay, box);
    this.#built = true;
  }

  open() {
    this.setAttribute('open', '');
    this.#input.value = '';
    this.refresh();
    this.#input.focus();
  }

  close() {
    this.removeAttribute('open');
  }

  refresh() {
    this.#items = filterCommands(getCommands(), this.#input.value);
    this.#list.textContent = '';
    this.#items.forEach((c, i) => {
      const li = document.createElement('li');
      li.setAttribute('part', 'row');
      li.setAttribute('role', 'option');
      li.dataset.id = c.id;
      li.dataset.app = c.app;
      const title = document.createElement('span');
      title.textContent = c.title;
      const kbd = document.createElement('kbd');
      kbd.textContent = c.shortcut;
      li.append(title, kbd);
      li.addEventListener('click', () => this.run(i));
      this.#list.append(li);
    });
    this.#index = Math.min(this.#index, Math.max(0, this.#items.length - 1));
    this.#paint();
  }

  #move(delta) {
    const n = this.#items.length;
    if (n === 0) return;
    this.#index = (this.#index + delta + n) % n;
    this.#paint();
  }

  #paint() {
    [...this.#list.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === this.#index)));
  }

  run(index = this.#index) {
    const c = this.#items[index];
    if (c === undefined) return null;
    document.dispatchEvent(new CustomEvent('gs-command', { detail: { id: c.id, app: c.app } }));
    this.close();
    return c;
  }
}

if (globalThis.customElements && customElements.get('gs-palette') === undefined) {
  customElements.define('gs-palette', GsPalette);
}
```

- [ ] **Step 4: run the unit test to see it pass**

Run: `cd /Volumes/T7/ghost-signal && node --test test/unit/palette.test.js`

Expected: `# pass 2`, `# fail 0`.

- [ ] **Step 5: write the test page and the playwright test**

`test/e2e/pages/palette.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>gs-palette</title>
  <link rel="stylesheet" href="../../../src/tokens.css">
  <link rel="stylesheet" href="../../../src/base.css">
  <link rel="stylesheet" href="../../../src/fx.css">
  <script type="module">
    import { registerCommands } from '../../../src/gs.js';
    import '../../../src/components/palette.js';
    registerCommands('probe', [
      { id: 'probe.ping', title: 'ping the bridge', shortcut: 'p' },
      { id: 'probe.tests', title: 'run tests' },
    ]);
    registerCommands('shell', [{ id: 'shell.theme', title: 'toggle theme', shortcut: 't' }]);
    window.ready = true;
  </script>
</head>
<body>
  <gs-palette id="p"></gs-palette>
</body>
</html>
```

`test/e2e/palette.spec.js`:

```js
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/test/e2e/pages/palette.html');
  await page.waitForFunction(() => window.ready === true);
});

test('ctrl+k and meta+k toggle the palette, the overlay sits at 60% void', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await expect(page.locator('#p')).toHaveAttribute('open', '');
  await expect(page.locator('#p [part="input"]')).toBeFocused();
  expect(await page.locator('#p [part="overlay"]').evaluate((el) => getComputedStyle(el).opacity)).toBe('0.6');
  await page.keyboard.press('Meta+k');
  await expect(page.locator('#p')).not.toHaveAttribute('open', '');
});

test('rows list every registered command, filter by substring and move with arrows', async ({ page }) => {
  await page.evaluate(() => document.getElementById('p').open());
  const rows = page.locator('#p [part="row"]');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.type('the');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveAttribute('data-id', 'probe.ping');
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(0)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowUp');
  await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true');
});

test('enter dispatches gs-command with id and app on document and closes; escape closes', async ({ page }) => {
  const detail = page.evaluate(() => new Promise((r) => document.addEventListener('gs-command', (e) => r(e.detail), { once: true })));
  await page.evaluate(() => document.getElementById('p').open());
  await page.keyboard.type('theme');
  await page.keyboard.press('Enter');
  expect(await detail).toEqual({ id: 'shell.theme', app: 'shell' });
  await expect(page.locator('#p')).not.toHaveAttribute('open', '');
  await page.evaluate(() => document.getElementById('p').open());
  await page.keyboard.press('Escape');
  await expect(page.locator('#p')).not.toHaveAttribute('open', '');
});
```

- [ ] **Step 6: run the e2e**

Run: `cd /Volumes/T7/ghost-signal && npm run e2e`

Expected: `29 passed`.

- [ ] **Step 7: commit**

```bash
cd /Volumes/T7/ghost-signal
git add src/components/palette.js test/unit/palette.test.js test/e2e/palette.spec.js test/e2e/pages/palette.html
git commit -m "feat(palette): command palette over registered manifests" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```


---

### task 14: schemas, validator and the ghost-signal cli

**Files:**
- Create: `schema/app.v1.json`, `schema/flavor.v1.json`, `scripts/lib/schema.js`, `scripts/lib/cli.js`, `scripts/ghost-signal.js`, fixtures under `test/unit/fixtures/`
- Test: `test/unit/schema.test.js`, `test/unit/cli.test.js`

**Interfaces:**
- Consumes: `loadTokens` (task 2), `ratio` (task 4), `parseGrid`, `CORE_EXPRESSION_NAMES` (task 6), `package.json` `version`. the seven copy slots are enforced by the flavor schema, so `cli.js` does not import `COPY_SLOTS`.
- Produces: `validate(schema, value): string[]` (empty means valid), `satisfies(range, version): boolean`; `check(file): Promise<{ ok, kind, errors }>`, `flavorBuild(file, { gsImport }): Promise<{ css, js, id }>`; the `ghost-signal` bin with `check <file>`, `flavor check <file>`, `flavor build <file> [--out <dir>] [--gs-import <spec>]`, exit codes 0 ok, 1 check failed, 2 usage or io error. task 15 runs `flavor build` for the probe from `gen.js`.

- [ ] **Step 1: write the two schemas**

`schema/app.v1.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://ghost-signal.local/schema/app.v1.json",
  "title": "ghost signal app manifest v1",
  "type": "object",
  "required": ["id", "name", "version", "ghostSignal", "entry", "status", "commands"],
  "additionalProperties": false,
  "properties": {
    "$schema": { "type": "string" },
    "id": { "type": "string", "pattern": "^[a-z0-9-]+$" },
    "name": { "type": "string" },
    "version": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
    "ghostSignal": { "type": "string", "pattern": "^(\\^\\d+\\.\\d+|~\\d+\\.\\d+\\.\\d+|\\d+\\.\\d+\\.\\d+)$" },
    "flavor": { "type": "string" },
    "entry": { "type": "string" },
    "status": {
      "type": "object",
      "required": ["kind", "name"],
      "additionalProperties": false,
      "properties": {
        "kind": { "enum": ["event"] },
        "name": { "type": "string" }
      }
    },
    "commands": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "title"],
        "additionalProperties": false,
        "properties": {
          "id": { "type": "string", "pattern": "^[a-z0-9-]+\\.[a-z0-9.-]+$" },
          "title": { "type": "string" },
          "shortcut": { "type": "string" }
        }
      }
    },
    "icon": { "type": "string" }
  }
}
```

`schema/flavor.v1.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://ghost-signal.local/schema/flavor.v1.json",
  "title": "ghost signal flavor v1",
  "type": "object",
  "required": ["app", "ghostSignal"],
  "additionalProperties": false,
  "properties": {
    "$schema": { "type": "string" },
    "app": { "type": "string", "pattern": "^[a-z0-9-]+$" },
    "ghostSignal": { "type": "string", "pattern": "^(\\^\\d+\\.\\d+|~\\d+\\.\\d+\\.\\d+|\\d+\\.\\d+\\.\\d+)$" },
    "accent2": {
      "type": "object",
      "required": ["dark", "light"],
      "additionalProperties": false,
      "properties": {
        "dark": { "type": "string", "pattern": "^#[0-9a-f]{6}$" },
        "light": { "type": "string", "pattern": "^#[0-9a-f]{6}$" }
      }
    },
    "display": { "type": "string" },
    "texture": { "enum": ["dither", "none"] },
    "sprite": { "type": "string" },
    "expressions": { "type": "object", "additionalProperties": { "type": "string" } },
    "icons": { "type": "object", "additionalProperties": { "type": "string" } },
    "copy": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "empty": { "type": "string" },
        "loading": { "type": "string" },
        "error": { "type": "string" },
        "denyToast": { "type": "string" },
        "bypassToast": { "type": "string" },
        "crashToast": { "type": "string" },
        "confirm": { "type": "string" }
      }
    }
  }
}
```

`additionalProperties: false` at the top level is what rejects every locked key (`accent`, `void`, `text`, `ok`, `warn`, `deny`, `bypass`, glitch colors, motion, radius, any other font).

- [ ] **Step 2: write the failing schema test**

`test/unit/schema.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validate, satisfies } from '../../scripts/lib/schema.js';

const flavorSchema = JSON.parse(await readFile(new URL('../../schema/flavor.v1.json', import.meta.url), 'utf8'));
const appSchema = JSON.parse(await readFile(new URL('../../schema/app.v1.json', import.meta.url), 'utf8'));

test('validate covers type, required, enum, pattern, properties, additionalProperties and items', () => {
  const schema = {
    type: 'object',
    required: ['id', 'list'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', pattern: '^[a-z]+
 },
      kind: { enum: ['a', 'b'] },
      list: { type: 'array', items: { type: 'number' } },
      map: { type: 'object', additionalProperties: { type: 'string' } },
    },
  };
  assert.deepEqual(validate(schema, { id: 'ok', kind: 'a', list: [1], map: { x: 'y' } }), []);
  const errors = validate(schema, { id: 'NO', kind: 'c', list: ['1'], map: { x: 1 }, extra: true });
  assert.ok(errors.some((e) => e.startsWith('$.id: does not match')));
  assert.ok(errors.some((e) => e.startsWith('$.kind: must be one of a, b')));
  assert.ok(errors.some((e) => e.startsWith('$.list[0]: expected number, got string')));
  assert.ok(errors.some((e) => e.startsWith('$.map.x: expected string, got number')));
  assert.ok(errors.some((e) => e.startsWith('$.extra: not allowed')));
  assert.deepEqual(validate(schema, {}), ['$.id: required', '$.list: required']);
  assert.deepEqual(validate({ type: 'object' }, null), ['$: expected object, got null']);
});

test('the flavor schema rejects locked keys and accepts the allowed set', () => {
  const good = {
    app: 'probe', ghostSignal: '^0.1', accent2: { dark: '#b78bff', light: '#6b2fc9' }, display: 'Georgia, serif',
    texture: 'dither', sprite: './sprites/probe.grid', expressions: { probing: './expressions/probing.grid' },
    icons: { sigil: './icons/sigil.grid' }, copy: { empty: 'quiet' },
  };
  assert.deepEqual(validate(flavorSchema, good), []);
  assert.deepEqual(validate(flavorSchema, { ...good, accent: '#00ff00' }), ['$.accent: not allowed']);
  assert.deepEqual(validate(flavorSchema, { ...good, copy: { greeting: 'hi' } }), ['$.copy.greeting: not allowed']);
  assert.deepEqual(validate(flavorSchema, { ...good, accent2: '#b78bff' }), ['$.accent2: expected object, got string']);
  assert.deepEqual(validate(flavorSchema, { ...good, texture: 'grain' }), ['$.texture: must be one of dither, none']);
});

test('the app schema requires the manifest keys and constrains ids', () => {
  const good = {
    id: 'probe', name: 'probe', version: '0.1.0', ghostSignal: '^0.1', flavor: './flavor.json', entry: './index.html',
    status: { kind: 'event', name: 'probe:status' }, commands: [{ id: 'probe.ping', title: 'ping', shortcut: 'p' }], icon: 'ghost',
  };
  assert.deepEqual(validate(appSchema, good), []);
  assert.deepEqual(validate(appSchema, { ...good, id: 'Probe' }), ['$.id: does not match ^[a-z0-9-]+
]);
  assert.deepEqual(validate(appSchema, { ...good, status: { kind: 'file', name: 'x' } }), ['$.status.kind: must be one of event']);
});

test('satisfies handles caret, tilde and exact ranges', () => {
  assert.equal(satisfies('^0.1', '0.1.0'), true);
  assert.equal(satisfies('^0.1', '0.1.9'), true);
  assert.equal(satisfies('^0.1', '0.2.0'), false);
  assert.equal(satisfies('^0.2', '0.1.0'), false);
  assert.equal(satisfies('^1.2', '1.3.0'), true);
  assert.equal(satisfies('^1.2', '1.1.0'), false);
  assert.equal(satisfies('^1.2', '2.0.0'), false);
  assert.equal(satisfies('~0.1.2', '0.1.5'), true);
  assert.equal(satisfies('~0.1.2', '0.1.1'), false);
  assert.equal(satisfies('~0.1.2', '0.2.0'), false);
  assert.equal(satisfies('0.1.0', '0.1.0'), true);
  assert.equal(satisfies('0.1.0', '0.1.1'), false);
  assert.throws(() => satisfies('>=0.1', '0.1.0'), RangeError);
});
```

- [ ] **Step 3: run the test to see it fail**

Run: `cd /Volumes/T7/ghost-signal && node --test test/unit/schema.test.js`

Expected: fails with `Cannot find module '.../scripts/lib/schema.js'`.

- [ ] **Step 4: write scripts/lib/schema.js**

```js
// the smallest json schema subset the two schemas need: type, required, enum, pattern,
// properties, additionalProperties (false or a schema), items. no dependency, no draft magic

function typeOf(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

export function validate(schema, value, path = '
) {
  const errors = [];
  if (schema.type !== undefined && typeOf(value) !== schema.type) {
    errors.push(`${path}: expected ${schema.type}, got ${typeOf(value)}`);
    return errors;
  }
  if (schema.enum !== undefined && schema.enum.includes(value) === false) {
    errors.push(`${path}: must be one of ${schema.enum.join(', ')}`);
  }
  if (schema.pattern !== undefined && typeof value === 'string' && new RegExp(schema.pattern).test(value) === false) {
    errors.push(`${path}: does not match ${schema.pattern}`);
  }
  if (typeOf(value) === 'object') {
    for (const key of schema.required ?? []) {
      if (Object.hasOwn(value, key) === false) errors.push(`${path}.${key}: required`);
    }
    for (const [key, v] of Object.entries(value)) {
      const sub = schema.properties?.[key];
      if (sub !== undefined) errors.push(...validate(sub, v, `${path}.${key}`));
      else if (schema.additionalProperties === false) errors.push(`${path}.${key}: not allowed`);
      else if (typeof schema.additionalProperties === 'object') errors.push(...validate(schema.additionalProperties, v, `${path}.${key}`));
    }
  }
  if (Array.isArray(value) && schema.items !== undefined) {
    value.forEach((v, i) => errors.push(...validate(schema.items, v, `${path}[${i}]`)));
  }
  return errors;
}

function parts(s) {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(s);
  if (m === null) throw new RangeError(`ghost-signal: bad version or range "${s}"`);
  return [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
}

// ^a.b: same major, minor >= b (major 0: minor must equal b). ~a.b.c: same major and minor,
// patch >= c. anything else must be exact. no other operators, on purpose
export function satisfies(range, version) {
  const [vMajor, vMinor, vPatch] = parts(version);
  if (range.startsWith('^')) {
    const [a, b] = parts(range.slice(1));
    return vMajor === a && (a === 0 ? vMinor === b : vMinor >= b);
  }
  if (range.startsWith('~')) {
    const [a, b, c] = parts(range.slice(1));
    return vMajor === a && vMinor === b && vPatch >= c;
  }
  const [a, b, c] = parts(range);
  return vMajor === a && vMinor === b && vPatch === c;
}
```

- [ ] **Step 5: run the schema test to see it pass**

Run: `cd /Volumes/T7/ghost-signal && node --test test/unit/schema.test.js`

Expected: `# pass 4`, `# fail 0`.

- [ ] **Step 6: write the cli fixtures**

`test/unit/fixtures/probe-fixture/app.json`:

```json
{
  "$schema": "https://ghost-signal.local/schema/app.v1.json",
  "id": "probe",
  "name": "probe",
  "version": "0.1.0",
  "ghostSignal": "^0.1",
  "flavor": "./flavor.json",
  "entry": "./index.html",
  "status": { "kind": "event", "name": "probe:status" },
  "commands": [
    { "id": "probe.tests", "title": "run tests", "shortcut": "t" },
    { "id": "probe.list", "title": "list files", "shortcut": "l" }
  ],
  "icon": "ghost"
}
```

`test/unit/fixtures/probe-fixture/flavor.json`:

```json
{
  "$schema": "https://ghost-signal.local/schema/flavor.v1.json",
  "app": "probe",
  "ghostSignal": "^0.1",
  "accent2": { "dark": "#b78bff", "light": "#6b2fc9" },
  "display": "\"Iowan Old Style\", Palatino, Georgia, serif",
  "texture": "dither",
  "sprite": "./sprites/sheet.grid",
  "expressions": { "haunting": "./expressions/haunting.grid" },
  "icons": { "sigil": "./icons/sigil.grid" },
  "copy": { "empty": "the spirits are quiet", "loading": "listening on the bridge" }
}
```

`test/unit/fixtures/probe-fixture/main.js`:

```js
// a well behaved app element: its own prefix, built on the tokens
customElements.define('pb-panel', class extends HTMLElement {});
```

`test/unit/fixtures/gs-namespace/app.json` is the same manifest as above with `"id": "rogue"`, `"name": "rogue"`, no `flavor` key and `"status": { "kind": "event", "name": "rogue:status" }`. next to it, `test/unit/fixtures/gs-namespace/rogue.js`:

```js
// this is the thing the checker exists to catch
customElements.define('gs-rogue', class extends HTMLElement {});
```

`test/unit/fixtures/flavor-bad-contrast.json`:

```json
{
  "$schema": "https://ghost-signal.local/schema/flavor.v1.json",
  "app": "dim",
  "ghostSignal": "^0.1",
  "accent2": { "dark": "#3a2a5a", "light": "#c9c0dd" }
}
```

`test/unit/fixtures/flavor-locked-key.json`:

```json
{
  "$schema": "https://ghost-signal.local/schema/flavor.v1.json",
  "app": "locked",
  "ghostSignal": "^0.1",
  "accent": "#00ff00",
  "motion": { "glitch": "0ms" }
}
```

`test/unit/fixtures/flavor-bad-range.json`:

```json
{
  "$schema": "https://ghost-signal.local/schema/flavor.v1.json",
  "app": "future",
  "ghostSignal": "^0.2"
}
```

generate the fixture grids (the shapes do not matter, the sizes do):

```bash
cd /Volumes/T7/ghost-signal
node -e "
const fs=require('fs');const d='test/unit/fixtures/probe-fixture/';
for (const s of ['expressions','icons','sprites']) fs.mkdirSync(d+s,{recursive:true});
const row=(n,i)=>Array.from({length:n},(_,x)=>(x+i)%2?'#':'.').join('');
fs.writeFileSync(d+'expressions/haunting.grid',Array.from({length:10},(_,i)=>row(16,i)).join('\n')+'\n');
fs.writeFileSync(d+'icons/sigil.grid',Array.from({length:16},(_,i)=>row(16,i)).join('\n')+'\n');
fs.writeFileSync(d+'sprites/sheet.grid','#..\n.#.\n..#\n');"
ls test/unit/fixtures/probe-fixture/*/
```

Expected: the three grid files listed.

- [ ] **Step 7: write the failing cli test**

`test/unit/cli.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { check, flavorBuild } from '../../scripts/lib/cli.js';

const run = promisify(execFile);
const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));
const bin = fileURLToPath(new URL('../../scripts/ghost-signal.js', import.meta.url));
const f = (name) => join(fixtures, name);

test('a good app manifest and its flavor pass', async () => {
  const r = await check(f('probe-fixture/app.json'));
  assert.deepEqual(r, { ok: true, kind: 'app', errors: [] });
  assert.deepEqual(await check(f('probe-fixture/flavor.json')), { ok: true, kind: 'flavor', errors: [] });
});

test('bad contrast fails on every background it misses, in both themes', async () => {
  const r = await check(f('flavor-bad-contrast.json'));
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 6);
  assert.match(r.errors[0], /accent2\.dark #3a2a5a on void is \d+\.\d\d:1, needs 4\.5:1/);
  assert.ok(r.errors.some((e) => e.startsWith('accent2.light #c9c0dd on raised')));
});

test('a locked key fails', async () => {
  const r = await check(f('flavor-locked-key.json'));
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors, ['$.accent: not allowed', '$.motion: not allowed']);
});

test('a range that excludes the installed version fails', async () => {
  const r = await check(f('flavor-bad-range.json'));
  assert.deepEqual(r.errors, ['ghostSignal range ^0.2 excludes installed 0.1.0']);
});

test('an app that defines a gs- element fails', async () => {
  const r = await check(f('gs-namespace/app.json'));
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors, ['rogue.js: defines a gs-* custom element; the gs- prefix is reserved']);
});

test('flavorBuild emits the data-app css block, a light block and a js registration module', async () => {
  const { css, js, id } = await flavorBuild(f('probe-fixture/flavor.json'), { gsImport: '../../src' });
  assert.equal(id, 'probe');
  assert.match(css, /^\/\* generated by ghost-signal flavor build/);
  assert.match(css, /\[data-app="probe"\] \{\n  --gs-color-accent-2: #b78bff;\n  --gs-font-display: "Iowan Old Style", Palatino, Georgia, serif;\n\}/);
  assert.match(css, /:root\[data-theme="light"\] \[data-app="probe"\] \{\n  --gs-color-accent-2: #6b2fc9;\n\}/);
  assert.doesNotMatch(css, /--gs-dither: none/);
  assert.match(js, /^\/\/ generated by ghost-signal flavor build/);
  assert.match(js, /import \{ registerExpression, registerIcon, registerSprite \} from '\.\.\/\.\.\/src\/gs\.js';/);
  assert.match(js, /import \{ setCopy \} from '\.\.\/\.\.\/src\/copy\.js';/);
  assert.match(js, /registerExpression\('haunting', \["/);
  assert.match(js, /registerIcon\('sigil', \["/);
  assert.match(js, /registerSprite\('probe', \["#\.\.","\.#\.","\.\.#"\]\);/);
  assert.match(js, /setCopy\('empty', "the spirits are quiet"\);/);
  assert.match(js, /export const app = 'probe';/);
  assert.doesNotMatch(css + js, /20\d\d-\d\d-\d\d/);
});

test('flavorBuild refuses a flavor that fails check', async () => {
  await assert.rejects(() => flavorBuild(f('flavor-locked-key.json')), /\$\.accent: not allowed/);
});

test('the bin exits 0, 1 and 2 and writes build output to --out', async () => {
  const ok = await run(process.execPath, [bin, 'check', f('probe-fixture/app.json')]);
  assert.match(ok.stdout, /ok \(app\)/);
  await assert.rejects(run(process.execPath, [bin, 'flavor', 'check', f('flavor-bad-range.json')]), (e) => e.code === 1 && /excludes installed/.test(e.stdout));
  await assert.rejects(run(process.execPath, [bin]), (e) => e.code === 2 && /usage/.test(e.stderr));
  await assert.rejects(run(process.execPath, [bin, 'check', f('missing.json')]), (e) => e.code === 2);
  const out = await mkdtemp(join(fixtures, 'build-'));
  try {
    const built = await run(process.execPath, [bin, 'flavor', 'build', f('probe-fixture/flavor.json'), '--out', out, '--gs-import', 'ghost-signal']);
    assert.match(built.stdout, /wrote .*flavor\.css/);
    assert.match(await readFile(join(out, 'flavor.js'), 'utf8'), /from 'ghost-signal\/gs\.js'/);
    assert.match(await readFile(join(out, 'flavor.css'), 'utf8'), /data-app="probe"/);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});
```

- [ ] **Step 8: run the test to see it fail**

Run: `cd /Volumes/T7/ghost-signal && node --test test/unit/cli.test.js`

Expected: fails with `Cannot find module '.../scripts/lib/cli.js'`.

- [ ] **Step 9: write scripts/lib/cli.js**

```js
// check and flavor build, shared by the bin and the tests. every failure is a plain string;
// the bin turns a non-empty list into exit 1
import { readFile, readdir } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { loadTokens } from './tokens.js';
import { ratio } from './contrast.js';
import { validate, satisfies } from './schema.js';
import { parseGrid, CORE_EXPRESSION_NAMES } from '../../src/gs.js';

const here = new URL('.', import.meta.url);
const readJson = async (url) => JSON.parse(await readFile(url, 'utf8'));
const schemas = {
  app: await readJson(new URL('../../schema/app.v1.json', here)),
  flavor: await readJson(new URL('../../schema/flavor.v1.json', here)),
};
const pkg = await readJson(new URL('../../package.json', here));
const DEFINE_RE = /customElements\.define\(\s*['"`]gs-/;

function kindOf(json, file) {
  const s = typeof json.$schema === 'string' ? json.$schema : '';
  if (s.endsWith('app.v1.json')) return 'app';
  if (s.endsWith('flavor.v1.json')) return 'flavor';
  if (basename(file) === 'app.json') return 'app';
  if (basename(file) === 'flavor.json') return 'flavor';
  return null;
}

async function checkGrid(path, cols, rows, label) {
  try {
    parseGrid(await readFile(path, 'utf8'), cols, rows);
    return [];
  } catch (e) {
    return [`${label}: ${e.message}`];
  }
}

async function checkFlavor(f, dir) {
  const errors = [];
  const tokens = await loadTokens();
  if (typeof f.accent2 === 'object' && f.accent2 !== null) {
    for (const theme of ['dark', 'light']) {
      const hex = f.accent2[theme];
      if (typeof hex !== 'string' || /^#[0-9a-f]{6}$/.test(hex) === false) continue;
      for (const bg of ['void', 'surface', 'raised']) {
        const r = ratio(hex, tokens.color[theme][bg]);
        if (r < tokens.contrast.minimum) {
          errors.push(`accent2.${theme} ${hex} on ${bg} is ${r.toFixed(2)}:1, needs ${tokens.contrast.minimum}:1`);
        }
      }
    }
  }
  for (const [name, rel] of Object.entries(f.expressions ?? {})) {
    if (CORE_EXPRESSION_NAMES.includes(name)) errors.push(`expressions.${name}: core expression names cannot be replaced`);
    if (typeof rel === 'string') errors.push(...await checkGrid(join(dir, rel), 16, 10, `expressions.${name}`));
  }
  for (const [name, rel] of Object.entries(f.icons ?? {})) {
    if (typeof rel === 'string') errors.push(...await checkGrid(join(dir, rel), 16, 16, `icons.${name}`));
  }
  if (typeof f.sprite === 'string') errors.push(...await checkGrid(join(dir, f.sprite), undefined, undefined, 'sprite'));
  return errors;
}

async function checkApp(a, dir) {
  const errors = [];
  if (typeof a.flavor === 'string') {
    const r = await check(join(dir, a.flavor));
    errors.push(...r.errors.map((e) => `flavor: ${e}`));
  }
  const files = await readdir(dir, { recursive: true });
  for (const rel of files.sort()) {
    if (rel.endsWith('.js') === false || rel.includes('node_modules')) continue;
    const src = await readFile(join(dir, rel), 'utf8');
    if (DEFINE_RE.test(src)) errors.push(`${relative(dir, join(dir, rel))}: defines a gs-* custom element; the gs- prefix is reserved`);
  }
  return errors;
}

export async function check(file) {
  const abs = resolve(file);
  let json;
  try {
    json = await readJson(abs);
  } catch (e) {
    if (e.code === 'ENOENT') throw e;
    return { ok: false, kind: null, errors: [`${file}: ${e.message}`] };
  }
  const kind = kindOf(json, abs);
  if (kind === null) {
    return { ok: false, kind, errors: [`${file}: cannot tell app.json from flavor.json (set $schema or use the standard filename)`] };
  }
  const errors = validate(schemas[kind], json);
  if (typeof json.ghostSignal === 'string' && /^[~^]?\d+\.\d+(\.\d+)?$/.test(json.ghostSignal) && satisfies(json.ghostSignal, pkg.version) === false) {
    errors.push(`ghostSignal range ${json.ghostSignal} excludes installed ${pkg.version}`);
  }
  if (kind === 'flavor') errors.push(...await checkFlavor(json, dirname(abs)));
  if (kind === 'app') errors.push(...await checkApp(json, dirname(abs)));
  return { ok: errors.length === 0, kind, errors };
}

async function readGrid(path, cols, rows) {
  return parseGrid(await readFile(path, 'utf8'), cols, rows);
}

export async function flavorBuild(file, { gsImport = 'ghost-signal' } = {}) {
  const abs = resolve(file);
  const dir = dirname(abs);
  const result = await check(abs);
  if (result.ok === false) throw new Error(result.errors.join('\n'));
  const f = await readJson(abs);
  const id = f.app;

  const dark = [`[data-app="${id}"] {`];
  if (f.accent2 !== undefined) dark.push(`  --gs-color-accent-2: ${f.accent2.dark};`);
  if (f.display !== undefined) dark.push(`  --gs-font-display: ${f.display};`);
  if (f.texture === 'none') dark.push('  --gs-dither: none;', '  --gs-dither-strong: none;');
  dark.push('}');
  const light = f.accent2 === undefined ? [] : [
    `:root[data-theme="light"] [data-app="${id}"] {`,
    `  --gs-color-accent-2: ${f.accent2.light};`,
    '}',
  ];
  const css = [`/* generated by ghost-signal flavor build from ${basename(abs)}. do not edit */`, ...dark, '', ...light, ''].join('\n');

  const js = [
    `// generated by ghost-signal flavor build from ${basename(abs)}. do not edit`,
    `import { registerExpression, registerIcon, registerSprite } from '${gsImport}/gs.js';`,
    `import { setCopy } from '${gsImport}/copy.js';`,
    '',
  ];
  for (const [name, rel] of Object.entries(f.expressions ?? {})) {
    js.push(`registerExpression('${name}', ${JSON.stringify(await readGrid(join(dir, rel), 16, 10))});`);
  }
  for (const [name, rel] of Object.entries(f.icons ?? {})) {
    js.push(`registerIcon('${name}', ${JSON.stringify(await readGrid(join(dir, rel), 16, 16))});`);
  }
  if (f.sprite !== undefined) js.push(`registerSprite('${id}', ${JSON.stringify(await readGrid(join(dir, f.sprite)))});`);
  for (const [slot, text] of Object.entries(f.copy ?? {})) js.push(`setCopy('${slot}', ${JSON.stringify(text)});`);
  js.push(`export const app = '${id}';`, '');

  return { css, js: js.join('\n'), id };
}
```

- [ ] **Step 10: write scripts/ghost-signal.js**

```js
#!/usr/bin/env node
// cli wrapper. all logic lives in lib/cli.js so the tests never spawn a shell to reach it
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { check, flavorBuild } from './lib/cli.js';

const USAGE = [
  'usage:',
  '  ghost-signal check <file>',
  '  ghost-signal flavor check <file>',
  '  ghost-signal flavor build <file> [--out <dir>] [--gs-import <spec>]',
  'exit codes: 0 ok, 1 check failed, 2 usage or io error',
  '',
].join('\n');

function parseArgs(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      flags[argv[i].slice(2)] = argv[i + 1];
      i += 1;
    } else {
      rest.push(argv[i]);
    }
  }
  return { flags, rest };
}

async function main(argv) {
  const { flags, rest } = parseArgs(argv);
  const command = rest[0] === 'flavor' ? `flavor ${rest[1] ?? ''}` : rest[0];
  const file = rest[0] === 'flavor' ? rest[2] : rest[1];
  if (file === undefined || ['check', 'flavor check', 'flavor build'].includes(command) === false) {
    process.stderr.write(USAGE);
    return 2;
  }
  if (command === 'check' || command === 'flavor check') {
    const r = await check(file);
    if (r.ok) {
      process.stdout.write(`${file}: ok (${r.kind})\n`);
      return 0;
    }
    process.stdout.write(`${r.errors.map((e) => `${file}: ${e}`).join('\n')}\n`);
    return 1;
  }
  const { css, js, id } = await flavorBuild(file, { gsImport: flags['gs-import'] ?? 'ghost-signal' });
  const dir = resolve(flags.out ?? dirname(file));
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'flavor.css'), css);
  await writeFile(join(dir, 'flavor.js'), js);
  process.stdout.write(`wrote ${join(dir, 'flavor.css')} and ${join(dir, 'flavor.js')} for ${id}\n`);
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`ghost-signal: ${err.message}\n`);
    process.exit(err.code === 'ENOENT' ? 2 : 1);
  },
);
```

- [ ] **Step 11: run the cli test to see it pass, then the whole unit suite**

Run: `cd /Volumes/T7/ghost-signal && chmod +x scripts/ghost-signal.js && node --test test/unit/cli.test.js && npm test`

Expected: `# pass 8`, `# fail 0`, then the full suite green. the bad-contrast fixture yields six lines because `#3a2a5a` fails all three dark backgrounds and `#c9c0dd` fails all three light ones.

- [ ] **Step 12: commit**

```bash
cd /Volumes/T7/ghost-signal
git add schema scripts/lib/schema.js scripts/lib/cli.js scripts/ghost-signal.js test/unit/schema.test.js test/unit/cli.test.js test/unit/fixtures
git commit -m "feat(cli): app and flavor schemas, validator, check and flavor build" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```


---

### task 15: the gallery and the probe app

**Files:**
- Create: `gallery/index.html`, `gallery/gallery.js`, `gallery/apps/probe/app.json`, `gallery/apps/probe/flavor.json`, `gallery/apps/probe/index.html`, `gallery/apps/probe/expressions/probing.grid`, `gallery/apps/probe/icons/sigil.grid`, `gallery/apps/probe/sprites/probe.grid`, `gallery/apps/probe/flavor.css` (generated), `gallery/apps/probe/flavor.js` (generated)
- Modify: `scripts/gen.js` (probe flavor build)
- Test: `test/e2e/gallery.spec.js`

**Interfaces:**
- Consumes: every component, `GS`, `STATUSES`, `registerCommands`, `registerSprite`, `gridToSymbol`, `getIcon`, `startAmbient` (tasks 6 and 9), `KAOMOJI` (task 6), `copy` (task 11), `flavorBuild` (task 14).
- Produces: `window.GS`, `window.gallery` with `setTheme(t)`, `setGlitch(n)`, `setStatus(s)`, `toast(status)`, `ambient(options)`, `lastCommand`; `html[data-gallery-ready]` once the probe is mounted. this is the by-eye surface and the ci screenshot source.

- [ ] **Step 1: write the probe app files**

`gallery/apps/probe/app.json`:

```json
{
  "$schema": "https://ghost-signal.local/schema/app.v1.json",
  "id": "probe",
  "name": "probe",
  "version": "0.1.0",
  "ghostSignal": "^0.1",
  "flavor": "./flavor.json",
  "entry": "./index.html",
  "status": { "kind": "event", "name": "probe:status" },
  "commands": [
    { "id": "probe.tests", "title": "run tests", "shortcut": "t" },
    { "id": "probe.list", "title": "list files", "shortcut": "l" }
  ],
  "icon": "ghost"
}
```

`gallery/apps/probe/flavor.json`:

```json
{
  "$schema": "https://ghost-signal.local/schema/flavor.v1.json",
  "app": "probe",
  "ghostSignal": "^0.1",
  "accent2": { "dark": "#b78bff", "light": "#6b2fc9" },
  "texture": "dither",
  "sprite": "./sprites/probe.grid",
  "expressions": { "probing": "./expressions/probing.grid" },
  "icons": { "sigil": "./icons/sigil.grid" },
  "copy": { "empty": "probe is listening. nothing has pinged yet" }
}
```

`gallery/apps/probe/index.html`:

```html
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>probe</title></head>
<body>
  <p>probe is the plug-in test app. the gallery mounts it; this entry is a stub for the shell contract.</p>
</body>
</html>
```

`gallery/apps/probe/expressions/probing.grid` (round eyes, a question-mark mouth):

```
................
..##........##..
..##........##..
................
......######....
.........##.....
........##......
................
........##......
................
```

`gallery/apps/probe/icons/sigil.grid` (a 16x16 eye sigil):

```
................
.......##.......
......####......
.....##..##.....
....##....##....
...##..##..##...
..##..####..##..
.##...####...##.
.##...####...##.
..##..####..##..
...##..##..##...
....##....##....
.....##..##.....
......####......
.......##.......
................
```

`gallery/apps/probe/sprites/probe.grid` (a 6x6 diagonal that reads as motion when it steps):

```
#.....
.#....
..#...
...#..
....#.
.....#
```

- [ ] **Step 2: make gen.js build the probe flavor and generate**

in `scripts/gen.js` add the import and, after the `outputs` array is declared, the probe build:

```js
import { flavorBuild } from './lib/cli.js';
```

```js
  const probe = await flavorBuild(`${root}gallery/apps/probe/flavor.json`, { gsImport: '../../../src' });
  outputs.push(
    ['gallery/apps/probe/flavor.css', probe.css],
    ['gallery/apps/probe/flavor.js', probe.js],
  );
```

Run: `cd /Volumes/T7/ghost-signal && npm run gen && cat gallery/apps/probe/flavor.css && head -4 gallery/apps/probe/flavor.js && node scripts/ghost-signal.js check gallery/apps/probe/app.json`

Expected: seven `wrote` lines; the css shows `[data-app="probe"]` with `--gs-color-accent-2: #b78bff;` and a light block with `#6b2fc9`; the js imports from `../../../src/gs.js`; the check prints `gallery/apps/probe/app.json: ok (app)`.

- [ ] **Step 3: write gallery/index.html**

```html
<!doctype html>
<html lang="en" data-theme="dark" data-glitch="1">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ghost signal gallery</title>
  <link rel="stylesheet" href="../src/tokens.css">
  <link rel="stylesheet" href="../src/base.css">
  <link rel="stylesheet" href="../src/fx.css">
  <style>
    body { padding: var(--gs-space-5); display: grid; gap: var(--gs-space-5); max-width: 1100px; margin: 0 auto; }
    header { display: flex; align-items: center; gap: var(--gs-space-4); flex-wrap: wrap; }
    header nav { display: flex; gap: var(--gs-space-1); flex-wrap: wrap; }
    section { display: grid; gap: var(--gs-space-3); }
    .grid { display: flex; gap: var(--gs-space-3); flex-wrap: wrap; align-items: center; }
    .face-card { display: grid; gap: var(--gs-space-1); justify-items: center; }
    .sidebar { display: grid; width: 220px; background-color: var(--gs-color-surface); border: var(--gs-border); border-radius: var(--gs-radius-panel); padding: var(--gs-space-2) 0; }
    gs-row { background-color: var(--gs-color-surface); }
  </style>
  <script type="module" src="./gallery.js"></script>
</head>
<body>
  <header>
    <gs-face id="hero-face" status="idle" data-gallery></gs-face>
    <div>
      <div class="gs-wordmark" data-gs-ambient><gs-decode id="wordmark" text="ghost signal"></gs-decode></div>
      <span class="gs-label">every component, every status, both themes, three glitch levels</span>
    </div>
    <nav aria-label="theme">
      <button data-theme-pick="dark">dark</button>
      <button data-theme-pick="light">light</button>
    </nav>
    <nav aria-label="glitch">
      <button data-glitch-pick="0">glitch 0</button>
      <button data-glitch-pick="1">glitch 1</button>
      <button data-glitch-pick="2">glitch 2</button>
    </nav>
  </header>

  <section id="faces"><h2>faces</h2><div class="grid" id="face-grid"></div></section>

  <section id="status"><h2>dots and chips</h2><div class="grid" id="status-grid"></div><nav aria-label="set status" class="grid" id="status-buttons"></nav></section>

  <section id="controls">
    <h2>native controls</h2>
    <div class="grid">
      <button>default</button>
      <button data-variant="primary">primary</button>
      <button data-variant="ghost">ghost</button>
      <button data-variant="danger">danger</button>
      <button disabled>disabled</button>
      <input placeholder="filter" aria-label="filter">
      <select aria-label="pick"><option>one</option><option>two</option></select>
      <textarea aria-label="notes" rows="2">notes</textarea>
      <span class="gs-sticker">for science</span>
      <span class="gs-sticker" style="--gs-tilt: 3deg">zero chill</span>
    </div>
  </section>

  <section id="panels">
    <h2>panels and nav</h2>
    <div class="grid">
      <div class="gs-panel"><h2>panel</h2><span class="gs-label">label</span><p>body text on surface.</p></div>
      <div class="gs-panel" data-corrupt><h2>corrupt panel</h2><p>corners opt in at glitch 1.</p></div>
      <div class="sidebar">
        <a class="gs-nav-item" href="#panels" aria-current="page"><svg class="gs-icon"><use href="#gs-watch"/></svg>watch</a>
        <a class="gs-nav-item" href="#panels"><svg class="gs-icon"><use href="#gs-filter"/></svg>filter</a>
        <a class="gs-nav-item" href="#panels"><svg class="gs-icon"><use href="#gs-settings"/></svg>settings</a>
      </div>
    </div>
    <div class="grid" id="icon-grid"></div>
  </section>

  <section id="rows"><h2>rows</h2><div id="row-list"></div></section>

  <section id="chrome">
    <h2>tape, toasts, window, palette</h2>
    <gs-tape text="zero chill detected"></gs-tape>
    <gs-tape text="live" status="ok"></gs-tape>
    <div class="grid" id="toast-buttons"></div>
    <div class="grid">
      <button id="open-window">open window</button>
      <button id="open-palette">palette (ctrl+k)</button>
    </div>
    <gs-window id="window" heading="confirm">
      <p>run the thing?</p>
      <button data-variant="primary" id="window-yes">yes</button>
      <button id="window-no">no</button>
    </gs-window>
  </section>

  <section id="states">
    <h2>empty, error, splash</h2>
    <div class="grid">
      <gs-empty><gs-wallpaper sprite="checks" cols="24" rows="6"></gs-wallpaper></gs-empty>
      <gs-error></gs-error>
      <gs-splash><gs-wallpaper sprite="ghost" cols="24" rows="6"></gs-wallpaper></gs-splash>
    </div>
  </section>

  <section id="probe"><h2>probe (plug-in test app)</h2></section>

  <gs-toast id="toasts"></gs-toast>
  <gs-palette id="palette"></gs-palette>
</body>
</html>
```

- [ ] **Step 4: write gallery/gallery.js**

```js
// the by-eye surface. renders every component in every status, wires the theme and glitch
// switches, mounts the probe app through the plug-in contract and nothing else (｡◕‿↼)
import { GS, STATUSES, registerCommands, registerSprite, registerIcon, gridToSymbol, getIcon, startAmbient } from '../src/gs.js';
import { KAOMOJI } from '../src/expressions.js';
import { copy } from '../src/copy.js';
import '../src/components/mosaic.js';
import '../src/components/face.js';
import '../src/components/decode.js';
import '../src/components/tape.js';
import '../src/components/window.js';
import '../src/components/toast.js';
import '../src/components/row.js';
import '../src/components/empty.js';
import '../src/components/error.js';
import '../src/components/splash.js';
import '../src/components/palette.js';

const html = document.documentElement;
const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs = {}, text = '') => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== '') node.textContent = text;
  return node;
};

let stopAmbient = () => {};

window.GS = GS;
window.gallery = {
  lastCommand: null,
  setTheme(theme) { html.dataset.theme = theme; },
  setGlitch(level) {
    html.dataset.glitch = String(level);
    for (const row of document.querySelectorAll('gs-row')) row.render();
    stopAmbient();
    stopAmbient = startAmbient();
  },
  setStatus(status) {
    for (const face of document.querySelectorAll('gs-face[data-gallery]')) face.setAttribute('status', status);
  },
  toast(status) {
    const slot = `${status}Toast`;
    const text = ['deny', 'bypass', 'crash'].includes(status) ? copy(slot) : `${status} toast`;
    document.dispatchEvent(new CustomEvent('gs-toast', { detail: { status, text, kaomoji: KAOMOJI[status] } }));
  },
  ambient(options) {
    stopAmbient();
    stopAmbient = startAmbient(options);
    return stopAmbient;
  },
};

// icons: the core sprite inline, then app icons appended as symbols
async function injectIcons() {
  const svg = await (await fetch('../src/icons.svg')).text();
  document.body.insertAdjacentHTML('afterbegin', svg);
  const names = [...document.querySelectorAll('body > svg symbol')].map((s) => s.id.slice(3));
  for (const name of names) {
    const card = el('span', { class: 'gs-chip' });
    card.insertAdjacentHTML('afterbegin', `<svg class="gs-icon"><use href="#gs-${name}"/></svg>`);
    card.append(name);
    $('#icon-grid').append(card);
  }
}

function addIconSymbol(name) {
  $('body > svg').insertAdjacentHTML('beforeend', gridToSymbol(name, getIcon(name)));
}

function renderStatuses() {
  for (const s of STATUSES) {
    const card = el('div', { class: 'face-card' });
    card.append(el('gs-face', { status: s, 'data-gallery': '' }), el('span', { class: 'gs-label' }, `${s} ${KAOMOJI[s]}`));
    $('#face-grid').append(card);
    $('#status-grid').append(el('span', { class: 'gs-dot', 'data-status': s }), el('span', { class: 'gs-chip', 'data-status': s }, s));
    const b = el('button', { 'data-status-pick': s }, s);
    b.addEventListener('click', () => window.gallery.setStatus(s));
    $('#status-buttons').append(b);
    const t = el('button', { 'data-toast-pick': s }, `toast ${s}`);
    t.addEventListener('click', () => window.gallery.toast(s));
    $('#toast-buttons').append(t);
  }
  for (const s of [...STATUSES, 'loose']) {
    const row = el('gs-row', { status: s, label: `${s} row`, command: s === 'loose' ? 'ls -la' : 'cargo test --workspace', sigil: s === 'deny' ? '#' : '+' });
    row.append(`detail for the ${s} row`);
    $('#row-list').append(row);
  }
}

function wireChrome() {
  for (const b of document.querySelectorAll('[data-theme-pick]')) b.addEventListener('click', () => window.gallery.setTheme(b.dataset.themePick));
  for (const b of document.querySelectorAll('[data-glitch-pick]')) b.addEventListener('click', () => window.gallery.setGlitch(b.dataset.glitchPick));
  $('#open-window').addEventListener('click', () => $('#window').open());
  $('#window-yes').addEventListener('click', () => $('#window').close());
  $('#window-no').addEventListener('click', () => $('#window').close());
  $('#open-palette').addEventListener('click', () => $('#palette').open());
  registerCommands('gallery', [
    { id: 'gallery.theme', title: 'toggle theme', shortcut: 't' },
    { id: 'gallery.glitch', title: 'cycle glitch', shortcut: 'g' },
  ]);
  document.addEventListener('gs-command', (e) => {
    window.gallery.lastCommand = e.detail;
    if (e.detail.id === 'gallery.theme') window.gallery.setTheme(html.dataset.theme === 'light' ? 'dark' : 'light');
    if (e.detail.id === 'gallery.glitch') window.gallery.setGlitch((Number(html.dataset.glitch) + 1) % 3);
    document.dispatchEvent(new CustomEvent('gs-toast', { detail: { status: 'ok', text: `${e.detail.id} from ${e.detail.app}` } }));
  });
}

// the plug-in contract, end to end: manifest, flavor css, flavor js, commands, status event
async function mountProbe() {
  const app = await (await fetch('./apps/probe/app.json')).json();
  // wait for the flavor sheet: the art below reads --gs-color-accent-2 through computed style
  await new Promise((resolve, reject) => {
    const link = el('link', { rel: 'stylesheet', href: './apps/probe/flavor.css' });
    link.onload = resolve;
    link.onerror = () => reject(new Error('probe flavor.css failed to load'));
    document.head.append(link);
  });
  const flavor = await import('./apps/probe/flavor.js');
  registerCommands(app.id, app.commands);
  addIconSymbol('sigil');
  const section = $('#probe');
  section.dataset.app = flavor.app;
  const grid = el('div', { class: 'grid' });
  const expressionFace = el('gs-face', { id: 'probe-face', status: 'idle', expression: 'probing' });
  const statusFace = el('gs-face', { id: 'probe-status-face', status: 'idle' });
  const accent = el('span', { id: 'probe-accent', class: 'gs-chip', style: 'color: var(--gs-color-accent-2)' }, 'accent2');
  accent.insertAdjacentHTML('afterbegin', '<svg class="gs-icon"><use href="#gs-sigil"/></svg>');
  const empty = el('gs-empty', { id: 'probe-empty' });
  empty.append(el('gs-wallpaper', { sprite: app.id, cols: '24', rows: '6' }));
  const art = el('gs-mosaic', { cols: '12', rows: '12', text: 'art\n in\n  a\n   c\n    c\n     e\n      n\n       t\n        2' });
  art.setAttribute('lit', getComputedStyle(section).getPropertyValue('--gs-color-accent-2').trim());
  grid.append(expressionFace, statusFace, accent, art, empty);
  section.append(grid);
  window.addEventListener(app.status.name, (e) => {
    statusFace.setAttribute('status', e.detail.status);
  });
}

renderStatuses();
wireChrome();
await injectIcons();
registerSprite('checks', ['#...', '.#..', '..#.', '...#']);
registerIcon('ghost', [...document.querySelectorAll('#gs-ghost rect')].reduce((rows, r) => {
  const y = Number(r.getAttribute('y'));
  const x = Number(r.getAttribute('x'));
  rows[y] = rows[y].slice(0, x) + '#' + rows[y].slice(x + 1);
  return rows;
}, Array.from({ length: 16 }, () => '.'.repeat(16))));
// wallpaper is imported last, after its sprites exist: defining the element upgrades the two
// static wallpapers in index.html on the spot, and an unregistered sprite name throws
await import('../src/components/wallpaper.js');
await mountProbe();
stopAmbient = startAmbient();
html.dataset.galleryReady = '1';
```

canvas `fillStyle` cannot resolve `var()`, so the probe art reads `--gs-color-accent-2` through computed style once `section.dataset.app` is set and hands the hex to `lit`: a flavor's second accent lights non-face art, the face stays green. the `ghost` icon is registered from the injected sprite so the splash wallpaper can tile a core glyph without a second copy of the grid. `wallpaper.js` is the one component imported dynamically, after the sprites it tiles are registered.

- [ ] **Step 5: write the playwright test**

`test/e2e/gallery.spec.js`:

```js
import { test, expect } from '@playwright/test';

const STATUSES = ['idle', 'working', 'ok', 'warn', 'deny', 'bypass', 'crash'];

async function open(page) {
  await page.goto('/gallery/');
  await page.waitForSelector('html[data-gallery-ready]');
}

test('the probe app plugs in with no core change', async ({ page }) => {
  await open(page);
  await expect(page.locator('#probe-face')).toHaveAttribute('data-frame', 'probing');
  expect(await page.locator('body > svg symbol#gs-sigil').count()).toBe(1);
  await expect(page.locator('#probe')).toHaveAttribute('data-app', 'probe');
  const accentDark = await page.locator('#probe').evaluate((el) => getComputedStyle(el).getPropertyValue('--gs-color-accent-2').trim());
  expect(accentDark).toBe('#b78bff');
  await page.evaluate(() => window.gallery.setTheme('light'));
  const accentLight = await page.locator('#probe').evaluate((el) => getComputedStyle(el).getPropertyValue('--gs-color-accent-2').trim());
  expect(accentLight).toBe('#6b2fc9');
  await expect(page.locator('#probe-empty gs-decode[part="copy"]')).toHaveText('probe is listening. nothing has pinged yet');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('probe:status', { detail: { status: 'deny' } })));
  await expect(page.locator('#probe-status-face')).toHaveAttribute('data-frame', 'deny');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('run tests');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => window.gallery.lastCommand)).toEqual({ id: 'probe.tests', app: 'probe' });
  expect(await page.locator('#probe-empty gs-wallpaper gs-mosaic[data-drawn]').count()).toBe(1);
});

test('doto is served from the bundle and used by the wordmark', async ({ page }) => {
  await open(page);
  const font = await page.evaluate(async () => {
    await document.fonts.load('900 34px Doto');
    return {
      loaded: document.fonts.check('900 34px Doto'),
      family: getComputedStyle(document.querySelector('.gs-wordmark')).fontFamily,
      sources: [...document.fonts].map((f) => f.family),
    };
  });
  expect(font.loaded).toBe(true);
  expect(font.family).toContain('Doto');
  expect(font.sources.some((f) => f.includes('Doto'))).toBe(true);
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.reload();
  await page.waitForSelector('html[data-gallery-ready]');
  expect(requests.some((u) => u.includes('fonts.googleapis') || u.includes('fonts.gstatic'))).toBe(false);
});

test('every status renders on every gallery face and the chrome switches work', async ({ page }) => {
  await open(page);
  for (const s of STATUSES) {
    await page.evaluate((v) => window.gallery.setStatus(v), s);
    await expect(page.locator('#hero-face')).toHaveAttribute('data-frame', s === 'ok' ? 'idle' : s);
  }
  await page.locator('[data-glitch-pick="2"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-glitch', '2');
  await expect(page.locator('#row-list gs-row[status="deny"] [part="label"] gs-decode')).toHaveCount(1);
  await page.locator('[data-theme-pick="light"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe('rgb(242, 244, 245)');
});

test('ambient glitch fires on a data-gs-ambient element at glitch 1', async ({ page }) => {
  await open(page);
  const hit = await page.evaluate(() => new Promise((resolve) => {
    window.GS.seed(1);
    const targets = [...document.querySelectorAll('[data-gs-ambient]')];
    const mo = new MutationObserver(() => {
      const t = targets.find((el) => el.classList.contains('gs-glitch'));
      if (t) { mo.disconnect(); resolve(true); }
    });
    for (const t of targets) mo.observe(t, { attributes: true, attributeFilter: ['class'] });
    window.gallery.ambient({ min: 10, max: 30 });
    setTimeout(() => resolve(false), 2000);
  }));
  expect(hit).toBe(true);
});

test('screenshots per theme and glitch level land in gallery/screenshots', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.GS.seed(1));
  for (const theme of ['dark', 'light']) {
    for (const glitch of [0, 1, 2]) {
      await page.evaluate(([t, g]) => { window.gallery.setTheme(t); window.gallery.setGlitch(g); }, [theme, glitch]);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `gallery/screenshots/${theme}-glitch${glitch}.png`, fullPage: true });
    }
  }
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('cycles every status, fires bypass and crash toasts, and nothing animates', async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => document.documentElement.dataset.glitch)).toBe('0');
    for (const s of STATUSES) {
      await page.evaluate((v) => window.gallery.setStatus(v), s);
      await expect(page.locator('#hero-face')).toHaveAttribute('data-frame', s === 'ok' ? 'idle' : s);
    }
    await page.evaluate(() => { window.gallery.toast('bypass'); window.gallery.toast('crash'); });
    await expect(page.locator('#toasts [part="item"]')).toHaveCount(2);
    await page.waitForTimeout(300);
    const state = await page.evaluate(() => ({
      animations: document.getAnimations().length,
      glitching: document.querySelectorAll('.gs-glitch, .gs-mosh, .gs-flare').length,
      glitch: document.documentElement.dataset.glitch,
      wordmark: document.getElementById('wordmark').textContent,
    }));
    expect(state).toEqual({ animations: 0, glitching: 0, glitch: '0', wordmark: 'ghost signal' });
  });
});
```

- [ ] **Step 6: run the e2e and look at the screenshots**

Run: `cd /Volumes/T7/ghost-signal && npm run e2e && ls gallery/screenshots`

Expected: `35 passed`; the listing shows `dark-glitch0.png`, `dark-glitch1.png`, `dark-glitch2.png`, `light-glitch0.png`, `light-glitch1.png`, `light-glitch2.png`.

- [ ] **Step 7: look at it in a real browser**

Run: `cd /Volumes/T7/ghost-signal && npm run serve`

then open `http://127.0.0.1:4173/gallery/` in a real browser and confirm by eye, in this order: the wordmark is dot-matrix (doto), the seven faces differ and are all green, the hero face blinks within ten seconds at glitch 1, clicking `toast deny` leaves a sticky toast with an `ok` button, `ctrl+k` opens the palette listing the gallery and probe commands, `glitch 2` shows corrupt corners on every panel and a chromatic split on button hover, `light` keeps every label readable, and the probe section shows the probing face, the sigil icon, violet accent2 text and the wallpaper stepping. stop the server with `ctrl+c`. this is spec 9.5 and 12: a green suite is not a substitute for looking.

- [ ] **Step 8: commit**

```bash
cd /Volumes/T7/ghost-signal
git add gallery scripts/gen.js test/e2e/gallery.spec.js
git commit -m "feat(gallery): every component in every state plus the probe plug-in app" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```


---

### task 16: sync script, docs, hygiene and the v0.1.0 tag

**Files:**
- Create: `scripts/sync-ghost-signal.sh`
- Modify: `README.md` (full rewrite), `ARCHITECTURE.md` (full rewrite)

**Interfaces:**
- Consumes: everything. this task ships nothing new to the runtime; it proves the repo is what the spec says and tags it.
- Produces: the `v0.1.0` annotated tag, local only.

- [ ] **Step 1: write scripts/sync-ghost-signal.sh**

```bash
#!/usr/bin/env bash
# copies a tagged ghost-signal release into a consumer that has no bundler.
# usage: DEST=vendor/ghost-signal scripts/sync-ghost-signal.sh v0.1.0
# result: $DEST/src $DEST/gen $DEST/schema and $DEST/VERSION holding the tag. drift is a grep on VERSION
set -euo pipefail

TAG="${1:?usage: DEST=<vendor dir> sync-ghost-signal.sh <tag>}"
: "${DEST:?set DEST to the vendor directory, for example vendor/ghost-signal}"
REPO="${GS_REPO:-https://github.com/StressTestor/ghost-signal.git}"

mkdir -p "$DEST"
WORK="$(mktemp -d "$DEST/.gs-sync.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

git clone --quiet --depth 1 --branch "$TAG" "$REPO" "$WORK/repo"

for part in src gen schema; do
  rm -rf "${DEST:?}/$part"
  cp -R "$WORK/repo/$part" "$DEST/$part"
done
printf '%s\n' "$TAG" > "$DEST/VERSION"
printf 'ghost-signal %s synced into %s\n' "$TAG" "$DEST"
```

the temp clone lives under `$DEST`, never in the system temp dir, so it stays on the same drive as the consumer.

Run: `cd /Volumes/T7/ghost-signal && chmod +x scripts/sync-ghost-signal.sh && bash -n scripts/sync-ghost-signal.sh && echo syntax ok`

Expected: `syntax ok`. the end-to-end run needs the tag and happens in step 8.

- [ ] **Step 2: rewrite README.md**

```markdown
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
that defines a `gs-*` element. `flavor build` writes `flavor.css` (the `[data-app="<id>"]` block) and
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

doto is bundled as `src/fonts/Doto-VariableFont.woff2`, converted from
`github.com/oliverlalan/Doto` at commit `1c587f2eed62cb257055540ac2a15f356070414f`
(`fonts/variable/Doto[ROND,wght].ttf`) with `scripts/fetch-doto.sh`. license: `src/fonts/OFL.txt`.
nothing is fetched at runtime.
```

- [ ] **Step 3: rewrite ARCHITECTURE.md**

```markdown
# architecture

ghost signal is the design system for joe's guis: a token set, a css layer, web components, and a
plug-in contract (manifest plus flavor) so new apps join without core edits. design:
`docs/superpowers/specs/2026-09-23-ghost-signal-design.md`. plan:
`docs/superpowers/plans/2026-09-23-ghost-signal-v0.1.0.md`.

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
  fonts/                  Doto-VariableFont.woff2 OFL.txt SOURCE
  gs.js expressions.js copy.js
  components/             mosaic face decode tape window toast row container empty error splash wallpaper palette
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
  `test/e2e/__snapshots__/`. `gs-decode` and ambient glitch use `GS.seed` / `GS.random`.
- components are light dom. every component module guards `HTMLElement` and
  `customElements.define` so node can import it. `base.css` is complete after task 5; component
  rules key on `[part]`, `data-status`, `open`, `aria-expanded`, `aria-selected`.
- flavors override a fixed allow-list (`accent2 {dark,light}`, `display`, `texture`, `sprite`,
  `expressions`, `icons`, `copy`); the schema's `additionalProperties: false` rejects everything
  else. `flavor build` emits `[data-app="<id>"]` css and a js registration module.
- `gs-wallpaper` throws `GsWallpaperPlacementError` outside `gs-empty gs-error gs-splash`.

## gotchas

- a generated file is hand edited -> ci fails on `git diff --exit-code` -> edit `tokens.json` or the
  grid file and re-run `npm run gen`.
- a pinned face hash differs on ci -> the png encoder or a font fallback changed, not the grid ->
  compare `gallery/screenshots` artifacts; if the pixels match, hash `getImageData` bytes instead of
  the png and re-pin.
- `npm test` says "directory argument not allowed" -> node 26 rejects a directory for `--test` ->
  the script passes a quoted glob; keep it quoted.
- `document.fonts.check('900 34px Doto')` is false -> the face has not loaded yet -> `await
  document.fonts.load(...)` first (the gallery test does).
- a snapshot is "missing" on ci -> `snapshotPathTemplate` must stay platform-free and the
  `__snapshots__` dir committed.
- `flavor build` throws -> it runs `check` first; fix the reported line.
- `gs-decode` text arrives through the `text` attribute; child text is only read on first connect.

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
```

- [ ] **Step 4: hygiene greps and syntax check**

Run:

```bash
cd /Volumes/T7/ghost-signal
grep -rn "console\.log" src scripts; echo "console.log exit $?"
grep -rnE "TODO|FIXME" src scripts gallery/gallery.js; echo "todo exit $?"
grep -n '!' src/copy.js gen/tokens.md README.md ARCHITECTURE.md; echo "bang exit $?"
EMDASH="$(printf '\xe2\x80\x94')"
grep -rn "$EMDASH" src scripts schema gallery/gallery.js gallery/index.html README.md ARCHITECTURE.md gen/tokens.md; echo "emdash exit $?"
for f in src/*.js src/components/*.js scripts/*.js scripts/lib/*.js gallery/gallery.js; do node --check "$f" || echo "SYNTAX $f"; done; echo "check done"
```

Expected: every grep prints nothing and its `exit 1` line (grep exit 1 means no match); `check done` with no `SYNTAX` lines. a hit is a fix, not an exception: `console.log` becomes `process.stdout.write` in scripts and is removed from `src`; an exclamation point in copy or docs is rewritten.

- [ ] **Step 5: the full gate, exactly as ci runs it**

Run: `cd /Volumes/T7/ghost-signal && npm ci && npm run gen && git diff --exit-code && test -z "$(git status --porcelain)" && npm test && npm run check && npm run e2e && echo "GATE GREEN"`

Expected: `GATE GREEN` as the last line. if `git status --porcelain` is non-empty, something from step 2 or 3 is uncommitted; commit it first (step 6) and re-run.

- [ ] **Step 6: commit the docs and the sync script**

```bash
cd /Volumes/T7/ghost-signal
git add scripts/sync-ghost-signal.sh README.md ARCHITECTURE.md
git commit -m "docs(release): readme, architecture as built and the consumer sync script" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

re-run step 5 after this commit so the gate ran against the tree that gets tagged.

- [ ] **Step 7: tag**

```bash
cd /Volumes/T7/ghost-signal
git tag -a v0.1.0 -m "ghost signal v0.1.0: tokens, css layer, components, plug-in contract, gallery"
git tag -n1 v0.1.0
git log --oneline -1
```

Expected: `v0.1.0  ghost signal v0.1.0: ...` and the docs commit as `HEAD`.

- [ ] **Step 8: prove the sync script against the local tag**

Run:

```bash
cd /Volumes/T7/ghost-signal
GS_REPO=/Volumes/T7/ghost-signal DEST=test-results/sync scripts/sync-ghost-signal.sh v0.1.0
cat test-results/sync/VERSION
ls test-results/sync/src/components | wc -l
diff -r src test-results/sync/src && echo "src identical"
```

Expected: `ghost-signal v0.1.0 synced into test-results/sync`, `v0.1.0`, `13`, `src identical`. `test-results/` is gitignored.

- [ ] **Step 9: hand off**

pushing `main` and the tag to `origin` is joe's call. this plan does not push. when he says go:

```bash
cd /Volumes/T7/ghost-signal
git push origin main
git push origin v0.1.0
```

then watch the first ci run on github; the pinned action shas from task 1 are the only thing that
has not executed locally.

---

## self-review

spec coverage, section by section:

| spec | task |
|---|---|
| 3.1, 3.2 color both themes | 2 |
| 3.3 type, doto bundled, lowercase chrome | 2, 5 |
| 3.4 space, radius, border, bar; no shadows | 2, 5 (css test) |
| 3.5 texture: dither, dither-strong, block-corner; no scanlines, grain, blur | 5 |
| 3.6 motion tokens, easing allow-list, reduced motion | 2, 5, 6, 8, 10, 12, 15 |
| 3.7 hooks data-theme, data-glitch, data-app | 2, 6, 14, 15 |
| 4.1 gs-mosaic: image, text, grid; dot and ascii; cols, rows, cell, gap; accent, bloom, dim; lit; bayer; no rng | 7 |
| 4.2 gs-face: seven expressions, always green, 7s blink, glitch on change, registerExpression throws on core names, status attribute | 6, 8 |
| 4.3 twenty icons, registerIcon | 6, 9 |
| 5.1 tokens.css, base.css, fx.css, icons.svg, components as es modules | 2, 5, 9, 7 to 13 |
| 5.2 every component | 7, 8, 10, 11, 12, 13 |
| 5.3 microcopy slots and rules | 11 |
| 6.1 status vocabulary, warn on unknown | 6 |
| 6.2 app.json | 14 |
| 6.3 flavor.json, allowed and locked keys, flavor build, flavor check | 14 |
| 6.4 gs- namespace check | 14 |
| 6.5 probe app | 15 |
| 7 distribution: exports, sync script, rust and swift files, range check | 1, 3, 14, 16 |
| 8 token pipeline, four outputs, ci diff | 1, 2, 3 |
| 9.1 contrast checker over pairs and css | 4, 5 |
| 9.2 reduced motion playwright | 8, 10, 12, 15 |
| 9.3 determinism: GS.seed, mosaic hashes for seven statuses plus two references | 6, 7, 8 |
| 9.4 placement throw | 12 |
| 9.5 gallery, screenshots as artifacts, by eye | 1 (artifact upload), 15 |
| 10 repo layout | file structure section; `scripts/lib/`, `src/copy.js`, `src/expressions.js`, `src/icons/`, `test/e2e/pages` are additions |
| 11 step 1 | this plan; steps 2 to 5 are out of scope |
| 12 definition of done, this repo's half | 1, 15, 16 |

not mapped, on purpose: the seance and agora migrations, the ghost tui adoption and the
`grep -rE '#[0-9a-f]{6}'` over consumer css (spec 12, later plans); the super app shell (spec 1.2).

type consistency, checked by grep across the finished document: `loadTokens`, `toCss`, `toSwift`,
`toRust`, `toMarkdown`, `checkTokens`, `scanCss`, `cssRules`, `parseGrid`, `coerceStatus`,
`glitchOnce`, `moshOnce`, `flareOnce`, `motionMs`, `glitchLevel`, `reducedMotion`, `startAmbient`,
`registerExpression`, `getExpression`, `registerIcon`, `getIcon`, `listIcons`, `registerSprite`,
`getSprite`, `registerCommands`, `getCommands`, `gridToSymbol`, `resolveExpression`, `nextFrame`,
`scrambleFrames`, `setCopy`, `copy`, `resetCopy`, `filterCommands`, `tileGrid`, `validate`,
`satisfies`, `check`, `flavorBuild`, `buildSprite`, `ICON_NAMES` are each defined once and used with
the same signature everywhere.

