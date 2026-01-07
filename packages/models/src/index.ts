// ============================================
// 命名空间和词汇表
// ============================================
export { LINQ, SIOC, DCTerms, SCHEMA, RDF, FOAF, MEETING, AS } from "./namespaces";

// ============================================
// 核心业务模型
// ============================================

// Profile - 用户资料
export * from "./profile";

// Contact - 联系人 (unified index for Solid users, external users, and AI agents)
export {
  contactTable,
  ContactType,
  type ContactRow,
  type ContactInsert,
  type ContactUpdate,
  type ContactTypeValue,
} from "./contact.schema";
export { contactRepository } from './contact.repository';

// Chat & Message - 聊天和消息
export {
  chatTable,
  type ChatRow,
  type ChatInsert,
  type ChatUpdate,
} from "./chat.schema";
export { chatRepository } from './chat.repository';

export {
  threadTable,
  type ThreadRow,
  type ThreadInsert,
  type ThreadUpdate,
} from "./thread.schema";
export { threadRepository } from './thread.repository';

export {
  messageTable,
  type MessageRow,
  type MessageInsert,
  type MessageUpdate,
} from "./message.schema";
export { messageRepository } from './message.repository';

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
} from "./types/message-block";

// File - 文件管理
export {
  fileTable,
  type FileRow,
  type FileInsert,
  type FileUpdate,
} from "./file";

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
} from "./favorite";

// Settings - 用户设置
export {
  settingsTable,
  SETTING_KEYS,
  type SettingKey,
  type SettingsRow,
  type SettingsInsert,
  type SettingsUpdate,
} from "./settings";

// Agent - AI 助手配置
export {
  agentTable,
  type AgentRow,
  type AgentInsert,
  type AgentUpdate,
} from "./agent.schema";
export { agentRepository } from './agent.repository';

export {
  DEFAULT_AGENT_PROVIDERS,
  type AgentProviderMetadata,
  type AgentModelOption,
} from "./agent.providers";

// ============================================
// 其他模型
// ============================================

// Session - 会话管理
export { sessionSchema } from "./session";

// Knowledge Folder - 知识库文件夹
export {
  knowledgeFolderSchema,
  type KnowledgeFolderScope
} from "./knowledge";

// Extension - 扩展
export { extensionSchema } from "./extension";

// Model Provider
export {
  modelProviderTable,
  type ModelProviderRow,
  type ModelProviderInsert,
  type ModelProviderUpdate,
} from "./model-provider.schema";
export { modelProviderRepository } from "./model-provider.repository";

export {
  createRepositoryDescriptor,
  definePodRepository,
  resolveRowId,
  type PodRepositoryDescriptor,
  type RepositoryCacheOptions,
  type RepositoryInvalidations,
  type RepositoryScope,
  type SolidDatabase,
} from "./repository";

// Import Job - 导入任务
export { importJobSchema } from "./import";

// ============================================
// 数据库操作符 (统一出口)
// ============================================
export { eq, ne, and, or, drizzle } from 'drizzle-solid';

// ============================================
// Schema registry
// ============================================
export { linxSchema } from './schema';

// ============================================
// Discovery Service (发现服务)
// ============================================
export * from './discovery';
