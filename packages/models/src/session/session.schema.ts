import { extractPodResourceTemplateValue, object, podTable, string, timestamp, uri, id, integer } from '@undefineds.co/drizzle-solid'
import { DCTerms, UDFS } from '../namespaces'
import { chatResource } from '../chat.schema'
import { threadResource } from '../thread.schema'

export type SessionType = 'direct' | 'group' | 'imported-readonly'
export type SessionStatus = 'active' | 'paused' | 'completed' | 'error' | 'archived'

export function buildRuntimeSessionIri(sessionId: string): string {
  return `urn:linx:runtime-session:${sessionId}`
}

export function extractRuntimeSessionId(sessionRef: string | null | undefined): string | null {
  if (!sessionRef) return null
  const runtimeMatch = sessionRef.match(/^urn:linx:runtime-session:(.+)$/)
  if (runtimeMatch?.[1]) return runtimeMatch[1]
  return extractPodResourceTemplateValue(sessionResource, sessionRef)
}

/**
 * Runtime / collaboration session resource.
 *
 * This preserves generic AI product runtime/session lifecycle state.
 * It is intentionally separate from:
 * - UI-only local state (focus, draft text, scroll position, expand/collapse)
 * - transient transport/session-manager internals
 * - the durable conversation timeline, which is Thread
 *
 * Storage structure:
 * - Location: /.data/sessions/{yyyy}/{MM}.ttl#{id}
 * - Primary use: runtime lifecycle projection for a concrete Thread
 *
 * Contract notes:
 * - Chat identifies the counterpart/conversation object.
 * - Thread identifies the concrete conversation timeline/place/run. AI product
 *   runtime sessions map to Thread; this Session resource records lifecycle state
 *   and points to that Thread.
 * - `archived` is a persistence-layer/session-lifecycle status; interactive runtime
 *   surfaces may continue to use the narrower active/paused/completed/error subset
 *   until they explicitly adopt archival semantics.
 * - `tool` is intentionally open-string in this baseline so the durable table does not
 *   prematurely overfit to today's sidecar enum before all writers are aligned.
 */
export const sessionResource = podTable(
  'session',
  {
    id: id('id'),

    ownerWebId: uri('ownerWebId').predicate(UDFS.actor).notNull(),
    chat: uri('chat').predicate(UDFS.conversation).link(chatResource),
    thread: uri('thread').predicate(UDFS.inThread).link(threadResource),

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
    base: '/.data/sessions/',
    sparqlEndpoint: '/.data/sessions/-/sparql',
    type: UDFS.term('Session'),
    namespace: UDFS,
    subjectTemplate: '{yyyy}/{MM}.ttl#{id}',
  },
)

// Compatibility alias. New model code should prefer `sessionResource`.
export const sessionTable = sessionResource

export type SessionRow = typeof sessionResource.$inferSelect
export type SessionInsert = typeof sessionResource.$inferInsert
export type SessionUpdate = typeof sessionResource.$inferUpdate
