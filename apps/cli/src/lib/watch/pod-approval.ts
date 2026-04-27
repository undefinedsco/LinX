import { setTimeout as delay } from 'node:timers/promises'
import type { Session } from '@inrupt/solid-client-authn-node'
import type { ClientCredentialsSecrets, StoredCredentials } from '../credentials-store.js'
import type { WatchApprovalDecision, WatchApprovalRequest, WatchSessionRecord } from '@undefineds.co/models/watch'

const WATCH_CHAT_ID = 'linx-watch'
const WATCH_AGENT_ID = 'linx-watch-assistant'
const REMOTE_APPROVAL_POLICY_VERSION = 'linx-watch-remote-approval/v1'
const DEFAULT_REMOTE_APPROVAL_POLL_MS = 1000

type RemoteApprovalStatus = 'pending' | 'approved' | 'rejected'
type RemoteApprovalRisk = 'low' | 'medium' | 'high'

interface ApprovalRowLike extends Record<string, unknown> {
  id: string
  session: string
  toolCallId: string
  toolName: string
  target: string
  action: string
  risk: string
  status: string
  assignedTo?: string
  decisionBy?: string
  decisionRole?: string
  onBehalfOf?: string
  reason?: string
  policyVersion?: string
  createdAt: Date | string
  resolvedAt?: Date | string
}

interface AuditRowLike extends Record<string, unknown> {
  id: string
  action: string
  actor: string
  actorRole: string
  onBehalfOf?: string
  session?: string
  toolCallId?: string
  approval?: string
  context?: string
  policyVersion?: string
  createdAt: Date | string
}

interface InboxNotificationRowLike extends Record<string, unknown> {
  id: string
  actor?: string
  object: string
  createdAt: Date | string
}

interface WatchRemoteApprovalStore {
  listApprovals(): Promise<ApprovalRowLike[]>
  insertApproval(row: ApprovalRowLike): Promise<void>
  updateApproval(id: string, patch: Partial<ApprovalRowLike>): Promise<void>
  listAudits(): Promise<AuditRowLike[]>
  insertAudit(row: AuditRowLike): Promise<void>
  listGrants(): Promise<Array<Record<string, unknown>>>
  insertGrant(row: Record<string, unknown>): Promise<void>
  insertInboxNotification(row: InboxNotificationRowLike): Promise<void>
}

interface WatchRemoteApprovalRuntime {
  loadCredentials: () => StoredCredentials | null
  getClientCredentials: (stored: StoredCredentials) => ClientCredentialsSecrets | null
  authenticate: (clientId: string, clientSecret: string, oidcIssuer: string) => Promise<{ session: Session }>
  createStore: (session: Session) => WatchRemoteApprovalStore
  sleep: (ms: number) => Promise<void>
  now: () => Date
}

export interface RemoteWatchApprovalSummary {
  id: string
  sessionId: string
  sessionUri: string
  toolCallId: string
  toolName: string
  risk: RemoteApprovalRisk
  status: RemoteApprovalStatus
  message: string
  command?: string
  cwd?: string
  assignedTo?: string
  decisionBy?: string
  decision?: WatchApprovalDecision
  createdAt: string
  resolvedAt?: string
}

interface RequestAuditContext {
  kind: WatchApprovalRequest['kind']
  message: string
  command?: string
  cwd?: string
  backend: WatchSessionRecord['backend']
  sessionId: string
}

interface DecisionAuditContext {
  decision: WatchApprovalDecision
  note?: string
}

function createAbortError(): Error {
  const error = new Error('The operation was aborted.')
  error.name = 'AbortError'
  return error
}

