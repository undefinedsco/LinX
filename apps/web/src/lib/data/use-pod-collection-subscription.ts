import { useEffect } from 'react'
import {
  createCollectionSubscriptionLease,
  type CollectionSubscriptionLease,
  type CollectionSubscriptionRelease,
} from '@linx/stores/collection-subscription-lease'

type SubscribeToPod = () => Promise<CollectionSubscriptionRelease>

const leases = new WeakMap<SubscribeToPod, CollectionSubscriptionLease<object>>()

function leaseFor(subscribeToPod: SubscribeToPod): CollectionSubscriptionLease<object> {
  let lease = leases.get(subscribeToPod)
  if (!lease) {
    lease = createCollectionSubscriptionLease(() => subscribeToPod())
    leases.set(subscribeToPod, lease)
  }
  return lease
}

export function usePodCollectionSubscription(
  enabled: boolean,
  identity: object | null | undefined,
  subscribeToPod: SubscribeToPod,
): void {
  useEffect(() => {
    if (!enabled || !identity) return

    let active = true
    let release: CollectionSubscriptionRelease | undefined
    void leaseFor(subscribeToPod).acquire(identity).then((nextRelease) => {
      if (!active) {
        void nextRelease()
        return
      }
      release = nextRelease
    }).catch((error) => {
      console.warn('[PodCollection] Failed to acquire visible subscription:', error)
    })

    return () => {
      active = false
      void release?.()
    }
  }, [enabled, identity, subscribeToPod])
}
