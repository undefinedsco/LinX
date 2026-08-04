import { createCollection } from '@tanstack/react-db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import { QueryClient } from '@tanstack/react-query'
import type { SolidDatabase } from '@undefineds.co/models'
import { asBaseRelativeResourceId, requireRowResourceId } from '@linx/agent-runtime/pod-resource-identity'
import {
  and,
  asc,
  desc,
  eq,
  gt,
  isNull,
  lt,
  or,
  type PodResource as PodResourceSchema,
} from '@undefineds.co/drizzle-solid'
import { deleteExactRecord, updateExactRecord } from './exact-records'
import { createCollectionSubscriptionLease } from './collection-subscription-lease'
import {
  createOrderedWindowPolicy,
  evictOrderedWindowPages,
  type OrderedWindowCursor,
  type OrderedWindowOptions,
  type OrderedWindowPage,
} from './ordered-window'

function isPodCollectionDebugEnabled(): boolean {
  return typeof process !== 'undefined'
    && (process.env.LINX_POD_COLLECTION_DEBUG === '1' || process.env.LINX_POD_COLLECTION_DEBUG === 'true')
}

function debugPodCollection(...args: unknown[]): void {
  if (isPodCollectionDebugEnabled()) console.log(...args)
}

interface PodCollectionOptions<TResource, TData> {
  resource: TResource
  queryKey: string[]
  queryClient: QueryClient
  // Function to get the current DB instance
  getDb: () => SolidDatabase<any> | null
  // Optional: columns to select for list view (defaults to all)
  columns?: (keyof TData)[]
  // Optional: sorting configuration
  orderBy?: {
    column: string
    direction?: 'asc' | 'desc'
  }
  // Optional bounded resident working set. The first read retains `limit` rows
  // and uses one look-ahead row to determine whether another page exists.
  window?: OrderedWindowOptions<TData>
  // Optional: custom key extractor (defaults to requiring item.id)
  getKey?: (item: TData) => string
  // Optional: seed data when the collection is empty
  seed?: TData[] | (() => TData[])
  // Optional: hydrate or project rows before they enter the reactive collection.
  transformRows?: (rows: TData[], db: SolidDatabase<any>) => Promise<TData[]> | TData[]
}

/**
 * Creates a TanStack DB Collection synchronized with a Solid Pod resource.
 * Includes support for real-time subscriptions via db.subscribe().
 */
export function createPodCollection<
  TResource extends PodResourceSchema<any>,
  TData extends { id?: string },
  _TInsert = any