async function dynamicImport(specifier: string): Promise<Record<string, any>> {
  const loader = new Function('modulePath', 'return import(modulePath)') as (modulePath: string) => Promise<Record<string, any>>
  return loader(specifier)
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toIsoString(value: Date | string | undefined, fallback: string): string {
  if (value instanceof Date) {
    return value.toISOString()
  }

  if (typeof value === 'string' && value.trim()) {
    return value
  }

  return fallback
}

function getPodBaseUrl(webIdOrUri: string): string {
  if (webIdOrUri.includes('/profile/card#me')) {
    return webIdOrUri.replace('/profile/card#me', '').replace(/\/$/, '')
  }

  const match = webIdOrUri.match(/^(https?:\/\/[^?#]+?)(?:\/\.data\/|\/inbox\/)/u)
  if (match) {
    return match[1].replace(/\/$/, '')
  }

  return webIdOrUri.replace(/\/$/, '')
}

function buildThreadUri(webId: string, threadId: string): string {
  return `${getPodBaseUrl(webId)}/.data/chat/${WATCH_CHAT_ID}/index.ttl#${threadId}`
}

function buildApprovalUri(webIdOrUri: string, approvalId: string): string {
  return `${getPodBaseUrl(webIdOrUri)}/.data/approvals/${approvalId}.ttl`
}

function buildGrantUri(webIdOrUri: string, grantId: string): string {
  return `${getPodBaseUrl(webIdOrUri)}/settings/autonomy/grants/${grantId}.ttl`
}

function buildAgentUri(webId: string): string {
  return `${getPodBaseUrl(webId)}/.data/agents/${WATCH_AGENT_ID}.ttl`
}

function buildActionUri(request: WatchApprovalRequest): string {
  if (request.kind === 'command-approval') {
    return 'https://undefineds.co/ns#commandExecution'
  }

  if (request.kind === 'file-change-approval') {
    return 'https://undefineds.co/ns#fileChange'
  }

  if (request.kind === 'permissions-approval') {
    return 'https://undefineds.co/ns#permissionRequest'
  }

  return 'https://undefineds.co/ns#runtimeApproval'
}

function buildToolName(request: WatchApprovalRequest): string {
  if (request.kind === 'command-approval') {
    return 'commandExecution'
  }

  if (request.kind === 'file-change-approval') {
    return 'fileChange'
  }

  if (request.kind === 'permissions-approval') {
    return 'permissionRequest'
  }

  return 'runtimeApproval'
}

function buildRisk(request: WatchApprovalRequest): RemoteApprovalRisk {
  if (request.kind === 'permissions-approval') {
    return 'high'
  }

  if (request.kind === 'file-change-approval') {
    return 'high'
  }

  return 'medium'
}

function riskScore(risk: string | undefined): number {
  switch (risk) {
    case 'low':
      return 1
    case 'medium':
      return 2
    case 'high':
      return 3
    default:
      return 0
  }
}

function buildRequestMessage(request: WatchApprovalRequest): string {
  if (request.kind === 'command-approval') {
    return request.command?.trim() || request.message
  }

  if (request.kind === 'file-change-approval') {
    return request.reason?.trim() || request.message
  }

  return request.message
}

function buildRequestAuditContext(record: WatchSessionRecord, request: WatchApprovalRequest): RequestAuditContext {
  return {
    kind: request.kind,
    message: buildRequestMessage(request),
    ...(request.kind === 'command-approval' && request.command ? { command: request.command } : {}),
    ...(request.kind === 'command-approval' && request.cwd ? { cwd: request.cwd } : {}),
    backend: record.backend,
    sessionId: record.id,
  }
}

function extractToolCallId(request: WatchApprovalRequest): string {
  if (!isRecord(request.raw)) {
    return crypto.randomUUID()
  }

  const params = isRecord(request.raw.params) ? request.raw.params : null
  const toolCall = params && isRecord(params.toolCall) ? params.toolCall : null

  return normalizeString(toolCall?.toolCallId)
    ?? normalizeString(params?.toolCallId)
    ?? crypto.randomUUID()
}

function encodeDecisionReason(decision: WatchApprovalDecision, note?: string): string {
  return JSON.stringify({
    decision,
    ...(note?.trim() ? { note: note.trim() } : {}),
  })
}

function parseDecisionReason(value: unknown): DecisionAuditContext | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }

  try {
    const parsed = JSON.parse(value) as unknown
    if (!isRecord(parsed)) {
      return null
    }

    const decision = normalizeString(parsed.decision)
    if (!decision || !['accept', 'accept_for_session', 'decline', 'cancel'].includes(decision)) {
      return null
    }

    return {
      decision: decision as WatchApprovalDecision,
      ...(normalizeString(parsed.note) ? { note: normalizeString(parsed.note) } : {}),
    }
  } catch {
    return null
  }
}

function parseRequestAuditContext(value: unknown): RequestAuditContext | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }

  try {
    const parsed = JSON.parse(value) as unknown
    if (!isRecord(parsed)) {
      return null
    }

    const kind = normalizeString(parsed.kind)
    const message = normalizeString(parsed.message)
    const backend = normalizeString(parsed.backend)
    const sessionId = normalizeString(parsed.sessionId)
    if (!kind || !message || !backend || !sessionId) {
      return null
    }

    return {
      kind: kind as WatchApprovalRequest['kind'],
      message,
      backend: backend as WatchSessionRecord['backend'],
      sessionId,
      ...(normalizeString(parsed.command) ? { command: normalizeString(parsed.command) } : {}),
      ...(normalizeString(parsed.cwd) ? { cwd: normalizeString(parsed.cwd) } : {}),
    }
  } catch {
    return null
  }
}

