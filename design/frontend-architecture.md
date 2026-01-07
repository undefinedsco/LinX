# LinX 前端架构设计

> LinX 前端技术架构与组件库策略设计文档
> 
> 创建时间：2025-11-07
> 状态：✅ 架构规范已确定

---

## 📋 目录

- [1. 架构概述](#1-架构概述)
- [2. 技术栈选择](#2-技术栈选择)
- [3. 组件库策略](#3-组件库策略)
- [4. 状态管理](#4-状态管理)
- [5. 路由系统](#5-路由系统)
- [6. 构建与部署](#6-构建与部署)
- [7. 性能优化](#7-性能优化)
- [8. 开发工具链](#8-开发工具链)

---

## 1. 架构概述

### 1.1 设计原则

LinX 前端架构遵循以下核心原则：

- **🎯 去中心化优先**：符合 Solid Pod 理念，避免 vendor lock-in
- **🧩 组件化架构**：模块化设计，便于维护和扩展
- **⚡ 性能优先**：快速加载，流畅交互
- **🔒 类型安全**：TypeScript 全覆盖
- **🎨 一致体验**：统一的设计系统和交互模式

### 1.2 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    LinX Frontend Architecture               │
├─────────────────────────────────────────────────────────────┤
│  🎨 UI Layer                                               │
│  ├── shadcn/ui (基础框架，包括聊天界面)                    │
│  ├── Vercel AI SDK (AI/聊天逻辑与流式响应)                 │
│  └── Custom Components (业务组件)                          │
├─────────────────────────────────────────────────────────────┤
│  🧠 Logic Layer                                            │
│  ├── TanStack Router (路由管理)                            │
│  ├── TanStack Query (状态管理)                             │
│  └── React Context (全局状态)                              │
├─────────────────────────────────────────────────────────────┤
│  🔌 Data Layer                                             │
│  ├── @linx/models (Solid Pod ORM)                          │
│  ├── drizzle-solid (数据访问)                              │
│  └── @inrupt/solid-client (Solid 集成)                     │
├─────────────────────────────────────────────────────────────┤
│  ⚡ Runtime Layer                                           │
│  ├── Vite (构建工具)                                       │
│  ├── React 18.3 (UI 框架)                                  │
│  └── TypeScript (类型系统)                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 技术栈选择

### 2.1 核心技术栈

| 分类 | 技术选择 | 版本 | 说明 |
|------|----------|------|------|
| **UI 框架** | React | 18.3.1 | 稳定版本，等待 Next.js 支持 React 19 |
| **构建工具** | Vite | 5.4+ | 快速开发体验，HMR 支持 |
| **类型系统** | TypeScript | 5.0+ | 全面类型安全 |
| **路由管理** | TanStack Router | latest | 类型安全的路由系统 |
| **服务端状态** | TanStack Query | latest | 服务端数据同步与缓存 |
| **客户端状态** | Zustand | latest | UI 交互状态与全局会话 |
| **样式方案** | Tailwind CSS | 3.4+ | 实用优先的 CSS 框架 |

### 2.2 Solid Pod 集成

| 分类 | 技术选择 | 说明 |
|------|----------|------|
| **Solid 客户端** | @inrupt/solid-client | 官方 Solid 客户端 |
| **UI 集成** | @inrupt/solid-ui-react | Solid React 组件 |
| **数据 ORM** | drizzle-solid (本地版) | 自定义 SPARQL ORM |
| **数据模型** | @linx/models | 统一数据模型定义 |

---

## 3. 组件库策略

### 3.1 混合组件库架构 ⭐

**设计理念**: "各司其职，最佳实践"

**核心构建公式**:
> **业务逻辑组件** = **无业务逻辑 UI 组件** (shadcn/ui) + **数据/状态** (Query/Zustand)
>
> **App** = 路由 + 布局 + (**业务逻辑组件** × N)

- **shadcn/ui**: 主框架 + 基础组件生态 + 聊天界面骨架 (负责 "长什么样")
- **Vercel AI SDK**: AI/聊天逻辑 + 流式响应 (负责 "怎么运作")
- **自定义组件**: 业务特定逻辑，组合 UI 与数据 (负责 "具体业务")

### 3.2 组件分工明细

#### shadcn/ui 负责 (📦 基础建设)

```tsx
// 布局框架
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'

// 导航组件  
import { Button, Avatar, Separator } from '@/components/ui/'

// 表单控件
import { Input, Textarea, Select, Switch } from '@/components/ui/'

// 数据展示
import { Card, Badge, ScrollArea, Table } from '@/components/ui/'

// 反馈组件
import { Dialog, Alert, Toast, Skeleton } from '@/components/ui/'

// 图标系统 - 统一使用 Lucide React
import { MessageSquare, Users, FolderOpen, Star, Key, Settings, Sun, Moon, Bot } from 'lucide-react'
```

**图标规范**:
- ✅ **统一生态**: 全部使用 Lucide React 图标库
- ✅ **禁用 Emoji**: 不使用任何 emoji 图标 (💬👤📁等)
- ✅ **一致性**: 保持图标风格统一，大小规格统一
- ✅ **语义化**: 图标含义清晰，符合用户预期

**优势**:
- ✅ **完全开源**: MIT 许可，无 vendor lock-in
- ✅ **源码可控**: 直接复制到项目，可任意修改
- ✅ **类型安全**: TypeScript 原生支持
- ✅ **主题系统**: 完美支持 CSS 变量

#### Vercel AI SDK 负责 (🤖 AI/聊天逻辑与流式响应)

```tsx
import { useChat } from 'ai/react'

function ChatComponent() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: '/api/chat', // 后端 API 端点
  })

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 p-4">
        {messages.map((m, index) => (
          <div key={index} className="whitespace-pre-wrap">
            {m.role === 'user' ? 'User: ' : 'AI: '}
            {m.content}
          </div>
        ))}
      </ScrollArea>
      <form onSubmit={handleSubmit} className="p-4 border-t">
        <Input
          value={input}
          placeholder="Say something..."
          onChange={handleInputChange}
        />
        <Button type="submit">Send</Button>
      </form>
    </div>
  )
}
```

**功能**:
- ✅ **流式响应**: 实时消息流处理
- ✅ **`useChat` Hook**: 简化聊天状态管理
- ✅ **错误处理**: 优雅的 API 失败降级
- ✅ **多模型支持**: 可灵活切换后端 AI 模型

### 3.3 技术集成策略

```tsx
// 主布局: shadcn/ui
<MainLayout>
  <ResizablePanelGroup>
    <Sidebar>              {/* shadcn: Button + Avatar */}
    <ListPanel>            {/* shadcn: Input + ScrollArea */}
    <ContentArea>
      {/* 条件渲染 */}
      {activeView === 'chat' ? (
        <ChatComponent />       {/* shadcn/ui + Vercel AI SDK: 聊天界面 */}
      ) : (
        <OtherModules>        // shadcn 组件组合
          <Card />
          <Form />
        </OtherModules>
      )}
    </ContentArea>
  </ResizablePanelGroup>
</MainLayout>
```


---

## 4. 状态管理

### 4.1 状态分层架构

```
📊 状态管理层级
├── 🌐 全局状态 (Zustand + Persist)
│   ├── solidSession (Solid Pod 会话 - 持久化)
│   ├── appSettings (应用设置/主题 - 持久化)
│   └── currentUser (当前用户信息)
├── 🗂️ 路由状态 (TanStack Router)
│   ├── currentView (当前功能视图)
│   ├── params (URL参数)
│   └── navigationHistory (导航历史)
├── 📡 服务端状态 (TanStack Query)
│   ├── chatMessages (聊天消息 - 缓存/同步)
│   ├── contactList (联系人列表)
│   └── fileList (文件列表)
├── ⚡ 模块 UI 状态 (Zustand)
│   ├── selectedItems (选中项管理)
│   ├── filterConditions (筛选条件)
│   └── dialogVisibility (复杂弹窗控制)
└── 🔄 局部状态 (useState/useReducer)
    └── 简单的表单输入、组件内部显隐
```

### 4.2 状态库职责划分

#### TanStack Query (Server State)
**职责**: "数据的搬运工"。负责将 Solid Pod 中的数据同步到前端，处理缓存、去重、后台更新。
```tsx
// 自动管理服务端数据的加载与缓存
const { data: chatMessages } = useQuery({
  queryKey: ['chat', conversationId],
  queryFn: () => fetchChatMessages(conversationId),
})
```

#### Zustand (Client State)
**职责**: "UI 的记事本"。负责管理组件间共享的交互状态，填补 Query 和 Context 之间的空白。
1. **模块级 UI 状态**: 记录用户"正在操作什么" (如：当前选中的联系人 ID、搜索框内容)。
2. **全局持久化状态**: 记录需要跨 Session 保持的数据 (如：登录凭证、主题偏好)。

```tsx
// store.ts - 模块级状态示例
export const useContactStore = create((set) => ({
  selectedId: null,
  setSelectedId: (id) => set({ selectedId: id }),
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
}))
```

---

## 5. 业务架构分层 (Layered Business Architecture)

为了应对 AI Agent、Solid Inbox 和复杂的交互需求，我们在逻辑层采用清晰的三层架构。

### 5.1 分层定义

#### 1. UI 层 (Presentation Layer)
*   **核心组件**: `InteractionCard`, `MessageBubble`, `Composer`, `ShellSession`, `ThoughtChain`。
*   **职责**: 
    *   **纯净渲染**: 只负责 UI 展示，不包含任何业务逻辑或数据存储代码。
    *   **事件驱动**: 通过 `props.onAction` 或 `useTelemetry().track()` 发出信号，不关心信号如何被处理。
    *   **无状态**: 不直接依赖全局 Session 或 Query Client。

#### 2. 中间层 (Infrastructure/Service Layer)
*   **核心组件**: `TelemetryProvider`, `useTelemetry`, `InboxService`, `SolidClient`。
*   **职责**: 
    *   **能力封装**: 封装底层的 Solid 协议、数据埋点、网络通信。
    *   **数据搬运**: 负责将 UI 层的事件转换为数据操作（如写入 Pod），或将 Pod 数据转换为 UI 可读格式。
    *   **上下文注入**: 在此层注入 `SolidSession` 和 `Schema`，解耦 UI 与数据。

#### 3. 业务层 (Application Logic Layer)
*   **核心组件**: `ChatContentPane`, `useAIChat`, `ApprovalWorkflows`。
*   **职责**: 
    *   **流程编排**: 协调 UI 和服务。例如：用户点击“授权” -> 调用 Inbox Service 标记已读 -> 调用 Permission Service 修改 ACL -> 更新 UI 状态。
    *   **策略管理**: 处理“自动审批”、“记住选择”等高级用户策略。

### 5.2 AI-Native 交互设计

#### AI Chat UI Kit
我们将聊天界面抽象为一套通用的 AI 交互组件库：
*   **Smart Composer**: 支持 `toolbarLeft`, `toolbarRight`, `sendButton` 插槽的容器化输入框，适应不同 Agent 能力。
*   **Message Bubble**: 支持多态内容渲染流：`ThoughtChain` (思考) -> `ShellSession` (执行) -> `InteractionCard` (确认) -> `ToolInvocation` (结果) -> `Content` (总结)。
*   **Interaction Card**: 专门处理 Human-in-the-loop 场景（确认、权限、选择）。

#### 用户策略与自动审批 (User Policy)
为了实现“智能管家”体验，我们在交互中引入策略层：
*   **场景**: 当 Agent 请求权限（如读取相册）时。
*   **交互**: 用户在 `InteractionCard` 中不仅可以选择 [同意/拒绝]，还可以勾选 [记住我的选择] 或 [总是允许此类操作]。
*   **数据**: 用户的选择将被记录为 **User Policy (用户策略)** 存入 Pod。下次遇到相同场景，Agent 可根据策略自动执行，无需打扰用户，实现真正的“管家”模式。

---

## 6. 路由系统

### 5.1 TanStack Router 配置

```tsx
// 路由定义
const routeTree = rootRoute.addChildren([
  indexRoute,                 // / → 重定向到 /chat
  chatRoute,                  // /chat
  chatDetailRoute,            // /chat/:conversationId  
  contactsRoute,              // /contacts
  contactDetailRoute,         // /contacts/:contactId
  filesRoute,                 // /files
  favoritesRoute,             // /favorites
  credentialsRoute,           // /credentials
  settingsRoute,              // /settings
  authCallbackRoute,          // /auth/callback
])
```

### 5.2 类型安全路由

```tsx
// 类型安全的导航
function navigate() {
  router.navigate({ 
    to: '/chat/$conversationId', 
    params: { conversationId: 'ai-assistant' }
  })
}

// 路由参数验证
const chatDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/chat/$conversationId',
  validateSearch: z.object({
    message: z.string().optional(),
  }),
})
```

---

## 6. 构建与部署

### 6.1 构建配置

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['@tanstack/react-router'],
          solid: ['@inrupt/solid-client'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-avatar'],
        },
      },
    },
  },
})
```

### 6.2 部署策略

**开发环境**:
```bash
yarn workspace @linx/web dev    # 本地开发
```

**生产构建**:
```bash
yarn workspace @linx/web build  # 静态构建
yarn workspace @linx/web preview # 预览构建结果
```

**部署目标**:
- ✅ **静态托管**: Vercel, Netlify, GitHub Pages
- ✅ **IPFS**: 去中心化托管
- ✅ **自托管**: Docker + Nginx

---

## 7. 性能优化

### 7.1 代码分割

```tsx
// 路由级别懒加载
const ContactList = lazy(() => import('@/components/ContactList'))

// 组件级别懒加载
// const SomeOtherComponent = lazy(() => import('@/components/SomeOtherComponent'))
```

### 7.2 缓存策略

```typescript
// Service Worker 缓存
const CACHE_NAME = 'linx-v1'
const STATIC_ASSETS = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css'
]

// TanStack Query 智能缓存
const queries = {
  chatMessages: { staleTime: 5 * 60 * 1000 },    // 5分钟
  contactList: { staleTime: 30 * 60 * 1000 },    // 30分钟  
  fileList: { staleTime: 10 * 60 * 1000 },       // 10分钟
}
```

### 7.3 包体积优化

- **Tree Shaking**: 自动移除未使用代码
- **动态导入**: 按需加载大型依赖
- **CDN 加载**: 第三方库使用 CDN
- **压缩优化**: Brotli + Gzip 双重压缩

---

## 8. 开发工具链

### 8.1 代码质量

```json
{
  "scripts": {
    "lint": "eslint src --ext .ts,.tsx --max-warnings 0",
    "type-check": "tsc --noEmit",
    "format": "prettier --write src",
    "test": "vitest",
    "test:coverage": "vitest --coverage"
  }
}
```

### 8.2 开发体验

- **HMR**: Vite 快速热更新
- **TypeScript**: 编译时类型检查  
- **ESLint**: 代码规范检查
- **Prettier**: 代码格式化
- **Husky**: Git hooks 自动化

### 8.3 调试工具

- **React DevTools**: 组件调试
- **TanStack Query DevTools**: 查询状态调试
- **TanStack Router DevTools**: 路由调试
- **Browser DevTools**: 性能分析

---

## 9. 架构决策记录 (ADR)

### 9.1 为什么选择混合组件库策略？

**问题**: 使用单一组件库还是多个专业组件库？

**决策**: 采用 shadcn/ui + Vercel AI SDK 混合策略

**理由**:
- shadcn/ui 提供完整的基础组件生态和灵活的 UI 定制能力
- Vercel AI SDK 专注于 AI 驱动的聊天逻辑和流式响应，简化开发
- 避免重复造轮子，聚焦核心业务
- 保持架构灵活性，符合去中心化理念

### 9.2 为什么选择 TanStack 生态？

**问题**: 状态管理和路由方案选择

**决策**: TanStack Router + TanStack Query

**理由**:
- 类型安全的现代化方案
- 专业的服务端状态管理
- 与 React 生态深度整合
- 性能优化和开发体验并重

---

## 10. 下一步规划

### 10.1 短期目标 (1-2周)
- [ ] Vercel AI SDK 集成和聊天界面定制
- [ ] 其他模块的 shadcn 组件实现
- [ ] 性能基准测试和优化

### 10.2 中期目标 (1-2月)  
- [ ] PWA 支持和离线功能
- [ ] 国际化 (i18n) 支持
- [ ] 无障碍 (a11y) 改进

### 10.3 长期目标 (3-6月)
- [ ] 移动端适配 (React Native)
- [ ] 桌面端增强 (Electron)
- [ ] 插件系统设计

---

## 11. 参考资料

### 技术文档
- **[shadcn/ui 官方文档](https://ui.shadcn.com/)**
- **[Vercel AI SDK 文档](https://sdk.vercel.ai/)**
- **[TanStack Router](https://tanstack.com/router)**
- **[TanStack Query](https://tanstack.com/query)**

### 相关设计文档
- **[主布局设计](./main-layout-design.md)** - 三栏布局具体实现
- **[聊天界面设计](./chat-interface-design.md)** - ChatKit 集成详情
- **[主题设计](./theme-design.md)** - Solid Protocol 品牌系统

### LinX 项目文档
- **[产品定位文档](./product-definition.md)** - LinX 核心理念
- **[Solid Pod 集成](../specs/001-linx-hub/contracts/solid-pod-interactions.md)**
- **[数据模型设计](../specs/001-linx-hub/data-model.md)**

---

*本文档随架构演进持续更新，最后更新：2025-11-07*