# Chat P0 调整进度与验收手册

> 更新日期：2026-08-11
> 适用范围：LinX Web ChatKit 1.9 主路径、本地 Xpod、Pod 持久化
> 本文档用于后续开发交接和真实环境测试，不以“代码已存在”代替“运行时已验收”。

## 1. 目标与架构决定

Chat P0 的目标是在保留 ChatKit 1.9 作为主 UI 的前提下，补齐以下闭环：

1. 附件和图片真实上传、Pod 持久化和历史恢复。
2. 停止生成，保留已生成内容并停止 runtime。
3. 编辑用户消息后创建新分支，而不是覆盖原消息。
4. retry、feedback、删除、引用和分支切换形成真实数据闭环。
5. 自定义模型调用通过 Xpod 出站，不在浏览器中直连 provider。

当前责任边界：

```text
ChatKit 1.9
  ├─ 消息区、Composer、附件入口、retry、feedback、语音/搜索入口
  └─ 通过 LocalChatKitService 与 LinX 数据和 runtime 集成

LinX Web
  ├─ ChatKit service/store adapter
  ├─ 外部消息操作栏和分支导航
  ├─ Pod 消息/附件/feedback 持久化
  └─ Workspace、Runtime、审批和收件箱扩展

Xpod
  ├─ OIDC/DPoP 认证
  ├─ 从 Pod 读取 provider credential
  └─ 代理 /v1/chat/completions 到真实 provider
```

## 2. 调整前的状态

| 能力 | 调整前状态 | 主要问题 |
|---|---|---|
| 附件 | ChatKit 接口表面接受上传 | `saveAttachment()` / `deleteAttachment()` 无实现，`loadAttachment()` 抛错，文件未保存 |
| 停止生成 | 自研 Inputbar 有停止状态 | ChatKit 主路径没有完整 abort/runtime stop/持久化闭环 |
| 编辑与分支 | 只有 retry 迹象 | 缺少分支数据、切换和 active branch 投影 |
| feedback | UI 入口已开启 | service 直接返回 success，没有持久化 |
| 消息操作 | ChatKit retry/feedback + 未接入的自研组件 | 主路径没有统一的编辑、删除、引用、分支操作 |
| 自定义 provider | 浏览器直接请求 provider Base URL | provider CORS 预检 403，API Key 进入浏览器出站请求 |
| 主 UI | ChatKit 实际渲染，仓库另有 Inputbar/MessageList | 两套 UI 能力不一致，仓库有组件不代表用户可用 |

## 3. 已完成的代码调整

### 3.1 附件与图片

- ChatKit two-phase attachment create/upload 已接入。
- 附件二进制写入 Pod `.data/chat-attachments/` 容器。
- 支持加载、删除、历史 metadata hydration，以及用户点击时按需生成 object URL 预览和下载；切换会话时回收 URL，避免整页附件并发下载和内存泄漏。
- 图片转为 vision `image_url` 内容。
- PDF、Office（DOCX/PPTX/XLSX）和文本附件接入内容提取；不支持格式会生成明确文本提示。
- Composer 限制为当前已有端到端处理路径的文件类型。

主要位置：

- `apps/web/src/modules/chat/services/chatkit-local/store.ts`
- `apps/web/src/modules/chat/services/chatkit-local/attachment-content.ts`
- `apps/web/src/modules/chat/components/ChatContentPane.tsx`

### 3.2 停止生成与失败恢复

- ChatKit request `AbortSignal` 传递到 Xpod runtime 请求。
- abort 时通知配对 runtime thread 停止。
- 已生成的部分回答保留，assistant item 持久化为 `incomplete`。
- 生成失败时向用户显示脱敏错误，不展示 provider 响应和内部堆栈。
- 在线/离线状态和重连后刷新已接入 Chat 主界面。

### 3.3 编辑、删除、引用与分支

- `threads.custom_action` 支持：
  - `message.edit`
  - `message.delete`
  - `message.select_branch`
