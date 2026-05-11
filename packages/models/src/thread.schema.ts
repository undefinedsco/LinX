import { uri, boolean, object, podTable, string, timestamp, id } from '@undefineds.co/drizzle-solid'
import { UDFS, DCTerms, SIOC, LINX_CHAT } from './namespaces'
import { chatResource } from './chat.schema'

/**
 * Thread resource.
 *
 * Product semantics:
 * - Thread is the concrete conversation timeline/place under a Chat.
 * - AI product runtime sessions map to Thread when they represent a concrete
 *   conversation timeline/place/run.
 * - Thread carries workspace/runtime/place metadata. Chat only identifies the
 *   counterpart/conversation object.
 * - Product/runtime-specific ids should stay in metadata as `runtimeSessionId`,
 *   `runtime`, `surface`, etc. Do not name the generic thread id `piSessionId`.
 *
 * Storage structure (aligned with xpod):
 * - Thread stored as fragment in Chat's index.ttl
 * - Location: /.data/chat/{chat|id}/index.ttl#{id}
 *
 * NOTE:
 * - `thread.workspace` is a storage-layer reference (URI) to a container/resource in CSS/Pod.
 * - It is NOT the same thing as the runtime create API payload `workspace: { path, copy }`.
 * - Runtime path/copy is an execution-time interface shape; persistence should keep the
 *   container URI here and store portable metadata with that container/resource.
 */
export const threadResource = podTable(
  'thread',
  {
    id: id('id'),

    // Belongs to chat/counterpart. Stored as an RDF URI; short ids are resolved via chatResource's URI template by the ORM.
    chat: uri('chat').predicate(SIOC.has_parent).notNull().link(chatResource),

    // Display / state
    title: string('title').predicate(DCTerms.title),
    starred: boolean('starred').predicate(UDFS.favorite).default(false),

    // Storage-layer execution context reference: container/resource URI
    workspace: uri('workspace').predicate(LINX_CHAT.workspace),

    // Generic execution metadata shared by CLI/App runtimes.
    metadata: object('metadata').predicate(UDFS.metadata),


    createdAt: timestamp('createdAt').predicate(DCTerms.created).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').predicate(DCTerms.modified).notNull().defaultNow(),
  },
  {
    base: '/.data/chat/',
    sparqlEndpoint: '/.data/chat/-/sparql',
    type: SIOC.Thread,
    namespace: UDFS,
    subjectTemplate: '{chat|id}/index.ttl#{id}',
  },
)

// Compatibility alias. New model code should prefer `threadResource`.
export const threadTable = threadResource

export type ThreadRow = typeof threadResource.$inferSelect
export type ThreadInsert = typeof threadResource.$inferInsert
export type ThreadUpdate = typeof threadResource.$inferUpdate
