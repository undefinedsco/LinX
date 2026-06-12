# Agent Collaboration Model

## 目标

LinX 要支持一个用户 Pod 里只有一个默认 `AI Secretary`，但它可以在多个工作现场同时推进任务。

这个模型覆盖：

- 同一个 Secretary 在多个 `Thread / Session / Workspace` 中工作。
- 一个目录下运行多个 Agent/worker。
- 群聊、私聊、跨会话沟通。
- auto 模式下的自动分治、派发、上升。
- Web、Desktop、TUI 共用同一套 Pod 和 runtime 语义。

## 核心结论

`Secretary` 是用户在系统里的操作分身和长期配置根，不是每个工作组复制一份。

## 已锁定决策：群 Reconciler 与 Thread

LinX 的群协作不建成“成员直接唤醒成员”的网状模型，而是统一走
`Chat -> Thread -> Reconciler -> Scheduler -> Run`。

- `Chat` 是长期可分组的协作空间，回答“和谁/什么在聊”。
- `Thread` 是 Chat 下的一条具体工作现场和时间线，回答“这件事在哪里发生”。
- `ThreadBus` 只负责 append / subscribe，不做语义判断。
- `Reconciler` 是程序控制器，观察 Thread 里的 Message、ControlEvent、InboxNotification/control resource、Delivery、schedule tick，去重、分类、应用 Thread policy，并生成或跳过 WakeJob。
- `Scheduler` 消费 WakeJob，处理锁、优先级、重试、超时，并启动对应 Agent Runtime / Run。
- `Secretary` 是 Thread 内的重要 agent 角色，不是 Reconciler。Reconciler 可以唤醒 Secretary；Secretary 再做意图判断、审批代理、worker steering、验收或上升。

`WakeJob` 是 Reconciler 生成的内存态唤醒意图，不是 Pod 资源，也不进入共享模型。持久事实只记录 Thread 事件、Delivery、Approval/InputRequest、Run、RunStep 和对应 Evidence；Scheduler 可以把 WakeJob 物化为 `Run(status=queued/running/...)`，但不能把 WakeJob 队列本身当成权威状态。

默认流转：

```text
Message / ControlEvent / InboxNotification or linked control resource / Delivery appended to Thread
  -> Reconciler classifies and applies Thread policy
  -> Scheduler starts selected Agent Runtime
  -> Agent output appends back to Thread
```

`auto` 和 Symphony worker Thread 复用同一条路径：当 runtime 需要 input、approval 或 blocker 处理时，事件先落到当前 Thread；Reconciler 唤醒同 Thread 的 Secretary；Secretary 在 policy 内处理，处理不了才进入 Inbox/控制态等待用户或上级 Secretary。

跨端上升不靠 worker 直接唤醒某个 Secretary。未解决的 approval/input/blocker 写入 Pod control resource，并通过 `/inbox/` 下的 `InboxNotification` envelope 通知所有活跃 client。每个 client 都可以刷新 Inbox 和展示 badge/toast；只有具备本地 Secretary runtime、符合 presence/policy、并成功通过 `leaseOwner` / `leaseExpiresAt` claim linked control resource 的 client 才能实际唤醒 Secretary 处理。claim 失败的 client 只展示，不处理。这样用户在 Web/Desktop/TUI 任一端活跃时都能看到请求，同时避免多个端重复回答 worker。

`Delivery` 不是普通聊天、steer、approval/input request 的通用运输层。普通问题、回答、纠偏、checkpoint 都是 Message 或 ControlEvent。Delivery 只用于阶段边界：任务派发包、异步交接、最终报告、patch/artifact/evidence/risk package、需要验收的结果包。

周期性任务也不是特殊执行容器。Schedule 只周期性地产生 `schedule.tick` ControlEvent；tick 进入稳定的 schedule main Thread，由 Reconciler 决定是在原 Thread 内处理，还是分裂出 child execution Thread。

## 已锁定决策：Secretary 承接用户依赖

LinX 的 runtime/worker 不直接面对用户做确认或索取输入。所有“需要用户”的阻塞点统一交给 `Secretary` 处理：

- 如果请求落在当前 `autoPolicy` / `delegatedAuthority` 内，Secretary 直接代用户确认、代用户填写、代用户继续推进。
- 如果请求超出 policy、预算、风险或可推导范围，Secretary 才把它投影成用户可见的 Inbox / Approval / InputRequest。
- 用户回答后，仍由 Secretary 把答案写成结构化 `DelegatedResponse`，再由 runtime adapter 投影回目标 backend。
- Pod timeline 不伪造 `UserMessage`。Secretary 代办时仍写 `AssistantMessage`，`maker` 就是 Secretary。
- runtime backend 如果要求 `user` 或 `tool` role，只能由 `Delivery.projection` / runtime adapter 层转换，不能改变 Pod 里的真实 maker。

因此，Secretary 是 LinX 产品层的“人类依赖适配器”：

```text
Codex / worker blocks on approval or input
  -> runtime adapter creates Approval/InputRequest/Delivery
  -> Secretary evaluates policy and context
  -> Secretary writes AssistantMessage + DelegatedResponse
  -> adapter replies to runtime as backend-required user/tool response
```

第一版实现时，任何 worker/session 出现“等待用户”的状态，都应该先落到 Secretary 工作队列，而不是直接弹给用户。只有 Secretary 判断无法代理时，才进入用户 Inbox。

## MVP 取舍

第一版不自研完整 agent runtime，也不做超过当前数据模型的后台任务产品。

架构层参考 Symphony：

- `Issue` 是用户/产品可见的工作项，承载需求、bug、调查和支持事项。
- `Task` 是已有的通用可执行工作单元；Symphony 只能引用 Task，不能另起一套 `TaskRecord`。
- `Issue.tasks` 只能保存 Task URI reference；不能新增 `taskRefs`、`taskIds` 或 Symphony 专属 task row。
- `Workspace/worktree` 是任务执行现场。
- `Session` 是一次 runtime 生命周期。
- `Report` 是任务完成后的上升和验收入口；`Evidence` 记录测试、日志、diff、Pod 投影、用户验证、review finding 等支撑事实。

建模硬约束：

- Shared Pod resource 和本地 RDF/JSON-LD mirror 使用语义 URI 字段：`issue`、`task`、`delivery`、`session`、`chat`、`thread`。
- `issueId`、`taskId`、`deliveryId`、`sessionId`、`chatId`、`threadId` 只允许出现在 UI 选中态、CLI 参数、本地文件 key、runtime wire protocol 或只读兼容迁移层中，不能作为持久关系字段；只要这些值用于关联 Pod 资源，就必须进入同步账本 metadata 的 `resourceBindings.{name}.local`，并和 `resourceBindings.{name}.uri` 放在同一条边上。
- 同步账本 metadata 是本地/app-scoped 恢复材料，必须按 `source` 或 app namespace 分开；不要把某个 app 的同步 metadata 写回 `Issue / Task / Chat / Message` 等共享业务资源。
- 本地 cache 文件夹名可以从 URI 派生短 key；LinX 共享事实的持久镜像应来自 Pod RDF 的 JSON-LD，而不是另一套业务 JSON schema。
- LinX 项目内的编排 API 不需要重复 `Linx` 前缀，例如使用 `createRunPlan` / `SymphonySessionRecord`，不要新增 `createLinxSymphonyRunPlan` 或 `LinxSymphonyTaskRecord`。

产品入口上，`Symphony` 不是独立产品，也不是一个新的 worker。它是 `AI Secretary` 的内置委派/编排能力：

