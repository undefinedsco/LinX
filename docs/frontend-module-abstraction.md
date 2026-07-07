# Frontend Module Abstraction Spec

本文档总结 LinX 前端模块开发中容易反复踩到的**架构坑和模板边界坑**，并定义之后重构 Files、Chat、Inbox 等模块时必须遵守的模块抽象要求。它补充 `docs/ui-component-architecture.md`：后者讲 UI 组件分层，本文档讲一个业务模块从模板、边界、数据权威到执行护栏的整体方法。

## 本文只收模板层问题

这里说的“坑”不是某个按钮、cell、drawer 当前不好用，而是**模块模板会反复诱导人写错的边界问题**。具体交互只作为证据和验收样例，不能直接成为本文档的主语。

一条问题能进入本文档，必须能写成：

```text
因为 <模板口子/目录/facade/slot/headless-state> 允许 <最快捷但错误的写法>，
导致 <authority/effect/projection/reuse/transport/semantic/guard> 边界失守；
以后同类能力必须由 <owner layer/file> 拥有，并用 <architecture/domain/integration test> 阻止 <禁止捷径>。
```

如果只能写成“这里不好看”“这个按钮多了”“这个表格不紧凑”，它属于交互 spec、视觉 spec 或 feature backlog；只有能继续追到 owner、import 方向、模板逃生口和测试护栏，才属于本规范。

## 元方法

新增或重构一个前端模块时，固定顺序是：

```text
module contract -> layer skeleton -> architecture tests -> domain tests -> feature controller -> UI composition
```

不要从页面 JSX 开始。JSX 是最后的组合层，不是事实归属、业务模型和数据权威的起点。

审查任何问题都先走四步：

1. **找模板诱因。** 是 `components/`、root facade、render slot、headless state、store action、query facade、collection facade 哪个口子让错误写法最省事？
2. **判边界失守。** 问题落在 authority、effect、projection、reuse、transport、semantic、guard 哪条线？
3. **指定 owner。** 明确应该由 `app/`、`features/`、`ui/`、`domain/`、`data/*` 或 shared model 拥有。
4. **关逃生口。** 用目录、命名、props-only API、owner/facade 规则、architecture test 或集成测试让错误写法以后更难出现。

设计和代码 review 的表达顺序也是：症状只是证据，结论必须落到边界层或模板层。修到模板层，类似问题才不会在下一个 feature 里重演。

## 抽象方法

这里的重点不是把一个页面拆得更细，而是先判断**抽哪条线**。任何模块都至少同时有四类线：

| 线 | 问题 | 失败信号 |
|----|------|----------|
| 产品对象线 | 用户认为这是什么对象：file、folder、subject、predicate、card、message | 目录和组件按屏幕区域命名，不能回答对象生命周期 |
| 数据权威线 | durable data、derived projection、local draft、optimistic overlay 各由谁负责 | 同一事实同时出现在 query、store、component state 和 route |
| 工作流线 | 谁拥有 create/save/approve/discard/open/refresh 的完整后续动作 | 子组件直接 mutation/toast/route，多个入口各自收尾 |
| 呈现模板线 | 哪些只是可替换视觉，哪些是业务 owner | 因为“长得像”就抽 `ui/`，props 里却带 query/resource/store |

做抽象时不要先问“这个东西应该拆成几个组件”，先问：

1. 这个文件是不是事实 owner？如果是，它不能只是一个 render 组件。
2. 这个 state 是交互态、草稿态、派生态，还是持久事实？不同答案不能放同一个 owner。
3. 这个动作是否有完整事务语义：乐观更新、刷新、订阅、失败回滚、审批记录、toast、route？有的话必须有命名 workflow owner。
4. 这个模板是否让后来的人最容易“顺手写错”？如果是，要加 guard，而不是只靠文档提醒。

一个常见误判是把“UI 看起来是一块”当成模块边界。正确做法是把同一块 UI 再拆成**数据准备 owner、工作流 owner、domain projection、presentation composition**。例如 `.ttl` preview 视觉上是一张表，但模板边界上至少有：

- raw ttl / vocab registry / schema index 的数据源 owner；
- class scope、predicate visibility、view metadata 的交互状态 owner；
- cell / predicate / class proposal 的写入 workflow owner；
- table / kanban / whiteboard 的纯投影和呈现组合。

如果这些线都塞在 `StructuredTablePreview.tsx`，表格每加一个交互都会自然把 query、mutation、toast、schema 和 JSX 混在一起。后续同类文件要先命名 owner，再写 JSX。

写入类工作流尤其不能只按“触发按钮在哪”归属。cell edit、predicate 新增、class 新增、vocab proposal 都有事务语义：pending 查询、乐观/本地 staged 状态、审批创建、冲突 toast、失败回滚或保留、以及不同视图之间的 projection 合并。这些不是 cell 或 preview 的呈现细节，必须进入命名 workflow controller；presentation 只接收 `commit*`、`setLocal*`、`pending*` 这类已命名动作和投影结果。

notification/toast 也不能用 preview composition 当依赖注入管道。哪个 workflow 触发保存、审批、冲突处理或 autosave，哪个 workflow/effect controller 就自己拥有 toast；preview 只组合 controller 输出，不 import `useToast`，也不把 `toast` 参数层层下传给 cell/vocab/view metadata controller。否则 preview 会重新变成 effect wiring hub，看似只是传参，实际把多个工作流的后续动作耦回同一个 JSX 容器。

`+subject` 也属于写入工作流，不是 footer row 的局部弹窗状态。它包含 projection rows 到 existing subject 的派生、subject draft 生成、class scope 校验、输入框 Enter 提交、pending subject overlay、rdf:type cell proposal staging 和文档切换 reset；纯派生、计划和 `StructuredSubjectCreationState` 的 create/open/draft/submit/reset projection 必须进入 subject creation model，controller 只持有一个 state container 并执行 staging effect。footer trigger/dialog markup 也不能继续堆在 table renderer 里，应该由 props-only subject creation controls 承接；表格模板只接线 controller 输出和 controls。

TanStack table 模板也不应该直接装配业务 projection。table rows、pending-only display rows、visible predicates、column visibility、footer predicates 和 shape warning map 是 structured table model 的派生事实，必须由 table model controller 统一装配。`StructuredProjectionTable` 只把这些结果交给 TanStack 和 columns builder。

TanStack columns builder 也不是继续塞 cell 语义投影的安全位置。每个 predicate cell 的 values、predicate label、active editor 命中、pending write marker、shape warning marker 及其 aria/title，以及 subject cell 的 display label、open target、row index、pending marker，都属于 cell chrome projection model；columns builder 只用这个 view model 选择 active/static/subject cell 和渲染 primitive marker。

TanStack table renderer 也不能顺手拥有 row/cell chrome class projection。pending row 背景、subject/add-predicate/data cell 的视觉 class、边框密度和列分隔样式虽然只是 presentation，但一旦散在 renderer callback 里，会让 table shell、cell chrome 和 feature renderer 继续互相知道实现细节；这些应该进入 table chrome model，renderer 只把 `getRowClassName`、`getCellClassName` 接给 shell。

predicate cell trailing controls 也不能继续堆在 columns builder 里。shape warning icon、pending write status/discard button、active editor 的 pending slot、static cell 的 warning+pending trailing 都是同一组 cell trailing primitive；columns builder 只从 cell chrome 拿 `shapeWarning` / `pendingWrite` model 并传给 props-only trailing controls，不直接 import `ShapeWarningIndicator` 或 `PendingCellWriteButton`。

predicate column header 也不能把定义/pending proposal 投影直接写在 renderer 或 table model 里。普通 predicate 的本地 label、column action label、observed values、type/status/rule/description、shape rule action、definition menu title/row/action chrome、pending predicate 的 proposal summary、vocab proposal 链接摘要、pending menu title/row/action chrome 和 inline submit affordance 属于 predicate header model；header renderer 只根据 `kind` 选择普通 header 或 pending header primitive，并绑定外部传入动作。

columns builder 也不应该因为“只是一个图标”直接 import icon library。sort indicator、resize handle、pending marker 这类纯视觉 primitive 应进入 props-only primitive 文件；columns builder 只选择哪个 primitive、传入 sort state 或 marker model，不直接拥有图标选择。装饰性 sort icon 必须 `aria-hidden`，列头按钮/表头 owner 才能控制 accessible name，避免 namespace 或内部 column key 泄漏到用户可访问名称里。

cell edit activation/commit 也不能留在 table renderer。cell activation plan、activation effect、键盘激活/提交/撤销 action、outside pointer action、text commit 和 relation commit 属于 cell edit workflow model；active enum/relation/text editor state、popover placement 和 document reset 属于 cell edit workflow controller。active cell draft value 更新、按 subject/predicate 清理当前 editor 这类状态投影也必须由 workflow model 提供 projector，controller 只负责调用 `setState` 和 popover side effect，不能内联 `{ ...current, value }` 或 cell match 逻辑。表格只把 `startCellEdit`、`handleCellKeyDown`、`commitTextCell`、`commitRelationCell` 和 active editor state 传给 shell/columns。

enum cell 的 option 列表与新增/移除也不是 active cell 的展示细节。它包含 observed/defined/pending option 合并、selector search/create/exact-match 投影、selector 输入区 chrome、selector create action payload、selector input/option key action plan、selected chip/remove action chrome、selected chip remove action payload、option row select payload、option row pending display label、option 定义菜单 chrome、known option cell write、新 option vocab proposal、duplicate/empty noop 和关闭当前 enum editor，这些必须进入 enum cell workflow controller/model。表格只把 `getEnumOptionsForPredicate`、`addEnumOption`、`removeEnumOption` 和 `resolveEnumOptionTermUri` 传给列构建器。

表格里的“打开定义/复制 predicate/打开 relation value”也不是 JSX 里的轻量 callback。它同时涉及用户传入 callback、platform fallback、relation target 解析、内部 resource 导航和外部链接打开；这些属于 projection action workflow controller。表格只能消费 `openPredicateDefinition`、`openRelationValue`、`copyPredicate` 这类已归属动作，不直接 import `app/platform-actions` 或 `structured-subject-peek`。

byline toolbar 也不能因为只是一个下拉菜单就直接拥有 class 创建状态机。class draft、创建面板展开、定义面板展开、文档切换 reset 和提交后清空属于 class scope menu workflow；纯状态转换属于 `structured-class-scope-menu-model.ts`，controller 只拥有 React state/effect 和 `onCreatePendingClassProposal` 接线；toolbar 只渲染菜单并绑定 `submitClassDraft`、`updateClassDraftUri`、`toggle*` 动作。

structured byline toolbar 也不能把 filter active 状态、class option/pending proposal label、view tab、sort row、sort/ns/visibility 工具是否可见、namespace switch 和 predicate visibility label 留在 renderer。它们是 toolbar view model projection，必须由 structured toolbar model 统一生成；toolbar renderer 只消费 rows/flags，并把用户动作转发给外部 controller。

structured preview header 的 class scope label、button label 和 selected/empty fallback 也不是 preview composition 的内联文案。它们依赖 vocab definition、pending class proposal 和 local URI fallback，属于 preview header model；`StructuredTablePreview` 只把 header model 输出传给 toolbar。

structured view metadata 里的 effective class scope 也不是 preview composition 的 callback，也不是 hook controller 的导出 helper。它依赖当前 raw projection 与 UI class scope 的归一化，最终要写入/恢复 view metadata，因此纯 projection 属于 `features/structured/structured-view-state-model.ts`，view-state controller 只负责 store/metadata wiring 并调用 model；`StructuredTablePreview` 只把 `projection` 传给 `useStructuredViewStateController`，不能 import `projectStructuredClassScope` 或定义 `resolveEffectiveClassScope`。

Whiteboard 的视觉关系编辑也不是画布 renderer 的局部状态。relation editor open、editing id、from/to/label draft、创建/更新 relation、删除 relation、取消编辑属于 whiteboard relation controller；target options、可提交状态、chip label/aria fallback、默认 relation id 生成、保存后的 relation 列表投影属于 whiteboard relation model；add relation / clear subject 这类 toolbar action availability，以及可添加 subject、空画布、关系计数是否展示这类 content availability 属于 whiteboard view workflow。controller 只拥有拖拽、DOM ref、open suppression 和 relation controller 接线；nodes/layout merge、available rows、relation subject options、relation segments 和计数文案属于 `structured-whiteboard-view-model.ts`；Whiteboard 只渲染关系表单、关系 chips、toolbar 按钮和画布。

Whiteboard 的关系线几何也不是 SVG renderer 的局部计算。relation endpoint lookup、node center/anchor offset、缺失 endpoint 过滤和 line segment source 标识属于 `structured-whiteboard-view-model.ts`；whiteboard view controller 只把 model 输出交给 renderer 和 relation workflow；renderer 只能消费 `relationSegments` 并绑定 `<line>` 属性。

Kanban 的跨列移动也不能留在视图 renderer。pending move state、cell write proposal 创建、提交失败 rollback、提交成功后 staged 状态和同列排序回调属于 Kanban move controller；pending move 展示 view model/label、展示列合并和同列排序 projection 属于 Kanban move model；native/DnD 事件路由、`dataTransfer`、drop commit 和菜单动作转发属于 Kanban view controller；native drag state 的开始、hover column、leave column、clear 纯状态投影属于 Kanban view model；Kanban 分组菜单是否可用、分组 label、predicate options、card move menu availability、column card count label、card lookup 和 drop target lookup 也属于 Kanban view model；Kanban view 只把 DnD/菜单事件转发给 `commitKanbanMove`、`reorderColumnSubjects` 等命名动作。renderer 不能再根据 `pendingMove.status` 拼“提交中/待审批”文案；status 到 label 的映射属于 move model。

vocab/class/predicate proposal 还多一层语义边界：用户在 `.data` 表格里新增的是个人数据描述，但最终会进入 vocab registry 的待确认记录。pending query、审批创建、冲突 toast、打开审批记录、丢弃待审 proposal 属于 vocab/pending predicate workflow controller；reviewable proposal 合并、本地 pending class 与 hydrated proposal 合并、class scope proposal 查找、重复 class 判断和 approval-staged class projection 属于 `structured-vocab-proposal-workflow-model.ts`；pending predicate 的 hydrated proposal 合并、draft 到 column proposal、重复判断、pending ids/map、approval-staged 投影、definition fallback、discard 过滤、hydrated proposal 查找和 dismissed id 更新属于 `structured-pending-predicate-columns-model.ts`。preview 只能拿 `visiblePending*`、`pendingPredicateIds`、`reviewable*` 和 `create/approve/discard/open` 动作，不应该直接知道 vocab registry query 或 proposal RDF 创建细节。

locked vocab registry table 虽然是只读表，也不能把 column schema、search text、filtered rows、cell openability 和 table-level chrome 放在 renderer 里。raw Turtle 读取、registry kind 判断、term peek 路由属于 locked vocab preview controller；preview header/viewport chrome 属于 `locked-vocab-preview-model.ts`；search text 这种 React 交互态属于 registry table controller；表格列定义、搜索过滤、display rows、每个 cell 的 value accessible label、open action、empty-state flag、search placeholder、empty 文案和 fallback cell 文案属于 registry table model；preview 只把 `rows`、`registryKind` 和 `openTerm` 传给 table composition，并渲染 controller 返回的 chrome。cell 的 value 语义和按钮的 action 语义必须分开投影，否则 browser accessibility snapshot 会把 “Open term …” 当成单元格值，真实 e2e 无法按 URI/shape/namespace 验收。

source-linked / Ingest 更新也一样。表格里的“仅 Ingest 更新”不是普通 checkbox，而是一个 source update workflow：读取 pending source update proposal、按 subject 合并最新记录、把当前投影过滤到受影响 subject，并在切换文档时清理本地过滤状态。pending query 和 document reset effect 属于 source update workflow controller；本地 staged map、source update filter 开关和 reset 必须作为一个 `StructuredSourceUpdateWorkflowState`，由 `createStructuredSourceUpdateWorkflowState`、`projectStructuredSourceUpdateWorkflowReset`、`projectStructuredSourceUpdateWorkflowSourceUpdatesOnly` 和 `projectStructuredSourceUpdateWorkflowProposals` 投影；按 subject 合并最新 proposal、resourceUpdateSubjects 与过滤后的 projection 属于 `structured-source-update-workflow-model.ts`。preview 可以展示过滤状态，但不应该直接拿 source proposal query、维护 proposals-by-subject map，或内联 `projection.rows.filter(...)`。

source-linked card 详情预览还要分清 workflow、preview controller 和 preview model。Ingest/approval/source refresh/open body resource 属于 source-linked workflow controller；source card subject、body URI/body file、expected source update proposal、pending proposal selection 和 body preview fallback 属于 source-linked workflow model；sheet open 与 source details 展开必须作为一个 `SourceLinkedCardPreviewState`，由 preview model 提供 create/sheet-open/details-toggle projection，source-linked preview controller 只持有这个单一 state container 并绑定 action handler；aria action id、pending ingest range availability、staged ingest content、primary action disabled/error 状态、detail rows、date/range/status copy 和 editor sheet readiness 属于 source-linked preview model。preview controller 不能拆 `sheetOpen` / `sourceDetailsOpen` 两份 React state，不能定义 `createSourceLinkedCardDetailRows`、直接 import `formatDateTime`、内联 `pendingRanges.map(...)`、直接读取 `pendingRanges.length` 或 `sourceProposal?.proposedContent`，也不能用 `content.kind === 'ready'` 拼 editor sheet；preview renderer 只能组合 editor、toolbar、action rows 和 detail rows，不能自己维护这些状态、直接读取 `expectedSourceProposal` / `refreshPending`，也不能在 controller 里内联 proposal filter/sort 或 body filename fallback。renderer 也不能直接用 `descriptor/bodyUri/bodyFile/bodyPreviewText/sourceActionError/file.previewText` 做业务分支；这些必须先投影成 `content/actionError/detailsPanel/editorSheet` 这类 preview-ready model。

source-linked card 的容器政策不能从某个列表或 toolbar 的当前路径临时推断。Card 是用户对象，可以散落在工作区、源文件旁或普通文件夹；create/import workflow 只决定本次 card/body resource 的落点，并把该落点显式传给 domain plan。source-owned 派生状态不是 card 内容容器：Ingest record 统一由 `domain/source/source-ingest-manifest.ts` 解析为 Pod root 下的 `/.data/ingest/sources/{source-slug}-{source-uri-hash}/manifest.ttl`，proposal 统一进入 `/.data/proposals/source/*.ttl`，二者都不能跟随 card 所在文件夹漂移。旧 `/.data/index/sources/.../manifest.ttl` 只作为 legacy manifest location 兼容读取或旧资源维护路径；新写入、UI 文案和 domain model 都使用 Ingest 命名。后续如果把这套语义提升到 `@undefineds.co/models`，也要保持三层分离：card/body 是用户可浏览资源，Ingest record 是 source 进度/来源状态，proposal 是不可变审批实例。

共享 preview primitive 也不能为了复用小函数而承接 feature 命名。`ModeCard`、`RawTextBlock`、`DetailRows` 这类 UI primitive 只表达视觉结构；source-linked action error id、Ingest chunk progress、`.meta` tail id 这类带业务命名的投影必须放在对应 feature/domain model，controller 只调用 model，UI primitive 不暴露 resource/meta/Ingest helper。

detail metadata panel 也要分清编辑 workflow 和 panel projection。`FileRdfMetadataPanel`、`SourceLinkedCardMetadataPanel`、`SourceLinkedCardDrawerMetadata` 视觉上只是详情尾部的小块，但 `.meta` URI fallback、meta Turtle predicate 提取、source-linked card descriptor 解析、body resource fallback、previous RDF values，以及 meta predicate pending/error 到 marker、aria、title、className 的 status chrome，都是 panel model projection，必须由命名 model 拥有；renderer 只把 model 展开给 `DetailRdfMetadataPanel` 和 `useDetailMetaPredicateController`。meta predicate 的本地 pending/error 状态投影、hydrated pending fallback、草稿值归一化、document/subject context reset，以及“有本地 pending/error 时不要被外部 hydration 覆盖”的同步计划都属于 detail metadata editor model；controller 只能执行 query/mutation/toast、持有一个 editor-state container 并调用 projector，不能内联 `{ ...current, [predicateKey]: ... }`，也不能把 `title/reviewStatus/tags/relation` 拆成四个独立 `useState` 再用 ref 同步 hydration。metadata panel 也不能保留 `typedControls` 这类编辑策略旗标：Files detail 的 RDF meta 编辑统一走 structured predicate editor，legacy `<input>/<select>` fallback 会让 renderer 重新承担编辑策略。

