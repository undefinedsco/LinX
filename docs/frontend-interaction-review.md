# 前端交互审查报告（2026-07-17）

审查范围：`apps/web/src` 全部模块（chat / files / login / contacts / inbox / favorites / settings / model-services / profile / symphony / layout）+ `components/ui` 基础组件，共 660+ 源文件。对照 `docs/ui-style-guide.md` 与 `docs/login-modal-local-binding-spec.md` 交互契约。

统计（去重后）：

| 严重程度 | 数量 |
|---|---|
| 高 | 12 |
| 中 | 48 |
| 低 | 90+ |

---

## 一、高危问题（建议立即修复）

### H1. 审批提交失败后草稿被误标"已保存"，数据静默丢失
`modules/files/ui/RichTextFileEditor.tsx:462-470` + `features/editor/useFileEditorSheetController.ts:213-238`
`handleSubmitProposal` 在 `await onSubmitProposal(...)` 后无条件重置 `lastSavedTextRef` 并置"保存成功"；controller 的 `submitChangeProposal` 用 try/catch 吞掉错误只 toast 不 rethrow。失败后 dirty 被清除、blur 自动保存跳过，用户草稿既未写入也未保留。
**修复**：失败时 rethrow；仅成功才重置 dirty 基线。

### H2. AI 错误/系统状态伪装成助手消息（3 处，违反设计契约明文规定）
`modules/chat/services/chatkit-local/service.ts`
- `:520-534` AI 生成失败时把错误文案写入 assistant item 正文并持久化，还会经 `buildConversationHistory` 作为 assistant 上下文回喂模型；`fullText ||` 逻辑使部分流式文本存在时错误被完全吞掉，用户看到"看似完整"的截断回答。
- `:491-496` 缺 AI Key 提示以 `status='completed'` 的助手消息呈现。
- `:628-643` 工具调用/认证等待状态拼进 assistant 正文（已有 InboxActionBanner 承接）。
设计契约原文："AI wait/retry/timeout/interrupt state must be visible as UI state, not as an assistant message that looks like model content."
**修复**：错误只走 error 事件 + item status；UI 层用 ErrorBlock/重试入口呈现，不写入 content。

### H3. Web 端登录"本机空间"静默回退云端（违反登录 spec 5.8）
`modules/login/LoginModal.tsx:232`
纯 Web 环境 `localProvider` 不存在时 `selectedProvider = localProvider ?? cloudProvider` 回退云端。用户选"本机/数据保存在这台电脑"，实际写入云端。
**修复**：无 local provider 时禁用"本机"分段并说明原因。

### H4. 结构化表格单元格 popover 滚动后不跟随也不关闭
`modules/files/features/structured/useStructuredCellPopoverController.tsx:14-27` + `StructuredCellPopoverLayer.tsx:19-32`
placement 仅打开时计算一次，无 scroll/resize 监听；滚动后 popover 悬浮在原坐标与单元格脱节。且永远向下展开不翻转，底部行 popover 被视口裁掉。
**修复**：打开期间监听 scroll/resize 关闭或重算；做碰撞翻转。

### H5. 同一单元格快速连续提交竞态，产生重复审批
`modules/files/features/structured/useStructuredCellWriteProposalController.ts:50-71` + `useStructuredCellProposalWorkflowController.ts:83-106`
无串行化/去重：boolean toggle 连点两下生成两条反向审批；乱序回写互相覆盖；冲突返回 false 时把用户最新值回滚丢弃。
**修复**：同 cell key 串行化/提交中禁用；返回 false 不回滚最新草稿。

### H6. 新建 Class URI 输入框被 Radix 菜单 typeahead 抢焦点
`modules/files/features/structured/StructuredResourceToolbar.tsx:308-321`
input 位于含 class 选项的 `DropdownMenuContent` 内且未 stopPropagation；Radix Menu 对可打印字符做 typeahead 并把焦点拽到匹配菜单项，输入 URI 时被打断。同项目 `AddPredicateMenu.tsx:71` 已正确处理，此处遗漏。
**修复**：input `onKeyDown` 加 `stopPropagation()`。

