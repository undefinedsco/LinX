import { acquirePodCollectionSubscription } from '@/lib/data/use-pod-collection-subscription'
import type { AppletRuntime } from '@/modules/layout/applet-runtime'
import { contactOps } from './data/collections'

const subscribe = () => contactOps.subscribeToPod()

// Shared reference so cross-module consumers (for example chat agent pickers)
// and the runtime activation resolve to the same ref-counted lease instead
// of opening duplicate subscriptions.
export const subscribeContactsToPod = subscribe

export const contactsRuntime: AppletRuntime = {
  activate: ({ db, signal }) => acquirePodCollectionSubscription(db, subscribe, signal),
}