function extractSessionId(sessionUri: string): string {
  if (sessionUri.includes('#')) {
    return sessionUri.split('#').pop() || sessionUri
  }

  return sessionUri
}

function decisionFromApprovalRow(row: ApprovalRowLike): WatchApprovalDecision | null {
  const status = normalizeString(row.status)
  if (status === 'pending') {
    return null
  }

  const parsed = parseDecisionReason(row.reason)

  if (status === 'rejected') {
    return parsed?.decision === 'cancel' ? 'cancel' : 'decline'
  }

  if (parsed?.decision === 'accept_for_session') {
    return 'accept_for_session'
  }

  return 'accept'
}

function requestAuditForApproval(approvalUri: string, audits: AuditRowLike[]): AuditRowLike | undefined {
  const matches = audits.filter((audit) => audit.approval === approvalUri && audit.action === 'approval_requested')
  matches.sort((left, right) => toIsoString(right.createdAt, '').localeCompare(toIsoString(left.createdAt, '')))
  return matches[0]
}

function normalizeApprovalSummary(row: ApprovalRowLike, audits: AuditRowLike[]): RemoteWatchApprovalSummary {
  const approvalUri = buildApprovalUri(row.session, row.id)
  const requestAudit = requestAuditForApproval(approvalUri, audits)
  const requestContext = parseRequestAuditContext(requestAudit?.context)
  const createdAt = toIsoString(row.createdAt, new Date(0).toISOString())
  const sessionUri = row.session
  const decision = decisionFromApprovalRow(row)

  return {
    id: row.id,
    sessionId: extractSessionId(sessionUri),
    sessionUri,
    toolCallId: row.toolCallId,
    toolName: row.toolName,
    risk: (normalizeString(row.risk) as RemoteApprovalRisk | undefined) ?? 'medium',
    status: (normalizeString(row.status) as RemoteApprovalStatus | undefined) ?? 'pending',
    message: requestContext?.message ?? row.toolName,
    ...(requestContext?.command ? { command: requestContext.command } : {}),
    ...(requestContext?.cwd ? { cwd: requestContext.cwd } : {}),
    ...(normalizeString(row.assignedTo) ? { assignedTo: normalizeString(row.assignedTo) } : {}),
    ...(normalizeString(row.decisionBy) ? { decisionBy: normalizeString(row.decisionBy) } : {}),
    ...(decision ? { decision } : {}),
    createdAt,
    ...(row.resolvedAt ? { resolvedAt: toIsoString(row.resolvedAt, createdAt) } : {}),
  }
}

function formatSummaryHeadline(summary: RemoteWatchApprovalSummary): string {
  return `${summary.id} | ${summary.status} | ${summary.risk} | session=${summary.sessionId}`
}

export function formatRemoteWatchApprovalSummary(summary: RemoteWatchApprovalSummary): string {
  const detail = summary.command ?? summary.message
  const secondary = [
    summary.toolName,
    summary.cwd ? `cwd=${summary.cwd}` : '',
    summary.decision ? `decision=${summary.decision}` : '',
  ].filter(Boolean).join(' | ')

  return [formatSummaryHeadline(summary), `  ${detail}`, secondary ? `  ${secondary}` : ''].filter(Boolean).join('\n')
}

export function isRemoteApprovalAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function missingRemoteApprovalCredentialsMessage(): string {
  return 'LinX remote approval requires `linx login` first.'
}

