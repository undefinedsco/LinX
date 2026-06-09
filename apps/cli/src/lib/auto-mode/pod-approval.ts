import { setTimeout as delay } from 'node:timers/promises'
import type { StoredCredentials } from '../credentials-store.js'
import { getDefaultPodDataSession, type PodDataSession } from '../pod-data-session.js'
import {
  approvalResource,
  auditResource,
  agentResourceId,
  buildApprovalSubjectPath,
  buildGrantSubjectPath,
  drizzle,
  grantResource,
  inboxNotificationResource,
  solidResources,
  type SolidDatabase,
} from '../models.js'
import { AS, ODRL, UDFS } from '@undefineds.co/models/namespaces'
import { ApprovalVocab, AuditVocab, GrantReadVocab, GrantVocab, InboxNotificationVocab } from '@undefineds.co/models/vocab/sidecar'
import {
  autoModeApprovalActionUri,
  autoModeApprovalRequestMessage,
  autoModeApprovalRisk,
  autoModeApprovalToolName,
  type AutoModeApprovalDecision,
  type AutoModeApprovalOption,
  type AutoModeApprovalRequest,
  type AutoModeGrantCoverageDecision,
  type AutoModeSessionRecord,
} from '@linx/agent-runtime/auto-mode'
import { resolveAutoModeGrantCoverage, type AutoModeGrantCoverageInput } from './secretary.js'
import {
  buildApprovalDocumentUrl,
  RDF_TYPE,
  buildApprovalResourceUrl,
  buildAuditDocumentUrl,
  buildAuditResourceUrl,
  buildGrantResourceUrl,
  buildInboxResourceUrl,
  firstIri,
  firstLiteral,
  iri,
  listTurtleResources,
  listTurtleResourcesRecursive,
  literal,
  parseManagedTurtleBlocks,
  readTurtleResource,
  subjectIdFromResourceUrl,
  upsertManagedTurtleBlock,
  type PodFetch,
} from '../pi-adapter/pod-native.js'

const AUTO_MODE_CHAT_ID_PREFIX = 'linx-auto-mode'
const AUTO_MODE_AGENT_ID = 'linx-auto-mode-assistant'
const REMOTE_APPROVAL_POLICY_VERSION = 'linx-auto-mode-remote-approval/v1'
const DEFAULT_REMOTE_APPROVAL_POLL_MS = 1000
const DEFAULT_WARN_ONLY_TIMEOUT_MS = 5000
const DEFAULT_APPROVAL_LIST_DAYS = 7
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

export interface AutoModeRemoteApprovalStore {
  listApprovals(): Promise<ApprovalRowLike[]>
  findApproval?(
    id: string,
    options?: { resourceUri?: string; createdAt?: Date | string },
  ): Promise<ApprovalRowLike | null>
  insertApproval(row: ApprovalRowLike): Promise<void>
  updateApproval(
    id: string,
    patch: Partial<ApprovalRowLike>,
    options?: { resourceUri?: string; createdAt?: Date | string },
  ): Promise<void>
  listAudits(): Promise<AuditRowLike[]>
  insertAudit(row: AuditRowLike): Promise<void>
  listGrants(): Promise<GrantRowLike[]>
  insertGrant(row: GrantRowLike): Promise<void>
  insertInboxNotification(row: InboxNotificationRowLike): Promise<void>
}

export interface AutoModeRemoteApprovalRuntime {
  getPodDataSession: () => Promise<PodDataSession | null>
  createStore: (webId: string, fetcher: PodFetch, session?: PodDataSession) => AutoModeRemoteApprovalStore
  sleep: (ms: number) => Promise<void>
  now: () => Date
  onWarning?: (error: unknown) => void
  resolveGrantCoverage?: (input: AutoModeGrantCoverageInput) => Promise<AutoModeGrantCoverageDecision>
}

interface RemoteApprovalClient {
  session: PodDataSession
  store: AutoModeRemoteApprovalStore
}

const remoteApprovalClientCache = new WeakMap<AutoModeRemoteApprovalRuntime, Promise<RemoteApprovalClient | null>>()

export interface RemoteAutoModeApprovalSummary {
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
  decision?: AutoModeApprovalDecision
  approvalOptions?: AutoModeApprovalOption[]
  expiresAt?: string
  createdAt: string
  resolvedAt?: string
}