可编辑文件的 inline preview 也不能在 JSX 里现场拼 facts 和详情 rows。mime/size/modified facts、URI/content rows、row kind、open sheet label 属于 `features/detail/file-detail-preview-model.ts`；`FileDetailPreview.tsx` 只消费 `projectEditableFilePreviewModel`，不能直接 import `formatBytes`、维护 `fileFacts`，或通过 `label === 'URI'` 反查展示语义。

只读文件 preview 的 raw text / authenticated image / unsupported 分支也不是 renderer 的临时判断。previewText 优先级、`image/*` 判断、loading 文案、fallback reason、mime label、image alt 和 fetch 输入属于 `features/detail/file-detail-preview-model.ts`；authenticated image 的 loading/unavailable/ready render state 也由 `projectAuthenticatedImagePreviewRenderState` 投影，`FileDetailPreview.tsx` 只消费 `projectReadonlyFilePreviewModel` 和投影后的 render state，不能直接判断 `file.previewText`、`file.mimeType?.startsWith('image/')`、`imagePreview.isLoading`、`imagePreview.objectUrl`、`imagePreview.error`，也不能内联不可预览文案。

文件 lineage tab 也不是 renderer 的几个文案段落。资源类别 section label/value、处理语义 policy row、row kind、打开方式 label、父容器和最近修改 rows 属于 `features/detail/file-detail-preview-model.ts`；`FileDetailPreview.tsx` 只消费 `projectFileDetailLineageModel`，不能直接 import `formatDateTime`、`getFilesEntrySemanticLabel`、`getFilesOpenModeLabel` 或 `getFilesEntrySemanticPolicy`，也不能通过 `label === '处理语义'` 这类中文 label 比较决定样式。

`.meta` sidecar content 也要拆开 query 和 projection。`.meta` 读取属于 meta drawer controller；folder/meta/semantic/workspace rows、本地化标签、ACL/ACR fact 过滤后的 raw text、raw/notice panel 状态属于 meta sidecar content model/controller；drawer/tail renderer 只选择 loading/error/ready 分支并渲染 rows/panel，不能直接读取 `rawContentAvailable` 或 `metaState` 来拼“未找到/不可访问/未知”。

`.meta` sidecar content controller 也不能继续承载纯投影。`features/sidecars/useResourceMetaSidecarContentController.ts` 只把 query 的 loading/error/data 输入转交给 `features/sidecars/resource-meta-sidecar-content-model.ts`；file/folder/meta/semantic/workspace rows、本地化标签、错误文案、ACL/ACR fact 过滤和 rows visibility 都属于这个纯 model。renderer 不能读取 query object、调用 `getFileMetaRows`，controller 不能内联 row projection。

直接打开 `.meta/.acl/.acr` sidecar 文件的 detail preview 也不能把 placement 当 JSX 小判断处理。owner/sidecar/provider rows、row kind、rows 是否展示、`.meta` 与 ACL/ACR 标题、access-only notice、raw text 是否展示属于 `features/detail/file-detail-preview-model.ts`；`FileDetailPreview.tsx` 只消费 `projectFileDetailSidecarPreviewModel` 的 title/description/rows/showRows/notice/rawText，不能 import `resolveFilesSidecarPlacement`，不能直接判断 `semanticKind === 'meta-sidecar' | 'access-policy-sidecar'`，不能直接读取 `sidecarPreview.rows.length`，也不能通过 `label === 'provider'` 这类 sidecar row label 反查样式。

Access dialog 的权限来源和权限矩阵也不是 dialog renderer 或 controller 的临时 projection。ACR/ACL source row、active source inheritance label、access query error message、current access source loading/error/linked/empty state、access matrix row、grant mode 文案、audience/role 字符串解析、draft patch、本地 pending proposal staging 和提交成功后的表单状态清理属于 access policy dialog model；controller 负责把 query result 投影成 rows/view/state，持有一个 dialog controller state container，并封装 create/open current policy source 动作，不能定义 `formatAccessQueryError` 这类本地 formatter，不能拆 `audience/role/agentWebId/reason/pendingProposals` 五个独立 state，也不能直接 `setPendingProposals((current) => [...])` 或按 `audience === 'agent'` 手写清理；renderer 只渲染 rows/state 和绑定 open/proposal 动作，不能直接读取 `accessDialog.accessQuery`、`accessDialog.accessErrorMessage` 或 `accessDialog.currentAccessSource`。

Access dialog 的 audience/role/provider 展示也不能因为只是 `<select>` 选项就留在 JSX。`domain/resource/access-policy-dialog-model.ts` 拥有 audience/role option rows、string parsing、provider label/current policy view；`features/sidecars/useAccessPolicyDialogController.ts` 暴露可渲染 option rows 和 string setter；`ResourceSidecars.tsx` 不能 import access model constants/types，也不能硬编码 `<option value="public">` / `<option value="viewer">` 这类业务枚举。

结构化 cell primitive 不能因为是“输入控件”就直接拥有 RDF value editor 状态机。draft/selected values 必须作为一个 predicate value editor state container，由 predicate value editor model 提供 create/reset/draft patch/commit projection；React controller 只持有这个 state container 和事件转发。normalized values/options、enum create/filter、expanded/listbox availability、input/listbox/create-option chrome、multi-select selected chip/remove action chrome、multi-select selected chip remove payload、multi-select add/remove plan、boolean toggle plan、scalar commit plan 属于 predicate value editor model；RDF serialization primitive 属于 domain editor plan；primitive 只负责 DOM、chip/input/button 布局和事件转发。

静态 predicate cell 也不能因为“不可编辑”就直接在 renderer 里调用 enum/relation/scalar projection helper，也不能把没有 React state/effect 的纯投影命名成 `use*Controller`。boolean toggle eligibility、enum labels、relation target view model、relation value display label 和 scalar labels 属于 static cell display model；renderer 只根据 `display.kind` 选择对应 primitive。

active predicate cell 更不能把编辑器状态机的 projection 留在 JSX 里，也不能把没有 React state/effect 的纯投影命名成 `use*Controller`。text/relation pending proposal 判断、relation value view model、relation value display label、enum observed/defined/pending option 合并、selected values 和 listbox id 属于 active cell display model；predicate display label 必须由上游 cell chrome/header projection 传入，active cell display model 只消费它，不能再从 URI/predicate id 推导一份；renderer 只根据 `display.kind` 绑定 primitive 和命名回调。

subject peek body 也不能把 URI/detail 展开状态、section visibility 和 fact display 投影留在 drawer renderer，也不能把纯投影和 headless open state 混在同一个 hook 里。type/location/source rows、predicate/backlink/term rows、source/term/predicate/backlink section 是否展示属于 subject peek body model；technical details open 属于 subject peek body controller；drawer title、drawer aria、close aria 和 icon kind 属于 subject peek drawer chrome model；drawer body 只渲染已准备好的 view model，不直接调用 structured display helper，也不直接用 raw peek facts 或 kind 判断 section/header。

subject peek footer actions 也不能散在各个 preview 容器里。resource sidecar、external copy、term/current-file close、source open 和 primary open label 都依赖 peek kind 与 target 语义，属于 subject peek action model；preview 只传入 peek 与命名回调。

predicate/class 过滤也不是 presentation 或 controller 里的临时 `filter()`。namespace/type/vocab term filter、schema projection、可选 namespace、class definition lookup、可见 predicate 列表和未应用 source/pending 过滤的 table projection 构成 projection filter model；controller 只拥有 filter state、document reset 和选择已有 predicate 后 reveal+reset 的 action 接线。preview 可以把这些结果传给 toolbar/table，但不应该直接拼 schema projection 或在 JSX 文件里散落 `projectStructured*Filter` 调用。

投影 review 也不能留在 preview 模板里。effective view projection、raw text projection、shape validation projection、warning rows only、pending writes only 和 status summary 都是“当前视图如何被审阅”的派生事实，不是 toolbar/table 的展示细节。warning/pending review 开关必须作为一个 `StructuredProjectionReviewState`，由 `structured-projection-review-model.ts` 提供 create/reset/patch projection；projection review controller 只持有这个 state container、处理 document reset 和 model memo。preview 只能消费 `tableProjection`、`shapeWarnings`、`structuredStatus` 和对应开关。

raw projection 的呈现也不能在 preview 容器里顺手定义一份。`RawTextBlock` 是共享 props-only primitive，属于 `ui`；structured raw view 的标题/说明/primitive 组合属于 structured raw view renderer；`StructuredTablePreview` 只按 view mode 选择它。

structured preview 的 alert/banner 也不是 preview 容器的局部 JSX。source unavailable、shape warning summary、projection parser warning 都是 projection review 的呈现分支，必须由 structured alert renderer 拥有；preview 只传 boolean/warning arrays。

structured viewport 的 scroll state 和 viewport chrome 也不能散在 preview 容器里。viewport aria、viewport ref、last scrollTop、scroll/capture 事件和非 table 视图的水平滚动 reset 是交互状态机，属于 viewport controller；preview 只把 controller 输出绑定到 viewport DOM 和 subject navigation。

subject navigation 和 viewport state 要分开。route push、subject peek、focus restoration 属于 subject navigation controller；alternative view subject open request、open option normalization、same-Pod source URI 解析和 scroll restoration target signature 属于 `features/structured/structured-subject-navigation-model.ts`；viewport ref、last scrollTop 与 view-mode scroll reset 属于 viewport controller；preview 不应该用 `useRef/useEffect` 把两条状态线重新粘在一起。

outer shell 的 resizable pane participation 也不能只靠子模块 CSS 或局部 `hidden` 处理。`react-resizable-panels` 这类 shell pane 可能保留 inline flex/size 占位；compact viewport 下哪些 pane 参与布局、哪些 pane 完全不渲染，必须由 layout/shell owner 依据 media query 决定。业务模块内部可以再做列表/详情二选一，但不能假设外层 tree/list panel 会因为子内容隐藏而释放宽度。回归测试要覆盖 compact matchMedia 下 pane 不参与渲染，production visual audit 要断言内容区 bounding box 没被外层 pane 推开。

projection byline 和 board toolbar 的 compact overflow 也不能交给整页横向滚动兜底。view switch、filter/sort/ns/visibility、Whiteboard subject/relation actions 和 board canvas 都是 projection surface 的内部 chrome；owner 组件必须提供明确的 scroll surface 或换行策略，并用可测试标记守住，不允许把上层 Files content 撑宽。visual audit 需要在 390px 下断言这些内部 scroll surface 存在。

写能力判断也不是 preview 的 if 条件。`.data` 下用户个人 Turtle 可以生成 structured proposal，`.vocab`、reserved `.data` manifest/index、public ordinary Turtle 和非 Turtle 文件不能直接写，这是一条 structured domain capability；structured resource preview controller 负责调用 capability 并输出 `structuredWritesSupported`。preview、toolbar、table 只能消费这个结果，不应该自己解析 URI、mime type 或 reserved path。

## 不是细节清单

本规范不记录“Files 的某个页面现在应该长什么样”。它记录的是**为什么前端模板会把人引向错误实现**，以及之后怎么让这个错误路径变得不自然。

写规范时用下面的转换：

