# feat/contracts-sidecar-events 执行文档

> 波次：Wave A

## 1. 目标与范围

- collector/mcp/automation 事件契约（event + version）。

## 2. 依赖关系

- 入依赖：无
- 出依赖：`feat/cli-collector`、`feat/mcp-bridge`、`feat/mobile-session-control-ui`、`feat/automation`

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

> 本节定义 sidecar 事件契约中需要持久化到 Pod 的数据结构的 RDF 词汇表。
> 事件本身是运行时协议（不落 Pod），但 Inbox 审批队列和审计日志需要 Pod 持久化。

### 6A.1 新增 Namespace

```typescript
// 新增：LinX Sidecar 事件词汇
export const LINX_SIDECAR = createNamespace('lxs', 'https://vocab.linx.dev/sidecar#', {
  // Inbox 审批队列
  InboxItem: 'InboxItem',
  inboxStatus: 'inboxStatus',           // 'pending' | 'approved' | 'rejected' | 'expired'
  inboxRisk: 'inboxRisk',               // 'low' | 'medium' | 'high'
  assignedTo: 'assignedTo',             // assignee WebID
  resolvedAt: 'resolvedAt',
  sessionRef: 'sessionRef',             // 关联的 CLI session chat URI
  toolCallRef: 'toolCallRef',           // 关联的 toolCallId

  // 审计日志
  AuditEntry: 'AuditEntry',
  auditAction: 'auditAction',           // 'tool_approved' | 'tool_rejected' | 'session_paused' | ...
  auditActor: 'auditActor',             // 执行者 WebID
  auditActorRole: 'auditActorRole',     // 'human' | 'secretary' | 'system'
  auditOnBehalfOf: 'auditOnBehalfOf',   // 委托方 WebID
  auditContext: 'auditContext',          // JSON: triggerEvent, reasoning, matchedPolicies, userStatus
  auditPolicyRef: 'auditPolicyRef',     // 命中的策略文件 URI
  auditPolicyVersion: 'auditPolicyVersion',

  // 事件版本
  eventVersion: 'eventVersion',
})
```

### 6A.2 Inbox 审批队列表

Inbox 是 sidecar 事件中 `waiting_approval` 状态的持久化视图，支持 Web/Mobile 双入口审批。

```typescript
// packages/models/src/inbox.schema.ts（新增）

export const inboxTable = podTable(
  'inbox',
  {
    id: id('id'),

    // 关联
    sessionRef: uri('sessionRef').predicate(LINX_SIDECAR.sessionRef).notNull(),
    toolCallRef: string('toolCallRef').predicate(LINX_SIDECAR.toolCallRef).notNull(),
    chatId: uri('chatId').predicate(WF.message).inverse().notNull(),

    // 审批信息
    toolName: string('toolName').predicate(LINX_MSG.toolName).notNull(),
    toolArguments: text('toolArguments').predicate(LINX_MSG.toolArguments),
    risk: string('risk').predicate(LINX_SIDECAR.inboxRisk).notNull(),
    status: string('status').predicate(LINX_SIDECAR.inboxStatus).notNull().default('pending'),

    // 审批结果
    assignedTo: uri('assignedTo').predicate(LINX_SIDECAR.assignedTo),
    decisionBy: uri('decisionBy').predicate(LINX_MSG.decisionBy),
    decisionRole: string('decisionRole').predicate(LINX_MSG.decisionRole),
    onBehalfOf: uri('onBehalfOf').predicate(LINX_MSG.onBehalfOf),
    reason: text('reason').predicate(LINX_MSG.approvalReason),
    policyVersion: string('policyVersion').predicate(LINX_SIDECAR.auditPolicyVersion),

    // Timestamps
    createdAt: timestamp('createdAt').predicate(DCTerms.created).notNull().defaultNow(),
    resolvedAt: timestamp('resolvedAt').predicate(LINX_SIDECAR.resolvedAt),
  },
  {
    base: '/.data/inbox/',
    sparqlEndpoint: '/.data/inbox/-/sparql',
    type: LINX_SIDECAR.InboxItem,
    namespace: LINX_SIDECAR,
    subjectTemplate: '{id}.ttl',
  },
)
```

### 6A.3 审计日志表

审计日志记录所有 Secretary AI / 人工审批决策，支持"现场还原"。

