#!/usr/bin/env bash
# copies a tagged ghost-signal release into a consumer that has no bundler.
# usage: DEST=vendor/ghost-signal scripts/sync-ghost-signal.sh v0.1.0
# result: $DEST/src $DEST/gen $DEST/schema $DEST/tokens.json and $DEST/VERSION holding the tag.
# drift is a grep on VERSION. tokens.json rides along because src/feel reads its budgets from it
set -euo pipefail

TAG="${1:?usage: DEST=<vendor dir> sync-ghost-signal.sh <tag>}"
: "${DEST:?set DEST to the vendor directory, for example vendor/ghost-signal}"
REPO="${GS_REPO:-https://github.com/StressTestor/ghost-signal.git}"

mkdir -p "$DEST"
WORK="$(mktemp -d "$DEST/.gs-sync.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

git clone --quiet --depth 1 --branch "$TAG" "$REPO" "$WORK/repo"

for part in src gen schema; do
  rm -rf "${DEST:?}/$part"
  cp -R "$WORK/repo/$part" "$DEST/$part"
done
cp "$WORK/repo/tokens.json" "$DEST/tokens.json"
printf '%s\n' "$TAG" > "$DEST/VERSION"
printf 'ghost-signal %s synced into %s\n' "$TAG" "$DEST"
