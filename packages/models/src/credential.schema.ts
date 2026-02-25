import { id, integer, podTable, string, timestamp, uri } from "@undefineds.co/drizzle-solid"
import { XPOD_CREDENTIAL } from "./namespaces"

export const credentialTable = podTable("credential", {
  id: id("id"),
  provider: uri("provider").predicate(XPOD_CREDENTIAL.provider),
  service: string("service").predicate(XPOD_CREDENTIAL.service).notNull().default("ai"),
  status: string("status").predicate(XPOD_CREDENTIAL.status).notNull().default("active"),
  apiKey: string("apiKey").predicate(XPOD_CREDENTIAL.apiKey),
  baseUrl: string("baseUrl").predicate(XPOD_CREDENTIAL.baseUrl),
  label: string("label").predicate(XPOD_CREDENTIAL.label),
  lastUsedAt: timestamp("lastUsedAt").predicate(XPOD_CREDENTIAL.lastUsedAt),
  failCount: integer("failCount").predicate(XPOD_CREDENTIAL.failCount).default(0),
  rateLimitResetAt: timestamp("rateLimitResetAt").predicate(XPOD_CREDENTIAL.rateLimitResetAt),
}, {
  base: "/settings/credentials.ttl",
  type: XPOD_CREDENTIAL.Credential,
  namespace: XPOD_CREDENTIAL,
  subjectTemplate: "#{id}",
})

export type CredentialRow = typeof credentialTable.$inferSelect
export type CredentialInsert = typeof credentialTable.$inferInsert
export type CredentialUpdate = typeof credentialTable.$inferUpdate
