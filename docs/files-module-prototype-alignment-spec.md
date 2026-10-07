# Files 模块：生产实现 × 原型差异与对齐 Spec

- Status: Locally implemented and verified (2026-07-19; private-cloud and desktop-shell verification pending)
- Date: 2026-07-18
- 审查对象：`apps/web/src/modules/files`（含当前工作区未提交改动）× `apps/prototype`（本轮重构后）
- 基准：DESIGN.md、`docs/frontend-interaction-review.html`、`docs/product-design-walkthrough.html`
- 用途：确定生产 files 的对齐 backlog；同时列出**生产已优于原型、应保留并讨论是否回流原型**的部分

> 说明：§1 是 2026-07-18 的差异基线，保留用于追溯；当前实现状态以 §7 的回填表和验证结果为准。

## 0. 一句话结论

生产 files 的**数据面与交互深度已经强于原型**（懒加载 explorer、结构化表格全家桶、编辑器会话链、Access 申请流、Kanban/Whiteboard 投影）；原型的领先集中在**产品叙事与状态契约**（back+路径、actionable 空态、preview-first、键盘 roving、ns 开关接线、术语不外露）。对齐工作的主体是"把原型的壳层契约接到生产已有的强模型上"，而不是反向搬功能。

## 1. 分层差异总表

| 层 | 原型现状 | 生产现状 | 判定 |
|---|---|---|---|
| 壳层 | rail + list（可拖 232–480px）+ workspace（+ meta 侧栏） | rail + list（ResizablePanel，default 240 / 200–320）+ main（+ drawer） | 同构 ✓；生产 panel 语义注意 px vs 百分比 |
| 树 | 内联可展开树（静态样本，交互完整：展开/键盘/搜索/多选/行操作） | 内联 explorer 树（真实懒加载、metadata 警示、搜索保留祖先链） | **生产模型更强**；契约需改写（见 §4.1） |
| back + 路径 | tree head 有 back + 当前路径 | `canGoBack:false`、`goBackFolder` noop、`currentPathLabel` 不渲染 | 原型领先 → P0 |
| 文件夹视图 | Table（排序列）/ Grid（Finder 无框磁贴） | list / icons / columns 三视图 | 互补，见 §3.6 讨论 |
| 文件预览 | 单击直接打开只读正文（doc 渲染/jsonl 代码/图片/ttl 文本） | 可编辑文件=摘要卡+「打开」跳转；raw text 全文 | 原型 preview-first 更彻底 → P0 |
| 空态 | EmptyState（icon+描述+action）贯穿 | `FilesEmptyState` 无 action；folder/detail 纯描述 | 原型领先 → P0 |
| 空 .ttl | 引导流：无 class → 新建 class（菜单内联）→ 空表格 → +Subject | class 菜单有新建输入，无空资源引导态 | 原型领先 → P1 |
| 结构化表格 | 静态演示（类型化单元格、+Predicate、+Subject、列宽） | TanStack Table、pinned subject、existing-first、视图保存指示、pending 工作流 | **生产更强**，见 §2.2 |
| 编辑器 | 演示版（tiptap + info 面板 + more 菜单） | 会话安全链（共享 dirty/discard/blur 保存/冲突文案/状态徽标） | **生产更强**，见 §2.1 |
| 键盘 | 树 roving（选中+焦点同步、←→折叠、Enter 打开） | 无 roving（全行 tabIndex=0）、上下只改选中不移焦点 | 原型领先 → P1 |
| ns 开关/列可见性 | 已接线（列菜单内含 ns 开关） | toolbar 回调解构即弃（`StructuredResourceToolbar.tsx:79-81`） | 原型领先 → P1 |
| 操作确认链 | ConfirmSheet + 四类校验 | FilesOperationSheet + 同类校验 + 右键延迟选中 | 生产更全，见 §2.5 |
| Access/.meta | 侧栏 + Access 弹层（静态） | 页面 drawer vs 编辑器 tail 双形态 + 申请分层流 | **生产更强**，见 §2.3 |
| 错误重试 | 有重试动作 | 错误行写「按 Enter 重试」但无 handler（说谎） | 原型领先 → P1 |
| 术语外露 | 无（模型名/中文标签） | 错误文案含 ACL/ACR（`files-error-state.ts:21,51`）、「.meta」做菜单标题 | 原型领先 → P2 |
| 上传 | toast 演示 | 真实管线（建目录计划+批量 blob），但无进度 UI | 生产管线强、状态面同缺 → P2 |
| Kanban/Whiteboard | 静态样例 | dnd-kit 看板 + tldraw 白板（基本完成） | **生产更强**，见 §2.4 |

## 2. 生产优于原型：保留并讨论（不回流改动，先谈）

以下资产**不要**为了贴原型而削弱；讨论点是"原型要不要反过来吸收它们"。

