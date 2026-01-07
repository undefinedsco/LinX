# Cherry Studio 组件迁移计划

本文档描述如何将 Cherry Studio 的交互组件迁移到 LinX，同时保留 LinX 的 Solid Pod 数据存储层。

## 核心架构差异

| 方面 | Cherry Studio | LinX | 迁移策略 |
|------|--------------|------|---------|
| 数据存储 | IndexedDB (Dexie) | Solid Pod (drizzle-solid) | **保留 LinX** |
| 状态管理 | Redux + Entity Adapter | Zustand + TanStack Query | **适配** |
| 消息系统 | Block-based | 简单文本 + richContent | **迁移** |
| 输入栏 | 工具系统 + Provider | 简单 textarea | **迁移** |
| Markdown | 自定义 rehype/remark | 基础 ReactMarkdown | **迁移** |

## 迁移优先级

### P0 - 核心交互 (Week 1)

1. **Block-based 消息系统**
   - 源: `cherry-studio-main/src/renderer/src/types/newMessage.ts`
   - 目标: `linx/packages/models/src/types/message-block.ts`
   
   ```typescript
   // 新增块类型定义
   export enum MessageBlockType {
     MAIN_TEXT = 'main_text',
     THINKING = 'thinking',
     TOOL = 'tool',
     IMAGE = 'image',
     CITATION = 'citation',
     ERROR = 'error',
   }
   
   export interface MessageBlock {
     id: string
     messageId: string
     type: MessageBlockType
     content: string
     status: 'pending' | 'streaming' | 'success' | 'error'
     createdAt: Date
   }
   ```

2. **消息组件迁移**
   - 源: `cherry-studio-main/src/renderer/src/pages/home/Messages/`
   - 目标: `linx/apps/web/src/components/chat-kit/`
   
   需要迁移的组件：
   - `Message.tsx` → 消息容器（编辑、菜单、头部）
   - `MessageContent.tsx` → 块渲染协调
   - `Blocks/MainTextBlock.tsx` → Markdown 内容
   - `Blocks/ThinkingBlock.tsx` → 思考过程
   - `Blocks/ToolBlock.tsx` → 工具调用

3. **Markdown 渲染器**
   - 源: `cherry-studio-main/src/renderer/src/pages/home/Markdown/`
   - 目标: `linx/apps/web/src/components/chat-kit/Markdown/`
   
   关键特性：
   - 代码高亮 (Shiki)
   - 流式平滑渲染 (useSmoothStream)
   - 代码块复制/运行
   - 自定义插件 (rehype/remark)

### P1 - 输入栏系统 (Week 2)

1. **Inputbar 组件**
   - 源: `cherry-studio-main/src/renderer/src/pages/home/Inputbar/`
   - 目标: `linx/apps/web/src/components/chat-kit/Composer/`
   
   迁移内容：
   - `InputbarCore.tsx` → 文本输入核心
   - `InputbarToolsProvider.tsx` → 工具状态 Context
   - 工具按钮组 (附件、模型提及、搜索等)

2. **工具系统**
   - 源: `cherry-studio-main/src/renderer/src/pages/home/Inputbar/tools/`
   - 目标: `linx/apps/web/src/components/chat-kit/tools/`
   
   ```typescript
   // 工具定义接口
   export interface InputbarToolDefinition {
     id: string
     icon: React.ComponentType
     label: string
     shortcut?: string
     isActive?: (state: ToolState) => boolean
     onClick: (state: ToolState) => void
     render?: () => React.ReactNode  // 弹出面板
   }
   ```

### P2 - 高级功能 (Week 3)

1. **消息操作**
   - 复制消息
   - 编辑消息
   - 重新生成
   - 删除消息
   - 多选模式

2. **流式处理增强**
   - BlockManager 智能更新
   - 平滑滚动
   - Token 计数显示

---

## 具体迁移步骤

### Step 1: 定义块类型 (types)

```bash
# 创建块类型定义
packages/models/src/types/message-block.ts
```

### Step 2: 迁移消息组件

```bash
# 复制并适配 Cherry Studio 组件
apps/web/src/components/chat-kit/
├── Message/
│   ├── Message.tsx           # 从 Cherry Studio 迁移
│   ├── MessageHeader.tsx     # 消息头部
│   ├── MessageMenubar.tsx    # 操作菜单
│   └── MessageContent.tsx    # 块内容渲染
├── Blocks/
│   ├── MainTextBlock.tsx
│   ├── ThinkingBlock.tsx
│   ├── ToolBlock.tsx
│   └── index.tsx             # 块类型路由
└── Markdown/
    ├── Markdown.tsx
    ├── CodeBlock.tsx
    └── plugins/
```

