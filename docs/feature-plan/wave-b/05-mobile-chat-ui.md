# feat/mobile-chat-ui 执行文档

> 波次：Wave B

## 1. 目标与范围

- Mobile Chat UI（会话、消息、输入）。

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

> Mobile Chat UI 是纯 UI 消费层，不定义新的 Pod 表或 Vocab namespace。
> 移动端与 Web 端共享同一套 Vocab，差异仅在 UI 渲染层。

### 6A.1 消费的上游 Vocab

| 上游 Wave | Vocab | UI 组件 | 消费字段 |
|-----------|-------|---------|---------|
| 01 | `ChatBaseVocab` | ChatList (Mobile) | `chatType`, `title`, `avatarUrl`, `lastMessagePreview`, `lastActiveAt`, `unreadCount` |
| 01 | `CLISessionVocab` | SessionCard (Mobile) | `sessionStatus`, `sessionTool` |
| 01 | `MessageVocab` | MessageBubble (Mobile) | `content`, `richContent`, `maker`, `role` |
| 02 | `InboxVocab` | ApprovalSheet (Mobile) | `toolName`, `risk`, `status` — 底部 Sheet 快速审批 |

### 6A.2 移动端 richContent Block 简化渲染

移动端对 Block 的渲染做简化处理：

| Block type | 移动端渲染 | 与桌面端差异 |
|-----------|-----------|-------------|
| `thinking` | 单行摘要 + "展开" | 桌面端默认展开更多行 |
| `tool` | 工具名 + 状态图标 | 不展示完整参数，点击查看详情 |
| `tool` + diff | "N 个文件变更" 摘要 | 不内联 diff，点击跳转 |
| `tool_approval` | Push 通知 + 底部 Sheet | 桌面端内联审批卡片 |
| `text` | 标准 Markdown | 相同 |
| `error` | 红色提示条 | 相同 |

### 6A.3 不新增 Pod 表

Mobile Chat UI 不新增任何 Pod 表。与 Web 端共享 `@linx/models` 的 schema 定义。

---

## 7. 交互设计规格（Interaction Design Review）

> 本节定义 Mobile Chat UI 中 AI 协作交互的移动端适配规格。移动端用户更多是"监控和轻量控制"而非"深度编辑"。

### 7.1 移动端 vs 桌面端交互差异

| 场景 | 桌面端 (04-web-chat-ui) | 移动端 |
|------|------------------------|--------|
| 审批 tool call | 内联卡片 + 按钮 | 推送通知 + 快捷操作（通知栏直接批准） |
| 查看 thinking | 可折叠展开 | 默认折叠，点击展开 |
| 查看 tool 结果 | 内联展示完整结果 | 摘要 + "查看详情"链接 |
| 输入消息 | 多行 textarea | 单行 + 展开按钮 |
| 文件操作 | 拖拽上传 | 相机/相册/文件选择器 |
| @mention | 输入 @ 弹出下拉列表 | 输入 @ 弹出底部 sheet |
| 消息操作 | hover 显示 menubar | 长按弹出操作菜单 |

### 7.2 推送通知审批

当 AI 请求执行 `risk=medium` 或 `risk=high` 的工具调用时，移动端通过系统推送通知用户。

#### 通知格式

```
┌─────────────────────────────────────────┐
│ LinX                                now │
│ 🔧 Claude 请求执行 delete_file          │
│ 路径: /data/important.ttl               │
│ [批准]  [拒绝]                          │
└─────────────────────────────────────────┘
```

- 通知类别：`tool_approval`（iOS Notification Category / Android Notification Channel）
- 快捷操作：通知栏直接显示"批准"/"拒绝"按钮，无需打开 app
- 点击通知体：打开 app 并跳转到对应 chat 的审批卡片
- 超时：与桌面端一致（high=30s 自动拒绝，medium=60s 自动批准）

#### 推送触发条件

| 条件 | 是否推送 | 说明 |
|------|---------|------|
| App 在前台 + 当前 chat | 不推送 | 直接显示内联审批卡片 |
| App 在前台 + 其他页面 | 推送 in-app toast | 顶部横幅，点击跳转 |
| App 在后台 | 系统推送 | 通知栏 + 快捷操作 |
| App 未启动 | 系统推送 | 通知栏 + 快捷操作 |

### 7.3 简化 Tool 展示

移动端屏幕有限，tool call 展示需要精简：

#### ToolCallCard（移动端）

```
┌─────────────────────────────────┐
│ 🔧 read_file ✓ 0.3s            │
└─────────────────────────────────┘
```

- 单行展示：工具名 + 状态图标 + 耗时
- 参数默认隐藏，点击展开
- 多个连续 tool call 折叠为 "执行了 3 个操作 ▼"，点击展开

#### ToolApprovalCard（移动端）

```
┌─────────────────────────────────────┐
│ 🔧 delete_file                      │
│ /data/important.ttl                 │
│ 🔴 高风险                           │
│                                      │
│ ┌───────────┐  ┌───────────┐       │
│ │  ❌ 拒绝   │  │  ✅ 批准   │       │
│ └───────────┘  └───────────┘       │
│              ⏱ 30s                  │
└─────────────────────────────────────┘
```

- 按钮足够大（min-height: 44px），适合单手操作
- 风险描述文案精简为一行
- 倒计时居中显示

### 7.4 ThinkingBlock 移动端适配

- 默认折叠，显示 "💭 思考中..." 或 "💭 思考完成"
- 点击展开完整思考过程
- 展开后最大高度 `max-h-[200px]`，超出滚动
- 折叠动画：`transition-all duration-200`

### 7.5 输入栏适配

```
┌─────────────────────────────────────┐
│ [📎] [消息输入...]        [发送 ➤]  │
└─────────────────────────────────────┘

// 展开后
┌─────────────────────────────────────┐
│ ┌─────────────────────────────────┐ │
│ │ 消息输入...                      │ │
│ │                                  │ │
│ │                                  │ │
│ └─────────────────────────────────┘ │
│ [📎] [💡] [🌐]            [发送 ➤] │
└─────────────────────────────────────┘
```

- 默认单行输入，点击后展开为多行
- 工具栏（深度思考、联网）在展开后显示
- @mention：输入 `@` 后弹出底部 sheet，列出群成员和 AI
- 文件附件：点击 📎 弹出系统选择器（相机/相册/文件）

### 7.6 Group Chat 移动端特殊处理

- 消息头部：头像 + 名称左对齐，紧凑排列
- @我 消息：背景高亮 `bg-primary/5`
- 群成员列表：从右侧滑入的 sheet，而非侧边栏
- 群设置：独立页面（push navigation），非弹窗

### 7.7 关键文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `mobile/chat/ToolCallCard.tsx` | 新增 | 移动端精简版工具调用卡片 |
| `mobile/chat/ToolApprovalCard.tsx` | 新增 | 移动端大按钮审批卡片 |
| `mobile/chat/MentionSheet.tsx` | 新增 | @mention 底部选择 sheet |
| `mobile/chat/MessageBubble.tsx` | 修改 | 长按操作菜单、group 发送者头部 |
| `mobile/chat/Inputbar.tsx` | 修改 | 单行/多行切换、@mention 触发 |
| `services/push-notification.ts` | 新增 | 推送通知注册和处理 |

