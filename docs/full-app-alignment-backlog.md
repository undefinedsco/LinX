# 全应用对齐 Backlog（视觉/合规 + 交互心智）

- Status: Draft（只读审查产物，2026-07-22）
- 范围：`apps/web/src/modules/{chat,inbox,contacts,files,favorites,settings,model-services}`
- 方法：5 个并行只读 Explore agent + 主审读基准；**所有 file:line 均经当前代码 grep/read 复核**。`docs/design-review-findings.md` 的行号是 2026-07-06 旧快照，已失效，本文不沿用其行号。
- 用途：跨全模块的统一对齐 backlog；合并三轮审查（DESIGN.md 视觉/合规、07-20 shell 契约、交互/产品心智）。本文只列差异与优先级，不含实现代码。

> 本文与 `docs/files-module-prototype-alignment-spec.md`、`docs/chat-module-alignment.md`、`docs/design-review-findings.md` 互补：前者是单模块深度 spec，本文是**横向一致性**视图。单模块细节以单模块 spec 为准，横向契约以本文为准。

## 参考来源澄清（先对齐"抄谁"）

用户心智里常记成"苹果 / 微信 / Notion"，但仓库交互基准 `docs/prototype/product-reference-principles.md` 的**精确来源**如下，后续讨论一律以此为准，避免再混淆：

| 用户记忆 | 基准真实来源 | 抄的层次 |
| --- | --- | --- |
| 微信 | **微信** | 产品心智：打开即会话、低解释成本、固定助手入口 |
| 苹果 | **Finder**（仅文件心智）+ **Telegram Desktop**（桌面三/四栏结构） | 文件图标/选择/预览/快捷键心智；桌面信息架构 |
| Notion | **Heptabase**（不是 Notion） | 结构化 resource 的 card/property/whiteboard 认知语言 |
| （常被忽略） | **Telegram Saved Messages + Signal Note to Self** | 个人收纳入口（AI Secretary / 我的空间） |

**不抄**：微信品牌皮肤/绿、Telegram/Signal 数据模型、把工具生态提前暴露到首屏。数据实现一律 `@undefineds.co/models`。

## §0 总览

**全局零 P0（DESIGN 禁止级）**：品牌色/emoji 核心状态/wechat token 在所有模块当前代码均清零；`--primary` 严格 taro 紫；全局 `prefers-reduced-motion` 与 `:focus-visible` 兜底已加。视觉"皮"的红线已守住。

**真正拖后腿的是两类**：(1) **壳层横向契约没被各模块统一遵守**（48px head 边界 5/6 错位、compact 降级 3/6 死胡同）；(2) **交互"骨"断裂**——多处设计意图与组件都已存在，却没接进实际渲染（见 §3）。后者比视觉更本质，决定"用起来像不像它想成为的东西"。

### 模块健康度

| 模块 | 视觉 P1 | 交互"做歪/死代码" | 五层分层 | 交互心智保留度 |
| --- | --- | --- | --- | --- |
| chat | 4 | 3（输入收纳死代码、右栏装反、默认未选中） | 部分 | 弱 |
| inbox | 4 | 0 | 无（非强制） | 中（数据面健康） |
| contacts | 3 | 2（默认助手可删、详情偏配置） | ✅ | 中 |
| favorites | 0 | 4（类型分段死代码、无日期组、恒 Star、无失效态） | 无 | 弱（退化成仓库） |
| files | 1（树 head） | 3（breadcrumb 文本化、column 死代码、无拖拽移动） | ✅ | 强（骨架在） |
| settings | 4 | 0 | ✅ | —（低频页） |
| model-services | 5 | 0 | ✅ | —（配置页，符合定位） |

## §1 跨模块系统性问题（横向，建议批量修）

### S1 48px shell 边界错位（6 模块中 5 个中招）
根因统一：模块自绘 head 没用框架 `h-12`，或叠了第二层 head。框架契约见 `PrimaryLayout.tsx:179`（content head `h-12`）与 `:210-219`（rightSidebar 第四列全高并排）。

| 模块 | 错位点 | file:line |
| --- | --- | --- |
| chat | right sidebar head `h-16` | `ChatRightSidebar.tsx:402` |
| inbox | list head 多行 `py-4`，无 `h-12`/`bg-layout-list-header` | `InboxListPane.tsx:51` |
| contacts | detail 自绘 `h-16` + shell `h-12` 双 head | `ContactDetail.tsx:186` |
| settings | list head `py-3` ≈64px | `SettingsListPane.tsx:12` |
| model-services | list `h-16` + detail `h-16` 双层 | `ModelServicesListView.tsx:25`、`ModelServicesDetailView.tsx:131` |
| files | 树 head 两行 ≈60px | `FilesTreePane.tsx:249` |

