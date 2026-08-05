import { useEffect } from 'react'
import { useChatLayoutConfig } from './useChatLayoutConfig'
import type { AppletLayoutConfig } from '@/modules/layout/applet-registry'

export function ChatLayoutConfigBridge({
  onConfigChange,
}: {
  onConfigChange: (config: AppletLayoutConfig | undefined) => void
}) {
  const config = useChatLayoutConfig()

  useEffect(() => {
    onConfigChange(config)
  }, [config, onConfigChange])

  return null
}
