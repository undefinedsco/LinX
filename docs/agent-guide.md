# LinX Agent Guide

这个文档是 AI agent 在 LinX 仓库中的统一入口。`AGENTS.md` 和 `CLAUDE.md` 只保留这个链接，避免根文件继续膨胀。

## Mandatory Rules

- `@undefineds.co/models` 是共享数据面权威源；`apps/*` 不得重新定义跨端业务语义。
- 结构化 Pod 数据必须走 `drizzle-solid` + schema/repository/collection 路径；不要在 React 组件里直接写 `getSolidDataset`。
- 查询失败时先修 repository / schema / permissions / SPARQL，不做 UI fallback 掩盖问题。
- 涉及 Pod 登录、持久化、权限、通知的集成测试，必须跑在自举的 `xpod` + 真实 Pod 上。
- 模块状态分工：Pod 数据走 TanStack DB Collection；Zustand 只管理纯 UI 状态。
- 新增共享规则、RDF contract、归一化逻辑、跨端 use-case 时，优先放进 `@undefineds.co/models`。

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

## Doc Map

- `docs/cli-app-shared-core.md` — `@undefineds.co/models` 共享数据面、client/watch helper 与 CLI/App 边界
- `docs/desktop-product-strategy.md` — 桌面端 Chat-first + AI-native 产品策略
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
