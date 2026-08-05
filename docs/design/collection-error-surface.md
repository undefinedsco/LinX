# 集合错误透出 Spec（Pod 不可达不渲染空列表）

- Status: Proposal（2026-08-05）
- 来源：乐观更新+水化审计 F17（`docs/pod-subscription-budget-design.md` §3）

## 1. 问题实证

- 集合查询抛错时 `useLiveQuery` 降级为空数组且 `status` 停留 ready（`packages/stores/src/pod-collection.ts:163-171`）
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

### 3.1 错误上抛（stores 层）

- `useLiveQuery` 的降级分支不再无条件吞错：queryFn 抛错 → 保持空数据但把 error 记录到 collection 的 `lastError`，status 置 `error`（tanstack db 支持）
- 自动重试语义：tanstack query 的 `retry`（默认 3 次指数退避）已存在于 queryCollection 层，保持；重试耗尽后错误才透出

### 3.2 hook 层透出

逐一移除 `error: null` 硬编码，改为透传 `collection.lastError`（4 个 hook：inbox 1 + chat 3；favorites/contacts 已透或需核对）。

### 3.3 渲染层错误面板

- 抽取 `ContactListPane` 的错误面板为共享组件 `CollectionErrorPane`（错误摘要 + 重试按钮 → `collection.refetch()`）
- 接入：InboxListPane、ChatSidebar、ThreadList、MessageList、FavoritesPane
- 空态组件仅在 `status === ready && error == null && rows.length === 0` 时渲染

## 4. 落地顺序

1. `useLiveQuery` 错误透出 + 单测（抛错 → status=error + lastError；重试成功 → 恢复 ready）
2. 4 个 hook 移除 `error: null` + 单测
3. `CollectionErrorPane` 抽取 + 各面板接入（每个面板一个小 PR 粒度）
4. 验证：e2e mock Pod 500 → 各列表显示错误面板而非空态；重试恢复

## 5. 风险与回退

- **错误面噪音**：抖动场景（单次 refetch 失败但有旧数据）不应闪错误面——规则：`data.length > 0` 时保持渲染旧数据 + 静默重试，仅在无数据时显示错误面板
- **回退**：按面板逐个接入，可单独回退

## 6. 关联

- 依赖：无
- 协同：F12（有快照后"Pod 挂了"场景多数被快照掩盖，错误面板成为真正的最后兜底）
