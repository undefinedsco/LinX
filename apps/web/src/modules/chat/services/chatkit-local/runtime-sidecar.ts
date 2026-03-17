import { eq } from '@undefineds.co/drizzle-solid'
import { resolveLinxPodBaseUrl } from '@linx/models/client'
import {
  ODRL,
  approvalTable,
  auditTable,
  inboxNotificationTable,
  type ApprovalRow,
  type SolidDatabase,
} from '@linx/models'
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

function buildResourceUri(podBaseUrl: string, basePath: string, id: string): string {
  return `${podBaseUrl}${basePath}${id}.ttl#${id}`
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
    this.podBaseUrl = resolveLinxPodBaseUrl(this.webId)
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

  private makeRuntimeSessionUri(sessionId: string): string {
    return `urn:linx:runtime-session:${sessionId}`
  }

  private makeThreadUri(chatId: string, threadId: string): string {
    return `${this.podBaseUrl}/.data/chat/${chatId}/index.ttl#${threadId}`
  }

  private makeApprovalUri(id: string): string {
    return buildResourceUri(this.podBaseUrl, '/.data/approvals/', id)
  }

  private makeAuditUri(id: string): string {
    return buildResourceUri(this.podBaseUrl, '/.data/audit/', id)
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
    context: Record<string, unknown>
  }): Promise<string> {
    const id = input.id ?? crypto.randomUUID()
    await this.db.insert(auditTable).values({
      id,
      action: input.action,
      actor: this.webId,
      actorRole: 'system',
      session: this.makeRuntimeSessionUri(input.sessionId),
      toolCallId: input.toolCallId,
      approval: input.approvalUri,
      context: JSON.stringify(input.context),
      policyVersion: POLICY_VERSION,
      createdAt: new Date(),
    }).execute()
    return id
  }

  private async insertInboxNotification(objectUri: string, dedupeKey: string): Promise<void> {
    if (this.seenEventKeys.has(dedupeKey)) {
      return
    }

    this.seenEventKeys.add(dedupeKey)
    await this.db.insert(inboxNotificationTable).values({
      id: crypto.randomUUID(),
      actor: this.webId,
      object: objectUri,
      createdAt: new Date(),
    }).execute()
  }

  private async findApprovalByToolCall(toolCallId: string): Promise<ApprovalRow | null> {
    const rows = await this.db.select().from(approvalTable)
      .where(eq(approvalTable.toolCallId, toolCallId))
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

    const auditId = await this.insertAuditEntry({
      action: 'runtime.auth_resolved',
      sessionId: runtimeSession.id,
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

    await this.insertInboxNotification(this.makeAuditUri(auditId), this.buildEventKey('auth-resolved-notification', runtimeSession.id, auditId))
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

    await this.insertAuditEntry({
      action: `runtime.session.${event.status}`,
      sessionId: runtimeSession.id,
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
    const existingApproval = await this.findApprovalByToolCall(event.requestId)
    let approvalId = existingApproval?.id

    if (!approvalId) {
      approvalId = crypto.randomUUID()
      await this.db.insert(approvalTable).values({
        id: approvalId,
        session: this.makeRuntimeSessionUri(runtimeSession.id),
        toolCallId: event.requestId,
        toolName: event.name,
        target: this.makeThreadUri(context.chatId, context.threadId),
        action: ODRL.term('use'),
        risk: inferRisk(event.name, event.arguments),
        status: 'pending',
        assignedTo: this.webId,
        policyVersion: POLICY_VERSION,
        createdAt: new Date(),
      }).execute()
    }

    const approvalUri = this.makeApprovalUri(approvalId)
    const auditId = await this.insertAuditEntry({
      action: 'runtime.tool_call.waiting_approval',
      sessionId: runtimeSession.id,
      toolCallId: event.requestId,
      approvalUri,
      context: {
        toolName: event.name,
        arguments: event.arguments,
        risk: inferRisk(event.name, event.arguments),
        threadUri: this.makeThreadUri(context.chatId, context.threadId),
        eventTs: event.ts,
      },
    })

    await this.insertInboxNotification(approvalUri, this.buildEventKey('approval', runtimeSession.id, event.requestId))
    await this.insertInboxNotification(this.makeAuditUri(auditId), this.buildEventKey('audit', runtimeSession.id, `tool-call-${event.requestId}`))

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

    const auditId = await this.insertAuditEntry({
      action: 'runtime.auth_required',
      sessionId: runtimeSession.id,
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

    await this.insertInboxNotification(this.makeAuditUri(auditId), this.buildEventKey('auth-notification', runtimeSession.id, auditId))

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

    const auditId = await this.insertAuditEntry({
      action: 'runtime.session.error',
      sessionId: runtimeSession.id,
      context: {
        message: event.message,
        title: runtimeSession.title,
        tool: runtimeSession.tool,
        threadUri: this.makeThreadUri(context.chatId, context.threadId),
        eventTs: event.ts,
      },
    })

    await this.insertInboxNotification(this.makeAuditUri(auditId), this.buildEventKey('error-notification', runtimeSession.id, auditId))

    await this.invalidateInboxQueries()
  }
}
