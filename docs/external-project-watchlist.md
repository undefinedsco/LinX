# External Project Watchlist

Status: active
Last reviewed: 2026-06-04

这个文档持续跟进 LinX 需要观察的外部项目。它不是产品契约，也不是需求池；被采用的结论必须再沉淀到对应功能文档或 `docs/external-references.md`。

## Scope

关注会影响这些方向的项目：

- Symphony / Secretary / worker 的系统演进控制面。
- agent runtime governance、执行监督、防跑偏、checkpoint、resume、telemetry。
- Issue / Task / Run / Report / Evidence 等工作管理语义。
- coding agent 后端、subagent、工作区、审批、投递和验收。
- Chat UI、tool call UI、长任务状态展示。
- Solid / Pod / RDF 互操作参考。

不跟进普通模型榜单、纯 prompt 技巧、一次性 demo、没有可复用产品语义的 UI clone。

## Tracking Rules

- 只记录可追溯事实：repo、官方文档、release、commit、benchmark report、公开文章。
- `Current Reading` 是当前判断，不是永久结论；判断必须带 `Last Checked`。
- 如果外部项目改变了我们的设计判断，要更新对应 LinX 设计文档，而不是只改这个清单。
- fast-moving 项目至少在做 Symphony / auto / backend / worker 决策前复查一次。

## Watch Levels

- `active`: 高相关，做相关设计前必须复查。
- `periodic`: 有参考价值，月度或功能涉及时复查。
- `candidate`: 只知道可能相关，证据不足。
- `archived`: 已确认不再主要跟进，保留避免重复调研。

## Active Watch

### Coding Worker Benchmark Baselines

- Watch Level: `active`
- Sources:
  - OpenAI GPT-5.5 release: https://openai.com/index/introducing-gpt-5-5/
  - DeepSeek V4 model card / technical report: https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash
  - Step 3.7 Flash official page: https://static.stepfun.com/blog/step-3.7-flash/
  - Step 3.7 Flash README: https://github.com/stepfun-ai/Step-3.7-Flash
- Last Checked: 2026-06-05
- Scope:
  - These are model/vendor-reported baselines for worker selection and Symphony evaluation planning.
  - They are not LinX evaluation results. LinX results must still be produced by our own run logs, patches, acceptance output, token/cost data, and evidence package.
- Coding / terminal metrics:

  | Model / mode | SWE-Bench Pro / SWE Pro | SWE Verified | Terminal-Bench | Notes |
  | --- | ---: | ---: | ---: | --- |
  | GPT-5.5 | 58.6 | not reported on source page | 82.7 on Terminal-Bench 2.0 | OpenAI release page; also reports Expert-SWE internal 73.1. |
  | DeepSeek V4 Pro Max | 55.4 | 80.6 | 67.9 on Terminal-Bench 2.0 | DeepSeek official model card, max reasoning mode. |
  | DeepSeek V4 Pro High | 54.4 | 79.4 | 63.3 on Terminal-Bench 2.0 | DeepSeek official model card. |
  | DeepSeek V4 Pro Non-think | 52.1 | 73.6 | 59.1 on Terminal-Bench 2.0 | DeepSeek official model card. |
  | DeepSeek V4 Flash Max | 52.6 | 79.0 | 56.9 on Terminal-Bench 2.0 | DeepSeek official model card, max reasoning mode. |
  | DeepSeek V4 Flash High | 52.3 | 78.6 | 56.6 on Terminal-Bench 2.0 | DeepSeek official model card. |
  | DeepSeek V4 Flash Non-think | 49.1 | 73.7 | 49.1 on Terminal-Bench 2.0 | DeepSeek official model card. |
  | Step 3.7 Flash | 56.3 | not directly reported in top comparison panel; README reports 76.3 with Advisor and 73.7 without Advisor in its cost chart context | 59.5 on Terminal-Bench 2.1 | StepFun official page / README. |
  | Step 3.7 Flash + Advisor | not reported for SWE Pro in source page | 76.3 | not reported | StepFun page frames this as small executor plus larger advisor escalation. |

