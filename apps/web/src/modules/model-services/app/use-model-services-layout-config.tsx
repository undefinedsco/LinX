import { useMemo } from 'react'
import type { AppletLayoutConfig } from '@/modules/layout/applet-registry'
import { useModelServicesStore } from './store'
import { MODEL_PROVIDERS } from '../domain/provider-catalog'

export function useModelServicesLayoutConfig(): AppletLayoutConfig {
  const selectedId = useModelServicesStore((state) => state.selectedProviderId)
  const provider = useMemo(() =>
    MODEL_PROVIDERS.find(p => p.id === selectedId),
  [selectedId])
  return useMemo(
    () => ({
      mainTitle: provider?.name ?? '模型服务',
      subtitle: provider ? '' : '配置 AI 提供商及模型',
      topActions: undefined,
      hideIcon: true,
    }),
    [provider],
  )
}
