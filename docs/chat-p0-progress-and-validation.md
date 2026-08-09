# Chat P0 调整进度与验收手册

> 更新日期：2026-08-09  
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
- 支持加载、删除、历史 hydration、object URL 预览和下载。
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

## 5. 未完成或尚未验收

下表是后续工作的权威清单。“已实现待验收”表示代码和单测存在，但还没有真实浏览器成功证据。

| 能力 | 当前状态 | 剩余工作/通过标准 |
|---|---|---|
| Xpod 读取 timecc credential | **阻塞** | 修复 Xpod DPoP auth context/credential reader，并确认按请求 provider 选择凭据 |
| Chat 成功生成 | **阻塞** | 真实 ChatKit 回答完成，Xpod 返回 200/SSE，不再使用平台 fallback |
| 停止生成 | 已实现待验收 | 在长回答中点击 Stop，确认请求取消、runtime stop、partial content 保留，刷新后仍为 `incomplete` |
| retry | 已实现待验收 | 点击 Regenerate，确认新回答成功、原回答保留且分支计数正确 |
| feedback 持久化 | 已实现待验收 | 点赞/点踩后直接检查 Pod row；ChatKit 刷新后未提供稳定选中态，不能只靠视觉判断 |
| 新附件上传 | 已实现待验收 | 上传新文件，确认 Pod 对象、消息 URI、进度/失败状态、刷新预览和下载 |
| 图片视觉理解 | 已实现待验收 | 上传图片并询问内容，确认 provider 实际收到 image part |
| PDF/文档解析 | 已实现待验收 | 上传含可识别标记的文件，确认回答引用文件内容 |
| 编辑用户消息 | 部分浏览器通过 | 真实 ChatKit 封装已成功创建编辑分支；真实模型生成仍被 Xpod credential reader 阻塞 |
| 分支导航 | 已实现待验收 | `1/2`、`2/2` 来回切换显示正确，不混入非活动 sibling |
| active branch 刷新保持 | 已实现待验收 | 选择非默认分支后刷新，同一 Thread 仍显示该分支 |
| 当前 Thread 选择刷新保持 | **已实现，部分浏览器通过** | selected chat/thread 与每个 Chat 最近 Thread 使用 session storage 保存，单测覆盖 Thread 恢复；浏览器刷新后已停留在 P0 Browser Pass，仍需在模型链路恢复后与 message-bearing Thread 做一次连续验收 |
| 普通 Thread Composer 草稿 | **受 ChatKit API 阻塞** | ChatKit 1.9 没有公开文本变化/读取 API；当前只保证 Secretary 欢迎页草稿，不宣称普通 Thread 草稿可跨刷新恢复 |
| 搜索引用 | **未验收** | 当前 custom provider 路径明确拒绝 LinX web search；需切换到支持的 platform runtime 验收 citation |
| 上传取消/重试 | **需复核** | ChatKit 提供上传 UI，但尚无真实失败、取消和重试的浏览器证据 |

## 6. 当前运行时阻塞的精确根因

在 Xpod 0.3.52 本地镜像的 2026-08-08 16:06 验收快照中，真实 Chat 请求已经达到 Xpod，但返回 500。日志显示的顺序是：

```text
LinX 携带 DPoP 认证请求 Xpod /v1/chat/completions
  → Xpod 验证用户成功
  → PodChatKitStore 只保留 access token，没有 DPoP proof key
  → 内部 settings SPARQL 请求返回 401
  → plain LDP collection query fallback 不支持 Credential 枚举
  → getAiConfig() 返回 undefined
  → VercelChatService 选择 DEFAULT_API_BASE（rightapi.ai）
  → provider 返回 Service Unavailable
  → Xpod 向 LinX 返回 500
```

已排除：

- 不是 timecc 凭据本身不可用。
- 不是 Xpod 容器无法访问 timecc。
- 不再是 Chat 浏览器 CORS；浏览器已不直连 timecc。

