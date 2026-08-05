import { acquirePodCollectionSubscription } from '@/lib/data/use-pod-collection-subscription'
import type { AppletRuntime } from '@/modules/layout/applet-runtime'
import { chatOps } from './collections'

const subscribe = () => chatOps.subscribeToPod()

export const chatRuntime: AppletRuntime = {
  activate: ({ db, signal }) => acquirePodCollectionSubscription(db, subscribe, signal),
}
