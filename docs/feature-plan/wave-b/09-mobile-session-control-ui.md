# feat/mobile-session-control-ui 执行文档

> 波次：Wave B

## 1. 目标与范围

- Mobile 会话控制面（轻量控制 + 状态）。

## 2. 依赖关系

- 入依赖：`feat/contracts-chat-contact`、`feat/contracts-sidecar-events`、`feat/xpod-client-core`
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

> Mobile Session Control UI 是 CLI Session 的移动端"远程遥控器"，不定义新的 Pod 表。
> 与 08-web-session-files-ui 共享同一套 Vocab。

### 6A.1 消费的上游 Vocab

| 上游 Wave | Vocab | UI 组件 | 消费字段 |
|-----------|-------|---------|---------|
| 01 | `CLISessionVocab` | SessionDetailPage (Mobile) | `sessionStatus`, `sessionTool`, `tokenUsage` |
| 02 | `InboxVocab` | ApprovalPushNotification | `toolName`, `risk`, `status` |
| 02 | `InboxVocab` | QuickApprovalSheet | `toolCallRef`, `toolArguments` |

### 6A.2 推送通知 → Inbox 映射

移动端收到 Push Notification 时，通过 `inboxItemId` 关联到 `inboxTable` 记录：

```
Push Notification payload:
  { inboxItemId: "xxx", sessionId: "yyy", toolName: "execute_command", risk: "high" }
  → 用户点击 → 打开 QuickApprovalSheet
  → 审批操作 → UPDATE inboxTable (status, decisionBy, decisionRole)
  → 同时 INSERT auditTable
```

### 6A.3 不新增 Pod 表

Mobile Session Control UI 不新增任何 Pod 表。

---

## 7. 交互设计规格（Interaction Design Review）

> 本节定义 Mobile Session Control UI 的交互规格。移动端 session 控制是"远程遥控器"模式——监控状态、快速审批、轻量注入。

### 7.1 Session 详情页

```
┌─────────────────────────────────────┐
│ ← linx-web 重构                    │
│ 🟢 运行中 · 1.2k tokens            │
├─────────────────────────────────────┤
│                                      │
│ [实时日志流 - 最近事件]               │
│                                      │
│ 💭 分析代码结构...                    │
│ 🔧 Read collections.ts ✓            │
│ 📝 Write collections.ts             │
│ ⚠️ 请求执行 yarn test               │
│                                      │
│ ┌──────────────────────────────┐    │
│ │  [❌ 拒绝]    [✅ 批准]      │    │
│ └──────────────────────────────┘    │
│                                      │
├─────────────────────────────────────┤
│ [⏸] [⏹] [📋]        [发送指令 ➤]  │
└─────────────────────────────────────┘
```

### 7.2 简化日志流

移动端不显示完整消息流，只显示关键事件摘要：

#### 事件类型与显示

| 事件类型 | 图标 | 显示内容 | 说明 |
|---------|------|---------|------|
| thinking_start | 💭 | "分析代码结构..." | 只显示第一行 |
| tool_call (read) | 🔧 | "Read collections.ts ✓" | 文件名 + 状态 |
| tool_call (write) | 📝 | "Write collections.ts" | 文件名，无 diff |
| tool_approval | ⚠️ | "请求执行 yarn test" | 高亮显示 |
| text_output | 💬 | "重构完成，修改了 3 个文件" | 最终输出摘要 |
| error | ❌ | "执行失败: timeout" | 错误信息 |

#### 日志流规则

- 默认显示最近 20 条关键事件
- 连续的 thinking 事件合并为一条
- 连续的 read tool call 折叠为 "读取了 N 个文件"
- 向上滚动加载更多历史事件
- 新事件自动滚动到底部（除非用户正在查看历史）

### 7.3 推送通知 + 快捷审批

移动端 session 控制的核心交互是通过推送通知实现远程审批。

#### 推送通知格式

```
┌─────────────────────────────────────┐
│ LinX · linx-web 重构           now  │
│ ⚠️ Claude 请求执行 yarn test        │
│ [批准]  [拒绝]                      │
└─────────────────────────────────────┘
```

#### 推送触发规则

| 事件 | 推送条件 | 通知内容 |
|------|---------|---------|
| tool_approval (high) | 始终推送 | 工具名 + 参数摘要 + 批准/拒绝按钮 |
| tool_approval (medium) | App 不在前台时推送 | 工具名 + 批准/拒绝按钮 |
| session_error | 始终推送 | 错误信息 + "查看详情" |
| session_completed | App 不在前台时推送 | "Session 已完成" + token 用量 |

#### 快捷操作

- iOS: Notification Actions（最多 4 个按钮）
- Android: Notification Action Buttons
- 操作：批准 / 拒绝 / 查看详情
- 批准/拒绝直接在通知栏完成，无需打开 app

### 7.4 控制栏

底部固定控制栏，大按钮设计适合单手操作：

```
┌─────────────────────────────────────┐
│  [⏸ 暂停]  [⏹ 停止]  [📋 日志]    │
│                                      │
│  [输入指令...]              [➤]     │
└─────────────────────────────────────┘
```

- 控制按钮：min-height 44px，间距 12px
- 输入栏：单行，发送后清空
- 暂停/停止需要二次确认（底部 ActionSheet）

#### 按钮状态（同 08-web-session）

| Session 状态 | 可用按钮 | 禁用按钮 |
|-------------|---------|---------|
| `active` | ⏸暂停, ⏹停止, 📋日志, 发送 | ▶恢复 |
| `paused` | ▶恢复, ⏹停止, 📋日志 | ⏸暂停, 发送 |
| `completed` | 📋日志 | 其他全部 |
| `error` | 📋日志 | 其他全部 |

### 7.5 Session 列表（移动端）

移动端 session 列表作为 Chat 列表的一个 tab 或 section：

```
┌─────────────────────────────────────┐
│ Sessions                            │
├─────────────────────────────────────┤
│ [CC] linx-web 重构                  │
│      🟢 运行中 · 1.2k tokens  10:30 │
├─────────────────────────────────────┤
│ [Cu] API 端点修复                   │
│      ✅ 已完成 · 3.4k tokens  09:15 │
├─────────────────────────────────────┤
│ [CC] 数据库迁移                     │
│      ❌ 错误 · 超时           昨天  │
└─────────────────────────────────────┘
```

- 点击进入 session 详情页
- 左滑显示"删除"操作
- 运行中的 session 显示脉冲动画（状态点）

### 7.6 关键文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `mobile/session/SessionDetailPage.tsx` | 新增 | Session 详情页（日志流 + 控制栏） |
| `mobile/session/EventLogStream.tsx` | 新增 | 简化日志流组件 |
| `mobile/session/SessionControlBar.tsx` | 新增 | 底部控制栏 |
| `mobile/session/SessionListSection.tsx` | 新增 | Session 列表 section |
| `services/push-notification.ts` | 修改 | 新增 session 相关推送类别 |

