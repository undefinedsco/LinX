import { setTimeout as delay } from 'node:timers/promises'
import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { SessionEntry, SessionManager } from '@earendil-works/pi-coding-agent'
import {
  createAgentRuntimeConfigSnapshot,
  type AgentRuntimeSkillSnapshot,
} from '@linx/agent-runtime'
import {
  buildLinxSessionControlState,
  mergeLinxSessionControlMetadata,
} from '@linx/agent-runtime/control-plane'
import {
  createLinxPodSyncQueue,
  listLinxSyncCheckpoints,
  type LinxPodSyncQueue,
  type LinxPodSyncResourceBindings,
  type LinxSyncCheckpoint,
  type LinxSyncContext,
  type LinxSyncCheckpointStore,
  type LinxSyncRunResult,
} from '@linx/agent-runtime/sync'
import { upsertExactRecord } from '@undefineds.co/drizzle-solid'
import { DEFAULT_LINX_CLOUD_MODEL_ID } from '../default-model.js'
import { getDefaultPodDataSession, type PodDataSession } from '../pod-data-session.js'
import {
  agentResource,
  auditResource,
  chatResource,
  drizzle,
  messageResource,
  sessionResource,
  skillResource,
  solidResources,
  threadResource,
  type AuditInsert,
  type ChatInsert,
  type MessageInsert,
  type SessionInsert,
  type SkillInsert,
  type SolidDatabase,
  type ThreadInsert,
} from '../models.js'
export { buildPodMessageRow } from './pod-mirror-mapping.js'
import {
  DEFAULT_SECRETARY_CHAT_ID,
  PI_AGENT_ID,
  buildPodMessageRow as buildPodMessageRowFromMapping,
  buildThreadTitle,
  buildToolAuditId,
  calculateTokenUsage,
  getActiveSessionEntries,
  pathToWorkspaceUri,
  sanitizePodLiteralText,
  secretaryThreadResourceId,
} from './pod-mirror-mapping.js'

const PI_POLICY_VERSION = 'linx-pi-pod-mirror/v1'
const PI_SYMPHONY_SKILL_ID = 'symphony'
const POD_MIRROR_TRANSIENT_RETRY_DELAYS_MS = [250, 1_000, 2_500] as const

interface PodMirrorRuntime {
  getPodDataSession(): Promise<PodDataSession | null>
  createDb?: (session: PodDataSession) => SolidDatabase
}

export interface LinxPiPodMirrorOptions {
  cwd: string
  sessionManager: SessionManager
  runtime?: Partial<PodMirrorRuntime>
  onError?: (error: unknown) => void
  checkpointStore?: LinxSyncCheckpointStore
  autoEnabled?: boolean
  symphonyEnabled?: boolean
  syncConversationRoot?: boolean
}

export interface LinxPiPodMirrorRewindProjectionInput {
  previousSessionId?: string
  previousSessionFile?: string
  previousCreatedAt?: Date | string | number
  cleanSessionId?: string
  cleanSessionFile?: string
  abandonedEntries?: SessionEntry[]
}

interface PodMirrorContext {
  db: SolidDatabase
  webId: string
}

interface PiResourceRefs {
  agentUri: string
  chatUri: string
  sessionUri: string
  symphonySkillUri: string
  threadUri: string
}

export class LinxPiPodMirror {
  private contextPromise: Promise<PodMirrorContext | null> | null = null
  private readonly queue: LinxPodSyncQueue
  private readonly seenMessageIds = new Set<string>()
  private readonly messageResourceRefs = new Set<string>()
  private readonly runtimePromise: Promise<PodMirrorRuntime>
  private readonly syncCheckpoints = new Map<string, LinxSyncCheckpoint>()
  private readonly syncResults: LinxSyncRunResult[] = []
  private projectionDisabledReason: string | null = null
  private closed = false
  private taskSeq = 0

  constructor(private readonly options: LinxPiPodMirrorOptions) {
    this.runtimePromise = createDefaultRuntime(options.runtime)
    this.queue = createLinxPodSyncQueue({
      source: 'pi-runtime',
      target: 'pod',
      direction: 'local-to-core',
      plane: 'projection',
      authority: 'core',
      metadata: {
        cwd: options.cwd,
      },
      onError: options.onError,
      checkpoint: {
        writeCheckpoint: async (checkpoint) => {
          this.syncCheckpoints.set(checkpoint.id, checkpoint)
          await options.checkpointStore?.writeCheckpoint(checkpoint)
        },
        readCheckpoint: options.checkpointStore?.readCheckpoint?.bind(options.checkpointStore),
        listCheckpoints: options.checkpointStore?.listCheckpoints?.bind(options.checkpointStore),
        deleteCheckpoint: options.checkpointStore?.deleteCheckpoint?.bind(options.checkpointStore),
      },
      onResult: (result) => {
        this.syncResults.push(result)
      },
    })
  }

