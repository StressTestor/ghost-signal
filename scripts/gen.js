#!/usr/bin/env node
// writes every generated file. later tasks add outputs here; nothing else writes into gen/ or src/tokens.css
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadTokens, toCss, toSwift, toRust, toMarkdown } from './lib/tokens.js';
import { buildSprite, buildIconsModule } from './lib/icons.js';

const root = fileURLToPath(new URL('..', import.meta.url));

async function write(outputs) {
  for (const [rel, body] of outputs) {
    await writeFile(`${root}/${rel}`, body);
    process.stdout.write(`wrote ${rel}\n`);
  }
}

export async function generate() {
  const tokens = await loadTokens();
  await mkdir(`${root}/gen`, { recursive: true });
  const icons = new URL('../src/icons/', import.meta.url);
  await write([
    ['src/tokens.css', toCss(tokens)],
    ['gen/GhostSignal.swift', toSwift(tokens)],
    ['gen/ghost_signal.rs', toRust(tokens)],
    ['gen/tokens.md', toMarkdown(tokens)],
    ['src/icons.svg', await buildSprite(icons)],
    ['src/icons.js', await buildIconsModule(icons)],
  ]);
  // cli.js pulls in src/gs.js, which imports the src/icons.js written just above, so it loads
  // only now: a clone missing that file still regenerates instead of failing to resolve it
  const { flavorBuild } = await import('./lib/cli.js');
  const probe = await flavorBuild(`${root}gallery/apps/probe/flavor.json`, { gsImport: '../../../src' });
  await write([
    ['gallery/apps/probe/flavor.css', probe.css],
    ['gallery/apps/probe/flavor.js', probe.js],
  ]);
}

generate().catch((err) => {
  process.stderr.write(`gen: ${err.stack}\n`);
  process.exit(1);
});
