import { podTable, uri, string, text, timestamp, id } from '@undefineds.co/drizzle-solid'
import { ODRL, UDFS, DCTerms } from './namespaces'

// Approval request domain store (separate from Solid inbox notifications)
export const approvalTable = podTable(
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
    policyVersion: string('policyVersion').predicate(UDFS.policyVersion),

    // Timestamps
    createdAt: timestamp('createdAt').predicate(DCTerms.created).notNull().defaultNow(),
    resolvedAt: timestamp('resolvedAt').predicate(UDFS.resolvedAt),
  },
  {
    base: '/.data/approvals/',
    sparqlEndpoint: '/.data/approvals/-/sparql',
    type: UDFS.ApprovalRequest,
    namespace: UDFS,
    subjectTemplate: '{id}.ttl',
  },
)

export type ApprovalRow = typeof approvalTable.$inferSelect
export type ApprovalInsert = typeof approvalTable.$inferInsert
export type ApprovalUpdate = typeof approvalTable.$inferUpdate
