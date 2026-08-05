import type { AppletPaneProps } from '@/modules/layout/applet-registry'
import { ModelServicesListView } from '../../ui/ModelServicesListView'
import { useModelServicesListPaneController } from './useModelServicesListPaneController'

export function ModelServicesListPane({}: AppletPaneProps) {
  const viewProps = useModelServicesListPaneController()
  return <ModelServicesListView {...viewProps} />
}
