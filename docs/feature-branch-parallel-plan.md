# LinX 特性分支并发实施计划（微应用 + 横向能力）

> 更新时间：2026-02-10
> 适用范围：Chat / Contact / Session / Files / xpod 集成 / MCP / Automation

## 1. 目标

将原先以 6 个分支为主的串行方案，调整为“微应用拆分 + 横向能力拆分”的并行方案：

- 提升并发度（目标峰值 6，理想峰值 8）
- 缩短关键路径（避免 `1 → 2/4 → 5 → 6` 长链）
- 把依赖从“分支依赖”改为“契约依赖”

## 2. 拆分原则

### 2.1 微应用优先

按业务域拆分，而不是按技术大块拆分：

- Chat 微应用
- Contact 微应用
- Session + Files 微应用

### 2.2 Web / Mobile 双端 UI 解耦

Web 与 Mobile 端 UI 单独分支开发：

- 共享：类型、契约、状态机、数据访问适配层
- 分离：布局、交互细节、端能力适配

### 2.3 xpod 相关能力横向拆分

把 xpod 相关依赖从业务分支抽出来，形成独立并行车道：

- xpod client core
- sidecar collector
- MCP bridge
- automation runtime

### 2.4 Schema 渐进收敛

Schema 不要求一次性定稿，采用三阶段：

1. Draft：先冻结最小字段/事件（允许扩展位）
2. Adapter：通过 adapter 兼容旧数据/旧接口
3. Freeze：进入 MCP bridge 前统一冻结并确定 migration

## 3. 分支清单（新版）

| # | 分支 | 类型 | 依赖 | 主要交付 | 文档 |
|---|---|---|---|---|---|
| 1 | `feat/contracts-chat-contact` | 横向契约 | 无 | chat/contact/session 最小字段与 adapter 接口 | [Link](./feature-plan/wave-a/01-contracts-chat-contact.md) |
| 2 | `feat/contracts-sidecar-events` | 横向契约 | 无 | collector/mcp/automation 事件模型（含 version） | [Link](./feature-plan/wave-a/02-contracts-sidecar-events.md) |
| 3 | `feat/xpod-client-core` | 横向能力 | 无 | xpod/sidecar typed client、auth、重试、流式封装 | [Link](./feature-plan/wave-a/03-xpod-client-core.md) |
| 4 | `feat/web-chat-ui` | 微应用（Web） | 1,3 | Web Chat UI（含 group chat 视图） | [Link](./feature-plan/wave-b/04-web-chat-ui.md) |
| 5 | `feat/mobile-chat-ui` | 微应用（Mobile） | 1,3 | Mobile Chat UI（会话、消息、输入） | [Link](./feature-plan/wave-b/05-mobile-chat-ui.md) |
| 6 | `feat/web-contact-ui` | 微应用（Web） | 1 | Web Contact 协作与群组交互 | [Link](./feature-plan/wave-b/06-web-contact-ui.md) |
| 7 | `feat/mobile-contact-ui` | 微应用（Mobile） | 1 | Mobile Contact 列表/详情/关联会话 | [Link](./feature-plan/wave-b/07-mobile-contact-ui.md) |
| 8 | `feat/web-session-files-ui` | 微应用（Web） | 1,3 | Project Session + Files Web 壳层与数据入口 | [Link](./feature-plan/wave-b/08-web-session-files-ui.md) |
| 9 | `feat/mobile-session-control-ui` | 微应用（Mobile） | 1,2,3 | Mobile 端会话控制（轻量控制面） | [Link](./feature-plan/wave-b/09-mobile-session-control-ui.md) |
| 10 | `feat/cli-collector` | 运行时能力 | 2,3 | xpod sidecar CLI 数据采集与落库 | [Link](./feature-plan/wave-b/10-cli-collector.md) |
| 11 | `feat/mcp-bridge` | 运行时能力 | 2,8,9,10 | MCP 桥接协议与跨端会话控制 | [Link](./feature-plan/wave-c/11-mcp-bridge.md) |
| 12 | `feat/automation` | 运行时能力 | 2,11 | 触发规则 + AI 自治执行（含安全闸） | [Link](./feature-plan/wave-d/12-automation.md) |
| 13 | `feat/favorites-hub` | 新增板块（微应用） | 1 | 收藏中心一级入口（平铺 + 搜索），通过 hooks 聚合各模块标星 | [Link](./feature-plan/wave-b/13-favorites-hub.md) |
| 14 | `feat/import-center` | 新增板块（更多菜单） | 1,3 | 侧边栏“更多 > 导入数据 > 数据库导入(SQLite)” + 映射配置 + 周期导入 | [Link](./feature-plan/wave-c/14-import-center.md) |

