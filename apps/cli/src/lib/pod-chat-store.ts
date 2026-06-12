import type { Session } from '@inrupt/solid-client-authn-node'
import {
  createLinxPodSyncScope,
  type LinxPodSyncResourceBindings,
  type LinxSyncOperationKind,
  type LinxSyncRunResult,
} from '@linx/agent-runtime/sync'
import {
  agentResource,
  chatRepository,
  chatResource,
  drizzle,
  eq,
  solidResources,
  messageResource,
  threadResource,
  threadRepository,
  type MessageRow,
  type SolidDatabase,
  type ThreadRow,
} from './models.js'
import { DEFAULT_LINX_CLOUD_MODEL_ID } from './default-model.js'
import { formatThreadLabel, toOpenAiMessages } from './thread-utils.js'

const DEFAULT_CHAT_ID = 'cli-default'
const DEFAULT_AGENT_ID = 'linx-cli-assistant'
const POD_WRITE_RETRY_ATTEMPTS = 2
const POD_WRITE_RETRY_DELAY_MS = 250

interface CliChatStoreRuntime {
  createDb(session: Session): SolidDatabase
  now(): Date
  randomUUID(): string
  onSyncResult?(result: LinxSyncRunResult): void
}

const cliChatSyncResults: LinxSyncRunResult[] = []
let cliChatSyncSeq = 0

function extractChatId(chatIdOrUri: string | null | undefined): string {
  return chatRepository.idFromRef(chatIdOrUri) ?? chatIdOrUri ?? DEFAULT_CHAT_ID
}

function extractThreadId(threadIdOrUri: string | null | undefined): string | undefined {
  return threadRepository.idFromRef(threadIdOrUri) ?? threadIdOrUri ?? undefined
}

export interface ThreadSummary {
  id: string
  title?: string
  workspace?: string
  updatedAt?: Date
}

export interface StoredThreadMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
}

function createDb(session: Session): SolidDatabase {
  return drizzle(session, {
    logger: false,
    disableInteropDiscovery: true,
    resourcePreparation: 'best-effort' as never,
    schema: solidResources,
  }) as unknown as SolidDatabase
}

const defaultRuntime: CliChatStoreRuntime = {
  createDb,
  now: () => new Date(),
  randomUUID: () => crypto.randomUUID(),
}

let activeRuntime: CliChatStoreRuntime = defaultRuntime

function getActiveRuntime(): CliChatStoreRuntime {
  return activeRuntime
}

async function runCliChatProjection<T>(
  input: {
    action: string
    kind: LinxSyncOperationKind
    db?: SolidDatabase
    webId?: string
    chatId?: string
    threadId?: string
    messageId?: string
    createdAt?: Date
    role?: string
  },
  project: () => T | Promise<T>,
): Promise<T> {
  const runtime = getActiveRuntime()
  const sync = createLinxPodSyncScope({
    source: 'cli-chat-store',
    target: 'pod',
    direction: 'local-to-core',
    plane: 'projection',
    authority: 'core',
    now: runtime.now,
    onResult(result) {
      cliChatSyncResults.push(result)
      runtime.onSyncResult?.(result)
    },
  })

  return await sync.run({
    action: input.action,
    operationId: nextCliChatSyncOperationId(input),
    kind: input.kind,
    description: `cli-chat-store:${input.action}`,
    subject: input.messageId ?? input.threadId ?? input.chatId,
    resourceBindings: buildCliChatSyncResourceBindings(input),
    metadata: {
      role: input.role,
    },
    task: () => withTransientPodWriteRetry(project),
  })
}

async function withTransientPodWriteRetry<T>(project: () => T | Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= POD_WRITE_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await project()
    } catch (error) {
      lastError = error
      if (attempt >= POD_WRITE_RETRY_ATTEMPTS || !isTransientPodWriteError(error)) {
        throw error
      }
      await delay(POD_WRITE_RETRY_DELAY_MS * (attempt + 1))
    }
  }
  throw lastError
}

function isTransientPodWriteError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()
  return normalized.includes('502 bad gateway')
    || normalized.includes('503 service unavailable')
    || normalized.includes('504 gateway timeout')
    || normalized.includes('temporarily unavailable')
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function nextCliChatSyncOperationId(input: { action: string; chatId?: string; threadId?: string; messageId?: string }): string {
  const subject = input.messageId ?? input.threadId ?? input.chatId ?? 'cli-chat'
  const timestamp = getActiveRuntime().now().toISOString().replace(/[:.]/g, '-')
  return `cli-chat-store:${input.action}:${subject}:${timestamp}:${++cliChatSyncSeq}`
}

