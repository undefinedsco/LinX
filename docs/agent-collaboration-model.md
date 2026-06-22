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

## 已锁定决策：Secretary 承接用户依赖

LinX 的 runtime/worker 不直接面对用户做确认或索取输入。所有“需要用户”的阻塞点统一交给 `Secretary` 处理：

- 如果请求落在当前 `autoPolicy` / `delegatedAuthority` 内，Secretary 直接代用户确认、代用户填写、代用户继续推进。
- 如果请求超出 policy、预算、风险或可推导范围，Secretary 才把它投影成用户可见的 Inbox / Approval / InputRequest。
- 用户回答后，仍由 Secretary 把答案写成结构化 `DelegatedResponse`，再由 runtime adapter 投影回目标 backend。
- Pod timeline 不伪造 `UserMessage`。Secretary 代办时仍写 `AssistantMessage`，并记录 `onBehalfOf = User WebID`。
- runtime backend 如果要求 `user` 或 `tool` role，只能由 `MessageProjection` / adapter 层转换，不能改变 Pod 里的真实 maker。

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
- `Report/Review` 是任务完成后的上升和验收入口。

建模硬约束：

- Shared Pod resource 和 shared archive contract 使用语义 URI 字段：`issue`、`task`、`delivery`、`session`、`chat`、`thread`。
- `issueId`、`taskId`、`deliveryId`、`sessionId`、`chatId`、`threadId` 只允许出现在 UI 选中态、CLI 参数、本地文件 key、runtime wire protocol 或兼容 metadata 中，不能作为持久关系字段。
- 本地 archive 文件夹名可以从 URI 派生短 key，但 JSON 内容必须保留 URI 语义字段。
- LinX 项目内的编排 API 不需要重复 `Linx` 前缀，例如使用 `createRunPlan` / `SymphonySessionRecord`，不要新增 `createLinxSymphonyRunPlan` 或 `LinxSymphonyTaskRecord`。

产品入口上，`Symphony` 不是独立产品，也不是一个新的 worker。它是 `AI Secretary` 的内置委派/编排能力：

- 用户感知的是 Secretary 能不能把活派给下面的人干。
- `/symphony ...` 用来调整或检查 Secretary 的委派行为、任务切分、worker 投影和状态归档。
- `Symphony` 是 Secretary 的全局控制面，不绑定从哪个 Chat/Thread 发起；在哪个界面触发只提供来源上下文，不决定投递模型。
- Chat/Thread 是过程展示和回看载体，由 Secretary 在产品层创建或选择，并把对应 URI 写进 `Issue / Delivery / Session`。用户不需要选择或填写 Chat/Thread/Message URI，headless CLI 也不模拟这层产品上下文。
- CLI 不提供 `linx symphony ...` 产品命令；该入口只保留为退役提示，引导用户进入 TUI 后使用 `/symphony on` 和正常 chat。
- Headless 或集成验证只能走内部测试 harness、runtime adapter、MCP bridge 或明确隐藏的开发/插件 plumbing，不能重新包装成用户可发现的 Symphony CLI 面。
- 不提供独立 `linx-symphony` 产品入口，避免把内置能力误解成另一个应用。

runtime 层先做半套，直接使用 Codex：

- LinX 负责 `Issue / Task reference / Thread / Workspace / Session / Delivery / Projection` 的持久化和产品语义。
- Codex 负责实际 coding runtime、工具调用、subagent/task thread、approval event。
- LinX adapter 只做必要桥接：投递输入、接收输出、处理 approval/input request、保存 projection。
- 不在 MVP 里复制 Codex 的完整 mailbox、guardian、subagent scheduler。

后台任务 UI 先不扩模型：

- 只新增 `Issue` 作为用户可见工作项，不引入 runner dashboard 或新的 background-agent resource。
- Web UI 只展示当前模型已经有的 `Issue / Task reference / Session / Delivery / Report / Inbox`。
- TUI 可以先作为 headless 能力验证入口，而不是单独产品形态。
- 如果后续需要后台任务列表，也只能从现有 `Issue + Task + Session` 派生，不能反向创造一套新的 Task 模型。

MVP 落地顺序：

1. 不改 GUI，不改 TUI 信息架构。
2. 先实现后台主链路：`Issue -> Task reference -> Delivery -> Codex Session -> Runtime Events -> Projection -> Report/Inbox`。
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
- 任务完成后能生成结构化 Report，并关联原 Task/Session/Delivery。

## Codex subagents 调研结论

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

