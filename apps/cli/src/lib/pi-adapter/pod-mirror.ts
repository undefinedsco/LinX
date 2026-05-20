import type { AgentMessage } from '@mariozechner/pi-agent-core'
import type { SessionEntry, SessionManager } from '@mariozechner/pi-coding-agent'
import { DEFAULT_LINX_CLOUD_MODEL_ID } from '../default-model.js'
import { getDefaultPodDataSession, type PodDataSession } from '../pod-data-session.js'
import {
  agentResource,
  auditResource,
  chatResource,
  drizzle,
  messageResource,
  sessionResource,
  solidResources,
  threadResource,
  type AuditInsert,
  type ChatInsert,
  type MessageInsert,
  type SessionInsert,
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
  pathToWorkspaceUri,
} from './pod-mirror-mapping.js'

const PI_POLICY_VERSION = 'linx-pi-pod-mirror/v1'

interface PodMirrorRuntime {
  getPodDataSession(): Promise<PodDataSession | null>
  createDb?: (session: PodDataSession) => SolidDatabase
}

export interface LinxPiPodMirrorOptions {
  cwd: string
  sessionManager: SessionManager
  runtime?: Partial<PodMirrorRuntime>
  onError?: (error: unknown) => void
  syncConversationRoot?: boolean
}

interface PodMirrorContext {
  db: SolidDatabase
  webId: string
}

interface PiResourceRefs {
  agentUri: string
  chatUri: string
  sessionUri: string
  threadUri: string
}

export class LinxPiPodMirror {
  private contextPromise: Promise<PodMirrorContext | null> | null = null
  private queue: Promise<void> = Promise.resolve()
  private readonly seenMessageIds = new Set<string>()
  private readonly messageResourceRefs = new Set<string>()
  private readonly runtimePromise: Promise<PodMirrorRuntime>
  private closed = false

  constructor(private readonly options: LinxPiPodMirrorOptions) {
    this.runtimePromise = createDefaultRuntime(options.runtime)
  }

  handleEvent(event: unknown): void {
    if (this.closed || !isRecord(event)) {
      return
    }

    if (event.type === 'message_end') {
      this.enqueue(async () => {
        const message = event.message as AgentMessage | undefined
        const entry = this.resolveLatestEntryForMessage(message)
        if (!entry || this.seenMessageIds.has(entry.id)) {
          return
        }
        this.seenMessageIds.add(entry.id)
        await this.persistEntry(entry)
      })
      return
    }

    if (event.type === 'tool_execution_start') {
      this.enqueue(() => this.persistToolAudit('tool_execution_started', event))
      return
    }

    if (event.type === 'tool_execution_end') {
      this.enqueue(() => this.persistToolAudit(
        event.isError ? 'tool_execution_failed' : 'tool_execution_completed',
        event,
      ))
      return
    }

    if (event.type === 'agent_end') {
      this.enqueue(() => this.persistUnseenMessageEntries())
    }
  }

  async flush(): Promise<void> {
    await this.queue
  }

