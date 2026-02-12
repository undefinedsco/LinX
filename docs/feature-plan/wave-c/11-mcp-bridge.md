# feat/mcp-bridge 执行文档

> 波次：Wave C

## 1. 目标与范围

- MCP 协议桥接 + 跨端会话控制。

## 2. 依赖关系

- 入依赖：`feat/contracts-sidecar-events`、`feat/web-session-files-ui`、`feat/mobile-session-control-ui`、`feat/cli-collector`
- 出依赖：`feat/automation`

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

> MCP Bridge 是运行时协议层，核心数据结构（MCPToolEvent、MCPControlCommand、SessionStateSync）
> 为内存/传输态，不直接落 Pod。但 Bridge 需要读写上游定义的 Pod 表来完成持久化。

### 6A.1 消费的上游 Vocab

| 上游 Wave | Vocab / Table | 读/写 | 用途 |
|-----------|--------------|-------|------|
| 01 | `CLISessionVocab` / `chatTable` | 读+写 | 读取 sessionStatus，写入状态变更 |
| 01 | `MessageVocab` / `messageTable` | 写 | 转发 CLI 输出时写入 message |
| 02 | `InboxVocab` / `inboxTable` | 读+写 | 创建审批项、回写审批结果 |
| 02 | `AuditVocab` / `auditTable` | 写 | 审批操作写入审计日志 |

### 6A.2 运行时数据结构 → Pod 持久化映射

MCP Bridge 的运行时事件在以下时机触发 Pod 写入：

| 运行时事件 | Pod 操作 | 目标表 | 关键字段 |
|-----------|---------|--------|---------|
| `MCPToolEvent` (waiting_approval) | INSERT | `inboxTable` | `toolCallRef`, `toolName`, `risk`, `status='pending'` |
| `MCPControlCommand` (approve) | UPDATE | `inboxTable` | `status='approved'`, `decisionBy`, `decisionRole` |
| `MCPControlCommand` (reject) | UPDATE | `inboxTable` | `status='rejected'`, `decisionBy`, `reason` |
| `MCPControlCommand` (approve/reject) | INSERT | `auditTable` | `action`, `actor`, `actorRole`, `context` |
| `MCPControlCommand` (approve_pattern) | — | 内存 `ApprovalRule[]` | Session 结束时过期，不落 Pod |
| `SessionStateSync` (completed/error) | UPDATE | `chatTable` | `sessionStatus` |
| `MCPToolEvent` (done/error) | UPDATE | `messageTable.richContent` | 更新对应 ToolBlock 的 status/duration |

### 6A.3 ApprovalRule 存储策略

批量授权规则（`approve_pattern`）为 Session 级别的临时规则：

```
生命周期：Session 开始 → 用户创建 pattern → Session 结束时自动过期
存储位置：MCP Bridge 内存（不落 Pod）
原因：
  1. 规则与 Session 生命周期绑定，Session 结束即失效
  2. 避免 Pod 中积累大量过期规则
  3. 断线重连时，Bridge 从内存恢复（Session 仍活跃）
```

> **例外**：如果用户在 12-automation 中创建了持久化的自动审批规则，
> 那些规则存储在 `automationRuleTable`（见 12-automation §6A），不在此处。

### 6A.4 权限验证 → Pod 数据查询

MCP Bridge 在处理 `MCPControlCommand` 时需要验证权限：

| 验证项 | 数据来源 | 查询方式 |
|--------|---------|---------|
| Session owner | `chatTable.contact` → `contactTable.entityUri` | 比对发送者 WebID |
| Group admin | `chatTable.groupAdmin` | 检查发送者 WebID 是否在 admin 列表中 |
| Autonomy level | `settingsTable` (key=`autonomy.level`) | 判断是否允许自动审批 |
| Command whitelist | `settingsTable` (key=`autonomy.commandWhitelist`) | 匹配 approve_pattern |

### 6A.5 不新增 Pod 表

MCP Bridge 不新增 Pod 表。所有持久化通过上游 01/02 定义的表完成。

---

## 7. 交互设计规格（Interaction Design Review）

> 本节定义 MCP Bridge 暴露给客户端的交互信息协议，确保 Web/Mobile 端能实时感知和控制 CLI session。

### 7.1 MCP Tool 执行事件推送

MCP Bridge 将 CLI session 的工具执行状态推送到所有已连接客户端。

#### 事件格式

```typescript
interface MCPToolEvent {
  type: 'mcp.tool'
  sessionId: string
  toolCallId: string
  toolName: string
  status: 'calling' | 'waiting_approval' | 'approved' | 'rejected' | 'running' | 'done' | 'error'
  arguments?: Record<string, unknown>
  result?: unknown
  error?: string
  duration?: number   // ms，仅 done/error 时有值
  timestamp: string   // ISO 8601
}
```

#### 推送协议

| 传输方式 | 场景 | 说明 |
|---------|------|------|
| WebSocket | Web 端在线 | 实时双向通信 |
| SSE | Web 端只读监控 | 单向推送，轻量 |
| Push Notification | Mobile 端后台 | 系统推送，仅关键事件 |
| Solid Notification | 跨 Pod 同步 | 持久化事件，离线可恢复 |

