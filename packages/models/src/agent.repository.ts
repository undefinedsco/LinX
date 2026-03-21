import { definePodRepository } from './repository.js'
import { agentTable, type AgentRow, type AgentInsert, type AgentUpdate } from './agent.schema.js'

export const agentRepository = definePodRepository<
  typeof agentTable,
  AgentRow,
  AgentInsert,
  AgentUpdate
>({
  namespace: 'agent',
  table: agentTable,
  searchableFields: ['name', 'description', 'instructions'],
})



