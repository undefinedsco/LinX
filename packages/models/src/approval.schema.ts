import { podTable, uri, string, text, timestamp, id } from '@undefineds.co/drizzle-solid'
import { ODRL, UDFS, DCTerms } from './namespaces'
import { buildFragmentResourceIri } from './resource-utils'

const APPROVAL_DATE_BUCKET_REF_PATTERN = /\/\.data\/approvals\/\d{4}\/\d{2}\/\d{2}\.ttl#([^/?#]+)$/
const APPROVAL_LEGACY_FILE_REF_PATTERN = /\/\.data\/approvals\/([^/?#]+)\.ttl(?:#([^/?#]+))?$/

export function buildApprovalSubjectPath(approvalId: string, createdAt: Date | string | number = new Date()): string {
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt)
  const safeDate = Number.isFinite(date.getTime()) ? date : new Date()
  const yyyy = String(safeDate.getUTCFullYear())
  const mm = String(safeDate.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(safeDate.getUTCDate()).padStart(2, '0')
  return `/.data/approvals/${yyyy}/${mm}/${dd}.ttl#${encodeURIComponent(approvalId)}`
}

export function buildApprovalResourceIri(podBaseUrl: string, approvalId: string, createdAt: Date | string | number = new Date()): string {
  return buildFragmentResourceIri(podBaseUrl, buildApprovalSubjectPath(approvalId, createdAt))
}

export function extractApprovalIdFromApprovalRef(approvalRef: string | null | undefined): string | null {
  if (!approvalRef) return null

  if (!approvalRef.includes('/') && !approvalRef.includes('#')) {
    return approvalRef
  }

  const dateBucketMatch = approvalRef.match(APPROVAL_DATE_BUCKET_REF_PATTERN)
  if (dateBucketMatch?.[1] && dateBucketMatch[1] !== 'this') {
    return decodeURIComponent(dateBucketMatch[1])
  }

  const legacyFileMatch = approvalRef.match(APPROVAL_LEGACY_FILE_REF_PATTERN)
  if (!legacyFileMatch?.[1]) return null

  const fragmentId = legacyFileMatch[2]
  if (fragmentId && fragmentId !== 'this') {
    return decodeURIComponent(fragmentId)
  }

  return decodeURIComponent(legacyFileMatch[1])
}

// Approval request resource (separate from Solid inbox notifications).
export const approvalResource = podTable(
  'approval',
  {
    id: id('id'),

    // Relations
    session: uri('session').predicate(UDFS.session).notNull(),
    toolCallId: string('toolCallId').predicate(UDFS.toolCallId).notNull(),

    // Request details
    toolName: string('toolName').predicate(UDFS.toolName).notNull(),

    // Standard-ish policy surface for action on target (derived by the bridge).
    // NOTE: These MUST be Pod URIs / vocab URIs, not runtime-local identifiers.
    target: uri('target').predicate(ODRL.target).notNull(),
    action: uri('action').predicate(ODRL.action).notNull(),
    risk: string('risk').predicate(UDFS.risk).notNull(),
    status: string('status').predicate(UDFS.status).notNull().default('pending'),

    // Decision identity (WebID semantics)
    assignedTo: uri('assignedTo').predicate(UDFS.assignedTo),
    decisionBy: uri('decisionBy').predicate(UDFS.decisionBy),
    decisionRole: string('decisionRole').predicate(UDFS.decisionRole),
    onBehalfOf: uri('onBehalfOf').predicate(UDFS.onBehalfOf),
    reason: text('reason').predicate(UDFS.reason),
    context: text('context').predicate(UDFS.context),
    approvalOptions: text('approvalOptions').predicate(UDFS.approvalOptions),
    policyVersion: string('policyVersion').predicate(UDFS.policyVersion),

    // Timestamps
    createdAt: timestamp('createdAt').predicate(DCTerms.created).notNull().defaultNow(),
    expiresAt: timestamp('expiresAt').predicate(UDFS.expiresAt),
    resolvedAt: timestamp('resolvedAt').predicate(UDFS.resolvedAt),
  },
  {
    base: '/.data/approvals/',
    sparqlEndpoint: '/.data/approvals/-/sparql',
    type: UDFS.ApprovalRequest,
    namespace: UDFS,
    subjectTemplate: '{yyyy}/{MM}/{dd}.ttl#{id}',
  },
)

// Compatibility alias. New model code should prefer `approvalResource`.
export const approvalTable = approvalResource

export type ApprovalRow = typeof approvalResource.$inferSelect
export type ApprovalInsert = typeof approvalResource.$inferInsert
export type ApprovalUpdate = typeof approvalResource.$inferUpdate
