# Module Spec: Files

## 目标

Files 是一级 `文件` 模块，必须保留。它负责完整 Pod 文件浏览、resource 管理和 Personal Linked Context 的文件入口，用户心智接近 File Browser / Finder，但语义上是 Solid Pod resource browser。

`聊天文件` 不是一级模块，它和微信一样在窄侧栏底部菜单中直接出现：

```text
窄侧栏底部菜单 -> 聊天文件
```

## 参考原则

- 主实现参考 File Browser：左侧文件夹树、内容区文件/表格、右侧 `.meta` inspector drawer。
- Finder 只作为用户心智参考：文件夹/文件图标、选择、重命名、移动、复制、预览和快捷键预期。Files 不暗示完整本地 Finder 能力。
- Files 是 Pod / Solid resource 浏览器：文件、容器、RDF resource、sidecar、权限和来源关系都必须保留 resource 语义。
- Heptabase / Notion 只作为结构化 resource 的 card/predicate/table/whiteboard 参考，不替代 Files 的文件浏览骨架。
- Personal Linked Context 的原则是 file-primary + modeled metadata：长文档和产物仍是文件；结构化 RDF 记录负责类型、状态、关系、审批和检索。

## Ingest 术语

- `Ingest` 是用户可见和 product/domain 层的名字：把外部或 Pod source 进入 LinX Files，并转成可浏览、可编辑、可审批、可重新同步的 card、block、subject、predicate、vocab proposal 和 approval。
- OCR、PDF/DOC/PPT 抽取、byte-range fetch、authenticated fetch、ETag/If-Match、MIME/size/mtime、ACL/ACR、local cache 和 background scheduling 是 xpod/runtime 的底层能力，不在 UI 或领域 API 里叫 parser/index。
- `Ingest record` / `Ingest 记录` 是用户可见的来源进度与同步状态 artifact；底层 RDF 可以继续有 `SourceIngestManifest` / `manifest.ttl` 等实现词。
- 新写入默认使用 `/.data/ingest/sources/{source-slug}-{source-uri-hash}/manifest.ttl` 这类 Ingest record；旧 `/.data/index/sources/...`、`parser*`、`parsed*`、`index*` 只作为兼容读取和迁移别名。
- Ingest proposals 是不可变的审批实例，放在 `/.data/proposals/source/{subject-source}-{instance}.ttl` 这类 proposal resource；刷新来源时创建新 proposal，不覆盖仍在 pending 的旧 proposal。
- 新 UI、新文档和新写入不暴露 parser/index 作为产品概念；旧 `index*` / `parser*` / `parsed*` 词只作为 legacy compatibility。

## 范围

- Pod 根目录和容器树浏览。
- Pod resource 详情。
- 最近文件；Recent 可以递归收集最近修改的真实 resource/container，但不得把 `All` 变成全 Pod 扫描列表。
- Recent 行可以显示父路径上下文，但不得引入 `来源` 列，也不得把 `sourceLabel` / 当前话题 / Pod 来源当作 tag。
- 文件详情、预览、编辑入口。
- 资源权限、URI、大小、类型、修改时间、source/provenance、workspace/repository/agent home 关联。
- 基于路径、类型、标签、结构化 class/predicate 的浏览与过滤。
- `.ttl` / `.jsonld` / RDF resource 的结构化浏览与受控编辑。
- `.meta` / `.acl` / `.acr` sidecar 和 built-in capability 的展示入口。

## 不做

- 不展示 mock 文件。
- 不在 Web 壳里假装能浏览本地 `linx://` 文件系统。
- 不把首屏做成只面向技术用户的裸目录树。
- 不替代系统 Finder 或完整本地文件管理器。
- 不把一级文件模块做成聊天来源列表。
- 不新增平行 card/database authority；card 是 file/resource + RDF metadata 的 UI 投影。
- 不从 assistant 文本、stdout、stderr、tool name 或本地路径正则猜文件。