  handleEvent(event: unknown): void {
    if (this.closed || !isRecord(event)) {
      return
    }
    if (this.projectionDisabledReason) {
      return
    }

    if (event.type === 'message_end') {
      this.enqueue('message_end', async () => {
        const message = event.message as AgentMessage | undefined
        const entry = this.resolveLatestEntryForMessage(message)
        if (!entry || this.seenMessageIds.has(entry.id)) {
          return
        }
        if (await this.persistEntry(entry)) {
          this.seenMessageIds.add(entry.id)
        }
      })
      return
    }

    if (event.type === 'tool_execution_start') {
      this.enqueue('tool_execution_start', () => this.persistToolAudit('tool_execution_started', event))
      return
    }

    if (event.type === 'tool_execution_end') {
      this.enqueue('tool_execution_end', () => this.persistToolAudit(
        event.isError ? 'tool_execution_failed' : 'tool_execution_completed',
        event,
      ))
      return
    }

    if (event.type === 'agent_end') {
      this.enqueue('agent_end', () => this.persistUnseenMessageEntries())
    }
  }

  async flush(): Promise<void> {
    await this.queue.flush()
  }

  getSyncCheckpoints(): LinxSyncCheckpoint[] {
    return [...this.syncCheckpoints.values()]
  }

  getSyncResults(): LinxSyncRunResult[] {
    return [...this.syncResults]
  }

  syncAutoControlState(enabled: boolean): Promise<LinxSyncRunResult | null> {
    this.options.autoEnabled = enabled
    if (this.projectionDisabledReason) {
      return Promise.resolve(null)
    }
    return this.enqueue('auto_control_state', async () => {
      const context = await this.getContext()
      if (!context) {
        throw new Error('Pod data session unavailable for Pi control-plane sync')
      }

      const refs = resolvePiResourceRefs(context, this.options)
      if (this.options.syncConversationRoot) {
        await ensurePiConversationRoot(context, this.options, refs)
      }

      await persistRuntimeSession(
        context,
        this.options,
        refs,
        'active',
        this.messageResourceRefs,
      )
    }, {
      autoEnabled: enabled,
    }, {
      plane: 'control-plane',
      authority: 'core',
    })
  }

  syncSymphonyControlState(enabled: boolean): Promise<LinxSyncRunResult | null> {
    this.options.symphonyEnabled = enabled
    if (this.projectionDisabledReason) {
      return Promise.resolve(null)
    }
    return this.enqueue('symphony_control_state', async () => {
      const context = await this.getContext()
      if (!context) {
        throw new Error('Pod data session unavailable for Pi control-plane sync')
      }

      const refs = resolvePiResourceRefs(context, this.options)
      if (this.options.syncConversationRoot) {
        await ensurePiConversationRoot(context, this.options, refs)
      }

      await persistRuntimeSession(
        context,
        this.options,
        refs,
        'active',
        this.messageResourceRefs,
      )
    }, {
      symphonyEnabled: enabled,
    }, {
      plane: 'control-plane',
      authority: 'core',
    })
  }

  syncRewindProjection(input: LinxPiPodMirrorRewindProjectionInput): Promise<LinxSyncRunResult | null> {
    if (this.projectionDisabledReason) {
      return Promise.resolve(null)
    }
    return this.enqueue('rewind_projection', async () => {
      const context = await this.getContext()
      if (!context) {
        throw new Error('Pod data session unavailable for Pi rewind projection')
      }

      const refs = resolvePiResourceRefs(context, this.options)
      if (this.options.syncConversationRoot) {
        await ensurePiConversationRoot(context, this.options, refs)
      }

      await archivePreviousRuntimeSession(context, this.options, input)
      await markAbandonedPreviousMessages(context, this.options, input)

      this.seenMessageIds.clear()
      this.messageResourceRefs.clear()
      await this.persistUnseenMessageEntries()
      await persistRuntimeSession(context, this.options, refs, 'active', this.messageResourceRefs)
    }, {
      previousSessionId: input.previousSessionId,
      cleanSessionId: input.cleanSessionId,
      abandonedEntries: input.abandonedEntries?.length ?? 0,
    }, {
      plane: 'projection',
      authority: 'core',
    })
  }

