#!/bin/bash
# 检查 drizzle-solid 多值问题（通过 xpod 的 quadstore）

echo "============================================================"
echo "drizzle-solid 多值问题诊断"
echo "============================================================"
echo ""

# 直接查询 xpod 的 quadstore.sqlite
QUADSTORE="/Users/ganlu/develop/xpod/data/quadstore.sqlite"

if [ ! -f "$QUADSTORE" ]; then
    echo "错误: 找不到 quadstore.sqlite"
    exit 1
fi

echo "数据库: $QUADSTORE"
echo ""

# 先看一下表结构
echo "--- 查看数据库表结构 ---"
sqlite3 "$QUADSTORE" ".tables"
echo ""

echo "--- 查看表 schema ---"
sqlite3 "$QUADSTORE" ".schema" | head -30
echo ""

# 查看数据样本
echo "--- 数据样本 (前10条) ---"
sqlite3 "$QUADSTORE" "SELECT * FROM sqlite_master WHERE type='table' LIMIT 1;"
