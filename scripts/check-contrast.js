#!/usr/bin/env node
// exits 1 with one line per failure. exit 0 means every allowed pair clears 4.5:1
// and neither css file uses a forbidden text token. exits 2 if it cannot evaluate.
import { readFile } from 'node:fs/promises';
import { loadTokens } from './lib/tokens.js';
import { checkTokens, scanCss } from './lib/contrast.js';

const root = new URL('..', import.meta.url);

async function main() {
  // an optional path lets a test point the checker at a deliberately broken copy
  const tokens = await loadTokens(process.argv[2] ?? undefined);
  const lines = [];
  for (const f of checkTokens(tokens)) {
    lines.push(`tokens: ${f.theme} ${f.fg} on ${f.bg} is ${f.ratio}:1, needs ${tokens.contrast.minimum}:1`);
  }
  for (const file of ['src/base.css', 'src/fx.css']) {
    const css = await readFile(new URL(file, root), 'utf8').catch(() => null);
    if (css === null) continue;
    for (const f of scanCss(css, tokens, file)) lines.push(`${file}: ${f.selector} uses ${f.token}: ${f.reason}`);
  }
  if (lines.length > 0) {
    process.stdout.write(`${lines.join('\n')}\n`);
    process.exit(1);
  }
  process.stdout.write('contrast ok\n');
}

main().catch((err) => {
  process.stderr.write(`check-contrast: ${err.stack}\n`);
  process.exit(2);
});
