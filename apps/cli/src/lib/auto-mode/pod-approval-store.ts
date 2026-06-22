import { resolvePodBaseUrl } from '@undefineds.co/drizzle-solid'
import { AS, ODRL, UDFS } from '@undefineds.co/models/namespaces'
import { ApprovalVocab, AuditVocab, GrantReadVocab, GrantVocab, InboxNotificationVocab } from '@undefineds.co/models/vocab/sidecar'
import {
  approvalResource,
  auditResource,
  claimApprovalRequest,
  grantResource,
  inboxNotificationResource,
  type AnyPodResource,
  type ApprovalClaimResult,
  type SolidDatabase,
} from '../models.js'
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
} from '../pod-native.js'

export const DEFAULT_APPROVAL_LIST_DAYS = 7
export const MAX_GRANT_POLICY_LENGTH = 1200
export const MAX_APPROVAL_CONTEXT_LENGTH = 1400

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
  leaseOwner?: string
  leaseExpiresAt?: Date | string
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
  claimApproval?(
    input: {
      approvalUri: string
      leaseOwner: string
      leaseDurationMs?: number
      now?: Date | string | number
    },
  ): Promise<ApprovalClaimResult>
  listAudits(): Promise<AuditRowLike[]>
  insertAudit(row: AuditRowLike): Promise<void>
  listGrants(): Promise<GrantRowLike[]>
  insertGrant(row: GrantRowLike): Promise<void>
  insertInboxNotification(row: InboxNotificationRowLike): Promise<void>
}


export function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function toIsoString(value: Date | string | undefined, fallback: string): string {
  if (value instanceof Date) {
    return value.toISOString()
  }

  if (typeof value === 'string' && value.trim()) {
    return value
  }

  return fallback
}


export function approvalIriForCreatedAt(webIdOrUri: string, approvalId: string, createdAt: Date): string {
  return approvalResource.buildIri(webIdOrUri, {
    id: approvalId,
    createdAt,
  })
}

function documentUrlFromResourceUri(resourceUri: string): string {
  return resourceUri.split('#', 1)[0] ?? resourceUri
}

function truncatePodLiteral(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value
  }
  return `${value.slice(0, Math.max(0, maxLength - 15))}...[truncated]`
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

export function createSharedModelRemoteApprovalStore(
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
        const iri = approvalIriForCreatedAt(webId, id, createdAt)
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
        ?? (options.createdAt ? approvalIriForCreatedAt(webId, id, new Date(toIsoString(options.createdAt, new Date().toISOString()))) : undefined)
      if (explicitIri) {
        await modelUpdateByIri(getDb, approvalResource, explicitIri, omitInternalFields(patch))
        return
      }

      const updated = await modelUpdateById<ApprovalRowLike>(getDb, approvalResource, id, omitInternalFields(patch))
      if (!updated) {
        throw new Error(`Remote approval not found: ${id}`)
      }
    },
    claimApproval: async (input) => {
      const db = await getDb()
      return claimApprovalRequest(db as never, {
        approval: input.approvalUri,
        leaseOwner: input.leaseOwner,
        leaseDurationMs: input.leaseDurationMs,
        now: input.now,
      })
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

async function modelList<T>(getDb: () => Promise<SolidDatabase>, resource: AnyPodResource): Promise<T[]> {
  const db = await getDb()
  return await db.select().from(resource).execute() as T[]
}

async function modelFindByIri<T>(getDb: () => Promise<SolidDatabase>, resource: AnyPodResource, iri: string): Promise<T | null> {
  const db = await getDb()
  return await db.findByIri(resource, iri) as T | null
}

async function modelFindById<T>(getDb: () => Promise<SolidDatabase>, resource: AnyPodResource, id: string): Promise<T | null> {
  const db = await getDb()
  return await db.findById(resource, id) as T | null
}

async function modelInsert(getDb: () => Promise<SolidDatabase>, resource: AnyPodResource, row: Record<string, unknown>): Promise<void> {
  const db = await getDb()
  await db.insert(resource).values(stripUndefined(row)).execute()
}

async function modelUpdateByIri(
  getDb: () => Promise<SolidDatabase>,
  resource: AnyPodResource,
  iri: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const db = await getDb()
  const update = stripUndefined(patch)
  delete update.id
  delete update.approvalUri
  await db.updateByIri(resource, iri, update)
}

async function modelUpdateById<T>(
  getDb: () => Promise<SolidDatabase>,
  resource: AnyPodResource,
  id: string,
  patch: Record<string, unknown>,
): Promise<T | null> {
  const db = await getDb()
  const update = stripUndefined(patch)
  delete update.id
  delete update.approvalUri
  return await db.updateById(resource, id, update) as T | null
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
  delete next.uri
  return next
}

function rowSubject(row: Record<string, unknown>): string | undefined {
  return normalizeString(row['@id'])
    ?? normalizeString(row.subject)
    ?? normalizeString(row.uri)
}

function enrichApprovalRow(webId: string, row: ApprovalRowLike, explicitIri?: string): ApprovalRowLike {
  const createdAt = new Date(toIsoString(row.createdAt, new Date().toISOString()))
  return {
    ...row,
    approvalUri: explicitIri
      ?? normalizeString(row.approvalUri)
      ?? rowSubject(row)
      ?? approvalIriForCreatedAt(webId, row.id, createdAt),
  }
}

export function createNativeRemoteApprovalStore(webId: string, fetcher: PodFetch): AutoModeRemoteApprovalStore {
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
    claimApproval: async (input) => claimNativeApproval(webId, fetcher, input),
    listAudits: () => listAuditRows(webId, fetcher),
    insertAudit: (row) => writeAuditRow(webId, fetcher, row),
    listGrants: () => listGrantRows(webId, fetcher),
    insertGrant: (row) => writeGrantRow(webId, fetcher, row),
    insertInboxNotification: (row) => writeInboxNotificationRow(webId, fetcher, row),
  }
}

