import type { AgentMessage } from '@mariozechner/pi-agent-core'
import type { SessionEntry, SessionManager } from '@mariozechner/pi-coding-agent'
import type { StoredCredentials } from '../credentials-store.js'
import { DEFAULT_LINX_CLOUD_MODEL_ID } from '../default-model.js'
import { getDefaultPodDataSession, type PodDataSession } from '../pod-data-session.js'
export { buildPodMessageRow } from './pod-mirror-mapping.js'
import {
  DEFAULT_SECRETARY_CHAT_ID,
  PI_AGENT_ID,
  buildAgentUri,
  buildChatUri,
  buildPodMessageRow as buildPodMessageRowFromMapping,
  buildThreadTitle,
  buildThreadUri,
  buildToolAuditId,
  calculateTokenUsage,
  pathToWorkspaceUri,
} from './pod-mirror-mapping.js'
import {
  DCT_CREATED,
  DCT_MODIFIED,
  DCT_TITLE,
  FOAF_MAKER,
  MEETING_LONG_CHAT,
  MEETING_MESSAGE,
  RDF_TYPE,
  SIOC_CONTENT,
  SIOC_HAS_MEMBER,
  SIOC_RICH_CONTENT,
  SIOC_THREAD,
  UDFS_ACTION,
  UDFS_ACTOR,
  UDFS_ACTOR_ROLE,
  UDFS_AGENT,
  UDFS_AUDIT_ENTRY,
  UDFS_CHAT_TYPE,
  UDFS_CONTEXT,
  UDFS_CONVERSATION,
  UDFS_CONVERSATION_TITLE,
  UDFS_CONVERSATION_TYPE,
  UDFS_HAS_THREAD,
  UDFS_IN_THREAD,
  UDFS_LAST_ACTIVE_AT,
  UDFS_MESSAGE_STATUS,
  UDFS_MESSAGE_TYPE,
  UDFS_METADATA,
  UDFS_MODEL,
  UDFS_ON_BEHALF_OF,
  UDFS_POLICY_VERSION,
  UDFS_PROVIDER,
  UDFS_SESSION,
  UDFS_SESSION_STATUS,
  UDFS_SESSION_TOOL,
  UDFS_TOKEN_USAGE,
  UDFS_TOOL_CALL_ID,
  UDFS_WORKSPACE,
  WF_MESSAGE,
  buildAgentResourceUrl,
  buildAuditDocumentUrl,
  buildAuditResourceUrl,
  buildChatIndexResourceUrl,
  buildMessageResourceUrl,
  buildMessageSubjectUrl,
  buildSessionResourceUrl,
  dateLiteral,
  integerLiteral,
  iri,
  literal,
  upsertManagedTurtleBlock,
  type PodFetch,
} from './pod-native.js'

const PI_POLICY_VERSION = 'linx-pi-pod-mirror/v1'

interface PodMirrorRuntime {
  getPodDataSession(): Promise<PodDataSession | null>
}

export interface LinxPiPodMirrorOptions {
  cwd: string
  sessionManager: SessionManager
  runtime?: Partial<PodMirrorRuntime>
  onError?: (error: unknown) => void
}

interface PodMirrorContext {
  credentials: StoredCredentials
  fetch: PodFetch
  webId: string
}

export class LinxPiPodMirror {
  private contextPromise: Promise<PodMirrorContext | null> | null = null
  private queue: Promise<void> = Promise.resolve()
  private readonly seenMessageIds = new Set<string>()
  private readonly messageResourceUrls = new Set<string>()
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

      await persistRuntimeSession(context, this.options, 'completed', this.messageResourceUrls)
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

    await ensurePiConversationRoot(context, this.options)
    await persistRuntimeSession(context, this.options, 'active', this.messageResourceUrls)

    const row = buildPodMessageRowFromMapping(context.webId, this.options, entry)
    if (!row) {
      return
    }