| 不进入本文档的写法 | 可以进入本文档的写法 |
|--------------------|----------------------|
| “右侧抽屉和 inspector 重复。” | “preview 模板让 meta/access sidecar owner 分裂；sidecar workflow 必须由 `features/sidecars` 拥有，preview 只触发命名动作。” |
| “表格 cell 的按钮太多。” | “cell primitive 直接拥有 RDF edit/proposal/open action；cell 只能渲染 domain plan，提交和外部动作上抛到 structured workflow owner。” |
| “文件夹不像 Finder。” | “folder list 模板把 browse/open/select/operation 混在一个 pane；folder navigation、child selection、operation mutation 必须拆成命名 controller。” |
| “文件夹视图切换和排序只是 toolbar 状态。” | “Finder view workflow 模板包含 sidecar child 隐藏、view mode、sort state、sorted child projection，以及 list/icon/column row chrome projection；这些必须由 folder detail/column controller 拥有，folder preview/collection/column view 只消费 visible/sorted rows 和命名动作。” |
| “文件夹右侧子项预览只是 sidebar JSX。” | “folder child preview 模板包含 preview rows、subtitle、summary、detail fallback、sidecar owner target 和 meta drawer reset；纯 preview projection 属于 domain model，meta drawer open/reset 属于 child preview controller，folder detail preview 只选择哪个 child 被预览。” |
| “文件夹 column panel 只是 map entries。” | “Finder column panel 模板包含排序后的 sibling projection、row chrome、count 和 empty availability；这些纯 projection 属于 domain model，column panel controller 只做 memo，column panel 只渲染 sorted rows 和上下文菜单。” |
| “移动端把左侧栏 hidden 掉就行。” | “shell pane participation 模板包含 resizable pane 是否参与布局、media query 状态和 bounding box 回归；layout owner 必须在 compact 下不渲染会占位的 pane，业务模块再处理自己的列表/详情切换。” |
| “Whiteboard/toolbar 控件多了就让页面横向滚。” | “projection chrome 模板包含 byline tools、view actions、board actions 和 canvas 的内部 scroll/wrap 策略；owner 组件必须提供可测 scroll surface，不能把上层 content 撑宽。” |
| “非 ttl 的 preview 没统一。” | “preview dispatch 组件容易顺手消费 store/query/sheet request；dispatch 只根据 open mode 组合 preview，editable sheet 请求由 controller owner 消费。” |
| “原始内容编辑区只是一个 textarea。” | “编辑器内部子块最容易直接拥有 mutation/toast/conflict，或在 hook 里根据 raw resource 对象引用 reset 草稿；raw source editor 只绑定状态和动作，draft hydration/dirty/save plan 属于 raw source model，save/proposal workflow 必须由命名 controller 拥有。” |
| “`.meta` drawer 只是一个抽屉。” | “sidecar drawer 模板容易直接拥有 query；drawer/content 只渲染，`.meta` query 和 Access proposal workflow 分别由命名 controller 拥有。” |
| “sidecar 按钮只是两个 icon button。” | “action button 模板容易直接计算 owner target、sidecar URI 和弹窗 open state；这些必须由 sidecar actions controller 拥有，按钮只绑定命名动作和展示 tooltip。” |
| “文件夹 column 只是递归列表。” | “Finder-style 子列模板容易直接在列组件里拿 detail query；descendant container 读取和 child projection 必须由命名 controller 拥有。” |
| “图片 preview 只是一个 `<img>`。” | “媒体 preview 模板容易直接拥有 blob query 和 object URL 生命周期；渲染组件只消费 object URL/loading/error，资源生命周期由 controller 拥有。” |
| “`.ttl` 表格逻辑太多。” | “structured preview 模板把 raw ttl 读取、vocab registry discovery、schema index 和表格组合混在一起；数据 query 属于 structured resource preview controller，structured source、vocab URI 和 vocab index projection 属于 resource preview model，preview 只消费 view-ready facts。” |
| “cell 改动只是表格里的一个按钮。” | “cell write workflow 模板包含 pending query、审批创建、冲突 toast、本地 staged proposal 和跨视图合并；这些必须由 structured cell proposal workflow controller 拥有，preview/table 只消费动作和投影结果。” |
| “preview 里拿一个 toast 传给所有子 controller 就行。” | “notification/effect wiring 模板包含保存、审批、冲突和 autosave 后续动作；这些必须由触发对应 effect 的 workflow controller 自己拥有，preview 不能 import `useToast` 或透传 toast。” |
| “+subject 只是表格 footer 里的一个弹窗。” | “subject creation workflow 模板包含 draft 生成、class 校验、pending subject overlay 和 rdf:type proposal staging；这些必须由 structured subject creation controller 拥有；footer/dialog markup 由 props-only controls 拥有，table 只消费 dialog state、draft 和 submit/open 动作。” |
| “TanStack 表格里顺手 useMemo 几个 rows/columns projection。” | “table model assembly 模板包含 table rows、pending display rows、visible predicates、column visibility、footer predicates 和 shape warning map；这些必须由 structured projection table model controller 拥有，table 只消费 table-ready model。” |
| “columns builder 只是 render callback。” | “cell chrome 模板包含 predicate values/label/active editor/pending/shape warning，也包含 subject display label/open target/row index/pending；这些必须由 cell chrome projection model 拥有，columns builder 和 primitive 只消费 view model。” |
| “table renderer 里顺手写 row/cell class callback。” | “table chrome 模板包含 pending row 背景、subject/add-predicate/data cell class 和列分隔样式；这些必须由 table chrome model 拥有，renderer 只把 class projector 接给 shell。” |
| “warning 图标和 pending 按钮就在 columns builder 里拼一下。” | “predicate cell trailing 模板包含 shape warning、pending write status/discard 和 static/active trailing slots；这些必须由 props-only trailing primitive 拥有，columns builder 只传 cell chrome model。” |
| “predicate header 只是一个表头组件。” | “predicate header 模板包含本地 label、column action label、observed values、type/status/rule/description、shape rule action、definition/pending menu title、row label、action label、pending approval notice、pending proposal summary、vocab proposal 链接摘要和 inline submit affordance；这些必须由 predicate header model 拥有，table model/header renderer/primitive 只消费 model。” |
| “排序图标就放 columns builder 里。” | “sort icon 是 props-only primitive；columns builder 只传 column/sort state，不能直接 import icon library；装饰性图标必须 `aria-hidden`，可访问名称由列头按钮 owner 提供。” |
| “cell activation/commit 只是 table 里的几个 callback。” | “cell edit workflow 模板包含 activation plan、active editor state、popover placement、text/relation commit 和 outside pointer close；这些必须由 structured cell edit workflow controller 拥有，table 只消费状态和动作。” |
| “cell write pending/approval 展示只是 controller 里顺手算一下。” | “cell write proposal 模板包含 optimistic override、persisted pending 合并、resolved values、pending subject set 和 local proposal list；副作用在 controller，纯投影在 write proposal model，table 只消费 controller 暴露的状态和动作。” |
| “enum option 新增只是 cell popover 里的 add/remove 回调。” | “enum cell workflow 模板包含 observed/defined/pending option 合并、known option cell write、新 option vocab proposal 和 editor close；这些必须由 structured enum cell workflow controller 拥有，table/active cell 只消费回调。” |
| “打开定义或复制 URI 只是表格里的小菜单动作。” | “projection action workflow 模板包含 callback 优先、platform fallback、relation target 解析、内部导航和外部打开；这些必须由 structured projection action controller 拥有，table 只消费命名动作。” |
| “class 下拉里的创建区只是 toolbar 局部状态。” | “class scope menu workflow 模板包含 draft、展开状态、document reset 和 submit 后清空；纯状态转换属于 class scope menu model，controller 只负责 React state/effect 和提交接线，toolbar 只消费状态和动作。” |
| “toolbar 只是一些 icon buttons/filter dropdown。” | “structured toolbar model 包含 active filter、class option/proposal rows、view tabs、sort rows、sort/ns/visibility 工具可见性、namespace switch 和 predicate visibility rows；renderer 只消费 rows/flags 并绑定动作。” |
| “preview 里顺手拼一下当前 class 文案。” | “structured preview header model 包含 definition/pending/local fallback、display label 和 button label；preview 只把 header model 传给 toolbar。” |
| “preview 或 hook controller 里顺手写 `resolveEffectiveClassScope` callback。” | “view-state controller 接收 projection 并接线 metadata hydration/autosave；effective class scope 解析属于 `structured-view-state-model.ts`，preview 不能 import structured-table projector，controller 也不能导出纯 projection helper。” |
| “view metadata controller 顶部放几个 signature/helper 函数没关系。” | “metadata workflow 模板包含 stable signature、默认签名、document URI 归一化和 hydration plan；effect controller 只执行 query/mutation/toast/ref 更新，纯判断进入 workflow model。” |
| “cell proposal workflow 只是把 query 结果和本地 pending 数组拼一下。” | “cell proposal workflow 模板包含 pending query、local staged state、toast mutation 和 staged/persisted/local view proposal 投影；local pending subjects、table proposals、view proposals 必须是一个 workflow state container，副作用在 workflow controller，转换/合并/upsert 在 workflow model；controller 只能暴露命名 action，不能把 React setter 透传给 preview/table。” |
| “白板 relation 表单只是画布局部 state。” | “whiteboard relation workflow 模板包含 open/edit draft、create/update/remove/cancel；这些属于 relation controller。target options、save eligibility、chip label/aria fallback、id 生成和保存后 relation list 投影属于 relation model；toolbar/content availability 属于 whiteboard view model/controller；Whiteboard view 只消费状态和动作。” |
| “Whiteboard view 只是 SVG 和卡片。” | “whiteboard view 模板包含 card/relation projection、layout merge、available subject 投影、relation subject options、pointer drag 和 open suppression；拖拽/open suppression 属于 whiteboard view controller，纯 projection 属于 whiteboard view model，renderer 只绑定 SVG/node/form primitives。” |
| “SVG relation line 直接在 map 里找 from/to 节点就行。” | “whiteboard view model 生成 relationSegments，包含 endpoint lookup、坐标 anchor 和 source；controller 只接线，renderer 只渲染 line primitives。” |
| “Kanban 拖拽只是视图里的 DnD 状态。” | “Kanban move workflow 模板包含 pending state、cell write proposal、rollback/staged 和同列排序回调；这些必须由 Kanban move controller 拥有。pending display view model、展示列合并、status label 和 reorder subject list 属于 Kanban move model，Kanban view 只消费 display columns、pending move view 和命名动作。” |
| “Kanban view 只是 dnd renderer。” | “Kanban view 模板包含 cards/columns projection、group label、predicate option availability、card move menu availability、card count、card lookup、native drag hover state 和 drop routing；projection/lookup 属于 Kanban view model，native drag hover state 和 drop routing 属于 Kanban view controller，renderer 只绑定 DnD shell 和 card/column primitives。” |
| “class/predicate 新增只是 toolbar 或表头弹窗。” | “vocab proposal workflow 模板包含 term URI 生成、已有 term 判断、pending registry 合并、审批创建、打开/丢弃 proposal；query/mutation/effect 属于 structured vocab proposal workflow controller，纯合并/去重/projection 属于 vocab proposal workflow model，preview 只消费可见 pending 和命名动作。” |
| “locked vocab 表格只是只读 registry table。” | “locked vocab registry table 模板包含 search text state、column schema、filtered rows、per-cell value accessible label 和 per-cell open action projection；search text 由 registry table controller 拥有，column schema/filtered rows/display cells/value label/open action/empty-state flag 由 registry table model 拥有，preview/table renderer 只消费 table-ready model。” |
| “+predicate 菜单只是一个 dropdown。” | “predicate menu 模板包含已有 predicate 搜索投影、definition draft seed、draft patch、class scope hydrate、URI preview、shape 展开和提交 reset；open/search/draft/details 必须作为一个 add predicate menu state container，纯投影属于 add predicate menu model，React controller 只持有 state 和接线，dropdown 只渲染 byline 表单。” |
| “仅 Ingest 更新只是一个筛选开关。” | “source update workflow 模板包含 pending source proposal query、本地 staged map、按 subject 合并最新更新和投影过滤；query/state/reset 属于 structured source update workflow controller，合并与 projection 属于 source update workflow model，preview 只消费过滤后的 projection 和开关状态。” |
| “source-linked card preview 只是几个按钮和折叠详情。” | “source-linked card preview 模板包含 editor sheet open、source details 展开、action aria id、pending ingest range availability、action error、主内容可用性、detail rows 和 editor sheet readiness projection；open state / handler binding 属于 preview controller，preview-ready projection 属于 preview model。subject/body/proposal/filter/sort/fallback projection 属于 source-linked workflow model；renderer 只消费 `content/actionError/detailsPanel/editorSheet` 这类 preview-ready model。” |
| “文件详情 meta panel 只是把几个值传给编辑控件。” | “detail metadata panel model 包含 `.meta` URI fallback、meta Turtle predicate 提取、source-linked card descriptor 解析、previous RDF values 和 pending/error status chrome；detail metadata editor model 包含 pending/error 状态投影、hydrated pending fallback、草稿值归一化、context reset 和 hydration 覆盖计划；renderer 只消费 panel-ready props，并固定使用 structured predicate editor；controller 只持有一个 editor state，不能拆四个字段 useState 或保留第二套 plain input 模板。” |
| “`.meta` drawer 内容只是几组 rows。” | “meta sidecar content 模板包含 meta/folder/semantic/workspace rows、本地化标签、ACL/ACR raw fact 过滤和 raw/notice panel 状态；这些必须由 meta sidecar content model/controller 拥有，drawer/tail 只消费 content-ready model。” |
| “权限 dialog 里顺手 find candidate/filter grants，或者在 controller 里拆几个 draft state。” | “access policy dialog model 生成 active source view、ACR/ACL source rows、access matrix rows、select value parsing、draft patch、pending proposal staging 和 submit 后 reset；controller 只持有一个 dialog state container 并执行 query/mutation/toast/open 副作用；dialog renderer 只消费 rows/view。” |
| “cell primitive 只是一个 input/select。” | “predicate value editor 模板包含 draft/selected state、normalized values/options、enum create/filter、expanded/listbox availability、multi-select add/remove、boolean/scalar commit 和 RDF serialization；draft/selected 必须是单一 editor state container，React controller 只持有 state/事件，normalized/options/listbox/commit plan 属于 predicate value editor model，RDF serialization primitive 属于 domain editor plan，primitive 只渲染 DOM。” |
| “static cell 只是几个展示分支。” | “static cell display 模板包含 boolean eligibility、enum label、relation value/display label 和 scalar label 投影；这些必须由 static cell display controller 拥有，cell renderer 只消费 display union。” |
| “active cell 只是把 editor 打开。” | “active cell display 模板包含 text/relation pending 判断、relation values/display label、enum options/selected values 和 listbox id；predicate display label 来自上游 projection，controller 不能重新从 URI 推导；renderer 只消费 display union。” |
| “subject peek drawer 只是一个详情弹层。” | “subject peek body 模板包含 technical details open、type/location labels、source rows、fact display rows 和各 section visibility；纯 body projection 必须由 subject peek body model 拥有，technical details open 才由 controller 拥有；drawer chrome 模板包含 title/aria/icon kind；drawer renderer 只消费 peek-ready model。” |
| “peek footer 只是几个按钮。” | “subject peek action 模板包含 resource sidecar、external copy、source open、current-file close 和 primary open label；这些必须由 action model/renderer 拥有，preview 只传命名回调。” |
| “predicate/class 过滤只是 toolbar 状态。” | “projection filter 模板包含 schema projection、namespace/type/vocab filter、class definition lookup 和未应用 source/pending 过滤的 table projection；这些必须由 structured projection filter controller 拥有，preview 只消费投影和控件状态。” |
| “shape warning 和 raw view 只是 preview 文案。” | “projection review 模板包含 effective projection、raw projection、shape validation、warning/pending 行过滤和 status summary；开关 state/reset 属于 structured projection review controller，派生 projection/status 属于 projection review model，preview 只消费 review-ready projection 和开关状态。” |
| “raw view 里复制一个 RawTextBlock 很快。” | “RawTextBlock 属于 `ui/FileDetailPreviewPrimitives`；structured raw view 只做标题/说明/primitive 组合，preview 容器不能重复定义 props-only UI。” |
| “source unavailable / warning banner 只是几行 JSX。” | “structured alert renderer 包含 source unavailable、shape warning summary 和 projection parser warning；preview 只传 warning arrays 和 flags。” |
| “viewport scroll ref 只是容器里两个 useRef/useEffect。” | “structured viewport controller 包含 viewport ref、last scrollTop、scroll capture 和非 table 视图横向 reset；preview 只绑定 controller 输出。” |
| “subject navigation controller 顺手接管所有 viewport 状态。” | “subject navigation 管 route/peek/focus restoration；viewport controller 管 DOM viewport ref 和 scroll capture/reset，两者通过明确 props 接线。” |
| “subject navigation hook 顶部放几个 target/helper 函数没关系。” | “subject navigation model 包含 alternative-view open request、direct-navigation normalization、same-Pod source URI 和 scroll restoration target signature；controller 只执行 route/store/peek/focus 副作用。” |
| “`.ttl` 能不能改只是 preview 里的条件判断。” | “structured write capability 模板包含 `.data/.vocab/reserved` 与 Turtle mime/path 语义；这些必须由 `domain/structured/structured-write-capability.ts` 拥有，并由 resource preview controller 输出给 preview，preview 只消费 capability 结果。” |
| “resource preview controller 里顺手组 vocab URI 和 schema index。” | “resource preview model 包含 raw source fallback、fallback/discovered vocab registry URI、registry rows 到 definition index 的纯投影；controller 只负责 current Pod/root、raw resource query 和 vocab document query。” |

如果一条观察不能从右栏这种形式表达，它就属于视觉/交互 backlog，而不是模块抽象要求。反过来，只要它能写成右栏，就必须补 owner、禁止 import 和测试护栏，不只写一句原则。

## 七条边界线

任何前端模块都先画边界线，再拆组件：

| 边界线 | 容易出错的模板口子 | 正确归属 |
|--------|--------------------|----------|
| Authority line | route、store、query cache、组件 state 同时保存 durable/derived/selection/draft | Pod durable data、optimistic overlay、route、Zustand UI state、局部 edit state 各有单一 owner |
| Effect line | 展示组件里顺手写 mutation、toast、route、sheet、subscription refresh | feature controller 或 data mutation owner 编排副作用；纯 UI/domain 不触发副作用 |
| Projection line | JSX 中散落 filter/sort/open target/sidecar/RDF/path 判断 | domain projection 或 feature view model 先生成可渲染模型 |
| Reuse line | 视觉相似就抽到 `ui/`，但 props 里已经带 resource/query/store | props-only 才是 `ui/`；数据感知和 workflow 编排属于 `features/` |
| Transport line | feature/UI 直接拿 SolidDatabase、authenticated fetch、Pod root、Turtle IO | transport 只在 `data/pod-adapter` 或专用 data adapter |
| Semantic line | Web 里临时定义 vocab、approval、permission、resource normalization | 跨 Web/CLI/Service 的语义进入 `@undefineds.co/models` 或 shared use-case；Web-only interaction 留模块内 |
| Guard line | 文档写了边界，但没有 architecture test，后来又写回旧文件 | 重要边界必须有 architecture/domain/integration guard，不靠记忆 |

如果一个文件跨过两条以上边界，默认不是“文件大一点”，而是模板错误；先拆 owner，再谈组件美化。

## 模板口子

下面这些不是 Files 的具体细节，而是 AI/多人协作中最容易把逻辑写错层的模板入口：

| 模板口子 | 最容易诱导的错误 | 关闭方式 |
|----------|------------------|----------|
| 页面模板 | `Route/Page` 同时接 query、store、mutation、layout、domain switch | 页面只接 module shell；业务工作流下沉到 feature container |
| 容器模板 | `Pane/Panel` 既编排数据又内联复杂 JSX 决策 | 容器只绑定 controller 输出；复杂规则先变成 domain projection/plan |
| 交互状态机 | selection、range、focus、context-menu、keyboard 状态散在 shell | 命名 feature controller 拥有状态机；shell 只消费 state/actions |
| 内部子组件 | 父 feature 文件里藏带 query/mutation/toast/store 的 `function Child()` | 带副作用或业务数据的子工作流拆成命名 feature owner |
| 通用 UI | 为了复用把 resource、query result、store action 直接作为 props | `ui/` 只收展示模型和 callback；业务资源先被 feature 投影 |
| operation 模板 | sheet 组件定义 operation union、copy/title/description、initial value、destination/resource plan、submit readiness、路径校验、mutation、toast、后续 selection | operation copy/model/validation/initial value/destination/resource plan/submit readiness 属于 domain；mutation workflow 属于 feature controller；sheet 只渲染 |
| upload 模板 | controller 直接清洗文件名、推断 mime、判断 text/blob、拼目标 URI、再执行 mutation/toast | upload resource plan 属于 domain；controller 只执行 file IO、mutation、toast 和上传后导航 |
| headless 引擎 | TanStack/Tiptap/dnd-kit state 变成业务事实源，或 controller 返回 JSX/render callback | 引擎 state 只管交互；业务提交、approval、schema、projection 另有 owner |
| data facade | `queries.ts` / `collections.ts` / `index.ts` 变成万能工具箱 | facade 只转发和装配；cache/optimistic/use-case/adapter 分 owner |
| store 模板 | Zustand 保存 server data、derived rows、pending proposal 或 open decision | Zustand 只保存 UI ephemeral state；durable/derived/semantic decision 归 collection/domain/feature |
| preview 模板 | 一个 preview 文件同时读 source、发现 registry、构建 projection、提交 mutation、组合多个 view | preview 只做 composition；source/schema/workflow/state 分别由命名 controller/domain owner |
| adapter helper | feature/UI 直接碰 Pod root、fetch、Turtle IO、TypeIndex discovery | adapter 只做 transport；semantic decision 在 domain/resource 或 shared model |
| extension slot | `extraActions`、`renderMetaContent`、`customCell`、`renderX(children)` 承载业务流程 | slot 只接已投影模型；新增 workflow 必须命名 feature/domain owner |
| fallback 模板 | UI 填假数据、吞错误、绕过 schema/permission/cache bug | 错误暴露到 data/repository/permission owner；UI 只渲染错误状态 |

后续拆 Files 时，任何新文件如果落在这些区域，必须先写明 owner、输入、输出、副作用和禁止 import。

## 模板文件契约

每一种模板文件都必须有明确的“拥有/输入/输出/禁止”契约。新增文件时按下面格式自检：

```text
File: <path>
Layer: app | features | ui | domain | data/queries | data/collections | data/pod-adapter | shared
Owns: none | UI ephemeral | route bridge | workflow orchestration | projection | validation | optimistic overlay | transport
Inputs: props | query result | store slice | domain model | adapter result | shared model
Outputs: view model | callback | mutation command | route target | sidecar patch | approval proposal
Effects: none | mutation | invalidation | subscription | toast | route | sheet/dialog
Forbidden: <imports or responsibilities this file must never take>
Guard: architecture test | domain test | integration test | e2e
```

如果 `Owns` 超过一个核心职责，先拆文件。若 `Effects` 不是 `none`，该文件通常不能在 `ui/` 或 `domain/`。若 `Inputs` 直接包含 transport 对象，通常只能在 `data/pod-adapter` 或迁移期 facade。

## Owner / Facade 模板

模块里的 `index.ts`、`queries.ts`、`collections.ts`、root `*.ts` 默认都不是业务 owner。它们只有三种合法身份：入口 facade、兼容 shim、dependency wiring。只要它们开始拥有 workflow 方法体，就说明模板边界已经开始滑坡。

标准模式如下：

| 文件身份 | 可以拥有 | 不可以拥有 |
|----------|----------|------------|
| owner module | 一个命名 workflow 的模型、use-case 调用、cache 编排或 adapter 细节 | 反向 import facade、顺手接收页面/组件状态、扩大到第二个 workflow |
| facade index | shared singleton wiring、owner factory 调用、re-export query roots/runtime handles | RDF/parser/URI decision tree、optimistic snapshot 细节、TypeIndex/OCR/fetch adapter、业务审批语义、query-key registry 定义、mutable runtime state |
| root shim | 迁移期 `export * from './real-owner'` | 新逻辑、条件分支、默认 fallback、跨层 helper |

owner module 优先用 factory 接收依赖：

```text
create<Workflow>Collection({
  getDb,
  queryKey,
  cacheCollection,
  invalidationCollection,
  useCase,
})
```

这样可以避免 owner 反向 import `../collections`，也避免 facade 为了传一个 helper 继续膨胀。architecture test 要直接断言三件事：

1. owner 文件存在，并包含 workflow 的真实依赖或 use-case。
2. facade 只 import owner factory、调用 factory、re-export 结果。
3. facade 不包含该 workflow 的 adapter/helper 名称、长方法体或 `export const <workflow> = { ... }`。

Files 当前迁移中的 `resource-collection.ts`、`resource-query-collection.ts`、`sidecar-query-collection.ts`、`sidecar-mutation-collection.ts`、`resource-mutation-collection.ts`、`source-ingest-collection.ts`、`proposal-collections.ts`、`vocab-discovery-collection.ts`、`inbox-approval-source.ts` 都使用这个模板。后续拆 folder open、structured table controller 时也按同一模式处理。

## 模板边界审查协议

记录“坑”时先做模板审查，不先写具体页面结论。审查顺序固定为：

1. **找到诱导点。** 先问为什么这个错误容易被写出来：是目录名太泛、facade 太顺手、slot 太开放、headless 库状态太像业务状态，还是 root shim 太像 owner。
2. **确定失守边界。** 把问题归到 authority、effect、projection、reuse、transport、semantic、template guard 之一；归不进去的只算局部体验观察。
3. **指定 owner。** 明确应该由 `app/`、`features/`、`ui/`、`domain/`、`data/collections`、`data/pod-adapter` 或 shared model 拥有，不用“组件里先处理一下”作为答案。
4. **关闭逃生口。** 找到最短路径的错误写法，并用目录、命名、root shim 规则、props-only API 或 architecture test 让它变难。
5. **再处理细节。** 具体按钮、popover、cell、sheet、drawer 只作为症状和验收样例，不成为模块抽象的主语。

一条坑如果不能写成“模板口子 -> 边界失守 -> owner -> 护栏”，就不要进入本规范。它可以留在 feature issue、视觉 spec 或组件 TODO，但不能污染模块模板。

审查结果按三档处理：

| 档位 | 处理方式 |
|------|----------|
| 局部体验问题 | 进入 feature/design backlog，不改模块模板。 |
| 单点边界泄漏 | 增加/调整一个 owner 和一个 architecture/domain test。 |
| 模板诱因问题 | 更新文件契约、目录规则或 facade/slot 规则，再用扫描型 architecture test 阻止回流。 |

默认优先判断“模板诱因”是否存在。不要因为当前只看到一个文件，就把它当成单点问题；如果同一个目录、slot、facade 或 headless hook 会诱导下一个功能继续犯错，就按模板诱因处理。

典型模板口子的处理方式：

| 模板口子 | 容易诱导的错误 | 关闭方式 |
|----------|----------------|----------|
| `components/` | 把 smart container、query、mutation、workflow 都当组件放进去 | 迁移期只允许 re-export shim；真实 owner 在 `features/` 或 `ui/` |
| root `*.ts` | 兼容导出逐渐变成隐性业务层 | root 只能 shim；生产代码直接 import owner layer |
| `queries.ts` / `collections.ts` | React facade、cache、use-case、resource writes 混成一层 | 拆 `data/queries`、`data/collections`、`data/proposal`、`data/ingest` |
| render slot | 通用模板通过 `extraActions`、`renderCell`、`renderMetaContent`、`renderX(children)` 承载业务例外 | slot 只接已投影模型和 callback；业务例外先命名成 domain/feature 模型，portal/layer/meta tail 用命名组件 |
| headless engine | TanStack/Tiptap/dnd state 反向成为业务事实源，controller 返回 JSX/render callback | 引擎 state 只做交互；业务提交、approval、schema、projection 另有 owner；渲染层用命名组件 |
| adapter helper | feature/UI 直接碰 Pod root、fetch、Turtle IO、TypeIndex discovery | transport 留在 `data/pod-adapter` 或专用 data adapter |

Files 当前的 `components/` 是迁移期兼容目录，不是模块模板。`app/files-app.architecture.test.ts` 必须扫描整个目录，保证里面只 re-export `app/`、`features/` 或 `ui/` owner；如果以后需要新增真实组件，先判断它是 props-only `ui/` 还是数据感知 `features/`，不要放回 `components/`。

