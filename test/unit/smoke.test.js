import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('package.json has no runtime dependencies and one pinned dev dependency', async () => {
  const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.dependencies, undefined);
  assert.deepEqual(Object.keys(pkg.devDependencies), ['@playwright/test']);
  assert.match(pkg.devDependencies['@playwright/test'], /^\d+\.\d+\.\d+$/);
  assert.equal(pkg.type, 'module');
});
