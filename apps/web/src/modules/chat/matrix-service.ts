import {
  appendChatReconcilerMetadata,
  reconcileChatAppend,
  type ChatReconcilerMetadata,
} from '@linx/agent-runtime/chat-reconciler'
import {
  createMatrixClient,
  matrixChatResourceIdFromRoomId,
  matrixServerNameFromBaseUrl,
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

export interface MatrixAuthOptions {
  authFetch: typeof fetch
}

export interface CreateMatrixGroupRoomInput extends MatrixAuthOptions {
  db: SolidDatabase
  name: string
  topic?: string
  participants: string[]
  ownerRef?: string
}

export interface MatrixGroupRoomResult {
  roomId: string
  chatId: string
  chatUri: string
  threadId: string
  threadUri: string
}

export interface MatrixThreadLike {
  id: string
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
  authFetch: typeof fetch
  randomId?: () => string
}): MatrixClient {
  const baseUrl = resolveMatrixApiBaseUrl(input.db)
  if (!baseUrl) {
    throw new Error('无法解析当前空间地址，不能连接 Matrix 群聊服务。')
  }
  return createMatrixClient({
    baseUrl,
    fetch: input.authFetch,
    ...(input.randomId ? { randomId: input.randomId } : {}),
  })
}

export async function createMatrixGroupRoom(input: CreateMatrixGroupRoomInput): Promise<MatrixGroupRoomResult> {
  const baseUrl = resolveMatrixApiBaseUrl(input.db)
  if (!baseUrl) {
    throw new Error('无法解析当前空间地址，不能创建 Matrix 群聊。')
  }
  const serverName = matrixServerNameFromBaseUrl(baseUrl)
  const invite = normalizeMatrixInvitees(input.participants, input.ownerRef, serverName)
  const client = createMatrixClient({
    baseUrl,
    fetch: input.authFetch,
  })
  const room = await client.createRoom({
    visibility: 'private',
    name: input.name,
    ...(input.topic ? { topic: input.topic } : {}),
    invite,
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
  return {
    roomId: room.room_id,
    chatId,
    chatUri,
    threadId,
    threadUri,
  }
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
  const client = createPodMatrixClient({
    db: input.db,
    authFetch: input.authFetch,
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

function normalizeMatrixInvitees(participants: string[], ownerRef: string | undefined, serverName: string): string[] {
  return Array.from(new Set(
    participants
      .filter((participant) => participant && participant !== ownerRef)
      .map((participant) => participant.startsWith('@')
        ? participant
        : matrixUserIdFromWebId(participant, serverName)),
  ))
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
