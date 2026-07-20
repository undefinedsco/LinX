import { useEffect, useMemo } from 'react'
import type { MicroAppLayoutConfig } from '@/modules/layout/micro-app-registry'

export function FilesLayoutConfigBridge({
  onConfigChange,
}: {
  onConfigChange: (config: MicroAppLayoutConfig | undefined) => void
}) {
  const config = useMemo<MicroAppLayoutConfig>(() => ({
    listPanel: {
      defaultWidth: 240,
      minWidth: 232,
      maxWidth: 360,
    },
  }), [])

  useEffect(() => {
    onConfigChange(config)
  }, [config, onConfigChange])

  return null
}
