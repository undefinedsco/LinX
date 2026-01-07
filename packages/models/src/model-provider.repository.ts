import {
  modelProviderTable,
  type ModelProviderRow,
  type ModelProviderInsert,
  type ModelProviderUpdate,
} from './model-provider.schema'
import {
  definePodRepository,
} from './repository'

export const modelProviderRepository = definePodRepository<
  typeof modelProviderTable,
  ModelProviderRow,
  ModelProviderInsert,
  ModelProviderUpdate
>({
  namespace: 'model-provider',
  table: modelProviderTable,
  searchableFields: ['id'],
  defaultSort: { field: 'updatedAt', direction: 'desc' },
})
