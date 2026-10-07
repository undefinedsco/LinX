// @vitest-environment node
/**
 * query-sync 范式 IO 放大基准（集中各 applet 的 collection 请求）。
 *
 * 测的是 createPodCollection 内部所用的 query sync 核心范式
 * （createCollection + queryCollectionOptions + 真 QueryClient）的 IO 放大，
 * 即性能主因。createPodCollection 的 pod 适配层（db.select/db.insert/subscribeToPod）
 * 是薄包装，不改变 IO 计数，故此处用 MockSource 替代 db，精确记录 select 次数/读行数。
 *
 * 远程回流用 queryClient.invalidateQueries 模拟，与现状 pod-collection.ts:202
 * （subscribe 回调 invalidate）行为一致。
 *
 * 两层正交病灶（源码读死，非假设）：
 *  (a) 回流方式：本地/远程写各触发 1 次全表 refetch。
 *      - 本地：query.js:891-898 wrappedOnInsert 在 onInsert 后默认 refetch，除非返回 {refetch:false}；
 *        createPodCollection 的 onInsert 未返回该标志（pod-collection.ts:137-144）。
 *      - 远程：subscribe 回调 invalidate → observer refetch。
 *  (b) 每次 IO 体积：createPodCollection 的 fetchRows = db.select().from(resource) 无 where/limit
 *      （pod-collection.ts:76-91），把 collection 当 db 全表镜像用，每次 refetch 读全表行。
 *      collection 设计上是本地子集缓存，应配合 on-demand + where/loadSubset 只持子集。
 *
 * 三组对照：
 *  - 现状全表：(a)+(b) 全开 → 次数×体积 双放大。
 *  - 快赢（refetch:false）：本地写 0 refetch，但远程仍全表 refetch、体积仍全表。
 *  - 子集化（queryFn 带 limit）：封顶每次 refetch 读行数（maxRowsPerSelect<=SUBSET）。
 *  - 子集化+快赢：本地写 0 refetch 且远程 refetch 体积封顶。
 *  完整修复 = live sync（减次数）+ 子集化（减体积）+ 快赢（本地写免 refetch），三者正交。
 *
 * 本基准用真代码坐实放大关系并证明快赢/子集化各自有效，作为回归门禁。
 * 目标 live sync 范式的"次数"对比为理论值，见 docs/data-flow-paradigm-design.md §3。
 */
import { describe, expect, it } from 'vitest'
import { createCollection } from '@tanstack/db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import { QueryClient } from '@tanstack/react-query'

type Row = { id: string; v: number }

class MockSource {
  rows: Row[] = []
  selects = 0
  rowsRead = 0
  maxRowsPerSelect = 0
  ormWrites = 0

  private recordRead(n: number): void {
    this.selects++
    this.rowsRead += n
    if (n > this.maxRowsPerSelect) this.maxRowsPerSelect = n
  }

  fetchAll(): Row[] {
    this.recordRead(this.rows.length)
    return this.rows.map((r) => ({ ...r }))
  }

  fetchSubset(limit: number): Row[] {
    const slice = this.rows.slice(0, limit)
    this.recordRead(slice.length)
    return slice.map((r) => ({ ...r }))
  }

  insert(row: Row): void {
    this.ormWrites++
    this.rows = [...this.rows, row]
  }
}

// 模拟全 applet 的 collection 集合：[name, 初始行数]
const APPLET_MATRIX: ReadonlyArray<readonly [string, number]> = [
  ['chat:chats', 50],
  ['chat:threads', 30],
  ['chat:messages', 200],
  ['files:entries', 100],
  ['files:approvals', 40],
  ['files:audit', 15],
  ['files:notifications', 8],
  ['contacts:contacts', 30],
  ['contacts:agents', 10],
  ['favorites:favorites', 20],
  ['inbox:approvals', 12],
  ['inbox:audit', 8],
  ['inbox:notifications', 6],
  ['inbox:inputRequests', 4],
  ['ms:credentials', 5],
  ['ms:providers', 3],
  ['ms:models', 3],
]

const K = APPLET_MATRIX.length
const REMOTE_EVENTS_PER_COLL = 20
const SUBSET = 10
const MAX_SEED = Math.max(...APPLET_MATRIX.map(([, n]) => n))

function seed(source: MockSource, name: string, n: number): void {
  source.rows = Array.from({ length: n }, (_, i) => ({ id: `${name}#seed${i}`, v: i }))
}

function buildGroup(refetchFalse: boolean, subset: number | null = null) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 0 } },
  })
  const sources: MockSource[] = []
  const colls: ReturnType<typeof createCollection>[] = []
  let idSeq = 0

  for (const [name, n] of APPLET_MATRIX) {
    const source = new MockSource()
    seed(source, name, n)
    sources.push(source)
    const coll = createCollection(
      queryCollectionOptions<Row, string>({
        queryKey: [name],
        queryClient: qc,
        queryFn: async () => (subset == null ? source.fetchAll() : source.fetchSubset(subset)),
        getKey: (r) => r.id,
        onInsert: async ({ transaction }) => {
          const modified = transaction.mutations[0].modified as Row
          source.insert({ id: modified.id ?? `${name}#ins${++idSeq}`, v: modified.v ?? 0 })
          return refetchFalse ? { refetch: false } : undefined
        },
        onUpdate: async () => (refetchFalse ? { refetch: false } : undefined),
        onDelete: async () => (refetchFalse ? { refetch: false } : undefined),
      }),
    )
    colls.push(coll)
  }
  return { qc, sources, colls }
}

const sum = (arr: MockSource[], pick: (s: MockSource) => number) =>
  arr.reduce((acc, s) => acc + pick(s), 0)