function buildCliChatSyncResourceBindings(input: {
  db?: SolidDatabase
  webId?: string
  chatId?: string
  threadId?: string
  messageId?: string
  createdAt?: Date
}): LinxPodSyncResourceBindings {
  const chatUri = input.chatId
    ? (input.webId ? chatResource.buildIri(input.webId, { id: input.chatId }) : undefined)
    : undefined
  const threadUri = input.threadId && input.chatId
    ? (input.webId ? threadRepository.iriForChat(input.webId, input.chatId, input.threadId) : undefined)
    : undefined
  const messageUri = input.messageId && input.chatId && input.createdAt
    ? (input.webId ? messageResource.buildIri(input.webId, {
      id: input.messageId,
      chat: chatResource.buildIri(input.webId, { id: input.chatId }),
      ...(threadUri ? { thread: threadUri } : {}),
      createdAt: input.createdAt,
    }) : undefined)
    : undefined

  return {
    chat: input.chatId ? { uri: chatUri, local: input.chatId } : undefined,
    thread: input.threadId ? { uri: threadUri, local: input.threadId } : undefined,
    message: input.messageId ? { uri: messageUri, local: input.messageId } : undefined,
  }
}

export async function initPodData(session: Session): Promise<SolidDatabase> {
  const db = getActiveRuntime().createDb(session)

  return db
}

async function ensureCliAgent(db: SolidDatabase, webId: string): Promise<void> {
  const agentId = agentResource.buildId({ id: DEFAULT_AGENT_ID })
  const existing = await db.findById(agentResource, agentId)

  if (existing) {
    return
  }

  const now = getActiveRuntime().now()
  await runCliChatProjection({
    action: 'agent.ensure',
    kind: 'insert',
    db,
    webId,
  }, () => db.insert(agentResource).values({
    id: agentId,
    name: 'LinX CLI Assistant',
    provider: 'xpod',
    model: DEFAULT_LINX_CLOUD_MODEL_ID,
    createdAt: now,
    updatedAt: now,
  }).execute())
}

export async function getOrCreateDefaultChat(session: Session): Promise<string> {
  const db = await initPodData(session)
  const webId = session.info.webId
  if (!webId) {
    throw new Error('Missing webId in Solid session')
  }

  await ensureCliAgent(db, webId)

  const existing = await db.findById(chatResource, DEFAULT_CHAT_ID)
  if (existing) {
    return DEFAULT_CHAT_ID
  }

  const now = getActiveRuntime().now()
  await runCliChatProjection({
    action: 'chat.create',
    kind: 'insert',
    db,
    webId,
    chatId: DEFAULT_CHAT_ID,
  }, () => db.insert(chatResource).values({
    id: DEFAULT_CHAT_ID,
    title: 'LinX CLI',
    participants: [],
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now,
  }).execute())

  return DEFAULT_CHAT_ID
}

export async function listThreads(session: Session, chatId: string): Promise<ThreadSummary[]> {
  const db = await initPodData(session)
  const webId = session.info.webId
  if (!webId) {
    throw new Error('Missing webId in Solid session')
  }
  const chatUri = chatRepository.iri(webId, chatId)
  const parentCol = (threadResource as any).parent
  const rows = await db.select().from(threadResource).where(eq(parentCol, chatUri)).orderBy('updatedAt', 'desc').execute()

  return rows.map((row: any) => ({
    id: threadRepository.idFromRef(String(row.id)) ?? String(row.id),
    title: row.title || undefined,
    workspace: row.workspace || undefined,
    updatedAt: row.updatedAt ? new Date(row.updatedAt) : undefined,
  }))
}

export async function createThread(
  session: Session,
  chatId: string,
  workspace?: string,
  title?: string,
): Promise<string> {
  const db = await initPodData(session)
  const webId = session.info.webId
  if (!webId) {
    throw new Error('Missing webId in Solid session')
  }
  const threadId = getActiveRuntime().randomUUID()
  const now = getActiveRuntime().now()
  const chatUri = chatResource.buildIri(webId, { id: chatId })

  await runCliChatProjection({
    action: 'thread.create',
    kind: 'insert',
    db,
    webId,
    chatId,
    threadId,
  }, () => db.insert(threadResource).values({
    id: threadRepository.idForChat(chatUri, threadId),
    parent: chatUri,
    title: title || 'CLI Session',
    workspace: workspace || undefined,
    createdAt: now,
    updatedAt: now,
  }).execute())

  return threadId
}

export async function touchThread(session: Session, threadId: string): Promise<void> {
  const db = await initPodData(session)
  const webId = session.info.webId
  if (!webId) {
    throw new Error('Missing webId in Solid session')
  }
  const chatId = threadRepository.chatId(await loadThread(session, threadId)) ?? DEFAULT_CHAT_ID
  const threadRecordId = threadRepository.idForChat(chatId, threadId)
  await runCliChatProjection({
    action: 'thread.touch',
    kind: 'update',
    db,
    webId,
    chatId,
    threadId,
  }, () => db.updateById(threadResource, threadRecordId, { updatedAt: getActiveRuntime().now() }))
}

