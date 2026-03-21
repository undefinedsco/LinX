// ============================================
// 命名空间和词汇表
// ============================================
export {
  // Legacy + Wave A aliases
  LINQ,
  UDFS,
  UDFS_NAMESPACE,
  // Wave A contracts
  LINX_CHAT,
  LINX_MSG,
  // Standard vocabs
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
} from "./namespaces.js";

// Wave A: centralized vocab objects (downstream should prefer these over ad-hoc namespaces)
export * from "./vocab.js";

// ============================================
// 核心业务模型
// ============================================

// Profile - 用户资料
export * from './profile.js'

// Contact - 联系人 (unified index for Solid users, external users, and AI agents)
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
export { contactRepository } from './contact.repository.js'

// Chat & Message - 聊天和消息
export {
  chatTable,
  type ChatMetadata,
  type ChatMemberRole,
  type ChatRow,
  type ChatInsert,
  type ChatUpdate,
} from './chat.schema.js'
export { chatRepository } from './chat.repository.js'

export {
  threadTable,
  type ThreadRow,
  type ThreadInsert,
  type ThreadUpdate,
} from './thread.schema.js'
export { threadRepository } from './thread.repository.js'

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
export { workspaceRepository } from './workspace.repository.js'

export {
  messageTable,
  type MessageRow,
  type MessageInsert,
  type MessageUpdate,
} from './message.schema.js'
export { messageRepository } from './message.repository.js'

// Message Block - 消息块类型系统 (Block-based Message System)
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

// Wave A CP0: collaboration-related richContent block contracts
export {
  type ToolApprovalBlock,
  type ToolCallBlock,
  type TaskProgressBlock,
  type CollaborationRichBlock,
  type ToolRisk,
  type ToolApprovalStatus,
  type ToolCallStatus,
  type TaskProgressStepStatus,
} from "./types/collaboration-blocks.js";

// Wave A CP0: fixtures for downstream parallel development
export * from "./fixtures/contracts-chat-contact.js";

// File - 文件管理
export {
  fileTable,
  type FileRow,
  type FileInsert,
  type FileUpdate,
} from './file.js'

// Favorite - 收藏
export {
  favoriteTable,
  type FavoriteRow,
  type FavoriteInsert,
  type FavoriteUpdate,
  // Starred Sync Hook
  createStarredSyncHook,
  registerDbForStarredSync,
  chatStarredSyncHook,
  threadStarredSyncHook,
  contactStarredSyncHook,
  chatSnapshotExtractor,
  threadSnapshotExtractor,
  contactSnapshotExtractor,
  type SnapshotExtractor,
  type StarredSyncConfig,
  type SourceModule,
} from './favorite.js'

// Settings - 用户设置
export {
  settingsTable,
  SETTING_KEYS,
  type SettingKey,
  type SettingsRow,
  type SettingsInsert,
  type SettingsUpdate,
} from './settings.js'

// Agent - AI 助手配置
export {
  agentTable,
  type AgentRow,
  type AgentInsert,
  type AgentUpdate,
} from './agent.schema.js'
export { agentRepository } from './agent.repository.js'

export {
  DEFAULT_AGENT_PROVIDERS,
  type AgentProviderMetadata,
  type AgentModelOption,
} from './agent.providers.js'

// ============================================
// 其他模型
// ============================================

// Session - 会话管理
export { sessionSchema } from './session.js'

// Approval / Audit / Grant / Inbox Notification
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

// Sidecar vocab + runtime contracts
export { ApprovalVocab, AuditVocab, GrantVocab, InboxNotificationVocab } from './vocab/sidecar.vocab.js'
export * from './sidecar/sidecar-events.js'
export * from './sidecar/persistence-mapping.js'

// Knowledge Folder - 知识库文件夹
export {
  knowledgeFolderSchema,
  type KnowledgeFolderScope
} from './knowledge.js'

// Extension - 扩展
export { extensionSchema } from './extension.js'

// xpod AI schema
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
} from "./credential.schema.js";

export {
  aiProviderTable,
  type AIProviderRow,
  type AIProviderInsert,
  type AIProviderUpdate,
} from "./ai-provider.schema.js";

export {
  aiModelTable,
  type AIModelRow,
  type AIModelInsert,
  type AIModelUpdate,
} from "./ai-model.schema.js";

export {
  aiConfigModelUri,
  aiConfigProviderUri,
  buildAIConfigMutationPlan,
  buildAIConfigProviderStateMap,
  extractAIConfigProviderId,
  extractAIConfigResourceId,
  getAIConfigDefaultBaseUrl,
  getAIConfigProviderCatalog,
  getAIConfigProviderMetadata,
  getDefaultAIConfigCredentialId,
  sameAIConfigProviderId,
  type AIConfigModel,
  type AIConfigMutationPlan,
  type AIConfigProviderCatalogEntry,
  type AIConfigProviderState,
  type AIConfigUpdate,
  type BuildAIConfigProviderStateMapOptions,
} from './ai-config.js'

export {
  createRepositoryDescriptor,
  deleteExactRecord,
  definePodRepository,
  findExactRecord,
  isIriLikeIdentifier,
  resolveRowId,
  stripEntityIdentifiers,
  updateExactRecord,
  type PodRepositoryDescriptor,
  type RepositoryCacheOptions,
  type RepositoryInvalidations,
  type RepositoryScope,
  type SolidDatabase,
} from './repository.js'

// Import Job - 导入任务
export { importJobSchema } from './import.js'

// ============================================
// 数据库操作符 (统一出口)
// ============================================
export { eq, ne, and, or, drizzle } from '@undefineds.co/drizzle-solid'

// ============================================
// Schema registry
// ============================================
export { linxSchema } from './schema.js'

// ============================================
// Discovery Service (发现服务)
// ============================================
export * from './discovery.js'