  async replayPendingSync(): Promise<LinxSyncRunResult[]> {
    const checkpointStore = this.options.checkpointStore
    if (!checkpointStore) {
      return []
    }

    const pending = await listLinxSyncCheckpoints(checkpointStore, {
      source: 'pi-runtime',
      target: 'pod',
      plane: 'projection',
      status: ['failed', 'partial'],
      metadata: {
        resourceBindings: {
          session: {
            local: this.options.sessionManager.getSessionId(),
          },
        },
      },
    })
    const replayablePending = pending.filter(isReplayablePiProjectionCheckpoint)
    if (replayablePending.length === 0) {
      return []
    }

    const result = await this.enqueue('retry_pending_projection', () => this.persistUnseenMessageEntries(), {
      retryOf: replayablePending.map((checkpoint) => checkpoint.id),
    })
    if (result?.status === 'completed') {
      await Promise.all(replayablePending.map((checkpoint) => checkpointStore.deleteCheckpoint?.(checkpoint.id)))
    }
    return result ? [result] : []
  }

  async close(): Promise<void> {
    if (this.closed) {
      return
    }
    this.closed = true
    if (this.projectionDisabledReason) {
      await this.queue.flush()
      return
    }
    this.enqueue('close', async () => {
      const context = await this.getContext()
      if (!context) {
        return
      }

      await persistRuntimeSession(
        context,
        this.options,
        resolvePiResourceRefs(context, this.options),
        'completed',
        this.messageResourceRefs,
      )
    })
    await this.queue.flush()
  }

  private enqueue(
    description: string,
    task: (context: LinxSyncContext) => Promise<void>,
    metadata: Record<string, unknown> = {},
    sync: { plane?: 'projection' | 'control-plane'; authority?: 'core' | 'local-runtime' } = {},
  ): Promise<LinxSyncRunResult | null> {
    if (this.projectionDisabledReason) {
      return Promise.resolve(null)
    }
    const action = `pi-pod-mirror.${description}`
    return this.queue.enqueue({
      id: this.nextTaskId(),
      action,
      description,
      kind: 'custom',
      plane: sync.plane,
      authority: sync.authority,
      resourceBindings: createPiPodMirrorSyncResourceBindings(this.options),
      metadata,
      resolveResourceBindings: async () => {
        const podContext = await this.getContext()
        return podContext ? createPiPodMirrorSyncResourceBindings(this.options, resolvePiResourceRefs(podContext, this.options)) : undefined
      },
      run: async (context) => {
        if (this.projectionDisabledReason) {
          return
        }
        try {
          await runWithTransientPodMirrorRetry(context, () => task(context))
        } catch (error) {
          if (isPodMirrorCircuitBreakerError(error)) {
            this.projectionDisabledReason = formatPodMirrorCircuitBreakerReason(error)
          }
          throw error
        }
      },
    })
  }

  private nextTaskId(): string {
    const sessionId = this.options.sessionManager.getSessionId()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    return `pi-pod-mirror:${sessionId}:${timestamp}:${++this.taskSeq}`
  }

  private resolveLatestEntryForMessage(message: AgentMessage | undefined): SessionEntry | null {
    if (!message) {
      return null
    }

    const entries = [...getActiveSessionEntries(this.options.sessionManager)].reverse()
    const timestamp = typeof (message as { timestamp?: unknown }).timestamp === 'number'
      ? (message as { timestamp: number }).timestamp
      : null
    for (const entry of entries) {
      if (entry.type !== 'message') {
        continue
      }
      if (entry.message === message) {
        return entry
      }
      if (
        timestamp !== null
        && typeof (entry.message as { timestamp?: unknown }).timestamp === 'number'
        && (entry.message as { timestamp: number }).timestamp === timestamp
        && (entry.message as { role?: unknown }).role === (message as { role?: unknown }).role
      ) {
        return entry
      }
    }

    return null
  }

  private async persistEntry(entry: SessionEntry): Promise<boolean> {
    const context = await this.getContext()
    if (entry.type !== 'message') {
      return true
    }
    if (!context) {
      throw new Error('Pod data session unavailable for Pi projection')
    }

    const refs = resolvePiResourceRefs(context, this.options)
    if (this.options.syncConversationRoot) {
      await ensurePiConversationRoot(context, this.options, refs)
    }

    const row = buildPodMessageRowFromMapping(context.webId, this.options, entry)
    if (!row) {
      return true
    }

    const resourceRef = await persistMessage(context, normalizePodMessageRow(context, row, refs))
    this.messageResourceRefs.add(resourceRef)
    await persistRuntimeSession(context, this.options, refs, 'active', this.messageResourceRefs)
    if (this.options.syncConversationRoot) {
      await touchPiConversation(context, this.options, refs, row.content)
    }
    return true
  }

