# 数据流范式统一设计（local-first / 乐观 / ORM / subscribe 回流）

- Status: Implementing（设计 + 集中契约 benchmark；更新于 2026-07-27）
- 范围：`packages/stores/src/pod-collection.ts`（基础设施）+ 各 applet 数据层（chat/inbox/files/favorites/contacts/model-services）+ `@undefineds.co/models` 的 starred-sync（外部包，单列）
- 目标：把"乐观更新 → ORM 持久化 → subscribe 确认回流 → 统一读法"落成**单一范式**，并把**验证下沉到基础设施层一份契约测试**，各 applet 不再各写一套。

> 本文包含诊断、目标设计和已落地的集中验证。历史诊断保留原时间点；已实现项以对应测试和 benchmark 为准。

## 0. 目标范式（一句话）

写走 collection mutation（**乐观**立即可见）→ collection 的 onInsert/onUpdate/onDelete 走 **ORM** 持久化到 db → db 变更（本地 + 远程）经 **live sync** 回流进 collection 的 `syncedData` → 读一律 **live query** 读"乐观层 + 已确认层"叠加态。全链路**零 `invalidateQueries`、零 refetch 兜底**。

## 1. 现状诊断（三轴裂口 + 根因）

### 1.1 三轴现状

| 轴 | 目标 | 现状 | 证据 |
| --- | --- | --- | --- |
| 乐观写 | 写走 collection mutation | 模块自身 mutation ✓；**models starred-sync 走 `db.insert` 绕过 collection** ✗ | `starred-sync.js` createFavorite `db.insert(favoriteResource)` |
| ORM 持久化 | collection→onInsert→db | `createPodCollection` 的 onInsert/onUpdate/onDelete **已自动做** ✓ | `pod-collection.ts:137-171` |
| subscribe 回流 | 回调 apply 进 collection state | 回调做的是 **`invalidateQueries`** ✗ | `pod-collection.ts:198-211`（onCreate/onUpdate/onDelete 全 invalidate） |
| 读统一 | 全 useLiveQuery | contacts/model-services = live；**chat/inbox/files/favorites = useQuery** ✗ | contacts `ContactListPane.tsx:66`、ms `use-model-services.ts:72-74` 用 useLiveQuery；favorites `data/collections.ts:199-235` 用 useQuery+fetch |
| subscribe 全接 | 每模块接 | chat/files/contacts/symphony 接；**favorites/inbox/model-services 没接** | `pod-collections-bootstrap.tsx:75/87/99` + contacts `ContactListPane.tsx:42`；favorites/inbox/ms 无 subscribeToPod 调用 |

### 1.2 根因（比"换个 hook"深一层）

`createPodCollection` 用 **`queryCollectionOptions`**（query-based sync：state 由 `queryFn`=`db.select().execute()` 填，靠 `queryKey` 缓存，`pod-collection.ts:125-131`）。`subscribeToPod` 的 `db.subscribe` 回调里只做 `queryClient.invalidateQueries({ queryKey })`（`:202/206/210`）——即**把 live sync 退化成"事件触发的 polling"**：每次 db 变更 → invalidate → useQuery 重跑 `fetchRows` 全表 select。

后果：
- 远程批量同步 N 条 = N 次 invalidate = **N 次全表 refetch**（灾难路径，见 §4）。
- useQuery 读者**享受不到乐观**：collection.insert 虽让 collection state 乐观变，但 useQuery 不订阅 collection state，真正刷新靠手动 invalidate（favorites `onStarredChange` 自己写的 `:159/168`）。即 web 手动写的乐观是**浪费的**。
- useLiveQuery 读者（contacts/ms）靠 collection state 变刷新，但 subscribe 回调不写 state、只 invalidate → **远程变更对 live 读者无效**（live 不认 queryKey invalidation），目前 contacts/ms 的远程回流其实也是断的，只是本地写碰巧走 mutation 能乐观见。

**layer (b) 每次 IO 体积（与回流方式正交）**：上述"全表 refetch"的"全表"是**真全表**——`fetchRows` 的 queryFn = `db.select().from(resource)` **无 where/limit**（`pod-collection.ts:76-91`，`columns` 仅限列投影不限行）+ eager syncMode，故 createPodCollection 把**整张表所有行**拉进 collection，每次 refetch 读全表行。即 collection 被当 **db 全表镜像**用，违背其"本地子集缓存"设计（应配合 on-demand + where/loadSubset 只持视口子集）。后果：本地写后 refetch 全表 = 写一次读一次全表，collection 本地缓存对"写后读"未起到免 db 读作用（实测见 §3.5：现状单次读峰值 201 行，子集化封顶 10 行、读体积 -74%）。

### 1.3 starred-sync 只是症状

models 的 `db.insert` 绕过 collection，是"写轴不统一"的一个表现；但即便把它接上，只要读法/subscribe 范式不改，问题不解决。故**不应**把这块当作"换个 hook"的小活（前序 backlog 的轻描淡写是错的）。

### 1.4 读法不是"全 live"，是混合（按数据位置选）

"统一范式"≠"所有读都用 live"。读法按**要的数据在不在本地 reactive 子集**分：

