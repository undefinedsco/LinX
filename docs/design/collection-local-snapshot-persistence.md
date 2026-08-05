# 集合本地快照持久化 Spec（IndexedDB Persister）

- Status: Proposal（2026-08-05）
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
- Pod 切换/账号切换时快照隔离，不串数据

**非目标**
- 不做全文离线缓存（分页之外的行不落盘）
- 不做离线写队列持久化（现有 offline-queue 是内存级，独立问题）
- 不改变任何集合的读路径语义（水化数据只作初始渲染，权威仍是网络）

## 3. 方案

### 3.1 持久化层

新增 `packages/stores/src/collection-snapshot-persister.ts`：

```ts
interface CollectionSnapshot<TData> {
  queryKey: string[]         // 集合 queryKey
  scopeKey: string           // podUrl + webId 派生，隔离账号/Pod
  rows: TData[]              // 首窗口行（含游标列值）
  nextCursor: unknown | null
  savedAt: number
}

interface CollectionSnapshotPersister {
  load(queryKey: string[], scopeKey: string): Promise<CollectionSnapshot | null>
  save(snapshot: CollectionSnapshot): Promise<void>
  clear(scopeKey: string): Promise<void>
}
```

- 存储：IndexedDB（`idb` 或直接裸 API，一个 objectStore，key = `scopeKey:queryKey.join('/')`）
- 写入时机：debounce 的集合状态订阅（`collection.subscribeChanges` 或 query cache 订阅），窗口首屏数据变化后 500ms 落盘；避免每行写都触发
- TTL：7 天；过期快照 load 时丢弃

### 3.2 水化接入点

`pod-collection.ts` 的 `queryFn`/`fetchRows` 前加 `initialData` 语义：

1. `createPodCollection` 接受 `persister?: CollectionSnapshotPersister`
2. 集合创建时异步 `load()`，命中则用 tanstack queryClient 的 `setQueryData(queryKey, snapshot.rows)` 预填 + `initialDataUpdatedAt = savedAt`；`windowState`/`residentWindowPages`/`nextCursor` 从快照恢复
3. 标准 stale-while-revalidate：快照按 staleTime 判定为 stale → 后台自动 refetch（现有行为），返回后覆盖并重新落盘
4. `scopeKey` 不匹配（换了 Pod/账号）→ 不加载，异步 `clear()` 旧 scope

### 3.3 与窗口机制的协作

- 快照只存首窗口（`window.limit` 行 + cursor），与 `fetchRows` 重建逻辑同构；恢复后 `loadNextPage` 从快照 cursor 继续，无需回查
- 非窗口集合（chat/thread/message）整表快照行数可控（chat 数百行级）；message 全量快照过大则跳过（等 F10 参数化后按 thread 快照）

## 4. 落地顺序

1. persister + 单测（save/load/TTL/scope 隔离/debounce）
2. `createPodCollection` 接入（opt-in 参数）+ 单测（快照恢复窗口状态、stale 后 refetch 覆盖）
3. 逐集合启用：favorites → contacts → inbox（窗口集合收益最直接）→ chat；thread/message 等 F10
4. 验证：冷启动 e2e（断网重启首屏有数据）+ performance 断言（首屏有内容时间 < 100ms 本地）

## 5. 风险与回退

- **快照陈旧误导**：stale-while-revalidate 语义下快照只是初始帧，refetch 覆盖；渲染层已有 isLoading 区分，风险低
- **schema 漂移**：行结构变更后旧快照字段缺失——`savedAt` + 版本字段，不匹配即丢弃
- **隐私**：Pod 数据落盘 IndexedDB 与浏览器 profile 同级，不新增暴露面；退出登录时 `clear()`
- **回退**：persister 是 opt-in 参数，不传即现状

## 6. 关联

- 依赖：无（可独立先做）
- 协同：F10（参数化后 thread/message 才可快照）、F9（refetch 塌缩修复后快照语义更稳定）