- 用户感知的是 Secretary 能不能把活派给下面的人干。
- `/symphony on|off|status` 用来调整或检查 Secretary 的委派行为、任务切分、worker 投影和状态归档。
- TUI 里的 `/symphony` 是主入口：无参数或 `on` 时切换当前 Secretary 会话进入委派模式，`status` 查看状态，`off` 回到普通聊天；该命令不投递给 Codex/Claude/CodeBuddy backend。
- Objective 必须来自用户正常发送的聊天消息；`/symphony` 不接收一次性 objective，也不把 slash 参数预填或伪造成用户输入。
- Symphony 是一组可共享的产品编排 skills：Secretary runtime 用它做 issue triage、现有 Issue 查重、create/update/ask 决策、task split、worker dispatch、status/report tracking；Codex/Claude 等 coding agent 在实现或验证 LinX Symphony 时也使用同一套 skill，避免产品运行时和工程实现各自发明一套模型。
- 普通对话只记录为 `Message`，不能因为 `/symphony` 开启就把每句话都变成 `Issue`。只有可跟踪工作项才进入 Issue 生命周期。
- 创建新 Issue 前必须先比较当前 open Issues；明显同一个工作项时更新原 Issue，是否新建不明确时由 Secretary 向用户追问。
- `Symphony` 是 Secretary 的全局控制面，不绑定从哪个 Chat/Thread 发起；在哪个界面触发只提供来源上下文，不决定投递模型。
- Chat/Thread 是过程展示和回看载体，由 Secretary 在产品层创建或选择，并把对应 URI 写进 `Issue / Delivery / Session`。用户不需要选择或填写 Chat/Thread/Message URI，headless CLI 也不模拟这层产品上下文。
- 派活必须有一个目标 `Chat`：可以是某个 AI contact 的工作私聊，也可以是一个任务群聊。`Thread` 是这次派活在该 Chat 下的具体协作时间线和 workspace 分组，`Session` 只记录 backend runtime 生命周期。不要把派活永远写进固定控制室，也不要把 `Session` 当成 Chat。
- 不提供 `linx symphony` 或独立 `linx-symphony` 产品入口，避免把内置能力误解成另一个应用。

当前 CLI/TUI 落地策略：

- `/symphony` 触发后的派活必须先把过程投影到 Pod 的既有 `Chat / Thread / Message / Session / Agent / Contact` 资源，不能新增一套 Symphony 专属 UI 表。
- 有产品上下文时，`/symphony` 应投影到被委派对象对应的 Chat，并为该次派活创建或复用 Thread；没有显式目标时才回退到 `AI Secretary · Symphony` 控制室。
- planned/running/completed/failed 状态写成 Secretary 发出的 assistant message，message.richContent 带 `task_progress`，让 App 在运行中可见。
- planned/running/completed/failed 同时写 `Audit` 检查点：`symphony.planned`、`symphony.dispatched`、`symphony.completed`、`symphony.failed`。审计 entry 指向对应状态 message，session 指向通用 runtime Session，actor 是 AI Secretary，onBehalfOf 是用户 WebID。
- `Issue / Delivery / Session` 的本地缓存只能是 Pod/RDF mirror 或无 Pod recovery material；跨端回看和调试必须依赖 `chat / thread / messages` URI。
- Pod 投影失败只告警，不阻塞 worker 启动；本地 cache 是恢复和降级路径，不是共享事实源。
- Symphony 派发本身不创建 `Approval` 或 `Grant`。`Approval` 只在 Codex/Pi/Claude 等 backend 原生请求确认或结构化输入时产生；`Grant` 只在用户选择会话级/长期授权后由 auto-mode / AI Secretary 授权层物化为 LLM Wiki 文档。后台 worker 的审批、授权和对应审计继续复用 auto-mode 的 `approval / grant / audit / inbox_notification` 链路。

runtime 层先做半套，直接使用 Codex：

- LinX 负责 `Issue / Task reference / Thread / Workspace / Session / Delivery / Run / RunStep` 的持久化和产品语义。
- Codex 负责实际 coding runtime、工具调用、subagent/task thread、approval event。
- LinX adapter 只做必要桥接：投递输入、接收输出、处理 approval/input request、保存 projection。
- 不在 MVP 里复制 Codex 的完整 mailbox、guardian、subagent scheduler。

后台任务 UI 先不扩模型：

- 只新增 `Issue` 作为用户可见工作项，不引入 runner dashboard 或新的 background-agent resource。
- Web UI 只展示当前模型已经有的 `Issue / Task reference / Session / Delivery / Evidence / Report / Inbox`。
- TUI 可以先作为 headless 能力验证入口，而不是单独产品形态。
- 如果后续需要后台任务列表，也只能从现有 `Issue + Task + Session` 派生，不能反向创造一套新的 Task 模型。

MVP 落地顺序：

1. 不改 GUI，不改 TUI 信息架构。
2. 先实现后台主链路：`Issue -> Task reference -> Delivery -> Codex Session -> Run/RunStep -> Report/Inbox`。
3. worker 直接用 Codex；LinX 只负责发任务、管状态、存上下文、做投递和代理审批。
4. 用现有 TUI 验证 headless 能力：创建任务、查看 session/delivery、发送 follow-up、查看输出和 report、处理无法自动代理的 approval/input。
5. GUI/TUI 后续只消费已经稳定的数据模型，不反向驱动新增模型。

MVP 验收标准：

- 能从现有 TUI 创建一个任务，并由 LinX adapter 拉起或复用 Codex session。
- Codex 能收到投影后的任务输入并执行。
- runtime 输出能写回对应 Thread/Session。
- Codex 发出的 approval/input request 先进入 Secretary 处理链路。
- Secretary 可在 policy 内生成 `DelegatedResponse` 并回填给 Codex。
- Secretary 不能代理时，请求进入用户 Inbox，而不是 worker 直接等待用户。
- 任务完成后能生成结构化 `Report`，关联原 `Issue / Task / Session / Delivery / Run`，并引用支撑 `Evidence`。

## Backend multiple-agent 调研结论

Claude Code、Codex、OpenAI Symphony 和 Multica 都支持多 agent 工作流，但它们不是同一层模型。LinX 只能借鉴能力边界，不能把任何一个 backend 的 runtime 对象直接当成产品层 `Chat / Thread / Message`。

