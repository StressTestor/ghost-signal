import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CORE_COPY, COPY_SLOTS, setCopy, copy, resetCopy } from '../../src/copy.js';

test('the seven core slots match spec 5.3 exactly', () => {
  assert.deepEqual({ ...CORE_COPY }, {
    empty: 'nothing here yet. run something and the feed will wake up',
    loading: 'tailing…',
    error: 'that failed. check the path and try once',
    denyToast: 'denied. cute. try a quieter command XX',
    bypassToast: 'something got through. zero chill detected >:D',
    crashToast: 'bridge unreachable. not answering',
    confirm: 'done',
  });
  assert.deepEqual([...COPY_SLOTS], Object.keys(CORE_COPY));
  assert.ok(Object.isFrozen(CORE_COPY));
});

test('core copy is lowercase with no exclamation points, em dashes, oops, successfully or please', () => {
  for (const text of Object.values(CORE_COPY)) {
    assert.equal(text, text.toLowerCase().replace(/xx$/, 'XX').replace(/>:d$/, '>:D'), text);
    assert.doesNotMatch(text, /!|—|oops|successfully|please/);
  }
});

test('setCopy overrides a known slot, rejects unknown slots and non-strings, resetCopy restores', () => {
  setCopy('empty', 'the spirits are quiet');
  assert.equal(copy('empty'), 'the spirits are quiet');
  assert.equal(copy('loading'), 'tailing…');
  assert.throws(() => setCopy('greeting', 'hi'), RangeError);
  assert.throws(() => setCopy('empty', 42), TypeError);
  assert.throws(() => copy('greeting'), RangeError);
  resetCopy();
  assert.equal(copy('empty'), CORE_COPY.empty);
});
