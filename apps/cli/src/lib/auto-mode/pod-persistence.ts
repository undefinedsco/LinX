import type { PodDataSession } from '../pod-data-session.js'
import { getDefaultPodDataSession } from '../pod-data-session.js'
import {
  agentResource,
  chatResource,
  messageResource,
  sessionResource,
  threadResource,
  threadRepository,
  type AnyPodResource,
  type SolidDatabase,
} from '../models.js'
import {
  buildAutoModeThreadMetadata,
  buildAutoModeTranscriptMessages,
  type AutoModeEventLogEntry,
  type AutoModeSessionRecord,
  type AutoModeTranscriptMessageSource,
} from '@linx/agent-runtime/auto-mode'
import {
  buildLinxSessionControlState,
  mergeLinxSessionControlMetadata,
} from '@linx/agent-runtime/control-plane'
import {
  createLinxPodSyncScope,
  type LinxSyncCheckpoint,
  type LinxSyncCheckpointStore,
  type LinxSyncOperation,
} from '@linx/agent-runtime/sync'
import { DEFAULT_AGENT_RUNTIME_COMPANION_MODEL_ID } from '@linx/agent-runtime/companion-model'
import { loadAutoModeEvents, writeAutoModeSyncCheckpoint } from './archive.js'

const AUTO_MODE_CHAT_ID_PREFIX = 'linx-auto-mode'
const AUTO_MODE_CHAT_TITLE = 'LinX Auto Mode'
const AUTO_MODE_SECRETARY_AGENT_ID = '__secretary__'

interface AutoModePodPersistenceRuntime {
  getPodDataSession: () => Promise<PodDataSession | null>
  createDb: (session: PodDataSession) => PodPersistenceDb
  chatResource: AnyPodResource
  threadResource: AnyPodResource
  messageResource: AnyPodResource
  sessionResource: AnyPodResource
  agentResource: AnyPodResource
  loadAutoModeEvents: (id: string) => AutoModeEventLogEntry[]
  writeSyncCheckpoint?: (record: AutoModeSessionRecord, checkpoint: LinxSyncCheckpoint) => void | Promise<void>
}

type PodPersistenceDb = SolidDatabase

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
  parent: string
  title: string
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

interface AutoModeSessionRow extends Record<string, unknown> {
  id: string
  owner: string
  chat: string
  thread: string
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
  routeTargetAgent?: string
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
    writeSyncCheckpoint: writeAutoModeSyncCheckpoint,
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

function buildAutoModeChatUri(webId: string, record: Pick<AutoModeSessionRecord, 'backend'>): string {
  return chatResource.buildIri(webId, { id: buildAutoModeChatId(record) })
}

function buildAutoModeThreadUri(webId: string, record: AutoModeSessionRecord): string {
  return threadRepository.iriForChat(webId, buildAutoModeChatId(record), record.id)
}

function buildAutoModeSessionUri(webId: string, record: AutoModeSessionRecord): string {
  return sessionResource.buildIri(webId, {
    id: record.id,
    createdAt: record.startedAt,
  })
}

function buildAutoModeMessageUri(webId: string, record: AutoModeSessionRecord, row: Pick<PersistedAutoModeConversationMessage, 'id' | 'createdAt'>): string {
  return messageResource.buildIri(webId, {
    id: row.id,
    chat: buildAutoModeChatUri(webId, record),
    thread: buildAutoModeThreadUri(webId, record),
    createdAt: row.createdAt ?? record.startedAt,
  })
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
    agentResource.buildIri(webId, { id: AUTO_MODE_SECRETARY_AGENT_ID }),
    agentResource.buildIri(webId, { id: buildAutoModePrimaryAgentId(record) }),
  ]
}

function buildAutoModeChatMetadata(webId: string, record: AutoModeSessionRecord): Record<string, unknown> {
  const secretaryAgentUri = agentResource.buildIri(webId, { id: AUTO_MODE_SECRETARY_AGENT_ID })
  const primaryAgentId = buildAutoModePrimaryAgentId(record)
  const primaryAgentUri = agentResource.buildIri(webId, { id: primaryAgentId })

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
  webId: string,
  transcript: Array<{ role: string; content: string }> = [],
): AutoModeThreadRow {
  const startedAt = new Date(record.startedAt)
  const updatedAt = record.endedAt ? new Date(record.endedAt) : startedAt
  const chatUri = buildAutoModeChatUri(webId, record)

  return {
    id: threadRepository.idForChat(chatUri, record.id),
    parent: chatUri,
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
  const metadata = mergeLinxSessionControlMetadata({
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
  }, buildLinxSessionControlState({
    autoEnabled: record.autoEnabled ?? record.mode === 'auto',
    updatedAt,
    updatedBy: 'cli',
  }))

  return {
    id: record.id,
    owner: webId,
    chat: buildAutoModeChatUri(webId, record),
    thread: buildAutoModeThreadUri(webId, record),
    status,
    tool: record.backend,
    tokenUsage: 0,
    policyVersion: 'linx-auto-mode-session/v1',
    metadata,
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
  routeTargetAgent?: string
} {
  const secretaryAgentUri = agentResource.buildIri(input.webId, { id: AUTO_MODE_SECRETARY_AGENT_ID })
  const primaryAgentId = buildAutoModePrimaryAgentId(input.record)
  const primaryAgentUri = agentResource.buildIri(input.webId, { id: primaryAgentId })

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
      routeTargetAgent: primaryAgentUri,
    }
  }

  return {
    maker: secretaryAgentUri,
    senderName: input.source === 'secretary' ? 'AI Secretary' : 'LinX AutoMode',
    routedBy: secretaryAgentUri,
    routeTargetAgent: primaryAgentUri,
  }
}

