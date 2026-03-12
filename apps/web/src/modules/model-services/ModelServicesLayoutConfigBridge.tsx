import { useEffect } from 'react'
import { useModelServicesLayoutConfig } from './useLayoutConfig'
import type { MicroAppLayoutConfig } from '@/modules/layout/micro-app-registry'

export function ModelServicesLayoutConfigBridge({
  onConfigChange,
}: {
  onConfigChange: (config: MicroAppLayoutConfig | undefined) => void
}) {
  const config = useModelServicesLayoutConfig()

  useEffect(() => {
    onConfigChange(config)
  }, [config, onConfigChange])

  return null
}