## 信息架构

| 区域 | 内容 |
| --- | --- |
| 左侧树 | 普通文件夹树和文件选择，不按 Containers / Structured / Files 分组 |
| Head | 文件名、路径/状态、少量窗口级按钮，约 48px 高 |
| 内容区第一条 | Table / 当前视图 / `+ View`，以及筛选、排序、搜索 |
| 中间列表 | subject table、Finder-like 文件夹列表/轻量预览，或普通可编辑文件的单文件 sheet/modal |
| 右侧详情 | 当前 folder/file/structured resource 的 `.meta` inspector drawer，从 head 下沿覆盖 content 区，默认收起 |

窄屏 / compact width 下，Files 必须优先保留当前 resource 内容可读性：进入 Files 后隐藏全局 rail，文件树通过 `Files` 抽屉按钮按需展开，选择 resource 后自动收起；不要同时常驻展示全局 rail、文件树和内容区。

## 结构化数据视图

打开 `.ttl`、`.jsonld` 或其他 RDF 结构化资源时，默认进入数据工作区，而不是白板。

| 视图 | 默认性 | 用途 |
| --- | --- | --- |
| Table | 默认 | 一行一个 subject/resource；列是 predicate；`rdf:type` 作为 class scope |
| `+ View` | 第一阶段 | Table 是默认视图；Kanban、Whiteboard、Raw 是同一 subject table 的轻量投影；Discover 是未来/实验视图 |
| Card | 显式行详情 | 展示一个 subject/resource 的标题、正文/摘要、properties、tags、relations、backlinks |
| Kanban | 第一阶段 | 把 subject cards 按 status/class/owner 或自定义 predicate 分栏；改列走 structured cell proposal |
| Whiteboard | 第一阶段 | 把选中的 subject cards 放入空间布局；布局写入 view metadata，不写回源 `.ttl` |
| Raw / Projection Raw | 第一阶段 | 查看当前 class scope、过滤、隐藏 predicate 和 pending proposal 后的结构化投影文本；不是 canonical 源 `.ttl` |

Table 规则：

- 一行对应一个 RDF subject，包括 document URI 和 fragment subject。
- `rdf:type` 在 UI 中作为必选 class scope，由 Table 右上角 Class 控件选择；表格内不再重复展示 class 列。
- Class scope 入口默认收起为短 icon/menu；class term 定义菜单用于查看 locked definition、打开 URI、审阅 proposal 和进入受控 vocab 工作流。
- 当前 class 的表头就是 schema，顺序是 `subject / predicate... / + Predicate`。
- schema 列来自当前数据值、同 class 适用 vocab/shape-defined predicate 和 pending proposal；required predicate 即使当前为空也应显示为空列。
- predicate header 默认隐藏 namespace，只显示 local name；`ns` toggle 可展示 prefix/namespace。
- predicate 列宽按表头 divider 拖拽调整，不用全局宽度滑杆。
- `+ Predicate` 属于表头区域，先展示当前 class 已有 predicate，再进入受控 predicate 创建/提议流程。
- `+ Predicate` 创建卡片按 Term / Value / Shape 分组收集 namespace、local name、label、实际 predicate URI、value type、class scope、description 和 shape constraints。新增 class/predicate/enum option 先进入 vocab proposal，不直接写 canonical vocab。
- `+ Subject` 属于表格最后一行，因为它新增的是行。
- 格子操作由 predicate 类型决定：text/code/date inline edit；select/multi-select 打开 tag-selector；relation/URL 提供 open/link；checkbox 原地切换。
- 可枚举 predicate 的 cell 菜单使用 tag selector：已选 chip、搜索输入和 `Select an option or create one` 在同一 popover；搜索不到时可创建 pending option。选项来源合并 observed values、canonical vocab enum options 和 pending proposals。
- Table/Kanban 的可写业务值提交先创建 structured cell proposal，再镜像 Inbox approval；批准前不改 canonical `.ttl`。
- 重新打开表格时，应从 pending Inbox approval target + proposal TTL hydrate 回 proposed value 和 pending `*`，不得重复提交或写 canonical 数据。
- 结构化表格实现应基于 TanStack Table 的 headless row/column/sorting/filtering/sizing/visibility state。LinX 自己持有表格 UI primitives；不要在 page 组件里继续手写一套不可复用的表格状态机。
- 筛选和排序是 Table head 的一等操作：subject/value search、表头排序、predicate visibility、predicate type、namespace、vocab term、shape warning、pending write 过滤都只影响当前投影，不写 canonical `.ttl`。

