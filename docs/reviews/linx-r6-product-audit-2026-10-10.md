# LinX 现有产品与交互审查（对照 R6 总设计）

日期：2026-10-10。对象：`apps/web`（桌面壳加载的同一个 Web 应用），代码基线 `b7a9d50e`。

依据：[联合 R6 总设计](../../../homepage/docs/specs/personal-ai-product-experience-r6.md)与 [LinX R6 实施 Spec](../../../homepage/docs/specs/linx-product-experience-r6.md)（homepage `fad4513`）。Files 另按“参考 Heptabase，结合 Solid”的既定方向评估。

R6 的四份审查只读了文档，没有读产品代码。本文补上这一层：逐模块读代码，把 R6 要求和当前实现对齐，并标出差距的严重程度。

**证据级别：静态代码阅读。** 本轮没有运行产品。干净检出无法安装依赖（见 B1），所以界面行为都是从代码推出来的。标“需核实”的条目依赖 runtime 或 Pod 的实际行为。

编号沿用 R6：RD（设计裁决）、F（操作链）、AC（验收）、LW/LS（LinX 审查发现）。

## 0. 结论

1. **R6 是目标，当前产品仍是旧骨架。** 一级导航是 `聊天 / 联系人 / 文件 / 收藏`，纯图标、无文字。没有“知识”和“我的 AI”入口，模型服务藏在设置菜单里。这符合预期（文档都标了“不代表当前实现”），但差距要按包排期，不能只改菜单名。
2. **有四个问题不依赖 R6 也该先修。** 干净检出无法构建；等待输入的请求在 Web 端无处作答；白板和看板上的用户内容只存在浏览器里；中等窗口宽度下话题和 worker 面板消失。
3. **“做事的方法”散在三处，且没有范围。** 同一份 Agent 级系统提示词可以从聊天头部、右栏、联系人详情三处编辑。改了会影响这个助手的所有会话，界面不说明这一点。运行位置和模型选择也混在同一个表单里。
4. **知识层的基础比预期好，形态还没成形。** Files 已经有来源卡片（有来源、hash、Ingest 版本、审批和冲突检测）、基于 tldraw 的白板、表格/看板、反向链接和 AI 修改提案审批，这些正是 Heptabase 式知识工作的骨架。但基本单位仍是“文件 / 文档里的 subject”，不是卡片。白板只能放一份文档里的 subject，界面满是 Ingest、subject、predicate、canonical 这类工程术语。
5. **几处底层分层已经符合 R6，应保留。** 审批只有一次性的批准/拒绝，没有 `allow_always`；点赞/点踩只写在消息上，不进训练；收藏是引用加回跳；草稿和查询都按账号隔离；登录要求显式创建空间。

## 1. 先修的阻断项（P0）

| # | 问题 | 证据 | 影响 / R6 对应 |
|---|---|---|---|
| B1 | **干净检出无法安装和构建。** `@undefineds.co/ai-connections`、`extension-sdk`、`shared-ui` 用 `file:../../vendor/*` 引用，但 `vendor/` 不在 git 里，也没被忽略。源码实际在 `xpod/packages/*`。来源是 2026-09-13 的 `1b6758af`。 | [apps/web/package.json:55](../../apps/web/package.json:55) | 任何人、CI 和 worktree 都跑不起 lint/typecheck/test/build，合并说明 `b7a9d50e` 已记录此事。违反 dependency-guide 里“通过发布版本消费”的规则。所有 R6 实施包的实现验收都被它卡住。 |
| B2 | **等待输入的请求无处作答。** Inbox 把 `input_request` 显示成“审计事件”徽标，详情没有输入表单，只有“打开会话”。聊天端代码完全不处理 input request；会话内横幅也只挑认证和授权，忽略输入请求。铃铛计数却把它算作待办。 | [InboxDetail.tsx:54](../../apps/web/src/modules/inbox/ui/InboxDetail.tsx:54)、[inbox/domain/utils.ts:13](../../apps/web/src/modules/inbox/domain/utils.ts:13)、[InboxActionBanner.tsx:57](../../apps/web/src/modules/chat/features/inbox/InboxActionBanner.tsx:57) | F05/AC08：“waiting_input 回同一 Run”走不通，用户看到待办数却无法处理。需核实：runtime 是否把下一条聊天消息当作回答？即便如此，界面也没有说明。 |
| B3 | **白板布局、分组、手画连线和看板卡片顺序只存在浏览器 localStorage。** 代码注释明确称其为“renderer UI state”。 | [useStructuredViewMetadataController.ts:31](../../apps/web/src/modules/files/features/structured/useStructuredViewMetadataController.ts:31)、[local-structured-view-metadata-store.ts](../../apps/web/src/modules/files/features/structured/local-structured-view-metadata-store.ts) | 按 Heptabase 的模型，白板上的排布和连线就是用户的思考成果，不是视图偏好。换设备、换桌面/Web、清缓存都会丢；也不在 Pod 里，无法备份或带走（F07、Solid 数据主权）。 |
| B4 | **中等宽度下话题列表和 worker 面板不可达。** 右栏只在 ≥1280px 渲染，但切换按钮在所有宽度都显示，点了没有可见效果。ChatKit 自带的历史面板被关闭，话题切换和新建只存在于右栏。 | [PrimaryLayout.tsx:251](../../apps/web/src/modules/layout/PrimaryLayout.tsx:251)、[useChatKitSurface.ts:118](../../apps/web/src/modules/chat/features/chatkit/useChatKitSurface.ts:118)、[ChatRightSidebar.tsx:492](../../apps/web/src/modules/chat/components/ChatRightSidebar.tsx:492) | R6 规定的 1180 和 768 两档验收宽度下，用户无法切换或新建话题（AC02）。560–1279px 覆盖了大多数笔记本分屏场景。 |

## 2. 按 R6 三入口逐项对照

等级：🔴 与 R6 冲突或功能断路 · 🟠 缺少 R6 要求的能力 · 🟡 体验/文案问题 · 🟢 已符合，应保留。

### 2.1 Shell 与全局（R6-A；RD01/RD11；LS01/LS09/LS13；§3.4）

