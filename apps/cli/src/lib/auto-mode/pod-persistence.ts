import type { PodDataSession } from '../pod-data-session.js'
import { getDefaultPodDataSession } from '../pod-data-session.js'
import { buildSessionSubjectPath } from '../models.js'
import {
  buildAutoModeThreadMetadata,
  buildAutoModeTranscriptMessages,
  type AutoModeEventLogEntry,
  type AutoModeSessionRecord,
  type AutoModeTranscriptMessageSource,
} from '@linx/agent-runtime/auto-mode'
import { DEFAULT_AGENT_RUNTIME_COMPANION_MODEL_ID } from '@linx/agent-runtime/companion-model'
import { loadAutoModeEvents } from './archive.js'

const AUTO_MODE_CHAT_ID_PREFIX = 'linx-auto-mode'
const AUTO_MODE_CHAT_TITLE = 'LinX Auto Mode'
const AUTO_MODE_SECRETARY_AGENT_ID = 'linx-auto-mode-assistant'

interface AutoModePodPersistenceRuntime {
  getPodDataSession: () => Promise<PodDataSession | null>
  createDb: (session: PodDataSession) => PodPersistenceDb
  chatResource: unknown
  threadResource: unknown
  messageResource: unknown
  sessionResource: unknown
  agentResource: unknown
  loadAutoModeEvents: (id: string) => AutoModeEventLogEntry[]
}

interface PodPersistenceDb {
  init(resources: unknown[]): Promise<unknown>
  findById?: (resource: unknown, id: string) => Promise<unknown | null>
  select(): {
    from(resource: unknown): {
      execute(): Promise<unknown[]>
      where(condition: unknown): {
        limit(limit: number): {
          execute(): Promise<unknown[]>
        }
      }
    }
  }
  insert(resource: unknown): {
    values(value: Record<string, unknown>): {
      execute(): Promise<unknown>
    }
  }
  update(resource: unknown): {
    set(value: Record<string, unknown>): {
      where(condition: unknown): {
        execute(): Promise<unknown>
      }
    }
  }
  updateById?: (resource: unknown, id: string, value: Record<string, unknown>) => Promise<unknown>
}

interface AutoModeChatRow extends Record<string, unknown> {
  id: string
  title: string
  participants: string[]
  metadata: Record<string, unknown>
  lastActiveAt: Date
  lastMessagePreview?: string
  createdAt: Date
  updatedAt: Date
}

