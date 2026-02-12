# feat/contracts-chat-contact 执行文档

> 波次：Wave A

## 1. 目标与范围

- chat/contact/session 最小字段契约与 adapter 接口。

## 2. 依赖关系

- 入依赖：无
- 出依赖：`feat/web-chat-ui`、`feat/mobile-chat-ui`、`feat/web-contact-ui`、`feat/mobile-contact-ui`、`feat/web-session-files-ui`、`feat/mobile-session-control-ui`

## 3. 分阶段计划

### Phase 0（Contract Baseline）

- 冻结最小接口与数据结构，补齐 fixture。
- 先打通最小读/写路径，不追求完整交互。

### Phase 1（Vertical Slice）

- 打通端到端主链路（可灰度）。
- 完成核心场景自动化测试与手工演示路径。

### Phase 2（Hardening & Cutover）

- 完成稳定性、错误态、可观测性收敛。
- 完成默认入口切换与旧逻辑清理。

## 4. 代码集中回 main 的检查点

- CP0：只合并契约/类型/骨架，保证其他并发分支可继续。
- CP1：合并可运行链路，必须保留 Feature Flag，默认关闭。
- CP2：合并默认入口切换，附回滚策略。

## 5. 分支 DoD

- 契约测试通过（字段/事件/版本）。
- 至少 1 条端到端主链路可跑通。
- 关键失败路径有明确错误处理。
- 对应文档和迁移说明已更新。

## 6. 测试契约（并发开发必填）

- Test Owner：`TBD`
- Required Suites：`TBD`（至少包含 unit/integration/min-e2e）
- Upstream Contract Version：`TBD`
- Downstream Smoke：`TBD`（至少 1 个下游场景）

---

## 6A. Solid 数据建模规范

> 本节定义 chat/contact/message 契约层的 RDF 词汇表（Vocab）、子类继承、predicate 映射和存储路径。
> 所有下游 Wave 的 UI 和服务层必须引用此处定义的 Vocab，不得自行散落 namespace import。

### 6A.1 新增 Namespace

在 `packages/models/src/namespaces.ts` 中新增 Chat 子类和协作相关的 namespace：

```typescript
// 新增：LinX Chat 子类词汇
export const LINX_CHAT = createNamespace('lxc', 'https://vocab.linx.dev/chat#', {
  // Chat 子类 RDF types
  DirectAIChat: 'DirectAIChat',
  DirectHumanChat: 'DirectHumanChat',
  GroupChat: 'GroupChat',
  CLISession: 'CLISession',

  // Chat 扩展 predicates
  chatType: 'chatType',                   // 'direct_ai' | 'direct_human' | 'group' | 'cli_session'
  agentWorkspaceRef: 'agentWorkspaceRef', // 指向 Contact(Agent@workspace)
  policyRef: 'policyRef',                 // 权限策略文件引用
  policyVersion: 'policyVersion',         // 命中策略版本
  parentThreadId: 'parentThreadId',       // worktree thread 派生链路

  // CLI Session 专用
  sessionStatus: 'sessionStatus',         // 'active' | 'paused' | 'completed' | 'error'
  sessionTool: 'sessionTool',             // 'claude-code' | 'cursor' | 'windsurf'
  tokenUsage: 'tokenUsage',              // 已消耗 token 数

  // Group Chat 专用
  groupOwner: 'groupOwner',               // 群主 WebID
  groupAdmin: 'groupAdmin',               // 管理员 WebID（多值）
})

// 新增：LinX Message 扩展词汇
export const LINX_MSG = createNamespace('lxm', 'https://vocab.linx.dev/message#', {
  // Group 消息扩展
  senderName: 'senderName',
  senderAvatarUrl: 'senderAvatarUrl',
  mentions: 'mentions',                   // @提及的 contact URIs（多值）
  replyTo: 'replyTo',                     // 引用回复的 message URI

  // 多 AI 协同路由
  routedBy: 'routedBy',                   // 路由者 WebID（通常为 SecretaryAI）
  routeTargetAgentId: 'routeTargetAgentId',
  coordinationId: 'coordinationId',       // 跨 AI 协同链路 ID

  // Tool Call Block 扩展
  toolCallId: 'toolCallId',
  toolName: 'toolName',
  toolArguments: 'toolArguments',         // JSON 序列化
  toolStatus: 'toolStatus',              // 'calling' | 'waiting_approval' | 'running' | 'done' | 'error'
  toolResult: 'toolResult',
  toolError: 'toolError',
  toolDuration: 'toolDuration',           // ms

  // Tool Approval Block 扩展
  toolRisk: 'toolRisk',                   // 'low' | 'medium' | 'high'
  approvalStatus: 'approvalStatus',       // 'pending' | 'approved' | 'rejected' | 'auto_approved'
  decisionBy: 'decisionBy',              // 审批执行者 WebID
  decisionRole: 'decisionRole',          // 'human' | 'secretary' | 'system'
  onBehalfOf: 'onBehalfOf',              // 委托方 WebID
  approvalReason: 'approvalReason',
  inboxItemId: 'inboxItemId',

  // Task Progress Block
  taskProgressId: 'taskProgressId',
  taskSteps: 'taskSteps',                // JSON 序列化的步骤数组
  currentStep: 'currentStep',
  totalSteps: 'totalSteps',
})
```