| 等级 | 现状 | 证据 | R6 要求 |
|---|---|---|---|
| 🟠 | 一级导航为 `chat / contacts / files / favorites`；默认总是落到聊天，不恢复上次的合法上下文 | [PrimaryLayout.tsx:57](../../apps/web/src/modules/layout/PrimaryLayout.tsx:57)、[micro-app-registry.tsx:250](../../apps/web/src/modules/layout/micro-app-registry.tsx:250) | 工作 / 知识 / 我的 AI；重入上次合法上下文 |
| 🔴 | 用户头像位置显示 LinX 产品 Logo | [PrimaryLayout.tsx:373](../../apps/web/src/modules/layout/PrimaryLayout.tsx:373) | “头像 fallback 用中性头像或首字，不用产品标记冒充用户身份” |
| 🔴 | 空间徽标的 title 和 aria-label 固定写“已连接”，不读取真实状态 | [PrimaryLayout.tsx:386](../../apps/web/src/modules/layout/PrimaryLayout.tsx:386) | LS09/RD12：账号、空间可写、AI 可用分别反馈，不假报 |
| 🟠 | 导航是纯图标，只有 aria-label/title，没有可见文字；当前项靠颜色加填充区分 | [PrimaryLayout.tsx:409](../../apps/web/src/modules/layout/PrimaryLayout.tsx:409) | “一级入口默认有文字；紧凑模式仍有可读名称” |
| 🟡 | 会话未就绪时整屏空白，没有任何状态说明 | [PrimaryLayout.tsx:350](../../apps/web/src/modules/layout/PrimaryLayout.tsx:350) | 部分就绪要说明正在做什么 |
| 🟡 | 再次点击当前导航项会隐藏列表栏，这个行为没有任何提示 | `handleNavigate` | 可发现性 |
| 🟠 | 退出登录不确认，不提示未提交的编辑，也不提醒仍在运行的 worker/Run 不会因此停止 | [login/controller.tsx:1130](../../apps/web/src/modules/login/controller.tsx:1130) | §3.4：草稿处理；“退出不等于停止 Run” |
| 🟢 | 草稿按账号、会话、话题分键保存；聊天查询带 `scopeKey` | [draft-store.ts](../../apps/web/src/modules/chat/draft-store.ts)、[chat/data/collections.ts:2452](../../apps/web/src/modules/chat/data/collections.ts:2452) | 切号不串内容（需运行时验证） |
| 🟢 | 登录区分“需要创建空间”“空间不匹配”“无法写入”“本机空间启动失败”等状态，并提供显式“创建当前空间”入口 | `modules/login` | 注册/登录不隐式建 Pod，失败分别说明 |

### 2.2 工作：会话、审批、任务（R6-B；F01/F03/F05；LW01–03/07–10）

| 等级 | 现状 | 证据 | R6 要求 |
|---|---|---|---|
| 🔴 | **方法编辑散在三处且没有范围。** 聊天头部“助手设置”、右栏“系统提示词”卡片、联系人详情都能改同一份 Agent 级 `instructions`。保存会覆盖该 Agent 的所有会话，同时把联系人名称和会话标题一起改掉。 | [ChatHeader.tsx:353](../../apps/web/src/modules/chat/components/ChatHeader.tsx:353)、[ChatRightSidebar.tsx:486](../../apps/web/src/modules/chat/components/ChatRightSidebar.tsx:486)、[ContactDetail.tsx:286](../../apps/web/src/modules/contacts/ui/ContactDetail.tsx:286)、[chat/data/collections.ts:2163](../../apps/web/src/modules/chat/data/collections.ts:2163) | F03/LW03/LS06：当前工作与默认方法分开；显示作用范围、继承和差异；一处编辑 |
| 🟠 | 同一个“助手设置”表单里混着方法（提示词）和运行位置（客户端/xpod） | [ChatHeader.tsx:379](../../apps/web/src/modules/chat/components/ChatHeader.tsx:379) | 方法编辑页型：“凭据、网络、训练参数混入同一大表单”属反例 |
| 🟠 | 换模型会把 Agent、联系人、会话的头像改成提供方 Logo | [chat/data/collections.ts:2208](../../apps/web/src/modules/chat/data/collections.ts:2208) | LS03：助手身份不随模型变；模型是可替换的执行条件 |
| 🟠 | 审批只能在收件箱完成；会话内横幅写“授权统一在收件箱处理”，并把用户带离当前会话 | [InboxActionBanner.tsx:57](../../apps/web/src/modules/chat/features/inbox/InboxActionBanner.tsx:57) | §3.4：“同一批准也可在原工作完成” |
| 🟢 | 审批只有一次性的批准/拒绝，可写理由，记录 `decisionBy`；没有 `allow_always` | [inbox/data/collections.ts:424](../../apps/web/src/modules/inbox/data/collections.ts:424) | RD05：一次允许 ≠ 持久 grant |
| 🟡 | 收件箱“全部”视图混入审计事件，有单独的“审计”页签 | [inbox/domain/utils.ts](../../apps/web/src/modules/inbox/domain/utils.ts) | “不把全部后台日志当通知” |
| 🟠 | **任务面板是开发者工具。** 右栏里的 Symphony 面板直接用 Codex/Claude/CodeBuddy 后端、工作区路径和英文原始状态（`running`、`unknown`）；只显示 5 个 worker，没有停止、暂停、Run 详情或等待原因 | [SymphonyWorkerPanel.tsx:165](../../apps/web/src/modules/symphony/components/SymphonyWorkerPanel.tsx:165) | F05：工作内任务视图；真实阶段、等待对象；四类停止事实分开 |
| 🟡 | 会话列表把 workspace 话题的预览替换成“已完成/运行中”等状态；需核实“已完成”是否只是一轮回复结束 | [ChatListPane.tsx:166](../../apps/web/src/modules/chat/components/ChatListPane.tsx:166) | LW09：回复结束 ≠ Run 完成 |
| 🟠 | 点赞/点踩只写入消息字段，没有“纠正 → 仅此次 / 保留为知识草稿”的选择 | [useChatKitSurface.ts:161](../../apps/web/src/modules/chat/features/chatkit/useChatKitSurface.ts:161)、`handleItemsFeedback` | F01/RD06。🟢 不把反馈当训练信号，这点符合 RD04 |
| 🟠 | “项目记忆”是纯文本条目，没有来源、条件、时间，不出现在 Files/知识中 | [ProjectContextDialog.tsx:97](../../apps/web/src/modules/chat/components/ProjectContextDialog.tsx:97) | RD07：知识靠来源和条件建立可信度。它已经是用户明确保存、模型每轮读取的“已确认知识”，应并入知识层 |
| 🟡 | 没选中会话时的空态写“再为它绑定运行时与文件夹” | [ChatContentPane.tsx](../../apps/web/src/modules/chat/components/ChatContentPane.tsx) | LW01：技术现场挤占工作语言 |
| 🟡 | 删除会话和消息用浏览器原生 `confirm()` | [ChatListPane.tsx:850](../../apps/web/src/modules/chat/components/ChatListPane.tsx:850)、[useMessageActionsController.ts:210](../../apps/web/src/modules/chat/features/messages/useMessageActionsController.ts:210) | 公共对话框合同（焦点、Esc、回到触发点） |
| 🟢 | 首屏是可直接输入的欢迎页加三个起步动作；聊天读取失败区分无权限、超时、找不到、不可用；离线时显示缓存并说明不能发送 | [ChatContentPane.tsx](../../apps/web/src/modules/chat/components/ChatContentPane.tsx) | LW01、RD12 |
| 🟢 | 新建菜单提供“创建助手 / 添加朋友 / 发起群聊”，私聊和群组不需要先建任务 | [ChatListPane.tsx:544](../../apps/web/src/modules/chat/components/ChatListPane.tsx:544) | AC01 人际路径 |
| 🟡 | `fetchCompletion` / `getProviderBaseUrl` 没有调用方；未知提供方会回落到 `api.openai.com` | [chat/data/collections.ts:2253](../../apps/web/src/modules/chat/data/collections.ts:2253) | 死代码；若被复用会静默改变数据去向（DEP04） |

