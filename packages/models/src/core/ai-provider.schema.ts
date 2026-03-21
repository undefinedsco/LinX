import { relations, solidSchema, string, uri } from '@undefineds.co/drizzle-solid'
import { aiModelTable } from './ai-model.schema.js'
import { RDFS, UDFS } from './namespaces.js'

const aiProviderSchema = solidSchema({
  id: string('id').primaryKey(),
  displayName: string('displayName').predicate(RDFS.label),
  baseUrl: string('baseUrl').predicate(UDFS.baseUrl),
  proxyUrl: string('proxyUrl').predicate(UDFS.proxyUrl),
  projectId: string('projectId').predicate(UDFS.projectId),
  organizationId: string('organizationId').predicate(UDFS.organizationId),
  hasModel: uri('hasModel').predicate(UDFS.hasModel),
  defaultModel: uri('defaultModel').predicate(UDFS.defaultModel).link(aiModelTable),
  hasCredential: uri('hasCredential').predicate(UDFS.hasCredential),
  enabled: string('enabled').predicate(UDFS.enabled).default('true'),
}, {
  type: UDFS.Provider,
  namespace: UDFS,
})

export const aiProviderTable = aiProviderSchema.table('aiProvider', {
  base: '/settings/ai/providers.ttl',
  subjectTemplate: '#{id}',
})

export const aiProviderRelations = relations(aiProviderTable, ({ one }) => ({
  model: one(aiModelTable, {
    fields: [aiProviderTable.defaultModel],
    references: [aiModelTable.id as any],
  }),
}))

export type AIProviderRow = typeof aiProviderTable.$inferSelect
export type AIProviderInsert = typeof aiProviderTable.$inferInsert
export type AIProviderUpdate = typeof aiProviderTable.$inferUpdate