| 要的数据 | 读法 | 理由 | 锚点 |
| --- | --- | --- | --- |
| 已同步本地的视图（列表/排序/本地 search） | **live** | state 在本地，reactive 免费 | contacts `useLiveQuery(from contact)` 全量 + `useMemo` 本地 filter（`ContactListPane.tsx:66-80`） |
| 本地子集内的过滤搜索 | **live + where**（reactive 过滤视图）或 live 全量 + 本地 filter | 框架支持带 where 的 live query；小集合全量+本地 filter 亦可 | contacts 用全量+本地 filter；where 形态为框架能力【本仓未用 where】 |
| 未加载到本地的数据 / 远程全文检索 / 分页拉未订阅子集 / 跨源聚合 | **query**（或 live + loadSubset 按需加载视口） | 本地 state 没有，live 查不到，必须 queryFn 去远程查 / loadSubset 拉视口 | favorites search 现状是 useQuery fetch 全量+本地 filter，**隐含全量在本地** |

故 search 用不用 query 取决于集合大小/加载策略：小集合全量在本地 → search = live（全量+本地 filter 或 where），**不用 query**；大集合按需加载/远程全文检索 → search 必须 query 或 loadSubset。favorites 现卡在这个隐含假设：useQuery fetch 全量再本地 filter（`favorites/data/collections.ts:210-229`），既不 reactive 又每次 search 重 fetch 全量，两头不讨好。正确形态二选一：live 全量+本地 filter（小集合）或 query 远程 search+loadSubset（大集合）。

> 超大集合下 §3 的"全 live"假设不成立：live 只覆盖"当前视口子集"，视口外靠 loadSubset/query。完整模型 = **live 管 reactive 视口子集 + query 管远程/临时查询 + loadSubset 管视口加载**，三者按数据位置配合。

## 2. 目标技术形态

把 `queryCollectionOptions` + "subscribe→invalidate 补丁" 替换为 **drizzle-solid live sync 实现**，喂 TanStack DB 的 ChangeMessage 流：

```
本地写：  UI → collection.insert/update/delete (optimistic mutation)
                → onInsert/onUpdate/onDelete → db.insert/update/delete (ORM 持久化)
                → 乐观层立即可见 (live query 读叠加态)
回流：    db 变更(本地+远程) → db.subscribe onCreate/onUpdate/onDelete
                → 转 ChangeMessage → collection writeUpsert/writeDelete (immediate, 进 syncedData)
                → live query 读叠加态更新
读：      useLiveQuery(collection) → 读 optimistic + syncedData 叠加态
```

**统一原语（P2 撤销，manual-sync.js 已查）**：`collection.utils.writeInsert/writeUpdate/writeDelete/writeUpsert/writeBatch` **是公共原语**（挂 `collection.utils`，`query.js:7-17,915`；d.ts 里 utils 为泛型 `TUtils` 未列具体方法，故静态 grep 顶层漏判，运行时可用）。业务已在用：`direct-chat-records.ts:332-337`、`chat/data/collections.ts:457/621/639/649` 调 `utils.writeUpsert`，`chat/data/collections.ts:892`、`contacts/data/collections.ts:193` 调 `utils.writeDelete`。**故无需 custom `config.sync`**——保留 `queryCollectionOptions`，两处改用 utils 原语：
- 本地确认：onInsert/onUpdate/onDelete 在 `db.insert/update/delete` 成功后调 `utils.writeUpsert(confirmedRow)`/`utils.writeDelete(key)` 把确认值写进 syncedData，并 `return { refetch: false }` 关掉 wrappedOnXxx 的默认全表 refetch（`query.js:891-914`）。
- 远程回流：subscribe 回调 onCreate/onUpdate 调 `utils.writeUpsert(row)`、onDelete 调 `utils.writeDelete(key)`，**替代** `invalidateQueries`（`pod-collection.ts:202`）。
两路共用同一原语，refetch 退场。远程批量用 `utils.writeBatch` 一次 commit（见 §2.3 约束）。

**P1 已查**：表级 subscribe 的 `onCreate/onUpdate` 回调签名为 `(activity: Activity)`，`activity.object` 为标识（`ActivityObject`/string，`notifications/types.d.ts:30-54`），**不含完整 row**；仅实体级订阅 `onUpdate:(data:TData)` 带 row（`:222`）但不适用集合。故远程 onCreate/onUpdate = **通知 + 点查单行 row** 再 `utils.writeUpsert`，onDelete = 按 key `utils.writeDelete`。点查单行，量级低于现状全表 refetch。

### 2.3 manual-sync 语义与约束（`manual-sync.js` 已查）

