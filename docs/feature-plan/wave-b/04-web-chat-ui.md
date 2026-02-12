# feat/web-chat-ui 执行文档

> 波次：Wave B

## 1. 目标与范围

- Web Chat UI（含 group chat）。

## 2. 依赖关系

- 入依赖：`feat/contracts-chat-contact`、`feat/xpod-client-core`
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

> Web Chat UI 是纯 UI 消费层，不定义新的 Pod 表或 Vocab namespace。
> 本节说明 UI 组件与上游 Vocab 字段的绑定关系。

### 6A.1 消费的上游 Vocab

| 上游 Wave | Vocab | UI 组件 | 消费字段 |
|-----------|-------|---------|---------|
| 01 | `ChatBaseVocab` | ChatListPane | `chatType`, `title`, `avatarUrl`, `lastMessagePreview`, `lastActiveAt`, `unreadCount`, `starred`, `muted` |
| 01 | `DirectAIChatVocab` | ChatContentPane (AI) | `agentWorkspaceRef` → 加载 Agent 配置 |
| 01 | `GroupChatVocab` | ChatContentPane (Group) | `groupOwner`, `groupAdmin`, `participants` |
| 01 | `CLISessionVocab` | ChatListPane (Session 项) | `sessionStatus`, `sessionTool`, `tokenUsage` |
| 01 | `MessageVocab` | MessageList, Message | `content`, `richContent`, `maker`, `role`, `senderName`, `mentions` |
| 02 | `InboxVocab` | ToolApprovalCard | `toolName`, `toolArguments`, `risk`, `status` |
| 02 | `AuditVocab` | AuditLogViewer (P2) | `action`, `actor`, `actorRole`, `context` |

### 6A.2 chatType → UI 渲染映射

ChatListPane 根据 `chatType` 字段差异化渲染：

| `chatType` 值 | 头像来源 | 标题 | 预览文本 | 右上角 | 角标 |
|---------------|---------|------|---------|--------|------|
| `direct_ai` | Agent.avatarUrl (via contact) | `chat.title` | `lastMessagePreview` | `lastActiveAt` | `unreadCount` |
| `direct_human` | Contact.avatarUrl + 在线状态 | `chat.title` | `lastMessagePreview` / "对方正在输入..." | `lastActiveAt` | `unreadCount` |
| `group` | 多头像拼接 | `chat.title` (群名) | `"senderName: preview"` | `lastActiveAt` | `unreadCount` + @我 |
| `cli_session` | CLI tool logo | `chat.title` | 状态标签（见 08-web-session） | `lastActiveAt` | 无 |

### 6A.3 richContent Block → 组件映射

| Block type (in richContent JSON) | UI 组件 | 说明 |
|----------------------------------|---------|------|
| `thinking` | ThinkingBlock (💭 折叠) | 可展开/折叠 |
| `text` | MainTextBlock | Markdown 渲染 |
| `tool` (status=done) | ToolCallCard (🔧) | 文件路径 + 耗时 |
| `tool` (status=calling/running) | ToolCallCard (⏳ spinner) | 实时状态 |
| `tool` + diff | ToolCallCard + DiffPreview (📝) | 代码变更预览 |
| `tool_approval` (status=pending) | ToolApprovalCard (⚠️) | 审批按钮 |
| `tool_approval` (status=approved) | ToolApprovalCard (✅) | 已批准标记 |
| `error` | ErrorBlock (❌) | 错误信息 |
| `image` | ImageBlock | 图片预览 |
| `code` | CodeBlock | 语法高亮 |

### 6A.4 不新增 Pod 表

Web Chat UI 不新增任何 Pod 表。所有数据读写通过 `@linx/models` 导出的 table 和 repository 完成。

---

## 7. 交互设计规格（Interaction Design Review）

> 本节定义 Web Chat UI 中 AI 协作交互的完整规格，包括执行过程呈现、审批流程、1v1 vs Group 差异。

### 7.1 AI 执行过程呈现

当前 UI 只渲染 streaming text + thinking block。需要补充 tool call 实时状态流。

#### Tool Call 状态流

```
用户发送消息
    ↓
AI 开始思考 → [ThinkingBlock: streaming]
    ↓
AI 决定调用工具 → [ToolCallCard: status=calling, toolName="read_file", args={path: "..."}]
    ↓
(risk=high) → [ToolApprovalCard: status=pending] → 用户点击 ✅ 批准 / ❌ 拒绝
    ↓
(risk=low)  → 自动执行，显示 [ToolCallCard: status=running → done]
    ↓
AI 继续思考 → [ThinkingBlock: streaming]
    ↓
AI 输出最终回复 → [MainTextBlock: streaming]
```

