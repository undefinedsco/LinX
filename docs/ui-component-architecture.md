# UI 组件分层架构

LinX 采用 **纯 UI / 逻辑 UI 分层**设计，明确数据流向。

## 架构图

```
┌─────────────────────────────────────────┐
│  纯 UI 组件 (Presentational)            │
│  - 只负责渲染                            │
│  - 只和 Zustand 交互（读取 UI 状态）      │
│  - 通过 props 接收数据和回调              │
│  - 不知道 Collection 存在               │
└─────────────────────────────────────────┘
                    ↑ props / zustand store
┌─────────────────────────────────────────┐
│  逻辑 UI 组件 (Container)               │
│  - 操作 Collections（CRUD + 业务逻辑）   │
│  - 更新 Zustand 状态                     │
│  - 组合纯 UI 组件                        │
│  - 处理副作用（订阅、初始化等）            │
└─────────────────────────────────────────┘
                    ↓
┌───────────────────────┬─────────────────┐
│  Collections          │  Zustand Store  │
│  (数据 + 业务逻辑)     │  (纯 UI 状态)    │
└───────────────────────┴─────────────────┘
```

## 组件职责划分

| 组件类型 | 职责 | 可以访问 | 示例 |
|---------|------|---------|------|
| **纯 UI** | 渲染、样式、动画 | props, zustand (只读) | ContactCard, MessageBubble, Avatar |
| **逻辑 UI** | 数据获取、操作、状态同步 | collections, zustand, 组合纯 UI | ContactListPane, ChatDetailPane |

## 代码示例

### 纯 UI 组件

只管渲染，通过 props 接收一切：

```typescript
// components/ContactCard.tsx
interface ContactCardProps {
  contact: UnifiedContact
  isSelected: boolean
  onSelect: () => void
  onDelete: () => void
}

function ContactCard({ contact, isSelected, onSelect, onDelete }: ContactCardProps) {
  return (
    <div className={cn('p-3', isSelected && 'bg-accent')} onClick={onSelect}>
      <Avatar src={contact.avatarUrl} />
      <span>{contact.name}</span>
      <Button onClick={(e) => { e.stopPropagation(); onDelete(); }}>删除</Button>
    </div>
  )
}
```

### 逻辑 UI 组件

连接 Collection 和纯 UI：

```typescript
// components/ContactListPane.tsx
function ContactListPane() {
  // 1. 数据层 - 从 Collection 获取
  const contacts = contactCollection.state.data ?? []
  
  // 2. UI 状态层 - 从 Zustand 获取
  const { selectedId, select, search } = useContactStore()
  
  // 3. 过滤/转换（可选）
  const filteredContacts = useMemo(() => 
    contacts.filter(c => c.name.includes(search)),
    [contacts, search]
  )
  
  // 4. 操作处理 - 调用 Collection 方法
  const handleDelete = useCallback((id: string) => {
    contactCollection.delete(id)
    if (selectedId === id) select(null)  // 同步更新 UI 状态
  }, [selectedId, select])
  
  // 5. 组合纯 UI 组件
  return (
    <div>
      {filteredContacts.map(contact => (
        <ContactCard
          key={contact.id}
          contact={contact}
          isSelected={selectedId === contact.id}
          onSelect={() => select(contact.id)}
          onDelete={() => handleDelete(contact.id)}
        />
      ))}
    </div>
  )
}
```

## 命名规范

| 类型 | 命名模式 | 示例 |
|------|---------|------|
| 逻辑 UI | `XxxPane`, `XxxContainer` | ContactListPane, ChatDetailPane |
| 纯 UI | `XxxCard`, `XxxItem`, `XxxForm` | ContactCard, MessageBubble, AgentForm |

## 测试策略

| 组件类型 | 测试方式 |
|---------|---------|
| **纯 UI** | 快照测试、Storybook、视觉回归 |
| **逻辑 UI** | 集成测试、Mock Collection |
