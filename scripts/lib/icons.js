// src/icons/<name>.grid -> src/icons.svg and src/icons.js. one entry per file, sorted by name so the
// output is stable
import { readdir, readFile } from 'node:fs/promises';
import { parseGrid, gridToSymbol } from '../../src/grid.js';

export const ICON_NAMES = Object.freeze([
  'watch', 'filter', 'search', 'close', 'expand', 'collapse', 'copy', 'settings', 'terminal', 'log',
  'deny', 'bypass', 'warn', 'ok', 'idle', 'app', 'palette', 'window', 'tape', 'ghost',
]);

async function readIcons(dirUrl) {
  const files = (await readdir(dirUrl)).filter((f) => f.endsWith('.grid')).sort();
  const out = [];
  for (const file of files) {
    out.push([file.slice(0, -'.grid'.length), parseGrid(await readFile(new URL(file, dirUrl), 'utf8'), 16, 16)]);
  }
  return out;
}

// data only, no imports: gs.js imports it and registers every grid on load. if this module
// imported registerIcon from gs.js instead, the cycle would run it before gs.js's registry exists
export async function buildIconsModule(dirUrl) {
  return [
    '// generated from src/icons/*.grid by scripts/gen.js. do not edit',
    '// gs.js imports this and registers every grid, so importing gs.js is enough to get core icons',
    'export const CORE_ICONS = Object.freeze({',
    ...(await readIcons(dirUrl)).map(([name, grid]) => `  ${name}: ${JSON.stringify(grid)},`),
    '});',
    '',
  ].join('\n');
}

export async function buildSprite(dirUrl) {
  const symbols = (await readIcons(dirUrl)).map(([name, grid]) => gridToSymbol(name, grid));
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true">',
    '<!-- generated from src/icons/*.grid by scripts/gen.js. do not edit -->',
    ...symbols,
    '</svg>',
    '',
  ].join('\n');
}
