# LinX 数据流具体实现示例

> React State -> TanStack Query -> Solid Pod 的完整代码示例
> 
> 创建时间：2025-11-08

---

## 1. 数据流架构概览

```
UI Components (React) 
    ↕ useState/zustand (UI状态) 
TanStack Query Hooks
    ↕ 缓存 + 网络请求
drizzle-solid + Solid Pod
```

## 2. 完整的聊天功能示例

### 2.1 数据模型层 (@linx/models)

```typescript
// packages/models/src/chat/chat.schema.ts (已存在)
export const chatTable = podTable("chat", {
  title: string("title").predicate(DCTerms.title).notNull(),
  conversationType: string("conversationType").predicate(LINQ.conversationType).notNull(),
  participants: uri("participants").array().predicate(LINQ.participants).notNull(),
  status: string("status").predicate(LINQ.status).notNull().default("active"),
  creator: string("creator").predicate(DCTerms.creator).notNull(),
  createdAt: timestamp("createdAt").predicate(DCTerms.created).notNull().defaultNow(),
  lastMessage: string("lastMessage").predicate(LINQ.lastMessage),
  lastMessageAt: timestamp("lastMessageAt").predicate(LINQ.lastMessageAt),
})

export type ChatRow = typeof chatTable.$inferSelect    // 直接推导类型
export type ChatInsert = typeof chatTable.$inferInsert
```

### 2.2 TanStack Query 数据访问层

```typescript
// apps/web/src/lib/data-access.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { db } from './drizzle-solid-client'
import { chatTable, type ChatRow, type ChatInsert } from '@linx/models'

// ===== 查询 Hooks =====
export function useChats() {
  return useQuery({
    queryKey: ['chats'],
    queryFn: async (): Promise<ChatRow[]> => {
      // 直接查询 Solid Pod
      const chats = await db.select().from(chatTable).execute()
      return chats
    },
    staleTime: 5 * 60 * 1000,  // 5分钟内认为数据新鲜
    gcTime: 10 * 60 * 1000,    // 10分钟后垃圾回收
  })
}

export function useChat(chatId: string) {
  return useQuery({
    queryKey: ['chats', chatId],
    queryFn: async (): Promise<ChatRow | null> => {
      const [chat] = await db.select().from(chatTable)
        .where(eq(chatTable.id, chatId))
        .execute()
      return chat || null
    },
    enabled: !!chatId, // 只有 chatId 存在时才查询
  })
}

// ===== 变更 Hooks =====
export function useCreateChat() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (data: ChatInsert): Promise<ChatRow> => {
      // 直接写入 Solid Pod
      const [newChat] = await db.insert(chatTable).values(data).returning().execute()
      return newChat
    },
    onSuccess: (newChat) => {
      // 乐观更新：立即更新缓存
      queryClient.setQueryData(['chats'], (oldChats: ChatRow[] = []) => {
        return [newChat, ...oldChats]
      })
      
      // 也可以选择无效化缓存，重新获取
      // queryClient.invalidateQueries({ queryKey: ['chats'] })
    }
  })
}

export function useUpdateChat() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ chatId, data }: { chatId: string, data: Partial<ChatRow> }) => {
      const [updatedChat] = await db.update(chatTable)
        .set(data)
        .where(eq(chatTable.id, chatId))
        .returning()
        .execute()
      return updatedChat
    },
    onSuccess: (updatedChat) => {
      // 更新列表缓存
      queryClient.setQueryData(['chats'], (oldChats: ChatRow[] = []) => {
        return oldChats.map(chat => 
          chat.id === updatedChat.id ? updatedChat : chat
        )
      })
      
      // 更新单个聊天缓存
      queryClient.setQueryData(['chats', updatedChat.id], updatedChat)
    }
  })
}
```

### 2.3 Zustand UI 状态管理

```typescript
// apps/web/src/stores/chat-store.ts
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

// UI 状态（不是业务数据）
interface ChatUIState {
  // 当前选中的聊天
  selectedChatId: string | null
  
  // 搜索和过滤
  searchQuery: string
  statusFilter: 'all' | 'active' | 'archived'
  
  // UI 状态
  isSidebarOpen: boolean
  isCreatingChat: boolean
  
  // Actions
  setSelectedChat: (chatId: string | null) => void
  setSearchQuery: (query: string) => void
  setStatusFilter: (filter: 'all' | 'active' | 'archived') => void
  toggleSidebar: () => void
  setCreatingChat: (creating: boolean) => void
}

export const useChatStore = create<ChatUIState>()(
  devtools((set, get) => ({
    // 初始状态
    selectedChatId: null,
    searchQuery: '',
    statusFilter: 'active',
    isSidebarOpen: true,
    isCreatingChat: false,
    
    // Actions
    setSelectedChat: (chatId) => set({ selectedChatId: chatId }),
    setSearchQuery: (query) => set({ searchQuery: query }),
    setStatusFilter: (filter) => set({ statusFilter: filter }),
    toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
    setCreatingChat: (creating) => set({ isCreatingChat: creating }),
  }), {
    name: 'chat-ui-store' // Redux DevTools 中显示的名称
  })
)
```

### 2.4 组合 Hook（业务数据 + UI 状态）