| 维度 | Claude Code Subagents | Claude Code Agent Teams | Codex Subagents | OpenAI Symphony | Multica |
| --- | --- | --- | --- | --- | --- |
| 核心定位 | 单个 Claude 会话里的专用子助手，用于隔离上下文和工具输出 | 多个 Claude Code session 组成一个临时团队 | Codex 主 agent fan-out 多个子 agent，再 fan-in 汇总 | 长跑 daemon，把 issue tracker 变成 coding agents 的控制面 | 人类 + agent 共用的任务协作平台，把 coding agents 变成 workspace teammate |
| 工作单位 | 一次 delegated task | shared task list 里的 task | parent prompt 拆出的 subtask 或批处理项 | issue tracker 里的每个 issue | issue、comment、assignment、mention 触发的 agent task |
| 拓扑 | parent -> subagent -> summary | lead + teammates，可通过 mailbox 协调 | parent -> child agent threads -> consolidated result | orchestrator -> per-issue workspace -> agent session | workspace/server -> task queue -> local daemon -> selected coding tool runtime |
| 是否产品级协作 | 否，主要是上下文隔离 | 接近，但仍是 Claude runtime 本地/team 状态 | 否，主要是并行执行和汇总 | 是工作管理层，但不是聊天或群聊协议 | 是任务协作和可视化管理层，但不是 backend runtime 协议 |
| agent 间通信 | 子 agent 主要回报给主会话 | teammate 可互发 message | 主要由 parent 路由 follow-up，最后汇总 | 不强调 agent 互聊；issue/workspace/session 是核心 | agent 作为 workspace member 评论、改状态、被 `@` 提及；server 协调任务，不等于 runtime 互聊 |
| 上下文模型 | 每个 subagent fresh context，返回 summary | 每个 teammate 独立 context | 每个 child agent thread 独立 context | 每个 issue 一个隔离 workspace/session | issue/comment thread、agent instructions、skills、runtime config 组成任务上下文 |
| 并发方式 | 主会话同时 spawn 多个 subagents | 多个 Claude Code 实例并行 | 并行 specialized agents，显式触发 | poll issue tracker，按 concurrency dispatch | daemon 扫描本地 tools 并注册 runtimes；agent 有 concurrency limit，可多机器并行 |
| 持久化 | Claude transcript / subagent transcript | Claude 本地 team/task 状态 | Codex agent thread / job state | workspace、logs、orchestrator state、tracker 状态 | server 持久化 workspace、issues、members、agent definitions、task queue、comments；执行留在 daemon/本机 |
| 权限/审批 | subagent 继承或受限于父会话权限 | teammate 继承 lead 权限 | subagent 继承 sandbox/approval policy | 不规定统一审批策略，交给实现和 runtime 配置 | 通过 workspace/private visibility 控制谁能 assign；代码、keys、toolchain 留在本机 daemon |
| 适合场景 | 查代码、跑测试、独立 review、避免污染主上下文 | 多角色讨论、并行调查、跨层 feature | 并行 review、探索、批处理、多步骤 feature plan | 无人值守地消化 backlog，从 ticket 到 PR/review | 管理多种 coding tools、队列、状态、blockers、skill reuse 和团队可见性 |
| 不适合场景 | 频繁交互、共享大量上下文、强顺序任务 | 同文件强冲突、强依赖顺序、小任务 | 产品层群聊、长期团队状态、agent 互聊 | 用户聊天、实时多人协作、通用 workflow engine | 直接表达 Pod 语义、替代 Chat timeline、或把 runtime transcript 当共享事实源 |
| 对 LinX 的启发 | runtime input projection 只投必要 summary / context pack | `Delivery / mailbox / task list` 有参考价值 | `Run / RunStep` 对应 child thread 执行事实 | `Issue -> Workspace -> Session -> Review` 主链路值得借鉴 | `Agent as member`、assignment/comment/status、daemon/runtime 分离、vendor-neutral agent 管理值得借鉴 |

Codex 原生 subagent 不是“多个 agent 在同一个群聊里互相发消息”的模型，而是主 agent 编排多个独立 `Agent thread` 的 fan-out / fan-in 模型。

官方文档里的关键语义是：

- `Subagent workflow`：Codex 运行并行 agents，并把结果合并回主线程。
- `Subagent`：Codex 为某个具体任务启动的 delegated agent。
- `Agent thread`：每个 agent 自己的 CLI thread，可通过 `/agent` 查看和切换。
- 触发方式：Codex 不会自动 spawn subagents，只有用户明确要求 subagents 或并行 agent work 时才应该使用。
- 好的 subagent prompt 要说明如何拆分工作、是否等待所有 agents、以及返回什么 summary/output。

当前 Codex 工具面也符合这个模型：

```text
leader
  -> spawn_agent(task)
  -> send_input(agentId, follow-up)
  -> wait_agent(agentIds)
  -> close_agent(agentId)
  <- final message / uploaded changes
```

因此，Codex 原生层可确认的是“leader 对 child 的控制面通信”，不是 child 之间任意 peer-to-peer 直连。child 之间如果要协作，应由 leader/Secretary 路由，或者通过共享文件/任务产物间接协作。

LinX 的建模边界：

- 不把 Codex 原生 subagent、Claude Code subagent、Claude Agent Team、OpenAI Symphony 的内部 session 或 Multica runtime task 当作产品群聊协议。
- Pod 里的 `Thread / Delivery / Run / RunStep` 是 LinX 自己的产品层协作模型。
- Runtime adapter 负责把 LinX 的 `Delivery` 投影为 Codex child thread、Claude subagent/team task、Symphony-style issue session 或 Multica-style runtime task 的输入，并把 backend 输出投影回 LinX Thread。
- worker 横向沟通默认走 Secretary/router，不直接互写对方 transcript。
- `Issue / Task / Workspace / Session / Run / RunStep` 保留 backend-neutral 语义；backend 原生对象只作为 runtime execution detail 或外部 reference。

在交互心智里，Secretary 可以代表用户阅读、整理、派发、确认和上升；在审计语义里，仍然要区分：

- `actor`：实际做出动作的 Secretary Agent。
- `policy`：允许 Secretary 这么做的授权或自动化策略。
- `source`：触发这次动作的消息、任务或 delivery。

不同工作现场通过 `Thread + Session + Workspace` 区分：

```text
AI Secretary Agent
  ├─ Control Thread + Secretary Session + shared Pod control records
  ├─ Worker Thread A + Runtime Session A + Workspace X
  ├─ Worker Thread B + Runtime Session B + Workspace X
  └─ Worker Thread C + Runtime Session C + Workspace/worktree Y
```

主理人和 worker 共享的是 Pod/control records，不是同一个 runtime transcript。
runtime transcript 是否相同由 Thread 拓扑决定：有些 worker 和主理人在同一个
Thread/room 里协作，有些 worker 通过 Delivery 投递到独立 Session。workspace
按 Thread 分配，不按 Agent 身份分配：一条独立 Thread 可以一个 worker 一个
worktree；同一 Thread 需要多个 AI 协作时，应默认共享同一个 workspace。只有跨
环境、需要隔离未提交修改、并行冲突风险高或 runtime 不能安全共享目录时，才创建
独立 worktree。不要把 Agent 身份塞进 workspace URI；workspace 是“在哪里工作”，
Agent 是“谁在工作”。

## 对象边界

| 对象 | 含义 | 持久位置 / 边界 |
| --- | --- | --- |
| `Agent` | Secretary 或其他可执行身份的长期配置根 | `/agents/{agentId}/` |
| `Agent Home` | `AGENTS.md`、rules、MCP、skills、backend、compaction、memory | 跟 Agent 走，不跟目录、Thread、Session 走 |
| `Chat` | 用户看到的会话/房间对象 | 回答“和谁/什么在聊” |
| `Thread` | Chat 内的一条具体时间线/工作现场 | 绑定 workspace，可承载 group/private timeline |
| `Session` | 一次 runtime 生命周期投影 | 绑定 Agent + Thread + Workspace |
| `Workspace` | 真实工作目录或 worktree | 同目录可被多个 Session 引用 |
| `Issue` | 用户/产品可见的工作项 | 新增 shared Pod resource，必须关联 chat/thread 以便回看过程 |
| `Task` | 通用可执行工作单元 | 复用既有 Task，不新增 Symphony 专属 TaskRecord |
| `Delivery` | 阶段/结果/异步交接包，不是普通消息通道 | 记录 source、target、payload、projection、状态和验收结果 |

## 聊天模式矩阵

聊天模式由三个正交维度组合：

| 维度 | 可选值 | 决定什么 |
| --- | --- | --- |
| 拓扑 | 私聊、工作私聊、群聊、跨会话投递 | 谁在同一个 timeline 里说话 |
| 自动化 | 非自动、自动 | Secretary 是否能在 policy 内代替用户确认、输入和派发 |
| 投影 | Chat message、Runtime prompt、Audit record | 同一事实给用户、worker、审计系统分别怎么表达 |

产品上先暴露三种聊天形态：

| 形态 | Participants | 主要用途 | 默认是否直接喂给 runtime |
| --- | --- | --- | --- |
| 主私聊 | User + Secretary | 用户表达目标、看总结、做最终决策 | 否 |
| 工作私聊 | Secretary + Codex/runtime，User 可旁观 | 单个 worker 执行明确任务 | 是，经过 projection |
| 任务群聊 | User + Secretary + 多个 worker 摘要身份 | 多 worker 协调、状态看板、上升报告 | 否，只通过 Reconciler/dispatch 投影给目标 runtime |