- 不把 Codex 原生 subagent 当作产品群聊协议。
- Pod 里的 `Thread / Delivery / MessageProjection` 是 LinX 自己的产品层协作模型。
- Codex runtime adapter 负责把 LinX 的 `Delivery` 投影为 Codex child thread 的输入，并把 Codex 输出投影回 LinX Thread。
- worker 横向沟通默认走 Secretary/router，不直接互写对方 transcript。

在交互心智里，Secretary 可以代表用户阅读、整理、派发、确认和上升；在审计语义里，仍然要区分：

- `actor`：实际做出动作的 Secretary Agent。
- `onBehalfOf`：被代理的用户 WebID。
- `policy`：允许 Secretary 这么做的授权或自动化策略。
- `source`：触发这次动作的消息、任务或 delivery。

`Agent Home` 和 `Workspace` 必须分开建模：

- `Agent Home` 是 Agent 的长期身份和配置根，默认在用户 Pod 中，例如 `/agents/__secretary__/`。
- `Workspace` 是某次执行的工作现场，可以是 Pod 内的默认工作现场，也可以是本机 folder/worktree。
  `git repository` 不是一种 Workspace kind；它是 workspace 关联的 Repository 元信息。实际执行现场永远是某个 folder 或 worktree。
- 用户只和 Secretary 聊天且未指定代码目录时，默认 Workspace 应该是当前用户 Pod，而不是某个 repo 目录。
- 只有进入代码任务、文件任务或外部项目任务时，才为 Thread/Session 绑定具体 repo、folder 或 worktree。
- Workspace 的访问方式由 Agent runtime adapter 决定，不写成 Workspace 自身字段：
  - AI 在 client 运行时，通过 xpod CLI 访问 Pod；不能假设 Pod 是本地目录。
  - AI 在 server/xpod 运行时，Pod storage 可以在 server 侧直接表现为本地文件夹；`grep` / `rg` 只是实现细节。
  - LinX 当前用 Agent metadata 中的 `linx.aiRuntimeLocation = client | server` 记录这个 adapter 偏好；默认是 `client`。

不同工作现场通过 `Thread + Session + Workspace` 区分：

```text
AI Secretary Agent
  ├─ Thread A + Session A + Workspace/worktree A
  ├─ Thread B + Session B + Workspace/worktree B
  └─ Thread C + Session C + Workspace/worktree C
```

如果 `Workspace` 关联了 git repository，同一 repo 下多个运行现场默认使用不同 worktree；repo 根目录本身也只是一个 worktree。不要把 Agent 身份塞进 workspace URI；workspace 是“在哪里工作”，Agent 是“谁在工作”。

## 对象边界

| 对象 | 含义 | 持久位置 / 边界 |
| --- | --- | --- |
| `Agent` | Secretary 或其他可执行身份的长期配置根 | `/agents/{agentKey}/`，`row.id = {agentKey}/` |
| `Agent Home` | `AGENTS.md`、rules、MCP、skills、backend、compaction、memory | 同目录 `/agents/{agentKey}/`，跟 Agent 走，不跟目录、Thread、Session、Workspace 走 |
| `Chat` | 用户看到的会话/房间对象 | 回答“和谁/什么在聊” |
| `Thread` | Chat 内的一条具体时间线/工作现场 | 绑定 workspace，可承载 group/private timeline |
| `Session` | 一次 runtime 生命周期投影 | 绑定 Agent + Thread + Workspace |
| `Workspace` | 执行工作现场，可位于 server Pod 或 client 本机 | 同一个 Workspace 可被多个 Session 引用；代码 Workspace 是 folder/worktree，并可关联 Repository 元信息 |
| `Issue` | 用户/产品可见的工作项 | 新增 shared Pod resource，必须关联 chat/thread 以便回看过程 |
| `Task` | 通用可执行工作单元 | 复用既有 Task，不新增 Symphony 专属 TaskRecord |
| `Delivery` | 跨 Thread/Session 的消息投递信封 | 记录 source、target、payload、projection、状态 |

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
| 任务群聊 | User + Secretary + 多个 worker 摘要身份 | 多 worker 协调、状态看板、上升报告 | 否，只通过 Delivery 喂给目标 runtime |

跨会话不是用户看到的第四种聊天产品形态，而是底层投递机制。它把一个 timeline 里的消息、目标、steer 或确认结果投影到另一个 Thread/Session。

## 自动 / 非自动

自动化只改变 Secretary 的路由和确认权限，不改变消息所有权。

