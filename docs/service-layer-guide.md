# Service 层设计指南

## 核心原则

**大多数情况不需要 service.ts**，因为：
- 简单 CRUD → 直接调用 `collection.insert/update/delete`
- 业务逻辑 → 扩展到 `collections.ts` 中

## 何时需要 Service 层

| 场景 | 示例 | 是否需要 Service |
|------|------|-----------------|
| 简单 CRUD | 创建联系人、删除消息 | ❌ 直接用 collection |
| 跨 Collection 操作 | 创建 AI 助手（Agent + Contact） | ⚡ 扩展到 collections.ts |
| 复杂业务规则 | 凭证默认值管理 | ✅ 保留 service.ts |
| 外部 API 调用 | 发送 AI 消息 | ✅ 保留 service.ts |

## Collections 扩展模式

当有跨 Collection 操作但不需要独立 service.ts 时：

```typescript
// collections.ts
export const contactCollection = createPodCollection<ContactRow, ContactInsert>({...})
export const agentCollection = createPodCollection<AgentRow, AgentInsert>({...})

// 扩展业务逻辑
export const contactOps = {
  collection: contactCollection,
  
  // 简单操作
  create: (input: ContactInsert) => {
    return contactCollection.insert({ id: crypto.randomUUID(), ...input })
  },
  
  // 跨 Collection 操作
  createWithAgent: async (agentInput: AgentInsert) => {
    const agentId = crypto.randomUUID()
    const contactId = crypto.randomUUID()
    
    const agentTx = agentCollection.insert({ ...agentInput, id: agentId })
    const contactTx = contactCollection.insert({
      id: contactId,
      name: agentInput.name,
      contactType: 'agent',
      entityUri: agentId,
    })
    
    await Promise.all([
      agentTx.isPersisted.promise,
      contactTx.isPersisted.promise,
    ])
    
    return { agentId, contactId }
  },
}
```

## 各模块现状与建议

| 模块 | 现状 | 建议 |
|------|------|------|
| **contacts** | service.ts 纯包装 | 删除，逻辑移到 collections.ts |
| **credentials** | service.ts 有复杂默认值管理 | 保留 |
| **chat** | service.ts 混合 | 精简，只保留 AI 相关 |
| **model-services** | useModelServices.ts 有合并逻辑 | 保留 |

## Service 层保留示例

credentials/service.ts 保留原因：

```typescript
// 复杂业务规则：确保每个 provider 有且只有一个默认凭证
async function reconcileDefaults(providerId: string) {
  const credentials = await fetchByProvider(providerId)
  const defaults = credentials.filter(c => c.isDefault)
  
  if (defaults.length === 0 && credentials.length > 0) {
    // 自动设置第一个为默认
    await setAsDefault(credentials[0].id)
  } else if (defaults.length > 1) {
    // 只保留最新的为默认
    for (const c of defaults.slice(1)) {
      await update(c.id, { isDefault: false })
    }
  }
}
```

这种多步骤、有条件分支的业务规则，适合放在 service 层。