### 2.3 知识：Files、收藏（R6-C；F02；LW05/06；LS04/12）

Files 与 Heptabase 的详细对照见第 3 节。

| 等级 | 现状 | 证据 | R6 要求 |
|---|---|---|---|
| 🟠 | 搜索只是对已加载条目做名称/文本的子串过滤（“搜索文件树”“搜索当前范围”），不会说明覆盖了什么、漏了什么 | [tree-model.ts:172](../../apps/web/src/modules/files/domain/resource/tree-model.ts:172) | F02/AC04：区分未覆盖、无权限、来源失效、无命中 |
| 🟠 | 结构化资源固定提供表格/看板/白板/Raw 视图切换 | [structured-resource-toolbar-model.ts:49](../../apps/web/src/modules/files/features/structured/structured-resource-toolbar-model.ts:49) | “图谱、Kanban、Whiteboard、Raw 有真实任务时才出现” |
| 🟡 | 来源卡片界面满是工程词：“Ingest 全部”“已 Ingest chunk”“来源 hash”“审批 ID”“canonical 内容需审批后更新”“Source-linked card metadata 暂不可用” | `files/features/detail/*source-linked*` | LS14：用可读的来源、条件和修订建立气质 |
| 🟢 | 来源卡片有来源地址、hash、Ingest 版本、写入前审批和冲突检测；AI 修改、词表、单元格写入都走提案审批 | `files/domain/source`、`*-proposal-use-cases.ts` | RD07：不静默覆盖 |
| 🟢 | 收藏是“打开原对象 / 取消收藏”，取消不删源 | [favorites/ui/FavoriteDetail.tsx](../../apps/web/src/modules/favorites/ui/FavoriteDetail.tsx) | §3.2 |
| 🟡 | 收藏详情总是显示保存时的快照正文，不区分源已删除、撤权还是离线 | [FavoriteDetail.tsx:104](../../apps/web/src/modules/favorites/ui/FavoriteDetail.tsx:104) | LS12：撤权不默认回显正文 |
| 🟠 | 会话、联系人、文件可以标星进收藏；单条消息没有收藏入口（收藏页虽然有“消息”类型） | `favoriteHooks.onStarredChange` 只在 chat/contacts/files 调用 | §3.2：“原消息的收藏状态在工作内仍可见”“收藏指向文件、消息、知识” |

### 2.4 我的 AI（R6-D 的 LinX 入口；§3.3；LS01/LS05）

| 等级 | 现状 | R6 要求 |
|---|---|---|
| 🟠 | 没有“我的 AI”。模型服务是设置菜单里的嵌入 applet（依赖缺失的 vendor 包），只管提供方连接 | 稳定入口承载“做事的方法”和“个人模型”；连接和密钥留在低频设置 |
| 🟠 | “方法”的实际载体就是 Agent 的 `instructions` 字符串（见 2.2） | 目标、标准、能力组合、例外、适用范围；当前覆盖与默认分开 |
| 🟢 | 没有训练按钮、训练计数或“已学会”文案 | RD04/RD12：未接通不假成功 |

第一批的“我的 AI”可以不等 Foundry：把三处提示词编辑收成一处“方法”页，标明作用范围，并把项目记忆和已确认知识如何参与工作列出来；个人模型只写“尚未训练”。这样它就不是空页（AC10）。

### 2.5 视觉与可访问性（R6-G；§6；LS07/08/13/14）

| 等级 | 现状 | 证据 | 目标 |
|---|---|---|---|
| 🟠 | 主题仍是旧色：中性灰底 `0 0% 98%`、主色 `#735FC4` | [index.css:21](../../apps/web/src/index.css:21)、[index.css:30](../../apps/web/src/index.css:30) | LinX DESIGN：纸色 `#F7F4ED` 和墨紫 `#563E84`（文档已标为后续任务） |
| 🟠 | 固定“导航 + 列表 + 内容 + 右栏”四列骨架，每个模块都按这个注册 | `MicroAppDefinition` | RD11：页型先于列数，详情按需 |
| 🟡 | 原生 `<select>`（聊天头部运行位置、Symphony 后端）和原生 `confirm()` 混用 | 见上 | 统一用 Radix 组件，保证焦点和键盘行为一致 |
| 🟡 | 紧凑断点只有 ≤559px 一档；R6 要求的 768/390 宽度没有专门的任务切面 | [PrimaryLayout.tsx:65](../../apps/web/src/modules/layout/PrimaryLayout.tsx:65) | 窄窗以任务切面和明确返回代替压缩 |

## 3. Files：对照 Heptabase + Solid

Heptabase 的交互模型可以概括为：**卡片是原子单位**；卡片库是所有卡片的总表；白板是用户自建的对象，同一张卡片可以出现在多块白板上；标签就是数据库，带属性和表格/看板视图；来自 PDF 或网页的高亮会生成带来源的卡片；卡片和白板之间有反向链接。白板、标签表、卡片库都是**同一批卡片**的投影。这正好对应 R6 的“同资源投影、不复制数据”。