### 6A.2 Chat 子类继承模型

四个 Chat 子类共享 `/.data/chats/` 存储路径，通过 `rdf:type` 区分。

#### RDF 类型层次

```
mee:LongChat                          ← 基类（现有）
  ├── lxc:DirectAIChat                ← 1v1 AI 对话
  ├── lxc:DirectHumanChat             ← 1v1 人类对话
  ├── lxc:GroupChat                   ← 群聊
  └── lxc:CLISession                  ← CLI 工具会话
```

#### Vocab 对象定义

每个 Chat 子类对应一个 Vocab 对象，schema 定义时直接用 `V.xxx`：

```typescript
// packages/models/src/vocab/chat.vocab.ts

import { LINX_CHAT, LINX_MSG, DCTerms, SCHEMA, UDFS, MEETING, WF } from '../namespaces'

/** 所有 Chat 子类共享的基础 Vocab */
export const ChatBaseVocab = {
  // Display
  title: DCTerms.title,
  description: DCTerms.description,
  avatarUrl: SCHEMA.image,

  // Relations
  contact: UDFS.hasContact,
  participants: SCHEMA.participant,

  // State
  starred: UDFS.favorite,
  muted: UDFS.muted,
  unreadCount: UDFS.unreadCount,

  // Activity
  lastActiveAt: UDFS.lastActiveAt,
  lastMessageId: WF.message,
  lastMessagePreview: SCHEMA.text,

  // Timestamps
  createdAt: DCTerms.created,
  updatedAt: DCTerms.modified,

  // 新增：类型标识
  chatType: LINX_CHAT.chatType,

  // 新增：权限上下文
  policyRef: LINX_CHAT.policyRef,
  policyVersion: LINX_CHAT.policyVersion,
} as const

/** DirectAIChat Vocab — 继承 ChatBase + AI 专用 */
export const DirectAIChatVocab = {
  ...ChatBaseVocab,
  agentWorkspaceRef: LINX_CHAT.agentWorkspaceRef,
} as const

/** DirectHumanChat Vocab — 继承 ChatBase（无额外字段） */
export const DirectHumanChatVocab = {
  ...ChatBaseVocab,
} as const

/** GroupChat Vocab — 继承 ChatBase + 群组专用 */
export const GroupChatVocab = {
  ...ChatBaseVocab,
  groupOwner: LINX_CHAT.groupOwner,
  groupAdmin: LINX_CHAT.groupAdmin,
} as const

/** CLISession Vocab — 继承 ChatBase + Session 专用 */
export const CLISessionVocab = {
  ...ChatBaseVocab,
  sessionStatus: LINX_CHAT.sessionStatus,
  sessionTool: LINX_CHAT.sessionTool,
  tokenUsage: LINX_CHAT.tokenUsage,
  parentThreadId: LINX_CHAT.parentThreadId,
} as const
```

#### chatTable 改造方案

现有 `chatTable` 保持单表，新增字段通过 `LINX_CHAT` predicate 映射：