function unsupportedRemoteApprovalAuthMessage(): string {
  return 'LinX remote approval requires client credentials auth in `~/.linx`.'
}

async function createDefaultRuntime(): Promise<WatchRemoteApprovalRuntime> {
  const [credentialsStore, solidAuth, models] = await Promise.all([
    dynamicImport(new URL('../credentials-store.js', import.meta.url).href),
    dynamicImport(new URL('../solid-auth.js', import.meta.url).href),
    dynamicImport(new URL('../models.js', import.meta.url).href),
  ])

  return {
    loadCredentials: credentialsStore.loadCredentials,
    getClientCredentials: credentialsStore.getClientCredentials,
    authenticate: solidAuth.authenticate,
    createStore(session) {
      const db = models.drizzle(session, {
        logger: false,
        disableInteropDiscovery: true,
        schema: models.solidSchema,
      })
      let initialized = false

      async function ensureInitialized(): Promise<void> {
        if (initialized) {
          return
        }

        initialized = true
        await db.init([
          models.approvalTable,
          models.auditTable,
          models.grantTable,
          models.inboxNotificationTable,
        ]).catch(() => undefined)
      }

      return {
        async listApprovals(): Promise<ApprovalRowLike[]> {
          await ensureInitialized()
          return await db.select().from(models.approvalTable).execute() as ApprovalRowLike[]
        },
        async insertApproval(row: ApprovalRowLike): Promise<void> {
          await ensureInitialized()
          await db.insert(models.approvalTable).values(row).execute()
        },
        async updateApproval(id: string, patch: Partial<ApprovalRowLike>): Promise<void> {
          await ensureInitialized()
          await db.update(models.approvalTable).set(patch).where(models.eq((models.approvalTable as any).id, id)).execute()
        },
        async listAudits(): Promise<AuditRowLike[]> {
          await ensureInitialized()
          return await db.select().from(models.auditTable).execute() as AuditRowLike[]
        },
        async insertAudit(row: AuditRowLike): Promise<void> {
          await ensureInitialized()
          await db.insert(models.auditTable).values(row).execute()
        },
        async listGrants(): Promise<Array<Record<string, unknown>>> {
          await ensureInitialized()
          return await db.select().from(models.grantTable).execute() as Array<Record<string, unknown>>
        },
        async insertGrant(row: Record<string, unknown>): Promise<void> {
          await ensureInitialized()
          await db.insert(models.grantTable).values(row as any).execute()
        },
        async insertInboxNotification(row: InboxNotificationRowLike): Promise<void> {
          await ensureInitialized()
          await db.insert(models.inboxNotificationTable).values(row).execute()
        },
      }
    },
    sleep(ms: number) {
      return delay(ms)
    },
    now() {
      return new Date()
    },
  }
}

async function withRemoteApprovalStore<T>(
  runtime: WatchRemoteApprovalRuntime,
  fn: (input: {
    store: WatchRemoteApprovalStore
    webId: string
    stored: StoredCredentials
  }) => Promise<T>,
): Promise<T> {
  const stored = runtime.loadCredentials()
  if (!stored) {
    throw new Error(missingRemoteApprovalCredentialsMessage())
  }

  const clientCredentials = runtime.getClientCredentials(stored)
  if (!clientCredentials) {
    throw new Error(unsupportedRemoteApprovalAuthMessage())
  }

  const { session } = await runtime.authenticate(clientCredentials.clientId, clientCredentials.clientSecret, stored.url)
  const webId = session.info.webId ?? stored.webId
  if (!webId) {
    await session.logout().catch(() => undefined)
    throw new Error('Remote approval authentication succeeded without a WebID.')
  }

  try {
    return await fn({
      store: runtime.createStore(session),
      webId,
      stored,
    })
  } finally {
    await session.logout().catch(() => undefined)
  }
}

