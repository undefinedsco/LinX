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

step "watch run codex pwd"
yarn workspace @undefineds.co/linx dev watch run codex "pwd"

step "watch run codex git status"
yarn workspace @undefineds.co/linx dev watch run codex "git status"

step "watch sessions"
yarn workspace @undefineds.co/linx dev watch sessions | sed -n '1,20p'

step "watch show latest"
latest=$(ls -1t ~/.linx/watch/sessions | head -n 1)
echo "latest=$latest"
yarn workspace @undefineds.co/linx dev watch show "$latest"
