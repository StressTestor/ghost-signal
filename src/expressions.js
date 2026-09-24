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
