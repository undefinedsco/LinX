# CLI / App Shared Core

本文档定义 LinX CLI 与 LinX App 的共享边界。

目标只有一个：CLI 和 App 共享同一个 domain + service 内核，只在最外层分别套 TUI 和 GUI。

## Core Rule

- CLI 和 App 必须共享数据模型、领域语义、用例服务、运行时协议。
- CLI 和 App 不共享命令行壳、React 壳、页面状态壳、展示元数据壳。
- 如果某段逻辑同时被 CLI 和 App 需要，它不能继续留在 `apps/web` 或 `apps/cli` 内部。

## Shared Layers

### 1. Storage Contracts

必须共享：

- Pod schema
- RDF namespace / predicate / subject 规则
- 本地 `~/.solid/auth` Solid auth bootstrap 结构
- auto-mode session archive 格式
- sidecar / approval / tool-call 事件格式

推荐落点：

- `packages/models`: Pod schema、repository、runtime contracts
- 后续独立 shared package: 本地配置 schema、auto-mode archive schema、client session schema

当前主线：

- `packages/agent-runtime/auto-mode`: auto-mode session/event/archive contract
- `packages/agent-runtime/auto-mode`: backend credential/config helper
- `packages/agent-runtime/auto-mode`: auth failure / auth status normalization helper
- `packages/agent-runtime/auto-mode`: generic JSON line / codex JSON-RPC event normalization helper
- `packages/agent-runtime/auto-mode`: approval request / structured user-input / auto-approval decision helper
- `packages/models`: `approval / audit / inbox_notification` 是跨端 remote approval 的共享真相
- `packages/models/client`: LinX/Solid auth envelope、account session、login bootstrap 和 whoami helper
- `packages/models/client`: linx cloud account API 与 runtime API URL 解析 helper

强约束：