## Vocab 和 schema 行为

- 用户 Pod vocab 默认 lives under `/.vocab/`，核心资源是 `terms.ttl`、`shapes.ttl`、`namespaces.ttl`。
- `terms.ttl` 是 term registry。class、predicate、enum option 都是 vocab term，通过 kind / RDF type 区分；不要拆成 `class/`、`predicate/`、`term/` 三套文件夹。
- predicate term 可以有本地 registry URI，例如 `/.vocab/terms.ttl#summary`，并通过字段指向实际 RDF predicate URI，例如 `https://schema.org/summary`。
- Table columns、validation、sorting、cell proposals 和写入使用实际 predicate URI；本地 term 负责 label、描述、审批、状态、shape/provenance。
- `shapes.ttl` 记录 required、range/cardinality、datatype、pattern、UI form 等 constraint metadata；完整 SHACL 可以后续下沉到 models/drizzle-solid。
- `.vocab` rows 是受控 schema/term registry，registry columns/meta predicates 是 ecosystem-defined，不像普通 `.data` 业务 cell 一样自由编辑。
- AI 或用户提出 class/predicate/enum/shape 变更时，先创建 vocab proposal，标记 pending，用户批准后才写 canonical vocab。
- Pending vocab 展示统一使用轻量 `*`：class scope label、predicate header、enum option chip/option label。完整状态、approve/discard 和 diff 放在对应 term 定义菜单、review 列表或 Inbox approval 里。
- Pending term 可以参与当前表格预览、筛选和编辑，但导出、同步或跨客户端共享时必须携带 proposal 状态，不能伪装成 canonical term。
- 普通 `.data` cell 编辑只能改 subject 业务值；vocab term 的 label、definition、range/type、enum set、deprecated、color、shape 链接等只能通过 class/predicate/enum 定义菜单或 vocabulary 管理视图修改，并受 vocab 写权限控制。

## `.meta` / `.acl` / `.acr` 边界

- 文件 metadata 是同名 sidecar，例如 `report.md.meta`；container metadata 是该 container 内的 `.meta`，例如 `folder/.meta`。
- `.meta` 不是业务索引。它可保存 title、description、checksum、view metadata、source hints、workspace/repository 快照等本 resource/container 的上下文。
- 跨客户端共享的 structured view metadata 不写入源 `.ttl`，而是写入资源级 `.meta` sidecar：view mode、class scope、搜索/排序、隐藏 predicate、Kanban grouping/order、列宽、Whiteboard selected subjects/position/relation 等。
- Structured view metadata 读取先用约定 sidecar 路径；只有 sidecar missing 时才读取 owner resource 的 same-origin `Link: rel="describedby"` / `rel="metadata"`。401/403 不做 linked fallback，cross-origin metadata link 只作为外部描述引用。
- Structured view metadata autosave 只在用户实际修改 `+ View`、class/search/sort、predicate visibility、列宽、Kanban grouping/order 或 Whiteboard subjects/positions/visual relations 后触发；hydrate 不触发保存。保存只 PATCH `.meta` 的 `<#view>` block，避免污染源 `.ttl`。
- `.acl` / `.acr` 是 file-level built-in capability，不是普通 `.meta` 行。File/folder/structured resource 详情只提供一个 Access 入口，点击后打开 ACL/ACR modal 或 access proposal 流程。
- `.meta` / `.acl` / `.acr` sidecar 默认不进入普通文件浏览列表。

