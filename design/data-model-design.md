# LinX 数据模型设计文档

> 本文档定义 LinX 数据模型的核心概念、设计决策和实体关系
> 
> 目标：统一数据模型理解，指导 `packages/models` 的实现
> 
> 创建时间：2025-11-07  
> 状态：📝 草稿 - 需要团队评审确认
> 
> 相关代码：`packages/models/src/`

---

## 📋 目录

0. [设计原则](#0-设计原则)
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

## 0. 设计原则

### 0.1 核心原则：参考 Solid 社区已有的定义

**重要要求** 🎯：
- ✅ LinX 的数据模型必须**优先参考** Solid 社区已经制定的标准和最佳实践
- ✅ 不自己发明概念，而是使用 Solid 生态已有的词汇表和数据结构
- ✅ 确保与其他 Solid 应用的**互操作性**

### 0.2 参考来源

在设计 LinX 数据模型时，需要参考以下 Solid 社区资源：

#### 1️⃣ **官方标准和规范**
- [Solid Protocol](https://solidproject.org/TR/protocol) - Solid 核心协议
- [Solid Application Interoperability](https://solid.github.io/data-interoperability-panel/) - 应用互操作规范
- [Type Indexes](https://github.com/solid/solid/blob/main/proposals/data-discovery.md) - 数据发现机制

#### 2️⃣ **标准 RDF 词汇表**
- [VCARD](https://www.w3.org/TR/vcard-rdf/) - 联系人信息（RFC 6350）
- [FOAF](http://xmlns.com/foaf/spec/) - 人和社交关系
- [SIOC](http://rdfs.org/sioc/spec/) - 社交内容和讨论
- [DCTerms](https://www.dublincore.org/specifications/dublin-core/dcmi-terms/) - 元数据
- [Schema.org](https://schema.org/) - 结构化数据
- [ActivityStreams](https://www.w3.org/TR/activitystreams-vocabulary/) - 社交活动

#### 3️⃣ **Solid 社区应用实现**
需要研究以下 Solid 生态应用的数据模型：
- **SolidOS** - Solid 官方数据浏览器
  - Addressbook (联系人管理)
  - Chat (聊天功能)
  - Long Chat (长对话)
  - Meeting (会议)
- **Solid Chat** - 聊天应用
- **Solid File Manager** - 文件管理
- **Solid Contacts** - 通讯录应用

#### 4️⃣ **Solid 社区最佳实践**
- [Solid Cookbook](https://solidproject.org/developers/tutorials) - 开发教程
- [Solid Specifications](https://solidproject.org/TR/) - 技术规范
- [Solid Community Forum](https://forum.solidproject.org/) - 社区讨论

### 0.3 设计流程

**正确的设计流程** ✅：

```
1. 研究 Solid 社区已有定义
   ↓
2. 确定可以直接使用的标准（VCARD, FOAF 等）
   ↓
3. 查找 Solid 应用的实际实现（SolidOS, Solid Chat）
   ↓
4. 识别缺失的部分（标准未覆盖的 LinX 特有功能）
   ↓
5. 仅对缺失部分创建自定义词汇表（linx: 命名空间）
   ↓
6. 记录设计决策和参考来源
```

**❌ 错误做法**：
- 不做研究，直接自己设计字段
- 重复发明已有的标准（如自定义联系人字段而不用 VCARD）
- 使用非标准的命名（如 userName 而不是 foaf:name）

### 0.4 待研究的关键问题

在继续设计前，需要明确回答：

1. **聊天和消息**
   - ❓ SolidOS 的 Chat 和 Long Chat 使用什么数据结构？
   - ❓ 消息是否有标准的 RDF 表示（SIOC Post? ActivityStreams Note?）
   - ❓ 聊天会话的存储位置约定是什么？

2. **联系人**
   - ❓ SolidOS Addressbook 使用的完整 VCARD 字段有哪些？
   - ❓ AI 联系人如何表示？（是否有先例？）
   - ❓ 联系人分组的标准做法是什么？

3. **文件**
   - ❓ Solid 中文件元数据的标准字段有哪些？
   - ❓ 文件版本控制是否有标准？
   - ❓ 文件共享的 ACL 模式是什么？

4. **收藏/书签**
   - ❓ Solid 应用中如何实现书签功能？
   - ❓ 是否有标准的 Bookmark 词汇表？

5. **设置**
   - ❓ Solid 应用的配置通常存储在哪里？
   - ❓ 是否有标准的 Preferences 词汇表？

### 0.5 研究方法

**具体行动项** 📋：

- [ ] 克隆 SolidOS 源码，研究其数据模型定义
- [ ] 查看 Solid Chat 的实现方式
- [ ] 阅读 Solid Application Interoperability 规范
- [ ] 在 Solid Forum 搜索相关讨论
- [ ] 测试现有 Solid 应用，观察其 Pod 数据结构
- [ ] 记录发现，更新本文档

**预期输出**：
- 每个实体（Chat, Message, Contact, File 等）的标准字段清单
- 参考来源和依据
- 与社区标准的差异说明（如果有自定义部分）

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

### 1.2 Solid 的两类存储方式 ⚠️

**重要概念** 🎯：Solid Pod 支持两种存储方式，需要根据数据类型选择：

#### 1️⃣ **文件系统（File System）**

**用途**：存储**二进制文件**和**非 RDF 内容**

**特征**：
- 直接存储文件内容（PDF, 图片, 视频等）
- 使用 HTTP GET/PUT/DELETE 访问
- 有 MIME 类型（content-type）
- 可以是任意格式

**示例**：
```
https://alice.pod.example/files/report.pdf        # PDF 文件
https://alice.pod.example/photos/vacation.jpg     # 图片
https://alice.pod.example/documents/notes.txt     # 文本文件
```

**在 LinX 中的应用**：
- ✅ 用户上传的文件（PDF, Word, 图片等）
- ✅ 聊天中的附件
- ✅ 用户头像图片
- ✅ 导出的数据（如 JSON 导出）

#### 2️⃣ **结构化数据（RDF/Linked Data）**

**用途**：存储**元数据**和**关系数据**

**特征**：
- 使用 RDF 三元组（subject-predicate-object）
- 常见格式：Turtle (.ttl), JSON-LD, RDF/XML
- 支持 SPARQL 查询
- 数据有语义和关联

**示例**：
```turtle
# https://alice.pod.example/contacts/bob.ttl
@prefix vcard: <http://www.w3.org/2006/vcard/ns#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .

<#bob> a vcard:Individual ;
  vcard:fn "Bob Smith" ;
  vcard:hasEmail <mailto:bob@example.com> ;
  foaf:knows <https://alice.pod.example/profile/card#me> .
```

**在 LinX 中的应用**：
- ✅ 联系人信息（Contact）
- ✅ 聊天会话元数据（Chat）
- ✅ 消息内容（Message）
- ✅ 文件元数据（File metadata）
- ✅ 收藏信息（Favorite）
- ✅ 设置（Settings）
- ✅ AI 助手配置（AI Assistant）

### 1.3 文件系统的原生元数据

**关键理解** 🎯：Solid 文件系统**天然就带有元数据**

**文件系统原生提供的元数据**（通过 HTTP headers）：

```http
GET https://alice.pod.example/files/report.pdf

HTTP/1.1 200 OK
Content-Type: application/pdf              # MIME 类型
Content-Length: 1024000                    # 文件大小
Last-Modified: Wed, 07 Nov 2024 10:30:00 GMT  # 修改时间
ETag: "abc123"                             # 版本标识
Link: <.acl>; rel="acl"                    # 访问控制
```

**这些元数据已经足够**：
- ✅ 文件名：从 URI 获取 (`report.pdf`)
- ✅ MIME 类型：`Content-Type` header
- ✅ 文件大小：`Content-Length` header
- ✅ 修改时间：`Last-Modified` header
- ✅ 版本/哈希：`ETag` header
- ✅ 权限：通过 ACL 文件

**不需要额外的 `.meta` 文件** ❌

**仅在需要扩展元数据时才存储 RDF**：

```
Pod 结构（简化）：
├── files/
│   ├── report.pdf                    # 文件（带原生元数据）
│   └── photo.jpg                     # 文件（带原生元数据）
│
└── extended-metadata/                # 仅在需要时
    └── file-annotations.ttl          # 扩展元数据（标签、描述等）
```

**扩展元数据示例**（仅 LinX 特有的）：
```turtle
# extended-metadata/file-annotations.ttl
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix linx: <https://linx.ai/ns#> .

<../files/report.pdf>
  dcterms:title "2024 年度报告" ;        # 用户自定义标题
  dcterms:description "重要文档" ;        # 用户添加的描述
  linx:tags "工作", "报告", "2024" ;     # 用户标签
  linx:starred true ;                     # 是否加星
  linx:localPath "/Users/alice/LinX/cache/report.pdf" ;  # 本地缓存路径
  linx:syncStatus "synced" .              # 同步状态

<../files/photo.jpg>
  dcterms:title "度假照片" ;
  linx:tags "旅行", "2024" ;
  linx:starred false .
```

**关键区别**：

| 元数据类型 | 来源 | 查询方式 | 是否需要单独存储 |
|-----------|------|---------|-----------------|
| **文件名** | URI | 解析 URI | ❌ 不需要 |
| **MIME 类型** | HTTP header | HEAD 请求 | ❌ 不需要 |
| **文件大小** | HTTP header | HEAD 请求 | ❌ 不需要 |
| **修改时间** | HTTP header | HEAD 请求 | ❌ 不需要 |
| **权限** | ACL 文件 | GET .acl | ❌ 不需要 |
| **用户标题** | 用户输入 | SPARQL | ✅ 需要（RDF） |
| **用户标签** | 用户输入 | SPARQL | ✅ 需要（RDF） |
| **本地路径** | LinX 缓存 | SPARQL | ✅ 需要（RDF） |
| **同步状态** | LinX 同步 | SPARQL | ✅ 需要（RDF） |

**结论** ✅：
- 基础元数据 → 文件系统原生提供（无需存储）
- 扩展元数据 → 仅存储 LinX 特有的信息（RDF）
- 不重复存储已有的数据

### 1.4 什么是 WebID？

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
- ❓ 还是使用虚拟的 `linx:ai-assistant#id` 标识符？
- **建议**：MVP 阶段使用虚拟标识符，未来支持 AI 注册真实 WebID

### 1.5 LDP Container

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
/agents/                   # Agent / 模型配置
```

---

## 2. LinX 身份体系

### 2.1 两种实体（简化）✅

**已确认** 🎯（参考 [4.0.1 设计决策：AI 作为联系人](#401-设计决策ai-作为联系人)）：

LinX 中只有**两种核心实体**：

#### 1️⃣ **Contact（联系人）**

联系人统一管理所有可以交互的"对象"，包括：

**自然人** (`type: "person"`)
- 有真实 Solid Pod 和 WebID
- 可以登录 LinX
- 可以与其他人聊天
- **示例**：Alice (`https://alice.pod.example/profile/card#me`)

**AI Agent** (`type: "ai"`)
- 用户通讯录中的 AI 实体
- **没有** Solid Pod 和 WebID
- 通过 LinX 应用访问用户 Pod（使用用户的权限）
- 有"人格"（名字、头像、systemPrompt）
- 引用 Credential（API 密钥）
- **示例**：用户创建的"LinX 助手"、"写作顾问"、"代码助手"

**组织** (`type: "organization"`)
- 公司、团队等
- **示例**：公司名称、部门

#### 2️⃣ **Credential（凭证）**

API 密钥和访问凭证的管理：

- OpenAI API Key
- Anthropic API Key  
- 自定义 API 端点
- OAuth tokens

**存储位置**：`/credentials/` (加密)

### 2.2 关系说明 ✅

**简化后的关系**：

```
Contact (type=ai)                Credential
├── fullName: "写作助手"         ├── provider: "openai"
├── avatarUrl: "..."             ├── apiKey: "sk-xxx" (加密)
├── systemPrompt: "..."          └── endpoint: "https://api.openai.com"
├── aiProvider: "openai"              ↑
├── aiModel: "gpt-4"                  │
└── credentialRef ────────────────────┘ (引用)

    ↓ 可以参与

Chat (聊天会话)
├── participants: [user, ai-contact]
└── messages...
```

**关键点**：

1. ✅ **不再有单独的 `AI Assistant` 表**
2. ✅ AI 就是一种特殊类型的联系人
3. ✅ API 密钥单独管理，可以被多个 AI 联系人共享
4. ✅ 每个 AI 联系人有自己的"人格"（systemPrompt）
5. ✅ 在聊天中，AI 和人类是平等的

**示例场景**：

```
用户有一个 OpenAI API Key（存储在 Credential）
  ↓
创建两个 AI 联系人（都是 Contact type=ai）：
  
  1. "写作助手"
     - systemPrompt: "你是写作顾问..."
     - credentialRef: → openai-key
  
  2. "代码顾问" 
     - systemPrompt: "你是程序员..."
     - credentialRef: → openai-key (复用)

两个 AI 共享一个 API key，但有不同的"人格"
```

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

### 4.0 什么是"AI 配置"？⚠️

**需要明确的概念** 🤔：

在之前的设计中，我创建了一个 `AI Assistant` 模型，用于存储：
- AI 提供商（OpenAI, Anthropic 等）
- 模型 ID（gpt-4, claude-3 等）
- 系统提示词（systemPrompt）
- 模型参数（temperature, maxTokens 等）
- Pod 访问权限配置

**问题**：
1. ❓ 这个"AI 配置"在 Solid 社区中是否有先例？
2. ❓ 这是 LinX 应用的配置，还是 Pod 数据？
3. ❓ 应该存储在哪里？
4. ❓ 与 AI 对话、AI 联系人的关系是什么？

**可能的理解方式**：

#### 方案 A：AI 配置是应用级配置

```
AI 配置 = LinX 应用的设置
类似于：
- 主题设置（深色/浅色）
- 语言设置（中文/英文）
- 快捷键配置

存储位置：
- LinX 应用的配置文件
- 或 Pod 中的 /settings/ai-providers.ttl
```

**特征**：
- ✅ 用户配置自己的 AI 偏好
- ✅ 可以有多个 AI 配置（工作用 GPT-4，个人用 Claude）
- ❌ 但 AI 不是一个"实体"，只是调用的 API

#### 方案 B：AI 配置是一种 Agent（代理）

```
AI 配置 = 一个虚拟的 Agent
类似于：
- 软件机器人
- 自动化工具
- 智能助手

基于：
- FOAF Agent（foaf:Agent）
- Schema.org SoftwareApplication
```

**特征**：
- ✅ AI 可以作为一个"人"参与对话
- ✅ 符合 Solid 的"去中心化 Agent"理念
- ❌ 但 AI 没有自己的 Pod 和 WebID

#### 方案 C：AI 是外部服务的连接配置

```
AI 配置 = 外部服务凭证
类似于：
- OAuth 应用连接
- API 密钥管理
- 第三方服务集成

存储内容：
- API 密钥（加密）
- 服务端点
- 调用配置
```

**特征**：
- ✅ 明确是"连接外部服务"的配置
- ✅ 类似其他应用集成（Dropbox, Google Drive）
- ❌ 但 LinX 的核心价值就是 AI，不只是"集成"

### 4.0.1 设计决策：AI 作为联系人 ✅

**核心理解** 🎯：

> AI Agent 应该和联系人（Contact）一起管理，而不是单独的实体

**理由**：

1. **用户心智模型**：
   - 用户视角：AI 就像一个可以聊天的"人"
   - 在聊天列表中：AI 和真人应该是平等的
   - 在通讯录中：AI 也是一个"联系人"

2. **符合 Solid 标准**：
   - VCARD 本来就支持不同类型的联系人
   - FOAF Agent 可以表示软件代理
   - 不需要发明新的概念

3. **简化设计**：
   - 不需要单独的 `AI Assistant` 表
   - Contact 模型中已经有 `contactType: "ai"`
   - 复用现有的联系人管理逻辑

**正确的数据模型** ✅：

```
Contact (联系人)
├── type = "person"           # 自然人
│   ├── fullName: "Alice"
│   ├── email: "alice@example.com"
│   └── webId: "https://alice.pod.example/profile/card#me"
│
├── type = "ai"               # AI Agent
│   ├── fullName: "LinX 助手"
│   ├── description: "我的个人 AI 助手"
│   ├── avatarUrl: "https://..."
│   ├── aiProvider: "openai"
│   ├── aiModel: "gpt-4"
│   ├── systemPrompt: "你是我的助手..."
│   └── credentialRef: → Credential (引用 API 密钥)
│
└── type = "organization"     # 组织
    └── ...

Credential (凭证，单独管理)
├── openai-key
│   ├── provider: "openai"
│   ├── apiKey: "sk-..."  (加密存储)
│   └── endpoint: "https://api.openai.com"
│
└── anthropic-key
    └── ...
```

**关键分离** 🔑：

| 存储位置 | 存储内容 | 原因 |
|---------|---------|------|
| **Contact (type=ai)** | AI 的"人格"：名字、头像、描述、systemPrompt | 用户可见，属于通讯录 |
| **Contact.ai* 字段** | AI 技术配置：provider, model, temperature | AI 特有的配置 |
| **Credential** | API 密钥、端点 | 敏感信息，单独管理，加密存储 |

**好处**：

1. ✅ 统一的联系人管理（人类 + AI）
2. ✅ AI 可以像联系人一样被搜索、分组、标记
3. ✅ 在聊天中，AI 和人类是平等的参与者
4. ✅ 安全：API 密钥单独存储，可以共享给多个 AI 联系人
5. ✅ 灵活：可以创建多个 AI 联系人，使用相同的 API 密钥但不同的 systemPrompt

**示例场景**：

```
用户创建两个 AI 联系人：

1. "写作助手"
   - aiModel: gpt-4
   - systemPrompt: "你是一个专业的写作顾问..."
   - credentialRef: → openai-key

2. "代码顾问"
   - aiModel: gpt-4
   - systemPrompt: "你是一个资深程序员..."
   - credentialRef: → openai-key  (复用同一个 API key)

两个联系人共享一个 OpenAI API 密钥，但有不同的"人格"
```

**待研究** 📋：
- [ ] 确认 VCARD 是否有表示 Bot/Agent 的标准方式
- [ ] 研究 Solid 社区是否有 Bot 的先例（如 Matrix bot）
- [ ] 设计 Credential 的安全存储方案（参考 security.md）

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

**核心原则** 🎯：复用 Solid 文件系统的原生能力

**已确认** ✅（参考 [1.3 文件系统的原生元数据](#13-文件系统的原生元数据)）：
- 文件内容和基础元数据 → Solid 文件系统原生提供
- 扩展元数据（LinX 特有） → 仅在需要时用 RDF 存储

**存储结构**：

```
Pod：
├── files/
│   ├── report.pdf                    # 文件（带 HTTP headers 元数据）
│   └── photo.jpg                     # 文件（带 HTTP headers 元数据）
│
└── extended-metadata/
    └── file-annotations.ttl          # 仅存储扩展信息（标签、描述等）

LinX 本地：
└── ~/LinX/cache/files/
    ├── report.pdf                    # 本地副本
    └── photo.jpg                     # 本地副本
```

**获取文件信息的方式**：

1. **基础元数据**（从文件系统）：
   ```typescript
   // HEAD 请求获取
   const response = await fetch(fileUri, { method: 'HEAD' });
   const name = fileUri.split('/').pop();
   const mimeType = response.headers.get('Content-Type');
   const size = response.headers.get('Content-Length');
   const modified = response.headers.get('Last-Modified');
   ```

2. **扩展元数据**（从 RDF，仅在需要时）：
   ```sparql
   SELECT ?title ?tags ?starred WHERE {
     <https://alice.pod.example/files/report.pdf>
       dcterms:title ?title ;
       linx:tags ?tags ;
       linx:starred ?starred .
   }
   ```

**File 模型的简化**：
- ❌ 不存储文件名、大小、MIME 类型等（文件系统已有）
- ✅ 仅存储用户自定义的扩展信息（标题、标签、星标等）
- ✅ 存储 LinX 特有的状态（本地路径、同步状态等）

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

### 6.0 什么可以被收藏？🤔

**需要对齐的问题**：

在我之前的设计中，Favorite 模型支持收藏：
- 消息（message）
- 文件（file）
- 联系人（contact）
- 外部链接（link）
- 笔记（note）

**但首先需要明确几个问题**：

#### 问题 1：收藏的本质是什么？

**方案 A：收藏 = 书签（Bookmark）**
```
收藏就是"标记这个资源很重要"
类似于浏览器书签、文件夹中的星标

特点：
- 只存储 URI 引用
- 不保存内容副本
- 原始资源删除后，收藏失效
```

**方案 B：收藏 = 归档（Archive）**
```
收藏就是"保存这个内容的副本"
类似于保存网页、下载文件

特点：
- 存储内容快照
- 原始资源删除后，收藏仍可查看
- 占用更多存储空间
```

**方案 C：混合模式**
```
- 对于文件：引用（不复制）
- 对于消息：快照（保留内容）
- 对于链接：快照（保存网页内容）
```

#### 问题 2：在 LinX 的场景下，用户想收藏什么？

**场景思考**：

1. **收藏消息**
   ```
   场景：用户在聊天中看到重要信息
   期望：以后能快速找到这条消息
   
   问题：
   - 如果对方删除了这条消息，用户还能看到吗？
   - 如果是群聊消息，收藏的是消息本身还是讨论串？
   ```

2. **收藏文件**
   ```
   场景：用户想标记重要文档
   期望：在收藏夹中快速访问
   
   问题：
   - 是标记（star）还是复制（copy）？
   - 如果文件在 Pod 中，收藏是否就是"star"标记？
   ```

3. **收藏联系人**
   ```
   场景：用户想标记常用联系人
   期望：快速访问这些联系人
   
   问题：
   - 这是否就是"置顶联系人"或"分组"？
   - 是否需要单独的"收藏"，还是用联系人的属性就够了？
   ```

4. **收藏外部链接**
   ```
   场景：用户在聊天中看到有用的网址
   期望：保存到收藏夹
   
   问题：
   - 只存 URL，还是要保存网页快照？
   - 这是否就是"浏览器书签"功能？
   ```

5. **收藏笔记**
   ```
   场景：用户想保存灵感或想法
   期望：随时查看
   
   问题：
   - 这是否应该是单独的"笔记"功能？
   - 还是说"笔记"就是一种特殊的收藏？
   ```

#### 问题 3：Solid 中已有的标准是什么？

**待研究** 📋：
- [ ] Solid 社区是否有 Bookmark 的标准？
- [ ] SolidOS 如何实现书签/收藏？
- [ ] 是否有标准的 Bookmark 词汇表（W3C Annotation？）
- [ ] 文件的"星标"是否有标准实现？

#### 问题 4：收藏的两层含义

**重要理解** 🎯：

> 收藏需要支持两种场景：
> 1. LinX 内部资源的快速标记（starred 属性）
> 2. 跨应用的收藏集合（独立的 Bookmark/Favorite 实体）

**场景 1：LinX 内部的快速标记**

```
File (文件)
├── starred: true              ← 快速标记
└── starredAt: "2024-11-07"

Message (消息)
├── starred: true              ← 快速标记
└── starredAt: "2024-11-07"
```

**用途**：
- 在文件列表中快速筛选重要文件
- 在消息中标记重要信息
- 不需要额外的描述或分类

**场景 2：跨应用的收藏集合**

```
Bookmark/Favorite (独立实体)
├── targetUri: string              ← 可以指向任何 URI
│   └── 例如：其他 Solid 应用的资源
├── title: string                  ← 用户自定义标题
├── description: string            ← 用户添加的描述
├── tags: string[]                 ← 标签
├── folder: string                 ← 分组/文件夹
├── source: string                 ← 来源应用（"linx", "solidOS", "external"）
└── createdAt: timestamp
```

**用途**：
- 收集来自不同 Solid 应用的资源
- 需要添加注释和分类
- 需要组织成文件夹
- 支持外部链接（非 Pod 资源）

**示例场景**：

```
用户的收藏夹包含：

1. LinX 的消息
   - targetUri: "https://alice.pod/linx/messages/msg-123"
   - source: "linx"
   - title: "重要的项目讨论"

2. SolidOS 的文档
   - targetUri: "https://alice.pod/documents/report.pdf"
   - source: "solidOS"
   - title: "2024 年度报告"

3. 外部网页
   - targetUri: "https://example.com/article"
   - source: "external"
   - title: "有用的文章"
   - snapshot: "..." (可选快照)
```

**关键区别**：

| 特性 | starred 属性 | Bookmark 实体 |
|------|-------------|--------------|
| **用途** | 快速标记 | 完整的收藏管理 |
| **范围** | 仅 LinX 内部资源 | 任何 URI（跨应用） |
| **元数据** | 最小（只有时间戳） | 丰富（标题、描述、标签、文件夹） |
| **查询** | 直接过滤 | 需要查询 Bookmark 表 |
| **组织** | 无 | 支持文件夹/标签 |
| **互操作** | LinX 专用 | Solid 生态通用 |

### 6.1 双层设计：属性 + 实体 ✅

**最终方案**：同时支持两种方式

#### 6.1.1 第一层：starred 属性（快速标记）

用于 LinX 内部资源的快速标记：

```turtle
# 文件的扩展元数据
<../files/report.pdf>
  linx:starred true ;
  linx:starredAt "2024-11-07T10:30:00Z"^^xsd:dateTime .

# 消息
<../messages/msg-123>
  linx:starred true ;
  linx:starredAt "2024-11-07T15:20:00Z"^^xsd:dateTime .
```

**查询**：
```typescript
// 快速筛选已标记的文件
const starredFiles = await db
  .select()
  .from(fileTable)
  .where(eq(fileTable.starred, true));
```

#### 6.1.2 第二层：Bookmark 实体（完整收藏）

用于跨应用的收藏管理：

```turtle
# /bookmarks/bookmark-1.ttl
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix bookmark: <http://www.w3.org/2002/01/bookmark#> .
@prefix linx: <https://linx.ai/ns#> .

<#bookmark-1> a bookmark:Bookmark ;
  dcterms:title "重要的项目讨论" ;
  dcterms:description "关于新功能的讨论" ;
  bookmark:recalls <https://alice.pod/linx/messages/msg-123> ;
  linx:source "linx" ;
  linx:tags "工作", "项目" ;
  linx:folder "工作" ;
  dcterms:created "2024-11-07T10:30:00Z"^^xsd:dateTime .

<#bookmark-2> a bookmark:Bookmark ;
  dcterms:title "2024 年度报告" ;
  bookmark:recalls <https://alice.pod/documents/report.pdf> ;
  linx:source "solidOS" ;
  linx:folder "文档" ;
  dcterms:created "2024-11-07T11:00:00Z"^^xsd:dateTime .

<#bookmark-3> a bookmark:Bookmark ;
  dcterms:title "有用的技术文章" ;
  bookmark:recalls <https://example.com/article> ;
  linx:source "external" ;
  linx:tags "学习", "技术" ;
  dcterms:created "2024-11-07T12:00:00Z"^^xsd:dateTime .
```

**使用标准**：W3C Bookmark Ontology
- 命名空间：`http://www.w3.org/2002/01/bookmark#`
- 核心属性：`bookmark:Bookmark`, `bookmark:recalls`

**待研究** 📋：
- [ ] 确认 W3C Bookmark 是否是 Solid 社区的标准
- [ ] 查看 SolidOS 如何实现书签
- [ ] 研究其他 Solid 应用的书签格式

### 6.2 starred 和收藏夹的关系 🤔

**核心问题**：标星的资源在收藏夹中如何处理？

#### 方案 A：starred 自动出现在收藏夹

```typescript
// 收藏夹 = 所有 starred 的资源 + Bookmark 实体
const favorites = {
  // 自动聚合 starred 资源
  starred: {
    files: await getStarredFiles(),
    messages: await getStarredMessages(),
  },
  // Bookmark 实体
  bookmarks: await getBookmarks(),
};
```

**UI 展示**：
```
收藏夹
├── 文件 (3)           ← starred 文件自动显示
│   ├── ⭐ report.pdf
│   ├── ⭐ notes.txt
│   └── ⭐ photo.jpg
├── 消息 (2)           ← starred 消息自动显示
│   ├── ⭐ 重要讨论
│   └── ⭐ 项目信息
└── 书签 (5)           ← Bookmark 实体
    ├── 📑 SolidOS 文档
    ├── 🔗 外部链接
    └── ...
```

**特点**：
- ✅ 简单直观
- ✅ starred 资源自动在收藏夹中可见
- ❌ 无法为 starred 资源添加注释/分组
- ❌ 收藏夹中两种类型混杂

#### 方案 B：starred 和收藏分离

```typescript
// starred 属性只在各自列表中显示
// 收藏夹只显示 Bookmark 实体
const favorites = await getBookmarks();
```

**UI 展示**：
```
文件列表
├── ⭐ report.pdf      ← starred 只在这里显示
├── ⭐ notes.txt
└── photo.jpg

收藏夹 (独立)
├── 📑 2024 年度报告   ← Bookmark（需要手动创建）
├── 🔗 有用的文章
└── 💬 重要讨论
```

**特点**：
- ✅ 概念清晰（标星 ≠ 收藏）
- ✅ 收藏夹可以有丰富的元数据
- ❌ 用户需要理解两个概念
- ❌ 标星的资源不会自动在收藏夹中

#### 方案 C：starred 可升级为收藏 ⭐ 推荐

```typescript
// 用户标星时：只设置 starred 属性
file.starred = true;

// 用户"添加到收藏夹"时：创建 Bookmark
const bookmark = {
  targetUri: file.uri,
  title: file.name,  // 可以编辑
  source: "linx",
  // 可以添加描述、标签、文件夹
};
```

**UI 展示**：
```
文件列表
├── ⭐ report.pdf      ← 标星（本地快捷标记）
│   └── [添加到收藏夹] ← 可升级
├── ⭐ notes.txt
└── photo.jpg

收藏夹 (仅显示 Bookmark)
├── 📑 2024 年度报告   ← 从 starred 升级的
│   └── 描述："重要文档"
│   └── 标签：工作、报告
├── 🔗 外部文章
└── 💬 项目讨论
```

**操作流程**：
1. **快速标星**：在文件列表点击星标 → `starred = true`
2. **添加到收藏夹**：右键 → "添加到收藏夹" → 创建 Bookmark
3. **编辑收藏**：在收藏夹中可以添加描述、标签、分组

**特点**：
- ✅ 概念分层：starred（快速）→ 收藏（完整）
- ✅ 收藏夹内容可控
- ✅ 可以为收藏添加丰富信息
- ✅ 支持跨应用资源
- ❌ 需要两步操作

### 6.3 重新理解：收藏夹 = Pod 中的文件夹 ✅

**关键洞察** 🎯（用户提出）：

> 收藏夹应该对应 Pod 中的一个实际文件夹 `/favorites/`

#### 理解 1：往收藏夹放文件 = 自动 starred

```
Pod 结构：
├── files/
│   ├── report.pdf          ← 原始文件
│   └── photo.jpg
│
└── favorites/              ← 收藏夹文件夹（LDP Container）
    ├── report.pdf          ← 引用或副本
    ├── photo.jpg           
    └── article.webloc      ← 外部链接保存为文件
```

**关系**：
```
文件在 /favorites/ 中  ≈  自动 starred
```

**实现方式**：
- 方式 A：复制文件到 `/favorites/`（占用空间）
- 方式 B：创建符号链接/引用（推荐 ✅）
- 方式 C：只记录 URI，不实际移动文件

#### 理解 2：网络收藏 = URL 文件

对于外部链接，保存为 Pod 中的"文件"：

```
/favorites/
├── article.webloc          ← macOS 风格的 URL 文件
│   内容：
│   <?xml version="1.0"?>
│   <plist>
│     <dict>
│       <key>URL</key>
│       <string>https://example.com/article</string>
│     </dict>
│   </plist>
│
├── useful-page.url         ← Windows 风格的 URL 文件
│   内容：
│   [InternetShortcut]
│   URL=https://example.com/page
│
└── archived-page.html      ← 或者保存网页快照
```

**好处**：
- ✅ 外部链接变成 Pod 中的"文件"
- ✅ 可以留档一份内容（HTML 快照）
- ✅ 统一的文件系统接口
- ✅ 可以添加元数据（.meta 文件）

#### 理解 3：starred vs 收藏夹

```
starred 属性：
├── 标记但不移动
├── 文件仍在原位置
├── 只是添加 starred: true 属性
└── 用于列表中的快速筛选

收藏夹文件夹：
├── 实际的文件夹 /favorites/
├── 包含文件或链接（引用）
├── 可以有子文件夹组织
└── 跨应用可见
```

**示例**：

```
用户操作：
1. 在文件列表标星 report.pdf
   → 只设置 starred: true
   → 文件仍在 /files/report.pdf

2. 将 report.pdf 添加到收藏夹
   → 在 /favorites/ 中创建引用或副本
   → 自动设置 starred: true（可选）

3. 从网页收藏链接
   → 在 /favorites/ 创建 article.webloc
   → 可选：下载 HTML 快照
```

### 6.4 基于文件系统的收藏实现 ✅

**最终设计**：

```
Pod 结构：
├── files/                      # 用户文件
│   ├── report.pdf
│   └── photo.jpg
│
├── favorites/                  # 收藏夹（LDP Container）
│   ├── work/                   # 子文件夹：工作相关
│   │   ├── report.pdf.ref      # 引用到 ../files/report.pdf
│   │   └── meeting-notes.webloc
│   │
│   ├── reading/                # 子文件夹：阅读材料
│   │   ├── article1.html       # 保存的网页
│   │   └── article2.url
│   │
│   └── important/              # 子文件夹：重要内容
│       └── photo.jpg.ref
│
└── extended-metadata/
    └── file-annotations.ttl    # 包含 starred 信息
```

**文件引用格式**（.ref 文件）：

```turtle
# /favorites/work/report.pdf.ref
@prefix ldp: <http://www.w3.org/ns/ldp#> .
@prefix schema: <http://schema.org/> .

<> a schema:DigitalDocument ;
  schema:url <../../files/report.pdf> ;
  schema:name "2024 年度报告" ;
  schema:description "重要文档" .
```

**外部链接格式**（.webloc 或 .url）：

```xml
<!-- /favorites/reading/article.webloc -->
<?xml version="1.0"?>
<plist version="1.0">
  <dict>
    <key>URL</key>
    <string>https://example.com/article</string>
    <key>title</key>
    <string>有用的技术文章</string>
  </dict>
</plist>
```

**实现代码**：

```typescript
// 添加文件到收藏夹
async function addFileToFavorites(file: File, folder: string = "") {
  const favPath = `/favorites/${folder}/${file.name}.ref`;
  
  // 创建引用文件
  await createReference(favPath, {
    targetUri: file.uri,
    title: file.name,
    description: "", // 用户可添加
  });
  
  // 可选：同时设置 starred
  file.starred = true;
  await updateFile(file);
}

// 添加外部链接到收藏夹
async function addLinkToFavorites(url: string, title: string) {
  const favPath = `/favorites/${sanitize(title)}.webloc`;
  
  // 保存为 URL 文件
  await saveUrlFile(favPath, { url, title });
  
  // 可选：下载网页快照
  const html = await fetchPage(url);
  await saveFile(`${favPath}.html`, html);
}

// 查询收藏夹内容
async function getFavorites() {
  return await listContainer("/favorites/", {
    recursive: true,  // 包含子文件夹
  });
}
```

**好处**：
1. ✅ 完全基于 Solid 文件系统
2. ✅ 不需要额外的 Bookmark 表
3. ✅ 自动跨应用兼容（其他应用看到的是文件夹）
4. ✅ 支持文件夹组织
5. ✅ 可以保存外部内容快照
6. ✅ starred 和收藏夹独立但可关联

### 6.5 .ref 和 .webloc 文件格式详解

#### 6.5.1 什么是 .webloc 文件？

**定义**：`.webloc` 是 macOS 的标准 URL 书签文件格式

**现有标准** ✅：
- macOS 原生支持（Safari、Finder）
- XML 格式（Property List）
- 双击可以在浏览器中打开

**文件结构**：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" 
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>URL</key>
  <string>https://example.com/article</string>
</dict>
</plist>
```

**扩展版本**（可以添加更多元数据）：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>URL</key>
  <string>https://solidproject.org/developers/tutorials</string>
  
  <!-- 可选：LinX 扩展 -->
  <key>title</key>
  <string>Solid 开发教程</string>
  
  <key>description</key>
  <string>学习 Solid 协议的最佳资源</string>
  
  <key>dateAdded</key>
  <date>2024-11-07T10:30:00Z</date>
  
  <key>tags</key>
  <array>
    <string>学习</string>
    <string>Solid</string>
  </array>
</dict>
</plist>
```

**在 LinX 中的用途**：
- ✅ 保存外部网页链接
- ✅ 收藏 Solid 生态中其他应用的资源
- ✅ macOS/iOS 跨平台兼容
- ✅ 可以添加元数据（标题、描述、标签）

**Windows 替代方案**（`.url` 文件）：

```ini
[InternetShortcut]
URL=https://example.com/article
IconIndex=0
IconFile=C:\Windows\System32\url.dll
```

---

#### 6.5.2 什么是 .ref 文件？⚠️

**定义**：`.ref` 是我们提出的"引用文件"格式

**状态** 🤔：
- ❌ **不是**现有的标准格式
- 🔍 需要研究 Solid 社区是否有类似机制
- 💡 可能的替代方案：符号链接、RDF 引用

**设计目的**：

在收藏夹中引用 Pod 里的其他文件，而不复制文件内容：

```
/files/report.pdf         ← 原始文件（100MB）
/favorites/report.pdf.ref ← 引用文件（1KB）
    ↓ 指向
原始文件
```

**可能的实现方式**：

##### 方式 1：RDF 文件（推荐 ✅）

```turtle
# /favorites/work/report.pdf.ref
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix schema: <http://schema.org/> .
@prefix dcterms: <http://purl.org/dc/terms/> .

<> a schema:DigitalDocument ;
  rdfs:seeAlso <../../files/report.pdf> ;
  schema:name "2024 年度报告" ;
  dcterms:description "重要文档，需要定期更新" ;
  dcterms:created "2024-11-07T10:30:00Z"^^xsd:dateTime ;
  schema:keywords "工作", "报告" .
```

**MIME 类型**：`text/turtle` 或 `application/ld+json`

##### 方式 2：JSON-LD（更通用）

```json
{
  "@context": "https://schema.org/",
  "@type": "DigitalDocument",
  "url": "../../files/report.pdf",
  "name": "2024 年度报告",
  "description": "重要文档",
  "dateCreated": "2024-11-07T10:30:00Z",
  "keywords": ["工作", "报告"]
}
```

**MIME 类型**：`application/ld+json`

##### 方式 3：简单 JSON（非标准）

```json
{
  "type": "reference",
  "target": "../../files/report.pdf",
  "title": "2024 年度报告",
  "description": "重要文档",
  "tags": ["工作", "报告"],
  "created": "2024-11-07T10:30:00Z"
}
```

**MIME 类型**：`application/json`

---

#### 6.5.3 符号链接的可能性

**Unix/Linux 符号链接**：

```bash
ln -s /files/report.pdf /favorites/report.pdf
```

**问题** ❌：
- Solid Pod 的 HTTP 接口可能不支持符号链接
- 跨平台兼容性问题
- Web 环境无法直接创建符号链接

---

#### 6.5.4 Solid 社区的现有方案 🔍

**待研究** 📋：

1. **LDP 的引用机制**
   - LDP 是否有标准的"链接"或"引用"资源类型？
   - 查看 LDP 规范中的 `ldp:membershipResource`

2. **SolidOS 的实现**
   - SolidOS 如何处理文件夹中的快捷方式？
   - 是否有现成的引用机制？

3. **Web Annotation**
   - W3C Web Annotation 标准
   - 可以用来"标注"任何 URI

**Web Annotation 示例**：

```json
{
  "@context": "http://www.w3.org/ns/anno.jsonld",
  "type": "Annotation",
  "motivation": "bookmarking",
  "body": {
    "type": "TextualBody",
    "value": "重要文档",
    "format": "text/plain"
  },
  "target": "https://alice.pod.example/files/report.pdf"
}
```

---

#### 6.5.5 Solid 原生的引用机制 ✅

**关键理解** 🎯（用户指出）：

> LDP Container 通过元数据记录它的子资源（children），子资源可以是任意 WebID/URI，这就是引用！

**不需要创建引用文件**，直接在 Container 元数据中记录：

```turtle
# /favorites/ 容器的元数据
@prefix ldp: <http://www.w3.org/ns/ldp#> .
@prefix dcterms: <http://purl.org/dc/terms/> .

<> a ldp:Container ;
  ldp:contains <../files/report.pdf> ;          # 引用 Pod 内文件
  ldp:contains <https://example.com/article> ;  # 引用外部 URL
  ldp:contains <https://other.pod/doc.pdf> ;    # 引用其他 Pod
  dcterms:title "我的收藏夹" .
```

**LDP Container 的原生能力**：
- ✅ `ldp:contains` 可以指向任意 URI
- ✅ 不需要物理复制文件
- ✅ 自动跨应用兼容
- ✅ 这就是 Solid 的标准做法

**实现示例**：

```typescript
// 添加文件到收藏夹
async function addToFavorites(resourceUri: string) {
  const favoritesContainer = "https://alice.pod.example/favorites/";
  
  // 直接在 Container 元数据中添加引用
  await addContainsMember(favoritesContainer, resourceUri);
  
  // 不需要创建任何 .ref 或 .ttl 文件！
}

// 查询收藏夹内容
async function getFavorites() {
  const favoritesContainer = "https://alice.pod.example/favorites/";
  
  // 读取 Container 元数据中的 ldp:contains
  const members = await getContainerMembers(favoritesContainer);
  
  return members; // 返回所有被引用的 URI
}
```

**子文件夹的组织**：

```
Pod 结构：
└── favorites/                       # 主收藏夹容器
    ├── .meta                        # Container 元数据
    │   └── ldp:contains 引用列表
    │
    ├── work/                        # 子容器：工作
    │   └── .meta
    │       └── ldp:contains <../../files/report.pdf>
    │
    └── reading/                     # 子容器：阅读
        └── .meta
            └── ldp:contains <https://example.com/article>
```

**外部链接的处理**：

对于外部 URL，有两种方式：

**方式 1：直接引用**（简单 ✅）
```turtle
# /favorites/.meta
<> ldp:contains <https://example.com/article> .
```

**方式 2：保存为 .webloc**（可留档）
```
/favorites/
└── article.webloc     # 实际文件，包含 URL 和元数据
```

**推荐**：
- 简单引用 → 用 `ldp:contains`
- 需要留档 → 创建 `.webloc` 或 `.html` 文件

---

**最终方案总结** ✅：

| 场景 | 解决方案 | 说明 |
|------|---------|------|
| **Pod 内文件** | Container 元数据引用 | `ldp:contains <../files/report.pdf>` |
| **其他 Pod 资源** | Container 元数据引用 | `ldp:contains <https://other.pod/doc>` |
| **外部 URL（简单）** | Container 元数据引用 | `ldp:contains <https://example.com>` |
| **外部 URL（留档）** | `.webloc` 文件 | 保存元数据和快照 |
| **网页快照** | `.html` 文件 | 完整保存网页内容 |

**好处**：
1. ✅ 使用 Solid 原生的 LDP Container 机制
2. ✅ 不需要创建 `.ref` 或额外的 `.ttl` 文件
3. ✅ 完全符合 Solid 标准
4. ✅ 自动跨应用兼容
5. ✅ 简单高效

### 6.6 结构化数据的引用和展示 🤔

**用户提出的问题**：

> 1. 结构化数据在 .ttl 文件中只是一小部分（不是整个文件），如何引用？
> 2. 收藏夹下展示的是卡片吗？
> 3. 文件的收藏和多层文件夹如何处理？

#### 6.6.1 引用 RDF 资源中的具体实体

**场景说明**：

一个 .ttl 文件可能包含多个资源：

```turtle
# /messages/chat-123.ttl
@prefix sioc: <http://rdfs.org/sioc/ns#> .
@prefix dcterms: <http://purl.org/dc/terms/> .

<#msg-001> a sioc:Post ;
  sioc:content "第一条消息" ;
  dcterms:created "2024-11-07T10:00:00Z"^^xsd:dateTime .

<#msg-002> a sioc:Post ;
  sioc:content "第二条消息" ;
  dcterms:created "2024-11-07T10:05:00Z"^^xsd:dateTime .

<#msg-003> a sioc:Post ;
  sioc:content "重要的消息！" ;
  dcterms:created "2024-11-07T10:10:00Z"^^xsd:dateTime .
```

**收藏某条具体消息**：

使用 URI Fragment（#）引用具体资源：

```turtle
# /favorites/.meta
<> a ldp:Container ;
  ldp:contains <../messages/chat-123.ttl#msg-003> .  # 引用具体的消息
```

**完整 URI**：
```
https://alice.pod.example/messages/chat-123.ttl#msg-003
                                              ↑
                                          Fragment ID
```

#### 6.6.2 收藏夹的视图设计难题 🤔

**用户提出的核心问题**：

> 1. 用卡片视图还是文件夹视图？
> 2. 如果是卡片，怎么展示文件夹？
> 3. 如果是文件夹视图，怎么展示文件片段（消息、联系人）？

这是一个**核心 UI 设计决策** ⚠️

---

#### 方案 A：统一卡片视图（推荐 ✅）

**设计理念**：万物皆卡片，文件夹也是卡片

**视觉设计**：

```
┌─────────────────────────────────────────────────────┐
│ 收藏夹 > 工作                            [网格] [列表] │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ 📁       │  │ 📄       │  │ 💬       │          │
│  │ 报告     │  │ 年度报告 │  │ 项目讨论 │          │
│  │          │  │ 5.2 MB   │  │ Alice    │          │
│  │ 3 项     │  │ PDF      │  │ 10/07    │          │
│  └──────────┘  └──────────┘  └──────────┘          │
│   ↑ 文件夹      ↑ 文件        ↑ 消息片段           │
│                                                      │
│  ┌──────────┐  ┌──────────┐                        │
│  │ 👤       │  │ 🔗       │                        │
│  │ Bob      │  │ Solid教程│                        │
│  │ 合作伙伴 │  │ solidp...│                        │
│  │ ⭐⭐⭐    │  │ 外部链接 │                        │
│  └──────────┘  └──────────┘                        │
│   ↑ 联系人      ↑ 外部链接                         │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**关键设计**：

1. **文件夹用卡片表示**
   - 文件夹图标 📁
   - 显示文件夹名称
   - 显示内容数量（"3 项"）
   - 点击进入下一层

2. **文件用卡片表示**
   - 文件类型图标（PDF、图片等）
   - 文件名
   - 文件大小
   - 缩略图（图片/视频）

3. **RDF 片段用卡片表示**
   - 消息：内容预览 + 发送者 + 时间
   - 联系人：头像 + 姓名 + 标签
   - 点击跳转到具体位置

**优点**：
- ✅ 视觉统一，所有内容都是卡片
- ✅ 可以展示丰富的预览信息
- ✅ 支持多层文件夹（面包屑导航）
- ✅ 类似 macOS Finder 的图标视图

**缺点**：
- ❌ 不适合大量条目（文件夹很多时）
- ❌ 文件夹和内容混在一起可能混乱

---

#### 方案 B：文件列表 + 类型标识

**设计理念**：类似传统文件管理器，但支持多种资源类型

**视觉设计**：

```
┌─────────────────────────────────────────────────────┐
│ 收藏夹 > 工作                                        │
├──────┬──────────────────────┬─────────┬────────────┤
│ 类型 │ 名称                 │ 大小    │ 修改时间   │
├──────┼──────────────────────┼─────────┼────────────┤
│ 📁   │ 报告                 │ 3 项    │ 2024/11/07 │
│ 📁   │ 会议                 │ 5 项    │ 2024/11/06 │
│ 📄   │ 2024 年度报告        │ 5.2 MB  │ 2024/11/05 │
│ 💬   │ "关于新功能的讨论..." │ 消息    │ 2024/11/07 │
│      │ └─ 来自：Alice        │         │            │
│ 👤   │ Bob (合作伙伴)       │ 联系人  │ 2024/11/01 │
│ 🔗   │ Solid 开发教程       │ 外部    │ 2024/10/30 │
└──────┴──────────────────────┴─────────┴────────────┘
```

**关键设计**：

1. **文件夹显示为行**
   - 文件夹图标 + 名称 + 项目数

2. **文件显示为行**
   - 文件类型图标 + 名称 + 大小

3. **RDF 片段显示为行**
   - 特殊图标 + 内容预览（缩进）
   - "大小"列显示类型（消息/联系人/链接）

**优点**：
- ✅ 适合大量条目
- ✅ 可排序、筛选
- ✅ 信息密度高
- ✅ 类似传统文件管理器

**缺点**：
- ❌ 缺少丰富的预览
- ❌ RDF 片段的展示受限（只能显示一行预览）
- ❌ 视觉吸引力较弱

---

#### 方案 C：混合视图（类似 Notion）✅ 推荐

**设计理念**：左侧文件夹树 + 右侧卡片/列表

**视觉设计**：

```
┌─────────────┬────────────────────────────────────────┐
│ 收藏夹      │ 工作                       [网格][列表]│
│             │                                         │
│ 📁 工作 ◄   │  ┌──────────┐  ┌──────────┐           │
│   📁 报告   │  │ 📄       │  │ 💬       │           │
│   📁 会议   │  │ 年度报告 │  │ 项目讨论 │           │
│             │  │ 5.2 MB   │  │ Alice    │           │
│ 📁 个人     │  │ PDF      │  │ 10/07    │           │
│             │  └──────────┘  └──────────┘           │
│ 📁 学习     │                                        │
│             │  ┌──────────┐  ┌──────────┐           │
│             │  │ 👤       │  │ 🔗       │           │
│             │  │ Bob      │  │ Solid教程│           │
│             │  │ 合作伙伴 │  │ solidp...│           │
│             │  └──────────┘  └──────────┘           │
│             │                                        │
└─────────────┴────────────────────────────────────────┘
```

**关键设计**：

1. **左侧：文件夹树导航**
   - 显示所有文件夹层级
   - 可折叠/展开
   - 当前选中文件夹高亮

2. **右侧：当前文件夹内容（卡片）**
   - 只显示资源，不显示子文件夹（子文件夹在左侧树中）
   - 卡片视图：丰富预览
   - 列表视图：紧凑显示

3. **RDF 片段自然融入卡片**
   - 消息卡片、联系人卡片、文件卡片混合显示

**优点**：
- ✅ 文件夹导航清晰（左侧树）
- ✅ 内容展示丰富（右侧卡片）
- ✅ 不会混淆（文件夹和内容分离）
- ✅ 支持视图切换（网格/列表）
- ✅ 类似 Notion、Bear 等现代应用

**缺点**：
- ❌ 需要更多屏幕空间
- ❌ 移动端适配复杂

---

#### 方案 D：视图切换（最灵活）

**设计理念**：提供多种视图模式，用户选择

```
视图模式：
├── 网格视图（方案 A）     ← 文件夹和资源都是卡片
├── 列表视图（方案 B）     ← 紧凑的列表
└── 分栏视图（方案 C）     ← 左侧树 + 右侧卡片
```

**类似 macOS Finder**：
- 图标视图 (Icon View)
- 列表视图 (List View)
- 列视图 (Column View)
- 画廊视图 (Gallery View)

---

#### 用户的关键洞察 🎯

**用户提出的核心问题**：

> 如果收藏夹是文件树形式，文件管理也是文件树形式，何必搞两个？

**这是一个架构级别的设计决策！** ⚠️

---

### 6.6.2.2 统一的资源浏览器 ✅ 重新设计

**核心理念**：

LinX 应该提供**统一的资源浏览器**，而不是分散的"文件管理器"、"收藏夹"等多个独立视图。

**类比**：macOS Finder

```
┌────────────┬─────────────────────────────────────┐
│ 个人收藏   │ 工作/报告/                           │
│ 下载       │                                      │
│ 文档       │ ┌────────┐ ┌────────┐ ┌────────┐   │
│ 桌面       │ │ 📄     │ │ 💬     │ │ 📄     │   │
│ ────────   │ │ 报告   │ │ 讨论   │ │ 摘要   │   │
│ 位置       │ └────────┘ └────────┘ └────────┘   │
│ ├ 💾 Pod   │                                      │
│ │ ├ 📁 文件│                                      │
│ │ ├ ⭐ 收藏│                                      │
│ │ ├ 💬 聊天│                                      │
│ │ └ 👤 联系│                                      │
│ └ 🌐 其他Pod│                                     │
└────────────┴─────────────────────────────────────┘
```

**关键设计**：

1. **左侧边栏**：快捷入口 + Pod 结构树
   - **快捷入口**（类似 Finder 的"个人收藏"）
     - ⭐ 收藏夹 → `/favorites/`
     - 📁 文件 → `/files/`
     - 💬 聊天 → `/messages/`
     - 👤 联系人 → `/contacts/`
     - 📥 下载 → `/downloads/`
   
   - **位置**（类似 Finder 的"位置"）
     - 💾 我的 Pod（完整的文件树）
     - 🌐 其他 Pod（如果有访问权限）

2. **右侧主视图**：当前文件夹的内容
   - 网格视图 / 列表视图 / 详情视图（可切换）
   - 智能显示：文件、消息片段、联系人、链接等

3. **统一的浏览器**：
   - 无论浏览哪个文件夹，UI 一致
   - 只是数据源不同（`/files/` vs `/favorites/`）

---

#### 统一浏览器的架构设计

```typescript
// 统一的资源浏览器
interface ResourceBrowser {
  // 左侧边栏
  sidebar: {
    // 快捷入口
    shortcuts: Shortcut[];
    
    // Pod 文件树
    pods: Pod[];
  };
  
  // 当前浏览位置
  currentLocation: {
    podUri: string;        // https://alice.pod.example
    containerPath: string; // /favorites/work/reports/
    fullUri: string;       // https://alice.pod.example/favorites/work/reports/
  };
  
  // 主视图
  mainView: {
    viewMode: 'grid' | 'list' | 'columns' | 'gallery';
    items: ResourceItem[];     // 当前文件夹内容
    selectedItem?: ResourceItem;
  };
  
  // 详情面板（可选）
  detailPanel?: {
    item: ResourceItem;
    content: React.ReactNode;
  };
}

// 快捷入口
interface Shortcut {
  id: string;
  icon: string;
  label: string;
  path: string;           // 相对路径
  type: 'favorites' | 'files' | 'messages' | 'contacts' | 'custom';
}

// 资源项（文件、文件夹、RDF 片段）
interface ResourceItem {
  uri: string;
  type: 'container' | 'file' | 'rdf-resource';
  
  // 基础元数据
  name: string;
  created: Date;
  modified: Date;
  
  // 类型特定数据
  metadata: FileMetadata | MessageMetadata | ContactMetadata | LinkMetadata;
  
  // 预览
  preview?: {
    thumbnail?: string;
    description?: string;
  };
}
```

---

#### 视觉对比

**之前的设计（分散）**：

```
LinX 应用
├── 文件管理器（独立页面）
│   └── 树状视图 + 文件列表
├── 收藏夹（独立页面）
│   └── 树状视图 + 卡片列表
├── 聊天（独立页面）
└── 联系人（独立页面）
```

**新设计（统一）**：

```
LinX 资源浏览器（类似 Finder）
├── 侧边栏
│   ├── 快捷入口
│   │   ├ ⭐ 收藏夹 → /favorites/
│   │   ├ 📁 文件 → /files/
│   │   ├ 💬 聊天 → /messages/
│   │   └ 👤 联系人 → /contacts/
│   └── 位置
│       └ 💾 我的 Pod（完整树）
│
└── 主视图（根据当前位置显示内容）
    └── 支持多种资源类型（文件/消息/联系人）
```

---

#### 实现示例

```typescript
// 统一的资源浏览器组件
function ResourceBrowser() {
  const [currentPath, setCurrentPath] = useState('/favorites/');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  return (
    <div className="resource-browser">
      {/* 侧边栏 */}
      <Sidebar>
        {/* 快捷入口 */}
        <Section title="快捷访问">
          <ShortcutItem 
            icon="⭐" 
            label="收藏夹" 
            path="/favorites/"
            active={currentPath === '/favorites/'}
            onClick={() => setCurrentPath('/favorites/')}
          />
          <ShortcutItem 
            icon="📁" 
            label="文件" 
            path="/files/"
            onClick={() => setCurrentPath('/files/')}
          />
          <ShortcutItem 
            icon="💬" 
            label="聊天记录" 
            path="/messages/"
            onClick={() => setCurrentPath('/messages/')}
          />
          <ShortcutItem 
            icon="👤" 
            label="联系人" 
            path="/contacts/"
            onClick={() => setCurrentPath('/contacts/')}
          />
        </Section>
        
        {/* Pod 文件树 */}
        <Section title="位置">
          <PodTree 
            currentPath={currentPath}
            onNavigate={setCurrentPath}
          />
        </Section>
      </Sidebar>
      
      {/* 主视图 */}
      <MainView>
        <Toolbar>
          <Breadcrumbs path={currentPath} />
          <ViewModeToggle mode={viewMode} onChange={setViewMode} />
        </Toolbar>
        
        <ContentArea>
          {viewMode === 'grid' ? (
            <GridView path={currentPath} />
          ) : (
            <ListView path={currentPath} />
          )}
        </ContentArea>
      </MainView>
      
      {/* 详情面板（可选） */}
      <DetailPanel />
    </div>
  );
}

// 通用的内容视图
function GridView({ path }: { path: string }) {
  const items = useContainerContents(path);
  
  return (
    <div className="grid-view">
      {items.map(item => (
        <ResourceCard 
          key={item.uri}
          item={item}
          onClick={() => handleOpen(item)}
        />
      ))}
    </div>
  );
}

// 智能打开资源
function handleOpen(item: ResourceItem) {
  if (item.type === 'container') {
    // 文件夹：导航进去
    navigateTo(item.uri);
  } else if (item.type === 'file') {
    // 文件：打开/下载
    openFile(item.uri);
  } else if (item.type === 'rdf-resource') {
    // RDF 片段：根据类型处理
    const metadata = item.metadata as RdfMetadata;
    if (metadata.rdfType === 'sioc:Post') {
      // 消息：跳转到对话
      jumpToMessage(item.uri);
    } else if (metadata.rdfType === 'vcard:Individual') {
      // 联系人：打开详情
      openContactProfile(item.uri);
    }
  }
}
```

---

#### 统一设计的好处

1. **概念简化** ✅
   - 用户只需要理解"浏览文件夹"
   - 收藏夹、文件、聊天记录都是文件夹
   - 统一的操作方式

2. **代码复用** ✅
   - 一套 UI 组件
   - 一套导航逻辑
   - 一套视图模式

3. **灵活性** ✅
   - 用户可以自由浏览任何 Container
   - 可以在任意位置创建文件夹
   - 可以跨文件夹移动资源

4. **符合 Solid 理念** ✅
   - Pod 就是文件系统
   - LinX 就是一个现代化的文件浏览器
   - 所有资源都是平等的（文件、RDF、链接）

5. **类似成熟产品** ✅
   - macOS Finder：统一的文件浏览器
   - Windows Explorer：统一的资源管理器
   - DEVONthink：统一的文档管理器

---

#### 用户的核心质疑 🤔

**用户提出的问题**：

> 如果收藏的内容和文件一致，打开 /files/ 和打开 /favorites/ 功能一样，那为什么要收藏夹？

**这暴露了设计中的根本问题**：收藏夹不应该只是"另一个文件夹"！

---

### 6.6.2.3 重新定义"收藏"的本质 ✅

**核心问题**：收藏夹应该是什么？

#### 选项 1：收藏夹 = 虚拟聚合视图（推荐 ✅）

**理念**：收藏夹不是物理文件夹，而是一个**虚拟视图**，聚合显示所有 starred 的资源。

```
概念模型：
├── starred 属性（分散在各处）
│   ├── /files/report.pdf → starred: true
│   ├── /messages/chat-1.ttl#msg-5 → starred: true
│   └── /contacts/bob.ttl → starred: true
│
└── 收藏夹视图（虚拟聚合）
    └── 自动聚合所有 starred=true 的资源
```

**视觉设计**：

```
┌────────────┬────────────────────────────────────┐
│ 快捷访问   │ 收藏夹（虚拟视图）                 │
│            │                                     │
│ ⭐ 收藏夹  │ ┌────────┐ ┌────────┐ ┌────────┐  │
│ 📁 文件    │ │ 📄     │ │ 💬     │ │ 👤     │  │
│ 💬 聊天    │ │ 报告   │ │ 讨论   │ │ Bob    │  │
│            │ │/files/ │ │/msgs/  │ │/contct/│  │
│            │ └────────┘ └────────┘ └────────┘  │
│            │  ↑ 来自不同位置的标星资源          │
│            │                                     │
│            │ 筛选：[全部] [文件] [消息] [联系人] │
│            │ 分组：[按类型] [按时间] [按位置]   │
└────────────┴────────────────────────────────────┘
```

**关键特性**：

1. **虚拟聚合**
   - 不物理移动文件
   - 资源保持在原位置
   - 只是聚合显示 starred=true 的资源

2. **跨位置收藏**
   ```typescript
   // 收藏夹视图：查询所有 starred 资源
   function getFavorites() {
     return [
       ...queryStarred('/files/'),      // 文件中的标星
       ...queryStarred('/messages/'),   // 消息中的标星
       ...queryStarred('/contacts/'),   // 联系人中的标星
       ...queryStarred('/external/'),   // 外部资源
     ];
   }
   ```

3. **智能筛选和分组**
   - 按类型：文件/消息/联系人
   - 按时间：今天/本周/本月
   - 按位置：来源文件夹

4. **与文件管理的区别**
   | 特性 | 文件管理 | 收藏夹 |
   |------|---------|--------|
   | **数据来源** | 单个文件夹 | 跨所有位置聚合 |
   | **内容** | 该文件夹的内容 | 所有 starred 资源 |
   | **组织方式** | 物理文件夹层级 | 虚拟分组/筛选 |
   | **修改影响** | 移动文件改变位置 | 取消标星不影响原位置 |

**优点**：
- ✅ 概念清晰：收藏 = 标星，不是移动
- ✅ 不破坏原有组织结构
- ✅ 可以快速收藏任何类型的资源
- ✅ 类似 macOS Finder 的"标记"功能

**缺点**：
- ❌ 无法为收藏添加独立的元数据（描述、标签）
- ❌ 无法组织收藏（文件夹、分组）

---

#### 选项 2：混合模式 - starred + 收藏夹容器 ✅ 推荐

**理念**：同时支持两种收藏方式

**1. 快速标星（虚拟视图）**

在任何资源上点击星标 → 设置 starred=true

```
/files/report.pdf
  linx:starred true

/messages/chat-1.ttl#msg-5
  linx:starred true
```

**2. 添加到收藏夹（物理引用）**

右键 → "添加到收藏夹" → 在 /favorites/ 创建引用

```
/favorites/
  ├── work/
  │   └── ldp:contains </files/report.pdf>
  └── important/
      └── ldp:contains </messages/chat-1.ttl#msg-5>
```

**UI 设计**：

```
┌────────────┬────────────────────────────────────┐
│ 快捷访问   │ 当前视图：收藏夹                   │
│            │                                     │
│ ⭐ 收藏夹  │ [标星的] [收藏夹文件夹]  ← 切换     │
│ │          │                                     │
│ ├─ 全部标星│ 标星的视图（虚拟聚合）:             │
│ └─ 收藏整理│ ┌────────┐ ┌────────┐             │
│            │ │ 📄 报告│ │ 💬 讨论│             │
│ 📁 文件    │ └────────┘ └────────┘             │
│ 💬 聊天    │ [全部] [文件] [消息]               │
│            │                                     │
│            │ 或                                  │
│            │                                     │
│            │ 收藏夹文件夹（物理组织）:           │
│            │ 📁 工作                             │
│            │ 📁 个人                             │
│            │ 📁 学习                             │
└────────────┴────────────────────────────────────┘
```

**操作方式**：

```typescript
// 方式 1：快速标星
async function toggleStar(resourceUri: string) {
  await updateResource(resourceUri, {
    starred: !resource.starred
  });
}

// 方式 2：添加到收藏夹（可选择文件夹）
async function addToFavorites(resourceUri: string) {
  // 弹出对话框选择收藏夹文件夹
  const folder = await selectFavoriteFolder();
  
  // 在该文件夹中添加引用
  await addContainsMember(`/favorites/${folder}/`, resourceUri);
  
  // 可选：同时标星
  await updateResource(resourceUri, { starred: true });
}
```

**与文件管理的区别**：

| 特性 | 文件管理 (/files/) | 收藏夹 |
|------|------------------|--------|
| **内容** | 实际文件 | 引用 + 标星聚合 |
| **操作** | 移动/复制文件 | 标星/创建引用 |
| **组织** | 物理文件夹 | 虚拟视图 + 收藏文件夹 |
| **跨类型** | 只有文件 | 文件+消息+联系人+链接 |

**优点**：
- ✅ 灵活：快速标星 OR 精心组织
- ✅ 分层：标星（轻量）→ 收藏整理（重量）
- ✅ 跨类型：可以收藏任何资源
- ✅ 不影响原有结构

---

#### 选项 3：只用 starred 属性，取消收藏夹

**理念**：收藏 = 标星，不需要独立的收藏夹

```
侧边栏：
├── 📁 文件
├── 💬 聊天
├── 👤 联系人
└── ⭐ 已标星（虚拟视图）← 聚合所有 starred 资源
```

**优点**：
- ✅ 最简单
- ✅ 不重复概念

**缺点**：
- ❌ 无法组织收藏（文件夹、分类）
- ❌ 无法为收藏添加注释

---

#### 最终推荐：选项 2（混合模式）✅

**用户澄清**：是否支持收藏的文件夹视图？

> **答：完全支持！** 方案2同时支持虚拟聚合和文件夹组织。

**设计决策**：

```
LinX 收藏系统 = 两种视图模式

模式 1：全部标星（虚拟聚合）
├── 查询所有 starred=true 的资源
├── 跨所有位置（files/messages/contacts）
├── 支持筛选和分组
└── 用途：快速查看所有重要的东西

模式 2：收藏整理（文件夹视图）✅
├── 实际的 Pod 文件夹：/favorites/
├── 支持多层文件夹嵌套
├── 使用 ldp:contains 引用资源
├── 可以像管理文件一样管理
└── 用途：精心组织、主题分类
```

**视觉示例**：

```
侧边栏收藏夹展开：
┌──────────────────────────────────────────────┐
│ ⭐ 收藏夹                                    │
│  │                                           │
│  ├─ 📊 全部标星  ← 点击显示虚拟聚合视图      │
│  │                                           │
│  └─ 📁 收藏整理  ← 点击显示文件夹树          │
│      ├─ 📁 工作                              │
│      │   ├─ 📁 项目A                         │
│      │   ├─ 📁 项目B                         │
│      │   └─ 📁 会议记录                      │
│      ├─ 📁 学习                              │
│      │   ├─ 📁 Solid 开发                    │
│      │   └─ 📁 TypeScript                    │
│      └─ 📁 个人                              │
│          └─ 📁 旅行计划                      │
└──────────────────────────────────────────────┘
```

**两种视图的对比**：

| 特性 | 全部标星 | 收藏整理（文件夹） |
|------|---------|-------------------|
| **数据来源** | 虚拟聚合查询 | Pod 中的 /favorites/ |
| **文件夹** | ❌ 无文件夹 | ✅ **支持多层文件夹** |
| **筛选** | 按类型、时间、位置 | 按文件夹层级 |
| **组织** | 自动聚合 | 手动组织 |
| **操作** | 只能标星/取消标星 | 创建文件夹、移动、重命名 |
| **元数据** | 只有 starred 属性 | 可以添加描述、标签等 |

**文件夹视图的结构**：

```
/favorites/                          # 收藏整理的根目录
├── work/                            # 一级文件夹
│   ├── project-a/                   # 二级文件夹
│   │   ├── .meta
│   │   │   └── ldp:contains </files/report.pdf>
│   │   │   └── ldp:contains </messages/chat-5.ttl#msg-10>
│   │   └── notes.md                 # 可以添加说明文档
│   │
│   └── meetings/                    # 二级文件夹
│       └── .meta
│           └── ldp:contains </messages/chat-3.ttl#msg-20>
│
├── learning/                        # 一级文件夹
│   ├── solid-development/           # 二级文件夹
│   │   └── .meta
│   │       └── ldp:contains <https://solidproject.org/...>
│   │
│   └── typescript/
│       └── .meta
│           └── ldp:contains <https://typescriptlang.org/...>
│
└── personal/                        # 一级文件夹
    └── travel/
        └── .meta
            └── ldp:contains </files/photos/vacation.jpg>
```

**在收藏整理（文件夹视图）中的操作**：

```typescript
// 1. 创建收藏夹文件夹
async function createFavoriteFolder(name: string, parent: string = "") {
  const path = `/favorites/${parent}${name}/`;
  await createContainer(path);
}

// 2. 添加资源到特定文件夹
async function addToFavoriteFolder(resourceUri: string, folder: string) {
  await addContainsMember(`/favorites/${folder}/`, resourceUri);
}

// 3. 在文件夹之间移动
async function moveBetweenFolders(resourceUri: string, from: string, to: string) {
  await removeContainsMember(`/favorites/${from}/`, resourceUri);
  await addContainsMember(`/favorites/${to}/`, resourceUri);
}

// 4. 浏览文件夹（就像普通文件管理器）
async function browseFavoriteFolder(path: string) {
  return await getContainerMembers(`/favorites/${path}`);
}
```

**UI 中的切换**：

```
用户点击侧边栏：
├── "全部标星"
│   → 右侧显示：虚拟聚合视图
│   → 所有 starred 资源的卡片
│   → 支持筛选：[全部] [文件] [消息] [联系人]
│
└── "收藏整理"或具体文件夹（如"工作"）
    → 右侧显示：文件夹视图
    → 该文件夹的内容（子文件夹 + 引用的资源）
    → 可以创建新文件夹、添加资源、重命名等
    → 就像在 /files/ 中管理文件一样
```

**与文件管理的本质区别**：

| 维度 | 文件管理 | 收藏系统 |
|------|---------|---------|
| **目的** | 存储和组织文件 | 快速访问重要资源 |
| **范围** | 单一位置（/files/） | 跨所有位置聚合 |
| **内容** | 实际文件 | 引用 + 标星 |
| **资源类型** | 文件 | 文件+消息+联系人+链接+任意URI |
| **操作** | 移动文件 | 标星/引用（不移动） |
| **组织** | 物理文件夹 | 虚拟聚合 + 收藏文件夹 |

**实现架构**：

```typescript
// 收藏系统的两种视图
enum FavoriteViewMode {
  Starred = 'starred',      // 虚拟聚合视图
  Folders = 'folders'       // 收藏夹文件夹
}

// 收藏夹组件
function FavoritesView() {
  const [mode, setMode] = useState(FavoriteViewMode.Starred);
  
  return (
    <div>
      <ViewToggle>
        <Tab active={mode === 'starred'} onClick={() => setMode('starred')}>
          全部标星
        </Tab>
        <Tab active={mode === 'folders'} onClick={() => setMode('folders')}>
          收藏整理
        </Tab>
      </ViewToggle>
      
      {mode === 'starred' ? (
        <StarredAggregateView />  // 聚合所有 starred 资源
      ) : (
        <FavoriteFoldersView />   // 浏览 /favorites/ 文件夹
      )}
    </div>
  );
}

// 标星聚合视图
function StarredAggregateView() {
  const starred = useQuery(async () => {
    return await queryAllStarred(); // 跨所有位置查询
  });
  
  return (
    <div>
      <FilterBar>
        <Filter label="全部" />
        <Filter label="文件" />
        <Filter label="消息" />
        <Filter label="联系人" />
      </FilterBar>
      
      <ResourceGrid items={starred} />
    </div>
  );
}
```

---

### 6.6.2.1 点击 RDF 片段后的行为 🤔

**用户的问题**：

> 收藏了一个 .ttl 文件中的片段（如消息），点击后打开什么？

这是一个关键的交互设计问题 ⚠️

---

#### 选项 A：跳转到原位置（推荐 ✅）

**行为**：点击收藏的消息卡片 → 跳转到聊天窗口的该消息位置

```typescript
async function openFavoriteMessage(uri: string) {
  // uri = "https://alice.pod/messages/chat-123.ttl#msg-003"
  
  // 1. 解析 URI
  const { conversationId, messageId } = parseMessageUri(uri);
  // conversationId = "chat-123"
  // messageId = "msg-003"
  
  // 2. 导航到聊天页面
  router.push(`/chat/${conversationId}`);
  
  // 3. 滚动并高亮该消息
  await scrollToMessage(messageId);
  highlightMessage(messageId);
}
```

**视觉效果**：

```
收藏夹                        聊天窗口
┌─────────────┐             ┌──────────────────┐
│ 💬 重要讨论  │ ──点击──→   │ [与 Alice 的对话]│
│ Alice       │             │                  │
│ 10/07       │             │ msg-001: ...     │
└─────────────┘             │ msg-002: ...     │
                            │ ┏━━━━━━━━━━━━━┓ │
                            │ ┃msg-003: 重要!┃ │ ← 高亮
                            │ ┗━━━━━━━━━━━━━┛ │
                            │ msg-004: ...     │
                            └──────────────────┘
```

**优点**：
- ✅ 符合直觉（查看完整上下文）
- ✅ 可以看到前后消息
- ✅ 可以继续对话
- ✅ 类似 Slack 的"跳转到消息"功能

**缺点**：
- ❌ 如果原消息被删除，跳转失败
- ❌ 如果对话很长，需要加载时间

---

#### 选项 B：原地展开详情（对话框）

**行为**：点击收藏的消息卡片 → 打开弹窗显示消息详情

```
收藏夹
┌──────────────────────────────────────┐
│ 💬 重要讨论                          │
│ Alice, 10/07                         │
└──────────────────────────────────────┘
           ↓ 点击
┌────────────────────────────────────────┐
│ 消息详情                        [×]    │
├────────────────────────────────────────┤
│ 发送者：Alice                          │
│ 时间：2024-11-07 10:10:00             │
│ 对话：与 Alice 的讨论                 │
│                                        │
│ ┌────────────────────────────────┐   │
│ │ 这是一条非常重要的消息！        │   │
│ │ 我们需要在本周完成这个项目。    │   │
│ └────────────────────────────────┘   │
│                                        │
│ 附件：report.pdf (5.2 MB)             │
│                                        │
│ [查看完整对话] [编辑收藏]              │
└────────────────────────────────────────┘
```

**优点**：
- ✅ 不离开收藏夹页面
- ✅ 快速查看内容
- ✅ 可以添加注释/标签

**缺点**：
- ❌ 缺少上下文（前后消息）
- ❌ 无法直接回复

---

#### 选项 C：混合模式（右侧预览面板）✅ 推荐

**行为**：点击收藏的消息 → 右侧面板显示详情 + 快速操作

```
┌────────┬──────────────┬─────────────────────────┐
│ 文件夹 │ 收藏内容     │ 详情面板                │
│        │              │                         │
│ 工作 ◄ │ 📄 报告      │ 消息详情                │
│  报告  │              │ ────────────            │
│  会议  │ 💬 重要讨论 ◄│ 发送者：Alice           │
│        │   (选中)     │ 时间：10/07 10:10       │
│ 个人   │              │ 对话：与 Alice 的讨论   │
│        │ 👤 Bob       │                         │
│        │              │ ┌─────────────────────┐│
│        │              │ │这是一条非常重要的   ││
│        │              │ │消息！我们需要...    ││
│        │              │ └─────────────────────┘│
│        │              │                         │
│        │              │ 上下文（3条）：         │
│        │              │ > msg-001: ...          │
│        │              │ > msg-002: ...          │
│        │              │ ▶ msg-003: 重要！       │
│        │              │                         │
│        │              │ [跳转到对话]            │
│        │              │ [编辑收藏]              │
└────────┴──────────────┴─────────────────────────┘
```

**关键设计**：

1. **左侧**：文件夹树
2. **中间**：收藏卡片列表
3. **右侧**：选中项的详情面板

**右侧面板根据类型显示不同内容**：

| 类型 | 面板内容 |
|------|---------|
| **消息** | 完整内容 + 上下文 + 跳转按钮 |
| **文件** | 预览 + 元数据 + 下载/打开 |
| **联系人** | 详细信息 + 最近对话 + 联系按钮 |
| **外部链接** | 网页预览 + 元数据 + 打开按钮 |

**优点**：
- ✅ 不离开收藏夹，快速查看
- ✅ 显示上下文（前后几条消息）
- ✅ 提供"跳转到对话"按钮深入查看
- ✅ 类似 macOS Mail 的三栏布局
- ✅ 支持键盘导航（上下切换）

**缺点**：
- ❌ 需要更多屏幕空间
- ❌ 移动端需要适配（全屏显示详情）

---

#### 选项 D：根据类型智能决策

**设计**：不同类型的资源有不同的默认行为

```typescript
async function openFavoriteItem(item: FavoriteItem) {
  switch (item.type) {
    case 'message':
      // 消息：跳转到对话位置
      openConversationAtMessage(item.uri);
      break;
      
    case 'file':
      // 文件：直接打开/下载
      openFile(item.uri);
      break;
      
    case 'contact':
      // 联系人：打开联系人详情页
      openContactProfile(item.uri);
      break;
      
    case 'link':
      // 外部链接：在新标签打开
      window.open(item.uri, '_blank');
      break;
      
    case 'webpage':
      // 保存的网页：在应用内查看
      openWebpageViewer(item.uri);
      break;
  }
}
```

**优点**：
- ✅ 符合每种资源的特点
- ✅ 用户体验自然

**缺点**：
- ❌ 行为不一致可能让用户困惑

---

#### 最终推荐：方案 C（混合模式）✅

**理由**：

1. **最佳用户体验**
   - 快速查看（右侧面板）
   - 深入浏览（跳转按钮）
   - 不打断当前流程

2. **适合收藏夹场景**
   - 用户通常想快速查看多个收藏
   - 键盘上下键快速切换
   - 类似浏览邮件的体验

3. **现代应用标准**
   - macOS Mail：三栏布局
   - Notion：页面预览面板
   - Bear：笔记预览

4. **移动端适配**
   - 桌面端：三栏布局
   - 移动端：点击后全屏显示详情，带返回按钮

**实现细节**：

```typescript
interface DetailPanel {
  // 基础信息
  title: string;
  type: string;
  createdAt: Date;
  
  // 完整内容
  content: string | React.ReactNode;
  
  // 上下文（消息类型）
  context?: {
    previous: Message[];  // 前3条
    next: Message[];      // 后3条
  };
  
  // 元数据
  metadata: Record<string, any>;
  
  // 操作
  actions: {
    primary: Action;      // 主操作：跳转/打开
    secondary: Action[];  // 次要操作：编辑/删除/分享
  };
}

// 消息的详情面板
function MessageDetailPanel({ uri }: { uri: string }) {
  const message = await fetchMessage(uri);
  const context = await fetchMessageContext(uri, { before: 3, after: 3 });
  
  return (
    <Panel>
      <Header>
        <Avatar src={message.sender.avatar} />
        <div>
          <Name>{message.sender.name}</Name>
          <Time>{message.createdAt}</Time>
        </div>
      </Header>
      
      <Content>
        <MessageBubble>{message.content}</MessageBubble>
        {message.attachments && <Attachments files={message.attachments} />}
      </Content>
      
      <Context>
        <ContextTitle>上下文</ContextTitle>
        {context.previous.map(m => <ContextMessage key={m.id} message={m} />)}
        <CurrentMarker />
        {context.next.map(m => <ContextMessage key={m.id} message={m} />)}
      </Context>
      
      <Actions>
        <PrimaryButton onClick={() => jumpToConversation(uri)}>
          跳转到对话
        </PrimaryButton>
        <SecondaryButton onClick={() => editFavorite(uri)}>
          编辑收藏
        </SecondaryButton>
      </Actions>
    </Panel>
  );
}
```

#### 6.6.3 文件的收藏和多层文件夹

**多层文件夹结构**（LDP Container 嵌套）：

```
/favorites/                          # 根收藏夹
├── .meta
│   └── ldp:contains work/, personal/, projects/
│
├── work/                            # 一级文件夹
│   ├── .meta
│   │   └── ldp:contains reports/, meetings/
│   │
│   ├── reports/                     # 二级文件夹
│   │   ├── .meta
│   │   │   └── ldp:contains <../../files/report.pdf>
│   │   │   └── ldp:contains <../../files/summary.pdf>
│   │   └── saved-article.html      # 实际文件
│   │
│   └── meetings/                    # 二级文件夹
│       └── .meta
│           └── ldp:contains <../messages/chat-123.ttl#msg-005>
│
├── personal/                        # 一级文件夹
│   └── .meta
│       └── ldp:contains <../files/photo.jpg>
│       └── ldp:contains <https://example.com/blog>
│
└── projects/                        # 一级文件夹
    ├── .meta
    │   └── ldp:contains project-a/, project-b/
    │
    ├── project-a/                   # 二级文件夹
    │   └── ...
    │
    └── project-b/                   # 二级文件夹
        └── ...
```

**文件收藏的两种方式**：

**方式 1：引用原文件**（不占额外空间 ✅）

```turtle
# /favorites/work/.meta
<> ldp:contains <../../files/report.pdf> .
```

- ✅ 节省空间
- ✅ 文件更新自动同步
- ❌ 原文件删除后引用失效

**方式 2：复制文件**（完整归档）

```
/favorites/work/
└── report.pdf              # 实际复制的文件
```

- ✅ 独立存档，不受原文件影响
- ❌ 占用额外空间
- ❌ 文件更新不同步

**推荐策略**：
- 默认：引用（方式 1）
- 用户选择"归档"时：复制（方式 2）

#### 6.6.4 收藏夹操作流程

**添加到收藏夹**：

```typescript
// 1. 用户在消息中点击"收藏"
async function favoriteMessage(messageUri: string, folder: string = "") {
  // 添加到收藏夹 Container
  const targetContainer = `/favorites/${folder}/`;
  await addContainsMember(targetContainer, messageUri);
  
  // 可选：同时设置 starred
  await updateMessageStarred(messageUri, true);
}

// 2. 用户在文件列表点击"添加到收藏夹"
async function favoriteFile(fileUri: string, folder: string = "", archive: boolean = false) {
  const targetContainer = `/favorites/${folder}/`;
  
  if (archive) {
    // 复制文件到收藏夹
    await copyFile(fileUri, targetContainer);
  } else {
    // 添加引用
    await addContainsMember(targetContainer, fileUri);
  }
}

// 3. 创建文件夹
async function createFavoriteFolder(name: string, parentFolder: string = "") {
  const folderPath = `/favorites/${parentFolder}${name}/`;
  await createContainer(folderPath);
}
```

**查询和展示**：

```typescript
// 获取收藏夹内容
async function getFavoriteFolder(path: string = "") {
  const containerUri = `/favorites/${path}`;
  
  // 1. 获取 Container 成员（ldp:contains）
  const members = await getContainerMembers(containerUri);
  
  // 2. 区分文件夹和资源
  const items = await Promise.all(members.map(async (uri) => {
    const metadata = await fetchMetadata(uri);
    
    if (metadata.type === 'ldp:Container') {
      return { type: 'folder', uri, name: metadata.title };
    } else {
      return { type: 'resource', uri, ...metadata };
    }
  }));
  
  return {
    folders: items.filter(i => i.type === 'folder'),
    resources: items.filter(i => i.type === 'resource'),
  };
}
```

#### 6.6.5 待确认的设计细节 🤔

1. **消息收藏是否需要快照？**
   - 选项 A：只存引用（原消息删除后失效）
   - 选项 B：创建快照副本（永久保留）
   - **建议**：默认引用，提供"归档"选项创建副本

2. **文件夹的默认分类？**
   - 是否预设文件夹（工作、个人、学习等）？
   - 还是完全由用户自定义？
   - **建议**：提供模板，但允许自定义

3. **跨 Pod 资源的访问？**
   - 收藏其他用户的资源时，如何处理权限？
   - 原资源权限变更后如何处理？
   - **待研究**：Solid 的跨 Pod 访问机制

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
- Read/Write: /favorites, /settings, /ai-assistants

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
- [产品定位](./product-definition.md) - 产品功能需求
- [主布局设计](./main-layout-design.md) - UI/UX 设计
- [AI 集成方案](./ai-integration.md) - AI 功能设计
- [安全和加密](./security.md) - 安全策略
- [数据模型实现](../packages/models/README.md) - 代码实现文档
- [数据模型关系图](../packages/models/DATA-MODEL-DIAGRAM.md) - ERD 图

---

**最后更新**: 2025-11-07  
**下次评审**: 待定