>(
  options: PodCollectionOptions<TResource, TData>
) {
  const { resource, queryKey, queryClient, getDb, columns, orderBy, window, getKey: customGetKey, seed, transformRows } = options
  const windowPolicy = window ? createOrderedWindowPolicy(window) : null
  let nextCursor: OrderedWindowCursor | null = null
  let pageSequence = 0
  let pageAccessSequence = 0
  let residentWindowPages: OrderedWindowPage<TData>[] = []
  const windowState = window ? {
    hasNextPage: false,
    isLoadingNextPage: false,
    residentPages: 0,
    loadNextPage: async (): Promise<TData[]> => [],
    reset: async (): Promise<void> => {},
  } : undefined

  const ensureId = (item: TData, operation: 'seed' | 'insert'): TData => {
    if (item.id) {
      asBaseRelativeResourceId(item.id, 'Pod collection row.id')
      return item
    }
    if (operation === 'seed') {
      const id = asBaseRelativeResourceId(crypto.randomUUID(), 'generated Pod collection row.id')
      if (typeof item === 'object' && item) {
        return Object.assign(item, { id }) as TData
      }
      return { ...(item as TData), id }
    }
    throw new Error('Cannot persist Pod collection item without row.id.')
  }

  // Default key extractor: id required after insert/read
  const getKey = customGetKey ?? ((item: TData) => {
    return requireRowResourceId(item, 'collection item')
  })

  let didSeed = false

  const buildQuery = (db: SolidDatabase<any>, cursor?: OrderedWindowCursor) => {
    let query: any
    if (columns && columns.length > 0) {
      const selectObj: Record<string, any> = {}
      for (const col of columns) {
        selectObj[col as string] = (resource as any)[col]
      }
      query = db.select(selectObj).from(resource)
    } else {
      query = db.select().from(resource)
    }

    const primaryOrder = window?.orderBy[0] ?? orderBy
    if (window && window.orderBy.length > 0) {
      query = query.orderBy(
        ...window.orderBy.map((sort) => (
          sort.direction === 'desc'
            ? desc((resource as any)[sort.column])
            : asc((resource as any)[sort.column])
        )),
        asc((resource as any).id),
      )
    } else if (primaryOrder?.column) {
      query = query.orderBy(primaryOrder.column as string, primaryOrder.direction ?? 'asc')
    }

    if (cursor && window?.orderBy.length) {
      const idColumn = (resource as any).id
      const prefix: any[] = []
      const branches: any[] = []
      for (const [index, sort] of window.orderBy.entries()) {
        const column = (resource as any)[sort.column]
        const value = cursor.values[index]
        if (value == null) {
          prefix.push(isNull(column))
          continue
        }
        const after = sort.direction === 'desc' ? lt(column, value) : gt(column, value)
        branches.push(prefix.length > 0 ? and(...prefix, after) : after)
        branches.push(prefix.length > 0 ? and(...prefix, isNull(column)) : isNull(column))
        prefix.push(eq(column, value))
      }
      const idTieBreak = prefix.length > 0
        ? and(...prefix, gt(idColumn, cursor.id))
        : gt(idColumn, cursor.id)
      branches.push(idTieBreak)
      query = query.whereCursor(branches.length === 1 ? branches[0] : or(...branches))
    }
    if (window) query = query.limit(window.limit + 1)
    return query
  }

  const executeRows = async (db: SolidDatabase<any>, cursor?: OrderedWindowCursor): Promise<TData[]> => {
    let rows: TData[]
    try {
      rows = (await buildQuery(db, cursor).execute()) as TData[]
    } catch (error) {
      if (isUnsupportedDocumentCollectionRead(error)) {
        console.warn(`[PodCollection] ${queryKey.join('/')} fetch skipped: ${errorMessage(error)}`)
        rows = []
      } else {
        console.error(`[PodCollection] ${queryKey.join('/')} fetch failed:`, error)
        throw error
      }
    }
    if (transformRows) rows = await transformRows(rows, db)
    for (const row of rows) requireRowResourceId(row, 'Pod collection row')
    return rows
  }

  const executeLogicalWindow = async (
    db: SolidDatabase<any>,
    cursor?: OrderedWindowCursor,
  ): Promise<TData[]> => {
    if (!windowPolicy || !window) return executeRows(db, cursor)

    const target = window.limit + 1
    const rows: TData[] = []
    const seen = new Set<string>()
    let pageCursor = cursor
    for (let request = 0; rows.length < target && request < 10; request += 1) {
      const batch = await executeRows(db, pageCursor)
      if (batch.length === 0) break
      let added = 0
      for (const row of batch) {
        const key = getKey(row)
        if (seen.has(key)) continue
        seen.add(key)
        rows.push(row)
        added += 1
        if (rows.length === target) break
      }
      if (added === 0) break
      pageCursor = windowPolicy.cursorFor(batch[batch.length - 1])
      // xpod may cap a physical SELECT page at 50 subjects even when the
      // logical LIMIT is higher. Smaller batches are an actual end boundary.
      if (batch.length < Math.min(target, 50)) break
    }
    return rows
  }

  const fetchRows = async () => {
    const db = getDb()
    if (!db) return []
    let rows = await executeLogicalWindow(db)

    if (!didSeed && rows.length === 0 && seed) {
      const seedRows = typeof seed === 'function' ? seed() : seed
      if (seedRows.length > 0) {
        const ensured = seedRows.map((row) => ensureId(row, 'seed'))
        await db.insert(resource).values(ensured as any).execute()
        didSeed = true
        rows = await executeLogicalWindow(db)
      } else {
        didSeed = true
      }
    }

    if (windowPolicy && windowState) {
      const orderedRows = windowPolicy.sort(rows)
      const limit = windowPolicy.options.limit
      windowState.hasNextPage = orderedRows.length > limit
      rows = orderedRows.slice(0, limit)
      windowState.residentPages = rows.length > 0 ? 1 : 0
      nextCursor = rows.length > 0 ? windowPolicy.cursorFor(rows[rows.length - 1]) : null
      residentWindowPages = rows.length > 0 ? [{
        id: `page-${++pageSequence}`,
        rows,
        lastAccessed: ++pageAccessSequence,
        pinned: true,
      }] : []
    }

    return rows
  }

  // 1. Create the base collection
  const collection = createCollection<TData, string>(
    queryCollectionOptions({
      queryKey,
      queryClient,

      // READ
      queryFn: fetchRows,

      // IDENTITY
      getKey,

      // CREATE
      onInsert: async ({ transaction }) => {
        const db = getDb()
        if (!db) throw new Error('Database not connected')
        const { modified } = transaction.mutations[0]
        const ensured = ensureId(modified as TData, 'insert')
        const payload = toPersistableInsert(ensured, resource)
        const releasePin = pinResidentPages()
        try {
          await db.insert(resource).values(payload as any).execute()
          if (windowPolicy) {
            await reconcileActiveWindowUpsert(db, ensured, undefined, immediateWriteSink, false)
            return { refetch: false }
          }
          try {
            ;(collection.utils as { writeUpsert?: (row: TData) => void }).writeUpsert?.(ensured)
          } catch {
            return undefined
          }
          return { refetch: false }
        } finally {
          releasePin()
        }
      },

      // UPDATE
      onUpdate: async ({ transaction }) => {
        const db = getDb()
        if (!db) throw new Error('Database not connected')
        const { original, modified } = transaction.mutations[0]
        const releasePin = pinResidentPages(getKey(original as TData))

        try {
          await updateExactRecord(
            db,
            resource as any,
            toPersistableIdentity((original ?? modified) as TData, resource) as any,
            changedPersistableFields(original as TData | undefined, modified as TData),
          )
          if (windowPolicy) {
            await reconcileActiveWindowUpsert(
              db,
              modified as TData,
              getKey(original as TData),
              immediateWriteSink,
              false,
            )
            return { refetch: false }
          }
          try {
            ;(collection.utils as { writeUpsert?: (row: TData) => void }).writeUpsert?.(modified as TData)
          } catch {
            return undefined
          }
          return { refetch: false }
        } catch (error) {
          console.error(`[PodCollection] Update failed for ${queryKey.join('/')}:`, error)
          throw error
        } finally {
          releasePin()
        }
      },

      // DELETE
      onDelete: async ({ transaction }) => {
        const db = getDb()
        if (!db) throw new Error('Database not connected')
        const { original } = transaction.mutations[0]
        const key = getKey(original as TData)
        const releasePin = pinResidentPages(key)
        try {
          await deleteExactRecord(
            db,
            resource as any,
            toPersistableIdentity(original as TData, resource) as any,
          )
          if (windowPolicy) {
            await reconcileActiveWindowDelete(db, key, immediateWriteSink, false)
            return { refetch: false }
          }
          try {
            ;(collection.utils as { writeDelete?: (key: string) => void }).writeDelete?.(key)
          } catch {
            // syncedData may lack the row (inserted this session, not yet fetched) or sync not initialized
          }
          return { refetch: false }
        } finally {
          releasePin()
        }
      }
    })
  )

  const writeUpsert = (row: TData) => {
    ;(collection.utils as { writeUpsert?: (value: TData) => void }).writeUpsert?.(row)
  }
  const writeDelete = (key: string) => {
    ;(collection.utils as { writeDelete?: (key: string) => void }).writeDelete?.(key)
  }
  type WindowWriteSink = {
    upsert: (row: TData) => void
    delete: (key: string) => void
  }
  const immediateWriteSink: WindowWriteSink = {
    upsert: writeUpsert,
    delete: writeDelete,
  }
  const pinResidentPages = (key?: string): (() => void) => {
    const pinned = residentWindowPages.filter((page, index) => (
      key == null ? index === 0 : page.rows.some((row) => getKey(row) === key)
    ))
    const previous = pinned.map((page) => page.pinned)
    pinned.forEach((page) => { page.pinned = true })
    return () => pinned.forEach((page, index) => { page.pinned = previous[index] })
  }
  const updateNextCursorFromResidentPages = (): void => {
    if (!windowPolicy) return
    const lastPage = residentWindowPages[residentWindowPages.length - 1]
    const lastRow = lastPage?.rows[lastPage.rows.length - 1]
    nextCursor = lastRow ? windowPolicy.cursorFor(lastRow) : null
  }
  const firstBackfillAfter = async (
    db: SolidDatabase<any>,
    rows: TData[],
    excludedKeys: Set<string>,
  ): Promise<TData | undefined> => {
    if (!windowPolicy || rows.length === 0) return undefined
    const cursor = windowPolicy.cursorFor(rows[rows.length - 1])
    const candidates = await executeLogicalWindow(db, cursor)
    return candidates.find((candidate) => !excludedKeys.has(getKey(candidate)))
  }
  const reconcileActiveWindowUpsert = async (
    db: SolidDatabase<any>,
    row: TData,
    previousKey?: string,
    sink: WindowWriteSink = immediateWriteSink,
    writeWhenWindowIsNotResident = true,
  ): Promise<void> => {
    if (!windowPolicy || residentWindowPages.length === 0) {
      if (writeWhenWindowIsNotResident) sink.upsert(row)
      return
    }

    const rowKey = getKey(row)
    const pageSizes = residentWindowPages.map((page) => page.rows.length)
    const originalRows = residentWindowPages.flatMap((page) => page.rows)
    const originalKeys = new Set(originalRows.map(getKey))
    const replacedKey = previousKey ?? rowKey
    const replacedResident = originalKeys.has(replacedKey)
    const baseRows = windowPolicy.sort(originalRows.filter((candidate) => getKey(candidate) !== replacedKey))
    const candidates = [...baseRows, row]

    if (replacedResident) {
      const excludedKeys = new Set(candidates.map(getKey))
      const backfill = await firstBackfillAfter(db, baseRows, excludedKeys)
      if (backfill) candidates.push(backfill)
    }

    const nextRows = windowPolicy.sort(candidates).slice(0, originalRows.length)
    const nextKeys = new Set(nextRows.map(getKey))
    let offset = 0
    residentWindowPages = residentWindowPages.map((page, index) => {
      const rows = nextRows.slice(offset, offset + pageSizes[index])
      offset += pageSizes[index]
      return { ...page, rows, lastAccessed: ++pageAccessSequence }
    })
    updateNextCursorFromResidentPages()

    for (const key of originalKeys) {
      if (!nextKeys.has(key)) sink.delete(key)
    }
    for (const candidate of nextRows) {
      const key = getKey(candidate)
      if (key === rowKey || !originalKeys.has(key)) sink.upsert(candidate)
    }
  }
  const reconcileActiveWindowDelete = async (
    db: SolidDatabase<any>,
    key: string,
    sink: WindowWriteSink = immediateWriteSink,
    writeWhenWindowIsNotResident = true,
  ): Promise<void> => {
    if (!windowPolicy || residentWindowPages.length === 0) {
      if (writeWhenWindowIsNotResident) sink.delete(key)
      return
    }
    sink.delete(key)

    const pageSizes = residentWindowPages.map((page) => page.rows.length)
    const originalRows = residentWindowPages.flatMap((page) => page.rows)
    if (!originalRows.some((row) => getKey(row) === key)) return
    const remaining = windowPolicy.sort(originalRows.filter((row) => getKey(row) !== key))
    const backfill = await firstBackfillAfter(db, remaining, new Set(remaining.map(getKey)))
    const nextRows = windowPolicy.sort(backfill ? [...remaining, backfill] : remaining).slice(0, originalRows.length)
    let offset = 0
    residentWindowPages = residentWindowPages.map((page, index) => {
      const rows = nextRows.slice(offset, offset + pageSizes[index])
      offset += pageSizes[index]
      return { ...page, rows, lastAccessed: ++pageAccessSequence }
    })
    updateNextCursorFromResidentPages()
    if (backfill) sink.upsert(backfill)
  }
  const reconcileResidentWindowBatch = async (
    db: SolidDatabase<any>,
    incomingRows: TData[],
    sink: WindowWriteSink,
  ): Promise<void> => {
    if (!windowPolicy || residentWindowPages.length === 0) {
      for (const row of incomingRows) sink.upsert(row)
      return
    }

    const incomingByKey = new Map(incomingRows.map((row) => [getKey(row), row]))
    const pageSizes = residentWindowPages.map((page) => page.rows.length)
    const originalRows = residentWindowPages.flatMap((page) => page.rows)
    const originalKeys = new Set(originalRows.map(getKey))
    const baseRows = windowPolicy.sort(originalRows.filter((row) => !incomingByKey.has(getKey(row))))
    const candidates = [...baseRows, ...incomingByKey.values()]

    if ([...incomingByKey.keys()].some((key) => originalKeys.has(key)) && baseRows.length > 0) {
      const excludedKeys = new Set(candidates.map(getKey))
      const cursor = windowPolicy.cursorFor(baseRows[baseRows.length - 1])
      const backfills = await executeLogicalWindow(db, cursor)
      for (const backfill of backfills) {
        const key = getKey(backfill)
        if (!excludedKeys.has(key)) {
          excludedKeys.add(key)
          candidates.push(backfill)
        }
      }
    }

    const nextRows = windowPolicy.sort(candidates).slice(0, originalRows.length)
    const nextKeys = new Set(nextRows.map(getKey))
    let offset = 0
    residentWindowPages = residentWindowPages.map((page, index) => {
      const rows = nextRows.slice(offset, offset + pageSizes[index])
      offset += pageSizes[index]
      return { ...page, rows, lastAccessed: ++pageAccessSequence }
    })
    updateNextCursorFromResidentPages()

    for (const key of originalKeys) {
      if (!nextKeys.has(key)) sink.delete(key)
    }
    for (const row of nextRows) {
      const key = getKey(row)
      if (incomingByKey.has(key) || !originalKeys.has(key)) sink.upsert(row)
    }
  }

  if (windowState && windowPolicy && window) {
    windowState.loadNextPage = async (): Promise<TData[]> => {
      if (windowState.isLoadingNextPage || !windowState.hasNextPage || !nextCursor) return []
      const db = getDb()
      if (!db) throw new Error('Database not connected')

      windowState.isLoadingNextPage = true
      try {
        const fetched = windowPolicy.sort(await executeLogicalWindow(db, nextCursor))
        const retained = fetched.slice(0, window.limit)
        windowState.hasNextPage = fetched.length > window.limit
        for (const row of retained) {
          ;(collection.utils as { writeUpsert?: (value: TData) => void }).writeUpsert?.(row)
        }

        if (retained.length > 0) {
          residentWindowPages.push({
            id: `page-${++pageSequence}`,
            rows: retained,
            lastAccessed: ++pageAccessSequence,
          })
        }
        const residency = evictOrderedWindowPages(
          residentWindowPages,
          window.maxResidentPages ?? 3,
        )
        residentWindowPages = residency.pages
        const retainedKeys = new Set(residentWindowPages.flatMap((page) => page.rows.map(getKey)))
        for (const page of residency.evictedPages) {
          for (const row of page.rows) {
            const key = getKey(row)
            if (!retainedKeys.has(key)) {
              ;(collection.utils as { writeDelete?: (key: string) => void }).writeDelete?.(key)
            }
          }
        }
        windowState.residentPages = residentWindowPages.length
        updateNextCursorFromResidentPages()
        return retained
      } finally {
        windowState.isLoadingNextPage = false
      }
    }
    windowState.reset = async (): Promise<void> => {
      nextCursor = null
      residentWindowPages = []
      windowState.hasNextPage = false
      windowState.residentPages = 0
      const refetch = (collection.utils as { refetch?: () => Promise<void> }).refetch
      if (typeof refetch === 'function') await refetch()
    }
  }

  // 2. Attach helpers
  const fetch = async (fetchOptions: { refetch?: boolean } = {}) => {
    if (!collection.isReady()) {
      await collection.preload()
      return collection.toArray as TData[]
    }

    if (fetchOptions.refetch) {
      const refetch = (collection.utils as { refetch?: () => Promise<void> }).refetch
      if (typeof refetch === 'function') {
        await refetch()
      }
    }

    return collection.toArray as TData[]
  }

  const connectToPod = async (db: SolidDatabase<any>) => {
    if (typeof (db as any).subscribe !== 'function') {
      console.warn('[PodCollection] db.subscribe not available')
      return () => {}
    }

    try {
      const locatorDb = db as unknown as {
        findByIri?: (resource: unknown, iri: string) => Promise<TData | null>
        findById?: (resource: unknown, id: string) => Promise<TData | null>
      }
      const inFlightRemoteUpserts = new Map<string, Promise<void>>()
      let pendingInvalidation: Promise<unknown> | null = null
      const activityObjectIdentity = (activity: any): string | null => {
        const object = activity?.object
        const candidate = typeof object === 'string'
          ? object
          : (typeof object === 'object' ? (object['@id'] ?? object.id ?? null) : null)
        return typeof candidate === 'string' && candidate.length > 0 ? candidate : null
      }
      const invalidateOnce = (): Promise<unknown> => {
        if (!pendingInvalidation) {
          pendingInvalidation = queryClient.invalidateQueries({ queryKey })
            .finally(() => {
              pendingInvalidation = null
            })
        }
        return pendingInvalidation
      }
      const pendingRemoteRows = new Map<string, TData>()
      let pendingRemoteFlush: Promise<void> | null = null
      const flushRemoteRows = async (): Promise<void> => {
        await Promise.resolve()
        const operations: Array<{ type: 'upsert'; row: TData } | { type: 'delete'; key: string }> = []
        const sink: WindowWriteSink = {
          upsert: (row) => operations.push({ type: 'upsert', row }),
          delete: (key) => operations.push({ type: 'delete', key }),
        }

        while (pendingRemoteRows.size > 0) {
          const rows = [...pendingRemoteRows.values()]
          pendingRemoteRows.clear()
          await reconcileResidentWindowBatch(db, rows, sink)
        }

        const writeBatch = (collection.utils as { writeBatch?: (callback: () => void) => void }).writeBatch
        const commit = () => {
          for (const operation of operations) {
            if (operation.type === 'upsert') writeUpsert(operation.row)
            else writeDelete(operation.key)
          }
        }
        if (typeof writeBatch === 'function') writeBatch(commit)
        else commit()
      }
      const enqueueRemoteRow = (row: TData): Promise<void> => {
        pendingRemoteRows.set(getKey(row), row)
        if (!pendingRemoteFlush) {
          pendingRemoteFlush = flushRemoteRows().finally(() => {
            pendingRemoteFlush = null
          })
        }
        return pendingRemoteFlush
      }
      // Resolve the row behind a subscribe activity without assuming the object format
      // (IRI string, id string, or object with @id/id). On any failure return null so the
      // caller falls back to invalidate — never worse than the previous behavior.
      const resolveActivityRow = async (activity: any): Promise<TData | null> => {
        const object = activity?.object
        if (object == null) return null
        const iri = typeof object === 'string'
          ? object
          : (typeof object === 'object' ? (object['@id'] ?? object.id ?? null) : null)
        if (iri && typeof locatorDb.findByIri === 'function') {
          const byIri = await locatorDb.findByIri(resource, iri)
          if (byIri) return byIri
        }
        const id = typeof object === 'string' && !/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(object) ? object : null
        if (id && typeof locatorDb.findById === 'function') {
          const byId = await locatorDb.findById(resource, id)
          if (byId) return byId
        }
        return null
      }
      const resolveActivityKey = (activity: any): string | null => {
        const object = activity?.object
        const candidate = typeof object === 'string'
          ? object
          : (typeof object === 'object' ? (object?.id ?? object?.['@id']) : null)
        if (typeof candidate !== 'string') {
          return null
        }
        if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(candidate)) {
          for (const row of residentWindowPages.flatMap((page) => page.rows)) {
            const rowIri = (row as TData & { '@id'?: string })['@id']
            const key = getKey(row)
            if (rowIri === candidate || candidate.endsWith(key) || candidate.endsWith(`/${key}`)) {
              return key
            }
          }
          return null
        }
        try {
          return getKey({ id: candidate } as TData)
        } catch {
          return null
        }
      }
      const applyRemoteUpsert = async (activity: any) => {
        const identity = activityObjectIdentity(activity)
        if (identity) {
          const inFlight = inFlightRemoteUpserts.get(identity)
          if (inFlight) {
            return inFlight
          }
        }

        const operation = (async () => {
          try {
            const row = await resolveActivityRow(activity)
            if (row) {
              const [projectedRow] = transformRows ? await transformRows([row], db) : [row]
              if (!projectedRow) {
                await invalidateOnce()
                return
              }
              await enqueueRemoteRow(projectedRow)
            } else {
              await invalidateOnce()
            }
          } catch {
            await invalidateOnce()
          }
        })()

        if (!identity) {
          return operation
        }
        inFlightRemoteUpserts.set(identity, operation)
        try {
          await operation
        } finally {
          if (inFlightRemoteUpserts.get(identity) === operation) {
            inFlightRemoteUpserts.delete(identity)
          }
        }
      }
      const sub = await (db as any).subscribe(resource, {
        onCreate: async (activity: any) => {
          debugPodCollection(`[PodCollection] onCreate: ${activity.object}`)
          await applyRemoteUpsert(activity)
        },
        onUpdate: async (activity: any) => {
          debugPodCollection(`[PodCollection] onUpdate: ${activity.object}`)
          await applyRemoteUpsert(activity)
        },
        onDelete: async (activity: any) => {
          debugPodCollection(`[PodCollection] onDelete: ${activity.object}`)
          const key = resolveActivityKey(activity)
          if (key) {
            try {
              await reconcileActiveWindowDelete(db, key)
              return
            } catch {
              // Fall through to a full refresh when local sync state cannot accept the delete.
            }
          }
          queryClient.invalidateQueries({ queryKey })
        }
      })
      
      debugPodCollection(`[PodCollection] Subscribed to ${queryKey.join('/')}`)
      return () => sub.unsubscribe()
    } catch (error) {
      console.error(`[PodCollection] Subscription failed`, error)
      return () => {}
    }
  }

  const subscriptionLease = createCollectionSubscriptionLease(connectToPod, { graceMs: 0 })

  // Concurrent consumers share one physical Pod channel per collection and database.
  const subscribeToPod = (db: SolidDatabase<any>) => subscriptionLease.acquire(db)

  // Extend the collection object with helper methods
  const baseInsert = collection.insert.bind(collection)
  const insert = (item: TData) => baseInsert(ensureId(item, 'insert'))

  return Object.assign(collection, { insert, subscribeToPod, fetch, window: windowState })
}

