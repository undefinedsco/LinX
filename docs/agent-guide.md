# LinX Agent Guide

这个文档是 AI agent 在 LinX 仓库中的统一入口。`AGENTS.md` 和 `CLAUDE.md` 只保留这个链接，避免根文件继续膨胀。

## Mandatory Rules

- `@undefineds.co/models` 是共享数据面权威源；`apps/*` 不得重新定义跨端业务语义。
- 涉及依赖升级、npm/workspace 版本、发版产物、`xpod` 或 `models` 联动时，先读 `docs/dependency-guide.md`。
- `packages/models` 若存在，只是迁移期本地开发检出；共享模型修改必须进入独立 models 仓库并通过 `@undefineds.co/models` 版本消费，不在 LinX 内长期维护 submodule。
- 结构化 Pod 数据必须走 `drizzle-solid` + schema/repository/collection 路径；不要在 React 组件里直接写 `getSolidDataset`。
- 查询失败时先修 repository / schema / permissions / SPARQL，不做 UI fallback 掩盖问题。
- 涉及 Pod 登录、持久化、权限、通知的集成测试，必须跑在自举的 `xpod` + 真实 Pod 上。
- 模块状态分工：Pod 数据走 TanStack DB Collection；Zustand 只管理纯 UI 状态。
- 新增共享规则、RDF contract、归一化逻辑、跨端 use-case 时，优先放进 `@undefineds.co/models`。
- Pod ORM row 的 `id` 是 base-relative resource id，用于 UI key、selection 和所有 `ById` 调用；full IRI 只用于 RDF 关系或 `ByIri`。不要在 App 代码里从 `@id/subject/uri` 解析业务 id，缺 `row.id` 时先修 schema/repository/ORM。
- 应用层 Pod 语义统一说 `Resource`，不再把 shared model 叫 `Table`。`*Table` 只允许出现在 drizzle-solid / models 的历史兼容边界、上游兼容测试，或 HTML/SQLite 这类非 Pod 语义场景；Web/CLI/Service 的业务代码和新文档不得消费或示例化 `*Table` alias。
- 命名只在跨包公共 API、外部冲突边界、LinX Cloud 产品语义和品牌展示上使用 `Linx` 前缀；CLI/TUI 内部通用概念、helper、状态和 adapter 局部类型不要因为位于 LinX 仓库里重复加 `Linx` / `LinxPi` 前缀。
- 添加、恢复或保留顶层 `linx <command>` 前必须按 `docs/linx-shell-core-design.md` 的 top-level admission checklist 判断；不要把 Pi/backend 已有的 session、thread、model、help 等原生命令克隆成 LinX 顶层产品面。
- 当问题本质是 Pi/backend 原生命令的发现、转发或适配时，先修 active surface 的 help、forwarding 或 adapter；不要新增 LinX 顶层别名。session 列表/选择固定走 Pi surface：启动时 `linx -r` / `linx --resume`，TUI 内 `/resume`；不保留 `linx sessions` 或 `linx --sessions`。
- 移除已降级为 Pi/backend 原生面的顶层入口时，要一起移除 help/docs/command registration，并加 admission 测试证明不会触发 login、Pod lookup 或 interactive bootstrap；不要用 hidden alias 维持第二套人类可用入口。
- 新增 CLI/TUI lifecycle patch 前必须先走 `docs/linx-shell-core-design.md` 的 shell seam：`interactive.init` 后置行为进 `linx-interactive-post-init.ts`，`interactive.run` 启动期行为进 `linx-interactive-run-router.ts`，update version check/notification 方法进 `linx-interactive-update-router.ts`，login UI selector/dialog 方法进 `linx-interactive-login-ui-router.ts`，interactive event/error 方法进 `linx-interactive-event-router.ts`，runtime Pod session mutation 进 `linx-interactive-runtime-host.ts`，custom header mutation 进 `linx-interactive-header-host.ts`，streaming message cleanup 进 `linx-interactive-streaming-message-host.ts`，terminal-title/rendering patch 进 shell rendering seam，editor component rebinding 进 `linx-editor-component-router.ts`，extension UI context augmentation 进 `linx-extension-ui-context-router.ts`，session work control 进 `linx-session-work-control.ts`，session thinking capability 进 `linx-session-thinking-capability-router.ts`，session metadata read 进 `linx-session-metadata.ts`，session/runtime cwd mutation 进 `linx-session-cwd-router.ts`，stop/submit/input/session patch 进各自 router；feature 模块不要直接包 Pi 方法。
- Pi session history / branch / clean-session materialization / context rebuild 是 shell session-history seam，不是 login、rewind、auth recovery 等 feature 模块的私有逻辑。需要重试、回滚、列出可回滚用户消息、恢复 active branch、创建 clean rewind session、计算 abandoned entries、重建 `agent.state.messages` 时，feature 模块只能调用命名 seam helper，不能直接访问 `session.sessionManager`、`getBranch`、`resetLeaf`、`createBranchedSession`、`buildSessionContext` 等 Pi 内部形状。
- session id/name/cwd 读取也是 shell metadata seam：resume/exit copy、welcome/header、statusline、extension context、Symphony status 等只展示 shell 元数据的模块必须走 `linx-session-metadata.ts`；Pi session id 只代表本地 runtime archive，不是 Pod Chat/Thread 身份。
- 只有 session-manager 构造/启动规划、`linx-session-metadata.ts`、`linx-session-history.ts`、runtime archive 诊断、Pod mirror / session-control 这类明确桥接 Pi archive 的模块可以直接接触 `sessionManager`；其他 feature/rendering 模块需要新能力时先补 seam 和 boundary test。
- shell/core 边界坏味道要按 `docs/linx-shell-core-design.md` 的 checklist 处理：不要新增第二套 Pi/backend 命令词汇；command-shaped 顶层输入必须在 login/Pod/interactive 副作用前 admission；feature/rendering 模块不得直接读写 Pi mutable internals 或 `__linx*` 隐藏字段；runtime archive identity 不得上升为 Pod Chat/Thread/Contact/backend credential 身份；隐藏诊断入口不能成为普通用户工作流。
- 新增或调整 shell/core 边界时，同一变更必须更新 `docs/linx-shell-core-design.md`；功能文档只记录用户可见契约，不重新定义 shell/core 权责。