- `performWriteOperations` 用 `ctx.begin({ immediate: true })` 同步写进 `syncedData`（不进乐观层），`commit` 后 `:111-116` 把 `syncedData.values()` **全量回写** query cache（`updateCacheData` 或 `setQueryData`）——内存拷贝、非 db IO，故对 useQuery 与 useLiveQuery 读者**都**生效；大集合下每次 writeXxx 一次全量 syncedData 拷贝，成本远低于 refetch 但非零，批量回流应用 `writeBatch` 摊到一次。
- `writeUpdate`/`writeDelete` 要求 `syncedData.has(key)`，否则抛 `UpdateOperationItemNotFoundError`/`DeleteOperationItemNotFoundError`（`:38-46`）。远程 onDelete/update 一条本地未缓存的行会抛——回流须 try/catch 或先 `has` 检查，或统一用 `writeUpsert`（不存在当 insert）。
- `writeBatch(callback)` 的 callback **必须同步**（`:197-203` async 抛错）。远程"通知+点查 row"是 async，不能放进 writeBatch callback；批量须在所有点查 resolve 后同步调 writeBatch，或每条单独 writeUpsert。
- origin 追踪：`performWriteOperations` 不设 `rowOrigins`，manual write 进的行 origin 默认非 local。本地写路径因 mutation 乐观层标 local、resolve 后框架据 `pendingLocalChanges` 定 confirmed origin，与 writeUpsert 回填叠加时值相同故显示无碍；**但 live sync 上线后**远程回流 writeUpsert 与本地未确认写的去重依赖 origin 正确，须 xpod 验"本地写不被远程旧值覆盖"。
- **真实 db id 格式 + 规范化链**：writeUpsert 回填行的 id 须与 `getKey`/fetchRows 行的 id 格式一致（base-relative）。这要求读透 id 规范化链 `ensureId`/`toPersistableInsert`（`pod-collection.ts:50-68,237-251`）/`validateData`/`requireRowResourceId`/`asBaseRelativeResourceId`（`@linx/agent-runtime/pod-resource-identity`），确认回填行经 `validateData+getKey` 后的 key == 乐观层 key == fetchRows key。mock 基准只验 IO 计数、**不验 id 规范化/origin**；故快赢与 live sync 落地须 (i) 补 mock id 转换测试 + (ii) 真 db/seeded xpod 写路径抽验。**仅加 `refetch:false` 而不 writeUpsert 回填 = 乐观层挂死，禁止**。
- **远程去重可测性缺口**：drizzle-solid `test-utils/real-test-helpers` 仅 `ENABLE_REAL_TESTS` 开关，**无远程通知注入钩子**；subscribe 回调只被远程 SSE/WebSub 触发，单 db 实例本地写不触发它。故 live sync 的"远程回流 writeUpsert 与本地未确认写去重"**无法自动化验**，只能真 Pod 双客户端或给 createPodCollection 加测试注入入口。快赢 P8 不动 subscribe（远程仍 refetch），故**不碰此缺口**——这是快赢可作为独立单元先做的理由之一。

⇒ 快赢 P8 在 mock/显示层零阻塞（`$synced`/`$origin` 零业务读取，已查）；真实层正确性（id 格式/origin/乐观叠加）须 xpod 验。live sync 同理。

### 2.1 探针结论（2026-07-22 只读核查）

1. **`activity` 不带 row（已查）**：见 §2 P1 结论——表级 onCreate/onUpdate 通知后点查单行；onDelete 按 key。
2. **manual write 是公共原语（P2 撤销）**：`collection.utils.writeUpsert` 等可用且业务已用；live sync 与本地确认共用，无需 custom `config.sync`（见 §2 统一原语 + §2.3 约束）。
3. **本地写倾向不回环（已查，降级）**：subscribe 走 Solid 远程通知通道（StreamingHTTPChannel2023/WebSub，`notifications-client.js:178/261/304`），本地 `db.insert` 不经该通道 → 倾向不回环；实现仍加 local-origin 去重防御（`rowOrigins`/`pendingLocalChanges`，`state.d.ts:62-69`）。若 seeded xpod 探针发现本地 db 对本地 subscriber emit，则去重为必需而非防御。

### 2.2 本地写 vs 远程写：确认点与"刷新"模型（修正前序混淆）

前序 §2 把"subscribe 回流要 apply 进 state 否则不刷新"混了两类写，此处拆清。**核心：本地写路径从头到尾没有"刷新"动作；subscribe 回流只服务远程写。**

**本地写**（本客户端发起）：
1. `collection.insert/update/delete` → 乐观层（`optimisticUpserts`）→ useLiveQuery **立即见**（终态显示，值已对）。
2. sync 实现的 onInsert/onUpdate/onDelete → ORM 写 db → **resolve = 确认点**（mutation 生命周期内建，框架据此把 optimistic 转正、消化乐观层、`$synced=true`）。
3. 此后即便 subscribe 把本条又推回（本地回环，§2.1-P3 倾向不会），它进 syncedData 只是"乐观转正"，**UI 值不变** → live query 增量 diff 同值不 emit → **不重渲染、不闪烁**。origin 追踪（`rowOrigins`/`pendingLocalChanges`）保证本地写不被远程旧值回退、不被重复"刷新"。

⇒ 本地写的确认 = ORM 写成功（onInsert resolve），**不依赖 subscribe、不依赖 refetch**。useLiveQuery 下本地写靠乐观层即见，subscribe/refetch 带来的 syncedData 更新对 UI 是无感转正。

**远程写**（跨客户端/远程同步）：本地无乐观层，**只能**靠 subscribe 回流把 ChangeMessage commit 进 syncedData，live query 才见。这是 subscribe 回流的唯一职责。

**现状 `invalidateQueries` 是哪来的拐杖**：是 **useQuery 读法**逼的。useQuery 读 queryFn 缓存，collection state 变它不知道，只能 invalidate 逼 queryFn 重拉全表 UI 才动（favorites `onStarredChange` 自写 invalidate，`data/collections.ts:159/168`）。切 useLiveQuery 后本地写靠乐观层即见，**拐杖扔掉**——这也是"统一范式"里本地写不需要 subscribe 参与、不需要刷新的根因。query sync 下因 syncedData 只认 queryFn，本地写后乐观层挂到下次 refetch 才转正，期间 UI 不变（乐观值=确认值），但 useQuery 读者看不到乐观层，故现状必须 invalidate；切 live 后此问题消失。

