import type { SolidDatabase } from '@undefineds.co/models'
import type { Session } from '@inrupt/solid-client-authn-browser'
import { createLinxSolidDatabase } from '@/lib/data/linx-solid-database'
import type { MatrixInterfaceAccess } from '@/lib/matrix/pod-interface-access'
import { sharedRoomIndexFromChat } from './shared-room-index'
import {
  readOwnerRoomMessages,
  sendSharedRoomMessage,
  sharedRoomCollectionOptions,
  type SharedRoomReference,
} from './shared-room-reference'

/**
 * Selected-chat branch for accepted shared rooms.
 *
 * The reference in Bob's local Pod names the owner's canonical chat/thread.
 * Reads go through a room-scoped DB built on Bob's authenticated session with
 * the published ORM per-DB endpoint; writes go through Bob's own Matrix
 * service. Bob's normal collections stay on his own Pod.
 */
export interface SharedRoomRuntime {
  reference: SharedRoomReference
  loadMessages: () => Promise<unknown[]>
  send: (body: string) => Promise<{ roomId: string; eventId: string }>
}

export function sharedRoomReferenceFromChatRow(chat: {
  id: string
  metadata?: Record<string, unknown> | null
  title?: string | null
}): SharedRoomReference | null {
  const row = sharedRoomIndexFromChat(chat)
  if (!row) return null
  return {
    roomId: row.roomId,
    roomContainer: row.roomContainer,
    chatIri: row.ownerChat,
    threadIri: row.ownerThread,
    storageBinding: row.storage,
    name: chat.title?.trim() || row.name || '群聊',
  }
}

/**
 * Build the room-scoped read DB only when a shared reference is selected.
 *
 * `podUrl` MUST be the owner's registered storage root, because the ORM binds
 * row ids and resource IRIs to it; the session stays Bob's authenticated
 * `session.fetch` (his DPoP credential), and no global Pod selection changes.
 * `resourcePreparation: 'off'` prevents Bob from initializing the owner's
 * parent containers.
 */
export async function openSharedRoomRuntime(input: {
  reference: SharedRoomReference
  session: Session
  credential: NonNullable<ReturnType<MatrixInterfaceAccess['get']>>
  createDatabase?: typeof createLinxSolidDatabase
  fetchImpl?: typeof fetch
}): Promise<SharedRoomRuntime> {
  const createDatabase = input.createDatabase ?? createLinxSolidDatabase
  const roomDb: SolidDatabase = await createDatabase(input.session, {
    // Owner root, not Bob's: row identity must decode against the room Pod.
    podUrl: input.reference.storageBinding,
    resourcePreparation: 'off',
    ...sharedRoomCollectionOptions(input.reference),
  })
  return {
    reference: input.reference,
    loadMessages: async () => await readOwnerRoomMessages({ roomDb, reference: input.reference }),
    send: async (body) => await sendSharedRoomMessage({
      credential: input.credential,
      reference: input.reference,
      body,
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    }),
  }
}

export function isSharedRoomChatRow(chat: { id: string; metadata?: Record<string, unknown> | null }): boolean {
  return sharedRoomIndexFromChat(chat) !== null
}

/**
 * Single selection decision for the conversation surface: a shared-room row
 * yields the owner-room reference, everything else stays on the local path.
 */
export function sharedRoomReferenceForSelection(
  chat: { id: string; title?: string | null; metadata?: Record<string, unknown> | null } | undefined,
): SharedRoomReference | null {
  // Selection in the UI: a shared row maps to the owner reference; any other
  // row (or no selection) keeps the normal local conversation path.
  if (!chat || !isSharedRoomChatRow(chat)) return null
  return sharedRoomReferenceFromChatRow(chat)
}


