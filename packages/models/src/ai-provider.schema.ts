import { id, podTable, string, uri } from "@undefineds.co/drizzle-solid"
import { XPOD_AI } from "./namespaces"

export const aiProviderTable = podTable("aiProvider", {
  id: id("id"),
  baseUrl: string("baseUrl").predicate(XPOD_AI.baseUrl),
  proxyUrl: string("proxyUrl").predicate(XPOD_AI.proxyUrl),
  hasModel: uri("hasModel").predicate(XPOD_AI.hasModel),
}, {
  base: "/settings/ai/providers.ttl",
  type: XPOD_AI.Provider,
  namespace: XPOD_AI,
  subjectTemplate: "#{id}",
})

export type AIProviderRow = typeof aiProviderTable.$inferSelect
export type AIProviderInsert = typeof aiProviderTable.$inferInsert
export type AIProviderUpdate = typeof aiProviderTable.$inferUpdate
