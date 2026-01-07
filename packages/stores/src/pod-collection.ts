import { createCollection } from '@tanstack/react-db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import { QueryClient } from '@tanstack/react-query'
import type { SolidDatabase } from '@linx/models'

// Define a minimal interface for what we expect from a Drizzle/Pod Table
interface PodTableSchema {
  [key: string]: any
}

interface PodCollectionOptions<TData, TInsert> {
  table: PodTableSchema
  queryKey: string[]
  queryClient: QueryClient
  // Function to get the current DB instance
  getDb: () => SolidDatabase | null
}

/**
 * Creates a TanStack DB Collection synchronized with a Solid Pod Table.
 * Includes support for real-time subscriptions via db.subscribe().
 */
export function createPodCollection<TData extends { id: string }, TInsert>(
  options: PodCollectionOptions<TData, TInsert>
) {
  const { table, queryKey, queryClient, getDb } = options

  // 1. Create the base collection
  const collection = createCollection<TData, string>(
    queryCollectionOptions({
      queryKey,
      queryClient,

      // READ
      queryFn: async () => {
        const db = getDb()
        if (!db) return []
        const rows = await db.select().from(table).execute()
        return rows as TData[]
      },

      // IDENTITY
      getKey: (item) => item.id,

      // CREATE
      onInsert: async ({ transaction }) => {
        const db = getDb()
        if (!db) throw new Error('Database not connected')
        const { modified } = transaction.mutations[0]
        await db.insert(table).values(modified as any).execute()
      },

      // UPDATE
      onUpdate: async ({ transaction }) => {
        const db = getDb()
        if (!db) throw new Error('Database not connected')
        const { original, modified } = transaction.mutations[0]
        const id = original.id
        if (!id) return

        const systemFields = ['id', '@id', 'subject', 'uri', 'updatedAt'] 
        const filteredData = Object.fromEntries(
          Object.entries(modified).filter(([key]) => !systemFields.includes(key))
        )
        if (Object.keys(filteredData).length === 0) return

        try {
          await db.update(table).set(filteredData).where({ id } as any).execute()
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
        const id = original.id
        await db.delete(table).where({ id } as any).execute()
      }
    })
  )

  // 2. Attach helpers
  const fetch = async () => {
    const db = getDb()
    if (!db) return []
    const rows = await db.select().from(table).execute()
    return rows as TData[]
  }

  // Usage: useEffect(() => collection.subscribeToPod(db), [db])
  const subscribeToPod = async (db: SolidDatabase) => {
    // ... (existing subscribe logic)
    if (typeof (db as any).subscribe !== 'function') {
      console.warn('[PodCollection] db.subscribe not available')
      return () => {}
    }

    try {
      const sub = await (db as any).subscribe(table, {
        onCreate: async (activity: any) => {
          const id = activity.object
          try {
            const rows = await db.select().from(table).where({ id } as any).execute()
            if (rows[0]) {
               collection.insert(rows[0] as TData)
               // Invalidate query to refresh UI if using useQuery
               queryClient.invalidateQueries({ queryKey })
            }
          } catch (e) { console.error('Sync Create Error', e) }
        },
        onUpdate: async (activity: any) => {
          const id = activity.object
          try {
            const rows = await db.select().from(table).where({ id } as any).execute()
            if (rows[0]) {
              collection.update(id, (draft) => { Object.assign(draft, rows[0]) })
              queryClient.invalidateQueries({ queryKey })
            }
          } catch (e) { console.error('Sync Update Error', e) }
        },
        onDelete: (activity: any) => {
          collection.delete(activity.object)
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
  return Object.assign(collection, { subscribeToPod, fetch })
}