export async function createRemoteWatchApproval(options: {
  record: WatchSessionRecord
  request: WatchApprovalRequest
  runtime?: WatchRemoteApprovalRuntime
}): Promise<RemoteWatchApprovalSummary> {
  const activeRuntime = options.runtime ?? await createDefaultRuntime()

  return withRemoteApprovalStore(activeRuntime, async ({ store, webId }) => {
    const approvalId = crypto.randomUUID()
    const now = activeRuntime.now()
    const sessionUri = buildThreadUri(webId, options.record.id)
    const approvalUri = buildApprovalUri(webId, approvalId)
    const toolCallId = extractToolCallId(options.request)
    const requestContext = buildRequestAuditContext(options.record, options.request)

    await store.insertApproval({
      id: approvalId,
      session: sessionUri,
      toolCallId,
      toolName: buildToolName(options.request),
      target: sessionUri,
      action: buildActionUri(options.request),
      risk: buildRisk(options.request),
      status: 'pending',
      assignedTo: webId,
      policyVersion: REMOTE_APPROVAL_POLICY_VERSION,
      createdAt: now,
    })

    await store.insertAudit({
      id: crypto.randomUUID(),
      action: 'approval_requested',
      actor: buildAgentUri(webId),
      actorRole: 'secretary',
      onBehalfOf: webId,
      session: sessionUri,
      toolCallId,
      approval: approvalUri,
      context: JSON.stringify(requestContext),
      policyVersion: REMOTE_APPROVAL_POLICY_VERSION,
      createdAt: now,
    })

    await store.insertInboxNotification({
      id: crypto.randomUUID(),
      actor: buildAgentUri(webId),
      object: approvalUri,
      createdAt: now,
    }).catch(() => undefined)

    return normalizeApprovalSummary({
      id: approvalId,
      session: sessionUri,
      toolCallId,
      toolName: buildToolName(options.request),
      target: sessionUri,
      action: buildActionUri(options.request),
      risk: buildRisk(options.request),
      status: 'pending',
      assignedTo: webId,
      policyVersion: REMOTE_APPROVAL_POLICY_VERSION,
      createdAt: now,
    }, [{
      id: crypto.randomUUID(),
      action: 'approval_requested',
      actor: buildAgentUri(webId),
      actorRole: 'secretary',
      onBehalfOf: webId,
      session: sessionUri,
      toolCallId,
      approval: approvalUri,
      context: JSON.stringify(requestContext),
      policyVersion: REMOTE_APPROVAL_POLICY_VERSION,
      createdAt: now,
    }])
  })
}

export async function waitForRemoteWatchApproval(options: {
  approvalId: string
  pollMs?: number
  signal?: AbortSignal
  runtime?: WatchRemoteApprovalRuntime
}): Promise<WatchApprovalDecision> {
  const activeRuntime = options.runtime ?? await createDefaultRuntime()

  return withRemoteApprovalStore(activeRuntime, async ({ store }) => {
    while (true) {
      if (options.signal?.aborted) {
        throw createAbortError()
      }

      const approvals = await store.listApprovals()
      const row = approvals.find((entry) => entry.id === options.approvalId)
      if (!row) {
        throw new Error(`Remote approval disappeared before resolution: ${options.approvalId}`)
      }

      const decision = decisionFromApprovalRow(row)
      if (decision) {
        return decision
      }

      await activeRuntime.sleep(options.pollMs ?? DEFAULT_REMOTE_APPROVAL_POLL_MS)
    }
  })
}

export async function requestRemoteWatchApproval(options: {
  record: WatchSessionRecord
  request: WatchApprovalRequest
  pollMs?: number
  signal?: AbortSignal
  runtime?: WatchRemoteApprovalRuntime
}): Promise<WatchApprovalDecision> {
  const activeRuntime = options.runtime ?? await createDefaultRuntime()

  const delegated = await withRemoteApprovalStore(activeRuntime, async ({ store, webId }) => {
    const grants = await store.listGrants()
    const requestAction = buildActionUri(options.request)
    const requestTarget = buildThreadUri(webId, options.record.id)
    const requestRisk = buildRisk(options.request)

    return grants.some((grant) => (
      grant.effect === 'allow'
      && grant.action === requestAction
      && grant.target === requestTarget
      && riskScore(typeof grant.riskCeiling === 'string' ? grant.riskCeiling : undefined) >= riskScore(requestRisk)
      && !grant.revokedAt
    ))
  })

  if (delegated) {
    return 'accept_for_session'
  }

  const summary = await createRemoteWatchApproval({
    record: options.record,
    request: options.request,
    runtime: activeRuntime,
  })

  return waitForRemoteWatchApproval({
    approvalId: summary.id,
    pollMs: options.pollMs,
    signal: options.signal,
    runtime: activeRuntime,
  })
}

