# 集合 Refetch 窗口保持 Spec（多页驻留不塌缩）

- Status: Implemented（2026-08-05）；浏览器滚动锚点 e2e 仍是发布验证项

## 实现证据

- stores 测试覆盖多页 refetch 后保持 resident page 数、窗口上限、原子替换与失败保留旧窗口。
- 本地真实 xpod 集成覆盖有界首窗口、下一页加载以及远端更新/删除后窗口边界回填。
- DOM scroll anchor 仍需在具体虚拟列表接入点做浏览器验收，不能由数据层测试替代。
- 来源：乐观更新+水化审计 F9（`docs/pod-subscription-budget-design.md` §3）

## 1. 问题实证

- `fetchRows` refetch 路径无条件把 `residentWindowPages` 重建为**一页**（`packages/stores/src/pod-collection.ts:225-238`）
- 后果：用户已加载多页后，任何整表 refetch（远程事件兜底、手动失效）都会塌缩回第一页；后续页从内存消失
- 塌缩后行仍可重取，但滚动位置对应的 DOM 行被移除 → 滚动位置丢失/跳动

## 2. 目标与非目标

**目标**
- 整表 refetch 后，已驻留的页数与行全部保留（数据刷新为最新值），滚动位置不丢
- 窗口淘汰（LRU / `maxResidentPages`）和固定内存预算不变；refetch 不得突破预算

**非目标**
- 不做"刷新期间冻结 UI"的乐观保留——refetch 结果是权威，行内容以新数据为准
- 不改变游标语义（nextCursor 重建仍从头拉，这是正确性要求）

## 3. 方案

`fetchRows` 的 refetch 分支按**当前驻留页数**重建而不是重置：

1. refetch 前记录 `previousResidentPageCount = residentWindowPages.length`，而不是把行数误当页数。
2. 将目标页数夹在 `1...maxResidentPages`；正常情况下原值本来就在该范围内。
3. 从头按现有游标规则重建目标页数，数据提前耗尽时允许页数减少。
4. 重建后仍调用既有 `evictOrderedWindowPages(..., maxResidentPages)`，禁止通过 refetch 扩大常驻集合。
5. `nextCursor` 取重建后最后一页的游标（保证 `loadNextPage` 连续）。
6. 在 `fetchRows` 的局部变量中完整重建所有目标页，成功后一次性返回扁平 rows，由 query collection 完成单次替换；不要在 queryFn 内另写 collection。任一页失败则整个 queryFn 抛错，现有 collection 数据保持不变。
7. 行数变化导致的页边界漂移可接受；渲染层仍需用稳定 row id 做 scroll anchor，e2e 必须验证而不能仅凭 `getRowKey` 推断。

## 4. 落地顺序

1. `fetchRows` refetch 分支改造 + 单测：`maxResidentPages=5` 且预置 5 页 → refetch → 断言 5 页保留、内容刷新、nextCursor 正确。
2. 边界单测：数据变少（第 5 页空了）→ 驻留缩短且 nextCursor 合法；`maxResidentPages=1` 行为不变；原驻留页数不得超过预算。
3. 失败原子性单测：重建第 N 页失败时旧页仍在 collection，错误可观察。
4. 验证：e2e 滚到第 3 页后触发远程事件兜底 refetch，断言滚动位置与行数不丢。

## 5. 风险与回退

- **大驻留 refetch 成本**：驻留页多 → refetch 拉取量同比例变大；唯一现有上限是 `maxResidentPages`，不得引用不存在的 `residentWindowHardCap`。
- **回退**：改动集中在 `fetchRows` 一个分支，单点可还原

## 6. 关联

- 协同：F12（快照语义与驻留窗口一致后恢复更自然）；F16 修复已使整表失效真实发生，本项是其后遗症的正面修复
- 依赖：无
