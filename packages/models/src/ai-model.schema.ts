import { id, integer, podTable, string, timestamp, uri } from "@undefineds.co/drizzle-solid"
import { aiProviderTable } from "./ai-provider.schema"
import { XPOD_AI } from "./namespaces"

export const aiModelTable = podTable("aiModel", {
  id: id("id"),
  displayName: string("displayName").predicate(XPOD_AI.displayName),
  modelType: string("modelType").predicate(XPOD_AI.modelType).default("chat"),
  isProvidedBy: uri("isProvidedBy").predicate(XPOD_AI.isProvidedBy).link(aiProviderTable),
  dimension: integer("dimension").predicate(XPOD_AI.dimension),
  status: string("status").predicate(XPOD_AI.status).default("active"),
  createdAt: timestamp("createdAt").predicate(XPOD_AI.createdAt).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").predicate(XPOD_AI.updatedAt).notNull().defaultNow(),
}, {
  base: "/settings/ai/models/",
  type: XPOD_AI.Model,
  namespace: XPOD_AI,
  subjectTemplate: "{isProvidedBy|id}.ttl#{id}",
})

export type AIModelRow = typeof aiModelTable.$inferSelect
export type AIModelInsert = typeof aiModelTable.$inferInsert
export type AIModelUpdate = typeof aiModelTable.$inferUpdate