```typescript
// packages/models/src/chat.schema.ts 改造后

export const chatTable = podTable(
  'chats',
  {
    // ... 现有字段保持不变 ...

    // 新增：Chat 子类标识
    chatType: string('chatType').predicate(LINX_CHAT.chatType).notNull().default('direct_ai'),

    // 新增：权限上下文
    policyRef: uri('policyRef').predicate(LINX_CHAT.policyRef),
    policyVersion: string('policyVersion').predicate(LINX_CHAT.policyVersion),

    // 新增：DirectAI 专用
    agentWorkspaceRef: uri('agentWorkspaceRef').predicate(LINX_CHAT.agentWorkspaceRef),

    // 新增：Group 专用
    groupOwner: uri('groupOwner').predicate(LINX_CHAT.groupOwner),
    groupAdmin: uri('groupAdmin').array().predicate(LINX_CHAT.groupAdmin),

    // 新增：CLISession 专用
    sessionStatus: string('sessionStatus').predicate(LINX_CHAT.sessionStatus),
    sessionTool: string('sessionTool').predicate(LINX_CHAT.sessionTool),
    tokenUsage: integer('tokenUsage').predicate(LINX_CHAT.tokenUsage),
    parentThreadId: uri('parentThreadId').predicate(LINX_CHAT.parentThreadId),
  },
  {
    base: '/.data/chats/',
    sparqlEndpoint: '/.data/chats/-/sparql',
    type: MEETING.LongChat,           // 基类 type 保持不变
    namespace: UDFS,
    subjectTemplate: '{id}.ttl',
  },
)
```

> **设计决策**：不拆分为 4 张物理表。单表 + `chatType` 字段 + 子类专用字段可选，简化查询和迁移。
> RDF 序列化时，每个 Chat 实例同时携带基类 `mee:LongChat` 和子类 `lxc:DirectAIChat` 两个 `rdf:type`。

### 6A.3 Message 扩展 Vocab

```typescript
// packages/models/src/vocab/message.vocab.ts

import { LINX_MSG, SIOC, FOAF, DCTerms, UDFS, SCHEMA, MEETING, WF } from '../namespaces'

export const MessageVocab = {
  // 现有
  threadId: SIOC.has_member,
  chatId: WF.message,
  maker: FOAF.maker,
  role: UDFS.messageType,
  content: SIOC.content,
  richContent: SIOC.richContent,
  status: UDFS.messageStatus,
  replacedBy: DCTerms.isReplacedBy,
  deletedAt: SCHEMA.dateDeleted,
  createdAt: DCTerms.created,
  updatedAt: DCTerms.modified,

  // 新增：Group 消息扩展
  senderName: LINX_MSG.senderName,
  senderAvatarUrl: LINX_MSG.senderAvatarUrl,
  mentions: LINX_MSG.mentions,
  replyTo: LINX_MSG.replyTo,

  // 新增：多 AI 协同路由
  routedBy: LINX_MSG.routedBy,
  routeTargetAgentId: LINX_MSG.routeTargetAgentId,
  coordinationId: LINX_MSG.coordinationId,
} as const
```

#### messageTable 改造方案

```typescript
// packages/models/src/message.schema.ts 新增字段

// 新增：Group 消息扩展
senderName: string('senderName').predicate(LINX_MSG.senderName),
senderAvatarUrl: uri('senderAvatarUrl').predicate(LINX_MSG.senderAvatarUrl),
mentions: uri('mentions').array().predicate(LINX_MSG.mentions),
replyTo: uri('replyTo').predicate(LINX_MSG.replyTo),

// 新增：多 AI 协同路由
routedBy: uri('routedBy').predicate(LINX_MSG.routedBy),
routeTargetAgentId: string('routeTargetAgentId').predicate(LINX_MSG.routeTargetAgentId),
coordinationId: string('coordinationId').predicate(LINX_MSG.coordinationId),
```

### 6A.4 Contact 扩展 Vocab

```typescript
// packages/models/src/vocab/contact.vocab.ts

import { VCARD, FOAF, AS, DCTerms, UDFS } from '../namespaces'

export const ContactVocab = {
  // 现有（不变）
  name: VCARD.fn,
  avatarUrl: VCARD.hasPhoto,
  entityUri: FOAF.primaryTopic,
  contactType: UDFS.contactType,
  isPublic: AS.audience,
  externalPlatform: UDFS.externalPlatform,
  externalId: UDFS.externalId,
  alias: UDFS.alias,
  starred: UDFS.favorite,
  note: VCARD.note,
  sortKey: UDFS.sortKey,
  gender: VCARD.hasGender,
  province: VCARD.region,
  city: VCARD.locality,
  createdAt: DCTerms.created,
  updatedAt: DCTerms.modified,
  deletedAt: UDFS.deletedAt,
  lastSyncedAt: UDFS.lastSyncedAt,
} as const
```

> Contact 表当前不需要新增字段。`contactType` 已有 `'solid' | 'external' | 'agent'`，
> 群组联系人通过 `contactType='group'` 扩展（新增枚举值），无需新 predicate。

#### ContactType 扩展