### Step 3: 适配数据层

LinX 使用 TanStack Query + Solid Pod，需要创建适配层：

```typescript
// apps/web/src/modules/chat/hooks/useMessageBlocks.ts
export function useMessageBlocks(messageId: string) {
  // 从 Solid Pod 查询消息块
  // 适配 Cherry Studio 的块格式
}

// apps/web/src/modules/chat/hooks/useMessageOperations.ts
export function useMessageOperations() {
  // 封装消息操作 mutations
  // 保持与 Cherry Studio 兼容的 API
}
```

### Step 4: 迁移 Inputbar

```bash
apps/web/src/components/chat-kit/
├── Composer/
│   ├── Composer.tsx          # 主容器
│   ├── ComposerCore.tsx      # 输入框核心
│   ├── ComposerToolbar.tsx   # 工具栏
│   └── ComposerProvider.tsx  # 工具状态 Context
└── tools/
    ├── AttachmentTool.tsx
    ├── ThinkingTool.tsx
    ├── WebSearchTool.tsx
    └── types.ts
```

---

## 数据模型映射

### Cherry Studio Message → LinX Message

```typescript
// Cherry Studio
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string           // 已废弃，改用 blocks
  blocks: MessageBlock[]    // 块列表
  assistantId: string
  topicId: string
  model?: Model
  createdAt: number
  status: MessageStatus
  // ... 其他字段
}

// LinX (保持不变，扩展 richContent)
interface MessageRow {
  id: string
  chatId: string
  threadId: string
  maker: string             // WebID
  role: 'user' | 'assistant'
  content: string           // 主文本
  richContent?: string      // JSON: { blocks: MessageBlock[] }
  status: 'sending' | 'sent' | 'error'
  createdAt: Date
}
```

### 块存储策略

LinX 不需要单独的块表，将块存储在 `richContent` JSON 字段中：

```typescript
interface RichContent {
  thought?: string                    // 向后兼容
  toolInvocations?: ToolInvocation[]  // 向后兼容
  blocks?: MessageBlock[]             // 新的块系统
}
```

---

## 关键代码参考

### Cherry Studio 关键文件

```
# 消息类型
src/renderer/src/types/newMessage.ts

# 消息组件
src/renderer/src/pages/home/Messages/Message.tsx
src/renderer/src/pages/home/Messages/MessageContent.tsx
src/renderer/src/pages/home/Messages/Blocks/

# Markdown
src/renderer/src/pages/home/Markdown/Markdown.tsx
src/renderer/src/pages/home/Markdown/CodeBlock.tsx

# 输入栏
src/renderer/src/pages/home/Inputbar/Inputbar.tsx
src/renderer/src/pages/home/Inputbar/components/InputbarCore.tsx

# 流式处理
src/renderer/src/services/messageStreaming/BlockManager.ts

# 状态管理
src/renderer/src/store/newMessage.ts
src/renderer/src/store/messageBlock.ts
```

### Lobe Chat 参考

```
# 消息组件
src/features/Conversation/Messages/

# 聊天 Store
src/store/chat/

# 类型定义
src/types/message/
```

---

## 风险和注意事项

1. **数据同步**
   - Cherry Studio 使用本地 IndexedDB
   - LinX 需要同步到 Solid Pod
   - 考虑离线优先 + 后台同步策略

2. **性能**
   - 块系统增加了渲染复杂度
   - 需要实现虚拟滚动
   - 流式更新需要优化 (requestAnimationFrame)

3. **类型安全**
   - Cherry Studio 使用 Redux + TypeScript
   - 需要保持 LinX 的 Zustand + TanStack Query 类型安全

4. **样式适配**
   - Cherry Studio 使用 Ant Design
   - LinX 使用 shadcn/ui (Tailwind)
   - 需要重新实现样式

---

## 时间估算

| 阶段 | 任务 | 预估时间 |
|------|------|---------|
| P0 | 块类型定义 | 2h |
| P0 | 消息组件迁移 | 8h |
| P0 | Markdown 渲染器 | 4h |
| P1 | Inputbar 迁移 | 6h |
| P1 | 工具系统 | 4h |
| P2 | 消息操作 | 4h |
| P2 | 流式优化 | 4h |
| **Total** | | **32h** |

---

## 更新日志

- **2024-12-15**: 创建迁移计划
