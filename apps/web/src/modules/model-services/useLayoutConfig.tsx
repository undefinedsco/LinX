import { useMemo } from 'react'
import { Switch } from '@/components/ui/switch'
import type { MicroAppLayoutConfig } from '@/modules/layout/micro-app-registry'
import { useModelServicesStore } from './store'
import { useModelServices } from './hooks/useModelServices'
import { resolveSelectedProviderId } from './selection'

export function useModelServicesLayoutConfig(): MicroAppLayoutConfig {
  const selectedId = useModelServicesStore((state) => state.selectedProviderId)
  const { providers, updateProvider } = useModelServices()

  const selectedProviderId = resolveSelectedProviderId(providers, selectedId)
  const providerState = selectedProviderId ? providers[selectedProviderId] : null
  const providerName = providerState?.name
  const providerEnabled = Boolean(providerState?.enabled)

  return useMemo(
    () => ({
      mainTitle: providerState ? (
        <div className="flex items-center gap-3">
          <span>{providerName}</span>
          <div onClick={(e) => e.stopPropagation()}>
            <Switch
              id="header-enable"
              aria-label={providerEnabled ? '停用服务' : '启用服务'}
              title={providerEnabled ? '停用服务' : '启用服务'}
              checked={providerEnabled}
              onCheckedChange={(checked) => {
                if (selectedProviderId) {
                  updateProvider(selectedProviderId, { enabled: checked })
                }
              }}
              className="scale-90"
            />
          </div>
        </div>
      ) : '模型服务',
      subtitle: providerState ? '' : '配置 AI 提供商及模型',
      topActions: undefined,
      hideIcon: true,
    }),
    [providerEnabled, providerName, providerState, selectedProviderId, updateProvider],
  )
}