function buildAutoModeConversationMessages(
  record: AutoModeSessionRecord,
  webId: string,
  entries: AutoModeEventLogEntry[],
): PersistedAutoModeConversationMessage[] {
  const transcript = buildAutoModeTranscriptMessages(entries)
  const chatUri = buildAutoModeChatUri(webId, record)
  const threadUri = buildAutoModeThreadUri(webId, record)

  return transcript.map((message, index) => {
    const sender = resolveMessageSender({
      record,
      webId,
      source: message.source,
    })

    return {
      id: `${record.id}-m${String(index + 1).padStart(4, '0')}`,
      chat: chatUri,
      thread: threadUri,
      maker: sender.maker,
      role: message.role,
      content: message.content,
      status: 'sent',
      senderName: sender.senderName,
      routedBy: sender.routedBy,
      routeTargetAgent: sender.routeTargetAgent,
      coordinationId: record.id,
      createdAt: new Date(message.createdAt),
    }
  })
}

async function selectById(db: PodPersistenceDb, resource: AnyPodResource, id: string): Promise<unknown | null> {
  return await db.findById(resource, id)
}

async function ensureAutoModeConversationChat(db: PodPersistenceDb, runtime: AutoModePodPersistenceRuntime, webId: string, row: AutoModeChatRow): Promise<void> {
  const existing = await selectById(db, runtime.chatResource, row.id)

  if (!existing) {
    await db.insert(runtime.chatResource).values(row).execute()
    return
  }

  await db.updateById(runtime.chatResource, row.id, {
    title: row.title,
    participants: row.participants,
    metadata: row.metadata,
    lastActiveAt: row.lastActiveAt,
    lastMessagePreview: row.lastMessagePreview,
    updatedAt: row.updatedAt,
  })
}

