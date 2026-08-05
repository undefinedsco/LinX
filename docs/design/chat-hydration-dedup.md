# Chat 行水化去重 Spec（hydrateChatRows N+1）

- Status: Implemented（2026-08-05）；浏览器 CDP 请求计数仍是发布验证项

## 实现证据

- `chat-hydration-cache.test.ts` 覆盖并发去重、重复命中、失败驱逐、LRU 与显式失效。
- chat 资源通知与本地 chat mutation 均在投影前失效 canonical IRI；缓存容量固定为 256。
- 尚未把“稳定列表重复 refetch 为 0 GET”写成已完成结论，需在已登录浏览器会话中做 CDP 验收。
- 来源：乐观更新+水化审计 F11（`docs/pod-subscription-budget-design.md` §3）

## 1. 问题实证

- `hydrateChatRows` 对**每个 chat 行**执行一次 `GET <chat-url>` 拉参与者（`apps/web/src/modules/chat/data/collections.ts:483-534`）
- 挂在 `chatCollection.transformRows`（1116-1119），每次 chat 集合 refetch 全量触发
- `createAIChat` 失效整个 `['chats']`（1338）→ 全量 refetch → **重复水化所有既有 chat**（每聊一轮 = N 个额外 GET）
- 单测 `chat-collections.test.ts:296` 明确记录当前行为是"始终重取"

## 2. 目标与非目标

**目标**
- 每个 chat 文档只水化一次（内容未变时）；参与者变化能被正确刷新
- `createAIChat` 后只水化新 chat，不重拉全部

**非目标**
- 不改变参与者读取语义（参与者和 memberRoles 仍从 chat 文档读取；ACL/ACR 是资源权限，不与参与者字段混称）
- 不引入跨会话持久化（内存级缓存即可；持久化归 F12 spec）

## 3. 方案

### 3.1 按 scope + canonical IRI 的水化缓存

```ts
const chatHydrationCache = new Map<string, {
  participants: ChatParticipant[]
  metadata?: ChatRow['metadata']
  etag?: string
}>()
```

- cache key 使用 `scopeKey + canonical chat resource IRI`，不能只用短 `chatId`；切换账号、Pod 或 db generation 后不得复用旧项。
- 水化前查缓存：命中且 Pod 订阅/失效流未标记该 chat 变更 → 直接用。
- 失效来源：
  - chat 文档的 Pod 通知（Update 该 chat IRI）→ 在 `transformRows([row])` 前清该 IRI 缓存项。
  - 显式修改 chat participants/memberRoles 的 mutation → 清对应 IRI；ACL/ACR 修改不应无条件清参与者缓存。
  - db/scope rebind → 释放整个旧 scope 缓存。
  - 无可靠通知时可选择 ETag 条件 GET；这只能减少 body/解析，不能同时承诺“零网络”。
- `createAIChat` 后新 chat 不在缓存 → 只水化新增行；既有行命中缓存跳过

### 3.2 批量短路

`hydrateChatRows` 先对 rows 做缓存分区：`hydrated`（直接填）vs `pending`（才发 GET），pending 为空时零网络。

## 4. 落地顺序

1. scope-aware 缓存 + 按 canonical IRI 失效 API + 容量上限（LRU）单测；不允许模块级 Map 无限增长。
2. `hydrateChatRows` 接入 + 更新 `chat-collections.test.ts:296` 的行为断言（从"始终重取"改为"缓存命中跳过、失效后重取"）
3. 失效接线：chat IRI 的 Pod 通知、chat metadata mutation、db rebind；每条路径有契约测试。
4. 验证：e2e 连续创建两个 chat 并重复打开列表，CDP 统计 chat 文档 GET：稳定列表重复 refetch 为 0，新增 chat 只增加 1；无通知 fallback 模式单独报告条件 GET 数量。

## 5. 风险与回退

- **参与者陈旧**：缓存失效漏接会显示旧参与者；有活跃订阅时由 chat IRI 通知失效，无订阅时进入页面做一次条件 revalidate，不能把无限陈旧定义为可接受。
- **跨账号污染**：scopeKey 必须包含稳定的 Pod/database identity，退出或切换时整 scope 释放。
- **回退**：缓存层在 `hydrateChatRows` 内部，删 Map 即恢复原行为

## 6. 关联

- 协同：F12 未来可复用统一快照基础设施，但本 spec 不把 chat hydration Map 自动持久化。
- 依赖：无；F10 处理 thread/message，不会缩小 chatCollection 的水化触发面
