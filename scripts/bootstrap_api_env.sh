#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 -m venv "$ROOT/.venv"
"$ROOT/.venv/bin/pip" install -e "$ROOT/apps/api[dev]"
npx --yes pnpm install --dir "$ROOT"

echo "API and workspace dependencies installed."
