import {
  createLinxPodSyncScope,
  type LinxPodSyncScope,
  type LinxSyncOperationKind,
  type LinxSyncRunResult,
} from '@linx/agent-runtime/sync'
import {
  ODRL,
  approvalResource,
  auditResource,
  buildApprovalSubjectPath,
  buildAuditSubjectPath,
  buildSessionSubjectPath,
  inboxNotificationTable,
  sessionTable,
  type ApprovalRow,
  type SolidDatabase,
} from '@undefineds.co/models'
import { queryClient } from '@/providers/query-provider'

const POLICY_VERSION = 'phase4-inbox-v1'

type RuntimeThreadStatus = 'idle' | 'active' | 'paused' | 'completed' | 'error'

type RuntimeSessionRecord = {
  id: string
  threadId: string
  title: string
  tool: string
  status: RuntimeThreadStatus
  tokenUsage: number
}

type RuntimeSessionEvent =
  | { type: 'status'; ts: number; threadId: string; status: RuntimeThreadStatus }
  | { type: 'tool_call'; ts: number; threadId: string; requestId: string; name: string; arguments: string }
  | { type: 'auth_required'; ts: number; threadId: string; method: string; url?: string; message?: string; options?: Array<{ label?: string; url?: string; method?: string }> }
  | { type: 'error'; ts: number; threadId: string; message: string }
  | { type: 'meta' | 'stdout' | 'stderr' | 'assistant_delta' | 'assistant_done' | 'exit'; ts: number; threadId: string }

interface RuntimeEventContext {
  chatId: string
  threadId: string
}

interface PendingAuthState {
  method: string
  url?: string
  message?: string
  options?: Array<{ label?: string; url?: string; method?: string }>
  eventTs: number
}

interface RuntimeSidecarSinkOptions {
  now?: () => Date
  onSyncResult?: (result: LinxSyncRunResult) => void
}

function inferRisk(toolName: string, rawArguments: string): 'low' | 'medium' | 'high' {
  const source = `${toolName} ${rawArguments}`.toLowerCase()

  if (/(delete|remove|write|edit|patch|exec|shell|bash|terminal|git\s+push|publish)/.test(source)) {
    return 'high'
  }

  if (/(git|file|open|search|grep|read|list)/.test(source)) {
    return 'medium'
  }

  return 'medium'
}

function eventDateFromTs(ts: number): Date {
  return Number.isFinite(ts) ? new Date(ts) : new Date()
}

export class RuntimeSidecarSink {
  private readonly podBaseUrl: string
  private readonly seenEventKeys = new Set<string>()
  private readonly latestSessionStatus = new Map<string, RuntimeThreadStatus>()
  private readonly pendingAuthBySession = new Map<string, PendingAuthState>()
  private readonly sync: LinxPodSyncScope
  private readonly syncResults: LinxSyncRunResult[] = []
  private syncSeq = 0

  constructor(
    private readonly db: SolidDatabase,
    private readonly webId: string,
    private readonly options: RuntimeSidecarSinkOptions = {},
  ) {
    this.podBaseUrl = this.resolvePodBaseUrl(this.webId)
    this.sync = createLinxPodSyncScope({
      source: 'chatkit-local-runtime',
      target: 'pod',
      direction: 'local-to-core',
      plane: 'projection',
      authority: 'core',
      now: this.options.now,
      metadata: { webId: this.webId },
      onResult: (result) => {
        this.syncResults.push(result)
        this.options.onSyncResult?.(result)
      },
    })
  }

  getSyncResults(): LinxSyncRunResult[] {
    return [...this.syncResults]
  }

  private resolvePodBaseUrl(webId: string): string {
    return webId.replace('/profile/card#me', '').replace(/\/$/, '')
  }

  private async findByStorageId<T>(resource: any, id: string): Promise<T | null> {
    if (typeof (this.db as any).findById !== 'function') {
      throw new Error('Solid database does not support findById.')
    }
    return await (this.db as any).findById(resource, id) as T | null
  }