| Heptabase 概念 | LinX Files 现状 | 判断 |
|---|---|---|
| 卡片（原子单位） | 基本单位是文件和文档里的 subject；“卡片”只以来源卡片（`*.card.ttl` 加正文 `.md`）的形式存在 | 🟠 应把来源卡片推广为通用卡片：正文、来源、属性。R6 的判断卡（原话、提炼、条件、例外、修订）就是卡片的一组属性 |
| 卡片库 | 没有。入口是文件树：全部文件 / 最近文件 / 聊天文件 | 🟠 这就是 R6“知识”入口的默认视图：全部卡片，按来源、状态、标签筛选 |
| 白板（独立对象、跨来源） | 白板是某一份结构化文档的视图模式，只能放这份文档里的 subject | 🟠 白板应是 Pod 里独立的资源，可以引用任意卡片或文件 |
| 白板排布与连线 | 只在 localStorage（B3）；连线可绑定 predicate 后走提案写成 RDF 关系 | 🔴/🟢 存储必须进 Pod；“视觉连线 → 语义关系提案”是 Solid 版本的亮点，应保留 |
| 标签 = 数据库 | RDF class 对应的表格/看板视图，基于 TanStack Table 和 dnd-kit，支持加 predicate 列 | 🟢 模型对得上；问题在于术语（subject、predicate、命名空间）直接暴露给用户 |
| 来源高亮 → 卡片 | 网页/文件 Ingest 生成来源卡片，有 hash 和版本 | 🟢 方向对；缺“选中原文一段生成卡片”的轻量入口 |
| 反向链接 | 有，但只在 subject 预览抽屉里 | 🟡 应出现在卡片阅读面 |
| 右侧并排打开卡片 | 有 sidecar 抽屉 | 🟢 |

Heptabase 的白板是用户主动创建的思考空间，不是挂在每份资源上的视图页签；R6“有真实任务才出现”的要求和它并不冲突。把白板从“视图模式”改成“用户新建的白板对象”，两边的要求就都满足了。

要守住的 Solid 约束：卡片、白板和连线都要是 Pod 资源，带稳定 id，可以跨应用读取和授权。工程术语留给“专业视图”（Raw、ttl），一般用户修订卡片时不需要碰 class 和 predicate（LW05）。

## 4. 开源组件：已经在用的与建议采用的

已经复用得很好：OpenAI ChatKit（会话）、tldraw（白板）、BlockNote（文档编辑）、TanStack Router/Query/DB/Table、dnd-kit、Radix/shadcn、react-resizable-panels、mermaid、KaTeX、react-markdown。

| 需求 | 建议 | 说明 |
|---|---|---|
| 全局查找 / 命令面板（找人、找卡片、跳到工作） | `cmdk`：已安装，`components/ui/command.tsx` 也已封装，但全仓没有任何地方使用 | 直接解决“三入口后联系人发现退化”的风险 |
| 已加载范围内的全文检索 | Orama、MiniSearch 或 FlexSearch | 跨整个 Pod 的检索应复用 xpod 渐进索引，不在前端自建；界面负责说明覆盖范围 |
| 白板持久化 | tldraw 自带的 `getSnapshot` / `loadSnapshot` 序列化，写入 Pod 资源 | 代替 localStorage；不需要自建同步协议 |
| 方法和知识的版本差异预览 | `diff`（jsdiff）+ `react-diff-viewer-continued` | F03“预览差异”、F02 并发冲突 |
| 卡片和方法正文编辑 | BlockNote（已在依赖中） | 不另做编辑器 |
| 确认框、下拉 | shadcn AlertDialog / Select（基于 Radix） | 代替原生 `confirm()` 和 `<select>` |
| 共享包 | 把 ai-connections / extension-sdk 发布成 npm 版本后按版本消费 | 解决 B1，并符合 dependency-guide |

只有开源组件满足不了 Solid/Pod 数据模型或 R6 状态语义时才自研，比如来源卡片的 RDF 映射、提案审批流。

## 5. 建议顺序（对应 R6 工作包）

1. **B1 先行：** 恢复可构建状态，否则后面所有改动都无法验收。
2. **B2–B4 与两处假状态：** 输入请求表单（Inbox 和原会话各一个入口）；中等宽度下的话题入口（可直接打开 ChatKit `history`，或把话题放进列表栏）；白板和看板状态写入 Pod；空间徽标读取真实状态，用户头像不再显示产品 Logo。
3. **R6-B 方法收敛：** 三处提示词编辑合成一处“方法”，显示作用范围（这个助手的所有会话 / 仅当前话题）；运行位置和模型移到执行条件；审批可以在原会话内完成。
4. **R6-A 导航：** 先给导航加文字标签，再做三入口映射。工作 = 会话 + 通讯录入口 + 任务；知识 = Files + 收藏 + 项目记忆；我的 AI = 方法 + 模型连接 + “尚未训练”。用 `cmdk` 做全局查找，兜住人际路径。
5. **R6-C 知识（Heptabase 化）：** 卡片作为单位，卡片库作为知识首页，白板改为独立对象，卡片阅读面展示来源、条件和反向链接，界面术语改成可读的说法。
6. **视觉：** 切换到纸色和墨紫 token，统一用 Radix 组件。

## 6. 未覆盖与证据限制

- 没有运行产品，交互结论全部来自代码。B1 修好后，应在 1440/1180/768/390 四档宽度下逐条复验本文的 🔴 和 🟠。
- 只看了 Web 的 UI 层。runtime/secretary 的提示词行为、xpod 服务端、CLI/TUI 和桌面壳的原生部分没有看；`apps/mobile` 目前是空目录。
- 标“需核实”的两项依赖 runtime 行为：input request 是否能通过聊天消息作答；workspace 状态“已完成”的来源。
- 没有做性能、权限过滤和真实 Pod 的验证。

## 7. 实施进展（同日，工作区未提交）

上面 0–6 节保留审查时的基线判断。下面记录按设计画布对齐后已经改了什么、怎么验证的，以及还要谁拍板。

### 7.1 已改