**仅 favorites 的 list head 干净对齐 `h-12`。** 修复方向：head 收敛到 `h-12`，副标题/筛选/动作移入列表区或 shell `topActions` 槽。

### S2 compact（≤559px）降级缺失（3 模块 + chat 断点错）
shell compact 下 `panelIds=['main']`，列表面板不渲染；但这些模块 ContentPane **忽略 `compact`/`compactNavigation` prop**，致 compact 死胡同（无列表/无返回/无模块切换）。

- inbox `InboxContentPane.tsx:24`、contacts `ContactDetailPane.tsx:6`/`ContactListPane.tsx:16`、favorites `FavoriteContentPane.tsx:256`。
- chat 用了**错误断点** `md:768px`（与 shell 559px 不一致，560–768px 出双列表）`ChatContentPane.tsx:990`。
- 对照：files 用 `hideContentHeaderOnCompact` + compact 抽屉示范正确做法。

### S3 DESIGN.md 散落视觉残留（design-review §3-4 当年"未机械替换"，仍在）

| 残留 | 模块 | 证据 |
| --- | --- | --- |
| raw 语义色 | model-services（green/blue/orange-500 共 5 处）、inbox（slate-400/600）、chat（ChatKit `#7C3AED` 内联紫） | `ModelServicesDetailView.tsx:69-71,265`、controller `:174`；`InboxListPane.tsx:145`；`ChatContentPane.tsx:539` |
| `rounded-2xl`/`shadow-lg` | settings（SetupView 3+1、LocalNetwork 5）、contacts（头像） | `SetupView.tsx:48,66,69`、`LocalNetworkSettingsCard.tsx:107…`、`ContactDetail.tsx:212` |
| 性别符号 ♂♀ | contacts | `ContactDetail.tsx:129-130` |

注：contacts/settings/model-services 的**其余** raw 色/渐变/blur/内联 hex 已清零——残留是点名的几处没收尾。

### S4 可访问性：roving focus / 键盘选择语义不齐
- **favorites 最严重**：列表行 `<div onClick>`，键盘完全不可达（`FavoriteListPane.tsx:87`），与 contacts 的 button/option 基线形成代差。
- chat/inbox/contacts 列表有 role/aria 但无 roving tabindex + 方向键。
- **model-services provider listbox 是全站最佳**（roving + Arrow/Home/End 齐全，`ModelProviderList.tsx:30-78`），作模板。

### S5 query 错误被空态掩盖（违反 agent-guide + layer contract）
inbox `InboxListPane.tsx:35`、favorites `FavoriteListPane.tsx:133`：未取 `isError`，查询失败渲染"暂无"空态、无重试。对照 contacts 已正确"error 优先于 empty"。

### S6 五层分层迁移进度不一
- ✅ 完成 + architecture gates：contacts、settings、model-services。
- ⚠️ 未迁移：chat（缺 features/data，三主组件 1115/875/432 行混 query+store+渲染）、inbox（投影混在 collections.ts，组件耦合 chat store）、favorites（控制器内嵌展示组件、被 files 反向 import data、starred-sync 与 models 平行维护）。

## §2 逐模块明细

### chat
视觉合规：

| 严重度 | 项 | file:line | 修复 |
| --- | --- | --- | --- |
| P1 | right sidebar head `h-16` 不对齐 48px | `ChatRightSidebar.tsx:402` | 改 `h-12` |
| P1 | compact 断点 `md:768` 与 shell 559 不一致，双列表 | `ChatContentPane.tsx:990` | 用 shell `compact` prop |
| P1 | ChatKit 内联非 taro 紫 `#7C3AED` | `ChatContentPane.tsx:539` | 注入 taro 紫或消费 `--primary`（受 SDK 约束，见 §4） |
| P1 | 分层不彻底，缺 features/data | `ChatContentPane.tsx` 等 | 抽 features 层 |
| P2 | 列表无 roving focus | `ChatListPane.tsx:256` | roving tabindex + 方向键 |
| P2 | 默认空态非 actionable | `ChatContentPane.tsx:991` | 加"新建聊天"按钮 |
| P2 | SessionInputbar `focus:` 非 `focus-visible:` | `SessionInputbar.tsx:146` | 改 `focus-visible:` |

交互心智（详见 §3）：默认未选中 Secretary、Chat Folders 缺失、输入收纳死代码、右栏装反、会话内媒体聚合缺失。

### inbox
| 严重度 | 项 | file:line | 修复 |
| --- | --- | --- | --- |
| P1 | list head 未对齐 48px | `InboxListPane.tsx:51` | 收敛 head |
| P1 | compact 降级缺失 | `InboxContentPane.tsx:24` | 消费 compact |
| P1 | query 错误被空态掩盖 | `InboxListPane.tsx:35` | 取 isError + 重试 |
| P1 | `paused` raw slate 色 | `InboxListPane.tsx:145` | 改语义 token |
| P2 | `当前空间` 非规范术语 | `InboxListPane.tsx:85` | 改存储中立文案 |
| P2 | 列表无 roving/listbox 语义 | `InboxListPane.tsx:109` | 补选择语义 |