### H7. 文件夹"轻量预览"整体未接入（设计契约缺口）
`modules/files/features/folder/FolderChildPreview.tsx`（死代码）+ `FolderDetailPreview.tsx:93-282`
单击文件的决策是 `select-local-preview`，但预览组件从未被渲染，单击文件除高亮外无任何预览反馈。
**修复**：接入预览或删除死代码。

### H8. 操作弹层（重命名/新建/删除确认）无焦点管理
`modules/files/features/folder/FolderChildOperationSheet.tsx:69-75` + `ui/FilesOperationSheet.tsx:35-76`
输入框无 autoFocus、无焦点圈定；ESC 依赖 sheet 根 div 的 onKeyDown，焦点不在内时失效。键盘用户触发"重命名"后必须用鼠标点输入框。
**修复**：打开自动聚焦+选中文件名主体，关闭还原焦点；或改用 Radix Dialog。

### H9. 列表键盘导航"选中动、焦点不动"
`modules/files/features/list/useFilesExplorerController.ts:108-116` + `ui/FilesExplorerRow.tsx:60-75`
ArrowUp/Down 只改选中不移 DOM 焦点；随后按 Enter 打开的是焦点所在旧行，与用户看到的选中项不一致。folder 视图（`FolderDetailChildViews.tsx:118-123`）已正确同步 focus，此处缺失。
**修复**：方向键导航后同步 `focus()` 目标行 + roving tabIndex。

### H10. 停止 xpod 服务无二次确认
`modules/settings/ui/ServiceManagementDialog.tsx:295`
`onClick={() => void runRuntimeAction('stop')}` 直接执行；应用数据访问依赖该本地服务，误点即断整个数据面。重启（`:291`）同样无确认。
**修复**：AlertDialog 确认并说明后果。

### H11. Toast 系统：调试值遗留生产，反馈机制形同虚设
`components/ui/use-toast.ts:5-6`
`TOAST_LIMIT = 1`（新 toast 顶掉旧的，连续操作反馈互相覆盖）+ `TOAST_REMOVE_DELAY = 1000000`（1000 秒，shadcn 模板调试值）。全应用所有 toast 反馈都受此影响。
**修复**：LIMIT 调至 3-5，REMOVE_DELAY 恢复 1000ms 左右。

### H12. 退出登录无确认
`modules/layout/PrimaryLayout.tsx:283-285` → `login-utils.ts:433-436`
SettingsMenu 点"退出登录"直接 `requestSignOut()` → `signOut()`，无任何确认。
**修复**：AlertDialog 确认。

---

## 二、系统性问题模式（跨模块共性，建议批量治理）

### S1. 复制操作全线无反馈（8+ 处同构）
根源：`modules/files/app/platform-actions.ts:6-9` `copyFilesText` 用 `?? Promise.resolve()` 静默吞掉无权限场景，且无 toast。
涉及：files 详情/列表/文件夹/Subject 导航 4 处"复制 URI"、structured 列头"复制 predicate URI"、peek"复制 URL"、chat 顶部"复制日志"（列表右键版却有 toast，行为不一致）、profile 复制 WebID（复制完整 URL 但显示短 ID，所见非所得）。
**修复**：`copyFilesText` 统一返回结果 + 全局 toast；失败给原因。

### S2. 失败静默 catch → 仅 console.error（10+ 处）
chat：标星/静音/标记未读/删除会话（`ChatListPane.tsx:749-802`）、暂停/恢复/停止会话（`ChatContentPane.tsx:318-334`）、ChatKit 顶层 onError（`:560-562`）、系统提示词保存假成功（`ChatRightSidebar.tsx:57-65,343-357`）；favorites：取消收藏 unhandled rejection（`FavoriteContentPane.tsx:203-207`）；files：收藏切换（`useFileDetailPaneController.ts:91-99`、`useFilesListPaneController.ts:154-162`）；contacts：toggleStar fire-and-forget（`collections.ts:417-428`）。
**修复**：统一 mutation onError → toast；调用点不再裸 `void`。

