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