#### 事件过滤

客户端可订阅特定 session 或事件类型：

```typescript
// 订阅请求
interface MCPSubscription {
  sessionId?: string          // 不指定则订阅所有 session
  eventTypes?: string[]       // 不指定则订阅所有事件
  minRisk?: 'low' | 'medium' | 'high'  // 只推送 >= 此风险等级的审批事件
}
```

### 7.2 客户端控制指令

客户端发送给 MCP Bridge 的控制指令，Bridge 转发给对应的 CLI session。

```typescript
interface MCPControlCommand {
  type: 'mcp.control'
  command: 'approve' | 'reject' | 'pause' | 'resume' | 'stop' | 'inject_message' | 'approve_pattern'
  sessionId: string
  toolCallId?: string     // approve/reject 时必填
  message?: string        // inject_message 时必填
  pattern?: string        // approve_pattern 时必填（如 "yarn *"）
  timestamp: string
}
```

#### 指令处理流程

```
客户端 (Web/Mobile)
    ↓ MCPControlCommand
MCP Bridge
    ↓ 验证权限（session owner / group admin）
    ↓ 转发给对应 CLI session
CLI Session (Claude Code / Cursor)
    ↓ 执行操作
    ↓ 返回结果
MCP Bridge
    ↓ MCPToolEvent (status=done/error)
客户端
```

#### 权限验证

| 指令 | 权限要求 | 说明 |
|------|---------|------|
| `approve` / `reject` | Session owner 或 group admin | 审批工具调用 |
| `pause` / `resume` / `stop` | Session owner | 控制 session 生命周期 |
| `inject_message` | Session owner | 向 CLI session 注入指令 |
| `approve_pattern` | Session owner | 批量授权同类操作 |

### 7.3 Session 状态同步

MCP Bridge 维护所有活跃 session 的状态，并在状态变更时推送事件。

```typescript
interface SessionStateSync {
  type: 'session.state'
  sessionId: string
  chatId: string
  status: 'active' | 'paused' | 'completed' | 'error'
  previousStatus: string
  tool: 'claude-code' | 'cursor' | 'windsurf'
  tokenUsage: number
  activeToolCalls: number    // 当前正在执行的工具调用数
  pendingApprovals: number   // 待审批的工具调用数
  timestamp: string
}
```

#### 客户端状态查询

客户端可主动查询 session 状态（用于断线重连后恢复）：

```typescript
// GET /api/mcp/sessions/:sessionId/state
interface SessionStateResponse {
  session: SessionStateSync
  recentEvents: MCPToolEvent[]  // 最近 50 条事件
  pendingApprovals: Array<{
    toolCallId: string
    toolName: string
    arguments: Record<string, unknown>
    risk: 'low' | 'medium' | 'high'
    requestedAt: string
    timeout: number
  }>
}
```

### 7.4 批量授权协议

"允许所有同类操作"的实现协议：

```typescript
// 客户端发送
{
  type: 'mcp.control',
  command: 'approve_pattern',
  sessionId: 'sess_001',
  pattern: 'yarn *',        // glob 模式匹配命令
  timestamp: '...'
}

// Bridge 存储授权规则
interface ApprovalRule {
  sessionId: string
  pattern: string            // glob 模式
  createdBy: string          // 授权者 WebID
  createdAt: string
  expiresAt: string          // session 结束时过期
}

// 后续匹配的 tool call 自动批准
// Bridge 推送 auto_approved 事件
{
  type: 'mcp.tool',
  sessionId: 'sess_001',
  toolCallId: 'tc_005',
  toolName: 'execute_command',
  status: 'approved',        // 自动批准
  arguments: { command: 'yarn lint' },
  // ...
}
```

### 7.5 下游消费映射

| 协议 | 消费方 | 说明 |
|------|--------|------|
| `MCPToolEvent` (waiting_approval) | 04-web-chat-ui → ToolApprovalCard | 显示审批卡片 |
| `MCPToolEvent` (waiting_approval) | 09-mobile → Push Notification | 推送审批通知 |
| `MCPToolEvent` (done/error) | 04/08-web → ToolCallCard | 更新工具调用状态 |
| `MCPControlCommand` (approve) | CLI Session | 转发审批结果 |
| `MCPControlCommand` (inject_message) | CLI Session | 注入用户指令 |
| `SessionStateSync` | ChatListPane | 更新列表项状态标签 |
| `ApprovalRule` | 08-web-session → 控制栏 | 显示已授权的模式列表 |

### 7.6 关键文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `mcp-bridge/events/tool-event.ts` | 新增 | MCPToolEvent 定义和发射 |
| `mcp-bridge/events/session-state.ts` | 新增 | SessionStateSync 定义和发射 |
| `mcp-bridge/commands/control.ts` | 新增 | MCPControlCommand 处理 |
| `mcp-bridge/commands/approval-rules.ts` | 新增 | 批量授权规则管理 |
| `mcp-bridge/transport/websocket.ts` | 新增 | WebSocket 推送通道 |
| `mcp-bridge/transport/sse.ts` | 新增 | SSE 推送通道 |
| `mcp-bridge/auth/permission.ts` | 新增 | 指令权限验证 |