## Skill Routing

当用户请求明显匹配 gstack skill 时，先走 skill，再决定是否直接编码。

- 产品想法、定位、是否值得做 → `office-hours`
- 架构/执行方案评审 → `plan-eng-review` / `plan-ceo-review`
- Bug、报错、回归、根因分析 → `investigate`
- QA、验证流程、找问题 → `qa`
- 发版、提 PR、推送、部署 → `ship`

Skill source of truth:

- repo-local: `.agents/skills/gstack/`
- fallback: `~/.codex/skills/gstack/`

## Guide Routing

- LinX shell/core 建模、事实归属、壳层与共享 core 分工 → 先读 `docs/linx-shell-core-design.md`。这类原则文档只讲模型，不讲功能。
- local-first runtime 接入共享 core、source/target/authority/plane 同步建模 → 先读 `docs/local-first-pod-sync.md`。这类原则文档只讲同步语言，不讲具体资源。
- 具体产品功能、命令行为、状态机、验收和测试 → 写在该功能自己的文档，不回填到原则文档。
- Symphony 系统演进控制平面、系统态势、演进判断、执行控制、证据回流 → 先读 `docs/symphony-system-evolution-control-plane.md`。这类文档只讲 Symphony 第一性原理，不替代具体功能契约。
- 外部项目、竞品、参考实现的持续跟踪 → 先读 `docs/external-project-watchlist.md`；已吸收的详细参考再看 `docs/external-references.md`。
- 依赖、升级、版本、发版、打包、workspace、npm、yarn lock、`xpod`、`models`、`drizzle-solid` → 先读 `docs/dependency-guide.md`。
- Solid/RDF/Pod 数据建模、URI/id、schema、vocab、repository、collection → 先读 `docs/cli-app-shared-core.md`，必要时再用 `solid-modeling` skill。
- Pod 交互分层、collection / use-case / models / ORM / service 边界 → 先读 `docs/pod-interaction-layering.md`。
- UI 视觉、组件分层、样式规范 → 先读 `docs/ui-style-guide.md` 和 `docs/ui-component-architecture.md`。

