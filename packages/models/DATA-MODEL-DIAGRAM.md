# LinX 数据模型关系图

> 可视化展示 LinX 各个实体之间的关系和数据流

---

## 实体关系图 (ERD)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         LinX 数据模型关系图                               │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────┐
│   Profile    │ ◄────────────┐
│              │               │
│ - displayName│               │ owner (WebID)
│ - avatarUrl  │               │
│ - inbox      │               │
└──────────────┘               │
                               │
                ┌──────────────┼──────────────┬──────────────┐
                │              │              │              │
                │              │              │              │
        ┌───────▼──────┐  ┌───▼──────────┐  │   ┌──────────▼─────┐
        │   Contact    │  │     Chat     │  │   │  AI Assistant  │
        │              │  │              │  │   │                │
        │ - fullName   │  │ - title      │  │   │ - name         │
        │ - webId      │  │ - type       │◄─┼───┤ - modelId      │
        │ - contactType│◄─┤ - participants  │   │ - systemPrompt │
        │ - email      │  │ - status     │  │   │ - temperature  │
        │ - aiAssistant├──┤ - lastMessage│  │   └────────────────┘
        └──────────────┘  └──────┬───────┘  │
                │                │          │
                │ related    ┌───▼──────┐   │
                │            │ Message  │   │
                │            │          │   │
                │            │ - content│   │
                │            │ - sender ├───┘
                │            │ - type   │
                │            │ - status │
                │            └──────────┘
                │
                │
        ┌───────▼──────┐  ┌──────────────┐  ┌──────────────┐
        │   Favorite   │  │     File     │  │   Settings   │
        │              │  │              │  │              │
        │ - title      │  │ - name       │  │ - key        │
        │ - targetUri ─┼──► - podUri     │  │ - value      │
        │ - type       │  │ - mimeType   │  │ - category   │
        │ - snapshot   │  │ - syncStatus │  └──────────────┘
        └──────────────┘  │ - localPath  │
                          └──────────────┘
```

---

## 核心关系说明

### 1. Profile → 其他实体

**关系类型**: 一对多 (1:N)

**说明**: Profile（用户）是所有数据的所有者。

```
Profile.webId (1) ─────► (N) Contact.owner
                  ─────► (N) Chat.creator
                  ─────► (N) Message.sender
                  ─────► (N) File.owner
                  ─────► (N) Favorite.owner
                  ─────► (N) Settings.owner
                  ─────► (N) AIAssistant.owner
```

---

### 2. Contact ↔ Chat

**关系类型**: 多对多 (M:N)

**说明**: 联系人可以参与多个聊天，聊天可以有多个参与者。

```
Contact.webId (M) ◄────► (N) Chat.participants (JSON 数组)
```

**实现方式**:
- `Chat.participants` 是一个 WebID 数组（JSON 字符串）
- 查询某联系人的所有聊天：`WHERE participants CONTAINS contact.webId`
- 查询某聊天的所有参与者：解析 `participants` JSON

---

### 3. Chat → Message

**关系类型**: 一对多 (1:N)

**说明**: 一个聊天会话包含多条消息。

```
Chat.uri (1) ─────► (N) Message.conversationId
```

**查询示例**:
```typescript
// 查询某聊天的所有消息
const messages = await db
  .select()
  .from(messageTable)
  .where(eq(messageTable.conversationId, chatUri))
  .orderBy(asc(messageTable.createdAt));
```

---

### 4. Contact → AI Assistant

**关系类型**: 一对一 (1:1，可选)

**说明**: AI 类型的联系人关联一个 AI 助手配置。

```
Contact.aiAssistantId (0..1) ─────► (1) AIAssistant.uri
```

**约束**:
- 只有 `Contact.contactType === 'ai'` 时才有 `aiAssistantId`
- 自然人联系人的 `aiAssistantId` 为 `null`

---

### 5. Favorite → 任意实体

**关系类型**: 多对一 (N:1)

**说明**: 收藏可以指向任何类型的资源。

```
Favorite.targetUri (N) ─────► (1) Message.uri
                       ─────► (1) File.uri
                       ─────► (1) Contact.uri
                       ─────► (1) <外部链接>
