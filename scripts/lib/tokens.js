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