正确修复位置在 Xpod，而不是 Vite-only proxy。修复时还应补齐 provider routing contract：当 Pod 中有多个 provider 时，Xpod 必须按请求的 provider/model 选择凭据，不能永远取默认凭据。

## 7. 后续验收顺序

### 阶段 A：先解除 Xpod 阻塞

1. 修复 Xpod 内部 Pod 访问的 DPoP/auth context。
2. 为 `/v1/chat/completions` 建立明确的 provider routing contract。
3. 重建并启动 `xpod-local` 容器。
4. 在 Chat 发送唯一标记消息，确认：
   - Xpod 返回 200/SSE。
   - 回答在 ChatKit 中流式显示。
   - Xpod 日志显示使用 timecc，而非平台 fallback。
   - 浏览器 Network 中没有 `timicc.com` 请求。

### 阶段 B：验收基础生成闭环

1. 普通流式回答。
2. 长回答中点击 Stop。
3. 刷新后确认部分内容和 `incomplete` 状态。
4. 对已完成回答执行 Regenerate。
5. 切换回答 sibling 并刷新。

### 阶段 C：验收消息操作

1. 编辑用户消息并重新生成。
2. 在新旧分支之间来回切换。
3. 刷新页面检查 active branch。
4. 引用消息到 Composer，检查文本内容。
5. 删除测试消息，确认 UI 和 Pod 同步。
6. 点赞和点踩，直接检查 Pod 持久化值。

### 阶段 D：验收附件

1. 上传一个小型 TXT，检查上传进度和 Pod 对象。
2. 刷新并下载 TXT，对比内容。
3. 上传一张含唯一文字的图片，询问图片内容。
4. 上传一份含唯一标记的 PDF，询问标记内容。
5. 删除附件，确认 Pod 对象不再存在。
6. 人为断网或使用超限文件，检查失败、取消和重试状态。

## 8. 建议的验收记录模板

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

## 9. 相关文档

- `docs/chat-module-alignment.md`：Chat 模块整体能力和长期对齐状态。
- `docs/dependency-guide.md`：Xpod/models 跨仓依赖和发布约束。
- `docs/cli-login-and-key-principles.md`：provider key、Pod AI config 和 backend runtime 边界。

## 10. P1 增量修复（2026-08-09）

本轮继续保留 ChatKit 作为消息区和 Composer，没有引入第二套 React 聊天视图。

### 已修复

- **Thread 切换草稿**：`initialThread` 固定为 ChatKit 首次挂载值，后续只通过 `setThreadId()` 切换。这样不会重建 ChatKit 内部状态，ChatKit 自带的分 Thread Composer 输入可以保留。
- **citation 刷新恢复**：带 annotations 的 assistant item 现在始终保存完整 `richContent`；刷新或重新打开历史 Thread 后不会退化成无来源的纯文本。
- **citation 链接安全**：只允许 `http:` 和 `https:` 来源进入 ChatKit，拒绝 `javascript:`、`data:` 和无效 URL。
- **runtime 断线恢复**：SSE 重连携带最后事件时间游标，Service 从最多 500 条短日志中重放断线窗口事件；客户端按时间和事件内容去重，避免漏掉 `assistant_done`、`tool_call` 等状态。
- **工具活动渐进展示**：运行中默认显示用户可理解的“正在搜索/读取/执行”等状态，技术工具名只在展开详情后显示；工具调用本身继续以 `client_tool_call` 写入 Pod 并可在历史中恢复。

### 当前边界

- 当前锁定版本为 `@openai/chatkit-react` 1.6.1（内部 `@openai/chatkit` 1.9.0）；它没有公开 Composer 文本变化或读取事件，因此未发送草稿的**跨页面刷新**持久化仍不能在不侵入 CDN iframe、也不重做 Composer 的前提下可靠实现；本轮修复的是同一页面生命周期内的跨 Thread 保留。
- 本地 Pod 已有可用的 custom provider credential，`chat/completions` 真实生成已经通过；该 provider 不提供 Responses API built-in Web Search，因此搜索 citation 仍需支持 `responses + web_search` 的上游。
- 本地 Xpod 上游目前不支持 Responses API Web Search 时，会显示明确、可重试的 capability 错误，不伪造搜索结果或 citation。

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
- ESLint：当前 Node 25 与仓库内 `@typescript-eslint` 依赖组合在初始化阶段触发 `Cannot read properties of undefined (reading 'Cjs')`，未进入规则检查；这不是 lint 规则失败，需单独修复工具链版本兼容。

