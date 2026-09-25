#!/usr/bin/env node
// cli wrapper. all logic lives in lib/cli.js so the tests never spawn a shell to reach it
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { check, flavorBuild } from './lib/cli.js';
import { lintMotion, expandGlobs, NESTED } from './lib/motion-lint.js';

const USAGE = [
  'usage:',
  '  ghost-signal check <file>',
  '  ghost-signal flavor check <file>',
  '  ghost-signal flavor build <file> [--out <dir>] [--gs-import <spec>]',
  '  ghost-signal lint-motion <css files or quoted globs...>',
  'exit codes: 0 ok, 1 check failed, 2 usage or io error',
  '',
].join('\n');

function parseArgs(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      flags[argv[i].slice(2)] = argv[i + 1];
      i += 1;
    } else {
      rest.push(argv[i]);
    }
  }
  return { flags, rest };
}

async function main(argv) {
  if (argv[0] === 'lint-motion') {
    const files = await expandGlobs(argv.slice(1));
    if (files.length === 0) {
      process.stderr.write(`lint-motion: no css files matched\n${USAGE}`);
      return 2;
    }
    const findings = [];
    try {
      for (const f of files) findings.push(...lintMotion(await readFile(f, 'utf8'), f));
    } catch (err) {
      // a sheet the lint can't read is a usage error, never a clean pass and never a finding
      if (err.code !== NESTED) throw err;
      process.stderr.write(`${err.message}\n`);
      return 2;
    }
    // silent when clean: a check that prints on success becomes wallpaper
    if (findings.length > 0) {
      process.stdout.write(`${findings.join('\n')}\n`);
      return 1;
    }
    return 0;
  }
  const { flags, rest } = parseArgs(argv);
  const command = rest[0] === 'flavor' ? `flavor ${rest[1] ?? ''}` : rest[0];
  const file = rest[0] === 'flavor' ? rest[2] : rest[1];
  if (file === undefined || ['check', 'flavor check', 'flavor build'].includes(command) === false) {
    process.stderr.write(USAGE);
    return 2;
  }
  if (command === 'check' || command === 'flavor check') {
    const r = await check(file);
    if (r.ok) {
      process.stdout.write(`${file}: ok (${r.kind})\n`);
      return 0;
    }
    process.stdout.write(`${r.errors.map((e) => `${file}: ${e}`).join('\n')}\n`);
    return 1;
  }
  const { css, js, id } = await flavorBuild(file, { gsImport: flags['gs-import'] ?? 'ghost-signal' });
  const dir = resolve(flags.out ?? dirname(file));
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'flavor.css'), css);
  await writeFile(join(dir, 'flavor.js'), js);
  process.stdout.write(`wrote ${join(dir, 'flavor.css')} and ${join(dir, 'flavor.js')} for ${id}\n`);
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`ghost-signal: ${err.message}\n`);
    process.exit(err.code === 'ENOENT' ? 2 : 1);
  },
);
