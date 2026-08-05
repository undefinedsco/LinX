# 集合 Refetch 窗口保持 Spec（多页驻留不塌缩）

- Status: Proposal（2026-08-05）
- 来源：乐观更新+水化审计 F9（`docs/pod-subscription-budget-design.md` §3）

## 1. 问题实证

- `fetchRows` refetch 路径把 `residentWindowPages` 重置为 `window.maxResidentPages` 并重截 data（`packages/stores/src/pod-collection.ts:225-238`）
- 后果：用户滚到第 5 页后，任何整表 refetch（远程事件兜底、手动失效）把驻留窗口塌缩回前 N 页；已加载的第 4-5 页从内存消失
- 塌缩后行仍可重取，但滚动位置对应的 DOM 行被移除 → 滚动位置丢失/跳动

## 2. 目标与非目标

**目标**
- 整表 refetch 后，已驻留的页数与行全部保留（数据刷新为最新值），滚动位置不丢
- 窗口淘汰（LRU/maxResidentPages）语义不变，仍只作用于**新加载**的页

**非目标**
- 不做"刷新期间冻结 UI"的乐观保留——refetch 结果是权威，行内容以新数据为准
- 不改变游标语义（nextCursor 重建仍从头拉，这是正确性要求）

## 3. 方案

`fetchRows` 的 refetch 分支按**当前驻留页数**重建而不是重置：

1. refetch 前记录 `previousResidentPages = data.length`（逻辑页数组）
2. 重建循环拉取直到覆盖 `previousResidentPages.length` 个逻辑页（或数据耗尽），而不是停在 `maxResidentPages`
3. 重建完成后按既有规则截断到 `max(previousResidentPages.length, maxResidentPages)`——即 refetch 永不缩减驻留量，只可能因数据变少而缩短
4. `nextCursor` 取重建后最后一页的游标（保证 loadNextPage 连续）
5. 行数变化导致的页边界漂移可接受（逻辑页按 rank 重切，scroll anchor 由渲染层的行 key 稳定性保证——现有 `getRowKey` 已稳定）

## 4. 落地顺序

1. `fetchRows` refetch 分支改造 + 单测：预置 5 页驻留 → refetch → 断言 5 页保留、内容刷新、nextCursor 正确
2. 边界单测：数据变少（第 5 页空了）→ 驻留缩短且 nextCursor 仍合法；maxResidentPages=1 时行为不变
3. 验证：e2e 滚到第 3 页后触发远程事件兜底 refetch，断言滚动位置与行数不丢

## 5. 风险与回退

- **大驻留 refetch 成本**：驻留页多 → refetch 拉取量同比例变大；上限受 `residentWindowHardCap` 约束（已有），风险有界
- **回退**：改动集中在 `fetchRows` 一个分支，单点可还原

## 6. 关联

- 协同：F12（快照语义与驻留窗口一致后恢复更自然）；F16 修复已使整表失效真实发生，本项是其后遗症的正面修复
- 依赖：无
