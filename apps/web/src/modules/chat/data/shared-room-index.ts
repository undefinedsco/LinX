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

/**
 * The chat `metadata` column is an inline object: nested values are persisted as
 * xsd:json literals, so a nested `sharedRoom` is read back as a JSON string
 * rather than an object. Accept both shapes — the invitation flow writes the
 * object form, and a reload reads the string form — while still rejecting
 * anything that is not a complete, usable record.
 */
function readSharedRoomRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value !== 'string') return null
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

/** Dedup via existing collection state: same storage + roomId keeps one row. */
export function findSharedRoomRow(
  rows: readonly { id: string; metadata?: Record<string, unknown> | null }[],
  input: { roomId: string; storage: string },
): { id: string; metadata?: Record<string, unknown> | null } | null {
  return rows.find((row) => {
    // Same read-back shape as sharedRoomIndexFromChat: a reloaded row's nested
    // record arrives serialized, and a duplicate row would split one room in two.
    const shared = readSharedRoomRecord((row.metadata as any)?.sharedRoom)
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
  const shared = readSharedRoomRecord((chat.metadata as any)?.sharedRoom)
  if (!shared) return null
  const { roomId, storage, roomContainer, ownerChat, ownerThread } = shared
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