| 项 | 改动 | 主要位置 |
|---|---|---|
| B1 | 三个 vendor 包改为已发布版本（ai-connections 0.1.0、extension-sdk 0.1.1、shared-ui 0.1.1、solid-sdk 0.1.1）；`ai-connections` 改从 `/client` 子路径导入 | `apps/web/package.json`、`model-services/data/use-model-services.ts` |
| B2（界面侧） | Inbox 详情给 `input_request` 加作答表单（选项、文本，敏感输入用密码框），答案写回 InputRequest（`status=resolved`、`response`、`answeredBy`、`resolvedAt`）并记审计；会话横幅也会提示“在等你回答” | `inbox/domain/input-request.ts`、`inbox/data/collections.ts`、`InboxDetail.tsx`、`InboxActionBanner.tsx` |
| B4 | 右栏在窄于 1280px 时改为覆盖层；聊天头部加话题切换（含新话题），不再只靠右栏 | `PrimaryLayout.tsx`、`chat/features/threads/ThreadSwitcher.tsx` |
| Shell | rail 顶部是用户自己的头像（无图时显示首字），不再用产品 Logo；空间状态读取真实数据库状态，只有出错时才显示提示点；一级入口为聊天 / 联系人 / 文件 / 收藏（纯图标，按用户决定）；收件箱和“我的 AI”放在底部 | `PrimaryLayout.tsx`、`profile/SelfAvatar.tsx`、`layout/rail-style.ts` |
| 退出登录 | 先确认；说明草稿留在本机、正在运行的任务不会停止，可选择一并清掉草稿 | `layout/SignOutDialog.tsx`、`chat/draft-store.ts` |
| 我的 AI | 新增入口：概览、每个助手的“做事的方法”编辑（作用范围说明、保存前用 jsdiff 预览差异、权限说明）、个人模型“还没有训练” | `modules/my-ai/*` |
| 方法收敛 | 聊天头部、右栏、联系人详情三处原地编辑提示词全部改为跳到“我的 AI”的同一个编辑器；创建时的字段改叫“做事的方法” | `ChatHeader.tsx`、`ChatRightSidebar.tsx`、`contacts/features/detail/useAgentEditingController.ts` |
| 换模型不换身份 | 换模型不再把助手、联系人、会话头像改成提供方 Logo（LS03） | `chat/data/collections.ts` `updateAgentModel` |
| 收件箱 | 列表改为“待处理 N / 已处理”两档，活动记录（审计）从列表底部进入，不再混在待办里；行改为扁平列表；文案去掉 inbox、认证等工程词 | `inbox/ui/InboxList.tsx`、`inbox/domain/utils.ts` |
| 收藏 | 打开收藏时向 Pod 确认原处：已删除或已撤权时不再显示快照正文；离线时显示上次内容并说明不能跳回 | `favorites/domain/source-status.ts`、`favorites/data/source-status.ts`、`FavoriteDetail.tsx` |
| 联系人 | 助手卡片按画布：“助手 · 你创建的”、做事的方法、执行条件（显示模型名，不显示资源 IRI）、只有“发消息”；人的卡片去掉用户地址 / Inbox IRI 和“来源”徽章，同步状态只在读不到时出现；自己 Pod 里的助手不再被误判为“引用”而上锁 | `contacts/ui/ContactDetail.tsx`、`contacts/domain/contact-projection.ts`、`useContactDetailController.ts` |
| 视觉 | 纸色 / 墨紫 token 生效（此前 `.light` 类覆盖了 `:root`，新色从未生效）；ChatKit 跟随纸色背景，界面语言固定为中文 | `index.css`、`useChatKitSurface.ts` |
| 确认框 | 删除聊天改用 Radix 对话框，不再用 `window.confirm()` | `components/ui/confirm-dialog.tsx`、`ChatListPane.tsx` |
| 回答的排队与插话 | 收件箱回答有两个动作：“提交”只把答案写回请求（排队，等运行来取）；“立即插话”同时把答案作为用户消息发进原话题，后台会把它当作 steer 交给主理人。密码类回答只排队，不进聊天 | `inbox/features/detail/useInboxContentPaneController.ts`、`inbox/domain/input-request.ts` |
| 列表菜单 | “+”菜单：新的 AI 工作 / 找人聊天 / 发起群聊；“找人聊天”用 cmdk 选联系人（朋友和助手分开）；右键菜单改为免打扰、标为未读、删除会话…；删除确认写明几个话题会被删、文件不受影响 | `ChatListPane.tsx`、`contacts/features/picker/*`、`chat/features/threads/useStartAiWork.ts` |
| 列表状态 | 没有网络时提示“显示的是上次的内容”；列表更新失败可重试；第一次使用和未选会话时给出“开始 AI 工作” | `ChatListPane.tsx`、`ChatContentPane.tsx`、`lib/use-browser-online.ts` |
| 话题切换 | 每个话题显示时间；“管理话题…”打开右栏 | `chat/features/threads/ThreadSwitcher.tsx` |
| 全局查找 | 在列表栏搜索时按会话、话题、联系人与群、文件分组显示；文件只按名称搜，并在结果里说明 | `chat/features/search/*`、`files/features/search/file-name-search.ts` |
| cmdk 样式 | 修正 shadcn `CommandItem` 对 cmdk 1.x 的选择器（原写法让所有条目显示为禁用） | `components/ui/command.tsx` |
| 自己改的不审批 | 表格单元格、看板拖动、白板连线、新建卡片都直接写进文档（同样的保护：只写当前 Pod 的可编辑数据文件、不碰词表注册表），并记审计；带版本号写入，文档已被别处改过就拒绝。新建词表项（新列、新选项定义）仍走审批 | `files/data/proposal/structured-cell-approval-commands.ts`、`useStructuredCellProposalWorkflowController.ts`、`useStructuredKanbanMoveController.ts` |
| 白板的边进 Pod | 没选类型的连线写成 `dcterms:relation`；按钮从“创建视觉关系 / 提交待确认关系”改为“连接 / 保存连接” | `useStructuredWhiteboardRelationController.ts`、`structured-projections.ts` |

### 7.2 验证

- 在本机 xpod 上实测：SPARQL PATCH 里 `DELETE DATA` 一个已经不存在的值**不会报错**（返回 205），过期的修改会让字段同时出现新旧两个值；带 `If-Match` 时会正确返回 412。所以直接写入一律带上表格加载时的版本号。**审批路径目前没有这层保护**（批准时按提案里的旧值打补丁），值得另外修。
- 多值字段的判断依赖词表声明或“已有两个以上值”：一个只剩一个标签的格子再加新选项会被替换而不是追加。这是原有逻辑，以前因为修改一直挂在审批里没暴露出来。

- `tsc --noEmit` 通过。ESLint 结果与 HEAD 相同：4 个既有的 `exhaustive-deps` 错误，没有新增。
- 全量 vitest 与干净 HEAD 对比：HEAD 有 52 个失败（`service.platform-runtime` 38 个、`AddChatDialog` 6 个等，均与本次改动无关）；改动后没有新增失败，并修好了 1 个（`useChatKitSurface` 行数门槛）。第三轮后共 2,929 条测试，仍是 0 新增失败。
- 用仓库自带的 seeded xpod 流程在本机起了测试 Pod，登录后逐页截图核对：聊天、话题切换、右栏、我的 AI、联系人助手卡片和跳转、收件箱（待处理 / 活动记录）、退出确认。上面“纸色从未生效”“自己的助手被锁”“ChatKit 英文”“头部显示 Assistant”都是这一步才发现并修掉的。
- 第二轮又在真实 Pod 上核对了：“+”菜单、找人聊天、右键菜单、话题切换、全局查找（名称、文件名、无结果三种）。
- 没有验证：input request 的答案是否被 runtime 接上继续运行；有真实消息、审批和收藏数据时的界面；768 和 390 宽度。

### 7.3 还要拍板的