- 编辑用户消息会为原消息和编辑版本建立共同 sibling parent，并写入 `parent_item_id`、`branch_id`、`supersedes`，不覆盖原消息。
- 原回答和新回答都绑定到各自用户消息；非活动用户分支的回答子树会一起从 ChatKit 投影中隐藏。
- 消息树 adapter 和 sibling grouping/cycling 已独立为 domain 逻辑。
- ChatKit 外部操作栏已接入编辑、删除、引用、上一分支、下一分支。
- `threads.custom_action` 同时兼容 ChatKit 真实的 `{ action: { type, payload } }` 请求封装与旧扁平参数，避免浏览器操作被误判为缺少 `thread_id` / `item_id`。
- custom action 完成或生成失败后会同时刷新 ChatKit 与 Message collection，避免两个视图短暂不一致。
- 当前 Chat、当前 Thread 及每个 Chat 最近使用的 Thread 保存在当前浏览器标签页的 session storage 中，刷新后恢复；Pod 查询仍会校验资源是否属于当前登录空间。
- Thread metadata 保存 `active_branch_by_parent`；`items.list` 和 `threads.get_by_id` 都只投影当前活动 sibling 及其回答子树。
- 删除用户消息会级联删除其回答子树，并清理或回退失效的 active-branch selection。

主要位置：

- `apps/web/src/modules/chat/domain/message-row-adapter.ts`
- `apps/web/src/modules/chat/domain/message-tree.ts`
- `apps/web/src/modules/chat/app/store.ts`
- `apps/web/src/modules/chat/services/chatkit-local/service.ts`
- `apps/web/src/modules/chat/components/ChatContentPane.tsx`

### 3.4 feedback 与 retry

- feedback 不再是空 success，会加载消息、写入 feedback 并保存回 Pod。
- ChatKit `threadItemActions.feedback` 和 `retry` 保持开启。
- retry 继续使用 ChatKit runtime 协议，在 runtime session 处于 error 时先尝试重启，并把新旧回答保存为同一用户消息下的 sibling。

### 3.5 Composer 和 ChatKit 主路径

- ChatKit 1.9 继续作为主消息区和 Composer。
- Composer 已开启 commands、dictation、联网搜索 tool 和附件入口。
- 会话附件面板支持图片预览、打开和下载。
- Secretary 欢迎页草稿可按账号保存，并在默认 Thread 准备好后交接给 ChatKit Composer。
- ChatKit 1.9 只公开 `setComposerValue`，没有 Composer 文本读取/变化事件；因此普通 Thread 的未发送草稿尚不能在不侵入 iframe 或重做 Composer 的前提下可靠持久化。

### 3.6 自定义 provider 出站路由

- 已删除 Chat service 中携带 API Key 的浏览器直连 provider 路径。
- 自定义 provider 现在使用认证后的 Xpod：

```text
POST <pod-issuer>/v1/chat/completions
```

- 请求体传递 `provider`、`model`、`messages`、`stream`、`temperature` 和 `max_tokens`。
- 真实浏览器网络记录确认：Chat 没有再请求 `timicc.com`，只请求本地 Xpod。

## 4. 已完成的验证

### 4.1 自动化验证

2026-08-09 已执行：

```bash
yarn workspace @linx/web vitest run \
  src/modules/chat/services/chatkit-local/__tests__/service.platform-runtime.test.ts \
  src/modules/chat/services/chatkit-local/__tests__/service-p0.regression-1.test.ts

yarn workspace @linx/web tsc --noEmit
```

结果：

- Vitest：2 个文件，31 个测试全部通过。
- TypeScript：通过。
- `git diff --check`：相关文件无 whitespace 错误。

自动化覆盖的关键行为：

- platform/custom provider runtime 路由。
- Xpod URL 从当前 issuer 解析。
- request AbortSignal 传递。
- 停止后 partial output 持久化为 `incomplete`。
- feedback 持久化。
- runtime error 重启。
- 用户可见错误脱敏。

### 4.2 真实环境已验证

