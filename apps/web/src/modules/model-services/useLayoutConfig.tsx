import { useMemo } from 'react'
import { Switch } from '@/components/ui/switch'
import type { MicroAppLayoutConfig } from '@/modules/layout/micro-app-registry'
import { useModelServicesStore } from './store'
import { MODEL_PROVIDERS } from './constants'
import { useModelServices } from './hooks/useModelServices'

export function useModelServicesLayoutConfig(): MicroAppLayoutConfig {
  const selectedId = useModelServicesStore((state) => state.selectedProviderId)
  const { providers, updateProvider } = useModelServices()

  const provider = useMemo(() => 
    MODEL_PROVIDERS.find(p => p.id === selectedId), 
  [selectedId])
  const providerState = selectedId ? providers[selectedId] : null

  return useMemo(
    () => ({
      mainTitle: provider ? (
        <div className="flex items-center gap-3">
          <span>{provider.name}</span>
          <div onClick={(e) => e.stopPropagation()}>
            <Switch
              id="header-enable"
              checked={providerState?.enabled || false}
              onCheckedChange={(checked) => updateProvider(provider.id, { enabled: checked })}
              className="scale-90"
            />
          </div>
        </div>
      ) : '模型服务',
      subtitle: provider ? '' : '配置 AI 提供商及模型',
      topActions: undefined,
      hideIcon: true,
    }),
    [provider, providerState?.enabled, updateProvider],
  )
}
