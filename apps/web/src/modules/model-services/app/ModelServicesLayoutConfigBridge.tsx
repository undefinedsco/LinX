import { useEffect } from 'react'
import type { MicroAppLayoutConfig } from '@/modules/layout/micro-app-registry'
import { useMountedModelServices } from '../xpod/ModelServicesProvider'

export function ModelServicesLayoutConfigBridge({
  onConfigChange,
}: {
  onConfigChange: (config: MicroAppLayoutConfig | undefined) => void
}) {
  const { slots } = useMountedModelServices()

  useEffect(() => {
    onConfigChange({
      header: slots.mainHeader,
      listPanel: { defaultWidth: 380, minWidth: 360, maxWidth: 440 },
    })
    return () => onConfigChange(undefined)
  }, [onConfigChange, slots.mainHeader])

  return null
}
