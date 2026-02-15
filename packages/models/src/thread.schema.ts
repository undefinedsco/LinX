import { boolean, id, podTable, string, timestamp, uri } from 'drizzle-solid'
import { DCTerms, LINX_CHAT, MEETING, SIOC, UDFS } from './namespaces'

/**
 * Thread schema.
 *
 * CP0 baseline:
 * - Chat is a pure channel/place.
 * - Thread carries execution context needed for collaboration/audit.
 *
 * NOTE: workspace is modeled as a workspace container URI (Pod resource),
 *       and can link to Agent/policy documents via RDF references (not filesystem symlinks).
 */
export const threadTable = podTable(
  'thread',
  {
    id: id('id'),

    // Belongs to chat
    chatId: uri('chatId').predicate(UDFS.hasThread).inverse().notNull().reference(MEETING.LongChat),

    // Display / state
    title: string('title').predicate(DCTerms.title),
    starred: boolean('starred').predicate(UDFS.favorite).default(false),

    // Execution context: workspace container (Agent@workspace)
    // - New container resource created per workspace
    // - Policy is referenced from Agent/workspace container (no per-thread policy fields in CP0)
    workspace: uri('workspace').predicate(LINX_CHAT.workspace),

    createdAt: timestamp('createdAt').predicate(DCTerms.created).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').predicate(DCTerms.modified).notNull().defaultNow(),
  },
  {
    base: '/.data/threads/',
    sparqlEndpoint: '/.data/threads/-/sparql',
    type: SIOC.Thread,
    namespace: UDFS,
    subjectTemplate: '{id}.ttl',
  },
)

export type ThreadRow = typeof threadTable.$inferSelect
export type ThreadInsert = typeof threadTable.$inferInsert
export type ThreadUpdate = typeof threadTable.$inferUpdate
