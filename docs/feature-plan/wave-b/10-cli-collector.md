# feat/cli-collector 执行文档

> 波次：Wave B

## 1. 目标与范围

- xpod sidecar CLI 采集、标准化、落库。

## 2. 依赖关系

- 入依赖：`feat/contracts-sidecar-events`、`feat/xpod-client-core`
- 出依赖：`feat/mcp-bridge`

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

> CLI Collector 负责将 CLI 工具输出解析为标准化 Block 并写入 Pod。
> 不定义新的 Pod 表，但定义 richContent Block 的 JSON schema 规范。

### 6A.1 消费的上游 Vocab

| 上游 Wave | Vocab | 用途 |
|-----------|-------|------|
| 01 | `MessageVocab` | 写入 `messageTable.richContent` |
| 01 | `CLISessionVocab` | 更新 `chatTable.sessionStatus` |
| 02 | `InboxVocab` | CLI tool call 需要审批时创建 inbox 记录 |

### 6A.2 richContent Block JSON Schema

CLI Collector 解析后写入 `messageTable.richContent` 的 JSON 格式：

```typescript
// Block 类型枚举（与 @linx/models MessageBlockType 对齐）
type CLIBlockType = 'thinking' | 'text' | 'tool' | 'tool_approval' | 'error'

interface CLIBlock {
  type: CLIBlockType
  timestamp: string              // ISO 8601

  // thinking
  content?: string               // 思考文本

  // text
  text?: string                  // 普通文本

  // tool
  toolCallId?: string
  toolName?: string              // read_file, write_file, execute_command, search, ...
  arguments?: Record<string, unknown>
  status?: 'calling' | 'running' | 'done' | 'error'
  result?: string
  error?: string
  duration?: number              // ms
  diff?: string                  // unified diff（write 操作时）

  // tool_approval
  risk?: 'low' | 'medium' | 'high'
  approvalStatus?: 'pending' | 'approved' | 'rejected' | 'auto_approved'
}
```

> **约束**：此 JSON schema 必须与 `@linx/models` 中 `MessageBlockType` / `MessageRichContent` 类型定义保持一致。
> CLI Collector 是 richContent 的主要生产者，UI 层是消费者。

### 6A.3 CLI 输出 → Pod 写入流程

```
CLI 原始输出 (stdout/stderr)
  ↓ CLIParser.parseLine()
  ↓ 生成 CLIBlock[]
  ↓ serializeMessageBlocks()
  ↓ INSERT messageTable: { chatId, threadId, maker: agentUri, role: 'assistant', content: plainText, richContent: JSON }
  ↓ 同时 UPDATE chatTable: { lastMessagePreview, lastActiveAt }
```

#### Session 生命周期写入

| CLI 事件 | Pod 写入 |
|---------|---------|
| Session 启动 | INSERT chatTable (chatType='cli_session', sessionStatus='active', sessionTool='claude-code') |
| 每条 AI 输出 | INSERT messageTable (richContent = Block[]) |
| Tool call 需审批 | INSERT inboxTable + messageTable (ToolApprovalBlock) |
| Session 完成 | UPDATE chatTable (sessionStatus='completed') |
| Session 出错 | UPDATE chatTable (sessionStatus='error') |

### 6A.4 解析器 → Vocab predicate 映射

解析器内部字段与 LINX_MSG namespace 的对应关系：

| CLIBlock 字段 | LINX_MSG predicate | 说明 |
|--------------|-------------------|------|
| `toolCallId` | `lxm:toolCallId` | 工具调用唯一 ID |
| `toolName` | `lxm:toolName` | 工具名称 |
| `arguments` | `lxm:toolArguments` | JSON 序列化参数 |
| `status` | `lxm:toolStatus` | 工具执行状态 |
| `duration` | `lxm:toolDuration` | 执行耗时 |
| `risk` | `lxm:toolRisk` | 风险等级 |
| `approvalStatus` | `lxm:approvalStatus` | 审批状态 |

> 这些 predicate 仅在审计提取场景下使用（从 richContent JSON 提取为独立 RDF 三元组）。
> 正常读写路径中，Block 以 JSON 整体存储在 `sioc:richContent` 字段内。

### 6A.5 不新增 Pod 表

CLI Collector 不新增 Pod 表。所有数据写入现有的 `chatTable`、`messageTable`、`inboxTable`。

---

## 7. 交互设计规格（Interaction Design Review）

> 本节定义 CLI Collector 将 CLI 工具输出解析为标准化 Block 的映射规则，确保 UI 层能统一渲染不同 CLI 工具的输出。

### 7.1 CLI 输出 → Block 映射规则

CLI Collector 负责将 Claude Code / Cursor / Windsurf 等工具的原始输出解析为标准化的 MessageBlock 序列。

#### 通用映射表

