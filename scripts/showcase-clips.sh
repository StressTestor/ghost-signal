#!/usr/bin/env bash
# turns the showcase webm recordings into mp4 clips, plus one still per glitch 1 clip at its
# midpoint. playwright's webm carries no duration, so the midpoint is read from the mp4.
# the showcase is for joe's eye before the tag; nothing here is an assertion (spec 13, risk 8)
set -euo pipefail

RAW="gallery/showcase/raw"
CLIPS="gallery/showcase/clips"
STILLS="gallery/showcase/stills"

command -v ffmpeg > /dev/null || { printf 'showcase-clips: ffmpeg is not on PATH\n' >&2; exit 1; }
command -v ffprobe > /dev/null || { printf 'showcase-clips: ffprobe is not on PATH\n' >&2; exit 1; }

shopt -s nullglob
files=("$RAW"/*.webm)
if [ "${#files[@]}" -eq 0 ]; then
  printf 'showcase-clips: no recordings in %s. run npm run showcase first\n' "$RAW" >&2
  exit 1
fi

mkdir -p "$CLIPS" "$STILLS"
stills=0
for f in "${files[@]}"; do
  name="$(basename "$f" .webm)"
  ffmpeg -y -loglevel error -i "$f" -c:v libx264 -pix_fmt yuv420p -movflags +faststart -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" "$CLIPS/$name.mp4"
  case "$name" in
    *-glitch1)
      dur="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$CLIPS/$name.mp4")"
      mid="$(awk -v d="$dur" 'BEGIN { printf "%.2f", d / 2 }')"
      ffmpeg -y -loglevel error -ss "$mid" -i "$CLIPS/$name.mp4" -frames:v 1 "$STILLS/$name.png"
      stills=$((stills + 1))
      ;;
  esac
done
printf 'showcase-clips: %d clips in %s, %d stills in %s\n' "${#files[@]}" "$CLIPS" "$stills" "$STILLS"