数据面健康：approval/audit 投影来自 `@undefineds.co/models`，Chat 主审批链路与 inbox 同源。

### contacts
| 严重度 | 项 | file:line | 修复 |
| --- | --- | --- | --- |
| **P0** | 默认助手可被删除、无护栏 | `ContactDetail.tsx:201`、`useContactDeletionNavigationController.ts:53` | 识别默认助手 + guard + 隐藏删除（见 §3/§5） |
| P1 | detail `h-16` + shell `h-12` 双 head | `ContactDetail.tsx:186` | bridge `hideHeader` 或动作进 topActions |
| P1 | 头像 `rounded-2xl` | `ContactDetail.tsx:212` | 改 `rounded-lg` |
| P1 | compact 死胡同 | `ContactDetailPane.tsx:6` | 消费 compact |
| P2 | 性别符号 ♂♀ | `ContactDetail.tsx:129` | 文字标签/中性图标 |
| P2 | agent 详情偏配置表单，稀释名片心智 | `ContactDetail.tsx:277` | 配置项收进次要区/折叠 |

已对齐：列表分组、发消息主动作、无 API Key 泄漏、Collection 单实例、detail 已拆 workflow、query 错误不误渲染空列表。

### favorites
| 严重度 | 项 | file:line | 修复 |
| --- | --- | --- | --- |
| P1 | 列表行 div 键盘不可达 | `FavoriteListPane.tsx:87` | 改 button/option |
| P1 | query 错误被空态掩盖 | `FavoriteListPane.tsx:133` | 取 isError + 重试 |
| P1 | compact 不可用 | `FavoriteContentPane.tsx:256` | 消费 compact |
| P1 | 失效收藏无失效态（死点击） | `FavoriteContentPane.tsx:209` | scene null 时禁用 + 失效徽标 |
| P1 | starred-sync 与 models 平行维护 | `collections.ts:115` | 消费 models `createStarredSyncHook` |
| P1 | 未落五层 + 被 files 反向 import data | `favorites/` | 五层迁移 |
| P2 | 类型分段死代码、无日期组、恒 Star 图标、缺复制 URI、加载闪空 | 见 §3 | 接 UI / 加分组 / 行类型图标 |

已对齐：48px head、回跳 scene-restore、DESIGN 残留零命中。

### files
| 严重度 | 项 | file:line | 修复 |
| --- | --- | --- | --- |
| P1 | 树 head 两行 ≈60px 不对齐 48px | `FilesTreePane.tsx:249` | 描述行迁走/砍（见 §4） |
| P2 | breadcrumb 退化为纯文本 | `FolderDetailPreview.tsx:75` | 可点击分段 breadcrumb |
| P2 | column 视图建好未接入 | `FolderDetailColumnView.tsx`、`FolderDetailPreview.tsx:76` | 接进视图切换器 |
| P2 | 拖拽移动缺失 | （仅 `StructuredKanbanView.tsx:152` 看板内） | 补文件拖拽移动 |

已对齐：容器树、Finder 表格、单击预览/双击打开、右键菜单、拖拽上传、inspector、Repository/Workspace 非管理页。

### settings
| 严重度 | 项 | file:line | 修复 |
| --- | --- | --- | --- |
| P1 | list head ≈64px | `SettingsListPane.tsx:12` | 改 `h-12` |
| P1 | SetupView `rounded-2xl`+`shadow-lg` | `SetupView.tsx:48,66,69` | `rounded-xl`/去 shadow-lg |
| P1 | LocalNetwork `rounded-2xl` 5 处 | `LocalNetworkSettingsCard.tsx:107…` | `rounded-lg/xl` |

已对齐：五层 + gates、不静默启 xpod、advanced disclosure、共享 hook 复用。

### model-services
| 严重度 | 项 | file:line | 修复 |
| --- | --- | --- | --- |
| P1 | list head `h-16` | `ModelServicesListView.tsx:25` | 改 `h-12` |
| P1 | detail `h-16` + shell 双层 head | `ModelServicesDetailView.tsx:131` | bridge `hideHeader` 或并 head |
| P1 | CapabilityIcon raw 色 3 处 | `ModelServicesDetailView.tsx:69-71` | 语义 token |
| P1 | Base URL 图标 raw 蓝 | `ModelServicesDetailView.tsx:265` | `text-primary/70` |
| P1 | 验证成功 toast raw 绿 | `useModelServicesContentPaneController.ts:174` | 语义 token |

已对齐：五层 + gates、mutation await 后才成功 UI、失败保留 draft、credential 无加密承诺、provider listbox 键盘最佳。

## §3 交互设计"意图在、落地断裂"清单（重点）