**对 live sync 实现的含义**：custom `config.sync` 的 commit 通道服务**两条独立路径**，不可混：
- 路径 L（本地写确认）：onInsert/onUpdate/onDelete 的 mutation sync 钩子 resolve 后，框架内建转正（实现一般无需额外写 syncedData；若 query sync 行为是"syncedData 只认 queryFn"，则 custom sync 须在此显式 commit 确认值，避免乐观层挂死——**实现前置验证项**，见 §8 P6）。
- 路径 R（远程回流）：subscribe onCreate/onUpdate/onDelete →（§2.1-P1）点查单行 row → commit ChangeMessage（remote origin）。
两路靠 origin 去重合并；本地写永不因路径 R 而"刷新"。

## 3. 性能模型（双缓冲 + 批量 commit vs N×refetch）

TanStack DB collection state 是双缓冲：`syncedData`（已确认）+ `optimisticUpserts/optimisticDeletes`（乐观），读 = 叠加态（`state.d.ts:44-52`、`get`/`values` 读 virtual derived state `:119-143`）。乐观写只动乐观层 + `recomputeOptimisticState`（`:161`），sync 确认 commit 进 syncedData（`:178`）。

### 3.1 三场景对比

| 场景 | 现状（invalidate 范式） | 目标（live sync 范式） | 胜负 |
| --- | --- | --- | --- |
| 本地单次写 | collection.insert 乐观 + onInsert→db + 手动 invalidate→1 次全表 refetch | collection.insert 乐观 + onInsert→db +（本地写去重后）0 次 refetch | 目标优（省 1 次全表 refetch） |
| 远程批量同步 N 条 | N 次 subscribe 事件 → **N 次 invalidate → N 次全表 refetch** | N 条 ChangeMessage → **1 次批量 commit** 进 syncedData | **目标显著优**（O(N) 全表查询 → O(1) commit） |
| 大列表 + 多 live query 订阅同 collection | useQuery 各 refetch 各的全表；live query 不受益 invalidate | 多 live query 共享同一 collection state，state 变 1 次→所有 live query 增量重算 | 目标优（共享 state，无重复全表读） |

### 3.2 纠正前序假设

- "live 一定比 invalidate 优" —— **不无条件成立**。若 live sync 被**错误实现**成"每条 subscribe 事件触发一次 collection 全量重算/全表 read"，则比 invalidate 更差。
- 正确实现 = subscribe 事件 → **ChangeMessage 增量写**（writeUpsert/writeDelete by key）+ 批量 commit，**不做全表 read/refetch**。在此前提下三场景全胜。
- 故性能好坏的**唯一决定因素**是"回流是否用增量 ChangeMessage 而非全表重算"——这正是 §2 形态要保证的。

### 3.3 边界与已查事实

- **表级 subscribe 不带 row（P1 已确认）**：onCreate/onUpdate 点查单行 row；仍**点查单行**而非全表 refetch，量级低于现状。批量同步可走批量 read 或 truncate+reload 优化。
- subscribe 不带 row 时的点查次数 = 写次数（超高频单条写场景）；但点查单行 vs 现状全表 refetch，量级仍低。

### 3.4 读法混合的性能含义（修正"全 live"）

§1.4 的混合读法直接修正 §3.1 "大列表多 live query" 行的隐含假设（全量在本地）：

- **小集合（全量在本地）**：live 全量 + 本地 filter/where，search 与列表共享同一 collection state，state 变 1 次→所有 live 视图增量重算，无重复全表读。现状 favorites 的 useQuery fetch 全量+本地 filter 在此场景**纯劣**（不 reactive + 每次 search 重 fetch 全量）。
- **大集合（按需加载）**：live 只覆盖视口子集（loadSubset 拉取），视口外数据不在 state；search 命中视口外行必须 query/远程全文检索。此场景 live 的"共享 state"优势限于视口内，视口切换 = loadSubset 增量加载，**仍优于**每次切视口全表 refetch。
- **多 live query 订阅同 collection**：TanStack DB live query 订阅 collection 的 change stream，同 collection 多订阅共享底层 state 变更通知，增量 diff，不各自全表读。

⇒ 性能结论不变（live sync + 增量 commit 在批量同步场景显著优于 N×refetch），但"全 live"应读作"live 覆盖 reactive 子集 + query/loadSubset 覆盖视口外与远程查询"。benchmark（§4）须按集合大小分档测，不能只测"全量在本地"。

### 3.5 实测基准（query-sync 核心范式，集中 17 collection）

`packages/stores/test/query-sync-perf.test.ts` 用真 `createCollection`+`queryCollectionOptions`+真 `QueryClient`、mock 数据源记 IO，集中模拟全 applet collection 集（K=17，messages seed=200，远程注入 20 事件/collection=340 事件），四组对照（断言全过）：

