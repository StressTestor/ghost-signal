import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTokens } from '../../scripts/lib/tokens.js';
import { ratio } from '../../scripts/lib/contrast.js';
import { STATUSES } from '../../src/gs.js';
import { tapeTextColor } from '../../src/components/tape.js';

test('tape text clears the contrast minimum on every status fill, in both themes', async () => {
  const tokens = await loadTokens();
  for (const theme of ['dark', 'light']) {
    for (const status of STATUSES) {
      const ink = /^var\(--gs-color-([a-z-]+)\)$/.exec(tapeTextColor(status));
      assert.ok(ink, `${status}: ${tapeTextColor(status)} is not a color token`);
      const fg = tokens.color[theme][ink[1]];
      const bg = tokens.color[theme][tokens.status[status]];
      const r = ratio(fg, bg);
      assert.ok(r >= tokens.contrast.minimum, `${theme} ${status}: ${ink[1]} ${fg} on ${bg} is ${r.toFixed(2)}:1`);
    }
  }
});
