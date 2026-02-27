#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${ROOT_DIR}/backend/logs"

mkdir -p "${LOG_DIR}"
: > "${LOG_DIR}/events.jsonl"
: > "${LOG_DIR}/actions.jsonl"
: > "${LOG_DIR}/comments.jsonl"

echo "Cleared logs:"
echo "  ${LOG_DIR}/events.jsonl"
echo "  ${LOG_DIR}/actions.jsonl"
echo "  ${LOG_DIR}/comments.jsonl"
