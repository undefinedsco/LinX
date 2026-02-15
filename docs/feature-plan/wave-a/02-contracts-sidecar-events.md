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

> NOTE (CP0 对齐更新)：
> - 领域字段以 **UDFS(company vocab)** 承载（复用范围为公司级，非产品级）。
> - Solid `ldp:inbox` 仅作为通知通道：inbox 内资源使用 **AS2**（`as:Announce`），并通过 `as:object` 指向 `ApprovalRequest`。
> - 本分支 CP0 范围收敛为「**只审计/审批触达 Pod 数据的操作**」。
> - 字段命名避免 `xxxRef`（uri 字段本身即引用）。


> 本节定义 sidecar 事件契约中需要持久化到 Pod 的数据结构的 RDF 词汇表。
> 事件本身是运行时协议（不落 Pod），但 Inbox 审批队列和审计日志需要 Pod 持久化。

### 6A.1 Namespace（CP0）

- 公司词汇表：`udfs:`（存储 Approval/Audit/Grant 的领域字段）
- Inbox 通知：AS2（`as:`），inbox 内资源类型为 `as:Announce`
- 授权策略表达：ODRL（`odrl:`），Grant 主类型为 `odrl:Policy`
- Pod 动作语义：ACL（`acl:`）

本分支冻结的最小“Pod 稳定字段”模型在 `packages/models`：

- `packages/models/src/approval.schema.ts`
- `packages/models/src/audit.schema.ts`
- `packages/models/src/grant.schema.ts`
- `packages/models/src/inbox-notification.schema.ts`
- `packages/models/src/vocab/sidecar.vocab.ts`
- `packages/models/src/sidecar/sidecar-events.ts`
- `packages/models/src/sidecar/persistence-mapping.ts`

### 6A.2 Inbox 通知（AS2 / LDN）

inbox 仅做通知通道，不承载审批本体：

- `rdf:type as:Announce`
- `as:object` 指向 `ApprovalRequest` 资源 URI
- `dcterms:created` 记录创建时间

### 6A.3 Approval / Audit / Grant（Pod 领域存储）

- Approval（一次性决策记录）：`udfs:ApprovalRequest`
  - 关键字段：`udfs:session`、`udfs:toolCallId`、`udfs:toolName`
  - Pod 数据访问范围：`odrl:target`（Pod URI）+ `odrl:action`（例如 `acl:Read`）
  - 身份链：`decisionBy` + `decisionRole` + `onBehalfOf`
- Audit（追加写审计）：`udfs:AuditEntry`（append-only intent）
  - runtime 细节必须进入 `udfs:context`（JSON），不落稳定列
- Grant（"不再提醒" 的放权层）：主类型 `odrl:Policy`，并额外打 `rdf:type udfs:AutonomyGrant`
  - 最小字段：`odrl:target` + `odrl:action` + `udfs:effect`/`udfs:riskCeiling` + 身份链条

### 6A.4 事件 → Pod 持久化映射（CP0）

| 运行时事件 | 持久化目标 | 触发条件 |
|-----------|-----------|---------|
| `tool.call` (waiting_approval) | `approvalTable` INSERT + `inboxNotificationTable` INSERT | 仅当事件携带 `target/action`（触达 Pod 数据）且需要审批 |
| `tool.call` (approved/rejected) | `approvalTable` UPDATE + `auditTable` INSERT + `inboxNotificationTable` INSERT | 同上 |
| `inbox.approval` (resolved) | `approvalTable` UPDATE + `inboxNotificationTable` INSERT | 审批结果从 Web/Mobile 回写 |

> 注意：runtime-only 字段（arguments、result/error、duration 等）不作为 Pod 稳定列；需要审计的细节应进入 `auditTable.context`（JSON）。

Writer of Record（选型：B）：
- **xpod/chatkit（服务端）** 负责把 action 的执行与 Approval/Audit/Grant/InboxNotification 的落盘绑定在一起（同一侧完成一致性与幂等）。
- **LinX（客户端）** 只负责交互与决策输入/展示：显示 `inboxNotification`、读取/更新 `approval` 决策（通过 chatkit API 或等价控制面），不直接承担 Pod 落盘实现。

### 6A.5 存储路径汇总

| 实体 | Pod 路径 | RDF Type |
|------|---------|----------|
| Inbox Notification | `/inbox/{id}.ttl` | `as:Announce` |
| Approval | `/.data/approvals/{id}.ttl` | `udfs:ApprovalRequest` |
| Audit | `/.data/audit/{id}.ttl` | `udfs:AuditEntry` |
| Grant | `/settings/autonomy/grants/{id}.ttl` | `odrl:Policy` (+ `rdf:type udfs:AutonomyGrant`) |

---

## 7. 交互设计规格（Interaction Design Review）

> 本节定义 sidecar 事件契约中与交互相关的事件类型，确保 UI 层能实时感知 AI 执行状态。

### 7.1 Tool Call 执行事件

CLI session 和 bridge adapter 产生的工具执行事件，需要推送到所有已连接客户端（Web/Mobile）。

```typescript
interface ToolCallEvent {
  type: 'tool.call'
  sessionId: string
  toolCallId: string
  target?: string
  action?: string
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
  policy?: string
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
interface ToolControlCommand {
  commandId: string
  type: 'tool.control'
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

AI 响应过程中的增量事件（UI streaming 协议），不属于本分支 CP0 的 sidecar 事件契约冻结范围；本节仅保留概念占位。

```typescript
// TODO (CP1+): define streaming delta contract in chat module streaming spec.
```

### 7.5 Inbox 审批事件（集中入口）

审批事件必须具备“会话内可处理 + 全局 Inbox 可处理”的双入口能力：

```typescript
interface InboxApprovalEvent {
  type: 'inbox.approval'
  inboxItemId: string
  sessionId: string
  toolCallId: string
  target?: string
  action?: string
  policy?: string
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

CP0 冻结 v1 为 strict：任何字段变更都必须引入 v2（本分支不做 v2）。

### 7.7 下游消费映射

| 事件 | 消费方 | UI 行为 |
|------|--------|---------|
| `tool.call` (waiting_approval) | 04-web-chat-ui, 09-mobile | 显示审批卡片 / 推送通知 |
| `tool.call` (done/error) | 04-web-chat-ui | 更新 ToolCallCard 状态（spinner→✓/✗） |
| `session.state` | ChatListPane, 08-web-session | 更新列表项状态标签和控制栏 |
| `tool.control` (approve/reject/approve_pattern) | 11-bridge-adapter(chatkit) | 转发审批结果给 action 控制面 |
| `inbox.approval` | Web Inbox / Mobile Inbox | 集中审批队列同步 |
| `streaming.delta` (tool_use_*) | useChatHandler | 实时渲染 tool call 卡片 |
