# Reference Extraction

本轮原型不是像素级复刻任何产品，而是从已检查的开源实现中抽取模块结构约束。

## 已检查仓库

| 仓库 | 本地路径 | 用途 |
| --- | --- | --- |
| Signal Desktop | `.external/references/Signal-Desktop` | 桌面 IM 壳、窄侧栏、会话列表、右侧详情、聊天媒体入口 |
| File Browser | `.external/references/filebrowser` | 文件管理器路径、面包屑、列表列、文件操作和详情入口 |

Telegram Desktop sparse clone 因网络连接 reset 失败，本轮不把 Telegram 源码作为已验证依据。

Heptabase 是本轮新增的产品交互参考，不作为已检查源码证据。它只用于结构化 resource 的 card/property/tag/whiteboard 语言：tag 对齐 class，property 对齐 RDF metadata/predicate，note/card 对齐 subject/resource，whiteboard 对齐 selected subject cards 的空间组织。

本轮表格交互补充参考：

- Notion Database properties: properties 为 database item 提供上下文，并参与 filter / sort / search，因此列头需要同时表达字段定义和筛选状态。<https://www.notion.com/help/database-properties>
- Airtable Field type overview: field type 决定字段存储的数据格式；新增字段从最右侧 `+` 进入，选择 type、命名并创建。<https://support.airtable.com/docs/field-type-overview>
- Airtable Field actions: 字段 header 可进入字段操作和插入字段。<https://support.airtable.com/docs/airtable-field-actions>
- Heptabase organize knowledge/projects: tag 像 table，tag 下的 card 是 row，tag properties 是 columns。<https://wiki.heptabase.com/organize-knowledge-and-projects>

## Signal Desktop 抽取

源码证据：

- `.external/references/Signal-Desktop/ts/components/NavTabs.dom.tsx`
- `.external/references/Signal-Desktop/ts/components/ConversationList.dom.tsx`
- `.external/references/Signal-Desktop/ts/components/conversationList/ConversationListItem.dom.tsx`
- `.external/references/Signal-Desktop/ts/components/conversationList/BaseConversationListItem.dom.tsx`
- `.external/references/Signal-Desktop/ts/components/conversation/ContactDetail.dom.tsx`
- `.external/references/Signal-Desktop/ts/components/conversation/conversation-details/ConversationDetails.dom.tsx`
- `.external/references/Signal-Desktop/ts/components/conversation/conversation-details/ConversationDetailsHeader.dom.tsx`
- `.external/references/Signal-Desktop/ts/components/conversation/media-gallery/MediaGallery.dom.tsx`
- `.external/references/Signal-Desktop/ts/components/conversation/media-gallery/DocumentListItem.dom.tsx`
- `.external/references/Signal-Desktop/ts/components/conversation/media-gallery/ListItem.dom.tsx`

用于 LinX 原型的约束：

- 窄侧栏是主模块切换面，设置/资料等低频入口靠边放，不和当前聊天内容竞争。
- 会话列表是固定行高的密集列表，核心信息是头像、标题、摘要、时间、未读状态。
- 右侧详情是当前对象的辅助上下文，不应变成主流程解释页。
- 聊天媒体/文档/链接是会话详情里的二级聚合，不等同于一级文件模块。

## File Browser 抽取

源码证据：

- `.external/references/filebrowser/frontend/src/views/files/FileListing.vue`
- `.external/references/filebrowser/frontend/src/components/Breadcrumbs.vue`
- `.external/references/filebrowser/frontend/src/components/files/ListingItem.vue`
- `.external/references/filebrowser/frontend/src/components/Sidebar.vue`
- `.external/references/filebrowser/frontend/src/views/files/Preview.vue`

用于 LinX 原型的约束：

- 文件模块首要结构是路径面包屑、位置/容器导航、文件列表和操作区。
- 文件列表列应服务文件管理心智：名称、类型、大小、修改时间、权限或可访问状态。
- 目录和文件可以在同一浏览器中呈现，但要保留目录树/容器入口。
- 详情区展示 URI、路径、权限、修改时间、预览/图标和打开/复制/下载操作。
- 来源会话不是一级文件模块的主组织方式；它属于聊天文件或收藏回跳。

Finder 只作为用户心智参考，不作为主实现结构：LinX 可以借鉴文件夹/文件图标、选择、重命名、移动、复制、预览和快捷键预期，但 Files 本质仍是 Pod / Solid resource browser。

## Heptabase 交互语言抽取

用于 LinX 结构化 resource 的约束：

