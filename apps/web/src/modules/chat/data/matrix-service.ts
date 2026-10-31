import {
  appendChatReconcilerMetadata,
  reconcileChatAppend,
  type ChatReconcilerMetadata,
} from '@linx/agent-runtime/chat-reconciler'
import {
  createMatrixClient,
  MatrixClientError,
  matrixChatResourceIdFromRoomId,
  matrixThreadResourceIdFromRoomId,
  matrixUserIdFromWebId,
  type MatrixClient,
} from '@linx/agent-runtime/matrix-client'
import {
  chatResource,
  threadResource,
  type ChatRow,
  type SolidDatabase,
  type ThreadRow,
} from '@undefineds.co/models'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import {
  createMatrixInterfaceFetch,
  MatrixInterfaceAuthorizationRequiredError,
  MatrixInterfaceScopeError,
  normalizeMatrixPodRoot,
  type MatrixInterfaceAccess,
  type MatrixInterfaceCredential,
} from '@/lib/matrix/pod-interface-access'
import {
  grantMatrixRoomAccess,
  matrixRoomContainerUri,
  validateMatrixInvitees,
  type MatrixRoomGrantResult,
} from './matrix-room-access'

export interface MatrixAuthOptions {
  /** Browser-owned Pod interface credential, scoped to the Pod origin. */
  access: MatrixInterfaceAccess
}

export interface CreateMatrixGroupRoomInput extends MatrixAuthOptions {
  db: SolidDatabase
  name: string
  topic?: string
  participants: string[]
  ownerRef?: string
  /** Test seam; production resolves the owner's DPoP fetch from the DB dialect. */
  grantRoomAccess?: (input: {
    roomContainerUri: string
    participants: string[]
    ownerWebId: string
  }) => Promise<MatrixRoomGrantResult>
}

export interface MatrixGroupRoomResult {
  roomId: string
  chatId: string
  chatUri: string
  threadId: string
  threadUri: string
  /** Canonical room container the owner granted to invitees (path from ORM URI). */
  roomContainerUri: string
}

export interface MatrixThreadLike {
  id: string
  parent?: string | null
  chat?: string | null
  scope?: string | null
  metadata?: Record<string, unknown>
}

export interface SendMatrixThreadMessageInput extends MatrixAuthOptions {
  db: SolidDatabase
  webId: string
  thread: MatrixThreadLike
  body: string
  txnId?: string
}

export interface SendMatrixThreadMessageResult {
  roomId: string
  eventId: string
  reconciler: ChatReconcilerMetadata
}

export function createPodMatrixClient(input: {
  db: SolidDatabase
  credential: MatrixInterfaceCredential
  /** Verified shared-room storage root; must stay on the pinned service origin. */
  targetPodUrl?: string
  fetchImpl?: typeof fetch
  randomId?: () => string
}): MatrixClient {
  const baseUrl = resolveMatrixApiBaseUrl(input.db)
  if (!baseUrl) {
    throw new Error('无法解析当前空间地址，不能连接 Matrix 群聊服务。')
  }
  return createMatrixClient({
    baseUrl,
    // Only this origin ever receives the credential; the browser session's
    // DPoP transport and cookies are not forwarded to Matrix routes.
    fetch: createMatrixInterfaceFetch({
      baseUrl,
      credential: input.credential,
      // The trusted current-Pod root, not a host alias and not caller input.
      targetPodUrl: input.targetPodUrl ?? input.credential.podUrl,
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    }),
    ...(input.randomId ? { randomId: input.randomId } : {}),
  })
}

/**
 * Canonical Matrix server name from the authenticated account's own MXID
 * (`@user:server`). The API host is not assumed to be the service identity.
 *
 * The server part is the whole authority after the localpart delimiter, not
 * the text after the last colon: an authority legitimately carries a
 * non-default port (`localhost:5739`, `pod.local:8443`) or a bracketed IPv6
 * literal (`[::1]`, `[2001:db8::1]:8448`). Splitting on the last colon would
 * reduce those to a bare port and invite a Matrix user on a different server.
 */
export function matrixServerNameFromUserId(userId: string): string {
  if (typeof userId !== 'string' || !userId) {
    throw new Error('群聊服务返回了无效的账号标识，无法确认所在服务器。')
  }
  const separator = userId.indexOf(':')
  if (!userId.startsWith('@') || separator <= 1 || separator === userId.length - 1) {
    throw new Error('群聊服务返回了无效的账号标识，无法确认所在服务器。')
  }
  return userId.slice(separator + 1)
}

