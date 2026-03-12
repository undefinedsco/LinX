import { useEffect } from 'react'
import { useChatLayoutConfig } from './useChatLayoutConfig'
import type { MicroAppLayoutConfig } from '@/modules/layout/micro-app-registry'

export function ChatLayoutConfigBridge({
  onConfigChange,
}: {
  onConfigChange: (config: MicroAppLayoutConfig | undefined) => void
}) {
  const config = useChatLayoutConfig()

  useEffect(() => {
    onConfigChange(config)
  }, [config, onConfigChange])

  return null
}
