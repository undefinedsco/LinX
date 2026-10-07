import { act, renderHook, waitFor } from '@testing-library/react'
import { createCollection, like, useLiveQuery } from '@tanstack/react-db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

type Row = {
  id: string
  label: string
}

function createBenchmarkCollection(
  rowCount = 1_000,
  mutations: {
    onInsert?: () => Promise<unknown>
    onUpdate?: () => Promise<unknown>
    onDelete?: () => Promise<unknown>
  } = {},
) {
  const rows = Array.from({ length: rowCount }, (_, index) => ({
    id: `row-${index}`,
    label: `Row ${index}`,
  }))
  const metrics = {
    selects: 0,
    rowsRead: 0,
  }
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
        staleTime: Infinity,
      },
    },
  })
  const collection = createCollection<Row, string>(
    queryCollectionOptions({
      queryKey: ['live-query-contract', crypto.randomUUID()],
      queryClient,
      queryFn: async () => {
        metrics.selects += 1
        metrics.rowsRead += rows.length
        return rows.map((row) => ({ ...row }))
      },
      getKey: (row) => row.id,
      onInsert: async () => {
        await mutations.onInsert?.()
        return { refetch: false }
      },
      onUpdate: async () => {
        await mutations.onUpdate?.()
        return { refetch: false }
      },
      onDelete: async () => {
        await mutations.onDelete?.()
        return { refetch: false }
      },
    }),
  )

  return { collection, metrics }
}