#### 新增 UI 组件

| 组件 | 位置 | 交互 | 文件 |
|------|------|------|------|
| `ToolCallCard` | Message block 内 | 展示工具名、参数摘要、执行状态（spinner/✓/✗）、耗时 | `Blocks/ToolCallBlock.tsx` |
| `ToolApprovalCard` | Message block 内 | 展示工具名、参数详情、风险等级标签、✅批准/❌拒绝按钮、自动超时倒计时 | `Blocks/ToolApprovalBlock.tsx` |
| `TaskProgressBar` | Message block 内 | 多步骤进度条，当前步骤高亮，已完成步骤打勾 | `Blocks/TaskProgressBlock.tsx` |
| `ExecutionTimeline` | 右侧边栏（可选） | 当前 session 的完整执行时间线（thinking → tool → text 序列） | `components/ExecutionTimeline.tsx` |

#### ToolCallCard 视觉规格

```
┌─────────────────────────────────────────────┐
│ 🔧 read_file                    ✓ 0.3s     │
│    path: "/src/app.ts"                      │
└─────────────────────────────────────────────┘
```

- 背景：`bg-muted/50`，边框 `border border-border/30`
- 状态图标：`calling` → spinner (animate-spin)，`done` → ✓ (text-green-500)，`error` → ✗ (text-red-500)
- 参数摘要：单行截断，hover 展开完整参数
- 耗时：右对齐，`text-muted-foreground text-xs`
- 圆角：`rounded-sm`（遵循 ui-specs 紧凑风格）

#### ToolApprovalCard 视觉规格

```
┌─────────────────────────────────────────────────────┐
│  🔧 AI 请求执行操作                                  │
│                                                      │
│  工具: delete_file                                   │
│  参数: { path: "/data/important.ttl" }               │
│  风险: 🔴 高                                          │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ 此操作将删除文件，不可恢复。                    │   │
│  │ 确认要执行吗？                                 │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  [❌ 拒绝]  [✅ 批准]           ⏱ 自动拒绝: 30s     │
│                                                      │
└─────────────────────────────────────────────────────┘
```

- 风险标签颜色：`low` → `bg-green-500/10 text-green-600`，`medium` → `bg-yellow-500/10 text-yellow-600`，`high` → `bg-red-500/10 text-red-600`
- 批准按钮：`variant="default"` (品牌色)
- 拒绝按钮：`variant="outline"`
- 倒计时：仅 `risk=high` 显示，30s 倒计时，到 0 自动拒绝
- 已审批状态：按钮替换为灰色文字 "已批准 ✓" 或 "已拒绝 ✗"

#### 风险等级规则

| 等级 | 操作类型 | UI 行为 | 超时 |
|------|---------|---------|------|
| 🟢 低 | read_file, search, query, list | 自动批准，仅显示 ToolCallCard | 无 |
| 🟡 中 | write_file, update_record, create | 显示 ToolApprovalCard，用户可一键批准 | 60s 自动批准 |
| 🔴 高 | delete_file, execute_command, drop | 显示 ToolApprovalCard + 警告文案，必须手动批准 | 30s 自动拒绝 |

### 7.2 审批流程

#### useChatHandler 扩展

```typescript
// hooks/useChatHandler.ts 新增状态和方法
interface UseChatHandlerReturn {
  // ... 现有

  /** 待审批的 tool calls */
  pendingApprovals: Array<{
    toolCallId: string
    toolName: string
    arguments: Record<string, unknown>
    risk: 'low' | 'medium' | 'high'
    timeout: number
    requestedAt: Date
  }>

  /** 批准 tool call */
  approveToolCall: (toolCallId: string) => Promise<void>

  /** 拒绝 tool call */
  rejectToolCall: (toolCallId: string) => Promise<void>
}
```

#### IncomingStrategy 扩展

```typescript
// services/types.ts IncomingStrategy 新增回调
interface IncomingStrategy {
  // ... 现有

  /** 工具调用开始 */
  onToolCallStart?: (toolCallId: string, toolName: string, args: Record<string, unknown>) => void

  /** 工具调用需要审批 */
  onToolApproval?: (toolCallId: string, toolName: string, args: Record<string, unknown>, risk: 'low' | 'medium' | 'high', timeout: number) => void

  /** 工具调用结束 */
  onToolCallEnd?: (toolCallId: string, status: 'done' | 'error', result?: unknown, duration?: number) => void
}
```

### 7.3 1v1 AI Chat 增强

当前已有基础 1v1 AI chat。需要增强以下交互：