| 场景 | 非自动 | 自动 |
| --- | --- | --- |
| 主私聊收到任务 | Secretary 生成计划或建议，等用户确认 | Secretary 在 policy 内创建 Task、Thread、Session |
| 群聊里 `@codex-a` | 生成待投递草稿，等用户点发送 | 直接创建 Delivery 给 codex-a |
| Codex 请求选项确认 | 显示给用户选择 | policy 覆盖时 Secretary 代选 |
| Codex 请求自由输入 | 显示给用户填写 | 可由上下文、模板、偏好推导时 Secretary 代填 |
| worker 完成 | 等用户或 Secretary 手动转发总结 | Secretary 自动生成 report delivery 并上升 |

自动模式下，Secretary 是用户分身；但每次代理确认、代理输入和自动派发都必须留下 AssistantMessage + Audit/Approval/Delivery 记录。

## 2x2 行为矩阵

`私聊 / 群聊` 和 `自动 / 非自动` 组合后有四种基本行为：

| 模式 | 用户看到 | Secretary 行为 | Codex/runtime 行为 | 上下文策略 |
| --- | --- | --- | --- | --- |
| 私聊 + 非自动 | User 和 Secretary 对话 | 生成计划、任务草稿、投递草稿 | 不启动，除非用户确认 | 只使用当前私聊上下文 |
| 私聊 + 自动 | User 和 Secretary 对话，看到 Secretary 代办说明 | policy 内自动建 Task/Session/Delivery，并代确认/代输入 | 收到投影后的 user/tool 输入并执行 | Goal 进 stable prefix，Steer/Delivery 进 suffix |
| 群聊 + 非自动 | 多 worker 状态和摘要在一个房间 | 生成分工建议和待投递项 | 只在用户确认投递后执行 | 群聊历史不自动进 runtime |
| 群聊 + 自动 | 群聊像任务指挥室，自动出现派发和报告 | policy 内按 mention/plan 自动路由、派发、收报告 | 只消费发给自己的 Delivery | 默认只见任务包、context pack、授权片段 |

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
- 任何投影都必须有 `MessageProjection` 或 `Delivery` 记录，不能只靠消息 role 猜。

| 事实 | Pod message maker | 用户可见 role | 投给 runtime 的 role | 说明 |
| --- | --- | --- | --- | --- |
| 用户对 Secretary 说话 | User WebID | user | 不直接投递 | 主私聊消息先给 Secretary 理解 |
| Secretary 回复用户 | Secretary Agent URI | assistant | 不直接投递 | 用户可见 AssistantMessage |
| Secretary 派发给 Codex | Secretary Agent URI | assistant 或 system note | user | 对 Codex 来说这是来自“用户代理”的任务输入 |
| Codex 回复任务结果 | Codex/session actor URI | assistant | assistant | 进入工作私聊 timeline |
| Secretary 上升 worker 结果 | Secretary Agent URI | assistant | 不直接投递 | 摘要报告进入父级 Thread |
| Secretary 代用户确认 | Secretary Agent URI | assistant | tool/user response | 审计上 `onBehalfOf = User WebID` |
| Secretary 代用户输入 | Secretary Agent URI | assistant | user input response | 必须记录 `valueSource` |

runtime adapter 需要显式保存 projection：

```ts
type MessageProjection = {
  sourceMessage: string
  sourceMaker: string
  targetSession: string
  projectedRole: 'system' | 'user' | 'assistant' | 'tool'
  projectedContent: string
  projectionReason: 'task_dispatch' | 'delegated_response' | 'report' | 'steer'
}
```

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

这张表是实现时的判定表。先判断“谁给谁发”，再决定写什么 Pod 消息、是否创建 Delivery、是否投影到 runtime。

