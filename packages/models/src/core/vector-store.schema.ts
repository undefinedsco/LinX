import { integer, solidSchema, string, timestamp, uri } from '@undefineds.co/drizzle-solid'
import { UDFS } from './namespaces.js'

const vectorStoreSchema = solidSchema({
  id: string('id').primaryKey(),
  name: string('name').predicate(UDFS.name),
  container: uri('container').predicate(UDFS.container),
  chunkingStrategy: string('chunkingStrategy').predicate(UDFS.chunkingStrategy),
  status: string('status').predicate(UDFS.status),
  createdAt: timestamp('createdAt').predicate(UDFS.createdAt),
  lastActiveAt: timestamp('lastActiveAt').predicate(UDFS.lastActiveAt),
}, {
  type: UDFS.VectorStore,
  namespace: UDFS,
})

const indexedFileSchema = solidSchema({
  id: string('id').primaryKey(),
  fileUrl: uri('fileUrl').predicate(UDFS.fileUrl),
  vectorId: integer('vectorId').predicate(UDFS.vectorId),
  chunkingStrategy: string('chunkingStrategy').predicate(UDFS.chunkingStrategy),
  status: string('status').predicate(UDFS.status),
  usageBytes: integer('usageBytes').predicate(UDFS.usageBytes),
  lastError: string('lastError').predicate(UDFS.lastError),
  indexedAt: timestamp('indexedAt').predicate(UDFS.indexedAt),
}, {
  type: UDFS.IndexedFile,
  namespace: UDFS,
})

export const vectorStoreTable = vectorStoreSchema.table('vectorStore', {
  base: '/settings/ai/vector-stores.ttl',
  subjectTemplate: '#{id}',
})

export const indexedFileTable = indexedFileSchema.table('indexedFile', {
  base: '/settings/ai/indexed-files.ttl',
  subjectTemplate: '#{id}',
})

export type VectorStoreRow = typeof vectorStoreTable.$inferSelect
export type VectorStoreInsert = typeof vectorStoreTable.$inferInsert
export type VectorStoreUpdate = typeof vectorStoreTable.$inferUpdate

export type IndexedFileRow = typeof indexedFileTable.$inferSelect
export type IndexedFileInsert = typeof indexedFileTable.$inferInsert
export type IndexedFileUpdate = typeof indexedFileTable.$inferUpdate