```

**收藏类型** (`Favorite.favoriteType`):
- `message` - 收藏的消息
- `file` - 收藏的文件
- `contact` - 收藏的联系人
- `link` - 收藏的外部链接
- `note` - 收藏的笔记

**快照机制**:
为了提升性能，`Favorite` 存储了目标资源的快照：
- `snapshotContent` - 内容快照
- `snapshotAuthor` - 作者快照
- `snapshotCreatedAt` - 原始创建时间

---

### 6. Message → Message（回复）

**关系类型**: 自引用 (Self-Reference)

**说明**: 消息可以回复另一条消息。

```
Message.replyTo (0..1) ─────► (1) Message.uri
```

**查询示例**:
```typescript
// 查询某条消息的所有回复
const replies = await db
  .select()
  .from(messageTable)
  .where(eq(messageTable.replyTo, originalMessageUri));
```

---

### 7. File ↔ Message（附件）

**关系类型**: 一对一 (1:1，可选)

**说明**: 消息可以包含文件附件。

```
Message.attachmentUri (0..1) ─────► (1) File.podUri
```

**实现方式**:
- 用户上传文件 → 创建 `File` 记录 → 在 `Message` 中引用 `File.podUri`
- 文件类型消息：`Message.messageType === 'file'` 且有 `attachmentUri`

---

## 数据流示例

### 场景 1: 用户发送带附件的消息

```
1. 用户上传文件
   ↓
2. 创建 File 记录
   - name: "report.pdf"
   - podUri: "https://pod.example/files/abc123"
   - owner: userWebId
   ↓
3. 创建 Message 记录
   - content: "请查看报告"
   - messageType: "file"
   - attachmentUri: "https://pod.example/files/abc123"
   - conversationId: chatUri
   - sender: userWebId
   ↓
4. 更新 Chat 记录
   - lastMessage: messageUri
   - lastMessageAt: now()
```

---

### 场景 2: 用户创建 AI 联系人

```
1. 创建 AI Assistant 配置
   - name: "LinX 助手"
   - provider: "openai"
   - modelId: "gpt-4"
   - systemPrompt: "你是..."
   - owner: userWebId
   ↓
2. 创建 Contact 记录（AI 类型）
   - fullName: "LinX 助手"
   - contactType: "ai"
   - aiAssistantId: assistantUri
   - owner: userWebId
   ↓
3. 创建 Chat 记录（AI 对话）
   - title: "与 LinX 助手的对话"
   - conversationType: "ai"
   - participants: [userWebId, aiContactWebId]
   - creator: userWebId
```

---

### 场景 3: 用户收藏一条消息

```
1. 用户点击收藏按钮
   ↓
2. 查询原始消息
   - 获取 content, sender, createdAt 等信息
   ↓
3. 创建 Favorite 记录
   - title: 从消息内容生成标题
   - favoriteType: "message"
   - targetUri: messageUri
   - snapshotContent: message.content
   - snapshotAuthor: message.sender
   - snapshotCreatedAt: message.createdAt
   - owner: userWebId
