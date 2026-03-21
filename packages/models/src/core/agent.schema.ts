import { integer, real, solidSchema, string, text, timestamp, uri } from '@undefineds.co/drizzle-solid'
import { DCTerms, FOAF, UDFS, VCARD } from './namespaces.js'
import { aiModelTable } from './ai-model.schema.js'
import { credentialTable } from './credential.schema.js'

export interface CreateAgentSchemaOptions {
  nameRequired?: boolean
}

export function createAgentSchema(options: CreateAgentSchemaOptions = {}) {
  const nameColumn = string('name').predicate(FOAF.name)

  return solidSchema({
    id: string('id').primaryKey(),
    name: options.nameRequired === false ? nameColumn : nameColumn.notNull(),
    description: text('description').predicate(DCTerms.description),
    avatarUrl: uri('avatarUrl').predicate(VCARD.hasPhoto),
    instructions: text('instructions').predicate(UDFS.systemPrompt),
    provider: uri('provider').predicate(UDFS.provider),
    runtimeKind: string('runtimeKind').predicate(UDFS.runtimeKind),
    credential: uri('credential').predicate(UDFS.credential).link(credentialTable),
    model: uri('model').predicate(UDFS.model).link(aiModelTable),
    enabled: string('enabled').predicate(UDFS.enabled).default('true'),
    temperature: real('temperature').predicate(UDFS.temperature).default(0.7),
    tools: text('tools').array().predicate(UDFS.tools),
    contextRound: integer('contextRound').predicate(UDFS.contextRound).default(4),
    maxTurns: integer('maxTurns').predicate(UDFS.maxTurns),
    timeout: integer('timeout').predicate(UDFS.timeout),
    ttsModel: uri('ttsModel').predicate(UDFS.ttsModel).link(aiModelTable),
    videoModel: uri('videoModel').predicate(UDFS.videoModel).link(aiModelTable),
    createdAt: timestamp('createdAt').predicate(DCTerms.created).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').predicate(DCTerms.modified).notNull().defaultNow(),
    deletedAt: timestamp('deletedAt').predicate(UDFS.deletedAt),
  }, {
    type: UDFS.AgentConfig,
    namespace: UDFS,
  })
}

export const agentSchema = createAgentSchema()

export const agentTable = agentSchema.table('agent', {
  base: '/.data/agents/',
  sparqlEndpoint: '/.data/agents/-/sparql',
  subjectTemplate: '{id}.ttl',
})

export type AgentRow = typeof agentTable.$inferSelect
export type AgentInsert = typeof agentTable.$inferInsert
export type AgentUpdate = typeof agentTable.$inferUpdate