```typescript
// apps/web/src/hooks/useChatPage.ts
import { useMemo } from 'react'
import { useChats } from '../lib/data-access'
import { useChatStore } from '../stores/chat-store'

// 组合业务数据和UI状态的Hook
export function useChatPage() {
  // 1. 业务数据（来自 TanStack Query）
  const { 
    data: allChats = [], 
    isLoading, 
    error 
  } = useChats()
  
  // 2. UI状态（来自 Zustand）
  const { 
    selectedChatId, 
    searchQuery, 
    statusFilter,
    setSelectedChat,
    setSearchQuery,
    setStatusFilter 
  } = useChatStore()
  
  // 3. 计算派生状态
  const filteredChats = useMemo(() => {
    let filtered = allChats
    
    // 状态过滤
    if (statusFilter !== 'all') {
      filtered = filtered.filter(chat => chat.status === statusFilter)
    }
    
    // 搜索过滤
    if (searchQuery) {
      filtered = filtered.filter(chat => 
        chat.title?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }
    
    return filtered
  }, [allChats, statusFilter, searchQuery])
  
  // 4. 当前选中的聊天
  const selectedChat = useMemo(() => {
    return selectedChatId 
      ? allChats.find(chat => chat.id === selectedChatId) 
      : null
  }, [allChats, selectedChatId])
  
  return {
    // 数据
    chats: filteredChats,
    selectedChat,
    isLoading,
    error,
    
    // UI 状态
    searchQuery,
    statusFilter,
    
    // Actions
    setSelectedChat,
    setSearchQuery,
    setStatusFilter,
  }
}
```

### 2.5 React 组件使用

```typescript
// apps/web/src/components/ChatPage.tsx
import { useCreateChat } from '../lib/data-access'
import { useChatPage } from '../hooks/useChatPage'
import { useChatStore } from '../stores/chat-store'

export function ChatPage() {
  // 1. 使用组合的 Hook
  const {
    chats,
    selectedChat,
    isLoading,
    searchQuery,
    statusFilter,
    setSelectedChat,
    setSearchQuery,
    setStatusFilter,
  } = useChatPage()
  
  // 2. 变更操作
  const createChatMutation = useCreateChat()
  
  // 3. UI 状态
  const { isCreatingChat, setCreatingChat } = useChatStore()
  
  // 4. 事件处理
  const handleCreateChat = async (title: string) => {
    try {
      setCreatingChat(true)
      await createChatMutation.mutateAsync({
        title,
        conversationType: 'direct',
        participants: [/* WebID 列表 */],
        creator: 'current-user-webid',
        status: 'active'
      })
      setCreatingChat(false)
    } catch (error) {
      console.error('创建聊天失败:', error)
      setCreatingChat(false)
    }
  }
  
  if (isLoading) {
    return <div>加载中...</div>
  }
  
  return (
    <div className="chat-page">
      {/* 搜索和过滤 */}
      <div className="chat-filters">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索聊天..."
        />
        
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
        >
          <option value="all">全部</option>
          <option value="active">活跃</option>
          <option value="archived">已归档</option>
        </select>
      </div>
      
      {/* 聊天列表 */}
      <div className="chat-list">
        {chats.map((chat) => (
          <div
            key={chat.id}
            className={`chat-item ${selectedChat?.id === chat.id ? 'selected' : ''}`}
            onClick={() => setSelectedChat(chat.id)}
          >
            <h3>{chat.title}</h3>
            <p>{chat.lastMessage}</p>
          </div>
        ))}
        
        <button 
          onClick={() => handleCreateChat('新聊天')}
          disabled={isCreatingChat}
        >
          {isCreatingChat ? '创建中...' : '创建聊天'}
        </button>
      </div>
      
      {/* 聊天详情 */}
      <div className="chat-detail">
        {selectedChat ? (
          <ChatDetail chat={selectedChat} />
        ) : (
          <div>请选择一个聊天</div>
        )}
      </div>
    </div>
  )
}
```

## 3. 数据流总结

### 3.1 完整的数据流

```
1. 用户操作 (点击、输入)
    ↓
2. UI Actions (zustand)
    ↓ 
3. TanStack Query Mutations (写入)
    ↓
4. drizzle-solid (SPARQL)
    ↓
5. Solid Pod (RDF存储)
    ↓
6. TanStack Query Cache (缓存更新)
    ↓
7. React Re-render (UI更新)
```

### 3.2 职责分离

**TanStack Query**：
- 负责与 Solid Pod 的数据交互
- 处理加载状态、错误状态
- 提供缓存和自动重新获取
- 管理业务数据（ChatRow[], ContactRow[]）

**Zustand**：
- 负责UI状态（选中项、搜索条件、UI开关）
- 跨组件的状态共享
- 不存储业务数据，只存储UI状态

**React State (useState)**：
- 组件内部的临时状态（表单输入、模态框开关）
- 不跨组件共享的局部状态

### 3.3 为什么这样设计

1. **类型安全**：`@linx/models` 的类型直接流到 React 组件
2. **缓存优化**：TanStack Query 自动处理网络请求和缓存
3. **状态分离**：业务数据和UI状态分开管理，职责清晰
4. **响应式更新**：数据变更自动触发UI重新渲染
5. **网络优化**：自动重试、去重、后台更新

### 3.4 实际的网络请求流程

```typescript
// 1. 用户点击创建聊天
handleCreateChat() 
    ↓
// 2. 调用 mutation
createChatMutation.mutateAsync({...}) 
    ↓
// 3. drizzle-solid 执行 SPARQL INSERT
db.insert(chatTable).values(data).execute() 
    ↓
// 4. HTTP POST 到 Solid Pod
POST https://user.pod.com/chats/new-chat-id
    ↓
// 5. 更新本地缓存
queryClient.setQueryData(['chats'], newChats) 
    ↓
// 6. React 重新渲染
<ChatPage> re-renders with new data
```

这样的架构让数据流清晰、类型安全，同时保持了良好的性能和用户体验。