  private async persistUnseenMessageEntries(): Promise<void> {
    for (const entry of getActiveSessionEntries(this.options.sessionManager)) {
      if (entry.type !== 'message' || this.seenMessageIds.has(entry.id)) {
        continue
      }
      if (await this.persistEntry(entry)) {
        this.seenMessageIds.add(entry.id)
      }
    }
  }

  private async persistToolAudit(action: string, event: Record<string, unknown>): Promise<void> {
    const context = await this.getContext()
    if (!context) {
      return
    }

    const toolCallId = typeof event.toolCallId === 'string' && event.toolCallId
      ? event.toolCallId
      : crypto.randomUUID()
    const refs = resolvePiResourceRefs(context, this.options)
    if (this.options.syncConversationRoot) {
      await ensurePiConversationRoot(context, this.options, refs)
    }
    await persistRuntimeSession(context, this.options, refs, 'active', this.messageResourceRefs)

    const id = buildToolAuditId(this.options.sessionManager.getSessionId(), toolCallId, action)
    const createdAt = toDate(event.createdAt) ?? toDate(event.timestamp) ?? new Date()
    await insertResource(context.db, auditResource, {
      id,
      action,
      actor: refs.agentUri,
      actorRole: 'assistant',
      onBehalfOf: context.webId,
      session: refs.sessionUri,
      entry: refs.threadUri,
      toolCallId,
      ...(typeof event.toolName === 'string' && event.toolName ? { toolName: event.toolName } : {}),
      policyVersion: PI_POLICY_VERSION,
      createdAt,
    } satisfies AuditInsert)
  }

  private async getContext(): Promise<PodMirrorContext | null> {
    if (!this.contextPromise) {
      this.contextPromise = this.createContext().catch((error) => {
        this.options.onError?.(error)
        return null
      })
    }

    return this.contextPromise
  }

  private async createContext(): Promise<PodMirrorContext | null> {
    const runtime = await this.runtimePromise
    const session = await runtime.getPodDataSession()
    if (!session) {
      return null
    }

    const db = runtime.createDb?.(session) ?? createPodMirrorDb(session)

    return {
      db,
      webId: session.webId,
    }
  }
}

async function ensurePiConversationRoot(
  context: PodMirrorContext,
  options: LinxPiPodMirrorOptions,
  refs: PiResourceRefs,
): Promise<void> {
  const now = new Date()
  const threadId = options.sessionManager.getSessionId()

  await upsertExactRecord(context.db, chatResource, { id: DEFAULT_SECRETARY_CHAT_ID }, {
    id: DEFAULT_SECRETARY_CHAT_ID,
    title: 'AI Secretary',
    participants: [context.webId, refs.agentUri],
    metadata: {
      kind: 'secretary-chat',
      surface: 'cli',
      agent: refs.agentUri,
    },
    lastActiveAt: now,
    createdAt: now,
    updatedAt: now,
  } satisfies ChatInsert, {
    title: 'AI Secretary',
    participants: [context.webId, refs.agentUri],
    metadata: {
      kind: 'secretary-chat',
      surface: 'cli',
      agent: refs.agentUri,
    },
    lastActiveAt: now,
    updatedAt: now,
  })

  const threadResourceId = secretaryThreadResourceId(threadId)
  await upsertExactRecord(context.db, threadResource, { id: threadResourceId }, {
    id: threadResourceId,
    parent: refs.chatUri,
    title: buildThreadTitle(options.sessionManager),
    workspace: pathToWorkspaceUri(options.cwd),
    metadata: buildThreadMetadata(options),
    createdAt: getSessionCreatedAt(options.sessionManager),
    updatedAt: now,
  } satisfies ThreadInsert, {
    title: buildThreadTitle(options.sessionManager),
    workspace: pathToWorkspaceUri(options.cwd),
    metadata: buildThreadMetadata(options),
    updatedAt: now,
  })

  await upsertExactRecord(context.db, agentResource, { id: PI_AGENT_ID }, {
    id: agentResource.buildId({ id: PI_AGENT_ID }),
    name: 'LinX CLI Assistant',
    root: refs.agentUri,
    hasSkill: [refs.symphonySkillUri],
    provider: 'undefineds',
    backend: 'linx',
    runtime: 'pi',
    transport: 'pi-runtime',
    credentialSource: 'pod-session',
    model: DEFAULT_LINX_CLOUD_MODEL_ID,
    enabled: true,
    metadata: {
      kind: 'secretary-agent',
      surface: 'cli',
      fileBackedSkills: true,
    },
    createdAt: now,
    updatedAt: now,
  }, {
    name: 'LinX CLI Assistant',
    root: refs.agentUri,
    hasSkill: [refs.symphonySkillUri],
    provider: 'undefineds',
    backend: 'linx',
    runtime: 'pi',
    transport: 'pi-runtime',
    credentialSource: 'pod-session',
    model: DEFAULT_LINX_CLOUD_MODEL_ID,
    enabled: true,
    metadata: {
      kind: 'secretary-agent',
      surface: 'cli',
      fileBackedSkills: true,
    },
    updatedAt: now,
  })

  await upsertExactRecord(context.db, skillResource, {
    id: PI_SYMPHONY_SKILL_ID,
    agent: refs.agentUri,
  }, {
    id: skillResource.buildId({
      id: PI_SYMPHONY_SKILL_ID,
      agent: refs.agentUri,
    }),
    agent: refs.agentUri,
    root: refs.symphonySkillUri,
    name: PI_SYMPHONY_SKILL_ID,
    displayName: 'Symphony',
    enabled: true,
    source: 'linx-cli:skills/symphony',
    loadPolicy: 'file-backed',
    metadata: {
      file: 'SKILL.md',
      scope: 'linx-cli',
    },
    createdAt: now,
    updatedAt: now,
  } satisfies SkillInsert, {
    agent: refs.agentUri,
    root: refs.symphonySkillUri,
    name: PI_SYMPHONY_SKILL_ID,
    displayName: 'Symphony',
    enabled: true,
    source: 'linx-cli:skills/symphony',
    loadPolicy: 'file-backed',
    metadata: {
      file: 'SKILL.md',
      scope: 'linx-cli',
    },
    updatedAt: now,
  })
}

