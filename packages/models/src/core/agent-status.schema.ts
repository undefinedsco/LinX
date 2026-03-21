import { solidSchema, string, timestamp } from '@undefineds.co/drizzle-solid'
import { UDFS } from './namespaces.js'

const agentStatusSchema = solidSchema({
  id: string('id').primaryKey(),
  agentId: string('agentId').predicate(UDFS.agentId),
  status: string('status').predicate(UDFS.status),
  startedAt: timestamp('startedAt').predicate(UDFS.startedAt),
  lastActivityAt: timestamp('lastActivityAt').predicate(UDFS.lastActivityAt),
  currentTaskId: string('currentTaskId').predicate(UDFS.currentTaskId),
  errorMessage: string('errorMessage').predicate(UDFS.errorMessage),
}, {
  type: UDFS.AgentStatus,
  namespace: UDFS,
})

export const agentStatusTable = agentStatusSchema.table('agentStatus', {
  base: '/settings/ai/agent-status.ttl',
  subjectTemplate: '#{id}',
})

export type AgentStatusRow = typeof agentStatusTable.$inferSelect
export type AgentStatusInsert = typeof agentStatusTable.$inferInsert
export type AgentStatusUpdate = typeof agentStatusTable.$inferUpdate