| 组 | totalSelects | totalRowsRead | maxRowsPerSelect | localDelta | remoteDelta |
| --- | --- | --- | --- | --- | --- |
| 现状全表 | 374 | 12325 | 201 | 17 | 340 |
| 快赢全表（refetch:false） | 357 | 11764 | 201 | 0 | 340 |
| 现状子集（SUBSET=10） | 374 | 3161 | 10 | 17 | 340 |
| 快赢子集 | 357 | 3017 | 10 | 0 | 340 |

读法：base=17（preload 每 collection 1 次）；localDelta=本地写触发的 select 数；remoteDelta=远程注入触发的 select 数；maxRowsPerSelect=单次 select 读行峰值。

坐实结论：
- **现状**：本地写每 collection 1 全表 refetch（localDelta=17=K），远程每事件 1 全表 refetch（remoteDelta=340=K×20），单次读峰值 201 行（messages 全表）。
- **快赢单独**：localDelta 17→0（本地写零 refetch，ormWrites 仍=K 持久化不丢）；remoteDelta 不变；读体积略降（省 17 次本地全表 refetch）。
- **子集化单独**：次数不变，但 totalRowsRead 12325→3161（**约 -74%**），maxRowsPerSelect 201→10（每次读封顶 SUBSET）——直接证明 collection 不必持/读全表。
- **快赢+子集**：totalRowsRead 12325→3017（**约 -75.5%**），localDelta=0，maxRowsPerSelect=10。
- **远程次数 340 四组不变**：基准未实现 live sync，远程仍走 invalidate→refetch；live sync 把这 340 次全表/子集 refetch 换成增量 commit，**次数层收益为 live sync 理论值**（§3.1），基准坐实的是"次数放大现状 + 子集化减体积 + 快赢减本地次数"三者正交。

⇒ 完整修复三正交收益被真代码分离坐实：live sync 减远程次数、子集化减每次体积、快赢减本地写次数。

## 4. 性能验证方法（先验后做）

实现前/实现中各跑一次，对比现状 vs 目标。

### 4.1 探针 / benchmark 设计

驱动：seeded xpod（真实 db.subscribe 语义）+ 一个 mock sync 注入器（可控批量大小/频率，隔离网络变量）。指标采集：在 `createPodCollection` 内埋点（debug flag `LINX_POD_COLLECTION_DEBUG` 已存在 `pod-collection.ts:9`，扩展之）统计 `refetch 次数 / commit 次数 / writeUpsert 次数 / UI 更新次数（live query 重算）/ p95 写→可见延迟`。

### 4.2 场景与判定阈值

| 场景 | 注入 | 现状基线指标 | 目标判定（不达即不合并） |
| --- | --- | --- | --- |
| S1 本地单次写 | 1 insert | refetch≥1 | refetch=0；写→可见 ≤ 现状 |
| S2 远程批量 | 一次推 N=100 条 | refetch≈N、N 次全表 select | commit=1（或 ≤ 常数批）、全表 select=0 |
| S3 大列表多订阅 | 列表 1000 行 + 3 个 live query，推 50 条 | 3×refetch 全表 | state 变 1 次、3 live query 增量重算、无全表 read |
| S4 本地写抖动 | 1s 内 50 次 toggle | 50 invalidate 风暴 | 乐观层合并、commit 节流、UI 不卡（p95 帧/更新延迟设阈值，待定） |

阈值具体数值在 benchmark 跑出**现状基线**后据实测设定（不预设拍脑袋数字）；判定逻辑是"目标在 S2/S3 的全表读次数必须降到常数级，且 S1/S4 的可见延迟不劣于现状"。

### 4.3 验证环境

- 单元/集成：mock sync 注入器跑 S1–S4 计数断言（快、CI 可跑）。
- 端到端：seeded xpod 跑真实 subscribe 回流 + 本地乐观，断言"本地写立即可见 + 远程写最终一致 + 无重复行"。
- **不**用真实云 Pod 做性能基线（网络方差大）；云 Pod 只验正确性。

### 4.4 已实现实证（query-sync 核心范式）

`packages/stores/test/query-sync-perf.test.ts`（4 测试全过，纯内存 mock，CI 可跑）已坐实 §3.5 数字，作为回归门禁：断言现状 localDelta=K、remoteDelta=K×N、maxRowsPerSelect>SUBSET；快赢 localDelta=0 且 ormWrites=K；子集化 maxRowsPerSelect<=SUBSET。该基准**不跑** createPodCollection 的 pod 适配层（避开 row.id 校验），测的是同一 query sync 核心范式；pod 适配层为薄包装不改变 IO 计数。远程次数层（live sync）的对比为理论值，待 live sync 实现后补同基准的 live-sync 组。

> 该基准同时是"collections 测试优化"的样板：范式级 IO 断言集中在此一份，各 applet 不再各自 mock db 断言 insert/refetch 次数（见 §5.3）。
>
> **基准能力边界**：该基准**只验 IO 计数**（select 次数/读行数/orm 写），**不验 id 规范化与 origin 去重**——这两者须 mock id 转换测试 + 真 db 抽验覆盖（§2.3），**不可凭此基准判定快赢/live sync 可安全上线**。

### 4.5 快赢 P8 落地与验证（2026-07-22，已实现）

`packages/stores/src/pod-collection.ts` 的 onInsert/onUpdate/onDelete 已加 `utils.writeUpsert`/`writeDelete` 回填 + `return { refetch: false }`，失败安全回退 `return undefined`（wrappedOnXxx 见无 return 即 refetch，回退现状行为）。

