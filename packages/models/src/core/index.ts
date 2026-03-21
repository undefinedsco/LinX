// Pure Pod contracts only.
// This is the shared Pod-contract package for LinX / xpod consumers.

export {
  LINQ,
  UDFS,
  UDFS_NAMESPACE,
  LINX_CHAT,
  LINX_MSG,
  SIOC,
  DCTerms,
  SCHEMA,
  RDF,
  RDFS,
  ACL,
  ODRL,
  OWL,
  FOAF,
  MEETING,
  AS,
  VCARD,
  WF,
  LDP,
} from './namespaces.js'

export * from './vocab.js'

export * from './profile.js'

export {
  contactTable,
  ContactClass,
  ContactType,
  isAgentContact,
  isGroupContact,
  type ContactRow,
  type ContactInsert,
  type ContactUpdate,
  type ContactClassValue,
  type ContactTypeValue,
} from './contact.schema.js'

export {
  chatTable,
  type ChatMetadata,
  type ChatMemberRole,
  type ChatRow,
  type ChatInsert,
  type ChatUpdate,
} from './chat.schema.js'

export {
  threadTable,
  type ThreadRow,
  type ThreadInsert,
  type ThreadUpdate,
} from './thread.schema.js'

export {
  workspaceTable,
  WORKSPACE_TYPES,
  WORKSPACE_KINDS,
  getWorkspaceContainerPath,
  resolveWorkspaceContainerUri,
  parseWorkspaceIdFromContainerUri,
  normalizeLocalWorkspacePath,
  buildLocalWorkspaceUri,
  parseLocalWorkspaceUri,
  isLocalWorkspaceUri,
  type WorkspaceType,
  type WorkspaceKind,
  type WorkspaceRow,
  type WorkspaceInsert,
  type WorkspaceUpdate,
} from './workspace.schema.js'

export {
  messageTable,
  type MessageRow,
  type MessageInsert,
  type MessageUpdate,
} from './message.schema.js'

export {
  MessageBlockType,
  MessageBlockStatus,
  type BaseMessageBlock,
  type PlaceholderMessageBlock,
  type MainTextMessageBlock,
  type ThinkingMessageBlock,
  type ImageMessageBlock,
  type CodeMessageBlock,
  type ToolMessageBlock,
  type FileMessageBlock,
  type ErrorMessageBlock,
  type CitationMessageBlock,
  type MessageBlock,
  type MessageRichContent,
  createMessageBlock,
  isBlockType,
  parseMessageBlocks,
  serializeMessageBlocks,
} from './types/message-block.js'

export {
  type ToolApprovalBlock,
  type ToolCallBlock,
  type TaskProgressBlock,
  type CollaborationRichBlock,
  type ToolRisk,
  type ToolApprovalStatus,
  type ToolCallStatus,
  type TaskProgressStepStatus,
} from './types/collaboration-blocks.js'

export { fileTable, type FileRow, type FileInsert, type FileUpdate } from './file.js'

export {
  favoriteTable,
  type FavoriteRow,
  type FavoriteInsert,
  type FavoriteUpdate,
} from './favorite/favorite.schema.js'

export {
  settingsTable,
  SETTING_KEYS,
  type SettingKey,
  type SettingsRow,
  type SettingsInsert,
  type SettingsUpdate,
} from './settings.js'

export {
  createAgentSchema,
  agentSchema,
  agentTable,
  type AgentRow,
  type AgentInsert,
  type AgentUpdate,
  type CreateAgentSchemaOptions,
} from './agent.schema.js'

export {
  approvalTable,
  type ApprovalRow,
  type ApprovalInsert,
  type ApprovalUpdate,
} from './approval.schema.js'

export {
  auditTable,
  type AuditRow,
  type AuditInsert,
  type AuditUpdate,
} from './audit.schema.js'

export {
  grantTable,
  type GrantRow,
  type GrantInsert,
  type GrantUpdate,
} from './grant.schema.js'

export {
  inboxNotificationTable,
  type InboxNotificationRow,
  type InboxNotificationInsert,
  type InboxNotificationUpdate,
} from './inbox-notification.schema.js'

export { ApprovalVocab, AuditVocab, GrantVocab, InboxNotificationVocab } from './vocab/sidecar.vocab.js'

export {
  knowledgeFolderSchema,
  type KnowledgeFolderScope,
} from './knowledge.js'

export { extensionSchema } from './extension.js'

export { sessionSchema } from './session.js'

export { importJobSchema } from './import.js'

export {
  credentialTable,
  apiKeyCredentialTable,
  oauthCredentialTable,
  type CredentialRow,
  type CredentialInsert,
  type CredentialUpdate,
  type ApiKeyCredentialRow,
  type ApiKeyCredentialInsert,
  type ApiKeyCredentialUpdate,
  type OAuthCredentialRow,
  type OAuthCredentialInsert,
  type OAuthCredentialUpdate,
} from './credential.schema.js'

export {
  aiProviderTable,
  aiProviderRelations,
  type AIProviderRow,
  type AIProviderInsert,
  type AIProviderUpdate,
} from './ai-provider.schema.js'

export {
  aiModelTable,
  type AIModelRow,
  type AIModelInsert,
  type AIModelUpdate,
} from './ai-model.schema.js'

export {
  aiConfigTable,
  type AIConfigRow,
  type AIConfigInsert,
  type AIConfigUpdate,
} from './ai-config.schema.js'

export {
  vectorStoreTable,
  indexedFileTable,
  type VectorStoreRow,
  type VectorStoreInsert,
  type VectorStoreUpdate,
  type IndexedFileRow,
  type IndexedFileInsert,
  type IndexedFileUpdate,
} from './vector-store.schema.js'

export {
  agentProviderTable,
  agentProviderRelations,
  type AgentProviderRow,
  type AgentProviderInsert,
  type AgentProviderUpdate,
} from './agent-provider.schema.js'

export {
  agentStatusTable,
  type AgentStatusRow,
  type AgentStatusInsert,
  type AgentStatusUpdate,
} from './agent-status.schema.js'

export { linxSchema } from './schema.js'