跨会话不是用户看到的第四种聊天产品形态，而是底层 reconciliation / projection 机制。它把一个 timeline 里的消息、目标、steer、确认结果或阶段包落到正确的 Thread，再由 Reconciler 决定是否投影到另一个 Thread/Session/runtime。

## 自动 / 非自动

自动化只改变 Secretary 的路由和确认权限，不改变消息所有权。

| 场景 | 非自动 | 自动 |
| --- | --- | --- |
| 主私聊收到任务 | Secretary 生成计划或建议，等用户确认 | Secretary 在 policy 内创建 Task、Thread、Session |
| 群聊里 `@codex-a` | 生成待投递草稿，等用户点发送 | 写 mention/dispatch control event；形成任务包时创建 Delivery |
| Codex 请求选项确认 | 显示给用户选择 | policy 覆盖时 Secretary 代选 |
| Codex 请求自由输入 | 显示给用户填写 | 可由上下文、模板、偏好推导时 Secretary 代填 |
| worker 完成 | 等用户或 Secretary 手动转发总结 | Secretary 自动生成 report delivery 并上升 |

自动模式下，Secretary 是用户分身；但每次代理确认、代理输入和自动派发都必须留下 AssistantMessage + Audit/Approval/InputRequest/Delivery 等对应记录。

## 2x2 行为矩阵

`私聊 / 群聊` 和 `自动 / 非自动` 组合后有四种基本行为：

| 模式 | 用户看到 | Secretary 行为 | Codex/runtime 行为 | 上下文策略 |
| --- | --- | --- | --- | --- |
| 私聊 + 非自动 | User 和 Secretary 对话 | 生成计划、任务草稿、投递草稿 | 不启动，除非用户确认 | 只使用当前私聊上下文 |
| 私聊 + 自动 | User 和 Secretary 对话，看到 Secretary 代办说明 | policy 内自动建 Task/Thread/Session，必要时创建 Delivery，并代确认/代输入 | 收到投影后的 user/tool 输入并执行 | Goal 进 stable prefix，Steer/Delivery 进 suffix |
| 群聊 + 非自动 | 多 worker 状态和摘要在一个房间 | 生成分工建议和待投递项 | 只在用户确认投递后执行 | 群聊历史不自动进 runtime |
| 群聊 + 自动 | 群聊像任务指挥室，自动出现派发和报告 | policy 内按 mention/plan 自动路由、派发、收报告 | 只消费投影给自己的任务包/context pack/runtime input | 默认只见任务包、context pack、授权片段 |

产品默认应先采用：

- 主入口：`私聊 + 非自动` 或 `私聊 + 自动`，取决于当前 Chat 的 auto policy。
- 多 worker 协作：`群聊 + 非自动` 起步，等 Delivery/Audit/ContextPack 稳定后再打开 `群聊 + 自动`。
- runtime 执行：始终落到工作私聊或目标 Session，不直接消费整个群聊。

## User / Assistant / maker / runtime role

不要把 Chat 里的 `role` 和 runtime prompt 里的 `role` 当成同一个东西。

硬规则：

- Pod timeline 永远记录真实 `maker`，不要伪造用户消息。
- Secretary 作为用户分身时，Pod 里仍然是 `maker = Secretary Agent URI`。
- 只有 runtime adapter 可以把 Secretary 的派发/确认/输入投影成 Codex backend 需要的 `user` 或 `tool` role。
- 任何投影都必须有 `Delivery.projection`、`Run.input` 或对应 `RunStep` 记录，不能只靠消息 role 猜。

| 事实 | Pod message maker | 用户可见 role | 投给 runtime 的 role | 说明 |
| --- | --- | --- | --- | --- |
| 用户对 Secretary 说话 | User WebID | user | 不直接投递 | 主私聊消息先给 Secretary 理解 |
| Secretary 回复用户 | Secretary Agent URI | assistant | 不直接投递 | 用户可见 AssistantMessage |
| Secretary 派发给 Codex | Secretary Agent URI | assistant 或 system note | user | 对 Codex 来说这是来自“用户代理”的任务输入 |
| Codex 回复任务结果 | Codex/session actor URI | assistant | assistant | 进入工作私聊 timeline |
| Secretary 上升 worker 结果 | Secretary Agent URI | assistant | 不直接投递 | 摘要报告进入父级 Thread |
| Secretary 代用户确认 | Secretary Agent URI | assistant | tool/user response | 审计上记录 `decisionBy = Secretary`、`decisionSource = policy` |
| Secretary 代用户输入 | Secretary Agent URI | assistant | user input response | 必须记录 `valueSource` |

runtime adapter 需要显式保存 projection；第一版直接落在 `Delivery.projection` 或执行侧 `Run.input` / `RunStep.data`，不新增一等 Message projection resource：

```ts
type RuntimeProjection = {
  source: string
  target: string
  targetRole: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  reason: 'task_dispatch' | 'delegated_response' | 'report' | 'steer'
}
```

Thread 中的 `Message` 是事实层：记录谁说了什么、在哪个 Chat/Thread 中说、
由哪个 maker 产生。发给 backend LLM 的 `system/user/assistant/tool` 输入是
runtime projection 层：adapter 根据 Thread facts、Goal、Steer、Run 状态和
backend 协议重写角色、上下文窗口和最后一条输入。不要把 projection 伪装成
用户在 Thread 里说过的话；如果 Secretary 代用户输入，Thread 里仍记录为
Secretary 的 runtime intent；真正的 LLM 输入再在 `Run.input` / `RunStep.data` /
`Delivery.projection` 中记录它被投影成 backend 所需的 `user` 或 `tool`
输入。

这样才能同时满足：

- 用户看到 Secretary 作为 assistant 在解释和确认。
- Codex 收到的是符合 backend 协议的 user/tool 输入。
- 审计能追踪谁代理了谁，以及为什么可以代理。

## Secretary 层级沟通

上级 Secretary 和下级 Secretary 不是两个不同 Agent。它们是同一个 Secretary Agent 在不同 Thread/Session 中承担的逻辑角色：

```text
同一个 Secretary Agent URI
  ├─ parent Secretary role: 在父级 Thread 中分治、派发、验收
  └─ child Secretary role: 在子级 Thread 中盯 Codex 反馈、生成下一步输入、上升报告
```

因此需要显式记录的是 `roleScope`，不是复制 Agent：

```ts
type SecretaryRoleScope = {
  agent: string
  role: 'parent' | 'child'
  thread: string
  session?: string
  task?: string
}
```

完整自动化链路是三段：

```text
1. 上级 Secretary -> 下级 Secretary
   控制面沟通：派发 Goal、上下文、约束、验收条件、auto policy。

2. 下级 Secretary -> Codex
   执行面沟通：根据 Goal 和 Codex 反馈生成下一条 runtime 输入。

3. Projection: 下级 Secretary as user/tool -> Codex backend
   协议投影：Pod 中仍是 Secretary maker，runtime 中变成 Codex 需要的 user/tool role。
```

第二段是自动化的核心。不是上级 Secretary 直接把原始用户话术塞给 Codex，而是下级 Secretary 根据 Codex 的输出、tool result、approval/input request、Goal、Steer 和 auto policy 生成下一步动作：

```text
Codex feedback
  -> child Secretary interprets
  -> maybe creates delegated response / steer / next payload
  -> runtime adapter projects to Codex user/tool input
```

所以 `Secretary -> Codex` 在实现上要拆成：

- `Secretary control message`：上级给下级，保持 Secretary 身份，不进 Codex prompt。
- `Secretary runtime intent`：下级根据反馈生成的下一步意图，仍保持 Secretary maker。
- `Runtime projection`：adapter 把 runtime intent 编码成 Codex backend 的 `user/tool` 输入。

## 消息编码总表

这张表是实现时的判定表。先判断“什么事件落到哪个 Thread”，再由
Reconciler 根据 Thread policy 决定是否唤醒 Secretary、worker、reviewer 或
runtime。不要先假设“谁直接唤醒谁”。

