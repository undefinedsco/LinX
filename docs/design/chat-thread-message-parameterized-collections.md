# Chat Thread/Message 参数化集合 Spec

- Status: Proposal（2026-08-05）
- 来源：乐观更新+水化审计 F10（`docs/pod-subscription-budget-design.md` §3）

## 1. 问题实证

- `buildQuery` 无 `where` 过滤能力（`packages/stores/src/pod-collection.ts:107-157`）
- `threadCollection`/`messageCollection` 无窗口（`apps/web/src/modules/chat/data/collections.ts:1140-1151, 1169-1180`）
- `useThreadList`/`useMessageList` 订阅整个集合并**客户端过滤**（2078-2090、2119-2127）
- 后果：打开任一 thread 触发**全 Pod 所有 thread 的所有 message** 的 SELECT；聊天冷启动主成本；每次 `['messages']` 失效（F16 修复后真实生效）都是一次全表扫描
- 订阅侧同样的问题：message 集合的 Pod 订阅覆盖全部 thread 的 message 文档容器

## 2. 目标与非目标

**目标**
- thread 列表按 chat 过滤查询（只读当前 chat 的 threads）
- message 列表按 thread 过滤查询（只读当前 thread 的 messages）
- 订阅同步收窄到活跃 chat/thread 的文档容器

**非目标**
- 不改消息文档在 Pod 上的布局（每条 message 仍是独立资源）
- 不改 chatCollection 本身（chat 列表规模小，全量可接受）

## 3. 方案

### 3.1 两条候选路线

**A. 参数化集合（推荐）**：每个 (chatId) / (threadId) 一个集合实例

- `createPodCollection` 增加 `where` 支持：在 `buildQuery` 的 SELECT 上叠加等值条件（`thread.chat = chatId` / `message.thread = threadId`）；drizzle-solid 的 SPARQL 翻译已支持 `query.where()`（现有代码 `selectQuery.where` 存在）
- queryKey 参数化：`['threads', chatId]`、`['messages', threadId]`；每参数组合一个 collection 实例（工厂 + Map 缓存，db 切换时重建）
- 失效恢复粒度：mutations 失效 `['threads', chatId]` / `['messages', threadId]`，只 refetch 当前上下文（F16 修复的键随之升级，而不是现在的全表 `['threads']`）
- 订阅：活跃集合实例才订阅（复用现有 lease + runtime 门控）；message 订阅按 thread 进入/离开 acquire/release
- UI 层：`useThreadList(chatId)`/`useMessageList(threadId)` 直接读参数化集合，删掉客户端过滤

**B. 服务端 where + 单集合**：保留单集合，`useLiveQuery` 的 where 下推到 queryFn

- tanstack db 的 live query where 是客户端的，要下推需要自定义 sync——工作量大且与 queryCollection 的语义冲突，不推荐

### 3.2 推荐 A 的理由

与现有窗口/lease/订阅机制完全同构（每个参数化集合独立窗口、独立 lease key、独立订阅），改动面是"工厂 + queryKey 参数化 + where 支持"三处，不动任何共享代码语义。

### 3.3 内存驻留注意

- 参数化实例随导航累积：配合现有 residency 窗口（每实例有界）+ 实例 LRU（保留最近 N 个 chat/thread 实例，超出 dispose）防内存膨胀
- message 实例窗口：limit 50，orderBy createdAt asc（聊天语义），maxResidentPages 按滚动加载

## 4. 落地顺序

1. `createPodCollection` 支持 `where` 等值条件 + 单测（SELECT 断言）
2. 集合工厂（`threadCollectionFor(chatId)`/`messageCollectionFor(threadId)`，Map 缓存 + LRU dispose）+ 单测
3. `useThreadList`/`useMessageList` 切换到参数化集合；失效键升级为参数化键（含 F16 已修的站点）
4. 订阅门控：活跃 chat 的 thread 集合、活跃 thread 的 message 集合才订阅（在 chat runtime activate 基础上细化）
5. 验证：单测 + e2e CDP 断言打开 thread 的 SELECT 带 where 条件、无全表扫描；聊天冷启动查询计数对比

## 5. 风险与回退

- **实例泄漏**：LRU dispose 必须有测试覆盖（实例数上限断言）
- **失效键迁移遗漏**：grep 全部 `['threads']`/`['messages']` 失效站点逐一核对
- **回退**：工厂层保留全量集合作为 fallback 参数（`threadCollectionFor(null)` 行为 = 现状），可逐 hook 灰度

## 6. 关联

- 解锁：F12（参数化后 message 才可按 thread 快照）、F11（参数化后水化范围随之收窄）
- 依赖：无