```typescript
export const ContactType = {
  SOLID: 'solid',
  EXTERNAL: 'external',
  AGENT: 'agent',
  GROUP: 'group',        // 新增：群组联系人
} as const
```

### 6A.5 richContent Block 类型的 RDF 映射

`MessageRow.richContent` 以 JSON 存储 Block 数组，不直接映射为 RDF predicate。
但 Block 内部的 tool call / approval 字段需要在审计场景下可被 SPARQL 查询。

**策略**：richContent JSON 内的 `toolCallId`、`toolName`、`risk`、`status` 等字段，
在需要审计查询时，由 service 层提取为独立的 AuditEntry RDF 三元组（见 Wave D 12-automation）。
Wave A 阶段仅定义 JSON schema，不做 RDF 提取。

### 6A.6 存储路径汇总

| 实体 | Pod 路径 | RDF Type | Namespace | 变更 |
|------|---------|----------|-----------|------|
| Chat | `/.data/chats/{id}.ttl` | `mee:LongChat` + 子类 type | UDFS | 新增 `chatType` 等字段 |
| Message | `/.data/messages/{id}.ttl` | `mee:Message` | UDFS | 新增 group/routing 字段 |
| Contact | `/.data/contacts/{id}.ttl` | `vcard:Individual` | UDFS | 新增 `GROUP` 枚举值 |
| Thread | `/.data/threads/{id}.ttl` | `sioc:Thread` | UDFS | 无变更 |
| Agent | `/.data/agents/{id}.ttl` | `foaf:Agent` | UDFS | 无变更 |

### 6A.7 Vocab 文件结构

```
packages/models/src/vocab/
├── _namespaces.ts          ← 重导出 namespaces.ts（保持兼容）
├── chat.vocab.ts           ← ChatBaseVocab, DirectAIChatVocab, GroupChatVocab, CLISessionVocab
├── message.vocab.ts        ← MessageVocab
├── contact.vocab.ts        ← ContactVocab
└── index.ts                ← 统一导出所有 Vocab
```

### 6A.8 下游 Vocab 引用规则

| 下游 Wave | 引用的 Vocab | 用途 |
|-----------|-------------|------|
| 04-web-chat-ui | ChatBaseVocab, CLISessionVocab | ChatListPane chatType 差异化渲染 |
| 05-mobile-chat-ui | ChatBaseVocab | 移动端 chat 类型判断 |
| 06-web-contact-ui | ContactVocab (GROUP) | 群组联系人创建 |
| 08-web-session-files-ui | CLISessionVocab | Session 状态字段读取 |
| 10-cli-collector | MessageVocab (richContent blocks) | Block 序列化写入 |
| 02-sidecar-events | LINX_MSG (tool*) | 事件 → Block 字段映射 |

---

## 7. 交互设计规格（Interaction Design Review）

> 本节补充契约层需要定义的交互相关数据结构，确保 UI 层有足够信息呈现 AI 执行过程。

### 7.1 AI 执行状态模型

当前 `MessageRow.richContent` 以 JSON 存储 block 数组。需要在契约中明确以下新 block 类型：

#### ToolApprovalBlock

AI 请求执行工具时，需要用户审批的交互块。

```typescript
interface ToolApprovalBlock {
  type: 'tool_approval'
  toolCallId: string         // 关联的 tool call ID
  toolName: string           // 工具名称（如 delete_file, write_file）
  toolDescription: string    // 工具描述（人类可读）
  arguments: Record<string, unknown>  // 工具参数
  risk: 'low' | 'medium' | 'high'    // 风险等级，决定是否需要审批
  status: 'pending' | 'approved' | 'rejected' | 'auto_approved'
  approvedBy?: string        // 审批者 WebID（人或 SecretaryAI）
  approvedAt?: string        // ISO 时间戳

  // 审计字段（新增）
  decisionBy?: string         // 审批执行者 WebID（人或 SecretaryAI）
  decisionRole?: 'human' | 'secretary' | 'system'
  onBehalfOf?: string        // 代理审批时记录委托方 WebID
  reason?: string            // 审批理由（命中规则 / 人工输入）
  policyVersion?: string     // 命中的权限策略版本
  inboxItemId?: string       // 对应集中审批队列项
}
```

风险等级规则：
- `low`：读取操作（read_file, search, query）→ 自动批准，UI 仅显示执行状态
- `medium`：创建/修改操作（write_file, update_record）→ 默认需确认，可由策略自动批准
- `high`：删除/系统操作（delete_file, execute_command）→ 必须手动批准，30s 超时自动拒绝

