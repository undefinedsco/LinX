import type { Session } from '@inrupt/solid-client-authn-node'
import {
  agentTable,
  buildAgentResourceRef,
  chatTable,
  drizzle,
  eq,
  extractChatIdFromChatRef,
  extractThreadIdFromThreadRef,
  initSolidTables,
  solidSchema,
  messageTable,
  sessionTable,
  threadTable,
  type MessageRow,
  type SolidDatabase,
  type ThreadRow,
} from './models.js'
import { DEFAULT_LINX_CLOUD_MODEL_ID } from './default-model.js'
import { formatThreadLabel, toOpenAiMessages } from './thread-utils.js'

const DEFAULT_CHAT_ID = 'cli-default'
const DEFAULT_AGENT_ID = 'linx-cli-assistant'

function extractChatId(chatIdOrUri: string | null | undefined): string {
  return extractChatIdFromChatRef(chatIdOrUri) ?? DEFAULT_CHAT_ID
}

function extractThreadId(threadIdOrUri: string | null | undefined): string | undefined {
  return extractThreadIdFromThreadRef(threadIdOrUri) ?? undefined
}

function buildAgentUri(webId: string, agentId: string): string {
  return buildAgentResourceRef(webId, agentId)
}

function requireFindByLocator(db: SolidDatabase): NonNullable<SolidDatabase['findByLocator']> {
  if (typeof db.findByLocator !== 'function') {
    throw new Error('Solid database does not support findByLocator')
  }
  return db.findByLocator.bind(db)
}

function requireUpdateByLocator(db: SolidDatabase): NonNullable<SolidDatabase['updateByLocator']> {
  if (typeof db.updateByLocator !== 'function') {
    throw new Error('Solid database does not support updateByLocator')
  }
  return db.updateByLocator.bind(db)
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
    schema: solidSchema,
  }) as unknown as SolidDatabase
}

export async function initPodData(session: Session): Promise<SolidDatabase> {
  const db = createDb(session)

  try {
    await initSolidTables(db, [chatTable, threadTable, messageTable, sessionTable, agentTable])
  } catch {
    // 容器可能已存在，MVP 允许继续。
  }

  return db
}

async function ensureCliAgent(db: SolidDatabase, webId: string): Promise<void> {
  const findByLocator = requireFindByLocator(db)
  const existing = await findByLocator(agentTable, { id: DEFAULT_AGENT_ID })

  if (existing) {
    return
  }

  const now = new Date()
  await db.insert(agentTable).values({
    id: DEFAULT_AGENT_ID,
    name: 'LinX CLI Assistant',
    provider: 'xpod',
    model: DEFAULT_LINX_CLOUD_MODEL_ID,
    createdAt: now,
    updatedAt: now,
  }).execute()
}

export async function getOrCreateDefaultChat(session: Session): Promise<string> {
  const db = await initPodData(session)
  const webId = session.info.webId
  if (!webId) {
    throw new Error('Missing webId in Solid session')
  }

  await ensureCliAgent(db, webId)

  const findByLocator = requireFindByLocator(db)
  const existing = await findByLocator(chatTable, { id: DEFAULT_CHAT_ID })
  if (existing) {
    return DEFAULT_CHAT_ID
  }

  const now = new Date()
  await db.insert(chatTable).values({
    id: DEFAULT_CHAT_ID,
    title: 'LinX CLI',
    participants: [],
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now,
  }).execute()

  return DEFAULT_CHAT_ID
}

export async function listThreads(session: Session, chatId: string): Promise<ThreadSummary[]> {
  const db = await initPodData(session)
  const chatCol = (threadTable as any).chat
  const rows = await db.select().from(threadTable).where(eq(chatCol, chatId)).orderBy('updatedAt', 'desc').execute()

  return rows.map((row: any) => ({
    id: String(row.id),
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
  const threadId = crypto.randomUUID()
  const now = new Date()

  await db.insert(threadTable).values({
    id: threadId,
    chat: chatId,
    title: title || 'CLI Session',
    workspace: workspace || undefined,
    createdAt: now,
    updatedAt: now,
  }).execute()

  return threadId
}

export async function touchThread(session: Session, threadId: string): Promise<void> {
  const db = await initPodData(session)
  const chatId = extractChatId((await loadThread(session, threadId))?.chat) ?? DEFAULT_CHAT_ID
  const updateByLocator = requireUpdateByLocator(db)
  await updateByLocator(threadTable, { chat: chatId, id: threadId }, { updatedAt: new Date() })
}

export async function loadMessages(session: Session, threadId: string): Promise<StoredThreadMessage[]> {
  const db = await initPodData(session)
  const createdAtCol = (messageTable as any).createdAt
  const thread = await loadThread(session, threadId)
  if (!thread) {
    return []
  }

  const chatId = extractChatId((thread as any).chat)
  const rows = await db.select().from(messageTable).orderBy(createdAtCol).execute()

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
  const now = new Date()
  const webId = session.info.webId
  if (!webId) {
    throw new Error('Missing webId in Solid session')
  }
  const updateByLocator = requireUpdateByLocator(db)

  await db.insert(messageTable).values({
    id: crypto.randomUUID(),
    chat: chatId,
    thread: threadId,
    maker: webId,
    role: 'user',
    content,
    status: 'sent',
    createdAt: now,
  }).execute()

  await updateByLocator(chatTable, { id: chatId }, {
    lastActiveAt: now,
    lastMessagePreview: content.slice(0, 100),
    updatedAt: now,
  })

  await touchThread(session, threadId)
}

export async function saveAssistantMessage(
  session: Session,
  chatId: string,
  threadId: string,
  content: string,
): Promise<void> {
  const db = await initPodData(session)
  const now = new Date()
  const webId = session.info.webId
  if (!webId) {
    throw new Error('Missing webId in Solid session')
  }
  const updateByLocator = requireUpdateByLocator(db)

  await db.insert(messageTable).values({
    id: crypto.randomUUID(),
    chat: chatId,
    thread: threadId,
    maker: buildAgentUri(webId, DEFAULT_AGENT_ID),
    role: 'assistant',
    content,
    status: 'sent',
    createdAt: now,
  }).execute()

  await updateByLocator(chatTable, { id: chatId }, {
    lastActiveAt: now,
    lastMessagePreview: content.slice(0, 100),
    updatedAt: now,
  })

  await touchThread(session, threadId)
}

export async function loadThread(session: Session, threadId: string): Promise<ThreadRow | null> {
  const db = await initPodData(session)
  const findByLocator = requireFindByLocator(db)

  const directChatId = extractChatId(threadId)
  const directThreadId = extractThreadId(threadId)
  if (directChatId && directThreadId) {
    return await findByLocator<ThreadRow>(threadTable, {
      chat: directChatId,
      id: directThreadId,
    })
  }

  return await findByLocator<ThreadRow>(threadTable, {
    chat: DEFAULT_CHAT_ID,
    id: threadId,
  })
}

export async function getLatestThreadId(session: Session, chatId: string): Promise<string | null> {
  const threads = await listThreads(session, chatId)
  return threads[0]?.id ?? null
}

export { toOpenAiMessages, formatThreadLabel }

export function isMessageRow(_row: MessageRow): boolean {
  return true
}