interface DecisionAuditContext {
  decision: AutoModeApprovalDecision
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
  kind: AutoModeApprovalRequest['kind']
  message: string
  toolCallId: string
  toolName: string
  action: string
  risk: RemoteApprovalRisk
  command?: string
  cwd?: string
  approvalOptions?: AutoModeApprovalOption[]
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

function buildAutoModeChatId(record: AutoModeSessionRecord): string {
  return `${AUTO_MODE_CHAT_ID_PREFIX}-${record.backend}`
}

function buildThreadUri(webId: string, record: AutoModeSessionRecord): string {
  return `${getPodBaseUrl(webId)}/.data/chat/${buildAutoModeChatId(record)}/index.ttl#${record.id}`
}

function buildApprovalUriForDate(webIdOrUri: string, approvalId: string, createdAt: Date): string {
  if (/^https?:\/\//.test(approvalId)) {
    return approvalId
  }
  if (approvalId.includes('#')) {
    return buildPodResourceIri(webIdOrUri, `/.data/approvals/${approvalId}`)
  }
  return buildPodResourceIri(webIdOrUri, buildApprovalSubjectPath(approvalId, createdAt))
}

function documentUrlFromResourceUri(resourceUri: string): string {
  return resourceUri.split('#', 1)[0] ?? resourceUri
}

function buildGrantUri(webIdOrUri: string, grantId: string): string {
  return buildPodResourceIri(webIdOrUri, buildGrantSubjectPath(grantId))
}

function buildPodResourceIri(webIdOrUri: string, relativeUri: string): string {
  if (/^https?:\/\//.test(relativeUri)) {
    return relativeUri
  }
  return new URL(relativeUri.replace(/^\//, ''), `${getPodBaseUrl(webIdOrUri)}/`).toString()
}

function buildGrantSchemaUri(webIdOrUri: string): string {
  return `${getPodBaseUrl(webIdOrUri)}/settings/autonomy/schema/grant.ttl#GrantWikiPage`
}

function buildAgentUri(webId: string): string {
  return `${getPodBaseUrl(webId)}/.data/agents/${agentResourceId(AUTO_MODE_AGENT_ID)}`
}

function buildActionUri(request: AutoModeApprovalRequest): string {
  return autoModeApprovalActionUri(request)
}

function buildToolName(request: AutoModeApprovalRequest): string {
  return autoModeApprovalToolName(request)
}

function buildRisk(request: AutoModeApprovalRequest): RemoteApprovalRisk {
  return autoModeApprovalRisk(request)
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

function buildRequestMessage(request: AutoModeApprovalRequest): string {
  return autoModeApprovalRequestMessage(request)
}

function extractToolCallId(request: AutoModeApprovalRequest): string {
  if (!isRecord(request.raw)) {
    return crypto.randomUUID()
  }

  const params = isRecord(request.raw.params) ? request.raw.params : null
  const toolCall = params && isRecord(params.toolCall) ? params.toolCall : null

  return normalizeString(toolCall?.toolCallId)
    ?? normalizeString(params?.toolCallId)
    ?? crypto.randomUUID()
}

function encodeDecisionReason(decision: AutoModeApprovalDecision, note?: string): string {
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
      decision: decision as AutoModeApprovalDecision,
      ...(normalizeString(parsed.note) ? { note: normalizeString(parsed.note) } : {}),
    }
  } catch {
    return null
  }
}

async function warnOnly(runtime: AutoModeRemoteApprovalRuntime, task: () => Promise<void>): Promise<void> {
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
    sourceApproval: buildApprovalUriForDate(row.session, row.id, new Date(toIsoString(row.createdAt, new Date().toISOString()))),
    session: row.session,
    toolCallId: row.toolCallId,
    toolName: row.toolName,
    target: row.target,
    action: row.action,
    risk: row.risk,
    approvalContext: row.context,
  }, MAX_APPROVAL_CONTEXT_LENGTH)
}

function literalValues(predicates: Map<string, unknown[]>, predicate: string): string[] {
  return (predicates.get(predicate) ?? [])
    .map((object) => isRecord(object) && object.type === 'literal' && typeof object.value === 'string' ? object.value : '')
    .filter(Boolean)
}

function firstLiteralValue(predicates: Map<string, unknown[]>, predicatesToTry: readonly string[]): string | undefined {
  for (const predicate of predicatesToTry) {
    const [value] = literalValues(predicates, predicate)
    if (value) {
      return value
    }
  }
  return undefined
}

function iriValues(predicates: Map<string, unknown[]>, predicate: string): string[] {
  return (predicates.get(predicate) ?? [])
    .map((object) => isRecord(object) && object.type === 'iri' && typeof object.value === 'string' ? object.value : '')
    .filter(Boolean)
}

function iriValuesFrom(predicates: Map<string, unknown[]>, predicatesToTry: readonly string[]): string[] {
  const values = predicatesToTry.flatMap((predicate) => iriValues(predicates, predicate))
  return [...new Set(values)]
}

function grantSourceHash(row: ApprovalRowLike): string {
  return `approval:${row.id}:${row.toolCallId}:${row.risk}`
}

function encodeApprovalOptions(options: AutoModeApprovalOption[] | undefined): string | undefined {
  if (!options || options.length === 0) {
    return undefined
  }
  return safeJsonStringify(options)
}

