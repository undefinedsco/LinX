import { acquirePodCollectionSubscription } from '@/lib/data/use-pod-collection-subscription'
import type { MicroAppRuntime } from '@/modules/layout/micro-app-runtime'
import { favoriteOps } from './collections'

const subscribe = () => favoriteOps.subscribeToPod()

// Shared reference so cross-module consumers (for example the Files detail
// pane rendering star state) and the runtime activation resolve to the same
// ref-counted lease instead of opening duplicate subscriptions.
export const subscribeFavoritesToPod = subscribe

export const favoritesRuntime: MicroAppRuntime = {
  activate: ({ db, signal }) => acquirePodCollectionSubscription(db, subscribe, signal),
}
