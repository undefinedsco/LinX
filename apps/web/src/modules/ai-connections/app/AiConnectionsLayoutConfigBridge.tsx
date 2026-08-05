import { useEffect } from 'react'
import { useAiConnectionsLayoutConfig } from './use-ai-connections-layout-config'
import type { AppletLayoutConfig } from '@/modules/layout/applet-registry'

export function AiConnectionsLayoutConfigBridge({
  onConfigChange,
}: {
  onConfigChange: (config: AppletLayoutConfig | undefined) => void
}) {
  const config = useAiConnectionsLayoutConfig()

  useEffect(() => {
    onConfigChange(config)
  }, [config, onConfigChange])

  return null
}
