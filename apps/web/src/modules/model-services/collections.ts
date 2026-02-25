import {
  aiModelTable,
  aiProviderTable,
  credentialTable,
  type AIModelRow,
  type AIProviderRow,
  type CredentialRow,
} from '@linx/models'
import { createPodCollection } from '../../lib/data/pod-collection'
import { queryClient } from '@/providers/query-provider'
import type { SolidDatabase } from '@linx/models'

let dbGetter: (() => SolidDatabase | null) | null = null

export function setDatabaseGetter(getter: () => SolidDatabase | null) {
  dbGetter = getter
}

function getDb(): SolidDatabase | null {
  return dbGetter ? dbGetter() : null
}

export const credentialCollection = createPodCollection<typeof credentialTable, CredentialRow>({
  table: credentialTable,
  queryKey: ['ai-credentials'],
  queryClient,
  getDb,
})

export const providerCollection = createPodCollection<typeof aiProviderTable, AIProviderRow>({
  table: aiProviderTable,
  queryKey: ['ai-providers'],
  queryClient,
  getDb,
})

export const modelCollection = createPodCollection<typeof aiModelTable, AIModelRow>({
  table: aiModelTable,
  queryKey: ['ai-models'],
  queryClient,
  getDb,
})

export function initializeModelCollections(db: SolidDatabase | null) {
  setDatabaseGetter(() => db)
}