  async close(): Promise<void> {
    if (this.closed) {
      return
    }
    this.closed = true
    this.enqueue(async () => {
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
    await this.queue
  }

  private enqueue(task: () => Promise<void>): void {
    this.queue = this.queue
      .then(task, task)
      .catch((error) => {
        this.options.onError?.(error)
      })
  }

  private resolveLatestEntryForMessage(message: AgentMessage | undefined): SessionEntry | null {
    if (!message) {
      return null
    }

    const entries = [...this.options.sessionManager.getEntries()].reverse()
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

  private async persistEntry(entry: SessionEntry): Promise<void> {
    const context = await this.getContext()
    if (!context || entry.type !== 'message') {
      return
    }

    const refs = resolvePiResourceRefs(context, this.options)
    if (this.options.syncConversationRoot) {
      await ensurePiConversationRoot(context, this.options, refs)
    }

    const row = buildPodMessageRowFromMapping(context.webId, this.options, entry)
    if (!row) {
      return
    }

    const resourceRef = await persistMessage(context, normalizePodMessageRow(context, row, refs))
    this.messageResourceRefs.add(resourceRef)
    await persistRuntimeSession(context, this.options, refs, 'active', this.messageResourceRefs)
    if (this.options.syncConversationRoot) {
      await touchPiConversation(context, this.options, refs, row.content)
    }
  }

  private async persistUnseenMessageEntries(): Promise<void> {
    for (const entry of this.options.sessionManager.getEntries()) {
      if (entry.type !== 'message' || this.seenMessageIds.has(entry.id)) {
        continue
      }
      this.seenMessageIds.add(entry.id)
      await this.persistEntry(entry)
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

  await upsertByResource(context.db, chatResource, { id: DEFAULT_SECRETARY_CHAT_ID }, {
    id: DEFAULT_SECRETARY_CHAT_ID,
    title: 'AI Secretary',
    participants: [context.webId, refs.agentUri],
    metadata: {
      kind: 'ai-secretary',
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
      kind: 'ai-secretary',
      surface: 'cli',
      agent: refs.agentUri,
    },
    lastActiveAt: now,
    updatedAt: now,
  })

  await upsertByResource(context.db, threadResource, { id: threadId, chat: refs.chatUri }, {
    id: threadId,
    chat: refs.chatUri,
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

  await upsertByResource(context.db, agentResource, { id: PI_AGENT_ID }, {
    id: PI_AGENT_ID,
    name: 'LinX CLI Assistant',
    provider: 'undefineds',
    model: DEFAULT_LINX_CLOUD_MODEL_ID,
    createdAt: now,
    updatedAt: now,
  }, {
    name: 'LinX CLI Assistant',
    provider: 'undefineds',
    model: DEFAULT_LINX_CLOUD_MODEL_ID,
    updatedAt: now,
  })
}

async function persistRuntimeSession(
  context: PodMirrorContext,
  options: LinxPiPodMirrorOptions,
  refs: PiResourceRefs,
  status: 'active' | 'completed' = 'active',
  messageResourceRefs: Set<string> = new Set(),
): Promise<void> {
  const now = new Date()
  const threadId = options.sessionManager.getSessionId()
  const runtimeSessionId = threadId
  const createdAt = getSessionCreatedAt(options.sessionManager)
  const metadata = {
    cwd: options.cwd,
    sessionFile: options.sessionManager.getSessionFile(),
    runtime: 'pi',
    runtimeSessionId,
    surface: 'cli',
    threadUri: refs.threadUri,
    messageResources: [...messageResourceRefs],
  }

  const row = {
    id: runtimeSessionId,
    ownerWebId: context.webId,
    chat: refs.chatUri,
    thread: refs.threadUri,
    sessionType: 'direct',
    status,
    tool: 'linx',
    tokenUsage: calculateTokenUsage(options.sessionManager.getEntries()),
    messageResources: [...messageResourceRefs],
    policyVersion: PI_POLICY_VERSION,
    metadata,
    createdAt,
    updatedAt: now,
  } satisfies SessionInsert

  await upsertByIri(context.db, sessionResource, refs.sessionUri, row, {
    ownerWebId: context.webId,
    chat: refs.chatUri,
    thread: refs.threadUri,
    sessionType: 'direct',
    status,
    tool: 'linx',
    tokenUsage: row.tokenUsage,
    messageResources: [...messageResourceRefs],
    policyVersion: PI_POLICY_VERSION,
    metadata,
    updatedAt: now,
  })
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
    content: row.content,
    ...(row.richContent ? { richContent: row.richContent } : {}),
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  } satisfies MessageInsert
  await insertResource(context.db, messageResource, insert)
  return context.db.resolveLocatorIri(messageResource, { id: row.id, chat: row.chat, createdAt: row.createdAt })
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
    lastMessagePreview: preview.slice(0, 100),
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
  const chatUri = context.db.resolveLocatorIri(chatResource, { id: DEFAULT_SECRETARY_CHAT_ID })
  return {
    agentUri: context.db.resolveLocatorIri(agentResource, { id: PI_AGENT_ID }),
    chatUri,
    sessionUri: context.db.resolveLocatorIri(sessionResource, { id: sessionId, createdAt }),
    threadUri: context.db.resolveLocatorIri(threadResource, { id: sessionId, chat: chatUri }),
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

async function upsertByResource(
  db: SolidDatabase,
  resource: Parameters<SolidDatabase['resolveLocatorIri']>[0],
  target: Record<string, unknown>,
  insert: Record<string, unknown>,
  update: Record<string, unknown>,
): Promise<void> {
  const id = String(target.id ?? '')
  const iri = db.resolveLocatorIri(resource, target)
  const existing = id ? await db.findById(resource, id) : await db.findByIri(resource, iri)
  if (!existing) {
    await db.insert(resource).values(insert).execute()
    return
  }

  if (id) {
    await db.updateById(resource, id, update)
    return
  }
  await db.updateByIri(resource, iri, update)
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
