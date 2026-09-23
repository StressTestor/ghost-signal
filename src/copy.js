// core microcopy. lowercase, deadpan, dry. a flavor overrides a slot through setCopy;
// an unknown slot is a bug in the flavor, so it throws instead of inventing a slot >:[

export const CORE_COPY = Object.freeze({
  empty: 'nothing here yet. run something and the feed will wake up',
  loading: 'tailing…',
  error: 'that failed. check the path and try once',
  denyToast: 'denied. cute. try a quieter command XX',
  bypassToast: 'something got through. zero chill detected >:D',
  crashToast: 'bridge unreachable. not answering',
  confirm: 'done',
});

export const COPY_SLOTS = Object.freeze(Object.keys(CORE_COPY));

const overrides = new Map();

function assertSlot(slot) {
  if (Object.hasOwn(CORE_COPY, slot) === false) {
    throw new RangeError(`ghost-signal: unknown copy slot "${slot}". slots: ${COPY_SLOTS.join(', ')}`);
  }
}

export function setCopy(slot, text) {
  assertSlot(slot);
  if (typeof text !== 'string') throw new TypeError(`ghost-signal: copy for "${slot}" must be a string`);
  overrides.set(slot, text);
}

export function copy(slot) {
  assertSlot(slot);
  return overrides.get(slot) ?? CORE_COPY[slot];
}

export function resetCopy() {
  overrides.clear();
}