- Cross-source caveats:
  - StepFun's top comparison panel reports DeepSeek V4 Flash as 55.6 on SWE-Bench Pro and 62.0 on Terminal-Bench 2.1. The page explicitly says DeepSeek V4 Flash metrics come from StepFun internal testing and that Kimi/GPT/Claude numbers rely on official Terminal-Bench 2.0 reports. Treat the DeepSeek official model-card rows above as the authoritative DeepSeek baseline, and the StepFun panel as same-page comparative context.
  - Terminal-Bench 2.0 and 2.1 are not guaranteed interchangeable. Do not subtract scores across versions without a caveat.
  - Vendor reports mix different harnesses, reasoning budgets, and sometimes advisor/scaffold strategies. Use these as target references, not controlled comparisons.
- Current Reading:
  - SWE Pro numbers are relatively compressed: GPT-5.5 58.6, DeepSeek V4 Pro Max 55.4, DeepSeek V4 Flash Max 52.6, Step 3.7 Flash 56.3. That benchmark rewards issue-to-patch competence in repository code, where strong open/flash models can often localize and patch when the issue is clear and the harness is stable.
  - Terminal-Bench separates models more sharply because it stresses long-horizon command-line execution: planning, shell literacy, environment state tracking, iterative debugging, tool output interpretation, recovery after failed commands, and sustained instruction adherence. Those are precisely the behaviors Symphony cares about when a worker is left running under supervision.
  - The large GPT-5.5 vs DeepSeek/Step gap on Terminal-Bench does not mean DeepSeek/Step are bad coding workers. It means they likely need stronger supervisor steering, clearer checkpoints, smaller task slices, and no-progress detection in LinX.
- LinX Evaluation Implication:
  - For the planned `GPT-5.5 supervisor + DeepSeek/Step worker` experiment, use SWE/SWE Pro-like tasks for patch quality and Terminal-Bench-like tasks for runtime autonomy.
  - Report both `resolved` and process metrics: steer count, no-progress recovery count, retry count, human assist, wall time, token/cost, and final evidence completeness.
  - A good Symphony result is not just matching GPT-5.5 solo on SWE-style patch success; it must also close the Terminal-Bench-style autonomy gap with supervision at lower cost.

### Mem0 — Production Memory Infrastructure

- Watch Level: `active`
- Source: https://github.com/mem0ai/mem0
- Paper: https://arxiv.org/html/2504.19413
- Research page: https://mem0.ai/research
- Last Checked: 2026-06-07
- Scope:
  - 48K stars，Apache 2.0，最广泛部署的 Agent 记忆系统。
  - 新算法（2026.04）：LongMemEval 94.8、LoCoMo 91.6、BEAM 1M 64.1、BEAM 10M 48.6。
  - 每次检索不到 7K token（full-context 方案 25K+）。
  - 单次分层提取 + 多信号检索（语义向量+关键词+时间衰减+图关系）。
  - 集成 21 个 Agent 框架 + 20 种向量存储，可自托管。
- LinX Relevance:
  - 如果 LinX taste 记忆需要生产级存储和检索管线，Mem0 是当前最强选型（LongMemEval 94.8 是所有系统最高公开分）。
  - 但 Mem0 是通用记忆层，不做 taste 特化——需要在 Secretary 层自建判断逻辑。
- Current Reading:
  - 起步阶段不需要——先 Zettelkasten 原子卡片跑通 taste 判断流程。
  - 中等规模（50+ taste 规则）时可作为存储后端引入。
  - 关注它的记忆生命周期 API（置信度评分、衰减、合并），将来和 taste 的「创建→确认→衰减→遗忘」对齐。

### Hindsight — Agent Memory That Learns