这是交互设计**最硬的证据**：设计意图与组件都存在，却没接通，导致"用起来"背离心智。

| # | 断裂点 | 性质 | 证据 | 处置 |
| --- | --- | --- | --- | --- |
| 1 | chat 输入收纳入口 `Inputbar` | **死代码** | 组件含拖拽/文件预览/工具按钮（`Inputbar.tsx:248-449`），但全仓未渲染；实际是 ChatKit 纯文本 composer（`ChatContentPane.tsx:696`） | 接上 **或** 删除，不能留误导 |
| 2 | favorites 类型分段 `sourceFilter` | **死代码** | store+query 支持（`store.ts:9`、`collections.ts:215`），UI 刻意不渲染 | 接 UI 分段 **或** 删 store 字段 |
| 3 | files 分栏 column 视图 | **死代码** | `FolderDetailColumnView` 完整实现，未接进视图切换器（`FolderDetailPreview.tsx:76`） | 接进切换器 |
| 4 | chat 右栏做成"设置"页 | **做歪** | 标题"设置"+角色设定编辑器+话题列表+Symphony（`ChatRightSidebar.tsx:399-429`），与基准"右栏=工作现场"相反 | 改回工作现场（见 §5 P0） |
| 5 | chat 打开未默认选中 Secretary | **差一步** | 固定+不可删+排第一做到了，无 mount 自动选中（`chat/store.ts:44`） | 加 mount 自动选中 |
| 6 | contacts 默认助手删除无护栏 | **安全隐患** | 删除按钮对所有联系人无条件显示+危险样式+无 guard（`ContactDetail.tsx:201`） | 识别默认助手 + guard（见 §5 P0） |

favorites 另有"做歪"：行图标恒为 Star（`FavoriteListPane.tsx:84`，详情却有 `SOURCE_META` 类型图标未复用）、无日期分组、无失效态——基准明确"收藏不是仓库，是重入索引"，当前恰是仓库形态。

## §4 待产品决策（非代码缺陷）

1. **chat ChatKit accent `#7C3AED`**：要求 SDK 严格 taro 紫 `#735FC4`，还是接受 SDK 约束近似紫？
2. **compact 策略是否全站统一**：chat/inbox/contacts/favorites 是否都跟 files 一样 `hidePrimaryRailOnCompact` + compact 抽屉/单栏流？
3. **roving focus 投入优先级**：多数列表"可 Tab 但无方向键"，是否按 model-services 模板补齐？
4. **files 树 head 两行**：(a) 砍描述行 / (b) 描述迁走（onboarding→空态 banner，当前话题→workspace 已有 banner）/ (c) 接受例外。推荐 (b)。
5. **chat 右栏现有内容去留**：角色设定编辑器/话题列表/Symphony 在"工作现场"右栏里保留为次要区、折叠、还是移走？（基准只说右栏不该"只是"配置页，未禁止共存。）
6. **contacts 默认助手身份识别**：`@undefineds.co/models` 的 agentResource 是否已有 isDefault/role/protected 字段？若无，用什么判定（固定 WebID/URI？与 chat `LINX_DEFAULT_SECRETARY` 映射？）——决定删除护栏能否在不改 models 的前提下落地。

## §5 优先级路线图

**P0（安全 / 方向反）**
- contacts 默认助手删除护栏（§3-6）。实现前提见 §4-6。
- chat 右栏改回工作现场（§3-4）。实现前提：工作现场数据 hook 现成度（待查）+ §4-5 去留决策。

**P1（首屏心智断裂 + 壳层一致性第一批）**
- chat 打开自动选中 Secretary（§3-5）。
- chat 输入收纳二选一：接上或删除死代码（§3-1）。
- **壳层第一批**：各模块 head 统一 `h-12`（S1）+ compact 降级（S2）。横向、各模块独立、收益最大。

**P2（DESIGN 残留 + 错误态 + Finder/重入心智）**
- S3 视觉残留收尾（raw 色/rounded-2xl/性别符号）。
- S5 错误态补重试（inbox/favorites）。
- favorites 接类型分段 + 日期组 + 行类型图标 + 失效态（§3-2 + 做歪项）。
- files 接 column 视图 + 可点击 breadcrumb + 拖拽移动（§3-3 + files P2）。

**P3（可访问性 + 结构性 + 桌面结构补全）**
- S4 roving focus（favorites div→button 优先）。
- S6 五层迁移（chat/inbox/favorites）+ favorites starred-sync 收敛 models。
- chat Chat Folders：**决策已定**（见 §7 续）——folders 收进搜索框下拉、置顶成区且豁免过滤、首批仅"全部/未读"、自定义 folder 后置；独立功能，排在对齐收尾之后。
- chat 会话内文件/链接/媒体聚合（功能量大，单独立项）。

## §6 已对齐基线（不要动 / 不要削弱）

