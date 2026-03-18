import type { Session } from '@inrupt/solid-client-authn-node'
import {
  agentTable,
  chatTable,
  drizzle,
  eq,
  linxSchema,
  messageTable,
  threadTable,
  type MessageRow,
  type SolidDatabase,
  type ThreadRow,
} from './models.js'
import { formatThreadLabel, toOpenAiMessages } from './thread-utils.js'

const DEFAULT_CHAT_ID = 'cli-default'
const DEFAULT_AGENT_ID = 'linx-cli-assistant'

function extractChatId(chatIdOrUri: string | null | undefined): string {
  if (!chatIdOrUri) return DEFAULT_CHAT_ID
  if (chatIdOrUri.includes('#')) {
    const match = chatIdOrUri.match(/\.data\/chat\/([^/]+)\/index\.ttl#this/)
    if (match) return match[1]
  }
  return chatIdOrUri
}

function extractThreadId(threadIdOrUri: string | null | undefined): string | undefined {
  if (!threadIdOrUri) return undefined
  if (threadIdOrUri.includes('#')) {
    return threadIdOrUri.split('#').pop() || undefined
  }
  return threadIdOrUri
}

function getPodBaseUrl(webId: string): string {
  return webId.replace('/profile/card#me', '').replace(/\/$/, '')
}

function buildThreadUri(webId: string, chatIdOrUri: string, threadId: string): string {
  const chatId = extractChatId(chatIdOrUri)
  return `${getPodBaseUrl(webId)}/.data/chat/${chatId}/index.ttl#${threadId}`
}

function buildAgentUri(webId: string, agentId: string): string {
  return `${getPodBaseUrl(webId)}/.data/agents/${agentId}.ttl`
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
    schema: linxSchema,
  }) as unknown as SolidDatabase
}

export async function initPodData(session: Session): Promise<SolidDatabase> {
  const db = createDb(session)

  try {
    await db.init([chatTable, threadTable, messageTable, agentTable])
  } catch {
    // 容器可能已存在，MVP 允许继续。
  }

  return db
}

async function ensureCliAgent(db: SolidDatabase): Promise<void> {
  const idCol = (agentTable as any).id
  const rows = await db.select().from(agentTable).where(eq(idCol, DEFAULT_AGENT_ID)).limit(1).execute()

  if (rows.length > 0) {
    return
  }

  const now = new Date()
  await db.insert(agentTable).values({
    id: DEFAULT_AGENT_ID,
    name: 'LinX CLI Assistant',
    provider: 'xpod',
    model: 'default',
    createdAt: now,
    updatedAt: now,
  }).execute()
}

export async function getOrCreateDefaultChat(session: Session): Promise<string> {
  const db = await initPodData(session)
  await ensureCliAgent(db)

  const idCol = (chatTable as any).id
  const rows = await db.select().from(chatTable).where(eq(idCol, DEFAULT_CHAT_ID)).limit(1).execute()
  if (rows.length > 0) {
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
  const chatIdCol = (threadTable as any).chatId
  const rows = await db.select().from(threadTable).where(eq(chatIdCol, chatId)).orderBy('updatedAt', 'desc').execute()

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
    chatId,
    title: title || 'CLI Session',
    workspace: workspace || undefined,
    createdAt: now,
    updatedAt: now,
  }).execute()

  return threadId
}

export async function touchThread(session: Session, threadId: string): Promise<void> {
  const db = await initPodData(session)
  const idCol = (threadTable as any).id
  await db.update(threadTable).set({ updatedAt: new Date() }).where(eq(idCol, threadId)).execute()
}

export async function loadMessages(session: Session, threadId: string): Promise<StoredThreadMessage[]> {
  const db = await initPodData(session)
  const createdAtCol = (messageTable as any).createdAt
  const thread = await loadThread(session, threadId)
  if (!thread) {
    return []
  }

  const chatId = extractChatId((thread as any).chatId)
  const rows = await db.select().from(messageTable).orderBy(createdAtCol).execute()

  return rows
    .filter((row: any) => (
      extractChatId((row as any).chatId) === chatId
      && extractThreadId((row as any).threadId) === threadId
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

  await db.insert(messageTable).values({
    id: crypto.randomUUID(),
    chatId,
    threadId: buildThreadUri(webId, chatId, threadId),
    maker: webId,
    role: 'user',
    content,
    status: 'sent',
    createdAt: now,
  }).execute()

  await db.update(chatTable).set({
    lastActiveAt: now,
    lastMessagePreview: content.slice(0, 100),
    updatedAt: now,
  }).where(eq((chatTable as any).id, chatId)).execute()

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

  await db.insert(messageTable).values({
    id: crypto.randomUUID(),
    chatId,
    threadId: buildThreadUri(webId, chatId, threadId),
    maker: buildAgentUri(webId, DEFAULT_AGENT_ID),
    role: 'assistant',
    content,
    status: 'sent',
    createdAt: now,
  }).execute()

  await db.update(chatTable).set({
    lastActiveAt: now,
    lastMessagePreview: content.slice(0, 100),
    updatedAt: now,
  }).where(eq((chatTable as any).id, chatId)).execute()

  await touchThread(session, threadId)
}

export async function loadThread(session: Session, threadId: string): Promise<ThreadRow | null> {
  const db = await initPodData(session)
  const idCol = (threadTable as any).id
  const rows = await db.select().from(threadTable).where(eq(idCol, threadId)).limit(1).execute()
  return (rows[0] as ThreadRow | undefined) ?? null
}

export async function getLatestThreadId(session: Session, chatId: string): Promise<string | null> {
  const threads = await listThreads(session, chatId)
  return threads[0]?.id ?? null
}

export { toOpenAiMessages, formatThreadLabel }

export function isMessageRow(_row: MessageRow): boolean {
  return true
}
