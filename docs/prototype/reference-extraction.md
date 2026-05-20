# Reference Extraction

本轮原型不是像素级复刻任何产品，而是从已检查的开源实现中抽取模块结构约束。

## 已检查仓库

| 仓库 | 本地路径 | 用途 |
| --- | --- | --- |
| Signal Desktop | `.external/references/Signal-Desktop` | 桌面 IM 壳、窄侧栏、会话列表、右侧详情、聊天媒体入口 |
| File Browser | `.external/references/filebrowser` | 文件管理器路径、面包屑、列表列、文件操作和详情入口 |

Telegram Desktop sparse clone 因网络连接 reset 失败，本轮不把 Telegram 源码作为已验证依据。

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

## 当前原型落地

- `apps/prototype/src/main.tsx` 保留四个一级模块：聊天、联系人、文件、收藏。
- `Chat` 参考 Signal `ConversationList` / `BaseConversationListItem` / `ConversationDetails` / `MediaGallery`：固定高会话列表、头像标题摘要时间未读状态、对话详情头、右侧详情分组、会话内媒体/文件/链接二级入口。
- `Contacts` 参考 Signal `ContactDetail` / `ConversationDetailsHeader`：大头像、名称、简称、发送消息主按钮、WebID/用户名/Pod 容器等分组字段。
- `Files` 主模块改成 Pod/Finder 视角：左侧位置/容器/类型，顶部路径工具栏，中间文件表格，右侧 resource inspector。
- `Favorites` 参考 Signal `MediaGallery` / `DocumentListItem` / `ListItem`：按类型分段、按日期分组、缩略图/标题/副标题/日期/回跳目标，不做卡片墙。
- `聊天文件` 只在左下底部菜单出现，用于会话附件和消息引用。
- `docs/prototype/module-files.md` 明确禁止一级文件模块按聊天来源组织。

## 模块映射

| LinX 模块 | 参考源码 | 抽取结构 | 原型落点 |
| --- | --- | --- | --- |
| 聊天 | Signal `ConversationList`、`BaseConversationListItem`、`ConversationDetails`、`MediaGallery` | 左侧密集会话行、聊天正文、右侧详情分组、会话内媒体入口 | `ConversationList`、`ChatPane`、`DetailRail` |
| 联系人 | Signal `ContactDetail`、`ConversationDetailsHeader` | 80px 级别头像、名称/简称、发送消息、电话/邮件/地址式字段列表 | `ModuleList(contacts)`、`ModuleContent(contacts)`、`ModuleDetail(contacts)` |
| 文件 | File Browser `FileListing`、`Breadcrumbs`、`ListingItem`、`Preview` | 位置/容器导航、面包屑、文件表格、资源 inspector | `ModuleList(files)`、`ModuleContent(files)`、`ModuleDetail(files)` |
| 收藏 | Signal `MediaGallery`、`DocumentListItem`、`ListItem` | 类型 tab、日期组、缩略图列表项、回到原消息/文件 | `ModuleList(favorites)`、`ModuleContent(favorites)`、`ModuleDetail(favorites)` |
