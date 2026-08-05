import { useEffect } from 'react'
import {
  createCollectionSubscriptionLease,
  type CollectionSubscriptionLease,
  type CollectionSubscriptionRelease,
} from '@linx/stores/collection-subscription-lease'

type SubscribeToPod = () => Promise<CollectionSubscriptionRelease>

const leases = new WeakMap<SubscribeToPod, CollectionSubscriptionLease<object>>()

// Dev-only budget guard: with xpod multiplex notifications many logical
// subscriptions share one WebSocket, but against servers without the
// descriptor each connect pins a physical channel (SSE/WebSocket), so a
// high watermark here is a signal to inspect actual connections.
const LOGICAL_SUBSCRIPTION_BUDGET = 12
let activeLogicalSubscriptions = 0

function trackLogicalSubscription<T extends CollectionSubscriptionRelease>(connect: () => Promise<T>): () => Promise<T> {
  return async () => {
    activeLogicalSubscriptions += 1
    if (import.meta.env.DEV && activeLogicalSubscriptions > LOGICAL_SUBSCRIPTION_BUDGET) {
      console.warn(
        `[PodCollection] ${activeLogicalSubscriptions} logical Pod subscriptions exceed budget ${LOGICAL_SUBSCRIPTION_BUDGET}; ` +
        'verify physical notification channels stay multiplexed',
      )
    }
    let released = false
    try {
      const release = await connect()
      return (async () => {
        if (!released) {
          released = true
          activeLogicalSubscriptions -= 1
        }
        await release()
      }) as T
    } catch (error) {
      released = true
      activeLogicalSubscriptions -= 1
      throw error
    }
  }
}

function leaseFor(subscribeToPod: SubscribeToPod): CollectionSubscriptionLease<object> {
  let lease = leases.get(subscribeToPod)
  if (!lease) {
    lease = createCollectionSubscriptionLease(trackLogicalSubscription(() => subscribeToPod()))
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