## 普通文件与文件夹打开规则

普通文件：

- 可编辑文本/Markdown 文件打开单文件 sheet/modal，包含 Tiptap/ProseMirror rich editor / raw source switch 和尾部 `.meta`。主区域不内嵌可编辑正文 preview。
- Markdown rich save 必须从编辑器文档序列化完整 raw resource，保留 Content-Type，并使用 ETag/`If-Match`；不得使用截断 `previewText` 作为保存源。JSON/HTML 等非 Markdown 第一阶段默认进 Raw source，等 round-trip 测试明确后再启用富文本写回。
- 图片等只读预览文件保持预览面，不因为点击预览而打开编辑详情弹窗。
- 私有 Pod 图片必须通过 authenticated fetch 读取 blob 并生成 object URL，不能把私有 resource URI 直接放进 `<img src>`。
- 普通文件仍然可以作为 file+meta card 被收藏、引用或加入后续 whiteboard，但不生成 subject table。

文件夹：

- 文件夹详情采用 Finder-like 浏览，而不是 card wall。
- 支持 list / column / icon 视图；icon tile 只显示图标和文件名，不塞摘要、大小、修改时间或正文内容。
- 单击子项只更新 folder-local selection 和轻量 preview；双击或 Enter 才打开子目录、文件详情或 structured table。
- Folder-local preview 展示名称、类型、大小、修改时间、URI 和语义类型，不加载正文、不混入子文件 `.meta`。
- 创建、上传、Copy、Move、Rename 都必须走真实 Pod resource 写入/复制/移动语义，并保留并发冲突保护。
- 创建子文件夹优先尝试 WebDAV `MKCOL`，必要时 fallback 到 LDP `POST + ldp:BasicContainer`。上传文本/Markdown/RDF/JSON 走 raw text resource，二进制走 blob resource，并使用 `If-None-Match: *` 防覆盖。
- Copy/Move/Rename 优先尝试 WebDAV `COPY` / `MOVE`；当浏览器或 Pod 不支持时，可 fallback 到 GET source、PUT destination、Move DELETE source。fallback 需要保留同名 `.meta` sidecar 中的业务 metadata，并改写 owner subject；409/412 仍作为目标冲突，不得被 fallback 覆盖。
- Copy/Move/Rename UI 使用 Finder-style 目标路径心智，不暴露成“粘贴完整 URI”主流程；跨 Pod absolute URI 只能用于打开/复制 URI，不作为复制/移动目的地。相对路径不得逃逸当前 folder。

Subject 到文件：

- Table/Kanban/Whiteboard 中某个 subject 本身是 Pod 文件/resource 时，单击先打开 Subject Peek，保留当前结构化视图上下文。
- Enter、双击或 Peek 中的显式 `打开资源` 才进入 Files resource opening flow。
- Fragment subject 或 relation/term target 默认打开 term/card 定义或同表内 subject preview；用户显式选择 “Open resource file” 时再打开承载文件。
- 从 subject 跳到文件详情时要保存返回上下文：Table、class scope、搜索、排序、隐藏 predicate、当前 view、subject、scrollTop/row index。
- 生产 route bridge 应把 subject open 写入 URL query，并在返回时同时用 subject 和 row index 恢复焦点；browser history helper 只作为无 RouterProvider 的组件测试 fallback。
- Subject 直接资源跳转不隐式创建 Ingest proposal； source-linked card 的刷新/Review Ingest 在文件详情里发起。

## Kanban 和 Whiteboard 规则

Kanban：