const max = (arr: MockSource[], pick: (s: MockSource) => number) =>
  arr.reduce((m, s) => Math.max(m, pick(s)), 0)

async function preloadAll(colls: ReturnType<typeof createCollection>[]) {
  await Promise.all(colls.map((c) => c.preload()))
}

async function localWriteAll(colls: ReturnType<typeof createCollection>[], nameOf: (i: number) => string) {
  await Promise.all(
    colls.map((c, i) => {
      const tx = c.insert({ id: `${nameOf(i)}#local`, v: 999 }) as unknown as {
        isPersisted: { promise: Promise<unknown> }
      }
      return tx.isPersisted.promise
    }),
  )
}

async function remoteBurstAll(qc: QueryClient) {
  for (const [name] of APPLET_MATRIX) {
    for (let e = 0; e < REMOTE_EVENTS_PER_COLL; e++) {
      await qc.invalidateQueries({ queryKey: [name] })
    }
  }
}

function logGroup(label: string, s: Record<string, number>) {
  // eslint-disable-next-line no-console
  console.log(`[perf] ${label} ${JSON.stringify(s)}`)
}

describe('query-sync paradigm IO amplification (concentrated applet collections)', () => {
  it('current full-table: every local write AND every remote event costs one full-table refetch', async () => {
    const { qc, sources, colls } = buildGroup(false, null)
    await preloadAll(colls)
    const base = sum(sources, (s) => s.selects)
    expect(base).toBe(K)

    await localWriteAll(colls, (i) => APPLET_MATRIX[i][0])
    const localDelta = sum(sources, (s) => s.selects) - base
    await remoteBurstAll(qc)
    const remoteDelta = sum(sources, (s) => s.selects) - base - localDelta

    expect(localDelta).toBe(K)
    expect(remoteDelta).toBe(K * REMOTE_EVENTS_PER_COLL)
    expect(max(sources, (s) => s.maxRowsPerSelect)).toBeGreaterThan(SUBSET) // 全表读超子集

    logGroup('current-fulltable', {
      K, base, localDelta, remoteDelta,
      totalSelects: sum(sources, (s) => s.selects),
      totalRowsRead: sum(sources, (s) => s.rowsRead),
      maxRowsPerSelect: max(sources, (s) => s.maxRowsPerSelect),
    })
  })

  it('quick-win (refetch:false): local writes cost ZERO refetch; remote still full-table', async () => {
    const { qc, sources, colls } = buildGroup(true, null)
    await preloadAll(colls)
    const base = sum(sources, (s) => s.selects)

    await localWriteAll(colls, (i) => APPLET_MATRIX[i][0])
    const localDelta = sum(sources, (s) => s.selects) - base
    await remoteBurstAll(qc)
    const remoteDelta = sum(sources, (s) => s.selects) - base - localDelta

    expect(localDelta).toBe(0)
    expect(remoteDelta).toBe(K * REMOTE_EVENTS_PER_COLL)
    expect(sum(sources, (s) => s.ormWrites)).toBe(K) // 持久化没丢

    logGroup('quickwin-fulltable', {
      K, base, localDelta, remoteDelta,
      totalSelects: sum(sources, (s) => s.selects),
      totalRowsRead: sum(sources, (s) => s.rowsRead),
      maxRowsPerSelect: max(sources, (s) => s.maxRowsPerSelect),
      ormWrites: sum(sources, (s) => s.ormWrites),
    })
  })

  it('subsetting caps per-refetch read volume (fixes layer b)', async () => {
    const { qc, sources, colls } = buildGroup(false, SUBSET)
    await preloadAll(colls)
    const base = sum(sources, (s) => s.selects)

    await localWriteAll(colls, (i) => APPLET_MATRIX[i][0])
    const localDelta = sum(sources, (s) => s.selects) - base
    await remoteBurstAll(qc)
    const remoteDelta = sum(sources, (s) => s.selects) - base - localDelta

    // 次数放大不变（layer a 未修），但每次读体积封顶 SUBSET（layer b 已修）
    expect(localDelta).toBe(K)
    expect(remoteDelta).toBe(K * REMOTE_EVENTS_PER_COLL)
    expect(max(sources, (s) => s.maxRowsPerSelect)).toBeLessThanOrEqual(SUBSET)

    logGroup('current-subset', {
      K, base, localDelta, remoteDelta,
      totalSelects: sum(sources, (s) => s.selects),
      totalRowsRead: sum(sources, (s) => s.rowsRead),
      maxRowsPerSelect: max(sources, (s) => s.maxRowsPerSelect),
    })
  })

  it('subsetting + quick-win: local writes zero refetch AND remote volume capped', async () => {
    const { qc, sources, colls } = buildGroup(true, SUBSET)
    await preloadAll(colls)
    const base = sum(sources, (s) => s.selects)

    await localWriteAll(colls, (i) => APPLET_MATRIX[i][0])
    const localDelta = sum(sources, (s) => s.selects) - base
    await remoteBurstAll(qc)
    const remoteDelta = sum(sources, (s) => s.selects) - base - localDelta

    expect(localDelta).toBe(0)
    expect(remoteDelta).toBe(K * REMOTE_EVENTS_PER_COLL)
    expect(max(sources, (s) => s.maxRowsPerSelect)).toBeLessThanOrEqual(SUBSET)
    expect(sum(sources, (s) => s.ormWrites)).toBe(K)

    logGroup('quickwin-subset', {
      K, base, localDelta, remoteDelta,
      totalSelects: sum(sources, (s) => s.selects),
      totalRowsRead: sum(sources, (s) => s.rowsRead),
      maxRowsPerSelect: max(sources, (s) => s.maxRowsPerSelect),
      ormWrites: sum(sources, (s) => s.ormWrites),
    })
  })
})