| 发送方 -> 接收方 | 场景 | Pod timeline 写入 | Delivery | Runtime projection | Inbox |
| --- | --- | --- | --- | --- | --- |
| User -> Secretary | 主私聊输入目标、补充约束、纠偏 | `UserMessage`；`maker = User WebID`；`role = user` | 不创建，除非 Secretary 后续派发 | 不投给 Codex | 不进 |
| Secretary -> User | 回复、解释、总结、询问用户 | `AssistantMessage`；`maker = Secretary Agent URI`；`role = assistant` | 不创建 | 不投给 Codex | 需要用户回答时可创建 Inbox/InputRequest |
| Parent Secretary -> Child Secretary | 分治后派发子目标、上下文、policy | 父级 Thread 写 `AssistantMessage` 或 system event；`maker = Secretary`；子级 Thread 写 `delivery_received` event | 创建 `Delivery(type=task_dispatch, target=child Secretary role)` | 不直接投给 Codex | 非自动或越界时先进 Inbox/待确认 |
| Child Secretary -> Codex | 根据 Goal 生成首条 runtime 输入 | 子级 Thread 写 `AssistantMessage` 或 system event；`maker = Secretary`；metadata 标记 `roleScope=child` | 更新/消费 task Delivery，或创建 `Delivery(type=runtime_intent)` | `projectedRole = user`；content = task payload + Goal + ContextPack suffix | 通常不进 |
| Child Secretary -> Codex | 根据 Codex 反馈生成下一步输入 | 子级 Thread 写 `AssistantMessage` 或 compact system event；`maker = Secretary`；引用 Codex feedback | 创建 `Delivery(type=runtime_followup)` 或追加到当前 runtime session | `projectedRole = user/tool`；content = follow-up payload / approval / input | policy 不覆盖时进 Inbox |
| Child Secretary -> Codex | 发送短期纠偏 steer | 子级 Thread 可写 `AssistantMessage` 或 system event；`maker = Secretary` | 创建 `Delivery(type=steer)` | `projectedRole = user` 或 backend 支持时 `system`；Steer 放 dynamic suffix | 通常不进 |
| Codex -> Child Secretary | 普通执行输出、阶段性状态 | 子级工作 Thread 写 `AssistantMessage`；`maker = Codex/session actor`；`role = assistant`；引用 runtime event | 不创建，除非需要上升 | backend 原生 assistant 输出映射到 Pod | 不进 |
| Codex -> Secretary/User | 需要选项确认 | 工作 Thread 写 approval block 或 system event；`maker = Codex/session actor` | 可创建 `Delivery(type=approval_request)` 指向 Secretary | runtime 暂停等待 response | 需要用户或 Secretary 处理时进 Inbox/Approval |
| Child Secretary -> Codex | 代用户做选择型确认 | 子级 Thread 写 `AssistantMessage`；`maker = Secretary`；richContent 含 `delegated_decision` | 更新原 Delivery 或创建 `Delivery(type=delegated_response)` | `projectedRole = tool` 或 backend 协议要求的 approval response | auto policy 覆盖时不进用户 Inbox；越界才进 |
| Codex -> Secretary/User | 需要自由输入 | 工作 Thread 写 input request block；`maker = Codex/session actor` | 可创建 `Delivery(type=input_request)` 指向 Secretary | runtime 暂停等待 input response | 需要用户或 Secretary 处理时进 Inbox/InputRequest |
| Child Secretary -> Codex | 代用户填写输入 | 子级 Thread 写 `AssistantMessage`；`maker = Secretary`；richContent 含 `delegated_input` 和 `valueSource` | 更新原 Delivery 或创建 `Delivery(type=delegated_response)` | `projectedRole = user` 或 backend input response；content = 填写值 | policy 可推导时不进用户 Inbox；敏感/不可推导才进 |
| Codex -> Group Thread | worker 完成后上升报告 | 群聊写 `AssistantMessage` 或 report block；`maker = Codex/session actor` 或 Secretary 汇总时 `maker = Secretary` | 创建 `Delivery(type=report)` 到父级 Thread | 不再投给其他 runtime，除非 Secretary 再路由 | 通常不进；失败/需决策才进 |
| Child Secretary -> Parent Secretary | 上升报告、阻塞、验收证据 | 子级 Thread 写 report；父级 Thread 写 `AssistantMessage` 或 report block；`maker = Secretary`；metadata 标记 source child scope | 创建 `Delivery(type=report, target=parent Secretary role)` | 不投给 Codex | 失败/需决策才进 |
| Parent Secretary -> Group Thread | 汇总多个 worker 状态 | 群聊写 `AssistantMessage`；`maker = Secretary` | 可创建 report Delivery 给上级 Thread | 不投给 Codex | 不进 |
| Group Thread -> Codex | 群聊里 `@codex-a` | 群聊保留原消息；`maker` 是真实发言者 | Secretary/router 创建 `Delivery(type=mention_dispatch)` | `projectedRole = user`；只投递给目标 Codex | 非自动时可进待确认 |
| Worker A -> Worker B | 横向请求协作 | 不直接互写 transcript；A 所在线程写请求，父级/Secretary 线程写路由记录 | 经 Secretary 创建 Delivery 给 B | B 看到的是 Secretary/router 投递的 user payload | 越权或冲突时进 |

