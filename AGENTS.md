# LinX Development Guidelines

This file provides guidance to AI coding agents when working with this repository.

> **AGENTS.md 编写原则**：本文件只放原则、流程指引和关键配置说明，具体细节（如代码示例、配置格式）放到 `docs/` 下的专题文档。

## Quick Links

- **[Architecture Comparison](docs/architecture-comparison.md)** - 架构对比：LinX vs Cherry Studio vs LobeChat
- **[@linx/models Shared Core](docs/cli-app-shared-core.md)** - 所有端共享的业务真相、跨端语义与模型边界以 `@linx/models` 为准
- **[Chat Module Alignment](docs/chat-module-alignment.md)** - Chat 模块与 Cherry Studio 及设计规范的对齐状态、视觉检查清单、待修复项
- **[UI Style Guide](docs/ui-style-guide.md)** - UI 样式指南
- **[UI Component Architecture](docs/ui-component-architecture.md)** - UI 组件分层架构（纯 UI / 逻辑 UI）
- **[Service Layer Guide](docs/service-layer-guide.md)** - Service 层设计指南
- **[External References](docs/external-references.md)** - 外部参考项目

## Project Architecture

LinX is a Solid-first productivity application built as a monorepo targeting web, desktop, and mobile shells. Built with TanStack Router + Query for modern SPA architecture.

### Key Architectural Principles

- **Solid Data Access**: All structured data (profiles, contacts, sessions) flows through repositories in `packages/models` using `drizzle-solid`. Never use direct `getSolidDataset` calls in React components.
- **Shared Business Truth**: Any domain rule, storage contract, normalization logic, or cross-surface use-case that must be shared across surfaces belongs in `@linx/models`. Shells in `apps/*` may adapt and render it, but must not redefine it.
- **No UI Fallbacks**: When queries fail, fix the drizzle-solid repository (schema, permissions, SPARQL) rather than implementing UI fallbacks.
- **Follow drizzle-solid's Solid-first semantics**: When touching Pod data access, align with the newer `drizzle-solid` model: IRI is the real entity identity, `link` fields represent RDF links, and mutation paths should prefer exact-target/entity semantics over SQL-style broad updates. In bug-fix work, adopt these semantics locally instead of doing a repo-wide API migration.
- **Monorepo Structure**: Workspaces organized as `apps/*`, `packages/*`, `tests/*`, and `examples/*`.

### Core Components

- **`packages/models`**: Published as `@linx/models`, contains all Solid data schemas and repositories using drizzle-solid
- **`apps/web`**: Vite + React 18.3 SPA with TanStack Router + Query, shadcn/ui, and Tailwind CSS
- **`apps/desktop`**: Electron 32.x wrapper
- **`apps/mobile`**: Capacitor 6 shell scaffold
- **`examples/solid-login-example`**: Pure React components for learning Solid authentication patterns

### Project Structure

```text
apps/
├── web/                    # Vite + React front-end
│   └── src/
│       ├── app/            # Route handlers
│       ├── modules/        # Feature modules (chat, contacts, credentials…)
│       ├── components/     # Shared components
│       └── providers/      # React context providers
├── desktop/                # Electron wrapper
└── mobile/                 # Capacitor shell
packages/
├── models/                 # Shared Solid models + repositories (drizzle-solid)
│   └── src/
│       ├── chat.schema.ts
│       ├── contact.schema.ts
│       └── index.ts
├── shared-ui/              # Cross-platform UI components
└── utils/                  # Cross-platform utilities
vendors/
└── drizzle-solid/          # Local fork for dependency patches
```

## Development Commands

### Setup and Installation
```bash
# Install all dependencies (skip Electron binary download)
yarn install:all
# or manually: ELECTRON_SKIP_BINARY_DOWNLOAD=1 yarn install
```

### Web Development
```bash
# Start development server
yarn dev

# Build for production
yarn build

# Individual builds
yarn build:vendor     # Build drizzle-solid vendor package
yarn build:models     # Build @linx/models package  
yarn build:web        # Build web application

# Linting and type checking
yarn lint             # Run web linting
yarn typecheck        # Run web type checking

# Run tests
yarn test             # Run all tests
```

### Workspace Management
- Package manager: Yarn 1.22 (declared via `packageManager`)
- Use workspace commands: `yarn workspace @linx/[app-name] [command]`

