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
| 64px 行高 + 48px Logo | chat-ui-wechat.md | 🔍 待验证 | 检查 ResourceItem 样式 |
| Starred 排序优先 | chat-spec.md | ✅ 已实现 | repository 层排序 |
| 搜索过滤 (debounce ~120ms) | chat-ui-wechat.md | ✅ 已实现 | 需确认 debounce 时间 |
| Star/Unstar 聊天 | chat-ui-wechat.md | ✅ 已实现 | 2024-12-15 |
| 删除聊天 | chat-ui-wechat.md | ✅ 已实现 | 带确认对话框 |
| **话题列表** ||||
| Star/Unstar 话题 | chat-ui-wechat.md | ✅ 已实现 | 2024-12-15 |
| 删除话题 | chat-ui-wechat.md | ✅ 已实现 | 带确认对话框 |
| 重命名话题 | chat-ui-wechat.md | ❌ 未实现 | 需要 inline edit |
| **Content Header** ||||
| Provider Logo + Model 显示 | chat-ui-wechat.md | ✅ 已实现 | 2024-12-15 |
| Star toggle | chat-ui-wechat.md | ✅ 已实现 | 2024-12-15 |
| 新话题按钮 | chat-ui-wechat.md | ✅ 已实现 | - |
| **消息列表** ||||
| 流式 AI 响应 | chat-spec.md | ✅ 已实现 | useAIChat hook |
| 深度思考显示 | Cherry Studio | ✅ 已实现 | ThoughtChain 组件 |
| 工具调用显示 | Cherry Studio | ✅ 已实现 | ToolInvocation 组件 |
| 智能滚动 | chat-ui-wechat.md | ✅ 已实现 | MessageList 组件 |
| "New Messages" 按钮 | chat-ui-wechat.md | ✅ 已实现 | MessageList 组件 |
| **消息操作** ||||
| Copy 消息 | chat-ui-wechat.md | ✅ 已实现 | 右键菜单 |
| Delete 消息 | chat-ui-wechat.md | 🚧 占位符 | 需要传递回调 |
| Reply (引用) | chat-ui-wechat.md | ❌ 未实现 | P2 |
| **Composer** ||||
| 无边框输入区 | chat-ui-wechat.md | ✅ 已实现 | Composer 组件 |
| 缺少 API Key 提示 | chat-spec.md | ✅ 已实现 | 内联卡片 |

### 1.2 P1 - 重要功能

| 功能 | 设计要求 | 状态 | 备注 |
|------|---------|------|------|
| Mark as Unread | chat-ui-wechat.md | ❌ 未实现 | 需要 schema 添加 unread 字段 |
| Role 编辑 Modal | chat-ui-wechat.md | ✅ 已实现 | ChatRightSidebar |
| Role 卡片 3 行 clamp | chat-ui-wechat.md | 🔍 待验证 | 检查样式 |
| Thread 搜索 | chat-ui-wechat.md | ✅ 已实现 | ChatRightSidebar |

### 1.3 P2 - 增强功能

| 功能 | 设计要求 | 状态 | 备注 |
|------|---------|------|------|
| Emoji picker | chat-ui-wechat.md | ❌ 未实现 | 按钮已有 |
| File attachment | chat-ui-wechat.md | ❌ 未实现 | 按钮已有 |
| Image upload | chat-ui-wechat.md | ❌ 未实现 | 按钮已有 |
| Voice message | chat-ui-wechat.md | ❌ 未实现 | 未来功能 |
| Model 切换器 | chat-spec.md | ❌ 未实现 | Header 只显示，不能切换 |

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
| List Panel 宽度 | 210px 可拖拽 | 🔍 待验证 | PrimaryLayout |
| 列表行高 | 64px | ✅ 已实现 | ResourceItem `h-16` |
| Avatar 大小 | 48px, rounded-sm | ✅ 已实现 | ChatListPane `h-12 w-12` |
| Content Header 高度 | 48px | ✅ 已实现 | ChatContentPane `h-12` |
| Right Sidebar 宽度 | 320px | 🔍 待验证 | ChatRightSidebar |

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
4. [ ] 实现 MessageBubble Delete 回调

### 5.2 中优先级

1. [ ] 实现 Model 切换器（Header dropdown）
2. [ ] 实现话题重命名（inline edit）
3. [ ] 添加 unread 字段到 schema
4. [ ] 实现 Mark as Unread 功能

### 5.3 低优先级

1. [ ] Emoji picker 集成
2. [ ] File/Image upload 实现
3. [ ] Reply (引用回复) 功能

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
| Markdown + 代码高亮 | P0 | ✅ 已有基础实现 |
| 流式响应 | P0 | ✅ 已实现 |
| 消息操作栏 | P0 | ✅ 右键菜单 |
| 思考过程 (CoT) | P0 | ✅ ThoughtChain |
| Mermaid 图表 | P1 | ❌ 未实现 |
| 多主题 | P2 | ✅ 已有主题系统 |
| 语音输入 | P2 | ❌ 未实现 |

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