- 全局：DESIGN 禁止级清零、`--primary`=taro 紫、全局 reduced-motion + focus-visible 兜底。
- chat：Esc 中断、停止按钮 aria、内容级错误分类+重试、Secretary 固定不可删+排第一。
- contacts：Collection 单实例 + chat 经 port 复用、detail 已拆 workflow、query 错误不误渲染空列表、列表分组、发消息主动作、无 API Key 泄漏。
- files：容器树、Finder 表格、单击预览/双击打开、右键菜单、拖拽上传、inspector、`.meta` 第四列（已对齐 48px）、Repository/Workspace 非管理页、结构化多视图（Heptabase 心智保住）。
- settings/model-services：五层 + gates、mutation await、失败保留 draft、credential 无加密承诺、不静默启 xpod、advanced disclosure、provider listbox 键盘最佳。
- inbox：approval/audit 投影来自 models、Chat 主审批链路与 inbox 同源。
- favorites：48px head、scene-restore 跨模块回跳、DESIGN 残留零命中。

---

*生成方式：主审读基准（`product-reference-principles.md`/`page-mindset-ascii.md`/`module-interactions.md`/`design-review-findings.md`/`2026-07-20 shell 设计`/`2026-07-12 supporting-modules 设计`）+ 5 个并行只读 Explore agent 逐模块审查 + 2 个交互心智专项只读 agent。未修改任何业务文件。*

## §7 实现回填（2026-07-22 本轮）

本轮落地 §5 的两条 P0，并新建本文档。

| 项 | 状态 | 改动 | 验证 |
| --- | --- | --- | --- |
| **contacts 默认助手删除护栏**（§3-6） | ✅ 完成 | 新增 `contacts/domain/default-secretary.ts`（`isDefaultSecretaryContactId`，用 `contactResource.buildId({ id: '__secretary__' })` 主键识别，与 chat 同源；不 import chat 以满足架构测试）+ 单测；`ui/ContactDetail.tsx` 对默认助手隐藏删除项与分隔线（消除删除压力/危险样式）；`useContactDeletionNavigationController.ts` `handleDelete` 加 guard 纵深防御 | `default-secretary.test.ts` + `contacts.architecture.test.ts` 8/8；`ContactDetailPane.test.tsx` 12/12（含 2 条新增锁定测试：默认助手无删除 menuitem、普通联系人保留）；**无需改 `@undefineds.co/models`** |
| **chat 右栏方向纠正**（§3-4） | ✅ 完成 | 上轮：head `h-16`→`h-12`、标题"设置"→对象名、加"工作现场"块；本轮：旧三块改**默认收起**（系统提示词/话题列表 `useState(true)`→`false`，Worker 面板本已 `false`），工作现场块常驻 → 右栏"工作现场"定位达成 | `tsc` ✓；`ChatHeader.test.tsx` 5/5（右栏无专门测试；改 useState 初始值零逻辑风险） |
| **chat ChatKit 品牌紫**（§2/§3 残留） | ✅ 完成 | `ChatContentPane.tsx:539` `accent.primary` `#7C3AED`→`#735FC4`（taro 紫，修 design-review P0 品牌违规；全仓仅此一处） | `tsc` ✓（单行 hex 值替换） |

**右栏其余（已澄清 / 留 P1）**：
- **TODO/待办块**：经查系统**无** TODO 数据模型（`@undefineds.co/models` 无 todo schema；apps/web 无 todo collection/query/UI；"整理今天的工作"仅塞 prompt 文案、不产出待办；symphony `taskResource` 是 worker 工单、非用户待办，硬顶会误导）。建 TODO 需先在 models 仓库新增 `todoResource`，属独立 feature，**默认暂缓、单独立项**，不在对齐范围；右栏暂不放 TODO 块。
- 现有三块去留：**已决**=折成默认收起（见上表），不再待决策。
- Agent home 路径、Workspace 摘要块：hook 现成，留 P1 补。注：右栏当前未显示 agent 路径，故 §2/§4"路径一致性"当前无 bug，降为"右栏将来加 agent home 块时与 files 同口径"的未来约束。

**第一堆细节（逐条核查，本轮启动）**：
- **紫色**：见上表，✅。"内联 hex 彻底走 CSS token"受 ChatKit 该字段需颜色字符串、`var(--primary)` 不可靠、暗色响应未知所限，记 P2 暂缓。
- 左栏小字（files 树 head 两行≈60px）：核查中，默认按 b（描述行迁走），动手前先查"当前话题"与 workspace 既有 banner 是否重复；a/b/c 用户未单答，按默认 b 推进、可覆盖。
- 窄屏统一 / 键盘 roving：跨模块，单独立批，排后。
- 路径一致性：见上，降为未来约束，移出当前待办。

