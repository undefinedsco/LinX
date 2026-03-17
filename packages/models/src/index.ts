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
  // xpod vocabs
  XPOD_CREDENTIAL,
  XPOD_AI,
} from "./namespaces";

// Wave A: centralized vocab objects (downstream should prefer these over ad-hoc namespaces)
export * from "./vocab";

// ============================================
// 核心业务模型
// ============================================

// Profile - 用户资料
export * from './profile'

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
} from './contact.schema'
export { contactRepository } from './contact.repository'

// Chat & Message - 聊天和消息
export {
  chatTable,
  type ChatMetadata,
  type ChatMemberRole,
  type ChatRow,
  type ChatInsert,
  type ChatUpdate,
} from './chat.schema'
export { chatRepository } from './chat.repository'

export {
  threadTable,
  type ThreadRow,
  type ThreadInsert,
  type ThreadUpdate,
} from './thread.schema'
export { threadRepository } from './thread.repository'

export {
  messageTable,
  type MessageRow,
  type MessageInsert,
  type MessageUpdate,
} from './message.schema'
export { messageRepository } from './message.repository'

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
} from './types/message-block'

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
} from "./types/collaboration-blocks";

// Wave A CP0: fixtures for downstream parallel development
export * from "./fixtures/contracts-chat-contact";

// File - 文件管理
export {
  fileTable,
  type FileRow,
  type FileInsert,
  type FileUpdate,
} from './file'

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
} from './favorite'

// Settings - 用户设置
export {
  settingsTable,
  SETTING_KEYS,
  type SettingKey,
  type SettingsRow,
  type SettingsInsert,
  type SettingsUpdate,
} from './settings'

// Agent - AI 助手配置
export {
  agentTable,
  type AgentRow,
  type AgentInsert,
  type AgentUpdate,
} from './agent.schema'
export { agentRepository } from './agent.repository'

export {
  DEFAULT_AGENT_PROVIDERS,
  type AgentProviderMetadata,
  type AgentModelOption,
} from './agent.providers'

// ============================================
// 其他模型
// ============================================

// Session - 会话管理
export { sessionSchema } from './session'

// Approval / Audit / Grant / Inbox Notification
export {
  approvalTable,
  type ApprovalRow,
  type ApprovalInsert,
  type ApprovalUpdate,
} from './approval.schema'

export {
  auditTable,
  type AuditRow,
  type AuditInsert,
  type AuditUpdate,
} from './audit.schema'

export {
  grantTable,
  type GrantRow,
  type GrantInsert,
  type GrantUpdate,
} from './grant.schema'

export {
  inboxNotificationTable,
  type InboxNotificationRow,
  type InboxNotificationInsert,
  type InboxNotificationUpdate,
} from './inbox-notification.schema'

// Sidecar vocab + runtime contracts
export { ApprovalVocab, AuditVocab, GrantVocab, InboxNotificationVocab } from './vocab/sidecar.vocab'
export * from './sidecar/sidecar-events'
export * from './sidecar/persistence-mapping'

// Knowledge Folder - 知识库文件夹
export {
  knowledgeFolderSchema,
  type KnowledgeFolderScope
} from './knowledge'

// Extension - 扩展
export { extensionSchema } from './extension'

// xpod AI schema
export {
  credentialTable,
  type CredentialRow,
  type CredentialInsert,
  type CredentialUpdate,
} from "./credential.schema";

export {
  aiProviderTable,
  type AIProviderRow,
  type AIProviderInsert,
  type AIProviderUpdate,
} from "./ai-provider.schema";

export {
  aiModelTable,
  type AIModelRow,
  type AIModelInsert,
  type AIModelUpdate,
} from "./ai-model.schema";

export {
  aiConfigModelUri,
  aiConfigProviderUri,
  buildAIConfigMutationPlan,
  buildAIConfigProviderStateMap,
  getAIConfigDefaultBaseUrl,
  getAIConfigProviderCatalog,
  getAIConfigProviderFamilyIds,
  getAIConfigProviderMetadata,
  getDefaultAIConfigCredentialId,
  normalizeAIConfigProviderId,
  normalizeAIConfigResourceId,
  sameAIConfigProviderFamily,
  type AIConfigModel,
  type AIConfigMutationPlan,
  type AIConfigProviderCatalogEntry,
  type AIConfigProviderState,
  type AIConfigUpdate,
  type BuildAIConfigProviderStateMapOptions,
} from './ai-config'

export {
  createWatchSessionId,
  detectWatchAuthFailure,
  formatWatchAutoFallbackMessage,
  formatWatchBackendAuthMessage,
  extractWatchSessionIdFromJsonLine,
  getWatchArchiveRelativePaths,
  getWatchAuthLoginCommand,
  looksLikeWatchAuthFailureText,
  normalizeCodexAppServerNotification,
  normalizeCodexAppServerRequest,
  normalizeWatchCredentialSource,
  parseWatchClaudeAuthStatus,
  parseWatchJsonLine,
  parseWatchJsonProtocolLine,
  resolveWatchCredentialSourceResolution,
  shouldAttemptCloudCredentialProbe,
  WATCH_EVENTS_FILE_NAME,
  WATCH_HOME_DIRNAME,
  WATCH_SESSIONS_DIRNAME,
  WATCH_SESSION_FILE_NAME,
  type CreateWatchSessionIdOptions,
  type WatchAuthFailure,
  type WatchAuthState,
  type WatchAuthStatus,
  type WatchArchiveRelativePaths,
  type WatchBackend,
  type WatchCloudCredentialProbe,
  type WatchCloudCredentialProbeStatus,
  type WatchCredentialSource,
  type WatchCredentialSourceResolution,
  type WatchEventLogEntry,
  type WatchMode,
  type WatchNormalizedEvent,
  type WatchOutputStream,
  type WatchResolvedCredentialSource,
  type WatchRuntime,
  type WatchSessionRecord,
  type WatchSessionStatus,
} from './watch'

export {
  createRepositoryDescriptor,
  definePodRepository,
  resolveRowId,
  type PodRepositoryDescriptor,
  type RepositoryCacheOptions,
  type RepositoryInvalidations,
  type RepositoryScope,
  type SolidDatabase,
} from './repository'

// Import Job - 导入任务
export { importJobSchema } from './import'

// ============================================
// 数据库操作符 (统一出口)
// ============================================
export { eq, ne, and, or, drizzle } from '@undefineds.co/drizzle-solid'

// ============================================
// Schema registry
// ============================================
export { linxSchema } from './schema'

// ============================================
// Discovery Service (发现服务)
// ============================================
export * from './discovery'
