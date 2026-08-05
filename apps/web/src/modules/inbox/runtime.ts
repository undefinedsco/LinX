import { acquirePodCollectionSubscription } from '@/lib/data/use-pod-collection-subscription'
import type { AppletRuntime } from '@/modules/layout/applet-runtime'
import { inboxOps } from './collections'

const subscribe = () => inboxOps.subscribeToPod()

// Shared reference so the runtime activation and the global pinned
// subscription (navigation bell) resolve to the same ref-counted lease
// instead of opening duplicate collection subscriptions.
export const subscribeInboxToPod = subscribe

export const inboxRuntime: AppletRuntime = {
  activate: ({ db, signal }) => acquirePodCollectionSubscription(db, subscribe, signal),
}