## Code Style

- **TypeScript**: Strict mode, prefer explicit types over inference for public APIs
- **UI Colors**: Solid-inspired purple gradients (`#5B21B6` → `#C084FC`) on dark glassmorphic backgrounds
- **Typography**: Inter (or system sans fallback), headings weight 600, body weight 400, line-height ≥ 1.5
- **Solid Predicates**: Reference namespace constants (e.g. `VCARD.fn`, `LINX.pinned`) rather than inline IRIs
- **CSS**: Use Tailwind utility classes; for pixel-perfect alignment use arbitrary values like `p-[10px]`

## Tech Stack

- **Frontend**: Vite + React 18.3
- **Routing**: TanStack Router (type-safe, file-based)
- **State**: TanStack DB for server state, Zustand for client state
- **Styling**: Tailwind CSS + shadcn/ui
- **Solid Integration**: `@inrupt/solid-ui-react`, `@inrupt/solid-client`
- **Data Layer**: `drizzle-solid` ORM for Solid Pod SPARQL queries

---

## Module Data Flow Architecture

### Core Data Layer: TanStack DB Collections

LinX 使用 **TanStack DB** (`@tanstack/react-db`) 作为核心数据管理层，而非传统的 Repository + Service 模式。

```
┌─────────────────────────────────────────────────────────────────┐
│                         Solid Pod                               │
└─────────────────────────────────────────────────────────────────┘
                              ↕ (drizzle-solid)
┌─────────────────────────────────────────────────────────────────┐
│  TanStack DB Collection                                         │
│  - 内存数据库 + 自动持久化                                         │
│  - 内置 Query 缓存（不需要单独的 TanStack Query）                   │
│  - 支持乐观更新、冲突解决                                          │
│  - 支持 Solid Notifications 实时同步                              │
└─────────────────────────────────────────────────────────────────┘
                              ↕ (useCollection / collection.state)
┌─────────────────────────────────────────────────────────────────┐
│  UI Components                                                  │
│  - 直接消费 Collection 数据                                       │
│  - Zustand 仅管理纯 UI 状态                                       │
└─────────────────────────────────────────────────────────────────┘
```

### 泛型工厂：createPodCollection

项目提供了 `createPodCollection` 泛型工厂（`lib/data/pod-collection.ts`），用于快速创建与 Pod 同步的 Collection：

```typescript
// lib/data/pod-collection.ts
import { createCollection } from '@tanstack/react-db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'

export function createPodCollection<TData extends { id: string }, TInsert>(options: {
  table: PodTableSchema
  queryKey: string[]
  queryClient: QueryClient
  getDb: () => SolidDatabase | null
}) {
  return createCollection<TData, string>(
    queryCollectionOptions({
      queryKey,
      queryClient,
      queryFn: async () => { /* fetch from Pod */ },
      getKey: (item) => item.id,
      onInsert: async ({ transaction }) => { /* persist to Pod */ },
      onUpdate: async ({ transaction }) => { /* persist to Pod */ },
      onDelete: async ({ transaction }) => { /* persist to Pod */ },
    })
  )
}
```

### 模块使用示例

```typescript
// modules/contacts/collections.ts
import { createPodCollection } from '@/lib/data/pod-collection'
import { contactTable, type ContactRow, type ContactInsert } from '@linx/models'

export const contactCollection = createPodCollection<ContactRow, ContactInsert>({
  table: contactTable,
  queryKey: ['contacts'],
  queryClient,
  getDb: () => dbGetter?.() ?? null,
})

// 在组件中使用
function ContactList() {
  const contacts = contactCollection.state.data ?? []
  // 或使用 useCollection hook
}
```

### 状态管理分工

| 状态类型 | 管理工具 | 职责 | 示例 |
|---------|---------|------|------|
| **Server State** | TanStack DB Collection | Pod 数据的 CRUD、缓存、同步 | 联系人、聊天、消息 |
| **Client State** | Zustand | 纯 UI 状态，不持久化 | selectedId, search, viewMode |

### Anti-Patterns

❌ **为每个模块重复写 Collection 代码**
```typescript
// 错误：应该复用 createPodCollection 工厂
export const contactCollection = createCollection<ContactRow, string>(
  queryCollectionOptions({
    // 大量重复代码...
  })
)
```

