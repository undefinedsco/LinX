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

function parseChatTargetUri(targetUri?: string | null): {
  chatId?: string | null
  threadId?: string | null
  messageId?: string | null
} {
  if (!targetUri) return {}

  const threadMatch = targetUri.match(/\/\.data\/chat\/([^/]+)\/index\.ttl#(.+)$/)
  if (threadMatch) {
    const [, chatId, fragment] = threadMatch
    return {
      chatId,
      threadId: fragment === 'this' ? null : fragment,
    }
  }

  const messageMatch = targetUri.match(/\/\.data\/chat\/([^/]+)\/\d{4}\/\d{2}\/\d{2}\/messages\.ttl#(.+)$/)
  if (messageMatch) {
    const [, chatId, messageId] = messageMatch
    return {
      chatId,
      messageId,
    }
  }

  return {}
}

function resolveChatScene(favorite: FavoriteRow, meta: FavoriteSnapshotMeta | null): FavoriteSceneTarget {
  const uriTarget = parseChatTargetUri(favorite.targetUri)

  return {
    microAppId: 'chat',
    chatId: meta?.chatId ?? favorite.sourceId ?? uriTarget.chatId ?? null,
    threadId: meta?.threadId ?? uriTarget.threadId ?? null,
    messageId: meta?.messageId ?? uriTarget.messageId ?? null,
  }
}

function resolveThreadScene(favorite: FavoriteRow, meta: FavoriteSnapshotMeta | null): FavoriteSceneTarget {
  const uriTarget = parseChatTargetUri(favorite.targetUri)

  return {
    microAppId: 'chat',
    chatId: meta?.chatId ?? uriTarget.chatId ?? null,
    threadId: meta?.threadId ?? favorite.sourceId ?? uriTarget.threadId ?? null,
    messageId: meta?.messageId ?? null,
  }
}

function resolveMessageScene(favorite: FavoriteRow, meta: FavoriteSnapshotMeta | null): FavoriteSceneTarget {
  const uriTarget = parseChatTargetUri(favorite.targetUri)

  return {
    microAppId: 'chat',
    chatId: meta?.chatId ?? uriTarget.chatId ?? null,
    threadId: meta?.threadId ?? null,
    messageId: meta?.messageId ?? favorite.sourceId ?? uriTarget.messageId ?? null,
  }
}

function resolveContactScene(favorite: FavoriteRow, meta: FavoriteSnapshotMeta | null): FavoriteSceneTarget {
  return {
    microAppId: 'contacts',
    contactId: meta?.contactId ?? favorite.sourceId ?? favorite.targetUri ?? null,
  }
}

function resolveFileScene(favorite: FavoriteRow, meta: FavoriteSnapshotMeta | null): FavoriteSceneTarget {
  return {
    microAppId: 'files',
    fileId: meta?.fileId ?? favorite.sourceId ?? null,
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
      const uriTarget = parseChatTargetUri(favorite.targetUri)
      if (uriTarget.chatId || uriTarget.threadId || uriTarget.messageId) {
        return {
          microAppId: 'chat',
          chatId: uriTarget.chatId ?? null,
          threadId: uriTarget.threadId ?? null,
          messageId: uriTarget.messageId ?? null,
        }
      }

      if (favorite.sourceId) {
        return {
          microAppId: 'chat',
          chatId: favorite.sourceId,
        }
      }

      return null
    }
  }
}