async function persistRuntimeSession(
  context: PodMirrorContext,
  options: LinxPiPodMirrorOptions,
  refs: PiResourceRefs,
  status: 'active' | 'completed' = 'active',
  _messageResourceRefs: Set<string> = new Set(),
): Promise<void> {
  const now = new Date()
  const threadId = options.sessionManager.getSessionId()
  const runtimeSessionId = threadId
  const createdAt = getSessionCreatedAt(options.sessionManager)
  const activeMessageResourceRefs = resolveActiveMessageResourceRefs(context, options, refs)
  const metadata = {
    cwd: options.cwd,
    sessionFile: options.sessionManager.getSessionFile(),
    runtime: 'pi',
    runtimeSessionId,
    surface: 'cli',
    threadUri: refs.threadUri,
    messages: [...activeMessageResourceRefs],
    runtimeSnapshot: createPiRuntimeSnapshot(refs, createdAt),
  }
  const controlState = buildLinxSessionControlState({
    autoEnabled: options.autoEnabled === true,
    symphonyEnabled: options.symphonyEnabled === true,
    updatedAt: now,
    updatedBy: 'cli',
  })
  const sessionMetadata = mergeLinxSessionControlMetadata(metadata, controlState)

  const row = {
    id: runtimeSessionId,
    owner: context.webId,
    chat: refs.chatUri,
    thread: refs.threadUri,
    sessionType: 'direct',
    status,
    tool: 'linx',
    tokenUsage: calculateTokenUsage(getActiveSessionEntries(options.sessionManager)),
    messages: [...activeMessageResourceRefs],
    policyVersion: PI_POLICY_VERSION,
    metadata: sessionMetadata,
    createdAt,
    updatedAt: now,
  } satisfies SessionInsert

  await upsertByIri(context.db, sessionResource, refs.sessionUri, row, {
    owner: context.webId,
    chat: refs.chatUri,
    thread: refs.threadUri,
    sessionType: 'direct',
    status,
    tool: 'linx',
    tokenUsage: row.tokenUsage,
    messages: [...activeMessageResourceRefs],
    policyVersion: PI_POLICY_VERSION,
    metadata: sessionMetadata,
    updatedAt: now,
  })
}

async function archivePreviousRuntimeSession(
  context: PodMirrorContext,
  options: LinxPiPodMirrorOptions,
  input: LinxPiPodMirrorRewindProjectionInput,
): Promise<void> {
  const previousSessionId = normalizeString(input.previousSessionId)
  if (!previousSessionId || previousSessionId === options.sessionManager.getSessionId()) {
    return
  }

  const previousCreatedAt = toDate(input.previousCreatedAt)
    ?? parseTimestampFromUuidLikeId(previousSessionId)
    ?? new Date()
  const previousRefs = resolvePiResourceRefsForSession(context, options, previousSessionId, previousCreatedAt)
  const existing = await context.db.findByIri(sessionResource, previousRefs.sessionUri) as SessionInsert | null
  if (!existing) {
    return
  }

  const now = new Date()
  const existingMetadataValue = (existing as Record<string, unknown>).metadata
  const existingMetadata: Record<string, unknown> = isRecord(existingMetadataValue)
    ? existingMetadataValue
    : {}
  await context.db.updateByIri(sessionResource, previousRefs.sessionUri, {
    status: 'archived',
    archivedAt: now,
    updatedAt: now,
    metadata: {
      ...existingMetadata,
      rewoundAt: now.toISOString(),
      rewoundToSessionId: options.sessionManager.getSessionId(),
      rewoundToSessionFile: normalizeString(input.cleanSessionFile),
      rewindPreviousSessionFile: normalizeString(input.previousSessionFile),
    },
  })
}