**id 对齐的最终论证（buildId 实验，非静态推断）**：`node` 实测 `favoriteResource.buildId` 对纯 uuid **幂等**（`buildId(纯uuid)===纯uuid`）、对自身输出幂等；仅裸 slug 加 `.ttl`。故无论调用方传纯 uuid 或 buildId 产物，`toPersistableInsert`+buildId 组合使 `payload.id == 乐观层 key == syncedData key == db 主键` 全链一致——`writeUpsert(ensured)`/`writeUpsert(modified)` 回填不引入重复行。前序"重复行隐患"担心被此实验消解。

**验证（真 xpod + TS，全过）**：
- 真 xpod integration（vitest alias `@linx/stores/pod-db`→src，无需 build）：favorites 12/12（含新增 `shows a locally inserted row immediately without a refetch and without duplicates`：insert 后不 fetch `toArray` 该行恰 1 条 + `get` 有值 + fetch 后仍 1 条 + delete 后 0 条）、contacts + chat + inbox round-trip 全过 → onUpdate/onDelete 快赢正确、无重复行、本地写立即可见。
- TS：`packages/stores` `tsc -p tsconfig.json` 绿（`collection` 闭包引用无 TDZ 错）；`apps/web tsc` 绿。
- 性能收益：§3.5 mock 基准 localDelta 17→0（本地写零全表 refetch）；该基准不经 createPodCollection，不受本次改动影响，结论不变。

**未做（仍挂起）**：子集化 P7（queryFn where/limit + on-demand + loadSubset，减每次 refetch 读体积，需每 collection 定视口策略）、live sync（消远程次数 340→常数，需 subscribe 回调改 writeUpsert/writeDelete 替 invalidate + 远程去重无自动化钩子）。快赢不动 subscribe，远程写仍 refetch。

### 4.6 子集化 P7 影响面（2026-07-22 已查，不本轮改）

grep 全仓 `useLiveQuery` 非测试调用点：**全量 from、无 where**。
- contacts list `ContactListPane.tsx:66` 全量 from + `useMemo` 本地 filter（name/alias/externalId/note/about 的 `toLowerCase().includes`）——**唯一**"全量 useLiveQuery + 本地 filter"列表。
- contacts detail `useContactDetailController.ts:32-33` 单条语义非列表 filter。
- model-services `use-model-services.ts:72-74` 三全量，量极小（3+3+5 行）无需子集化。
- **chat/favorites/inbox 不用 useLiveQuery**（用 query-based `useChatList`/`useFavoriteList`/`useInboxItems`）。

死结：fetchRows（queryFn）填 syncedData，useLiveQuery 读 syncedData → 给 fetchRows 加 limit 同时砍 contacts useLiveQuery 全量 → 破坏其本地 filter（漏行）。故**子集化不能 collection 级统一加 limit**。contacts list 搜索为模糊匹配，drizzle-solid live query where 大概率不支持 CONTAINS 下推 → contacts 搜索不能下推、只能保持全量。chat/favorites/inbox 全量读在 fetchRows，子集化须 per-collection 改 fetch 策略 + 逐读者评估是否依赖 syncedData 全量。

⇒ 子集化 = 逐 collection 中型重构，非一刀切；快赢后本地写零 refetch，剩 refetch 仅初始 preload + 远程写触发，子集化收益有限。**排在 live sync 之后**，需单独设计。本轮不改（硬改破坏 contacts 全量语义）。

### 4.7 live sync 落地与验证（2026-07-22，create/update 路径已实现）

`packages/stores/src/pod-collection.ts` 的 `subscribeToPod` 回调 onCreate/onUpdate 改为 `resolveActivityRow`（试 `findByIri` 再 `findById`，activity.object 格式未知故两种都试）+ `collection.utils.writeUpsert`；**点查失败或无 row 回退 `invalidateQueries`**（安全网，绝不比改前差）。onDelete 暂留 invalidate（IRI→base-relative id 转换未优化，远程删除仍 refetch，不退步；后续优化）。

**probe 实测纠正静态推断**（`src/test/subscribe-local-probe.integration.test.ts`）：seeded xpod notifications **可用**（SSE 直连），且**本地 db.insert 触发 subscribe onCreate（fired=1）**——与"倾向不触发"的静态推断相反。故本地写既经 onInsert writeUpsert 又经 subscribe 回调 writeUpsert，冗余但 writeUpsert 幂等。

**origin 生命周期读透（非阻塞）**：`@tanstack/db` `state.js` `getRowOrigin` 默认 `"remote"`；commit 时 `origin = pendingLocalChanges.has(key) ? "local" : "remote"`。manual write 与 query-sync refetch 都会经 commit 覆盖 origin，**现状即有此覆盖**（非快赢/live sync 引入），且 `$origin`/`$synced` 业务零读取（grep 非测试零命中）→ **无当前后果**，不作阻塞点。

**收益范围**：接了 `subscribeToPod` 的模块（chat/files/contacts/symphony）本地+远程**创建/更新**零 refetch（点查代替全表 select）；删除仍 refetch。未接 `subscribeToPod` 的模块（favorites/inbox/model-services）不受 live sync 影响，靠快赢 onInsert writeUpsert 本地写零 refetch，远程回流仍断（现状，需后续接线）。