**本轮刻意不做**：除紫色与右栏折叠外，§5 的 P1/P2/P3 其余（壳层 head 统一、compact 降级、DESIGN 残留其余、错误态、favorites 重入心智、files breadcrumb/column、roving focus、五层迁移等）按路线图分批，未越界。

**验证汇总**：`tsc --noEmit` 无错误；contacts `default-secretary`+架构 8/8、`ContactDetailPane` 12/12、chat `ChatHeader` 5/5 全过；右栏折叠 `tsc`+`ChatHeader` 5/5；紫色单行 hex 替换 `tsc` 本轮确认；inbox/contacts compact 由子任务实现、主审逐文件 review 通过（桌面逻辑未动、hooks 顺序正确、无多余注释/import），inbox 39/39、contacts 18/18。ESLint 因 `typescript-estree` 环境兼容问题对全仓崩溃（非本轮引入），未跑。

### §7 续 · 决策记录（2026-07-22，Chat Folders + 置顶区）

经与产品逐条澄清，Chat Folders 的最终形态与约束如下（开工时以此为据，无需重读会话）：

- **形态 = 搜索框旁下拉**（不另占一行）。故 48px 头不动、对齐线不变、列表内容不矮一行起步、免去"folders 行高须与 files/inbox 过滤条跨模块对齐"的细节。备选"常驻标签行 `[全部][未读]`"否决：folders 数据与用户切换习惯尚未建立，下拉渐进稳妥；若日后证实高频切换，升级为常驻标签也只是控件换皮、过滤逻辑不变。
- **置顶区恒显且豁免过滤**：下拉**之下**为置顶区，folders 切到任何值都不隐藏置顶会话（否则"置顶"失去意义）。结构自上而下 = `头(48, 搜索+folders下拉+新建) → 置顶区(恒显) → 下拉过滤后的非置顶列表`；过滤**仅作用于非置顶段**，置顶区与下拉本身不参与。
- **置顶成区是前置、与 folders 绑死**：当前"置顶"仅为星标角标 + 背景加深（`isPinned = Boolean(chat.starred)`；Secretary 固定 `isPinned:true` 且 `canTogglePin:false`，见 `secretary-entry-model.ts:45-55`），**无独立置顶区**，列表仍 `chats.map` 平铺。须先把列表分区渲染（`isPinned` 排到非 Secretary 最前、聚成顶部段），folders 才能"在其下"。二者作为一组实现。
- **星标 = 置顶 暂不拆**：Telegram 中"星标/收藏"与"置顶"是两回事，LinX 现以星标当置顶；就 folders 而言复用 `isPinned` 足够，拆成两套会扩大范围，本轮不拆。
- **自定义 folder（工作/个人等）后置**：依赖"会话归类机制"（手动归类或按 workspace 自动归类），当前不存在；首批 folders 仅做可即时计算的 **全部 / 未读**（未读有状态可算）。
- **归属**：独立功能，非对齐修复；开工顺序排在本轮对齐收尾（键盘 roving、chat `md:`→559px 断点）之后。

### §7 续 · 进展（对齐收尾，2026-07-22）

- **chat `md:`→compact 断点（主体已修）**：`ChatContentPane.tsx` 未选聊天分支的 `md:flex`/`md:hidden` 改为按 shell 同源 `compact` 条件渲染，修复 560–767px 双列表（旧逻辑在该区间把空态 `hidden`、内嵌列表与 shell ListPane 并存）。`ChatContentPane.test` 28/28：纠正原 `shows the existing chat list in compact content…` 测试未传 `compact`、靠 jsdom 不应用 CSS media query 的巧合同时断言两块的缺陷，改为传 `compact` 并反转空态断言；新增桌面分支锁定测试。
- **chat 返回按钮断点（残留，待收）**：`ChatHeader.tsx:217` 返回按钮仍 `md:hidden`，560–767 多显一个"返回聊天列表"按钮（点了清选择，不破坏布局，破坏轻微）。修它需让无 props 的 `ChatHeader` 经 `useMediaQuery('(max-width:559px)')` 取断点并 mock 测试，成本/风险高于收益，并入 roving 轮一并收。
- **键盘 roving（favorites 已完成，其余 P2）**：favorites 列表照 `ModelProviderList.tsx` 模板补 roving——行 `div`→`role=option`+roving `tabIndex`+`onKeyDown`（Arrow/Home/End + Enter/Space 选中）+`ref` focus+`focus-visible` 环（全局兜底不含 div，故显式补），容器加 `role=listbox`；一举补 P1"键盘完全不可达"+方向键导航。`tsc` ✓、favorites 31/31 ✓、git diff 确认未改部分无抄错。contacts/chat/inbox 行已能 Tab、仅缺方向键，属 P2 体验增强，与 chat 返回按钮断点残留一并记 P2 收尾，未在本轮硬塞（roving 方向键逐列表侵入行元素/ref/测试，风险高于其 P2 价值）。
- **Chat Folders + 置顶成区（已完成）**：按上文决策落地。新增纯逻辑 `chat/domain/chat-list-folder-model.ts`（`projectChatListFolderSections`：置顶段 `starred` 恒显、不受 folder 过滤；非置顶段按 `all`/`unread` 过滤；搜索正交，调用方先过滤再传入）+ 单测 6/6。`ChatListPane.tsx`：搜索头经 `ListHeader` 新增 `filterControl` 槽塞入筛选下拉（`ListFilter` 图标按钮，非 `all` 时高亮；菜单"全部/未读"，选中项 `Check`），**不另占一行**，故 48px 头与对齐线不变；列表用 model 拆成 `role=group`"置顶"+"会话"两组（外层 `role=listbox` 不变，既有测试不破），中间 `role=presentation` 分隔线；提取 `renderChatItem` 去重；folder 过滤光时显示"该筛选下暂无会话"。置顶 = `starred`（含 Secretary，即 `isPinned`），未读 = `unreadCount>0`；Secretary 因 `starred` 恒在置顶组、恒显，保住固定入口心智。自定义 folder（工作/个人）仍后置（缺归类机制）。验证：folder-model 6/6、`ChatListPane` 21/21、chat components+domain 16 文件 167/167 全过（chat 全套 vitest 因既有 collection/runtime 重测试超时，非本次回归）。**像素效果未自动验证**（下拉在 48px 头内的观感、置顶组分隔线需真机/截图）。

