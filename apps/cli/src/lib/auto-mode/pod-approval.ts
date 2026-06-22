import { setTimeout as delay } from 'node:timers/promises'
import { parsePodResourceRef, resolvePodBaseUrl } from '@undefineds.co/drizzle-solid'
import type { StoredCredentials } from '../credentials-store.js'
import { getDefaultPodDataSession, type PodDataSession } from '../pod-data-session.js'
import {
  agentResource,
  approvalResource,
  chatResource,
  claimApprovalRequest,
  claimInputRequest,
  drizzle,
  inboxNotificationResource,
  inputRequestResource,
  solidResources,
  threadRepository,
  type ApprovalClaimResult,
  type InputRequestClaimResult,
  type SolidDatabase,
} from '../models.js'
import {
  autoModeApprovalActionUri,
  autoModeApprovalDecisionForStoredApproval,
  autoModeApprovalRequestMessage,
  autoModeApprovalRisk,
  autoModeApprovalToolName,
  buildAutoModeApprovalDecisionReason,
  encodeAutoModeApprovalOptions,
  parseAutoModeApprovalOptions,
  shouldMaterializeAutoModeGrant,
  type AutoModeApprovalDecision,
  type AutoModeApprovalOption,
  type AutoModeApprovalRequest,
  type AutoModeGrantCoverageDecision,
  type AutoModeSessionRecord,
} from '@linx/agent-runtime/auto-mode'
import type { LinxSyncOperationKind, LinxSyncRunResult } from '@linx/agent-runtime/sync'
import { resolveAutoModeGrantCoverage, type AutoModeGrantCoverageInput } from './secretary.js'
import { buildGrantResourceUrl, type PodFetch } from '../pod-native.js'
import {
  MAX_APPROVAL_CONTEXT_LENGTH,
  MAX_GRANT_POLICY_LENGTH,
  approvalIriForCreatedAt,
  createNativeRemoteApprovalStore,
  createSharedModelRemoteApprovalStore,
  normalizeString,
  toIsoString,
  type ApprovalRowLike,
  type AuditRowLike,
  type AutoModeRemoteApprovalStore,
  type GrantRowLike,
  type RemoteApprovalRisk,
  type RemoteApprovalStatus,
} from './pod-approval-store.js'

export type {
  ApprovalRowLike,
  AuditRowLike,
  AutoModeRemoteApprovalStore,
  GrantRowLike,
  RemoteApprovalRisk,
  RemoteApprovalStatus,
} from './pod-approval-store.js'

const AUTO_MODE_CHAT_ID_PREFIX = 'linx-auto-mode'
const AUTO_MODE_AGENT_ID = '__secretary__'
const REMOTE_APPROVAL_POLICY_VERSION = 'linx-auto-mode-remote-approval/v1'
const DEFAULT_REMOTE_APPROVAL_POLL_MS = 1000
const DEFAULT_WARN_ONLY_TIMEOUT_MS = 5000
const MIN_GRANT_COVERAGE_CONFIDENCE = 0.75
const MAX_GRANT_COVERAGE_CANDIDATES = 5

export interface AutoModeRemoteApprovalRuntime {
  getPodDataSession: () => Promise<PodDataSession | null>
  createStore: (webId: string, fetcher: PodFetch, session?: PodDataSession) => AutoModeRemoteApprovalStore
  sleep: (ms: number) => Promise<void>
  now: () => Date
  onWarning?: (error: unknown) => void
  onSyncResult?: (result: LinxSyncRunResult) => void
  resolveGrantCoverage?: (input: AutoModeGrantCoverageInput) => Promise<AutoModeGrantCoverageDecision>
}

export type InboxNotificationControlResourceKind = 'approval' | 'input_request' | 'inbox_notification' | 'unknown'
export type InboxNotificationControlResourceClaimStatus = 'claimed' | 'lost' | 'display_only' | 'none'

export interface InboxNotificationControlResourceClaimInput {
  /** Full as:object IRI from a Solid Inbox notification envelope. */
  controlResourceUri: string
  /** Local client/runtime id that wants to handle the linked control resource. */
  leaseOwner: string
  leaseDurationMs?: number
  now?: Date | string | number
  getDb: () => Promise<SolidDatabase> | SolidDatabase
}

export interface InboxNotificationControlResourceClaimResult {
  status: InboxNotificationControlResourceClaimStatus
  controlResource: string
  kind: InboxNotificationControlResourceKind
  leaseOwner?: string
  leaseExpiresAt?: string
  reason?: string
}

export interface InboxNotificationControlResourceClaimHandlerRequest {
  clientId: string
  controlResource: string
  requestedLeaseMs?: number
}

export type InboxNotificationControlResourceClaimHandler = (
  request: InboxNotificationControlResourceClaimHandlerRequest,
) => Promise<InboxNotificationControlResourceClaimResult>

interface RemoteApprovalClient {
  session: PodDataSession
  store: AutoModeRemoteApprovalStore
}

const remoteApprovalClientCache = new WeakMap<AutoModeRemoteApprovalRuntime, Promise<RemoteApprovalClient | null>>()
let remoteApprovalSyncSeq = 0

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