### 2.1 编辑器会话安全链

`FileEditorSheet.tsx:57-129` + `RichTextFileEditor.tsx:474-500,842-846`：rich/raw 共享 dirty、discard 确认、保存中挂起动作、blur 自动保存、保存状态徽标、冲突文案。原型编辑器只是演示。
- 讨论：原型的「编辑显式进入」语义与生产的 blur 自动保存是否冲突？（原型目前 preview-first + 编辑 sheet，与生产一致，无冲突。）建议生产保持，原型的 FileDetailModal 补 dirty 链演示即可，不做更深。

### 2.2 结构化表格全家桶

TanStack Table + pinned subject + existing-first `AddPredicateMenu` + 类型化单元格（scalar/enum/relation/boolean）+ pending `*` 工作流（toast/筛选/撤回）+ 列宽拖调 + 视图保存指示（CloudOff/spinner+retry）。
- 讨论：原型的表格外观（行高、分隔线、sticky head）要不要作为生产 chrome 的视觉参照？生产功能全但密度/视觉可对齐原型。

### 2.3 Access / 元数据双形态 + 申请流

页面 drawer（`ResourceMetaDrawer`）vs 编辑器 tail（`ResourceMetaTail`）；Access 分层：当前 matrix → 来源徽标 → 申请变更（audience/role/WebID 校验，提交只建 pending proposal，不直写 ACL/ACR）→ 待确认列表 → 技术折叠。完全符合 sidecar 契约。
- 讨论：原型 Access 弹层只是静态展示；建议原型照抄这套分层叙事（静态文案即可），生产实现保持。

### 2.4 Kanban / Whiteboard 投影

看板：lane/card 拖拽、键盘四向移动、quick-create（Enter/Escape/错误提示）、collapse/scroll 持久化、pending move 重试、e2e 覆盖。白板：tldraw 自定义 shape + snapshot + relation editor。
- 讨论：原型要不要把 Kanban/Whiteboard 样例删掉，避免给错误预期？（建议：原型保留 entry 但标注生产实现为准。）

### 2.5 打开决策统一层 + 多选/确认链

`resource-semantics.ts`/`list-open.ts`/`folder-child-open.ts` 统一打开语义；structured return context + 滚动恢复；shift range/cmd toggle + 右键 context target 延迟选中；rename/transfer 目的地校验（unchanged/conflict/escape/cross-pod）。
- 讨论：原型目前校验只有四类中的三类（无 cross-pod 提示、无右键延迟选中）。建议原型补 cross-pod 文案样例；右键延迟选中作为生产独有交互保留。

### 2.6 Explorer 行模型（真实数据面）

懒加载子容器、metadata 警示徽标（无权限/不可用）、内联 loading/error 行、搜索保留命中祖先链。
- 讨论：原型是静态样本——它的价值在"目标交互形态"，不需要模拟懒加载；保留生产实现。

## 3. 原型领先：生产对齐 backlog（按优先级）

### P0（信任/契约硬伤）

1. **back + 当前路径**：`useFilesListPaneController.ts:205,211` 接通 `enterFolder/goBackFolder`（store 已有 `app/store.ts:392-423` 无人调用）；list head 渲染 back + `currentPathLabel`；folder 详情头部同现。参照原型 tree head。
2. **actionable 空态**：`FilesEmptyState` 加 action 槽；落地五种空态文案（`list-view-model.ts:256-305`）各配下一步（去浏览/清搜索/新建/上传）；folder 空态「当前容器没有可浏览子项」→ EmptyState + 新建/上传动作；detail 空态同。
3. **可编辑文件 preview-first**：`EditableFilePreview`（`FileDetailPreview.tsx:26-93`）从摘要卡改为正文渲染（facts chips + 只读正文 + meta tail），「打开文件详情」降级为编辑入口。参照原型 RegularFileSurface。

### P1（核心交互断裂）

4. **键盘 roving**：explorer 上下键移动时同步 DOM 焦点（选中即所见）；Enter 打开、Space 选中保留；补 ESC 清选择。注意生产「上下键只改选中」是有意的 select-on-move 语义，改 roving 前先确认语义（见 §4.2）。
5. **ns 开关 + 列可见性接线**：`StructuredResourceToolbar.tsx:79-81` 接通 `onShowNamespacesChange/onTogglePredicateVisibility`；ns 开关收进列可见性菜单（参照原型）。
6. **错误行重试真实化**：`explorer-tree-model.ts:154`「按 Enter 重试」补 handler，或文案改为无承诺+显式重试按钮。
7. **空 .ttl 引导流**：class 菜单对空资源只显示「新建 Class」（不显示无关 class），未选 class 时表格区显示 EmptyState + 新建入口（参照原型 no-class-state）。

### P2（清理与一致性）