### §7 续 · collections 统一批次（独立排期，2026-07-22 调研）

用户指示"collections 统一做、不用每个模块都做"。调研结论：此批次**非"统一弄一下"**，含一块无需动、一块纯结构搬迁、一块需设计决策；按风险递增分三步，**不一锅烩**。

**子项现状（当前代码实测）**：
- **collection 单实例边界 = 干净，无需整改**：每个 resource collection 全仓仅 `createPodCollection` 一次——inbox 4（`inbox/collections.ts:46-82`）、chat 3（`chat/collections.ts:1129-1184`）、symphony 8（`symphony/collections.ts:41-125`）、favorites 1（`favorites/collections.ts:39`）、contacts 2（`contacts/data/resource-collections.ts:27,39`）、model-services 3（`model-services/data/collections.ts:28-42`）。chat **未** redeclare contact/agent collection（经 port 复用 contacts 的，见 `contacts.architecture.test.ts`）。故"统一"≠合并实例——无实例可合并。**但**未迁模块（chat/inbox/favorites）缺模块级 architecture test 锁此边界，迁移时须补。
- **五层迁移 = 3 完成 / 3 未**：contacts/settings/model-services 已 `app/data/domain/features/ui` + 模块级 arch test；**chat 部分**（有 `domain/`/`ui/`，但 `collections.ts`/`store.ts` 在根、缺 `data/`/`features/`/`app/`）、**inbox 与 favorites 完全未迁**（仅 `components/`，collections/store 在根，**无 arch test**）。
- **starred-sync = 真重复，但不可无脑替换**：models 已提供 `createStarredSyncHook` + 预置 `chat/thread/contactStarredSyncHook` + extractor（`starred-sync.d.ts`/`.js`），设计为 starred 字段变更**自动**同步 favorite；web **未用**，而是 favorites 自写命令式 `onStarredChange`（`favorites/collections.ts:115`），chat`collections.ts:1441`/contacts`data/collections.ts:423`/files 三 controller 共 4 处手动调。**根本语义差异**：models 自动 hook 的 extractor 只能从**被星标行字段**派生，拿不到 web 手动版**调用方现场组装**的 `snapshotMeta`（回跳/显示元数据）；预置 extractor 也均未填 `getSnapshotMeta`（`starred-sync.js:121-132`）。直接换预置 hook → snapshotMeta 丢 → 收藏回跳/meta 标签回归。无损收敛须自定义 extractor 或改 snapshotMeta 语义，属设计决策。

**分步方案**：
1. **inbox + favorites 五层迁移 + 补 arch test**（纯结构、最安全、不动 chat 不动功能）。
2. **starred-sync 收敛**：动手前先读 chat/contacts/files 三调用点 metadata 构造，定 snapshotMeta 能否从 record 派生，再选 自定义 extractor / 保留命令式 / 改语义。
3. **chat 五层迁移**（最后、单独，collections.ts 2000+ 行面广易错）。

每步独立做、独立验证，正合"不每模块一次性做"。