interface AutoModeThreadRow extends Record<string, unknown> {
  id: string
  chat: string
  title: string
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

interface AutoModeSessionRow extends Record<string, unknown> {
  id: string
  ownerWebId: string
  chat: string
  thread: string
  sessionType: 'group'
  status: 'active' | 'completed' | 'error'
  tool: string
  tokenUsage: number
  policyVersion?: string
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
  archivedAt?: Date
}

interface PersistedAutoModeConversationMessage extends Record<string, unknown> {
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

interface AutoModeAgentRow extends Record<string, unknown> {
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

async function createDefaultRuntime(): Promise<AutoModePodPersistenceRuntime> {
  const [models] = await Promise.all([
    dynamicImport(new URL('../models.js', import.meta.url).href),
  ])

  return {
    getPodDataSession: getDefaultPodDataSession,
    createDb(podSession) {
      return models.drizzle(podSession.solidSession, {
        logger: false,
        disableInteropDiscovery: true,
        podUrl: podSession.podUrl,
        resourcePreparation: 'best-effort' as never,
        schema: models.solidResources,
      }) as unknown as PodPersistenceDb
    },
    chatResource: models.chatResource,
    threadResource: models.threadResource,
    messageResource: models.messageResource,
    sessionResource: models.sessionResource,
    agentResource: models.agentResource,
    loadAutoModeEvents,
  }
}

function normalizeTitle(text: string, width = 72): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return 'AutoMode Session'
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

function buildAutoModeChatUri(webId: string, record: Pick<AutoModeSessionRecord, 'backend'>): string {
  return `${getPodBaseUrl(webId)}/.data/chat/${buildAutoModeChatId(record)}/index.ttl#this`
}

function buildAutoModeThreadUri(webId: string, record: AutoModeSessionRecord): string {
  return `${getPodBaseUrl(webId)}/.data/chat/${buildAutoModeChatId(record)}/index.ttl#${encodeURIComponent(record.id)}`
}

function buildAutoModeSessionUri(webId: string, record: AutoModeSessionRecord): string {
  return buildPodIri(webId, buildSessionSubjectPath(record.id, record.startedAt))
}

function buildAutoModeMessageUri(webId: string, record: AutoModeSessionRecord, row: Pick<PersistedAutoModeConversationMessage, 'id' | 'createdAt'>): string {
  const createdAt = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)
  const safeDate = Number.isFinite(createdAt.getTime()) ? createdAt : new Date(record.startedAt)
  const yyyy = String(safeDate.getUTCFullYear())
  const mm = String(safeDate.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(safeDate.getUTCDate()).padStart(2, '0')
  return `${getPodBaseUrl(webId)}/.data/chat/${buildAutoModeChatId(record)}/${yyyy}/${mm}/${dd}/messages.ttl#${encodeURIComponent(row.id)}`
}

function buildAgentUri(webId: string, agentId: string): string {
  return `${getPodBaseUrl(webId)}/.data/agents/${agentId}.ttl`
}

function buildAutoModeChatId(record: Pick<AutoModeSessionRecord, 'backend'>): string {
  return `${AUTO_MODE_CHAT_ID_PREFIX}-${record.backend}`
}

function buildAutoModePrimaryAgentId(record: Pick<AutoModeSessionRecord, 'backend'>): string {
  return `${AUTO_MODE_CHAT_ID_PREFIX}-${record.backend}-agent`
}

function autoModeBackendDisplayName(backend: AutoModeSessionRecord['backend']): string {
  if (backend === 'codex') return 'Codex'
  if (backend === 'claude') return 'Claude Code'
  if (backend === 'codebuddy') return 'CodeBuddy'
  return backend
}

function buildAutoModeParticipants(webId: string, record: Pick<AutoModeSessionRecord, 'backend'>): string[] {
  return [
    webId,
    buildAgentUri(webId, AUTO_MODE_SECRETARY_AGENT_ID),
    buildAgentUri(webId, buildAutoModePrimaryAgentId(record)),
  ]
}

function buildAutoModeChatMetadata(webId: string, record: AutoModeSessionRecord): Record<string, unknown> {
  const secretaryAgentUri = buildAgentUri(webId, AUTO_MODE_SECRETARY_AGENT_ID)
  const primaryAgentId = buildAutoModePrimaryAgentId(record)
  const primaryAgentUri = buildAgentUri(webId, primaryAgentId)

  return {
    kind: 'auto-mode-group',
    surface: 'auto-mode',
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
      { uri: primaryAgentUri, role: 'primary-agent', label: autoModeBackendDisplayName(record.backend) },
    ],
  }
}

function buildAutoModeConversationThreadTitle(
  record: AutoModeSessionRecord,
  transcript: Array<{ role: string; content: string }> = [],
): string {
  const firstUserTurn = transcript.find((message) => message.role === 'user')?.content
  const base = firstUserTurn?.trim() || record.prompt?.trim() || `${record.backend} auto-mode`
  return normalizeTitle(`${record.backend} · ${base}`)
}

function buildAutoModeConversationChatRow(record: AutoModeSessionRecord, webId: string, lastPreview?: string): AutoModeChatRow {
  const startedAt = new Date(record.startedAt)
  const updatedAt = record.endedAt ? new Date(record.endedAt) : startedAt

  return {
    id: buildAutoModeChatId(record),
    title: `${AUTO_MODE_CHAT_TITLE} · ${autoModeBackendDisplayName(record.backend)}`,
    participants: buildAutoModeParticipants(webId, record),
    metadata: buildAutoModeChatMetadata(webId, record),
    lastActiveAt: updatedAt,
    lastMessagePreview: lastPreview ? normalizeTitle(lastPreview, 100) : undefined,
    createdAt: startedAt,
    updatedAt,
  }
}

function buildAutoModeConversationThreadRow(
  record: AutoModeSessionRecord,
  transcript: Array<{ role: string; content: string }> = [],
): AutoModeThreadRow {
  const startedAt = new Date(record.startedAt)
  const updatedAt = record.endedAt ? new Date(record.endedAt) : startedAt

  return {
    id: record.id,
    chat: buildAutoModeChatId(record),
    title: buildAutoModeConversationThreadTitle(record, transcript),
    metadata: {
      ...buildAutoModeThreadMetadata(record),
      chatId: buildAutoModeChatId(record),
    },
    createdAt: startedAt,
    updatedAt,
  }
}

function buildAutoModeConversationSessionRow(
  record: AutoModeSessionRecord,
  webId: string,
): AutoModeSessionRow {
  const startedAt = new Date(record.startedAt)
  const updatedAt = record.endedAt ? new Date(record.endedAt) : startedAt
  const status = record.status === 'failed'
    ? 'error'
    : record.status === 'completed'
      ? 'completed'
      : 'active'

  return {
    id: record.id,
    ownerWebId: webId,
    chat: buildAutoModeChatUri(webId, record),
    thread: buildAutoModeThreadUri(webId, record),
    sessionType: 'group',
    status,
    tool: record.backend,
    tokenUsage: 0,
    policyVersion: 'linx-auto-mode-session/v1',
    metadata: {
      ...buildAutoModeThreadMetadata(record),
      backendSessionId: record.backendSessionId,
      command: record.command,
      args: record.args,
      credentialSource: record.credentialSource,
      resolvedCredentialSource: record.resolvedCredentialSource,
      approvalSource: record.approvalSource,
      exitCode: record.exitCode,
      signal: record.signal,
      error: record.error,
    },
    createdAt: startedAt,
    updatedAt,
    ...(record.endedAt ? { archivedAt: updatedAt } : {}),
  }
}

function resolveMessageSender(input: {
  record: AutoModeSessionRecord
  webId: string
  source: AutoModeTranscriptMessageSource
}): {
  maker: string
  senderName: string
  routedBy?: string
  routeTargetAgentId?: string
} {
  const secretaryAgentUri = buildAgentUri(input.webId, AUTO_MODE_SECRETARY_AGENT_ID)
  const primaryAgentId = buildAutoModePrimaryAgentId(input.record)
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
      senderName: autoModeBackendDisplayName(input.record.backend),
    }
  }

