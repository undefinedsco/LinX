import type { AppletPaneProps } from '@/modules/layout/applet-registry'
import { InboxList } from '../../ui/InboxList'
import { useInboxListPaneController } from './useInboxListPaneController'

export function InboxListPane(_props: AppletPaneProps) {
  const controller = useInboxListPaneController()

  return <InboxList {...controller} />
}

export default InboxListPane
