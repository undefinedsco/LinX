import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { InboxList } from '../../ui/InboxList'
import { useInboxListPaneController } from './useInboxListPaneController'

export function InboxListPane(_props: MicroAppPaneProps) {
  const controller = useInboxListPaneController()

  return <InboxList {...controller} />
}

export default InboxListPane
