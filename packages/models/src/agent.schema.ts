import { podTable, string, integer, timestamp, text, real, uri, id } from "drizzle-solid";
import { LINQ, DCTerms, FOAF, VCARD } from "./namespaces";

export const agentTable = podTable("agent", {
  id: id("id"),
  name: string("name").predicate(FOAF.name).notNull(),
  description: text("description").predicate(DCTerms.description),
  avatarUrl: uri("avatarUrl").predicate(VCARD.hasPhoto),

  instructions: text("instructions").predicate(LINQ.systemMessage),
  provider: string("provider").predicate(LINQ.provider),
  model: string("model").predicate(LINQ.model),
  temperature: real("temperature").predicate(LINQ.temperature).default(0.7),
  tools: text("tools").array().predicate(LINQ.tools),
  contextRound: integer("contextRound").predicate(LINQ.contextRound).default(4),

  ttsModel: string("ttsModel").predicate(LINQ.ttsModel),
  videoModel: string("videoModel").predicate(LINQ.videoModel),

  createdAt: timestamp("createdAt").predicate(DCTerms.created).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").predicate(DCTerms.modified).notNull().defaultNow(),
  deletedAt: timestamp("deletedAt").predicate(LINQ.deletedAt),
}, {
  base: '/.data/agents/',
  sparqlEndpoint: '/.data/agents/-/sparql',
  type: FOAF.Agent,
  namespace: LINQ,
  subjectTemplate: '{id}.ttl',
});

export type AgentRow = typeof agentTable.$inferSelect;
export type AgentInsert = typeof agentTable.$inferInsert;
export type AgentUpdate = typeof agentTable.$inferUpdate;
