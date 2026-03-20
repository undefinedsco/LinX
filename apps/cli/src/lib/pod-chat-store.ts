import type { Session } from '@inrupt/solid-client-authn-node'
import {
  agentTable,
  chatTable,
  drizzle,
  eq,
  findExactRecord,
  linxSchema,
  messageTable,
  threadTable,
  type MessageRow,
  type SolidDatabase,
  type ThreadRow,
  updateExactRecord,
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
    disableInteropDiscovery: true,
    schema: linxSchema,
  }) as unknown as SolidDatabase
}

export async function initPodData(session: Session): Promise<SolidDatabase> {
  const db = createDb(session)

  try {
    await (db as any).init([chatTable, threadTable, messageTable, agentTable])
  } catch {
    // 容器可能已存在，MVP 允许继续。
  }

  return db
}

async function ensureCliAgent(db: SolidDatabase): Promise<void> {
  const row = await findExactRecord(db, agentTable as any, DEFAULT_AGENT_ID)
  if (row) {
    return
  }

  const now = new Date()
  await (db as any).insert(agentTable).values({
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

  const row = await findExactRecord(db, chatTable as any, DEFAULT_CHAT_ID)
  if (row) {
    return DEFAULT_CHAT_ID
  }

  const now = new Date()
  await (db as any).insert(chatTable).values({
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

  await (db as any).insert(threadTable).values({
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
  const thread = await loadThread(session, threadId)
  if (!thread) return
  await updateExactRecord(db, threadTable as any, thread as any, { updatedAt: new Date() })
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

  await (db as any).insert(messageTable).values({
    id: crypto.randomUUID(),
    chat: `${getPodBaseUrl(webId)}/.data/chat/${chatId}/index.ttl#this`,
    thread: buildThreadUri(webId, chatId, threadId),
    maker: webId,
    role: 'user',
    content,
    status: 'sent',
    createdAt: now,
  }).execute()

  await (db as any).update(chatTable).set({
    lastActiveAt: now,
    lastMessagePreview: content.slice(0, 100),
    updatedAt: now,
  }).whereByIri(`${getPodBaseUrl(webId)}/.data/chat/${chatId}/index.ttl#this`).execute()

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

  await (db as any).insert(messageTable).values({
    id: crypto.randomUUID(),
    chat: `${getPodBaseUrl(webId)}/.data/chat/${chatId}/index.ttl#this`,
    thread: buildThreadUri(webId, chatId, threadId),
    maker: buildAgentUri(webId, DEFAULT_AGENT_ID),
    role: 'assistant',
    content,
    status: 'sent',
    createdAt: now,
  }).execute()

  await (db as any).update(chatTable).set({
    lastActiveAt: now,
    lastMessagePreview: content.slice(0, 100),
    updatedAt: now,
  }).whereByIri(`${getPodBaseUrl(webId)}/.data/chat/${chatId}/index.ttl#this`).execute()

  await touchThread(session, threadId)
}

export async function loadThread(session: Session, threadId: string): Promise<ThreadRow | null> {
  const db = await initPodData(session)
  const rows = await db.select().from(threadTable).execute()
  return (rows.find((row: any) => row.id === threadId) as ThreadRow | undefined) ?? null
}

export async function getLatestThreadId(session: Session, chatId: string): Promise<string | null> {
  const threads = await listThreads(session, chatId)
  return threads[0]?.id ?? null
}

export { toOpenAiMessages, formatThreadLabel }

export function isMessageRow(_row: MessageRow): boolean {
  return true
}
