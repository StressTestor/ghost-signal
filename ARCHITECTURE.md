# architecture

ghost signal is the design system for joe's guis: tokens, a css layer, web components, and a
plug-in contract (manifest + flavor) so new apps join without core edits. nothing is built yet;
the design is in `docs/superpowers/specs/2026-09-23-ghost-signal-design.md`.

## stack

| layer | choice | why |
|---|---|---|
| tokens | `tokens.json` -> generated css, swift, rust | one source, four surfaces |
| web | plain es modules + css, no bundler, no runtime deps | consumers (tauri apps) import files as-is |
| generator / cli | node, no dependencies | `scripts/gen.js`, `scripts/ghost-signal.js` |
| fonts | doto (ofl) bundled as woff2 | offline, tauri csp |
| tests | `node:test` + playwright | contrast, reduced motion, determinism, plug-in probe |
| consumers | seance, agora (tauri + vanilla ts/js), ghost + sentinel (ratatui), static-field + nativeterm (swiftui) | |

## tree

see spec section 10. it will be mirrored here once files exist.

## key patterns

- semantic tokens only, `gs-` prefix. flavors override a fixed allow-list; the checker rejects
  anything else.
- `<gs-mosaic>` is the single renderer for the face, icons, splash art and wallpaper sprites, and
  it has no rng so snapshots are stable.
- status vocabulary: `idle working ok warn deny bypass crash`. everything keys off it.
- motion default is a hard cut; easing is an explicit exception list.

## gotchas

- generated files are committed and ci diffs them. edit `tokens.json`, never the outputs.
- `<gs-wallpaper>` throws outside `gs-empty` / `gs-error` / `gs-splash`. that is on purpose.

## commands

none yet.

last updated: 2026-09-23
