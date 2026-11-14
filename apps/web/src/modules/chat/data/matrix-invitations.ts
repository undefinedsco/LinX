import type { SolidDatabase } from '@undefineds.co/models'
import { createMatrixClient, type MatrixClient, type MatrixClientEvent, type MatrixSyncResponse } from '@linx/agent-runtime/matrix-client'
import { createMatrixInterfaceFetch, normalizeMatrixPodRoot } from '@/lib/matrix/pod-interface-access'
import type { MatrixInterfaceAccess } from '@/lib/matrix/pod-interface-access'

/**
 * Invitations discovered through the caller's own Matrix service.
 *
 * A shared room may live on the inviter's storage. The storage root is accepted
 * only from the backend's explicit verified binding event; it is never derived
 * from the room id, inviter WebID, or a caller-provided URL.
 */
export interface MatrixRoomInvitation {
  roomId: string
  name: string | null
  inviterWebId: string | null
  /** Registered canonical POD ROOT (X-Xpod-Pod-Url), never the room subpath. */
  storageBinding: string | null
  /** Canonical room container supplied by the backend, for display/read routing. */
  roomContainer: string | null
  /** Canonical owner chat IRI from the backend binding (never parsed locally). */
  chatIri: string | null
  /** Canonical owner thread IRI from the backend binding. */
  threadIri: string | null
  /**
   * Provenance record: the binding came from the caller's own authenticated
   * service response event, and that event explicitly marks it validated.
   * A caller-constructed boolean is never accepted as authority on its own.
   */
  bindingSource: 'backend_event' | null
  /** Backend's own validation marker for the binding (server-side registration). */
  backendVerified: boolean
}

const STORAGE_BINDING_EVENT = 'co.undefineds.matrix.storage_binding'

export const MATRIX_INVITATION_CONTRACT = {
  contract: 'linx.matrix.shared_room.invite/v1',
  event: STORAGE_BINDING_EVENT,
  storage: 'content.storage (registered canonical Pod root, X-Xpod-Pod-Url)',
  roomContainer: 'content.room_container (canonical room container; not the Pod root)',
  chat: 'content.chat (canonical owner chat IRI)',
  thread: 'content.thread (canonical owner thread IRI)',
  verified: 'content.verified === true, set only by the caller\'s own Matrix service',
} as const

export function readMatrixInvitations(sync: MatrixSyncResponse): MatrixRoomInvitation[] {
  const invites = (sync.rooms as { invite?: Record<string, { invite_state?: { events?: MatrixClientEvent[] } }> }).invite ?? {}
  return Object.entries(invites).map(([roomId, room]) => {
    const events = room.invite_state?.events ?? []
    const membership = events.find((event) => event.type === 'm.room.member' && event.content?.membership === 'invite')
    const name = events.find((event) => event.type === 'm.room.name')?.content?.name
    const binding = events.find((event) => event.type === STORAGE_BINDING_EVENT)
    const rawBinding = binding?.content?.storage
    const storageBinding = typeof rawBinding === 'string' ? normalizeMatrixPodRoot(rawBinding) : null
    const rawRoomContainer = binding?.content?.room_container
    const roomContainer = typeof rawRoomContainer === 'string'
      ? normalizeMatrixPodRoot(rawRoomContainer)
      : null
    const chatIri = normalizeOwnerIri(binding?.content?.chat)
    const threadIri = normalizeOwnerIri(binding?.content?.thread)
    return {
      roomId,
      name: typeof name === 'string' && name.trim() ? name.trim() : null,
      inviterWebId: typeof membership?.state_key === 'string' && membership.state_key.startsWith('http')
        ? membership.state_key
        : null,
      storageBinding,
      roomContainer,
      chatIri,
      threadIri,
      bindingSource: storageBinding ? 'backend_event' : null,
      backendVerified: storageBinding !== null && binding?.content?.verified === true,
    }
  })
}

/** A binding is usable only when it came from the caller service and the backend marked it verified. */
export function isInvitationBindingUsable(invitation: MatrixRoomInvitation): boolean {
  return invitation.bindingSource === 'backend_event'
    && invitation.backendVerified === true
    && Boolean(invitation.storageBinding)
    && Boolean(invitation.chatIri)
    && Boolean(invitation.threadIri)
}

function normalizeOwnerIri(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch {
    return null
  }
}

/**
 * Explicit user acceptance. Joins with the backend-verified storage binding as
 * `X-Xpod-Pod-Url`; refuses when the binding is absent or foreign. The caller's
 * `sk` still only goes to their own Matrix service origin.
 */
export async function acceptMatrixInvitation(input: {
  db: SolidDatabase
  access: MatrixInterfaceAccess
  invitation: MatrixRoomInvitation
  fetchImpl?: typeof fetch
}): Promise<{ roomId: string; storageBinding: string }> {
  const credential = input.access.get()
  if (!credential) {
    throw new Error('请先授权当前空间的群聊访问。')
  }
  if (!isInvitationBindingUsable(input.invitation) || !input.invitation.storageBinding) {
    throw new Error('这个邀请还没有服务端验证的共享空间信息，暂时不能加入。')
  }
  // The Matrix service origin is the caller's own credential authority, not
  // the storage Pod origin; only the Pod root travels as selection data.
  const client = createMatrixClient({
    baseUrl: credential.origin,
    fetch: createMatrixInterfaceFetch({
      baseUrl: credential.origin,
      credential,
      targetPodUrl: input.invitation.storageBinding,
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    }),
  })
  const joined = await client.joinRoomById(input.invitation.roomId)
  return { roomId: joined.room_id, storageBinding: input.invitation.storageBinding }
}

/** Read invitations from the caller's own service; no join happens here. */
export async function loadMatrixInvitations(input: {
  db?: SolidDatabase
  access: MatrixInterfaceAccess
  client?: Pick<MatrixClient, 'sync'>
  fetchImpl?: typeof fetch
}): Promise<MatrixRoomInvitation[]> {
  const credential = input.access.get()
  if (!credential) {
    throw new Error('请先授权当前空间的群聊访问。')
  }
  const client = input.client ?? createMatrixClient({
    baseUrl: credential.origin,
    fetch: createMatrixInterfaceFetch({
      baseUrl: credential.origin,
      credential,
      targetPodUrl: credential.podUrl,
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    }),
  })
  // Invitations are taken only from the caller's own authenticated service
  // response. The storage origin may legitimately differ (api.* vs pods.*);
  // routing authority is the backend-verified binding, not host equality.
  const sync = await client.sync({ timeout: 0 })
  return readMatrixInvitations(sync)
}
