import { useLiveQuery } from '@tanstack/react-db'
import { useMemo } from 'react'
import { agentCollection } from '@/modules/contacts/collections'

/**
 * Hook to fetch all available AI agents
 */
export function useAgents() {
  return useLiveQuery(agentCollection)
}

/**
 * Hook to fetch a single agent by ID
 */
export function useAgent(id: string | null) {
  const query = useLiveQuery(agentCollection)
  const data = useMemo(
    () => id ? query.data.find((row) => row.id === id) ?? null : null,
    [id, query.data],
  )

  return { ...query, data }
}