```typescript
// packages/models/src/audit.schema.ts（新增）

export const auditTable = podTable(
  'audit',
  {
    id: id('id'),

    // 审计动作
    action: string('action').predicate(LINX_SIDECAR.auditAction).notNull(),

    // 执行者
    actor: uri('actor').predicate(LINX_SIDECAR.auditActor).notNull(),
    actorRole: string('actorRole').predicate(LINX_SIDECAR.auditActorRole).notNull(),
    onBehalfOf: uri('onBehalfOf').predicate(LINX_SIDECAR.auditOnBehalfOf),

    // 关联
    sessionRef: uri('sessionRef').predicate(LINX_SIDECAR.sessionRef),
    toolCallRef: string('toolCallRef').predicate(LINX_SIDECAR.toolCallRef),
    inboxItemRef: uri('inboxItemRef').predicate(LINX_MSG.inboxItemId),

    // 上下文（JSON: triggerEvent, reasoning, matchedPolicies, userStatus）
    context: text('context').predicate(LINX_SIDECAR.auditContext),

    // 策略
    policyRef: uri('policyRef').predicate(LINX_SIDECAR.auditPolicyRef),
    policyVersion: string('policyVersion').predicate(LINX_SIDECAR.auditPolicyVersion),

    // Timestamps
    createdAt: timestamp('createdAt').predicate(DCTerms.created).notNull().defaultNow(),
  },
  {
    base: '/.data/audit/',
    sparqlEndpoint: '/.data/audit/-/sparql',
    type: LINX_SIDECAR.AuditEntry,
    namespace: LINX_SIDECAR,
    subjectTemplate: '{id}.ttl',
  },
)
```

### 6A.4 Vocab 对象定义

```typescript
// packages/models/src/vocab/sidecar.vocab.ts

import { LINX_SIDECAR, LINX_MSG, DCTerms, WF } from '../namespaces'

export const InboxVocab = {
  sessionRef: LINX_SIDECAR.sessionRef,
  toolCallRef: LINX_SIDECAR.toolCallRef,
  chatId: WF.message,
  toolName: LINX_MSG.toolName,
  toolArguments: LINX_MSG.toolArguments,
  risk: LINX_SIDECAR.inboxRisk,
  status: LINX_SIDECAR.inboxStatus,
  assignedTo: LINX_SIDECAR.assignedTo,
  decisionBy: LINX_MSG.decisionBy,
  decisionRole: LINX_MSG.decisionRole,
  onBehalfOf: LINX_MSG.onBehalfOf,
  reason: LINX_MSG.approvalReason,
  policyVersion: LINX_SIDECAR.auditPolicyVersion,
  createdAt: DCTerms.created,
  resolvedAt: LINX_SIDECAR.resolvedAt,
} as const

export const AuditVocab = {
  action: LINX_SIDECAR.auditAction,
  actor: LINX_SIDECAR.auditActor,
  actorRole: LINX_SIDECAR.auditActorRole,
  onBehalfOf: LINX_SIDECAR.auditOnBehalfOf,
  sessionRef: LINX_SIDECAR.sessionRef,
  toolCallRef: LINX_SIDECAR.toolCallRef,
  inboxItemRef: LINX_MSG.inboxItemId,
  context: LINX_SIDECAR.auditContext,
  policyRef: LINX_SIDECAR.auditPolicyRef,
  policyVersion: LINX_SIDECAR.auditPolicyVersion,
  createdAt: DCTerms.created,
} as const
```

### 6A.5 事件 → Pod 持久化映射

运行时事件本身不落 Pod，但以下场景需要持久化：

| 运行时事件 | 持久化目标 | 触发条件 |
|-----------|-----------|---------|
| `mcp.tool` (waiting_approval) | `inboxTable` INSERT | 每次 tool call 需要审批时 |
| `mcp.tool` (approved/rejected) | `inboxTable` UPDATE + `auditTable` INSERT | 审批完成时 |
| `session.state` (completed/error) | `chatTable` UPDATE (sessionStatus) | Session 结束时 |
| `inbox.approval` (resolved) | `inboxTable` UPDATE | 审批结果回写 |

### 6A.6 存储路径汇总

| 实体 | Pod 路径 | RDF Type | Namespace | 状态 |
|------|---------|----------|-----------|------|
| Inbox | `/.data/inbox/{id}.ttl` | `lxs:InboxItem` | LINX_SIDECAR | **新增** |
| Audit | `/.data/audit/{id}.ttl` | `lxs:AuditEntry` | LINX_SIDECAR | **新增** |

### 6A.7 下游 Vocab 引用规则

| 下游 Wave | 引用的 Vocab | 用途 |
|-----------|-------------|------|
| 04-web-chat-ui | InboxVocab | Inbox 审批队列 UI |
| 09-mobile-session | InboxVocab | 推送通知审批 |
| 11-mcp-bridge | InboxVocab, AuditVocab | 审批结果持久化 |
| 12-automation | AuditVocab | 自治执行审计记录 |

---

## 7. 交互设计规格（Interaction Design Review）

> 本节定义 sidecar 事件契约中与交互相关的事件类型，确保 UI 层能实时感知 AI 执行状态。

### 7.1 MCP Tool 执行事件

CLI session 和 MCP bridge 产生的工具执行事件，需要推送到所有已连接客户端（Web/Mobile）。

