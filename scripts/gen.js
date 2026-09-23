#!/usr/bin/env node
// writes every generated file. later tasks add outputs here; nothing else writes into gen/ or src/tokens.css
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadTokens, toCss, toSwift, toRust, toMarkdown } from './lib/tokens.js';
import { buildSprite } from './lib/icons.js';

const root = fileURLToPath(new URL('..', import.meta.url));

export async function generate() {
  const tokens = await loadTokens();
  await mkdir(`${root}/gen`, { recursive: true });
  const outputs = [
    ['src/tokens.css', toCss(tokens)],
    ['gen/GhostSignal.swift', toSwift(tokens)],
    ['gen/ghost_signal.rs', toRust(tokens)],
    ['gen/tokens.md', toMarkdown(tokens)],
    ['src/icons.svg', await buildSprite(new URL('../src/icons/', import.meta.url))],
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
