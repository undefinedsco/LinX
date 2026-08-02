import { acquirePodCollectionSubscription } from '@/lib/data/use-pod-collection-subscription'
import type { MicroAppRuntime } from '@/modules/layout/micro-app-runtime'
import { contactOps } from './data/collections'

const subscribe = () => contactOps.subscribeToPod()

export const contactsRuntime: MicroAppRuntime = {
  activate: ({ db, signal }) => acquirePodCollectionSubscription(db, subscribe, signal),
}
