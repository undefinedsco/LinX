import { definePodRepository } from './repository'
import {
  sessionTable,
  type SessionRow,
  type SessionInsert,
  type SessionUpdate,
} from './session'

export const sessionRepository = definePodRepository<
  typeof sessionTable,
  SessionRow,
  SessionInsert,
  SessionUpdate
>({
  namespace: 'session',
  table: sessionTable,
  searchableFields: ['chatId', 'threadId', 'status', 'tool'],
  defaultSort: { field: 'updatedAt', direction: 'desc' },
})