function requireMatrixCredential(
  input: MatrixAuthOptions,
  db: SolidDatabase,
  webId: string,
): MatrixInterfaceCredential {
  const baseUrl = resolveMatrixApiBaseUrl(db)
  if (!baseUrl) {
    throw new Error('无法解析当前空间地址，不能连接 Matrix 群聊服务。')
  }
  const credential = input.access.get()
  if (!credential) {
    throw new MatrixInterfaceAuthorizationRequiredError(new URL(baseUrl).origin)
  }
  if ((webId && credential.webId !== webId) || credential.origin !== new URL(baseUrl).origin) {
    throw new MatrixInterfaceScopeError('当前账号或空间已变化，请重新授权 Matrix 群聊。')
  }
  const currentPod = normalizeMatrixPodRoot(resolveCurrentPodBaseUrl(db))
  if (!currentPod || credential.podUrl !== currentPod) {
    throw new MatrixInterfaceScopeError('当前选择的空间已变化，请重新授权 Matrix 群聊。')
  }
  return credential
}

export async function createMatrixGroupRoom(input: CreateMatrixGroupRoomInput): Promise<MatrixGroupRoomResult> {
  const baseUrl = resolveMatrixApiBaseUrl(input.db)
  if (!baseUrl) {
    throw new Error('无法解析当前空间地址，不能创建 Matrix 群聊。')
  }
  // Validate every invitee before creating a room or granting anything: one
  // invalid full WebID must not produce a partial invite.
  const validatedWebIds = validateMatrixInvitees(input.participants, input.ownerRef)
  const credential = requireMatrixCredential(input, input.db, input.ownerRef ?? '')
  const client = createPodMatrixClient({ db: input.db, credential })
  // The canonical server name is the service's own identity, not the API host.
  const whoami = await client.whoami()
  const serverName = matrixServerNameFromUserId(whoami.user_id)
  // Canonical MXID: @u_<sha256(full WebID)>:<service authority from whoami>.
  const invite = await Promise.all(
    validatedWebIds.map((webId) => matrixUserIdFromWebId(webId, serverName)),
  )
  // Private room WITHOUT invites: access is granted on the canonical room
  // container first, then the Matrix invite is sent. The server never grants
  // Solid ACL from a Matrix invitation.
  const room = await client.createRoom({
    visibility: 'private',
    name: input.name,
    ...(input.topic ? { topic: input.topic } : {}),
    preset: 'private_chat',
    is_direct: false,
    creation_content: {
      'm.federate': false,
    },
  })
  const chatId = await matrixChatResourceIdFromRoomId(room.room_id)
  const threadId = await matrixThreadResourceIdFromRoomId(room.room_id)
  const chatUri = input.db.resolveRowIri(chatResource as any, { id: chatId })
  const threadUri = input.db.resolveRowIri(threadResource as any, { id: threadId })
  if (!chatUri || !threadUri) {
    throw new Error('Matrix 群聊已创建，但无法解析对应的 Pod Chat/Thread 地址。')
  }
  const roomContainerUri = matrixRoomContainerUri(chatUri)
  const ownerWebId = input.ownerRef
  if (ownerWebId && invite.length > 0) {
    const grant = input.grantRoomAccess
      ?? ((grantInput) => grantMatrixRoomAccess({
        db: input.db,
        authFetch: resolveOwnerAuthFetch(input.db),
        ownerWebId: grantInput.ownerWebId,
        participants: grantInput.participants,
        chatUri,
      }))
    await grant({
      roomContainerUri,
      participants: validatedWebIds,
      ownerWebId,
    })
    // Pair each canonical MXID with its original full WebID so the server can
    // register the cross-Pod room reference (MXID alone never registers one).
    for (const [index, invitee] of invite.entries()) {
      await client.inviteUser(room.room_id, invitee, { targetWebID: validatedWebIds[index] })
    }
  }
  return {
    roomId: room.room_id,
    chatId,
    chatUri,
    threadId,
    threadUri,
    roomContainerUri,
  }
}

function resolveOwnerAuthFetch(db: SolidDatabase): typeof fetch {
  const authFetch = (db as any)?.getDialect?.()?.getAuthenticatedFetch?.()
  if (typeof authFetch !== 'function') {
    throw new Error('当前登录无法写入群聊空间的访问规则。')
  }
  return authFetch.bind((db as any).getDialect())
}

export async function loadMatrixChatRow(db: SolidDatabase, chatId: string): Promise<ChatRow | null> {
  return await db.findById(chatResource as any, chatId) as ChatRow | null
}

export async function loadMatrixThreadRow(db: SolidDatabase, threadId: string): Promise<ThreadRow | null> {
  return await db.findById(threadResource as any, threadId) as ThreadRow | null
}

export function readMatrixRoomId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null
  }
  const value = (metadata as Record<string, unknown>).roomId
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function readMatrixChatId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null
  }
  const value = (metadata as Record<string, unknown>).chat_id
  return typeof value === 'string' && value.length > 0 ? value : null
}

function resolveMatrixChatUri(
  db: SolidDatabase,
  thread: MatrixThreadLike,
  chatId: string | undefined,
): string | undefined {
  if (thread.parent && isAbsoluteIri(thread.parent)) {
    return thread.parent
  }
  if (thread.chat && isAbsoluteIri(thread.chat)) {
    return thread.chat
  }
  if (chatId) {
    const chatUri = db.resolveRowIri(chatResource as any, { id: chatId })
    if (!chatUri) {
      throw new Error(`无法解析 Matrix 群聊对应的 Pod Chat 地址：${chatId}`)
    }
    return chatUri
  }
  return undefined
}

