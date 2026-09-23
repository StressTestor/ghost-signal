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
