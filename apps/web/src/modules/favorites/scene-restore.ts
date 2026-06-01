import type { FavoriteRow } from '@undefineds.co/models'
import type { MicroAppId } from '@/modules/layout/micro-app-registry'

interface FavoriteSnapshotMeta {
  chatId?: string
  threadId?: string
  messageId?: string
  contactId?: string
  fileId?: string
  treeNodeId?: string
}

export interface FavoriteSceneTarget {
  microAppId: MicroAppId
  chatId?: string | null
  threadId?: string | null
  messageId?: string | null
  contactId?: string | null
  fileId?: string | null
  treeNodeId?: string | null
}

function parseSnapshotMeta(raw?: string | null): FavoriteSnapshotMeta | null {
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as FavoriteSnapshotMeta
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function parseChatTargetUri(target?: string | null): {
  chatId?: string | null
  threadId?: string | null
  messageId?: string | null
} {
  if (!target) return {}

  const threadMatch = target.match(/\/\.data\/chat\/([^/]+)\/index\.ttl#(.+)$/)
  if (threadMatch) {
    const [, chatId, fragment] = threadMatch
    return {
      chatId,
      threadId: fragment === 'this' ? null : fragment,
    }
  }

  const messageMatch = target.match(/\/\.data\/chat\/([^/]+)\/\d{4}\/\d{2}\/\d{2}\/messages\.ttl#(.+)$/)
  if (messageMatch) {
    const [, chatId, messageId] = messageMatch
    return {
      chatId,
      messageId,
    }
  }

  return {}
}

function legacySourceId(favorite: FavoriteRow): string | null {
  const record = favorite as FavoriteRow & { sourceId?: string | null }
  return record.sourceId ?? null
}

function resolveChatScene(favorite: FavoriteRow, meta: FavoriteSnapshotMeta | null): FavoriteSceneTarget {
  const uriTarget = parseChatTargetUri(favorite.target)

  return {
    microAppId: 'chat',
    chatId: meta?.chatId ?? uriTarget.chatId ?? legacySourceId(favorite),
    threadId: meta?.threadId ?? uriTarget.threadId ?? null,
    messageId: meta?.messageId ?? uriTarget.messageId ?? null,
  }
}

function resolveThreadScene(favorite: FavoriteRow, meta: FavoriteSnapshotMeta | null): FavoriteSceneTarget {
  const uriTarget = parseChatTargetUri(favorite.target)

  return {
    microAppId: 'chat',
    chatId: meta?.chatId ?? uriTarget.chatId ?? null,
    threadId: meta?.threadId ?? uriTarget.threadId ?? legacySourceId(favorite),
    messageId: meta?.messageId ?? null,
  }
}

function resolveMessageScene(favorite: FavoriteRow, meta: FavoriteSnapshotMeta | null): FavoriteSceneTarget {
  const uriTarget = parseChatTargetUri(favorite.target)

  return {
    microAppId: 'chat',
    chatId: meta?.chatId ?? uriTarget.chatId ?? null,
    threadId: meta?.threadId ?? null,
    messageId: meta?.messageId ?? uriTarget.messageId ?? legacySourceId(favorite),
  }
}

function resolveContactScene(favorite: FavoriteRow, meta: FavoriteSnapshotMeta | null): FavoriteSceneTarget {
  return {
    microAppId: 'contacts',
    contactId: meta?.contactId ?? legacySourceId(favorite) ?? favorite.target ?? null,
  }
}

function resolveFileScene(favorite: FavoriteRow, meta: FavoriteSnapshotMeta | null): FavoriteSceneTarget {
  return {
    microAppId: 'files',
    fileId: meta?.fileId ?? favorite.target ?? legacySourceId(favorite),
    treeNodeId: meta?.treeNodeId ?? null,
  }
}

export function resolveFavoriteScene(favorite: FavoriteRow): FavoriteSceneTarget | null {
  const meta = parseSnapshotMeta(favorite.snapshotMeta)

  switch (favorite.sourceModule) {
    case 'chat':
      return resolveChatScene(favorite, meta)
    case 'thread':
      return resolveThreadScene(favorite, meta)
    case 'messages':
      return resolveMessageScene(favorite, meta)
    case 'contacts':
      return resolveContactScene(favorite, meta)
    case 'files':
      return resolveFileScene(favorite, meta)
    default: {
      const uriTarget = parseChatTargetUri(favorite.target)
      if (uriTarget.chatId || uriTarget.threadId || uriTarget.messageId) {
        return {
          microAppId: 'chat',
          chatId: uriTarget.chatId ?? null,
          threadId: uriTarget.threadId ?? null,
          messageId: uriTarget.messageId ?? null,
        }
      }

      const legacySource = legacySourceId(favorite)
      if (legacySource) {
        return {
          microAppId: 'chat',
          chatId: legacySource,
        }
      }

      return null
    }
  }
}
