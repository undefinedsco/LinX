import type { PodDataSession } from '../pod-data-session.js'
import { getDefaultPodDataSession } from '../pod-data-session.js'
import {
  type AnyPodResource,
  type SolidDatabase,
} from '../models.js'
import {
  type AutoModeEventLogEntry,
  type AutoModeSessionRecord,
} from '@linx/agent-runtime/auto-mode'
import {
  createLinxPodSyncScope,
  type LinxSyncCheckpoint,
  type LinxSyncCheckpointStore,
  type LinxSyncOperation,
} from '@linx/agent-runtime/sync'
import { DEFAULT_AGENT_RUNTIME_COMPANION_MODEL_ID } from '@linx/agent-runtime/companion-model'
import { loadAutoModeEvents, writeAutoModeSyncCheckpoint } from './archive.js'
import {
  AUTO_MODE_SECRETARY_AGENT_ID,
  autoModeBackendDisplayName,
  buildAutoModeChatId,
  buildAutoModeChatUri,
  buildAutoModeConversationChatRow,
  buildAutoModeConversationMessages,
  buildAutoModeConversationSessionRow,
  buildAutoModeConversationThreadRow,
  buildAutoModePrimaryAgentId,
  buildAutoModeSessionUri,
  buildAutoModeThreadUri,
  type AutoModeAgentRow,
  type AutoModeChatRow,
  type AutoModeSessionRow,
  type AutoModeThreadRow,
  type PersistedAutoModeConversationMessage,
} from './pod-persistence-builders.js'

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
      metadata: row.metadata,
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