```

---

## Pod 存储结构

LinX 在 Solid Pod 中的存储路径：

```
Pod Root (https://user.pod.example/)
│
├── profile/
│   └── card                      # Profile 数据
│
├── contacts/                     # LDP Container
│   ├── contact-1.ttl
│   ├── contact-2.ttl
│   └── ...
│
├── chats/                        # LDP Container
│   ├── chat-1.ttl
│   ├── chat-2.ttl
│   └── ...
│
├── messages/                     # LDP Container
│   ├── message-1.ttl
│   ├── message-2.ttl
│   └── ...
│
├── files/                        # LDP Container
│   ├── file-1.pdf               # 实际文件
│   ├── file-1.meta.ttl          # 文件元数据
│   ├── file-2.jpg
│   ├── file-2.meta.ttl
│   └── ...
│
├── favorites/                    # LDP Container
│   ├── favorite-1.ttl
│   ├── favorite-2.ttl
│   └── ...
│
├── settings/                     # LDP Container
│   ├── ui-theme.ttl
│   ├── ai-default.ttl
│   └── ...
│
└── ai-assistants/                # LDP Container
    ├── assistant-1.ttl
    ├── assistant-2.ttl
    └── ...
```

**说明**:
- `.ttl` 文件：RDF Turtle 格式的元数据
- 二进制文件（PDF, 图片等）：直接存储，使用 `.meta.ttl` 文件存储元数据
- 所有资源都有唯一的 URI（资源路径）

---

## 查询模式

### 常用查询场景

#### 1. 获取用户的所有联系人
```typescript
const contacts = await db
  .select()
  .from(contactTable)
  .where(eq(contactTable.owner, session.webId));
```

#### 2. 获取某个聊天的所有消息（按时间排序）
```typescript
const messages = await db
  .select()
  .from(messageTable)
  .where(eq(messageTable.conversationId, chatUri))
  .orderBy(asc(messageTable.createdAt));
```

#### 3. 获取用户参与的所有活跃聊天
```typescript
const chats = await db
  .select()
  .from(chatTable)
  .where(
    and(
      sql`${chatTable.participants} LIKE '%${session.webId}%'`,
      eq(chatTable.status, "active")
    )
  )
  .orderBy(desc(chatTable.lastMessageAt));
```

#### 4. 获取 AI 联系人及其配置
```typescript
const aiContacts = await db
  .select({
    contact: contactTable,
    assistant: aiAssistantTable,
  })
  .from(contactTable)
  .leftJoin(
    aiAssistantTable,
    eq(contactTable.aiAssistantId, aiAssistantTable.uri)
  )
  .where(eq(contactTable.contactType, "ai"));
```

#### 5. 搜索收藏（按类型和标签）
```typescript
const favorites = await db
  .select()
  .from(favoriteTable)
  .where(
    and(
      eq(favoriteTable.owner, session.webId),
      eq(favoriteTable.favoriteType, "message"),
      sql`${favoriteTable.tags} LIKE '%important%'`
    )
  )
  .orderBy(desc(favoriteTable.favoredAt));
```

---

## 扩展性设计

### 1. 支持新的收藏类型

只需在 `Favorite.favoriteType` 添加新值：

```typescript
export const FAVORITE_TYPES = {
  MESSAGE: "message",
  FILE: "file",
  CONTACT: "contact",
  LINK: "link",
  NOTE: "note",
  // 新增
  CALENDAR_EVENT: "calendar_event",
  TODO: "todo",
} as const;
```

### 2. 支持新的 AI 提供商

在 `AI_PROVIDERS` 添加：

```typescript
export const AI_PROVIDERS = {
  OPENAI: "openai",
  ANTHROPIC: "anthropic",
  // 新增
  HUGGINGFACE: "huggingface",
  CUSTOM_API: "custom_api",
} as const;
```

### 3. 扩展消息类型

在 `Message.messageType` 添加新类型：

```typescript
// 当前支持: text, image, file, system
// 可扩展为: audio, video, location, poll, card, etc.
```

---

## 总结

LinX 的数据模型设计遵循以下原则：

1. ✅ **标准化**: 使用 Solid 标准（VCARD, FOAF, SIOC 等）
2. ✅ **关系清晰**: 实体间关系明确，易于查询
3. ✅ **可扩展**: 支持新功能和类型的添加
4. ✅ **性能优化**: 使用快照、冗余字段减少查询
5. ✅ **类型安全**: TypeScript + Drizzle ORM 提供完整类型推断

---

**更新时间**: 2025-11-06  
**版本**: 1.0.0












