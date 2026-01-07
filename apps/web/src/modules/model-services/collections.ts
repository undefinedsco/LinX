import { modelProviderTable } from '@linx/models'
import type { ModelProviderRow, ModelProviderInsert } from '@linx/models'
import { createPodCollection } from '../../lib/data/pod-collection'
import { queryClient } from '@/providers/query-provider'
import type { SolidDatabase } from '@linx/models'
import { MODEL_PROVIDERS } from './constants'

// Database instance getter
let dbGetter: (() => SolidDatabase | null) | null = null

export function setDatabaseGetter(getter: () => SolidDatabase | null) {
  dbGetter = getter
}

function getDb(): SolidDatabase | null {
  return dbGetter ? dbGetter() : null
}

// ============================================================================
// Provider Collection
// ============================================================================

// Use the generic factory to create the collection
export const providerCollection = createPodCollection<ModelProviderRow, ModelProviderInsert>({
  table: modelProviderTable,
  queryKey: ['model-providers'],
  queryClient,
  getDb,
  // No seeding required - UI merges static config with DB data
  // Records are created lazily when user modifies configuration
})

// ============================================================================
// Initialization
// ============================================================================

export function initializeModelCollections(db: SolidDatabase | null) {
  setDatabaseGetter(() => db)
}