## 架构坑记录格式

后续记录“坑”时，不按页面或按钮罗列，而按**模块模板为什么允许这个错误发生**来写。每条记录只保留六项：

| 字段 | 要回答的问题 |
|------|--------------|
| 触发症状 | 用户或开发者看到的混乱是什么？这是证据，不是结论。 |
| 失守边界 | 是 authority、effect、projection、reuse、transport、semantic，还是 guard？ |
| 正确 owner | 这个事实、动作或规则应该由哪一层、哪个命名 owner 拥有？ |
| 禁止捷径 | 哪种“写起来最快”的做法以后不能再出现？ |
| 模板修复 | 需要新增/调整哪个目录、文件模板、命名、facade 或 slot 规则？ |
| 执行护栏 | 用 architecture test、domain test、集成测试还是迁移清单防止回流？ |

每条记录最后补一句模板更新：

```text
以后新增同类能力时，先创建/修改 <layer>/<owner>，并用 <test type> 阻止 <forbidden shortcut>。
```

没有 owner 和 guard 的记录只算观察，不算已吸收的架构规则。

## 架构与模板边界坑

这些坑不是某个按钮或列表项的细节，而是模块模板一开始没立住时会反复出现的问题：

- **目录语义失效。** `components/`、`lib/`、root `*.ts` 变成所有逻辑的收容器，目录名不能回答“这东西是否可复用、是否有副作用、是否拥有事实”。
- **从 JSX 开始。** 没先立 contract、owner 和 projection，开发会自然从页面里堆 query、store、mutation、layout、business switch，后续拆分只是搬家。
- **数据权威倒挂。** Pod durable data、optimistic overlay、derived projection、selection、route、sheet open 混进同一个 store 或组件 state，刷新、订阅和回滚语义不清。
- **facade 变核心。** `queries.ts`、`collections.ts`、`index.ts`、compat shim 从入口转发变成业务层和工具箱，任何新功能都往里面追加。
- **projection 晚于 rendering。** filter/sort/open target/sidecar/schema/pending 标识在 JSX 里临时判断，导致每个视图复制一套业务规则。
- **effect owner 缺席。** mutation、toast、route、sheet、subscription refresh、cache invalidation 被多个组件触发，同一个 workflow 出现多个入口和多个后续动作。
- **render slot 变逃生口。** `extraActions`、`renderMetaContent`、`customCell`、`renderX(children)` 把业务例外交给 caller，presentation owner 和 workflow owner 分裂。
- **交互状态机藏在 shell。** selection、range、focus、keyboard、context-menu deferred selection、drag/drop 直接写在 pane 中，后续每个视图都改同一组状态。
- **operation model 被 UI 拥有。** dialog/sheet 顺手定义 operation union、路径校验、冲突消息和确认逻辑，UI 组件变成业务模型 owner。
- **headless 库越权。** TanStack Table、Tiptap、dnd-kit、tldraw 的 state 被当成业务事实源，而不是交互引擎。
- **adapter 污染业务。** current Pod root/base、authenticated fetch、Turtle IO、TypeIndex discovery、sidecar rewrite 等机械细节进入 feature/UI。
- **UI fallback 掩盖系统问题。** 为了“不空白”补假数据或静默降级，实际隐藏 repository、schema、permission、SPARQL、cache 或 rollback bug。
- **跨模块模板漂移。** Files、Chat、Inbox 各自发明命名、目录、store、query facade、error handling，新人和 agent 无法迁移经验。
- **文档没有执行力。** 只有说明文字，没有 architecture test，下一次 AI 或协作者仍会按最近文件和最短路径写回旧结构。

这些问题的共同根因是：模块没有先拥有一个可执行模板，也没有让 import graph 替团队守边界。

## 模块模板

每个业务模块都应有同一套模板骨架。具体目录可以渐进迁移，但新增代码必须能归入其中之一：

```text
module/
  app/        shell glue: root exports, route bridge, module store, micro-app assembly
  features/   smart containers: query/store/domain/ui orchestration
  ui/         data-free UI: props/callbacks/local visual state only
  domain/     pure decisions/projections/plans/validation
  data/
    queries/      React query facade and workflow-specific query hook owners
    collections/  cache, optimistic update, invalidation
    pod-adapter/  Solid Pod/read-write transport mechanics
```

模板不是为了增加目录，而是为了让每个文件在创建时就回答：

- 它是否知道数据从哪里来？
- 它是否拥有副作用？
- 它是否能脱离当前业务模块复用？
- 它是否定义 durable 业务语义？
- 它是否只是 transport/cache adapter？

回答不清楚时，先不要写组件，先拆 decision 或 projection。

## 分层契约

### `ui/`: 可复用、无数据依赖

`ui/` 只负责可视结构和局部交互。它可以持有输入框当前值、popover 开合、hover/focus 等局部状态，但不能知道数据来自哪里。

允许：

- React、DOM、Radix、lucide、共享基础 UI、`cn`。
- props、callback、children、局部 `useState`。
- 无业务含义的展示模型，例如 `title`、`description`、`items`、`pending`、`validationMessage`。

禁止：

- `../queries`、`../collections`、`../store`、`../browser`、`../FilesRouteContext`。
- `../domain`。纯 UI 只能接 feature 已投影好的展示模型，不能直接消费业务 decision 或 resource semantics。
- TanStack Query/DB、SolidDatabase provider、current Pod helper、authenticated fetch。
- durable resource 类型作为核心 props，例如直接要求 `FilesEntry`，除非该组件明确属于 feature 层。
- 业务语义 ID/URI/path 作为默认逻辑，例如 `subject`、`__addPredicate`、vocab term URI、resource sidecar path。`ui/` 可以接收 `isCellInteractive` 这类无业务名的 callback，但具体判断必须由 feature/domain owner 传入。
- toast、route navigation、Pod mutation、cache invalidation。

### `features/`: 数据感知的业务容器

`features/` 组合 query hooks、store、domain models 和 `ui/` 组件，负责把模块数据变成用户工作流。

允许：

- 读取 query hooks 和 Zustand UI 状态。
- 触发 mutation hooks、toast、route bridge、selection、drawer/sheet orchestration。
- 组合多个纯 UI 组件。
- 调用 `domain/` 里的 projection、decision、validation。

禁止：

- 直接访问 SolidDatabase provider、`getSolidDataset`、authenticated fetch。
- 通过 root compatibility shim 取数据或模型，例如 `../queries`、`../browser`、`../collections`、`../store`。feature 必须直接 import `data/queries`、`app/store`、`domain/*` 等真实 owner。
- 直接 import collection internals，除非该文件本身就是 data facade 测试。
- 在 JSX 中手写复杂业务规则；复杂规则先下沉到 domain 函数并加测试。
- 在 cell primitive、popover 或 inline editor 中定义 RDF literal/IRI/date/boolean 序列化；display value 到 canonical RDF value 的转换属于 `domain/structured`。
- 在内层 cell/popover/predicate header/menu 组件里直接调用 `window.open` 或 `navigator.clipboard`；打开外部 URI、proposal、term definition、shape rule、subject target 或复制 URI 必须通过 owner callback 上抛到 table/preview/shell 层。
- 直接调用 `window.open`、`navigator.clipboard` 或 `window.xpodDesktop`；外部打开、复制文本和桌面系统打开属于 `app/platform-actions`，feature 只调用命名平台动作。
- 直接调用 `useFilesStore.setState` 拼 UI workflow；selection、detail tab、sheet request、return context、view metadata 等组合状态必须由 `app/store` 的命名 action 拥有，feature 只通过 selector 取得 action。

### `domain/`: 纯业务模型与投影

`domain/` 放 UI 无关、可测试、可跨 shell 迁移的业务逻辑。

允许：

- TypeScript 纯函数、类型、projection、decision tree、validation、plan builder。
- 依赖 `@undefineds.co/models` 暴露的共享 RDF/resource 语义。
- 拥有 UI 无关的 RDF display/edit 转换，例如 structured cell editor plan、typed literal/resource value quoting、predicate value serialization。

禁止：

- React、Zustand、TanStack、DOM、toast、fetch、SolidDatabase provider。
- 直接读写 Pod。
- 定义应由 `@undefineds.co/models` 拥有的共享 RDF contract。若语义跨 Web/CLI/Service，先按 `docs/pod-interaction-layering.md` 评估迁移目的地。

### `data/queries`: React 查询门面

`data/queries` 是 React UI 与 collection/cache 的边界。`index.ts` 是对外门面，不是所有 hook 的长期收容器；独立 workflow 的 query/mutation hooks 应先放入命名 owner 子模块，再由 `index.ts` re-export。

允许：

- React Query hooks、session/db context、query enabled 状态。
- 组合 collection query wrapper。
- 按 workflow 拆分 query owner 子模块，例如 `source-ingest-queries.ts`、`proposal-queries.ts`、resource、sidecar 等，再从 `index.ts` 转发。
- 隔离兄弟模块 React hook 依赖，例如 Chat/Favorites/Inbox 只能通过 `chat-source-queries.ts`、`favorite-queries.ts`、`inbox-approval-queries.ts` 这类 Files adapter owner 暴露为 `useFiles*` 名称。

禁止：

- 自己维护 query-key registry。
- 自己写 `invalidateQueries`、optimistic stage/commit/rollback、cache restore。
- 绕过 collection 直接调用 Pod adapter。
- 让 `index.ts` 继续沉淀大段 workflow-specific hook 实现；新增独立 workflow hooks 先建 `data/queries/<workflow>-queries.ts`。
- 把 approval/proposal 的 create/pending/approve hooks 放进 `proposal-queries.ts`；`index.ts` 只 re-export。
- 通过 root compatibility shim 取 resource 或 structured model，例如 `../browser`、`../structured-table`；query facade 直接 import `domain/resource/*`、`domain/structured/*` 和同层 `data/collections`。
- 让 `features/`、`domain/`、`ui/` 或普通 query owner 直接 import `@/modules/chat`、`@/modules/favorites`、`@/modules/inbox` 的 collection/store。新增兄弟模块依赖必须先建 Files 命名 adapter owner。

### `data/collections`: cache、optimistic update 与 mutation adapter

`data/collections` 服务 Web 的 reactive UI 和 optimistic update。`index.ts` 是 collection facade 和 dependency wiring，不是 workflow 方法体的长期收容器。一个 workflow 如果同时碰 use-case、optimistic cache、rollback、invalidation、跨 collection query key，就必须先拥有 `data/collections/<workflow>-collection.ts`，再由 `index.ts` 注入依赖并 re-export。

允许：

- TanStack DB collection、React Query cache bridge、query-key roots、invalidation。
- optimistic stage/commit/rollback。
- 调用 shared use-case 或 pod adapter，并把结果 patch 回 UI cache。
- 调用 `data/cache` 的参数化 cache recipe 和 `runOptimisticMutation`，而不是在 collection facade 或 workflow owner 内重复实现 snapshot/restore、cache write、optimistic overlay、query invalidation graph 或 scoped refresh。
- 按 workflow 拆分 collection owner，例如 `resource-collection.ts`、`resource-query-collection.ts`、`sidecar-query-collection.ts`、`sidecar-mutation-collection.ts`、`resource-mutation-collection.ts`、`source-ingest-collection.ts`、`proposal-collections.ts`、`vocab-discovery-collection.ts`；owner 模块接收 `getDb`、query-key resolver、cache collection 和 invalidation collection 作为依赖，避免反向 import `data/collections` facade。
- 把 shared resource adapter wrappers 和 entry list strategy 放进 `resource-collection.ts`，例如 current Pod root resolver、folder/list/all/recent/chat-files 入口、confirmed transfer overlay merge 和 read/write adapter wrapper；`collections/index.ts` 只实例化并导出它。
- 把跨模块 collection 读取包成命名 adapter owner，例如 Files 读取 Inbox approval list 只能通过 `inbox-approval-source.ts` 注入 proposal collections；`collections/index.ts` 不直接 import `@/modules/inbox/collections`。

禁止：

- JSX、toast、route、DOM。
- 把 collection 当成业务 use-case 的唯一归属。跨资源、跨 shell、带权限/审批/幂等语义的动作必须先抽 use-case。
- 在 collection facade 或 workflow owner 内沉淀可复用 React Query cache mechanics。凡是能用“输入 query root / resource URI / workflow scope，输出 snapshot / rollback / invalidation graph / cache patch”的流程，都属于 `data/cache`。凡是重复出现的 `stage -> mutate -> commit -> restore -> invalidate` 顺序，也属于 `data/cache/optimistic-mutation`；collection owner 只描述每一步调用哪个业务命令。
- 在 `data/collections/index.ts` 继续追加大段 workflow-specific 方法体。facade 只负责 re-export query roots、共享 resource collections 和 owner 模块的依赖装配。
- 在 `data/collections/index.ts` 直接 import sibling module collections。跨模块数据源必须先进入命名 adapter owner，再作为 factory dependency 注入具体 workflow owner。
- 让 collection owner 模块 import `../collections` 或 root `collections.ts` shim。owner 之间需要共享能力时，通过 factory dependency 注入 query key、cache/invalidation adapter 或 use-case，而不是制造循环依赖。

### `data/proposal`: proposal resource IO 与状态提交

`data/proposal` 拥有 proposal 文件本身的读写、etag 冲突重试、status 提交、pending proposal target 读取，以及 proposal approval command 的 resource/row 写入。它处理 proposal 数据 use-case，不定义 proposal RDF 语义，也不编排用户可见的审批 workflow。

允许：

- 调用 `data/pod-adapter` 读取/保存 proposal Turtle resource。
- 调用 `domain/proposal` 的纯 RDF parser/updater。
- 处理 etag conflict、pending/approved/rejected 状态提交的幂等重试。
- 创建 approval/audit/notification rows，或把已审批 proposal 应用到目标 resource。
- 提供 `*-proposal-use-cases` 和 `proposal-query-use-cases` 给 collection cache adapter 调用。

禁止：

- 定义 RDF status/parser/serialization 规则；这些属于 `domain/proposal`。
- 编排 approval collection、toast、route、sheet；这些属于 feature 或 app shell owner。
- 放在 root `proposal-status.ts`、`proposal-query-use-cases.ts`、`access-policy-proposal-use-cases.ts`、`source-update-proposal-use-cases.ts`、`ai-change-proposal-use-cases.ts`、`structured-cell-proposal-use-cases.ts`、`vocab-term-proposal-use-cases.ts`、`access-approval.ts`、`source-approval.ts`、`ai-change-approval.ts`、`structured-cell-approval.ts`、`vocab-approval.ts` 这类文件里实现。root 只能保留兼容 shim。

### `data/ingest`: source material 读取与 Ingest manifest IO

`data/ingest` 拥有 source material 进入 Files/card 前的数据适配：读取 URL/文件字节、调用 Ingest adapter、生成渐进式 snapshot、读写 Ingest manifest resource、处理 missing/conflict/retry，以及创建/刷新 source-linked card 所需的数据 use-case。它不拥有用户可见的 toolbar/sheet 工作流，也不定义 source-linked card 的纯业务语义。

允许：

- 调用 `data/pod-adapter` 读写 `.data/ingest/**/manifest.ttl`。
- 调用 `domain/source` 的 manifest parser/render、plan、snapshot 类型。
- 隔离 reader/OCR/parser/indexing adapter 这类机械动作，并把结果投影成 Ingest snapshot 或 manifest command。
- 把 legacy source extractor 命名兼容放在 `data/ingest` 内部，root 只 re-export。
- 提供 `source-ingest-use-cases` 给 collection cache adapter 调用，collection 只负责 cache/optimistic/invalidation。
- 保留 legacy `source-index` 兼容解析，但新写入走 Ingest 命名。

禁止：

- 在 root `source-ingest-use-cases.ts`、`source-ingest-service.ts`、`source-ingest-snapshot.ts`、`source-extractor.ts`、`source-index-service.ts` 中实现新数据逻辑；root 只能兼容导出或 deprecated no-op。
- 直接弹 toast、改 route、选中文件或打开 sheet；这些属于 `features/ingest` 或上层 use-case。
- 让 reader/parser/OCR/indexing 这些 adapter 名称成为用户心智主概念；产品语言统一为 Ingest。

### `data/vocab`: vocab discovery 与 registry 数据入口

`data/vocab` 拥有 vocab registry 的数据发现入口，例如 Solid Type Index profile/preferences/public/private registry discovery、authenticated text reader 和 collection-facing discovery result。它不拥有 class/predicate/shape 的 RDF 业务定义。

允许：

- 读取 WebID profile、public/private Type Index、preferences resource。
- 解析 TypeRegistration，区分 public/private registration source。
- 给 `data/collections` 提供 discovery 查询函数和结果类型。

禁止：

- 定义 class/predicate/shape 的 term RDF parser 或 approval 语义；这些属于 `domain/structured` 与 `data/proposal`。
- 在 root `vocab-discovery.ts` 中实现 discovery；root 只能兼容导出。
- 让 conventional `/.vocab` 路径绕过 Solid Type Index discovery 直接伪装成注册结果。

### `data/pod-adapter`: Solid Pod 访问适配器

`data/pod-adapter` 隔离 transport 与 Pod 机械细节。

允许：

- SolidDatabase、authenticated fetch、resource read/write、container/listing、sidecar read/write。
- current Pod base/root 解析。
- drizzle-solid / Inrupt / TypeIndex 适配。

禁止：

- React、Zustand、TanStack Query、toast、组件类型。
- 用户工作流和视觉状态。

### `app/`: 模块入口和 shell glue

`app/` 只放模块对外入口、route bridge、module store、feature flags、micro-app 注册 glue。

允许：

- root exports、module store、feature flags、route context、layout pane assembly。
- browser/desktop platform action owner，例如 `openFilesExternalUri`、`copyFilesText`、`openFilesSystemExternalUri`。

禁止：

- Pod 读写、业务 transaction、复杂 projection。

## 依赖方向

```text
app
  -> features
      -> ui
      -> domain
      -> data/queries
            -> data/collections
                  -> domain
                  -> data/pod-adapter
                        -> Solid Pod / drizzle-solid / @undefineds.co/models

ui      -> shared visual primitives only
domain  -> shared models/types only
```

任何反向依赖都要通过 architecture test 阻止。特别是 `ui -> features/data/store`、`domain -> React/data`、`features -> pod-adapter`。

## 边界决策规则

用以下规则判断一个新函数、新组件或新 hook 应该放哪层：

| 现象 | 放置位置 | 原因 |
|------|----------|------|
| 只需要 props 和 callback 就能渲染 | `ui/` | 可复用展示，不知道业务事实 |
| 读取 query/store，触发 toast/sheet/route | `features/` | 用户工作流编排 |
| 做排序、投影、open decision、validation、plan | `domain/` | 可测试的纯业务判断 |
| 包装 React Query、enabled、context db/session | `data/queries` | React 数据入口 |
| 绑定 optimistic stage/commit/rollback/invalidate 到具体业务命令 | `data/collections` + `data/cache` | `data/cache` 拥有通用 sequencing/recipe，collection 只注入 workflow 输入和 command |
| 读写 proposal Turtle resource、处理 status etag conflict、approval command | `data/proposal` | proposal 文件级 IO / row 写入 adapter |
| 处理 fetch、SolidDatabase、Turtle IO、Pod base | `data/pod-adapter` | transport 和 Pod 机械细节 |
| 被 Web/CLI/Service 都需要 | `@undefineds.co/models` 或 shared use-case | 共享数据面/业务语义 |

如果一个文件同时满足多行，不要“选一个放进去”，而是拆成多个文件。

## Smell 检查清单

看到这些信号时，应暂停继续堆功能，先修边界：

