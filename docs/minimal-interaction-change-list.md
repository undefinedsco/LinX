# 极简交互修改清单

对照基线：`staging` `0ea8c57`（0.3.42 之后）。判定标准：一处只有一个主要动作；正常状态不占界面；可撤销的直接做；高级配置收起；主路径不出现内部术语；没接线的控件不出现。

方法：只读代码，逐条在当前代码里核对过位置。没有运行界面；“待验证”的需要在真实界面确认。

## 已完成

- 第 1 批（0.3.42 已发布）：运行时常驻横幅、欢迎页“准备就绪”、永久禁用的“添加视图”、未用的收件箱铃铛弹层、注册表未渲染字段。
- 2026-11-12 版清单里的其余大部分条目已在 0.3.34–0.3.41 的 R6 改版中解决，例如四入口导航、提示词三处编辑、设置菜单、收件箱头部、主题控件、悬停按钮、原生 `confirm()`、退出登录确认。旧清单因此作废，以本文件为准。

## 第 2 批（减法，低风险）：PR #50

另：点当前 rail 图标会收起列表栏，已决定删除，PR #51。

| # | 位置 | 现状 | 修改 |
|---|---|---|---|
| 2.1 | `files/features/folder/FolderDetailPreview.tsx` 工具栏 | 新建文件夹、新建 Markdown、上传三个图标，与文件树头部“+”菜单重复 | 删除这三个图标，统一走“+”菜单；空文件夹里的主动作保留 |
| 2.2 | `files/features/detail/FileDetailPane.tsx` 更多菜单 | “复制 URI”“打开原始 URI” | 改为“复制链接”“在浏览器打开” |
| 2.3 | `files/features/sidecars/ResourceSidecars.tsx` | “查看 .meta”“查看 Access 来源” | 改为“信息”“访问权限” |
| 2.4 | `files/app/FilesWorkspacePane.tsx` 聊天文件范围 | 常驻一行说明“当前范围来自聊天关联文件；目录仍按 Pod 原始位置打开。” | 删除说明句，只留“聊天文件”范围标签 |
| 2.5 | `symphony/components/SymphonyWorkerPanel.tsx` | 已无任何引用的死代码 | 删除 |
| 2.6 | `chat/features/runtime/RuntimeSessionToolbar.tsx`、`chat/components/AddChatDialog.tsx` | 运行时表单占位符是开发者个人路径 `/Users/ganlu/develop/linx`；`Base Ref`、`Branch` 英文标签在主表单 | 占位符改为通用说明；`Base Ref`、`Branch` 收进“高级”并改中文 |
| 2.7 | `inbox/ui/InboxDetail.tsx` 待批准区域 | 96px 备注框常开，排在批准/拒绝按钮之前 | 备注收在“添加备注”之后，批准/拒绝紧跟摘要 |
| 2.8 | `settings/ui/ServiceManagementDialog.tsx` | 字段标签带 1)–6) 编号，编号随空间类型变化 | 去掉编号 |
| 2.9 | `chat/components/ChatAssetLibraryDialog.tsx`、`MultimodalCaptureDialog.tsx` | 说明文字含“当前 Pod”“Pod 存储链路” | 改为“当前空间”，删掉实现细节 |

## 第 3 批（术语，需要逐处斟酌文案）

| # | 位置 | 现状 |
|---|---|---|
| 3.1 | `files/features/detail/source-linked-card-preview-model.ts`、`FileDetailSourceLinkedCardPreview.tsx` | 来源卡片：“Ingest 全部”“已 Ingest chunk”“待 Ingest”“canonical 内容需审批后更新” |
| 3.2 | `files/features/structured/structured-pending-cell-write-button-model.ts` | 提示：“等待 Inbox 审批，canonical 数据未变更” |
| 3.3 | `files/features/structured/structured-whiteboard-view-model.ts` | “添加 subject 到白板”“清空白板 subject” |
| 3.4 | `files/features/structured/locked-vocab-registry-table-model.ts` | 列名“术语 URI”“规则 URI” |

