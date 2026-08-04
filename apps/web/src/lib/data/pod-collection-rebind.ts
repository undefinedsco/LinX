export interface RebindablePodCollection<TKey extends string | number> {
  isReady(): boolean
  keys(): IterableIterator<TKey>
  utils: unknown
}

interface PodCollectionRebindUtils<TKey extends string | number> {
  writeDelete(keys: TKey[]): void
  refetch(options: { throwOnError: boolean }): Promise<unknown>
}

export interface PodCollectionRebindOptions {
  cancelInFlight?: () => Promise<unknown>
}

export interface PodCollectionRebindBinding {
  collection: RebindablePodCollection<string | number>
  cancelInFlight?: () => Promise<unknown>
}

function requireRebindUtils<TKey extends string | number>(
  collection: RebindablePodCollection<TKey>,
): PodCollectionRebindUtils<TKey> {
  const utils = collection.utils as Partial<PodCollectionRebindUtils<TKey>> | null
  if (typeof utils?.writeDelete !== 'function' || typeof utils.refetch !== 'function') {
    throw new Error('Pod collection does not expose query rebind utilities.')
  }
  return utils as PodCollectionRebindUtils<TKey>
}

export async function rebindPodCollection<TKey extends string | number>(
  collection: RebindablePodCollection<TKey>,
  hasDatabase: boolean,
  options: PodCollectionRebindOptions = {},
): Promise<void> {
  const cancellation = options.cancelInFlight?.()
  const utils = requireRebindUtils(collection)

  const previousKeys = Array.from(collection.keys())
  if (previousKeys.length > 0) {
    utils.writeDelete(previousKeys)
  }

  await cancellation

  if (!hasDatabase) {
    return
  }

  if (collection.isReady()) {
    await utils.refetch({ throwOnError: true })
  }
}

export async function rebindPodCollections(
  bindings: readonly PodCollectionRebindBinding[],
  hasDatabase: boolean,
): Promise<void> {
  await Promise.all(bindings.map(({ collection, cancelInFlight }) => (
    rebindPodCollection(collection, hasDatabase, { cancelInFlight })
  )))
}