- 不允许 CLI 和 App 分别维护不同的 predicate 或 subject 规则
- shared model 的字段、RDF class、predicate、subject template 的唯一真相在 owning shared package 中；当前 LinX 共享 Pod 模型的 owning package 是 `packages/models`，具体落点是 `namespaces.ts`、`vocab/*.vocab.ts`、schema 和 repository。
- CLI / App 的 native Pod helper 只能负责底层传输、缓存和运行时适配；对于 shared model 字段，它们必须消费 shared package 导出的 resource/repository/vocab/schema，不能再定义自己的业务 predicate、subject template、Turtle serializer 或同义字段。
- 如果 `packages/models` 已经存在对应 resource 或 repository，CLI / App 必须直接使用；如果缺少查询、upsert、resolve-by-uri 等能力，先在 `packages/models` 补 repository/helper 和 contract tests，再由壳层调用。
- 所有已进入 `packages/models` 的结构化 Pod 数据读写，主路径必须通过 `drizzle-solid` 和 shared resource/repository。壳层不得为了方便在 CLI / App 内部直接解析 shared resource 的 Turtle；如果当前 auth 形态只有 token/fetch，必须在 session 适配层包成 `drizzle-solid` 可接受的 Inrupt-compatible session，而不是让业务查询分叉。
- `packages/models` 只负责 shared business truth：RDF class、predicate、vocab、schema、relation 字段、repository/use-case contract。通用数据访问机制属于 `drizzle-solid`，包括 locator 到 IRI/base-relative id 的解析、row 到 subject/IRI/id 的解析、known full IRI 精确查找、date bucket subject template 展开、base path 拼接和 resource document/fragment 定位。
- `packages/models` 不得导出 `build*ResourceIri`、`build*SubjectPath`、`buildFragmentResourceIri`、`resolvePodUri`、`whereByPodStorageId`、`findPodRowByStorageId`、`normalizePodBaseUrl`、`extractPodResourceId` 这类通用 Pod resource/path helper。需要定位 shared resource 时，业务代码必须使用 `db.resolveLocatorIri/resolveLocatorId`、`db.resolveRowIri/resolveRowId`、`db.resolveResourceIri/resolveResourceId`、`db.findByResource`、`db.updateByResource`、`db.deleteByResource`、`db.findByIri`、`db.findByLocator`、`db.updateByIri`、`db.updateByLocator` 或在 ORM/repository 层补缺口。
- `id()` 虚拟列语义归 ORM：它表示相对 resource id，可以是 base-relative subject id（例如 `2026/05/07.ttl#approval_123`），不能在 models 或壳层被偷换成 fragment-only id。调用方已持有 full IRI、base-relative id、row 或 locator 时优先走 `findByResource/updateByResource/deleteByResource`；只知道 full IRI 时可走 `findByIri/updateByIri/deleteByIri`；只知道 locator 且 subject template 变量齐全时可走 `findByLocator/updateByLocator/deleteByLocator`。
- UI collection/cache 层可以把 ORM 返回的 row subject 用于选中态、Map key、乐观更新合并，但不能自定义 shared storage contract，也不能替代 `drizzle-solid` 的 locator/IRI API。需要跨端共享的 row identity/locator 行为必须下沉到 `drizzle-solid`。
- Inrupt-compatible session 可以是真实 Inrupt `Session`，也可以是由已认证 `fetch` 适配出来的 inline session：至少包含 `info.isLoggedIn=true`、`info.webId` 和 `fetch`。client credentials 与 OIDC/browser consent 只影响这个 session 如何获得，不能影响后续 shared model 查询路径。
- Agent Runtime 内部调用的 Pod-facing 工具必须继承 runtime 的 Pod authority。`xpod` 作为外部人/脚本/agent 工具面时，可以通过 runtime-provided auth bridge 访问同一 Pod session；脱离 runtime bridge 时，所有 Solid app 也只能读取同一套 `$SOLID_HOME/auth/credentials.json`。旧 `~/.xpod/config.json` / `~/.xpod/secrets.json` 只是 xpod app-local 旧文件，不是 Solid auth source；只有这些旧文件时必须视为未登录。raw token、refresh token、client secret、cookie、DPoP material 不得进入模型可见环境、消息、archive 或日志。
- 允许留在 CLI / App 的逻辑只有壳层适配：TTY/GUI 渲染、快捷键、命令参数、Pi/Codex/Claude 协议事件到 shared insert/update DTO 的映射、本地缓存策略、错误展示。它不能决定 shared Pod resource 的存储路径、predicate、subject 或跨端状态机。
- remote approval 的审批颗粒度必须跟原生运行时对齐：只有 Pi/Codex/Claude 等上游原生流程请求审批时，LinX 才写 `approval`/`inbox` 控制面；LinX CLI 不得用自己的工具名 allowlist/blocklist 额外发明一套审批策略。
- remote approval 的读取分两类：等待/处理一个已知 approval 时，优先使用持久化的 `approvalUri` 做精确 subject lookup；App/Inbox 这类列表界面可以做最近日期分桶的有界发现，但不得对 `/.data/approvals/` 做无界递归扫描，也不得把列表优化理解成改变 approval URI 存储语义。
- remote approval 的倒计时和 auto/session 决策能力必须来自 shared model 字段：`approval.expiresAt` 表示截止时间，`approval.approvalOptions` 表示上游原生协议提供的选项。AI secretary/App 可以据此判断是否有倒计时、是否支持一次同意或 session 级同意；CLI/App 不得用本地私有字段重新推断。
- approval 与 grant 是互相兼容的两层语义：approval 只表达本次 runtime/extension 交互的决策，grant 才表达可复用授权。grant materialization 只能发生在统一 approval 流水线里：`allow_once` 不创建 grant，`allow_for_session` 创建 session-scoped grant，`allow_always` 创建 durable grant。CLI/Web 都只是这条流水线的 producer/consumer UI，不各自拥有 grant 策略。
- grant 是用户可维护的 LLM Wiki 文档资源，不是隐藏的 request fingerprint。`grantResource` 以一页一个 TTL 文档存储在 `/settings/autonomy/grants/{id}.ttl`；文档 URI 本身就是 RDF subject，页面属性通过 `title/summary/body/schema/pageKind/wikiStatus/tags/source/sourceHash/compiledAt/compiledFrom/related/context` 等 predicate 描述。
- 所有 grant 都必须同时保存 exact provenance anchor 和用户授权的泛化边界。source approval URI、runtime/backend、tool/action、target/command、workspace/session/thread、risk、原始 prompt/options 等能拿到的上下文必须进入 shared 字段或 grant context；body/policy/tags 描述可泛化范围。
- grant 的 `schema` 是 Solid schema/shape URI 关系，对应 `dcterms:conformsTo </settings/autonomy/schema/grant.ttl#GrantWikiPage>`，不是 `path`/`wikiPath` 字符串；TTL wiki page 不需要 `.meta` subject。
- grant 覆盖判断属于统一 approval 流水线。已有 grant 覆盖请求时直接通过，且不依赖 `auto`；没有 grant 覆盖时，`auto on` 只允许 Secretary 做一次性 approve/decline/cancel/input 或等待用户，不能替用户选择 `allow_for_session` / `allow_always`。`target/action/riskCeiling` 只能用于候选排序或粗筛，不能单独作为自动审批依据。
- approval/grant/auto 质检上报必须从 shared `Approval` / `Grant` / `Audit` / `Inbox` / runtime result 事实派生；CLI/Web 可以展示或导出报表，但不能各自维护私有 telemetry 作为质量真相。
- Inbox/approval/input 的跨端通知必须采用 shared Pod facts + subscribe/watch + claim/lease 模型：`InboxNotification` 只是 `/inbox/` 下的 ActivityStreams envelope；`ApprovalRequest` / `InputRequest` / 其他 control resource 才是权威事实和 claim 目标。subscribe/watch 只通知各活跃 client 刷新，不直接创建 chat message，也不直接唤醒某个 Agent。CLI/Web/Desktop 都可以展示 badge/toast/list；只有具备本地 Secretary runtime、presence/policy 允许、且成功在 linked control resource 上 claim/lease 的 client 才能调度 Secretary 处理。claim 失败的 client 必须保持 display-only，避免多端重复回答 worker。`leaseOwner` / `leaseExpiresAt` 这类 claim/lease 字段属于 shared control resource，不属于 `/inbox/` envelope；focus、tab visibility、generation lock、local scheduler queue 属于 runtime-local presence，不写回业务资源。
- AI provider/model 的接口 id 可以是 `provider/model` 形式，但这不是 Pod 存储路径约定。LinX 自供模型来自 ai-gateway discovery/runtime，不写入用户 Pod 的 AI provider/model 配置资源。用户自己维护的第三方 AI 配置按 provider-scoped 文档建模：provider 位于 `/settings/providers/{providerId}.ttl`，model 位于同一文档的 `/settings/providers/{providerId}.ttl#{modelId}` fragment，两者通过 `udfs:hasModel` / `udfs:isProvidedBy` 的 IRI 关系关联。这里的 `{providerId}.ttl` 是 provider 文档，不代表接口层把 provider/model 合并成一个模型 id。
- CLI/App 不得为 `approval/grant/audit` 字段定义自己的业务 predicate。shared 字段必须先在 `packages/models` 的 namespace/vocab/schema 中定义清楚，再由壳层消费。
- Symphony 的 `Idea / Issue / Task / Delivery / Session / Run / RunStep` 在 LinX 产品运行时必须以 shared Pod TTL resource 为权威。本地持久镜像应从 Pod RDF 拉取为 JSON-LD；`$LINX_HOME/symphony/*.json` 这类 runtime 私有 JSON 只允许作为 portable runtime、无 Pod 离线恢复或测试缓存，不得替代 `@undefineds.co/models` + `drizzle-solid` 主路径。`LINX_HOME` 默认是 `$SOLID_HOME/apps/linx`，`SOLID_HOME` 默认是 `~/.solid`。
- Agent runtime config 和 skill binding 也是 shared resource 语义，不是 CLI/App 各自拼接的 prompt 配置。Agent 是一个容器资源，例如默认 Secretary Agent 的资源根；AgentRuntimeConfig 是这个容器的默认 meta，Solid-backed 存储用 `.meta` 描述容器本身，subject 指向容器而不是 `.meta` 文件。
- Agent root 和 Agent WebID 必须分离。只有 AI Agent 需要独立授权、审计身份、maker/actor/requester、grant recipient 或 credential holder 时才需要 WebID；普通 Skill、Issue、Task、Run、Evidence、Report、文件和对象只使用自己的 resource URI。
- Skill 内容必须文件化，例如 `SKILL.md` 或 skill 文件夹；RDF/meta 只记录 enabled、version、source、checksum、load policy、依赖和关系。Agent 下的 skill resource 是该 Agent 的启用/安装 binding，不是全局 Skill 本体；外部或复用 skill 通过 `source`、`version`、`checksum`、`root` 指向来源或本地 materialized copy。CLI/App 不得把完整 skill 文本复制进 AgentRuntimeConfig、message archive 或本地 JSON 作为 shared truth。
- 默认 Secretary 的 `/agents/__secretary__/` 是一个用户拥有的 Agent context folder，不是一份由系统配置和用户配置字段级 merge 出来的对象。system-managed surfaces（官方 Secretary 包、内置 skill binding、迁移记录、capability envelope）和 user-managed surfaces（`AGENTS.md`、preferences、用户 skill、grant/memory policy、forked skill）同目录共存但权威不同。运行时按类似 system message + `AGENTS.md` 的顺序做投影，投影结果只进入 Session/Run snapshot，不回写成新的 shared truth。升级只能改 system-managed surfaces；用户个性化必须保持独立，冲突时进入 review/migration 状态。
- Runtime 启动时读取 Agent container meta 和 skill bindings，应用启动/session override，并把有效 backend、model、credentialSource、skills、tool/authority policy 冻结到 Session/Run metadata。Resume 默认使用该 snapshot；显式切换 backend/model/credentialSource 必须产生新的 runtime session 或明确 override record，不能静默改写历史 session 含义。
- 默认 Secretary 的持久 Agent key 是系统保留名 `__secretary__`，对应资源根形态为 `/agents/__secretary__/`；Solid `.meta` 只是描述该容器的存储文档，不是 Agent resource identity。默认 Secretary Chat 可以在 Chat resource base 下复用同一个保留 key，例如 `/.data/chat/__secretary__/index.ttl#this`；它是 Chat resource，不是 Agent identity。不要再为 Secretary 引入非保留的旧 slug。
- structured user-input 是 backend 共享协议的一等请求类型，不是 CLI 私有 prompt。AI secretary 可以在答案能从 session context、Pod credential source 或请求选项中明确推出时代答；不能明确推出时必须展示建议并等待用户，不得捏造 secret、token、路径或用户偏好。
- 端内私有模型可以在自己的 owning module/package 中定义专用 predicate，但必须明确作用域为私有、不能被另一端按 shared contract 读取；一旦字段需要跨 CLI / App / xpod 共享，必须先迁入 shared model，再由各端消费。
- `metadata` 只承载 opaque 协议 id、局部 cache key、UI 选中态、兼容迁移信息或尚未正式化的附加上下文。凡是跨端需要查询、恢复、投递、审批、审计或授权判断的事实，都必须沉到 shared 语义字段或 URI relation；不要把关系字段后缀成 `Id` / `Uri` 再伪装成普通 metadata。
- 不允许一端写 `udfs:*`，另一端读 `cred:*` / `ai:*`
- 不允许新功能继续建立平行 schema