export interface RemoteApprovalSubjectContext {
  sessionUri: string
  actorUri: string
  assignedTo?: string
  onBehalfOf?: string
  target?: string
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function buildAutoModeChatId(record: AutoModeSessionRecord): string {
  return `${AUTO_MODE_CHAT_ID_PREFIX}-${record.backend}`
}

function buildAutoModeChatUri(webId: string, record: AutoModeSessionRecord): string {
  return chatResource.buildIri(webId,  { id: buildAutoModeChatId(record) })
}

function autoModeThreadUri(webId: string, record: AutoModeSessionRecord): string {
  return threadRepository.iriForChat(webId, buildAutoModeChatId(record), record.id)
}

function grantIri(webIdOrUri: string, grantId: string): string {
  return buildGrantResourceUrl(webIdOrUri, grantId)
}

function buildGrantSchemaUri(webIdOrUri: string): string {
  return new URL('settings/autonomy/schema/grant.ttl#GrantWikiPage', `${resolvePodBaseUrl(webIdOrUri)}/`).toString()
}

function autoModeAgentUri(webId: string): string {
  return agentResource.buildIri(webId,  { id: AUTO_MODE_AGENT_ID })
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
    sourceApproval: approvalIriForCreatedAt(row.session, row.id, new Date(toIsoString(row.createdAt, new Date().toISOString()))),
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

function encodeApprovalOptions(options: AutoModeApprovalOption[] | undefined): string | undefined {
  return encodeAutoModeApprovalOptions(options)
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
  return autoModeApprovalDecisionForStoredApproval({
    status: normalizeString(row.status),
    reason: row.reason,
    approvalOptions: row.approvalOptions,
  })
}

function normalizeApprovalSummary(row: ApprovalRowLike): RemoteAutoModeApprovalSummary {
  const createdAt = toIsoString(row.createdAt, new Date(0).toISOString())
  const sessionUri = row.session
  const decision = decisionFromApprovalRow(row)
  const approvalOptions = parseAutoModeApprovalOptions(row.approvalOptions)

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
    ...(approvalOptions.length > 0 ? { approvalOptions } : {}),
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

export function createInboxNotificationControlResourceClaimHandler(input: {
  getDb: () => Promise<SolidDatabase> | SolidDatabase
  leaseDurationMs?: number
  now?: () => Date | string | number
}): InboxNotificationControlResourceClaimHandler {
  return async (request) => claimInboxNotificationControlResource({
    controlResourceUri: request.controlResource,
    leaseOwner: request.clientId,
    leaseDurationMs: request.requestedLeaseMs ?? input.leaseDurationMs,
    now: input.now?.(),
    getDb: input.getDb,
  })
}

export async function claimInboxNotificationControlResource(
  input: InboxNotificationControlResourceClaimInput,
): Promise<InboxNotificationControlResourceClaimResult> {
  const controlResource = normalizeString(input.controlResourceUri)
  if (!controlResource) {
    return {
      status: 'none',
      controlResource: input.controlResourceUri,
      kind: 'unknown',
      reason: 'Inbox notification did not include an as:object control resource IRI.',
    }
  }

  if (!/^https?:\/\//u.test(controlResource)) {
    return {
      status: 'display_only',
      controlResource,
      kind: 'unknown',
      reason: 'Control resource claim requires a full IRI from the Inbox notification as:object.',
    }
  }

  const kind = classifyInboxNotificationControlResource(controlResource)
  if (kind === 'inbox_notification') {
    return {
      status: 'display_only',
      controlResource,
      kind,
      reason: 'InboxNotification is an ActivityStreams envelope; claim the linked as:object control resource instead.',
    }
  }
  if (kind === 'unknown') {
    return {
      status: 'display_only',
      controlResource,
      kind,
      reason: 'Inbox notification object is not a known claimable control resource.',
    }
  }

  const db = await input.getDb()
  if (kind === 'approval') {
    return mapApprovalControlClaimResult(controlResource, await claimApprovalRequest(db as never, {
      approval: controlResource,
      leaseOwner: input.leaseOwner,
      leaseDurationMs: input.leaseDurationMs,
      now: input.now,
    }))
  }

  return mapInputRequestControlClaimResult(controlResource, await claimInputRequest(db as never, {
    inputRequest: controlResource,
    leaseOwner: input.leaseOwner,
    leaseDurationMs: input.leaseDurationMs,
    now: input.now,
  }))
}

function classifyInboxNotificationControlResource(
  controlResource: string,
): InboxNotificationControlResourceKind {
  if (parsePodResourceRef(inboxNotificationResource, controlResource)) {
    return 'inbox_notification'
  }
  if (parsePodResourceRef(approvalResource, controlResource)) {
    return 'approval'
  }
  if (parsePodResourceRef(inputRequestResource, controlResource)) {
    return 'input_request'
  }
  return 'unknown'
}

function mapApprovalControlClaimResult(
  controlResource: string,
  result: ApprovalClaimResult,
): InboxNotificationControlResourceClaimResult {
  return {
    status: mapModelsControlClaimStatus(result.status),
    controlResource,
    kind: 'approval',
    leaseOwner: result.leaseOwner,
    leaseExpiresAt: result.leaseExpiresAt,
    ...(result.reason ? { reason: result.reason } : {}),
  }
}

function mapInputRequestControlClaimResult(
  controlResource: string,
  result: InputRequestClaimResult,
): InboxNotificationControlResourceClaimResult {
  return {
    status: mapModelsControlClaimStatus(result.status),
    controlResource,
    kind: 'input_request',
    leaseOwner: result.leaseOwner,
    leaseExpiresAt: result.leaseExpiresAt,
    ...(result.reason ? { reason: result.reason } : {}),
  }
}

function mapModelsControlClaimStatus(
  status: ApprovalClaimResult['status'] | InputRequestClaimResult['status'],
): InboxNotificationControlResourceClaimStatus {
  if (status === 'claimed' || status === 'lost') {
    return status
  }
  return 'display_only'
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
    session: autoModeThreadUri(input.webId, input.record),
    target: autoModeThreadUri(input.webId, input.record),
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
    target: input.subject.target ?? input.subject.sessionUri,
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
      sessionUri: autoModeThreadUri(webId, options.record),
      actorUri: autoModeAgentUri(webId),
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
    const approvalUri = approvalIriForCreatedAt(webId, approvalId, now)
    const target = subject.target ?? sessionUri
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
      target,
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
      target,
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

  const decision = await waitForRemoteAutoModeApproval({
    approvalId: summary.id,
    approvalUri: summary.approvalUri,
    pollMs: options.pollMs,
    signal: options.signal,
    runtime: activeRuntime,
  })

  if (decision === 'accept_for_session') {
    await materializeRemoteAutoModeGrant({
      approvalId: summary.id,
      approvalUri: summary.approvalUri,
      runtime: activeRuntime,
    })
  }

  return decision
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
    const approvalUri = approvalIriForCreatedAt(row.session, row.id, approvalCreatedAt)
    const nextStatus = options.decision === 'accept' || options.decision === 'accept_for_session'
      ? 'approved'
      : 'rejected'
    const decisionRole = options.decisionRole ?? 'human'

    await store.updateApproval(row.id, {
      status: nextStatus,
      decisionBy: webId,
      decisionRole,
      onBehalfOf: webId,
      reason: buildAutoModeApprovalDecisionReason(options.decision, options.note),
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
      reason: buildAutoModeApprovalDecisionReason(options.decision, options.note),
      resolvedAt: now,
    }
    return normalizeApprovalSummary(nextRow)
  })
}

export async function materializeRemoteAutoModeGrant(options: {
  approvalId: string
  approvalUri?: string
  decisionRole?: 'human' | 'secretary'
  grantWikiTitle?: string
  grantWikiSummary?: string
  grantWikiBody?: string
  grantWikiTags?: string[]
  runtime?: AutoModeRemoteApprovalRuntime
}): Promise<GrantRowLike | null> {
  const activeRuntime = options.runtime ?? await createDefaultRuntime()

  return withRemoteApprovalStore(activeRuntime, async ({ store, webId }) => {
    const row = await readRemoteApprovalRow(store, {
      approvalId: options.approvalId,
      approvalUri: options.approvalUri,
    })
    if (!row || row.status !== 'approved') {
      return null
    }

    const decision = decisionFromApprovalRow(row)
    if (!shouldMaterializeAutoModeGrant(decision)) {
      return null
    }

    const existing = await store.listGrants()
    const sourceHash = grantSourceHash(row)
    const existingGrant = existing.find((grant) => grant.source === 'approval' && grant.sourceHash === sourceHash)
    if (existingGrant) {
      return existingGrant
    }

    const now = activeRuntime.now()
    const decisionRole = options.decisionRole ?? (row.decisionRole === 'secretary' ? 'secretary' : 'human')
    const grantId = crypto.randomUUID()
    const body = grantWikiBodyFromApproval(row, options.grantWikiBody)
    const approvalCreatedAt = new Date(toIsoString(row.createdAt, now.toISOString()))
    const approvalUri = options.approvalUri ?? row.approvalUri ?? approvalIriForCreatedAt(row.session, row.id, approvalCreatedAt)
    const grant: GrantRowLike = {
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
      sourceHash,
      compiledAt: now,
      compiledFrom: [approvalUri],
      related: [row.session],
      effect: 'allow',
      riskCeiling: row.risk,
      policy: grantIndexTextFromWikiBody(body),
      context: grantContextFromApproval(row),
      decisionBy: row.decisionBy ?? webId,
      decisionRole,
      onBehalfOf: row.onBehalfOf ?? webId,
      createdAt: now,
    }

    await store.insertGrant(grant)

    await warnOnly(activeRuntime, () => store.insertInboxNotification({
      id: crypto.randomUUID(),
      actor: webId,
      object: grantIri(row.session, grantId),
      createdAt: now,
    }))

    return grant
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
