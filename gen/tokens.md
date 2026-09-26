# ghost signal tokens

generated from tokens.json by scripts/gen.js. do not edit.

## color

| token | dark | light |
| --- | --- | --- |
| `--gs-color-void` | `#050505` | `#f2f4f5` |
| `--gs-color-surface` | `#0c0c0d` | `#e9ecee` |
| `--gs-color-raised` | `#151517` | `#e4e7e9` |
| `--gs-color-hairline` | `#1e1f21` | `#d3d7da` |
| `--gs-color-etch` | `#2a2c2f` | `#b9bec2` |
| `--gs-color-text` | `#eef1f2` | `#0b0c0d` |
| `--gs-color-text-muted` | `#8e9396` | `#4b5054` |
| `--gs-color-text-faint` | `#3a3e41` | `#b0b5b9` |
| `--gs-color-accent` | `#0ec224` | `#08701a` |
| `--gs-color-accent-bloom` | `#b2fcba` | `#0ec224` |
| `--gs-color-accent-dim` | `#257829` | `#c6ecc9` |
| `--gs-color-ok` | `#0cc0cb` | `#08666c` |
| `--gs-color-warn` | `#e8a33d` | `#7f560b` |
| `--gs-color-deny` | `#ff5c4d` | `#ad2a23` |
| `--gs-color-bypass` | `#f8098c` | `#b0065f` |
| `--gs-color-glitch-a` | `#f8098c` | `#b0065f` |
| `--gs-color-glitch-b` | `#0cc0cb` | `#08666c` |
| `--gs-color-on-accent` | `#050505` | `#f2f4f5` |

## status

| status | color token | kaomoji |
| --- | --- | --- |
| `idle` | `text-faint` | `(｡◕‿↼)` |
| `working` | `accent` | `(¬‿¬)` |
| `ok` | `ok` | `(｡◕‿↼)` |
| `warn` | `warn` | `(¬_¬)` |
| `deny` | `deny` | `>:[` |
| `bypass` | `bypass` | `>:D` |
| `crash` | `bypass` | `XX` |

## font

| token | value |
| --- | --- |
| `--gs-font-display` | `"Doto", var(--gs-font-mono)` |
| `--gs-font-ui` | `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif` |
| `--gs-font-label` | `"Avenir Next Condensed", "SF Compact Text", "Arial Narrow", var(--gs-font-ui)` |
| `--gs-font-mono` | `ui-monospace, "SF Mono", "Cascadia Code", "JetBrains Mono", Menlo, monospace` |

## size

| token | value |
| --- | --- |
| `--gs-size-label` | `11px` |
| `--gs-size-mono` | `12px` |
| `--gs-size-body` | `13px` |
| `--gs-size-title` | `18px` |
| `--gs-size-wordmark` | `34px` |

## tracking

| token | value |
| --- | --- |
| `--gs-tracking-label` | `0.08em` |

## space

| token | value |
| --- | --- |
| `--gs-space-1` | `4px` |
| `--gs-space-2` | `8px` |
| `--gs-space-3` | `12px` |
| `--gs-space-4` | `16px` |
| `--gs-space-5` | `24px` |
| `--gs-space-6` | `40px` |

## radius

| token | value |
| --- | --- |
| `--gs-radius-control` | `4px` |
| `--gs-radius-panel` | `8px` |
| `--gs-radius-pill` | `999px` |

## bare

| token | value |
| --- | --- |
| `--gs-border` | `1px solid var(--gs-color-hairline)` |
| `--gs-bar` | `3px` |

## motion

| token | value |
| --- | --- |
| `--gs-motion-sprite` | `800ms` |
| `--gs-motion-cut` | `0ms` |
| `--gs-motion-glitch` | `180ms` |
| `--gs-motion-mosh` | `420ms` |
| `--gs-motion-flare` | `640ms` |
| `--gs-motion-hover` | `0ms` |
| `--gs-motion-decode` | `250ms` |
| `--gs-motion-ambient-min` | `20s` |
| `--gs-motion-ambient-max` | `40s` |
| `--gs-motion-enter` | `167ms` |
| `--gs-motion-exit` | `100ms` |
| `--gs-motion-view` | `183ms` |
| `--gs-motion-shift` | `200ms` |
| `--gs-motion-indicator` | `117ms` |
| `--gs-motion-value` | `233ms` |

## step

| token | value |
| --- | --- |
| `--gs-step-sprite` | `steps(4)` |
| `--gs-step-glitch` | `steps(3)` |
| `--gs-step-mosh` | `steps(6)` |
| `--gs-step-flare` | `steps(8)` |
| `--gs-step-decode` | `steps(6)` |

## ease

| token | value |
| --- | --- |
| `--gs-ease-hover` | `ease-out` |
| `--gs-ease-enter` | `cubic-bezier(0.16, 1, 0.3, 1)` |
| `--gs-ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` |
| `--gs-ease-move` | `cubic-bezier(0.16, 1, 0.3, 1)` |

deprecated, removed in 0.3: `--gs-motion-hover`, `--gs-ease-hover`. both stay emitted so an old `var()` still resolves, and at 0ms a leftover transition creates no animation.

## distance

| token | value |
| --- | --- |
| `--gs-distance-enter` | `8px` |
| `--gs-distance-toast` | `24px` |
| `--gs-distance-view` | `16px` |

## feel budgets

read by `src/feel/budgets.js` at run time from the tag an app pins. never emitted to css.

| budget | value |
| --- | --- |
| `frame` | `16.7ms` |
| `vsyncMiss` | `1.5` |
| `input` | `50ms` |
| `task` | `50ms` |
| `answer` | `50ms` |
| `shift` | `0` |
| `settle` | `1000ms` |
| `runs` | `3` |
| `properties` | `transform, opacity` |

## contrast

minimum ratio 4.5:1. text tokens allowed per background:

- `void`: `text`, `text-muted`, `accent`, `ok`, `warn`, `deny`, `bypass`
- `surface`: `text`, `text-muted`, `accent`, `ok`, `warn`, `deny`, `bypass`
- `raised`: `text`, `text-muted`, `accent`, `ok`, `warn`
- `accent`: `on-accent`
- `deny`: `on-accent`

never text: `text-faint`, `hairline`, `etch`, `accent-dim`