（已确认：白板数据就是卡片之间的边；回答可以排队也可以强制插话；默认交互先不确认；所有模块做完再一起提交；自己改的不审批；会话只有“标星”，不另设“置顶”——数据不跟界面位置绑定，标星的会话在列表里排在前面只是显示规则。）

- **会话协议换成 ACP（待确认方向）。** 现状：普通聊天的循环在浏览器里（`LocalChatKitService` 直接调模型）；LinX 用 ACP 驱动下游的 Codex / Claude / CodeBuddy，pi 是进程内的原生后端。建议往上也用 ACP：网页（assistant-ui）当 ACP 客户端，xpod 里的 pi 循环当 agent，下游 ACP 事件基本透传；ACP 缺的“回复中插话 / 追加”用 LinX 扩展方法补。先在 xpod 做一次小验证。
- **连线上的文字。** 没选类型但写了文字的连线：关系已进 Pod，文字目前只存在本机。要存进 Pod 得给“带文字的边”设计数据形态，否则会在表格里冒出一行行“连线”。
- **导出聊天记录。** 导出逻辑已有，但网页只持有已经打开过的话题的消息，直接导出会不完整；需要先从 Pod 读全量再导出。
- **runtime 是否读取回答。** 排队路径把答案写在 InputRequest 的 `response` 上，后台收件箱变化会唤醒主理人；还需要确认主理人查收件箱时确实读这个字段并回到同一次运行。插话路径走的是已有的“用户消息 = steer”通道。
- **会话组件要不要换。** ChatKit 不能在消息上加菜单项（收藏、记下来、纠正），也不能在回复进行中排队或插话；如果这些要做，建议先小范围试 assistant-ui。

### 7.4 R6 第一轮落地（2026-10-13）

按定稿交互稿（`docs/design/r6-interaction-canvas/`）和 spec（`docs/superpowers/specs/2026-10-11-linx-r6-interaction-implementation.md`）分 7 块并行开发后合并：外壳与个人、聊天列表与聊天信息、会话（AG-UI + assistant-ui，开关后面，默认仍是 ChatKit）、联系人、收件箱与授权（按把握自动通过）、文件核心（文件夹树、表格、卡片弹窗、搜索）、白板（React Flow + JSON Canvas）。“我的 AI”先不做。

验证：`tsc` 通过；全量 vitest 3039 条，45 个失败均为原有基线，无新增；agent-runtime 133 条全过；本机 seeded Pod 上 1440 / 1180 / 768 / 390 截图对照画板。验收中修掉：新会话界面无限重渲染、登录卡片截断、e2e 登录步骤随登录改版失效、助手名称不一致（统一“LinX 助手”）、768 列表过窄、宽屏文件树未接新模型、双击文件整页跳转、数据文件卡片空白、收件箱显示资源地址。

下一轮：
- 卡片弹窗打开个人资料选中文件本身而不是 `#me`；属性名英文。
- 欢迎页输入要发两次（先填进会话输入框）。
- 等共享模型包加字段：三档等待时间（现存浏览器）、授权归属哪个助手、“共享给我”的数据来源。
- 小缺口：开机自动打开、个人资料“还有谁能看到”、登录次要状态、白板拖入别的表格的行、表格拖动柄/勾选/看板细节、文件正文索引搜索、群聊发言人名字。
- 第二波：引用预览、收藏单条消息、共享弹窗、AI 改动保留/撤销；新会话界面验收后设为默认并删除 ChatKit。
- 宽屏 ChatKit“加载失败”疑为本机连不上 OpenAI CDN，未深查；登录 e2e 需用系统 Chrome 重跑。

### 7.5 R6 第二轮（2026-10-13）

完成：欢迎页一次发出；群聊发言人名字；收藏按类型分组、收藏单条消息、取消可撤销、原消息删除 / 无权限 / 离线状态；卡片弹窗打开个人资料主体并用中文属性名，离开页面自动关闭；AI 改动作为未确认草稿（保留 / 撤销 / 单处撤销，文件消息下也能操作，表格小紫点）；共享弹窗走现有访问控制，自己空间里的东西总能管理；引用预览跳到页 / 时间 / 行并高亮，选中文字工具条。

验证：`tsc` 通过；全量 vitest 3082 条，45 个失败均为基线；本机 seeded Pod 截图核对卡片、共享、收藏、欢迎页。

注意：共享弹窗改权限会重写该项的访问规则文件，手写的特殊规则会被合并成“谁能看 / 谁能编辑”；真实 Pod 上还没实际加人 / 收回过。

下一轮：“问 LinX”目前只复制到剪贴板；表格中 AI 新加列的“未确认”标记；文件列表标出有未确认改动的文件；收藏三栏布局（需改外壳）；运行时还没接上生成 AI 草稿。产品决定（2026-10-13）：和 AI 不再分会话，一直聊下去，话题 / threads 由内部管理（见下一轮）。

### 7.6 R6 第三轮：和 AI 一直聊（2026-10-13）

产品决定：和助手不分会话 / 话题，一直聊下去；LinX 在内部管理空间和 threads。已去掉话题切换、“管理话题…”、“+”里的“新的 AI 工作”和列表 / 搜索里的话题；新会话界面把一个聊天的所有内部 thread 按时间合成一条时间线；新消息发到最近活跃的内部 thread（`pickSendThread`，以后由运行时替换）。修掉了发送后用户气泡被旧历史冲掉、失败提示重复两遍。画板与 spec 同步修订（画布 Version 73）。

验证：`tsc` 通过；全量 vitest 3088 条，45 个失败均为基线；截图核对标题栏、“+”菜单、发送失败后的会话。

下一轮：新会话界面设为默认并删除 ChatKit（ChatKit 只能显示一个 thread）；其他内部 thread 的新消息实时合并；失败的回复刷新后仍能“重试”（需区分失败和停止）。

### 7.7 R6 第四轮：新会话界面成为唯一聊天界面（2026-10-16）

删除 ChatKit（`@openai/chatkit-react`、OpenAI CDN 脚本和代理、`features/chatkit/**`）；assistant-ui + AG-UI 会话界面成为唯一聊天界面，本地聊天循环与 Pod 存储（`services/chatkit-local`）保留。补齐原 ChatKit 能力：编辑已发消息（新分支，切换版本写回 Pod，刷新后能看到其他版本）、点赞 / 点踩（写回 Pod）、朗读、联网搜索、生成图片、语音输入、`/` 命令菜单、“新消息”按钮、断线重连同步；失败的回复刷新后仍可重试（失败与停止分开保存）。截图记录、语音对话放在输入框；项目记忆、附件、产物、素材、分享这段聊天从“聊天信息”打开；欢迎页也用完整输入框，弹窗随时可用。补了审批 / 回答 / 登录卡片测试。

