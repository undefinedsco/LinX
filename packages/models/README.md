# LinX 数据模型

> 基于 Solid Pod 标准的 LinX 核心数据模型定义
> 
> 使用 `drizzle-solid` ORM，兼容标准 RDF 词汇表（VCARD, FOAF, SIOC, DCTerms 等）

---

## 📋 目录

- [概述](#概述)
- [标准词汇表](#标准词汇表)
- [核心模型](#核心模型)
- [使用示例](#使用示例)
- [设计原则](#设计原则)

---

## 概述

LinX 的所有数据存储在 Solid Pod 中，使用标准的 RDF 格式。本包定义了所有核心业务实体的数据模型，包括：

### 核心功能模型

1. **Profile** - 用户资料
2. **Contact** - 联系人管理（支持自然人和 AI）
3. **Chat & Message** - 聊天会话和消息
4. **File** - 文件管理
5. **Favorite** - 收藏夹
6. **Settings** - 用户设置
7. **AI Assistant** - AI 助手配置

### 其他模型

- **Session** - 会话管理
- **Knowledge Folder** - 知识库文件夹
- **Extension** - 扩展
- **Model Credential** - 模型凭证
- **Import Job** - 导入任务

---

## 标准词汇表

LinX 遵循 Solid 生态的最佳实践，优先使用标准 RDF 词汇表：

### 已集成的标准词汇表

| 词汇表 | 用途 | 规范 |
|--------|------|------|
| **VCARD** | 联系人信息 | [RFC 6350](https://www.w3.org/TR/vcard-rdf/) |
| **FOAF** | 人和社交关系 | [FOAF Vocabulary](http://xmlns.com/foaf/spec/) |
| **SIOC** | 社交内容和讨论 | [SIOC Ontology](http://rdfs.org/sioc/spec/) |
| **DCTerms** | 元数据（创建时间、作者等） | [Dublin Core](https://www.dublincore.org/specifications/dublin-core/dcmi-terms/) |
| **Schema.org** | 结构化数据 | [Schema.org](https://schema.org/) |
| **LDP** | Linked Data Platform | [LDP Spec](https://www.w3.org/TR/ldp/) |

### LinX 自定义词汇表

命名空间：`https://linx.ai/ns#`

用于标准词汇表未覆盖的 LinX 特有功能（如 AI 助手配置、同步状态等）。

---

## 核心模型

### 1. Profile（用户资料）

**文件路径**: `src/profile.ts`

**RDF 类**: `foaf:Person`

**字段**:
```typescript
{
  displayName: string;    // vcard:fn
  nickname: string;       // foaf:nick
  avatarUrl: string;      // vcard:hasPhoto
  note: string;           // vcard:note
  region: string;         // vcard:region
  gender: string;         // vcard:gender
  favorite: string;       // linx:favorite
  inbox: string;          // ldp:inbox
}
```

---

### 2. Contact（联系人）

**文件路径**: `src/contact/contact.schema.ts`

**RDF 类**: `vcard:Individual`

**支持类型**: `person`, `ai`, `organization`, `group`

**核心字段**:
```typescript
{
  // 姓名
  fullName: string;       // vcard:fn ⭐ 必需
  givenName: string;      // vcard:givenName
  familyName: string;     // vcard:familyName
  nickname: string;       // foaf:nick
  
  // 联系方式
  email: string;          // vcard:hasEmail
  telephone: string;      // vcard:hasTelephone
  mobile: string;
  
  // 地址
  homeAddress: string;    // vcard:hasAddress (JSON)
  workAddress: string;
  
  // 组织
  organization: string;   // vcard:organizationName
  title: string;          // vcard:title
  
  // Solid 身份
  webId: string;          // foaf:weblog
  
  // AI 联系人
  aiAssistantId: string;  // linx:aiAssistant
  
  // 关系和标签
  relationship: string;   // vcard:hasRelated
  tags: string;           // dcterms:subject (JSON)
}
```

**常量**:
- `CONTACT_TYPES`: `person`, `ai`, `organization`, `group`
- `RELATIONSHIP_TYPES`: `friend`, `family`, `colleague`, `acquaintance`, `other`

---

### 3. Chat（聊天会话）

**文件路径**: `src/chat/chat.schema.ts`

**RDF 类**: `schema:ConversationThread`

**字段**:
```typescript
{
  title: string;              // dcterms:title ⭐ 必需
  description: string;        // dcterms:description
  conversationType: string;   // linx:conversationType (direct, group, ai)
  status: string;             // linx:status (active, archived, deleted)
  participants: array;        // linx:participants (WebID 数组)
  creator: string;            // dcterms:creator
  createdAt: timestamp;       // dcterms:created
  modifiedAt: timestamp;      // dcterms:modified
  lastMessage: string;        // linx:lastMessage
  lastMessageAt: timestamp;   // linx:lastMessageAt
  pinnedAt: timestamp;        // linx:pinnedAt
}
```

---

### 4. Message（聊天消息）

**文件路径**: `src/chat/message.schema.ts`

**RDF 类**: `schema:Message`

**字段**:
```typescript
{
  content: string;            // sioc:content ⭐ 必需 (支持 Markdown)
  messageType: string;        // linx:messageType (text, image, file, system)
  messageStatus: string;      // linx:messageStatus (sending, sent, delivered, read, failed)
  conversationId: string;     // linx:conversation
  replyTo: string;            // sioc:replyOf
  sender: string;             // dcterms:creator (WebID)
  senderName: string;         // foaf:name
  createdAt: timestamp;       // dcterms:created
  modifiedAt: timestamp;      // dcterms:modified (编辑时间)
  deletedAt: timestamp;       // linx:deletedAt (软删除)
  readBy: string;             // linx:readBy (JSON)
  
  // 附件（如果是文件/图片消息）
  attachmentUri: string;      // schema:about
  attachmentName: string;     // schema:name
  attachmentSize: integer;    // schema:fileSize
  attachmentMime: string;     // schema:encodingFormat
}
```

---

### 5. File（文件管理）

**文件路径**: `src/file/file.schema.ts`

**RDF 类**: `schema:MediaObject`

**字段**:
```typescript
{
  name: string;               // schema:name ⭐ 必需
  description: string;        // schema:description
  mimeType: string;           // schema:encodingFormat
  size: integer;              // schema:fileSize
  hash: string;               // linx:fileHash (SHA-256)
  podUri: string;             // dcterms:identifier (Pod 中的 URI)
  localPath: string;          // linx:localPath (本地路径)
  syncStatus: string;         // linx:syncStatus (synced, pending, conflict, error)
  owner: string;              // dcterms:creator
  sharedWith: string;         // linx:participants (JSON)
  folder: string;             // linx:conversation
  tags: string;               // dcterms:subject (JSON)
  starred: boolean;           // linx:favorite
  createdAt: timestamp;       // dcterms:created
  modifiedAt: timestamp;      // dcterms:modified
}
```

---

### 6. Favorite（收藏）

**文件路径**: `src/favorite/favorite.schema.ts`

**RDF 类**: `schema:CreativeWork`

**支持收藏类型**: `message`, `file`, `contact`, `link`, `note`

**字段**:
```typescript
{
  title: string;              // dcterms:title ⭐ 必需
  description: string;        // dcterms:description
  favoriteType: string;       // linx:favoriteType
  targetUri: string;          // linx:favoriteTarget ⭐ 必需
  
  // 快照（避免查询原始资源）
  snapshotContent: string;    // schema:text
  snapshotAuthor: string;     // schema:author
  snapshotCreatedAt: timestamp; // schema:dateCreated
  
  owner: string;              // dcterms:creator
  folder: string;             // linx:conversation
  tags: string;               // dcterms:subject (JSON)
  favoredAt: timestamp;       // linx:favoredAt
  createdAt: timestamp;       // dcterms:created
  modifiedAt: timestamp;      // dcterms:modified
  pinnedAt: timestamp;        // linx:pinnedAt
}
```

---

### 7. Settings（用户设置）

**文件路径**: `src/settings/settings.schema.ts`

**RDF 类**: `schema:PropertyValue`

**字段**:
```typescript
{
  key: string;                // linx:settingKey ⭐ 必需（唯一）
  value: string;              // linx:settingValue (JSON 字符串)
  valueType: string;          // linx:settingType (string, number, boolean, json)
  category: string;           // dcterms:type (ui, ai, sync, privacy, notifications)
  label: string;              // dcterms:title
  description: string;        // dcterms:description
  owner: string;              // dcterms:creator
  isSensitive: boolean;       // linx:status (是否加密)
  createdAt: timestamp;       // dcterms:created
  modifiedAt: timestamp;      // dcterms:modified
}
```

**预定义设置键** (`SETTING_KEYS`):
```typescript
// UI 设置
UI_THEME: "ui.theme"
UI_LANGUAGE: "ui.language"
UI_SIDEBAR_WIDTH: "ui.sidebar.width"
UI_LIST_PANEL_WIDTH: "ui.listPanel.width"

// AI 设置
AI_DEFAULT_ASSISTANT: "ai.defaultAssistant"
AI_AUTO_REPLY: "ai.autoReply"
AI_STREAMING: "ai.streaming"

// 同步设置
SYNC_AUTO: "sync.auto"
SYNC_INTERVAL: "sync.interval"
SYNC_WIFI_ONLY: "sync.wifiOnly"

// 隐私设置
PRIVACY_READ_RECEIPTS: "privacy.readReceipts"
PRIVACY_ONLINE_STATUS: "privacy.onlineStatus"
PRIVACY_TYPING_INDICATOR: "privacy.typingIndicator"

// 通知设置
NOTIFICATIONS_ENABLED: "notifications.enabled"
NOTIFICATIONS_SOUND: "notifications.sound"
NOTIFICATIONS_DESKTOP: "notifications.desktop"

// Pod 设置
POD_AUTO_CONNECT: "pod.autoConnect"
POD_CACHE_SIZE: "pod.cacheSize"
```

---

### 8. AI Assistant（AI 助手配置）

**文件路径**: `src/agent.schema.ts`

**RDF 类**: `foaf:Agent`

**字段**:
```typescript
{
  // 基础信息
  name: string;               // foaf:name ⭐ 必需
  nickname: string;           // foaf:nick
  description: string;        // dcterms:description
  avatarUrl: string;          // foaf:depiction
  assistantType: string;      // dcterms:type (system, custom, shared)
  
  // 模型配置
  provider: string;           // linx:aiProvider (openai, anthropic, ollama, custom)
  modelId: string;            // linx:aiModel (gpt-4, claude-3, llama2)
  systemPrompt: string;       // linx:systemPrompt
  
  // 模型参数
  temperature: float;         // linx:temperature (0-2)
  maxTokens: integer;         // linx:maxTokens
  topP: float;
  frequencyPenalty: float;
  presencePenalty: float;
  
  // 功能配置
  enableStreaming: boolean;
  enableFunctionCalling: boolean;
  allowedFunctions: string;   // JSON 数组
  
  // Pod 访问权限
  podAccessLevel: string;     // linx:status (read, write, full)
  allowedContainers: string;  // JSON 数组
  
  // 共享
  owner: string;              // dcterms:creator
  isPublic: boolean;
  sharedWith: string;         // JSON
  
  // 统计
  messageCount: integer;
  lastUsedAt: timestamp;
  
  status: string;             // linx:status (active, disabled, archived)
  createdAt: timestamp;
  modifiedAt: timestamp;
}
```

**常量**:
- `AI_PROVIDERS`: `openai`, `anthropic`, `google`, `ollama`, `custom`
- `AI_MODELS`: 包含常见模型 ID（GPT-4, Claude-3, Gemini, Llama2 等）

---

## 使用示例

### 安装

```bash
yarn workspace @linq/models install
```

### 导入模型

```typescript
import {
  // 词汇表
  LINQ, SIOC, DCTerms, SCHEMA,
  
  // 模型表
  contactTable,
  chatTable,
  messageTable,
  fileTable,
  favoriteTable,
  settingsTable,
  aiAssistantTable,
  
  // 类型
  type ContactRow,
  type ChatRow,
  type MessageRow,
  
  // 常量
  CONTACT_TYPES,
  SETTING_KEYS,
  AI_PROVIDERS,
} from "@linq/models";
```

### 查询示例

```typescript
// 查询联系人
const contacts = await db
  .select()
  .from(contactTable)
  .where(eq(contactTable.contactType, CONTACT_TYPES.PERSON));

// 创建聊天会话
const newChat = await db
  .insert(chatTable)
  .values({
    title: "与 Alice 的对话",
    conversationType: "direct",
    participants: ["https://alice.solidcommunity.net/profile/card#me"],
    creator: session.webId,
    status: "active",
  });

// 发送消息
const newMessage = await db
  .insert(messageTable)
  .values({
    content: "你好，Alice！",
    messageType: "text",
    conversationId: chatId,
    sender: session.webId,
    senderName: "Bob",
    messageStatus: "sent",
  });

// 查询设置
const theme = await db
  .select()
  .from(settingsTable)
  .where(eq(settingsTable.key, SETTING_KEYS.UI_THEME))
  .limit(1);

// 创建 AI 助手
const assistant = await db
  .insert(aiAssistantTable)
  .values({
    name: "LinX 助手",
    provider: AI_PROVIDERS.OPENAI,
    modelId: AI_MODELS.GPT_4,
    systemPrompt: "你是 LinX 的智能助手...",
    temperature: 0.7,
    maxTokens: 2048,
    owner: session.webId,
  });
```

---

## 设计原则

### 1. 遵循 Solid 标准

- ✅ 优先使用标准 RDF 词汇表（VCARD, FOAF, SIOC, DCTerms）
- ✅ 仅在必要时使用自定义词汇表（`linx:` 命名空间）
- ✅ 所有数据存储在 Pod 的 LDP 容器中
- ✅ 使用标准 RDF 类（`vcard:Individual`, `schema:Message` 等）

### 2. 类型安全

- ✅ 使用 `drizzle-solid` 提供的类型推断
- ✅ 导出 `Row`, `Insert`, `Update` 类型
- ✅ 定义常量枚举（`CONTACT_TYPES`, `SETTING_KEYS` 等）

### 3. 可扩展性

- ✅ 支持软删除（`deletedAt` 字段）
- ✅ 支持 JSON 字段存储复杂数据（标签、数组等）
- ✅ 预留扩展字段（`tags`, `metadata`）

### 4. 互操作性

- ✅ 与其他 Solid 应用兼容
- ✅ 使用标准的 RDF 谓词
- ✅ 遵循 SolidOS 的数据规范

### 5. 性能优化

- ✅ 快照字段避免频繁查询（如 `Favorite.snapshotContent`）
- ✅ 冗余字段提升列表显示性能（如 `Message.senderName`）
- ✅ 索引常用查询字段

---

## 开发指南

### 添加新模型

1. 在 `src/<entity>/` 创建 `<entity>.schema.ts`
2. 使用 `podTable` 定义表结构
3. 选择合适的 RDF 类和谓词
4. 导出类型：`Row`, `Insert`, `Update`
5. 在 `src/<entity>/index.ts` 导出
6. 在 `src/index.ts` 添加导出
7. 更新本 README

### 修改现有模型

⚠️ **注意**：修改模型可能影响现有数据！

- 添加字段：安全（向后兼容）
- 删除字段：危险（需要数据迁移）
- 重命名字段：危险（需要数据迁移）
- 修改类型：危险（需要数据迁移）

### 测试

```bash
# 运行测试（待添加）
yarn workspace @linq/models test

# 类型检查
yarn workspace @linq/models typecheck
```

---

## 参考资料

### Solid 规范
- [Solid Protocol](https://solidproject.org/TR/protocol)
- [Linked Data Platform (LDP)](https://www.w3.org/TR/ldp/)
- [WebID Profile](https://www.w3.org/2005/Incubator/webid/spec/)

### RDF 词汇表
- [VCARD Ontology](https://www.w3.org/TR/vcard-rdf/)
- [FOAF Vocabulary](http://xmlns.com/foaf/spec/)
- [SIOC Ontology](http://rdfs.org/sioc/spec/)
- [Dublin Core Terms](https://www.dublincore.org/specifications/dublin-core/dcmi-terms/)
- [Schema.org](https://schema.org/)

### 工具
- [Drizzle ORM](https://orm.drizzle.team/)
- [Inrupt Solid Client](https://docs.inrupt.com/developer-tools/javascript/client-libraries/)

---

## 更新日志

| 日期 | 版本 | 更新内容 |
|------|------|---------|
| 2025-11-06 | 1.0.0 | 初始版本 - 创建所有核心模型 |
|  |  | - 扩展 namespaces.ts（SIOC, DCTerms, SCHEMA, RDF） |
|  |  | - 完善 Contact 模型（完整 VCARD 字段） |
|  |  | - 创建 Chat & Message 模型 |
|  |  | - 创建 File 模型 |
|  |  | - 创建 Favorite 模型 |
|  |  | - 创建 Settings 模型 |
|  |  | - 创建 AI Assistant 模型 |
|  |  | - 重组 index.ts 导出 |

---

## 许可证

MIT License










