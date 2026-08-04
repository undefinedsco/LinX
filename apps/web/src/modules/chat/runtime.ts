import { acquirePodCollectionSubscription } from '@/lib/data/use-pod-collection-subscription'
import type { MicroAppRuntime } from '@/modules/layout/micro-app-runtime'
import { chatOps } from './collections'

const subscribe = () => chatOps.subscribeToPod()

export const chatRuntime: MicroAppRuntime = {
  activate: ({ db, signal }) => acquirePodCollectionSubscription(db, subscribe, signal),
}
