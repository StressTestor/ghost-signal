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

// minimal css rule walker: enough for our own sheets. handles nested @media and @supports and
// records them as parents; @keyframes percent blocks come back as rules whose parent is the @keyframes prelude
export function cssRules(css) {
  const out = [];
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const stack = [];
  let buf = '';
  for (const ch of src) {
    if (ch === '{') {
      stack.push(buf.trim());
      buf = '';
    } else if (ch === '}') {
      const selector = stack.pop();
      if (selector !== undefined && selector.startsWith('@') === false && buf.trim() !== '') {
        out.push({ selector, body: buf, parents: stack.filter((s) => s.startsWith('@')) });
      }
      buf = '';
    } else {
      buf += ch;
    }
  }
  return out;
}

function declarations(body) {
  return body.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const i = d.indexOf(':');
    return { property: d.slice(0, i).trim(), value: d.slice(i + 1).trim() };
  });
}

const TOKEN_RE = /var\(--gs-color-([a-z0-9-]+)\)/;

export function scanCss(css, tokens) {
  const failures = [];
  const never = new Set(tokens.contrast.neverText);
  const onRaised = new Set(tokens.contrast.textOn.raised);
  for (const { selector, body } of cssRules(css)) {
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