describe('Live Query collection contract and benchmark', () => {
  it.each([
    ['direct collection', (collection: ReturnType<typeof createBenchmarkCollection>['collection']) => (
      useLiveQuery(collection)
    )],
    ['query builder', (collection: ReturnType<typeof createBenchmarkCollection>['collection']) => (
      useLiveQuery((query) => query.from({ row: collection }).select(({ row }) => row))
    )],
  ])('%s hydrates exactly once without an explicit start or fetch', async (_label, useQuery) => {
    const { collection, metrics } = createBenchmarkCollection()
    const startedAt = performance.now()
    const { result } = renderHook(() => useQuery(collection))

    await waitFor(() => expect(result.current.isReady).toBe(true))
    const readyMs = performance.now() - startedAt

    expect(result.current.data).toHaveLength(1_000)
    expect(metrics).toEqual({
      selects: 1,
      rowsRead: 1_000,
    })

    console.info(`[benchmark] ${_label}`, {
      readyMs: Number(readyMs.toFixed(2)),
      ...metrics,
    })
  })

  it('shares one hydration across direct and query-builder consumers', async () => {
    const { collection, metrics } = createBenchmarkCollection()
    const direct = renderHook(() => useLiveQuery(collection))
    const projected = renderHook(() => (
      useLiveQuery((query) => query.from({ row: collection }).select(({ row }) => row))
    ))

    await waitFor(() => {
      expect(direct.result.current.isReady).toBe(true)
      expect(projected.result.current.isReady).toBe(true)
    })

    expect(metrics.selects).toBe(1)
    expect(metrics.rowsRead).toBe(1_000)
  })

  it('applies an optimistic update without another select', async () => {
    const { collection, metrics } = createBenchmarkCollection()
    const direct = renderHook(() => useLiveQuery(collection))
    const projected = renderHook(() => (
      useLiveQuery((query) => query.from({ row: collection }).select(({ row }) => row))
    ))

    await waitFor(() => expect(projected.result.current.isReady).toBe(true))
    const baselineSelects = metrics.selects

    await act(async () => {
      const transaction = collection.update('row-0', (draft) => {
        draft.label = 'Updated'
      })
      await transaction.isPersisted.promise
    })

    await waitFor(() => {
      expect(direct.result.current.data[0]?.label).toBe('Updated')
      expect(projected.result.current.data[0]?.label).toBe('Updated')
    })
    expect(metrics.selects).toBe(baselineSelects)
  })

  it('keeps direct and derived queries on one hydration and one optimistic state', async () => {
    const { collection, metrics } = createBenchmarkCollection(4)
    const direct = renderHook(() => useLiveQuery(collection))
    const filtered = renderHook(() => useLiveQuery((query) => (
      query
        .from({ row: collection })
        .where(({ row }) => like(row.label, '%keep%'))
        .select(({ row }) => row)
    )))

    await waitFor(() => {
      expect(direct.result.current.isReady).toBe(true)
      expect(filtered.result.current.isReady).toBe(true)
    })
    expect(metrics.selects).toBe(1)

    await act(async () => {
      const first = collection.update('row-0', (draft) => {
        draft.label = 'keep first'
      })
      const second = collection.update('row-1', (draft) => {
        draft.label = 'keep second'
      })
      await Promise.all([first.isPersisted.promise, second.isPersisted.promise])
    })

    await waitFor(() => {
      expect(filtered.result.current.data.map((row) => row.id)).toEqual(['row-0', 'row-1'])
    })
    expect(direct.result.current.data).toHaveLength(4)
    expect(metrics.selects).toBe(1)
  })

  it.each([
    {
      label: 'insert',
      mutate: (collection: ReturnType<typeof createBenchmarkCollection>['collection']) => (
        collection.insert({ id: 'new-row', label: 'New row' })
      ),
      optimistic: (collection: ReturnType<typeof createBenchmarkCollection>['collection']) => (
        collection.get('new-row')?.label === 'New row'
      ),
      rolledBack: (collection: ReturnType<typeof createBenchmarkCollection>['collection']) => (
        collection.get('new-row') === undefined
      ),
    },
    {
      label: 'update',
      mutate: (collection: ReturnType<typeof createBenchmarkCollection>['collection']) => (
        collection.update('row-0', (draft) => {
          draft.label = 'Optimistic'
        })
      ),
      optimistic: (collection: ReturnType<typeof createBenchmarkCollection>['collection']) => (
        collection.get('row-0')?.label === 'Optimistic'
      ),
      rolledBack: (collection: ReturnType<typeof createBenchmarkCollection>['collection']) => (
        collection.get('row-0')?.label === 'Row 0'
      ),
    },
    {
      label: 'delete',
      mutate: (collection: ReturnType<typeof createBenchmarkCollection>['collection']) => (
        collection.delete('row-0')
      ),
      optimistic: (collection: ReturnType<typeof createBenchmarkCollection>['collection']) => (
        collection.get('row-0') === undefined
      ),
      rolledBack: (collection: ReturnType<typeof createBenchmarkCollection>['collection']) => (
        collection.get('row-0')?.label === 'Row 0'
      ),
    },
  ])('rolls back an optimistic $label when persistence fails', async ({
    label,
    mutate,
    optimistic,
    rolledBack,
  }) => {
    const persistenceFailure = vi.fn(async () => {
      throw new Error(`${label} persistence failed`)
    })
    const { collection, metrics } = createBenchmarkCollection(2, {
      onInsert: label === 'insert' ? persistenceFailure : undefined,
      onUpdate: label === 'update' ? persistenceFailure : undefined,
      onDelete: label === 'delete' ? persistenceFailure : undefined,
    })
    await collection.preload()
    const baselineSelects = metrics.selects

    const transaction = mutate(collection)
    expect(optimistic(collection)).toBe(true)
    await expect(transaction.isPersisted.promise).rejects.toThrow(`${label} persistence failed`)

    await waitFor(() => expect(rolledBack(collection)).toBe(true))
    expect(persistenceFailure).toHaveBeenCalledOnce()
    expect(metrics.selects).toBe(baselineSelects)
  })

  it('benchmarks legacy mount fetch against Live Query-only hydration', async () => {
    const current = createBenchmarkCollection()
    const currentStartedAt = performance.now()
    const currentHook = renderHook(() => useLiveQuery(current.collection))
    await waitFor(() => expect(currentHook.result.current.isReady).toBe(true))
    const currentReadyMs = performance.now() - currentStartedAt

    const legacy = createBenchmarkCollection()
    const legacyStartedAt = performance.now()
    const legacyHook = renderHook(() => useLiveQuery(legacy.collection))
    await waitFor(() => expect(legacyHook.result.current.isReady).toBe(true))
    await legacy.collection.utils.refetch()
    const legacyReadyMs = performance.now() - legacyStartedAt

    const currentMetrics = {
      selects: current.metrics.selects,
      rowsRead: current.metrics.rowsRead,
      readyMs: Number(currentReadyMs.toFixed(2)),
    }
    const legacyMetrics = {
      selects: legacy.metrics.selects,
      rowsRead: legacy.metrics.rowsRead,
      readyMs: Number(legacyReadyMs.toFixed(2)),
    }

    expect(currentMetrics.selects).toBe(1)
    expect(currentMetrics.rowsRead).toBe(1_000)
    expect(legacyMetrics.selects).toBe(2)
    expect(legacyMetrics.rowsRead).toBe(2_000)

    console.info('[benchmark] Live Query-only vs legacy mount fetch', {
      current: currentMetrics,
      legacy: legacyMetrics,
      selectReductionPercent: 50,
      rowsReadReductionPercent: 50,
    })
  })
})
