import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterCommands, GsPalette } from '../../src/components/palette.js';

const list = [
  { id: 'probe.ping', title: 'ping the bridge', shortcut: 'p', app: 'probe' },
  { id: 'probe.tests', title: 'run tests', shortcut: '', app: 'probe' },
  { id: 'shell.theme', title: 'toggle theme', shortcut: 't', app: 'shell' },
];

test('the module imports in node', () => {
  assert.equal(typeof GsPalette, 'function');
});

test('filterCommands matches a case-insensitive substring of title or id and keeps order', () => {
  assert.deepEqual(filterCommands(list, ''), list);
  assert.deepEqual(filterCommands(list, '  '), list);
  assert.deepEqual(filterCommands(list, 'THE').map((c) => c.id), ['probe.ping', 'shell.theme']);
  assert.deepEqual(filterCommands(list, 'tests').map((c) => c.id), ['probe.tests']);
  assert.deepEqual(filterCommands(list, 'shell.').map((c) => c.id), ['shell.theme']);
  assert.deepEqual(filterCommands(list, 'zzz'), []);
});