Delivery 只在阶段/结果/异步交接边界创建。普通聊天、steer、approval/input
request、worker checkpoint 都先写成 Message、ControlEvent、InboxNotification、
Approval/InputRequest、RunStep 或 Evidence。

| 事件 | Pod / Thread 写入 | Delivery | Reconciler 默认动作 | Runtime projection | Inbox |
| --- | --- | --- | --- | --- | --- |
| 用户输入目标、补充约束、纠偏 | 当前 Thread 写 `UserMessage`，`maker = User WebID` | 不创建 | 唤醒当前 Thread 的 Secretary/default assistant | 不直接投给 backend，除非后续生成 runtime intent | 不进 |
| Secretary 回复、解释、总结、询问用户 | 当前 Thread 写 `AssistantMessage`，`maker = Secretary Agent URI` | 不创建 | 不额外唤醒，除非有待处理控制事件 | 不投给 backend | 需要用户回答时可创建 Inbox/InputRequest |
| Secretary 分治派发子目标 | 父级 Thread 写 assistant/control event；目标 child Thread 写 `task.dispatch` event | 可创建 `Delivery(type=task_dispatch)`，作为任务包/异步交接包 | 唤醒 child Thread 的 Secretary 或 assigned worker | child Secretary/runtime adapter 渲染为首条 runtime input | 非自动或越界时进待确认 |
| Secretary 发送 steer / follow-up | 目标 Thread 写 `AssistantMessage` 或 `ControlEvent(type=steer|change.requested)` | 通常不创建；只有跨 Thread 异步交接才创建 | 唤醒目标 Thread 的 Secretary/worker/runtime | adapter 投影为 backend 支持的 `user`/`system`/input response | 越权、敏感或不可推导时进 |
| backend 普通输出、工具状态、checkpoint | 工作 Thread 写 AssistantMessage、RuntimeEvent projection、RunStep 或 Evidence | 不创建，除非形成阶段报告 | 可触发巡检、状态更新或批处理，不必每条都唤醒 Secretary | backend 原生输出映射到 Pod/runtime event | 不进 |
| backend 需要 approval/input | 工作 Thread 写 `ControlEvent(type=approval.required|input.required)` 和 Approval/InputRequest | 不创建 | 唤醒同 Thread Secretary 先处理 | backend 暂停等待 adapter 回填 | 创建或更新 Inbox；Secretary 已处理也要留 resolved 记录 |
| 同 Thread Secretary 无法代理，需上升主 Secretary/用户 | 主/控制 Thread 写 `InboxNotification` envelope，并确保其 `as:object` 指向对应 `InputRequest` / `ApprovalRequest` / `ControlEvent`，真实 actor 保存在控制资源上 | 不创建 | Reconciler 基于 `inbox.notification.created/updated` 产生用户可见 Inbox 通知；只有 linked control resource claim/lease 成功的 client 才产生 Secretary 检查 Inbox 的调度机会；如果主 Secretary 正在回用户，则排队/合并到下一轮，不中途注入 | 作为 runtime/control context 投给 Secretary；若后端只能用 `user` role，必须标注 `Runtime control event, not a human user message` | pending，用户或主 Secretary 处理后更新为 resolved/rejected/expired |
| Secretary 代 approval/input | 工作 Thread 写 AssistantMessage + DelegatedResponse，`maker = Secretary` | 不创建 | 更新 Inbox/Approval/InputRequest 状态，唤醒等待中的 Run | adapter 投影为 backend 协议要求的 response | policy 覆盖则 resolved；越界则 pending |
| worker 提交阶段/最终结果 | 工作 Thread 写 `Delivery(type=report|result|artifact_package)` 和 `delivery.submitted` event | 创建 | 唤醒 Secretary/reviewer 做验收或排队批处理 | 不再投给原 runtime，除非验收后产生 follow-up | 失败、风险或需决策时进 |
| 群聊 `@worker` 或显式指派 | 群 Thread 保留原 Message，另写 mention/dispatch control event | 只有形成任务包时创建 `task_dispatch` Delivery | 唤醒 Reconciler 选择目标 Thread/worker | 目标 runtime 只收到投影后的任务包/context pack | 非自动时可进待确认 |
| worker 横向请求协作 | 源 Thread 写请求 Message/control event；父级/群 Thread 写路由记录 | 只有异步交接包或结果包才创建 | 由共同父级 Reconciler/Secretary 路由，避免 worker 网状互改 transcript | 目标 worker 看到 Secretary/router 投影后的 payload | 越权、冲突或无人负责时进 |
| schedule tick | schedule main Thread 写 `ControlEvent(type=schedule.tick)` | 不创建 | 复用原 Thread 或分裂 child execution Thread | 按 policy 渲染为 runtime input | 需要用户/authority 时进 |

`Secretary + Codex` 这条线的统一解释：

```text
Pod 中：
  Secretary 永远是 Secretary maker，通常编码为 AssistantMessage 或 system event。

Runtime 中：
  下级 Secretary 根据 Codex 反馈生成 runtime intent。
  runtime intent 经过 Run.input、RunStep.data 或 adapter projection 变成 Codex 的 user/tool input。
  只有当来源本身是 Delivery 时，才在 Delivery.projection 上记录投影。

审计中：
  记录 decisionBy/sourceMaker = Secretary，以及 policy/source。
```

所以不要在 Pod 里把 Secretary 派发伪造成 `UserMessage`。如果 UI 想表达“Secretary 代表你说”，用 AssistantMessage 文案、policy 和 source 表达；如果 runtime 需要 `user` role，由 projection 层负责。

同理，跨 Session 上升的 pending Inbox 也不是用户消息、系统消息或开发者消息。权威事实是 `InputRequest` / `ApprovalRequest` / `ControlEvent`；`InboxNotification` 只是指向它们的 envelope。Inbox 本身是用户可见、可被动查看和处理的入口；变更事件可以通知用户，也可以给 Secretary 一个检查 Inbox 的调度机会。`system/developer` 只放处理规则，payload 是 runtime/control context。只有受限 backend 需要 chat-role 兼容时，adapter 才能把 payload 放进 `user` role，并且必须显式标注它不是 human user message。

## 私聊

私聊是 Secretary 和一个目标 runtime/worker 的 Thread。

Pod 消息里保留真实发言者：

```text
maker = Secretary Agent URI
```

但投喂给目标 runtime 时要做 role projection：

```text
runtime role = user
```

也就是说，`maker` 表示谁说的，`role` 表示这条内容在目标 backend 里以什么角色进入上下文。不要把两者混成一个字段。

## 群聊

群聊是一个协作房间，不是多个 runtime 共享同一个 prompt。

群聊消息默认只进入群聊 timeline：

```text
Group Chat / Thread
  message: Secretary @codex-a 修复登录问题
```

真正让某个 worker 执行时，由 Secretary/router 创建 `Delivery`：

```text
Delivery
  source = group message URI
  target = worker or runtime URI
  thread = source group thread
  targetThread = codex-a private/runtime thread
  targetSession = codex-a runtime session
  projection.targetRole = user
  payload = 修复登录问题...
```

目标 runtime 只收到投递后的 payload，不自动收到整个群聊上下文。

## 谁能看到上下文

上下文可见性按“房间 timeline”和“runtime 私有 transcript”分层。

| 上下文 | 默认可见者 | 默认不可见者 |
| --- | --- | --- |
| 群聊消息 | 群聊 participants、用户、Secretary | 未加入该群聊的 worker/session |
| 私聊消息 | 私聊 participants、用户、Secretary、目标 runtime | 兄弟 worker/session |
| runtime transcript | 用户、Secretary、该 runtime session | 其他 runtime session |
| Delivery payload | source/target 两侧、Secretary、用户 | 非目标 worker |
| 上升报告 | 父级 Thread participants | 子级完整 transcript 不自动外泄 |
| Agent Home | 该 Agent、用户、被授权的 runtime adapter | 其他 Agent 或未授权 worker |