8. **术语外露**：`files-error-state.ts:21,51` 的 ACL/ACR 改为「无权限读取/需要授权」；「.meta」菜单/drawer 标题保留（sidecar 是产品概念，但检查是否每处都需要）。
9. **上传进度**：`useFolderDetailUploadController` 加 per-file 状态行（至少"N/M 上传中"），不再只有 pending+toast。
10. **structured 表骨架**：加载中显示骨架行而非空表。

## 4. 需要重新确认的契约（两边都已自发偏离 DESIGN.md）

### 4.1 两 pane 与树的位置（已决议）

DESIGN.md 原文："恰好两个常驻 pane + 树从 list head 调起"。但**生产已进化为内联 explorer 树**（功能更强：懒加载、警示、搜索），**原型最终也选择了内联树**（用户验收）。两边已自发收敛到「内联树 + workspace + compact drawer」。
- 当前契约：桌面 = rail + 内联资源树（list pane）+ workspace；树支持懒加载、键盘 roving、搜索和 metadata 状态；compact 时同一棵树以 drawer 调起，保持单 head。生产和原型均按此实现，不再恢复旧的第三常驻 pane。

### 4.2 轻量预览 vs 单击直接打开（已决议）

采用「单击文件 = 全局 workspace 的只读预览；编辑/打开 = 显式动作」的统一契约。文件夹详情仍保留 Finder 的单选、多选、排序和子目录展开，但不会再增加一个常驻的内嵌预览栏，避免 Files 回到三栏布局。
- 文件夹内的文件在 list/tree/columns 视图中单击后交给 `FileDetailPane` 预览；文件夹自身单击只保持选中，双击/Enter/显式菜单才进入子目录。
- 键盘行为与契约一致：explorer 的 Arrow 键移动选中和 DOM focus，Enter 执行打开，Space 只选择；结构化 subject 仍是 read-only peek first。
- Finder 多选的 Meta/Ctrl/Shift/Alt 修饰点击只改变本地选择，不切换 workspace preview；移动端树抽屉在普通选择/打开后自动关闭，避免内容页被抽屉遮住。
- `FolderChildPreview` 不再属于运行时打开链；它保留在 feature 层仅作为历史兼容资产，新的行为测试禁止重新接回常驻内嵌栏。若后续确认没有外部引用，可在独立清理提交中删除，不影响当前打开语义。

### 4.3 文件夹视图集（已决议）

原型 Table/Grid vs 生产 list/icons/columns。生产的 columns（Miller）原型没有；生产 list/icons 与原型 Table/Grid 互为等价。
- 当前契约：文件夹视图集为 List/Table（排序列）+ Grid（Finder 磁贴）+ Columns（Miller）；icons 只是 Grid 的内部 icon kind，不作为第四种语义视图。结构化资源另有 Table、Kanban、Whiteboard、Raw 四种 projection。

## 5. 实施顺序建议

1. P0-1 back+路径、P0-2 actionable 空态、P0-3 preview-first（同一批，壳层契约）
2. P1-4 键盘语义先定（§4.2 结论先行）→ roving、P1-5 ns 接线、P1-6 重试真实化、P1-7 空 .ttl 引导
3. P2 术语/上传进度/骨架
4. §4.1 契约改写回填 DESIGN.md；§4.2/§4.3 结论回填本 spec 与 prototype 注释

## 6. 验证方式

- 原型参照：`yarn dev`（apps/prototype，本轮提交 b07ad852 + 710a4cb5），对照交互截图。
- 生产验收：每个 P0/P1 项补对应 controller 测试（参照现有 `useFilesExplorerController.test.tsx`、`FolderDetailTreeView.test.tsx` 模式）+ e2e（参照 `tests/e2e/specs/files-kanban-interactions.spec.ts`）。

## 7. 实现回填

本 spec 的 backlog 已逐项落到生产 Files：

