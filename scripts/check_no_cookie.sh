#!/usr/bin/env bash
set -euo pipefail

if git ls-files --error-unmatch cookie.rtf >/dev/null 2>&1; then
  echo "[BLOCKED] cookie.rtf is tracked by git. Remove it before push."
  exit 1
fi

if git diff --cached --name-only | grep -q '^cookie\.rtf$'; then
  echo "[BLOCKED] cookie.rtf is staged. Unstage it before commit/push."
  exit 1
fi

echo "[OK] cookie.rtf is not tracked/staged."
