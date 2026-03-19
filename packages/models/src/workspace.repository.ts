import { definePodRepository } from './repository'
import { workspaceTable, type WorkspaceRow, type WorkspaceInsert, type WorkspaceUpdate } from './workspace.schema'

export const workspaceRepository = definePodRepository<
  typeof workspaceTable,
  WorkspaceRow,
  WorkspaceInsert,
  WorkspaceUpdate
>({
  namespace: 'workspace',
  table: workspaceTable,
  searchableFields: ['title', 'branch'],
  defaultSort: { field: 'updatedAt', direction: 'desc' },
})
