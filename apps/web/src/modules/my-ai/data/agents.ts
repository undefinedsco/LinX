import { useMemo } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import type { AgentRow } from '@undefineds.co/models'
import { agentCollection } from '@/modules/contacts/collections'
import { LINX_DEFAULT_SECRETARY, useChatMutations } from '@/modules/chat/collections'

export interface MyAgent {
  id: string
  name: string
  instructions: string
  isDefault: boolean
  model: string | null
}

function toMyAgent(row: AgentRow): MyAgent | null {
  if (typeof row.id !== 'string' || !row.id) return null
  return {
    id: row.id,
    name: (typeof row.name === 'string' && row.name.trim()) || '助手',
    instructions: typeof row.instructions === 'string' ? row.instructions : '',
    isDefault: row.id === LINX_DEFAULT_SECRETARY.agentId,
    model: typeof row.model === 'string' && row.model ? row.model : null,
  }
}

/** Assistants the person owns, default LinX assistant first. */
export function useMyAgents() {
  const query = useLiveQuery(agentCollection)
  const agents = useMemo(() => {
    const rows = ((query.data ?? []) as AgentRow[])
      .map(toMyAgent)
      .filter((agent): agent is MyAgent => agent !== null)
    return rows.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name, 'zh-CN'))
  }, [query.data])
  return { agents, isLoading: query.isLoading }
}

/**
 * Saves an assistant's working method. This only changes how it works; it
 * never widens what data, network or outbound actions it may use.
 */
export function useSaveAgentMethod() {
  const mutations = useChatMutations()
  return mutations.updateAgentInstructions
}