用户拥有自己的 Pod，因此 UI 可以提供“查看全部记录”的管理能力。但对 runtime prompt 来说，默认仍然必须最小可见：worker 只看到自己的任务包、被投递内容、显式附带的引用和授权后的上下文。

群聊里如果需要让某个 worker 看到上下文，必须显式发生一种动作：

- `@mention` 后由 router 投递相关消息。
- Secretary 摘要并投递 context pack。
- 用户或策略允许共享某段 transcript。
- Task 依赖声明要求读取另一个 Task 的结果报告。

不要让新加入的 worker 自动吃完整群聊历史。

## 跨 Thread / Session 协调

跨 Thread / Session 协调统一走 Thread 事件和 Reconciler，不直接改对方 transcript。
Delivery / Handoff 只用于阶段边界或异步交接包，不是普通消息、steer、approval/input request 的必经通道。

```text
source Thread appends Message / ControlEvent / Delivery
  -> Reconciler selects target Thread / Agent / runtime
  -> Scheduler starts or resumes Run when needed
  -> target Thread records projected Message / ControlEvent / runtime input
```

Delivery 的最小字段只描述阶段/结果/异步交接包：

```ts
type Delivery = {
  task?: string
  source?: string
  target?: string
  thread?: string
  targetThread?: string
  targetSession?: string
  actor?: string
  object?: string
  objective?: string
  status: 'pending' | 'dispatched' | 'consumed' | 'completed' | 'failed' | 'cancelled'
  payload: Record<string, unknown>
  projection?: RuntimeProjection
  metadata?: Record<string, unknown>
  createdAt: string
  dispatchedAt?: string
  consumedAt?: string
  completedAt?: string
}
```

分治、派发、上升、横向沟通共享同一条 Reconciler 路径，但不都创建 Delivery：

- `派发`：父级 Secretary 创建或更新 Task/Thread；形成明确任务包时创建 `Delivery(type=task_dispatch)`。
- `上升`：子级 worker/Secretary 发布 `Delivery(type=report|result)` 给父级 Thread，由父级 Reconciler 唤醒验收。
- `steer/follow-up`：写 Message 或 ControlEvent；只有跨 Thread 异步交接且需要包化时才创建 Delivery。
- `approval/input`：写 Approval/InputRequest + InboxNotification envelope；同 Thread Secretary 先处理。
- `横向沟通`：默认经共同父级 Reconciler/Secretary 路由，不鼓励 worker 之间直接网状互发。

## Delivery 消费模型

Delivery 到达子级后，不应该把完整 payload 和全部上下文直接塞进子 Secretary 的每轮 prompt。推荐做成“轻量提醒 + 工具取数”：

```text
Delivery resource
  -> child Thread 写入 compact notice
  -> child Secretary loop 看到 pending notice
  -> 通过 tool 读取 Delivery / ContextPack / Goal / Steer
  -> 生成 runtime intent
  -> adapter 投影给 Codex
```

子 Thread 里的 notice 只放可快速判断的信息：

```json
{
  "type": "delivery_notice",
  "delivery": "delivery-uri",
  "deliveryType": "task_dispatch",
  "from": "parent-thread-uri",
  "goal": "goal-uri-or-hash",
  "contextPackHash": "sha256:...",
  "summary": "修复 cloud/local 登录恢复问题",
  "status": "pending"
}
```

完整内容仍在 Delivery 和关联资源里：

- `Delivery.payload`：本次投递的任务包、结果包、artifact/evidence/risk package 或异步交接包。
- `Delivery.contextPackHash`：可缓存上下文前缀。
- `Delivery.goal`：稳定目标和验收条件。
- `Delivery.steer`：仅当短期纠偏作为本次阶段包的一部分交付时使用；普通 steer 写 Message/ControlEvent。
- `Delivery.delegatedResponse`：仅当代理确认/输入作为本次阶段包的证据一起交付时引用；权威状态仍在 Approval/InputRequest/Inbox/Audit。

Child Secretary 处理 Codex 反馈时也是同一套机制：

```text
Codex runtime event
  -> append/message projector 写入 child work Thread
  -> child Secretary 在 Secretary+Codex 聊天里看到 Codex AssistantMessage
  -> 必要时 tool.getRuntimeEvent / tool.getDelivery / tool.getGoal 取原始细节
  -> child Secretary decides next action
  -> Message/ControlEvent/DelegatedResponse/Run.input
  -> adapter projects to Codex user/tool input
```

也就是说，Codex 反馈可以、也应该建模成 `Child Secretary + Codex` 的聊天消息：

```text
Child Work Thread
  Secretary: 请按 Goal 修复登录恢复。
  Codex: 我发现 SessionProvider 恢复时缺少 token refresh...
  Secretary: 继续，只改 restore 分支，不要替换 Provider。
  Codex: 已完成，测试如下...
```

runtime event 是底层事实流；聊天消息是给 Secretary、用户和 TUI 消费的语义投影。两者通过 URI/id 关联：

```ts
type RuntimeEventProjection = {
  run: string
  runStep: string
  message: string
  thread: string
  maker: string
  projectionKind: 'assistant_output' | 'tool_request' | 'tool_result' | 'status'
}
```

为什么不直接把完整 Delivery 放进 prompt：

- prompt cache 会被每个大 payload 打散。
- 子 Secretary 不是每轮都需要完整历史。
- 大对象用 URI/hash 引用，才能在 Web、TUI、runtime 重启后恢复。
- 权限和可见性可以在 tool 层检查，不靠 prompt 自觉。

消费状态必须落在 Delivery 上：

| 状态 | 含义 |
| --- | --- |
| `pending` | 已创建，目标还没处理 |
| `dispatched` | 已投递到目标 Thread/Session 或目标 runtime |
| `consumed` | 已生成 runtime intent 或 report |
| `completed` | 投递目标已完成对应动作 |
| `failed` | 投递或消费失败 |
| `cancelled` | 被用户或 policy 取消 |

这和用户 Inbox 不一样。Delivery notice 是子 Secretary/runtime 的工作队列；只有需要用户或 Secretary 做决策、输入、审批、异常处理时，才额外投影到 Inbox。

## Goal / Steer

`Goal` 和 `Steer` 是让跨会话协作可控的两个轻量控制面。

| 对象 | 含义 | 生命周期 | 是否进 prompt cache stable prefix |
| --- | --- | --- | --- |
| `Goal` | 当前 Task/Session 要达成的稳定目标和验收条件 | 随 Task 或 Session 存在，低频变化 | 是 |
| `Steer` | 对下一步执行的短期转向、提醒或约束 | 随 Delivery 或用户/Secretary 新指令变化，高频变化 | 否，进 dynamic suffix |

`Goal` 例子：

```json
{
  "type": "goal",
  "id": "goal-login-fix",
  "objective": "Restore cloud and local login flow.",
  "acceptance": [
    "Cloud login succeeds without clearing storage.",
    "Local provider starts only when selected.",
    "Entering LinX opens through 5737."
  ],
  "doneSignal": "tests pass and manual login smoke succeeds"
}
```

`Steer` 例子：

```json
{
  "type": "steer",
  "id": "steer-avoid-session-provider-refactor",
  "target": "session-123",
  "instruction": "Do not replace SessionProvider again; patch the restore branch only.",
  "expires": "after_next_report"
}
```

使用规则：

- 用户消息可以创建或更新 `Goal`。
- Secretary 分治时把父级 Goal 切成子 Goal，再通过 Delivery 发给 worker。
- 用户或 Secretary 的短期纠偏用 `Steer`，不要改写 Goal。
- `Goal` 进入 ContextPack stable prefix，以便 cache 复用。
- `Steer` 进入 Dynamic suffix，因为它通常按轮次变化。
- worker report 必须引用它完成的是哪个 Goal，以及是否仍受哪个 Steer 影响。

