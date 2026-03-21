import { definePodRepository } from './repository.js'
import { threadTable, type ThreadRow, type ThreadInsert, type ThreadUpdate } from './thread.schema.js'

export const threadRepository = definePodRepository<
  typeof threadTable,
  ThreadRow,
  ThreadInsert,
  ThreadUpdate
>({
  namespace: 'thread',
  table: threadTable,
  searchableFields: ['title'],
  defaultSort: { field: 'updatedAt', direction: 'desc' },
})



