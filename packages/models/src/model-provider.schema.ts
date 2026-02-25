import { boolean, object, podTable, string, timestamp, id } from '@undefineds.co/drizzle-solid'
import { UDFS, DCTerms } from './namespaces'

export const modelProviderTable = podTable('modelProviders', {
  id: id('id'),
  enabled: boolean('enabled').predicate(UDFS.status).default(false),
  apiKey: string('apiKey').predicate(UDFS.apiKey), 
  baseUrl: string('baseUrl').predicate(UDFS.baseUrl), 
  models: object('models').array().predicate(UDFS.aiModels),
  updatedAt: timestamp('updatedAt').predicate(DCTerms.modified).notNull().defaultNow(),
}, {
  base: '/.data/model-providers/',
  sparqlEndpoint: '/.data/model-providers/-/sparql',
  type: UDFS.ModelProvider,
  namespace: UDFS,
  subjectTemplate: '{id}.ttl',
})

export type ModelProviderRow = typeof modelProviderTable.$inferSelect
export type ModelProviderInsert = typeof modelProviderTable.$inferInsert
export type ModelProviderUpdate = typeof modelProviderTable.$inferUpdate