  private async updateByStorageId(resource: any, id: string, payload: Record<string, unknown>): Promise<void> {
    if (typeof (this.db as any).updateById !== 'function') {
      throw new Error('Solid database does not support updateById.')
    }
    await (this.db as any).updateById(resource, id, payload)
  }

  async persistRuntimeEvent(
    runtimeSession: RuntimeSessionRecord,
    event: RuntimeSessionEvent,
    context: RuntimeEventContext,
  ): Promise<void> {
    const shouldResolveAuth = this.shouldResolvePendingAuth(runtimeSession, event)
    if (!shouldResolveAuth && !this.shouldProjectRuntimeEvent(runtimeSession, event)) {
      return
    }

    await this.runRuntimeProjection(runtimeSession, event, context, async () => {
      if (shouldResolveAuth) {
        await this.persistAuthResolved(runtimeSession, event.ts, context)
      }

      switch (event.type) {
        case 'status':
          await this.persistSessionStatus(runtimeSession, event, context)
          return
        case 'tool_call':
          await this.persistToolCall(runtimeSession, event, context)
          return
        case 'auth_required':
          await this.persistAuthRequired(runtimeSession, event, context)
          return
        case 'error':
          await this.persistSessionError(runtimeSession, event, context)
          return
        default:
          return
      }
    })
  }

  private shouldResolvePendingAuth(runtimeSession: RuntimeSessionRecord, event: RuntimeSessionEvent): boolean {
    if (
      this.pendingAuthBySession.has(runtimeSession.id)
      && (event.type === 'assistant_delta' || event.type === 'assistant_done' || event.type === 'tool_call')
    ) {
      return true
    }

    return false
  }

  private shouldProjectRuntimeEvent(runtimeSession: RuntimeSessionRecord, event: RuntimeSessionEvent): boolean {
    switch (event.type) {
      case 'status':
        return this.latestSessionStatus.get(runtimeSession.id) !== event.status
          && !this.seenEventKeys.has(this.buildEventKey('status', runtimeSession.id, event.status))
      case 'tool_call':
        return true
      case 'auth_required':
        return !this.seenEventKeys.has(this.buildEventKey('auth', runtimeSession.id, `${event.method}:${event.url ?? ''}`))
      case 'error':
        return !this.seenEventKeys.has(this.buildEventKey('error', runtimeSession.id, event.message))
      default:
        return false
    }
  }

  private async runRuntimeProjection(
    runtimeSession: RuntimeSessionRecord,
    event: RuntimeSessionEvent,
    context: RuntimeEventContext,
    project: () => Promise<void>,
  ): Promise<void> {
    const eventDate = eventDateFromTs(event.ts)
    await this.sync.run({
      action: `runtime.${event.type}`,
      operationId: this.nextSyncOperationId(runtimeSession.id, event),
      kind: this.syncKindForEvent(event),
      description: `chatkit-local-runtime:${event.type}`,
      subject: runtimeSession.id,
      resourceBindings: {
        session: { uri: this.makeRuntimeSessionUri(runtimeSession.id, eventDate), local: runtimeSession.id },
        chat: { uri: this.makeChatUri(context.chatId), local: context.chatId },
        thread: { uri: this.makeThreadUri(context.chatId, context.threadId), local: context.threadId },
      },
      metadata: {
        eventType: event.type,
        eventTs: event.ts,
        localRuntimeThread: runtimeSession.threadId,
      },
      task: project,
    })
  }

  private syncKindForEvent(event: RuntimeSessionEvent): LinxSyncOperationKind {
    return event.type === 'status' ? 'upsert' : 'insert'
  }

  private nextSyncOperationId(runtimeSessionId: string, event: RuntimeSessionEvent): string {
    const timestamp = (this.options.now?.() ?? new Date()).toISOString().replace(/[:.]/g, '-')
    return `chatkit-runtime:${runtimeSessionId}:${event.type}:${timestamp}:${++this.syncSeq}`
  }

