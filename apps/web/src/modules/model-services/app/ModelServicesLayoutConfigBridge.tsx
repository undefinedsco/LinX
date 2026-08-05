import { useEffect } from 'react'
import { useModelServicesLayoutConfig } from './use-model-services-layout-config'
import type { AppletLayoutConfig } from '@/modules/layout/applet-registry'

export function ModelServicesLayoutConfigBridge({
  onConfigChange,
}: {
  onConfigChange: (config: AppletLayoutConfig | undefined) => void
}) {
  const config = useModelServicesLayoutConfig()

  useEffect(() => {
    onConfigChange(config)
  }, [config, onConfigChange])

  return null
}