```
┌─────────────────────────────────────────────────────────┐
│ [Avatar] Claude 3.5 Sonnet          [⚙️] [📋] [🌙]     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  [🤖] Claude                                    10:30   │
│       让我来分析这个问题...                               │
│       [💭 思考过程 ▼]                                    │
│       [🔧 read_file("/src/app.ts") ✓ 0.3s]             │
│       [🔧 search("handleAuth") ✓ 0.5s]                 │
│       根据代码分析，问题出在...                            │
│       ─────────────────────────────                      │
│       [📋复制] [🔄重试] [👎] [👍]                        │
│                                                          │
│  [👤] 你                                        10:31   │
│       帮我修复这个 bug                                    │
│                                                          │
│  [🤖] Claude                                    10:31   │
│       [💭 思考中...]                                     │
│       [🔧 write_file 等待批准...]                        │
│       ┌──────────────────────────────────────┐          │
│       │ 修改 src/auth.ts 第 42 行             │          │
│       │ [查看 diff]  [✅批准] [❌拒绝]         │          │
│       └──────────────────────────────────────┘          │
│                                                          │
├─────────────────────────────────────────────────────────┤
│ [💡深度思考] [🌐联网] [📎]                    [发送 ➤]   │
└─────────────────────────────────────────────────────────┘
```

增强点：
- Tool call 卡片内联显示（不是弹窗），在消息流中自然排列
- 审批操作直接在消息流中完成，无需跳转
- 执行状态实时更新（spinner → ✓/✗），无需刷新
- 多个 tool call 按执行顺序纵向排列

### 7.4 Group Chat 交互规格（新增）

```
┌─────────────────────────────────────────────────────────┐
│ [👥] 项目讨论组 (5人)               [⚙️] [👥] [🌙]     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  [Alice 头像] Alice                             10:30   │
│       大家看下这个方案可行吗？                             │
│       [附件: design-v2.pdf]                              │
│                                                          │
│  [Bob 头像] Bob                                 10:32   │
│       @Alice 我觉得第三点需要调整                         │
│                                                          │
│  [🤖] Claude (AI 助手)                          10:33   │
│       根据 @Alice 的方案和 @Bob 的建议，                  │
│       我整理了修改建议：                                   │
│       1. ...                                             │
│       2. ...                                             │
│       [🔧 分析文档中... ✓]                               │
│       ─────────────────────────────                      │
│       [📋复制] [🔄重试] [👎] [👍]                        │
│                                                          │
│  [你的头像] 你                                   10:34   │
│       @Claude 帮我生成一个实现计划                        │
│                                                          │
├─────────────────────────────────────────────────────────┤
│ [@提及 ▼] [💡深度思考] [📎]                   [发送 ➤]   │
└─────────────────────────────────────────────────────────┘

                                    ┌──────────────────┐
                                    │ 群成员 (5)        │
                                    ├──────────────────┤
                                    │ 🟢 Alice (群主)   │
                                    │ 🟢 Bob            │
                                    │ ⚪ Carol (离线)   │
                                    │ 🤖 Claude         │
                                    │ 🟢 你             │
                                    ├──────────────────┤
                                    │ [+ 邀请成员]      │
                                    └──────────────────┘
```

### 7.5 1v1 vs Group 交互差异清单

| 维度 | 1v1 AI Chat | Group Chat |
|------|------------|------------|
| 消息头部 | 只显示 AI 模型名 + logo | 显示每个发送者的名称 + 头像 |
| 输入栏 | 无 @mention | 支持 @mention（@人 或 @AI） |
| AI 触发 | 每条用户消息自动触发 AI | 只有 @AI 或 AI 被配置为自动回复时触发 |
| 审批 | 当前用户审批 | 群主或指定角色审批 |
| 右侧边栏 | Agent 配置（模型、prompt） | 群成员列表 + 在线状态 |
| 列表项图标 | Provider logo | 群头像（多头像拼接） |
| 未读 | 数字角标 | 数字角标 + @我 标记 |
| 上下文菜单 | 标星/静音/删除 | 标星/静音/退出群聊/群设置 |
| 消息操作 | 复制/重试/删除 | 复制/引用回复/删除/@提及 |

