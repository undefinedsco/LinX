import { setTimeout as delay } from 'node:timers/promises'
import type { StoredCredentials } from '../credentials-store.js'
import { getDefaultPodDataSession, type PodDataSession } from '../pod-data-session.js'
import { AS, ODRL, UDFS } from '@undefineds.co/models/namespaces'
import { ApprovalVocab, AuditVocab, GrantVocab, InboxNotificationVocab } from '@undefineds.co/models/vocab/sidecar'
import type { WatchApprovalDecision, WatchApprovalRequest, WatchSessionRecord } from '@undefineds.co/models/watch'
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

const WATCH_CHAT_ID = 'linx-watch'
const WATCH_AGENT_ID = 'linx-watch-assistant'
const REMOTE_APPROVAL_POLICY_VERSION = 'linx-watch-remote-approval/v1'
const DEFAULT_REMOTE_APPROVAL_POLL_MS = 1000

export type RemoteApprovalStatus = 'pending' | 'approved' | 'rejected'
export type RemoteApprovalRisk = 'low' | 'medium' | 'high'

export interface ApprovalRowLike extends Record<string, unknown> {
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

export interface WatchRemoteApprovalStore {
  listApprovals(): Promise<ApprovalRowLike[]>
  insertApproval(row: ApprovalRowLike): Promise<void>
  updateApproval(id: string, patch: Partial<ApprovalRowLike>): Promise<void>
  listAudits(): Promise<AuditRowLike[]>
  insertAudit(row: AuditRowLike): Promise<void>
  listGrants(): Promise<Array<Record<string, unknown>>>
  insertGrant(row: Record<string, unknown>): Promise<void>
  insertInboxNotification(row: InboxNotificationRowLike): Promise<void>
}

export interface WatchRemoteApprovalRuntime {
  getPodDataSession: () => Promise<PodDataSession | null>
  createStore: (webId: string, fetcher: PodFetch) => WatchRemoteApprovalStore
  sleep: (ms: number) => Promise<void>
  now: () => Date
  onWarning?: (error: unknown) => void
}

interface RemoteApprovalClient {
  session: PodDataSession
  store: WatchRemoteApprovalStore
}

const remoteApprovalClientCache = new WeakMap<WatchRemoteApprovalRuntime, Promise<RemoteApprovalClient | null>>()

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

function buildThreadUri(webId: string, threadId: string): string {
  return `${getPodBaseUrl(webId)}/.data/chat/${WATCH_CHAT_ID}/index.ttl#${threadId}`
}

function buildApprovalUri(webIdOrUri: string, approvalId: string): string {
  return buildApprovalResourceUrl(webIdOrUri, approvalId)
}

function buildApprovalUriForDate(webIdOrUri: string, approvalId: string, createdAt: Date): string {
  return buildApprovalResourceUrl(webIdOrUri, approvalId, createdAt)
}

function buildGrantUri(webIdOrUri: string, grantId: string): string {
  return buildGrantResourceUrl(webIdOrUri, grantId)
}

function buildGrantDocumentUrl(webIdOrUri: string): string {
  return `${getPodBaseUrl(webIdOrUri)}/settings/autonomy/grants.ttl`
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
    await task()
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

  return {
    id: row.id,
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
    createdAt,
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
    createStore(webId, fetcher) {
      return createNativeRemoteApprovalStore(webId, fetcher)
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

  return {
    session,
    store: runtime.createStore(session.webId, session.fetch),
  }
}

function createNativeRemoteApprovalStore(webId: string, fetcher: PodFetch): WatchRemoteApprovalStore {
  return {
    listApprovals: () => listApprovalRows(webId, fetcher),
    insertApproval: (row) => writeApprovalRow(webId, fetcher, row),
    async updateApproval(id, patch): Promise<void> {
      const existing = (await listApprovalRows(webId, fetcher)).find((row) => row.id === id)
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

async function listApprovalRows(webId: string, fetcher: PodFetch): Promise<ApprovalRowLike[]> {
  const [currentUrls, legacyUrls] = await Promise.all([
    listTurtleResourcesRecursive(fetcher, `${getPodBaseUrl(webId)}/.data/approvals/`).catch(() => []),
    listTurtleResources(fetcher, `${getPodBaseUrl(webId)}/.data/approvals/`).catch(() => []),
  ])
  const urls = [...new Set([...currentUrls, ...legacyUrls])]
  const rows: ApprovalRowLike[] = []
  for (const url of urls.filter((entry) => entry.endsWith('.ttl'))) {
    const turtle = await readTurtleResource(fetcher, url).catch(() => null)
    if (!turtle) continue
    for (const [subject, predicates] of parseManagedTurtleBlocks(turtle, url)) {
      const row = approvalRowFromPredicates(subject, predicates)
      if (row) rows.push(row)
    }
  }
  return rows
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
      ...(row.policyVersion ? [{ predicate: ApprovalVocab.policyVersion, object: literal(row.policyVersion) }] : []),
      { predicate: ApprovalVocab.createdAt, object: literal(toIsoString(row.createdAt, new Date().toISOString())) },
      ...(row.resolvedAt ? [{ predicate: ApprovalVocab.resolvedAt, object: literal(toIsoString(row.resolvedAt, new Date().toISOString())) }] : []),
    ],
  })
}

async function listAuditRows(webId: string, fetcher: PodFetch): Promise<AuditRowLike[]> {
  const urls = await listTurtleResourcesRecursive(fetcher, `${getPodBaseUrl(webId)}/.data/audits/`)
  const rows: AuditRowLike[] = []
  for (const url of urls.filter((entry) => entry.endsWith('.ttl'))) {
    const turtle = await readTurtleResource(fetcher, url).catch(() => null)
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

async function listGrantRows(webId: string, fetcher: PodFetch): Promise<Array<Record<string, unknown>>> {
  const urls = [
    `${getPodBaseUrl(webId)}/settings/autonomy/grants.ttl`,
    ...await listTurtleResources(fetcher, `${getPodBaseUrl(webId)}/settings/autonomy/grants/`).catch(() => []),
  ]
  const rows: Array<Record<string, unknown>> = []
  for (const url of urls.filter((entry) => entry.endsWith('.ttl'))) {
    const turtle = await readTurtleResource(fetcher, url).catch(() => null)
    if (!turtle) continue
    for (const [subject, predicates] of parseManagedTurtleBlocks(turtle, url)) {
      const row = grantRowFromPredicates(subject, predicates)
      if (row) rows.push(row)
    }
  }
  return rows
}

async function writeGrantRow(webId: string, fetcher: PodFetch, row: Record<string, unknown>): Promise<void> {
  const id = normalizeString(row.id) ?? crypto.randomUUID()
  const documentUrl = buildGrantDocumentUrl(webId)
  const subjectUrl = buildGrantResourceUrl(webId, id)
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
      { predicate: GrantVocab.effect, object: literal(effect) },
      ...(normalizeString(row.riskCeiling) ? [{ predicate: GrantVocab.riskCeiling, object: literal(normalizeString(row.riskCeiling) as string) }] : []),
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
    policyVersion: firstLiteral(predicates as never, ApprovalVocab.policyVersion),
    createdAt,
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

function grantRowFromPredicates(url: string, predicates: Map<string, unknown[]>): Record<string, unknown> | null {
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
    effect,
    riskCeiling: firstLiteral(predicates as never, GrantVocab.riskCeiling),
    decisionBy,
    decisionRole,
    onBehalfOf: firstIri(predicates as never, GrantVocab.onBehalfOf),
    createdAt,
    revokedAt: firstLiteral(predicates as never, GrantVocab.revokedAt),
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
      sessionUri: buildThreadUri(webId, options.record.id),
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
    const approvalId = crypto.randomUUID()
    const now = activeRuntime.now()
    const sessionUri = subject.sessionUri
    const approvalUri = buildApprovalUriForDate(webId, approvalId, now)
    const targetUri = subject.targetUri ?? sessionUri
    const assignedTo = subject.assignedTo ?? webId
    const onBehalfOf = subject.onBehalfOf ?? webId
    const policyVersion = subject.policyVersion ?? REMOTE_APPROVAL_POLICY_VERSION
    const requestEntry = request.entry ?? approvalUri

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
      policyVersion,
      createdAt: now,
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
      session: sessionUri,
      toolCallId: request.toolCallId,
      toolName: request.toolName,
      target: targetUri,
      action: request.action,
      risk: request.risk,
      status: 'pending',
      assignedTo,
      policyVersion,
      createdAt: now,
    })
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
    const requestTarget = subject.targetUri ?? subject.sessionUri

    return grants.some((grant) => (
      grant.effect === 'allow'
      && grant.action === request.action
      && grant.target === requestTarget
      && riskScore(typeof grant.riskCeiling === 'string' ? grant.riskCeiling : undefined) >= riskScore(request.risk)
      && !grant.revokedAt
    ))
  })

  if (delegated) {
    return 'accept_for_session'
  }

  const summary = await createRemoteApproval({
    subject: options.subject,
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
      return normalizeApprovalSummary(row)
    }

    const now = activeRuntime.now()
    const approvalCreatedAt = new Date(toIsoString(row.createdAt, now.toISOString()))
    const approvalUri = buildApprovalUriForDate(row.session, row.id, approvalCreatedAt)
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

    await warnOnly(activeRuntime, () => store.insertAudit({
      id: crypto.randomUUID(),
      action: nextStatus === 'approved' ? 'approval_approved' : 'approval_rejected',
      actor: webId,
      actorRole: 'human',
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
      decisionRole: 'human',
      onBehalfOf: webId,
      reason: encodeDecisionReason(options.decision, options.note),
      resolvedAt: now,
    }
    return normalizeApprovalSummary(nextRow)
  })
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
  isRemoteApprovalAbortError,
  normalizeApprovalSummary,
  parseDecisionReason,
}