- 一个文件同时 import `react`、`zustand/store`、`queries`、`browser/pod adapter`。
- `ui/` 组件 props 出现 durable resource 类型，并且组件只是为了取几个展示字段。
- JSX 里出现长 switch/decision tree，或者直接拼 RDF/URI/path。
- store 里保存 Pod 返回的 durable data，而不是 selection/filter/open state。
- feature 组件出现 `useFilesStore.setState`，说明 app/store 没有给对应 UI workflow 提供命名 action。
- query hook 里出现 `invalidateQueries`、stage/commit/rollback 或自建 query-key registry。
- feature 组件直接 import collection internals、Solid provider、current Pod base helper。
- collection 里出现 toast、route、JSX、DOM event。
- 同一个 authenticated fetch/current Pod resolver/sidecar rewrite 逻辑复制到多个业务文件。
- 为了 UI 不报错添加 fallback 数据，而没有修 repository/schema/permission/cache。
- architecture test 只检查某个旧文件，没有扫描新目录。

这些 smell 不是“代码风格问题”，而是边界失守的早期信号。

## 模板执行流程

重构或新增模块时按这个顺序推进：

1. **写模块 contract。** 说明事实归属、入口、数据权威、side effects、共享语义归属。
2. **建目录骨架。** 至少明确 `ui / features / domain / data / app` 的迁移目标。
3. **写 architecture tests。** 先锁禁止 import，再迁移代码。
4. **抽 domain。** 先把决策、投影、validation 拿出 JSX。
5. **抽 ui。** 只抽 props-only UI；如果抽出来还需要 store/query/resource，就说明它不是 UI。
6. **收敛 feature。** feature 只做 orchestration，不再拥有长业务规则。
7. **收敛 data。** queries 只做 React facade，collections 管 cache，pod-adapter 管 transport。
8. **再考虑共享化。** 跨 shell 语义才进 `@undefineds.co/models` 或 shared use-case。

每一步都要小改、可测、可回滚。不要用一次大搬家替代边界修复。

## Files 目标结构

Files 先按以下结构迁移，不要求一次完成：

```text
apps/web/src/modules/files/
  app/
    index.ts
    FilesRouteContext.tsx
    store.ts
  ui/
    operation-sheet.tsx
    empty-state.tsx
    list-row.tsx
    compact-table-shell.tsx
    rich-text-editor.tsx
  features/
    tree/
    list/
    detail/
    folder/
    editor/
    structured/
    sidecars/
    access/
    ingest/
  domain/
    resource/
    list/
    detail/
    folder/
    structured/
    vocab/
    sidecar/
    approval/
    ingest/
  data/
    queries/
    collections/
    cache/
    pod-adapter/
    proposal/
    vocab/
    ingest/
```

当前 `components/` 可以作为迁移期目录存在，但它不是目标模板。新增或重构时必须明确文件属于哪一层。新抽出来的无数据组件优先放入 `ui/`，新的业务容器优先放入 `features/`。

## Files 关键边界

下面是 Files 对通用模板的应用示例，不是把所有 Files 细节写死在本规范里：

这一节只允许记录“Files 迁移中已经确认的 owner/guard 样例”。不要继续把具体视觉要求、按钮位置、文案、间距写到这里；那些内容应进入 Files 交互 spec 或 prototype backlog。若新增一条 Files 经验，必须能回答它对应哪条通用边界线，以及同类模块以后如何复用这个判断。

