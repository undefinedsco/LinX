# Chat Thread/Message 参数化集合 Spec

- Status: Implemented（2026-08-05）；私有云 p50/p95 与浏览器 channel 计数仍是发布验证项

## 实现证据

- `createPodCollection` 的类型化等值 `filter` 已由本地真实 xpod 集成测试证明会筛掉不匹配 RDF relation。
- 参数实例池覆盖 scope 隔离、引用计数、inactive LRU 与 dispose；Thread 首屏和 Message 最新 50 条窗口均有契约测试。
- 创建、更新与删除均写入对应参数集合；真实 xpod 集成测试以 52 条消息跨越首个 50 条窗口，回查首尾 message 与 thread 均已删除。
- 参数实例不建立自己的 Pod subscription，chat/thread/message 仍各共享一个资源级 lease。
- 来源：乐观更新+水化审计 F10（`docs/pod-subscription-budget-design.md` §3）

## 1. 问题实证

- `buildQuery` 无 `where` 过滤能力（`packages/stores/src/pod-collection.ts:107-157`）
- `threadCollection`/`messageCollection` 无窗口（`apps/web/src/modules/chat/data/collections.ts:1140-1151, 1169-1180`）
- `useThreadList`/`useMessageList` 订阅整个集合并**客户端过滤**（2078-2090、2119-2127）
- 后果：打开任一 thread 触发**全 Pod 所有 thread 的所有 message** 的 SELECT；聊天冷启动主成本；每次 `['messages']` 失效（F16 修复后真实生效）都是一次全表扫描
- 订阅侧是独立问题：当前 `subscribeToPod(db)` 以 resource 为边界，不读取 SELECT 的 `where`；参数化查询不会自动收窄通知 topic

## 2. 目标与非目标

**目标**
- thread 列表按 chat 过滤查询（只读当前 chat 的 threads）
- message 列表按 thread 过滤查询（只读当前 thread 的 messages）
- 只有活跃 chat/thread 集合实例参与实时同步，且实例与订阅的生命周期有明确预算

**非目标**
- 不改消息文档在 Pod 上的布局（每条 message 仍是独立资源）
- 不改 chatCollection 本身（chat 列表规模小，全量可接受）

## 3. 方案

### 3.1 两条候选路线

**A. 参数化集合（推荐）**：每个 (chatId) / (threadId) 一个集合实例

- `createPodCollection` 增加受类型约束的 `filter` / `where` 输入，在 `buildQuery` 的 SELECT 上叠加等值条件（`thread.chat = chatIri` / `message.thread = threadIri`）。落地前用 drizzle-solid 集成测试确认 RDF relation 列应比较 full IRI，而不是 UI 短 id；不得仅凭存在 `query.where()` 推断生成结果正确。
- queryKey 参数化：`['threads', chatId]`、`['messages', threadId]`；每参数组合一个 collection 实例（工厂 + Map 缓存，db 切换时重建）
- 失效恢复粒度：mutations 失效 `['threads', chatId]` / `['messages', threadId]`，只 refetch 当前上下文（F16 修复的键随之升级，而不是现在的全表 `['threads']`）
- 查询与订阅分离：参数化 collection 负责收窄 SELECT；现有 resource 级 Pod subscription 作为该 schema 的共享 lease，不能为每个参数实例重复创建相同 topic。
- 活跃 thread 切换只 acquire/release 参数化 collection 的消费生命周期；若底层标准 Solid topic 无法按 relation 过滤，则维持一个活跃模块级 resource subscription，并把通知按 row relation 路由到当前实例。无法解析的事件才使活跃实例 refetch。
- UI 层：`useThreadList(chatId)`/`useMessageList(threadId)` 直接读参数化集合，删掉客户端过滤

**B. 服务端 where + 单集合**：保留单集合，`useLiveQuery` 的 where 下推到 queryFn

- tanstack db 的 live query where 是客户端的，要下推需要自定义 sync——工作量大且与 queryCollection 的语义冲突，不推荐

### 3.2 推荐 A 的理由

与现有窗口机制同构，但**不与订阅机制同构**。collection 实例可以独立窗口化，resource subscription 必须共享；否则访问历史会把一个全量通知 topic 复制成多个 lease。改动面至少包含“工厂 + queryKey 参数化 + where 支持 + 共享通知路由 + 生命周期销毁”。

### 3.3 内存驻留注意

- 参数化实例随导航累积：实例池必须有引用计数和 LRU；只有 refCount=0 的实例可淘汰，淘汰时调用明确的 `cleanup/dispose`，取消 in-flight query 并释放观察者。
- message 实例窗口：首屏读取“最新 50 条”，显示顺序再升序排列。直接 `createdAt asc limit 50` 会得到最早 50 条，不符合聊天首屏语义；向上滚动使用反向游标加载历史。
- `useThreadIndex` 仍需要跨 chat 的轻量索引。不能因参数化详情集合删除该能力；索引应只选 chat sidebar 所需列并保持有界，不能复用全量 message collection。

## 4. 落地顺序

1. 先写自举 xpod 集成测试，证明 relation `where` 的 SPARQL、短 id/full IRI 边界以及排序/游标语义。
2. `createPodCollection` 支持类型化 filter + 窗口组合测试，不把 app-specific chat 语义写进 stores。
3. 集合实例池（`threadCollectionFor(chatId)` / `messageCollectionFor(threadId)`）：scope-aware key、引用计数、LRU、dispose 单测。
4. `useThreadList` / `useMessageList` 切换；失效键参数化，同时保留独立的 `useThreadIndex` 轻量索引。
5. 通知共享：同 resource 一条共享 lease；事件只更新匹配实例。测试访问 N 个 thread 后逻辑订阅数仍为常数。
6. 验证：真实 Pod 集成测试断言 SELECT 带正确 where；e2e/CDP 断言打开 thread 不全表扫描、切换 20 个 thread 不增加底层 notification channel；记录冷启动 p50/p95 和读取行数。

## 5. 风险与回退

- **实例泄漏**：LRU dispose 必须有测试覆盖（实例数上限断言）
- **订阅放大**：参数化实例不得各自建立相同 resource topic；底层 channel 数必须纳入验收。
- **消息首屏方向错误**：必须覆盖“先显示最新 50 条、向上加载更旧消息”的时间顺序测试。
- **失效键迁移遗漏**：grep 全部 `['threads']`/`['messages']` 失效站点逐一核对
- **回退**：工厂层保留全量集合作为 fallback 参数（`threadCollectionFor(null)` 行为 = 现状），可逐 hook 灰度

## 6. 关联

- 解锁：F12（参数化后 message 才可按 thread 快照）
- 依赖：F9 的窗口 refetch 语义先稳定；与 F11 无直接依赖，F11 处理 chatCollection 而非 thread/message