async function claimNativeApproval(
  webId: string,
  fetcher: PodFetch,
  input: {
    approvalUri: string
    leaseOwner: string
    leaseDurationMs?: number
    now?: Date | string | number
  },
): Promise<ApprovalClaimResult> {
  const now = normalizeClaimDate(input.now)
  const leaseDurationMs = input.leaseDurationMs ?? 60_000
  if (!Number.isFinite(leaseDurationMs) || leaseDurationMs <= 0) {
    throw new Error('Approval claim leaseDurationMs must be a positive finite number.')
  }
  const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs)
  const missingResult = {
    status: 'not_found' as const,
    approval: null,
    leaseOwner: input.leaseOwner,
    leaseExpiresAt: leaseExpiresAt.toISOString(),
    reason: 'Approval request was not found.',
  }
  const existing = await readApprovalRowFromResource(fetcher, input.approvalUri)
  if (!existing) {
    return missingResult
  }
  if (!isClaimableControlStatus(existing.status)) {
    return {
      status: 'not_actionable',
      approval: existing as never,
      leaseOwner: input.leaseOwner,
      leaseExpiresAt: leaseExpiresAt.toISOString(),
      reason: `Approval request status is ${String(existing.status || 'empty')}.`,
    }
  }
  if (isPastDate(existing.expiresAt, now)) {
    return {
      status: 'not_actionable',
      approval: existing as never,
      leaseOwner: input.leaseOwner,
      leaseExpiresAt: leaseExpiresAt.toISOString(),
      reason: 'Approval request is past expiresAt.',
    }
  }
  if (hasActiveForeignLease(existing, input.leaseOwner, now)) {
    return {
      status: 'lost',
      approval: existing as never,
      leaseOwner: input.leaseOwner,
      leaseExpiresAt: leaseExpiresAt.toISOString(),
      reason: 'Approval request is leased by another client.',
    }
  }
  await writeApprovalRow(webId, fetcher, {
    ...existing,
    status: 'handling',
    leaseOwner: input.leaseOwner,
    leaseExpiresAt,
  })
  const claimed = await readApprovalRowFromResource(fetcher, input.approvalUri)
  if (claimed?.leaseOwner === input.leaseOwner && !isPastDate(claimed.leaseExpiresAt, now)) {
    return {
      status: 'claimed',
      approval: claimed as never,
      leaseOwner: input.leaseOwner,
      leaseExpiresAt: leaseExpiresAt.toISOString(),
    }
  }
  return {
    status: 'lost',
    approval: (claimed ?? existing) as never,
    leaseOwner: input.leaseOwner,
    leaseExpiresAt: leaseExpiresAt.toISOString(),
    reason: 'Approval request lease was not retained after update.',
  }
}

function normalizeClaimDate(value: Date | string | number | undefined): Date {
  const date = value instanceof Date ? value : new Date(value ?? Date.now())
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid approval claim timestamp.')
  }
  return date
}

function isClaimableControlStatus(status: unknown): boolean {
  if (typeof status !== 'string' || !status.trim()) {
    return true
  }
  const normalized = status.trim()
  return normalized === 'pending' || normalized === 'handling'
}

function hasActiveForeignLease(row: ApprovalRowLike, leaseOwner: string, now: Date): boolean {
  if (row.leaseOwner === leaseOwner) {
    return false
  }
  const currentOwner = normalizeString(row.leaseOwner)
  if (!currentOwner) {
    return false
  }
  return !isPastDate(row.leaseExpiresAt, now)
}

function isPastDate(value: Date | string | undefined, now: Date): boolean {
  if (!value) {
    return false
  }
  const date = value instanceof Date ? value : new Date(value)
  return !Number.isNaN(date.getTime()) && date.getTime() <= now.getTime()
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

async function listApprovalRows(webId: string, fetcher: PodFetch): Promise<ApprovalRowLike[]> {
  const urls = [
    ...recentApprovalDocumentUrls(webId),
    ...await listTurtleResources(fetcher, `${resolvePodBaseUrl(webId)}/.data/approvals/`).catch(() => []),
  ]
  const rows: ApprovalRowLike[] = []
  for (const url of [...new Set(urls)].filter((entry) => entry.endsWith('.ttl'))) {
    const turtle = await readTurtleResource(fetcher, url).catch(() => null)
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
      ...(row.leaseOwner ? [{ predicate: ApprovalVocab.leaseOwner, object: literal(row.leaseOwner) }] : []),
      ...(row.leaseExpiresAt ? [{ predicate: ApprovalVocab.leaseExpiresAt, object: literal(toIsoString(row.leaseExpiresAt, new Date().toISOString())) }] : []),
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
  const urls = await listTurtleResourcesRecursive(fetcher, `${resolvePodBaseUrl(webId)}/.data/audits/`)
  const rows: AuditRowLike[] = []
  for (const url of urls.filter((entry: string) => entry.endsWith('.ttl'))) {
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

async function listGrantRows(webId: string, fetcher: PodFetch): Promise<GrantRowLike[]> {
  const urls = [
    ...await listTurtleResources(fetcher, `${resolvePodBaseUrl(webId)}/settings/autonomy/grants/`).catch(() => []),
  ]
  const rows: GrantRowLike[] = []
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
    leaseOwner: firstLiteral(predicates as never, ApprovalVocab.leaseOwner),
    leaseExpiresAt: firstLiteral(predicates as never, ApprovalVocab.leaseExpiresAt),
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

