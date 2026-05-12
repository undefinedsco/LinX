import { setTimeout as delay } from 'node:timers/promises'
import type { StoredCredentials } from '../credentials-store.js'
import { getDefaultPodDataSession, type PodDataSession } from '../pod-data-session.js'
import {
  approvalResource,
  auditResource,
  drizzle,
  grantResource,
  inboxNotificationTable,
  initSolidTables,
  solidSchema,
  type ApprovalInsert,
  type ApprovalRow,
  type AuditInsert,
  type AuditRow,
  type GrantInsert,
  type GrantRow,
  type InboxNotificationInsert,
  type SolidDatabase,
} from '../models.js'
import type {
  WatchApprovalDecision,
  WatchApprovalOption,
  WatchApprovalRequest,
  WatchGrantCoverageDecision,
  WatchSessionRecord,
} from '@undefineds.co/models/watch'
import { resolveWatchGrantCoverage, type WatchGrantCoverageInput } from './secretary.js'

const WATCH_CHAT_ID_PREFIX = 'linx-watch'
const WATCH_AGENT_ID = 'linx-watch-assistant'
const REMOTE_APPROVAL_POLICY_VERSION = 'linx-watch-remote-approval/v1'
const DEFAULT_REMOTE_APPROVAL_POLL_MS = 1000
const DEFAULT_WARN_ONLY_TIMEOUT_MS = 5000
const MAX_GRANT_POLICY_LENGTH = 1200
const MAX_APPROVAL_CONTEXT_LENGTH = 1400
const MIN_GRANT_COVERAGE_CONFIDENCE = 0.75
const MAX_GRANT_COVERAGE_CANDIDATES = 5

export type RemoteApprovalStatus = 'pending' | 'approved' | 'rejected'
export type RemoteApprovalRisk = 'low' | 'medium' | 'high'

export interface ApprovalRowLike extends Record<string, unknown> {
  id: string
  approvalUri?: string
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
  context?: string
  approvalOptions?: string
  policyVersion?: string
  createdAt: Date | string
  expiresAt?: Date | string
  resolvedAt?: Date | string
}

export interface AuditRowLike extends Record<string, unknown> {
  id: string
  action: string
  actor: string
  actorRole: string
  onBehalfOf?: string
  session?: string
  entry?: string
  toolCallId?: string
  toolName?: string
  approval?: string
  policyVersion?: string
  createdAt: Date | string
}

export interface InboxNotificationRowLike extends Record<string, unknown> {
  id: string
  actor?: string
  object: string
  createdAt: Date | string
}

export interface GrantRowLike extends Record<string, unknown> {
  id: string
  target: string
  action: string
  title?: string
  summary?: string
  body?: string
  schema?: string
  pageKind?: string
  wikiStatus?: string
  tags?: string
  source?: string
  sourceHash?: string
  compiledAt?: Date | string
  compiledFrom?: string[]
  related?: string[]
  effect: string
  riskCeiling?: string
  policy?: string
  context?: string
  decisionBy: string
  decisionRole: string
  onBehalfOf?: string
  createdAt: Date | string
  revokedAt?: Date | string
}

export interface WatchRemoteApprovalStore {
  listApprovals(): Promise<ApprovalRowLike[]>
  findApproval?(
    id: string,
    options?: { approvalUri?: string; createdAt?: Date | string },
  ): Promise<ApprovalRowLike | null>
  resolveApprovalReference(locator: { id: string; createdAt?: Date | string }): { id: string; iri: string }
  insertApproval(row: ApprovalRowLike): Promise<void>
  updateApproval(id: string, patch: Partial<ApprovalRowLike>): Promise<void>
  listAudits(): Promise<AuditRowLike[]>
  insertAudit(row: AuditRowLike): Promise<void>
  listGrants(): Promise<GrantRowLike[]>
  resolveGrantReference(locator: { id: string }): { id: string; iri: string }
  insertGrant(row: GrantRowLike): Promise<void>
  insertInboxNotification(row: InboxNotificationRowLike): Promise<void>
}

export interface WatchRemoteApprovalRuntime {
  getPodDataSession: () => Promise<PodDataSession | null>
  createStore: (session: PodDataSession, db: SolidDatabase) => WatchRemoteApprovalStore
  sleep: (ms: number) => Promise<void>
  now: () => Date
  onWarning?: (error: unknown) => void
  resolveGrantCoverage?: (input: WatchGrantCoverageInput) => Promise<WatchGrantCoverageDecision>
}

interface RemoteApprovalClient {
  session: PodDataSession
  store: WatchRemoteApprovalStore
}

const remoteApprovalClientCache = new WeakMap<WatchRemoteApprovalRuntime, Promise<RemoteApprovalClient | null>>()

export interface RemoteWatchApprovalSummary {
  id: string
  approvalUri?: string
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
  approvalOptions?: WatchApprovalOption[]
  expiresAt?: string
  createdAt: string
  resolvedAt?: string
}

interface DecisionAuditContext {
  decision: WatchApprovalDecision
  note?: string
}

export interface RemoteApprovalSubjectContext {
  sessionUri: string
  actorUri: string
  assignedTo?: string
  onBehalfOf?: string
  targetUri?: string
  policyVersion?: string
}

export interface RemoteApprovalRequestDetails {
  kind: WatchApprovalRequest['kind']
  message: string
  toolCallId: string
  toolName: string
  action: string
  risk: RemoteApprovalRisk
  command?: string
  cwd?: string
  approvalOptions?: WatchApprovalOption[]
  timeoutMs?: number
  expiresAt?: Date | string
  context?: string
  entry?: string
}

