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

export async function acquirePodCollectionSubscription(
  identity: object,
  subscribeToPod: SubscribeToPod,
  signal?: AbortSignal,
): Promise<CollectionSubscriptionRelease> {
  if (signal?.aborted) return () => undefined
  const releaseLease = await leaseFor(subscribeToPod).acquire(identity)
  let released = false

  const release = async () => {
    if (released) return
    released = true
    signal?.removeEventListener('abort', releaseOnAbort)
    await releaseLease()
  }
  const releaseOnAbort = () => {
    void release()
  }

  if (signal?.aborted) {
    await release()
  } else {
    signal?.addEventListener('abort', releaseOnAbort, { once: true })
  }
  return release
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
    void acquirePodCollectionSubscription(identity, subscribeToPod).then((nextRelease) => {
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