- 文件夹列表、文件详情、结构化表格、Tiptap 编辑 sheet 都是 feature 容器，不是纯 UI。
- Files list column header 只渲染 `columns + sortKey + onSort`，属于 `ui/`；`name/kind/mimeType/size/modifiedAt` 的列顺序、文案和响应式宽度属于 `features/list/files-list-column-header-model.ts`，sort field union 属于 `domain/list/list-view-model.ts`。不要让 `ui/FilesListColumnHeader.tsx` 重新定义 Files list schema。
- Files list row 只渲染 row view model，属于 `ui/`；`resource/container` 到 folder/document 图标的转换先在 `domain/list/list-view-model.ts` 投影为 `iconKind`。不要让 `ui/FilesListRow.tsx` 重新判断 resource kind 或调用 Files semantic helper。
- Tiptap rich text surface 本身只接最小内容模型和 callbacks，属于 `ui/`；保存、meta、approval、source-linked body 选择等工作流由 `features/editor` 或 `features/detail` 拥有。`ui/RichTextFileEditor.tsx` 只能接 generic `RichTextEditorContent`，不能接 `FilesDetail`、`mimeType`、`previewText` 或 `sourceText` 这类 Files 资源字段；MIME/preview/raw source 到 editor content 的映射属于 `features/editor/file-editor-sheet-model.ts`。
- Tiptap 文档摘要也不能用 Files/card 语义命名回流到 `ui/`。`ui/rich-text-file-editor-model.ts` 只能输出 generic `RichTextEditorDocumentSummary`（例如首个 heading 和链接集合）；source-linked card 的 `SourceUpdateCardMetadata` 解释属于 `features/editor/useFileEditorSheetController.ts` 调用 source proposal model 时的 workflow 语义。
- Rich text editor 内部的 generic UI 状态也要继续抽象：dirty/save status 这类成对变化的状态必须作为一个 `RichTextEditorSaveState`，link menu 的 open/href draft 必须作为一个 `RichTextEditorLinkMenuState`，slash block command menu 的 open/activeIndex 必须作为一个 `RichTextEditorBlockCommandMenuState`，block move menu 的 open state 必须作为一个 `RichTextEditorBlockMoveMenuState`，由 `ui/rich-text-file-editor-model.ts` 提供 create/project/label；`ui/RichTextFileEditor.tsx` 只负责 Tiptap/DOM 事件接线和 ref 同步，不能拆 `isDirty` 与 `saveState`、`linkMenuOpen` 与 `linkHref`、`blockMenuOpen` 与 `blockMenuActiveIndex`，也不能用裸 `useState(false)` 管块移动菜单这类可投影 UI 状态，不能在 JSX 里用三元表达式重新定义保存状态机或键盘菜单状态机。这个规则适用于所有 props-only 编辑器 surface：局部状态可以在 `ui/`，但状态机要进同层纯 model。
- Rich text editor 不能直接识别 source-linked/Ingest marker 或硬编码 AI/Ingest 审批文案；`features/editor/file-editor-sheet-model.ts` 先把 raw source 投影为 clean rich editor content 与 generic `warning`，`ui/RichTextFileEditor.tsx` 只负责显示 warning 和触发回调。
- 编辑器弹窗里的内部子块不能因为视觉上很小就直接拥有 mutation/toast/conflict；`FileEditorRawSourceEditor.tsx` 只渲染 raw source textarea、按钮和状态，`features/editor/file-editor-raw-source-model.ts` 拥有 raw source loading/unavailable/ready state、ready resource 提取、raw draft projection、raw resource signature、draft patch、hydration 计划、dirty 判断、save payload/error copy、generic proposal readiness，以及 loading/unavailable/textarea/resource summary/action label 这组 raw source chrome。`features/editor/useFileEditorRawSourceController.ts` 只持有一个 draft state container，执行 canonical save mutation、generic proposal 提交和 toast；不能用裸 `useState('')` 加 `useEffect([rawResource])` 根据对象引用直接覆盖本地草稿，也不能把 raw source 子视图接口命名成 `onSubmitAiProposal` / `aiProposalPending` 后再拿来承载 Ingest。`features/editor/useFileEditorSheetController.ts` 拥有 raw/meta query、save/source/AI proposal mutation、toast、route return 和 editor open 状态接线；note title/content view 这组 sheet shell state 的默认值、title patch、content view normalize 和 document/capability reset，note title 提取/替换、source-linked staged draft、source-linked summary panel rows、structured return action availability/label、raw source fallback、rich/raw capability、rich content loading/unavailable/ready state、sheet 顶层 chrome、rich/raw content view option 和 byline rows 属于 `features/editor/file-editor-sheet-model.ts`。controller 只持有 sheet state 容器并调用 projector，不能把 `noteTitle`、`contentView` 和 `canUseRichEditor ? 'rich' : 'raw'` reset 规则拆回多个 hook/effect。`FileEditorSheet.tsx` 不能直接读取 `editor.rawQuery`、`editor.rawResource` 或 `editor.effectiveSourceText` 来决定 rich/raw 分支，也不能直接读 `sourceLinkedDescriptor.sourceUri/sourceIngestManifestUri`、直接读 `structuredSubjectReturnContext.subject`、硬编码 title/byline/content scroll aria、resource summary、source-linked panel row labels、structured return action label、rich/raw tab label，或把 raw source state 拆成 `rawResource/isLoading/error` 三件套传给子组件。这个样例对应内部子组件/effect owner，不是“原始内容按钮怎么设计”的交互细节。
- Compact table shell 只渲染 TanStack table、resize handle、cell activation 回调，属于 `ui/`；它只能接收 `isCellInteractive` 这类 generic callback，不能内置 `subject`、`__addPredicate` 或 readonly predicate 列的判断。predicate schema、cell edit plan、proposal、view state 和 structured column activation rule 仍由 `features/structured` 与 `domain/structured` 拥有，并用 architecture test 阻止业务列名回流到 `ui/CompactTableShell.tsx`。
- workspace content shell 和 route bridge provider 属于 `app/`；资源树读取 store/query 并编排展开/折叠/选择，属于 `features/tree`。layout registry 应直接加载这些 owner，不通过 `components/` shim。
- Files 资源树也必须拆出 controller owner：`features/tree/useFilesTreePaneController.ts` 拥有 root/child tree query、workspace context、store selection/expand/collapse workflow 和 handler 绑定；root 的 loading/error/empty/content state、child loading/content state、header description copy、rail/tree/loading/error chrome、node selected/expanded/canExpand/loading/toggle label view state 属于 `domain/resource/tree-model.ts` 的投影函数，renderer 只消费 `contentState` / `childrenState` / `chrome` / controller 返回的 node state。`FilesTreePane.tsx`、`TreeChildren`、`CollapsedTreeRail` 只渲染节点和绑定 controller action，不能直接 import store 或 query hook，也不能直接读取 `tree.isLoading`、`tree.error` 或 `treeChildren.isLoading`，不能硬编码资源树 header、展开/收起、tree aria、loading/error 文案。`canExpandFilesTreeNode`、`projectFilesTreeNodeViewState`、`projectFilesTreeHeaderDescription` 和 `projectFilesTreeChromeModel` 属于 `domain/resource/tree-model.ts`，不是 JSX 或 controller 局部 helper；controller 不能硬编码“当前话题”说明文案或直接判断 node 是否可展开。
- `.ttl` 嵌入式表格属于 structured feature；普通可编辑文件的弹出 sheet 属于 editor feature。
- `.meta/.acl/.acr` 是文件级 sidecar，sidecar 读写规则属于 domain/data；弹窗或抽屉只是 feature 展示。
- `.meta` drawer、Access dialog、sidecar action buttons 属于 `features/sidecars`；其中 Access dialog 的 access query、pending proposal hydration、proposal mutation、pending proposal display availability、toast、policy source open fallback 和 dialog state container 必须由 `features/sidecars/useAccessPolicyDialogController.ts` 拥有，draft patch、select value parsing、本地 pending proposal staging 和 submit 后 reset 必须由 `domain/resource/access-policy-dialog-model.ts` 拥有；action button 的 sidecar owner target、sidecar URI projection 和 access dialog open/close state 必须由 `features/sidecars/useResourceSidecarActionsController.ts` 拥有，`ResourceSidecars.tsx` 只渲染 drawer/dialog/action buttons 并绑定命名动作，不能直接读取 `displayedPendingProposals.length`。`components/` 只能保留迁移期 shim 或未来抽出的 props-only 视觉片段。
- Access dialog 的 active source view、access query error message、ACR/ACL source rows 和 access matrix rows 属于 `domain/resource/access-policy-dialog-model.ts`；`ResourceSidecars.tsx` 不能直接 `.candidates.find`、`grants.find`、`grants.filter` 或定义本地 access mode formatter，`useAccessPolicyDialogController.ts` 也不能保留本地 query error formatter。
- `.meta` drawer 的 sidecar query 也不能留在 drawer 渲染函数里；`ResourceMetaDrawer` 只组合 `SidecarDrawer` 和 `ResourceMetaSidecarContent`，`features/sidecars/useResourceMetaDrawerController.ts` 拥有 `useFilesMetaSidecar` query。`.meta` 内容里的 file/folder/semantic/workspace rows、access-policy fact 过滤和对应 section availability 属于 `features/sidecars/useResourceMetaSidecarContentController.ts`；`ResourceSidecars.tsx` 不能直接调用 `getFileMetaRows`，也不能读取 `folderRows.length`、`semanticRows.length` 或 `workspaceRows.length`。这个样例对应 sidecar/query/projection owner，而不是“抽屉长什么样”的交互细节。
- Sidecar dialog/drawer 可以作为 feature owner 提供默认浏览器打开策略；内部 row/list item 只能通过 `onOpen*` callback 发事件，不能直接 `window.open` 权限文件、policy source 或 meta source。
- 文件详情里的 RDF metadata panel 读取 pending proposal、提交 structured cell proposal、弹 toast，属于 `features/detail`；`components/` 不能持有这类 detail metadata workflow。
- 文件详情里的 RDF metadata panel projection 属于 `features/detail/file-detail-metadata-panels-model.ts`；meta predicate pending/error 的 marker/aria/title/className status chrome 也属于这个 model。meta predicate editor 的 pending/error 状态投影、hydrated pending fallback、proposal 创建判断和值归一化属于 `domain/detail/detail-metadata-editor-model.ts`。`FileDetailMetadataPanels.tsx` 不能直接调用 `resolveFilesResourceSidecars`、`extractFileMetaPredicateValues`、`parseSourceLinkedCardTurtle`、`sourceLinkedCardBodyUri`、`literalDetailCellValue` 或 `iriDetailCellValue` 来拼 panel props，也不能根据 `status === 'pending'/'error'` 拼状态 marker；`useDetailMetaPredicateController.ts` 不能内联 `({ ...current, [predicateKey]: ... })` 或 pending fallback status 解析。
- 文件详情 pane controller 是 store/query/platform/favorite effect owner，但 favorite state、favorite toggle metadata、empty-state fallback、shell-state fallback、structured return action availability/label 和非 table 视图横向滚动 reset 决策属于 `features/detail/file-detail-pane-model.ts`。`useFileDetailPaneController.ts` 不能内联 `favorites.some`、`JSON.stringify({ fileId, treeNodeId })`、`structuredViewMode === 'table'` 或 error/file/loading 的三元 empty-state 分支；`FileDetailPane.tsx` 不能直接读取 `structuredSubjectReturnContext.subject`、比较 return document URI，或硬编码 structured return action 文案。
- 文件详情 preview dispatch、source-linked card Ingest/approval preview、editable-file sheet composition 属于 `features/detail`；共享的 `ModeCard`、`RawTextBlock`、`DetailRows` 这类 props-only 视觉片段才留在 `components/` 或未来 `ui/`。
- 文件详情 preview dispatch 不能直接消费 editable sheet open request、store action 或 query workflow；`FileDetailPreview.tsx` 只负责 open mode dispatch 和具体 preview 组合，`features/detail/useEditableFilePreviewController.ts` 拥有 sheet open request 的消费、键盘打开和 sheet open state。这个样例对应 effect/authority owner，而不是“文件详情按钮怎么放”的交互细节。
- 媒体 preview 不能因为视觉上只是 `<img>` 就直接持有 blob query 和 `URL.createObjectURL` 生命周期；`AuthenticatedImagePreview` 只渲染 loading/error/img，`features/detail/useAuthenticatedImagePreviewController.ts` 拥有 `useBlobResource`、object URL 创建和 revoke。这个样例对应 media resource lifecycle owner，而不是“图片预览怎么排版”的交互细节。
- 文件详情共享的 `ModeCard`、`RawTextBlock`、`DetailRows` 这类 props-only 视觉片段属于 `ui/`；detail/source-card workflow 只消费它们，不通过 `components` shim。
- Files 主列表分三层 owner：`domain/list/list-view-model.ts` 拥有 row view model、visible row projection、copy text payload、scope header label、toolbar/search/filter chrome、loading/empty state title/description/icon kind、content loading/error/empty/ready priority 和 toolbar filter availability 所依赖的纯投影；`domain/list/list-projection.ts` 拥有 recent/base entries 和 visible list projection 规则；`features/list/useFilesListPaneController.ts` 拥有 store/query 读取、list projection 接线、open decision effect 和 URI copy 平台 effect；`domain/list/files-list-selection-model.ts` 拥有 visible selection projection、range selection uri list、context-menu target selection、batch selection label、batch action labels 和 context menu action label/chrome view model。range anchor 与 context-menu target 必须作为一个 `FilesListInteractionState`，由 model 提供 create/anchor/context-target/reset projection，`useFilesListSelectionController.ts` 只持有这个单一 state container、context-menu deferred selection refs、Zustand selection setter 和 React event wiring；不能拆 `selectionAnchorId` / `contextMenuTargetUri` 两份 React state。`useFilesListOperationController.ts` 拥有 rename/copy/move/delete mutation workflow。`FilesListPane.tsx` 只绑定 toolbar、row、context menu 和 operation sheet，并把 empty-state `iconKind` 映射到视觉 icon；它不直接 import store/query/platform-copy/list projection/open decision，也不直接根据 `selection.kind`、`files.length`、`isLoading/error/hasVisibleFiles` 或 `selectedVisibleFiles.length` 计算列表展示分支，也不硬编码 toolbar aria、search placeholder、filter/all-option 文案、recent scope header、loading 文案、batch selection/action 文案或 context menu 的打开/重命名/复制到/移动到文案。`useFilesListPaneController.ts` 不能 import icon library、硬编码 empty-state 文案、内联 `selection.kind === 'recent'`、`files.map` row projection 或 `filesToCopy.map` copy payload。
- Finder-style folder child list、column view、operation sheet 组成一个 folder workflow cluster；即使其中部分 JSX 看起来像列表或 sheet，只要消费 `FilesEntry`、folder sort/open decision 或 `useFileDetail`，owner 就是 `features/folder`。Folder navigation 的 child open effect、copy URI payload 和 stale editor sheet cleanup 属于 `features/folder/folder-navigation-workflow-model.ts`；`features/folder/useFolderDetailNavigationController.ts` 只执行 store selection、detail tab、sheet state 和 clipboard 副作用，不能直接 import `domain/folder/folder-child-open`、`selectedChildren.map(...).join('\\n')` 或 `!childUriSet.has(sheetChild.uri)`。Folder operation sheet 的 title/description/input/confirm copy 属于 `domain/folder/folder-operation-model.ts` 的 `projectFolderChildOperationSheetModel`，pending confirm button label/chrome 属于 `projectFolderChildOperationConfirmChrome`；operation/value 作为一个 `FolderChildOperationState`，由 `createFolderChildOperationState`、`projectFolderChildOperationOpened`、`projectFolderChildOperationValuePatch` 和 `projectFolderChildOperationReset` 投影；initial value 属于 `getFolderChildOperationInitialValue`，rename/copy/move destination 属于 `projectFolderChildOperationDestination`，Markdown resource/content plan 属于 `planFolderChildCreateMarkdownResource`，submit readiness 属于 `canSubmitFolderChildOperationSheet`。确认提交时的 mutation command、payload、删除 URI、成功文案和失败动作 label 属于 `planFolderChildOperationSubmit`；`features/folder/useFolderDetailOperationController.ts` 只持有一个 operation state container，执行 copy/move/delete/create mutation、selection、route/tab 和 toast 副作用，并把 domain 的 submit readiness 投影为 `operationConfirmDisabled`，不能拆 `operation` / `operationValue` 两份 state 或在 controller 里手写 open/reset 默认值。`FolderChildOperationSheet.tsx` 和 folder preview 不能直接根据 `operation.type`、`operation.children.length`、`child.name`、`Untitled*` 默认值、Markdown filename/mime/content 规则、input trim 规则、pending label 或成功/失败文案拼接做业务判断；它们只消费 controller 给出的 `confirmDisabled`。通用 `ui/FilesOperationSheet` 也只能接收调用方给出的 `confirmDisabled`，不能自行从 input value 推断业务可提交状态。
- Files list operation 的默认输入值、sheet title/description/input/confirm copy、pending confirm button label/chrome、目标 URI 投影、validation message 和 submit readiness 属于 `domain/list/files-list-operation-model.ts`；operation/value 作为一个 `FilesListOperationState`，由 `createFilesListOperationState`、`projectFilesListOperationOpened`、`projectFilesListOperationValuePatch` 和 `projectFilesListOperationReset` 投影。`features/list/useFilesListOperationController.ts` 只持有一个 operation state container，拥有 mutation/toast/selection reset workflow，并把 domain 的 confirm chrome 和 submit readiness 投影为 `operationConfirmChrome` / `operationConfirmDisabled`；不能直接 import folder path helper、内联路径校验文案、拆 `operation` / `operationValue` 两份 state、手写 open/reset 默认值、根据 `operation.files.length` 拼删除文案、用 `operationValue.trim().length` 计算按钮状态，或在 `ui/FilesOperationSheet` 里传入/解释 pending 状态文案。
- Finder-style folder upload 的文件名清洗、mime fallback、目标 URI 和 text/blob 内容类型判断属于 `domain/folder/folder-upload-model.ts` 的 upload resource plan；`features/folder/useFolderDetailUploadController.ts` 只拥有 file input/drag state、`uploadedFile.text()` IO、create raw/blob mutation、toast 和上传后导航，不能直接读取 `uploadedFile.name` / `uploadedFile.type` 来拼上传目标或判断上传类型。
- Finder-style folder view mode option labels/active state、toolbar create/upload labels、sidecar child visibility、visible child count/availability、content empty/columns/collection state、empty-state message/chrome、collection 分支可用的 list/icons mode、collection aria label、sort header label/aria/align chrome、sorted child projection、list/icon row chrome projection、child action menu chrome、next sort plan、selection count、batch selection label、batch action labels、single/range/toggle/context-menu selection state plan、range selection uri list、keyboard navigation target plan 和 stale selection prune plan 属于 `domain/folder/folder-detail-model.ts`；view mode 与 sort 必须作为一个 `FolderDetailViewState`，由 model 提供 create/view-mode/sort-key projection，`features/folder/useFolderDetailViewController.ts` 只持有这个单一 state container、`setViewMode`、`setSortKey` 接线，并调用 `projectFolderDetailViewModel`，不能拆 `viewMode` / `sort` 两份 React state；`features/folder/useFolderDetailSelectionController.ts` 只拥有一个 `FolderChildSelectionState` state container、context-menu deferred timer 和 React event 接线，并调用 `createFolderChildSelectionState`、`projectFolderChildSelectionStateFromPlan`、`projectFolderChildSelectedChildUriPatch` 以及 folder detail model 的选择投影与状态计划，不能把 `selectedChildUri` / `selectedChildUris` / `selectionAnchorUri` 拆成三份 React state，也不能内联 `new Set([child.uri])`、toggle、shift range 或方向键 index 组合；cascading column 的 `columnContainerPath`、`columnSelectionByContainer`、`columnPreviewTarget` 状态和 column child 事件接线属于 `features/folder/useFolderDetailColumnController.ts`。`FolderDetailPreview.tsx` 不能直接调用 `getVisibleFolderChildren`、`sortFolderEntries`，不能读取 `visibleChildren.length`、`hasVisibleChildren`、`selectedChildren.length`、`selectedChildCount` 或 `columnPreviewSiblings.length`，也不能维护 view/sort state、硬编码 view mode option、toolbar create/upload、empty-state 或 batch selection/action 文案，或根据 `viewMode === 'columns'` 选择主内容分支，只消费 controller 输出；`FolderDetailChildViews.tsx` 不能直接判断 child kind、格式化 modified/size、计算 semantic label、计算方向键下一行 index，或硬编码 list/icon aria、sort header 文案/aria/align、打开/复制/重命名/复制到/移动到/删除菜单文案，只渲染 controller 投影出的 rows、collection chrome、action menu 和 keyboard navigation plan。
- Finder-style column panel row chrome、sorted sibling projection、header count、空态 availability 和 child action menu chrome 属于 `domain/folder/folder-detail-model.ts` 的 `projectFolderColumnPanelModel`；`features/folder/useFolderColumnPanelController.ts` 只是 memo wrapper；`FolderDetailColumnView.tsx` 不能直接判断 child kind 来选 folder/file icon、descendant chevron、header count、空态 availability，或硬编码打开/复制/重命名/复制到/移动到/删除菜单文案，只渲染 `entryCount` / `sortedRows` / `hasSortedRows` / `actionMenu`。
- Finder-style cascading column 的 selection path plan、preview fallback/count/root selected projection 和 stale child prune plan 属于 `domain/folder/folder-detail-model.ts`；`columnContainerPath`、`columnSelectionByContainer`、`columnPreviewTarget` 不是三份独立事实，必须作为一个 `FolderColumnState` 由 `createFolderColumnState`、`projectFolderColumnStateAfterSelection`、`projectFolderColumnStateAfterPrune` 统一投影。`features/folder/useFolderDetailColumnController.ts` 只持有一个 column state container 并调用这些纯函数，不能拆三个 `useState`，也不能内联 `Object.fromEntries`、`columnContainerPath.slice` 或 `columnPreviewTarget?.siblingEntries ?? visibleChildren` 这类规则。
- Finder-style folder child preview 的 preview rows、subtitle、summary、detail fallback、sidecar owner target、preview aria 和 open-selected label 属于 `domain/folder/folder-child-preview-model.ts`；`features/folder/useFolderChildPreviewController.ts` 只拥有 meta drawer open/close 和 child change 后关闭 drawer 的交互状态；`FolderChildPreview.tsx` 不能硬编码 preview aria 或打开选中项文案；`FolderDetailPreview.tsx` 不能内联 `FolderChildPreview`、`getFolderChildPreviewRows`、`ResourceMetaDrawer` 或 `ResourceSidecarActions`，controller 也不能直接调用 resource semantics/formatters 拼 preview 文案。
- Finder-style column panel sorted sibling projection 不能留在 renderer 或 controller 里；`FolderDetailColumnView.tsx` 不能直接调用 `sortFolderEntries`，controller 也不能直接调用 `sortFolderEntries` / `projectFolderColumnRow`，只能消费 `projectFolderColumnPanelModel` 的结果后渲染 row/context menu。
- Finder-style cascading column 里的 descendant container 不能在列渲染组件里直接读取 `useFileDetail`、query loading/error 或投影 child entries；descendant title/aria/loading-unavailable 文案、visible child entries 和 loading/unavailable/ready state 属于 `domain/folder/folder-detail-model.ts` 的 `projectFolderDescendantColumnModel`。`features/folder/useFolderDescendantColumnController.ts` 只拥有 descendant detail query，并把 `containerUri`、query 状态和 parent file 交给 model，不能直接调用 `folderColumnNameFromUri`、`getVisibleFolderChildren` 或拼 `Folder column ${title}`；`FolderDescendantColumn` 只渲染 `contentState` 对应的 loading/unavailable/`FolderColumnPanel`，不能直接读取 `descendantColumn.isLoading`、`descendantColumn.error`、`!descendantColumn.parentFile` 或硬编码 loading/unavailable 文案。这个样例对应递归子视图/query owner，而不是“列视图 UI 怎么排”的交互细节。
- structured view 的 metadata hydration、autosave、Zustand view state 绑定、toast conflict handling 属于 `features/structured` 的 controller；metadata signature、default signature、document URI comparison 和 hydration plan 属于 `features/structured/structured-view-metadata-workflow-model.ts`；表格 JSX 只消费 controller 输出，`components/` 只能保留迁移期 shim 或 props-only table primitive。
- structured preview 不能作为 notification wiring hub；`StructuredTablePreview.tsx` 不能 import `useToast` 或把 `toast` 下传给 view metadata、vocab proposal、cell proposal controller，触发 effect 的 workflow owner 自己取 toast。
- Structured effective class scope projection 属于 `features/structured/structured-view-state-model.ts`；`features/structured/useStructuredViewStateController.ts` 只负责 store/metadata wiring 并调用 model，不能导出 `resolveStructuredEffectiveClassScope` 这类纯 projection helper；`StructuredTablePreview.tsx` 不能 import `projectStructuredClassScope`、不能定义 `resolveEffectiveClassScope` callback，只能把 `projection` 交给 view-state controller 生成 metadata-ready state。
- structured view 的 effective projection、raw text projection、shape validation、warning/pending 行过滤和 status summary 属于 `features/structured/structured-projection-review-model.ts`；warning/pending review 开关也必须作为 `StructuredProjectionReviewState`，由 `createStructuredProjectionReviewState`、`projectStructuredProjectionReviewReset`、`projectStructuredProjectionReviewWarningRowsOnly` 和 `projectStructuredProjectionReviewPendingWritesOnly` 管理。`features/structured/useStructuredProjectionReviewController.ts` 只拥有一个 review state container、document reset 和 model memo，不能拆 `warningRowsOnly` / `pendingWritesOnly` 两份 React state。`StructuredTablePreview.tsx` 只能组合 toolbar/table/kanban/whiteboard/raw view，不能直接调用 review projection helper 或维护 review-only state。
- structured alert copy 和 availability 也属于 projection model；source-unavailable compact/table 文案、shape warning count/first-message、projection warning first-message 属于 `features/structured/structured-projection-alerts-model.ts`。`StructuredProjectionAlerts.tsx` 只负责渲染 alert 样式，不能直接判断 `warnings.length`、读取 `warnings[0]` 或硬编码这些提示文案。
- Structured raw projection renderer 属于 `features/structured/StructuredProjectionRawView.tsx`，raw view heading/description chrome 属于 `features/structured/structured-projection-raw-view-model.ts`，共享 raw text primitive 属于 `ui/FileDetailPreviewPrimitives.tsx`；`StructuredProjectionRawView.tsx` 不能硬编码 raw view 文案，`StructuredTablePreview.tsx` 不能重复定义 `RawTextBlock` 或 `ProjectionRawView`。
- Structured cell pending write affordance 的 aria label、title、status/discard mode 和 marker 属于 `features/structured/structured-pending-cell-write-button-model.ts`；`StructuredTableCellPrimitives.tsx` 的 `PendingCellWriteButton` 只按 model 的 `kind` 渲染 status 或 discard icon，不能直接拼 pending approval/submitting/discard 文案。
- Structured projection alerts 属于 `features/structured/StructuredProjectionAlerts.tsx`；`StructuredTablePreview.tsx` 不能直接 import `Info`、硬编码 source unavailable/shape warning/projection warning 文案或维护 alert JSX。
- Structured viewport state/chrome 属于 `features/structured/useStructuredViewportController.ts`；`StructuredTablePreview.tsx` 不能直接 `useRef/useEffect` 管 viewport ref、last scrollTop 或 `scrollLeft = 0`，也不能硬编码 viewport aria。
- structured write capability 属于 `domain/structured/structured-write-capability.ts`；`.data` Turtle、`.vocab` locked、reserved resource 和 non-Turtle 判断不能散在 preview JSX 或 toolbar/table 里。
- Structured resource preview controller 属于 `features/structured/useStructuredResourcePreviewController.ts`，纯投影属于 `features/structured/structured-resource-preview-model.ts`；controller 拥有 current Pod root、raw text resource query、vocab discovery query 和 vocab document query，model 拥有 raw source fallback、fallback/discovered vocab registry URI projection 和 vocab registry rows 到 definition index 的组装。`StructuredTablePreview.tsx` 不能直接读取 raw/vocab query，controller 也不能内联 vocab URI 或 schema index projection。
- Structured cell proposal workflow 属于 `features/structured/useStructuredCellProposalWorkflowController.ts`，纯投影属于 `features/structured/structured-cell-proposal-workflow-model.ts`；controller 拥有 pending approval query、create mutation、toast、document reset 和一个 `StructuredCellProposalWorkflowState` container。local pending subjects、table-local cell proposals、view-local cell proposals 必须由 model 提供 create/reset/table subject sync/table proposal sync/view proposal upsert projection；model 还拥有 query proposal 到 write proposal 转换、effective proposal 合并、pending subject 合并、本地 table subject set 复用、本地 table proposal 同步和 view proposal upsert。`StructuredTablePreview.tsx` 不能直接接触 cell proposal query/mutation，controller 也不能拆 `localPendingWriteSubjects` / `localCellWriteProposals` / `localViewCellWriteProposals` 三份 React state，不能内联 proposal map/filter/set 投影，不能把 `setLocalCellWriteProposals` 这类 raw setter 作为 workflow API 暴露；preview/table 只能调用 `setLocalPendingWriteSubjectsFromTable`、`syncLocalCellWriteProposalsFromTable` 这类命名 action。
- structured cell popover 的 placement state 属于 `features/structured/useStructuredCellPopoverController`，portal/layer 渲染属于 `features/structured/StructuredCellPopoverLayer`；controller 不返回 `renderActiveCellPopover(children)`，active cell 只接 placement 并渲染命名 layer 组件。
- TanStack projection table、predicate columns、cell editor/commit/popover/write proposal、enum option proposal、pending predicate proposal、column sizing 组成一个 structured table workflow cluster；它们可以拆文件，但 owner 仍是 `features/structured`，不能因为长得像表格就放进通用 `components/`。
- Structured Kanban 的 source projection、display columns、card lookup、native drag state、Dnd drag-end routing plan、move targets 和 card count label 属于 `features/structured/structured-kanban-view-model.ts`；`useStructuredKanbanViewController.ts` 只持有 native drag state、执行 reorder/cross-column move 副作用并调用 Kanban move controller。Dnd drag-end 必须先由 `projectStructuredKanbanDndDragEndPlan` 投影成 `none/reorder/cross-column`，controller 不能直接 import target-column finder、不能在 `handleDndDragEnd` 里手写 source/target column 分支。native DOM event 读取 `dataTransfer` 可以留在 controller，业务路由不能留在 event handler。
- Structured column sizing workflow 属于 `features/structured/useStructuredColumnSizingController.ts`，纯尺寸规则属于 `features/structured/structured-column-sizing-model.ts`；controller 只拥有 local/ref sync、document reset 和 mouse/touch listener wiring，model 拥有 controlled input fallback、updater 归一化、drag delta 到宽度、最小列宽 clamp 和 column size patch。`StructuredProjectionTable.tsx` 不能直接管理 column sizing ref/listener，controller 也不能内联 `typeof updater === 'function'`、`Math.max(48, ...)` 或 `[columnId]: nextSize`。
- Structured `+subject` 的 projection rows 到 existing subject 派生、subject draft seed、footer availability/title/button chrome、dialog title/description/input/action chrome、submit readiness、create plan、pending subject staging，以及 `StructuredSubjectCreationState` 的 create/open/draft/submit/reset projection 属于 `features/structured/structured-subject-creation-model.ts`；`features/structured/useStructuredSubjectCreationController.ts` 只拥有一个 subject creation state container、document reset、Enter 事件接线和 rdf:type proposal staging effect，并调用 subject creation model，不能拆 `pendingSubjects` / `createSubjectOpen` / `subjectDraft` 三份 React state。`StructuredProjectionTable.tsx` 只把 controller 输出传给 footer trigger 和 dialog，不能直接 `projection.rows.map((row) => row.subject)`、调用 `getNextStructuredSubjectDraft`、`planStructuredSubjectCreation` 或内联 `if (event.key === 'Enter') submitCreateSubjectProposal()`；`useStructuredSubjectCreationController.ts` 也不能内联 `projectionRows.map((row) => row.subject)` 或 `[...current, plan.subject]`；`StructuredSubjectCreationControls.tsx` 只能渲染传入的 `footerModel`、`dialogModel`、`subjectDraft` 和 `submitDisabled`，不能硬编码 `+ Subject`、dialog title、empty class fallback、cancel/submit 文案，不能直接 `subjectDraft.trim()` 或 `disabled={!classScope}`；`structured-projection-table-model.ts` 也不能继续承接 subject creation plan。
- Structured table model assembly 属于 `features/structured/useStructuredProjectionTableModelController.ts` 和 `features/structured/structured-projection-table-model.ts`，只覆盖 table rows、table cell/predicate value lookup、visible predicates、column visibility、footer predicates、pending-only display rows、sort compare 和 shape warning map；`StructuredProjectionTable.tsx` 和 enum/cell workflow controller 不能直接内联 `tableRows.find(...)?.cells[predicate]` 或 row/display/visibility/footer/warning projection helpers，只消费 table model helper/controller 输出后交给 TanStack table 和 column builder。cell edit、enum option、predicate cell display、subject creation 不能因为都服务表格就继续堆回 `structured-projection-table-model.ts`。
- Structured subject cell display label/open target projection/open hint/title/pending marker 属于 `features/structured/structured-projection-cell-chrome.ts`；`StructuredProjectionTableColumns.tsx` 不能 import `domain/structured/structured-subject-peek` 或调用 `resolveStructuredSubjectOpenTarget`，`StructuredTableCellPrimitives.tsx` 不能推导 subject/document URI display label，也不能硬编码 subject open hint copy 或 pending subject copy，只能消费 `projectStructuredSubjectCellChrome` 后把 `displayLabel`、`openTarget`、`openAffordance` 和 `pendingMarker` 传给 subject cell primitive。
- Structured cell activation/commit plan、activation effect、Enter/Escape/Space 键盘 action、outside pointer action，以及 active editor state 的 open/close/value/search/target-clear 转换属于 `features/structured/structured-cell-edit-workflow-model.ts`；`activeTextCell` / `activeEnumCell` / `activeRelationCell` / `enumSearch` 必须作为一个 `StructuredCellEditorState`，由 `createStructuredCellEditorState` 和 `projectStructuredCellEditorState` 投影。popover placement state、DOM 事件接线和执行 effect 属于 `features/structured/useStructuredCellEditWorkflowController.ts` / `useStructuredCellEditorController.ts`，controller 只持有一个 editor state container，不能把 text/enum/relation/search 拆成四份 React state，也不能直接调用低层 value/target helper。`StructuredProjectionTable.tsx` 不能直接消费 low-level cell editor/popover controllers、调用 activation/text/relation commit plan，或内联 `onCellKeyDown={(event, row, columnId) => ...}` 分支；workflow controller 也不能重新内联 `event.key === 'Enter'` / `Escape` / space 或 active text cell match 判断。
- Structured cell commit controller 可以负责 `createStructuredCellWriteProposal` 与 staged write callback 接线，但 previous values lookup 仍然属于 table projection model；`useStructuredCellCommitController.ts` 必须通过 `getStructuredProjectionCellOriginalValues` 读取原值，不能内联 `projectionRows.find(...)` / `cells.find(...)`。
- Structured cell write proposal workflow 属于 `features/structured/useStructuredCellWriteProposalController.ts`，纯投影属于 `features/structured/structured-cell-write-proposal-model.ts`；`cellValueOverrides` 和 `cellWriteProposals` 必须作为一个 `StructuredCellWriteProposalWorkflowState`，由 model 提供 create/reset/stage/discard/approval-staged projection，controller 只持有这个单一 state container、提交 promise、失败 rollback effect 和 document reset。model 还拥有 persisted proposal index、resolved cell values、cell write state、pending subject set、pending subject list 排序和 local proposal list projection。`StructuredProjectionTable.tsx` 不能直接管理 optimistic write state，controller 也不能拆 `cellValueOverrides` / `cellWriteProposals` 两份 React state，不能内联 proposal map、`[key]` staging、`delete next[key]`、`Array.from(...).sort(...)`、pending subject 或 resolved values 投影。
- Structured enum cell add/remove plan、selector search/create/exact-match projection、selector input/listbox/create chrome、selector create action payload、selector input/option key action plan、selector selected chip/remove action chrome、selector selected chip remove action payload、option row select payload、option row pending display label 与 option definition menu chrome 属于 `features/structured/structured-enum-cell-workflow-model.ts`，observed/defined/pending option 与 enum/scalar/relation cell display projection、relation value open action aria/title/payload 属于 `features/structured/structured-predicate-cell-display-model.ts`，active relation editor 的 clear action aria 属于 `features/structured/structured-predicate-active-cell-model.ts`，static cell 的 boolean/enum/relation/scalar display union 和 boolean toggle aria/title/pressed chrome 属于 `features/structured/structured-predicate-static-cell-model.ts`，add/remove workflow 属于 `features/structured/useStructuredEnumCellWorkflowController.ts`；`StructuredProjectionTable.tsx` 不能直接调用 enum option projection/add/remove plan 或 enum option vocab proposal controller，只消费 workflow callbacks。`StructuredTableCellPrimitives.tsx` 可以渲染 enum selector，但不能内联 `options.filter/some/find`、selected duplicate guard、create-option 判断或 create-option add payload、selector placeholder/listbox/selected chip/remove action 文案或 remove payload、selector Enter/Escape add/cancel 规则、option click payload、option Enter/Space add 规则、option pending display label、option definition menu 文案、relation open/clear action 文案、relation open payload 或 boolean toggle 文案。没有 React state/effect 的 static display projection 不能命名为 `useStructuredPredicateStaticCellController`。
- Structured active predicate cell 的 text/relation pending proposal 判断、relation values、enum options、selected values 和 listbox id 属于 `features/structured/structured-predicate-active-cell-model.ts`；`StructuredPredicateActiveCell.tsx` 只根据 `projectStructuredPredicateActiveCellDisplay` 的 union 渲染 primitive 并绑定回调，不能直接 import table model、cell edit plan 或 enum/relation display helpers。没有 React state/effect 的 active cell display projection 不能命名为 `useStructuredPredicateActiveCellController`。
- Structured pending predicate column 的本地 pending state、hydrated proposal dismiss state、审批提交后的本地状态更新必须作为一个 `StructuredPendingPredicateColumnsState`，由 `features/structured/structured-pending-predicate-columns-model.ts` 提供 create/reset/stage/approval-staged/discard projection；`features/structured/useStructuredPendingPredicateColumns.ts` 只持有这个 state container、执行 approval mutation 接线和 memo projection。hydrated reviewable proposal 合并、draft 到 column proposal、重复判断、本地 pending predicate staging、pending proposal map、pending predicate ids、approval lookup、approval-staged projection、pending definition fallback、pending/local discard 过滤、hydrated proposal 查找和 dismissed id 更新属于 `features/structured/structured-pending-predicate-columns-model.ts`。`StructuredProjectionTable.tsx` 不能直接 `visiblePendingPredicateProposals.map((proposal) => proposal.id)`，hook 也不能直接 import draft helpers、`createVocabTermProposal` 或 `localPredicateLabel`，不能拆 `pendingPredicateProposals` / `dismissedHydratedPredicateProposalIds` 两份 React state，不能内联 `pendingPredicateProposals.find(...)`、`[...current, pendingProposal]`、`current.filter(...)`、`visiblePendingPredicateProposals.find(...)` 或 `new Set(current).add(...)`。
- Structured vocab proposal workflow 的 pending query、审批 mutation、toast 和 document reset 属于 `features/structured/useStructuredVocabProposalWorkflowController.ts`，但本地 staged class、local reviewable proposals、dismissed reviewable ids 必须作为一个 `StructuredVocabProposalWorkflowState`，由 `features/structured/structured-vocab-proposal-workflow-model.ts` 提供 create/reset/stage/store-local/approval-staged/discard projection；controller 只持有这个 state container 和 effect 接线。reviewable proposal 合并、本地 reviewable upsert、visible pending class proposal、selected class proposal lookup、class duplicate guard、pending class draft 到 proposal、pending class staging、pending class approval lookup、class vocab approval RDF 构造、approval-staged projection、pending/local reviewable discard 过滤、hydrated proposal 查找和 dismissed id 更新属于 `features/structured/structured-vocab-proposal-workflow-model.ts`。controller 不能拆 `pendingClassProposals` / `localReviewableVocabProposals` / `dismissedReviewableVocabProposalIds` 三份 React state，不能内联 `new Map<string, VocabTermProposal>`、`visiblePendingClassProposals.some`、`localPredicateLabel`、`classUriFromDraft`、`resolveLocalVocabTermUri`、`createVocabTermProposal({ ... })`、`current.some(...)`、`current.filter(...)`、`pendingClassProposals.find(...)`、`visiblePendingClassProposals.find(...)`、`new Set(current).add(...)` 或 pending class projection helper。
- Pending class duplicate guard 要按 local identity 比较，并覆盖 draft slug 小写后的大小写差异；否则 `Task` 与本地 `.vocab#task` 会被当成两个 class，破坏 “class 必选且单 class table” 的前提。
- Structured `+predicate` byline 菜单的 open/search/draft state、shape 展开和 submit reset 必须作为一个 `AddPredicateMenuState`，由 `features/structured/structured-add-predicate-menu-model.ts` 提供 create/reset/search patch/open-from-search/draft patch/class scope hydrate/details toggle/submit projection；`features/structured/useAddPredicateMenuController.ts` 只持有一个 menu state container、memo 派生和事件接线。顶层 menu chrome（trigger/search/empty/create panel/definition byline/submit）、field-level chrome（section labels、field labels、aria、placeholder、shape toggle、editor option labels）、已有 predicate 行投影和 row action chrome、候选存在性输入、draft seed、draft patch、class scope hydrate、shape 展开 open-state toggle、创建按钮文案、URI preview 文案/title、submit readiness、value type rows 和 enum options editor visibility 属于 `features/structured/structured-add-predicate-menu-model.ts`。`AddPredicateMenu.tsx` 只渲染 dropdown/form，不能直接维护 `useState/useEffect`、硬编码顶层或字段级 menu chrome、拼 existing predicate row action aria、读取 `visibleExistingPredicates.length`、`predicateSearch.trim()`、`menu.resolvedUri ? ... : ...`、`!menu.resolvedUri`、`PREDICATE_VALUE_TYPE_OPTIONS`、`menu.draft.type === option.value`、`menu.draft.type === 'enum'` 或调用 `createPredicateDefinitionDraft`、`predicateUriFromDraft`、`stripPredicateIriDelimiters`；controller 也不能把 `createOpen` / `definitionDetailsOpen` / `predicateSearch` / `draft` 拆成四份 React state，不能内联 predicate 搜索 filter/map、CURIE 解析、默认 namespace seed 规则、draft object spread patch、class scope hydrate object spread、shape toggle boolean flip 或 value type selected/enum visibility 判断。
- Structured predicate header column chrome 属于 `features/structured/structured-predicate-column-header-model.ts`；`structured-projection-table-model.ts` 不能导出 `projectStructuredPredicateColumnModel` 或拥有 header label/observed values，`StructuredTableCellPrimitives.tsx` 不能推导 predicate type、rule text、pending status label、shape rule action、definition/pending menu title、row label、action label 或 approval notice，只能渲染传入的 header view model/chrome。
- Structured projection action workflow 属于 `features/structured/useStructuredProjectionActionController.ts`；`StructuredProjectionTable.tsx` 不能直接 import `app/platform-actions` 或 `domain/structured/structured-subject-peek`，只消费打开定义、打开 relation 和复制 predicate 的命名动作。
- Structured cell primitives 可以留在 `features/structured` 消费 controller 输出，但不拥有 RDF value serialization；`features/structured/useStructuredPredicateValueEditorController.ts` 只持有一个 `StructuredPredicateValueEditorState` 和事件，不能拆 `draft` / `selectedValues` 两份 React state；`features/structured/structured-predicate-value-editor-model.ts` 负责 editor state create/reset/draft patch/commit projection、normalized values/options、input/listbox/create-option chrome、multi-select selected chip/remove action chrome、multi-select selected chip remove payload、enum/multi/scalar/boolean commit plan，`serializeStructuredCellEditorValues`、literal quoting、IRI quoting 属于 `domain/structured/structured-cell-editor-plan.ts`。
- Structured active cell 可以展示 enum option definition 菜单，但不拥有外部打开策略；`onOpenEnumOptionDefinition` 这类 callback 由 projection table/preview owner 接线，避免 cell 直接 `window.open`。
- Structured predicate column header 可以展示 predicate/proposal/shape 菜单，但不拥有外部打开或复制策略；`onCopyPredicate`、`onOpenPredicateDefinition`、`onOpenPredicateShapeRule` 和 `onOpenVocabTermProposal` 由 projection table/preview owner 接线。
- Structured class scope menu state 属于 `features/structured/useStructuredClassScopeMenuController.ts`，纯状态转换属于 `features/structured/structured-class-scope-menu-model.ts`；controller 不能内联 draft reset、submit 后清空或 open-state toggle；`StructuredResourceToolbar.tsx` 不能直接 `useState/useEffect` 管 class draft、create open、definition open 或 document reset。
- Structured byline toolbar 的 byline aria、工具区 aria、class scope menu heading、class option/proposal rows、pending class proposal action/status labels/visible button labels、class create control chrome、class definition control chrome、class definition panel fallback、view tab labels、view tab active state、extra view trigger chrome、extra view option labels、search field chrome、filter trigger chrome、filter section labels、filter active、subject filter rows、predicate type/vocab term filter labels、namespace filter rows、sort tool chrome、sort rows、sort option rows、namespace switch label/next value、predicate visibility trigger chrome 和 predicate visibility rows 属于 `features/structured/structured-resource-toolbar-model.ts`；`StructuredResourceToolbar.tsx` 不能直接调用 vocab label helper、读取 `classDefinition?.*` / `selectedClassName ?` 拼定义面板、维护 `VIEW_LABELS`、拼 proposal summary、拼 pending class proposal action/status/可见按钮文案、拼 create-class control 文案/placeholder/展开状态 label、拼 class-definition control 文案/展开状态 label、用 `viewMode === row.value` 判断 tab active、硬编码 `+ 视图` trigger、硬编码 class menu heading、硬编码 search placeholder、byline/filter/sort/visibility trigger aria 或 filter section title、用 `filter === ...` 拼 filter 文案、直接拼 subject filter 文案或把 `warningRowsOnly/pendingWritesOnly/sourceUpdatesOnly` 作为 checkbox row、直接拼 `availablePredicateNamespaces.map` / “全部命名空间”、用 `structuredSortKey` / `structuredSortDirection` 拼排序按钮 chrome、用 `row.label` 拼“升序/降序”或固定排序方向菜单、用 `showNamespaces ?` / `!showNamespaces` 拼 namespace switch 或维护 toolbar projection。
- Structured preview header 的 class scope display/button label 属于 `features/structured/structured-resource-preview-header-model.ts`；`StructuredTablePreview.tsx` 不能直接调用 vocab label helper 或拼 `classDefinition/pendingClassScopeProposal` fallback。
- Structured projection filter 的 class scope projection、schema columns、class definition lookup、available namespace rows、namespace/type/vocab term filters、namespace visibility、search/sort view projection 和 select-existing-predicate reveal/reset plan 属于 `features/structured/structured-projection-filter-model.ts`；namespace/type/vocab term 三项筛选和 show namespace 开关必须作为一个 filter state 投影，默认值、patch、namespace visibility、document reset 和 existing predicate selection 由 model 生成。document reset 只重置 predicate filters，必须保留 show namespace 显示偏好；select-existing-predicate 只返回筛选 patch，不能顺手改 namespace visibility。`features/structured/useStructuredProjectionFilterController.ts` 只维护一个 filter state 容器和 document reset effect，不能直接 import `projectStructuredVocabSchemaColumns`、`projectStructuredPredicateNamespaceFilter`、`projectStructuredVocabTermFilter`、`projectStructuredPredicateTypeFilter` 或 `structuredPredicateNamespace`，也不能重新拆回多个 `useState`、`showNamespaces` 独立 state 或三个 reset setter。
- Structured whiteboard relation editor workflow 属于 `features/structured/useStructuredWhiteboardRelationController.ts`，纯投影属于 `features/structured/structured-whiteboard-relation-model.ts`；relation editor 的 open/editing/from/to/label 必须作为一个 `StructuredWhiteboardRelationEditorState`，由 `createStructuredWhiteboardRelationEditorState`、`projectStructuredWhiteboardRelationEditorNew`、`projectStructuredWhiteboardRelationEditorForRelation`、`projectStructuredWhiteboardRelationEditorFromPatch`、`projectStructuredWhiteboardRelationEditorToPatch`、`projectStructuredWhiteboardRelationEditorLabelPatch`、`projectStructuredWhiteboardRelationEditorCancel`、`projectStructuredWhiteboardRelationEditorSaved` 和 `projectStructuredWhiteboardRelationEditorRemoved` 投影。visual relation chips、chip fallback label、chip availability flag、save eligibility、relation editor field labels/aria/placeholder、save/cancel button chrome、initial from/to draft、from-change target correction、id 生成、保存后 relation list 和删除后 relation list 不能留在 controller/renderer；`StructuredWhiteboardView.tsx` 不能直接管理 relation editor open、editing id、from/to/label draft、visual relation id 生成、save/remove workflow，不能硬编码 relation editor 字段标题、aria、placeholder 或保存/取消文案；controller 也不能把 `relationEditorOpen` / `editingRelationId` / `relationFrom` / `relationTo` / `relationLabel` 拆成五份 React state，不能直接 `relationSubjectOptions.find(...)` 或 `visualRelations.filter(...)`，renderer 不能读取 `visualRelationChips.length`。
- Structured whiteboard view workflow 属于 `features/structured/useStructuredWhiteboardViewController.ts` 和 `features/structured/structured-whiteboard-view-model.ts`；controller 拥有 node dragging、DOM ref、open suppression、scroll reset 和 relation controller 接线；model 拥有 `projectStructuredWhiteboard`、layout merge、available rows、relation subject options、availability flags、toolbar/canvas/node aria chrome、count labels、relationSegments 和 node position clamp 规则。`StructuredWhiteboardView.tsx` 不能直接调用 `projectStructuredWhiteboard`、维护 node dragging state、合并 layout、计算 available rows/relation subject options、执行 pointer drag 或 open suppression，也不能硬编码 add-subject/add-relation/clear/empty-canvas/node-open/node-remove 文案，只消费 controller 的 nodes、relations、chrome、labels 和命名 handlers。
- Structured whiteboard node position clamp 也属于 `features/structured/structured-whiteboard-view-model.ts`；controller 只能读取 DOM frame 的 `clientWidth/clientHeight` 并传给 `projectStructuredWhiteboardClampedPosition`，不能定义 `clampWhiteboardPosition`，也不能硬编码卡片宽高、frame margin 或四舍五入/边界规则。
- Structured whiteboard relation line geometry/style 也属于 `features/structured/structured-whiteboard-view-model.ts`；`StructuredWhiteboardView.tsx` 不能在 SVG map 里 `nodes.find` endpoint、手算 `from.x/to.x`，也不能根据 `relation.source` 分支计算 `strokeDasharray`，controller 也不能内联 `whiteboard.relations.flatMap` 或 `new Map(nodes.map(...))`，只能消费 `relationSegments`。
- Structured Kanban move workflow 属于 `features/structured/useStructuredKanbanMoveController.ts`，纯投影属于 `features/structured/structured-kanban-move-model.ts`；controller 拥有 pending move state 容器、cell write proposal commit effect 和 rollback/staged effect，model 拥有 pending move staging、discard、approval-staged 状态转移、pending move label、display column merge 和 same-column reorder projection。`StructuredKanbanView.tsx` 不能直接管理 pending moves、cell write proposal construction、rollback/staged transition 或 same-column reorder projection，controller 也不能内联 `[card.subject]` object patch、`delete next[card.subject]`、`status: 'approval-staged'`、pending move label、display column merge 或 reorder subject list projection。
- Structured Kanban view workflow 属于 `features/structured/useStructuredKanbanViewController.ts` 和 `features/structured/structured-kanban-view-model.ts`；controller 拥有 DOM/native DnD 事件、`dataTransfer`、drop commit 和 move controller 接线；model 拥有 source/display column projection、predicate options、card lookup、drop target lookup、move menu availability、move target row label、empty/group/column/card chrome、card visible tag projection、native drag start/over/leave/clear 状态投影。`StructuredKanbanView.tsx` 不能直接调用 `projectStructuredKanban`、维护 native drag state、计算 group predicate label、硬编码 empty state/group predicate button/column aria/card open/move aria 或 `移动到 {column.label}` 这类 move target 文案、构造 pending move view model、裁剪原始 `card.tags`、为 DnD shell 推导 card subject item ids 或处理 drop routing；controller 也不能内联 `setDraggingSubject` / `setDragOverColumnId` 或 `current === column.id ? null : current` 这类 native drag 状态 patch，只消费 model projector 和命名 handlers。
- Kanban、Whiteboard、structured byline toolbar 虽然是视图控件，但它们拥有分组 predicate、拖拽提交、白板 layout/relation、class proposal、filter/sort/view state 这些 workflow 语义，owner 同样是 `features/structured`；`components/` 只保留 shim 或更底层的 props-only primitive。
- locked vocab registry preview 读取 raw Turtle、投影 term/shape/namespace、处理 subject peek/open route，属于 `features/structured`；其中 raw query、registry projection、primary projection warning、term peek state、route push 和 store open action 必须由 `features/structured/useLockedVocabPreviewController.ts` 拥有，viewport aria、header title/count、只读说明和 badge label 属于 `features/structured/locked-vocab-preview-model.ts`，registry table 的 columns/search/filtered rows/display cell value label/open action/empty-state flag 和 table-level chrome 必须由 `features/structured/useLockedVocabRegistryTableController.ts` 拥有；`LockedVocabTablePreview.tsx` 只渲染只读表格、搜索框、warning 和 peek drawer，不能直接读取 `filteredRows.length`、`projectionWarnings.length`，也不能硬编码 preview header、search placeholder、empty-state、fallback cell 文案，或用按钮 aria-label 代替单元格 value label。只读不代表可放进通用组件层。
- Structured subject peek drawer 展示 class、predicate facts、source-linked card 和 open target 语义，属于 `features/structured`；通用 UI 不直接消费 structured domain。
- Structured subject navigation workflow 属于 `features/structured/useStructuredSubjectNavigationController.ts`，纯投影属于 `features/structured/structured-subject-navigation-model.ts`；route push、store open、peek state、copy/open source side effect 和 DOM focus restoration 留在 controller，alternative view subject open request、direct navigation option normalization、same-Pod source URI 判断和 scroll restoration target signature 属于 model。`StructuredTablePreview.tsx` 不能接触 route/store/scroll restoration，controller 也不能内联 open target 或 rows signature projection。
- Structured subject peek body 的 type/location labels、section chrome、technical-details toggle chrome、source rows、predicate/backlink/term rows、section visibility 和 fact value display 属于 `features/structured/structured-subject-peek-body-model.ts`；`features/structured/useStructuredSubjectPeekBodyController.ts` 只拥有 technical details open state，不能直接 import `localPredicateLabel`、`normalizeStructuredCellResourceValue` 或 `displayStructuredFactValue`；`StructuredSubjectPeek.tsx` 只渲染 body view model，不能硬编码 section labels 或 URI detail toggle 文案。
- Structured subject peek footer actions 属于 `features/structured/structured-subject-peek-actions-model.ts` 与 `features/structured/StructuredSubjectPeekActions.tsx`；action labels、variant 和 button class chrome 属于 model，renderer 只绑定 sidecar/handler 并渲染 action view model；`StructuredTablePreview.tsx` 和 `LockedVocabTablePreview.tsx` 不能直接判断 peek kind 或 hardcode open/copy/close action labels。
- Source Ingest toolbar action 虽然视觉上只是一个按钮/popover，但它读取 selection/location、提交 ingest mutation、处理错误和选中新资源，属于 `features/ingest/useSourceIngestToolbarController.ts`；selected location 到 container、popover open、source kind options、默认 draft、draft patch、kind parsing、submit started/succeeded/failed state transition、trimmed submit payload、可提交状态、form chrome、错误文案以及 success/closed-error/form-error feedback state 属于 `features/ingest/source-ingest-toolbar-model.ts`。controller 只持有一个 toolbar state 容器，执行 mutation 和 selection 副作用，不能把 `open/sourceUri/title/sourceKind/createdTargetUri/errorMessage` 拆成一组平行 state 或在成功/失败分支手写 reset/close。`SourceIngestAction.tsx` 只渲染 popover/form 和绑定 controller action，不能 import source-ingest domain type、硬编码 option value/aria label/placeholder/submit label，或直接组合 `createdTargetUri` / `errorMessage && !open` 这类反馈展示条件；`components/` 只能保留 shim 或纯触发器 primitive。
- Source Ingest 的 React mutation hooks 属于 `data/queries/source-ingest-queries.ts`，cache/rollback/invalidation workflow collection 属于 `data/collections/source-ingest-collection.ts`，manifest IO 与 snapshot adapter 属于 `data/ingest`。`data/queries/index.ts` 和 `data/collections/index.ts` 只做 re-export / dependency wiring。
- Proposal 的 React hooks 属于 `data/queries/proposal-queries.ts`；vocab/access/source/AI/structured proposal 的 create、pending、approve hooks 不进入 `data/queries/index.ts`。`index.ts` 只 re-export proposal query owner。
- 跨模块 Inbox approval 的 React hooks 属于 `data/queries/inbox-approval-queries.ts`；Files feature 不能直接 import `@/modules/inbox/collections`，只消费 `useFilesApprovalByTarget`、`useResolveFilesInboxApproval` 这类 Files adapter 名称。
- 跨模块 Favorites 的 React hooks 属于 `data/queries/favorite-queries.ts`；Files feature 不能直接 import `@/modules/favorites/collections`，只消费 `useFilesFavoriteList`、`filesFavoriteHooks` 这类 Files adapter 名称。
- 跨模块 Chat source 的 React hooks 属于 `data/queries/chat-source-queries.ts`；`resource-queries.ts` 不能直接 import `@/modules/chat/collections` 或 `@/modules/chat/store`，只消费 `useActiveFilesWorkspaceContext`、`useFilesChatMessages` 这类 Files adapter 名称。
- 所有兄弟模块 import 必须被 `data/files-data.architecture.test.ts` 目录扫描限制在命名 Files data adapter owner。新增 Chat/Favorites/Inbox 以外的兄弟模块依赖时，先建 adapter owner，再把白名单和文档一起更新。
- Resource 的 React hooks 属于 `data/queries/resource-queries.ts`；workspace context、current Pod root、root nodes、entry list、detail/raw/blob read 和 save/create/copy/move/delete/folder create hooks 不进入 `data/queries/index.ts`。`index.ts` 只 re-export query owner。
- Sidecar 的 React hooks 属于 `data/queries/sidecar-queries.ts`；`.meta/.acl/.acr` 的 access/meta/structured metadata read hooks 和 structured view metadata save hook 不进入 `data/queries/index.ts`。
- Vocab discovery 的 React hook 属于 `data/queries/vocab-queries.ts`；Solid session、local vocab URI resolution、Type Index discovery query wrapper 不进入 `data/queries/index.ts`。
- Files collection query-key registry 属于 `data/collections/query-keys.ts`；`FILES_COLLECTION_QUERY_KEYS` 与 `filesResourceQueryKeys` 不进入 `data/collections/index.ts`。`collections/index.ts` 只 import/re-export query-key owner，并把 query keys 注入 collection owner。
- Files collection DB runtime state 属于 `data/collections/runtime.ts`；`setFilesDatabaseGetter`、`getDb` 和 mutable database getter 不进入 `data/collections/index.ts`。`collections/index.ts` 只创建 runtime owner，并把 `getDb` 注入 collection owner。
- Resource adapter wrapper 与 list strategy 属于 `data/collections/resource-collection.ts`；current Pod root resolver、`listAllBrowsableEntries`、chat file projection merge、confirmed transfer overlay merge 不进入 `collections/index.ts`。
- Resource read query wrappers 属于 `data/collections/resource-query-collection.ts`；`collections/index.ts` 可以拥有 resource collection wiring，但不内联 query-key registry 或 `roots/children/entries/detail/rawText/blob/access/meta/structuredViewMetadata` wrapper 方法体。
- Sidecar read query wrappers 属于 `data/collections/sidecar-query-collection.ts`；`accessBasics`、`metaSidecar`、`structuredViewMetadata` 不进入 `resource-query-collection.ts`，避免把文件本体读取和 `.meta/.acl/.acr` 附属数据线混成一个 owner。
- Resource mutation 的 save/create/copy/move/delete/folder create optimistic transaction 属于 `data/collections/resource-mutation-collection.ts`；`collections/index.ts` 只注入 resource collection、query roots 和 cache collections，不内联 stage/commit/rollback 方法体。通用 optimistic sequencing 属于 `data/cache/optimistic-mutation.ts`，resource/sidecar collection 只提供 stage、mutate、commit、restore、invalidate 的业务绑定。
- Sidecar mutation 的 structured view metadata autosave、`.meta` write、sidecar cache stage/restore/commit/invalidate 属于 `data/collections/sidecar-mutation-collection.ts`；`resource-mutation-collection.ts` 只处理文件资源本体的 mutation。
- Vocab Type Index discovery 的 collection-facing workflow 属于 `data/collections/vocab-discovery-collection.ts`；Type Index reader/discovery helper 不放在 `collections/index.ts`。`collections/index.ts` 只注入 Pod root resolver 和 query key，并 re-export discovery collection。
- Files Pod subscription workflow 属于 `data/collections/subscription-collection.ts`；approval resource 订阅、create/update/delete callback 和全量 Files query invalidation 不进入 `data/collections/index.ts`。`collections/index.ts` 只注入 `getDb` 与 invalidation collection 并导出 `filesOps`。
- `.vocab` 中 term registry 的元 RDF 不由 UI 随意改写；pending `*`、approve/discard 是 proposal/use-case 状态。
- Proposal 拆三层：`domain/proposal`、`domain/structured` 或对应 `domain/source` 拥有 RDF parser/updater，`data/proposal` 拥有 proposal resource/approval row 写入、冲突重试、pending target read、apply command 和 proposal create use-case，approval application workflow 再由 feature/use-case/collection 编排；root `proposal-status.ts`、`proposal-query-use-cases.ts`、`proposal-application-collection.ts`、`access-policy-proposal-use-cases.ts`、`source-update-proposal-use-cases.ts`、`ai-change-proposal-use-cases.ts`、`structured-cell-proposal-use-cases.ts`、`vocab-term-proposal-use-cases.ts`、`access-approval.ts`、`source-approval.ts`、`ai-change-approval.ts`、`structured-cell-approval.ts`、`vocab-approval.ts` 这类文件只能兼容导出。
- Proposal 的 collection/cache 适配属于 `data/collections/proposal-collections.ts`；Inbox approval 读取属于 `data/collections/inbox-approval-source.ts`。`collections/index.ts` 只注入 query keys、queryClient、invalidation、`fetchFilesInboxApprovals` 和 runtime `getDb`，不直接 import proposal use-case、parser 或 `@/modules/inbox/collections`。
- Ingest 是 source material 进入 card/resource 的渐进式能力；reader/parser/ocr/indexing 这类具体动作不能直接暴露成用户心智主概念。Ingest manifest resource IO、source snapshot adapter 与 source-linked card create/refresh data use-case 属于 `data/ingest`，root `source-ingest-use-cases.ts`、`source-ingest-service.ts`、`source-ingest-snapshot.ts` 只能兼容导出。
- 列表隐藏 sidecar、class 必选筛选、predicate 列投影、subject peek/open decision 都必须是 domain 函数，不直接散在 JSX 中。
- root `*.ts` 只能是迁移期兼容 shim 或 IO/use-case facade；一旦出现 projection、URI 解析、error state、cell edit plan、vocab helper 等纯规则，必须迁到 `domain/` 并让生产代码直接 import domain。
- root production entrypoint 必须是 export-only：不能 import、不能定义 function/const/class、不能接触 `SolidDatabase`、authenticated fetch、React state/effect 或 TanStack Query/cache。非 `export *` 的命名 facade 必须写明 compatibility/deprecated/public entrypoint 语义，避免 root 文件重新变成隐性 owner。
- root compatibility shim 只给外部兼容和迁移入口使用；`app/`、`features/`、`domain/`、`data/`、`ui/`、`components/` 下的 production 代码必须直接 import owner layer，不能通过相对路径回到 root shim。
- URL search、history state、route bridge、module context provider 属于 `app/` shell；root 只保留兼容 shim，feature 直接 import `app/` owner，避免 root 成为隐性壳层模板。
- 模块 feature flags 属于 `app/feature-flags`；root `feature-flags.ts` 只能兼容导出，避免 root 继续承载壳层状态。
- 外部打开、剪贴板复制、桌面系统打开属于 `app/platform-actions`；feature、cell、drawer、table、preview 只能调用 `openFilesExternalUri`、`copyFilesText`、`openFilesSystemExternalUri` 这类命名动作，不能直接触碰 `window.open`、`navigator.clipboard`、`window.xpodDesktop`。
- `app/store` 只保存 selection、filter、route restoration、sheet request 和 view state；文件类型判断、subject target 是否打开 editable sheet、sidecar/open mode 等资源语义属于 `domain/resource`，store 只能调用命名 domain decision。
- `app/store` 的状态变更必须形成命名 action，例如 `selectFile`、`openFilePreview`、`openStructuredSubjectResource`、`requestEditableFileSheetOpen`；feature 不能直接 `useFilesStore.setState` 拼 selection/detail/sheet/return context，因为那会绕过 action owner 和未来 rollback/route/view-state 规则。
- structured view config 的默认值、viewMode/sortDirection/columnSizing/kanbanOrder/whiteboard layout normalization 属于 `domain/structured/structured-view-metadata`；`app/store` 可以读写 localStorage，但不能重新定义这些纯规则。
- root `index.ts` 对外导出时直接指向 `app/`、`features/`、`ui/` 等 owner；不能通过 `components/` 迁移期 shim 间接转发。
- `features/` 不消费 root `browser`、`queries`、`collections`、`store`、`structured-table` shim；query hooks 直接从 `data/queries` import，resource/structured 类型和语义直接从 `domain/*` import，避免 root facade 重新成为隐性 owner。
- `data/queries` 和 `data/collections` 不消费 root `browser` 或 `structured-table` shim；它们可以作为 facade，但不能通过另一个 facade 找模型 owner。
- `data/collections` 只编排 cache workflow；可复用 snapshot/restore、cache patch、optimistic overlay、scoped proposal/list refresh、resource graph invalidation、bulk entry patch 这类机械流程属于 `data/cache`。
- Zustand UI store 属于 `app/store`，root `store.ts` 只做兼容 shim；像 `FilesEntryScope` 这种 data/query/store 都要用的分类类型属于 `domain/list`，不能让 data 层 import UI store。
- `data/pod-adapter` 只能拥有 Solid transport、fetch、resource read/write 等机械访问；subject URI 解析、sidecar 语义、resource 分类这类 semantic decision 必须在 `domain/resource`。
- structured 表格不是一个组件内部的特例集合；cell editor plan、predicate draft、vocab helper、view filter、subject peek/open target 都属于 `domain/structured`，组件只消费投影和回调。