| 项目 | 结果 | 证据/备注 |
|---|---|---|
| 本地 Xpod 登录 | 通过 | `http://localhost:5737` 账号登录成功 |
| LinX OIDC callback | 通过 | 授权后返回 `http://localhost:5173/chat` |
| ChatKit 主界面 | 通过 | 会话列表、模型入口、ChatKit iframe 可用 |
| Thread 切换 | 通过 | 可打开 `P0 Browser Pass` |
| 历史消息 | 通过 | Pod 中的用户/助手消息正常加载 |
| 历史附件 | 通过 | 显示附件计数，历史 attachment 可 hydration |
| 附件选择入口 | 通过 | ChatKit `Choose File` 入口存在且可打开 |
| feedback 入口 | 通过 | Thumbs up/down 控件可点击 |
| timecc 模型列表 | 通过 | `/v1/models` 返回 200，UI 读取 11 个模型 |
| timecc 独立生成 | 通过 | `/v1/chat/completions` 服务端请求返回 200 |
| 浏览器出站边界 | 通过 | 真实发送只请求 `localhost:5737/v1/chat/completions` |
| 消息失败持久化 | 通过 | 用户消息和脱敏失败 assistant item 均写回 Pod |

## 5. 当前完成度与剩余边界（2026-08-10）

本节是当前权威清单，覆盖后文保留的历史验收快照。

| 能力 | 当前状态 | 证据或边界 |
|---|---|---|
| Xpod credential / 普通生成 | **通过** | 本地 DPoP credential reader、custom provider 路由和真实流式生成均已通过；浏览器只请求本地 Xpod |
| 当前 Thread、消息与附件刷新恢复 | **通过** | 不依赖可能漏失的 `chatkit.ready`；连续三次完整刷新自动恢复当前 Thread 和消息区 |
| Markdown / 代码 | **通过** | ChatKit 主路径已浏览器验证标题、GFM 表格、引用、语法高亮与代码复制入口 |
| feedback 持久化 | **通过** | Pod `PATCH 205` 与 RDF `richContent` 已确认；feedback-only PATCH 不再修改会话活跃时间 |
| citation 数据闭环 | **通过** | annotation 转换、安全 URL、流式合并、Pod 保存和历史恢复均有自动化覆盖 |
| 搜索 citation 真实视觉 | **通过** | custom provider 经本地 Xpod Responses Web Search 返回真实回答；ChatKit 展示可点击的 inline citation 和来源入口 |
| 工具调用展示 | **通过** | 用户态进度摘要、展开技术名、结构化参数、Pod 历史重放均已覆盖 |
| runtime SSE 断线恢复 | **通过** | 断线携带游标重连、Service 重放、客户端去重；浏览器普通离线恢复也会主动 `fetchUpdates()` |
| 普通 Thread 同页草稿 | **通过** | ChatKit 保持挂载时跨 Chat/Thread 切换可恢复 |
| 普通 Thread 草稿跨刷新 | **ChatKit API 边界** | 官方 1.9.0 只有 `setComposerValue()`，没有文本 getter/change event；不侵入 iframe、不复制 Composer 的约束下无法可靠持久化 |
| Mermaid | **ChatKit API 边界** | 官方消息 Markdown 没有 Mermaid renderer hook；保留 ChatKit 主路径时不接入不可见的原生 React renderer |
| 新附件、图片理解、文档解析 | **通过** | 本地 Xpod 完成图片/PDF 上传；图片理解、PDF 文本消费、历史预览与打开/下载均有真实浏览器证据 |
| Stop、retry、编辑分支与 active branch | **通过** | Stop incomplete、sibling retry、编辑分支、分支切换和刷新保持均已完成连续浏览器终验 |

## 6. 后续真实浏览器验收顺序

### 阶段 A：基础生成与分支

1. 普通流式回答。
2. 长回答中点击 Stop。
3. 刷新后确认部分内容和 `incomplete` 状态。
4. 对已完成回答执行 Regenerate。
5. 切换回答 sibling 并刷新。

### 阶段 B：消息操作

1. 编辑用户消息并重新生成。
2. 在新旧分支之间来回切换。
3. 刷新页面检查 active branch。
4. 引用消息到 Composer，检查文本内容。
5. 删除测试消息，确认 UI 和 Pod 同步。
6. 点赞和点踩，直接检查 Pod 持久化值。

### 阶段 C：附件与多模态

1. 上传一个小型 TXT，检查上传进度和 Pod 对象。
2. 刷新并下载 TXT，对比内容。
3. 上传一张含唯一文字的图片，询问图片内容。
4. 上传一份含唯一标记的 PDF，询问标记内容。
5. 删除附件，确认 Pod 对象不再存在。
6. 人为断网或使用超限文件，检查失败、取消和重试状态。