## 2. Domain Models

必须共享的领域对象：

- `AccountSession`
- `AIProviderConfig`
- `AICredential`
- `AIModel`
- `Thread`
- `Message`
- `ThreadExecutionMetadata`
- `ApprovalRequest`

这些类型必须是纯 domain 类型，不得包含：

- React 类型
- icon / avatar / image URL
- UI 文案
- 按钮状态
- layout / dialog / pane 配置

结论：

- `apps/web` 中的 provider 展示元数据只能是 web view metadata
- 它不能作为 CLI / App 共用的 domain type

### Chat / Thread / Session Semantics

这些语义属于 `packages/models` 的 shared truth，CLI 和 App 不能各自重定义：

- `Chat` 只表示对话对象/counterpart：用户正在和谁或什么对话，例如默认 AI secretary、某个人、群组、Codex、Claude Code，或后续具体 AI 身份。
- `Thread` 表示具体场所、时间线和 runtime context：workspace、backend 控制场景、AI 产品运行时 session、外部 agent session 等上下文都归在 thread 上。
- `Session` 表示通用 AI 产品/agent runtime 的运行生命周期投影：它必须指向对应的 `chat` URI 和 `thread` URI，不能作为另一套对话根。
- `Message` 同时属于一个 `chat` 和一个 `thread`：chat 回答“跟谁聊”，thread 回答“在哪个运行/时间线里聊”。