  if (input.source === 'tool') {
    return {
      maker: primaryAgentUri,
      senderName: `${autoModeBackendDisplayName(input.record.backend)} Tool`,
      routedBy: primaryAgentUri,
      routeTargetAgentId: primaryAgentId,
    }
  }

  return {
    maker: secretaryAgentUri,
    senderName: input.source === 'secretary' ? 'AI Secretary' : 'LinX AutoMode',
    routedBy: secretaryAgentUri,
    routeTargetAgentId: primaryAgentId,
  }
}

function buildAutoModeConversationMessages(
  record: AutoModeSessionRecord,
  webId: string,
  entries: AutoModeEventLogEntry[],
): PersistedAutoModeConversationMessage[] {
  const transcript = buildAutoModeTranscriptMessages(entries)
  const chatId = buildAutoModeChatId(record)

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

function requireFindById(db: PodPersistenceDb): NonNullable<PodPersistenceDb['findById']> {
  if (typeof db.findById !== 'function') {
    throw new Error('Solid database does not support findById.')
  }
  return db.findById.bind(db)
}

function requireUpdateById(db: PodPersistenceDb): NonNullable<PodPersistenceDb['updateById']> {
  if (typeof db.updateById !== 'function') {
    throw new Error('Solid database does not support updateById.')
  }
  return db.updateById.bind(db)
}

async function selectById(db: PodPersistenceDb, resource: unknown, id: string): Promise<unknown | null> {
  return await requireFindById(db)(resource, id)
}

async function ensureAutoModeConversationChat(db: PodPersistenceDb, runtime: AutoModePodPersistenceRuntime, webId: string, row: AutoModeChatRow): Promise<void> {
  const existing = await selectById(db, runtime.chatResource, row.id)

  if (!existing) {
    await db.insert(runtime.chatResource).values(row).execute()
    return
  }

  await requireUpdateById(db)(runtime.chatResource, row.id, {
    title: row.title,
    participants: row.participants,
    metadata: row.metadata,
    lastActiveAt: row.lastActiveAt,
    lastMessagePreview: row.lastMessagePreview,
    updatedAt: row.updatedAt,
  })
}

async function ensureAutoModeConversationAgent(db: PodPersistenceDb, runtime: AutoModePodPersistenceRuntime, webId: string, row: AutoModeAgentRow): Promise<void> {
  const existing = await selectById(db, runtime.agentResource, row.id)
  if (!existing) {
    await db.insert(runtime.agentResource).values(row).execute()
    return
  }

  await requireUpdateById(db)(runtime.agentResource, row.id, {
    name: row.name,
    description: row.description,
    provider: row.provider,
    model: row.model,
    updatedAt: row.updatedAt,
  })
}

async function ensureAutoModeConversationAgents(db: PodPersistenceDb, runtime: AutoModePodPersistenceRuntime, webId: string, record: AutoModeSessionRecord): Promise<void> {
  const now = record.endedAt ? new Date(record.endedAt) : new Date(record.startedAt)
  const rows: AutoModeAgentRow[] = [
    {
      id: AUTO_MODE_SECRETARY_AGENT_ID,
      name: 'AI Secretary',
      description: 'LinX companion that routes auto-mode approvals and structured input.',
      provider: 'undefineds',
      model: DEFAULT_AGENT_RUNTIME_COMPANION_MODEL_ID,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: buildAutoModePrimaryAgentId(record),
      name: autoModeBackendDisplayName(record.backend),
      description: `Controlled ${autoModeBackendDisplayName(record.backend)} runtime participant.`,
      provider: record.backend,
      model: record.model ?? record.backend,
      createdAt: now,
      updatedAt: now,
    },
  ]

  for (const row of rows) {
    await ensureAutoModeConversationAgent(db, runtime, webId, row)
  }
}

async function upsertAutoModeConversationThread(db: PodPersistenceDb, runtime: AutoModePodPersistenceRuntime, webId: string, row: AutoModeThreadRow, record: AutoModeSessionRecord): Promise<void> {
  const threadId = row.id
  if (!threadId) {
    return
  }
  const existing = await selectById(db, runtime.threadResource, threadId)

  if (!existing) {
    await db.insert(runtime.threadResource).values(row).execute()
    return
  }

  await requireUpdateById(db)(runtime.threadResource, threadId, {
    title: row.title,
    metadata: row.metadata,
    updatedAt: row.updatedAt,
  })
}

async function upsertAutoModeConversationSession(db: PodPersistenceDb, runtime: AutoModePodPersistenceRuntime, webId: string, row: AutoModeSessionRow, record: AutoModeSessionRecord): Promise<void> {
  const existing = await selectById(db, runtime.sessionResource, row.id)

  if (!existing) {
    await db.insert(runtime.sessionResource).values(row).execute()
    return
  }

  await requireUpdateById(db)(runtime.sessionResource, row.id, {
    ownerWebId: row.ownerWebId,
    chat: row.chat,
    thread: row.thread,
    sessionType: row.sessionType,
    status: row.status,
    tool: row.tool,
    tokenUsage: row.tokenUsage,
    policyVersion: row.policyVersion,
    metadata: row.metadata,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
  })
}

async function upsertAutoModeConversationMessages(
  db: PodPersistenceDb,
  runtime: AutoModePodPersistenceRuntime,
  webId: string,
  record: AutoModeSessionRecord,
  rows: PersistedAutoModeConversationMessage[],
): Promise<void> {
  for (const row of rows) {
    const existing = await selectById(db, runtime.messageResource, row.id)

    if (!existing) {
      await db.insert(runtime.messageResource).values(row).execute()
      continue
    }

    await requireUpdateById(db)(runtime.messageResource, row.id, {
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

export async function persistAutoModeConversationToPod(
  record: AutoModeSessionRecord,
  runtime?: AutoModePodPersistenceRuntime,
): Promise<boolean> {
  const activeRuntime = runtime ?? await createDefaultRuntime()
  const podSession = await activeRuntime.getPodDataSession()
  if (!podSession) {
    return false
  }

  const db = activeRuntime.createDb(podSession)
  const entries = activeRuntime.loadAutoModeEvents(record.id)
  const transcriptRows = buildAutoModeConversationMessages(record, podSession.webId, entries)
  const lastPreview = transcriptRows.at(-1)?.content

  await db.init([
    activeRuntime.chatResource,
    activeRuntime.threadResource,
    activeRuntime.messageResource,
    activeRuntime.sessionResource,
    activeRuntime.agentResource,
  ]).catch(() => undefined)
  await ensureAutoModeConversationChat(db, activeRuntime, podSession.webId, buildAutoModeConversationChatRow(record, podSession.webId, lastPreview))
  await ensureAutoModeConversationAgents(db, activeRuntime, podSession.webId, record)
  await upsertAutoModeConversationThread(db, activeRuntime, podSession.webId, buildAutoModeConversationThreadRow(record, transcriptRows), record)
  await upsertAutoModeConversationSession(db, activeRuntime, podSession.webId, buildAutoModeConversationSessionRow(record, podSession.webId), record)
  await upsertAutoModeConversationMessages(db, activeRuntime, podSession.webId, record, transcriptRows)
  return true
}

export const __podPersistenceInternal = {
  AUTO_MODE_CHAT_ID_PREFIX,
  AUTO_MODE_SECRETARY_AGENT_ID,
  AUTO_MODE_CHAT_TITLE,
  buildAutoModeChatId,
  buildAutoModeConversationChatRow,
  buildAutoModeConversationMessages,
  buildAutoModePrimaryAgentId,
  buildAutoModeConversationThreadRow,
  buildAutoModeConversationThreadTitle,
  buildAutoModeConversationSessionRow,
  buildAutoModeChatUri,
  buildAutoModeThreadUri,
  buildAutoModeSessionUri,
  buildAutoModeMessageUri,
}
