import {
  agentResource,
  contactResource,
  type AgentInsert,
  type AgentRow,
  type ContactInsert,
  type ContactRow,
  type SolidDatabase,
} from '@undefineds.co/models'
import { createPodCollection } from '@/lib/data/pod-collection'
import { rebindPodCollection } from '@/lib/data/pod-collection-rebind'
import { queryClient } from '@/providers/query-provider'

let databaseGetter: (() => SolidDatabase | null) | null = null
let activeDatabase: SolidDatabase | null | undefined
const contactQueryKey = ['contacts']
const agentQueryKey = ['agents']

export function setContactsDatabaseGetter(getter: () => SolidDatabase | null): void {
  databaseGetter = getter
}

export function getContactsDatabase(): SolidDatabase | null {
  return databaseGetter?.() ?? null
}

export const contactCollection = createPodCollection<typeof contactResource, ContactRow, ContactInsert>({
  resource: contactResource,
  queryKey: contactQueryKey,
  queryClient,
  getDb: getContactsDatabase,
  orderBy: { column: 'name', direction: 'asc' },
  getKey: (item) => {
    if (!item.id) throw new Error('Contact record is missing id')
    return item.id
  },
})

export const agentCollection = createPodCollection<typeof agentResource, AgentRow, AgentInsert>({
  resource: agentResource,
  queryKey: agentQueryKey,
  queryClient,
  getDb: getContactsDatabase,
  orderBy: { column: 'name', direction: 'asc' },
  getKey: (item) => {
    if (!item.id) throw new Error('Agent record is missing id')
    return item.id
  },
})

export async function initializeContactCollections(db: SolidDatabase | null): Promise<void> {
  if (activeDatabase === db) return

  activeDatabase = db
  setContactsDatabaseGetter(() => db)

  try {
    await Promise.all([
      rebindPodCollection(contactCollection, Boolean(db), {
        cancelInFlight: () => queryClient.cancelQueries({ queryKey: contactQueryKey, exact: true }),
      }),
      rebindPodCollection(agentCollection, Boolean(db), {
        cancelInFlight: () => queryClient.cancelQueries({ queryKey: agentQueryKey, exact: true }),
      }),
    ])
  } catch (error) {
    if (activeDatabase === db) {
      activeDatabase = undefined
    }
    throw error
  }
}