    const resourceUrl = await persistMessage(context, row)
    this.messageResourceUrls.add(resourceUrl)
    await persistRuntimeSession(context, this.options, 'active', this.messageResourceUrls)
    await touchPiConversation(context, this.options, row.content)
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
    await ensurePiConversationRoot(context, this.options)
    await persistRuntimeSession(context, this.options, 'active', this.messageResourceUrls)

    const id = buildToolAuditId(this.options.sessionManager.getSessionId(), toolCallId, action)
    const createdAt = new Date()
    const documentUrl = buildAuditDocumentUrl(context.webId, createdAt)
    const subjectUrl = buildAuditResourceUrl(context.webId, id, createdAt)
    await upsertManagedTurtleBlock(context.fetch, documentUrl, {
      subject: subjectUrl,
      triples: [
        { predicate: RDF_TYPE, object: iri(UDFS_AUDIT_ENTRY) },
        { predicate: UDFS_ACTION, object: literal(action) },
        { predicate: UDFS_ACTOR, object: iri(buildAgentUri(context.webId)) },
        { predicate: UDFS_ACTOR_ROLE, object: literal('assistant') },
        { predicate: UDFS_ON_BEHALF_OF, object: iri(context.webId) },
        { predicate: UDFS_SESSION, object: iri(buildSessionResourceUrl(context.webId, this.options.sessionManager.getSessionId(), createdAt)) },
        { predicate: UDFS_TOOL_CALL_ID, object: literal(toolCallId) },
        { predicate: UDFS_CONTEXT, object: literal(JSON.stringify(buildToolAuditContext(event))) },
        { predicate: UDFS_POLICY_VERSION, object: literal(PI_POLICY_VERSION) },
        { predicate: DCT_CREATED, object: dateLiteral(createdAt) },
      ],
    })
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

    return {
      credentials: session.credentials,
      webId: session.webId,
      fetch: session.fetch,
    }
  }
}

async function ensurePiConversationRoot(
  context: PodMirrorContext,
  options: LinxPiPodMirrorOptions,
): Promise<void> {
  const now = new Date()
  const threadId = options.sessionManager.getSessionId()
  const chatUri = buildChatUri(context.webId)
  const threadUri = buildThreadUri(context.webId, DEFAULT_SECRETARY_CHAT_ID, threadId)

  await upsertManagedTurtleBlock(context.fetch, buildChatIndexResourceUrl(context.webId, DEFAULT_SECRETARY_CHAT_ID), {
    subject: chatUri,
    triples: [
      { predicate: RDF_TYPE, object: iri(MEETING_LONG_CHAT) },
      { predicate: UDFS_CHAT_TYPE, object: literal('ai-secretary') },
      { predicate: UDFS_CONVERSATION_TITLE, object: literal('AI Secretary') },
      { predicate: DCT_TITLE, object: literal('AI Secretary') },
      { predicate: UDFS_HAS_THREAD, object: iri(threadUri) },
      { predicate: UDFS_LAST_ACTIVE_AT, object: dateLiteral(now) },
      { predicate: DCT_CREATED, object: dateLiteral(now) },
      { predicate: DCT_MODIFIED, object: dateLiteral(now) },
    ],
  })

  await upsertManagedTurtleBlock(context.fetch, buildChatIndexResourceUrl(context.webId, DEFAULT_SECRETARY_CHAT_ID), {
    subject: threadUri,
    triples: [
      { predicate: RDF_TYPE, object: iri(SIOC_THREAD) },
      { predicate: UDFS_CONVERSATION, object: iri(chatUri) },
      { predicate: DCT_TITLE, object: literal(buildThreadTitle(options.sessionManager)) },
      ...(pathToWorkspaceUri(options.cwd)
        ? [{ predicate: UDFS_WORKSPACE, object: iri(pathToWorkspaceUri(options.cwd) as string) }]
        : []),
      { predicate: UDFS_METADATA, object: literal(JSON.stringify(buildThreadMetadata(options))) },
      { predicate: DCT_CREATED, object: dateLiteral(now) },
      { predicate: DCT_MODIFIED, object: dateLiteral(now) },
    ],
  })

  await upsertManagedTurtleBlock(context.fetch, buildAgentResourceUrl(context.webId, PI_AGENT_ID), {
    subject: buildAgentUri(context.webId),
    triples: [
      { predicate: RDF_TYPE, object: iri(UDFS_AGENT) },
      { predicate: DCT_TITLE, object: literal('LinX CLI Assistant') },
      { predicate: UDFS_PROVIDER, object: literal('undefineds') },
      { predicate: UDFS_MODEL, object: literal(DEFAULT_LINX_CLOUD_MODEL_ID) },
      { predicate: DCT_CREATED, object: dateLiteral(now) },
      { predicate: DCT_MODIFIED, object: dateLiteral(now) },
    ],
  })
}