async function markAbandonedPreviousMessages(
  context: PodMirrorContext,
  options: LinxPiPodMirrorOptions,
  input: LinxPiPodMirrorRewindProjectionInput,
): Promise<void> {
  const previousSessionId = normalizeString(input.previousSessionId)
  const abandonedEntries = Array.isArray(input.abandonedEntries) ? input.abandonedEntries : []
  if (!previousSessionId || abandonedEntries.length === 0) {
    return
  }

  const previousCreatedAt = toDate(input.previousCreatedAt)
    ?? parseTimestampFromUuidLikeId(previousSessionId)
    ?? new Date()
  const previousRefs = resolvePiResourceRefsForSession(context, options, previousSessionId, previousCreatedAt)
  const previousSessionManager = {
    getSessionId: () => previousSessionId,
  } as unknown as SessionManager
  const now = new Date()

  for (const entry of abandonedEntries) {
    if (entry.type !== 'message') {
      continue
    }
    const row = buildPodMessageRowFromMapping(context.webId, { sessionManager: previousSessionManager }, entry)
    if (!row) {
      continue
    }
    const normalized = normalizePodMessageRow(context, row, previousRefs)
    const resourceRef = messageResource.buildIri(context.webId, {
      id: normalized.id,
      chat: normalized.chat,
      thread: normalized.thread,
      createdAt: normalized.createdAt,
    })
    const existing = await context.db.findByIri(messageResource, resourceRef)
    if (!existing) {
      continue
    }
    const existingMetadataValue = (existing as Record<string, unknown>).metadata
    const existingMetadata: Record<string, unknown> = isRecord(existingMetadataValue)
      ? existingMetadataValue
      : {}
    await context.db.updateByIri(messageResource, resourceRef, {
      status: 'abandoned',
      updatedAt: now,
      metadata: {
        ...existingMetadata,
        rewoundAt: now.toISOString(),
        rewoundFromSessionId: previousSessionId,
        rewoundToSessionId: options.sessionManager.getSessionId(),
      },
    })
  }
}

function resolveActiveMessageResourceRefs(
  context: PodMirrorContext,
  options: LinxPiPodMirrorOptions,
  refs: PiResourceRefs,
): Set<string> {
  const activeRefs = new Set<string>()
  for (const entry of getActiveSessionEntries(options.sessionManager)) {
    if (entry.type !== 'message') {
      continue
    }
    const row = buildPodMessageRowFromMapping(context.webId, options, entry)
    if (!row) {
      continue
    }
    const normalized = normalizePodMessageRow(context, row, refs)
    activeRefs.add(messageResource.buildIri(context.webId, {
      id: normalized.id,
      chat: normalized.chat,
      thread: normalized.thread,
      createdAt: normalized.createdAt,
    }))
  }
  return activeRefs
}

async function persistMessage(
  context: PodMirrorContext,
  row: NonNullable<ReturnType<typeof buildPodMessageRowFromMapping>>,
): Promise<string> {
  const insert = {
    id: row.id,
    chat: row.chat,
    thread: row.thread,
    maker: row.maker,
    role: row.role,
    content: sanitizePodLiteralText(row.content),
    ...(row.richContent ? { richContent: sanitizePodLiteralText(row.richContent) } : {}),
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  } satisfies MessageInsert
  const resourceRef = messageResource.buildIri(context.webId,  { id: row.id, chat: row.chat, thread: row.thread, createdAt: row.createdAt })
  await upsertByIri(context.db, messageResource, resourceRef, insert, {
    chat: row.chat,
    thread: row.thread,
    maker: row.maker,
    role: row.role,
    content: sanitizePodLiteralText(row.content),
    ...(row.richContent ? { richContent: sanitizePodLiteralText(row.richContent) } : {}),
    status: row.status,
    updatedAt: row.updatedAt,
  })
  return resourceRef
}