- Watch Level: `active`
- Source: https://github.com/vectorize-io/hindsight
- Paper: https://ar5iv.labs.arxiv.org/html/2512.12818
- Last Checked: 2026-06-07
- Scope:
  - 四网络记忆架构（World / Experience / Opinion / Observation）+ 三个核心操作（Retain / Recall / Reflect）。
  - 开源 20B 模型 + Hindsight → LongMemEval 从 39% 到 83.6%，更大 backbone 到 91.4%。LoCoMo 89.61%。
  - 行为参数（skepticism / literalism / empathy）+ bias-strength 控制推理风格。
  - MIT license，15.8K stars，Python + TypeScript。
- LinX Relevance:
  - 直接对应 Secretary taste 记忆需求：分离「事实」「经历」「观点」「观察」四层和我们的需求高度一致。
  - 行为参数可映射到主理人的判断风格（保守/激进）。
  - 可能过度设计——对「读 AGENTS.md + 记纠正」这个场景，轻量 Zettelkasten 或 LLM Wiki 更合适。
- Current Reading:
  - 生产级 agent memory 最完整参考实现。先观察，不急于集成。如果 LinX taste memory 从 Zettelkasten 起步，Hindsight 的四网络架构可作为升级目标。

### LLM Wiki — Karpathy Pattern + Production Extensions

- Watch Level: `active`
- Sources:
  - Karpathy original: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
  - v2 (agentmemory): https://gist.github.com/benmillerat/537cd1251225cb58ef9b242212528633
  - Implementations: nvk/llm-wiki, kenhuangus/llm-wiki, geronimo-iia/llm-wiki
- Last Checked: 2026-06-07
- Scope:
  - 「不重新推导，让 LLM 维护持久化 Wiki」——三层架构（raw sources → wiki → schema）。
  - v2 扩展：记忆生命周期（置信度评分+遗忘曲线+整合层级）、知识图谱（类型化关系）、混合搜索、事件驱动自动化、结晶化。
  - Schema (AGENTS.md) 是最重要的文件——把通用 LLM 变成有纪律的知识工作者。
- LinX Relevance:
  - 和 LinX 的 AGENTS.md + Pod 存储天然互补。Schema 驱动 + 渐进积累的思路和我们的 taste 记忆方向一致。
  - 纯文件层实现缺少结构化检索——这是 Pod + RDF 可以补的地方。
  - 结晶化（自动把探索过程蒸馏成规则）对应 Secretary 从纠正中学习。
- Current Reading:
  - AGENTS.md 是我们已有的基础设施。LLM Wiki 的 Schema 方法论直接可用——不需要引入新依赖，只优化 AGENTS.md 的写法就能提升主理人的记忆一致性。

### iceCoder

- Watch Level: `active`
- Source: https://github.com/lbiceman/iceCoder
- Last Checked: 2026-06-04

### Online RL / Agent Training Frameworks

- Watch Level: `periodic`
- Sources:
  - OpenClaw-RL: https://github.com/Gen-Verse/OpenClaw-RL (paper: arXiv 2603.10165)
  - P-RLHF: https://github.com/HumainLab/Personalized_RLHF (paper: arXiv 2402.05133)
  - PAHF: arXiv 2602.16173
  - AReaL: https://github.com/inclusionAI/AReaL
  - RetroAgent: arXiv 2603.08561
  - OEL: arXiv 2603.16856
- Last Checked: 2026-06-07
- Scope:
  - OpenClaw-RL：对话即训练——用户回复是天然的 RL 信号。和 LinX 的「聊着聊着就更对味」直接对齐。
  - P-RLHF：per-user reward model。taste 不能按平均偏好训。
  - PAHF：交互即学习信号。per-user memory + per-user training。和卡片=用户词汇表对齐。
  - AReaL：在线 RL 基础设施。proxy gateway 模式——请求走 proxy，自动入训练集。
  - RetroAgent：回顾机制和归因→Thread 天然匹配。
  - OEL：从部署轨迹中提取经验，不依赖线下标注。