| 项目 | 实现位置 | 验证状态 |
|---|---|---|
| P0-1 back + 当前路径 | `features/list/useFilesListPaneController.ts`、`features/list/FilesListPane.tsx`、`app/store.ts` | controller/component/回退交互 tests passed |
| P0-2 actionable 空态 | `ui/FilesEmptyState.tsx`、`features/list/FilesListPane.tsx`、`features/detail/FileDetailPane.tsx`、`features/folder/FolderDetailPreview.tsx` | component tests passed |
| P0-3 editable preview-first | `features/detail/FileDetailPreview.tsx`、`data/pod-adapter/index.ts` | `FileDetailPane.test.tsx` passed |
| Folder child read-only preview | `features/folder/FolderDetailChildViews.tsx`、`features/folder/FolderDetailTreeView.tsx`、`features/folder/FolderDetailColumnView.tsx`、`domain/folder/folder-child-open.ts` | single-click UI tests route files to global `FileDetailPane`; double-click/Enter semantics preserved |
| P1-4 explorer roving focus | `ui/FilesExplorerRow.tsx`、`features/list/useFilesExplorerController.ts`、`features/list/FilesListPane.tsx` | active row `tabIndex=0`, other rows `tabIndex=-1`; controller/UI tests also verify DOM focus follows ArrowUp/ArrowDown |
| P1-5 ns + predicate visibility | `features/structured/StructuredResourceToolbar.tsx`、`features/structured/StructuredTablePreview.tsx` | architecture/structured tests plus `FileDetailPane` menu interaction verify namespace toggle and predicate hide/show |
| P1-6 error retry | `features/list/useFilesExplorerDataController.ts`、`data/queries/resource-queries.ts`、`features/list/FilesListPane.tsx` | list/architecture tests plus DOM tests verify root retry and expanded-container retry by click and Enter |
| P1-7 empty TTL class onboarding | `features/structured/StructuredTablePreview.tsx` | structured/FileDetailPane tests passed |
| P2-8 user-facing permission wording | `domain/resource/files-error-state.ts` | domain/component tests passed |
| P2-9 upload progress | `features/folder/useFolderDetailUploadController.ts`、`features/folder/FolderDetailPreview.tsx` | folder/FileDetailPane tests also verify an in-flight per-file `0/1 上传中` state |
| P2-10 structured table skeleton | `features/structured/StructuredTablePreview.tsx` | structured tests plus `FileDetailPane` loading-state assertion passed |
| Prototype phase1 verifier | `apps/prototype/scripts/verify-files-phase1.mjs` | migrated from removed folder-preview selectors; `verify:files` passed with 19 checks |
| Prototype template walkthrough | `apps/prototype/scripts/verify-files-template-walkthrough.mjs`、`apps/prototype/src/files/FilesBrowser.tsx`、`apps/prototype/src/prototype.css` | current tree selectors, preview-first flow, mobile drawer close and compact layout; 12 checks passed |

另外，普通文本与 RDF 资源打开已改为单次 `GET`：响应 headers 直接提供类型、长度、修改时间、ETag/Link 等 metadata，同一响应正文用于只读预览，不再把 `HEAD` 放在打开主路径。`HEAD` 只保留给独立的存在性/权限探测。roots 已取得的 Pod 根目录和当前 workspace 条目会作为“全部文件”首屏快照复用，避免列表紧接着重复读取；普通文件 `.meta` 只在编辑 sheet 打开后读取，结构化 vocab enrichment 只在正文可用后启动。

### 7.1 性能基线与外部验证边界

- 已执行真实网络 benchmark：`FILES_BENCH_ITERATIONS=1 yarn workspace @linx/web benchmark:files-read`。本次目标为公开的 `https://id.undefineds.co/gcloud/`，不是私有 Pod：folder GET 886.6ms、file HEAD 5398.4ms、file GET 745.1ms；旧打开路径 `HEAD → GET` 共 2 次请求、1423.4ms，单次 GET 为 608.6ms，观测到约 57% 的差异。benchmark 现将两项标为 `Legacy open (HEAD -> GET)` 与 `Current open (GET)`，用于持续验证请求形态；公开结果不能代替私有数据验收。
- 私有 benchmark 入口已接入 Web DEV：`/files?filesBenchmark=1`，从当前选中的文件夹/文件取得 URI，并通过当前登录态的 `session.fetch`（DPoP）测量同一组 folder GET、file HEAD、file GET、当前打开路径和 snapshot GET。当前执行环境没有可接管的已登录浏览器标签，因此没有把私有 Pod 结果伪装成通过。
- `tests/e2e/specs/files-real-pod-smoke.spec.ts` 与 visual audit 使用本地 seeded xpod runtime，能验证生产 DOM 和读写链，但不等价于私有 Cloud Pod；不同 Pod 的 HEAD/WebDAV 兼容性和桌面壳视觉仍需单独执行。
- seeded xpod 的首次 OAuth 登录、Files 列表/详情、结构化写入、Kanban/Whiteboard 业务路径已实际执行；reload 后的 `prompt=none` 恢复仍受本地 xpod 跨站 account cookie 限制而失败。Inrupt browser SDK 4/5 的授权码回调也不会把 refresh token/DPoP key 持久化，因此这项不能通过继续清理浏览器存储解决，必须由可用的身份服务静默恢复能力或正式 refresh-token 集成单独验收。

当前剩余验证边界：真实登录态下的私有 Pod benchmark、不同 Pod 对 HEAD/WebDAV 的兼容性，以及桌面壳的视觉验收需要在可用环境中单独执行；本 spec 不把这些外部条件伪装成已通过。prototype 的 `verify:files` phase1、`verify:files:proposals` 和 `verify:files:walkthrough` 均已按当前树形、预览优先和移动抽屉契约通过。
