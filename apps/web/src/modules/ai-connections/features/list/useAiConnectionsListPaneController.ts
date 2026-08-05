import { useMemo, useState } from 'react'
import { useAiConnectionsStore } from '../../app/store'
import { useAiConnections } from '../../data/use-ai-connections'
import { projectModelProviderList } from '../../domain/ai-connections-projection'
import { getModelProviderAvatar } from '../../ui/provider-visuals'
import type { AiConnectionsListViewProps } from '../../ui/AiConnectionsListView'

export function useAiConnectionsListPaneController(): AiConnectionsListViewProps {
  const { providers, error: queryError = null } = useAiConnections()
  const selectedId = useAiConnectionsStore((state) => state.selectedProviderId)
  const onSelect = useAiConnectionsStore((state) => state.setSelectedProviderId)
  const [search, setSearch] = useState('')

  const items = useMemo(
    () => projectModelProviderList(providers, search).map((provider) => ({
      ...provider,
      avatar: getModelProviderAvatar(provider.id),
    })),
    [providers, search],
  )

  return { items, selectedId, search, queryError, onSearchChange: setSearch, onSelect }
}