### S3. hover-only 关键操作（触屏/键盘不可达）
chat 会话标星/更多（`ChatListPane.tsx:334-386`，无 focus-within、触屏长按也不触发 ContextMenu）、files 行收藏/更多（`FilesExplorerRow.tsx:132-137`，`opacity-0` 但可误点）、contacts 成员菜单（`MemberList.tsx:98-105`）、Inputbar 附件移除（`Inputbar.tsx:133-146`）、富文本块操作（`RichTextFileEditor.tsx:869-900`，按钮仅 20×20px）。
**修复**：补 `focus-within`/`focus-visible` 显示；coarse pointer 下常显。

### S4. div onClick 无键盘语义
contacts `InfoRow`（`ContactDetail.tsx:143-151`）、favorites `FavoriteCard`（`FavoriteListPane.tsx:87-94`）、symphony 折叠头（`SymphonyWorkerPanel.tsx:110-144`，键盘用户**永远无法展开面板**）、chat `ThreadItem`（`ChatRightSidebar.tsx:266-293`）；`CollapsibleTrigger asChild` + div 丢失 Enter/Space 激活（ThinkingBlock/ToolBlock/ChatRightSidebar 卡片头 3 处）。
**修复**：改 `<button>` 或补齐 role/tabIndex/onKeyDown。

### S5. 自绘弹层缺 ESC/焦点管理，与 Radix 体验割裂
`SidecarDrawer`（基础组件，影响全部 .meta 抽屉）、`StructuredSubjectPeek`、`FilesOperationSheet`、`FolderChildOperationSheet`、`LoginCardShell`（无焦点圈定 + 滚动穿透）。
另有遮挡缺陷：`FolderChildOperationSheet.tsx:32` 全宽透明层未加 `pointer-events-none`，拦截卡片两侧点击（`FilesOperationSheet.tsx:38` 已正确处理）。
**修复**：自绘弹层收敛到 Radix Dialog/Popover 或统一补 ESC+焦点管理。

### S6. 破坏性操作无确认
停止/重启 xpod 服务、删除自定义模型（`ModelServicesDetailView.tsx:338`）、移除群成员（`MemberList.tsx:127-134`）、取消收藏、停止运行时会话、删除消息（`MessageMenubar.tsx:168-176`）、清空白板（`StructuredWhiteboardView.tsx:101-109`，不可恢复）、"放弃 predicate"/"忽略词表变更"（仅本地隐藏，刷新后复活，文案暗示真实撤销）。
**修复**：按破坏等级分级：不可恢复→AlertDialog；可撤销→toast+undo。

### S7. 未保存修改无 dirty-guard
服务管理弹窗（`ServiceManagementDialog.tsx:71`，多字段）、模型编辑弹窗（`ModelEditorDialog.tsx:80`）、建群/备注/提示词/工具/邀请弹窗、设置分类切换（`SettingsContentView.tsx:38-39`，网络页 token 重填）、AddChatDialog/运行时会话表单（点遮罩/ESC 丢内容）、SetupView"重新读取"覆盖草稿。
**修复**：有 dirty 时拦截 `onOpenChange` 弹确认。

### S8. 禁用态无原因提示（Button 组件加剧）
`components/ui/button.tsx:7` `disabled:pointer-events-none` 使禁用时 title/tooltip 永不显示。
涉及：登录"继续"（`LoginModal.tsx:290`）、"验证"无 Key（`ModelServicesDetailView.tsx:228-236`）、"打开发布页"、模型 ID 不可改、"启动 worker"（`SymphonyWorkerPanel.tsx:196`）、创建谓词提交、pending 时取消按钮静默失效（`useFilesListOperationController.ts:172-175`）。
**修复**：禁用提示改外层包裹或用 `aria-disabled` 方案替代 pointer-events-none。

### S9. 死控件/死代码占据 UI
语音/视频通话按钮（`ContactDetail.tsx:255-258`，C 位展示未上线功能）、"群设置"永久 disabled（`ChatListPane.tsx:436`）、InputbarTools 默认工具组（onClick undefined 仍可点）、Message 卡片按钮（只给 actionLabel 时 onClick=undefined）、profile 编辑状态机未接线（资料只能看不能改）、structured 命名空间开关/列可见性死 props（隐藏列无法通过 UI 恢复）、"重新检测"按钮实为继续登录（`LoginModal.tsx:660-665`）、"待办"块命令插入纯文本（`RichTextFileEditor.tsx:522-524`，无 TaskList 扩展）、"显示 Info"靠 querySelector.click() 驱动（`FileEditorSheet.tsx:131-136`）、`onSaveLocalTunnelToken` 死管线、`FilesListColumnHeader`/`FilesListRow` 无引用。
**修复**：未实现功能隐藏或标注；死代码删除。

