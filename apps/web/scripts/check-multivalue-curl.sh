#!/bin/bash
set -euo pipefail

echo "============================================================"
echo "drizzle-solid 多值问题诊断"
echo "============================================================"
echo ""

DATABASE_URL="${CSS_SPARQL_ENDPOINT:-postgresql://postgres:postgres@localhost:5432/xpod_local}"

if [[ "$DATABASE_URL" == sqlite:* ]]; then
  echo "当前脚本不再直接读取 quadstore.sqlite。"
  echo "本地 Docker 开发请使用 PostgreSQL，并设置 CSS_SPARQL_ENDPOINT。"
  exit 1
fi

run_psql() {
  if command -v psql >/dev/null 2>&1; then
    psql "$DATABASE_URL" "$@"
    return
  fi

  if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -qx 'shared-postgres'; then
    docker exec shared-postgres psql -U postgres -d xpod_local "$@"
    return
  fi

  echo "错误: 找不到 psql，也没有运行中的 shared-postgres 容器。"
  exit 1
}

echo "数据库: $DATABASE_URL"
echo ""

echo "--- 查看数据表 ---"
run_psql -c "\\dt"
echo ""

echo "--- internal_kv 数据量 ---"
run_psql -tAc "select count(*) from internal_kv;"
