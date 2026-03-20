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

### 6A.1 Namespace 约定（UDFS 统一）

Wave A CP0 的自定义 predicate **统一挂在公司级命名空间 `udfs:`**（代码中为 `UDFS` 常量，base URI 为 `https://undefineds.co/ns#`）。

为避免下游 churn，仍导出 `LINX_CHAT` / `LINX_MSG`，但它们只是 `UDFS` 的别名（同一 base URI），用于语义分组/可读性。

注意（CP0 冻结但不必落表/不必在实例上写入）：

- `chatType`：仅冻结词汇（`udfs:chatType`），CP0 不在 `ChatRow` 落表；交互差异统一通过 Message widgets（`richContent.blocks`）表达。
- `agentWorkspaceRef`：旧命名/元模型中出现过；CP0 最终字段名为 `workspace`（Thread 上）。**不再保留 alias**，下游统一使用 `workspace`。
- `policyRef` / `policyVersion` / `parentThreadId` / `session*`：CP0 仅冻结词汇，不在 schema 落表；策略文档从 workspace 容器约定链接解析。

```ts
import { UDFS, LINX_CHAT, LINX_MSG } from "@linx/models"

// Aliases (same base URI)
LINX_CHAT.workspace === UDFS.workspace
LINX_MSG.coordinationId === UDFS.coordinationId
```

### 6A.2 Chat 语义（CP0）

CP0 中 Chat 作为纯 channel/place（`mee:LongChat`），不区分聊天对象类型；交互差异统一通过 Message widgets（`richContent.blocks`）表达。

- **参与者**：统一用 `wf:participant`（社区词汇优先）
- **Chat 不承载执行细节**：不在 Chat 上挂载 policy / session runtime / lineage 等
- **Thread 在 CP0 仅承载 workspace 上下文**：Thread 上的 `workspace` 指向“workspace 容器 URI（Agent@workspace）”，策略文档由该容器约定链接解析（不在 Thread 冗余存储）

#### Vocab 对象定义

schema 定义时直接用 `V.xxx`：

```ts
// packages/models/src/vocab/chat.vocab.ts

import { DCTerms, SCHEMA, UDFS, WF } from "../namespaces"

/** Chat channel vocab (thin place/container). */
export const ChatBaseVocab = {
  // Display
  title: DCTerms.title,
  description: DCTerms.description,
  avatarUrl: SCHEMA.image,

  // Participants (Solid chat-aligned)
  participants: WF.participant,

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
} as const
```

#### chatTable 改造方案

现有 `chatTable` 保持单表，但 **Chat 作为“聊天发生的地方（channel/place）”变薄**。

```ts
// packages/models/src/chat.schema.ts

export const chatTable = podTable(
  "chats",
  {
    // ... 现有字段保持不变 ...

    // Participants (community-first)
    participants: uri("participants").array().predicate(WF.participant),
  },
  {
    base: "/.data/chat/",
    sparqlEndpoint: "/.data/chat/-/sparql",
    type: MEETING.LongChat,
    namespace: UDFS,
    subjectTemplate: "{id}/index.ttl#this",
  },
)
```

#### threadTable 改造方案（workspace 上下文）

`threadTable` 在 CP0 **仅承载**与 workspace 关联的最小上下文，避免把执行细节塞进 Chat。

```ts
// packages/models/src/thread.schema.ts

export const threadTable = podTable(
  "thread",
  {
    // ... 现有字段保持不变 ...

    // Execution context: workspace container URI (Agent@workspace)
    workspace: uri("workspace").predicate(LINX_CHAT.workspace),
  },
  {
    base: "/.data/chat/",
    sparqlEndpoint: "/.data/chat/-/sparql",
    type: SIOC.Thread,
    namespace: UDFS,
    subjectTemplate: "{chatId}/index.ttl#{id}",
  },
)
```

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
| Chat | `/.data/chat/{chatId}/index.ttl#this` | `mee:LongChat` | UDFS | Chat 元数据与 thread 共享 index.ttl；participants 使用 `wf:participant` |
| Message | `/.data/chat/{chatId}/{yyyy}/{MM}/{dd}/messages.ttl#{id}` | `mee:Message` | UDFS | 按日期分桶；`chatId/threadId` 保留字符串键但带 canonical predicate |
| Contact | `/.data/contacts/{id}.ttl` | `vcard:Individual` | UDFS | 新增 `GROUP` 枚举值 |
| Thread | `/.data/chat/{chatId}/index.ttl#{threadId}` | `sioc:Thread` | UDFS | 与 chat 共用 index.ttl；CP0 仅新增 `workspace` 字段 |
| Agent | `/.data/agents/{id}.ttl` | `foaf:Agent` | UDFS | 无变更 |

### 6A.7 Vocab 文件结构

```
packages/models/src/vocab/
├── _namespaces.ts          ← 重导出 namespaces.ts（保持兼容）
├── chat.vocab.ts           ← ChatBaseVocab（Chat=channel/place）
├── thread.vocab.ts         ← ThreadVocab（workspace 上下文）
├── message.vocab.ts        ← MessageVocab
├── contact.vocab.ts        ← ContactVocab
└── index.ts                ← 统一导出所有 Vocab
```

### 6A.8 下游 Vocab 引用规则

| 下游 Wave | 引用的 Vocab | 用途 |
|-----------|-------------|------|
| 04-web-chat-ui | ChatBaseVocab | ChatListPane 基于参与者/最后消息/blocks 做渲染（不依赖 chatType） |
| 05-mobile-chat-ui | ChatBaseVocab | 移动端基于 participants/blocks 做渲染与交互 |
| 06-web-contact-ui | ContactVocab (GROUP) | 群组联系人创建 |
| 08-web-session-files-ui | ThreadVocab | 读取 Agent@workspace 上下文（policy 由 workspace 容器解析） |
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

### 7.2 Chat / Thread 的职责边界（CP0）

Chat 是“消息发生的地方（channel/place）”，无论聊天对象是人/AI/群/CLI，会话中的交互统一通过 `MessageRow.richContent.blocks`（widget blocks）表达。

因此 CP0 契约中：

- `ChatRow` **不承载**对象类型、审批策略、session 运行态等细节，仅保留参与者（`wf:participant`）和展示/状态字段。
- `ThreadRow` 在 CP0 仅承载 Agent@workspace container 上下文（`workspace`）；策略文档从该容器约定链接解析。

```typescript
interface ChatRowExtension {
  // Participants
  participants: string[]
}

interface ThreadRowExtension {
  // Agent@workspace container URI
  workspace?: string
}
```
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
| `mentions` | Inputbar, MessageList | @mention 输入和高亮渲染 |
| `workspace`（Thread） | 11-mcp-bridge, 12-automation | 定位 Agent@workspace 上下文与策略文档 |
| `decisionBy/decisionRole/onBehalfOf` | Inbox, 审计视图 | 人工/SecretaryAI 决策追踪 |