export async function loadMessages(session: Session, threadId: string): Promise<StoredThreadMessage[]> {
  const db = await initPodData(session)
  const createdAtCol = (messageResource as any).createdAt
  const thread = await loadThread(session, threadId)
  if (!thread) {
    return []
  }

  const chatId = threadRepository.chatId(thread)
  const rows = await db.select().from(messageResource).orderBy(createdAtCol).execute()

  return rows
    .filter((row: any) => (
      extractChatId((row as any).chat) === chatId
      && extractThreadId((row as any).thread) === threadId
    ))
    .filter((row: any) => row.role === 'user' || row.role === 'assistant' || row.role === 'system')
    .map((row: any) => ({
      role: row.role as 'user' | 'assistant' | 'system',
      content: row.content,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
    }))
}

export async function saveUserMessage(
  session: Session,
  chatId: string,
  threadId: string,
  content: string,
): Promise<void> {
  const db = await initPodData(session)
  const now = getActiveRuntime().now()
  const webId = session.info.webId
  if (!webId) {
    throw new Error('Missing webId in Solid session')
  }
  const messageId = getActiveRuntime().randomUUID()
  const chatUri = chatResource.buildIri(webId, { id: chatId })
  const threadUri = threadRepository.iriForChat(webId, chatId, threadId)

  await runCliChatProjection({
    action: 'message.create',
    kind: 'insert',
    db,
    webId,
    chatId,
    threadId,
    messageId,
    createdAt: now,
    role: 'user',
  }, () => db.insert(messageResource).values({
    id: messageId,
    chat: chatUri,
    thread: threadUri,
    maker: webId,
    role: 'user',
    content,
    status: 'sent',
    createdAt: now,
  }).execute())

  await runCliChatProjection({
    action: 'chat.activity.update',
    kind: 'update',
    db,
    webId,
    chatId,
    threadId,
    messageId,
    createdAt: now,
    role: 'user',
  }, () => db.updateById(chatResource, chatId, {
    lastActiveAt: now,
    lastMessagePreview: content.slice(0, 100),
    updatedAt: now,
  }))

  await touchThread(session, threadId)
}

export async function saveAssistantMessage(
  session: Session,
  chatId: string,
  threadId: string,
  content: string,
): Promise<void> {
  const db = await initPodData(session)
  const now = getActiveRuntime().now()
  const webId = session.info.webId
  if (!webId) {
    throw new Error('Missing webId in Solid session')
  }
  const messageId = getActiveRuntime().randomUUID()
  const chatUri = chatResource.buildIri(webId, { id: chatId })
  const threadUri = threadRepository.iriForChat(webId, chatId, threadId)

  await runCliChatProjection({
    action: 'message.create',
    kind: 'insert',
    db,
    webId,
    chatId,
    threadId,
    messageId,
    createdAt: now,
    role: 'assistant',
  }, () => db.insert(messageResource).values({
    id: messageId,
    chat: chatUri,
    thread: threadUri,
    maker: agentResource.buildIri(webId, { id: DEFAULT_AGENT_ID }),
    role: 'assistant',
    content,
    status: 'sent',
    createdAt: now,
  }).execute())

  await runCliChatProjection({
    action: 'chat.activity.update',
    kind: 'update',
    db,
    webId,
    chatId,
    threadId,
    messageId,
    createdAt: now,
    role: 'assistant',
  }, () => db.updateById(chatResource, chatId, {
    lastActiveAt: now,
    lastMessagePreview: content.slice(0, 100),
    updatedAt: now,
  }))

  await touchThread(session, threadId)
}

export async function loadThread(session: Session, threadId: string): Promise<ThreadRow | null> {
  const db = await initPodData(session)

  const directChatId = threadRepository.chatIdFromRef(threadId)
  const directThreadId = extractThreadId(threadId)
  if (directChatId && directThreadId) {
    const resourceId = threadRepository.idForChat(directChatId, directThreadId)
    return await db.findById<ThreadRow>(threadResource, resourceId)
  }

  const resourceId = threadRepository.idForChat(DEFAULT_CHAT_ID, threadId)
  return await db.findById<ThreadRow>(threadResource, resourceId)
}

export async function getLatestThreadId(session: Session, chatId: string): Promise<string | null> {
  const threads = await listThreads(session, chatId)
  return threads[0]?.id ?? null
}

export { toOpenAiMessages, formatThreadLabel }

export function isMessageRow(_row: MessageRow): boolean {
  return true
}

export const __podChatStoreInternal = {
  resources: {
    agentResource,
    chatResource,
    threadResource,
    messageResource,
  },
  getSyncResults(): LinxSyncRunResult[] {
    return [...cliChatSyncResults]
  },
  resetSyncResults(): void {
    cliChatSyncResults.length = 0
    cliChatSyncSeq = 0
  },
  setRuntime(runtime: Partial<CliChatStoreRuntime> = {}): void {
    activeRuntime = {
      ...defaultRuntime,
      ...runtime,
    }
  },
  resetRuntime(): void {
    activeRuntime = defaultRuntime
    cliChatSyncResults.length = 0
    cliChatSyncSeq = 0
  },
}