存储层规则：

- Pod schema 使用 `chat`、`thread` 这类 URI-valued RDF relation 字段。
- `chatId`、`threadId` 只允许作为 UI 状态、函数参数、runtime protocol 字段或 metadata 中的兼容信息，不允许作为持久 RDF link 字段。
- 同一规则适用于所有 shared relation：`issue`、`task`、`delivery`、`session`、`workspace` 等字段在 shared model / archive contract 中都表示 URI relation；不要用 `issueId`、`taskId`、`deliveryId`、`sessionId` 这类字段承载跨资源链接。
- 壳层 API 可以继续接收短 id，例如 `chatId`、`threadId` 或 CLI 参数里的 task key，但写入 `packages/models`、shared archive 或跨端 runtime contract 前必须解析成语义 URI 字段。
- runtime provider 的 opaque id 可以保留成明确字段，例如 `externalRunId`、`toolCallId`、`providerId`、`webId`。这些字段不能伪装成 RDF link，也不能用来替代 `task`、`delivery`、`thread`、`message`、`workspace` 这类 shared relation。
- 本地队列、checkpoint、cache 的 operation key 可以进 metadata，但命名必须暴露本地属性，例如 `syncTask`、`operationId`、`cacheKey`。不要把本地队列 key 写成 `taskId`、`threadId` 这类会和 shared resource 关系混淆的名字。
- local-first 同步中的本地关联键必须放在同步账本 metadata 的 `resourceBindings.{name}.local`，对应的 Pod 资源放在 `resourceBindings.{name}.uri`。不要把这类边关系扁平成 `sourceId`、`targetUri`、`localSource` 或 `localTarget`。
- 同步账本 metadata 不是 shared model 字段；多个 app 共享同一个 Pod 或本地 store 时，必须按 `source` / app namespace 查询和落盘，不能把多个 app 的恢复状态混进同一条业务资源 metadata。
- 历史字段名像 `sourceId`、`targetUri`、`chatId` 时，兼容层可以读取；canonical 写入必须改成 URI relation 或 `resourceBindings.*` 边。
- 新增 shared model 代码优先使用 `chatResource`、`threadResource`、`messageResource`、`sessionResource` 等 Solid resource 命名；`*Table` 只作为兼容 alias 逐步退出。

