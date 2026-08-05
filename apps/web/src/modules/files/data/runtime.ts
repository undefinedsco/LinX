import { acquirePodCollectionSubscription } from '@/lib/data/use-pod-collection-subscription'
import type { AppletRuntime } from '@/modules/layout/applet-runtime'
import { filesOps } from './collections'

const subscribe = () => filesOps.subscribeToPod()

export const filesRuntime: AppletRuntime = {
  activate: ({ db, signal }) => acquirePodCollectionSubscription(db, subscribe, signal),
}
