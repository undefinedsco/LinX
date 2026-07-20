import { createCollection } from '@tanstack/react-db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import { QueryClient } from '@tanstack/react-query'
import type { SolidDatabase } from '@undefineds.co/models'
import { asBaseRelativeResourceId, requireRowResourceId } from '@linx/agent-runtime/pod-resource-identity'
import type { PodResource as PodResourceSchema } from '@undefineds.co/drizzle-solid'
import { deleteExactRecord, updateExactRecord } from './exact-records'

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
  // Optional: custom key extractor (defaults to requiring item.id)
  getKey?: (item: TData) => string
  // Optional: seed data when the collection is empty
  seed?: TData[] | (() => TData[])
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
  const { resource, queryKey, queryClient, getDb, columns, orderBy, getKey: customGetKey, seed } = options

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

  const fetchRows = async () => {
    const db = getDb()
    if (!db) return []

    const buildQuery = () => {
      let query
      if (columns && columns.length > 0) {
        const selectObj: Record<string, any> = {}
        for (const col of columns) {
          selectObj[col as string] = (resource as any)[col]
        }
        query = db.select(selectObj).from(resource)
      } else {
        query = db.select().from(resource)
      }
      if (orderBy?.column) {
        query = query.orderBy(orderBy.column, orderBy.direction ?? 'asc')
      }
      return query
    }

    let rows: TData[]
    try {
      rows = (await buildQuery().execute()) as TData[]
    } catch (error) {
      if (isUnsupportedDocumentCollectionRead(error)) {
        console.warn(`[PodCollection] ${queryKey.join('/')} fetch skipped: ${errorMessage(error)}`)
        return []
      }
      console.error(`[PodCollection] ${queryKey.join('/')} fetch failed:`, error)
      throw error
    }

    for (const row of rows) {
      requireRowResourceId(row, 'Pod collection row')
    }

    if (!didSeed && rows.length === 0 && seed) {
      const seedRows = typeof seed === 'function' ? seed() : seed
      if (seedRows.length > 0) {
        const ensured = seedRows.map((row) => ensureId(row, 'seed'))
        await db.insert(resource).values(ensured as any).execute()
        didSeed = true
        rows = (await buildQuery().execute()) as TData[]
      } else {
        didSeed = true
      }
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
        await db.insert(resource).values(payload as any).execute()
      },

      // UPDATE
      onUpdate: async ({ transaction }) => {
        const db = getDb()
        if (!db) throw new Error('Database not connected')
        const { original, modified } = transaction.mutations[0]

        try {
          await updateExactRecord(
            db,
            resource as any,
            (original ?? modified) as any,
            changedPersistableFields(original as TData | undefined, modified as TData),
          )
        } catch (error) {
          console.error(`[PodCollection] Update failed for ${queryKey.join('/')}:`, error)
          throw error
        }
      },

      // DELETE
      onDelete: async ({ transaction }) => {
        const db = getDb()
        if (!db) throw new Error('Database not connected')
        const { original } = transaction.mutations[0]
        await deleteExactRecord(db, resource as any, original as any)
      }
    })
  )

  // 2. Attach helpers
  const fetch = async () => {
    if (!collection.isReady()) {
      await collection.preload()
      return collection.toArray as TData[]
    }

    const refetch = (collection.utils as { refetch?: () => Promise<void> }).refetch
    if (typeof refetch === 'function') {
      await refetch()
    }

    return collection.toArray as TData[]
  }

  // Usage: useEffect(() => collection.subscribeToPod(db), [db])
  const subscribeToPod = async (db: SolidDatabase<any>) => {
    if (typeof (db as any).subscribe !== 'function') {
      console.warn('[PodCollection] db.subscribe not available')
      return () => {}
    }

    try {
      const sub = await (db as any).subscribe(resource, {
        onCreate: async (activity: any) => {
          debugPodCollection(`[PodCollection] onCreate: ${activity.object}`)
          // 直接 invalidate，让 useQuery 重新获取完整列表
          queryClient.invalidateQueries({ queryKey })
        },
        onUpdate: async (activity: any) => {
          debugPodCollection(`[PodCollection] onUpdate: ${activity.object}`)
          queryClient.invalidateQueries({ queryKey })
        },
        onDelete: (activity: any) => {
          debugPodCollection(`[PodCollection] onDelete: ${activity.object}`)
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

  // Extend the collection object with helper methods
  const baseInsert = collection.insert.bind(collection)
  const insert = (item: TData) => baseInsert(ensureId(item, 'insert'))

  return Object.assign(collection, { insert, subscribeToPod, fetch })
}

function isUnsupportedDocumentCollectionRead(error: unknown): boolean {
  return errorMessage(error).includes('Document-mode collection queries over plain LDP are not supported')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function toPersistableInsert<TData extends { id?: string }>(item: TData, resource: unknown): TData {
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