- LinX Relevance:
  - 反馈链路累积的偏好对天然是训练数据。冷启动阶段不训模型（数据不够），先走词汇卡片 + system prompt 的 in-context 学习路线。
  - 信号积累到 50+ 偏好对/项目后切 DPO（LoRA adapter 按项目加载）。
  - 在线 RL 的终极目标——需要自托管模型 + proxy gateway。API 模型只能走周期性 DPO。
- Current Reading:
  - 先建信号积累和偏好对构造（Layer 1-2），训练层（Layer 3）等链路跑通再上。
  - 关注 OpenClaw-RL 和 PAHF 的 per-user memory 设计——和 LinX 的卡片系统互补。
- Evidence:
  - Repo created 2026-04-20, pushed 2026-06-04, TypeScript.
  - README describes "Self-hosted runtime governance for tool-using LLM agents".
  - Current feature claims include L1/L2 supervision, TaskGraph, verification gate, checkpoint/resume, file memory, sub-agent delegation, telemetry, and local benchmarks against Claude Code.
- Current Reading:
  - 是的，`lbiceman/iceCoder` 正在做和我们相邻的实现。
  - 它的重点是 coding agent runtime governance：主循环、监督、防跑偏、工具门禁、checkpoint、memory、benchmark。
  - 它不是 LinX 的 Pod/Secretary/群 Reconciler 产品模型，也没有看到 Solid/Pod 权威状态语义。
- Relevance To LinX:
  - 对 Symphony 的 `Execution Control`、worker no-progress 监控、verification gate、checkpoint/resume、telemetry 指标有直接参考价值。
  - 对我们“主理人周期性看 worker 是否原地打转”的设计尤其相关。
  - 对 Pod 权威、跨端同步、Secretary 代用户审批/输入的部分参考价值有限。
