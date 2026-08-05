import type { AppletPaneProps } from '@/modules/layout/applet-registry'
import { AiConnectionsListView } from '../../ui/AiConnectionsListView'
import { useAiConnectionsListPaneController } from './useAiConnectionsListPaneController'

export function AiConnectionsListPane({}: AppletPaneProps) {
  const viewProps = useAiConnectionsListPaneController()
  return <AiConnectionsListView {...viewProps} />
}