function createAbortError(): Error {
  const error = new Error('The operation was aborted.')
  error.name = 'AbortError'
  return error
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

function buildWatchChatId(record: WatchSessionRecord): string {
  return `${WATCH_CHAT_ID_PREFIX}-${record.backend}`
}

function buildThreadUri(webId: string, record: WatchSessionRecord): string {
  return `${getPodBaseUrl(webId)}/.data/chat/${buildWatchChatId(record)}/index.ttl#${record.id}`
}

function isAbsoluteIri(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://')
}

function buildGrantSchemaUri(webIdOrUri: string): string {
  return `${getPodBaseUrl(webIdOrUri)}/settings/autonomy/schema/grant.ttl#GrantWikiPage`
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
  return safeJsonStringify({
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

async function warnOnly(runtime: WatchRemoteApprovalRuntime, task: () => Promise<void>): Promise<void> {
  try {
    await Promise.race([
      task(),
      runtime.sleep(DEFAULT_WARN_ONLY_TIMEOUT_MS).then(() => {
        throw new Error(`Pod side-effect sync timed out after ${DEFAULT_WARN_ONLY_TIMEOUT_MS}ms`)
      }),
    ])
  } catch (error) {
    if (runtime.onWarning) {
      runtime.onWarning(error)
      return
    }
    const message = error instanceof Error ? error.message : String(error)
    process.emitWarning(`LinX Pod sync failed: ${message}`)
  }
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return JSON.stringify({ error: 'unserializable_context' })
  }
}

function truncatePodLiteral(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value
  }
  return `${value.slice(0, Math.max(0, maxLength - 15))}...[truncated]`
}

function safeCompactJson(value: unknown, maxLength: number): string {
  return truncatePodLiteral(safeJsonStringify(value), maxLength)
}

function compactApprovalContext(request: RemoteApprovalRequestDetails): string {
  return safeCompactJson({
    kind: request.kind,
    message: request.message,
    toolName: request.toolName,
    action: request.action,
    risk: request.risk,
    ...(request.command ? { command: request.command } : {}),
    ...(request.cwd ? { cwd: request.cwd } : {}),
    ...(request.approvalOptions ? { approvalOptions: request.approvalOptions } : {}),
    ...(request.expiresAt ? { expiresAt: normalizeDateLike(request.expiresAt) } : {}),
    ...(request.context ? { sourceContext: truncatePodLiteral(request.context, 500) } : {}),
  }, MAX_APPROVAL_CONTEXT_LENGTH)
}

function grantWikiTitleFromApproval(row: ApprovalRowLike, explicitTitle?: string): string {
  const explicit = normalizeString(explicitTitle)
  if (explicit) {
    return truncatePodLiteral(explicit, 160)
  }

  return truncatePodLiteral(`${row.toolName} grant wiki for ${extractSessionId(row.session)}`, 160)
}

function grantWikiSummaryFromApproval(row: ApprovalRowLike, explicitSummary?: string): string {
  const explicit = normalizeString(explicitSummary)
  if (explicit) {
    return truncatePodLiteral(explicit, 500)
  }

  return truncatePodLiteral(
    `Authorization wiki page for ${row.toolName}. AI Secretary must read the page body before reusing this grant.`,
    500,
  )
}

function grantWikiBodyFromApproval(row: ApprovalRowLike, explicitBody?: string): string {
  const explicit = normalizeString(explicitBody)
  if (explicit) {
    return truncatePodLiteral(explicit, MAX_GRANT_POLICY_LENGTH)
  }

  return truncatePodLiteral([
    '# Grant Semantics',
    '',
    'This page follows the LLM Wiki pattern: it is the maintained wiki view AI Secretary reads before reusing an authorization.',
    '',
    '## Covers',
    `- Requests semantically inside target ${row.target}.`,
    `- Action family ${row.action}.`,
    `- Risk no higher than ${row.risk}.`,
    '',
    '## Does Not Cover',
    '- Requests that are materially broader than the source approval.',
    '- Requests that change from read-oriented to write/destructive behavior.',
    '- Requests that touch credentials, secrets, package installation, new network side effects, or workspace boundaries unless explicitly documented here.',
    '',
    '## Source Context',
    row.context ?? safeJsonStringify({ toolName: row.toolName, action: row.action, risk: row.risk }),
  ].join('\n'), MAX_GRANT_POLICY_LENGTH)
}

function grantIndexTextFromWikiBody(body: string): string {
  return truncatePodLiteral(body, MAX_GRANT_POLICY_LENGTH)
}

function grantWikiTagsFromApproval(row: ApprovalRowLike, explicitTags?: string[]): string {
  const tags = [
    'autonomy',
    'grant',
    row.toolName,
    row.risk,
    ...(explicitTags ?? []),
  ]
    .map((tag) => tag.trim())
    .filter(Boolean)

  return safeJsonStringify([...new Set(tags)])
}

function grantContextFromApproval(row: ApprovalRowLike): string {
  return safeCompactJson({
    sourceApproval: row.approvalUri ?? row.id,
    session: row.session,
    toolCallId: row.toolCallId,
    toolName: row.toolName,
    target: row.target,
    action: row.action,
    risk: row.risk,
    approvalContext: row.context,
  }, MAX_APPROVAL_CONTEXT_LENGTH)
}

function grantSourceHash(row: ApprovalRowLike): string {
  return `approval:${row.id}:${row.toolCallId}:${row.risk}`
}

function encodeApprovalOptions(options: WatchApprovalOption[] | undefined): string | undefined {
  if (!options || options.length === 0) {
    return undefined
  }
  return safeJsonStringify(options)
}

function parseApprovalOptions(value: unknown): WatchApprovalOption[] | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined
  }

  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) {
      return undefined
    }

    const options = parsed
      .map((option): WatchApprovalOption | null => {
        if (!isRecord(option)) {
          return null
        }

        const optionId = normalizeString(option.optionId)
        const label = normalizeString(option.label)
        if (!optionId || !label) {
          return null
        }

        const kind = normalizeString(option.kind)
        const description = normalizeString(option.description)
        return {
          optionId,
          label,
          ...(kind ? { kind } : {}),
          ...(description ? { description } : {}),
        }
      })
      .filter((option): option is WatchApprovalOption => option !== null)

    return options.length > 0 ? options : undefined
  } catch {
    return undefined
  }
}

