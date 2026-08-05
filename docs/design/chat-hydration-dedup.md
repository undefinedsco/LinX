# Chat 行水化去重 Spec（hydrateChatRows N+1）

- Status: Proposal（2026-08-05）
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
- 不改变参与者读取语义（仍从 chat 文档读 ACL/参与者）
- 不引入跨会话持久化（内存级缓存即可；持久化归 F12 spec）

## 3. 方案

### 3.1 按 chat id 的水化缓存

```ts
const chatHydrationCache = new Map<string, { participants: ChatParticipant[]; etag?: string }>()
```

- 水化前查缓存：命中且 Pod 订阅/失效流未标记该 chat 变更 → 直接用
- 失效来源：
  - chat 文档的 Pod 通知（Update 该 chat IRI）→ 清该 id 缓存项
  - 显式失效（ACL 变更等 mutation 站点）→ 清对应 id
  - 兜底：带 ETag 的条件 GET（CSS 支持），304 用缓存——网络往返保留但 body/解析成本归零
- `createAIChat` 后新 chat 不在缓存 → 只水化新增行；既有行命中缓存跳过

### 3.2 批量短路

`hydrateChatRows` 先对 rows 做缓存分区：`hydrated`（直接填）vs `pending`（才发 GET），pending 为空时零网络。

## 4. 落地顺序

1. 缓存 Map + 按 id 失效 API + 单测（命中/失效/304）
2. `hydrateChatRows` 接入 + 更新 `chat-collections.test.ts:296` 的行为断言（从"始终重取"改为"缓存命中跳过、失效后重取"）
3. 失效接线：chat IRI 的 Pod 通知 → 清缓存（在集合订阅回调处）
4. 验证：e2e 连续两轮 AI 聊天，CDP 统计 chat 文档 GET 计数（第二轮应 ≈ 1 而非 N+1）

## 5. 风险与回退

- **参与者陈旧**：缓存失效漏接 → ACL 变更后 UI 显示旧参与者；ETag 条件 GET 兜底使陈旧窗口只存在于"无订阅且无失效"场景（集合被卸载后变更），可接受
- **回退**：缓存层在 `hydrateChatRows` 内部，删 Map 即恢复原行为

## 6. 关联

- 协同：F10（参数化后 refetch 范围收窄，水化触发面同步变小）；F12（持久化后缓存可跨会话）
- 依赖：无