async function persistRuntimeSession(
  context: PodMirrorContext,
  options: LinxPiPodMirrorOptions,
  status: 'active' | 'completed' = 'active',
  messageResourceUrls: Set<string> = new Set(),
): Promise<void> {
  const now = new Date()
  const threadId = options.sessionManager.getSessionId()
  const runtimeSessionId = threadId
  const chatUri = buildChatUri(context.webId)
  const threadUri = buildThreadUri(context.webId, DEFAULT_SECRETARY_CHAT_ID, threadId)
  const metadata = {
    cwd: options.cwd,
    sessionFile: options.sessionManager.getSessionFile(),
    runtime: 'pi',
    runtimeSessionId,
    surface: 'cli',
    threadUri,
    messageResources: [...messageResourceUrls],
  }

  const sessionDocumentUrl = buildSessionResourceUrl(context.webId, runtimeSessionId, now).split('#')[0]
  const sessionSubjectUrl = buildSessionResourceUrl(context.webId, runtimeSessionId, now)
  await upsertManagedTurtleBlock(context.fetch, sessionDocumentUrl, {
    subject: sessionSubjectUrl,
    triples: [
      { predicate: RDF_TYPE, object: iri(UDFS_SESSION) },
      { predicate: UDFS_ACTOR, object: iri(context.webId) },
      { predicate: UDFS_CONVERSATION, object: iri(chatUri) },
      { predicate: UDFS_IN_THREAD, object: iri(threadUri) },
      { predicate: UDFS_CONVERSATION_TYPE, object: literal('direct') },
      { predicate: UDFS_SESSION_STATUS, object: literal(status) },
      { predicate: UDFS_SESSION_TOOL, object: literal('linx') },
      { predicate: UDFS_TOKEN_USAGE, object: integerLiteral(calculateTokenUsage(options.sessionManager.getEntries())) },
      { predicate: UDFS_POLICY_VERSION, object: literal(PI_POLICY_VERSION) },
      { predicate: UDFS_METADATA, object: literal(JSON.stringify(metadata)) },
      { predicate: DCT_CREATED, object: dateLiteral(now) },
      { predicate: DCT_MODIFIED, object: dateLiteral(now) },
    ],
  })
}

