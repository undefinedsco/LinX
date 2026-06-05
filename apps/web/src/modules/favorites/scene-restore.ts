import { extractChatTargetRef, type FavoriteRow } from '@undefineds.co/models'
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

function resolveChatScene(favorite: FavoriteRow, meta: FavoriteSnapshotMeta | null): FavoriteSceneTarget {
  const uriTarget = extractChatTargetRef(favorite.target)

  return {
    microAppId: 'chat',
    chatId: meta?.chatId ?? uriTarget.chatId ?? null,
    threadId: meta?.threadId ?? uriTarget.threadId ?? null,
    messageId: meta?.messageId ?? uriTarget.messageId ?? null,
  }
}

function resolveThreadScene(favorite: FavoriteRow, meta: FavoriteSnapshotMeta | null): FavoriteSceneTarget {
  const uriTarget = extractChatTargetRef(favorite.target)

  return {
    microAppId: 'chat',
    chatId: meta?.chatId ?? uriTarget.chatId ?? null,
    threadId: meta?.threadId ?? uriTarget.threadId ?? null,
    messageId: meta?.messageId ?? null,
  }
}

function resolveMessageScene(favorite: FavoriteRow, meta: FavoriteSnapshotMeta | null): FavoriteSceneTarget {
  const uriTarget = extractChatTargetRef(favorite.target)

  return {
    microAppId: 'chat',
    chatId: meta?.chatId ?? uriTarget.chatId ?? null,
    threadId: meta?.threadId ?? null,
    messageId: meta?.messageId ?? uriTarget.messageId ?? null,
  }
}

function resolveContactScene(favorite: FavoriteRow, meta: FavoriteSnapshotMeta | null): FavoriteSceneTarget {
  return {
    microAppId: 'contacts',
    contactId: meta?.contactId ?? favorite.target ?? null,
  }
}

function resolveFileScene(favorite: FavoriteRow, meta: FavoriteSnapshotMeta | null): FavoriteSceneTarget {
  return {
    microAppId: 'files',
    fileId: meta?.fileId ?? favorite.target,
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
      const uriTarget = extractChatTargetRef(favorite.target)
      if (uriTarget.chatId || uriTarget.threadId || uriTarget.messageId) {
        return {
          microAppId: 'chat',
          chatId: uriTarget.chatId ?? null,
          threadId: uriTarget.threadId ?? null,
          messageId: uriTarget.messageId ?? null,
        }
      }

      return null
    }
  }
}