## Doc Map

Modeling principles:

- `docs/linx-shell-core-design.md` — LinX shell/core 建模、事实归属和 local-first 边界原则，不承载功能契约
- `docs/local-first-pod-sync.md` — local-first runtime 接入共享 core 的 source/target/authority/plane 同步模型，不承载资源细节
- `docs/cli-app-shared-core.md` — `@undefineds.co/models` 共享数据面、client/auto-mode helper 与 CLI/App 边界
- `docs/pod-interaction-layering.md` — Pod 交互分层 spec，定义 collection、shared use-case、models、drizzle-solid、service 的职责边界

Feature contracts:

- `docs/cli-login-and-key-principles.md` — CLI 登录、provider key 获取、Pod AI config 存储与 backend runtime 消费边界
- `docs/login-modal-local-binding-spec.md` — 桌面/Web 紧凑登录弹窗、记住账号、undefineds Cloud/Local 绑定与 Local provisionCode 分流契约
- `docs/cli-status-line.md` — CLI TUI footer/statusline 的可配置 token、配置优先级和默认显示契约
- `docs/approval-grant-design.md` — approval/grant 统一流水线、grant scope、auto 与 Secretary 授权边界
- `docs/symphony-system-evolution-control-plane.md` — Symphony 作为系统演进控制平面的第一性原理，覆盖系统态势、演进判断、执行控制和证据回流
- `docs/secretary/auto-symphony-contract.md` — `/auto` 单开关、backend approval 分离、Symphony 委派边界
- `docs/secretary/symphony-worker-goal-control-spec.md` — Symphony worker goal 控制面、Codex/ACP 桥接、Pod 持久化与 Web/CLI/TUI 共享 use-case 边界
- `docs/xpod-cli-spec.md` — xpod CLI 的 Pod 文件/RDF/jsonl/secret/approval 能力边界，与 `udfs` 建模 CLI 分工
- `docs/dependency-guide.md` — 依赖升级、workspace/npm 版本、`xpod`/`models` 联动与 models 独立发布规则
- `docs/external-project-watchlist.md` — 外部项目持续跟踪清单，记录观察状态、证据、复查信号和是否需要沉淀到功能文档
- `docs/desktop-product-strategy.md` — 桌面端 Chat-first + AI-native 产品策略
- `docs/secretary/README.md` — AI Secretary 能力设计入口，包括存储建模、授权判断和用户请示边界
- `docs/agent-collaboration-model.md` — Secretary 多工作现场、群聊、跨会话投递、auto 模式与 TUI 共用模型
- `docs/scene-restoration-solid-modeling.md` — `favorites / inbox / audit / workspace` 的场景恢复与 Solid 建模约束
- `docs/chat-module-alignment.md` — Chat 模块对齐状态与待修复项
- `docs/ui-component-architecture.md` — 纯 UI / 逻辑 UI 分层
- `docs/service-layer-guide.md` — Collection 与 service 的职责边界
- `docs/ui-style-guide.md` — 视觉与样式规范
- `docs/architecture-comparison.md` — LinX 与外部参考产品的架构对比
- `docs/external-references.md` — 参考实现入口
- `docs/secretary/taste/` — 主理人 taste 能力域：benchmark 全景、记忆方法论对比与选型

## Working Heuristics

- 优先复用已有实现，不平行重写已有登录、启动、授权、会话、桌面壳逻辑。
- 改动保持小而完整；修根因，不做表面补丁。
- 先完成一个功能板块到“可测可用”，再展开下一个板块。
- 有建模分歧时，按 Solid 叙事和现有 predicate/community vocabulary 先收敛，再扩展。
