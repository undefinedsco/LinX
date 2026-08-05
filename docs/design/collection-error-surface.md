# 集合错误透出 Spec（Pod 不可达不渲染空列表）

- Status: Implemented（2026-08-05）；真实私有 Pod 断网恢复 e2e 仍是发布验证项

## 实现证据

- `live-query-contract.test.tsx` 证明 adapter 从公开 `collection.utils.lastError` 读取并响应 QueryCache 变化。
- Chat、Inbox、Favorites 在无缓存时显示可重试错误；有缓存时保留内容并显示非阻断 stale 提示。
- ChatContent 已聚合 chat/thread/database 错误；文件来源查询继续向调用方透出 message/thread 错误，不再伪装为空。
- 来源：乐观更新+水化审计 F17（`docs/pod-subscription-budget-design.md` §3）

## 1. 问题实证

- `createPodCollection` 对普通查询异常会重新抛出，但验证发现 `useLiveQuery` 只观察 collection 行状态，不会把 Query Collection observer 的查询异常映射到自身 `isError/error`。
- `@tanstack/query-db-collection` 已在公共 `collection.utils.lastError/isError` 中维护 observer 错误；缺口是 React 层没有订阅 QueryCache 后读取这组状态。
- hook 层随后把 `error` 硬编码为 `null`：`useInboxList`（inbox collections.ts:505）、`useChatList`/`useThreadList`/`useMessageList`（chat collections.ts:2072/2089/2126）
- 后果：Pod 挂了 / 401 / 网络断 → 所有列表渲染"空状态"（"暂无数据"），用户无法区分"真空"和"加载失败"
- 正面参照：`ContactListPane.tsx:43-53` 已实现错误面板（`useContactsData` 唯一没吞 error 的 hook）——本 spec 是把这个模式推广到全部集合 hook

## 2. 目标与非目标

**目标**
- 所有集合 hook 透出真实 `error`；列表渲染层对错误态显示错误面板（重试按钮）
- 空数据与加载失败在 UI 上严格可区分

**非目标**
- 不做全局断网横幅/重连编排（独立议题）
- 不改变乐观更新的降级行为（reconcile 失败的 `{refetch:true}` 保留，那是数据正确性兜底）

## 3. 方案

### 3.1 复用 Query Collection 公共错误语义

- 不新增平行错误状态；使用依赖公开的 `collection.utils.lastError/isError/clearError/refetch`。
- `useCollectionQueryError` 订阅 QueryCache 事件并读取 collection utils；业务 hook 合并该状态与 `useLiveQuery` 行数据。
- `isUnsupportedDocumentCollectionRead` 的显式空数组兼容分支保持不变；它表示已知的不支持读取，不应伪装成网络错误。
- 自动重试遵循项目 `QueryClient` 当前配置 `retry: 1`，不在本 spec 内改为其他次数。

### 3.2 hook 层透出

逐一移除 `error: null` 硬编码，直接透传对应 `useLiveQuery` 的错误：

- Chat 单集合 hook：透传 `query.error`。
- Inbox 聚合 hook：从四个查询中选取首个非空错误，同时保留聚合 `isError`。
- `useThreadIndex` 同样纳入，避免后台索引路径继续吞错。
- Favorites/Contacts 先以契约测试核对，不在没有证据时修改。

### 3.3 渲染层错误面板

- 抽取纯 UI `CollectionErrorPane`（错误摘要 + 重试命令）；组件不得直接依赖 collection，业务面板传入 `onRetry`。
- 接入：InboxListPane、ChatSidebar、ThreadList、MessageList、FavoritesPane
- 无缓存数据且 `isError` 时显示错误面；有缓存数据且后台刷新失败时保留内容，并显示非阻塞的 stale/error 提示。
- 空态仅在非 loading、非 error 且 rows 为空时渲染，不绑定未经验证的 `status === ready` 字符串。

## 4. 落地顺序

1. 契约测试已证明 raw `useLiveQuery` 不透出 Query Collection 查询错误，并锁定 adapter 合并后的行为。
2. Chat/Inbox hook 移除 `error: null`，补充聚合错误和旧数据保留单测。
3. `CollectionErrorPane` 抽取 + 各面板接入（每个面板一个小 PR 粒度）。
4. 使用自举 xpod 的真实 Pod 集成测试制造 500/不可达，再做 UI e2e：错误面板不是空态，重试后恢复；不能只用 mock 证明 Pod 错误链路。

## 5. 风险与回退

- **错误面噪音**：抖动场景（单次 refetch 失败但有旧数据）不应闪错误面——规则：`data.length > 0` 时保持渲染旧数据 + 静默重试，仅在无数据时显示错误面板
- **回退**：按面板逐个接入，可单独回退

## 6. 关联

- 依赖：无
- 协同：F12（有快照后"Pod 挂了"场景多数被快照掩盖，错误面板成为真正的最后兜底）
