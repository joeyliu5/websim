#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

TOPIC="${1:-}"
if [[ -z "$TOPIC" ]]; then
  echo "Usage: bash scripts/switch_topic.sh '话题关键词'"
  echo "Env options:"
  echo "  COOKIE_FILE=/path/to/cookie.rtf   (default: $ROOT_DIR/cookie.rtf)"
  echo "  PAGES=5                           (default: 5)"
  echo "  PAGE_DELAY_SEC=0.6                (default: 0.6)"
  echo "  STRICT_LOCAL=1                    (fail if any remote image remains)"
  exit 1
fi

COOKIE_FILE="${COOKIE_FILE:-$ROOT_DIR/cookie.rtf}"
PAGES="${PAGES:-5}"
PAGE_DELAY_SEC="${PAGE_DELAY_SEC:-0.6}"
STRICT_LOCAL="${STRICT_LOCAL:-0}"

extra_args=()
if [[ "$STRICT_LOCAL" == "1" ]]; then
  extra_args+=(--strict-local)
fi

python3 scripts/build_weibo_lab_bundle.py \
  --topic "$TOPIC" \
  --cookie-file "$COOKIE_FILE" \
  --refresh \
  --pages "$PAGES" \
  --page-delay-sec "$PAGE_DELAY_SEC" \
  "${extra_args[@]}"

echo
echo "[OK] Topic switched: $TOPIC"
echo "[OK] Bundle: $ROOT_DIR/frontend/public/data/lab_bundle.json"
echo "[OK] Mapping: $ROOT_DIR/frontend/public/data/lab_bundle_media_manifest.json"
