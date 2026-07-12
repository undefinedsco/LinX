import {
  aiModelResource,
  aiProviderResource,
  credentialResource,
  type AIModelRow,
  type AIProviderRow,
  type CredentialRow,
} from '@undefineds.co/models'
import { createPodCollection } from '@/lib/data/pod-collection'
import { rebindPodCollection } from '@/lib/data/pod-collection-rebind'
import { queryClient } from '@/providers/query-provider'
import type { SolidDatabase } from '@undefineds.co/models'

let dbGetter: (() => SolidDatabase | null) | null = null
let activeDatabase: SolidDatabase | null | undefined
const credentialQueryKey = ['ai-credentials']
const providerQueryKey = ['ai-providers']
const modelQueryKey = ['ai-models']

export function setDatabaseGetter(getter: () => SolidDatabase | null) {
  dbGetter = getter
}

function getDb(): SolidDatabase | null {
  return dbGetter ? dbGetter() : null
}

export const credentialCollection = createPodCollection<typeof credentialResource, CredentialRow>({
  resource: credentialResource,
  queryKey: credentialQueryKey,
  queryClient,
  getDb,
})

export const providerCollection = createPodCollection<typeof aiProviderResource, AIProviderRow>({
  resource: aiProviderResource,
  queryKey: providerQueryKey,
  queryClient,
  getDb,
})

export const modelCollection = createPodCollection<typeof aiModelResource, AIModelRow>({
  resource: aiModelResource,
  queryKey: modelQueryKey,
  queryClient,
  getDb,
})

export async function initializeModelCollections(db: SolidDatabase | null): Promise<void> {
  if (activeDatabase === db) return

  activeDatabase = db
  setDatabaseGetter(() => db)

  try {
    await Promise.all([
      rebindPodCollection(credentialCollection, Boolean(db), {
        cancelInFlight: () => queryClient.cancelQueries({ queryKey: credentialQueryKey, exact: true }),
      }),
      rebindPodCollection(providerCollection, Boolean(db), {
        cancelInFlight: () => queryClient.cancelQueries({ queryKey: providerQueryKey, exact: true }),
      }),
      rebindPodCollection(modelCollection, Boolean(db), {
        cancelInFlight: () => queryClient.cancelQueries({ queryKey: modelQueryKey, exact: true }),
      }),
    ])
  } catch (error) {
    if (activeDatabase === db) {
      activeDatabase = undefined
    }
    throw error
  }
}