`Secretary + Codex` 这条线的统一解释：

```text
Pod 中：
  Secretary 永远是 Secretary maker，通常编码为 AssistantMessage 或 system event。

Runtime 中：
  下级 Secretary 根据 Codex 反馈生成 runtime intent。
  runtime intent 经过 MessageProjection 后变成 Codex 的 user/tool input。

审计中：
  记录 decisionBy/sourceMaker = Secretary，onBehalfOf = User WebID。
```

所以不要在 Pod 里把 Secretary 派发伪造成 `UserMessage`。如果 UI 想表达“Secretary 代表你说”，用 AssistantMessage 文案和 `onBehalfOf` metadata 表达；如果 runtime 需要 `user` role，由 projection 层负责。

## 私聊

私聊是 Secretary 和一个目标 runtime/worker 的工作线程。

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
  sourceThread = group thread
  sourceMessage = group message
  targetThread = codex-a private/runtime thread
  targetSession = codex-a runtime session
  targetAgent = Secretary or worker identity
  projectedRole = user
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

## 跨会话沟通

跨会话沟通统一走 `Delivery / Handoff`，不要直接改对方 transcript。

```text
source Thread/Session
  -> Delivery envelope
  -> target Thread/Session
  -> target runtime receives projected message
```

最小字段：

```ts
type Delivery = {
  sourceThread: string
  sourceSession?: string
  sourceMessage?: string
  goal?: string
  steer?: string
  targetThread: string
  targetSession?: string
  targetAgent: string
  routedBy: string
  coordinationId: string
  projectedRole: 'user' | 'system' | 'assistant'
  visibility: 'private' | 'group' | 'report'
  status: 'pending' | 'delivered' | 'loaded' | 'consumed' | 'failed' | 'cancelled'
  payload: string
  contextPack?: string
  contextPackHash?: string
  summary?: string
  createdAt: string
  consumedAt?: string
}
```

分治、派发、上升、横向沟通都用同一套机制：

- `派发`：父级 Secretary 创建 Task + Delivery 给下级工作现场。
- `上升`：子级 Secretary 发布 Report Delivery 给父级 Thread。
- `横向沟通`：默认经共同父级 Secretary 路由，不鼓励 worker 之间直接网状互发。

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

- `Delivery.payload`：本次投递的任务包或 follow-up。
- `Delivery.contextPackHash`：可缓存上下文前缀。
- `Delivery.goal`：稳定目标和验收条件。
- `Delivery.steer`：短期纠偏。
- `Delivery.delegatedResponse`：代理确认或代理输入。

Child Secretary 处理 Codex 反馈时也是同一套机制：

