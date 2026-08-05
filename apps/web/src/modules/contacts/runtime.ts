import { acquirePodCollectionSubscription } from '@/lib/data/use-pod-collection-subscription'
import type { MicroAppRuntime } from '@/modules/layout/micro-app-runtime'
import { contactOps } from './data/collections'

const subscribe = () => contactOps.subscribeToPod()

// Shared reference so cross-module consumers (for example chat agent pickers)
// and the runtime activation resolve to the same ref-counted lease instead
// of opening duplicate subscriptions.
export const subscribeContactsToPod = subscribe

export const contactsRuntime: MicroAppRuntime = {
  activate: ({ db, signal }) => acquirePodCollectionSubscription(db, subscribe, signal),
}