async function touchPiConversation(
  context: PodMirrorContext,
  options: LinxPiPodMirrorOptions,
  refs: PiResourceRefs,
  preview: string,
): Promise<void> {
  const now = new Date()
  const threadId = options.sessionManager.getSessionId()
  await context.db.updateById(chatResource, DEFAULT_SECRETARY_CHAT_ID, {
    lastMessagePreview: sanitizePodLiteralText(preview).slice(0, 100),
    lastActiveAt: now,
    updatedAt: now,
  })
  await context.db.updateByIri(threadResource, refs.threadUri, {
    title: buildThreadTitle(options.sessionManager),
    workspace: pathToWorkspaceUri(options.cwd),
    metadata: buildThreadMetadata(options),
    updatedAt: now,
  })
}

function createPodMirrorDb(session: PodDataSession): SolidDatabase {
  const solidSession = session.solidSession ?? {
    info: {
      isLoggedIn: true,
      webId: session.webId,
    },
    fetch: session.fetch,
    logout: async () => {},
  }

  return drizzle(solidSession, {
    logger: false,
    disableInteropDiscovery: true,
    podUrl: session.podUrl,
    resourcePreparation: 'best-effort' as never,
    schema: solidResources,
  }) as unknown as SolidDatabase
}

function resolvePiResourceRefs(context: PodMirrorContext, options: LinxPiPodMirrorOptions): PiResourceRefs {
  const sessionId = options.sessionManager.getSessionId()
  const createdAt = getSessionCreatedAt(options.sessionManager)
  return resolvePiResourceRefsForSession(context, options, sessionId, createdAt)
}

function resolvePiResourceRefsForSession(
  context: PodMirrorContext,
  _options: LinxPiPodMirrorOptions,
  sessionId: string,
  createdAt: Date,
): PiResourceRefs {
  const chatUri = chatResource.buildIri(context.webId,  { id: DEFAULT_SECRETARY_CHAT_ID })
  const agentUri = agentResource.buildIri(context.webId,  { id: PI_AGENT_ID })
  return {
    agentUri,
    chatUri,
    sessionUri: sessionResource.buildIri(context.webId,  { id: sessionId, createdAt }),
    symphonySkillUri: skillResource.buildIri(context.webId, {
      id: PI_SYMPHONY_SKILL_ID,
      agent: agentUri,
    }),
    threadUri: threadResource.buildIri(context.webId, { id: secretaryThreadResourceId(sessionId) }),
  }
}

function createPiPodMirrorSyncResourceBindings(
  options: LinxPiPodMirrorOptions,
  refs?: PiResourceRefs,
): LinxPodSyncResourceBindings {
  const sessionId = options.sessionManager.getSessionId()
  return {
    chat: { uri: refs?.chatUri, local: DEFAULT_SECRETARY_CHAT_ID },
    thread: { uri: refs?.threadUri, local: sessionId },
    session: { uri: refs?.sessionUri, local: sessionId },
    agent: { uri: refs?.agentUri, local: PI_AGENT_ID },
    skill: { uri: refs?.symphonySkillUri, local: PI_SYMPHONY_SKILL_ID },
  }
}

type PodMirrorMessageRow = NonNullable<ReturnType<typeof buildPodMessageRowFromMapping>>

function normalizePodMessageRow(
  context: PodMirrorContext,
  row: PodMirrorMessageRow,
  refs: PiResourceRefs,
): PodMirrorMessageRow {
  return {
    ...row,
    chat: refs.chatUri,
    thread: refs.threadUri,
    maker: row.role === 'user' ? context.webId : refs.agentUri,
  }
}

async function upsertByIri(
  db: SolidDatabase,
  resource: Parameters<SolidDatabase['findByIri']>[0],
  iri: string,
  insert: Record<string, unknown>,
  update: Record<string, unknown>,
): Promise<void> {
  const existing = await db.findByIri(resource, iri)
  if (!existing) {
    await db.insert(resource).values(insert).execute()
    return
  }
  await db.updateByIri(resource, iri, update)
}

async function runWithTransientPodMirrorRetry(
  context: LinxSyncContext,
  task: () => Promise<void>,
): Promise<void> {
  for (let attempt = 0; attempt <= POD_MIRROR_TRANSIENT_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      await task()
      return
    } catch (error) {
      if (attempt >= POD_MIRROR_TRANSIENT_RETRY_DELAYS_MS.length || !isTransientPodMirrorError(error)) {
        throw error
      }
      await delay(POD_MIRROR_TRANSIENT_RETRY_DELAYS_MS[attempt]!, undefined, { signal: context.signal })
    }
  }
}