| CLI 原始输出模式 | 目标 Block 类型 | 解析规则 |
|-----------------|----------------|---------|
| AI 思考/推理文本 | `ThinkingBlock` | 匹配 `<thinking>` 标签或工具特定的思考标记 |
| 文件读取操作 | `ToolCallBlock` (read) | 匹配 `Read file:`, `cat`, `reading` 等模式 |
| 文件写入操作 | `ToolCallBlock` (write) | 匹配 `Write file:`, `editing`, `creating` 等模式 |
| 命令执行请求 | `ToolApprovalBlock` | 匹配 `Run command:`, `Execute:`, 权限请求提示 |
| Diff 输出 | `DiffBlock` (嵌入 ToolCallBlock) | 匹配 unified diff 格式 (`---`, `+++`, `@@`) |
| 搜索操作 | `ToolCallBlock` (search) | 匹配 `Search:`, `grep`, `find` 等模式 |
| 最终文本回复 | `TextBlock` | 非工具调用的普通文本输出 |
| 错误输出 | `ErrorBlock` | 匹配 stderr、`Error:`, `Failed:` 等模式 |

#### Claude Code 专用映射

```typescript
interface ClaudeCodeParser {
  patterns: {
    thinking: /^> thinking: (.+)/
    toolStart: /^> tool: (\w+)\((.+)\)/
    toolEnd: /^> tool result: (success|error)/
    approval: /^> permission: (.+)/
    diff: /^[+-]{3} [ab]\//        // unified diff header
    content: /^(?!> )/             // 非 > 前缀的普通文本
  }
}
```

#### Cursor 专用映射

```typescript
interface CursorParser {
  patterns: {
    thinking: /^\[thinking\] (.+)/
    fileRead: /^\[read\] (.+)/
    fileWrite: /^\[write\] (.+)/
    command: /^\[run\] (.+)/
    approval: /^\[confirm\] (.+)/
    content: /^(?!\[)/
  }
}
```

### 7.2 Block 序列化格式

解析后的 Block 序列存储为 `MessageRow.richContent` JSON：

```json
{
  "blocks": [
    {
      "type": "thinking",
      "content": "分析当前代码结构...",
      "timestamp": "2025-01-15T10:30:00Z"
    },
    {
      "type": "tool",
      "toolCallId": "tc_001",
      "toolName": "read_file",
      "arguments": { "path": "src/modules/chat/collections.ts" },
      "status": "done",
      "duration": 320,
      "timestamp": "2025-01-15T10:30:01Z"
    },
    {
      "type": "tool",
      "toolCallId": "tc_002",
      "toolName": "write_file",
      "arguments": { "path": "src/modules/chat/collections.ts" },
      "status": "done",
      "diff": "--- a/src/modules/chat/collections.ts\n+++ b/src/modules/chat/collections.ts\n@@ -42,1 +42,4 @@\n-const chatCollection = createCollection(...)\n+const chatCollection = createPodCollection({\n+  table: chatTable,\n+  queryKey: ['chats'],\n+})",
      "duration": 150,
      "timestamp": "2025-01-15T10:30:02Z"
    },
    {
      "type": "tool_approval",
      "toolCallId": "tc_003",
      "toolName": "execute_command",
      "arguments": { "command": "yarn test" },
      "risk": "medium",
      "status": "pending",
      "timestamp": "2025-01-15T10:30:03Z"
    }
  ]
}
```

### 7.3 实时 vs 批量解析

| 模式 | 触发条件 | 行为 |
|------|---------|------|
| 实时解析 | Session 状态为 `active` | 逐行解析 CLI 输出，通过 SSE 推送 `streaming.delta` 事件 |
| 批量解析 | Session 状态为 `completed` | 解析完整日志文件，生成 richContent JSON |
| 增量解析 | 断线重连 | 从 lastEventId 开始解析，补发缺失的 Block |

### 7.4 解析器注册机制

支持插件式注册不同 CLI 工具的解析器：

```typescript
interface CLIParser {
  /** 解析器标识 */
  id: 'claude-code' | 'cursor' | 'windsurf'

  /** 检测是否匹配此解析器 */
  detect(output: string): boolean

  /** 逐行解析 */
  parseLine(line: string, context: ParseContext): MessageBlock | null

  /** 解析完整日志 */
  parseLog(log: string): MessageBlock[]
}

interface ParseContext {
  currentThinking: boolean   // 是否在思考块内
  currentToolCall: string | null  // 当前工具调用 ID
  lineNumber: number
}
```

### 7.5 下游消费映射

| 输出 | 消费方 | 说明 |
|------|--------|------|
| `ThinkingBlock` | 08-web-session (💭 折叠) | 思考过程折叠显示 |
| `ToolCallBlock` (read) | 08-web-session (🔧 文件路径) | 文件读取操作 |
| `ToolCallBlock` (write) + diff | 08-web-session (📝 + DiffPreview) | 文件写入 + diff 预览 |
| `ToolApprovalBlock` | 08-web-session (⚠️ 审批卡片) | 命令执行审批 |
| `streaming.delta` 事件 | 02-contracts-sidecar-events | 实时推送到客户端 |

### 7.6 关键文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `cli-collector/parsers/claude-code.ts` | 新增 | Claude Code 输出解析器 |
| `cli-collector/parsers/cursor.ts` | 新增 | Cursor 输出解析器 |
| `cli-collector/parsers/registry.ts` | 新增 | 解析器注册中心 |
| `cli-collector/block-serializer.ts` | 新增 | Block → richContent JSON 序列化 |
| `cli-collector/stream-emitter.ts` | 新增 | 实时解析 → SSE 事件发射 |