async function persistMessage(
  context: PodMirrorContext,
  row: NonNullable<ReturnType<typeof buildPodMessageRowFromMapping>>,
): Promise<string> {
  const resourceUrl = buildMessageResourceUrl(context.webId, DEFAULT_SECRETARY_CHAT_ID, row.createdAt)
  const subject = buildMessageSubjectUrl(resourceUrl, row.id)
  await upsertManagedTurtleBlock(context.fetch, resourceUrl, {
    subject,
    triples: [
      { predicate: RDF_TYPE, object: iri(MEETING_MESSAGE) },
      { predicate: FOAF_MAKER, object: iri(row.maker) },
      { predicate: UDFS_MESSAGE_TYPE, object: literal(row.role) },
      { predicate: SIOC_CONTENT, object: literal(row.content) },
      ...(row.richContent ? [{ predicate: SIOC_RICH_CONTENT, object: literal(row.richContent) }] : []),
      { predicate: UDFS_MESSAGE_STATUS, object: literal(row.status) },
      { predicate: DCT_CREATED, object: dateLiteral(row.createdAt) },
      { predicate: DCT_MODIFIED, object: dateLiteral(row.updatedAt) },
    ],
    extraStatements: [
      `<${row.chat}> <${WF_MESSAGE}> <${subject}> .`,
      `<${row.thread}> <${SIOC_HAS_MEMBER}> <${subject}> .`,
    ],
  })
  return resourceUrl
}

async function touchPiConversation(
  context: PodMirrorContext,
  options: LinxPiPodMirrorOptions,
  preview: string,
): Promise<void> {
  const now = new Date()
  const threadId = options.sessionManager.getSessionId()
  const chatUri = buildChatUri(context.webId)
  const threadUri = buildThreadUri(context.webId, DEFAULT_SECRETARY_CHAT_ID, threadId)
  await upsertManagedTurtleBlock(context.fetch, buildChatIndexResourceUrl(context.webId, DEFAULT_SECRETARY_CHAT_ID), {
    subject: chatUri,
    triples: [
      { predicate: RDF_TYPE, object: iri(MEETING_LONG_CHAT) },
      { predicate: UDFS_CHAT_TYPE, object: literal('ai-secretary') },
      { predicate: UDFS_CONVERSATION_TITLE, object: literal('AI Secretary') },
      { predicate: UDFS_CONTEXT, object: literal(JSON.stringify({ lastMessagePreview: preview.slice(0, 100) })) },
      { predicate: UDFS_HAS_THREAD, object: iri(threadUri) },
      { predicate: UDFS_LAST_ACTIVE_AT, object: dateLiteral(now) },
      { predicate: DCT_MODIFIED, object: dateLiteral(now) },
    ],
  })
  await upsertManagedTurtleBlock(context.fetch, buildChatIndexResourceUrl(context.webId, DEFAULT_SECRETARY_CHAT_ID), {
    subject: threadUri,
    triples: [
      { predicate: RDF_TYPE, object: iri(SIOC_THREAD) },
      { predicate: UDFS_CONVERSATION, object: iri(chatUri) },
      { predicate: DCT_TITLE, object: literal(buildThreadTitle(options.sessionManager)) },
      ...(pathToWorkspaceUri(options.cwd)
        ? [{ predicate: UDFS_WORKSPACE, object: iri(pathToWorkspaceUri(options.cwd) as string) }]
        : []),
      { predicate: UDFS_METADATA, object: literal(JSON.stringify(buildThreadMetadata(options))) },
      { predicate: DCT_MODIFIED, object: dateLiteral(now) },
    ],
  })
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

function buildToolAuditContext(event: Record<string, unknown>): Record<string, unknown> {
  return {
    runtime: 'pi',
    toolName: typeof event.toolName === 'string' ? event.toolName : 'unknown',
    ...(event.args !== undefined ? { args: toJsonSafeValue(event.args) } : {}),
    ...(event.result !== undefined ? { result: toJsonSafeValue(event.result) } : {}),
    ...(typeof event.isError === 'boolean' ? { isError: event.isError } : {}),
  }
}

function toJsonSafeValue(value: unknown, depth = 0): unknown {
  if (depth > 4) {
    return '[depth-limit]'
  }
  if (typeof value === 'string') {
    return value.length > 4000 ? `${value.slice(0, 4000)}...` : value
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => toJsonSafeValue(item, depth + 1))
  }
  if (!isRecord(value)) {
    return String(value)
  }

  const output: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value).slice(0, 50)) {
    output[key] = toJsonSafeValue(entry, depth + 1)
  }
  return output
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
