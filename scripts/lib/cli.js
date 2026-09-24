// check and flavor build, shared by the bin and the tests. every failure is a plain string;
// the bin turns a non-empty list into exit 1
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { loadTokens } from './tokens.js';
import { ratio } from './contrast.js';
import { validate, satisfies } from './schema.js';
import { parseGrid, CORE_EXPRESSION_NAMES } from '../../src/gs.js';

const here = new URL('.', import.meta.url);
const readJson = async (url) => JSON.parse(await readFile(url, 'utf8'));
const schemas = {
  app: await readJson(new URL('../../schema/app.v1.json', here)),
  flavor: await readJson(new URL('../../schema/flavor.v1.json', here)),
};
const pkg = await readJson(new URL('../../package.json', here));
const DEFINE_RE = /customElements\.define\(\s*['"`]gs-/;

function kindOf(json, file) {
  const s = typeof json.$schema === 'string' ? json.$schema : '';
  if (s.endsWith('app.v1.json')) return 'app';
  if (s.endsWith('flavor.v1.json')) return 'flavor';
  if (basename(file) === 'app.json') return 'app';
  if (basename(file) === 'flavor.json') return 'flavor';
  return null;
}

async function checkGrid(path, cols, rows, label) {
  try {
    parseGrid(await readFile(path, 'utf8'), cols, rows);
    return [];
  } catch (e) {
    return [`${label}: ${e.message}`];
  }
}

async function checkFlavor(f, dir) {
  const errors = [];
  const tokens = await loadTokens();
  if (typeof f.accent2 === 'object' && f.accent2 !== null) {
    for (const theme of ['dark', 'light']) {
      const hex = f.accent2[theme];
      if (typeof hex !== 'string' || /^#[0-9a-f]{6}$/.test(hex) === false) continue;
      for (const bg of ['void', 'surface', 'raised']) {
        const r = ratio(hex, tokens.color[theme][bg]);
        if (r < tokens.contrast.minimum) {
          errors.push(`accent2.${theme} ${hex} on ${bg} is ${r.toFixed(2)}:1, needs ${tokens.contrast.minimum}:1`);
        }
      }
    }
  }
  for (const [name, rel] of Object.entries(f.expressions ?? {})) {
    if (CORE_EXPRESSION_NAMES.includes(name)) errors.push(`expressions.${name}: core expression names cannot be replaced`);
    if (typeof rel === 'string') errors.push(...await checkGrid(join(dir, rel), 16, 10, `expressions.${name}`));
  }
  for (const [name, rel] of Object.entries(f.icons ?? {})) {
    if (typeof rel === 'string') errors.push(...await checkGrid(join(dir, rel), 16, 16, `icons.${name}`));
  }
  if (typeof f.sprite === 'string') errors.push(...await checkGrid(join(dir, f.sprite), undefined, undefined, 'sprite'));
  return errors;
}

async function checkApp(a, dir) {
  const errors = [];
  if (typeof a.flavor === 'string') {
    const r = await check(join(dir, a.flavor));
    errors.push(...r.errors.map((e) => `flavor: ${e}`));
  }
  for (const rel of (await appSources(dir)).sort()) {
    const src = await readFile(join(dir, rel), 'utf8');
    if (DEFINE_RE.test(src)) errors.push(`${rel.split(sep).join('/')}: defines a gs-* custom element; the gs- prefix is reserved`);
  }
  return errors;
}

// the app's own source only: dependency, build and vcs dirs are skipped by name, and so is any
// vendored ghost-signal copy (VERSION + src/gs.js, what sync-ghost-signal.sh writes), since the
// core components defining gs-* is the whole point of them. the app's own dir is never skipped
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'target', '.git']);
const SOURCE_RE = /\.(js|mjs|ts)$/;

async function isGhostSignalCopy(path) {
  const has = (rel) => stat(join(path, rel)).then((s) => s.isFile(), () => false);
  return (await has('VERSION')) && (await has(join('src', 'gs.js')));
}

async function appSources(root, rel = '') {
  const out = [];
  for (const entry of await readdir(join(root, rel), { withFileTypes: true })) {
    const child = join(rel, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || await isGhostSignalCopy(join(root, child))) continue;
      out.push(...await appSources(root, child));
    } else if (entry.isFile() && SOURCE_RE.test(entry.name)) {
      out.push(child);
    }
  }
  return out;
}