- Card 是 file/resource + RDF metadata 的 UI 投影，不是新的持久化 authority。
- `.ttl` / RDF 文件默认打开 Table：class / `rdf:type` 在右上角 Class icon 里做必选 scope，一行一个当前 class 的 subject/resource，表头就是 schema，顺序是 `subject / predicate... / + Predicate`，不重复展示 class 列。
- Heptabase 表格交互对齐：`+ Subject` 是最后一行，`+ Predicate` 是表头动作并打开 predicate 类型选择下拉卡片，筛选和排序是 Table 工具栏操作；predicate header 默认隐藏 namespace，并通过一个滑动 `ns` switch 展开完整 prefix。
- predicate 统一作为列展示；property 与 relation 是 predicate 类型/值形态，不在 UI 里拆成两块面板。
- predicate 列宽按 Excel 式表头分隔线拖拽调整，不使用全局宽度滑杆。
- cell 不按纯文本处理；predicate 类型决定 cell 的显示和整格点击原地操作，例如 Heptabase-like tag selector 中选择/搜索/创建枚举值、multi-select 加减枚举值、打开 relation、编辑文本/日期或直接切换 checkbox。
- 除内容详情弹窗外，folder/file/`.ttl` 的 `.meta` 统一进入右侧 inspector drawer，默认收起；选中 subject 的 card 详情留在行展开、Card 视图或显式打开动作里。
- 非 `.ttl` 可编辑文件直接进入 macOS sheet 风格的富文本编辑详情层，`.meta` 放在详情层尾部。只读媒体可保留轻量 preview。ACL/ACR 不混入 `.meta`，通过 Access 按钮打开弹窗。
- Card 详情参考 Heptabase note/card：标题、摘要/正文、properties、tags、relations、backlinks。
- Heptabase tag 只在表示 type 时对齐 `rdf:type`；主题标签如 `AI`、`重要`、`待整理` 应作为 aboutness/tag metadata。
- Whiteboard 只展示用户选入的 subject cards；布局属于 board/UI metadata，不应反写为源 `.ttl` 的业务事实。
- Kibana/Discover、Kanban、Whiteboard、Raw 等额外视图通过 `+ View` 添加或切换，服务 vocab 维护、卡片分组、关系组织和数据质量检查。

## 当前原型落地

- `apps/prototype/src/main.tsx` 保留四个一级模块：聊天、联系人、文件、收藏。
- `Chat` 参考 Signal `ConversationList` / `BaseConversationListItem` / `ConversationDetails` / `MediaGallery`：固定高会话列表、头像标题摘要时间未读状态、对话详情头、右侧详情分组、会话内媒体/文件/链接二级入口。
- `Contacts` 参考 Signal `ContactDetail` / `ConversationDetailsHeader`：大头像、名称、简称、发送消息主按钮、WebID/用户名/Pod 容器等分组字段。
- `Files` 主模块改成 File Browser 主骨架 + Finder 心智：左侧文件夹树，内容区文件表格/只读预览；`.ttl` 使用右侧 `.meta` inspector drawer，普通可编辑文件直接使用 macOS sheet 风格详情编辑层。
- `Files` 打开 `.ttl` / RDF resource 时默认进入 subject table，通过 `+ View` 切换 Kibana/Discover、Kanban、Whiteboard 和 Raw。
- `Favorites` 参考 Signal `MediaGallery` / `DocumentListItem` / `ListItem`：按类型分段、按日期分组、缩略图/标题/副标题/日期/回跳目标，不做卡片墙。
- `聊天文件` 只在左下底部菜单出现，用于会话附件和消息引用。
- `docs/prototype/module-files.md` 明确禁止一级文件模块按聊天来源组织。

## 模块映射

| LinX 模块 | 参考源码 | 抽取结构 | 原型落点 |
| --- | --- | --- | --- |
| 聊天 | Signal `ConversationList`、`BaseConversationListItem`、`ConversationDetails`、`MediaGallery` | 左侧密集会话行、聊天正文、右侧详情分组、会话内媒体入口 | `ConversationList`、`ChatPane`、`DetailRail` |
| 联系人 | Signal `ContactDetail`、`ConversationDetailsHeader` | 80px 级别头像、名称/简称、发送消息、电话/邮件/地址式字段列表 | `ModuleList(contacts)`、`ModuleContent(contacts)`、`ModuleDetail(contacts)` |
| 文件 | File Browser `FileListing`、`Breadcrumbs`、`ListingItem`、`Preview` + Finder 心智 | 文件夹树、文件表格/预览、右侧 `.meta` 抽屉、可编辑文件富文本详情弹窗、弹窗尾部 `.meta`、Access 弹窗 | `ModuleList(files)`、`ModuleContent(files)`、`FilesDetail`、`FileDetailModal` |
| 结构化资源 | Heptabase card/property/tag/kanban/whiteboard 语言 | Table 默认、表头 schema、predicate 类型下拉、subject card、文件 `.meta` inspector、kanban grouped cards、whiteboard selected cards | `StructuredTable`、`FilesDetail`、`StructuredKanban`、`StructuredWhiteboard` |
| 收藏 | Signal `MediaGallery`、`DocumentListItem`、`ListItem` | 类型 tab、日期组、缩略图列表项、回到原消息/文件 | `ModuleList(favorites)`、`ModuleContent(favorites)`、`ModuleDetail(favorites)` |
