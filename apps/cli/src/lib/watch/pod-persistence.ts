import type { Session } from '@inrupt/solid-client-authn-node'
import type { ClientCredentialsSecrets, StoredCredentials } from '../credentials-store.js'
import {
  buildWatchThreadMetadata,
  buildWatchTranscriptMessages,
  type WatchEventLogEntry,
  type WatchSessionRecord,
} from '@linx/models/watch'
import { loadWatchEvents } from './archive.js'

const WATCH_CHAT_ID = 'linx-watch'
const WATCH_CHAT_TITLE = 'LinX Watch'
const WATCH_AGENT_ID = 'linx-watch-assistant'

interface WatchPodPersistenceRuntime {
  loadCredentials: () => StoredCredentials | null
  getClientCredentials: (stored: StoredCredentials) => ClientCredentialsSecrets | null
  authenticate: (clientId: string, clientSecret: string, oidcIssuer: string) => Promise<{ session: Session }>
  createDb: (session: Session) => PodPersistenceDb
  chatTable: unknown
  threadTable: unknown
  messageTable: unknown
  agentTable: unknown
  eq: (left: unknown, right: unknown) => unknown
  loadWatchEvents: (id: string) => WatchEventLogEntry[]
}

interface PodPersistenceDb {
  init(tables: unknown[]): Promise<unknown>
  select(): {
    from(table: unknown): {
      where(condition: unknown): {
        limit(limit: number): {
          execute(): Promise<unknown[]>
        }
      }
    }
  }
  insert(table: unknown): {
    values(value: Record<string, unknown>): {
      execute(): Promise<unknown>
    }
  }
  update(table: unknown): {
    set(value: Record<string, unknown>): {
      where(condition: unknown): {
        execute(): Promise<unknown>
      }
    }
  }
}

interface WatchChatRow extends Record<string, unknown> {
  id: string
  title: string
  participants: string[]
  lastActiveAt: Date
  lastMessagePreview?: string
  createdAt: Date
  updatedAt: Date
}

interface WatchThreadRow extends Record<string, unknown> {
  id: string
  chatId: string
  title: string
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

interface PersistedWatchConversationMessage extends Record<string, unknown> {
  id: string
  chatId: string
  threadId: string
  maker: string
  role: 'user' | 'assistant' | 'system'
  content: string
  status: 'sent'
  createdAt: Date
}

async function dynamicImport(specifier: string): Promise<Record<string, any>> {
  const loader = new Function('modulePath', 'return import(modulePath)') as (modulePath: string) => Promise<Record<string, any>>
  return loader(specifier)
}

async function createDefaultRuntime(): Promise<WatchPodPersistenceRuntime> {
  const [credentialsStore, solidAuth, models] = await Promise.all([
    dynamicImport(new URL('../credentials-store.js', import.meta.url).href),
    dynamicImport(new URL('../solid-auth.js', import.meta.url).href),
    dynamicImport(new URL('../models.js', import.meta.url).href),
  ])

  return {
    loadCredentials: credentialsStore.loadCredentials,
    getClientCredentials: credentialsStore.getClientCredentials,
    authenticate: solidAuth.authenticate,
    createDb(session) {
      return models.drizzle(session, {
        logger: false,
        disableInteropDiscovery: true,
        schema: models.linxSchema,
      }) as unknown as PodPersistenceDb
    },
    chatTable: models.chatTable,
    threadTable: models.threadTable,
    messageTable: models.messageTable,
    agentTable: models.agentTable,
    eq: models.eq,
    loadWatchEvents,
  }
}

function normalizeTitle(text: string, width = 72): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return 'Watch Session'
  }

  if (normalized.length <= width) {
    return normalized
  }

  return `${normalized.slice(0, Math.max(0, width - 3))}...`
}

function getPodBaseUrl(webId: string): string {
  return webId.replace('/profile/card#me', '').replace(/\/$/, '')
}

function buildThreadUri(webId: string, chatId: string, threadId: string): string {
  return `${getPodBaseUrl(webId)}/.data/chat/${chatId}/index.ttl#${threadId}`
}

function buildAgentUri(webId: string, agentId: string): string {
  return `${getPodBaseUrl(webId)}/.data/agents/${agentId}.ttl`
}

function buildWatchConversationThreadTitle(
  record: WatchSessionRecord,
  transcript: Array<{ role: string; content: string }> = [],
): string {
  const firstUserTurn = transcript.find((message) => message.role === 'user')?.content
  const base = firstUserTurn?.trim() || record.prompt?.trim() || `${record.backend} watch`
  return normalizeTitle(`${record.backend} · ${base}`)
}

function buildWatchConversationChatRow(record: WatchSessionRecord, lastPreview?: string): WatchChatRow {
  const startedAt = new Date(record.startedAt)
  const updatedAt = record.endedAt ? new Date(record.endedAt) : startedAt

  return {
    id: WATCH_CHAT_ID,
    title: WATCH_CHAT_TITLE,
    participants: [],
    lastActiveAt: updatedAt,
    lastMessagePreview: lastPreview ? normalizeTitle(lastPreview, 100) : undefined,
    createdAt: startedAt,
    updatedAt,
  }
}

function buildWatchConversationThreadRow(
  record: WatchSessionRecord,
  transcript: Array<{ role: string; content: string }> = [],
): WatchThreadRow {
  const startedAt = new Date(record.startedAt)
  const updatedAt = record.endedAt ? new Date(record.endedAt) : startedAt

  return {
    id: record.id,
    chatId: WATCH_CHAT_ID,
    title: buildWatchConversationThreadTitle(record, transcript),
    metadata: buildWatchThreadMetadata(record),
    createdAt: startedAt,
    updatedAt,
  }
}

