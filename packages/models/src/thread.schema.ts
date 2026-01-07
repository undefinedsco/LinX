import { uri, boolean, podTable, string, timestamp, id } from 'drizzle-solid'
import { LINQ, DCTerms, SIOC, MEETING } from './namespaces'

export const threadTable = podTable(
  'thread',
  {
    id: id('id'),
    chatId: uri('chatId').predicate(LINQ.hasThread).inverse().notNull().reference(MEETING.LongChat),
    title: string('title').predicate(DCTerms.title),
    starred: boolean('starred').predicate(LINQ.favorite).default(false),
    createdAt: timestamp('createdAt').predicate(DCTerms.created).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').predicate(DCTerms.modified).notNull().defaultNow(),
  },
  {
    base: '/.data/threads/',
    sparqlEndpoint: '/.data/threads/-/sparql',
    type: SIOC.Thread,
    namespace: LINQ,
    subjectTemplate: '{id}.ttl',
  },
)

export type ThreadRow = typeof threadTable.$inferSelect
export type ThreadInsert = typeof threadTable.$inferInsert
export type ThreadUpdate = typeof threadTable.$inferUpdate
