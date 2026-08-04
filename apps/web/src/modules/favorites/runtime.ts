import { acquirePodCollectionSubscription } from '@/lib/data/use-pod-collection-subscription'
import type { MicroAppRuntime } from '@/modules/layout/micro-app-runtime'
import { favoriteOps } from './collections'

const subscribe = () => favoriteOps.subscribeToPod()

export const favoritesRuntime: MicroAppRuntime = {
  activate: ({ db, signal }) => acquirePodCollectionSubscription(db, subscribe, signal),
}
