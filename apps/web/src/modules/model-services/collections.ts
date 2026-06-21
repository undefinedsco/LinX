import {
  aiModelResource,
  aiProviderResource,
  credentialResource,
  type AIModelRow,
  type AIProviderRow,
  type CredentialRow,
} from '@undefineds.co/models'
import { createPodCollection } from '../../lib/data/pod-collection'
import { queryClient } from '@/providers/query-provider'
import type { SolidDatabase } from '@undefineds.co/models'

let dbGetter: (() => SolidDatabase | null) | null = null

export function setDatabaseGetter(getter: () => SolidDatabase | null) {
  dbGetter = getter
}

function getDb(): SolidDatabase | null {
  return dbGetter ? dbGetter() : null
}

export const credentialCollection = createPodCollection<typeof credentialResource, CredentialRow>({
  resource: credentialResource,
  queryKey: ['ai-credentials'],
  queryClient,
  getDb,
})

export const providerCollection = createPodCollection<typeof aiProviderResource, AIProviderRow>({
  resource: aiProviderResource,
  queryKey: ['ai-providers'],
  queryClient,
  getDb,
})

export const modelCollection = createPodCollection<typeof aiModelResource, AIModelRow>({
  resource: aiModelResource,
  queryKey: ['ai-models'],
  queryClient,
  getDb,
})

export function initializeModelCollections(db: SolidDatabase | null) {
  setDatabaseGetter(() => db)
}
