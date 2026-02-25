import { podTable, string, integer, timestamp, text, real, uri, id } from "@undefineds.co/drizzle-solid";
import { UDFS, DCTerms, FOAF, VCARD } from "./namespaces";

export const agentTable = podTable("agent", {
  id: id("id"),
  name: string("name").predicate(FOAF.name).notNull(),
  description: text("description").predicate(DCTerms.description),
  avatarUrl: uri("avatarUrl").predicate(VCARD.hasPhoto),

  instructions: text("instructions").predicate(UDFS.systemMessage),
  provider: string("provider").predicate(UDFS.provider),
  model: string("model").predicate(UDFS.model),
  temperature: real("temperature").predicate(UDFS.temperature).default(0.7),
  tools: text("tools").array().predicate(UDFS.tools),
  contextRound: integer("contextRound").predicate(UDFS.contextRound).default(4),

  ttsModel: string("ttsModel").predicate(UDFS.ttsModel),
  videoModel: string("videoModel").predicate(UDFS.videoModel),

  createdAt: timestamp("createdAt").predicate(DCTerms.created).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").predicate(DCTerms.modified).notNull().defaultNow(),
  deletedAt: timestamp("deletedAt").predicate(UDFS.deletedAt),
}, {
  base: '/.data/agents/',
  sparqlEndpoint: '/.data/agents/-/sparql',
  type: FOAF.Agent,
  namespace: UDFS,
  subjectTemplate: '{id}.ttl',
});

export type AgentRow = typeof agentTable.$inferSelect;
export type AgentInsert = typeof agentTable.$inferInsert;
export type AgentUpdate = typeof agentTable.$inferUpdate;
