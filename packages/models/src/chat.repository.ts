import { definePodRepository } from './repository.js'
import { chatTable, type ChatRow, type ChatInsert, type ChatUpdate } from './chat.schema.js'

export const chatRepository = definePodRepository<
  typeof chatTable,
  ChatRow,
  ChatInsert,
  ChatUpdate
>({
  namespace: 'chat',
  table: chatTable,
  searchableFields: ['title', 'description'],
  defaultSort: { field: 'lastActiveAt', direction: 'desc' },
})



