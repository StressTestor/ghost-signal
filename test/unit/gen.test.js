import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTokens, toSwift, toRust, toMarkdown } from '../../scripts/lib/tokens.js';

test('toRust emits Color::Rgb consts per theme and a Status enum', async () => {
  const rs = toRust(await loadTokens());
  assert.match(rs, /pub mod dark \{/);
  assert.match(rs, /pub mod light \{/);
  assert.match(rs, /pub const ACCENT: Color = Color::Rgb\(14, 194, 36\);/);
  assert.match(rs, /pub const TEXT_MUTED: Color = Color::Rgb\(142, 147, 150\);/);
  assert.match(rs, /pub const ACCENT: Color = Color::Rgb\(8, 112, 26\);/);
  assert.match(rs, /pub enum Status \{\s*Idle,\s*Working,\s*Ok,\s*Warn,\s*Deny,\s*Bypass,\s*Crash,?\s*\}/);
  assert.match(rs, /pub fn color\(self\) -> Color/);
  assert.match(rs, /pub fn color_light\(self\) -> Color/);
  assert.match(rs, /pub fn kaomoji\(self\) -> &'static str/);
  assert.match(rs, /Status::Crash => dark::BYPASS/);
  assert.match(rs, /Status::Deny => ">:\["/);
  assert.match(rs, /pub const SPACE: \[u16; 6\] = \[4, 8, 12, 16, 24, 40\];/);
  assert.doesNotMatch(rs, /20\d\d-\d\d-\d\d/);
});

test('toSwift emits a GhostSignal enum with Theme, Fonts and Status', async () => {
  const swift = toSwift(await loadTokens());
  assert.match(swift, /public enum GhostSignal \{/);
  assert.match(swift, /public struct Theme \{/);
  assert.match(swift, /public static let dark = Theme\(/);
  assert.match(swift, /public static let light = Theme\(/);
  assert.match(swift, /accent: Color\(\.sRGB, red: 0\.0549, green: 0\.7608, blue: 0\.1412, opacity: 1\)/);
  assert.match(swift, /textMuted: Color\(/);
  assert.match(swift, /public static let wordmark = Font\.custom\("Doto", size: 34\)\.weight\(\.black\)/);
  // spec 3.3: labels are lowercase like the rest of the chrome, so no small caps
  assert.match(swift, /public static let label = Font\.system\(size: 11\)\n/);
  assert.doesNotMatch(swift, /smallCaps/);
  assert.match(swift, /public static let s1: CGFloat = 4/);
  assert.match(swift, /public enum Status: String, CaseIterable \{/);
  assert.match(swift, /case \.crash: return theme\.bypass/);
  assert.match(swift, /case \.bypass: return ">:D"/);
});

test('toMarkdown lists both themes and every group', async () => {
  const md = toMarkdown(await loadTokens());
  assert.match(md, /^# ghost signal tokens/m);
  assert.match(md, /\| `--gs-color-accent` \| `#0ec224` \| `#08701a` \|/);
  assert.match(md, /\| `--gs-motion-decode` \| `250ms` \|/);
  assert.match(md, /\| `idle` \| `text-faint` \| `\(｡◕‿↼\)` \|/);
  assert.doesNotMatch(md, /—/);
});
