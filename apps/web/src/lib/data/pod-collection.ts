import { createCollection } from '@tanstack/react-db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import { QueryClient } from '@tanstack/react-query'
import { asBaseRelativeResourceId, requireRowResourceId, type SolidDatabase } from '@undefineds.co/models'
import type { PodTable } from '@undefineds.co/drizzle-solid'
import { deleteExactRecord, updateExactRecord } from './exact-records'

interface PodCollectionOptions<TResource, TData> {
  resource?: TResource
  /** @deprecated Use `resource`; this remains only for existing call sites. */
  table?: TResource
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
 * Creates a TanStack DB Collection synchronized with a Solid Pod Table.
 * Includes support for real-time subscriptions via db.subscribe().
 */
export function createPodCollection<
  TResource extends PodTable<any>,
  TData extends { id?: string },
  _TInsert = any
>(
  options: PodCollectionOptions<TResource, TData>
) {
  const { queryKey, queryClient, getDb, columns, orderBy, getKey: customGetKey, seed } = options
  const resource = options.resource ?? options.table
  if (!resource) {
    throw new Error('createPodCollection requires a Pod resource schema.')
  }

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
        await db.insert(resource).values(ensured as any).execute()
      },

      // UPDATE
      onUpdate: async ({ transaction }) => {
        const db = getDb()
        if (!db) throw new Error('Database not connected')
        const { original, modified } = transaction.mutations[0]

        try {
          await updateExactRecord(db, resource as any, (original ?? modified) as any, modified as any)
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
          console.log(`[PodCollection] onCreate: ${activity.object}`)
          // 直接 invalidate，让 useQuery 重新获取完整列表
          queryClient.invalidateQueries({ queryKey })
        },
        onUpdate: async (activity: any) => {
          console.log(`[PodCollection] onUpdate: ${activity.object}`)
          queryClient.invalidateQueries({ queryKey })
        },
        onDelete: (activity: any) => {
          console.log(`[PodCollection] onDelete: ${activity.object}`)
          queryClient.invalidateQueries({ queryKey })
        }
      })
      
      console.log(`[PodCollection] Subscribed to ${queryKey.join('/')}`)
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
