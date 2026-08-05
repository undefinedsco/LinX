# 集合本地快照持久化 Spec（IndexedDB Persister）

- Status: Implemented（2026-08-05；Chat、参数化 Thread/Message、Inbox、Favorites、Contacts 已接入；私有 Pod p50/p95 与断网重启仍属发布验证项）

## 实现证据

- stores 契约测试覆盖版本/TTL/LRU/容量、scope 隔离、日期 codec、首窗口原子恢复、后台 revalidate 与失败保留。
- Web adapter 使用 IndexedDB；退出登录前 await 清空全部 collection snapshot。
- credentials、secret 与文件正文没有接入快照。
- 来源：乐观更新+水化审计 F12（`docs/pod-subscription-budget-design.md` §3）
- 约束：遵循主设计文档硬约束——不发明私有协议；本 spec 只做本地缓存，不触碰任何线上协议

## 1. 问题实证

- 冷启动无任何本地快照：`query-provider.tsx:5-14` 是纯内存 `QueryClient`，全代码库无 `createPersister`/IndexedDB 用法（grep 实证）
- 每次冷启动 = 全量网络拉取：inbox 4 个窗口集合（各最多 3 次顺序往返，物理页 50 上限）+ favorites + contacts + chat 全量扫描（见 F10 spec）
- 网络慢或 Pod 不可达时，首屏长时间只有骨架/空列表，尽管 5 分钟前这些数据就在本机

## 2. 目标与非目标

**目标**
- 冷启动首屏从 IndexedDB 快照秒渲染（stale-while-revalidate：先渲快照，后台 refetch 覆盖）
- 快照内容 = 各集合首窗口（与常驻窗口策略一致的 top-N 行）+ 游标状态
- Pod 切换/账号切换时快照隔离，不串数据；退出登录后可证明已清除
- 只持久化已确认的集合基线，不把 pending optimistic mutation 当成服务端事实落盘

**非目标**
- 不做全文离线缓存（分页之外的行不落盘）
- 不做离线写队列持久化（现有 offline-queue 是内存级，独立问题）
- 不改变任何集合的读路径语义（水化数据只作初始渲染，权威仍是网络）

## 3. 方案

### 3.1 持久化层

新增 `packages/stores/src/collection-snapshot-persister.ts`：

```ts
interface CollectionSnapshot<TData> {
  version: number            // schema / serialization version
  queryKey: readonly unknown[]
  scopeKey: string           // opaque database identity，隔离账号/Pod
  rows: TData[]              // 首窗口行（含游标列值）
  nextCursor: unknown | null
  residentPageCount: number
  savedAt: number
}

interface CollectionSnapshotPersister {
  load(queryKey: string[], scopeKey: string): Promise<CollectionSnapshot | null>
  save(snapshot: CollectionSnapshot): Promise<void>
  clear(scopeKey: string): Promise<void>
}
```

- 存储：优先使用项目已有依赖；若无封装，先以裸 IndexedDB 实现最小 adapter，不为一个 objectStore 新增依赖。
- key 使用版本化稳定序列化（例如 `[version, scopeKey, queryKey]` 的 canonical JSON），禁止 `queryKey.join('/')`，避免含 `/` 的参数发生碰撞。
- 只接受可稳定序列化的 queryKey 参数；function、db object、AbortSignal 等运行时对象不得进入持久化 key。
- 每个 opt-in collection 必须提供 `serializeRow` / `deserializeRow` codec，显式恢复 `Date` 等非 JSON 原生值并校验必要字段；不能直接 `JSON.stringify` 任意 ORM row。
- 写入来源是 collection 的**已确认基线状态**，而不是任意 `subscribeChanges` 事件；pending optimistic insert/update/delete 在持久化完成或回滚前不得覆盖快照。
- debounce 500ms 只是写放大控制，不是正确性边界；scope dispose/页面关闭时做 best-effort flush。
- TTL 默认 7 天，同时设置每 scope 的集合数、总行数和字节上限；超限按 LRU 清理。

### 3.2 水化接入点

持久化接在 `createPodCollection` 的同步边界，而不是假设 React Query cache 等同于 TanStack Collection 内部状态：

1. `createPodCollection` 接受 `persister?: CollectionSnapshotPersister`
2. collection 暴露单一 `restoreSnapshot(snapshot)` 内部入口，在一个批次中恢复 collection rows、`residentWindowPages`、`windowState` 和 `nextCursor`；不得由调用方分别写三份状态。
3. collection 暴露只读 `snapshotState = { source: 'none' | 'local', savedAt, isRevalidating }`；恢复完成后 rows 与 `source: 'local'` 在同一批次可见，随后显式启动后台 revalidate。不要依赖未经验证的 `initialDataUpdatedAt` 自动驱动 collection。
4. 远端成功结果以批次替换基线并重新落盘；远端失败保留快照，同时由 F17 的 stale/error 状态提示用户。
5. scopeKey 由 database/session 层提供稳定 opaque identity；persister 不自行拼接 podUrl/webId。scope 不匹配时不读取，账号退出时 await 当前 scope `clear()`，不能只做未等待的异步清理。

### 3.3 与窗口机制的协作

- 第一阶段快照只存首窗口（`window.limit` 行 + cursor，`residentPageCount=1`）。不要声称恢复全部常驻页；若未来持久化多页，必须遵循 F9 的预算与游标重建契约。
- 恢复后的 `loadNextPage` 可以从快照 cursor 继续，但首次远端 revalidate 完成后必须用权威 cursor 替换，避免数据排序变化造成缺行/重行。
- 非窗口集合（chat/thread/message）整表快照行数可控（chat 数百行级）；message 全量快照过大则跳过（等 F10 参数化后按 thread 快照）

## 4. 落地顺序

1. 在 F9/F10 数据与窗口语义稳定后，定义 snapshot version、opaque scope identity 和容量/隐私策略。
2. persister adapter 单测：save/load、TTL、版本淘汰、稳定 key、row codec、scope 隔离、容量 LRU、await clear。
3. `createPodCollection.restoreSnapshot` 契约测试：rows/window/cursor 原子恢复，pending optimistic 状态不落盘，远端成功覆盖，失败保留 stale snapshot。
4. 逐集合 opt-in：favorites → contacts → inbox → chat → 参数化 thread/message。每启用一个集合都记录行数和字节预算。
5. 自举 xpod + 真实 Pod e2e：在线冷启动、断网重启、账号切换、退出后 IndexedDB 清理；performance 记录 snapshot 可见 p50/p95，目标本地读取 p95 <100ms，不用单次断言伪装稳定性能。

## 5. 风险与回退

- **快照陈旧误导**：快照帧必须显式标为 stale/revalidating；不能依赖 `isLoading` 区分，因为恢复后已经有数据。
- **schema 漂移**：snapshot `version` 不匹配即丢弃；`savedAt` 不是 schema version。
- **隐私**：IndexedDB 会把 Pod 数据从进程内生命周期扩大到跨会话留存，属于新增暴露面。第一阶段默认排除 credentials、secret、token、私密正文等敏感集合；登出和 scope 删除必须有 e2e。浏览器同源 XSS 风险无法由 IndexedDB 自身解决，需在安全模型中明确记录。
- **磁盘膨胀**：按 scope 设置字节上限并观测写入失败；不能只限制行数。
- **回退**：persister 是 opt-in 参数，不传即现状

## 6. 关联

- 依赖：F9 先稳定窗口 refetch；F10 先稳定 thread/message 参数化 key。F17 应先落地，以便快照 revalidate 失败可被正确表达。
- 非依赖：F11 chat hydration cache 第一阶段保持内存级，不自动纳入通用行快照