function isUnsupportedDocumentCollectionRead(error: unknown): boolean {
  return errorMessage(error).includes('Document-mode collection queries over plain LDP are not supported')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function toPersistableInsert<TData extends { id?: string }>(item: TData, resource: unknown): TData {
  return toPersistableIdentity(item, resource)
}

function toPersistableIdentity<TData extends { id?: string }>(item: TData, resource: unknown): TData {
  const buildId = (resource as { buildId?: (target: { id: string }) => string } | null)?.buildId
  if (typeof buildId !== 'function' || !item.id || looksLikeBaseRelativeResourceId(item.id)) {
    return item
  }

  return {
    ...item,
    id: buildId.call(resource, { id: item.id }),
  }
}

function looksLikeBaseRelativeResourceId(id: string): boolean {
  return id.includes('/') || id.includes('#') || id.endsWith('.ttl')
}

function changedPersistableFields<TData extends { id?: string }>(
  original: TData | undefined,
  modified: TData,
): Record<string, unknown> {
  if (!original) {
    throw new Error('Pod collection update requires an original row snapshot.')
  }

  const changed: Record<string, unknown> = {}
  const keys = new Set([...Object.keys(original), ...Object.keys(modified)])
  for (const key of keys) {
    if (key === 'id' || key === '@id') continue
    const originalValue = original[key as keyof TData]
    const hasModifiedValue = Object.prototype.hasOwnProperty.call(modified, key)
    const modifiedValue = modified[key as keyof TData]
    if (!hasModifiedValue || modifiedValue === undefined) {
      if (originalValue !== undefined) {
        changed[key] = null
      }
      continue
    }
    if (!samePersistedValue(originalValue, modifiedValue)) {
      changed[key] = modifiedValue
    }
  }
  return changed
}

function samePersistedValue(left: unknown, right: unknown): boolean {
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime()
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return JSON.stringify(left) === JSON.stringify(right)
  }
  if (isPlainRecord(left) && isPlainRecord(right)) {
    return JSON.stringify(left) === JSON.stringify(right)
  }
  return Object.is(left, right)
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)
}