function parseApprovalOptions(value: unknown): AutoModeApprovalOption[] | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined
  }

  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) {
      return undefined
    }

    const options = parsed
      .map((option): AutoModeApprovalOption | null => {
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
      .filter((option): option is AutoModeApprovalOption => option !== null)

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

function decisionFromApprovalRow(row: ApprovalRowLike): AutoModeApprovalDecision | null {
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

function normalizeApprovalSummary(row: ApprovalRowLike): RemoteAutoModeApprovalSummary {
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

function formatSummaryHeadline(summary: RemoteAutoModeApprovalSummary): string {
  return `${summary.id} | ${summary.status} | ${summary.risk} | session=${summary.sessionId}`
}

export function formatRemoteAutoModeApprovalSummary(summary: RemoteAutoModeApprovalSummary): string {
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

async function createDefaultRuntime(): Promise<AutoModeRemoteApprovalRuntime> {
  return {
    getPodDataSession: getDefaultPodDataSession,
    createStore(webId, fetcher, session) {
      if (session) {
        return createOrmRemoteApprovalStore(session)
      }
      return createNativeRemoteApprovalStore(webId, fetcher)
    },
    sleep(ms: number) {
      return delay(ms)
    },
    now() {
      return new Date()
    },
    resolveGrantCoverage: resolveAutoModeGrantCoverage,
  }
}

async function withRemoteApprovalStore<T>(
  runtime: AutoModeRemoteApprovalRuntime,
  fn: (input: {
    store: AutoModeRemoteApprovalStore
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

async function getRemoteApprovalClient(runtime: AutoModeRemoteApprovalRuntime): Promise<RemoteApprovalClient | null> {
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

async function createRemoteApprovalClient(runtime: AutoModeRemoteApprovalRuntime): Promise<RemoteApprovalClient | null> {
  const session = await runtime.getPodDataSession()
  if (!session) {
    return null
  }

  return {
    session,
    store: runtime.createStore(session.webId, session.fetch, session),
  }
}

function createOrmRemoteApprovalStore(podSession: PodDataSession): AutoModeRemoteApprovalStore {
  let dbPromise: Promise<SolidDatabase> | null = null
  const getDb = async (): Promise<SolidDatabase> => {
    if (!dbPromise) {
      dbPromise = Promise.resolve().then(async () => {
        const db = drizzle(podSession.solidSession, {
          logger: false,
          disableInteropDiscovery: true,
          podUrl: podSession.podUrl,
          resourcePreparation: 'best-effort' as never,
          schema: solidResources,
        }) as unknown as SolidDatabase
        return db
      })
    }
    return dbPromise
  }

  return createSharedModelRemoteApprovalStore(podSession.webId, getDb)
}

function createSharedModelRemoteApprovalStore(
  webId: string,
  getDb: () => Promise<SolidDatabase>,
): AutoModeRemoteApprovalStore {
  const listApprovals = async (): Promise<ApprovalRowLike[]> => {
    const rows = await modelList<ApprovalRowLike>(getDb, approvalResource)
    return rows.map((row) => enrichApprovalRow(webId, row))
  }

  return {
    listApprovals,
    findApproval: async (id, options = {}) => {
      if (options.resourceUri) {
        const row = await modelFindByIri<ApprovalRowLike>(getDb, approvalResource, options.resourceUri)
        return row ? enrichApprovalRow(webId, row, options.resourceUri) : null
      }
      if (options.createdAt) {
        const createdAt = new Date(toIsoString(options.createdAt, new Date().toISOString()))
        const iri = buildApprovalUriForDate(webId, id, createdAt)
        const row = await modelFindByIri<ApprovalRowLike>(getDb, approvalResource, iri)
        return row ? enrichApprovalRow(webId, row, iri) : null
      }
      const row = await modelFindById<ApprovalRowLike>(getDb, approvalResource, id)
      return row ? enrichApprovalRow(webId, row) : null
    },
    insertApproval: async (row) => {
      await modelInsert(getDb, approvalResource, omitInternalFields(row))
    },
    updateApproval: async (id, patch, options = {}) => {
      const explicitIri = options.resourceUri
        ?? normalizeString(patch.approvalUri)
        ?? (options.createdAt ? buildApprovalUriForDate(webId, id, new Date(toIsoString(options.createdAt, new Date().toISOString()))) : undefined)
      if (explicitIri) {
        await modelUpdateByIri(getDb, approvalResource, explicitIri, omitInternalFields(patch))
        return
      }

      const updated = await modelUpdateById<ApprovalRowLike>(getDb, approvalResource, id, omitInternalFields(patch))
      if (!updated) {
        throw new Error(`Remote approval not found: ${id}`)
      }
    },
    listAudits: () => modelList<AuditRowLike>(getDb, auditResource),
    insertAudit: async (row) => {
      await modelInsert(getDb, auditResource, omitInternalFields(row))
    },
    listGrants: () => modelList<GrantRowLike>(getDb, grantResource),
    insertGrant: async (row) => {
      await modelInsert(getDb, grantResource, omitInternalFields(row))
    },
    insertInboxNotification: async (row) => {
      await modelInsert(getDb, inboxNotificationResource, omitInternalFields(row))
    },
  }
}

async function modelList<T>(getDb: () => Promise<SolidDatabase>, resource: unknown): Promise<T[]> {
  const db = await getDb() as any
  return await db.select().from(resource).execute() as T[]
}

async function modelFindByIri<T>(getDb: () => Promise<SolidDatabase>, resource: unknown, iri: string): Promise<T | null> {
  const db = await getDb() as any
  if (typeof db.findByIri === 'function') {
    return await db.findByIri(resource, iri) as T | null
  }
  const rows = await db.select().from(resource).whereByIri(iri).execute() as T[]
  return rows[0] ?? null
}

async function modelFindById<T>(getDb: () => Promise<SolidDatabase>, resource: unknown, id: string): Promise<T | null> {
  const db = await getDb() as any
  if (typeof db.findById === 'function') {
    return await db.findById(resource, id) as T | null
  }
  throw new Error('Remote approval shared model store requires findById support')
}

async function modelInsert(getDb: () => Promise<SolidDatabase>, resource: unknown, row: Record<string, unknown>): Promise<void> {
  const db = await getDb() as any
  await db.insert(resource).values(stripUndefined(row)).execute()
}

async function modelUpdateByIri(
  getDb: () => Promise<SolidDatabase>,
  resource: unknown,
  iri: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const db = await getDb() as any
  const update = stripUndefined(patch)
  delete update.id
  delete update.approvalUri
  if (typeof db.updateByIri === 'function') {
    await db.updateByIri(resource, iri, update)
    return
  }
  const query = db.update(resource).set(update)
  if (typeof query.whereByIri !== 'function') {
    throw new Error('Remote approval shared model store requires updateByIri/whereByIri support')
  }
  await query.whereByIri(iri).execute()
}

async function modelUpdateById<T>(
  getDb: () => Promise<SolidDatabase>,
  resource: unknown,
  id: string,
  patch: Record<string, unknown>,
): Promise<T | null> {
  const db = await getDb() as any
  const update = stripUndefined(patch)
  delete update.id
  delete update.approvalUri
  if (typeof db.updateById === 'function') {
    return await db.updateById(resource, id, update) as T | null
  }
  throw new Error('Remote approval shared model store requires updateById support')
}

function stripUndefined(row: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (value !== undefined) {
      next[key] = value
    }
  }
  return next
}

function omitInternalFields(row: Record<string, unknown>): Record<string, unknown> {
  const next = stripUndefined(row)
  delete next.approvalUri
  delete next['@id']
  delete next.subject
  delete next.source
  delete next.uri
  return next
}

function enrichApprovalRow(webId: string, row: ApprovalRowLike, explicitIri?: string): ApprovalRowLike {
  const createdAt = new Date(toIsoString(row.createdAt, new Date().toISOString()))
  return {
    ...row,
    approvalUri: explicitIri
      ?? normalizeString(row.approvalUri)
      ?? buildApprovalUriForDate(webId, row.id, createdAt),
  }
}

function createNativeRemoteApprovalStore(webId: string, fetcher: PodFetch): AutoModeRemoteApprovalStore {
  return {
    listApprovals: () => listApprovalRows(webId, fetcher),
    findApproval: (id, options) => findApprovalRow(webId, fetcher, id, options),
    insertApproval: (row) => writeApprovalRow(webId, fetcher, row),
    async updateApproval(id, patch, options = {}): Promise<void> {
      const explicitIri = options.resourceUri
        ?? normalizeString(patch.approvalUri)
        ?? (options.createdAt ? buildApprovalResourceUrl(webId, id, new Date(toIsoString(options.createdAt, new Date().toISOString()))) : undefined)
      const existing = explicitIri
        ? await readApprovalRowFromResource(fetcher, explicitIri)
        : (await listApprovalRows(webId, fetcher)).find((row) => row.id === id)
      if (!existing) {
        throw new Error(`Remote approval not found: ${id}`)
      }
      await writeApprovalRow(webId, fetcher, { ...existing, ...patch })
    },
    listAudits: () => listAuditRows(webId, fetcher),
    insertAudit: (row) => writeAuditRow(webId, fetcher, row),
    listGrants: () => listGrantRows(webId, fetcher),
    insertGrant: (row) => writeGrantRow(webId, fetcher, row),
    insertInboxNotification: (row) => writeInboxNotificationRow(webId, fetcher, row),
  }
}

async function findApprovalRow(
  webId: string,
  fetcher: PodFetch,
  id: string,
  options: { resourceUri?: string; createdAt?: Date | string } = {},
): Promise<ApprovalRowLike | null> {
  if (options.resourceUri) {
    return readApprovalRowFromResource(fetcher, options.resourceUri)
  }

  if (options.createdAt) {
    const createdAt = new Date(toIsoString(options.createdAt, new Date().toISOString()))
    return readApprovalRowFromResource(fetcher, buildApprovalResourceUrl(webId, id, createdAt))
  }

  return (await listApprovalRows(webId, fetcher)).find((row) => row.id === id) ?? null
}

async function readApprovalRowFromResource(fetcher: PodFetch, resourceUri: string): Promise<ApprovalRowLike | null> {
  const turtle = await readTurtleResource(fetcher, documentUrlFromResourceUri(resourceUri))
  if (!turtle) {
    return null
  }

  for (const [subject, predicates] of parseManagedTurtleBlocks(turtle, documentUrlFromResourceUri(resourceUri))) {
    if (subject !== resourceUri) {
      continue
    }
    const row = approvalRowFromPredicates(subject, predicates)
    if (row) {
      return row
    }
  }

  return null
}

async function readExistingTurtleResource(fetcher: PodFetch, url: string): Promise<string | null> {
  return await readTurtleResource(fetcher, url)
}

async function listApprovalRows(webId: string, fetcher: PodFetch): Promise<ApprovalRowLike[]> {
  const urls = [
    ...recentApprovalDocumentUrls(webId),
    ...await listTurtleResources(fetcher, `${getPodBaseUrl(webId)}/.data/approvals/`),
  ]
  const rows: ApprovalRowLike[] = []
  for (const url of [...new Set(urls)].filter((entry) => entry.endsWith('.ttl'))) {
    const turtle = await readExistingTurtleResource(fetcher, url)
    if (!turtle) continue
    for (const [subject, predicates] of parseManagedTurtleBlocks(turtle, url)) {
      const row = approvalRowFromPredicates(subject, predicates)
      if (row) rows.push(row)
    }
  }
  return rows
}

function recentApprovalDocumentUrls(webId: string, days = DEFAULT_APPROVAL_LIST_DAYS): string[] {
  const urls: string[] = []
  const base = Date.now()
  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(base - offset * 24 * 60 * 60 * 1000)
    urls.push(buildApprovalDocumentUrl(webId, date))
  }
  return urls
}

async function writeApprovalRow(webId: string, fetcher: PodFetch, row: ApprovalRowLike): Promise<void> {
  const createdAt = new Date(toIsoString(row.createdAt, new Date().toISOString()))
  const documentUrl = buildApprovalDocumentUrl(webId, createdAt)
  const subjectUrl = buildApprovalResourceUrl(webId, row.id, createdAt)
  await upsertManagedTurtleBlock(fetcher, documentUrl, {
    subject: subjectUrl,
    triples: [
      { predicate: RDF_TYPE, object: iri(UDFS.ApprovalRequest) },
      { predicate: ApprovalVocab.session, object: iri(row.session) },
      { predicate: ApprovalVocab.toolCallId, object: literal(row.toolCallId) },
      { predicate: ApprovalVocab.toolName, object: literal(row.toolName) },
      { predicate: ApprovalVocab.target, object: iri(row.target) },
      { predicate: ApprovalVocab.action, object: iri(row.action) },
      { predicate: ApprovalVocab.risk, object: literal(row.risk) },
      { predicate: ApprovalVocab.status, object: literal(row.status) },
      ...(row.assignedTo ? [{ predicate: ApprovalVocab.assignedTo, object: iri(row.assignedTo) }] : []),
      ...(row.decisionBy ? [{ predicate: ApprovalVocab.decisionBy, object: iri(row.decisionBy) }] : []),
      ...(row.decisionRole ? [{ predicate: ApprovalVocab.decisionRole, object: literal(row.decisionRole) }] : []),
      ...(row.onBehalfOf ? [{ predicate: ApprovalVocab.onBehalfOf, object: iri(row.onBehalfOf) }] : []),
      ...(row.reason ? [{ predicate: ApprovalVocab.reason, object: literal(row.reason) }] : []),
      ...(row.context ? [{ predicate: ApprovalVocab.context, object: literal(row.context) }] : []),
      ...(row.approvalOptions ? [{ predicate: ApprovalVocab.approvalOptions, object: literal(row.approvalOptions) }] : []),
      ...(row.policyVersion ? [{ predicate: ApprovalVocab.policyVersion, object: literal(row.policyVersion) }] : []),
      { predicate: ApprovalVocab.createdAt, object: literal(toIsoString(row.createdAt, new Date().toISOString())) },
      ...(row.expiresAt ? [{ predicate: ApprovalVocab.expiresAt, object: literal(toIsoString(row.expiresAt, new Date().toISOString())) }] : []),
      ...(row.resolvedAt ? [{ predicate: ApprovalVocab.resolvedAt, object: literal(toIsoString(row.resolvedAt, new Date().toISOString())) }] : []),
    ],
  })
}

async function listAuditRows(webId: string, fetcher: PodFetch): Promise<AuditRowLike[]> {
  const urls = await listTurtleResourcesRecursive(fetcher, `${getPodBaseUrl(webId)}/.data/audits/`)
  const rows: AuditRowLike[] = []
  for (const url of urls.filter((entry: string) => entry.endsWith('.ttl'))) {
    const turtle = await readExistingTurtleResource(fetcher, url)
    if (!turtle) continue
    for (const [subject, predicates] of parseManagedTurtleBlocks(turtle, url)) {
      const row = auditRowFromPredicates(subject, predicates)
      if (row) rows.push(row)
    }
  }
  return rows
}

async function writeAuditRow(webId: string, fetcher: PodFetch, row: AuditRowLike): Promise<void> {
  const createdAt = new Date(toIsoString(row.createdAt, new Date().toISOString()))
  const documentUrl = buildAuditDocumentUrl(webId, createdAt)
  const subjectUrl = buildAuditResourceUrl(webId, row.id, createdAt)
  await upsertManagedTurtleBlock(fetcher, documentUrl, {
    subject: subjectUrl,
    triples: [
      { predicate: RDF_TYPE, object: iri(UDFS.AuditEntry) },
      { predicate: AuditVocab.action, object: literal(row.action) },
      { predicate: AuditVocab.actor, object: iri(row.actor) },
      { predicate: AuditVocab.actorRole, object: literal(row.actorRole) },
      ...(row.onBehalfOf ? [{ predicate: AuditVocab.onBehalfOf, object: iri(row.onBehalfOf) }] : []),
      ...(row.session ? [{ predicate: AuditVocab.session, object: iri(row.session) }] : []),
      ...(row.entry ? [{ predicate: AuditVocab.entry, object: iri(row.entry) }] : []),
      ...(row.toolCallId ? [{ predicate: AuditVocab.toolCallId, object: literal(row.toolCallId) }] : []),
      ...(row.toolName ? [{ predicate: AuditVocab.toolName, object: literal(row.toolName) }] : []),
      ...(row.approval ? [{ predicate: AuditVocab.approval, object: iri(row.approval) }] : []),
      ...(row.policyVersion ? [{ predicate: AuditVocab.policyVersion, object: literal(row.policyVersion) }] : []),
      { predicate: AuditVocab.createdAt, object: literal(toIsoString(row.createdAt, new Date().toISOString())) },
    ],
  })
}

async function listGrantRows(webId: string, fetcher: PodFetch): Promise<GrantRowLike[]> {
  const urls = [
    ...await listTurtleResources(fetcher, `${getPodBaseUrl(webId)}/settings/autonomy/grants/`),
  ]
  const rows: GrantRowLike[] = []
  for (const url of urls.filter((entry) => entry.endsWith('.ttl'))) {
    const turtle = await readExistingTurtleResource(fetcher, url)
    if (!turtle) continue
    for (const [subject, predicates] of parseManagedTurtleBlocks(turtle, url)) {
      const row = grantRowFromPredicates(subject, predicates)
      if (row) rows.push(row)
    }
  }
  return rows
}

async function writeGrantRow(webId: string, fetcher: PodFetch, row: GrantRowLike): Promise<void> {
  const id = normalizeString(row.id) ?? crypto.randomUUID()
  const subjectUrl = buildGrantResourceUrl(webId, id)
  const documentUrl = subjectUrl
  const target = normalizeString(row.target)
  const action = normalizeString(row.action)
  const effect = normalizeString(row.effect)
  const decisionBy = normalizeString(row.decisionBy)
  const decisionRole = normalizeString(row.decisionRole)
  if (!target || !action || !effect || !decisionBy || !decisionRole) {
    throw new Error(`Invalid remote approval grant row: ${id}`)
  }
  await upsertManagedTurtleBlock(fetcher, documentUrl, {
    subject: subjectUrl,
    triples: [
      { predicate: RDF_TYPE, object: iri(ODRL.Policy) },
      { predicate: RDF_TYPE, object: iri(UDFS.AutonomyGrant) },
      { predicate: GrantVocab.target, object: iri(target) },
      { predicate: GrantVocab.action, object: iri(action) },
      ...(normalizeString(row.title) ? [{ predicate: GrantVocab.title, object: literal(truncatePodLiteral(normalizeString(row.title) as string, 160)) }] : []),
      ...(normalizeString(row.summary) ? [{ predicate: GrantVocab.summary, object: literal(truncatePodLiteral(normalizeString(row.summary) as string, 500)) }] : []),
      ...(normalizeString(row.body) ? [{ predicate: GrantVocab.description, object: literal(truncatePodLiteral(normalizeString(row.body) as string, MAX_GRANT_POLICY_LENGTH)) }] : []),
      ...(normalizeString(row.schema) ? [{ predicate: GrantVocab.schema, object: iri(normalizeString(row.schema) as string) }] : []),
      ...(normalizeString(row.pageKind) ? [{ predicate: GrantVocab.pageKind, object: literal(normalizeString(row.pageKind) as string) }] : []),
      ...(normalizeString(row.wikiStatus) ? [{ predicate: GrantVocab.wikiStatus, object: literal(normalizeString(row.wikiStatus) as string) }] : []),
      ...(normalizeString(row.tags) ? [{ predicate: GrantVocab.tags, object: literal(truncatePodLiteral(normalizeString(row.tags) as string, 500)) }] : []),
      ...(normalizeString(row.source) ? [{ predicate: GrantVocab.source, object: literal(normalizeString(row.source) as string) }] : []),
      ...(normalizeString(row.sourceHash) ? [{ predicate: GrantVocab.sourceHash, object: literal(normalizeString(row.sourceHash) as string) }] : []),
      ...(row.compiledAt ? [{ predicate: GrantVocab.compiledAt, object: literal(toIsoString(row.compiledAt, new Date().toISOString())) }] : []),
      ...(row.compiledFrom ?? []).map((value) => ({ predicate: GrantVocab.compiledFrom, object: iri(value) })),
      ...(row.related ?? []).map((value) => ({ predicate: GrantVocab.related, object: iri(value) })),
      { predicate: GrantVocab.effect, object: literal(effect) },
      ...(normalizeString(row.riskCeiling) ? [{ predicate: GrantVocab.riskCeiling, object: literal(normalizeString(row.riskCeiling) as string) }] : []),
      ...(normalizeString(row.policy) ? [{ predicate: GrantVocab.policy, object: literal(truncatePodLiteral(normalizeString(row.policy) as string, MAX_GRANT_POLICY_LENGTH)) }] : []),
      ...(normalizeString(row.context) ? [{ predicate: GrantVocab.context, object: literal(truncatePodLiteral(normalizeString(row.context) as string, MAX_APPROVAL_CONTEXT_LENGTH)) }] : []),
      { predicate: GrantVocab.decisionBy, object: iri(decisionBy) },
      { predicate: GrantVocab.decisionRole, object: literal(decisionRole) },
      ...(normalizeString(row.onBehalfOf) ? [{ predicate: GrantVocab.onBehalfOf, object: iri(normalizeString(row.onBehalfOf) as string) }] : []),
      { predicate: GrantVocab.createdAt, object: literal(toIsoString(row.createdAt as Date | string | undefined, new Date().toISOString())) },
      ...(normalizeString(row.revokedAt) ? [{ predicate: GrantVocab.revokedAt, object: literal(normalizeString(row.revokedAt) as string) }] : []),
    ],
  })
}

async function writeInboxNotificationRow(webId: string, fetcher: PodFetch, row: InboxNotificationRowLike): Promise<void> {
  const url = buildInboxResourceUrl(webId, row.id)
  await upsertManagedTurtleBlock(fetcher, url, {
    subject: url,
    triples: [
      { predicate: RDF_TYPE, object: iri(AS.Announce) },
      ...(row.actor ? [{ predicate: InboxNotificationVocab.actor, object: iri(row.actor) }] : []),
      { predicate: InboxNotificationVocab.object, object: iri(row.object) },
      { predicate: InboxNotificationVocab.createdAt, object: literal(toIsoString(row.createdAt, new Date().toISOString())) },
    ],
  })
}

function approvalRowFromPredicates(url: string, predicates: Map<string, unknown[]>): ApprovalRowLike | null {
  const session = firstIri(predicates as never, ApprovalVocab.session)
  const toolCallId = firstLiteral(predicates as never, ApprovalVocab.toolCallId)
  const toolName = firstLiteral(predicates as never, ApprovalVocab.toolName)
  const target = firstIri(predicates as never, ApprovalVocab.target)
  const action = firstIri(predicates as never, ApprovalVocab.action)
  const risk = firstLiteral(predicates as never, ApprovalVocab.risk)
  const status = firstLiteral(predicates as never, ApprovalVocab.status)
  const createdAt = firstLiteral(predicates as never, ApprovalVocab.createdAt)
  if (!session || !toolCallId || !toolName || !target || !action || !risk || !status || !createdAt) {
    return null
  }
  return {
    id: subjectIdFromResourceUrl(url),
    session,
    toolCallId,
    toolName,
    target,
    action,
    risk,
    status,
    assignedTo: firstIri(predicates as never, ApprovalVocab.assignedTo),
    decisionBy: firstIri(predicates as never, ApprovalVocab.decisionBy),
    decisionRole: firstLiteral(predicates as never, ApprovalVocab.decisionRole),
    onBehalfOf: firstIri(predicates as never, ApprovalVocab.onBehalfOf),
    reason: firstLiteral(predicates as never, ApprovalVocab.reason),
    context: firstLiteral(predicates as never, ApprovalVocab.context),
    approvalOptions: firstLiteral(predicates as never, ApprovalVocab.approvalOptions),
    policyVersion: firstLiteral(predicates as never, ApprovalVocab.policyVersion),
    createdAt,
    expiresAt: firstLiteral(predicates as never, ApprovalVocab.expiresAt),
    resolvedAt: firstLiteral(predicates as never, ApprovalVocab.resolvedAt),
  }
}

function auditRowFromPredicates(url: string, predicates: Map<string, unknown[]>): AuditRowLike | null {
  const action = firstLiteral(predicates as never, AuditVocab.action)
  const actor = firstIri(predicates as never, AuditVocab.actor)
  const actorRole = firstLiteral(predicates as never, AuditVocab.actorRole)
  const createdAt = firstLiteral(predicates as never, AuditVocab.createdAt)
  if (!action || !actor || !actorRole || !createdAt) {
    return null
  }
  return {
    id: subjectIdFromResourceUrl(url),
    action,
    actor,
    actorRole,
    onBehalfOf: firstIri(predicates as never, AuditVocab.onBehalfOf),
    session: firstIri(predicates as never, AuditVocab.session),
    entry: firstIri(predicates as never, AuditVocab.entry),
    toolCallId: firstLiteral(predicates as never, AuditVocab.toolCallId),
    toolName: firstLiteral(predicates as never, AuditVocab.toolName),
    approval: firstIri(predicates as never, AuditVocab.approval),
    policyVersion: firstLiteral(predicates as never, AuditVocab.policyVersion),
    createdAt,
  }
}

function grantRowFromPredicates(url: string, predicates: Map<string, unknown[]>): GrantRowLike | null {
  const target = firstIri(predicates as never, GrantVocab.target)
  const action = firstIri(predicates as never, GrantVocab.action)
  const effect = firstLiteral(predicates as never, GrantVocab.effect)
  const decisionBy = firstIri(predicates as never, GrantVocab.decisionBy)
  const decisionRole = firstLiteral(predicates as never, GrantVocab.decisionRole)
  const createdAt = firstLiteral(predicates as never, GrantVocab.createdAt)
  if (!target || !action || !effect || !decisionBy || !decisionRole || !createdAt) {
    return null
  }
  return {
    id: subjectIdFromResourceUrl(url),
    target,
    action,
    title: firstLiteral(predicates as never, GrantVocab.title),
    summary: firstLiteralValue(predicates, GrantReadVocab.summary),
    body: firstLiteralValue(predicates, GrantReadVocab.description),
    schema: firstIri(predicates as never, GrantVocab.schema),
    pageKind: firstLiteral(predicates as never, GrantVocab.pageKind),
    wikiStatus: firstLiteral(predicates as never, GrantVocab.wikiStatus),
    tags: firstLiteral(predicates as never, GrantVocab.tags),
    source: firstLiteralValue(predicates, GrantReadVocab.source),
    sourceHash: firstLiteral(predicates as never, GrantVocab.sourceHash),
    compiledAt: firstLiteral(predicates as never, GrantVocab.compiledAt),
    compiledFrom: iriValues(predicates, GrantVocab.compiledFrom),
    related: iriValuesFrom(predicates, GrantReadVocab.related),
    effect,
    riskCeiling: firstLiteral(predicates as never, GrantVocab.riskCeiling),
    policy: firstLiteral(predicates as never, GrantVocab.policy),
    context: firstLiteral(predicates as never, GrantVocab.context),
    decisionBy,
    decisionRole,
    onBehalfOf: firstIri(predicates as never, GrantVocab.onBehalfOf),
    createdAt,
    revokedAt: firstLiteral(predicates as never, GrantVocab.revokedAt),
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

function acceptsGrantCoverage(decision: AutoModeGrantCoverageDecision | null | undefined): boolean {
  return decision?.covers === true
    && typeof decision.confidence === 'number'
    && decision.confidence >= MIN_GRANT_COVERAGE_CONFIDENCE
}

async function resolveSemanticGrantDecision(options: {
  runtime: AutoModeRemoteApprovalRuntime
  grants: GrantRowLike[]
  request: AutoModeApprovalRequest | Record<string, unknown>
  requestContext: Record<string, unknown>
  record?: AutoModeSessionRecord
}): Promise<AutoModeApprovalDecision | null> {
  const candidates = selectSemanticGrantCandidates(options.grants, options.requestContext)
  if (candidates.length === 0) {
    return null
  }

  const resolver = options.runtime.resolveGrantCoverage ?? resolveAutoModeGrantCoverage
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

function buildAutoModeGrantRequestContext(input: {
  webId: string
  record: AutoModeSessionRecord
  request: AutoModeApprovalRequest
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

export async function createRemoteAutoModeApproval(options: {
  record: AutoModeSessionRecord
  request: AutoModeApprovalRequest
  runtime?: AutoModeRemoteApprovalRuntime
}): Promise<RemoteAutoModeApprovalSummary> {
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
  runtime?: AutoModeRemoteApprovalRuntime
}): Promise<RemoteAutoModeApprovalSummary> {
  const activeRuntime = options.runtime ?? await createDefaultRuntime()

  return withRemoteApprovalStore(activeRuntime, async ({ store, webId, stored }) => {
    const subject = typeof options.subject === 'function'
      ? options.subject({ webId, stored })
      : options.subject
    const request = typeof options.request === 'function'
      ? options.request({ webId, stored, sessionUri: subject.sessionUri })
      : options.request
    const approvalId = crypto.randomUUID()
    const now = activeRuntime.now()
    const sessionUri = subject.sessionUri
    const approvalUri = buildApprovalUriForDate(webId, approvalId, now)
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

export async function waitForRemoteAutoModeApproval(options: {
  approvalId: string
  approvalUri?: string
  pollMs?: number
  signal?: AbortSignal
  runtime?: AutoModeRemoteApprovalRuntime
}): Promise<AutoModeApprovalDecision> {
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

export async function requestRemoteAutoModeApproval(options: {
  record: AutoModeSessionRecord
  request: AutoModeApprovalRequest
  pollMs?: number
  signal?: AbortSignal
  runtime?: AutoModeRemoteApprovalRuntime
}): Promise<AutoModeApprovalDecision> {
  const activeRuntime = options.runtime ?? await createDefaultRuntime()

  const delegated = await withRemoteApprovalStore(activeRuntime, async ({ store, webId }) => {
    const grants = await store.listGrants()
    return resolveSemanticGrantDecision({
      runtime: activeRuntime,
      grants,
      record: options.record,
      request: options.request,
      requestContext: buildAutoModeGrantRequestContext({
        webId,
        record: options.record,
        request: options.request,
      }),
    })
  })

  if (delegated) {
    return delegated
  }

  const summary = await createRemoteAutoModeApproval({
    record: options.record,
    request: options.request,
    runtime: activeRuntime,
  })

  return waitForRemoteAutoModeApproval({
    approvalId: summary.id,
    approvalUri: summary.approvalUri,
    pollMs: options.pollMs,
    signal: options.signal,
    runtime: activeRuntime,
  })
}

export async function resolveExistingRemoteAutoModeGrant(options: {
  record: AutoModeSessionRecord
  request: AutoModeApprovalRequest
  runtime?: AutoModeRemoteApprovalRuntime
}): Promise<AutoModeApprovalDecision | null> {
  const activeRuntime = options.runtime ?? await createDefaultRuntime()

  return withRemoteApprovalStore(activeRuntime, async ({ store, webId }) => {
    const grants = await store.listGrants()
    return resolveSemanticGrantDecision({
      runtime: activeRuntime,
      grants,
      record: options.record,
      request: options.request,
      requestContext: buildAutoModeGrantRequestContext({
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
  runtime?: AutoModeRemoteApprovalRuntime
}): Promise<AutoModeApprovalDecision> {
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

  return waitForRemoteAutoModeApproval({
    approvalId: summary.id,
    approvalUri: summary.approvalUri,
    pollMs: options.pollMs,
    signal: options.signal,
    runtime: activeRuntime,
  })
}

export async function listRemoteAutoModeApprovals(options: {
  status?: RemoteApprovalStatus | 'all'
  runtime?: AutoModeRemoteApprovalRuntime
} = {}): Promise<RemoteAutoModeApprovalSummary[]> {
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

export async function resolveRemoteAutoModeApproval(options: {
  approvalId: string
  approvalUri?: string
  decision: AutoModeApprovalDecision
  decisionRole?: 'human' | 'secretary'
  note?: string
  grantWikiTitle?: string
  grantWikiSummary?: string
  grantWikiBody?: string
  grantWikiTags?: string[]
  runtime?: AutoModeRemoteApprovalRuntime
}): Promise<RemoteAutoModeApprovalSummary> {
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
    const approvalCreatedAt = new Date(toIsoString(row.createdAt, now.toISOString()))
    const approvalUri = buildApprovalUriForDate(row.session, row.id, approvalCreatedAt)
    const nextStatus = options.decision === 'accept' || options.decision === 'accept_for_session'
      ? 'approved'
      : 'rejected'
    const decisionRole = options.decisionRole ?? 'human'

    await store.updateApproval(row.id, {
      status: nextStatus,
      decisionBy: webId,
      decisionRole,
      onBehalfOf: webId,
      reason: encodeDecisionReason(options.decision, options.note),
      resolvedAt: now,
    }, {
      resourceUri: options.approvalUri ?? row.approvalUri ?? approvalUri,
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
        object: buildGrantUri(row.session, grantId),
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
  store: AutoModeRemoteApprovalStore,
  options: {
    approvalId: string
    approvalUri?: string
  },
): Promise<ApprovalRowLike | null> {
  if (store.findApproval) {
    const row = await store.findApproval(options.approvalId, {
      resourceUri: options.approvalUri,
    })
    if (row || options.approvalUri) {
      return row
    }
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
  createSharedModelRemoteApprovalStore,
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
