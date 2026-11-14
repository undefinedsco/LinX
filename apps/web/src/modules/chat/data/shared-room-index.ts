import { chatResource } from '@undefineds.co/models'
import { chatCollection } from './collections'
import type { SharedRoomReference } from './shared-room-reference'

/**
 * Local discovery index for accepted shared rooms.
 *
 * One row per `(storage, roomId)` — the same owner room accepted twice updates
 * the existing row instead of creating a second chat. The row id comes from the
 * models layout for a locally generated UUID, not a business classification;
 * owner chat/thread identity lives only in metadata.
 */
export interface SharedRoomIndexRow {
  id: string
  roomId: string
  name: string
  storage: string
  roomContainer: string
  ownerChat: string
  ownerThread: string
}

export interface SharedRoomChatMetadata {
  protocol: 'matrix'
  sharedRoom: {
    roomId: string
    storage: string
    roomContainer: string
    ownerChat: string
    ownerThread: string
  }
}

function newDiscoveryKey(): string {
  return crypto.randomUUID()
}

function discoveryIdFor(key: string): string {
  return chatResource.buildId({ id: key })
}

/** Dedup via existing collection state: same storage + roomId keeps one row. */
export function findSharedRoomRow(
  rows: readonly { id: string; metadata?: Record<string, unknown> | null }[],
  input: { roomId: string; storage: string },
): { id: string; metadata?: Record<string, unknown> | null } | null {
  return rows.find((row) => {
    const shared = (row.metadata as any)?.sharedRoom
    return shared?.roomId === input.roomId && shared?.storage === input.storage
  }) ?? null
}

/**
 * Persist (or update) the discovery row through the single-authority
 * collection flow, waiting for the write before the caller selects it.
 */
export async function rememberSharedRoom(
  reference: SharedRoomReference,
  existingRows: readonly { id: string; metadata?: Record<string, unknown> | null }[] = [],
): Promise<SharedRoomIndexRow> {
  const existing = findSharedRoomRow(existingRows, {
    roomId: reference.roomId,
    storage: reference.storageBinding,
  })
  const now = new Date()
  const metadata: SharedRoomChatMetadata = {
    protocol: 'matrix',
    sharedRoom: {
      roomId: reference.roomId,
      storage: reference.storageBinding,
      roomContainer: reference.roomContainer,
      ownerChat: reference.chatIri,
      ownerThread: reference.threadIri,
    },
  }
  let id = existing?.id
  if (!id) {
    id = discoveryIdFor(newDiscoveryKey())
    const created = chatCollection.insert({
      id,
      title: reference.name,
      participants: [],
      metadata,
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    } as any)
    // Persistence completes before the caller selects the chat.
    await created.isPersisted.promise
  } else {
    const updated = chatCollection.update(id, (draft: any) => {
      draft.title = reference.name
      draft.metadata = metadata
      draft.updatedAt = now
      draft.lastActiveAt = now
    })
    await updated.isPersisted.promise
  }
  return {
    id,
    roomId: reference.roomId,
    name: reference.name,
    storage: reference.storageBinding,
    roomContainer: reference.roomContainer,
    ownerChat: reference.chatIri,
    ownerThread: reference.threadIri,
  }
}

export function sharedRoomIndexFromChat(chat: {
  id: string
  metadata?: Record<string, unknown> | null
}): SharedRoomIndexRow | null {
  const shared = (chat.metadata as any)?.sharedRoom
  if (!shared || typeof shared !== 'object') return null
  const { roomId, storage, roomContainer, ownerChat, ownerThread } = shared as Record<string, unknown>
  if (typeof roomId !== 'string' || typeof storage !== 'string' || typeof ownerChat !== 'string'
    || typeof ownerThread !== 'string' || typeof roomContainer !== 'string') return null
  return { id: chat.id, roomId, name: '', storage, roomContainer, ownerChat, ownerThread }
}

export function sharedRoomTitleFromChat(chat: {
  title?: string | null
  metadata?: Record<string, unknown> | null
}): string | null {
  return sharedRoomIndexFromChat({ id: '', metadata: chat.metadata }) ? (chat.title?.trim() || '群聊') : null
}
