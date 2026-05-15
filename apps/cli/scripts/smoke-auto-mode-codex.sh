#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

export PATH="$ROOT/node_modules/.bin:$PATH"

step() {
  printf '\n==> %s\n' "$1"
}

step "codex-acp help"
./node_modules/.bin/codex-acp --help >/tmp/linx-codex-acp-help.txt
sed -n '1,20p' /tmp/linx-codex-acp-help.txt

step "codex auto-mode pwd"
yarn workspace @undefineds.co/linx dev --backend codex "pwd"

step "codex auto-mode git status"
yarn workspace @undefineds.co/linx dev --backend codex "git status"

step "auto-mode sessions"
yarn workspace @undefineds.co/linx dev --sessions | sed -n '1,20p'

step "auto-mode show latest"
latest=$(ls -1t ~/.linx/auto-mode/sessions | head -n 1)
echo "latest=$latest"
yarn workspace @undefineds.co/linx dev --show "$latest"
