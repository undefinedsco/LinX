# feat/favorites-hub 执行文档

> 波次：Wave B

## 1. 目标与范围

- 收藏中心作为**独立一级微应用入口**（sidebar 主导航）。
- 支持跨模块标星项的平铺展示与统一搜索。
- 收藏数据通过模型 hooks 上报并汇总到 favorite 索引。

## 2. 依赖关系

- 入依赖：`feat/contracts-chat-contact`
- 出依赖：`feat/mcp-bridge`（只消费收藏数据，不阻塞桥接）

## 3. UI 设计

### 3.1 入口与导航

- 复用现有 `favorites` 一级微应用 ID（不放到“更多”菜单）。
- 替换当前 placeholder 为真实 favorites 模块组件。

### 3.2 页面结构

- 左侧 `FavoriteListPane`
  - 搜索框（标题/摘要/作者/来源模块）
  - 来源筛选（chat/contacts/files/messages/thread）
  - 平铺卡片列表（默认）
- 右侧 `FavoriteContentPane`
  - 快照详情（标题、摘要、作者、收藏时间）
  - 打开原对象（跳转到对应模块）
  - 取消收藏

### 3.3 交互规则

- 搜索默认模糊匹配 `searchText`。
- 打开原对象优先按 `sourceModule + sourceId` 导航；失败时回退 `targetUri`。
- 取消收藏后列表即时移除（乐观更新）。

## 4. 数据模型设计

基于现有 `favoriteTable` 升级为 Favorites V2：

- 保留：`id`, `targetType`, `targetUri`, `title`, `snapshotContent`, `snapshotAuthor`, `favoredAt`
- 新增：
  - `sourceModule`：来源模块（chat/contacts/files/messages/thread）
  - `sourceId`：来源对象业务 ID
  - `searchText`：归一化检索文本
  - `snapshotMeta`：JSON 字符串（头像、标签、副标题等）
  - `updatedAt`：快照更新时间

## 5. hooks 上报机制

- 在 `chat/thread/contact/file/message` 对应表的 `afterUpdate` hook 监听 `starred` 变化。
- `starred=true`：upsert 到 favorites。
- `starred=false`：从 favorites 删除。
- 启动时提供一次 reconcile 任务，修复历史 starred 与 favorites 不一致。

## 6. 分阶段计划

### Phase 0（Contract Baseline）

- 完成 Favorites V2 字段定义与类型导出。
- 实现 hooks 上报接口与 payload 约束。
- 搭建 favorites 微应用骨架（替换 placeholder）。

### Phase 1（Vertical Slice）

- 打通 hooks → favorite 索引 → UI 列表联动。
- 完成搜索、筛选、打开原对象、取消收藏主链路。
- 完成最小 e2e（标星 → 收藏页可见 → 打开原对象）。

### Phase 2（Hardening & Cutover）

- 完成 reconcile 与脏数据修复策略。
- 完成性能优化（大收藏列表检索与分页）。
- 默认启用 favorites 新实现并清理旧 placeholder。

## 7. 代码集中回 main 的检查点

- CP0：合并 favorites schema 变更、hooks 接口、微应用骨架。
- CP1：合并可运行链路（hooks 上报 + 列表搜索），flag 默认关闭。
- CP2：合并默认入口切换、reconcile 与旧逻辑清理。

## 8. 分支 DoD

- 契约测试通过（favorites 字段与 hooks payload）。
- 至少 1 条端到端主链路可跑通。
- 关键失败路径有明确错误处理。
- 对应文档和迁移说明已更新。

## 9. 测试契约（并发开发必填）

- Test Owner：`TBD`
- Required Suites：`TBD`（至少包含 unit/integration/min-e2e）
- Upstream Contract Version：`TBD`
- Downstream Smoke：`TBD`（至少 1 个下游场景）

---

## 9A. Solid 数据建模规范

> Favorites Hub 需要升级现有 `favoriteTable` 为 V2，新增来源追踪和检索字段。
> 不新增 Pod 表，但对现有表做字段扩展。

### 9A.1 新增 Namespace Terms

在 `UDFS` namespace 中新增 Favorites V2 相关 terms：

```typescript
// 在 UDFS namespace 中追加
export const UDFS = createNamespace('udfs', 'https://undefineds.co/ns#', {
  // ... 现有 terms ...

  // Favorites V2 新增
  sourceModule: 'sourceModule',         // 来源模块：'chat' | 'contacts' | 'files' | 'messages' | 'thread'
  sourceId: 'sourceId',                 // 来源对象业务 ID
  searchText: 'searchText',             // 归一化检索文本
  snapshotMeta: 'snapshotMeta',         // JSON: 头像、标签、副标题等
})
```

### 9A.2 Favorites V2 Vocab

```typescript
// packages/models/src/vocab/favorite.vocab.ts

import { UDFS, DCTerms, SCHEMA, RDF } from '../namespaces'

export const FavoriteVocab = {
  // 现有
  targetType: RDF.type,
  targetUri: UDFS.favoriteTarget,
  title: DCTerms.title,
  snapshotContent: SCHEMA.text,
  snapshotAuthor: SCHEMA.author,
  favoredAt: UDFS.favoredAt,

  // V2 新增
  sourceModule: UDFS.sourceModule,
  sourceId: UDFS.sourceId,
  searchText: UDFS.searchText,
  snapshotMeta: UDFS.snapshotMeta,
  updatedAt: DCTerms.modified,
} as const
```

### 9A.3 favoriteTable 改造方案

```typescript
// packages/models/src/favorite/favorite.schema.ts 新增字段

// V2 新增：来源追踪
sourceModule: string('sourceModule').predicate(UDFS.sourceModule),
sourceId: string('sourceId').predicate(UDFS.sourceId),

// V2 新增：检索
searchText: text('searchText').predicate(UDFS.searchText),

// V2 新增：快照元数据
snapshotMeta: text('snapshotMeta').predicate(UDFS.snapshotMeta),

// V2 新增：更新时间
updatedAt: timestamp('updatedAt').predicate(DCTerms.modified),
```

### 9A.4 hooks 上报 → favoriteTable 字段映射

| 源表 starred 变化 | favoriteTable 写入 | 说明 |
|------------------|-------------------|------|
| `chatTable.starred = true` | `{ sourceModule: 'chat', sourceId: chatId, targetType: MEETING.LongChat, title: chat.title, searchText: chat.title }` | Chat 收藏 |
| `threadTable.starred = true` | `{ sourceModule: 'thread', sourceId: threadId, targetType: SIOC.Thread, title: thread.title }` | Thread 收藏 |
| `contactTable.starred = true` | `{ sourceModule: 'contacts', sourceId: contactId, targetType: VCARD.Individual, title: contact.name }` | Contact 收藏 |
| `*.starred = false` | DELETE from favoriteTable WHERE sourceModule + sourceId | 取消收藏 |

### 9A.5 存储路径

| 实体 | Pod 路径 | RDF Type | 变更 |
|------|---------|----------|------|
| Favorite | `/.data/favorites/{id}.ttl` | `schema:CreativeWork` | 新增 V2 字段（向后兼容） |

> **向后兼容**：V2 新增字段均为可选。旧数据缺少 `sourceModule`/`sourceId` 时，
> reconcile 任务会根据 `targetUri` 反查填充。