```typescript
interface MCPToolEvent {
  type: 'mcp.tool'
  sessionId: string
  toolCallId: string
  toolName: string
  risk?: 'low' | 'medium' | 'high'
  status: 'calling' | 'waiting_approval' | 'approved' | 'rejected' | 'running' | 'done' | 'error'
  arguments?: Record<string, unknown>
  result?: unknown
  error?: string
  duration?: number   // ms，仅 done/error 时有值
  inboxItemId?: string
  decisionBy?: string         // 审批执行者 WebID
  decisionRole?: 'human' | 'secretary' | 'system'
  onBehalfOf?: string         // 委托方 WebID
  policyVersion?: string
  timestamp: string   // ISO 8601
}
```

状态流转：

```
calling → waiting_approval → approved → running → done
                           → rejected
calling → running → done      （auto_approved，risk=low）
calling → running → error
```

### 7.2 Session 状态变更事件

CLI session 生命周期事件，驱动 ChatListPane 和 Session 控制栏的状态更新。

```typescript
interface SessionStateEvent {
  type: 'session.state'
  sessionId: string
  chatId: string
  policyRef?: string
  policyVersion?: string
  status: 'active' | 'paused' | 'completed' | 'error'
  previousStatus: string
  tool: 'claude-code' | 'cursor' | 'windsurf'
  tokenUsage: number
  timestamp: string
}
```

### 7.3 客户端控制指令

客户端（Web/Mobile）发送给 sidecar 的控制指令，用于审批、暂停、注入消息等操作。

```typescript
interface MCPControlCommand {
  commandId: string
  type: 'mcp.control'
  command: 'approve' | 'reject' | 'pause' | 'resume' | 'stop' | 'inject_message' | 'approve_pattern'
  sessionId: string
  toolCallId?: string   // approve/reject 时必填
  message?: string      // inject_message 时必填
  pattern?: string      // approve_pattern 时必填
  inboxItemId?: string  // 来自集中审批队列时必填
  actor: {
    actorWebId: string
    actorRole: 'human' | 'secretary' | 'system'
    onBehalfOf?: string // 委托方 WebID
  }
  policyVersion?: string
  timestamp: string
}
```

### 7.4 Streaming Delta 事件

AI 响应过程中的增量事件，扩展现有 streaming 协议以支持 tool_use。

```typescript
// 现有事件类型
type StreamingDeltaType = 'content' | 'thinking'

// 新增事件类型
type StreamingDeltaTypeExtended =
  | 'content'           // 文本内容增量
  | 'thinking'          // 思考过程增量
  | 'tool_use_start'    // 工具调用开始（含 toolName, arguments）
  | 'tool_use_delta'    // 工具调用输出增量
  | 'tool_use_end'      // 工具调用结束（含 result/error）
  | 'tool_approval'     // 需要审批（含 risk, toolName, arguments）

interface StreamingDelta {
  type: StreamingDeltaTypeExtended
  messageId: string
  data: string | Record<string, unknown>
  timestamp: string
}
```

### 7.5 Inbox 审批事件（集中入口）

审批事件必须具备“会话内可处理 + 全局 Inbox 可处理”的双入口能力：

```typescript
interface InboxApprovalEvent {
  type: 'inbox.approval'
  inboxItemId: string
  sessionId: string
  toolCallId: string
  policyRef?: string
  policyVersion?: string
  risk: 'low' | 'medium' | 'high'
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  assignedTo?: string  // assignee WebID
  createdAt: string
  resolvedAt?: string
}
```

- 所有 `waiting_approval` 事件必须同步创建/更新对应 `inbox.approval`。
- Web/Mobile 任意入口处理审批后，必须回写同一个 `inboxItemId`。

### 7.6 事件版本与兼容性

| 事件 | 版本 | 向后兼容 | 说明 |
|------|------|---------|------|
| `mcp.tool` | v2 | v1 客户端忽略新增字段 | 增加 Inbox/审计字段 |
| `session.state` | v2 | v1 客户端忽略新增字段 | 增加 policy 引用上下文 |
| `mcp.control` | v2 | v1 服务端可忽略未知字段 | 增加 commandId/actor/approve_pattern |
| `streaming.delta` | v2 | v1 客户端忽略未知 type | 扩展现有 content/thinking |
| `inbox.approval` | v1 | N/A（新增） | 审批集中队列事件 |

### 7.7 下游消费映射

| 事件 | 消费方 | UI 行为 |
|------|--------|---------|
| `mcp.tool` (waiting_approval) | 04-web-chat-ui, 09-mobile | 显示审批卡片 / 推送通知 |
| `mcp.tool` (done/error) | 04-web-chat-ui | 更新 ToolCallCard 状态（spinner→✓/✗） |
| `session.state` | ChatListPane, 08-web-session | 更新列表项状态标签和控制栏 |
| `mcp.control` (approve/reject/approve_pattern) | 11-mcp-bridge | 转发审批结果给 CLI session |
| `inbox.approval` | Web Inbox / Mobile Inbox | 集中审批队列同步 |
| `streaming.delta` (tool_use_*) | useChatHandler | 实时渲染 tool call 卡片 |