## 7. 建议的验收记录模板

每次真实验收建议按以下格式追加记录：

```markdown
### YYYY-MM-DD / 验收人

- LinX commit/worktree：
- Xpod 版本/commit：
- 浏览器：
- Pod issuer：
- Thread：
- Provider / Model：

| 用例 | 结果 | 证据 | 备注 |
|---|---|---|---|
| 普通生成 | PASS/FAIL | Network/截图/Pod URI | |
| 停止生成 | PASS/FAIL | | |
| retry | PASS/FAIL | | |
| feedback | PASS/FAIL | | |
| 编辑分支 | PASS/FAIL | | |
| 分支刷新 | PASS/FAIL | | |
| TXT 附件 | PASS/FAIL | | |
| 图片附件 | PASS/FAIL | | |
| PDF 附件 | PASS/FAIL | | |
```

证据中不要记录 API Key、access token、DPoP proof 或用户密码。

## 8. 相关文档

- `docs/chat-module-alignment.md`：Chat 模块整体能力和长期对齐状态。
- `docs/dependency-guide.md`：Xpod/models 跨仓依赖和发布约束。
- `docs/cli-login-and-key-principles.md`：provider key、Pod AI config 和 backend runtime 边界。

## 9. P1 增量修复（2026-08-09）

本轮继续保留 ChatKit 作为消息区和 Composer，没有引入第二套 React 聊天视图。

### 已修复

- **Thread 切换草稿**：`initialThread` 固定为 ChatKit 首次挂载值，后续只通过 `setThreadId()` 切换。这样不会重建 ChatKit 内部状态，ChatKit 自带的分 Thread Composer 输入可以保留。
- **citation 刷新恢复**：带 annotations 的 assistant item 现在始终保存完整 `richContent`；刷新或重新打开历史 Thread 后不会退化成无来源的纯文本。
- **citation 链接安全**：只允许 `http:` 和 `https:` 来源进入 ChatKit，拒绝 `javascript:`、`data:` 和无效 URL。
- **runtime 断线恢复**：SSE 重连携带最后事件时间游标，Service 从最多 500 条短日志中重放断线窗口事件；客户端按时间和事件内容去重，避免漏掉 `assistant_done`、`tool_call` 等状态。
- **工具活动渐进展示**：运行中默认显示用户可理解的“正在搜索/读取/执行”等状态，技术工具名只在展开详情后显示；工具调用本身继续以 `client_tool_call` 写入 Pod 并可在历史中恢复。

### 当前边界

- 当前锁定版本为 `@openai/chatkit-react` 1.6.1（内部 `@openai/chatkit` 1.9.0）；它没有公开 Composer 文本变化或读取事件，因此未发送草稿的**跨页面刷新**持久化仍不能在不侵入 CDN iframe、也不重做 Composer 的前提下可靠实现；本轮修复的是同一页面生命周期内的跨 Thread 保留。
- 本节记录的是 2026-08-09 当时的 capability 快照；custom provider 的 Responses Web Search 已在第 15 节完成接入和真实浏览器终验。
- 对未声明 Responses 支持的 provider，Xpod 会在请求上游前返回明确的 capability error，不伪造搜索结果或 citation。

### 浏览器增量验收

- 在 `P0 Browser Pass` 输入未发送草稿 `P1DRAFT20260809`。
- 切换到 `Default Chat`，再切回 `P0 Browser Pass`。
- 草稿完整恢复，证明同一页面生命周期内的分 Thread Composer 状态有效。
- 验收后已清空草稿，没有发送消息或写入 Pod。

### 本轮自动化结果

- P1 相关 Vitest：78/78 通过（7 个测试文件）。
- LinX Web `build:check`：TypeScript 和 Vite production build 通过。
- LinX Service TypeScript build：通过。
- `git diff --check`：通过。
- Chat 专项 lint：新增基于 Oxlint 的 `yarn workspace @linx/web lint:chat`，原生兼容仓库的 TypeScript 7，并覆盖 no-var、prefer-const、no-unused-vars、Rules of Hooks 与 exhaustive-deps。Web 全量 ESLint 仍受 `@typescript-eslint` 只支持 TypeScript `<6.1` 的上游版本边界影响，不把未执行的 ESLint 当成通过证据。

