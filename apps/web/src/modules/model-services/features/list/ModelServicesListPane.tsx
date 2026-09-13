import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { useMountedModelServices } from '../../xpod/ModelServicesProvider'

export function ModelServicesListPane({}: MicroAppPaneProps) {
  const { slots } = useMountedModelServices()
  return (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden">
      <header className="h-12 shrink-0 border-b border-border bg-layout-list-header">
        {slots.listHeader}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {slots.list}
      </div>
    </div>
  )
}