## 3. Use Case Services

必须共享的用例服务：

- `login / logout / whoami`
- `ai connect / disconnect / status`
- `resolve backend credential/config from Pod AI settings`
- `create thread / append turn / continue thread`
- backend 事件归一化
- `local runtime + remote approval` 的 pending / resolve 控制面
- approval / tool-call / archive 持久化

规则：

- CLI 负责参数解析、TTY prompt、stdout/stderr 渲染
- App 负责 React hook、Collection 订阅、GUI 状态同步
- 真正的业务语义必须下沉到共享 service

## 4. Runtime Protocols

必须共享：

- 本地 backend 统一事件格式
- auto-mode session record 结构
- provider alias 规则
- auth failure / approval / tool-call 的归一化规则
- structured user-input / approval response payload 规则
- local runtime 把 pending approval 写入 Pod，remote surface 回写 decision 的控制协议
- ACP / ChatKit 运行时能力声明、事件/控制能力归一化、fast companion model 策略、Agent Turn Controller 策略

示例：

- `claude` 与 `anthropic` 的 alias 规则必须只有一份
- `codex` 与 `openai` 的 alias 规则必须只有一份
- backend credential/config 的 Pod 读取与 provider alias 逻辑必须只有一份

当前落点：

- `packages/agent-runtime` 是 CLI/App 共用的公共运行时组件包，负责描述 ACP、LinX ChatKit、LinX Cloud 等 agent runtime 的能力边界。
- `packages/agent-runtime` 可以定义 turn-controller 这类公共调度策略，例如 auto-mode 场景下何时让 AI secretary 观察 approval/input 请求并产出审批、输入答案或控制命令。
- `packages/agent-runtime` 统一定义 fast companion model，当前默认是 `linx-lite`。它是类似 Claude Code 快速旁路模型的公共能力，可用于 turn routing、审批判断、structured input 代答、上下文摘要/压缩、标题生成、检索排序等低延迟辅助任务。
- `Agent Turn Controller` 默认使用 fast companion model 做轻量仲裁；`AI Secretary` 本身的回复/判断模型仍使用用户配置，不由 controller package 硬编码。
- `apps/cli` 只保留子进程、TTY、ACP stdio 适配；`apps/web` 只保留 React/GUI/runtime-sidecar 适配。两端不得再各自定义一份 runtime capability schema。
- AI Secretary 的产品能力、授权判断、用户请示和存储建模边界见 `docs/secretary/README.md`；本文档只记录 CLI/App 共享内核和数据面约束。

