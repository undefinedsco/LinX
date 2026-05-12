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
export * from './profile.repository'
export * from './profile.schema'

// Contact - 联系人 (unified index for Solid users, external users, and AI agents)
export {
  ContactGender,
  contactTable,
  ContactClass,
  ContactType,
  isAgentContact,
  isGroupContact,
  normalizeContactGender,
  type ContactRow,
  type ContactInsert,
  type ContactUpdate,
  type ContactClassValue,
  type ContactGenderValue,
  type ContactTypeValue,
} from './contact.schema'
export { contactRepository } from './contact.repository'

// Chat & Message - 聊天和消息
export {
  chatResource,
  chatTable,
  type ChatMetadata,
  type ChatMemberRole,
  type ChatRow,
  type ChatInsert,
  type ChatUpdate,
} from './chat.schema'
export { chatRepository } from './chat.repository'
export {
  extractChatIdFromChatRef,
  extractChatThreadRef,
  extractThreadIdFromThreadRef,
  resolveThreadChatId,
  toTimestamp,
  type ChatThreadRef,
} from './chat.utils'

export {
  threadResource,
  threadTable,
  type ThreadRow,
  type ThreadInsert,
  type ThreadUpdate,
} from './thread.schema'
export { threadRepository } from './thread.repository'

export {
  messageResource,
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
export {
  sessionResource,
  sessionTable,
  buildRuntimeSessionIri,
  extractRuntimeSessionId,
  type SessionType,
  type SessionStatus,
  type SessionRow,
  type SessionInsert,
  type SessionUpdate,
} from './session'
export { sessionRepository } from './session.repository'

// Approval / Audit / Grant / Inbox Notification
export {
  approvalResource,
  approvalTable,
  extractApprovalIdFromApprovalRef,
  type ApprovalRow,
  type ApprovalInsert,
  type ApprovalUpdate,
} from './approval.schema'

export {
  auditResource,
  auditTable,
  extractAuditIdFromAuditRef,
  type AuditRow,
  type AuditInsert,
  type AuditUpdate,
} from './audit.schema'
export {
  buildAuditDetailRecord,
  buildAuditPresentation,
  createResolvedAuthTimestampsIndex,
  formatAuditActorRole,
  formatInboxStatusLabel,
  type AuditPresentation,
} from './audit.presentation'

export {
  grantResource,
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
  aiConfigModelRef,
  aiConfigProviderRef,
  buildAIConfigMutationPlan,
  buildAIConfigProviderStateMap,
  getAIConfigDefaultBaseUrl,
  getAIConfigProviderCatalog,
  getAIConfigProviderFamilyIds,
  getAIConfigProviderMetadata,
  getDefaultAIConfigCredentialId,
  normalizeAIConfigProviderId,
  normalizeAIConfigModelId,
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
  buildAcpPermissionResponse,
  buildWatchThreadMetadata,
  buildWatchTranscriptMessages,
  buildWatchUserInputResponse,
  createWatchSessionId,
  detectWatchAuthFailure,
  formatWatchAutoFallbackMessage,
  formatWatchBackendAuthMessage,
  extractWatchSessionIdFromJsonLine,
  getWatchArchiveRelativePaths,
  getWatchAuthLoginCommand,
  looksLikeWatchAuthFailureText,
  normalizeAcpInteractionRequest,
  normalizeAcpRequest,
  normalizeAcpSessionNotification,
  normalizeCodexAppServerNotification,
  normalizeCodexAppServerRequest,
  normalizeWatchCredentialSource,
  parseWatchClaudeAuthStatus,
  parseWatchJsonLine,
  parseWatchJsonProtocolLine,
  resolveWatchAutoApprovalDecision,
  resolveWatchCredentialSourceResolution,
  resolveWatchInteractionAutoResponse,
  resolveWatchQuestionAnswer,
  shouldAttemptCloudCredentialProbe,
  WATCH_EVENTS_FILE_NAME,
  WATCH_HOME_DIRNAME,
  WATCH_SESSIONS_DIRNAME,
  WATCH_SESSION_FILE_NAME,
  type WatchApprovalDecision,
  type WatchApprovalRequest,
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
  type WatchThreadMetadata,
  type WatchTranscriptMessage,
  type WatchTranscriptMessageRole,
  type WatchTranscriptMessageSource,
} from './watch'

export {
  applySolidComunicaPatches,
} from './comunica-patches'

export {
  createRepositoryDescriptor,
  definePodRepository,
  initSolidTables,
  type AnyPodTable,
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
export { solidResources, solidSchema } from './schema'

// ============================================
// Discovery Service (发现服务)
// ============================================
export * from './discovery'