**验证（真 xpod + TS，全过）**：
- `src/live-sync.integration.test.ts` 1/1：subscribeToPod 后本地 insert 经 SSE 绕回触发 subscribe writeUpsert，`toArray` 该行恰 1 份（无重复行）+ `get` 有值 + fetch 后仍 1 份 + delete+fetch 后 0 份。
- contacts + chat collections.integration 回归全过（chat 接 subscribeToPod，本地写未被破坏）。
- TS：`packages/stores` + `apps/web` 均绿。

**未做（仍挂起）**：子集化 P7（§4.6，逐 collection 重构）、live sync onDelete 的 IRI→id 优化、live sync 本地写去重（省冗余点查+writeUpsert，需应用层 pending-writes Set）、未接 subscribeToPod 模块的接线。

## 5. 统一验证策略（测试不每模块一套）

### 5.1 范式契约测试下沉到 `createPodCollection`

在 `packages/stores` 写**一份参数化契约测试** `pod-collection.paradigm.test.ts`，用 in-memory/seeded db，断言四轴对所有 `createPodCollection` 实例成立：
1. 本地 `collection.insert` 后 live 读立即可见（乐观）；
2. onInsert 触发 db 持久化（ORM）；
3. db 变更经 live sync 回流进 syncedData、live 读更新、**不**依赖 invalidate；
4. 远程批量变更 → 常数级 commit、**非** N 次 refetch（计数断言）；
5. `rowOrigins` local/remote 正确、本地写不被 subscribe 回环双写。

**跑一次覆盖全部用 createPodCollection 的模块**——这是范式正确性的唯一权威测试。

### 5.2 各 applet 只留薄接线测试

每模块 arch/接线测试只断言"**我接对了**"，不重复验范式：
- 该模块的读用 `useLiveQuery`（grep 断言，禁 `useQuery(...fetch...)` 读 collection 的模式）；
- 该模块接了 `subscribeToPod`（或在 bootstrap 统一接）；
- 该模块的写走 collection mutation，不直接 `db.insert` 业务表。

### 5.3 现有 collections 测试优化 / 冗余清单

把各模块"mock db + 断言 insert/delete 被调用"的**范式级**测试下沉/删除（已被 §5.1 覆盖），模块测试只留**业务意图**端到端断言。初步冗余清单（待逐条核对后删/改）：
- favorites：`onStarredChange` 的 insert/delete 调用断言 → 改为"starred 切换后 favorite 行出现/消失"的意图断言（范式部分归 §5.1）。
- 各模块 `collections.*.test.ts` 中重复的"createPodCollection 写穿 db"断言 → 归 §5.1，模块侧删。
- 保留：starred 切换→snapshot 字段正确、secretary 保护、sourceModule 归类等**业务**断言。

> 优化原则：模块测试问"业务对不对"，契约测试问"范式对不对"，不交叉。

## 6. 迁移路线（性能验证为门槛）

1. **基础设施**：在 `createPodCollection` 实现 drizzle-solid live sync（替换 queryCollectionOptions 的 invalidate 补丁）+ §5.1 契约测试 + §4 benchmark。**门槛**：§4 四场景判定通过，否则不往下。
2. **逐模块切读法**：useQuery+fetch → useLiveQuery；删该模块的手动 invalidate 兜底；接 subscribeToPod（未接的 favorites/inbox/ms）。每模块 xpod 验本地乐观 + 远程回流。**读法切换与 subscribe 回流必须同模块同批**（否则远程变更对 live 读者断流，见 §1.2 陷阱）。
3. **写轴统一**：模块自身写已走 collection，确认无 `db.insert` 业务表残留。
4. **models starred-sync**（外部包 `@undefineds.co/models`，本仓改不了其 `db.insert`）：两条路二选一，单独处理——(a) models 暴露 collection 写入口 / 改 hook 写 collection；(b) web 不挂 models hook、保留手动 `onStarredChange` 但**其内部改走新范式**（collection mutation，不再自己 invalidate，靠 live sync 回流）。files 因 snapshotMeta 含 UI 上下文（`treeNodeId`，`useFilesTreePaneController.ts:62`）本就只能走手动，归 (b)。

## 7. 不做 / 暂缓

- 不在性能验证通过前改任何 applet 读法或 subscribe 回调（避免改出远程回流断流 / 批量同步卡顿）。
- 不把 models starred-sync 当"换 hook"小活并入对齐 backlog——它是本专项第 4 步，且卡外部包。
- 不为每个 applet 新建范式测试（违反 §5，是本次要避免的反模式）。

## 8. 待确认探针清单（实现前置）