## 2026-11-12 版 65 条逐条核对（基线 `staging` `ddaff5d`）

结论：已修或已有替代 41 条，按产品决定保留 4 条，第 3 批修复 14 条，延后 6 条（需要较大改动或运行时验证，原因见下）。

| 条目 | 结论 |
|---|---|
| #2、#6、#8、#9、#10、#11、#13、#17、#19、#20、#22、#24、#27、#33、#34、#37、#46、#48 | 已修（0.3.34–0.3.42 及第 1、2 批） |
| #3 | 已有替代：会话里的决定卡片可以直接批准/拒绝（`DecisionCards.tsx`） |
| #5 | 已改：头部不再显示 `Assistant`/`Select Model`；换模型在“执行条件”里一次完成 |
| #16、#26、#29、#30、#31、#39、#47、#49、#53–#60、#61–#63 | 已修或不再存在（R6 改版） |
| #1 四入口导航、#15 新建助手字段、#21 只用“标星”、#23 话题列表 | 按产品决定保留（见 `docs/reviews/linx-r6-product-audit-2026-10-10.md` 7.1–7.6） |
| #4 | **本轮修**：会话顶部多条告警叠在同一位置（`ConversationSurface.tsx`），改为按优先级只显示一条 |
| #7 | **本轮修**：桌面端文件详情的收藏和“更多操作”（下载、复制链接等）没有渲染，只在没有标题槽时出现 |
| #12 | **本轮修**：`/debug/*`、`/inrupt-test`、`/test/*` 只在开发构建注册 |
| #18 | **本轮修**：会话筛选只有“全部/未读”两项的下拉，改为一个“只看未读”开关 |
| #28 | **本轮修**：欢迎页的径向渐变和彩色阴影（设计契约禁止） |
| #35 | **本轮修**：“添加网页”成功提示只有读屏可见 |
| #36 | **本轮修**：上传中整个“+”菜单被禁用，只应禁用上传两项 |
| #41 | 已修：存储地址在 staging 上已收进“详情”（核对时误判，本轮只补了测试） |
| #43 | **本轮修**：未处理的审批也显示空的“处理时间” |
| #44 | **本轮修**：等待认证卡片把认证地址当文本再列一遍 |
| #45 | **本轮修**：审计详情直接展示“原始动作”，收进“技术详情” |
| #51 | **本轮修**：“停止”本机服务没有确认，停止会断开数据访问 |
| 第 2 批遗留 | **本轮修**：两个同名的上传输入框。“新建文件夹”的操作分支与“+”菜单共用类型，只删了无人使用的 `createFolderPending` |
| 第 3 批 3.1–3.4 | **本轮修**：来源卡片和结构化表格的术语 |
| #14 | 延后：两处运行时表单字段已统一，合并成一个组件属于重构 |
| #25 | 延后：授权后自动重发涉及发送重试逻辑，需要运行时验证 |
| #38 | 保留：文件详情底部状态条显示条目数和时间，属于信息而非状态噪音 |
| #40 | 延后：本机空间准备好后自动继续登录，涉及登录流程，需要真机验证 |
| #50、#52 | 延后：三套服务配置表单合并为一个属于重构 |
| #65 | 延后：“正在加载...”改骨架屏，影响面小 |

## 第 3 批后仍待处理

- 会话区和聊天内容区可能同时出现两条措辞不同的“空间连接失效”提示，未确认两个条件在实际中是否重叠。
- 编辑器里来源更新的提交按钮文案为“提交 来源更新确认”，可以再打磨。
- staging 上有 4 个 `exhaustive-deps` lint 错误（`ConversationSurface.tsx`、`login/controller.tsx`、`use-oidc-connect.ts`、`use-model-services.ts`），来自 Matrix/登录改动，不在本批范围。

## 需要决定

- macOS 签名与公证：需要 Developer ID 证书和公证凭据，暂缓。
