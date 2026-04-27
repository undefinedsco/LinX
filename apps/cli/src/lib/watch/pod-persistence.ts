import type { Session } from '@inrupt/solid-client-authn-node'
import type { ClientCredentialsSecrets, StoredCredentials } from '../credentials-store.js'
import {
  buildWatchThreadMetadata,
  buildWatchTranscriptMessages,
  type WatchEventLogEntry,
  type WatchSessionRecord,
} from '@undefineds.co/models/watch'
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
  loadWatchEvents: (id: string) => WatchEventLogEntry[]
}

interface PodPersistenceDb {
  init(tables: unknown[]): Promise<unknown>
  findByIri?: (table: unknown, iri: string) => Promise<unknown | null>
  select(): {
    from(table: unknown): {
      execute(): Promise<unknown[]>
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
  chat: string
  title: string
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

interface PersistedWatchConversationMessage extends Record<string, unknown> {
  id: string
  chat: string
  thread: string
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
        schema: models.solidSchema,
      }) as unknown as PodPersistenceDb
    },
    chatTable: models.chatTable,
    threadTable: models.threadTable,
    messageTable: models.messageTable,
    agentTable: models.agentTable,
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

function buildPodIri(webId: string, relativeUri: string): string {
  if (/^https?:\/\//.test(relativeUri)) return relativeUri
  return new URL(relativeUri.replace(/^\//, ''), `${getPodBaseUrl(webId)}/`).toString()
}

function resolveRowIri(webId: string, table: { resolveUri?: (id: string) => string }, id: string): string {
  const relativeUri = typeof table.resolveUri === 'function' ? table.resolveUri(id) : id
  return buildPodIri(webId, relativeUri)
}

function whereByStorageId(webId: string, table: any, query: any, id: string): any {
  const iri = resolveRowIri(webId, table, id)
  if (typeof query.whereByIri === 'function') {
    return query.whereByIri(iri)
  }
  return query.where({ id } as any)
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
    chat: WATCH_CHAT_ID,
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
    chat: WATCH_CHAT_ID,
    thread: record.id,
    maker: message.role === 'user' ? webId : agentUri,
    role: message.role,
    content: message.content,
    status: 'sent',
    createdAt: new Date(message.createdAt),
  }))
}

async function selectById(db: PodPersistenceDb, webId: string, table: unknown, id: string): Promise<unknown | null> {
  if (typeof db.findByIri === 'function') {
    return await db.findByIri(table, resolveRowIri(webId, table as { resolveUri?: (id: string) => string }, id))
  }

  const rows = await db.select().from(table as any).execute()
  return (rows as any[]).find((row) => row?.id === id) ?? null
}

async function ensureWatchConversationChat(db: PodPersistenceDb, runtime: WatchPodPersistenceRuntime, webId: string, row: WatchChatRow): Promise<void> {
  const existing = await selectById(db, webId, runtime.chatTable, WATCH_CHAT_ID)

  if (!existing) {
    await db.insert(runtime.chatTable).values(row).execute()
    return
  }

  await whereByStorageId(webId, runtime.chatTable, db.update(runtime.chatTable).set({
    title: row.title,
    lastActiveAt: row.lastActiveAt,
    lastMessagePreview: row.lastMessagePreview,
    updatedAt: row.updatedAt,
  }), WATCH_CHAT_ID).execute()
}

async function ensureWatchConversationAgent(db: PodPersistenceDb, runtime: WatchPodPersistenceRuntime, webId: string, record: WatchSessionRecord): Promise<void> {
  const existing = await selectById(db, webId, runtime.agentTable, WATCH_AGENT_ID)
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

  await whereByStorageId(webId, runtime.agentTable, db.update(runtime.agentTable).set({
    provider: 'linx',
    model: record.model ?? record.backend,
    updatedAt: now,
  }), WATCH_AGENT_ID).execute()
}

async function upsertWatchConversationThread(db: PodPersistenceDb, runtime: WatchPodPersistenceRuntime, webId: string, row: WatchThreadRow): Promise<void> {
  const threadId = row.id
  if (!threadId) {
    return
  }

  const existing = await selectById(db, webId, runtime.threadTable, threadId)

  if (!existing) {
    await db.insert(runtime.threadTable).values(row).execute()
    return
  }

  await whereByStorageId(webId, runtime.threadTable, db.update(runtime.threadTable).set({
    title: row.title,
    metadata: row.metadata,
    updatedAt: row.updatedAt,
  }), threadId).execute()
}

async function upsertWatchConversationMessages(
  db: PodPersistenceDb,
  runtime: WatchPodPersistenceRuntime,
  webId: string,
  rows: PersistedWatchConversationMessage[],
): Promise<void> {
  for (const row of rows) {
    const existing = await selectById(db, webId, runtime.messageTable, row.id)

    if (!existing) {
      await db.insert(runtime.messageTable).values(row).execute()
      continue
    }

    await whereByStorageId(webId, runtime.messageTable, db.update(runtime.messageTable).set({
      role: row.role,
      maker: row.maker,
      content: row.content,
      status: row.status,
      createdAt: row.createdAt,
    }), row.id).execute()
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
    await ensureWatchConversationChat(db, activeRuntime, stored.webId, buildWatchConversationChatRow(record, lastPreview))
    await ensureWatchConversationAgent(db, activeRuntime, stored.webId, record)
    await upsertWatchConversationThread(db, activeRuntime, stored.webId, buildWatchConversationThreadRow(record, transcriptRows))
    await upsertWatchConversationMessages(db, activeRuntime, stored.webId, transcriptRows)
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
