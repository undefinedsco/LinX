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
- `Table` 到 `Resource` 的语义迁移按功能边界推进：改到哪个 Pod/ORM 功能，就把该功能的命名、测试和文档叙事同步改成 `Resource`；不要为了“统一”做全仓机械重命名，底层兼容 API 可继续保留 `Table`。
- 命名只在跨包公共 API、外部冲突边界、LinX Cloud 产品语义和品牌展示上使用 `Linx` 前缀；CLI/TUI 内部通用概念、helper、状态和 adapter 局部类型不要因为位于 LinX 仓库里重复加 `Linx` / `LinxPi` 前缀。

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
- UI 视觉、组件分层、样式规范 → 先读 `docs/ui-style-guide.md` 和 `docs/ui-component-architecture.md`。

## Doc Map

Modeling principles:

- `docs/linx-shell-core-design.md` — LinX shell/core 建模、事实归属和 local-first 边界原则，不承载功能契约
- `docs/local-first-pod-sync.md` — local-first runtime 接入共享 core 的 source/target/authority/plane 同步模型，不承载资源细节
- `docs/cli-app-shared-core.md` — `@undefineds.co/models` 共享数据面、client/auto-mode helper 与 CLI/App 边界

Feature contracts:

- `docs/cli-login-and-key-principles.md` — CLI 登录、provider key 获取、Pod AI config 存储与 backend runtime 消费边界
- `docs/approval-grant-design.md` — approval/grant 统一流水线、grant scope、auto 与 Secretary 授权边界
- `docs/symphony-system-evolution-control-plane.md` — Symphony 作为系统演进控制平面的第一性原理，覆盖系统态势、演进判断、执行控制和证据回流
- `docs/secretary/auto-symphony-contract.md` — `/auto` 单开关、backend approval 分离、Symphony 委派边界
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
