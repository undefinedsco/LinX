import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { useMountedModelServices } from '../../xpod/ModelServicesProvider'

export function ModelServicesListPane({}: MicroAppPaneProps) {
  const { slots } = useMountedModelServices()
  return <div className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden">{slots.listHeader}{slots.list}</div>
}
