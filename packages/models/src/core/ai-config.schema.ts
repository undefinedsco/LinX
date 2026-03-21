import { integer, solidSchema, string, timestamp, uri } from '@undefineds.co/drizzle-solid'
import { aiModelTable } from './ai-model.schema.js'
import { UDFS } from './namespaces.js'

const aiConfigSchema = solidSchema({
  id: string('id').primaryKey(),
  embeddingModel: uri('embeddingModel').predicate(UDFS.embeddingModel).link(aiModelTable),
  previousModel: uri('previousModel').predicate(UDFS.previousModel).link(aiModelTable),
  migrationStatus: string('migrationStatus').predicate(UDFS.migrationStatus),
  migrationProgress: integer('migrationProgress').predicate(UDFS.migrationProgress),
  updatedAt: timestamp('updatedAt').predicate(UDFS.updatedAt),
}, {
  type: UDFS.AIConfig,
  namespace: UDFS,
})

export const aiConfigTable = aiConfigSchema.table('aiConfig', {
  base: '/settings/ai/config.ttl',
  subjectTemplate: '#{id}',
})

export type AIConfigRow = typeof aiConfigTable.$inferSelect
export type AIConfigInsert = typeof aiConfigTable.$inferInsert
export type AIConfigUpdate = typeof aiConfigTable.$inferUpdate