### 3.1 新增板块设计摘要

- **Favorites Hub（13）**：作为一级微应用入口，提供跨模块标星内容的平铺与搜索；数据通过模型 hooks 自动上报到 favorite 索引。
- **Import Center（14）**：位于侧边栏底部“更多”二级入口，数据库导入为第一工具；MVP 支持 SQLite（无密码 / 密码）。
- **插入节奏**：Favorites 放入 Wave B（UI 与 hooks 聚合）；Import Center 放入 Wave C（导入配置 + 调度执行 + 运行记录）。


## 4. 并发批次（建议）

### Wave A（基础层，3 并发）

- `feat/contracts-chat-contact`
- `feat/contracts-sidecar-events`
- `feat/xpod-client-core`

### Wave B（业务层，8 并发峰值）

- `feat/web-chat-ui`
- `feat/mobile-chat-ui`
- `feat/web-contact-ui`
- `feat/mobile-contact-ui`
- `feat/web-session-files-ui`
- `feat/mobile-session-control-ui`
- `feat/cli-collector`
- `feat/favorites-hub`

### Wave C（集成层，2 并发）

- `feat/mcp-bridge`
- `feat/import-center`

### Wave D（自治层，1 并发）

- `feat/automation`

> 人力不足时可降级为“最低 3 并发”：
> Chat（Web/Mobile 合并）、Contact（Web/Mobile 合并）、Session+Files+Collector 合并。

## 5. 旧方案映射

| 原分支 | 新分支映射 |
|---|---|
| `feat/group-chat-model` | `feat/contracts-chat-contact` + `feat/web-chat-ui` + `feat/mobile-chat-ui` + `feat/web-contact-ui` + `feat/mobile-contact-ui` |
| `feat/project-session` | `feat/web-session-files-ui` + `feat/mobile-session-control-ui` |
| `feat/mobile-responsive` | 拆分吸收进各 mobile UI 分支 |
| `feat/cli-collector` | 保留，增加契约依赖（`contracts-sidecar-events`） |
| `feat/mcp-bridge` | 保留，改为依赖 session/files UI 与 collector 的可用能力 |
| `feat/automation` | 保留，增加事件契约与安全闸门要求 |
| 新增板块：Favorites Hub | 新增 `feat/favorites-hub`（一级微应用入口，hooks 聚合标星） |
| 新增板块：Import Center | 新增 `feat/import-center`（更多菜单二级入口，MVP SQLite 导入） |

## 6. 统一门禁（DoD）

每个分支至少满足：

1. 契约测试：字段/事件 schema 校验通过
2. 集成测试：与 xpod client 或 collection adapter 的 happy path 可跑通
3. 演示路径：最小可操作链路可手工验证
4. Feature Flag：未完成功能默认可关闭，不阻塞主干
5. 文档更新：接口与状态流变更写入对应 docs

## 7. 合并策略

- 小步快跑：每个分支优先提交“契约 PR”与“功能 PR”两段
- 主干保护：禁止未通过契约测试的跨分支合并
- Freeze 节点：`feat/mcp-bridge` 开始前执行一次 schema freeze 审查


## 8. 文档组织（总文档 + 特性文档）

为保证“每个特性一个文档、阶段清晰、依赖清晰、分段回 main 清晰”，文档结构如下：

