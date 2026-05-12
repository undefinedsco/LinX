import { extractPodResourceTemplateValue, podTable, uri, string, text, timestamp, id } from '@undefineds.co/drizzle-solid'
import { ODRL, UDFS, DCTerms } from './namespaces'

export function extractApprovalIdFromApprovalRef(approvalRef: string | null | undefined): string | null {
  return extractPodResourceTemplateValue(approvalResource, approvalRef)
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
