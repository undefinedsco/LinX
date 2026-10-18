# LinX R6 交互稿

R6 改版的交互稿。2026-10-11 定稿，后续开发以这里为准。实现规格见 [`docs/superpowers/specs/2026-10-11-linx-r6-interaction-implementation.md`](../../superpowers/specs/2026-10-11-linx-r6-interaction-implementation.md)。

- 在线画布：https://claude.ai/artifact/1rrsHcapkxSu5eosy2P37y（私有，需要 owner 分享）。
- `canvas.json`：画布结构，包括页面、画板坐标和标题，以及每个画板旁的说明便签。便签里的“已定 / 默认（待确认）”就是这次评审的决定。
- `*.dc.html`：每个画板一份。它们依赖画布运行时（`support.js`、`<x-dc>`、`dc-import`），不在本仓库里，单独用浏览器打开只能看到静态 HTML。读它们是为了核对文字、结构和状态。
- 编号：S = 全局，W = 聊天与工作，K = 文件与收藏，A = 我的 AI（这一轮先不做）。

### 全局

| 编号 · 标题 | 文件 |
|---|---|
| S0 Rail | `Nav.dc.html` |
| S1 聊天首页（四栏框架） | `Main.dc.html` |
| S1b 列表交互细节 | `ListMenus.dc.html` |
| S1c 列表与会话状态 | `ListStates.dc.html` |
| S0b 会话列表组件 | `ChatList.dc.html` |
| S2 全局查找 | `Search.dc.html` |
| S3 个人卡片 | `Space.dc.html` |
| S3b 个人卡片状态与空间设置 | `SpaceStates.dc.html` |
| S4 退出登录 | `SignOut.dc.html` |
| S3c 编辑个人资料 | `Profile.dc.html` |
| S5 窄窗任务切面 390 | `Narrow.dc.html` |
| S5b 窄窗其他页（390） | `NarrowMore.dc.html` |
| S5c 中等宽度 1180 | `Medium1180.dc.html` |
| S5d 中等宽度 768 | `Medium768.dc.html` |
| S6 登录：先选数据放哪 | `Login.dc.html` |
| S6b 登录与空间准备状态 | `LoginStates.dc.html` |
| S7 设置 | `Settings.dc.html` |
| S7b 本机服务、外部访问与更新 | `SettingsStates.dc.html` |

### 聊天与工作

| 编号 · 标题 | 文件 |
|---|---|
| W0 第一次打开：LinX 先打招呼 | `Welcome.dc.html` |
| W0b 欢迎之后 | `WelcomeStates.dc.html` |
| W1 AI 工作会话 | `Conversation.dc.html` |
| W1b 过程条与消息状态 | `ConversationStates.dc.html` |
| W2 会话内审批与输入 | `Decision.dc.html` |
| W2b 审批与输入卡状态 | `DecisionStates.dc.html` |
| W2c 消息里的卡片：A2UI × RDF | `CardCatalog.dc.html` |
| W3 纠正：消息上的“记住” | `Correction.dc.html` |
| W3b 记住与记忆 | `CorrectionStates.dc.html` |
| W4 干完了发文件 | `Artifact.dc.html` |
| W4b 文件消息状态 | `ArtifactStates.dc.html` |
| W5 联系人 | `People.dc.html` |
| W5b 助手、群、新朋友与状态 | `PeopleStates.dc.html` |
| W5c AI 助手、通话与空间权限 | `PeopleSolid.dc.html` |
| W6 持续任务与运行 | `Tasks.dc.html` |
| W6b 持续任务状态 | `TasksStates.dc.html` |
| W7 收件箱 | `Inbox.dc.html` |
| W7b 收件箱状态与活动记录 | `InboxStates.dc.html` |
| W7c LinX 自动通过的：拿出来复查 | `InboxAudit.dc.html` |
| W8 群聊 | `GroupChat.dc.html` |
| W8b 群聊、私聊与助手在群里 | `GroupChatStates.dc.html` |
| W9 新建：找人聊天、发起群聊、新的 AI 工作 | `NewChat.dc.html` |
| W10 让编程工具在文件夹里干活 | `Coding.dc.html` |
| W10b 编程工具状态 | `CodingStates.dc.html` |

### 文件与收藏

| 编号 · 标题 | 文件 |
|---|---|
| K0 文件左边栏：搜索 + 文件夹树 | `FilesNav.dc.html` |
| K1 文件首页 = 文件夹（表格视图） | `Library.dc.html` |
| K1b 新建、上传、空、没网与共享 | `LibraryStates.dc.html` |
| K2 卡片弹窗（从表格） | `Card.dc.html` |
| K2b 卡片状态（改动、版本、撤回） | `CardStates.dc.html` |
| K3 文件里的搜索 | `SearchScope.dc.html` |
| K3b 搜索状态 | `SearchStates.dc.html` |
| K4 白板视图（Heptabase 式） | `Board.dc.html` |
| K4b 白板状态 | `BoardStates.dc.html` |
| K5 AI 引用：弹出预览，跳到那一段 | `Source.dc.html` |
| K5b 解析只给 AI 用 | `SourceStates.dc.html` |
| K6 表格视图：表头就是属性 | `TagTable.dc.html` |
| K6b 加行、加列、加表 | `TagStates.dc.html` |
| K6c 词表文件夹：属性 / 类型 / 命名空间 | `Vocab.dc.html` |
| K6d 看板视图、表头菜单与保存状态 | `TagMore.dc.html` |
| K7 收藏 | `Favorites.dc.html` |
| K7b 收藏状态 | `FavoritesStates.dc.html` |
| K8 卡片弹窗（从文件夹） | `FileOpen.dc.html` |
| K8b 打开方式、媒体卡片、操作与状态 | `FileStates.dc.html` |
| K9 共享 | `Share.dc.html` |
| K9b 共享状态 | `ShareStates.dc.html` |
| K10 AI 改的：未确认草稿 | `Proposal.dc.html` |
| K10b AI 改动：保留、撤销、表格 | `ProposalStates.dc.html` |
| K11 授权：哪些事 LinX 自己判断 | `Grants.dc.html` |

### 我的 AI（先不做）

| 编号 · 标题 | 文件 |
|---|---|
| A0 我的 AI 左边栏组件 | `AINav.dc.html` |
| A1 我的 AI 概览 | `MyAI.dc.html` |
| A1b 概览状态 | `MyAIStates.dc.html` |
| A2 做事的方法 | `Method.dc.html` |
| A2b 方法保存、范围与冲突 | `MethodStates.dc.html` |
| A3 个人模型（现在：准备材料） | `Model.dc.html` |
| A3b 个人模型（接通后） | `ModelStates.dc.html` |
| A4 本次未使用个人模型 | `NotApplied.dc.html` |
| A4b 执行条件与模型连接 | `NotAppliedStates.dc.html` |