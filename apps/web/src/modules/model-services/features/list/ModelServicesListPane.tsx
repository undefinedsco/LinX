import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { ModelServicesListView } from '../../ui/ModelServicesListView'
import { useModelServicesListPaneController } from './useModelServicesListPaneController'

export function ModelServicesListPane({}: MicroAppPaneProps) {
  const viewProps = useModelServicesListPaneController()
  return <ModelServicesListView {...viewProps} />
}
