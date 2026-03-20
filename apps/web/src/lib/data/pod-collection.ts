import { createCollection } from '@tanstack/react-db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import { QueryClient } from '@tanstack/react-query'
import { deleteExactRecord, updateExactRecord, type SolidDatabase } from '@linx/models'
import type { PodTable } from '@undefineds.co/drizzle-solid'

interface PodCollectionOptions<TTable, TData> {
  table: TTable
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
  TTable extends PodTable<any>,
  TData extends { id?: string },
  _TInsert = any
>(
  options: PodCollectionOptions<TTable, TData>
) {
  const { table, queryKey, queryClient, getDb, columns, orderBy, getKey: customGetKey, seed } = options

  const ensureId = (item: TData): TData => {
    if (item.id) return item
    const id = crypto.randomUUID()
    if (typeof item === 'object' && item) {
      return Object.assign(item, { id }) as TData
    }
    return { ...(item as TData), id }
  }

  // Default key extractor: id required after insert/read
  const getKey = customGetKey ?? ((item: TData) => {
    const id = (item as any).id
    if (!id) {
      throw new Error('Collection item is missing id.')
    }
    return id
  })

  let didSeed = false

  const fetchRows = async () => {
    const db = getDb()
    if (!db) return []
    
    // Build select with specific columns if provided
    let query
    if (columns && columns.length > 0) {
      const selectObj: Record<string, any> = {}
      for (const col of columns) {
        selectObj[col as string] = (table as any)[col]
      }
      query = db.select(selectObj).from(table)
    } else {
      query = db.select().from(table)
    }
    
    if (orderBy?.column) {
      query = query.orderBy(orderBy.column, orderBy.direction ?? 'asc')
    }
    
    let rows = (await query.execute()) as TData[]
    
    // Filter out rows with relative IRI-like ids (dirty data), but keep normal bare ids.
    rows = rows.filter(row => {
      const id = (row as any).id
      if (!id) return true // Keep rows without id field
      if (
        typeof id === 'string'
        && (id.startsWith('/') || id.startsWith('./') || id.startsWith('../') || id.startsWith('#'))
      ) {
        console.warn(`[PodCollection] Skipping row with invalid id: ${id}`)
        return false
      }
      return true
    })

    if (!didSeed && rows.length === 0 && seed) {
      const seedRows = typeof seed === 'function' ? seed() : seed
      if (seedRows.length > 0) {
        const ensured = seedRows.map((row) => ensureId(row))
        await db.insert(table).values(ensured as any).execute()
        didSeed = true
        rows = (await query.execute()) as TData[]
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
        const ensured = ensureId(modified as TData)
        await db.insert(table).values(ensured as any).execute()
      },

      // UPDATE
      onUpdate: async ({ transaction }) => {
        const db = getDb()
        if (!db) throw new Error('Database not connected')
        const { original, modified } = transaction.mutations[0]

        try {
          await updateExactRecord(db, table as any, (original ?? modified) as any, modified as any)
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
        await deleteExactRecord(db, table as any, original as any)
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
      const sub = await (db as any).subscribe(table, {
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
  const insert = (item: TData) => baseInsert(ensureId(item))

  return Object.assign(collection, { insert, subscribeToPod, fetch })
}