function resolveMatrixThreadUri(db: SolidDatabase, thread: MatrixThreadLike): string {
  if (thread.id && isAbsoluteIri(thread.id)) {
    return thread.id
  }
  const threadUri = db.resolveRowIri(threadResource as any, { id: thread.id })
  if (!threadUri) {
    throw new Error(`无法解析 Matrix 群聊对应的 Pod Thread 地址：${thread.id}`)
  }
  return threadUri
}

function isAbsoluteIri(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value)
}

export async function sendMatrixThreadMessage(
  input: SendMatrixThreadMessageInput,
): Promise<SendMatrixThreadMessageResult | null> {
  const roomId = readMatrixRoomId(input.thread.metadata)
  if (!roomId) {
    return null
  }
  const chatId = readMatrixChatId(input.thread.metadata) ?? undefined
  const chatUri = resolveMatrixChatUri(input.db, input.thread, chatId)
  const threadUri = resolveMatrixThreadUri(input.db, input.thread)
  const { summary } = reconcileChatAppend({
    ...(chatUri ? { chat: chatUri } : {}),
    thread: threadUri,
    resource: roomId,
    role: 'user',
    content: input.body,
    actor: { id: input.webId, role: 'user' },
    source: 'matrix',
    policy: 'open_group',
    createdAt: new Date(),
    randomId: input.txnId ?? roomId,
  })
  const metadata = appendChatReconcilerMetadata({ protocol: 'matrix' }, summary)
  const credential = requireMatrixCredential(input, input.db, input.webId)
  const client = createPodMatrixClient({
    db: input.db,
    credential,
  })
  const response = await client.sendMessage(roomId, input.body, {
    ...(input.txnId ? { txnId: input.txnId } : {}),
    content: {
      'co.undefineds.linx': {
        chat: chatUri ?? chatId,
        thread: threadUri,
        reconciler: metadata.reconciler,
      },
    },
  })
  return {
    roomId,
    eventId: response.event_id,
    reconciler: metadata.reconciler as ChatReconcilerMetadata,
  }
}

function resolveMatrixApiBaseUrl(db: SolidDatabase): string | null {
  const podBaseUrl = resolveCurrentPodBaseUrl(db)
  if (!podBaseUrl) {
    return null
  }
  try {
    return new URL(podBaseUrl).origin
  } catch {
    return podBaseUrl.replace(/\/+$/, '')
  }
}

/**
 * A Matrix failure already worded for the person. The shared error formatter must
 * not replace it (its internal-diagnostic filter drops words like "Pod"), and it
 * must never be interpreted as an expired Solid login.
 */
export class MatrixUserFacingError extends Error {
  readonly code = 'matrix_user_facing_error'

  constructor(message: string) {
    super(message)
    this.name = 'MatrixUserFacingError'
  }
}

const SAFE_MATRIX_REASON_LIMIT = 160

export function isMatrixUserFacingError(error: unknown): error is MatrixUserFacingError {
  return error instanceof MatrixUserFacingError
}

/**
 * Matrix failures belong to the group-chat operation, not to the Solid login.
 * Show the server's own refusal when it is safe, and never turn a 403 into an
 * expired-login state.
 */
export function formatMatrixErrorForUser(error: unknown): string | null {
  if (error instanceof MatrixUserFacingError) {
    return error.message
  }
  if (error instanceof MatrixInterfaceAuthorizationRequiredError) {
    return error.message
  }
  if (error instanceof MatrixInterfaceScopeError) {
    return error.message
  }
  if (!(error instanceof MatrixClientError)) {
    return null
  }
  const reason = safeMatrixReason(error.message)
  if (error.status === 401) {
    return '群聊授权已失效，请重新授权后再试。'
  }
  if (error.status === 403) {
    return reason
      ? `群聊操作没有完成：${reason}`
      : '当前空间没有允许这次群聊操作。'
  }
  if (error.status === 404) {
    return reason ? `群聊操作没有完成：${reason}` : '找不到这个群聊，它可能已被删除。'
  }
  if (error.status >= 500) {
    return '群聊服务暂时不可用，请稍后重试。'
  }
  return reason ? `群聊操作没有完成：${reason}` : null
}

function safeMatrixReason(value: string): string | null {
  const reason = value.trim()
  if (!reason || reason.length > SAFE_MATRIX_REASON_LIMIT) return null
  if (/[\u0000-\u001f\u007f]/.test(reason)) return null
  if (/https?:\/\/|bearer\s|sk-|token|secret|password|client[_-]?id|client[_-]?secret/i.test(reason)) return null
  if (/\bat\s+\S+\(|\/Users\/|\.tsx?:\d+/.test(reason)) return null
  return reason
}