## 10. P1/Xpod 联调更新（2026-08-09）

本节覆盖并替代第 5、6 节中关于 credential reader 和 Web Search capability 的旧快照。

- Xpod credential reader / DPoP 上下文已经修复；真实浏览器请求能以 `http://localhost:5737/cuilinsu/profile/card#me` 通过认证并读取 `/settings/credentials.ttl`。
- 本地 Pod 的 custom provider credential 已可被 Xpod 读取，并能完成 `chat/completions` 生成；本条是接入 Responses Web Search 前的历史快照，最新状态见第 15 节。
- Xpod Responses gateway 现在保留 `{ type: 'web_search' }` built-in tool，并把 OpenAI Responses 的 URL citation annotations 同时传入流式事件和非流式聚合结果。
- Xpod 本地 Docker 已从当前工作树重建；`/service/status` 显示 CSS/API 均为 `running`，容器健康检查为 `healthy`。
- Xpod 目标协议测试 36/36 通过（frontend/provider/handler），TypeScript 构建通过；集成套件 120 项通过、5 项跳过，固定端口并发冲突的单一套件独立重跑 10/10 通过。
- LinX 现在会在已认证 Chat 请求收到 401 时立即触发 OIDC 恢复，不再等待令牌临近过期；浏览器已验证会弹出本地账号恢复入口，并可经 localhost consent 返回 `/chat`。
- LinX Web 全量 Vitest：358 个文件、2778 个测试全部通过；Web `build:check`、Service TypeScript build 和 `git diff --check` 均通过。
- 浏览器已通过 custom provider 完成真实流式生成；本轮当时尚未打通 Responses/Web Search，后续已由第 15 节完成真实 citation 视觉终验。

## 11. P1 最终回归补充（2026-08-09）

- **Thread 刷新恢复**：Web Component ref 挂载后等待 `customElements.whenDefined()`，再调用 `setThreadId()` 和官方 `fetchUpdates()`；不依赖可能在 React 监听器注册前发出的 `chatkit.ready`。本地 Xpod 连续三次刷新均无需切换会话即可恢复当前 Thread、消息和附件。
- **feedback 会话排序**：feedback 只修改 assistant `richContent`，不再把原消息时间重新投影为会话最新活跃时间。
- **feedback 数据闭环**：浏览器点击正向反馈后，本地 Xpod 收到对应消息资源的 `PATCH 205`；RDF 索引中的 assistant `richContent` 可确认包含 `"feedback":"positive"`。ChatKit 官方协议只提交 feedback，不在 ThreadItem 返回模型中恢复选中态，因此刷新后的按钮视觉状态不作为数据持久化证据。
- **工具调用协议**：runtime 的 JSON 字符串参数在进入 ChatKit 前归一化为对象；已存 Pod 的旧字符串工具项在历史回放时同步升级，避免 `client_tool_call.arguments` 协议错误。
- **runtime 订阅稳定性**：事件回调不再依赖每次渲染都会变化的 runtime wrapper，避免普通重渲染重建 SSE 订阅并丢失重放游标。
- **Markdown/代码真实浏览器验收**：标题、GFM 表格、TypeScript 语法高亮、代码块复制入口和引用块均在 ChatKit 主路径正确呈现；流式增量未再出现旧 `part_index` 协议错误。
- **普通草稿**：真实浏览器再次确认同页切换 Chat 后恢复；跨刷新仍受 ChatKit 没有 composer change/getter API 的边界限制。
- **搜索引用**：annotation 转换、URL 安全过滤、Pod 历史恢复和 Xpod Responses citation 转发均有自动化覆盖；这里记录的是当时的阻塞状态，真实搜索和 citation 展示已在第 15 节通过。

## 12. 最终刷新与质量门禁（2026-08-10）

