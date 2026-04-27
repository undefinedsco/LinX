import { object, podTable, string, timestamp, uri, id, integer } from '@undefineds.co/drizzle-solid'
import { DCTerms, UDFS } from '../namespaces'

export type SessionType = 'direct' | 'group' | 'imported-readonly'
export type SessionStatus = 'active' | 'paused' | 'completed' | 'error' | 'archived'

/**
 * Runtime / collaboration session schema.
 *
 * This is the durable session truth layer for Pi/xpod-aligned runtime state.
 * It is intentionally separate from:
 * - UI-only local state (focus, draft text, scroll position, expand/collapse)
 * - transient transport/session-manager internals
 *
 * Storage structure:
 * - Location: /.data/session/{id}.ttl
 * - Primary use: durable cross-app session state / lifecycle projection
 *
 * Contract notes for this baseline:
 * - `archived` is a persistence-layer/session-lifecycle status; interactive runtime
 *   surfaces may continue to use the narrower active/paused/completed/error subset
 *   until they explicitly adopt archival semantics.
 * - `chatId` and `threadId` are intentionally stored as opaque string references for
 *   now. This keeps the initial session baseline decoupled from any single runtime or
 *   RDF-linking strategy while the writer/reader contract is still being designed.
 * - `tool` is intentionally open-string in this baseline so the durable table does not
 *   prematurely overfit to today's sidecar enum before all writers are aligned.
 */
export const sessionTable = podTable(
  'session',
  {
    id: id('id'),

    ownerWebId: uri('ownerWebId').predicate(UDFS.actor).notNull(),
    chatId: string('chatId').predicate(UDFS.conversation),
    threadId: string('threadId').predicate(UDFS.inThread),

    sessionType: string('sessionType').predicate(UDFS.conversationType).notNull().default('direct'),
    status: string('status').predicate(UDFS.sessionStatus).notNull().default('active'),
    tool: string('tool').predicate(UDFS.sessionTool),
    tokenUsage: integer('tokenUsage').predicate(UDFS.tokenUsage).default(0),

    policy: uri('policy').predicate(UDFS.policy),
    policyVersion: string('policyVersion').predicate(UDFS.policyVersion),

    metadata: object('metadata').predicate(UDFS.metadata),

    createdAt: timestamp('createdAt').predicate(DCTerms.created).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').predicate(DCTerms.modified).notNull().defaultNow(),
    archivedAt: timestamp('archivedAt').predicate(UDFS.archivedAt),
  },
  {
    base: '/.data/session/',
    sparqlEndpoint: '/.data/session/-/sparql',
    type: UDFS.term('Session'),
    namespace: UDFS,
    subjectTemplate: '{id}.ttl',
  },
)

export type SessionRow = typeof sessionTable.$inferSelect
export type SessionInsert = typeof sessionTable.$inferInsert
export type SessionUpdate = typeof sessionTable.$inferUpdate