## 可执行约束

每次新增目录或迁移文件时，都要补 architecture test：

- `ui/` 文件不得 import `../queries`、`../collections`、`../store`、`../browser`、`@tanstack/react-query`、`@tanstack/react-db`、Solid provider、current Pod helper。
- `domain/` 文件不得 import React、Zustand、TanStack、DOM UI、toast、Solid provider、browser fetch adapter。
- `features/` 文件不得直接 import Pod adapter、collection internals 或 root compatibility shim；通过 `data/queries`、`app/store` 和 domain 函数进入。
- `app/`、`features/`、`ui/`、`components/` 这类 UI-facing 文件不得 import `data/cache`、`data/collections`、entry transfer overlay，或直接调用 `useQueryClient` / `QueryClient` / `setQueryData` / `invalidateQueries` / `runOptimisticMutation`；乐观 stage/commit/rollback 只属于 `data/collections` + `data/cache`，UI 只能通过 `data/queries` hook 触发。
- `features/` 文件不得直接调用 `window.open`、`navigator.clipboard` 或 `window.xpodDesktop`；这些平台能力必须通过 `app/platform-actions`。
- `features/` 文件不得直接调用 `useFilesStore.setState`；所有组合式 UI workflow 状态变更先进入 `app/store` 命名 action。
- `features/structured` 的 cell primitive 不得定义 `quoteStructuredLiteral`、`quoteStructuredIri` 或自己的 RDF value serializer；它必须调用 `domain/structured/structured-cell-editor-plan` 的 serialization owner。
- `app/store` 不得定义 structured resource extension 列表或 subject target open decision；例如 `shouldRequestEditableSheetForStructuredSubjectTarget` 属于 `domain/resource/resource-semantics`。
- `app/store` 不得定义 structured view 默认 config 或 normalization helpers；`DEFAULT_STRUCTURED_VIEW_CONFIG`、`normalizeStructuredViewConfig`、column sizing、kanban order 和 whiteboard layout normalization 属于 `domain/structured/structured-view-metadata`。
- `features/structured/StructuredPredicateActiveCell.tsx` 不得直接调用 `window.open`；enum option definition、proposal、relation value 等打开行为必须通过 props callback 交给 table/preview owner。
- `features/structured/StructuredPredicateColumnHeader.tsx` 不得直接调用 `window.open` 或 `navigator.clipboard`；predicate URI 的复制、predicate URI/shape rule/vocab proposal 的打开行为必须通过 props callback 交给 table/preview owner。
- `features/structured/StructuredTablePreview.tsx` 不得 import `projectStructuredClassScope` 或定义 `resolveEffectiveClassScope`；effective class scope 纯 projection 属于 `features/structured/structured-view-state-model.ts`，由 `useStructuredViewStateController.ts` 接线进 structured view metadata 的 hydrate/autosave。
- `data/queries` 不得出现 raw invalidation、stage/commit/rollback、shadow query-key registry，也不得消费 root compatibility shim。
- 兄弟模块 import 不得出现在 feature/domain/ui/app 或普通 data owner；`@/modules/chat`、`@/modules/favorites`、`@/modules/inbox` 只能出现在 Files 命名 data adapter owner。
- `data/queries/index.ts` 不得继续沉淀 workflow hooks；resource hooks 在 `data/queries/resource-queries.ts`，sidecar hooks 在 `data/queries/sidecar-queries.ts`，vocab discovery hooks 在 `data/queries/vocab-queries.ts`，再由 `index.ts` re-export。
- `data/collections` 不得内联可复用 query cache mechanics 或重复 optimistic sequencing；新增 helper 先放 `data/cache`，collection 只传 query root、resource URI、workflow scope、mutation result 和业务 command。
- `data/collections/index.ts` 不得继续沉淀 workflow-specific 方法体；新增完整 workflow collection 先建 `data/collections/<workflow>-collection.ts`，再由 facade 注入 db/query-key/cache/invalidation 依赖。
- `data/collections/index.ts` 不得定义 query-key registry；`FILES_COLLECTION_QUERY_KEYS` 和 workflow query-key builder 属于 `data/collections/query-keys.ts`，facade 只 re-export 并注入依赖。
- `data/collections/index.ts` 不得拥有 mutable database runtime state；DB getter/setter 属于 `data/collections/runtime.ts`，facade 只创建 runtime owner 并传递 `getDb`。
- `data/collections/index.ts` 不得直接承载 Pod adapter wrapper、current Pod resolver、entry list strategy、chat-files projection merge 或 optimistic overlay merge；这些必须在命名 owner module 中出现，再由 facade wiring。
- `data/collections/index.ts` 不得直接承载 runtime subscription workflow；Pod subscription、callback、cross-root invalidation 先放入 `data/collections/<workflow>-collection.ts`，facade 只注入依赖。
- `data/collections/index.ts` 不得直接 import sibling module collections；例如 Inbox approval 读取先放入 `data/collections/inbox-approval-source.ts`，再注入 proposal collection。
- `resource-query-collection.ts` 不得承载 `.meta/.acl/.acr`、access basics 或 structured view metadata 的 read query wrapper；sidecar/access/meta 读查询属于 `sidecar-query-collection.ts`。
- `resource-mutation-collection.ts` 不得承载 `.meta` 写入、structured view metadata autosave 或 sidecar cache stage/commit/invalidate；sidecar 写入流程属于 `sidecar-mutation-collection.ts`。
- `data/pod-adapter` 不得 import React、Zustand、TanStack Query、UI 组件。

