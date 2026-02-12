# feat/xpod-client-core 执行文档

> 波次：Wave A

## 1. 目标与范围

- xpod/sidecar typed client（auth、retry、stream、error model）。

## 2. 依赖关系

- 入依赖：无
- 出依赖：`feat/web-chat-ui`、`feat/mobile-chat-ui`、`feat/web-session-files-ui`、`feat/mobile-session-control-ui`、`feat/cli-collector`

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

> xpod-client-core 是客户端协议层，不定义新的 Pod 表或 Vocab。
> 本节说明它消费的上游 Vocab 和运行时数据结构与 Pod schema 的映射关系。

### 6A.1 消费的上游 Vocab

| 上游 Wave | Vocab | 用途 |
|-----------|-------|------|
| 01-contracts-chat-contact | `ChatBaseVocab`, `CLISessionVocab` | 读取 chatType、sessionStatus 等字段 |
| 01-contracts-chat-contact | `MessageVocab` | 写入 message（含 richContent blocks） |
| 02-contracts-sidecar-events | `InboxVocab` | 审批回调时更新 inbox 状态 |
| 02-contracts-sidecar-events | `AuditVocab` | 审批操作写入审计日志 |

### 6A.2 SSE 事件 → Pod 字段映射

xpod client 接收的 SSE 事件需要映射到 Pod schema 字段：

| SSE 事件 | 目标 Pod 表 | 目标字段 | 说明 |
|---------|-----------|---------|------|
| `content_delta` | messageTable | `content` (追加) | 流式文本累积 |
| `thinking_delta` | messageTable | `richContent` (ThinkingBlock) | 思考过程 Block |
| `tool_use_start` | messageTable | `richContent` (ToolBlock) | 新增 ToolBlock，status=calling |
| `tool_use_end` | messageTable | `richContent` (ToolBlock update) | 更新 ToolBlock status/duration |
| `tool_approval_request` | inboxTable | INSERT | 创建审批项 |
| `tool_approval_response` | inboxTable | UPDATE status | 回写审批结果 |
| `session_state_change` | chatTable | `sessionStatus` | 更新 CLISession 状态 |

### 6A.3 AutonomySettings 消费

xpod client 在发起 tool call 前需要检查 `AutonomySettings`（定义在 12-automation §6A）：

```typescript
// 运行时检查逻辑（不落 Pod，读取 settingsTable）
interface AutonomyCheck {
  /** 从 settingsTable 读取 autonomy.level */
  getLevel(): 'manual' | 'semi_auto' | 'full_auto'

  /** 判断 tool call 是否需要审批 */
  needsApproval(toolName: string, args: Record<string, unknown>): boolean

  /** 匹配命令白名单 */
  matchesWhitelist(command: string): boolean
}
```

> **设计决策**：AutonomySettings 存储在 `settingsTable`（key-value），
> xpod client 启动时加载一次，后续通过 Pod 变更通知增量更新。

### 6A.4 不新增 Pod 表

xpod-client-core 不新增任何 Pod 表或 Vocab namespace。
所有持久化操作通过引用上游 01/02 定义的 schema 完成。

---

## 7. 交互设计规格（Interaction Design Review）

> 本节定义 xpod client core 中与交互相关的 streaming 协议扩展和审批回调接口。

### 7.1 Tool Call Streaming 协议

当前 xpod client 的 SSE streaming 只处理 `content` 和 `thinking` 两种 delta。需要扩展以支持 tool_use 的实时状态推送。

#### SSE 事件格式扩展

```
// 现有
event: content_delta
data: {"text": "..."}

event: thinking_delta
data: {"text": "..."}

// 新增
event: tool_use_start
data: {"toolCallId": "tc_001", "toolName": "read_file", "arguments": {"path": "/src/app.ts"}}

event: tool_use_delta
data: {"toolCallId": "tc_001", "output": "...partial output..."}

event: tool_use_end
data: {"toolCallId": "tc_001", "status": "done", "duration": 320}

event: tool_approval_required
data: {"toolCallId": "tc_002", "toolName": "delete_file", "arguments": {"path": "/data/important.ttl"}, "risk": "high", "timeout": 30}
```

#### Client 端处理流程

```
SSE stream
    ↓
xpod-client parser
    ↓ tool_use_start
IncomingStrategy.onToolCallStart?.(toolCallId, toolName, args)
    ↓ tool_approval_required
IncomingStrategy.onToolApproval?.(toolCallId, toolName, args, risk)
    → UI 显示审批卡片
    → 用户点击批准/拒绝
    → OutgoingStrategy.sendApproval(toolCallId, 'approved' | 'rejected')
    ↓ tool_use_end
IncomingStrategy.onToolCallEnd?.(toolCallId, status, result, duration)
```

### 7.2 IncomingStrategy 扩展

在 `types.ts` 的 `IncomingStrategy` 接口中新增回调：

```typescript
interface IncomingStrategy {
  // ... 现有回调

  /** 工具调用开始 */
  onToolCallStart?: (toolCallId: string, toolName: string, args: Record<string, unknown>) => void

  /** 工具调用需要审批 */
  onToolApproval?: (toolCallId: string, toolName: string, args: Record<string, unknown>, risk: 'low' | 'medium' | 'high', timeout: number) => void

  /** 工具调用输出增量 */
  onToolCallDelta?: (toolCallId: string, output: string) => void

  /** 工具调用结束 */
  onToolCallEnd?: (toolCallId: string, status: 'done' | 'error', result?: unknown, duration?: number) => void
}
```

### 7.3 OutgoingStrategy 扩展

新增审批指令发送能力：

```typescript
interface OutgoingStrategy {
  // ... 现有方法

  /** 发送工具调用审批结果 */
  sendApproval?: (toolCallId: string, decision: 'approved' | 'rejected') => Promise<void>

  /** 向 CLI session 注入指令 */
  injectMessage?: (sessionId: string, message: string) => Promise<void>
}
```

### 7.4 Error Model 扩展

工具调用相关的错误类型：

```typescript
type ToolCallError =
  | { code: 'TOOL_TIMEOUT'; toolCallId: string; timeout: number }
  | { code: 'TOOL_REJECTED'; toolCallId: string; rejectedBy: string }
  | { code: 'TOOL_EXECUTION_FAILED'; toolCallId: string; error: string }
  | { code: 'APPROVAL_TIMEOUT'; toolCallId: string; autoAction: 'rejected' }
```

### 7.5 Retry 策略

| 场景 | 策略 | 说明 |
|------|------|------|
| SSE 连接断开 | 自动重连 + 从 lastEventId 恢复 | 不丢失 tool call 状态 |
| 审批超时 | 自动拒绝 + 通知用户 | 30s 默认超时 |
| 工具执行失败 | 不自动重试，由 AI 决定 | AI 可能选择替代方案 |
| 审批指令发送失败 | 最多重试 3 次，间隔 1s | 确保审批结果送达 |

### 7.6 下游消费映射

| 接口 | 消费方 | 说明 |
|------|--------|------|
| `onToolCallStart` | useChatHandler → ToolCallCard | 渲染工具调用卡片（spinner 状态） |
| `onToolApproval` | useChatHandler → ToolApprovalCard | 渲染审批卡片（按钮 + 倒计时） |
| `onToolCallEnd` | useChatHandler → ToolCallCard | 更新卡片状态（✓/✗ + 耗时） |
| `sendApproval` | ToolApprovalCard → xpod client | 用户点击批准/拒绝后发送 |
| `injectMessage` | CLI Session Inputbar → xpod client | 向 CLI session 注入指令 |