- Benchmark Notes:
  - Sources:
    - https://github.com/lbiceman/iceCoder/blob/main/benchMark/md/%E4%B8%89%E5%B9%B3%E5%8F%B0%E5%90%8C%E6%A8%A1%E5%AF%B9%E6%AF%94%E8%AF%84%E6%B5%8B%E4%B8%8E%E8%A3%81%E5%88%A4%E8%AF%84%E5%88%86%E4%BD%93%E7%B3%BB.md
    - https://github.com/lbiceman/iceCoder/blob/main/benchMark/tasks/debug-billing-settlement-03.yaml
    - https://github.com/lbiceman/iceCoder/blob/main/benchMark/reports/debug-billing-settlement.md
    - https://github.com/lbiceman/iceCoder/blob/main/scripts/agent-eval.ts
  - Method:
    - 控制变量：同一模型、同一任务 prompt、同一 sandbox、同一依赖环境和验收脚本，用来比较 runtime / Harness / 工具链差异，而不是比较模型能力。
    - 任务规格：每个 task 用 YAML 固化 `task_id`、prompt、repo、acceptance commands、必须存在/禁止修改文件、allowed/forbidden globs、timeout、max turns、observability 和 scoring hints。
    - 客观成功率：`acceptance.commands` 全部 exit 0，文件约束满足，且没有 human assist。
    - 双轨评分：Gate 0-40 自动算分，Judge 0-60 由独立 LLM 盲评，Composite = Gate + Judge。
    - Gate 维度：验收通过 25、范围合规 8、可构建 4、无泄漏 3；验收失败会封顶等级。
    - Judge 维度：需求完成度、正确性、代码质量、最小改动、验证意识、实现说明，各 0-10。
    - 执行记录：每个 run 记录平台版本、模型参数、prompt hash、human_assist、turns、duration、tool_calls、tokens、关键 diff、验收结果和 implementation record。
    - 汇总指标：SR、Avg Composite、S+A 占比、Avg Turns、Avg Duration、Fallback Rate。
  - Current Reports:
    - `debug-billing-settlement-03` 是 L4+ 长上下文任务：97 个源文件、约 441KB、19 个跨模块逻辑缺陷；报告对比 iceCoder Harness adaptive 和 Claude Code，同用 MiniMax-M3。
    - 该报告里两者都通过 19/19 探针；iceCoder Composite 93，Claude Code Composite 92；1 分差主要来自 D6 实现说明可审计材料不对称，不代表代码能力拉开一档。
    - 报告也主动标出方法弱点：prompt 已给 19 条现象线索，所以不能完全代表无提示盲探能力。
  - Direct Run Status:
    - As of 2026-06-04, the public repository exposes `benchMark/tasks`, `benchMark/md`, and `benchMark/reports`, but not the referenced `benchMark/repos` sandboxes.
    - GitHub API returns 404 for `benchMark/repos` on both `main` and `dev`; npm registry has no public `ice-coder@1.0.0` package.
    - Therefore LinX cannot honestly run the exact published benchmark suite from public artifacts alone. We can either obtain the missing sandbox repos, or recreate compatible local fixtures from the task YAML and reports and label them as LinX-reconstructed fixtures.
  - LinX Adaptation Candidate:
    - 借鉴 task YAML，但把 LinX 任务规格扩展为 `Issue/Spec/Task/Run/Delivery/Evidence` 绑定，不只看代码 patch。
    - Gate 应同时覆盖代码验收、Pod 投影正确性、control record freshness、scope/approval 安全、worker delivery 完整性和可恢复性。
    - Judge 应盲评 `task brief + diff + control-record delta + evidence package + runtime stats`，不暴露 backend 名称。
    - Symphony 专项应增加 `no_progress_detected`、`steer_applied`、`stale_context_incident`、`approval_handled_by_secretary`、`delivery_acceptance` 等过程指标。
    - 分数报告应是派生 report，不作为共享事实源；原始事实仍来自 Audit、Run/RunStep、Delivery、Evidence 和控制记录。
  - Caveats:
    - 不要只用带强线索的 bugfix 任务；需要 hold-out、无提示探索、多 worker、approval/input blocker、Pod projection failure、doc/code drift 等任务族。
    - LLM judge 只能补充非客观质量，不应替代 acceptance、审计链、真实运行结果和用户验收。
    - 如果不同 backend 的日志可观测性不对称，D5/D6 类指标会偏向可观测性更强的平台，必须单独标注。
- Watch Signals:
  - Supervisor 是否从 L1/L2 扩展成多 agent controller。
  - TaskGraph 是否变成长期 Issue/Task/Run 控制面，而不仅是 runtime context。
  - file memory 是否出现结构化知识/项目 wiki/设计实现同步。
  - benchmark 是否公开可复现任务、judge、同模比较和失败样本。
  - 是否接入 MCP、外部 coding backend、approval/grant 或多人协作。
- Next Check:
  - 在改 Symphony worker supervision、goal/no-progress detection、checkpoint/resume 或 benchmark 体系前复查 README、docs、recent commits 和 benchmark reports。

### OpenAI Symphony / Codex Orchestration

- Watch Level: `active`
- Source: https://openai.com/zh-Hans-CN/index/open-source-codex-orchestration-symphony/
- Local Detail: `docs/external-references.md`
- Last Checked: local baseline only
- Current Reading:
  - 主要参考 `Issue -> Workspace -> Agent Session -> Report/Review` 的长跑 orchestration 形态。
  - 不直接照搬为 LinX 的聊天协议、Pod 模型或 worker runtime。
- Watch Signals:
  - 是否出现公开 runner protocol、workspace lifecycle、review artifact、approval/input event contract。
  - Codex subagent / app-server / ACP 是否和 Symphony 收敛。

### Codex / Claude Code Subagents And Teams

- Watch Level: `active`
- Local Detail: `docs/agent-collaboration-model.md`
- Last Checked: local baseline only
- Current Reading:
  - 作为 backend runtime 能力参考，而不是 LinX 产品层 Chat/Thread/Message 模型。
  - 重点观察 fan-out/fan-in、child thread、summary merge、mailbox、approval/input handling 和 resume。