  private makeRuntimeSessionUri(sessionId: string, createdAt: Date = new Date()): string {
    return `${this.podBaseUrl}${buildSessionSubjectPath(sessionId, createdAt)}`
  }

  private makeChatUri(chatId: string): string {
    return `${this.podBaseUrl}/.data/chat/${chatId}/index.ttl#this`
  }

  private makeThreadUri(chatId: string, threadId: string): string {
    return `${this.podBaseUrl}/.data/chat/${chatId}/index.ttl#${threadId}`
  }

  private async upsertSessionState(
    runtimeSession: RuntimeSessionRecord,
    event: Extract<RuntimeSessionEvent, { type: 'status' }>,
    context: RuntimeEventContext,
    previousStatus: RuntimeThreadStatus | undefined,
  ): Promise<void> {
    const eventDate = eventDateFromTs(event.ts)
    const existing = await this.findByStorageId<Record<string, unknown>>(sessionTable, runtimeSession.id)

    const payload = {
      owner: this.webId,
      chat: this.makeChatUri(context.chatId),
      thread: this.makeThreadUri(context.chatId, context.threadId),
      sessionType: 'direct',
      status: event.status,
      tool: runtimeSession.tool,
      tokenUsage: runtimeSession.tokenUsage,
      metadata: {
        title: runtimeSession.title,
        previousStatus: previousStatus ?? null,
        localChat: context.chatId,
        localThread: context.threadId,
        threadUri: this.makeThreadUri(context.chatId, context.threadId),
        lastEventTs: event.ts,
      },
      updatedAt: eventDate,
    } as const

    if (!existing) {
      await this.db.insert(sessionTable).values({
        id: runtimeSession.id,
        ...payload,
        createdAt: eventDate,
      }).execute()
      return
    }

    await this.updateByStorageId(sessionTable, runtimeSession.id, payload)
  }

  private makeApprovalUri(id: string, createdAt: Date = new Date()): string {
    return `${this.podBaseUrl}${buildApprovalSubjectPath(id, createdAt)}`
  }

  private makeAuditUri(id: string, createdAt: Date = new Date()): string {
    return `${this.podBaseUrl}${buildAuditSubjectPath(id, createdAt)}`
  }

  private buildEventKey(type: string, runtimeSessionId: string, suffix: string): string {
    return `${type}:${runtimeSessionId}:${suffix}`
  }

