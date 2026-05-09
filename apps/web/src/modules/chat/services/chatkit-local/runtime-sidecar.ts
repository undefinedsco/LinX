import { eq } from '@undefineds.co/drizzle-solid'
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

function recordIri(row: Record<string, unknown> | null | undefined): string | null {
  const value = row?.['@id'] ?? row?.subject ?? row?.uri ?? row?.source
  return typeof value === 'string' && value.length > 0 ? value : null
}

export class RuntimeSidecarSink {
  private readonly podBaseUrl: string
  private readonly seenEventKeys = new Set<string>()
  private readonly latestSessionStatus = new Map<string, RuntimeThreadStatus>()
  private readonly pendingAuthBySession = new Map<string, PendingAuthState>()

  constructor(
    private readonly db: SolidDatabase,
    private readonly webId: string,
  ) {
    this.podBaseUrl = this.resolvePodBaseUrl(this.webId)
  }

  private resolvePodBaseUrl(webId: string): string {
    return webId.replace('/profile/card#me', '').replace(/\/$/, '')
  }

  private resolveResourceIri(resource: { resolveUri?: (id: string) => string }, id: string): string {
    if (!resource) {
      throw new Error(`Missing resource while resolving storage id: ${id}`)
    }

    const relativeUri = typeof resource.resolveUri === 'function' ? resource.resolveUri(id) : id
    if (/^https?:\/\//.test(relativeUri)) return relativeUri
    return new URL(relativeUri.replace(/^\//, ''), `${this.podBaseUrl}/`).toString()
  }

  private whereByStorageId(resource: any, query: any, id: string): any {
    const iri = this.resolveResourceIri(resource, id)
    if (typeof query.whereByIri === 'function') {
      return query.whereByIri(iri)
    }
    return query.where({ id } as any)
  }

  private async findByStorageId<T>(resource: any, id: string): Promise<T | null> {
    if (typeof (this.db as any).findByIri === 'function') {
      const byIri = await (this.db as any).findByIri(resource, this.resolveResourceIri(resource, id)) as T | null
      if (byIri) {
        return byIri
      }
    }

    const rows = await this.db.select().from(resource).execute()
    return (rows as any[]).find((row) => row?.id === id) as T | undefined ?? null
  }

  async persistRuntimeEvent(
    runtimeSession: RuntimeSessionRecord,
    event: RuntimeSessionEvent,
    context: RuntimeEventContext,
  ): Promise<void> {
    if (
      this.pendingAuthBySession.has(runtimeSession.id)
      && (event.type === 'assistant_delta' || event.type === 'assistant_done' || event.type === 'tool_call')
    ) {
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
      ownerWebId: this.webId,
      chat: this.makeChatUri(context.chatId),
      thread: this.makeThreadUri(context.chatId, context.threadId),
      sessionType: 'direct',
      status: event.status,
      tool: runtimeSession.tool,
      tokenUsage: runtimeSession.tokenUsage,
      metadata: {
        title: runtimeSession.title,
        previousStatus: previousStatus ?? null,
        chatId: context.chatId,
        threadId: context.threadId,
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

    const existingIri = recordIri(existing)
    const updateByIri = (this.db as unknown as { updateByIri?: (resource: typeof sessionTable, iri: string, data: Record<string, unknown>) => Promise<unknown> }).updateByIri
    if (existingIri && typeof updateByIri === 'function') {
      await updateByIri.call(this.db, sessionTable, existingIri, payload)
      return
    }

    await this.whereByStorageId(sessionTable, this.db.update(sessionTable).set(payload), runtimeSession.id)
      .execute()
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
    toolCallId?: string
    approvalUri?: string
    createdAt?: Date
    sessionCreatedAt?: Date
    context: Record<string, unknown>
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
      approval: input.approvalUri,
      context: JSON.stringify(input.context),
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
      .where(eq(approvalResource.toolCallId, toolCallId))
      .execute()
    return (rows[0] as ApprovalRow | undefined) ?? null
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
      context: {
        method: pendingAuth.method,
        url: pendingAuth.url,
        message: pendingAuth.message,
        options: pendingAuth.options,
        threadUri: this.makeThreadUri(context.chatId, context.threadId),
        authRequiredAt: pendingAuth.eventTs,
        eventTs,
      },
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
      context: {
        title: runtimeSession.title,
        tool: runtimeSession.tool,
        tokenUsage: runtimeSession.tokenUsage,
        threadUri: this.makeThreadUri(context.chatId, context.threadId),
        previousStatus: previousStatus ?? null,
        nextStatus: event.status,
        eventTs: event.ts,
      },
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
      approvalUri,
      createdAt: eventDate,
      sessionCreatedAt: eventDate,
      context: {
        toolName: event.name,
        arguments: event.arguments,
        risk: inferRisk(event.name, event.arguments),
        threadUri: this.makeThreadUri(context.chatId, context.threadId),
        eventTs: event.ts,
      },
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
      context: {
        method: event.method,
        url: event.url,
        message: event.message,
        options: event.options,
        threadUri: this.makeThreadUri(context.chatId, context.threadId),
        eventTs: event.ts,
      },
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
      context: {
        message: event.message,
        title: runtimeSession.title,
        tool: runtimeSession.tool,
        threadUri: this.makeThreadUri(context.chatId, context.threadId),
        eventTs: event.ts,
      },
    })

    await this.insertInboxNotification(this.makeAuditUri(auditId, eventDate), this.buildEventKey('error-notification', runtimeSession.id, auditId), eventDate)

    await this.invalidateInboxQueries()
  }
}