function isTransientPodMirrorError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()
  if (normalized.includes('401') || normalized.includes('unauthorized')) {
    return false
  }
  if (normalized.includes('invalid unicode') || normalized.includes('surrogate pair') || normalized.includes('parse error')) {
    return false
  }
  return normalized.includes('http status 502')
    || normalized.includes('http status 503')
    || normalized.includes('http status 504')
    || normalized.includes('502 bad gateway')
    || normalized.includes('503 service unavailable')
    || normalized.includes('504 gateway timeout')
    || normalized.includes('bad gateway')
    || normalized.includes('service unavailable')
    || normalized.includes('gateway timeout')
    || normalized.includes('fetch failed')
    || normalized.includes('timed out')
    || normalized.includes('timeout')
}

function isPodMirrorCircuitBreakerError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()
  return normalized.includes('401')
    || normalized.includes('403')
    || normalized.includes('unauthorized')
    || normalized.includes('forbidden')
    || normalized.includes('invalid solid token')
    || normalized.includes('linx cloud login expired')
}

function formatPodMirrorCircuitBreakerReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return `Pod projection disabled for this session after auth/permission failure: ${message}`
}

async function insertResource(
  db: SolidDatabase,
  resource: Parameters<SolidDatabase['insert']>[0],
  insert: Record<string, unknown>,
): Promise<void> {
  await db.insert(resource).values(insert).execute()
}

function getSessionCreatedAt(sessionManager: SessionManager): Date {
  const firstEntryDate = sessionManager.getEntries()
    .map((entry) => toDate((entry as { timestamp?: unknown }).timestamp))
    .find((date): date is Date => date instanceof Date)
  if (firstEntryDate) {
    return firstEntryDate
  }

  return parseTimestampFromUuidLikeId(sessionManager.getSessionId()) ?? new Date()
}

function parseTimestampFromUuidLikeId(id: string): Date | null {
  const prefix = id.replace(/-/g, '').slice(0, 12)
  if (!/^[\da-f]{12}$/i.test(prefix)) {
    return null
  }
  const millis = Number.parseInt(prefix, 16)
  if (!Number.isFinite(millis) || millis <= 0) {
    return null
  }
  const date = new Date(millis)
  return Number.isNaN(date.getTime()) ? null : date
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value
  }
  if (typeof value === 'number' || typeof value === 'string') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}

async function createDefaultRuntime(overrides: Partial<PodMirrorRuntime> | undefined): Promise<PodMirrorRuntime> {
  if (isCompletePodMirrorRuntime(overrides)) {
    return overrides
  }

  return {
    getPodDataSession: getDefaultPodDataSession,
    ...overrides,
  }
}

function isCompletePodMirrorRuntime(runtime: Partial<PodMirrorRuntime> | undefined): runtime is PodMirrorRuntime {
  return Boolean(
    runtime
    && runtime.getPodDataSession,
  )
}

function buildThreadMetadata(options: LinxPiPodMirrorOptions): Record<string, unknown> {
  return {
    source: 'linx-cli',
    runtime: 'pi',
    runtimeSessionId: options.sessionManager.getSessionId(),
    surface: 'cli',
    cwd: options.cwd,
    sessionFile: options.sessionManager.getSessionFile(),
  }
}

function createPiRuntimeSnapshot(refs: PiResourceRefs, createdAt: Date): ReturnType<typeof createAgentRuntimeConfigSnapshot> {
  const skills: AgentRuntimeSkillSnapshot[] = [
    {
      id: skillResource.buildId({
        id: PI_SYMPHONY_SKILL_ID,
        agent: refs.agentUri,
      }),
      name: PI_SYMPHONY_SKILL_ID,
      source: 'linx-cli:skills/symphony',
      loadPolicy: 'file-backed',
      enabled: true,
    },
  ]
  return createAgentRuntimeConfigSnapshot({
    agent: PI_AGENT_ID,
    role: 'secretary',
    label: 'AI Secretary',
    model: DEFAULT_LINX_CLOUD_MODEL_ID,
    runtime: {
      backend: 'linx',
      model: DEFAULT_LINX_CLOUD_MODEL_ID,
      credentialSource: 'pod-session',
      runtime: 'pi',
      transport: 'pi-runtime',
    },
    skills,
  }, {
    createdAt,
    source: 'linx-cli.pi-pod-mirror',
  })
}

function isReplayablePiProjectionCheckpoint(checkpoint: LinxSyncCheckpoint): boolean {
  const syncTaskDescription = checkpoint.metadata?.syncTaskDescription ?? checkpoint.metadata?.taskDescription
  const replayableTask = syncTaskDescription === 'message_end'
    || syncTaskDescription === 'agent_end'
    || syncTaskDescription === 'retry_pending_projection'
  if (!replayableTask) {
    return false
  }
  if (!checkpoint.failures || checkpoint.failures.length === 0) {
    return checkpoint.status === 'partial'
  }
  return checkpoint.failures.some((failure) => isTransientPodMirrorError(failure.message))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