export async function check(file) {
  const abs = resolve(file);
  let json;
  try {
    json = await readJson(abs);
  } catch (e) {
    if (e.code === 'ENOENT') throw e;
    return { ok: false, kind: null, errors: [`${file}: ${e.message}`] };
  }
  const kind = kindOf(json, abs);
  if (kind === null) {
    return { ok: false, kind, errors: [`${file}: cannot tell app.json from flavor.json (set $schema or use the standard filename)`] };
  }
  const errors = validate(schemas[kind], json);
  if (typeof json.ghostSignal === 'string' && /^[~^]?\d+\.\d+(\.\d+)?$/.test(json.ghostSignal) && satisfies(json.ghostSignal, pkg.version) === false) {
    errors.push(`ghostSignal range ${json.ghostSignal} excludes installed ${pkg.version}`);
  }
  if (kind === 'flavor') errors.push(...await checkFlavor(json, dirname(abs)));
  if (kind === 'app') errors.push(...await checkApp(json, dirname(abs)));
  return { ok: errors.length === 0, kind, errors };
}

async function readGrid(path, cols, rows) {
  return parseGrid(await readFile(path, 'utf8'), cols, rows);
}

export async function flavorBuild(file, { gsImport = 'ghost-signal' } = {}) {
  const abs = resolve(file);
  const dir = dirname(abs);
  const result = await check(abs);
  if (result.ok === false) throw new Error(result.errors.join('\n'));
  const f = await readJson(abs);
  const id = f.app;

  const dark = [`[data-app="${id}"] {`];
  if (f.accent2 !== undefined) dark.push(`  --gs-color-accent-2: ${f.accent2.dark};`);
  if (f.display !== undefined) dark.push(`  --gs-font-display: ${f.display};`);
  if (f.texture === 'none') dark.push('  --gs-dither: none;', '  --gs-dither-strong: none;');
  dark.push('}');
  const light = f.accent2 === undefined ? [] : [
    // compound when data-app sits on <html> (the documented consumer layout), descendant when
    // an app mounts into a subtree of someone else's page (the gallery's probe section)
    `:root[data-theme="light"][data-app="${id}"], :root[data-theme="light"] [data-app="${id}"] {`,
    `  --gs-color-accent-2: ${f.accent2.light};`,
    '}',
  ];
  const css = [`/* generated by ghost-signal flavor build from ${basename(abs)}. do not edit */`, ...dark, '', ...light, ''].join('\n');

  const js = [
    `// generated by ghost-signal flavor build from ${basename(abs)}. do not edit`,
    `import { registerExpression, registerIcon, registerSprite } from '${gsImport}/gs.js';`,
    `import { setCopy } from '${gsImport}/copy.js';`,
    '',
  ];
  for (const [name, rel] of Object.entries(f.expressions ?? {})) {
    js.push(`registerExpression('${name}', ${JSON.stringify(await readGrid(join(dir, rel), 16, 10))});`);
  }
  for (const [name, rel] of Object.entries(f.icons ?? {})) {
    js.push(`registerIcon('${name}', ${JSON.stringify(await readGrid(join(dir, rel), 16, 16))});`);
  }
  if (f.sprite !== undefined) js.push(`registerSprite('${id}', ${JSON.stringify(await readGrid(join(dir, f.sprite)))});`);
  for (const [slot, text] of Object.entries(f.copy ?? {})) js.push(`setCopy('${slot}', ${JSON.stringify(text)});`);
  js.push(`export const app = '${id}';`, '');

  return { css, js: js.join('\n'), id };
}
