import { useQuery } from '@tanstack/react-query'
import { agentTable } from '@linx/models'
import { useSolidDatabase } from '@/providers/solid-database-provider'

export const AGENT_QUERY_KEYS = {
  agents: ['agents'] as const,
  agent: (id: string) => ['agents', id] as const,
}

/**
 * Hook to fetch all available AI agents
 */
export function useAgents() {
  const { db } = useSolidDatabase()

  return useQuery({
    queryKey: AGENT_QUERY_KEYS.agents,
    queryFn: async () => {
      if (!db) return []
      const rows = await db.select().from(agentTable).execute()
      return rows
    },
    enabled: !!db,
  })
}

/**
 * Hook to fetch a single agent by ID
 */
export function useAgent(id: string | null) {
  const { db } = useSolidDatabase()

  return useQuery({
    queryKey: AGENT_QUERY_KEYS.agent(id || ''),
    queryFn: async () => {
      if (!db || !id) return null
      const rows = await db.select().from(agentTable).execute()
      return rows.find(r => r.id === id) ?? null
    },
    enabled: !!db && !!id,
  })
}
