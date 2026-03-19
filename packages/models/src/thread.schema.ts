import { uri, boolean, object, podTable, string, timestamp, id } from '@undefineds.co/drizzle-solid'
import { UDFS, DCTerms, SIOC, MEETING, LINX_CHAT } from './namespaces'

/**
 * Thread schema.
 *
 * CP0 baseline:
 * - Chat is a pure channel/place.
 * - Thread carries execution context needed for collaboration/audit.
 *
 * Storage structure (aligned with xpod):
 * - Thread stored as fragment in Chat's index.ttl
 * - Location: /.data/chat/{chatId}/index.ttl#{id}
 *
 * NOTE: workspace is modeled as a workspace container URI (Pod resource),
 *       and can link to Agent/policy documents via RDF references (not filesystem symlinks).
 */
export const threadTable = podTable(
  'thread',
  {
    id: id('id'),

    // Belongs to chat - used in subjectTemplate path
    chatId: uri('chatId').predicate(SIOC.has_parent).notNull().link(MEETING.LongChat),

    // Display / state
    title: string('title').predicate(DCTerms.title),
    starred: boolean('starred').predicate(UDFS.favorite).default(false),
    status: string('status').predicate(UDFS.status).default('active'),
    metadata: object('metadata').predicate(UDFS.metadata),

    // Execution context: workspace root URI (Pod container or local `linx://` workspace)
    workspace: uri('workspace').predicate(LINX_CHAT.workspace),

    createdAt: timestamp('createdAt').predicate(DCTerms.created).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').predicate(DCTerms.modified).notNull().defaultNow(),
  },
  {
    base: '/.data/chat/',
    sparqlEndpoint: '/.data/chat/-/sparql',
    type: SIOC.Thread,
    namespace: UDFS,
    subjectTemplate: '{chatId}/index.ttl#{id}',
  },
)

export type ThreadRow = typeof threadTable.$inferSelect
export type ThreadInsert = typeof threadTable.$inferInsert
export type ThreadUpdate = typeof threadTable.$inferUpdate