- 浏览器重新导航到 `/chat` 并等待初始化后，仍自动选中 `P0 Browser Pass`；会话列表、当前 Thread 和历史消息无需手动切换即可恢复。
- 恢复后的 ChatKit 消息区继续显示标题、GFM 表格、TypeScript 代码和引用块，证明刷新恢复修复未破坏 Markdown/代码呈现。
- 本地 `xpod-local` 容器保持 `healthy`；刷新后的 DPoP WebID 验证成功，Thread/消息资源返回 200/304。日志中的一次 `premature close` 对应浏览器重新导航时取消尚未完成的旧读取流，后续恢复请求正常完成，不是 credential reader 或数据写入故障。
- Chat 模块 Vitest：45 个文件、327/327 通过。
- Chat 集成测试：5 个文件、13/13 通过；测试已按生产路径通过认证的本地 Xpod `/v1/chat/completions` 模拟 provider 响应，不再绕过 gateway 直连 provider。
- `yarn workspace @linx/web lint:chat`、Web production build 和 `git diff --check` 均通过。

## 13. P1 协议边界补强（2026-08-10）

- **流式 citation 位置**：provider 未提供显式 `index` / `end_index` 时，fallback 现在按已接收的完整文本累计位置计算，不再错误地使用单个 delta 的长度。显式位置仍保持 provider 原值。
- **runtime SSE 尾事件**：runtime 在 `assistant_done` 后立即关闭连接、未发送尾部空行时，LinX 现在会按 SSE 语义派发 EOF 前的待处理事件；同时兼容 CRLF 分隔和 `data:` 后不带可选空格的合法格式，避免回答永久停留在生成中或断线重连后重复等待。
- Chat 模块 Vitest 更新为 45 个文件、328/328 通过；Chat 集成测试仍为 5 个文件、13/13 通过，其中 runtime continuation 覆盖无空行 EOF 完成事件。
- 浏览器重新完成本地 Xpod consent 后，选择 `P0 Browser Pass` 并刷新；当前 Thread 自动恢复，标题、表格、TypeScript 高亮、代码复制入口和引用块刷新前后保持一致。
- 本地 `xpod-local` 保持 `healthy`；终验窗口没有 credential、写入或 5xx 错误。日志中的 approvals `HEAD 404` 是可选空容器的存在性探测，不属于聊天请求失败。

## 14. 扩展 Markdown 持久化修复（2026-08-10）

- 真实浏览器让 custom provider 生成了公式、链接、脚注、45 行 TypeScript 和超过 180 字符的代码行。首次生成内容已在 ChatKit 正确流式呈现，但完成消息保存返回 Pod PATCH 400，页面因此显示“生成助手回复时出错”。
- 根因是 `LocalChatKitStore` 的手写 SPARQL 长字符串只处理了引号，没有转义 LaTeX/代码中的反斜杠；例如 `\int` 被 SPARQL parser 识别为非法 escape。
- 现统一使用一个标准 `sparqlStringLiteral()`，完整转义反斜杠、引号、换行、回车、tab、backspace 和 form feed；消息正文、`richContent` 与会话摘要不再维护三套相近的转义实现。
- 回归测试把公式、Windows 路径、三引号与多行代码放进完成消息，并用 `sparqljs` 真实解析生成的 PATCH，防止只断言字符串片段却仍产生非法 SPARQL。
- 修复后浏览器重跑相同长 Markdown：三次消息 PATCH 均返回 205，回答完整结束且没有错误卡；切换到其他会话再返回后，45 行代码与超长行从 Pod 历史正常恢复。
- 最新 Chat 模块 Vitest：45 个文件、329/329 通过；集成测试 13/13、Chat lint、TypeScript、production build 和 `git diff --check` 通过。

## 15. Custom provider 搜索与刷新恢复终验（2026-08-10）