## auto 模式

auto 模式不是“所有消息自动广播给所有 worker”，也不是 backend 原生 approval policy。它只有开和关：

- `auto off`：用户直接驱动当前会话；Secretary 仍可记录和展示状态，但不接管输入或调度。
- `auto on`：Secretary 接管当前会话输入、任务拆分、投递和 worker 调度；能在已有授权和上下文内继续推进，搞不定、越权、凭据缺失、破坏性操作或需要人类产品判断时再等用户。

backend 原生审批策略独立保存和生效。`auto on/off` 只描述 LinX Secretary 是否主驾当前会话，不等同于 Codex `approvalPolicy` 或任何 backend 内部 sandbox/approval 开关。

`auto on/off` 本身是控制面状态变化，不是业务会话消息。开启 auto 时必须新建或复用独立的 Secretary control session，并记录它和当前业务 `Chat / Thread / Session / Workspace` 的关系；不能把“Auto on”控制指令作为 user message、prompt、follow-up 或 steer 写进当前聊天 transcript。

进 Chat 仍然可以是一个会话，但要区分两类事实：

- 产品层 `Message`：真实发生在 `Chat / Thread` 里的用户、Secretary、worker、系统可见发言或事件。
- 模型层 input：为了让某个 backend/agent 执行而临时组装的 prompt/context/projection。

二者不能互相冒充。Secretary 在 auto 下的 control session 是临时控制面，可以保存状态、指针、投影和 blocked request，但不应该因为给模型组装了 prompt 就创建产品层 message。只有真的需要用户或用户可见审计的行为，才写入对应 Chat/Thread 的真实 message 或 audit。

控制面按 multiple agents 建模，backend 只是 runtime participant 的实现细节。Codex、Claude、CodeBuddy、LinX Cloud runtime 或后续本地 agent 都通过同一套 `Delivery / Session / Run / RunStep / blocked event` 边界接入；不要把 auto 或 Symphony 设计成某个 backend 的私有模式。

auto on 下的确认主体是 Secretary，但语义上是用户授权后的代理确认或代理输入：

```text
decisionBy = Secretary Agent URI
decisionSource = autoPolicy
```

也就是说，worker 或 runtime 收到的是“已确认 / 已填写”的操作，不需要再次等用户点按钮；但审计里必须能看出这次响应是 Secretary 依据哪条 auto policy 代用户做出的。

auto on 必须记录：

- `autoPolicy`：允许自动做什么。
- `budget`：时间、token、并发数、成本。
- `concurrencyLimit`：每一级最多并发几个下级任务。
- `riskGate`：哪些动作必须审批。
- `delegatedResponse`：Secretary 是否可代替用户确认或输入，以及响应时要写入的 `decisionBy / decisionSource / valueSource`。
- `contextPolicy`：可共享哪些上下文，是否允许读取 sibling report。
- `stopCondition`：何时停止、上升或询问用户。

auto on 中的上下文投递仍然遵守可见性规则。Secretary 可以读取任务状态和报告来做路由，但 worker 不能因为 auto on 而自动看到兄弟 session 的完整 transcript。

auto on 的边界是 policy 和能力，不是“永不等待用户”。只要动作落在 policy 内，Secretary 就应该直接确认并继续推进；如果动作越界、信息不足或能力不足，必须上升给用户。

Secretary 的触发点是 blocked 控制事件，不是每一次工具调用。普通 tool call 和 tool result 留在对应 runtime/session archive；当 runtime 发出 `approval.required`、`input.required` 或等价阻塞事件时，控制事件只携带指向业务 session、runtime session、archive、request 和最近工具历史的 URI/本地 key。Secretary 需要判断时再按指针打开证据，而不是持续消费完整工具流。

## 选择型确认和输入型确认

runtime 的阻塞请求分两类：

| 类型 | 例子 | Secretary 在 auto 模式下怎么处理 |
| --- | --- | --- |
| 选择型确认 | `allow_once / allow_always / reject`、是否执行命令、是否写文件 | policy 覆盖则代用户选择；越界则问用户 |
| 输入型确认 | 输入 commit message、迁移名、分支名、PR 描述、问题答复、表单字段 | 输入可由上下文或模板推导时可代填；不可推导或敏感时问用户 |

输入型确认不能简单当作 `approved`。它必须记录 Secretary 填了什么、为什么能填、值从哪里来。

推荐结构：

```json
{
  "type": "delegated_input",
  "inputRequest": "request-uri-or-id",
  "inputKind": "freeform_text",
  "decisionBy": "agent:secretary",
  "decisionSource": "autoPolicy",
  "valueSource": "derived_from_task_context",
  "value": "Fix login session restoration",
  "reason": "Derived from task title and current changed files."
}
```

`valueSource` 必须明确：

- `explicit_user_message`：用户刚才明确给过。
- `derived_from_task_context`：从任务目标、文件变更、测试结果等推导。
- `agent_template`：来自 Agent Home 或 policy 的模板。
- `stored_preference`：来自用户长期偏好。
- `credential_store`：来自授权的密钥/凭据存储。
- `unknown`：不能代填，必须问用户。

安全边界：

- OTP、密码、私钥、支付确认、外部生产写入等敏感输入默认不能由 Secretary 编造或代填。
- 如果输入会造成不可逆外部效果，即使是文本输入，也要走 riskGate。
- 如果 Secretary 只是生成草稿，状态应是 `drafted`，不是 `consumed`。
- 如果 Secretary 代填了真实值，Chat timeline 必须出现可审计 AssistantMessage，敏感值只显示摘要或引用，不明文回显。

## Context Pack / prompt cache

Secretary 代替用户确认或输入时，用户可见的 Chat timeline 里必须出现一条 AssistantMessage，例如：

```text
Secretary: 我已根据 auto policy 代你确认这次文件修改，范围是 apps/web。
Secretary: 我已根据任务上下文代你填写 commit message：Fix login session restoration。
```

但这条用户可见消息不应该原样复制进每个 worker/runtime 的完整上下文。运行时应使用 projection renderer，把 Chat/Task/Policy/Delivery 渲染成稳定的 `ContextPack`，再追加少量动态消息。

推荐分层：

```text
Stable prefix
  1. protocol/version
  2. Agent Home digest and selected rules
  3. auto policy / delegated authority
  4. goal / acceptance criteria
  5. workspace identity and snapshot
  6. task packet
  7. visible context references

Dynamic suffix
  8. latest steer
  9. latest delivery payload
  10. latest delegated decision/input
  11. latest tool result / runtime event
```

这样 Secretary 的确认同时存在两种形态：

| 形态 | 用途 | 是否进 worker prompt |
| --- | --- | --- |
| AssistantMessage | 给用户看的审计和解释 | 不直接整段复制 |
| DelegatedResponse block | 给 worker/runtime 的确认或输入事实 | 作为小块动态 suffix |
| Audit/Approval record | 给系统恢复和审计 | 通过 URI/hash 引用 |

选择型确认的 `DelegatedResponse` 是 `delegated_decision`：

```json
{
  "type": "delegated_decision",
  "decision": "approved",
  "decisionBy": "agent:secretary",
  "decisionSource": "autoPolicy",
  "policy": "policy-uri-or-hash",
  "scope": {
    "workspace": "workspace-uri",
    "paths": ["apps/web/**"],
    "risk": "medium"
  },
  "reason": "Within auto policy: current repo, non-destructive edit, budget available."
}
```

输入型确认的 `DelegatedResponse` 是 `delegated_input`。它通常更动态，更不适合放进 stable prefix，只放在 suffix。

为了更容易命中 backend prompt cache，`ContextPack` 必须稳定：