| # | 探针 | 来源 | 状态 / 影响 |
| --- | --- | --- | --- |
| P1 | subscribe `activity` 是否带完整 row | `notifications/types.d.ts:30-54,127-131,222` | **已查**：表级不带 row→通知+点查；实体级 onUpdate 带 row 但不适用集合 |
| P2 | manual write ops 是否公共 API | `collection/index.d.ts`+`sync.d.ts`（零命中） | **已查**：非公共→live sync 须实现为 `config.sync`；其 commit 接口=实现前置读项（见 P5） |
| P3 | `db.subscribe` 对本地写是否触发（回环） | `notifications-client.js:178/261/304` | **已查倾向不回环**（远程通知通道）；防御去重，xpod 探针可升为必需 |
| P4 | 现状各场景 refetch 基线实测 | §4 benchmark | **待做**：定 §4.2 阈值，非拍脑袋 |
| P5 | ~~custom config.sync 挂点~~ **撤销** | `manual-sync.js` + 业务 utils.writeUpsert 用法 | 不需要 custom config.sync；live sync 与本地确认共用 `collection.utils.writeUpsert/writeDelete`（§2 统一原语）。保留 queryCollectionOptions，改 onInsert/subscribe 回调即可 |
| P6 | 本地写确认值进 syncedData 的方式 | `manual-sync.js:49-117` + `query.js:891-914` | **已解**：onInsert 内 db 写成功后显式 `utils.writeUpsert(confirmedRow)` + `return {refetch:false}`，即把确认值写进 syncedData（immediate），不依赖 query sync 内建、不 refetch；乐观层与 syncedData 同值，mutation resolve 后无缝 |
| P7 | 子集化（on-demand + where/loadSubset）作为与 live sync 正交的必修项 | `pod-collection.ts:76-91` fetchRows 无 where/limit | **必修**：queryFn 全表拉取把 collection 当 db 全表镜像；须改子集化，否则即便 live sync 也每次 commit 全表体积（§3.5 实测子集化 -74% 读体积） |
| P8 | 快赢 = onInsert/Update/Delete：db 写 + `utils.writeUpsert` 回填 + `return {refetch:false}` | 同 P8 源 + id 规范化链 `pod-collection.ts:50-68,237-251` + `pod-resource-identity` | **显示层零阻塞**（`$synced/$origin` 零业务读取）。**但非单行改动**：仅加 `refetch:false` 会使 syncedData 无确认值、乐观层挂死；须 writeUpsert 回填，而回填行 id 格式须与 syncedData/乐观层 key 一致 → 须读透 id 规范化链 + mock id 转换测试 + 真 db 抽验。本地写路径 mock 可验；id 真实格式靠规范化链代码论证 + 现状 refetch 正常工作背书 + 真 db 抽验。**落地为工程单元，非顺手改**。快赢不动 subscribe，故不碰远程去重可测性缺口（§2.3） |

---

*生成方式：只读核查 `packages/stores/src/pod-collection.ts`、`@tanstack/db` 的 `collection/state.d.ts`+`index.d.ts`、`@undefineds.co/drizzle-solid` 的 `pod.d.ts`+`pod-database.d.ts`、各 applet 读法与 subscribe 接入点、models `starred-sync.js`。未改任何文件。*
## Live Query 统一契约与 benchmark

Web 端允许两种 TanStack DB 用法：

- `useLiveQuery(collection)`：读取完整 collection。
- `useLiveQuery((q) => q.from(...))`：通过 query builder 投影、过滤或关联。

两种形式都由 `useLiveQuery` 启动同步。业务模块不得在首次挂载时再调用
`startSyncImmediate()` 或 `fetch()`；用户主动重试可以调用 `fetch()`。

集中回归与 benchmark 位于
`apps/web/src/lib/data/live-query-contract.test.tsx`，运行：

```bash
yarn workspace @linx/web benchmark:live-query
```

指标定义：

- `selects`：底层 hydration 查询次数，是稳定回归门禁。
- `rowsRead`：底层读取总行数，是 IO 放大门禁。
- `readyMs`：本机观测延迟，只用于趋势观察，不作为固定时延断言。
- 乐观更新必须让两种 Live Query 同步看到新值，且 `selects` 不增加。

2026-07-27，1,000 行本地基准：

| 路径 | selects | rowsRead | 结果 |
| --- | ---: | ---: | --- |
| Live Query-only | 1 | 1,000 | 当前实现 |
| Live Query + mount fetch | 2 | 2,000 | 历史重复 hydration |

当前实现相对历史路径减少 50% 查询次数和 50% 读取行数。`readyMs` 受机器和
调度影响，每次运行直接输出当次数据。

## 2026-08-01: P7 bounded working set implemented

Sections 4.6 and the historical matrix above describe the state before this
implementation. P7 is now implemented for Favorites, Inbox, Contacts, and
Symphony through `createPodCollection({ window })`:

- the active page retains 100 rows and uses a stable primary sort plus `id ASC`;
- cursor pagination replaces offset pagination;
- at most three settled pages remain resident;
- local and subscribed create/update/delete events reorder the active page and
  perform one boundary backfill when membership changes;
- resolved remote bursts commit through one TanStack synced-state `writeBatch`;
- Contacts non-empty search uses a separate remote query and does not pollute the
  primary resident window.

The 1,000/10,000-row centralized benchmark enforces `maxRowsPerSelect <= 101`
and `residentRows <= 300`. A real private xpod integration run with 105 contacts
retained the Top 100 and paged the remainder. Because xpod currently caps one
physical SELECT response at about 51 subjects, the first logical page uses two
physical requests.

Stable cursor execution depends on two upstream capabilities:

- drizzle-solid `whereCursor()` permits only a sort predicate plus an `id/@id`
  range tie-breaker; ordinary public `where()` remains unable to filter by id;
- xpod compiles composite cursor OR filters into embedded Union branches so the
  direct-SPARQL path does not fall back to a cold Comunica engine.

Chat, Profile singletons, intentionally small Model Services registries, and raw
Files LDP/container queries are explicit non-goals of this P7 rollout.