### S10. 竞态/防重复缺失
单元格连续提交（H5）、记住账号"重新登录"双击触发两次 startLocalLogin（`LoginModal.tsx:192-197`）、提供商 Switch 连点并发、删除模型无防连点、拖拽上传可重入（`useFolderDetailUploadController.ts:26-64`）、会话控制按钮无 busy 态（isBusy 算出没传给 SessionControlBar）、`sendDisabled` 遮罩只挡视觉不挡焦点（`ChatContentPane.tsx:691-706`，可 Tab 进入盲打）。

### S11. 文案/行为不符 & 登录路径暴露技术细节
"重新检测"实为继续登录（H 级关联）、取消按钮写"换一个空间"实为取消并清账号（`LoginModal.tsx:532-538`，spec 5.7 规定为"取消"）、StorageConflictView 暴露完整 storage URL（`:108-111`，违反 spec 3.1）、连接中卡片显示 host（`:520-529`）、standalone 显示本机 URL（`:654-655`）、"其他供应商"行 ChevronRight 暗示前进实为返回（`:391-403`）。

### S12. icon-only 按钮缺 accessible label（10+ 处）
profile 复制 WebID/刷新（`SelfProfileCard.tsx:357-380`）、chat 列表更多/清除搜索/关闭/展开搜索/新建话题、contacts 分享/更多/复制 ID/刷新。违反规范"Icon-only actions need accessible labels"。

---

## 三、中危问题精选（完整清单见各模块审查记录）

| 模块 | 文件:行号 | 问题 |
|---|---|---|
| files | `FolderChildOperationSheet.tsx:32` | 全宽透明遮挡层拦截点击（S5） |
| files | `FolderDetailTreeView.tsx:70-75,143` | 单击/双击冲突：双击导航先触发两次展开抖动 |
| files | `FolderDetailTreeView.tsx:105-110` | 键盘 Enter 只能展开/收起，"进入文件夹"键盘不可达 |
| files | `useFolderDetailUploadController.ts:26-91` | 上传无进度反馈、拖拽可重入、纯文件夹上传零反馈 |
| files | `FilesAddMenu.tsx:96` | 上传中整个添加菜单被禁用无原因 |
| files | `FilesAddMenu.tsx:51-53` | Ingest 成功反馈仅屏幕阅读器可见（sr-only） |
| files | `FilesTreePane.tsx:325` / `FilesListPane.tsx:356` | 树/列表加载错误态无重试按钮 |
| files | `FileDetailPreview.tsx:45-50` | 双击选中文本复制会误打开编辑弹窗 |
| files | `RichTextFileEditor.tsx:434-438,588` | 保存失败徽标随工具栏在失败瞬间被隐藏 |
| files | `RichTextFileEditor.tsx:375-417` | 外部刷新重建编辑器实例，光标/撤销历史丢失 |
| structured | `StructuredKanbanView.tsx:80-97` | 自定义 onKeyDown 覆盖 dnd-kit listener，键盘拖拽失效；双拖拽系统并存 |
| structured | `StructuredKanbanView.tsx:53,58-101` | `suppressNextOpenRef` 残留吞掉拖拽后第一次单击 |
| structured | `StructuredTableCellPrimitives.tsx:760-772` | 焦点在链接/按钮上按 Enter 被单元格层拦截进入编辑态 |
| structured | `StructuredResourceToolbar.tsx:414-443` | 三组筛选菜单当前生效项无选中指示 |
| chat | `ChatContentPane.tsx:318-366` | 暂停/恢复/停止：无确认、无 busy、失败静默 |
| chat | `ChatListPane.tsx:794` | 删除会话用原生 confirm()，与 Radix 体系不一致 |
| chat | `ChatContentPane.tsx:417` / `AddChatDialog.tsx:549` | 多字段表单点遮罩即丢内容 |
| chat | `MessageList.tsx:117-121` | 新消息无条件强制滚动打断阅读（未接入生产） |
| login | `LoginModal.tsx:108-111` | 登录弹窗暴露完整 storage URL（违反 spec 3.1） |
| contacts | `ContactDetail.tsx:143-146` | 无 onClick 行也有 hover 高亮+手型（误导 affordance） |
| contacts | `MemberList.tsx:127-134` | 移除成员无确认 |
| inbox | `InboxContentPane.tsx:25` | 审批备注跨条目残留，A 的备注会被写入 B |
| inbox | `InboxContentPane.tsx:56-69` | 审批成功无反馈；高风险授权无确认 |
| favorites | `FavoriteContentPane.tsx:203-213` | 取消收藏无确认/无防连点/失败 unhandled rejection；"打开原对象"失败静默 |
| settings | `SettingsContentView.tsx:38-39` | 切换设置分类丢未保存修改 |
| settings | `ServiceManagementDialog.tsx:71,104-112` | dirty-guard 缺失；"未运行"指引无跳转是死路提示；内容无滚动矮窗不可达底部 |
| settings | `useSetupViewController.ts:33-51` | "重新读取"覆盖草稿无确认 |
| model-services | `useModelServicesContentPaneController.ts:144-183` | 验证成功后 dirty 未重置，失焦把未 trim 的脏值写回覆盖正确值 |
| model-services | `ModelServicesDetailView.tsx:212,256` | onBlur 静默自动保存成功无反馈 |
| model-services | `ModelServicesListView.tsx:40-42` | 配置读取失败无重试入口 |
| profile | `store.ts` / `SelfProfileCard.tsx` | 资料编辑完全未接线，用户无入口填写任何资料 |

