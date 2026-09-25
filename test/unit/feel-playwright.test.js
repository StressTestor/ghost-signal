import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feelProject, feelUse, plantedShift } from '../../src/feel/playwright.js';

// spec 8.1: feelProject carries the isolation to consumers, so a config that runs everything else
// in parallel still runs feel specs alone, unretried and untraced
test('feelProject runs feel specs on one worker, in order, never retried', () => {
  const p = feelProject();
  assert.equal(p.name, 'feel');
  assert.equal(p.workers, 1);
  assert.equal(p.fullyParallel, false);
  assert.equal(p.retries, 0);
  assert.deepEqual(p.use, { ...feelUse });
});

test('feelProject overrides merge into use without dropping the isolation', () => {
  const p = feelProject({ testDir: 'e2e', use: { baseURL: 'http://127.0.0.1:1420' } });
  assert.equal(p.testDir, 'e2e');
  assert.equal(p.workers, 1);
  assert.equal(p.use.trace, 'off');
  assert.equal(p.use.baseURL, 'http://127.0.0.1:1420');
});

// selfTest credits the planted row by what it is, never by which step it fell in: a page that never
// goes quiet holds step 0 open past the landing, and a page's own shift can land on any step
const planted = { plantedAt: 1000, plantedMoves: [48] };
const shiftAt = (at, dy, dx = 0) => ({ check: 'shift', step: { index: 0 }, data: { value: 0.02, at, sources: [{ path: 'main', dx, dy }] } });

test('plantedShift credits a shift that lands after the prepend and moves what the row moved', () => {
  assert.equal(plantedShift(shiftAt(1012, 48), planted), true);
  assert.equal(plantedShift(shiftAt(1012, 47.5), planted), true, 'a rect snapped to the device pixel still matches');
});

test("plantedShift never credits the page's own shift", () => {
  assert.equal(plantedShift(shiftAt(990, 48), planted), false, 'before the row landed');
  assert.equal(plantedShift(shiftAt(1600, 48), planted), false, 'long after the row landed');
  assert.equal(plantedShift(shiftAt(1012, 0, 3), planted), false, 'a badge that shifts itself sideways in the same frame');
  assert.equal(plantedShift(shiftAt(1012, 20), planted), false, 'a move the row never made');
  assert.equal(plantedShift(shiftAt(1012, 48), { plantedAt: 1000, plantedMoves: [] }), false, 'a row that moved nothing');
  assert.equal(plantedShift(shiftAt(1012, 48), { plantedAt: null, plantedMoves: [48] }), false, 'a row that never landed');
  assert.equal(plantedShift({ ...shiftAt(1012, 48), check: 'settle' }, planted), false);
});