#### TaskProgressBlock

AI 执行多步骤任务时的进度模型。

```typescript
interface TaskProgressBlock {
  type: 'task_progress'
  taskId: string
  title: string
  steps: Array<{
    id: string
    label: string
    status: 'pending' | 'running' | 'done' | 'error' | 'skipped'
    detail?: string    // 步骤详情或错误信息
    duration?: number  // 耗时（ms）
  }>
  currentStep: number
  totalSteps: number
}
```

#### ToolCallBlock（增强现有）

现有 `MessageBlockType.TOOL` 需要增加执行状态字段：

```typescript
interface ToolCallBlock {
  type: 'tool'
  toolCallId: string
  toolName: string
  arguments: Record<string, unknown>
  status: 'calling' | 'waiting_approval' | 'running' | 'done' | 'error'
  result?: unknown
  error?: string
  duration?: number  // 耗时（ms）
}
```

### 7.2 Chat 类型标识

当前 `ChatRow` 通过关联的 `ContactRow.contactType` 隐式推断聊天类型。契约层需要显式定义 `chatType` 以支持 UI 差异化渲染：

```typescript
// 扩展 ChatRow
interface ChatRowExtension {
  chatType: 'direct_ai' | 'direct_human' | 'group' | 'cli_session'

  // 权限继承上下文（精简）
  agentWorkspaceRef?: string // 指向 Contact(Agent@workspace)
  policyRef?: string         // 权限策略文件引用（thread 创建时挂载）
  policyVersion?: string     // 命中策略版本（用于审计）
  parentThreadId?: string    // worktree thread 派生链路（可选）

  // CLI Session 专用字段
  sessionStatus?: 'active' | 'paused' | 'completed' | 'error'
  sessionTool?: 'claude-code' | 'cursor' | 'windsurf'
  tokenUsage?: number
}
```

UI 消费方式：
- `direct_ai`：显示 AI provider logo，启用 streaming/thinking/tool 渲染
- `direct_human`：显示用户头像，启用 presence/typing/read receipt
- `group`：显示群头像（多头像拼接），启用成员列表和 @mention
- `cli_session`：显示 CLI 工具图标，启用 session 控制栏和 diff 预览

### 7.3 Group 消息扩展字段

群聊消息需要额外字段以支持发送者标识和引用回复：

```typescript
// 扩展 MessageRow（通过 richContent JSON 或新增字段）
interface GroupMessageExtension {
  senderName?: string       // 群聊中显示发送者名称
  senderAvatarUrl?: string  // 群聊中显示发送者头像
  mentions?: string[]       // @提及的 contact URIs
  replyTo?: string          // 引用回复的 message URI

  // 多 AI 协同路由（新增）
  routedBy?: string         // 路由者（通常为 SecretaryAI）
  routeTargetAgentId?: string // 被分派回答的 workerAI
  coordinationId?: string   // 跨 AI 协同链路 ID
}
```

### 7.4 1v1 vs Group 消息契约差异

| 字段 | 1v1 Chat | Group Chat | 说明 |
|------|----------|------------|------|
| `maker` | 固定两方 | 多方 | 群聊需要 maker → 名称/头像的解析 |
| `senderName` | 不需要 | 必须 | 群聊列表项和消息头部显示 |
| `mentions` | 不需要 | 可选 | @提及触发通知和高亮 |
| `replyTo` | 不需要 | 可选 | 引用回复显示原消息摘要 |
| `participants` | Chat 级别 2 人 | Chat 级别 N 人 | 群成员列表 |

### 7.5 下游消费映射

| 契约字段 | 消费方 | UI 行为 |
|---------|--------|---------|
| `ToolApprovalBlock.risk` | 04-web-chat-ui, 05-mobile-chat-ui | 决定是否显示审批卡片 |
| `ToolApprovalBlock.status` | 04-web-chat-ui | 审批按钮状态（pending→可点击，approved→灰色✓） |
| `TaskProgressBlock.steps` | 04-web-chat-ui | 多步骤进度条渲染 |
| `chatType` | ChatListPane | 列表项图标和标识差异 |
| `sessionStatus` | 08-web-session-files-ui | CLI session 状态指示器 |
| `mentions` | Inputbar, MessageList | @mention 输入和高亮渲染 |
| `policyRef/policyVersion` | 11-mcp-bridge, 12-automation | 审批继承与策略命中 |
| `decisionBy/decisionRole/onBehalfOf` | Inbox, 审计视图 | 人工/SecretaryAI 决策追踪 |