**执行进展（2026-07-22）**：
- **步1 完成（favorites + inbox 五层迁移 + review 闭环）**。两模块均 facade 兼容、跨模块 import 零改动、组件拆 controller+props-only ui、补模块级 architecture test。
  - favorites：`tsc` ✓、favorites 37/37、跨模块 mock favorites 的测试 210 过；review 修正子任务给 domain 开的 layout 特例——`domain/scene-restore.ts` 改用本地 `FavoriteSceneAppId = 'chat'|'contacts'|'files'` 字面量联合、arch test domain 禁列加回 layout、边界全封闭。
  - inbox：`tsc` ✓、inbox 45/45、跨模块 mock inbox 的 9 测试 150 过；arch test **落实两条教训**——domain 禁列含 layout 等全 `@/modules/*`/`@/components`/`@/providers` 且**无特例**，`scene-restore`（import `@/modules/files/browser`）归 features、domain 全封闭；view-model 类型 `InboxItem`/`InboxListItemView` 在 domain（教训2）。核实无 hallucination（scene-restore 原本存在）、无回归（ChatContentPane flaky 为 pre-existing 隔离问题）。
- **步2 starred-sync 收敛 — 挂起**：功能改造非结构迁移，有回跳元数据回归风险（models 自动 hook 的 extractor 拿不到 web 手动版现场组装的 snapshotMeta，预置 extractor 也未填 getSnapshotMeta）；须先读 chat/contacts/files 三调用点定 snapshotMeta 方案再对齐，不擅自做。
- **步3 chat 五层迁移 — 挂起**：最大最特殊模块（collections.ts 2000+ 行、组件巨大、跨模块依赖多），长会话末尾做返工风险高，留独立工作单元（建议拆数据层 + 组件两步）。
- **P2 评估**：chat 返回按钮 `md:` 残留收益极低，**不做**，并入 chat 组件层迁移专项。方向键 roving **已完成**（见下）。

**续进展（2026-07-22 续）**：
- **chat 数据层五层归位完成**：store→app、collections/runtime-client/matrix-service→data、agent-runtime-location/feature-flags/chat-participants→domain；mocks/contacts-port/agent-home/message-anchor/workspace-summary 留根（collections 零 zustand import 故 data 边界无冲突）；7 facade + `chat.architecture.test.ts`（domain 禁列含全 `@/modules/*` 无特例）；tsc 绿、数据层 67 测试 + ChatListPane facade 兼容 21 过。
- **roving 四模块全齐**：favorites（早）+ contacts/inbox（子任务，跨 section 用 flatIndex 累加 / 平铺，逻辑在 controller、ui props-only）+ chat（子任务，跨 pinned/unpinned 扁平 index，保留 folders 分组与 target 守卫）；各自 tsc + 列表测试 + arch test 绿。
- **§S1 head 对齐补完**：inbox/contacts/settings/model-services 四模块主 head→`h-12`；inbox/settings 多行内容移 head 下方独立行、功能不丢；model-services 双层 head 选 (b) 降 48px sub-bar（走 (a) 需搬 mutation 进 bridge 属功能重构，违只调布局）。tsc 绿 + 各 arch+组件测试绿；四模块全量 286 过 / 2 失败经 git stash 核实为预存在（ContactListPane.cp1，与本次无关）。cosmetic 残留（ms shell head 与 sub-bar provider 名文案重复、contacts detail 动作栏无 border-b）记可选收尾。
- **visual audit 通过**（xpod 不跳）：`files-production-visual-audit` 1 passed（29s），compact 段 `boundingBox`/scroll-surface 硬断言过、files 渲染不崩；截图存 `.omx/artifacts/files-production-visual-audit/2026-07-22/`。files desktop head 对齐靠 `h-12 flex items-center` 与 content head 同 class 模式（CSS 同高确定）+ 子任务读上下文判不挤，未单独肉眼复查截图。
- **挂起两项（精确阻塞，非偷懒）**：
  - **starred-sync 收敛**：读 favorites `data/collections.ts` 确认 `useFavoriteList` 用 react-query `useQuery`（非 live query），刷新**完全靠** `invalidateQueries(['favorites'])`；models 自动 hook 用 `db.insert(favoriteResource)` **不 invalidate** → chat/contacts 挂自动 hook 将致"星标后 Pod 写入但收藏列表 UI 不刷新"；若同时保留 web 手动 `onStarredChange` 又**双写重复条目**；files 因 snapshotMeta 含 `treeNodeId`（UI 上下文非 record 字段）**不可**换自动 hook。无回归收敛须先重构 favorites 缓存范式（live query 或 collection-subscribe 桥接）+ xpod 端到端验证收藏星标流程——独立中型改造，单测无法覆盖，故本轮不动代码。
  - **chat 组件层拆分**：ChatContentPane 1100+ / ChatListPane 880+ / ChatRightSidebar 460+ / ChatHeader 377 行，拆 controller+ui 的 review 超出本会话质量保证条件（主 agent 无法逐行 review 千行拆分，埋回归风险）；数据层已迁已满足主要分层收益，组件层拆分应作**独立 PR 由人 review**，不在本会话硬做。

本批次"能安全搞完的"全部搞完；上述两项的阻塞点已代码级写死，任何后续会话可据此继续。