architecture test 的粒度优先扫目录，而不是只扫单文件。单文件测试适合迁移期断言“某块已经被抽走”，目录测试负责长期守边界。

## 迁移顺序

1. 先落文档和 architecture tests。
2. 抽无数据 UI：operation sheet、empty state、row、toolbar、table shell、rich text editor shell。
3. 把 smart components 从 `components/` 迁到 `features/`，例如 list、folder detail、structured table preview、editor sheet。
4. 把 JSX 中的复杂判断下沉到 `domain/` 并加单测。
5. 拆 `collections.ts` 为 resource、query、mutation、proposal、vocab、ingest、cache overlay 等 owner 子文件，对外保留兼容 facade；独立 workflow collection 不直接 import facade。
6. 拆 Pod adapter，统一 authenticated fetch、current Pod root/base、sidecar RDF IO。
7. 只有当 Web/CLI/Service 都需要同一语义时，再迁移到 `@undefineds.co/models`。

## 非目标

- 不做一次性大改名或大搬家。
- 不为了分层制造薄 wrapper。
- 不改变现有用户交互语义来服务目录结构。
- 不把 Web-only optimistic cache 迁到 shared models。
- 不在 UI 中添加 fallback 来绕过数据层错误。

## 验收标准

- 新增或修改的纯 UI 组件可以在没有 Pod、query、store 的测试环境中渲染。
- smart feature 只负责编排，不承载长业务规则。
- domain 函数可用普通单测覆盖。
- Pod 读写、optimistic update、subscription refresh、rollback 都在 data 层完成。
- 失败路径暴露真实错误，并指向 data/repository/permission 修复点。

### Files 重构收口 gate

Files 模块从“迁移中”进入“可收口”时，必须同时满足下面几类证据，而不是只看单测数量：

- 文档 gate：本文件的 `ui / features / domain / data / app` 分层契约、root shim 规则、proposal/Ingest/vocab/sidecar/structured table owner 规则都已覆盖 Files 当前实现；新增边界坑必须先落本文档，再补 architecture test。
- Root/facade gate：`apps/web/src/modules/files/files-root.architecture.test.ts` 必须通过，证明 root production entrypoint 仍是 export-only shim/facade，且 nested production 模块没有反向 import root compatibility shim。
- Layer gate：`app/files-app.architecture.test.ts`、`data/files-data.architecture.test.ts`、`domain/files-domain.architecture.test.ts`、`features/files-features.architecture.test.ts`、`structured-table.architecture.test.ts` 以及 `components/*architecture.test.tsx` 必须通过，证明 shell、query/collection、domain projection、feature workflow 和 compatibility component 的 owner 没有回流。
- Unit/integration gate：`yarn workspace @linx/web test --run src/modules/files --maxWorkers=1 --no-file-parallelism` 必须通过，覆盖 Files 的 domain model、feature controller、data collection/cache、UI primitive 和 architecture guards。
- Type gate：`yarn workspace @linx/web tsc --noEmit --pretty false` 必须通过。
- Real Pod gate：`yarn workspace @linx/e2e test:files` 必须通过，覆盖真实 xpod 上的 Pod listing、markdown 编辑、rename/delete/copy/move、`.ttl` embedded table、right-side meta、folder detail、Ingest、Whiteboard、Kanban approval、`.data` cell approval、access policy proposal 和 `.vocab` registry bootstrap。
- Product interaction gate：再按 `docs/prototype/module-files.md` 的 Files 验收项做一次人工或截图验收，并把生产实现证据记录到 `docs/files-production-interaction-audit.md`。重点看 Finder-style folder、Heptabase-style subject/card/meta、非 `.ttl` 可编辑文件 sheet、`.ttl` table/class/predicate/view 交互、sidecar drawer、access dialog、Whiteboard/Kanban 的第一阶段行为是否与产品约束一致；prototype 截图只能作为方向证据，不能替代当前 Web 实现的截图/测试/e2e 证据。当前生产截图证据由 `tests/e2e/specs/files-production-visual-audit.spec.ts` 生成；它负责记录真实 UI 状态，但不把移动端响应式或视觉 taste 自动判为通过。
