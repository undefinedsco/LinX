import { acquirePodCollectionSubscription } from '@/lib/data/use-pod-collection-subscription'
import type { MicroAppRuntime } from '@/modules/layout/micro-app-runtime'
import { filesOps } from './collections'

const subscribe = () => filesOps.subscribeToPod()

export const filesRuntime: MicroAppRuntime = {
  activate: ({ db, signal }) => acquirePodCollectionSubscription(db, subscribe, signal),
}
