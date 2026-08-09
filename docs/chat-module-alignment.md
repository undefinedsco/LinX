# Chat 模块交互对齐文档

本文档记录 Chat 模块与 Cherry Studio 及设计规范的对齐状态。

## 参考文档

- [Cherry Studio](https://github.com/CherryHQ/cherry-studio) - 消息组件、Markdown 渲染参考
- [design/chat-ui-wechat.md](../design/chat-ui-wechat.md) - WeChat 风格 UI 设计规范
- [design/chat-spec.md](../design/chat-spec.md) - Chat App 功能规范
- [docs/external-references.md](./external-references.md) - 外部代码参考指南

---

## 一、功能实现状态

### 1.1 P0 - 核心功能

| 功能 | 设计要求 | 状态 | 备注 |
|------|---------|------|------|
| **聊天列表** ||||
| 64px 行高 + 48px Logo | chat-ui-wechat.md | ✅ 已实现 | ResourceItem `h-16`，ChatListPane `h-12 w-12` |
| Starred 排序优先 | chat-spec.md | ✅ 已实现 | repository 层排序 |
| 搜索过滤 (debounce ~120ms) | chat-ui-wechat.md | ✅ 已实现 | Pod 全局查询前固定 120ms debounce |
| Star/Unstar 聊天 | chat-ui-wechat.md | ✅ 已实现 | 2024-12-15 |
| 删除聊天 | chat-ui-wechat.md | ✅ 已实现 | 带确认对话框 |
| **话题列表** ||||
| Star/Unstar 话题 | chat-ui-wechat.md | ✅ 已实现 | 2024-12-15 |
| 删除话题 | chat-ui-wechat.md | ✅ 已实现 | 带确认对话框 |
| 重命名话题 | chat-ui-wechat.md | ✅ 已实现 | 话题行双击进入 inline edit，回车保存 |
| **Content Header** ||||
| Provider Logo + Model 显示 | chat-ui-wechat.md | ✅ 已实现 | 2024-12-15 |
| Star toggle | chat-ui-wechat.md | ✅ 已实现 | 2024-12-15 |
| 新话题按钮 | chat-ui-wechat.md | ✅ 已实现 | - |
| **消息列表** ||||
| 流式 AI 响应 | chat-spec.md | ✅ 已实现 | ChatKit stream + LocalChatKitService |
| 深度思考显示 | Cherry Studio | 🚧 部分完成 | 原生 ThoughtChain 尚未接入 ChatKit 主路径；主路径只显示克制的活动状态 |
| 工具调用显示 | Cherry Studio | ✅ 已实现 | ChatKit `progress_update` + 持久化 `client_tool_call`，外层运行时详情渐进展开 |
| 智能滚动 | chat-ui-wechat.md | ✅ 已实现 | ChatKit `thread.autoScroll` |
| "New Messages" 按钮 | chat-ui-wechat.md | 🔍 由 ChatKit 提供 | 需在长会话真实浏览器中验证触发行为 |
| **消息操作** ||||
| Copy 消息 | chat-ui-wechat.md | ✅ 已实现 | ChatKit 消息操作 |
| Delete 消息 | chat-ui-wechat.md | 🚧 部分完成 | ChatKit custom action 已支持 `message.delete`；当前主界面已接入当前 Thread 用户消息选择删除 |
| Reply (引用) | chat-ui-wechat.md | 🚧 部分完成 | 当前主界面已支持引用上一条用户消息到 Composer |
| **Composer** ||||
| 无边框输入区 | chat-ui-wechat.md | ✅ 已实现 | ChatKit Composer |
| 缺少 API Key 提示 | chat-spec.md | ✅ 已实现 | 内联卡片 |

### 1.2 P1 - 重要功能

| 功能 | 设计要求 | 状态 | 备注 |
|------|---------|------|------|
| Mark as Unread | chat-ui-wechat.md | ✅ 已实现 | ChatListPane context menu + unreadCount |
| Role 编辑 Modal | chat-ui-wechat.md | ✅ 已实现 | ChatRightSidebar |
| Role 卡片 3 行 clamp | chat-ui-wechat.md | ✅ 已实现 | ChatRightSidebar `line-clamp-3` |
| Thread 搜索 | chat-ui-wechat.md | ✅ 已实现 | ChatRightSidebar |

### 1.3 P2 - 增强功能

| 功能 | 设计要求 | 状态 | 备注 |
|------|---------|------|------|
| Emoji picker | chat-ui-wechat.md | ❌ 主路径未实现 | 自研 Inputbar 有该组件，但 ChatKit 主路径没有接入 |
| File attachment | chat-ui-wechat.md | ✅ 已实现 | ChatKit two-phase upload，Pod 持久化 |
| Image upload | chat-ui-wechat.md | ✅ 已实现 | 图片预览、下载和历史消息 hydration |
| Voice message | chat-ui-wechat.md | ❌ 未实现 | 未来功能 |
| Model 切换器 | chat-spec.md | ✅ 已实现 | ChatHeader 使用 ModelSelector 并持久化 provider/model |

---

## 二、视觉对齐清单

### 2.1 布局规范

根据 `design/chat-ui-wechat.md`：

```
┌────────┬──────────────┬─────────────────────────────────┐
│ App Nav│ List Panel   │     Content Panel               │
│ 64px   │ 210px 可拖拽  │   flex-1 可拖拽                 │
└────────┴──────────────┴─────────────────────────────────┘
```

| 检查项 | 规范值 | 当前状态 | 位置 |
|--------|--------|---------|------|
| List Panel 宽度 | 210px 可拖拽 | ✅ 已实现 | `linxLayout.listPanel` 默认 210、范围 180-400 |
| 列表行高 | 64px | ✅ 已实现 | ResourceItem `h-16` |
| Avatar 大小 | 48px, rounded-sm | ✅ 已实现 | ChatListPane `h-12 w-12` |
| Content Header 高度 | 48px | ✅ 已实现 | ChatContentPane `h-12` |
| Right Sidebar 宽度 | 320px | ✅ 已实现 | `useChatLayoutConfig.rightSidebarWidth` |

### 2.2 样式 Token

根据 `design/chat-ui-wechat.md`：

| Token | 规范值 | 当前状态 |
|-------|--------|---------|
| Radius | `rounded-sm` (avatars/buttons/cards) | ✅ 已修改为 rounded-sm |
| 列表项 padding | 12-14px vertical | 🔍 待验证 |
| 面板 padding | 12-16px | 🔍 待验证 |
| Title 字号 | 14-15 semibold | 🔍 待验证 |
| Meta 字号 | 12-13 muted | 🔍 待验证 |

### 2.3 视觉对齐 TODO

1. **Avatar 大小调整** ✅ 已完成
   - 文件: `apps/web/src/modules/chat/components/ChatListPane.tsx`
   - 修改: `h-9 w-9` → `h-12 w-12` (48px)

2. **列表行高调整** ✅ 已验证
   - 文件: `apps/web/src/components/layout-kit/ResourceList.tsx`
   - 确认: 64px 行高 (`h-16`)

3. **Radius 统一** ✅ 已完成
   - 修改: `rounded-md` → `rounded-sm`
   - 排除: 消息气泡保持 `rounded-lg`

4. **Right Sidebar 宽度**
   - 文件: `apps/web/src/modules/chat/components/ChatRightSidebar.tsx`
   - 目标: 320px 固定宽度

---

## 三、TypeScript 错误修复状态

### 3.1 Chat 模块相关 - ✅ 已全部修复

| 错误 | 文件 | 状态 |
|------|------|------|
| useThreadList 参数类型 | ChatContentPane.tsx | ✅ 使用 `selectedChatId ?? ''` |
| toolsToSave 未使用变量 | useAIChat.ts | ✅ 已删除 |
| lastMessageId 类型不匹配 | useAIChatV2.ts:171, 295 | ✅ 使用确定的 ID 变量 |
| dialogMode 未使用 | AddChatDialog.tsx | ✅ 重命名为 `_dialogMode` |

### 3.2 其他模块错误

其他模块的 TypeScript 错误（如 credentials, model-services）不在 Chat 对齐范围内，暂不处理。

---

## 四、Playwright E2E 测试

### 4.1 测试文件

- `tests/e2e/specs/chat-alignment.spec.ts` - Chat 模块对齐验证测试

### 4.2 测试覆盖

| 测试类别 | 测试数 | 状态 |
|---------|-------|------|
| 视觉对齐 - 列表规范 | 3 | ✅ 全通过 |
| 视觉对齐 - Header 规范 | 3 | ✅ 全通过 |
| 功能对齐 - 聊天列表操作 | 3 | ✅ 全通过 |
| 功能对齐 - 话题列表操作 | 2 | ✅ 全通过 |
| 功能对齐 - 搜索功能 | 2 | ⚠️ 需环境 |
| Content Panel | 3 | ⚠️ 需数据 |

### 4.3 运行测试

```bash
cd tests/e2e
npx playwright test chat-alignment.spec.ts --project=chromium
```

---

## 五、下一步计划

### 5.1 高优先级

1. [x] 修复 TypeScript 编译错误
2. [x] 调整 Avatar 大小为 48px
3. [x] 验证并调整列表行高为 64px
4. [x] 实现 MessageBubble Delete 回调（ChatKit custom action）

### 5.2 中优先级

1. [x] 实现 Model 切换器（Header dropdown）
2. [x] 实现话题重命名（inline edit）
3. [x] 添加 unread 字段到 schema/collection projection
4. [x] 实现 Mark as Unread 功能

### 5.3 低优先级

1. [x] Emoji picker 集成（自研 Inputbar）
2. [x] File/Image upload 实现（ChatKit two-phase + Pod）
3. [x] Reply (引用回复) 功能

### 5.4 ChatKit React 1.6.1 / ChatKit 1.9.0 对齐进度（2026-08）

- [x] `@openai/chatkit-react` 1.6.1（内部 ChatKit 1.9.0）runtime 主路径：Composer、附件、语音听写、联网搜索、retry、feedback 配置已接入。
- [x] 停止生成：请求 abort 后通知 runtime stop，并保存 `incomplete` assistant 内容。
- [x] 消息编辑/删除/引用：通过 custom action 和 ChatKit 外部操作栏接入。
- [x] 编辑消息保留原记录，创建带 `parent_item_id`、`branch_id`、`supersedes` 的新分支。
- [x] 当前线程分支导航：外部操作栏提供 `1/2`、上一分支、下一分支；选择同时写入 UI state 和 Thread metadata。
- [x] ChatKit 消息列表按 active branch 隐藏非活动 sibling 及回答子树：`items.list` 与 `threads.get_by_id` 使用同一投影规则。
- [x] Retry 回答分支：原回答和重试回答以用户消息为共同 parent，新回答成为 active sibling。
- [x] 本地 Xpod 登录与 LinX OIDC 回调：`localhost:5737` 授权后成功返回 `/auth/callback`，ChatKit 主界面和 Pod 历史消息正常加载。
- [x] ChatKit 附件入口与历史附件加载：文件选择器可打开，已持久化会话显示附件计数并可重新加载。
- [x] timecc 上游独立服务可用性：模型服务页可读取模型；独立 provider 请求曾验证成功。
- [x] Chat 自定义 provider 不再由浏览器直连：已统一改走登录后的 Xpod `/v1/chat/completions`，真实网络记录确认浏览器未请求 `timicc.com`，也不再携带上游 API Key。
- [x] 普通生成运行时浏览器验收：Xpod credential-reader/DPoP 和 custom provider 生成链路已经修复并通过；搜索 citation 的真实视觉验收仍需 Responses built-in Web Search 上游，普通 Chat Completions credential 不能替代。
- [ ] 附件新上传：ChatKit 文件选择器可打开，历史附件可恢复；macOS 文件选择器自动化未可靠选中文件，未形成可信的新上传结果。
- [ ] 编辑分支和活动分支刷新保持：数据建模、两条读取路径投影与 Thread metadata 恢复已经补齐；完整 `1/2` 连续验收仍待浏览器终验。feedback 已确认以 `PATCH 205` 写入本地 Pod，RDF `richContent` 可恢复；ChatKit 官方 ThreadItem 协议不返回 feedback 选中态。
- [x] 普通 Thread Composer 同页草稿：真实浏览器中输入草稿、切换到另一 Chat、再切回后完整恢复；当前 ChatKit API 没有公开文本读取/变化事件，因此未发送草稿跨页面刷新仍是明确边界。
- [x] citation 数据闭环：流式 annotation 转为 ChatKit source，完整 item 写入 Pod，刷新历史可恢复；只允许 HTTP(S) 来源链接。
- [x] runtime SSE 断线恢复：重连携带最后事件游标，Service 重放短日志，客户端去重；普通 React 重渲染不再重建订阅并重置游标。
- [x] runtime SSE EOF 恢复：服务端在最终事件后立即断开且没有尾部空行时仍派发 `assistant_done`，并兼容 CRLF 分隔与 `data:` 无可选空格的合法 SSE 格式。
- [x] Xpod Web Search 协议：Responses built-in `web_search` 不再被丢弃，URL citation 可通过流式与非流式结果返回 LinX。
- [x] 流式 citation 累计位置：没有显式 index 的来源按完整已接收文本定位，不会在多 delta 回答中退回当前 chunk 长度。
- [x] Xpod 重启后的登录恢复：Chat 请求遇到过期会话 401 会立即触发本地 OIDC 恢复；浏览器已验证 localhost consent 和 `/chat` 回跳。
- [x] 当前 Thread 与消息刷新恢复：恢复不再依赖可能漏失的 `chatkit.ready` 事件；Web Component 挂载并完成定义后固定执行 `setThreadId()` 与 `fetchUpdates()`，本地 Xpod 连续三次刷新均无需切换会话。

---

## 五、Cherry Studio 参考点

根据 `docs/external-references.md`：

### 5.1 关键目录

```
cherry-studio/src/renderer/src/pages/home/
├── Messages/     # 消息组件
└── Markdown/     # Markdown 渲染
```

### 5.2 功能优先级矩阵

| 功能 | 优先级 | 状态 |
|------|--------|------|
| Markdown + 代码高亮 | P0 | ✅ ChatKit 主路径支持 | 原生 MarkdownRenderer 不是当前消息主路径 |
| 流式响应 | P0 | ✅ 已实现 |
| 消息操作栏 | P0 | ✅ ChatKit + 外部消息操作栏 |
| 思考过程 (CoT) | P0 | 🚧 主路径仅展示活动摘要 | 原生 ThoughtChain 未接入 ChatKit |
| Mermaid 图表 | P1 | ⛔ ChatKit 边界 | ChatKit 1.9.0 没有 Mermaid renderer hook；按当前“不维护第二套消息视图”的架构约束不重复实现 |
| 多主题 | P2 | ✅ 已有主题系统 |
| 语音输入 | P2 | ✅ 已实现 | ChatKit composer dictation |

---

## 更新日志

- **2024-12-15 (第二次更新)**: 完成对齐工作
  - 修复所有 Chat 模块 TypeScript 错误
  - 调整 Avatar 大小为 48px (`h-12 w-12`)
  - 统一圆角为 `rounded-sm`
  - 创建 Playwright E2E 测试 (13 passed / 16 total)
  - 更新文档状态

- **2024-12-15**: 创建文档
  - 完成 P0 功能: Star/Unstar, Delete 操作
  - 完成 Header: Provider Logo + Model + Star toggle
  - 整理视觉对齐清单
