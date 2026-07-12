import { useMemo, useState } from 'react'
import { useModelServicesStore } from '../../app/store'
import { useModelServices } from '../../data/use-model-services'
import { projectModelProviderList } from '../../domain/model-services-projection'
import { getModelProviderAvatar } from '../../ui/provider-visuals'
import type { ModelServicesListViewProps } from '../../ui/ModelServicesListView'

export function useModelServicesListPaneController(): ModelServicesListViewProps {
  const { providers, error: queryError = null } = useModelServices()
  const selectedId = useModelServicesStore((state) => state.selectedProviderId)
  const onSelect = useModelServicesStore((state) => state.setSelectedProviderId)
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