- Kanban 是 `+ View` 投影，不是独立数据模型。列分组来自 status/class/owner/review state 或自定义 predicate。
- Card 标题是 subject/resource，正文是摘要，底部展示 class、selected predicate chips、pending vocab 标记、source-linked byline 和 relation 入口。
- 第一阶段可使用 dnd-kit sortable/droppable primitives；跨列移动到可写 grouping predicate 时创建 structured cell proposal / Inbox approval，同列排序只写 `.meta` view metadata。
- Locked vocab table 中的 Kanban 只能用于审阅 term/proposal 状态，不能绕过 vocab approval 写 canonical term。

Whiteboard：

- Whiteboard 只承载被用户选入的 subject cards，不默认铺开整个 `.ttl` 的所有 triples。
- 线可以来自 RDF relation，也可以是临时 visual relation；二者必须在 UI 和 `.meta` 存储上区分。删除 subject 或清空 board 时同步清理相关 visual relation。
- 第一阶段 Whiteboard 是 subject-card/relation projection，不是通用自由画布。后续若进入自由 canvas，再评估 tldraw；如果更偏 RDF relation graph / workflow editor，再评估 React Flow。

## 富文本编辑器

- 第一阶段使用 Tiptap / ProseMirror 作为普通可编辑文件和 source-linked card sheet 的 rich editor surface。它是 headless、extension-based、React/Vite 友好，便于 LinX 控制 Heptabase-like 低 chrome 编辑器、block toolbar、slash menu、link/embed/custom node 和 RDF metadata bridge。
- 接入时必须覆盖序列化、粘贴、撤销/重做、accessibility、dirty/save state、source conflict、mode switch 和 persistence 测试。
- Lexical 是长期备选，适合完全自定义 editor state/plugin；Milkdown/Crepe 是 Markdown-first 备选，但 schema extensibility 不如 Tiptap/ProseMirror 自然。

## Chat files 边界

`聊天文件` 是底部菜单里的二级入口，不出现在一级导航。

它消费当前 chat/thread 的 message `richContent` file blocks 和明确的 runtime artifact containers：

```text
richContent: { type: "file", fileUrl/resourceUri, name, size, mimeType }
artifacts / files / generatedFiles / outputs / resources / attachments
```

排序优先级：

1. 当前聊天 / 当前话题。
2. 最近聊天文件。
3. 已收藏文件。
4. 其他可关联到会话的 Pod resource。

边界：

- Runtime 真正生成文件后应写入结构化 file/artifact records。
- Files 不从 stdout、stderr、runtime log、assistant 文本、tool name 或本地工作区路径里猜文件。
- 当前 thread 没有 workspace URI 时，只展示已结构化引用的当前 Pod 文件，不递归扫描 Pod root。
- `聊天引用` / `运行产物` 只作为 `sourceLabel` 展示，不能写入 `tags` 或进入 tag filter。

## 一级文件模块

一级 `文件` 模块面向完整 Pod 浏览：

- Pod 根目录。
- 容器树。
- RDF/resource 详情。
- 资源 URI。
- 资源权限/可访问状态。
- 最近文件。
- `agents/{agentId}/` Agent home 浏览，例如 `/agents/__secretary__/`。
- `/.data/workspaces/{workspaceId}/` Workspace 容器和 `.meta` 浏览。
- `/.data/repositories/{repositoryId}.ttl` Repository 元信息浏览。

Pod 浏览是真实能力，不是后续可选项。区别是 `聊天文件` 面向聊天来源组织，一级 `文件` 模块面向完整目录和 resource 浏览。

## Agent / Workspace / Repository 文件视角

Files 是 File Browser / Pod 视角，可以看到这些 Pod 资源，但不把它们变成单独管理产品：

| Pod 路径 | Files 中的展示 | 产品含义 |
| --- | --- | --- |
| `/agents/{agentId}/` | 容器 / Agent home | Agent 自己的规则、skills、MCP、backend、compaction、memory |
| `/.data/workspaces/{workspaceId}/` | 容器 / Workspace | 运行时真实 worktree/cwd；`.meta` 存 git/workspace 快照 |
| `/.data/repositories/{repositoryId}.ttl` | RDF resource | 仓库元信息，不是工作区 |