验证：`tsc` 通过；全量 vitest 3086 条，45 个失败均为基线；本机 seeded Pod 浏览器逐个点开输入框按钮、`/` 菜单与“聊天信息”入口，均能打开。

下一轮：其他内部 thread 的新消息实时合并；尚未开始 thread 时（极早期）的欢迎仍用简化输入框；运行时按上下文自动换 thread。

### 7.8 R6 第五轮（2026-10-17）

完成：其他内部 thread 的消息实时并入时间线；运行时按长度 / 闲置自动换内部 thread 并带上前情摘要；默认 thread 提前建好，欢迎页用完整输入框；卡片里选中文字“问 LinX”直接进 LinX 聊天输入框（带来源标签）。文件：AI 加的列“未确认”（保留 / 去掉，授权时直接加并可撤销）；列表 / 网格 / 搜索里标出有未确认改动的文件；表格行拖动排序、勾选与批量（打开 / 删除 / 移到）、末行直接新建、保存状态；“共享给我”接上联系人空间的真实数据；搜索“也搜共享给我的”、无权限数量、出错重试。外壳：三档等待时间存进 Pod（`settings/linx/auto-judge.ttl`）并供运行时规划使用；授权记下属于哪个助手；个人资料“还有谁能看到”；登录“重新打开”与首次准备进度、助手准备失败卡片；开机自动打开（桌面）与启动时打开；收件箱过期 / 别处已处理 / 没网；收藏三栏；退出时仅在有运行中的任务时提醒。

验证：`tsc` 通过；全量 vitest 3153 条，失败均为基线；本机 seeded Pod 截图核对收藏、文件、个人资料、设置。

下一轮：卡片历史版本；白板卡片库拖入其他表格的行与“已在…白板上”；文件正文检索（需要可搜索的文本索引）；+列 / +表与看板细节；运行时生成 AI 草稿 / AI 加列的触发；结构化引用发给模型；独立空间起账号名（需要 xpod 支持按名字建账号）。

### 7.9 R6 第六轮（2026-10-17）

完成：文件正文检索（本机建索引，标题结果下列出正文命中、摘要、第几行；点开卡片定位并高亮那一行；没建完索引时一行灰字说明覆盖范围）；卡片历史版本（版本列表、对比、恢复，存为 Pod 旁路快照；保存冲突时可比较或刷新）；“+ 属性”改成白话类型与词表搜索，新建表格（先有哪几列，新列显示“未确认”，走词表确认）；看板分组选择、卡片上显示哪些属性、加列 / 改名 / 折叠、空列提示、保存状态；白板卡片库“别的表”与“已在…白板上”。聊天：“问 LinX”的引用作为结构化上下文发给模型（重新生成、编辑都保留）；AI 可以在聊天里新建 / 修改文件和表格单元、加列（运行时通过 MCP 声明文件工具，网页端执行并生成 AI 草稿，`LINX_DISABLE_FILE_TOOLS=1` 可关）；批准 AI 改文件时，授权落在被改的文件上（`modify`），文件工具不再生成审批。

验收中修正：文件树搜索接上正文结果（之前只接在列表面板，用户看不到）；卡片定位高亮补了样式并等编辑器渲染完；什么都没选时“添加”默认加到“我的空间”顶层（之前全部灰掉）；表格“名称”列显示行名（不再显示 `#r1`），新表首行直接用名字；看板 / 白板卡片不再显示完整地址和 `p-xxxx` 机器名；新表的列与表的类型对齐，刷新后仍显示“未确认”；视图名、看板按钮、“新增一行”等改成中文；白板保存状态不再压住卡片库关闭按钮。

验证：`tsc` 通过；eslint 无错误；全量 vitest 3212 条，失败 45 条均为基线；服务端 37/37；本机种子空间截图核对正文搜索与高亮、版本、新建表格、+属性、看板、白板卡片库；登录端到端在本机 Chrome 上通过（`LINX_E2E_BROWSER_CHANNEL=chrome`）。

核对后不用改：服务端不经 asar 打包，文件工具脚本随 `dist/` 一起运行；首次本地准备只显示真实阶段，下载百分比要 xpod 报字节数（按“不编百分比”规则不做）。

外部依赖 / 留待：独立空间按名字起账号（需要 xpod 支持）；卡片“撤回”没有数据模型；`.data` 文件夹在“我的空间”里可见（里面是结构化数据，是否隐藏要另定）。

### 7.10 R6 第七轮（2026-10-17）

看板按“选项”属性分组时，每个选项都有一列（没有卡片的也显示），拖进去写入该选项。至此 R6 交互稿里能在本仓库完成的部分都已落地；剩下三项见 7.9 末尾：一项依赖 xpod，两项需要产品决定。

### 7.11 R6 第八轮（2026-10-17）

- 卡片撤回（K2b）：卡片 ⋯ 菜单“撤回…”，确认文字按交互稿（以后的工作不再使用它，已完成的工作和原来的聊天不受影响）；撤回后卡片顶部显示“已撤回”和“恢复使用”。名单存在 Pod `settings/linx/withdrawn-cards.ttl`（卡片文件本身不改），每次回答前读出来告诉模型不要再引用（直接调模型和终端运行时两条路都带上）。
- `.data` 文件夹：在“我的空间”里显示为“数据”（里面有结构化表格和助手的文件夹，仍可进入）；其中 LinX 自己用的子文件夹（proposals、history、views、inbox、ingest、index、approvals）不再显示，内容分别从收件箱、版本、视图里看。
- 独立空间起账号名：查了 xpod 0.3.52，`POST /provision/pods`（服务令牌）能按名字建空间和 WebID，但不建登录账号；登录仍走 xpod 页面的邮箱 + 密码。已定（2026-10-17）：严格按 Solid 标准走 WebID 登录，用 xpod 自带的登录组件；没有账号时由 xpod 登录页引导创建。LinX 不另做起名表单，未接入的 `StandaloneAccountNameForm` 已删除。首次本地准备只显示真实阶段，不显示下载百分比。

验证：`tsc` 通过；eslint 无问题；全量 vitest 3221 条，失败 45 条均为基线。

至此 R6 审计里的事项全部落地或已定，没有遗留。

浏览器复核（本机种子空间，同日）：卡片 ⋯ →“撤回…”→ 确认，Pod 里写入名单；刷新后再打开仍显示“已撤回”；“恢复使用”后名单清空。“数据”文件夹：树和右侧文件夹视图都显示“数据 / 文件夹”，只列出用户的子文件夹，LinX 自己用的子文件夹隐藏，数量也按可见的算；文件夹类型从“Pod 容器”改为“文件夹”。

