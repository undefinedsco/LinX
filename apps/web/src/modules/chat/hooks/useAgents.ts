import { useLiveQuery } from '@tanstack/react-db'
import { useMemo } from 'react'
import { agentCollection } from '@/modules/contacts/collections'
import { subscribeContactsToPod } from '@/modules/contacts/runtime'
import { usePodCollectionSubscription } from '@/lib/data/use-pod-collection-subscription'
import { useSolidDatabase } from '@/providers/solid-database-provider'

function useContactsSharedSubscription() {
  const { db } = useSolidDatabase()
  // Agent data is owned by the contacts module: acquire its subscription
  // while chat surfaces render it, so cross-module edits stay live even when
  // the contacts micro-app is not active.
  usePodCollectionSubscription(!!db, db, subscribeContactsToPod)
}

/**
 * Hook to fetch all available AI agents
 */
export function useAgents() {
  useContactsSharedSubscription()
  return useLiveQuery(agentCollection)
}

/**
 * Hook to fetch a single agent by ID
 */
export function useAgent(id: string | null) {
  useContactsSharedSubscription()
  const query = useLiveQuery(agentCollection)
  const data = useMemo(
    () => id ? query.data.find((row) => row.id === id) ?? null : null,
    [id, query.data],
  )

  return { ...query, data }
}