function normalizeDateLike(value: Date | string | undefined): string | undefined {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : undefined
  }

  if (typeof value !== 'string' || !value.trim()) {
    return undefined
  }

  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined
}

function resolveApprovalExpiresAt(request: RemoteApprovalRequestDetails, now: Date): Date | string | undefined {
  const explicit = normalizeDateLike(request.expiresAt)
  if (explicit) {
    return explicit
  }

  if (typeof request.timeoutMs === 'number' && Number.isFinite(request.timeoutMs) && request.timeoutMs > 0) {
    return new Date(now.getTime() + request.timeoutMs)
  }

  return undefined
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

function normalizeApprovalSummary(row: ApprovalRowLike): RemoteWatchApprovalSummary {
  const createdAt = toIsoString(row.createdAt, new Date(0).toISOString())
  const sessionUri = row.session
  const decision = decisionFromApprovalRow(row)
  const approvalOptions = parseApprovalOptions(row.approvalOptions)

  return {
    id: row.id,
    ...(normalizeString(row.approvalUri) ? { approvalUri: normalizeString(row.approvalUri) } : {}),
    sessionId: extractSessionId(sessionUri),
    sessionUri,
    toolCallId: row.toolCallId,
    toolName: row.toolName,
    risk: (normalizeString(row.risk) as RemoteApprovalRisk | undefined) ?? 'medium',
    status: (normalizeString(row.status) as RemoteApprovalStatus | undefined) ?? 'pending',
    message: formatApprovalMessage(row),
    ...(normalizeString(row.assignedTo) ? { assignedTo: normalizeString(row.assignedTo) } : {}),
    ...(normalizeString(row.decisionBy) ? { decisionBy: normalizeString(row.decisionBy) } : {}),
    ...(decision ? { decision } : {}),
    ...(approvalOptions ? { approvalOptions } : {}),
    createdAt,
    ...(row.expiresAt ? { expiresAt: toIsoString(row.expiresAt, createdAt) } : {}),
    ...(row.resolvedAt ? { resolvedAt: toIsoString(row.resolvedAt, createdAt) } : {}),
  }
}

function formatApprovalMessage(row: ApprovalRowLike): string {
  if (row.toolName === 'commandExecution') {
    return 'Command execution approval'
  }
  if (row.toolName === 'fileChange') {
    return 'File change approval'
  }
  if (row.toolName === 'permissionRequest') {
    return 'Permission approval'
  }
  return row.toolName
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

async function createDefaultRuntime(): Promise<WatchRemoteApprovalRuntime> {
  return {
    getPodDataSession: getDefaultPodDataSession,
    createStore(session, db) {
      return createNativeRemoteApprovalStore(session.webId, db)
    },
    sleep(ms: number) {
      return delay(ms)
    },
    now() {
      return new Date()
    },
    resolveGrantCoverage: resolveWatchGrantCoverage,
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
  const client = await getRemoteApprovalClient(runtime)
  if (!client) {
    throw new Error(missingRemoteApprovalCredentialsMessage())
  }

  return await fn({
    store: client.store,
    webId: client.session.webId,
    stored: client.session.credentials,
  })
}

async function getRemoteApprovalClient(runtime: WatchRemoteApprovalRuntime): Promise<RemoteApprovalClient | null> {
  let promise = remoteApprovalClientCache.get(runtime)
  if (!promise) {
    promise = createRemoteApprovalClient(runtime)
      .then((client) => {
        if (!client) {
          remoteApprovalClientCache.delete(runtime)
        }
        return client
      })
      .catch((error) => {
        remoteApprovalClientCache.delete(runtime)
        throw error
      })
    remoteApprovalClientCache.set(runtime, promise)
  }

  return promise
}

async function createRemoteApprovalClient(runtime: WatchRemoteApprovalRuntime): Promise<RemoteApprovalClient | null> {
  const session = await runtime.getPodDataSession()
  if (!session) {
    return null
  }
  const db = createRemoteApprovalDb(session)
  await initSolidTables(db, [
    approvalResource,
    auditResource,
    grantResource,
    inboxNotificationTable,
  ])

  return {
    session,
    store: runtime.createStore(session, db),
  }
}

function createRemoteApprovalDb(session: PodDataSession): SolidDatabase {
  return drizzle(session.solidSession, {
    logger: false,
    disableInteropDiscovery: true,
    schema: solidSchema,
  }) as unknown as SolidDatabase
}

function createNativeRemoteApprovalStore(_webId: string, db: SolidDatabase): WatchRemoteApprovalStore {
  return {
    listApprovals: () => listApprovalRows(db),
    findApproval: (id, options) => findApprovalRow(db, id, options),
    resolveApprovalReference: (locator) => resolveResourceReference(db, approvalResource, locator),
    insertApproval: (row) => writeApprovalRow(db, row),
    async updateApproval(id, patch): Promise<void> {
      const data = normalizeApprovalUpdate(patch)
      const approvalUri = normalizeString(patch.approvalUri)
      const targetIri = approvalUri ?? (isAbsoluteIri(id) ? id : undefined)
      if (targetIri) {
        const updateByIri = db.updateByIri
        if (typeof updateByIri !== 'function') {
          throw new Error('Solid database does not support updateByIri')
        }
        const updated = await updateByIri.call(db, approvalResource, targetIri, data)
        if (!updated) {
          throw new Error(`Remote approval not found: ${id}`)
        }
        return
      }

      const updateByLocator = db.updateByLocator
      if (typeof updateByLocator !== 'function') {
        throw new Error('Solid database does not support updateByLocator')
      }
      const updated = await updateByLocator.call(db, approvalResource, { id }, data)
      if (!updated) {
        throw new Error(`Remote approval not found: ${id}`)
      }
    },
    listAudits: () => listAuditRows(db),
    insertAudit: (row) => writeAuditRow(db, row),
    listGrants: () => listGrantRows(db),
    resolveGrantReference: (locator) => resolveResourceReference(db, grantResource, locator),
    insertGrant: (row) => writeGrantRow(db, row),
    insertInboxNotification: (row) => writeInboxNotificationRow(db, row),
  }
}

async function findApprovalRow(
  db: SolidDatabase,
  id: string,
  options: { approvalUri?: string; createdAt?: Date | string } = {},
): Promise<ApprovalRowLike | null> {
  const approvalUri = normalizeString(options.approvalUri) ?? (isAbsoluteIri(id) ? id : undefined)
  if (approvalUri) {
    const findByIri = db.findByIri
    if (typeof findByIri !== 'function') {
      throw new Error('Solid database does not support findByIri')
    }
    const row = await findByIri.call(db, approvalResource, approvalUri)
    return normalizeApprovalRow(row as (ApprovalRow & Record<string, unknown>) | null)
  }

  const findByLocator = db.findByLocator
  if (typeof findByLocator !== 'function') {
    throw new Error('Solid database does not support findByLocator')
  }
  const row = await findByLocator.call(db, approvalResource, {
    id,
    ...(options.createdAt ? { createdAt: options.createdAt } : {}),
  })
  return normalizeApprovalRow(row as (ApprovalRow & Record<string, unknown>) | null)
}

function resolveResourceReference(
  db: SolidDatabase,
  resource: Parameters<NonNullable<SolidDatabase['resolveLocatorIri']>>[0],
  locator: Record<string, unknown>,
): { id: string; iri: string } {
  if (typeof db.resolveLocatorIri !== 'function' || typeof db.resolveLocatorId !== 'function') {
    throw new Error('Solid database does not support locator reference resolution')
  }

  return {
    id: db.resolveLocatorId(resource, locator),
    iri: db.resolveLocatorIri(resource, locator),
  }
}

async function listApprovalRows(db: SolidDatabase): Promise<ApprovalRowLike[]> {
  const rows = await db.select().from(approvalResource).execute()
  return (rows as ApprovalRow[]).map((row) => normalizeApprovalRow(row)).filter((row): row is ApprovalRowLike => row !== null)
}

async function writeApprovalRow(db: SolidDatabase, row: ApprovalRowLike): Promise<void> {
  await db.insert(approvalResource).values(normalizeApprovalInsert(row)).execute()
}

async function listAuditRows(db: SolidDatabase): Promise<AuditRowLike[]> {
  const rows = await db.select().from(auditResource).execute()
  return (rows as AuditRow[]).map((row) => normalizeAuditRow(row)).filter((row): row is AuditRowLike => row !== null)
}

async function writeAuditRow(db: SolidDatabase, row: AuditRowLike): Promise<void> {
  await db.insert(auditResource).values(normalizeAuditInsert(row)).execute()
}

async function listGrantRows(db: SolidDatabase): Promise<GrantRowLike[]> {
  const rows = await db.select().from(grantResource).execute()
  return (rows as GrantRow[]).map((row) => normalizeGrantRow(row)).filter((row): row is GrantRowLike => row !== null)
}

async function writeGrantRow(db: SolidDatabase, row: GrantRowLike): Promise<void> {
  const id = normalizeString(row.id) ?? crypto.randomUUID()
  const target = normalizeString(row.target)
  const action = normalizeString(row.action)
  const effect = normalizeString(row.effect)
  const decisionBy = normalizeString(row.decisionBy)
  const decisionRole = normalizeString(row.decisionRole)
  if (!target || !action || !effect || !decisionBy || !decisionRole) {
    throw new Error(`Invalid remote approval grant row: ${id}`)
  }
  await db.insert(grantResource).values(normalizeGrantInsert({ ...row, id, target, action, effect, decisionBy, decisionRole })).execute()
}

async function writeInboxNotificationRow(db: SolidDatabase, row: InboxNotificationRowLike): Promise<void> {
  await db.insert(inboxNotificationTable).values(normalizeInboxNotificationInsert(row)).execute()
}

function normalizeApprovalRow(row: (ApprovalRow & Record<string, unknown>) | null | undefined): ApprovalRowLike | null {
  if (!row) return null
  return {
    id: String(row.id),
    approvalUri: normalizeString(row['@id']) ?? normalizeString(row.subject) ?? normalizeString(row.uri),
    session: row.session,
    toolCallId: row.toolCallId,
    toolName: row.toolName,
    target: row.target,
    action: row.action,
    risk: row.risk,
    status: row.status,
    assignedTo: row.assignedTo,
    decisionBy: row.decisionBy,
    decisionRole: row.decisionRole,
    onBehalfOf: row.onBehalfOf,
    reason: row.reason,
    context: row.context,
    approvalOptions: row.approvalOptions,
    policyVersion: row.policyVersion,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    resolvedAt: row.resolvedAt,
  }
}

function normalizeAuditRow(row: (AuditRow & Record<string, unknown>) | null | undefined): AuditRowLike | null {
  if (!row) return null
  return {
    id: String(row.id),
    action: row.action,
    actor: row.actor,
    actorRole: row.actorRole,
    onBehalfOf: row.onBehalfOf,
    session: row.session,
    entry: row.entry,
    toolCallId: row.toolCallId,
    toolName: row.toolName,
    approval: row.approval,
    policyVersion: row.policyVersion,
    createdAt: row.createdAt,
  }
}

function normalizeGrantRow(row: (GrantRow & Record<string, unknown>) | null | undefined): GrantRowLike | null {
  if (!row) return null
  return {
    id: String(row.id),
    target: row.target,
    action: row.action,
    title: row.title,
    summary: row.summary,
    body: row.body,
    schema: row.schema,
    pageKind: row.pageKind,
    wikiStatus: row.wikiStatus,
    tags: row.tags,
    source: row.source,
    sourceHash: row.sourceHash,
    compiledAt: row.compiledAt,
    compiledFrom: row.compiledFrom,
    related: row.related,
    effect: row.effect,
    riskCeiling: row.riskCeiling,
    policy: row.policy,
    context: row.context,
    decisionBy: row.decisionBy,
    decisionRole: row.decisionRole,
    onBehalfOf: row.onBehalfOf,
    createdAt: row.createdAt,
    revokedAt: row.revokedAt,
  }
}

function normalizeApprovalInsert(row: ApprovalRowLike): ApprovalInsert {
  return {
    id: row.id,
    session: row.session,
    toolCallId: row.toolCallId,
    toolName: row.toolName,
    target: row.target,
    action: row.action,
    risk: row.risk,
    status: row.status,
    ...(row.assignedTo ? { assignedTo: row.assignedTo } : {}),
    ...(row.decisionBy ? { decisionBy: row.decisionBy } : {}),
    ...(row.decisionRole ? { decisionRole: row.decisionRole } : {}),
    ...(row.onBehalfOf ? { onBehalfOf: row.onBehalfOf } : {}),
    ...(row.reason ? { reason: row.reason } : {}),
    ...(row.context ? { context: row.context } : {}),
    ...(row.approvalOptions ? { approvalOptions: row.approvalOptions } : {}),
    ...(row.policyVersion ? { policyVersion: row.policyVersion } : {}),
    createdAt: new Date(toIsoString(row.createdAt, new Date().toISOString())),
    ...(row.expiresAt ? { expiresAt: new Date(toIsoString(row.expiresAt, new Date().toISOString())) } : {}),
    ...(row.resolvedAt ? { resolvedAt: new Date(toIsoString(row.resolvedAt, new Date().toISOString())) } : {}),
  }
}

function normalizeApprovalUpdate(patch: Partial<ApprovalRowLike>): Partial<ApprovalInsert> {
  const next: Partial<ApprovalInsert> = {}
  for (const key of [
    'session',
    'toolCallId',
    'toolName',
    'target',
    'action',
    'risk',
    'status',
    'assignedTo',
    'decisionBy',
    'decisionRole',
    'onBehalfOf',
    'reason',
    'context',
    'approvalOptions',
    'policyVersion',
  ] as const) {
    if (patch[key] !== undefined) {
      ;(next as Record<string, unknown>)[key] = patch[key]
    }
  }
  if (patch.createdAt !== undefined) next.createdAt = new Date(toIsoString(patch.createdAt, new Date().toISOString()))
  if (patch.expiresAt !== undefined) next.expiresAt = new Date(toIsoString(patch.expiresAt, new Date().toISOString()))
  if (patch.resolvedAt !== undefined) next.resolvedAt = new Date(toIsoString(patch.resolvedAt, new Date().toISOString()))
  return next
}

function normalizeAuditInsert(row: AuditRowLike): AuditInsert {
  return {
    id: row.id,
    action: row.action,
    actor: row.actor,
    actorRole: row.actorRole,
    ...(row.onBehalfOf ? { onBehalfOf: row.onBehalfOf } : {}),
    ...(row.session ? { session: row.session } : {}),
    ...(row.entry ? { entry: row.entry } : {}),
    ...(row.toolCallId ? { toolCallId: row.toolCallId } : {}),
    ...(row.toolName ? { toolName: row.toolName } : {}),
    ...(row.approval ? { approval: row.approval } : {}),
    ...(row.policyVersion ? { policyVersion: row.policyVersion } : {}),
    createdAt: new Date(toIsoString(row.createdAt, new Date().toISOString())),
  }
}

function normalizeGrantInsert(row: GrantRowLike): GrantInsert {
  return {
    id: row.id,
    target: row.target,
    action: row.action,
    ...(row.title ? { title: truncatePodLiteral(row.title, 160) } : {}),
    ...(row.summary ? { summary: truncatePodLiteral(row.summary, 500) } : {}),
    ...(row.body ? { body: truncatePodLiteral(row.body, MAX_GRANT_POLICY_LENGTH) } : {}),
    ...(row.schema ? { schema: row.schema } : {}),
    ...(row.pageKind ? { pageKind: row.pageKind } : {}),
    ...(row.wikiStatus ? { wikiStatus: row.wikiStatus } : {}),
    ...(row.tags ? { tags: truncatePodLiteral(row.tags, 500) } : {}),
    ...(row.source ? { source: row.source } : {}),
    ...(row.sourceHash ? { sourceHash: row.sourceHash } : {}),
    ...(row.compiledAt ? { compiledAt: new Date(toIsoString(row.compiledAt, new Date().toISOString())) } : {}),
    ...(row.compiledFrom ? { compiledFrom: row.compiledFrom } : {}),
    ...(row.related ? { related: row.related } : {}),
    effect: row.effect,
    ...(row.riskCeiling ? { riskCeiling: row.riskCeiling } : {}),
    ...(row.policy ? { policy: truncatePodLiteral(row.policy, MAX_GRANT_POLICY_LENGTH) } : {}),
    ...(row.context ? { context: truncatePodLiteral(row.context, MAX_APPROVAL_CONTEXT_LENGTH) } : {}),
    decisionBy: row.decisionBy,
    decisionRole: row.decisionRole,
    ...(row.onBehalfOf ? { onBehalfOf: row.onBehalfOf } : {}),
    createdAt: new Date(toIsoString(row.createdAt, new Date().toISOString())),
    ...(row.revokedAt ? { revokedAt: new Date(toIsoString(row.revokedAt, new Date().toISOString())) } : {}),
  }
}

function normalizeInboxNotificationInsert(row: InboxNotificationRowLike): InboxNotificationInsert {
  return {
    id: row.id,
    ...(row.actor ? { actor: row.actor } : {}),
    object: row.object,
    createdAt: new Date(toIsoString(row.createdAt, new Date().toISOString())),
  }
}

function isActiveAllowGrant(grant: GrantRowLike): boolean {
  return grant.effect === 'allow' && !grant.revokedAt && !!(normalizeString(grant.body) || normalizeString(grant.policy))
}

function isGrantRiskCandidate(grant: GrantRowLike, requestRisk: string): boolean {
  const ceiling = riskScore(typeof grant.riskCeiling === 'string' ? grant.riskCeiling : undefined)
  return ceiling === 0 || ceiling >= riskScore(requestRisk)
}

function rankGrantCandidate(
  grant: GrantRowLike,
  requestContext: Record<string, unknown>,
): number {
  let score = 0
  if (grant.target === requestContext.target) {
    score += 4
  }
  if (grant.action === requestContext.action) {
    score += 3
  }
  if (grant.schema) {
    score += 2
  }
  if (grant.pageKind === 'autonomy-grant') {
    score += 1
  }
  return score
}

function selectSemanticGrantCandidates(
  grants: GrantRowLike[],
  requestContext: Record<string, unknown>,
): GrantRowLike[] {
  const risk = normalizeString(requestContext.risk) ?? 'medium'
  return grants
    .filter((grant) => isActiveAllowGrant(grant) && isGrantRiskCandidate(grant, risk))
    .sort((left, right) => rankGrantCandidate(right, requestContext) - rankGrantCandidate(left, requestContext))
    .slice(0, MAX_GRANT_COVERAGE_CANDIDATES)
}

function acceptsGrantCoverage(decision: WatchGrantCoverageDecision | null | undefined): boolean {
  return decision?.covers === true
    && typeof decision.confidence === 'number'
    && decision.confidence >= MIN_GRANT_COVERAGE_CONFIDENCE
}

async function resolveSemanticGrantDecision(options: {
  runtime: WatchRemoteApprovalRuntime
  grants: GrantRowLike[]
  request: WatchApprovalRequest | Record<string, unknown>
  requestContext: Record<string, unknown>
  record?: WatchSessionRecord
}): Promise<WatchApprovalDecision | null> {
  const candidates = selectSemanticGrantCandidates(options.grants, options.requestContext)
  if (candidates.length === 0) {
    return null
  }

  const resolver = options.runtime.resolveGrantCoverage ?? resolveWatchGrantCoverage
  for (const grant of candidates) {
    const coverage = await resolver({
      record: options.record,
      request: options.request,
      requestContext: options.requestContext,
      grant,
    }).catch(() => null)

    if (acceptsGrantCoverage(coverage)) {
      return 'accept_for_session'
    }
  }

  return null
}

function buildWatchGrantRequestContext(input: {
  webId: string
  record: WatchSessionRecord
  request: WatchApprovalRequest
}): Record<string, unknown> {
  return {
    session: buildThreadUri(input.webId, input.record),
    target: buildThreadUri(input.webId, input.record),
    action: buildActionUri(input.request),
    risk: buildRisk(input.request),
    toolName: buildToolName(input.request),
    cwd: input.record.cwd,
    backend: input.record.backend,
    mode: input.record.mode,
  }
}

function buildGenericGrantRequestContext(input: {
  subject: RemoteApprovalSubjectContext
  request: RemoteApprovalRequestDetails
}): Record<string, unknown> {
  return {
    session: input.subject.sessionUri,
    target: input.subject.targetUri ?? input.subject.sessionUri,
    action: input.request.action,
    risk: input.request.risk,
    toolName: input.request.toolName,
    cwd: input.request.cwd,
    kind: input.request.kind,
  }
}

export async function createRemoteWatchApproval(options: {
  record: WatchSessionRecord
  request: WatchApprovalRequest
  runtime?: WatchRemoteApprovalRuntime
}): Promise<RemoteWatchApprovalSummary> {
  const activeRuntime = options.runtime ?? await createDefaultRuntime()

  return createRemoteApproval({
    subject: ({ webId }) => ({
      sessionUri: buildThreadUri(webId, options.record),
      actorUri: buildAgentUri(webId),
      policyVersion: REMOTE_APPROVAL_POLICY_VERSION,
    }),
    request: ({ sessionUri }) => ({
      kind: options.request.kind,
      message: buildRequestMessage(options.request),
      toolCallId: extractToolCallId(options.request),
      toolName: buildToolName(options.request),
      action: buildActionUri(options.request),
      risk: buildRisk(options.request),
      ...(options.request.kind === 'command-approval' && options.request.command ? { command: options.request.command } : {}),
      ...(options.request.kind === 'command-approval' && options.request.cwd ? { cwd: options.request.cwd } : {}),
      ...(options.request.approvalOptions ? { approvalOptions: options.request.approvalOptions } : {}),
      ...(options.request.timeoutMs ? { timeoutMs: options.request.timeoutMs } : {}),
      ...(options.request.expiresAt ? { expiresAt: options.request.expiresAt } : {}),
      entry: sessionUri,
    }),
    runtime: activeRuntime,
  })
}

export async function createRemoteApproval(options: {
  subject: RemoteApprovalSubjectContext | ((input: { webId: string; stored: StoredCredentials }) => RemoteApprovalSubjectContext)
  request: RemoteApprovalRequestDetails | ((input: { webId: string; stored: StoredCredentials; sessionUri: string }) => RemoteApprovalRequestDetails)
  runtime?: WatchRemoteApprovalRuntime
}): Promise<RemoteWatchApprovalSummary> {
  const activeRuntime = options.runtime ?? await createDefaultRuntime()

  return withRemoteApprovalStore(activeRuntime, async ({ store, webId, stored }) => {
    const subject = typeof options.subject === 'function'
      ? options.subject({ webId, stored })
      : options.subject
    const request = typeof options.request === 'function'
      ? options.request({ webId, stored, sessionUri: subject.sessionUri })
      : options.request
    const approvalLocalId = crypto.randomUUID()
    const now = activeRuntime.now()
    const approvalReference = store.resolveApprovalReference({ id: approvalLocalId, createdAt: now })
    const approvalId = approvalReference.id
    const sessionUri = subject.sessionUri
    const approvalUri = approvalReference.iri
    const targetUri = subject.targetUri ?? sessionUri
    const assignedTo = subject.assignedTo ?? webId
    const onBehalfOf = subject.onBehalfOf ?? webId
    const policyVersion = subject.policyVersion ?? REMOTE_APPROVAL_POLICY_VERSION
    const requestEntry = request.entry ?? approvalUri
    const expiresAt = resolveApprovalExpiresAt(request, now)
    const approvalOptions = encodeApprovalOptions(request.approvalOptions)
    const context = compactApprovalContext(request)

    await store.insertApproval({
      id: approvalId,
      approvalUri,
      session: sessionUri,
      toolCallId: request.toolCallId,
      toolName: request.toolName,
      target: targetUri,
      action: request.action,
      risk: request.risk,
      status: 'pending',
      assignedTo,
      context,
      ...(approvalOptions ? { approvalOptions } : {}),
      policyVersion,
      createdAt: now,
      ...(expiresAt ? { expiresAt } : {}),
    })

    const requestAudit: AuditRowLike = {
      id: crypto.randomUUID(),
      action: 'approval_requested',
      actor: subject.actorUri,
      actorRole: 'secretary',
      onBehalfOf,
      session: sessionUri,
      entry: requestEntry,
      toolCallId: request.toolCallId,
      toolName: request.toolName,
      approval: approvalUri,
      policyVersion,
      createdAt: now,
    }

    await warnOnly(activeRuntime, () => store.insertAudit(requestAudit))

    await warnOnly(activeRuntime, () => store.insertInboxNotification({
      id: crypto.randomUUID(),
      actor: subject.actorUri,
      object: approvalUri,
      createdAt: now,
    }))

    return normalizeApprovalSummary({
      id: approvalId,
      approvalUri,
      session: sessionUri,
      toolCallId: request.toolCallId,
      toolName: request.toolName,
      target: targetUri,
      action: request.action,
      risk: request.risk,
      status: 'pending',
      assignedTo,
      context,
      ...(approvalOptions ? { approvalOptions } : {}),
      policyVersion,
      createdAt: now,
      ...(expiresAt ? { expiresAt } : {}),
    })
  })
}

export async function waitForRemoteWatchApproval(options: {
  approvalId: string
  approvalUri?: string
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

      const row = await readRemoteApprovalRow(store, {
        approvalId: options.approvalId,
        approvalUri: options.approvalUri,
      })
      if (!row) {
        await activeRuntime.sleep(options.pollMs ?? DEFAULT_REMOTE_APPROVAL_POLL_MS)
        continue
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
    return resolveSemanticGrantDecision({
      runtime: activeRuntime,
      grants,
      record: options.record,
      request: options.request,
      requestContext: buildWatchGrantRequestContext({
        webId,
        record: options.record,
        request: options.request,
      }),
    })
  })

  if (delegated) {
    return delegated
  }

  const summary = await createRemoteWatchApproval({
    record: options.record,
    request: options.request,
    runtime: activeRuntime,
  })

  return waitForRemoteWatchApproval({
    approvalId: summary.id,
    approvalUri: summary.approvalUri,
    pollMs: options.pollMs,
    signal: options.signal,
    runtime: activeRuntime,
  })
}

export async function resolveExistingRemoteWatchGrant(options: {
  record: WatchSessionRecord
  request: WatchApprovalRequest
  runtime?: WatchRemoteApprovalRuntime
}): Promise<WatchApprovalDecision | null> {
  const activeRuntime = options.runtime ?? await createDefaultRuntime()

  return withRemoteApprovalStore(activeRuntime, async ({ store, webId }) => {
    const grants = await store.listGrants()
    return resolveSemanticGrantDecision({
      runtime: activeRuntime,
      grants,
      record: options.record,
      request: options.request,
      requestContext: buildWatchGrantRequestContext({
        webId,
        record: options.record,
        request: options.request,
      }),
    })
  })
}

export async function requestRemoteApproval(options: {
  subject: RemoteApprovalSubjectContext | ((input: { webId: string; stored: StoredCredentials }) => RemoteApprovalSubjectContext)
  request: RemoteApprovalRequestDetails | ((input: { webId: string; stored: StoredCredentials; sessionUri: string }) => RemoteApprovalRequestDetails)
  pollMs?: number
  signal?: AbortSignal
  runtime?: WatchRemoteApprovalRuntime
}): Promise<WatchApprovalDecision> {
  const activeRuntime = options.runtime ?? await createDefaultRuntime()

  const delegated = await withRemoteApprovalStore(activeRuntime, async ({ store, webId, stored }) => {
    const subject = typeof options.subject === 'function'
      ? options.subject({ webId, stored })
      : options.subject
    const request = typeof options.request === 'function'
      ? options.request({ webId, stored, sessionUri: subject.sessionUri })
      : options.request
    const grants = await store.listGrants()
    const requestContext = buildGenericGrantRequestContext({ subject, request })

    return resolveSemanticGrantDecision({
      runtime: activeRuntime,
      grants,
      request: {
        ...request,
        session: subject.sessionUri,
        target: requestContext.target,
      },
      requestContext,
    })
  })

  if (delegated) {
    return delegated
  }

  const summary = await createRemoteApproval({
    subject: options.subject,
    request: options.request,
    runtime: activeRuntime,
  })

  return waitForRemoteWatchApproval({
    approvalId: summary.id,
    approvalUri: summary.approvalUri,
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
    const approvals = await store.listApprovals()

    return approvals
      .map((row) => normalizeApprovalSummary(row))
      .filter((summary) => !summary.assignedTo || summary.assignedTo === webId)
      .filter((summary) => requestedStatus === 'all' || summary.status === requestedStatus)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  })
}

export async function resolveRemoteWatchApproval(options: {
  approvalId: string
  approvalUri?: string
  decision: WatchApprovalDecision
  decisionRole?: 'human' | 'secretary'
  note?: string
  grantWikiTitle?: string
  grantWikiSummary?: string
  grantWikiBody?: string
  grantWikiTags?: string[]
  runtime?: WatchRemoteApprovalRuntime
}): Promise<RemoteWatchApprovalSummary> {
  const activeRuntime = options.runtime ?? await createDefaultRuntime()

  return withRemoteApprovalStore(activeRuntime, async ({ store, webId }) => {
    const row = await readRemoteApprovalRow(store, {
      approvalId: options.approvalId,
      approvalUri: options.approvalUri,
    })
    if (!row) {
      throw new Error(`Remote approval not found: ${options.approvalId}`)
    }

    if (row.status !== 'pending') {
      return normalizeApprovalSummary(row)
    }

    const now = activeRuntime.now()
    const approvalUri = normalizeString(row.approvalUri)
      ?? store.resolveApprovalReference({ id: row.id, createdAt: row.createdAt }).iri
    const nextStatus = options.decision === 'accept' || options.decision === 'accept_for_session'
      ? 'approved'
      : 'rejected'
    const decisionRole = options.decisionRole ?? 'human'

    await store.updateApproval(row.id, {
      approvalUri,
      status: nextStatus,
      decisionBy: webId,
      decisionRole,
      onBehalfOf: webId,
      reason: encodeDecisionReason(options.decision, options.note),
      resolvedAt: now,
    })

    await warnOnly(activeRuntime, () => store.insertAudit({
      id: crypto.randomUUID(),
      action: nextStatus === 'approved' ? 'approval_approved' : 'approval_rejected',
      actor: webId,
      actorRole: decisionRole,
      onBehalfOf: webId,
      session: row.session,
      entry: approvalUri,
      toolCallId: row.toolCallId,
      toolName: row.toolName,
      approval: approvalUri,
      policyVersion: REMOTE_APPROVAL_POLICY_VERSION,
      createdAt: now,
    }))

    if (options.decision === 'accept_for_session') {
      const grantId = crypto.randomUUID()
      const body = grantWikiBodyFromApproval(row, options.grantWikiBody)
      await store.insertGrant({
        id: grantId,
        target: row.target,
        action: row.action,
        title: grantWikiTitleFromApproval(row, options.grantWikiTitle),
        summary: grantWikiSummaryFromApproval(row, options.grantWikiSummary),
        body,
        schema: buildGrantSchemaUri(webId),
        pageKind: 'autonomy-grant',
        wikiStatus: 'active',
        tags: grantWikiTagsFromApproval(row, options.grantWikiTags),
        source: 'approval',
        sourceHash: grantSourceHash(row),
        compiledAt: now,
        compiledFrom: [approvalUri],
        related: [row.session],
        effect: 'allow',
        riskCeiling: row.risk,
        policy: grantIndexTextFromWikiBody(body),
        context: grantContextFromApproval(row),
        decisionBy: webId,
        decisionRole,
        onBehalfOf: webId,
        createdAt: now,
      })

      await warnOnly(activeRuntime, () => store.insertInboxNotification({
        id: crypto.randomUUID(),
        actor: webId,
        object: store.resolveGrantReference({ id: grantId }).iri,
        createdAt: now,
      }))
    }

    await warnOnly(activeRuntime, () => store.insertInboxNotification({
      id: crypto.randomUUID(),
      actor: webId,
      object: approvalUri,
      createdAt: now,
    }))

    const nextRow: ApprovalRowLike = {
      ...row,
      approvalUri,
      status: nextStatus,
      decisionBy: webId,
      decisionRole,
      onBehalfOf: webId,
      reason: encodeDecisionReason(options.decision, options.note),
      resolvedAt: now,
    }
    return normalizeApprovalSummary(nextRow)
  })
}

async function readRemoteApprovalRow(
  store: WatchRemoteApprovalStore,
  options: {
    approvalId: string
    approvalUri?: string
  },
): Promise<ApprovalRowLike | null> {
  if (store.findApproval) {
    const row = await store.findApproval(options.approvalId, {
      approvalUri: options.approvalUri,
    })
    return row
  }

  const approvals = await store.listApprovals()
  return approvals.find((entry) => entry.id === options.approvalId) ?? null
}

export const __podApprovalInternal = {
  createAbortError,
  createDefaultRuntime,
  buildActionUri,
  buildRisk,
  buildToolName,
  createNativeRemoteApprovalStore,
  extractToolCallId,
  decisionFromApprovalRow,
  encodeDecisionReason,
  formatSummaryHeadline,
  readRemoteApprovalRow,
  isRemoteApprovalAbortError,
  normalizeApprovalSummary,
  parseDecisionReason,
}