- Watch Signals:
  - 是否支持长跑 worker、goal mode、leader-worker steering、Delivery-like final package。
  - 是否公开稳定 ACP / app-server 协议，降低 LinX adapter 成本。

### Multica

- Watch Level: `active`
- Local Detail: `docs/agent-collaboration-model.md`
- Last Checked: local baseline only
- Current Reading:
  - 参考价值在 agent as workspace member、issue/comment/assignment/status、daemon/runtime 分离。
  - 不直接作为 Pod 语义或 LinX Thread 协议来源。
- Watch Signals:
  - workspace member model、agent assignment、private/local daemon boundary、multi-runtime registration。
  - 是否形成可迁移的 issue/project 管理和 agent status model。

### OpenClaw

- Watch Level: `active`
- Source: https://github.com/openclaw/openclaw
- Local Detail: `docs/external-references.md`
- Last Checked: local baseline only
- Current Reading:
  - 对 approval decision、tool event streaming、platform command policy 有参考价值。
  - 多 IM routing、A2UI canvas、极简 transcript event 不适合作为 LinX core。
- Watch Signals:
  - approval/grant 是否从本地 allowlist 走向可审计策略资源。
  - tool/lifecycle stream 是否出现更清晰的 gap detection、recipient capability、节流策略。

## Periodic Watch

### Chat UI References

- Watch Level: `periodic`
- Sources:
  - Cherry Studio: https://github.com/CherryHQ/cherry-studio
  - LobeChat: https://github.com/lobehub/lobe-chat
  - assistant-ui: https://github.com/assistant-ui/assistant-ui
- Local Detail: `docs/external-references.md`
- Current Reading:
  - 主要参考 Markdown、tool call、artifact、thinking/status、branch conversation、theme and message action UI。
  - 不作为 LinX 的 data model 来源。
- Watch Signals:
  - 长任务状态展示、tool result folding、artifact preview、branch/thread UI、mobile chat ergonomics。

### Solid Ecosystem

- Watch Level: `periodic`
- Source: https://github.com/SolidOS
- Local Detail: `docs/external-references.md`
- Current Reading:
  - 作为 Solid 互操作和社区 vocabulary 参考。
  - LinX 共享数据面仍以 `@undefineds.co/models` 为权威。
- Watch Signals:
  - Chat/thread/message、notification、ACL、profile/contact、file-backed metadata 的社区惯例变化。

## Candidate / Needs Triage

### CodeBuddy

- Watch Level: `candidate`
- Last Checked: not refreshed
- Current Reading:
  - LinX backend adapter 已把 CodeBuddy 作为可能 backend 提及，但这里还没有形成外部项目事实卡。
- Next Check:
  - 找到官方 CLI/runtime/API 文档，确认是否支持 ACP、long-running session、approval/input events、resume、workspace isolation。

## Archived / Low Relevance

### ICEcoder

- Watch Level: `archived`
- Source: https://github.com/icecoder/ICEcoder
- Last Checked: 2026-06-04
- Current Reading:
  - 这是老牌 browser IDE 项目，repo archived，最近 push 为 2023-12-14。
  - 和当前 Symphony / agent runtime governance 重叠很低。
- Reason:
  - 名字容易和 `lbiceman/iceCoder` 混淆，保留记录避免重复调研。

## Follow-up Checklist

每次复查 active 项目时补齐：

- 最近 10 个 commits / releases 是否改变产品判断。
- README / docs 是否新增 controller、worker、approval、memory、benchmark、telemetry、workspace 语义。
- 是否有可复现 benchmark 或真实失败样本。
- 是否有能直接借鉴到 LinX 的 UI、状态机、schema、adapter、test harness。
- 是否需要把结论迁移到 `docs/agent-collaboration-model.md`、`docs/symphony-system-evolution-control-plane.md`、`docs/approval-grant-design.md` 或功能 spec。