## 5. Discovery Boundary

`discovery` 是可选增强层，不是主路径依赖。

规则：

- 没有远端 discovery 服务时，CLI / App 仍必须可正常使用
- runtime 真正依赖的默认值，仍以共享 domain 规则为准，例如 provider alias、默认 `baseUrl`、AI config 写入语义
- discovery 只负责补充 provider / model 的展示元数据和推荐信息
- cloud identity / account 默认入口应指向身份域，例如 `https://id.undefineds.co/`；Pod 托管域如 `https://pods.undefineds.co/` 不能被当成默认 OIDC issuer
- cloud runtime 的模型真相来自 live API，例如 `https://api.undefineds.co/v1/models`
- cloud runtime 的对话主路径来自 live API，例如 `https://api.undefineds.co/v1/chat/completions`
- LinX 云在 runtime/discovery 中只有一个 provider：`undefineds`。`linx-lite` 和 `linx` 是 ai-gateway 暴露的自供模型，不经过用户 Pod 的 AI provider/model 配置资源，也不再允许出现 `undefineds-cloud`、`linx-cloud` 这类平行 provider id。
- discovery 请求失败时，必须回退到 `@undefineds.co/models/discovery` 内置快照，不能让 provider 消失或阻塞主流程
- 内置快照只是离线 fallback / 词典，不得替代 live cloud `/v1/models`
- 内置快照应优先通过同步脚本更新，例如 `yarn workspace @undefineds.co/models sync:discovery:vercel`，而不是在多个端里各自手改 provider/model 词典

## Non-Shared Layers

以下内容不得下沉到 shared core：

- `yargs` command modules
- CLI prompt / terminal rendering / ANSI 输出
- React hooks
- Zustand stores
- TanStack Router / page layout / dialog state
- web provider avatar / docsUrl / apiKeyUrl
- GUI/TUI 专属文案和交互细节

原则：

- 壳层可以不同
- 业务语义不能不同

## AI Config Specification

AI 配置以三类 Pod resource 为准，不允许再引入平行主线：

- `credentialResource`: 凭据状态，如 `provider`、`service`、`status`、`apiKey`、`baseUrl`
- `aiProviderResource`: provider 级配置，如 `baseUrl`、`proxyUrl`、`hasModel`
- `aiModelResource`: model 级配置，如 `displayName`、`isProvidedBy`、`status`

规则：

- 三类 resource 保持分离，不合并成单一 resource
- 上层可以构造一个聚合读模型给 CLI 或 App 使用
- 这个聚合读模型必须是共享 domain object，不是某个 UI hook 的私有产物

`ai connect / disconnect / status` 的语义必须基于这三类 resource 定义，而不是各端自行拼凑。

### Backend Credential Injection

`linx --backend <backend>` 的 credential injection 职责分层必须固定：

1. 认证层从本地 Solid auth 恢复 Pod 访问能力；本地只保留 Solid auth 所需材料，不保存其它 app/provider 的 API key。
2. session 适配层产出统一的 Inrupt-compatible session，供 `drizzle-solid` 使用。
3. shared model 查询层读取 `credentialResource`、`aiProviderResource`、`aiModelResource`，并根据共享 provider alias / backend binding 规则选择 active credential。
4. Backend runner 只把选中的 credential 映射成子进程环境变量，不把 credential 复制到 archive、message、audit 或 TUI state。