- 固定字段顺序。
- 固定 section 顺序。
- 使用 URI/hash 引用大对象，不反复展开完整 transcript。
- 同一个 task/session 的 stable prefix 不随每轮消息变化。
- policy、Agent Home、workspace snapshot 改变时才生成新的 prefix hash。
- 最新消息、工具结果、确认结果只放在 suffix。

推荐 cache key：

```text
contextPackHash =
  hash(protocolVersion,
       agentHomeHash,
       autoPolicyHash,
       goalHash,
       workspaceSnapshotHash,
       taskPacketHash,
       visibleContextHash)
```

`Delivery` 不直接携带大量重复上下文，而是携带：

```ts
type Delivery = {
  contextPack: string
  contextPackHash: string
  goal?: string
  steer?: string
  payload: string
  delegatedResponse?: string
}
```

worker 收到 Delivery 后：

1. 读取或复用 `contextPackHash` 对应的 stable prefix。
2. 追加本次 steer。
3. 追加本次 payload。
4. 追加本次 delegated response。
5. 执行。

这样既能让 Secretary 作为用户分身出现在用户可见 AssistantMessage 里，又不会破坏 worker prompt 的稳定前缀。

## 分治、派发、上升

推荐组织方式：

```text
Main Thread
  User + Secretary
    |
    | 分治
    v
Task Group Thread
  Secretary + worker sessions
    |
    | 派发
    v
Worker Private Thread
  Secretary -> runtime user message
```

每一级 Secretary 只直接管理下一层，不直接控制孙级。上升时只上升结构化结果，不上升完整内部 transcript。

上升报告格式：

```text
summary
changedFiles
tests
decisions
blockers
remainingRisks
nextAction
```

## Workspace / worktree 策略

同一个目录可以跑多个 Agent/Session，但执行路径要避免互相踩。

规则：

- `Workspace` 表示用户选择的 repo 或 folder。
- 如果是 git repo，多 session 默认创建不同 worktree。
- `Session` 记录实际 `folderPath`，也就是当前 runtime cwd。
- git 元信息跟 Workspace/worktree 走，不放进 Agent Home。
- Agent Home 跟 Agent 走，同一个 Secretary 在多个 worktree 中共享同一套长期规则。

如果用户选择普通 folder 而不是 git repo：

- 可以允许多个 session 共用同一个 folder。
- 但必须降低并发写入能力，至少有 file-intent / path lock / approval gate。
- UI/TUI 需要明确显示“共享目录，可能有写入冲突”。

## TUI 支持

TUI 不是另一套模型，只是同一套 Pod + runtime service 的终端客户端。

TUI 需要的 headless 能力：

- 列出 Chat / Thread / Session / Task / Delivery。
- 查看 group/private timeline。
- 创建 Task。
- 向群聊发送消息。
- 向指定 Agent/Session 投递消息。
- 启动、暂停、恢复、停止 runtime session。
- 创建或复用 git worktree。
- 订阅 runtime events。
- 查看 Delivery 状态。
- 处理 approval / inbox。

推荐 TUI 布局：

```text
left:   task/session tree
middle: current group/private thread
right:  selected session logs / delivery / approvals
bottom: command input
```

TUI 命令可以先收敛为：

```text
/task create ...
/assign <task> <session>
/tell <session> ...
/group <thread>
/auto on|off|status
/status
/approve
/report
```

## 数据落点

第一版实现可以按“先 metadata，后正式 resource”推进，但语义必须先稳定。

`metadata` 只能承载协议 opaque id、局部 cache key、UI 选中态、兼容迁移信息或尚未正式化的附加上下文。它不是逃避建模的垃圾桶：凡是跨端需要查询、恢复、投递、审批、审计或授权判断的事实，都必须沉到 `@undefineds.co/models` 的语义字段或 resource。外部 runtime id 如果只是 provider 句柄，可以叫 `externalRunId`、`toolCallId` 这类明确的 opaque 字段；如果它表达的是 Pod 资源关系，就必须解析成 `task`、`delivery`、`thread`、`message`、`workspace` 等 URI relation。

| 能力 | 第一版落点 | 后续正式化 |
| --- | --- | --- |
| `Goal` | Task metadata 或 Thread metadata | `goalResource` 或 Task 子资源 |
| `Steer` | Thread/Run latest runtime instruction；随 task dispatch 包交付时可放 Delivery metadata | `steerResource` 或 Task/Thread 子资源 |
| `Delivery` | `deliveryResource` | 已正式化为 shared model resource |
| `ContextPack` | runtime 本地 cache + Pod URI/hash 引用 | `contextPackResource` 或 Task/Session snapshot |
| `DelegatedResponse` | approval/audit/inbox + message richContent block | approval/audit 结构化字段 |
| `Runtime projection` | `Delivery.projection`、`Run.input`、`RunStep.data` | 如确需查询优化，再补 projection helper |

不要为了赶 UI 在 React 组件里私造 predicate。跨端语义进入 `@undefineds.co/models`，Web/TUI/CLI 只做协议适配和展示。

## 底层能力优先级

优先级从高到低：

1. Runtime session 变成 Agent-aware：记录 `agent / agentHome / thread / workspace / folderPath / tool`。
2. Delivery/Handoff 资源：支持跨 Thread/Session 阶段包、结果包、异步交接和 role projection。
3. Task 资源：支持分治、状态、验收条件、上升报告。
4. Context policy：定义群聊、私聊、runtime transcript 的默认可见性和共享动作。
5. Worktree 管理：同 repo 多 session 自动分配 worktree。
6. Auto policy：auto on/off 下的权限、预算、并发、风险门和上升条件。
7. Headless API：Web 和 TUI 共用，不把行为写死在 React 组件里。
8. UI/TUI 展示：任务树、群聊 timeline、私聊 runtime、delivery 状态、审批入口。

## 非目标

- 不复制多个 Secretary Agent 来表达多个工作现场。
- 不把群聊历史自动灌给所有 runtime。
- 不让 Session 拥有 Agent rules、skills、MCP、backend、compaction。
- 不把 Repository 当作用户首屏管理对象。
- 不在 TUI 里做一套独立存储模型。

## 产品检验

这份模型通过产品检验需要满足：

- 用户能理解：`Secretary` 是自己的分身，不是一堆复制出来的机器人。
- 用户能区分：主私聊是对 Secretary 说目标，工作私聊是某个 worker 干活，任务群聊是多 worker 状态和报告。
- 自动模式可解释：Secretary 在授权范围内代确认/代输入，越界才问用户。
- 群聊不吓人：worker 不会因为加入群聊就偷看所有历史和兄弟 session。
- 用户可追踪：每次自动派发、代理确认、代理输入都在 Chat timeline 中有 AssistantMessage。
- 用户可恢复：Web、Desktop、TUI 看到的是同一组 Chat/Thread/Session/Task/Delivery 状态。

## 技术检验

这份模型通过技术检验需要满足：

- `Agent`、`Thread`、`Session`、`Workspace` 边界清楚：Agent Home 跟 Agent，git/worktree 跟 Workspace，runtime lifecycle 跟 Session。
- Chat role 和 runtime role 分离：Pod 保留真实 maker，runtime adapter 显式保存 projection。
- 跨会话不直接互改 transcript；普通事件先落 Thread/Reconciler，阶段/异步交接才走 Delivery/Handoff。
- ContextPack 有稳定 prefix 和动态 suffix，`Goal` 进入 prefix，`Steer` 进入 suffix。
- auto 模式有结构化 `DelegatedResponse`，同时覆盖选择型确认和输入型确认。
- audit 可还原代理语义：`decisionBy = Secretary`、`decisionSource = policy`，并能从 source/policy 追到触发事实。
- TUI 不需要新模型，只调用同一套 headless API。
- 第一版允许 metadata 过渡，但正式共享语义必须沉到 `@undefineds.co/models`。