- 总览文档（本文件）：`/Users/ganlu/develop/linx/docs/feature-branch-parallel-plan.md`
- 特性执行文档（每个特性一份）：`/Users/ganlu/develop/linx/docs/feature-plan/wave-*/*.md`
- Wave A：`/Users/ganlu/develop/linx/docs/feature-plan/wave-a/*.md`
- Wave B：`/Users/ganlu/develop/linx/docs/feature-plan/wave-b/*.md`
- Wave C：`/Users/ganlu/develop/linx/docs/feature-plan/wave-c/*.md`
- Wave D：`/Users/ganlu/develop/linx/docs/feature-plan/wave-d/*.md`

每个分支文档统一包含：

1. 目标与范围
2. 入依赖 / 出依赖
3. Phase 0/1/2 分阶段计划
4. 代码集中回 main 的检查点（CP0/CP1/CP2）
5. 分支 DoD

## 9. 代码集中点（部分代码先回 main）

为了提升并发、降低长分支冲突，约定每个特性必须分三次回 main：

- CP0：先回契约、类型、骨架；不改默认入口
- CP1：回可运行主链路；必须由 Feature Flag 控制
- CP2：回默认入口切换和旧逻辑清理；附回滚策略

该规则已在每个分支文档中单独落地，可直接作为 PR gate 使用。

## 10. 并发开发测试保障（必须执行）

并发开发采用“契约先行 + 分层测试 + 合并闸门”三层保障，避免分支间互相踩踏。

### 10.1 测试分层

1. **L0：契约层（Wave A 基线）**
   - 覆盖对象：`contracts-chat-contact`、`contracts-sidecar-events`、`xpod-client-core`
   - 必测项：schema 校验、事件版本兼容、typed client 错误码一致性
   - 目标：任何消费方分支都可基于稳定契约并行开发

2. **L1：特性层（每个分支自测）**
   - 必测项：unit + integration + happy-path e2e（最小链路）
   - 要求：测试可在 feature flag 开启和关闭两种模式下运行

3. **L2：跨分支联调层（Wave 交界）**
   - Wave A → B：契约兼容回放 + web/mobile + favorites smoke
   - Wave B → C：session/files/control/collector + import-center 联调 e2e
   - Wave C → D：mcp→automation 端到端回放

### 10.2 CI 流水线（建议最小集合）

- `ci:fast`（每个 PR 必跑，<=10 分钟）
  - lint + typecheck + unit + contract tests
- `ci:feature`（分支必跑）
  - 本分支 integration + 最小 e2e + feature flag on/off 校验
- `ci:wave`（Wave 合流前必跑）
  - 跨分支 smoke matrix（至少覆盖所有入依赖）
- `ci:nightly`（每日）
  - 全量 e2e + 回归 + 关键性能基线（仅监控，不阻塞白天 PR）

### 10.3 合并闸门（CP0/CP1/CP2）

- **CP0 Gate**（契约回 main）
  - 契约测试 100% 通过
  - schema diff 无未声明 breaking change
  - 提供兼容 fixture

- **CP1 Gate**（可运行链路回 main）
  - feature flag 默认关闭
  - 本分支最小 e2e 通过
  - 至少 1 个下游消费方 smoke 通过

- **CP2 Gate**（默认入口切换）
  - 跨端（web/mobile）回归通过
  - 可观测性与错误告警可用
  - 回滚预案已演练（切回 flag 或旧入口）

### 10.4 分支间“测试契约”要求

每个特性文档必须补充并维护：

- `Test Owner`：谁负责修测试红灯
- `Required Suites`：该分支必须通过的测试集合
- `Upstream Contract Version`：依赖契约版本号
- `Downstream Smoke`：至少一个下游验证场景

> 规则：契约版本变更后，必须先更新 fixture，再放行消费方分支合并。

### 10.5 Wave 测试节奏（单测优先，集成统一）

在并发期允许采用“Wave 内轻量、Wave 收口重型”的节奏：

- **PR / 日常提交**：以 `unit + contract + 最小 smoke` 为主，快速反馈
- **Wave 内进行中**：可不跑全量集成，但必须保留 1~3 条 Docker 冒烟链路
- **Wave 收口点**：统一执行该 Wave 全量集成测试（Docker）
- **Nightly**：每天至少 1 次跨 Wave 全量集成测试（Docker）
- **主干切流前（CP2）**：必须通过跨端全量集成 + 关键 e2e

