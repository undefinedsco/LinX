import type { PodDataSession } from '../pod-data-session.js'
import { getDefaultPodDataSession } from '../pod-data-session.js'
import {
  buildWatchThreadMetadata,
  buildWatchTranscriptMessages,
  type WatchEventLogEntry,
  type WatchSessionRecord,
  type WatchTranscriptMessageSource,
} from '@undefineds.co/models/watch'
import { DEFAULT_AGENT_RUNTIME_COMPANION_MODEL_ID } from '@linx/agent-runtime/companion-model'
import { loadWatchEvents } from './archive.js'

const WATCH_CHAT_ID_PREFIX = 'linx-watch'
const WATCH_CHAT_TITLE = 'LinX Watch'
const WATCH_SECRETARY_AGENT_ID = 'linx-watch-assistant'

interface WatchPodPersistenceRuntime {
  getPodDataSession: () => Promise<PodDataSession | null>
  createDb: (session: PodDataSession) => PodPersistenceDb
  chatTable: unknown
  threadTable: unknown
  messageTable: unknown
  agentTable: unknown
  loadWatchEvents: (id: string) => WatchEventLogEntry[]
}

interface PodPersistenceDb {
  init(tables: unknown[]): Promise<unknown>
  findByLocator?: (table: unknown, locator: Record<string, unknown>) => Promise<unknown | null>
  updateByLocator?: (
    table: unknown,
    locator: Record<string, unknown>,
    data: Record<string, unknown>,
  ) => Promise<unknown | null>
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
  metadata: Record<string, unknown>
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
  senderName?: string
  senderAvatarUrl?: string
  routedBy?: string
  routeTargetAgentId?: string
  coordinationId?: string
  createdAt: Date
}

interface WatchAgentRow extends Record<string, unknown> {
  id: string
  name: string
  provider: string
  model: string
  description?: string
  createdAt: Date
  updatedAt: Date
}

async function dynamicImport(specifier: string): Promise<Record<string, any>> {
  const loader = new Function('modulePath', 'return import(modulePath)') as (modulePath: string) => Promise<Record<string, any>>
  return loader(specifier)
}

