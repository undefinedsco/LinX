# LinX 核心概念对齐文档

> 本文档用于对齐 LinX 项目的核心概念、术语定义和设计决策
> 
> 目标：确保所有开发者对核心概念有统一理解
> 
> 创建时间：2025-11-07  
> 状态：📝 草稿 - 需要团队评审确认

---

## 📋 目录

1. [Solid 基础概念](#1-solid-基础概念)
2. [LinX 身份体系](#2-linx-身份体系)
3. [聊天和消息](#3-聊天和消息)
4. [AI 集成概念](#4-ai-集成概念)
5. [文件和同步](#5-文件和同步)
6. [收藏机制](#6-收藏机制)
7. [数据所有权](#7-数据所有权)
8. [权限和访问控制](#8-权限和访问控制)
9. [待讨论的问题](#9-待讨论的问题)

---

## 1. Solid 基础概念

### 1.1 什么是 Solid Pod？

**定义**：Solid Pod 是一个基于 Web 的个人数据存储空间。

**关键特征**：
- ✅ 用户完全拥有和控制自己的数据
- ✅ 数据存储在用户选择的 Pod 提供商（或自托管）
- ✅ 使用标准的 RDF 格式存储数据
- ✅ 基于 Linked Data Platform (LDP) 协议

**在 LinX 中的角色**：
- Pod 是 LinX 的**唯一数据源**
- 所有用户数据（聊天、联系人、文件等）都存储在 Pod 中
- LinX 作为 Pod 的**可视化终端**，不存储用户数据

### 1.2 什么是 WebID？

**定义**：WebID 是一个 URI，用于唯一标识一个人或 Agent。

**示例**：
```
https://alice.solidcommunity.net/profile/card#me
```

**在 LinX 中的用途**：
- 用户登录后获得自己的 WebID
- WebID 用于标识消息发送者、文件所有者等
- 联系人通过 WebID 关联
- AI 助手也可以有 WebID（如果注册为 Solid 账户）

**重要问题** 🤔：
- ❓ AI 助手是否需要真实的 WebID？
- ❓ 还是使用虚拟的 `linx:agent#id` 标识符？
- **建议**：MVP 阶段使用虚拟标识符，未来支持 AI 注册真实 WebID

### 1.3 LDP Container

**定义**：LDP Container 是 Pod 中的一个文件夹，包含多个资源。

**LinX 使用的 Container**：
```
/profile/card              # 用户资料（单个资源）
/contacts/                 # 联系人列表（Container）
/chats/                    # 聊天会话列表
/messages/                 # 消息列表
/files/                    # 文件列表
/favorites/                # 收藏列表
/settings/                 # 设置项
/agents/                   # Agent 配置
```

---

## 2. LinX 身份体系

### 2.1 三种"人"

LinX 中存在三种身份实体：

#### 1️⃣ **自然人（Natural Person）**
- 有真实 Solid Pod 和 WebID
- 可以登录 LinX
- 可以与其他人聊天
- **示例**：Alice (`https://alice.pod.example/profile/card#me`)

#### 2️⃣ **AI 助手（AI Assistant）**
- LinX 中配置的 AI（GPT-4, Claude 等）
- **没有** Solid Pod 和 WebID（MVP 阶段）
- 通过 LinX 应用访问用户 Pod（使用用户的权限）
- **标识符**：虚拟 URI `linx:agent#<uuid>`
- **示例**：LinX 默认助手、用户自定义的 GPT-4 助手

#### 3️⃣ **AI 联系人（AI Contact）**
- 用户地址簿中的 AI 实体
- 关联一个 AI 助手配置
- 可以在聊天列表中显示
- 可以单独对话
- **示例**：用户创建的"写作助手"、"代码顾问"等

**关系**：
```
AI 助手配置 (AIAssistant)
    ↓ 关联
AI 联系人 (Contact with type=ai)
    ↓ 可以参与
聊天会话 (Chat)
```

### 2.2 重要区分 ⚠️

**问题**：AI 助手 vs AI 联系人 有什么区别？

**答案**：

| 维度 | AI 助手 (AIAssistant) | AI 联系人 (Contact type=ai) |
|------|----------------------|----------------------------|
| **本质** | 模型配置（技术层面） | 地址簿条目（用户层面） |
| **存储位置** | `/agents/` | `/contacts/` |
| **包含内容** | provider, modelId, systemPrompt, temperature | fullName, avatarUrl, aiAssistantId |
| **用户感知** | 在设置中管理 | 在联系人列表中显示 |
| **是否必需** | 每个 AI 对话都需要 | 可选（可以直接用助手，也可以创建联系人） |

**示例场景**：
```
用户配置了一个 AI 助手：
- 名称：GPT-4 默认助手
- 模型：gpt-4
- 温度：0.7

用户可以：
1. 直接使用这个助手聊天（不创建联系人）
2. 或者创建一个 AI 联系人"LinX 助手"，关联这个配置
3. 或者创建多个 AI 联系人（"写作助手"、"代码顾问"），都使用同一个配置但有不同的系统提示词
```

**待确认** 🤔：
- ❓ 一个 AI 助手配置可以被多个 AI 联系人共享吗？
- ❓ 如果共享，systemPrompt 存在哪里？（助手配置 or 联系人？）
- **建议**：systemPrompt 存在 AIAssistant，Contact 只存显示信息

---

## 3. 聊天和消息

### 3.1 聊天会话（Chat / Conversation）

**定义**：Chat 是一个消息容器，代表一次对话。

**三种类型**：

#### 1️⃣ **直接聊天（direct）**
- 两个自然人之间的 1:1 对话
- `participants = [userA_webId, userB_webId]`

#### 2️⃣ **群聊（group）**
- 多个自然人的群组对话
- `participants = [user1, user2, user3, ...]`
- 有群名称（title）

#### 3️⃣ **AI 对话（ai）**
- 用户与 AI 助手的对话
- `participants = [user_webId, ai_contact_id]`
- AI 联系人的 ID（不是真实 WebID）

### 3.2 重要问题 🤔

#### Q1: 聊天数据存储在谁的 Pod？

**场景 1：Alice 和 Bob 聊天**
```
选项 A：存储在双方 Pod 中（各自保存一份副本）
  ✅ 优点：数据去中心化，每个人拥有自己的数据
  ❌ 缺点：需要同步逻辑，消息可能不一致

选项 B：存储在发起者的 Pod 中（Alice 发起，存在 Alice 的 Pod）
  ✅ 优点：简单，数据归属明确
  ❌ 缺点：Bob 看不到完整历史（除非 Alice 授权）

选项 C：存储在双方各自的 Pod，消息只存在发送者 Pod
  ✅ 优点：去中心化，符合 Solid 理念
  ❌ 缺点：查询复杂（需要从双方 Pod 合并消息）
```

**待定方案** 📌：
- **MVP 建议**：选项 B（存在发起者 Pod）
- **长期方案**：选项 C（消息去中心化）

#### Q2: 群聊数据存储在哪？

```
选项 A：存在群主 Pod
选项 B：存在所有成员 Pod（各自一份副本）
选项 C：使用共享 Pod（需要第三方服务）
```

**待定方案** 📌：MVP 建议选项 A

#### Q3: AI 对话存储在哪？

**答案**：存在用户自己的 Pod（明确 ✅）
- AI 没有 Pod，所有对话历史属于用户
- AI 通过 LinX 应用访问用户 Pod

### 3.3 消息（Message）

**定义**：Message 是一条具体的聊天内容。

**消息状态流转**：
```
sending → sent → delivered → read → [edited] → [deleted]
   ↓
 failed (重试)
```

**重要问题** 🤔：

#### Q1: 消息的 `delivered` 状态如何确定？

```
选项 A：对方客户端确认（需要在线）
选项 B：对方 Pod 接收确认（离线也可以）
选项 C：不实现 delivered（只有 sent 和 read）
```

**待定** 📌

#### Q2: 已读状态如何追踪？

**当前设计**：`Message.readBy` 字段（JSON 数组）
```json
{
  "readBy": [
    {
      "webId": "https://bob.pod.example/profile/card#me",
      "readAt": "2025-11-07T10:30:00Z"
    }
  ]
}
```

**问题**：
- ❓ 谁来更新这个字段？（发送者 Pod or 接收者 Pod？）
- ❓ 如果消息在双方 Pod 都有副本，如何同步已读状态？

**待讨论** 🔄

---

## 4. AI 集成概念

### 4.1 AI 访问 Pod 的权限模型

**核心问题**：AI 如何访问用户的 Pod 数据？

**当前理解**：
> 用户：一个 AI 作为一个应用，走 Solid 的鉴权机制

**解释**：
```
用户登录 LinX 应用
  ↓
LinX 应用获得 Pod 访问权限（通过 OAuth）
  ↓
AI 助手通过 LinX 应用访问 Pod
  ↓
实际上是用户的权限，不是 AI 的权限
```

**关键点**：
- AI **不是**独立的 Solid 用户
- AI **没有**自己的 WebID 和 Pod
- AI 通过 LinX 应用的权限访问用户数据
- LinX 应用需要向用户申请 Pod 访问权限

### 4.2 AI 权限级别

**在 AIAssistant 模型中**：
```typescript
podAccessLevel: "read" | "write" | "full"
```

**含义**：
- **read**: AI 只能读取 Pod 数据（查询联系人、文件等）
- **write**: AI 可以创建/修改数据（帮用户创建联系人、发送消息等）
- **full**: AI 可以删除数据（危险 ⚠️）

**实现方式**：
- 在 LinX 应用层面限制 AI 的操作
- 不是 Solid Pod 层面的权限（因为 AI 用的是用户权限）

**示例场景**：
```
用户：帮我把这个文件发给 Alice
  ↓
AI（write 权限）：创建 Message 记录，关联 File，更新 Chat
  ↓
成功 ✅

用户：帮我删除所有旧消息
  ↓
AI（read 权限）：抱歉，我没有删除权限
  ↓
失败 ❌
```

### 4.3 AI 对话的数据流

**用户发送消息给 AI**：
```
1. 用户在 LinX 输入消息
   ↓
2. LinX 创建 Message 记录（存入用户 Pod）
   - content: "帮我写一封邮件"
   - sender: user.webId
   - conversationId: chat_with_ai
   ↓
3. LinX 调用 AI API（OpenAI, Anthropic 等）
   - 携带上下文（聊天历史、系统提示词）
   - 可能需要查询 Pod（如果 AI 需要访问数据）
   ↓
4. AI 返回响应
   ↓
5. LinX 创建 AI 的回复消息（存入用户 Pod）
   - content: "好的，邮件内容如下..."
   - sender: ai_assistant_id
   - conversationId: chat_with_ai
```

**关键点**：
- AI 的回复也存储在用户 Pod
- AI 的 `sender` 是虚拟 ID，不是真实 WebID
- 聊天历史完全属于用户

### 4.4 待确认 🤔

#### Q1: AI 能否主动发起对话？

**场景**：用户设置了定时提醒，AI 主动发送消息

```
选项 A：支持（AI 可以创建 Message）
选项 B：不支持（AI 只能回复，不能主动发）
```

**建议**：MVP 不支持，长期可以支持

#### Q2: 多个 AI 能否在同一个群聊？

**场景**：用户、写作助手、代码顾问在同一个群聊

```
选项 A：支持（群聊可以有多个 AI 参与者）
选项 B：不支持（一个聊天只能有一个 AI）
```

**待讨论** 🔄

---

## 5. 文件和同步

### 5.1 文件存储模型

**关键概念**：分离元数据和文件内容

```
Pod 中存储：
├── files/file-123.pdf         # 实际文件（二进制）
└── files/file-123.meta.ttl    # 元数据（RDF）
    ├── name: "报告.pdf"
    ├── size: 1024000
    ├── mimeType: "application/pdf"
    ├── hash: "sha256:abc123..."
    └── createdAt: "2025-11-07"

本地存储（可选）：
└── ~/LinX/files/file-123.pdf   # 本地缓存
```

**File 模型存储的是元数据**，不是文件本身。

### 5.2 同步机制

**三个概念**：

#### 1️⃣ **Pod URI（远程）**
```
podUri: "https://user.pod.example/files/report.pdf"
```
- Pod 中文件的唯一标识
- 真实的 HTTP(S) 地址

#### 2️⃣ **Local Path（本地）**
```
localPath: "/Users/user/LinX/files/report.pdf"
```
- 本地文件系统路径（如果已下载）
- 可以为空（未下载）

#### 3️⃣ **Sync Status（同步状态）**
```
syncStatus: "synced" | "pending" | "conflict" | "error"
```

**状态含义**：
- **synced**: Pod 和本地一致
- **pending**: 有变更等待同步（上传或下载）
- **conflict**: Pod 和本地都有修改（需要用户决策）
- **error**: 同步失败

### 5.3 同步流程

**场景 1：用户上传文件**
```
1. 用户选择本地文件
   ↓
2. LinX 上传到 Pod
   - 计算文件哈希
   - 上传二进制内容
   ↓
3. 创建 File 元数据记录
   - podUri: Pod 中的 URL
   - localPath: 本地路径
   - hash: 文件哈希
   - syncStatus: "synced"
   ↓
4. 如果需要，复制到本地缓存目录
```

**场景 2：跨设备同步**
```
设备 A 上传文件到 Pod
  ↓
设备 B 检测到新文件（通过 Pod 订阅 or 定期轮询）
  ↓
设备 B 下载文件到本地
  ↓
同步完成
```

### 5.4 重要问题 🤔

#### Q1: 大文件如何处理？

```
选项 A：直接上传到 Pod（受 Pod 存储限制）
选项 B：使用外部存储（S3, IPFS），Pod 只存引用
选项 C：分片上传，支持断点续传
```

**建议**：MVP 支持选项 A（<100MB），长期支持选项 B+C

#### Q2: 文件版本控制？

```
是否需要保留文件历史版本？
- 是：需要设计版本链（类似 Git）
- 否：覆盖旧版本
```

**待讨论** 🔄

---

## 6. 收藏机制

### 6.1 核心概念：引用 vs 快照

**Favorite 模型设计**：
```typescript
{
  targetUri: string;           // 收藏的资源 URI（引用）
  snapshotContent: string;     // 内容快照
  snapshotAuthor: string;      // 作者快照
  snapshotCreatedAt: timestamp; // 原始创建时间
}
```

**为什么需要快照？**

**问题场景**：
```
1. 用户收藏了 Alice 的一条消息
2. Alice 后来编辑或删除了这条消息
3. 用户打开收藏列表，看到什么？
   - 选项 A：查询原始消息（可能已删除或修改）
   - 选项 B：显示收藏时的快照
```

**当前设计**：使用快照 ✅

**优点**：
- 性能好（不需要每次查询原始资源）
- 稳定性（原始资源删除不影响收藏）
- 符合用户预期（收藏的是"那一刻"的内容）

**缺点**：
- 数据冗余
- 原始资源更新不会反映到收藏

### 6.2 收藏类型

当前支持：
- **message** - 聊天消息
- **file** - 文件
- **contact** - 联系人
- **link** - 外部链接
- **note** - 笔记

**重要区分**：
- 收藏联系人：存的是引用（不需要快照，联系人信息会更新）
- 收藏消息：存的是快照（保留收藏时的内容）
- 收藏文件：存的是引用 + 元数据快照（文件内容不变，但可能被删除）

### 6.3 待确认 🤔

#### Q1: 收藏的文件被删除后怎么办？

```
选项 A：收藏失效（灰色显示，点击提示已删除）
选项 B：保留副本（收藏时自动复制文件到收藏夹）
```

**建议**：选项 A（MVP），选项 B 可作为高级功能

---

## 7. 数据所有权

### 7.1 核心原则

**LinX 的定位**：Pod 的可视化终端

**关键点**：
- ✅ LinX **不存储**用户数据（除了临时缓存）
- ✅ 所有数据属于用户，存储在用户的 Pod
- ✅ 用户可以随时切换到其他 Solid 应用
- ✅ LinX 只是访问和管理 Pod 数据的工具

### 7.2 数据归属

| 数据类型 | 存储位置 | 所有者 |
|---------|---------|--------|
| 用户资料 | 用户 Pod | 用户 |
| 聊天历史 | 用户 Pod | 用户 |
| 联系人 | 用户 Pod | 用户 |
| 文件 | 用户 Pod | 用户 |
| 收藏 | 用户 Pod | 用户 |
| 设置 | 用户 Pod | 用户 |
| AI 助手配置 | 用户 Pod | 用户 |
| AI 对话历史 | 用户 Pod | 用户 |

**唯一例外**：
- LinX 应用本身的配置（窗口大小、快捷键等）可以存在本地
- 但建议也存入 Pod（`/settings/`），实现跨设备同步

### 7.3 待确认 🤔

#### Q1: LinX 是否需要中心化服务器？

```
功能需求：
- 用户发现（查找其他 LinX 用户）
- 离线消息推送（对方不在线时通知）
- AI 服务代理（统一管理 API 密钥）
```

**选项**：
```
A. 完全去中心化（无服务器，只有 Pod）
B. 可选服务器（提供增值服务，但不是必需）
C. 必需服务器（某些功能需要）
```

**待讨论** 🔄

---

## 8. 权限和访问控制

### 8.1 Solid 的 ACL（访问控制列表）

**基础概念**：
```
每个 Pod 资源都可以有 ACL 文件，定义谁可以访问
```

**权限类型**：
- **Read** - 读取
- **Write** - 修改
- **Append** - 追加（只能添加，不能改已有内容）
- **Control** - 管理权限（修改 ACL）

### 8.2 LinX 的权限场景

#### 场景 1：Alice 想查看 Bob 的资料

```
Bob 的 Pod:
├── /profile/card#me       (Public: Read)
└── /contacts/             (Private)

Alice 可以：
- ✅ 查看 Bob 的公开资料
- ❌ 查看 Bob 的联系人列表（除非 Bob 授权）
```

#### 场景 2：Alice 和 Bob 聊天

**如果消息存在 Alice 的 Pod**：
```
Alice 需要给 Bob Read 权限：
/chats/chat-with-bob/       (Read: Bob)
/messages/...               (Read: Bob)
```

**问题** 🤔：
- ❓ 这样 Bob 看到的是 Alice Pod 中的数据
- ❓ 如果 Alice 删除了消息，Bob 就看不到了
- ❓ 是否符合用户预期？

**待讨论** 🔄

#### 场景 3：AI 访问 Pod

**LinX 应用请求权限**：
```
LinX 向用户申请：
- Read: /profile, /contacts, /files (查询数据)
- Write: /messages, /chats (发送消息)
- Append: /messages (只追加消息，不修改历史)
```

**用户可以**：
- 允许/拒绝整个应用
- 精细控制（只给 Read，不给 Write）

### 8.3 待确认 🤔

#### Q1: LinX 需要哪些最小权限？

**MVP 阶段**：
```
必需：
- Read: /profile (读取用户资料)
- Write: /profile (编辑资料)
- Read: /contacts (读取联系人)
- Write: /contacts (添加联系人)
- Read/Write: /chats, /messages (聊天功能)
- Read/Write: /files (文件管理)
- Read/Write: /favorites, /settings, /agents

可选：
- Read: 其他用户的 /profile（查看对方资料）
```

**待确认** 📌

---

## 9. 待讨论的问题

### 🔴 高优先级

1. **聊天数据存储位置**
   - [ ] 存在发起者 Pod？双方 Pod？共享 Pod？
   - [ ] 群聊存储策略？
   - 影响：架构设计、实现复杂度

2. **AI 助手的身份模型**
   - [ ] AI 是否需要真实 WebID？
   - [ ] AI 如何标识（虚拟 ID or 真实 WebID）？
   - 影响：Contact 和 Message 的 sender 字段

3. **消息同步和已读状态**
   - [ ] delivered 状态如何实现？
   - [ ] 已读状态如何跨 Pod 同步？
   - 影响：用户体验、实现复杂度

4. **LinX 是否需要中心化服务**
   - [ ] 完全去中心化 or 可选服务器？
   - [ ] 哪些功能需要服务器（推送、用户发现等）？
   - 影响：产品定位、技术架构

### 🟡 中优先级

5. **文件同步策略**
   - [ ] 大文件如何处理？
   - [ ] 是否需要版本控制？
   - 影响：性能、存储成本

6. **收藏的文件处理**
   - [ ] 收藏的文件被删除后怎么办？
   - [ ] 是否需要自动备份？
   - 影响：用户体验

7. **群聊高级功能**
   - [ ] 是否支持群管理员？
   - [ ] 是否支持群公告、群文件？
   - 影响：功能复杂度

### 🟢 低优先级

8. **AI 高级功能**
   - [ ] AI 能否主动发起对话？
   - [ ] 多个 AI 在同一群聊？
   - 影响：用户体验

9. **跨应用互操作**
   - [ ] LinX 的数据能否被其他 Solid 应用读取？
   - [ ] 是否需要标准化数据格式？
   - 影响：生态兼容性

---

## 附录：决策记录模板

当上述问题有结论后，记录在此：

### 决策 #001: [标题]

**日期**: YYYY-MM-DD  
**决策者**: [名字]  
**状态**: ✅ 已确认 / 📝 草案 / ❌ 已废弃

**背景**：
[描述问题和背景]

**考虑的方案**：
- 方案 A: [描述]
- 方案 B: [描述]

**最终决策**：
[选择的方案及理由]

**影响**：
[对代码、架构、用户体验的影响]

**后续行动**：
- [ ] 更新设计文档
- [ ] 修改数据模型
- [ ] 通知相关开发者

---

## 维护说明

**更新频率**：有新问题或达成共识时立即更新

**评审流程**：
1. 提出问题 → 添加到"待讨论"
2. 团队讨论 → 达成共识
3. 记录决策 → 更新相关文档
4. 通知相关方 → 开始实施

**相关文档**：
- [产品定位](./product-definition.md)
- [主布局设计](./main-layout-design.md)
- [AI 集成方案](./ai-integration.md)
- [安全和加密](./security.md)
- [数据模型](../packages/models/README.md)

---

**最后更新**: 2025-11-07  
**下次评审**: 待定










