# LinX Agent Guide

这个文档是 AI agent 在 LinX 仓库中的统一入口。`AGENTS.md` 和 `CLAUDE.md` 只保留这个链接，避免根文件继续膨胀。

## Mandatory Rules

- `@undefineds.co/models` 是共享数据面权威源；`apps/*` 不得重新定义跨端业务语义。
- 涉及依赖升级、submodule、npm/workspace 版本、发版产物、`xpod` 或 `models` 联动时，先读 `docs/dependency-guide.md`。
- `packages/models` submodule 必须锁到与 `packages/models/package.json` 版本一致的精确 tag。
- 结构化 Pod 数据必须走 `drizzle-solid` + schema/repository/collection 路径；不要在 React 组件里直接写 `getSolidDataset`。
- 查询失败时先修 repository / schema / permissions / SPARQL，不做 UI fallback 掩盖问题。
- 涉及 Pod 登录、持久化、权限、通知的集成测试，必须跑在自举的 `xpod` + 真实 Pod 上。
- 模块状态分工：Pod 数据走 TanStack DB Collection；Zustand 只管理纯 UI 状态。
- 新增共享规则、RDF contract、归一化逻辑、跨端 use-case 时，优先放进 `@undefineds.co/models`。
- `Table` 到 `Resource` 的语义迁移按功能边界推进：改到哪个 Pod/ORM 功能，就把该功能的命名、测试和文档叙事同步改成 `Resource`；不要为了“统一”做全仓机械重命名，底层兼容 API 可继续保留 `Table`。

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

- 依赖、升级、版本、发版、打包、submodule、workspace、npm、yarn lock、`xpod`、`models`、`drizzle-solid` → 先读 `docs/dependency-guide.md`。
- Solid/RDF/Pod 数据建模、URI/id、schema、vocab、repository、collection → 先读 `docs/cli-app-shared-core.md`，必要时再用 `solid-modeling` skill。
- UI 视觉、组件分层、样式规范 → 先读 `docs/ui-style-guide.md` 和 `docs/ui-component-architecture.md`。

## Doc Map

- 登录/存储文档归属：`docs/login-identity-storage-routing-model.md` 是 IDP/SP、注册绑定、`solid:storage` 和业务写入的唯一主文档；`docs/local-sp-domain-and-tunnel.md` 是 Local canonical URL、canonical domain 策略、localhost/LAN/tunnel 的唯一主文档。其他文档只能引用或记录本文件职责，不要重新定义这两套语义。
- `docs/cli-app-shared-core.md` — `@undefineds.co/models` 共享数据面、client/auto-mode helper 与 CLI/App 边界
- `docs/cli-login-and-key-principles.md` — CLI 登录、provider key 获取、Pod AI config 存储与 backend runtime 消费边界
- `docs/dependency-guide.md` — 依赖升级、workspace/npm 版本、`xpod`/`models` 联动与 submodule 锁定规则
- `docs/login-identity-storage-routing-model.md` — 登录 IDP/SP、注册绑定、`solid:storage` 与业务写入边界主文档
- `docs/local-sp-domain-and-tunnel.md` — Local canonical URL、canonical domain 策略、localhost/LAN/tunnel 主文档
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

## Working Heuristics

- 优先复用已有实现，不平行重写已有登录、启动、授权、会话、桌面壳逻辑。
- 改动保持小而完整；修根因，不做表面补丁。
- 先完成一个功能板块到“可测可用”，再展开下一个板块。
- 有建模分歧时，按 Solid 叙事和现有 predicate/community vocabulary 先收敛，再扩展。
