import { definePodRepository } from './repository'
import { threadTable, type ThreadRow, type ThreadInsert, type ThreadUpdate } from './thread.schema'

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



