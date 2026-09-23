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
