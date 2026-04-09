#!/usr/bin/env bash
set -euo pipefail

INPUT_HTML="${1:-assets/social-preview.html}"
OUTPUT_PNG="${2:-assets/social-preview.png}"
VIEWPORT="${3:-1200,630}"

if [[ ! -f "$INPUT_HTML" ]]; then
  echo "Input HTML not found: $INPUT_HTML" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT_PNG")"

npx -y playwright screenshot \
  --browser=chromium \
  --channel=chrome \
  --viewport-size="$VIEWPORT" \
  "file://$(pwd)/$INPUT_HTML" \
  "$OUTPUT_PNG"

echo "Wrote $OUTPUT_PNG"