function buildWatchConversationMessages(
  record: WatchSessionRecord,
  webId: string,
  entries: WatchEventLogEntry[],
): PersistedWatchConversationMessage[] {
  const transcript = buildWatchTranscriptMessages(entries)
  const threadUri = buildThreadUri(webId, WATCH_CHAT_ID, record.id)
  const agentUri = buildAgentUri(webId, WATCH_AGENT_ID)

  return transcript.map((message, index) => ({
    id: `${record.id}-m${String(index + 1).padStart(4, '0')}`,
    chatId: WATCH_CHAT_ID,
    threadId: threadUri,
    maker: message.role === 'user' ? webId : agentUri,
    role: message.role,
    content: message.content,
    status: 'sent',
    createdAt: new Date(message.createdAt),
  }))
}

async function selectById(db: PodPersistenceDb, eq: WatchPodPersistenceRuntime['eq'], table: unknown, id: string): Promise<unknown | null> {
  const idCol = (table as any).id
  const rows = await db.select().from(table as any).where(eq(idCol, id)).limit(1).execute()
  return rows[0] ?? null
}

async function ensureWatchConversationChat(db: PodPersistenceDb, runtime: WatchPodPersistenceRuntime, row: WatchChatRow): Promise<void> {
  const existing = await selectById(db, runtime.eq, runtime.chatTable, WATCH_CHAT_ID)

  if (!existing) {
    await db.insert(runtime.chatTable).values(row).execute()
    return
  }

  await db.update(runtime.chatTable).set({
    title: row.title,
    lastActiveAt: row.lastActiveAt,
    lastMessagePreview: row.lastMessagePreview,
    updatedAt: row.updatedAt,
  }).where(runtime.eq((runtime.chatTable as any).id, WATCH_CHAT_ID)).execute()
}

async function ensureWatchConversationAgent(db: PodPersistenceDb, runtime: WatchPodPersistenceRuntime, record: WatchSessionRecord): Promise<void> {
  const existing = await selectById(db, runtime.eq, runtime.agentTable, WATCH_AGENT_ID)
  const now = record.endedAt ? new Date(record.endedAt) : new Date(record.startedAt)

  if (!existing) {
    await db.insert(runtime.agentTable).values({
      id: WATCH_AGENT_ID,
      name: 'Secretary AI',
      provider: 'linx',
      model: record.model ?? record.backend,
      createdAt: now,
      updatedAt: now,
    }).execute()
    return
  }

  await db.update(runtime.agentTable).set({
    provider: 'linx',
    model: record.model ?? record.backend,
    updatedAt: now,
  }).where(runtime.eq((runtime.agentTable as any).id, WATCH_AGENT_ID)).execute()
}

async function upsertWatchConversationThread(db: PodPersistenceDb, runtime: WatchPodPersistenceRuntime, row: WatchThreadRow): Promise<void> {
  const threadId = row.id
  if (!threadId) {
    return
  }

  const existing = await selectById(db, runtime.eq, runtime.threadTable, threadId)

  if (!existing) {
    await db.insert(runtime.threadTable).values(row).execute()
    return
  }

  await db.update(runtime.threadTable).set({
    title: row.title,
    metadata: row.metadata,
    updatedAt: row.updatedAt,
  }).where(runtime.eq((runtime.threadTable as any).id, threadId)).execute()
}

async function upsertWatchConversationMessages(
  db: PodPersistenceDb,
  runtime: WatchPodPersistenceRuntime,
  rows: PersistedWatchConversationMessage[],
): Promise<void> {
  for (const row of rows) {
    const existing = await selectById(db, runtime.eq, runtime.messageTable, row.id)

    if (!existing) {
      await db.insert(runtime.messageTable).values(row).execute()
      continue
    }

    await db.update(runtime.messageTable).set({
      role: row.role,
      maker: row.maker,
      content: row.content,
      status: row.status,
      createdAt: row.createdAt,
    }).where(runtime.eq((runtime.messageTable as any).id, row.id)).execute()
  }
}

export async function persistWatchConversationToPod(
  record: WatchSessionRecord,
  runtime?: WatchPodPersistenceRuntime,
): Promise<boolean> {
  const activeRuntime = runtime ?? await createDefaultRuntime()
  const stored = activeRuntime.loadCredentials()
  if (!stored) {
    return false
  }

  const clientCredentials = activeRuntime.getClientCredentials(stored)
  if (!clientCredentials) {
    return false
  }

  const { session } = await activeRuntime.authenticate(clientCredentials.clientId, clientCredentials.clientSecret, stored.url)

  try {
    const db = activeRuntime.createDb(session)
    const entries = activeRuntime.loadWatchEvents(record.id)
    const transcriptRows = buildWatchConversationMessages(record, stored.webId, entries)
    const lastPreview = transcriptRows.at(-1)?.content

    await db.init([
      activeRuntime.chatTable,
      activeRuntime.threadTable,
      activeRuntime.messageTable,
      activeRuntime.agentTable,
    ]).catch(() => undefined)
    await ensureWatchConversationChat(db, activeRuntime, buildWatchConversationChatRow(record, lastPreview))
    await ensureWatchConversationAgent(db, activeRuntime, record)
    await upsertWatchConversationThread(db, activeRuntime, buildWatchConversationThreadRow(record, transcriptRows))
    await upsertWatchConversationMessages(db, activeRuntime, transcriptRows)
    return true
  } finally {
    await session.logout().catch(() => undefined)
  }
}

export const __podPersistenceInternal = {
  WATCH_AGENT_ID,
  WATCH_CHAT_ID,
  WATCH_CHAT_TITLE,
  buildWatchConversationMessages,
  buildWatchConversationThreadRow,
  buildWatchConversationThreadTitle,
}
