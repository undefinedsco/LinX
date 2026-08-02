import { usePodCollectionSubscription } from '@/lib/data/use-pod-collection-subscription'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import type { MicroAppId } from './micro-app-registry'

type SubscribeToPod = () => Promise<() => void | Promise<void>>

const subscribeByModule: Partial<Record<MicroAppId, SubscribeToPod>> = {
  chat: () => import('@/modules/chat/collections').then(({ chatOps }) => chatOps.subscribeToPod()),
  contacts: () => import('@/modules/contacts/data/collections').then(({ contactOps }) => contactOps.subscribeToPod()),
  favorites: () => import('@/modules/favorites/collections').then(({ favoriteOps }) => favoriteOps.subscribeToPod()),
  files: () => import('@/modules/files/collections').then(({ filesOps }) => filesOps.subscribeToPod()),
  inbox: () => import('@/modules/inbox/collections').then(({ inboxOps }) => inboxOps.subscribeToPod()),
}

export function useVisibleModuleSubscription(microAppId: MicroAppId): void {
  const { db } = useSolidDatabase()
  const subscribeToPod = subscribeByModule[microAppId]
  usePodCollectionSubscription(!!db && !!subscribeToPod, db, subscribeToPod ?? noopSubscribe)
}

async function noopSubscribe(): Promise<() => void> {
  return () => undefined
}
