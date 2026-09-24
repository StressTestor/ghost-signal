#!/usr/bin/env bash
# fetches doto at a pinned upstream commit and converts the variable ttf to woff2.
# the woff2 is committed; re-run only to bump DOTO_SHA. nothing runs at build or consume time.
set -euo pipefail

DOTO_SHA="1c587f2eed62cb257055540ac2a15f356070414f"
BASE="https://raw.githubusercontent.com/oliverlalan/Doto/${DOTO_SHA}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$HERE/src/fonts"
WORK="$(mktemp -d "$HERE/.doto.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$OUT"
curl -fsSL "$BASE/fonts/variable/Doto%5BROND%2Cwght%5D.ttf" -o "$WORK/Doto.ttf"
curl -fsSL "$BASE/OFL.txt" -o "$OUT/OFL.txt"
uvx --with brotli --from fonttools fonttools ttLib.woff2 compress -o "$OUT/Doto-VariableFont.woff2" "$WORK/Doto.ttf"
printf 'oliverlalan/Doto %s fonts/variable/Doto[ROND,wght].ttf\n' "$DOTO_SHA" > "$OUT/SOURCE"
printf 'wrote %s\n' "$OUT/Doto-VariableFont.woff2"