- Xpod 的 OpenAI-compatible adapter 仅在 provider 明确声明 `responses` 且请求包含原生 `web_search` tool 时改走 provider `/responses`；普通请求继续使用 `/chat/completions`，未声明支持的 provider 会在请求上游前返回结构化 capability error。
- LinX 不再把 custom provider 的搜索请求提前拒绝，而是携带明确的 provider/model 经本地 Xpod `/v1/responses` 执行。Responses 请求只在用户明确配置时发送 `temperature`，兼容拒绝该参数的推理模型。
- 真实浏览器在 `P0 Browser Pass` 中完成联网搜索，回答展示 `OpenAI Models` 等可点击 citation；本地 Pod 的用户消息和 assistant 完成消息均返回 `PATCH 205`，没有 provider、credential 或写入错误。
- 首次终验刷新复现了“Thread 已选中但 ChatKit 历史为空”：ChatKit 会把与 `initialThread` 相同的 `setThreadId()` 当成无变化。现在仅在挂载期先切到 `null` 再恢复目标 Thread，后续普通 Thread 切换保持直接切换，不破坏 ChatKit 的分 Thread 草稿。
- 修复后完整刷新自动恢复当前 Thread、全部历史 Markdown、搜索回答、inline citation 与来源入口；运行中的搜索进度不会作为历史状态残留。
- Xpod lite 集成测试改为文件串行执行，消除了多个旧 fixture 在检查/监听端口 10000 之间的竞争；这只影响测试调度，不改变生产运行时。
- Xpod full integration 的 PostgreSQL、Redis、MinIO 和 MinIO Console 改用隔离空闲宿主机端口，相关测试通过环境变量读取实际 PostgreSQL 端口；不会再与本机已有的 `5432/6379/9000/9001` 服务冲突。统一 `test:integration` 门禁最终为 lite 127 通过、5 跳过，full 40/40 通过，测试容器、网络和卷均已自动清理。

## 16. Chat P0 两批终验（2026-08-10）

- **附件与多模态**：真实浏览器完成图片选择上传、图片缩略图/预览、PDF 上传与文本提取；图片内容和 PDF 验证码均真实参与模型回答。刷新后附件入口恢复，图片可重新预览，图片和 PDF 均提供 Blob 打开/下载链接；附件原始内容保存在本地 Xpod。
- **Stop**：长回答生成期间停止按钮可用；停止后保留已生成文本，assistant 以 `incomplete` 写入 Pod，刷新后仍保持部分回答且不回到运行中。
- **Retry 与编辑分支**：重新生成产生 sibling 回答并显示回答计数；编辑用户消息保留原分支并生成新分支。修复 resource-relative ID 与旧 fragment ID 混用后，编辑分支不会再混入原分支的部分回答。
- **active branch 刷新保持**：Thread 元数据中的多值/嵌套 `active_branch_by_parent` 会归一化为一个 JSON 值；刷新后恢复编辑消息和已选回答。Thread 的 title/status/created/modified 同时按单值契约写回，避免历史重复值继续扩散。
- **provider 路由**：ChatKit 的启动 Thread 现在先从 Pod 水合，但保留已解析的 Thread→Chat 映射；旧 parent 不再把 custom provider 错误降级为 `openai/gpt-4o-mini`。真实浏览器已通过本地 Xpod 和 custom provider 返回“编辑分支通过”。
- **刷新与认证**：临近过期的会话即使公开 WebID 探测返回 304，也会再次确认并触发 OIDC 恢复，不再把公开资源可访问误判为凭据仍有效。
- **最终门禁**：Chat 与 token 维护专项 46 个测试文件、352/352 通过；TypeScript、production build 和 `git diff --check` 通过。最终刷新后的浏览器日志窗口无应用 error/warning；仅 ChatKit CDN 的 localhost domain-verification 属于开发环境既有边界。

## 17. P1 完成度复核与 Thread 关系恢复（2026-08-10）

- Markdown/代码、搜索 citation 协议、工具活动渐进展示、runtime SSE 游标重放与同页分 Thread 草稿均再次对照当前实现和测试核验，未发现协议回退。
- Responses provider 返回标准 URL annotation 时直接保留；显式联网搜索路径若只返回 Markdown 来源链接，现在会补成 ChatKit URL annotation。普通 Markdown 链接不会被误标为 citation，非 HTTP(S) 链接也会被拒绝。
- 当前安装的 `@openai/chatkit` 1.9.0 类型定义确认：Composer 只公开 `setComposerValue()` 和 `chatkit.tool.change`，不提供文本 getter/change event；消息 Markdown 也没有 renderer hook。因此普通草稿跨页面刷新和 Mermaid 仍是保留 ChatKit 视图层时的明确 SDK 边界，不以侵入跨域 iframe或复制 Composer/消息区规避。
- 修复了一个会影响 runtime/tool 上下文的刷新遗留：Zustand 可能保存 fragment Thread id，而 Pod collection 返回 resource-relative id。现在当前 Thread 按同一资源 fragment 匹配，刷新后 workspace 关系不会被误判为缺失。
- 本地 Xpod 浏览器硬刷新后，`P0 Browser Pass` 自动恢复为选中状态，并继续显示“当前话题已绑定空间文件夹”和正确的 Pod workspace URI；Thread 历史、附件计数与活动分支同步恢复。
- 2026-08-10 最终真实搜索请求已走本地 Xpod，但 `timecc` 上游返回 HTTP 502；ChatKit 正确显示“联网搜索失败”并持久化失败消息。annotation 生成、序列化和恢复由专项测试覆盖，真实成功 citation 展示仍取决于 provider 恢复，不把本次上游故障记录为前端通过。

