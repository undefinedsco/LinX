import type { ThreadItem, ThreadMetadata } from '@/lib/vendor/xpod-chatkit'

/**
 * Ephemeral ChatKit state shared by store instances in the current page.
 *
 * The Solid Pod remains the only durable source of truth. This cache is keyed
 * by the active database connection and WebID so switching threads does not
 * discard data that was just loaded, while logout/account changes cannot reuse
 * another account's state.
 */
export interface LocalChatKitRuntimeCache {
  recentlyCreatedIds: Set<string>
  initializedMessageDocuments: Set<string>
  threadChatIdByThreadId: Map<string, string>
  threadMetadataByThreadId: Map<string, ThreadMetadata>
  threadRecordByThreadId: Map<string, Record<string, unknown>>
  provisionalThreadIds: Set<string>
  threadItemsByThreadId: Map<string, ThreadItem[]>
  completeThreadItemCaches: Set<string>
  locallyMutatedThreadIds: Set<string>
  completeThreadItemLoadPromises: Map<string, Promise<void>>
  messageRowIdByItemId: Map<string, string>
  threadItemsLoadedAt: Map<string, number>
  aiServiceAccessBlocked: boolean
}

const cacheByDatabase = new WeakMap<object, Map<string, LocalChatKitRuntimeCache>>()

function createRuntimeCache(): LocalChatKitRuntimeCache {
  return {
    recentlyCreatedIds: new Set(),
    initializedMessageDocuments: new Set(),
    threadChatIdByThreadId: new Map(),
    threadMetadataByThreadId: new Map(),
    threadRecordByThreadId: new Map(),
    provisionalThreadIds: new Set(),
    threadItemsByThreadId: new Map(),
    completeThreadItemCaches: new Set(),
    locallyMutatedThreadIds: new Set(),
    completeThreadItemLoadPromises: new Map(),
    messageRowIdByItemId: new Map(),
    threadItemsLoadedAt: new Map(),
    aiServiceAccessBlocked: false,
  }
}

export function getLocalChatKitRuntimeCache(
  db: object,
  webId: string,
): LocalChatKitRuntimeCache {
  let cacheByWebId = cacheByDatabase.get(db)
  if (!cacheByWebId) {
    cacheByWebId = new Map()
    cacheByDatabase.set(db, cacheByWebId)
  }

  let cache = cacheByWebId.get(webId)
  if (!cache) {
    cache = createRuntimeCache()
    cacheByWebId.set(webId, cache)
  }
  return cache
}
