// the smallest json schema subset the two schemas need: type, required, enum, pattern,
// properties, additionalProperties (false or a schema), items. no dependency, no draft magic

function typeOf(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

export function validate(schema, value, path = '$') {
  const errors = [];
  if (schema.type !== undefined && typeOf(value) !== schema.type) {
    errors.push(`${path}: expected ${schema.type}, got ${typeOf(value)}`);
    return errors;
  }
  if (schema.enum !== undefined && schema.enum.includes(value) === false) {
    errors.push(`${path}: must be one of ${schema.enum.join(', ')}`);
  }
  if (schema.pattern !== undefined && typeof value === 'string' && new RegExp(schema.pattern).test(value) === false) {
    errors.push(`${path}: does not match ${schema.pattern}`);
  }
  if (typeOf(value) === 'object') {
    for (const key of schema.required ?? []) {
      if (Object.hasOwn(value, key) === false) errors.push(`${path}.${key}: required`);
    }
    for (const [key, v] of Object.entries(value)) {
      const sub = schema.properties?.[key];
      if (sub !== undefined) errors.push(...validate(sub, v, `${path}.${key}`));
      else if (schema.additionalProperties === false) errors.push(`${path}.${key}: not allowed`);
      else if (typeof schema.additionalProperties === 'object') errors.push(...validate(schema.additionalProperties, v, `${path}.${key}`));
    }
  }
  if (Array.isArray(value) && schema.items !== undefined) {
    value.forEach((v, i) => errors.push(...validate(schema.items, v, `${path}[${i}]`)));
  }
  return errors;
}

function parts(s) {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(s);
  if (m === null) throw new RangeError(`ghost-signal: bad version or range "${s}"`);
  return [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
}

// ^a.b: same major, minor >= b (major 0: minor must equal b). ~a.b.c: same major and minor,
// patch >= c. anything else must be exact. no other operators, on purpose
export function satisfies(range, version) {
  const [vMajor, vMinor, vPatch] = parts(version);
  if (range.startsWith('^')) {
    const [a, b] = parts(range.slice(1));
    return vMajor === a && (a === 0 ? vMinor === b : vMinor >= b);
  }
  if (range.startsWith('~')) {
    const [a, b, c] = parts(range.slice(1));
    return vMajor === a && vMinor === b && vPatch >= c;
  }
  const [a, b, c] = parts(range);
  return vMajor === a && vMinor === b && vPatch === c;
}
