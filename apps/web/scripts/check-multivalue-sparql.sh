#!/bin/bash
# 直接通过 SPARQL 查询检查多值问题

SPARQL_ENDPOINT="http://localhost:3000/ganlu/.data/chat/-/sparql"

echo "============================================================"
echo "SPARQL 多值问题诊断"
echo "============================================================"
echo "Endpoint: $SPARQL_ENDPOINT"
echo ""

# 查询所有 threads 的 updatedAt
QUERY='PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

SELECT ?subject ?modified WHERE {
  ?subject dcterms:modified ?modified .
}
ORDER BY ?subject'

echo "--- 查询 dcterms:modified (updatedAt) ---"
echo "Query:"
echo "$QUERY"
echo ""

echo "Results:"
curl -s -X POST "$SPARQL_ENDPOINT" \
  -H "Content-Type: application/sparql-query" \
  -H "Accept: application/sparql-results+json" \
  -d "$QUERY" | jq -r '.results.bindings[] | "\(.subject.value) -> \(.modified.value)"' 2>/dev/null || echo "Query failed"

echo ""
echo "--- 统计每个 subject 的 modified 值数量 ---"
curl -s -X POST "$SPARQL_ENDPOINT" \
  -H "Content-Type: application/sparql-query" \
  -H "Accept: application/sparql-results+json" \
  -d "$QUERY" | jq -r '.results.bindings | group_by(.subject.value) | .[] | "\(.[0].subject.value): \(length) 个值"' 2>/dev/null || echo "Query failed"

echo ""
echo "============================================================"
echo "如果某个 subject 有多个 modified 值，说明存在多值问题"
echo "============================================================"
