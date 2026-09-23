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