## 18. P1/P2 工作台能力与最终 CR 收口（2026-08-11）

- **Provider 能力契约**：credential、provider 和 model 可显式声明 Chat Completions、Responses、Responses Web Search、图片输入、图片生成与图片编辑；未声明的能力在本地 Xpod 出站前失败，不再把所有 custom provider 乐观推定为支持 `/responses`。
- **长会话性能**：Thread 按 cursor/limit 分页后再水合可见消息；附件二进制仅在预览或下载时读取。模型上下文先截取最终窗口，再提取附件文本，并复用不可变附件的提取结果，避免每轮重复下载、解析全部历史 PDF/Office 文件。
- **附件生命周期**：删除消息或 Thread 时会清理不再引用的附件；若同一附件仍被其他会话引用则保留。对象 URL 在附件替换、删除、store 重建和组件卸载时统一释放。
- **离线恢复**：发送请求使用不含正文的本地 outbox 记录待重放 item/thread 标识；网络恢复后单飞重放，避免多个 reconnect effect 重复发送。连接探测请求本地 Pod 的公开 profile 资源，不再用受 ACP 保护的 Pod 根目录制造 403 噪声。
- **Artifacts / Canvas**：长文、代码和文件产物可进入右侧工作区，支持版本切换、复制、下载和继续修改；下载产生的临时 URL 会及时释放。
- **项目上下文与记忆**：会话可绑定 Workspace、项目说明和项目文件；上下文写入 Pod，并在 runtime 请求中明确投影。用户可查看、更新或关闭项目上下文。
- **资产中心**：当前会话附件和生成产物统一进入资产列表，支持搜索、打开、下载和再次引用；资源 URL 必须位于当前 Pod 根路径下。
- **分享与导出**：支持 Markdown/HTML 导出、敏感工具参数过滤、匿名只读分享和撤销分享；发布失败时同步清理分享 HTML 与 ACP/WAC 资源，避免残留半成品授权。
- **语音与画面**：新增语音对话、回答朗读、屏幕/摄像头采集入口；权限拒绝、取消和异步授权竞态均有用户可理解的恢复状态和自动释放媒体轨道。
- **图片生成与编辑**：LinX 仅调用本地 Xpod `/v1/images/generations` 与 `/v1/images/edits`，provider secret 不进入浏览器；Xpod 对请求图片、provider JSON 和最终图片统一执行 25 MB 边界、MIME/base64 校验与安全 URL 策略。图片能力的 UI 和协议测试已通过；真实上游图片生成仍需选中明确声明相应能力且实际支持该端点的 provider/model 后做最终视觉验收。
- **本地运行状态**：当前源码已重建为本地 Docker 镜像，`xpod-local` 健康检查通过；重启后 LinX 可恢复当前 Thread、历史消息和资产，本轮日志未出现 credential reader、Pod 412 或 AI gateway 5xx 回归。

### 当前发布门禁与保留边界

- 共享模型契约已在独立 `packages/models` 仓库提交并标记 `v0.2.50`；LinX 只有在该版本推送并发布后才能把依赖从 `0.2.47` 精确升级到 `0.2.50`。当前本机 GitHub SSH 身份对 `undefinedsco/models` 没有写权限，因此这是唯一跨仓库发布门禁，不把本地 workspace 解析成功当成 CI 可安装证据。
- 保留 ChatKit 视图层的前提下，普通未发送草稿跨整页刷新和 Mermaid renderer 仍受 SDK 无 Composer getter/change event、无 Markdown renderer hook 的边界约束；本轮没有复制 Composer 或消息渲染器来绕过这些限制。
