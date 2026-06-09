import {
  aiConfigProviderRef,
  aiConfigModelUri,
  aiConfigProviderUri,
  aiModelResource,
  aiModelTable,
  aiProviderResource,
  aiProviderTable,
  approvalResource,
  approvalTable,
  auditTable,
  buildAIConfigDisconnectPlan,
  buildAIConfigMutationPlan,
  buildAIConfigProviderStateMap,
  credentialResource,
  credentialTable,
  createPodStorage,
  ContactType,
  auditResource,
  agentHomeDirFromResourceId,
  agentResourceId,
  agentResource,
  agentTable,
  applySolidComunicaPatches,
  chatResource,
  chatTable,
  contactTable,
  drizzle,
  eq,
  getAIConfigProviderFamilyIds,
  getAIConfigProviderMetadata,
  getDefaultAIConfigCredentialId,
  getBuiltinModels as getSharedBuiltinModels,
  grantResource,
  grantTable,
  inboxNotificationResource,
  inboxNotificationTable,
  initSolidResources,
  initSolidTables,
  podSchema,
  extractChatIdFromChatRef,
  extractSessionIdFromSessionRef,
  extractThreadIdFromThreadRef,
  solidResources,
  solidSchema,
  messageResource,
  messageTable,
  sessionResource,
  sessionTable,
  normalizeAIConfigProviderId,
  normalizeAIConfigResourceId,
  sameAIConfigProviderFamily,
  selectAIConfigCredential,
  sessionRepository,
  threadResource,
  threadTable,
  type AIConfigModel,
  type AIConfigProviderState,
  type AIModelRow,
  type AIProviderRow,
  type AuditInsert,
  type CredentialRow,
  type ChatInsert,
  type MessageRow,
  type MessageInsert,
  type ModelMetadata,
  type PodStorageValidationResult,
  type SessionInsert,
  type SessionRow,
  type SessionStatus,
  type SessionType,
  type SolidDatabase,
  type ThreadInsert,
  type ThreadRow,
} from '@undefineds.co/models'

interface ResourcePathBuilder {
  buildId(row: Record<string, unknown>): string
  resolveUri(id: string): string
}

function buildResourceSubjectPath(resource: ResourcePathBuilder, row: Record<string, unknown>): string {
  return resource.resolveUri(resource.buildId(row))
}

export function buildApprovalSubjectPath(approvalId: string, createdAt: Date | string | number = new Date()): string {
  return buildResourceSubjectPath(approvalResource as ResourcePathBuilder, { id: approvalId, createdAt })
}

export function buildAuditSubjectPath(auditId: string, createdAt: Date | string | number = new Date()): string {
  return buildResourceSubjectPath(auditResource as ResourcePathBuilder, { id: auditId, createdAt })
}

export function buildGrantSubjectPath(grantId: string): string {
  return buildResourceSubjectPath(grantResource as ResourcePathBuilder, { id: grantId })
}

export function buildSessionResourceId(sessionId: string, createdAt: Date | string | number = new Date()): string {
  return sessionResource.buildId({ id: sessionId, createdAt })
}

export function buildSessionSubjectPath(sessionId: string, createdAt: Date | string | number = new Date()): string {
  return sessionResource.resolveUri(buildSessionResourceId(sessionId, createdAt))
}

export {
  ContactType,
  agentResource,
  agentHomeDirFromResourceId,
  agentResourceId,
  agentTable,
  applySolidComunicaPatches,
  aiConfigModelUri,
  aiConfigProviderRef,
  aiConfigProviderUri,
  aiModelResource,
  aiModelTable,
  aiProviderResource,
  aiProviderTable,
  approvalResource,
  approvalTable,
  auditTable,
  buildAIConfigDisconnectPlan,
  buildAIConfigMutationPlan,
  buildAIConfigProviderStateMap,
  chatResource,
  chatTable,
  contactTable,
  createPodStorage,
  credentialResource,
  credentialTable,
  auditResource,
  drizzle,
  eq,
  getAIConfigProviderFamilyIds,
  getAIConfigProviderMetadata,
  getDefaultAIConfigCredentialId,
  grantResource,
  grantTable,
  inboxNotificationResource,
  inboxNotificationTable,
  extractChatIdFromChatRef,
  extractSessionIdFromSessionRef,
  extractThreadIdFromThreadRef,
  solidSchema,
  solidResources,
  initSolidResources,
  initSolidTables,
  podSchema,
  messageResource,
  messageTable,
  sessionResource,
  sessionTable,
  normalizeAIConfigProviderId,
  normalizeAIConfigResourceId,
  sameAIConfigProviderFamily,
  selectAIConfigCredential,
  sessionRepository,
  threadResource,
  threadTable,
}
export type {
  AIConfigModel,
  AIConfigProviderState,
  AIModelRow,
  AIProviderRow,
  AuditInsert,
  ChatInsert,
  CredentialRow,
  MessageInsert,
  MessageRow,
  ModelMetadata,
  PodStorageValidationResult,
  SessionInsert,
  SessionRow,
  SessionStatus,
  SessionType,
  SolidDatabase,
  ThreadInsert,
  ThreadRow,
}

export function getBuiltinModels(): ModelMetadata[] {
  return getSharedBuiltinModels()
}
