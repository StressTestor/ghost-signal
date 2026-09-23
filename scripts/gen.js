#!/usr/bin/env node
// writes every generated file. later tasks add outputs here; nothing else writes into gen/ or src/tokens.css
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadTokens, toCss } from './lib/tokens.js';

const root = fileURLToPath(new URL('..', import.meta.url));

export async function generate() {
  const tokens = await loadTokens();
  await mkdir(`${root}/gen`, { recursive: true });
  const outputs = [
    ['src/tokens.css', toCss(tokens)],
  ];
  for (const [rel, body] of outputs) {
    await writeFile(`${root}/${rel}`, body);
    process.stdout.write(`wrote ${rel}\n`);
  }
}

generate().catch((err) => {
  process.stderr.write(`gen: ${err.stack}\n`);
  process.exit(1);
});
