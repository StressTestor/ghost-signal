// wcag 2.x relative luminance and contrast ratio. the checker is the authority:
// if a token fails here the token changes, never the threshold (¬_¬)

export function hexToRgb(hex) {
  if (/^#[0-9a-f]{6}$/i.test(hex) === false) throw new TypeError(`expected #rrggbb with 6 hex digits, got ${hex}`);
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function channel(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function ratio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function checkTokens(tokens) {
  const failures = [];
  const min = tokens.contrast.minimum;
  for (const theme of Object.keys(tokens.color)) {
    const palette = tokens.color[theme];
    for (const [bg, fgs] of Object.entries(tokens.contrast.textOn)) {
      for (const fg of fgs) {
        if (palette[fg] === undefined || palette[bg] === undefined) {
          throw new RangeError(`contrast.textOn names an unknown token: ${fg} on ${bg}`);
        }
        const r = ratio(palette[fg], palette[bg]);
        if (r < min) failures.push({ theme, fg, bg, ratio: Number(r.toFixed(2)) });
      }
    }
  }
  return failures;
}

export const UNBALANCED = 'ERR_CSS_UNBALANCED';

// minimal css rule walker: enough for our own sheets. handles nested @media and @supports and
// records them as parents; @keyframes percent blocks come back as rules whose parent is the @keyframes prelude.
// flat sheets only: a style rule nested in another would come back glued to its parent's
// declarations, so a caller that can't live with that passes onNested(inner, outer), called at the
// '{' that opens inside a style rule. strings, escapes and comments are skipped as text, so
// content: "}" stays in its body. a brace count that doesn't come out even throws UNBALANCED:
// half a sheet read is worse than none. a brace inside an unquoted url() still counts as a brace
export function cssRules(css, { file = 'css', onNested } = {}) {
  const out = [];
  const stack = [];
  const opened = [];
  let buf = '';
  let line = 1;
  const refuse = (at, what) => {
    throw Object.assign(new Error(`unbalanced braces (${file} line ${at}: ${what}), a brace inside an unquoted url() isn't supported`), { code: UNBALANCED });
  };
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === '\n') line += 1;
    if (ch === '/' && css[i + 1] === '*') {
      // a comment is nothing at all. an unclosed one runs to the end of the sheet, as it does in a browser
      const end = css.indexOf('*/', i + 2);
      const stop = end === -1 ? css.length : end + 2;
      line += (css.slice(i, stop).match(/\n/g) ?? []).length;
      i = stop - 1;
    } else if (ch === '\\') {
      buf += ch + (css[i + 1] ?? '');
      if (css[i + 1] === '\n') line += 1;
      i += 1;
    } else if (ch === '"' || ch === "'") {
      // a string is text: its braces, semicolons and comment openers belong to the value
      const from = line;
      let j = i + 1;
      for (; j < css.length && css[j] !== ch; j += 1) {
        if (css[j] === '\\') j += 1;
        if (css[j] === '\n') line += 1;
      }
      if (j >= css.length) refuse(from, 'a string never closes');
      buf += css.slice(i, j + 1);
      i = j;
    } else if (ch === ';' && (stack.length === 0 || stack.at(-1).startsWith('@'))) {
      // outside a style rule a ';' ends a statement (@import, @charset, @layer a, b). without this
      // reset it glues onto the next prelude, which then starts with '@' and the rule vanishes
      buf = '';
    } else if (ch === '{') {
      const prelude = buf.trim();
      const outer = stack.find((s) => s.startsWith('@') === false);
      if (outer !== undefined && onNested !== undefined) onNested(prelude.slice(prelude.lastIndexOf(';') + 1).trim(), outer);
      stack.push(prelude);
      opened.push(line);
      buf = '';
    } else if (ch === '}') {
      if (stack.length === 0) refuse(line, "a '}' that closes nothing");
      const selector = stack.pop();
      opened.pop();
      if (selector.startsWith('@') === false && buf.trim() !== '') {
        out.push({ selector, body: buf, parents: stack.filter((s) => s.startsWith('@')) });
      }
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (stack.length !== 0) refuse(opened.at(-1), `${stack.at(-1)} never closes`);
  return out;
}

function declarations(body) {
  return body.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const i = d.indexOf(':');
    return { property: d.slice(0, i).trim(), value: d.slice(i + 1).trim() };
  });
}

const TOKEN_RE = /var\(--gs-color-([a-z0-9-]+)\)/;

export function scanCss(css, tokens, file) {
  const failures = [];
  const never = new Set(tokens.contrast.neverText);
  const onRaised = new Set(tokens.contrast.textOn.raised);
  for (const { selector, body } of cssRules(css, { file })) {
    const decls = declarations(body);
    const bgDecl = decls.find((d) => d.property === 'background-color' || d.property === 'background');
    const bgToken = bgDecl?.value.match(TOKEN_RE)?.[1];
    for (const d of decls) {
      if (d.property !== 'color') continue;
      const token = d.value.match(TOKEN_RE)?.[1];
      if (token === undefined) continue;
      if (never.has(token)) failures.push({ selector, token, reason: 'never a text color' });
      else if (bgToken === 'raised' && onRaised.has(token) === false) failures.push({ selector, token, reason: 'not allowed as text on raised' });
    }
  }
  return failures;
}
