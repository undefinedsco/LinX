import { integer, solidSchema, string, timestamp, uri } from '@undefineds.co/drizzle-solid'
import { RDFS, UDFS } from './namespaces.js'

const credentialSchema = solidSchema({
  id: string('id').primaryKey(),
  provider: uri('provider').predicate(UDFS.provider),
  service: string('service').predicate(UDFS.service).notNull().default('ai'),
  status: string('status').predicate(UDFS.status).notNull().default('active'),
  label: string('label').predicate(RDFS.label),
  lastUsedAt: timestamp('lastUsedAt').predicate(UDFS.lastUsedAt),
  failCount: integer('failCount').predicate(UDFS.failCount).default(0),
  rateLimitResetAt: timestamp('rateLimitResetAt').predicate(UDFS.rateLimitResetAt),
  baseUrl: string('baseUrl').predicate(UDFS.baseUrl),
  proxyUrl: string('proxyUrl').predicate(UDFS.proxyUrl),
  projectId: string('projectId').predicate(UDFS.projectId),
  organizationId: string('organizationId').predicate(UDFS.organizationId),
}, {
  type: UDFS.Credential,
  namespace: UDFS,
})

const apiKeyCredentialSchema = credentialSchema.extend({
  apiKey: string('apiKey').predicate(UDFS.apiKey),
}, {
  type: UDFS.ApiKeyCredential,
})

const oauthCredentialSchema = credentialSchema.extend({
  oauthRefreshToken: string('oauthRefreshToken').predicate(UDFS.oauthRefreshToken),
  oauthAccessToken: string('oauthAccessToken').predicate(UDFS.oauthAccessToken),
  oauthExpiresAt: timestamp('oauthExpiresAt').predicate(UDFS.oauthExpiresAt),
}, {
  type: UDFS.OAuthCredential,
})

export const apiKeyCredentialTable = apiKeyCredentialSchema.table('apiKeyCredential', {
  base: '/settings/credentials.ttl',
  subjectTemplate: '#{id}',
})

export const oauthCredentialTable = oauthCredentialSchema.table('oauthCredential', {
  base: '/settings/credentials.ttl',
  subjectTemplate: '#{id}',
})

export const credentialTable = apiKeyCredentialTable

export type CredentialRow = typeof credentialTable.$inferSelect
export type CredentialInsert = typeof credentialTable.$inferInsert
export type CredentialUpdate = typeof credentialTable.$inferUpdate

export type ApiKeyCredentialRow = typeof apiKeyCredentialTable.$inferSelect
export type ApiKeyCredentialInsert = typeof apiKeyCredentialTable.$inferInsert
export type ApiKeyCredentialUpdate = typeof apiKeyCredentialTable.$inferUpdate

export type OAuthCredentialRow = typeof oauthCredentialTable.$inferSelect
export type OAuthCredentialInsert = typeof oauthCredentialTable.$inferInsert
export type OAuthCredentialUpdate = typeof oauthCredentialTable.$inferUpdate