### 7.6 关键文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `Blocks/ToolCallBlock.tsx` | 新增 | 工具调用卡片组件 |
| `Blocks/ToolApprovalBlock.tsx` | 新增 | 审批卡片组件 |
| `Blocks/TaskProgressBlock.tsx` | 新增 | 多步骤进度条组件 |
| `Messages/Message.tsx` | 修改 | 新增 block type 分发渲染 |
| `Messages/MessageHeader.tsx` | 修改 | Group chat 显示发送者名称 + 头像 |
| `Messages/MessageList.tsx` | 修改 | 支持 group chat 消息分组 |
| `Inputbar/Inputbar.tsx` | 修改 | 新增 @mention 输入支持 |
| `Inputbar/InputbarTools.tsx` | 修改 | 新增 tool 选择器（可选） |
| `hooks/useChatHandler.ts` | 修改 | 新增 pendingApprovals, approveToolCall, rejectToolCall |
| `services/types.ts` | 修改 | IncomingStrategy 新增 tool call 回调 |
| `ChatContentPane.tsx` | 修改 | 根据 chatType 切换右侧边栏内容 |
| `ChatListPane.tsx` | 修改 | 根据 chatType 显示不同图标和标识 |

### 7.7 ChatListPane 列表项信息规格（已确认）

> 设计原则：list item 只放"扫一眼就够"的信息，详细内容（模型名、token 用量、工具调用等）进 content pane。

#### 信息布局

```
┌──────────────────────────────────────────────────┐
│ [头像]  标题                              时间    │
│         预览文字                      角标/标记   │
└──────────────────────────────────────────────────┘
```

- 高度：64px（与 WeChat 桌面端一致）
- 头像：48×48，圆角 4px
- 标题：14px font-weight 500，单行截断
- 预览：12px text-muted-foreground，单行截断
- 时间：12px 右上角
- 角标：右下角

#### 各 chatType 信息定义

| 位置 | `direct_ai` | `direct_human` | `group` | `cli_session` |
|------|------------|----------------|---------|---------------|
| 头像 | Provider logo | 用户头像 + 在线状态点(🟢/⚪) | 多头像拼接 | CLI 工具 logo |
| 标题 | chat title | chat title | 群名 | session title |
| 预览 | 最后消息预览 | 最后消息预览 / "对方正在输入..." | "Alice: 消息内容" | 🟢运行中 / ⚠️等待确认 / ✅已完成 / ❌错误 |
| 右上角 | 时间 | 时间 | 时间 | 时间 |
| 角标/标记 | 未读数 | 未读数 | 未读数 + [有人@我] | 无 |

#### 设计决策记录

- `cli_session` 预览区放状态文字而非消息预览，因为"⚠️等待确认"本身就是一种需要用户注意的状态
- `cli_session` 不显示 token 用量和工具信息——展示不下，进 content pane header
- `group` 标题不显示成员数——保持干净，成员数进 content pane header
- `direct_human` 在线状态点 Wave B 第一版就做——Solid presence 是核心社交功能
- `direct_ai` 不显示模型名——标题已经够用，模型信息进 content pane header

#### 右键菜单差异

| chatType | 菜单项 |
|----------|--------|
| `direct_ai` | 标星 / 静音 / 标记未读 / 删除 |
| `direct_human` | 标星 / 静音 / 标记未读 / 删除 |
| `group` | 标星 / 静音 / 标记未读 / 退出群聊 / 群设置 |
| `cli_session` | 标星 / 复制日志 / 停止 / 删除 |

#### ChatItemData 扩展

```typescript
interface ChatItemData {
  // 现有字段
  id: string
  title: string
  preview: string
  timestamp: string
  starred: boolean
  muted: boolean
  unreadCount: number
  providerLogo?: string

  // 新增字段
  chatType: 'direct_ai' | 'direct_human' | 'group' | 'cli_session'

  // direct_human
  onlineStatus?: 'online' | 'offline'    // 头像右下角在线状态点

  // group（群内可包含人和 AI 成员）
  participantAvatars?: string[]           // 多头像拼接数据源（最多取前 4 个），人用 ContactRow.avatarUrl，AI 用 AgentRow.avatarUrl
  senderName?: string                     // 预览前缀 "Alice: ..." 或 "Claude: ..."
  mentionedMe?: boolean                   // [有人@我] 标记

  // cli_session
  sessionStatus?: 'active' | 'waiting_approval' | 'paused' | 'completed' | 'error'
  sessionTool?: 'claude-code' | 'cursor' | 'windsurf'
}
```

#### cli_session 预览文字映射

| sessionStatus | 预览文字 | 颜色 |
|---------------|---------|------|
| `active` | 🟢 运行中 | `text-green-600` |
| `waiting_approval` | ⚠️ 等待确认 | `text-yellow-600` |
| `paused` | ⏸ 已暂停 | `text-muted-foreground` |
| `completed` | ✅ 已完成 | `text-green-600` |
| `error` | ❌ 错误 | `text-red-600` |