export async function listRemoteWatchApprovals(options: {
  status?: RemoteApprovalStatus | 'all'
  runtime?: WatchRemoteApprovalRuntime
} = {}): Promise<RemoteWatchApprovalSummary[]> {
  const activeRuntime = options.runtime ?? await createDefaultRuntime()
  const requestedStatus = options.status ?? 'pending'

  return withRemoteApprovalStore(activeRuntime, async ({ store, webId }) => {
    const [approvals, audits] = await Promise.all([
      store.listApprovals(),
      store.listAudits(),
    ])

    return approvals
      .map((row) => normalizeApprovalSummary(row, audits))
      .filter((summary) => !summary.assignedTo || summary.assignedTo === webId)
      .filter((summary) => requestedStatus === 'all' || summary.status === requestedStatus)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  })
}

export async function resolveRemoteWatchApproval(options: {
  approvalId: string
  decision: WatchApprovalDecision
  note?: string
  runtime?: WatchRemoteApprovalRuntime
}): Promise<RemoteWatchApprovalSummary> {
  const activeRuntime = options.runtime ?? await createDefaultRuntime()

  return withRemoteApprovalStore(activeRuntime, async ({ store, webId }) => {
    const approvals = await store.listApprovals()
    const row = approvals.find((entry) => entry.id === options.approvalId)
    if (!row) {
      throw new Error(`Remote approval not found: ${options.approvalId}`)
    }

    if (row.status !== 'pending') {
      const audits = await store.listAudits()
      return normalizeApprovalSummary(row, audits)
    }

    const now = activeRuntime.now()
    const approvalUri = buildApprovalUri(row.session, row.id)
    const nextStatus = options.decision === 'accept' || options.decision === 'accept_for_session'
      ? 'approved'
      : 'rejected'

    await store.updateApproval(row.id, {
      status: nextStatus,
      decisionBy: webId,
      decisionRole: 'human',
      onBehalfOf: webId,
      reason: encodeDecisionReason(options.decision, options.note),
      resolvedAt: now,
    })

    await store.insertAudit({
      id: crypto.randomUUID(),
      action: nextStatus === 'approved' ? 'approval_approved' : 'approval_rejected',
      actor: webId,
      actorRole: 'human',
      onBehalfOf: webId,
      session: row.session,
      toolCallId: row.toolCallId,
      approval: approvalUri,
      context: JSON.stringify({
        decision: options.decision,
        ...(options.note?.trim() ? { note: options.note.trim() } : {}),
      }),
      policyVersion: REMOTE_APPROVAL_POLICY_VERSION,
      createdAt: now,
    })

    if (options.decision === 'accept_for_session') {
      const grantId = crypto.randomUUID()
      await store.insertGrant({
        id: grantId,
        target: row.target,
        action: row.action,
        effect: 'allow',
        riskCeiling: row.risk,
        decisionBy: webId,
        decisionRole: 'human',
        onBehalfOf: webId,
        createdAt: now,
      })

      await store.insertInboxNotification({
        id: crypto.randomUUID(),
        actor: webId,
        object: buildGrantUri(row.session, grantId),
        createdAt: now,
      }).catch(() => undefined)
    }

    await store.insertInboxNotification({
      id: crypto.randomUUID(),
      actor: webId,
      object: approvalUri,
      createdAt: now,
    }).catch(() => undefined)

    const nextRow: ApprovalRowLike = {
      ...row,
      status: nextStatus,
      decisionBy: webId,
      decisionRole: 'human',
      onBehalfOf: webId,
      reason: encodeDecisionReason(options.decision, options.note),
      resolvedAt: now,
    }
    const audits = await store.listAudits()
    return normalizeApprovalSummary(nextRow, audits)
  })
}

export const __podApprovalInternal = {
  createAbortError,
  buildActionUri,
  buildRequestAuditContext,
  buildRisk,
  buildToolName,
  extractToolCallId,
  decisionFromApprovalRow,
  encodeDecisionReason,
  formatSummaryHeadline,
  isRemoteApprovalAbortError,
  normalizeApprovalSummary,
  parseDecisionReason,
  parseRequestAuditContext,
}