Repository 不用单独做管理页。用户从 Chat 或 Session 回到的是 Workspace；Repository 只作为 Workspace `.meta` 链接的来源元信息出现。

Workspace `.meta` 可展示：

- repository resource URI。
- local path / cwd。
- branchRef / branchName。
- startCommit / currentCommit。
- dirty state。

这些字段是 Workspace 元数据，不复制到 Session 详情里。

## 文件详情操作

- 打开 URI。
- 复制 URI。
- 收藏。
- 进入所在 Pod 容器。
- 下载。
- 系统打开：仅当桌面 shell 暴露 `openExternal` 能力时展示，并调用系统默认处理器；它不同于 `打开 URI` 的浏览器新窗口行为。
- Access：打开 ACL/ACR 状态弹窗，展示有效来源、继承状态、public/authenticated/app/owner 权限，并提供 access proposal 草案入口。

## 数据边界

- 文件对象来自 files/browser/query 能力。
- 收藏关系走 Favorites 模块已有结构。
- 会话关联走 chat/thread/message URI 关系；消息内文件关联以 `richContent` file block / artifact record 为准。
- Pod 目录浏览走真实 Pod LDP/container listing 能力。
- 结构化 Pod 数据读写优先走 `drizzle-solid` + `@undefineds.co/models` schema/repository/collection；壳层不手写 shared resource 的 Turtle parser。
- Card 是 file/resource + RDF metadata 的 UI 投影，不新增平行 card authority。
- Agent/Workspace/Repository 的 durable 语义由 `@undefineds.co/models` 负责，Files 只读取和展示。

## 验收

- 文件入口不展示假数据。
- `聊天文件` 只作为底部菜单的二级入口出现。
- 一级 `文件` 主导航保留。
- 能浏览 Pod 根目录和容器树。
- 能打开 Pod resource 详情。
- 文件主列表没有 `来源` 列，也不按聊天来源分组。
- `.ttl` / `.jsonld` 默认以 Table 打开，支持在右上角 Class scope 和 Filter/Sort/Search 工具中按 class / predicate 筛选。
- 除内容详情弹窗外，folder/file/`.ttl` 的 `.meta` 都通过右侧 inspector drawer 展示，默认收起；`.ttl` 不默认把右栏占用为某个 subject card。
- `+ Subject` 在 Table 最后一行；`+ Predicate` 在表头区域，并打开 predicate 类型选择/定义流程。
- class 过滤默认收起在右上角 Class 控件下，Table 有明确筛选和排序按钮；class 不作为普通重复列。
- predicate header 默认紧凑隐藏 namespace，并可用 `ns` switch 展开；predicate 列宽按 Excel 式表头分隔线拖拽调整。
- 能打开至少一个非 `.ttl` 可编辑文件并直接进入富文本/源码编辑详情弹窗，`.meta` 位于弹窗尾部。主区域不内嵌可编辑文件正文 preview；只读预览文件不弹编辑详情。
- 右侧 inspector 作为抽屉从 head 下沿覆盖 content 区，可折叠；folder/file/`.ttl` 共用该行为。
- subject 行如果可解析为 Pod resource，单击先打开 Subject Peek，Enter、双击或显式打开进入对应 Files opening flow；fragment/card 走 term/card peek 和显式打开动作。
- Whiteboard、Kanban、Raw 只作为显式 `+ View` projection 出现，不替代 Table 默认视图。
- class tag、topic tag、predicate/meta 的 RDF 语义在 UI 中可区分。
- 能看见 Agent home、Workspace `.meta`、Repository metadata 的文件视角。
- Session 不在 Files 里复制仓库、分支和 commit 字段。
- 收藏文件后 Favorites 可见。
- 无权限或无法访问时显示明确错误。
