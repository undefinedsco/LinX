#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT/apps/cli"

exec node ./scripts/smoke-auto-mode-acp.mjs
