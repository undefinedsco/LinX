export interface RebindablePodCollection<TKey extends string | number> {
  startSyncImmediate(): void
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
  collection.startSyncImmediate()
  const utils = requireRebindUtils(collection)

  const previousKeys = Array.from(collection.keys())
  if (previousKeys.length > 0) {
    utils.writeDelete(previousKeys)
  }

  await cancellation

  if (hasDatabase) {
    await utils.refetch({ throwOnError: true })
  }
}