async function createDefaultRuntime(): Promise<WatchPodPersistenceRuntime> {
  const [models] = await Promise.all([
    dynamicImport(new URL('../models.js', import.meta.url).href),
  ])

  return {
    getPodDataSession: getDefaultPodDataSession,
    createDb(podSession) {
      return models.drizzle(podSession.solidSession ?? podSession, {
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

function buildAgentUri(webId: string, agentId: string): string {
  return `${getPodBaseUrl(webId)}/.data/agents/${agentId}.ttl`
}

function buildWatchChatId(record: Pick<WatchSessionRecord, 'backend'>): string {
  return `${WATCH_CHAT_ID_PREFIX}-${record.backend}`
}

function buildWatchPrimaryAgentId(record: Pick<WatchSessionRecord, 'backend'>): string {
  return `${WATCH_CHAT_ID_PREFIX}-${record.backend}-agent`
}

function watchBackendDisplayName(backend: WatchSessionRecord['backend']): string {
  if (backend === 'codex') return 'Codex'
  if (backend === 'claude') return 'Claude Code'
  if (backend === 'codebuddy') return 'CodeBuddy'
  return backend
}

function buildWatchParticipants(webId: string, record: Pick<WatchSessionRecord, 'backend'>): string[] {
  return [
    webId,
    buildAgentUri(webId, WATCH_SECRETARY_AGENT_ID),
    buildAgentUri(webId, buildWatchPrimaryAgentId(record)),
  ]
}

function buildWatchChatMetadata(webId: string, record: WatchSessionRecord): Record<string, unknown> {
  const secretaryAgentUri = buildAgentUri(webId, WATCH_SECRETARY_AGENT_ID)
  const primaryAgentId = buildWatchPrimaryAgentId(record)
  const primaryAgentUri = buildAgentUri(webId, primaryAgentId)

  return {
    kind: 'watch-group',
    surface: 'watch',
    backend: record.backend,
    runtime: record.runtime,
    transport: record.transport,
    secretaryAgent: secretaryAgentUri,
    primaryAgent: primaryAgentUri,
    memberRoles: {
      [webId]: 'owner',
      [secretaryAgentUri]: 'admin',
      [primaryAgentUri]: 'member',
    },
    members: [
      { uri: webId, role: 'user', label: 'User' },
      { uri: secretaryAgentUri, role: 'secretary', label: 'AI Secretary' },
      { uri: primaryAgentUri, role: 'primary-agent', label: watchBackendDisplayName(record.backend) },
    ],
  }
}

function buildWatchConversationThreadTitle(
  record: WatchSessionRecord,
  transcript: Array<{ role: string; content: string }> = [],
): string {
  const firstUserTurn = transcript.find((message) => message.role === 'user')?.content
  const base = firstUserTurn?.trim() || record.prompt?.trim() || `${record.backend} watch`
  return normalizeTitle(`${record.backend} · ${base}`)
}

function buildWatchConversationChatRow(record: WatchSessionRecord, webId: string, lastPreview?: string): WatchChatRow {
  const startedAt = new Date(record.startedAt)
  const updatedAt = record.endedAt ? new Date(record.endedAt) : startedAt

  return {
    id: buildWatchChatId(record),
    title: `${WATCH_CHAT_TITLE} · ${watchBackendDisplayName(record.backend)}`,
    participants: buildWatchParticipants(webId, record),
    metadata: buildWatchChatMetadata(webId, record),
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
    chat: buildWatchChatId(record),
    title: buildWatchConversationThreadTitle(record, transcript),
    metadata: {
      ...buildWatchThreadMetadata(record),
      chatId: buildWatchChatId(record),
    },
    createdAt: startedAt,
    updatedAt,
  }
}

function resolveMessageSender(input: {
  record: WatchSessionRecord
  webId: string
  source: WatchTranscriptMessageSource
}): {
  maker: string
  senderName: string
  routedBy?: string
  routeTargetAgentId?: string
} {
  const secretaryAgentUri = buildAgentUri(input.webId, WATCH_SECRETARY_AGENT_ID)
  const primaryAgentId = buildWatchPrimaryAgentId(input.record)
  const primaryAgentUri = buildAgentUri(input.webId, primaryAgentId)

  if (input.source === 'user') {
    return {
      maker: input.webId,
      senderName: 'User',
    }
  }

  if (input.source === 'primary-agent') {
    return {
      maker: primaryAgentUri,
      senderName: watchBackendDisplayName(input.record.backend),
    }
  }

  if (input.source === 'tool') {
    return {
      maker: primaryAgentUri,
      senderName: `${watchBackendDisplayName(input.record.backend)} Tool`,
      routedBy: primaryAgentUri,
      routeTargetAgentId: primaryAgentId,
    }
  }

  return {
    maker: secretaryAgentUri,
    senderName: input.source === 'secretary' ? 'AI Secretary' : 'LinX Watch',
    routedBy: secretaryAgentUri,
    routeTargetAgentId: primaryAgentId,
  }
}

function buildWatchConversationMessages(
  record: WatchSessionRecord,
  webId: string,
  entries: WatchEventLogEntry[],
): PersistedWatchConversationMessage[] {
  const transcript = buildWatchTranscriptMessages(entries)
  const chatId = buildWatchChatId(record)

  return transcript.map((message, index) => {
    const sender = resolveMessageSender({
      record,
      webId,
      source: message.source,
    })

    return {
      id: `${record.id}-m${String(index + 1).padStart(4, '0')}`,
      chat: chatId,
      thread: record.id,
      maker: sender.maker,
      role: message.role,
      content: message.content,
      status: 'sent',
      senderName: sender.senderName,
      routedBy: sender.routedBy,
      routeTargetAgentId: sender.routeTargetAgentId,
      coordinationId: record.id,
      createdAt: new Date(message.createdAt),
    }
  })
}

function resolveWatchRowLocator(row: Record<string, unknown>): Record<string, unknown> {
  const locator: Record<string, unknown> = { id: row.id }
  if (row.chat) locator.chat = row.chat
  if (row.createdAt) locator.createdAt = row.createdAt
  return locator
}

async function selectById(db: PodPersistenceDb, table: unknown, id: string, context: Record<string, unknown> = {}): Promise<unknown | null> {
  if (typeof db.findByLocator === 'function') {
    return await db.findByLocator(table, { id, ...context })
  }

  const rows = await db.select().from(table as any).execute()
  return (rows as any[]).find((row) => row?.id === id) ?? null
}

async function updateByLocator(
  db: PodPersistenceDb,
  table: unknown,
  row: Record<string, unknown>,
  data: Record<string, unknown>,
): Promise<void> {
  if (typeof db.updateByLocator === 'function') {
    await db.updateByLocator(table, resolveWatchRowLocator(row), data)
    return
  }

  await db.update(table).set(data).where({ id: row.id } as any).execute()
}

async function ensureWatchConversationChat(db: PodPersistenceDb, runtime: WatchPodPersistenceRuntime, _webId: string, row: WatchChatRow): Promise<void> {
  const existing = await selectById(db, runtime.chatTable, row.id)

  if (!existing) {
    await db.insert(runtime.chatTable).values(row).execute()
    return
  }

  await updateByLocator(db, runtime.chatTable, row, {
    title: row.title,
    participants: row.participants,
    metadata: row.metadata,
    lastActiveAt: row.lastActiveAt,
    lastMessagePreview: row.lastMessagePreview,
    updatedAt: row.updatedAt,
  })
}

async function ensureWatchConversationAgent(db: PodPersistenceDb, runtime: WatchPodPersistenceRuntime, _webId: string, row: WatchAgentRow): Promise<void> {
  const existing = await selectById(db, runtime.agentTable, row.id)
  if (!existing) {
    await db.insert(runtime.agentTable).values(row).execute()
    return
  }

  await updateByLocator(db, runtime.agentTable, row, {
    name: row.name,
    description: row.description,
    provider: row.provider,
    model: row.model,
    updatedAt: row.updatedAt,
  })
}

async function ensureWatchConversationAgents(db: PodPersistenceDb, runtime: WatchPodPersistenceRuntime, webId: string, record: WatchSessionRecord): Promise<void> {
  const now = record.endedAt ? new Date(record.endedAt) : new Date(record.startedAt)
  const rows: WatchAgentRow[] = [
    {
      id: WATCH_SECRETARY_AGENT_ID,
      name: 'AI Secretary',
      description: 'LinX companion that routes watch approvals and structured input.',
      provider: 'undefineds',
      model: DEFAULT_AGENT_RUNTIME_COMPANION_MODEL_ID,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: buildWatchPrimaryAgentId(record),
      name: watchBackendDisplayName(record.backend),
      description: `Watched ${watchBackendDisplayName(record.backend)} runtime participant.`,
      provider: record.backend,
      model: record.model ?? record.backend,
      createdAt: now,
      updatedAt: now,
    },
  ]

  for (const row of rows) {
    await ensureWatchConversationAgent(db, runtime, webId, row)
  }
}

async function upsertWatchConversationThread(db: PodPersistenceDb, runtime: WatchPodPersistenceRuntime, _webId: string, row: WatchThreadRow): Promise<void> {
  const threadId = row.id
  if (!threadId) {
    return
  }

  const existing = await selectById(db, runtime.threadTable, threadId, { chat: row.chat })

  if (!existing) {
    await db.insert(runtime.threadTable).values(row).execute()
    return
  }

  await updateByLocator(db, runtime.threadTable, row, {
    title: row.title,
    metadata: row.metadata,
    updatedAt: row.updatedAt,
  })
}

async function upsertWatchConversationMessages(
  db: PodPersistenceDb,
  runtime: WatchPodPersistenceRuntime,
  _webId: string,
  rows: PersistedWatchConversationMessage[],
): Promise<void> {
  for (const row of rows) {
    const existing = await selectById(db, runtime.messageTable, row.id, {
      chat: row.chat,
      createdAt: row.createdAt,
    })

    if (!existing) {
      await db.insert(runtime.messageTable).values(row).execute()
      continue
    }

    await updateByLocator(db, runtime.messageTable, row, {
      role: row.role,
      maker: row.maker,
      content: row.content,
      status: row.status,
      senderName: row.senderName,
      senderAvatarUrl: row.senderAvatarUrl,
      routedBy: row.routedBy,
      routeTargetAgentId: row.routeTargetAgentId,
      coordinationId: row.coordinationId,
      createdAt: row.createdAt,
    })
  }
}

export async function persistWatchConversationToPod(
  record: WatchSessionRecord,
  runtime?: WatchPodPersistenceRuntime,
): Promise<boolean> {
  const activeRuntime = runtime ?? await createDefaultRuntime()
  const podSession = await activeRuntime.getPodDataSession()
  if (!podSession) {
    return false
  }

  const db = activeRuntime.createDb(podSession)
  const entries = activeRuntime.loadWatchEvents(record.id)
  const transcriptRows = buildWatchConversationMessages(record, podSession.webId, entries)
  const lastPreview = transcriptRows.at(-1)?.content

  await db.init([
    activeRuntime.chatTable,
    activeRuntime.threadTable,
    activeRuntime.messageTable,
    activeRuntime.agentTable,
  ]).catch(() => undefined)
  await ensureWatchConversationChat(db, activeRuntime, podSession.webId, buildWatchConversationChatRow(record, podSession.webId, lastPreview))
  await ensureWatchConversationAgents(db, activeRuntime, podSession.webId, record)
  await upsertWatchConversationThread(db, activeRuntime, podSession.webId, buildWatchConversationThreadRow(record, transcriptRows))
  await upsertWatchConversationMessages(db, activeRuntime, podSession.webId, transcriptRows)
  return true
}

export const __podPersistenceInternal = {
  WATCH_CHAT_ID_PREFIX,
  WATCH_SECRETARY_AGENT_ID,
  WATCH_CHAT_TITLE,
  buildWatchChatId,
  buildWatchConversationChatRow,
  buildWatchConversationMessages,
  buildWatchPrimaryAgentId,
  buildWatchConversationThreadRow,
  buildWatchConversationThreadTitle,
}
