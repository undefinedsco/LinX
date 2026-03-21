import { definePodRepository } from './repository.js'
import { messageTable, type MessageRow, type MessageInsert, type MessageUpdate } from './message.schema.js'

export const messageRepository = definePodRepository<
  typeof messageTable,
  MessageRow,
  MessageInsert,
  MessageUpdate
>({
  namespace: 'message',
  table: messageTable,
  searchableFields: ['content'],
  defaultSort: { field: 'createdAt', direction: 'asc' },
})



