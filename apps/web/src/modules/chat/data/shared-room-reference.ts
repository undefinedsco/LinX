import {
  messageResource,
  threadResource,
  type MessageRow,
  type SolidDatabase,
} from '@undefineds.co/models'
import type { ThreadItem, ThreadMetadata } from '@/lib/vendor/xpod-chatkit'
import type { MatrixRoomInvitation } from './matrix-invitations'

/**
 * Accepted shared-room reference.
 *
 * Identity is the owner's canonical Matrix/models IRIs from the backend's
 * verified binding event. This module never invents `shared/<room>` ids or
 * `#thread` fragments.
 */
export interface SharedRoomReference {
  roomId: string
  /** Owner's canonical room container from the verified binding. */
  roomContainer: string
  /** Owner's canonical chat IRI from the verified binding. */
  chatIri: string
  /** Owner's canonical thread IRI from the verified binding. */
  threadIri: string
  /** Registered Pod root used only as the Matrix X-Xpod-Pod-Url selection. */
  storageBinding: string
  name: string
}

export function sharedRoomReferenceFromInvitation(invitation: MatrixRoomInvitation): SharedRoomReference {
  const roomContainer = normalizeRoomContainer(invitation.roomContainer)
  if (!invitation.storageBinding || !roomContainer || !invitation.chatIri || !invitation.threadIri) {
    throw new Error('这个邀请缺少共享空间信息，暂时不能打开。')
  }
  return {
    roomId: invitation.roomId,
    roomContainer,
    chatIri: invitation.chatIri,
    threadIri: invitation.threadIri,
    storageBinding: invitation.storageBinding,
    name: invitation.name ?? '群聊',
  }
}

/**
 * A room container is a container IRI (trailing slash, no fragment). A chat IRI
 * must never stand in for it, and an unverified fallback is not guessed.
 */
export function normalizeRoomContainer(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    if (url.username || url.password || url.search || url.hash) return null
    if (!url.pathname.endsWith('/') || url.pathname === '/') return null
    return url.href
  } catch {
    return null
  }
}

/**
 * Per-database collection SELECT endpoint for the owner's room. Passed to the
 * published drizzle-solid 0.3.26 `sparqlEndpoint` option when building the
 * room-scoped DB; the shared table is never mutated.
 */
export function sharedRoomCollectionOptions(reference: SharedRoomReference) {
  const container = reference.roomContainer.endsWith('/')
    ? reference.roomContainer
    : `${reference.roomContainer}/`
  return { sparqlEndpoint: `${container}-/sparql` }
}

/** Read the owner's message rows through the room-scoped DB. No local copy. */
export async function readOwnerRoomMessages(input: {
  roomDb: SolidDatabase
  reference: SharedRoomReference
}): Promise<MessageRow[]> {
  return await (input.roomDb as any)
    .select()
    .from(messageResource)
    .where({ thread: input.reference.threadIri })
    .execute() as MessageRow[]
}

function messageText(row: MessageRow): string {
  const content = row.content
  if (typeof content === 'string' && content.trim()) return content
  const rich = row.richContent
  if (rich && typeof rich === 'object') {
    const text = (rich as { text?: unknown }).text
    if (typeof text === 'string') return text
  }
  return ''
}

export interface OwnerMessageEntry {
  item: ThreadItem
  /** Canonical models Message IRI, built from the row's real id on the owner Pod. */
  uri: string
}

/**
 * Canonical Message resource IRI for a stored owner row. Uses the models
 * builder with the owner Pod root; never concatenates a fragment by hand.
 */
export function ownerMessageIri(reference: SharedRoomReference, row: MessageRow): string | null {
  try {
    return messageResource.buildIri(reference.storageBinding, { id: row.id })
  } catch {
    return null
  }
}

/** Map shared models Message rows into the existing ThreadItem timeline. */
export function ownerMessageEntries(
  rows: readonly MessageRow[],
  reference: SharedRoomReference,
): OwnerMessageEntry[] {
  return [...rows]
    .filter((row) => !row.deletedAt)
    .sort((left, right) => new Date(left.createdAt ?? 0).getTime() - new Date(right.createdAt ?? 0).getTime())
    .flatMap<OwnerMessageEntry>((row) => {
      const text = messageText(row)
      if (!text) return []
      const uri = ownerMessageIri(reference, row)
      if (!uri) return []
      const createdAt = Math.floor(new Date(row.createdAt ?? Date.now()).getTime() / 1000)
      const role = row.role === 'assistant' ? 'assistant' : row.role === 'system' ? 'system' : 'user'
      if (role === 'system') return []
      if (role === 'assistant') {
        return [{
          item: {
            id: uri,
            thread_id: reference.threadIri,
            type: 'assistant_message',
            content: [{ type: 'output_text', text }],
            status: row.status === 'in_progress' ? 'in_progress' : 'completed',
            created_at: createdAt,
          },
          uri,
        }]
      }
      return [{
        item: {
          id: uri,
          thread_id: reference.threadIri,
          type: 'user_message',
          content: [{ type: 'input_text', text }],
          created_at: createdAt,
        },
        uri,
      }]
    })
}

/** Backwards-compatible projection of the entries' items. */
export function ownerMessagesToThreadItems(
  rows: readonly MessageRow[],
  reference: SharedRoomReference,
): ThreadItem[] {
  return ownerMessageEntries(rows, reference).map((entry) => entry.item)
}

/** Stable ThreadMetadata for the surface; the identity is the owner thread IRI. */
export function ownerThreadMetadata(reference: SharedRoomReference): ThreadMetadata {
  return {
    id: reference.threadIri,
    title: reference.name,
    status: { type: 'active' },
    created_at: Math.floor(Date.now() / 1000),
    updated_at: Math.floor(Date.now() / 1000),
    metadata: { chat_id: reference.chatIri, shared_room: reference.roomId },
  }
}

/** Resolve the canonical thread resource through the room DB, no invented layout. */
export function ownerThreadResourceId(reference: SharedRoomReference, roomDb: SolidDatabase): string | null {
  const iri = roomDb.resolveRowIri?.(threadResource as any, { id: reference.threadIri })
  return typeof iri === 'string' && iri ? iri : null
}

/**
 * Send Bob's reply through Bob's own Matrix service with Bob's own credential.
 * The owner's canonical room/thread IRIs travel as content metadata; the
 * server persists the authoritative message.
 */
export async function sendSharedRoomMessage(input: {
  credential: { apiKey: string; webId: string; origin: string; podUrl: string; accountOrigin: string }
  reference: SharedRoomReference
  body: string
  txnId?: string
  fetchImpl?: typeof fetch
}): Promise<{ roomId: string; eventId: string }> {
  const { createMatrixClient } = await import('@linx/agent-runtime/matrix-client')
  const { createMatrixInterfaceFetch } = await import('@/lib/matrix/pod-interface-access')
  const client = createMatrixClient({
    baseUrl: input.credential.origin,
    fetch: createMatrixInterfaceFetch({
      baseUrl: input.credential.origin,
      credential: {
        apiKey: input.credential.apiKey,
        webId: input.credential.webId,
        accountOrigin: input.credential.accountOrigin,
        origin: input.credential.origin,
        podUrl: input.credential.podUrl,
      },
      targetPodUrl: input.reference.storageBinding,
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    }),
  })
  const response = await client.sendMessage(input.reference.roomId, input.body, {
    ...(input.txnId ? { txnId: input.txnId } : {}),
    content: {
      'co.undefineds.linx': {
        chat: input.reference.chatIri,
        thread: input.reference.threadIri,
      },
    },
  })
  return { roomId: input.reference.roomId, eventId: response.event_id }
}