```text
Codex runtime event
  -> append/message projector 写入 child work Thread
  -> child Secretary 在 Secretary+Codex 聊天里看到 Codex AssistantMessage
  -> 必要时 tool.getRuntimeEvent / tool.getDelivery / tool.getGoal 取原始细节
  -> child Secretary decides next action
  -> Delivery(type=runtime_followup) or delegated_response
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
type RuntimeMessageProjection = {
  runtimeEvent: string
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
| `delivered` | 目标 Thread/Session 已看到 notice |
| `loaded` | child Secretary 或 adapter 已通过 tool 读取完整内容 |
| `consumed` | 已生成 runtime intent 或 report |
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

auto 模式不是“所有消息自动广播给所有 worker”，而是用户先授予一段自动执行策略，然后 Secretary 在策略约束内代替用户确认，自动创建 Task、Delivery 和 Session。

auto 模式下的确认主体是 Secretary，但语义上是用户授权后的代理确认或代理输入：

```text
decisionBy = Secretary Agent URI
onBehalfOf = User WebID
decisionSource = autoPolicy
```

也就是说，worker 或 runtime 收到的是“已确认 / 已填写”的操作，不需要再次等用户点按钮；但审计里必须能看出这次响应是 Secretary 依据哪条 auto policy 代用户做出的。

| 模式 | 行为 | 需要用户介入 |
| --- | --- | --- |
| `manual` | 用户显式创建 task、启动 session、投递消息 | 每次派发/启动都需要 |
| `assisted` | Secretary 可以建议分治、生成 task plan、准备 delivery | 启动 runtime 或高风险操作前确认 |
| `auto` | Secretary 可在 policy 内自动分治、派发、启动/恢复 session、收集报告，并代替用户确认普通操作 | 超出 policy、预算或风险边界时才问用户 |
| `autopilot` | 用户授予更长时段目标后，Secretary 按预算循环执行、验证，并持续代替用户确认 policy 内操作 | 只在策略、预算或风险边界触发用户确认 |

auto 模式必须记录：

- `autoPolicy`：允许自动做什么。
- `budget`：时间、token、并发数、成本。
- `concurrencyLimit`：每一级最多并发几个下级任务。
- `riskGate`：哪些动作必须审批。
- `delegatedResponse`：Secretary 是否可代替用户确认或输入，以及响应时要写入的 `decisionBy / onBehalfOf / decisionSource / valueSource`。
- `contextPolicy`：可共享哪些上下文，是否允许读取 sibling report。
- `stopCondition`：何时停止、上升或询问用户。

auto 模式中的上下文投递仍然遵守可见性规则。Secretary 可以读取任务状态和报告来做路由，但 worker 不能因为 auto 模式而自动看到兄弟 session 的完整 transcript。

auto 模式的边界是 policy，不是按钮。只要动作落在 policy 内，Secretary 就应该直接确认并继续推进；如果动作越界，才上升给用户。

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
  "onBehalfOf": "https://user.example/profile/card#me",
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
  "onBehalfOf": "https://user.example/profile/card#me",
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

- `Workspace` 表示用户选择的 Pod folder、本机 folder 或具体 worktree；Repository 是被 workspace 关联的元信息，不是 workspace kind。
- 默认 Secretary Workspace 是当前用户 Pod；这不是 Agent Home，只是默认执行现场。
- 如果 AI runtime 在 client，本地工具不能假设 Pod 是文件夹，必须通过 xpod CLI 访问 Pod 数据。
- 如果 AI runtime 在 server/xpod，Pod storage 可以直接作为本地目录暴露给 runtime；这时 `grep` / `rg` 这类文件工具可以作为实现细节使用，但对产品层仍应回传 URI、resource type 和命中片段。
- `client/server` 是 Agent runtime adapter 偏好，不是 Workspace 资源的持久身份。切换它不应改写 workspace URI，也不应把 Agent Home 搬进 workspace。
- 如果 workspace 关联 git repository，多 session 默认创建不同 worktree。repo 根目录执行也按 worktree 处理，只是 `folderPath === repoPath`。
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
/auto manual|assisted|auto|autopilot
/status
/approve
/report
```

## 数据落点

第一版实现可以按“先 metadata，后正式 resource”推进，但语义必须先稳定。

| 能力 | 第一版落点 | 后续正式化 |
| --- | --- | --- |
| `Goal` | Task metadata 或 Thread metadata | `goalResource` 或 Task 子资源 |
| `Steer` | Delivery metadata 或 latest runtime instruction | `steerResource` 或 Delivery 子资源 |
| `Delivery` | 新 shared model resource；若未 ready，先用 message richContent block + metadata mirror | `deliveryResource` |
| `ContextPack` | runtime 本地 cache + Pod URI/hash 引用 | `contextPackResource` 或 Task/Session snapshot |
| `DelegatedResponse` | approval/audit/inbox + message richContent block | approval/audit 结构化字段 |
| `MessageProjection` | runtime adapter 内部记录 + audit entry | projection/audit shared helper |

不要为了赶 UI 在 React 组件里私造 predicate。跨端语义进入 `@undefineds.co/models`，Web/TUI/CLI 只做协议适配和展示。

## 底层能力优先级

优先级从高到低：

1. Runtime session 变成 Agent-aware：记录 `agent / agentHome / thread / workspace / folderPath / tool`。
2. Delivery/Handoff 资源：支持跨 Thread/Session 投递和 role projection。
3. Task 资源：支持分治、状态、验收条件、上升报告。
4. Context policy：定义群聊、私聊、runtime transcript 的默认可见性和共享动作。
5. Worktree 管理：同 repo 多 session 自动分配 worktree。
6. Auto policy：manual / assisted / auto / autopilot 的权限、预算、并发、风险门。
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
- 跨会话只走 Delivery/Handoff，不直接互改 transcript。
- ContextPack 有稳定 prefix 和动态 suffix，`Goal` 进入 prefix，`Steer` 进入 suffix。
- auto 模式有结构化 `DelegatedResponse`，同时覆盖选择型确认和输入型确认。
- audit 可还原代理语义：`decisionBy = Secretary`、`onBehalfOf = User`、`decisionSource = policy`。
- TUI 不需要新模型，只调用同一套 headless API。
- 第一版允许 metadata 过渡，但正式共享语义必须沉到 `@undefineds.co/models`。
