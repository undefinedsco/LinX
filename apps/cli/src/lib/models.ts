import {
  DCTerms,
  RDFS,
  UDFS,
  XPOD_AI,
  XPOD_CREDENTIAL,
  aiConfigModelUri,
  aiConfigProviderUri,
  aiModelTable,
  aiProviderTable,
  buildAIConfigMutationPlan,
  buildAIConfigProviderStateMap,
  credentialTable,
  ContactType,
  agentTable,
  chatTable,
  contactTable,
  drizzle,
  eq,
  getAIConfigProviderFamilyIds,
  getAIConfigProviderMetadata,
  getDefaultAIConfigCredentialId,
  getBuiltinModels as getSharedBuiltinModels,
  findPodRowByStorageId,
  initSolidTables,
  whereByPodStorageId,
  solidSchema,
  messageTable,
  normalizeAIConfigProviderId,
  normalizeAIConfigResourceId,
  sameAIConfigProviderFamily,
  sessionRepository,
  sessionTable,
  threadTable,
  type AIConfigModel,
  type AIConfigProviderState,
  type AIModelRow,
  type AIProviderRow,
  type CredentialRow,
  type ChatInsert,
  type MessageRow,
  type MessageInsert,
  type ModelMetadata,
  type SessionInsert,
  type SessionRow,
  type SessionStatus,
  type SessionType,
  type SolidDatabase,
  type ThreadInsert,
  type ThreadRow,
} from '@undefineds.co/models'
import {
  buildWatchThreadMetadata,
  buildWatchTranscriptMessages,
  type WatchEventLogEntry,
  type WatchSessionRecord,
} from '@linx/client/watch'

const schema = solidSchema
const extractAIConfigProviderId = normalizeAIConfigProviderId
const extractAIConfigResourceId = normalizeAIConfigResourceId
const sameAIConfigProviderId = sameAIConfigProviderFamily

async function findExactRecord<T>(
  db: SolidDatabase,
  table: unknown,
  id: string,
): Promise<T | null> {
  const rows = await db.select().from(table as any).execute()
  return (rows.find((row: any) => row?.id === id) as T | undefined) ?? null
}

async function updateExactRecord(
  db: SolidDatabase,
  table: unknown,
  current: Record<string, unknown> | string,
  updates: Record<string, unknown>,
): Promise<void> {
  const iri = typeof current === 'string'
    ? current
    : typeof current['@id'] === 'string'
      ? current['@id']
      : typeof current.subject === 'string'
        ? current.subject
        : undefined

  const query = db.update(table as any).set(updates)
  if (iri && typeof (query as any).whereByIri === 'function') {
    await (query as any).whereByIri(iri).execute()
    return
  }

  const id = typeof current === 'string' ? current : current.id
  await (query as any).where({ id }).execute()
}

export {
  DCTerms,
  ContactType,
  RDFS,
  UDFS,
  XPOD_AI,
  XPOD_CREDENTIAL,
  agentTable,
  aiConfigModelUri,
  aiConfigProviderUri,
  aiModelTable,
  aiProviderTable,
  buildAIConfigMutationPlan,
  buildAIConfigProviderStateMap,
  buildWatchThreadMetadata,
  buildWatchTranscriptMessages,
  chatTable,
  contactTable,
  credentialTable,
  drizzle,
  eq,
  extractAIConfigProviderId,
  extractAIConfigResourceId,
  findExactRecord,
  findPodRowByStorageId,
  getAIConfigProviderFamilyIds,
  getAIConfigProviderMetadata,
  getDefaultAIConfigCredentialId,
  initSolidTables,
  messageTable,
  normalizeAIConfigProviderId,
  normalizeAIConfigResourceId,
  sameAIConfigProviderFamily,
  sameAIConfigProviderId,
  schema,
  sessionRepository,
  sessionTable,
  solidSchema,
  threadTable,
  updateExactRecord,
  whereByPodStorageId,
}
export type {
  AIConfigModel,
  AIConfigProviderState,
  AIModelRow,
  AIProviderRow,
  ChatInsert,
  CredentialRow,
  MessageInsert,
  MessageRow,
  ModelMetadata,
  SessionInsert,
  SessionRow,
  SessionStatus,
  SessionType,
  SolidDatabase,
  ThreadInsert,
  ThreadRow,
  WatchEventLogEntry,
  WatchSessionRecord,
}

export function getBuiltinModels(): ModelMetadata[] {
  return getSharedBuiltinModels()
}
