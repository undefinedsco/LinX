import { definePodRepository } from './repository'
import { chatTable, type ChatRow, type ChatInsert, type ChatUpdate } from './chat.schema'

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