`.data` 已定（2026-10-17）：它是空间里各应用共用的业务数据区，LinX 和其他 Solid 应用都往这里存。界面上显示为“数据”，说明写“各应用共用的数据”；只隐藏 LinX 自己记账用的子文件夹（proposals、history、views、inbox、ingest、index、approvals），其他应用的文件夹照常显示。更正：不把 LinX 的记录搬进 `.data/linx/`。聊天、联系人、审批等记录按共用的数据类型存在 `.data/chat/`、`.data/contacts/`、`.data/approvals/` 等处（路径由共用的数据模型包定义），这正是“各应用共用”的约定，其他应用读写同一类数据也走这里。

端到端复核（2026-10-17，本机 Chrome + 种子空间，测试已入库）：
- `tests/e2e/specs/ask-linx-citation.spec.ts`：卡片里选中文字 →“问 LinX”→ 输入框带来源标签 → 发送后 Pod 里的消息带引用（来源、行号、原文）→ 编辑这条消息，新版本仍带引用。连跑 3 次通过。
- `tests/e2e/specs/card-withdraw-and-data-folder.spec.ts`：撤回 → 刷新后仍是“已撤回”→ 恢复使用；“数据”文件夹只隐藏 LinX 记账子文件夹，其他应用的文件夹照常显示。
- 复核中发现并修正：卡片正文加载完之前就挂选区监听，导致“问 LinX”工具条在要加载的卡片里出不来；聊天历史加载会把刚放进输入框的来源标签清掉；发送框文字被挤在按钮中间、还多一层焦点框——改成上面整行输入、下面一排工具和“发送”。

测试现状（2026-10-17）：全量 vitest 3222 条全部通过（连续两次）。最后 16 条在 `service.platform-runtime.test.ts`，修的过程中发现并改了三处真问题：只声明 Responses 的供应商会被错发 Chat Completions；智能体用 LinX 平台模型时，“在服务端运行”等设置被网关的默认模型覆盖、会悄悄改在本机跑；网关用结构化写法（或图片模型名）声明的图片生成 / 编辑能力不被识别。其余是测试跟不上后来的改动（能力改从网关读、进度改在“处理中”提示里显示），已按现行规则更新。R6 期间一直标为“已知失败”的另外 29 条已修：测试时区固定为中国时间、启动测试去掉已删除的模型集合、聊天运行时测试把模型目录和撤回名单的读取与模型请求分开、两个满负荷下偶发失败的测试（PrimaryLayout、FileDetailPane）已稳定。端到端：问 LinX 引用（发送 / 编辑 / 重试都带给模型）、撤回与“数据”文件夹、两条登录，共 7 条通过。

### 7.12 逐项复核（2026-10-17，最终代码）

每一轮列出的事项对应的证据（单元测试在 `apps/web/src/**`，端到端在 `tests/e2e/specs/`，均在最终代码上跑过：全量 vitest 3222+ 条全过，端到端 8 条全过）。

| 轮 | 事项 | 证据 |
|---|---|---|
| 7.4 | 外壳、聊天列表、联系人、收件箱、文件、白板各块可用 | e2e `r6-surfaces`（聊天 / 收件箱 / 联系人 / 文件 / 收藏 / 个人资料 / 设置逐页打开、无报错、截图对照画板） |
| 7.4 | 登录卡片、登录 e2e | e2e `solid-auth`、`real-seeded-auth`（本机 Chrome） |
| 7.5 | 欢迎只出现一次、一次发出 | e2e `r6-surfaces`（欢迎语恰好 1 条）；单元测试 9 个文件 |
| 7.5 | 群聊发言人、收藏分组 / 单条 / 状态 | 单元测试（speaker 3、`favorites/domain/groups.test.ts`、`source-status.test.ts`） |
| 7.5 | 卡片弹窗、AI 草稿保留 / 撤销、共享弹窗、引用定位与高亮 | 单元测试（AiDraft 9、ShareDialog 2、locator 7）；e2e `ask-linx-citation`（定位到行并高亮） |
| 7.6 | 和 AI 一直聊、时间线合并 | 单元测试 `mergeThreadTimelines`、handoff 3 |
| 7.7 | 唯一聊天界面；编辑、点赞、`/` 命令、聊天信息入口 | e2e `r6-surfaces`（`/` 命令菜单、聊天信息面板、输入框各按钮）；e2e `ask-linx-citation`（编辑、重试）；单元测试（编辑 / 分支 2、反馈 6） |
| 7.8 | 内部 thread 实时并入、自动换 thread | 单元测试（`mergeThreadTimelines`、handoff） |
| 7.8 | 问 LinX 进输入框带来源 | e2e `ask-linx-citation` |
| 7.8 | AI 加列未确认、未确认文件标记、表格批量、共享给我、搜索范围 / 无权限 | 单元测试（AiColumn 7、unconfirmed 9、useSharedWithMe 3、无权限 3） |
| 7.8 | 三档等待时间存 Pod、授权属于哪个助手、还有谁能看到、助手准备失败卡、过期 / 别处已处理 | 单元测试（auto-judge-settings、grantAppliesToAgent、WhoCanSeeMe、AssistantNotReadyCard、过期 9） |
| 7.8 | 开机自动打开、启动时打开 | 单元测试 `settings/data/auto-launch.test.ts`、`lib/micro-apps/startup.test.ts`；桌面端 `app:get/setAutoLaunch` 已接；e2e `r6-surfaces`（设置页“启动时打开”） |
| 7.9 | 文件正文检索、卡片历史、+属性 / 新建表格、看板、白板卡片库 | 单元测试（body-index 5、card-history、structured-new-table、K6d 2、whiteboard-space-index）；浏览器截图核对（见 7.9） |
| 7.9 | 引用发给模型（发送 / 编辑 / 重试） | e2e `ask-linx-citation`（抓取发给模型的请求，三条路都带来源） |
| 7.9 | AI 文件工具、改文件授权落在文件上 | 单元测试 pod-file-tools 2、grant-shape；服务端测试 37/37 |
| 7.10 | 看板按选项出空列 | 单元测试 `mergeKanbanOptionLanes` |
| 7.11 | 卡片撤回、“数据”文件夹 | e2e `card-withdraw-and-data-folder`；单元测试 withdrawn-cards 3 |
| 7.11 | 账号登录按 Solid、下载只显示阶段 | 已定（见 7.11），无代码要做；登录 e2e 通过 |
| — | 发送框按微信样式 | e2e `r6-surfaces`（输入区无分隔线、工具与发送按钮可见） |