CLI credential 获取交互和 runtime 消费必须分开：缺 LinX/Solid 登录时延续 Pi 的浏览器 OIDC / manual redirect 体验；缺 provider key 时在当前 CLI/TUI flow 收集 API key，并通过 shared AI config mutation 写入 Pod。之后 backend runner 仍然从 Pod 读取并重试。详细原则见 `docs/cli-login-and-key-principles.md`。

当前 backend env 映射规则：

- `claude` / Anthropic: 注入 `ANTHROPIC_API_KEY`
- `codex`: 注入 Codex 专用 `CODEX_API_KEY`；provider 可以是 OpenAI、DeepSeek、OpenRouter、LiteLLM gateway 等任意 `supportsBackend=codex` 的 Pod provider，如 provider 配置了 base URL 再通过 Codex config 注入
- `codebuddy`: 注入 `CODEBUDDY_API_KEY`，如 credential/provider 配置了 base URL 再注入 `CODEBUDDY_BASE_URL`

这条链路不允许出现第二套 credential 读取器。若 OIDC 场景、测试夹具或某个 runtime 不能直接传真实 Inrupt `Session`，修 session 适配层；若 shared model 缺少方便的聚合查询，修 `packages/models` repository/helper；不要在 `apps/cli` 或 `apps/web` 里手写 `credentialResource` 的 Turtle parser。

完整 backend / Pod 原则见 `docs/backend-pod-contract.md`。该文档是 CLI/App backend 改动的验收口径：backend 选择只改变外部 agent runtime；凭据/config、关键数据、local-first sync、approval/auth 语义必须继续走 shared model 和 Pod。

完整 approval / grant 产品契约见 `docs/approval-grant-design.md`。

## Removed Path

`modelProviderTable` 已从代码主线移除，不得恢复为 AI 配置主线。

要求：

- 新功能不得重新引入 `modelProviderTable`
- AI 配置共享导出只允许使用 `credentialResource`、`aiProviderResource`、`aiModelResource`，`*Table` 仅作为兼容 alias
- 评审时发现单表回流，视为架构回退

## Package Boundary

目标边界如下：

- `packages/models`: schema、repository、runtime contracts
- `packages/core` 或等价 shared package: 领域对象、用例服务、alias 规则、配置解析
- `apps/cli`: 命令行入口、TTY 交互、stdout/stderr 壳
- `apps/web`: GUI 页面、Collection 订阅、UI state、view metadata

规则：

- `apps/cli` 不直接定义业务真相
- `apps/web` 不直接定义业务真相
- 业务真相必须在 shared package 内

## Migration Order

按以下顺序收口：

1. 先冻结 shared contracts 和 AI config 语义
2. 抽出不带 React 的 shared domain/service
3. 让 CLI 改为调用 shared service
4. 让 App 改为在 shared service 之上构建 hook / collection adapter
5. 保持 `modelProviderTable` 已删除状态，不得回流

## Review Checklist

评审 CLI 或 App 改动时，必须检查：

- 是否改动了共享 schema 或 namespace
- 是否把业务语义偷偷放进了 `apps/cli` 或 `apps/web`
- 是否在壳层手写了 shared resource 的 predicate、subject template、Turtle 读写、URI builder、approval/grant/audit/session 状态机
- 是否为了 OIDC、测试或 backend 控制场景绕开了 `drizzle-solid` shared model 查询；正确做法是把认证结果适配成 Inrupt-compatible session
- 是否把 cloud credential 注入到了子进程 env 以外的位置，或把 provider API key 写进了 archive/message/audit/TUI state
- approval 处理是否保持 known `approvalUri` 精确读取，App/Inbox 列表是否保持有界日期分桶发现，且没有恢复无界 recursive list
- ACP / ChatKit / LinX Cloud runtime 的 capability、fast companion model、turn-controller、事件/控制能力是否复用 `packages/agent-runtime`，没有在 CLI/App 壳层复制一份 schema
- 是否已有 `packages/models` resource/repository 可以直接用；如果没有，是否先把缺失 helper 补进 models 并覆盖 tests
- 是否新增了和上游原生审批策略不一致的 LinX 私有审批判断
- 是否引入了 UI 类型到 shared core
- 是否新增了与三张 AI 表并行的第二套配置表示法
- 是否新增了第二份 provider alias 规则
- 是否为共享语义补了 contract tests