> 结论：可以“每个 Wave 先跑单测再统一做集成”，但不能跳过 Wave 冒烟与收口全量集成。

### 10.6 AI 托管修复（Integration Bugfix Agent）

默认策略：**Integration bugfix 由 AI 自动闭环处理**，人工仅在“决策闸门”介入。

- **AI 默认自动执行**
  - 复现失败、收集日志、定位回归提交
  - 提交候选修复补丁与测试补丁
  - 在隔离分支反复重跑集成测试直至通过

- **仅以下情况需要人工介入（决策闸门）**
  - 更改数据契约（schema / event version）
  - 关闭或跳过测试（skip/xfail）
  - 调整默认入口、Feature Flag 默认值
  - 任何可能影响线上行为或安全边界的配置变更

- **强制审计要求**
  - 每次 AI 修复需附：根因、修改点、影响面、回滚方案
  - 关联失败用例 ID 与修复提交 SHA
  - 不允许“只改测试让它通过”且无根因说明

> 结论：集成测试阶段不默认要求人工介入；人工只负责关键决策与风险把关。

## 11. 面向“AI 并发开发主用户”的交互闭环补齐

> 目标：让产品可稳定支撑“先分拆计划 → 多分支并发执行 → 集中审批与验收 → 收敛合并”。

### 11.1 集中审批入口（Inbox）

- 所有 `tool_approval` 事件必须落入统一 Inbox 队列（而不只停留在会话内卡片）。
- Web/Mobile 的审批卡片保留“就地处理”，但必须同步更新同一个 Inbox Item。
- Inbox 必须支持：按 `workspace / worktree / session / risk / agent` 过滤与批量处理。
- 推送通知点击后默认进入对应 Inbox Item 详情，而非只跳转 chat 消息。

### 11.2 审批权限继承（Agent@workspace → worktree thread）

- 权限策略以 `Agent@workspace` 为源配置（继承链根节点）。
- worktree 作为新的 thread 创建时，默认挂载同一个 `policyRef`（策略文件引用）。
- worktree thread 可做局部覆盖（例如更严格的命令白名单），但不得突破 workspace 上限。
- 继承与覆盖必须记录 `policyVersion` 与来源 `policyRef`，用于审计回放。

### 11.3 SecretaryAI 内置角色（后续内建）

- SecretaryAI 可在授权范围内替代人工处理部分审批（Delegated Approval）。
- 1v1 托管模式：SecretaryAI 可执行验收、审批、回归触发与结果汇总。
- Group 协作模式：SecretaryAI 负责上下文路由（用户问题分发给合适 workerAI）。
- 多 AI 协同模式：当 workerAI 请求协助时，SecretaryAI 负责二次分派与上下文隔离。

### 11.4 强制审计（人/AI 决策同标准）

- 每次审批都必须记录：`decisionBy`（审批者 WebID）、`decisionRole`（human/secretary/system）、`onBehalfOf`、`reason`、`timestamp`。
- 每次委托审批必须记录：委托策略、命中规则、原始风险级别、最终决策。
- 审计记录与测试修复记录统一可追踪到：用例 ID / sessionId / 提交 SHA。

### 11.5 分支落位（谁负责实现）

- `feat/contracts-chat-contact`：补齐 thread 级 `policyRef` 继承字段与审批审计字段。
- `feat/contracts-sidecar-events`：定义 Inbox 事件与 Delegated Approval 事件模型。
- `feat/xpod-client-core`：扩展 SDK（Inbox 订阅、带 actor 的审批命令）。
- `feat/web-chat-ui` + `feat/mobile-session-control-ui`：接入 Inbox 审批流与 SecretaryAI 托管入口。
- `feat/mcp-bridge`：落地权限继承校验、Inbox API、SecretaryAI 路由执行。
- `feat/automation`：落地 SecretaryAI 策略编排与审计查询。
