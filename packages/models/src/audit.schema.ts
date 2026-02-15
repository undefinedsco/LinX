import { podTable, uri, string, text, timestamp, id } from 'drizzle-solid'
import { UDFS, DCTerms } from './namespaces'

// Append-only audit log (separate from Solid inbox notifications)
export const auditTable = podTable(
  'audit',
  {
    id: id('id'),

    // Audit action
    action: string('action').predicate(UDFS.action).notNull(),

    // Actor identity (WebID semantics)
    actor: uri('actor').predicate(UDFS.actor).notNull(),
    actorRole: string('actorRole').predicate(UDFS.actorRole).notNull(),
    onBehalfOf: uri('onBehalfOf').predicate(UDFS.onBehalfOf),

    // Relations
    session: uri('session').predicate(UDFS.session),
    toolCallId: string('toolCallId').predicate(UDFS.toolCallId),
    approval: uri('approval').predicate(UDFS.approval),

    // JSON payload with policy/reasoning snapshot
    context: text('context').predicate(UDFS.context),

    // Policy metadata
    policy: uri('policy').predicate(UDFS.policy),
    policyVersion: string('policyVersion').predicate(UDFS.policyVersion),

    // Timestamps
    createdAt: timestamp('createdAt').predicate(DCTerms.created).notNull().defaultNow(),
  },
  {
    base: '/.data/audit/',
    sparqlEndpoint: '/.data/audit/-/sparql',
    type: UDFS.AuditEntry,
    namespace: UDFS,
    subjectTemplate: '{id}.ttl',
  },
)

export type AuditRow = typeof auditTable.$inferSelect
export type AuditInsert = typeof auditTable.$inferInsert
export type AuditUpdate = typeof auditTable.$inferUpdate