  private async invalidateInboxQueries(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['inbox', 'approvals'] }),
      queryClient.invalidateQueries({ queryKey: ['inbox', 'audit'] }),
      queryClient.invalidateQueries({ queryKey: ['inbox', 'notifications'] }),
      queryClient.invalidateQueries({ queryKey: ['inbox', 'items'] }),
    ])
  }

  private async insertAuditEntry(input: {
    id?: string
    action: string
    sessionId: string
    chatUri?: string
    threadUri?: string
    toolCallId?: string
    toolName?: string
    approvalUri?: string
    entryUri?: string
    createdAt?: Date
    sessionCreatedAt?: Date
  }): Promise<string> {
    const id = input.id ?? crypto.randomUUID()
    const createdAt = input.createdAt ?? new Date()
    await this.db.insert(auditResource).values({
      id,
      action: input.action,
      actor: this.webId,
      actorRole: 'system',
      session: this.makeRuntimeSessionUri(input.sessionId, input.sessionCreatedAt ?? createdAt),
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      approval: input.approvalUri,
      entry: input.entryUri ?? input.threadUri ?? input.chatUri,
      policyVersion: POLICY_VERSION,
      createdAt,
    }).execute()
    return id
  }

  private async insertInboxNotification(objectUri: string, dedupeKey: string, createdAt: Date = new Date()): Promise<void> {
    if (this.seenEventKeys.has(dedupeKey)) {
      return
    }

    this.seenEventKeys.add(dedupeKey)
    await this.db.insert(inboxNotificationTable).values({
      id: crypto.randomUUID(),
      actor: this.webId,
      object: objectUri,
      createdAt,
    }).execute()
  }

  private async findApprovalByToolCall(toolCallId: string): Promise<ApprovalRow | null> {
    const rows = await this.db.select().from(approvalResource)
      .where({ toolCallId } as any)
      .execute()
    return (rows as ApprovalRow[]).find((row) => row.toolCallId === toolCallId) ?? null
  }

  private async persistAuthResolved(
    runtimeSession: RuntimeSessionRecord,
    eventTs: number,
    context: RuntimeEventContext,
  ): Promise<void> {
    const pendingAuth = this.pendingAuthBySession.get(runtimeSession.id)
    if (!pendingAuth) {
      return
    }

    const dedupeKey = this.buildEventKey('auth-resolved', runtimeSession.id, `${pendingAuth.method}:${pendingAuth.url ?? ''}`)
    if (this.seenEventKeys.has(dedupeKey)) {
      this.pendingAuthBySession.delete(runtimeSession.id)
      return
    }
    this.seenEventKeys.add(dedupeKey)

    const eventDate = eventDateFromTs(eventTs)
    const auditId = await this.insertAuditEntry({
      action: 'runtime.auth_resolved',
      sessionId: runtimeSession.id,
      createdAt: eventDate,
      sessionCreatedAt: eventDate,
      chatUri: this.makeChatUri(context.chatId),
      threadUri: this.makeThreadUri(context.chatId, context.threadId),
      entryUri: this.makeThreadUri(context.chatId, context.threadId),
    })

    await this.insertInboxNotification(this.makeAuditUri(auditId, eventDate), this.buildEventKey('auth-resolved-notification', runtimeSession.id, auditId), eventDate)
    this.pendingAuthBySession.delete(runtimeSession.id)
    await this.invalidateInboxQueries()
  }

  private async persistSessionStatus(
    runtimeSession: RuntimeSessionRecord,
    event: Extract<RuntimeSessionEvent, { type: 'status' }>,
    context: RuntimeEventContext,
  ): Promise<void> {
    const previousStatus = this.latestSessionStatus.get(runtimeSession.id)
    if (previousStatus === event.status) {
      return
    }

    this.latestSessionStatus.set(runtimeSession.id, event.status)

    const eventKey = this.buildEventKey('status', runtimeSession.id, event.status)
    if (this.seenEventKeys.has(eventKey)) {
      return
    }
    this.seenEventKeys.add(eventKey)

    await this.upsertSessionState(runtimeSession, event, context, previousStatus)

    const eventDate = eventDateFromTs(event.ts)
    await this.insertAuditEntry({
      action: `runtime.session.${event.status}`,
      sessionId: runtimeSession.id,
      createdAt: eventDate,
      sessionCreatedAt: eventDate,
      chatUri: this.makeChatUri(context.chatId),
      threadUri: this.makeThreadUri(context.chatId, context.threadId),
      entryUri: this.makeThreadUri(context.chatId, context.threadId),
    })

    await this.invalidateInboxQueries()
  }

  private async persistToolCall(
    runtimeSession: RuntimeSessionRecord,
    event: Extract<RuntimeSessionEvent, { type: 'tool_call' }>,
    context: RuntimeEventContext,
  ): Promise<void> {
    const eventDate = eventDateFromTs(event.ts)
    const existingApproval = await this.findApprovalByToolCall(event.requestId)
    let approvalId = existingApproval?.id

    if (!approvalId) {
      approvalId = crypto.randomUUID()
      await this.db.insert(approvalResource).values({
        id: approvalId,
        session: this.makeRuntimeSessionUri(runtimeSession.id, eventDate),
        toolCallId: event.requestId,
        toolName: event.name,
        target: this.makeThreadUri(context.chatId, context.threadId),
        action: ODRL.term('use'),
        risk: inferRisk(event.name, event.arguments),
        status: 'pending',
        assignedTo: this.webId,
        policyVersion: POLICY_VERSION,
        createdAt: eventDate,
      }).execute()
    }

    const approvalCreatedAt = eventDateFromTs(Date.parse(String(existingApproval?.createdAt ?? eventDate.toISOString())))
    const approvalUri = this.makeApprovalUri(approvalId, existingApproval ? approvalCreatedAt : eventDate)
    const auditId = await this.insertAuditEntry({
      action: 'runtime.tool_call.waiting_approval',
      sessionId: runtimeSession.id,
      toolCallId: event.requestId,
      toolName: event.name,
      approvalUri,
      createdAt: eventDate,
      sessionCreatedAt: eventDate,
      chatUri: this.makeChatUri(context.chatId),
      threadUri: this.makeThreadUri(context.chatId, context.threadId),
      entryUri: this.makeThreadUri(context.chatId, context.threadId),
    })

    await this.insertInboxNotification(approvalUri, this.buildEventKey('approval', runtimeSession.id, event.requestId), eventDate)
    await this.insertInboxNotification(this.makeAuditUri(auditId, eventDate), this.buildEventKey('audit', runtimeSession.id, `tool-call-${event.requestId}`), eventDate)

    await this.invalidateInboxQueries()
  }

  private async persistAuthRequired(
    runtimeSession: RuntimeSessionRecord,
    event: Extract<RuntimeSessionEvent, { type: 'auth_required' }>,
    context: RuntimeEventContext,
  ): Promise<void> {
    const dedupeKey = this.buildEventKey('auth', runtimeSession.id, `${event.method}:${event.url ?? ''}`)
    if (this.seenEventKeys.has(dedupeKey)) {
      return
    }
    this.seenEventKeys.add(dedupeKey)

    const eventDate = eventDateFromTs(event.ts)
    const auditId = await this.insertAuditEntry({
      action: 'runtime.auth_required',
      sessionId: runtimeSession.id,
      createdAt: eventDate,
      sessionCreatedAt: eventDate,
      chatUri: this.makeChatUri(context.chatId),
      threadUri: this.makeThreadUri(context.chatId, context.threadId),
      entryUri: this.makeThreadUri(context.chatId, context.threadId),
    })

    this.pendingAuthBySession.set(runtimeSession.id, {
      method: event.method,
      url: event.url,
      message: event.message,
      options: event.options,
      eventTs: event.ts,
    })

    await this.insertInboxNotification(this.makeAuditUri(auditId, eventDate), this.buildEventKey('auth-notification', runtimeSession.id, auditId), eventDate)

    await this.invalidateInboxQueries()
  }

  private async persistSessionError(
    runtimeSession: RuntimeSessionRecord,
    event: Extract<RuntimeSessionEvent, { type: 'error' }>,
    context: RuntimeEventContext,
  ): Promise<void> {
    const dedupeKey = this.buildEventKey('error', runtimeSession.id, event.message)
    if (this.seenEventKeys.has(dedupeKey)) {
      return
    }
    this.seenEventKeys.add(dedupeKey)

    const eventDate = eventDateFromTs(event.ts)
    const auditId = await this.insertAuditEntry({
      action: 'runtime.session.error',
      sessionId: runtimeSession.id,
      createdAt: eventDate,
      sessionCreatedAt: eventDate,
      chatUri: this.makeChatUri(context.chatId),
      threadUri: this.makeThreadUri(context.chatId, context.threadId),
      entryUri: this.makeThreadUri(context.chatId, context.threadId),
    })

    await this.insertInboxNotification(this.makeAuditUri(auditId, eventDate), this.buildEventKey('error-notification', runtimeSession.id, auditId), eventDate)

    await this.invalidateInboxQueries()
  }
}