async function ensureAutoModeConversationAgent(db: PodPersistenceDb, runtime: AutoModePodPersistenceRuntime, webId: string, row: AutoModeAgentRow): Promise<void> {
  const target = { id: row.id }
  const agentResourceWithId = runtime.agentResource as AnyPodResource & {
    buildId?: (target: Record<string, unknown>) => string
  }
  const canonicalRow = {
    ...row,
    id: typeof agentResourceWithId.buildId === 'function'
      ? agentResourceWithId.buildId(target)
      : row.id,
  }
  const existing = typeof db.findByResource === 'function'
    ? await db.findByResource(runtime.agentResource, target)
    : await selectById(db, runtime.agentResource, canonicalRow.id)
  if (!existing) {
    await db.insert(runtime.agentResource).values(canonicalRow).execute()
    return
  }

  if (row.id === AUTO_MODE_SECRETARY_AGENT_ID) {
    return
  }

  if (typeof db.updateByResource === 'function') {
    await db.updateByResource(runtime.agentResource, target, {
      name: row.name,
      description: row.description,
      provider: row.provider,
      model: row.model,
      updatedAt: row.updatedAt,
    })
    return
  }

  await db.updateById(runtime.agentResource, canonicalRow.id, {
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

    await db.updateById(runtime.threadResource, threadId, {
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

  await db.updateById(runtime.sessionResource, row.id, {
    owner: row.owner,
    chat: row.chat,
    thread: row.thread,
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

    await db.updateById(runtime.messageResource, row.id, {
      role: row.role,
      maker: row.maker,
      content: row.content,
      status: row.status,
      senderName: row.senderName,
      senderAvatarUrl: row.senderAvatarUrl,
      routedBy: row.routedBy,
      routeTargetAgent: row.routeTargetAgent,
      coordinationId: row.coordinationId,
      createdAt: row.createdAt,
    })
  }
}

export async function persistAutoModeConversationToPod(
  record: AutoModeSessionRecord,
  runtime?: AutoModePodPersistenceRuntime,
  options: { signal?: AbortSignal } = {},
): Promise<boolean> {
  const activeRuntime = runtime ?? await createDefaultRuntime()
  const podSession = await activeRuntime.getPodDataSession()
  if (!podSession) {
    return false
  }

  const abortablePodSession = options.signal
    ? withAbortablePodSession(podSession, options.signal)
    : podSession
  throwIfAborted(options.signal)

  const db = activeRuntime.createDb(abortablePodSession)
  const entries = activeRuntime.loadAutoModeEvents(record.id)
  const transcriptRows = buildAutoModeConversationMessages(record, abortablePodSession.webId, entries)
  const lastPreview = transcriptRows.at(-1)?.content

  throwIfAborted(options.signal)
  const checkpoint: LinxSyncCheckpointStore | undefined = activeRuntime.writeSyncCheckpoint
    ? {
      writeCheckpoint: (value) => activeRuntime.writeSyncCheckpoint?.(record, value),
    }
    : undefined
  const projectionSync = createLinxPodSyncScope({
    source: 'auto-mode-archive',
    signal: options.signal,
    checkpoint,
  })
  await projectionSync.runOperations({
    action: 'conversation.project',
    resourceBindings: {
      session: {
        uri: buildAutoModeSessionUri(abortablePodSession.webId, record),
        local: record.id,
      },
      chat: {
        uri: buildAutoModeChatUri(abortablePodSession.webId, record),
        local: buildAutoModeChatId(record),
      },
      thread: {
        uri: buildAutoModeThreadUri(abortablePodSession.webId, record),
        local: record.id,
      },
    },
    metadata: {
      sessionId: record.id,
      backend: record.backend,
    },
    operations: buildAutoModeConversationProjectionOperations({
      db,
      runtime: activeRuntime,
      record,
      webId: abortablePodSession.webId,
      transcriptRows,
      lastPreview,
    }),
  })
  return true
}

function buildAutoModeConversationProjectionOperations(input: {
  db: PodPersistenceDb
  runtime: AutoModePodPersistenceRuntime
  record: AutoModeSessionRecord
  webId: string
  transcriptRows: PersistedAutoModeConversationMessage[]
  lastPreview?: string
}): LinxSyncOperation[] {
  return [
    {
      id: 'auto-mode.prepare-resources',
      kind: 'prepare',
      apply: async () => {
        await input.db.init([
          input.runtime.chatResource,
          input.runtime.threadResource,
          input.runtime.messageResource,
          input.runtime.sessionResource,
          input.runtime.agentResource,
        ]).catch(() => undefined)
      },
    },
    {
      id: 'auto-mode.upsert-chat',
      kind: 'upsert',
      apply: () => ensureAutoModeConversationChat(
        input.db,
        input.runtime,
        input.webId,
        buildAutoModeConversationChatRow(input.record, input.webId, input.lastPreview),
      ),
    },
    {
      id: 'auto-mode.upsert-agents',
      kind: 'upsert',
      apply: () => ensureAutoModeConversationAgents(input.db, input.runtime, input.webId, input.record),
    },
    {
      id: 'auto-mode.upsert-thread',
      kind: 'upsert',
      apply: () => upsertAutoModeConversationThread(
        input.db,
        input.runtime,
        input.webId,
        buildAutoModeConversationThreadRow(input.record, input.webId, input.transcriptRows),
        input.record,
      ),
    },
    {
      id: 'auto-mode.upsert-session',
      kind: 'upsert',
      plane: 'control-plane',
      authority: 'core',
      apply: () => upsertAutoModeConversationSession(
        input.db,
        input.runtime,
        input.webId,
        buildAutoModeConversationSessionRow(input.record, input.webId),
        input.record,
      ),
    },
    {
      id: 'auto-mode.upsert-messages',
      kind: 'upsert',
      apply: () => upsertAutoModeConversationMessages(
        input.db,
        input.runtime,
        input.webId,
        input.record,
        input.transcriptRows,
      ),
    },
  ]
}

function withAbortablePodSession(podSession: PodDataSession, signal: AbortSignal): PodDataSession {
  return {
    ...podSession,
    fetch: (url, init) => {
      throwIfAborted(signal)
      return podSession.fetch(url, {
        ...init,
        signal: init?.signal ? combineAbortSignals(init.signal, signal) : signal,
      })
    },
    solidSession: {
      ...podSession.solidSession,
      fetch: (input, init) => {
        throwIfAborted(signal)
        return podSession.solidSession.fetch(input, {
          ...init,
          signal: init?.signal ? combineAbortSignals(init.signal, signal) : signal,
        })
      },
    },
  }
}

function combineAbortSignals(left: AbortSignal, right: AbortSignal): AbortSignal {
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([left, right])
  }
  const controller = new AbortController()
  const abort = () => controller.abort(left.reason ?? right.reason)
  if (left.aborted || right.aborted) {
    abort()
    return controller.signal
  }
  left.addEventListener('abort', abort, { once: true })
  right.addEventListener('abort', abort, { once: true })
  return controller.signal
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return
  }
  const reason = signal.reason
  if (reason instanceof Error) {
    throw reason
  }
  throw new Error(typeof reason === 'string' && reason.trim() ? reason : 'Pod sync aborted')
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