## 11. P1/Xpod 联调更新（2026-08-09）

本节覆盖并替代第 5、6 节中关于 credential reader 和 Web Search capability 的旧快照。

- Xpod credential reader / DPoP 上下文已经修复；真实浏览器请求能以 `http://localhost:5737/cuilinsu/profile/card#me` 通过认证并读取 `/settings/credentials.ttl`。
- 本地 Pod 的 custom provider credential 已可被 Xpod 读取，并能完成 `chat/completions` 生成；它不能承接 `linx-lite` 的 Responses built-in Web Search 路由。
- Xpod Responses gateway 现在保留 `{ type: 'web_search' }` built-in tool，并把 OpenAI Responses 的 URL citation annotations 同时传入流式事件和非流式聚合结果。
- Xpod 本地 Docker 已从当前工作树重建；`/service/status` 显示 CSS/API 均为 `running`，容器健康检查为 `healthy`。
- Xpod 目标协议测试 36/36 通过（frontend/provider/handler），TypeScript 构建通过；集成套件 120 项通过、5 项跳过，固定端口并发冲突的单一套件独立重跑 10/10 通过。
- LinX 现在会在已认证 Chat 请求收到 401 时立即触发 OIDC 恢复，不再等待令牌临近过期；浏览器已验证会弹出本地账号恢复入口，并可经 localhost consent 返回 `/chat`。
- LinX Web 全量 Vitest：358 个文件、2778 个测试全部通过；Web `build:check`、Service TypeScript build 和 `git diff --check` 均通过。
- 浏览器已通过 custom provider 完成真实流式生成；搜索请求仍由本地 Xpod `/v1/responses` 接收，但 `linx-lite` 没有可用的 Responses/Web Search 路由，因此真实 citation 视觉验收需要增加具备该能力的上游，而不是再补一个普通 Chat Completions key。

## 12. P1 最终回归补充（2026-08-09）

- **Thread 刷新恢复**：ChatKit ready 后先调用 `setThreadId()`，再调用官方 `fetchUpdates()`；浏览器刷新后无需切换会话即可恢复当前 Thread、消息和附件。
- **feedback 数据闭环**：浏览器点击正向反馈后，本地 Xpod 收到对应消息资源的 `PATCH 205`；RDF 索引中的 assistant `richContent` 可确认包含 `"feedback":"positive"`。ChatKit 官方协议只提交 feedback，不在 ThreadItem 返回模型中恢复选中态，因此刷新后的按钮视觉状态不作为数据持久化证据。
- **工具调用协议**：runtime 的 JSON 字符串参数在进入 ChatKit 前归一化为对象；已存 Pod 的旧字符串工具项在历史回放时同步升级，避免 `client_tool_call.arguments` 协议错误。
- **runtime 订阅稳定性**：事件回调不再依赖每次渲染都会变化的 runtime wrapper，避免普通重渲染重建 SSE 订阅并丢失重放游标。
- **Markdown/代码真实浏览器验收**：标题、GFM 表格、TypeScript 语法高亮、代码块复制入口和引用块均在 ChatKit 主路径正确呈现；流式增量未再出现旧 `part_index` 协议错误。
- **普通草稿**：真实浏览器再次确认同页切换 Chat 后恢复；跨刷新仍受 ChatKit 没有 composer change/getter API 的边界限制。
- **搜索引用**：annotation 转换、URL 安全过滤、Pod 历史恢复和 Xpod Responses citation 转发均有自动化覆盖；真实搜索仍被本地上游 capability 阻塞，页面显示可恢复说明且不伪造来源。
