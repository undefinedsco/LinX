import { podTable, uri, string, text, timestamp, id } from '@undefineds.co/drizzle-solid'
import { UDFS, DCTerms } from './namespaces'

// Append-only audit entry resource (separate from Solid inbox notifications).
// Audit entries are independent events; session/chat/thread are optional relations,
// not storage ownership boundaries.
export const auditResource = podTable(
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
    base: '/.data/audits/',
    sparqlEndpoint: '/.data/audits/-/sparql',
    type: UDFS.AuditEntry,
    namespace: UDFS,
    subjectTemplate: '{yyyy}/{MM}/{dd}.ttl#{id}',
  },
)

export function buildAuditSubjectPath(auditId: string, createdAt: Date | string | number = new Date()): string {
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt)
  const safeDate = Number.isFinite(date.getTime()) ? date : new Date()
  const yyyy = String(safeDate.getUTCFullYear())
  const mm = String(safeDate.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(safeDate.getUTCDate()).padStart(2, '0')
  return `/.data/audits/${yyyy}/${mm}/${dd}.ttl#${encodeURIComponent(auditId)}`
}

// Compatibility alias. New model code should prefer `auditResource`.
export const auditTable = auditResource

export type AuditRow = typeof auditResource.$inferSelect
export type AuditInsert = typeof auditResource.$inferInsert
export type AuditUpdate = typeof auditResource.$inferUpdate