❌ **在 Zustand 中缓存 Pod 数据**
```typescript
// 错误：Collection 已经是缓存层
const useStore = create((set) => ({
  contacts: [],  // ❌ 重复缓存
  hydrateContacts: (data) => set({ contacts: data })
}))
```

❌ **在 Zustand 中缓存 Pod 数据**
```typescript
// 错误：Collection 已经是缓存层
const useStore = create((set) => ({
  contacts: [],  // ❌ 重复缓存
  hydrateContacts: (data) => set({ contacts: data })
}))
```

❌ **混用 Repository 和 Collection**
```typescript
// 错误：选择一种模式，不要混用
const contacts = await contactRepository.list(db)  // ❌ 绕过 Collection
```

### 文件结构规范

```
modules/xxx/
├── collections.ts      # TanStack DB Collections + 业务逻辑扩展
├── store.ts            # Zustand Store（仅 UI 状态）
├── types.ts            # TypeScript 类型定义
├── index.ts            # 模块导出
└── components/
    ├── XxxListPane.tsx       # 逻辑 UI 组件 (Container)
    └── XxxCard.tsx           # 纯 UI 组件 (Presentational)
```

### UI 组件分层原则

- **纯 UI 组件**：只负责渲染，通过 props 接收数据，只和 Zustand 交互读取 UI 状态
- **逻辑 UI 组件**：操作 Collections，更新 Zustand，组合纯 UI 组件

详见 **[UI 组件分层架构](docs/ui-component-architecture.md)**

### Service 层使用原则

- **简单 CRUD**：直接调用 `collection.insert/update/delete`，不需要 service
- **复杂业务逻辑**：扩展到 `collections.ts` 或独立 service.ts

详见 **[Service 层设计指南](docs/service-layer-guide.md)**

---

## UI 模块开发方法论

当需要实现一个 UI 模块并对齐外部参考项目（如 WeChat Desktop、Cherry Studio）时，必须遵循以下流程：

### 1. 深度阅读参考代码（不是浏览）

**错误做法**：只看文件结构，凭印象猜测样式值
**正确做法**：

- 找到参考项目中对应组件的源文件
- 逐行阅读，提取精确的 CSS 数值（padding、margin、border-radius、height 等）
- 理解组件的状态管理和数据流
- 记录关键交互逻辑（hover、click、drag 等）

### 2. 提取而非猜测

**错误做法**：写 `p-[10px]` 然后声称"对齐了 Cherry Studio"
**正确做法**：

- 从参考代码的 styled-components 或 CSS 文件中找到原始值
- 在代码注释中标注来源：`// Cherry Studio: MessageContainer padding: 10px`
- 如果参考项目使用变量，追溯变量的实际值

### 3. 功能验证优先于样式

**错误做法**：写完组件 → 写测试 → 假设功能正常
**正确做法**：

1. 写完组件后立即在浏览器中测试核心流程
2. 对于聊天模块：输入消息 → 发送 → 观察 AI 响应
3. 追踪完整数据流：用户输入 → 状态更新 → API 调用 → 响应处理 → UI 更新
4. 检查控制台是否有错误

### 4. 验证凭据和配置匹配

聊天类功能必须验证：

- 聊天配置的 provider（如 anthropic）是否有对应的凭据
- API 密钥是否已配置
- 模型是否可用

如果界面显示"配置 API 密钥"，这是预期行为，说明凭据匹配逻辑正常工作。

### 5. 样式对比必须可视化

**错误做法**：凭记忆比较
**正确做法**：

1. 截图参考项目的对应界面
2. 截图当前实现的界面
3. 并排对比，逐像素检查：
   - 间距是否一致
   - 圆角是否一致
   - 字体大小是否一致
   - 颜色是否一致
   - 动画效果是否一致

### 6. 增量提交和验证

- 每完成一个子功能就验证，不要等到全部完成
- 保持 git 提交粒度小，便于回滚
- 测试通过不代表功能正确，必须人工验证关键路径

---

## File-Structure Notes

- 业务模块统一放在 `apps/web/src/modules/*`；模块内部引用 `@linx/models` 暴露的仓储和类型
- 共用模型/仓储集中在 `packages/models`，以实体为子目录，`index.ts` 聚合导出
- 第三方补丁放在 `vendors/*`，通过 `file:vendors/...` 方式覆盖；改动后需执行该包的 build
