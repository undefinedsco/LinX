import { acquirePodCollectionSubscription } from '@/lib/data/use-pod-collection-subscription'
import type { MicroAppRuntime } from '@/modules/layout/micro-app-runtime'
import { inboxOps } from './collections'

const subscribe = () => inboxOps.subscribeToPod()

export const inboxRuntime: MicroAppRuntime = {
  activate: ({ db, signal }) => acquirePodCollectionSubscription(db, subscribe, signal),
}
