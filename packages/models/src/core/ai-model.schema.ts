import { integer, solidSchema, string, timestamp, uri } from '@undefineds.co/drizzle-solid'
import { DCTerms, RDFS, UDFS } from './namespaces.js'

const aiModelSchema = solidSchema({
  id: string('id').primaryKey(),
  displayName: string('displayName').predicate(RDFS.label),
  modelType: string('modelType').predicate(UDFS.modelType).default('chat'),
  isProvidedBy: uri('isProvidedBy').predicate(UDFS.isProvidedBy),
  dimension: integer('dimension').predicate(UDFS.dimension),
  contextLength: integer('contextLength').predicate(UDFS.contextLength),
  maxOutputTokens: integer('maxOutputTokens').predicate(UDFS.maxOutputTokens),
  status: string('status').predicate(UDFS.status).default('active'),
  createdAt: timestamp('createdAt').predicate(DCTerms.created).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').predicate(DCTerms.modified).notNull().defaultNow(),
}, {
  type: UDFS.Model,
  namespace: UDFS,
})

export const aiModelTable = aiModelSchema.table('aiModel', {
  base: '/settings/ai/models.ttl',
  subjectTemplate: '#{id}',
})

export type AIModelRow = typeof aiModelTable.$inferSelect
export type AIModelInsert = typeof aiModelTable.$inferInsert
export type AIModelUpdate = typeof aiModelTable.$inferUpdate
