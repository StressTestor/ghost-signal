import { test, expect } from '@playwright/test';

test('the static server serves the repo root with correct mime types', async ({ request }) => {
  const res = await request.get('/package.json');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('application/json');
  const missing = await request.get('/does-not-exist.js');
  expect(missing.status()).toBe(404);
  // a literal /../ is normalized away by the url parser before it leaves playwright;
  // the encoded slash survives, serve.js decodes it, and the .. check must catch it.
  // the repo root is a directory named ghost-signal, so /../ghost-signal/package.json
  // resolves right back to this repo's own package.json once the guard is removed --
  // a real, existing file just above the served root, not a path that 404s anyway.
  // that makes this assertion actually fail if the traversal guard regresses.
  const escape = await request.get('/..%2Fghost-signal%2Fpackage.json');
  expect(escape.status()).toBe(404);
});
