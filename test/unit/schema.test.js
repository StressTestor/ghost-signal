import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validate, satisfies } from '../../scripts/lib/schema.js';

const flavorSchema = JSON.parse(await readFile(new URL('../../schema/flavor.v1.json', import.meta.url), 'utf8'));
const appSchema = JSON.parse(await readFile(new URL('../../schema/app.v1.json', import.meta.url), 'utf8'));

test('validate covers type, required, enum, pattern, properties, additionalProperties and items', () => {
  const schema = {
    type: 'object',
    required: ['id', 'list'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', pattern: '^[a-z]+$' },
      kind: { enum: ['a', 'b'] },
      list: { type: 'array', items: { type: 'number' } },
      map: { type: 'object', additionalProperties: { type: 'string' } },
    },
  };
  assert.deepEqual(validate(schema, { id: 'ok', kind: 'a', list: [1], map: { x: 'y' } }), []);
  const errors = validate(schema, { id: 'NO', kind: 'c', list: ['1'], map: { x: 1 }, extra: true });
  assert.ok(errors.some((e) => e.startsWith('$.id: does not match')));
  assert.ok(errors.some((e) => e.startsWith('$.kind: must be one of a, b')));
  assert.ok(errors.some((e) => e.startsWith('$.list[0]: expected number, got string')));
  assert.ok(errors.some((e) => e.startsWith('$.map.x: expected string, got number')));
  assert.ok(errors.some((e) => e.startsWith('$.extra: not allowed')));
  assert.deepEqual(validate(schema, {}), ['$.id: required', '$.list: required']);
  assert.deepEqual(validate({ type: 'object' }, null), ['$: expected object, got null']);
});

test('the flavor schema rejects locked keys and accepts the allowed set', () => {
  const good = {
    app: 'probe', ghostSignal: '^0.1', accent2: { dark: '#b78bff', light: '#6b2fc9' }, display: 'Georgia, serif',
    texture: 'dither', sprite: './sprites/probe.grid', expressions: { probing: './expressions/probing.grid' },
    icons: { sigil: './icons/sigil.grid' }, copy: { empty: 'quiet' },
  };
  assert.deepEqual(validate(flavorSchema, good), []);
  assert.deepEqual(validate(flavorSchema, { ...good, accent: '#00ff00' }), ['$.accent: not allowed']);
  assert.deepEqual(validate(flavorSchema, { ...good, copy: { greeting: 'hi' } }), ['$.copy.greeting: not allowed']);
  assert.deepEqual(validate(flavorSchema, { ...good, accent2: '#b78bff' }), ['$.accent2: expected object, got string']);
  assert.deepEqual(validate(flavorSchema, { ...good, texture: 'grain' }), ['$.texture: must be one of dither, none']);
});

test('the app schema requires the manifest keys and constrains ids', () => {
  const good = {
    id: 'probe', name: 'probe', version: '0.1.0', ghostSignal: '^0.1', flavor: './flavor.json', entry: './index.html',
    status: { kind: 'event', name: 'probe:status' }, commands: [{ id: 'probe.ping', title: 'ping', shortcut: 'p' }], icon: 'ghost',
  };
  assert.deepEqual(validate(appSchema, good), []);
  assert.deepEqual(validate(appSchema, { ...good, id: 'Probe' }), ['$.id: does not match ^[a-z0-9-]+$']);
  assert.deepEqual(validate(appSchema, { ...good, status: { kind: 'file', name: 'x' } }), ['$.status.kind: must be one of event']);
});

test('satisfies handles caret, tilde and exact ranges', () => {
  assert.equal(satisfies('^0.1', '0.1.0'), true);
  assert.equal(satisfies('^0.1', '0.1.9'), true);
  assert.equal(satisfies('^0.1', '0.2.0'), false);
  assert.equal(satisfies('^0.2', '0.1.0'), false);
  assert.equal(satisfies('^1.2', '1.3.0'), true);
  assert.equal(satisfies('^1.2', '1.1.0'), false);
  assert.equal(satisfies('^1.2', '2.0.0'), false);
  assert.equal(satisfies('~0.1.2', '0.1.5'), true);
  assert.equal(satisfies('~0.1.2', '0.1.1'), false);
  assert.equal(satisfies('~0.1.2', '0.2.0'), false);
  assert.equal(satisfies('0.1.0', '0.1.0'), true);
  assert.equal(satisfies('0.1.0', '0.1.1'), false);
  assert.throws(() => satisfies('>=0.1', '0.1.0'), RangeError);
});