---

## 四、低危问题概览（90+，按类归并）

- **键盘/可访问性**：搜索框 ESC 不清除、roving tabIndex 与 React 受控冲突（FilesTreePane:137-143）、列表每行 tabIndex=0 无 roving、enum 选择器 `aria-selected` 恒真且无方向键、能力 toggle 无 `aria-pressed`、状态圆点 aria-label 无 role、列宽 separator 无键盘支持且命中区仅 4px、CompactTableShell 同问题、SecretaryWelcome 无 Cmd+Enter 发送。
- **反馈缺失**：检查更新成功无 toast、复制 WebID setTimeout 未清理且连点互相覆盖、上传拖拽高亮 relatedTarget 抖动、搜索词生效后不可见（两处：toolbar 搜索失焦收起、hasActiveFilters 不含搜索词）。
- **表单细节**：弹窗输入无 autoFocus/Enter 不提交（建群、备注名）、Model ID 未 trim 可写入纯空格、密钥输入三处无显示/隐藏切换（与模型服务不一致）、内联 enum/scalar 编辑器无 Esc 取消（与 scalar 编辑器不一致）。
- **交互一致性**："当前：深色模式"按钮看着像文本实际可点、登录"连接"按钮缺 cursor 类、树 Enter 行为两处不一致、删除会话 confirm 与 AlertDialog 混用、block 命令菜单 ESC 处理缺 linkMenuOpen 分支、链接定位用 indexOf 首个匹配可能套错选区、白板 pointermove 未过阈值即写 store、resetAncestorHorizontalScroll 抢外层滚动、workers 只显示 5 条无"查看全部"。

---

## 五、修复优先级建议

**P0（数据安全/契约违规）**：H1（草稿丢失）、H2（AI 错误伪装消息）、H3（静默回退云端）、H11（toast 系统）
**P1（核心交互断裂）**：H4-H10、S1（复制反馈）、S2（失败静默）、S5（弹层 ESC/焦点）
**P2（批量治理）**：S3（hover-only）、S4（键盘语义）、S6（确认分级）、S7（dirty-guard）、S8（禁用提示）
**P3（清理）**：S9（死控件/死代码）、S12（aria-label）、低危项随模块迭代顺带修复

**做得好的方面**（值得保持）：删除/重命名有确认+成功失败 toast；编辑器未保存丢弃确认链（含保存中等待）；单元格写入乐观更新+失败回滚；ModelProviderList 完整 listbox 键盘契约；树组件方向键/Home/End 导航；Radix Dialog 组件统一 ESC。
