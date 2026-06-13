# Taste / Memory / Personalization Benchmark Survey

Status: active
Last reviewed: 2026-06-07

梳理与 LinX Secretary（主理人）taste 记忆和判断能力相关的所有已知 benchmark。按领域分组，标注和 LinX 场景的关系。

---

## Benchmark 全景矩阵

| Benchmark | 领域 | 测什么 | 和 LinX Taste 场景的 Gap |
|---|---|---|---|
| LongMemEval | 记忆 | 信息提取、多会话推理、时间推理、知识更新 | 测事实记忆，不测 taste 判断 |
| Memora | 记忆 | 多周-多月对话中的记忆整合与遗忘 | 测持久性，不测偏好 |
| PerMem-Bench | 记忆 | 个性化记忆策略学习 | ⭐ 最接近——但测的是「存什么策略」，不是「判断」 |
| MemoryCD | 记忆 | 跨域终身个性化（Amazon Reviews 真实数据） | 测偏好记忆，但限定推荐场景 |
| AlpsBench | 记忆+偏好 | 真实对话个性化记忆和偏好对齐 | ⭐ 接近——但侧重信息管理而非判断 |
| MemoryAgentBench | 记忆 | 多轮交互中的渐进式记忆 | 测记忆积累，不测 taste |
|---|---|---|---|
| GUIDEBENCH | 规则遵循 | 遵守规则、规则更新鲁棒性、人类偏好对齐 | ⭐⭐ 规则是结构化 checklist，不是自然语言大原则 |
| GER-Eval | 判断 | LLM 按 rubric 打分（zero-shot / few-shot） | ⭐⭐ 测判断力，但 rubric 是打分表不是 AGENTS.md |
| JudgmentBench | 判断 | 法律场景中的 rubrics vs pairwise 判断 | 领域太窄 |
|---
| RealPref | 个性化 | 100 用户 profile + 1300 偏好，测偏好跟随 | ⭐⭐⭐ 测偏好跟随，但限定对话推荐 |
| HorizonBench | 个性化 | 长期偏好演化（月级别） | ⭐⭐⭐⭐ 唯一测 taste 演化的 benchmark |
| Personalized RewardBench | 个性化 | 奖励模型按用户 profile 打分 | ⭐⭐⭐ 测「按你的标准打分」 |
| PrefEval | 个性化 | 显式/隐式偏好跟随，多会话上下文 up to 100K | ⭐⭐⭐ 测偏好跟随，但限定领域 |
|---|---|---|---|
| Subjective Code Preferences | 代码偏好 | 复杂度、注释、模块化、可读性四轴 | ⭐⭐⭐⭐ 最接近代码 taste 评测 |
| CodePrefBench | 代码偏好 | 正确性、效率、安全、人类偏好 | ⭐⭐⭐ 含人类偏好维度 |
| VibeCheck | 代码感觉 | 代码的「感觉」——对了就是对了 | ⭐⭐⭐⭐ 直接挑战功能正确性之外的判断 |
| AesCode-358K | 代码美学 | 排版、命名、结构美学 | ⭐⭐⭐ 测美学不测个性化 |
|---|---|---|---|
| TASTE | 设计偏好 | 字型、美学、空间、调性——5 设计师多维度 | ⭐⭐⭐⭐ 设计专属，但只测平均偏好 |
| WritingPreferenceBench | 写作偏好 | 1800 条人类标注，纯主观偏好 | ⭐⭐⭐⭐ 测 correctness 被控后的纯 taste |
| AesEval-Bench | 设计审美 | 字型、布局、颜色、图形四维 | ⭐⭐⭐ 测美学不测个性化 |
|---|---|---|---|

---

## 记忆系统实际 Benchmark 成绩

上面是「benchmark 有哪些」——下面是在这些 benchmark 上，具体记忆系统跑出来的真实数字。

| 系统 | LongMemEval | LoCoMo | BEAM 1M | BEAM 10M | Tokens/检索 |
|---|---|---|---|---|---|
| **Mem0 (新算法, 2026.04)** | **94.8** | **91.6** | 64.1 | 48.6 | ~6.9K |
| **Hindsight (20B backbone)** | 83.6 | 85.7 | — | — | — |
| **Hindsight (更大 backbone)** | 91.4 | 89.6 | — | — | — |
| Full-context GPT-4o | ~75 | ~70 | — | — | 25K+ |

> 注：Mem0 和 Hindsight 配置不同（backbone 模型、推理预算），不可直接横向比较。数据来源：Mem0 官方 research page、Hindsight 论文。

关键观察：
- Mem0 在 LongMemEval 94.8 是所有记忆系统的最高公开分，每次检索不到 7K token
- 最大涨幅在时间推理（+29.6）和多跳推理（+23.1）——正是 taste 记忆最需要的能力
- Full-context 方案耗 25K+ token/检索，是 Mem0 的 3-4 倍

---

## 按 LinX 场景相关性排序

### 第一梯队：直接相关

**1. HorizonBench** (arXiv 2604.17283, 2026.04)
- 测什么：用户偏好在数月间的演化，track 偏好何时因生活事件改变
- **特色：唯一提供因果溯源（provenance）数据的 benchmark。** 合成但不依赖简单模板——使用数据生成器产出自然对话，同时保留偏好变化的 ground-truth 因果链（"用户从喜欢 X 变成喜欢 Y，$因为$ 发生了事件 Z"）
- 和 LinX 的关系：⭐⭐⭐⭐⭐ 唯一测「taste 会变，模型跟不跟得上」+ 唯一提供因果溯源 ground-truth
- Gap：限定生活场景，不是 Agent 工作流审批。因果溯源是 benchmark 内置的（作者知道答案），不是让模型自己推断的
- 对 LinX 的启发：HorizonBench 的 provenance 数据结构可以直接参考——\"偏好变化 → 触发事件 → 时间戳\" 的三元组。验证归因深度时，可以用同样的结构：\"纠正发生 → 根因事件 → 时间戳\"

**2. Subjective Code Preferences** (arXiv 2605.25296, 2026.05)
- 测什么：复杂度、注释风格、模块化、可读性——四个代码主观偏好轴，25 位工程师验证
- 和 LinX 的关系：⭐⭐⭐⭐⭐ 最接近「代码 taste 判断」的评测
- Gap：测的是静态偏好分类，不是「给 AGENTS.md → 面对具体产出 → 判断」

**3. PerMem-Bench** (arXiv 2605.25535, 2026.05)
- 测什么：LLM 记忆系统能否学习个性化记忆策略——不同用户该存不同东西
- 和 LinX 的关系：⭐⭐⭐⭐ 测的就是「不能用通用策略，要按人定制」
- Gap：测存什么，不测判断什么

**4. VibeCheck** (ICLR 2026)
- 测什么：代码产出是否「对味」——读起来对不对、意图是否保留、是否干净
- 和 LinX 的关系：⭐⭐⭐⭐ 直接定义「功能正确性之外的感觉」
- Gap：仍是生成评估，不是审批判断

### 第二梯队：结构相关

**5. RealPref** (ICLR 2025)
- 测什么：100 个用户 profile、1300 条偏好、三种提问形式
- Gap：场景限对话推荐

**6. Personalized RewardBench** (arXiv 2604.07343)
- 测什么：奖励模型能否按用户 profile 给分（而不是给「平均高分」）
- Gap：测打分不测判断

**7. WritingPreferenceBench** (arXiv 2510.14616)
- 测什么：correctness 被控制住后的纯写作风格偏好（中英双语言）
- Gap：仅限写作

### 第三梯队：参考价值

**8. GUIDEBENCH** (ACL 2025)
- 测什么：LLM 遵守规则 + 规则更新后鲁棒性
- Gap：规则是结构化 checklist，不是自然语言大原则

**9. LongMemEval / Memora / AlpsBench**
- 测什么：长期记忆的各种能力
- Gap：测事实记忆，不是 taste 记忆

---

## 核心缺口

把现有 benchmark 叠上去，画出来的空白区：

```
                   已有                         空缺
              ┌──────────┐              ┌──────────────┐
 代码偏好      │ SubjCode │              │ 给"我的"AGENTS.md│
              │ CodePref │              │ → 产出对不对劲   │
              │ VibeCheck│              │  = 你的场景      │
              └──────────┘              └──────────────┘
              ┌──────────┐              ┌──────────────┐
 偏好跟随      │ RealPref │              │ 跨领域通用 taste│
              │ HorizonB │              │ 判断（不限定     │
              │ PrefEval │              │ 推荐/写作/代码)  │
              └──────────┘              └──────────────┘
              ┌──────────┐              ┌──────────────┐
 记忆策略      │ PerMem-B │              │ taste 记忆系统  │
              │ Memora   │              │ 的自评估方法    │
              └──────────┘              └──────────────┘
```

---

## 关于「能否用现有 benchmark 衡量 LinX 产品化水平」

### 直接回答：不能。

原因：

1. **所有现有 benchmark 测的是「模型能不能」，不是「产品好不好」。**
   - 即使 LinX 在 LongMemEval 上拿 91.4%（Hindsight 的水平），这只能证明记忆管线没问题——不能证明用户觉得主理人对味。

2. **没有一个 benchmark 测「给自然语言大原则 → 面对具体产出 → 判断对不对味」。**
   - 最接近的 Subjective Code Preferences 只测静态分类，不测「从 AGENTS.md 到具体判断」这步。
   - 最接近的 HorizonBench 只测偏好演化，不测 Agent 审批场景。

3. **Taste benchmark 的缺失不是偶然的。**
   - Taste 本质上是用户特定的。一个 bench 对你准，对我可能不准。
   - 学界还在从「平均偏好」走向「个人偏好」，没走到「个人长期 taste 积累 → Agent 决策」。

### 可以部分衡量什么

| LinX 产品能力 | 能用哪个 benchmark 部分验证 |
|---|---|
| 记忆管线是否可靠 | LongMemEval（会话间事实保持） |
| 记忆策略是否个性化 | PerMem-Bench（存什么对你有用） |
| 代码风格判断力 | Subjective Code Preferences（四轴分类） |
| 偏好跟随是否稳定 | RealPref / HorizonBench（长期一致性） |

### 最务实的自评估方案

不需要等学界。20-30 条自建判断对即可：

```
1. 写出你的 AGENTS.md（5-8 条大原则）
2. 每条原则造 3-4 个判断对：
   - 产出 A：对味 ✅
   - 产出 B：违反原则 ❌
   - 产出 C：陷阱——看起来违反但其实是正确的边界情况
3. 跑主理人，测：
   - 召回率（找不找得到 violation）
   - 精确率（有没有误报）
   - 边界判断力（陷阱对不对）
4. 积累真实审批日志后，对比：
   - 主理人判断 vs 你的实际判断（precision/recall 随时间变化）
   - 纠正后是否真的学到了（同类场景第二次的准确率）
```

---

## 建议：在 product 层面定义自己的成功指标

跟 benchmark 无关，用户能感知的。分两层：

### 过程指标（监控系统运行是否健康）

| 指标 | 定义 |
|---|---|
| **标注准确率** | 消息被标注后，用户在下游通过行为间接修正标注的比例。越低越好 |
| **信号压缩比** | Thread 消息数 / 总消息数。标注层是否有效过滤了噪音 |
| **Thread 断裂率** | 一颗珠子找不到前因的比例。标注层漏了关键信号 |

### 核心指标（衡量用户是否觉得对味）

| 指标 | 定义 |
|---|---|
| **采纳率** | 主理人建议的 revise/reject 中，用户点了「接受」的比例 |
| **纠正衰减** | 同类场景第一次纠正 vs 第 N 次纠正的频率曲线 |
| **误报率** | 主理人说「不对」但用户说「过」 |
| **漏报率** | 用户手动纠正但主理人没提前标出来 |
| **冷启速度** | 从 AGENTS.md 到主理人给出第一个有效判断所需的纠正次数 |
| **归因准确率** | 主理人判断「这次纠正是因为历史哪条对话」，用户确认的比例 |

> 归因准确率没有 ground truth——用户确认的那一刻才暴露。用户说「对，就是因为上次那个」→ 归因正确。用户说「不对，不是因为那个」→ 归因错误。这是产品指标，不是实验室指标。

> 这些指标比任何 benchmark 都更能回答「产品化水平」的问题——因为它们直接来自用户行为，不是实验室数据。

---

## 归因（Failure Attribution）相关 Benchmark

归因评测独立成节，因为它对主理人的反馈链路串珠至关重要——不仅需要串起因果链，还需要判断归因准确性本身。

| Benchmark | 出处 | 测什么 | 和 LinX 的 Gap |
|---|---|---|---|
| **Who&When / TraceElephant (ACL 2026)** | ag2ai/Agents_Failure_Attribution, ICML 2025 Spotlight | 多 Agent 系统中哪一步、哪个 Agent 导致了失败。含完整轨迹（输入+输出+上下文） | 测 failure attribution，不测 taste feedback 因果链。但提供了归因准确率的评估框架——who + when |
| **Multi-Perspective Failure Attribution (ACL 2026)** | arXiv 2603.25001 | 同一个失败可以有多个合理的归因——挑战「单一根因」假设 | ⭐ 很关键：用户的纠正也可能有多个合理归因。归因不是二元的 |
| **AgentHallu (2026.01)** | arXiv 2601.06818 | 多步推理中哪一步产生了幻觉，幻觉沿轨迹传播 | 测幻觉归因，不测 taste 归因 |
| **CausalFlow (2026.05)** | arXiv 2605.25338 | 失败轨迹 → 反事实修复 → 可复用监督信号 | 测修复，不测归因准确性本身 |
| **AgentTrace (2026.03)** | arXiv 2603.14688 | 因果图 + 从错误表现回溯 → 候选根因排序 | 测系统故障因果图，不测 taste 因果 |
| **StepFinder (2026.06)** | arXiv 2606.03467 | 时序语义框架，在长轨迹中定位失败步 | 框架思路可参考，但领域不同 |

### 归因关键发现

1. **现有归因研究全集中在「系统哪里出错了」**——没有人在研究「用户这次纠正是因为上次哪次对话」。归因的 ground truth 不存在于实验室，只存在于用户确认的那一刻。

2. **Multi-Perspective Failure Attribution 的观点对 taste 归因很关键**——用户的纠正可能不是因为一个原因，可能是多个历史事件叠加的结果。归因不是找唯一根因，是列出所有可能原因并按可信度排序。用户来确认哪个对。

3. **归因准确率本身是一个产品指标，不是一个 benchmark 分数**——主理人归因后，用户确认/纠正的那一刻才暴露 truth。归因准确率 = 用户确认数 / 总归因数。

---

## 归因深度：业界实践对比

现有的在线 RL 项目没有做多步因果链归因。他们止步于单步。

### OpenClaw-RL：因果深度 = 1

```
用户说 "you should have checked the file first"
→ PRM 提取 [HINT_START]check the file first[HINT_END]
→ 注入 prompt 让 teacher model 重生成
→ 用 teacher distribution 蒸馏 student

它在做的事：找到「这句话在纠正上一步」——单步因果。
它没做的事：
  - 把"你应该先检查文件"和两周前的"记住，文件操作前要先 verify"串起来
  - 识别"这是第三次了"指的是哪三次
  - 跨会话归因
```

### PAHF：因果深度 = 1，但多了一种类型

```
"Actually, I like Sprite most now"
→ PAHF 更新 memory：coke → sprite
→ 根因类型：non-stationarity（偏好漂移）

归因只追溯到当前这一步。知道用户口味变了——
但不会去查"上次说喜欢 Coke 是 session 多少、
期间有没有别的信号暗示口味在变"。
```

### RetroAgent：因果深度 > 1，但范围不同

```
回顾性内在反馈：回溯 agent 自己的行为轨迹
step-1 → step-2 → step-3 → failure
→ step-1 是对的，step-2 才是致命的

因果深度 > 1，但限定在单次任务轨迹内。
不跨会话。不跨用户消息。
```

### 汇总

| | 他们有 | 他们没有 |
|---|---|---|
| **因果深度** | step t 和 step t-1 的关系 | msg-201 → msg-35 → msg-29 → msg-12 的多跳链 |
| **归因范围** | 单会话内 | 跨会话、跨数周 |
| **归因类型** | 二元（对/错）或单维（偏好漂移） | 多维：纠正 vs 新词汇 vs 边界精炼 vs 背景上下文冲突 |
| **归因可信度** | 不输出可信度——只有一个归因 | 多个可能归因，按可信度排序，用户确认 |
| **归因源头** | Agent 自己的行为轨迹 | 用户的消息——用户的意图 |

### 正在逼近的中间地带：图/树结构信用分配

OpenClaw-RL 和 PAHF 停在单步，但 2026 年新一批 credit assignment 方法正在向多跳结构靠近——虽然仍限定在单任务轨迹内，但数据结构（图/树/反事实）已经接近 LinX 需要的形态。

**GraphGPO** (arXiv 2605.26684)：
```
把一次任务的多个 rollout 聚合成状态转移图（state-transition graph）
→ 每个状态节点到目标节点的距离 = 图上的最短路径
→ Graph-based advantage = 这次转移让距离缩短了多少
→ 跨 rollout 共享信用信息，不再是独立链

对 LinX 的启发：
如果把"跨会话的 taste 珠子"也建成一个图——
  msg-12（第一次纠正吞异常）
  → msg-29（用户以为修好了）
  → msg-35（其实没修好）
  → msg-201（第三次了）
每个节点之间的因果距离可以计算。GraphGPO 的 graph-based advantage
可以改写成 thread-based attribution score。

局限：GraphGPO 的图是所有 rollout 的并集，rollout 之间是并行的——
不是跨时间的因果链。仍然不能处理"三周前的对话 → 今天的纠正"。
```

**T-STAR** (arXiv 2604.07165)：
```
把所有 rollout 轨迹合并成一棵认知树（Cognitive Tree）
→ 合并功能相同的步骤节点
→ 回溯奖励通过树结构，找到关键分叉点
→ In-Context Thought Grafting：对比成功/失败分支，生成纠正推理

对 LinX 的启发：
"合并功能相同的步骤节点"——这正是 LinX 需要的。
  msg-12 "别吞异常"、msg-35 "上次那种方式也不行"、msg-201 "这是第三次了"
  → 合并成同一个节点：taste:swallowing-exceptions
  → 从 msg-201 回溯到 msg-12 的因果链 = 树上的路径
  → T-STAR 的关键分叉点 = taste 边界精炼的时刻：
    "用户之前接受的产出和现在拒绝的产出，分叉点在哪？"

局限：T-STAR 的树来自同一任务的多条 rollout，节点合并靠功能相似性——
不是跨时间、跨会话的因果链接。
```

**CVT-RL** (arXiv 2606.05263)：
```
政策条件化的反事实贡献（PCCC）估计
→ 删除/语义替换/证据替换/工具输出扰动 → 四种受控干预
→ 冻结参考政策采样后续轨迹 → 隔离单步的因果贡献
→ 不是相关性奖励（"这一步看起来像反思"），是因果估计（"这一步确实改变了成功率"）

对 LinX 的启发：
最严谨的因果方法。对标注层的信号验证有意义：
  标注层判断"msg-201 是因为 msg-35"
  → 反事实检验：如果 msg-35 不存在（删除该纠正），msg-201 还会发生吗？
  → 这不能自动完成，但提供了验证框架

局限：需要冻结参考政策 + 受控重采样——在真实对话中不可行。
只能在事后验证归因，不能实时做。
```

### 汇总：从单步到多步的距离

```
归因方法的进化路径

Level 0 — Trajectory-level（GRPO、DAPO）
  整个 rollout = 一个 reward，所有 step 平均分
  
Level 1 — Step-level single-chain（OpenClaw-RL、PAHF、RetroAgent）
  单步贡献。step t 和 step t+1 的关系
  
Level 2 — Graph/Tree credit assignment（GraphGPO、T-STAR）
  跨 rollout 结构。图/树上分配信用。
  接近 LinX 需要的数据结构——但限定单任务
  
Level 3 — Counterfactual step contribution（CVT-RL）
  受控干预 + 因果估计。最严谨。
  LinX 可用于事后验证归因，但无法实时
  
Level X — Cross-session causal chain → 已被版本记录替代
  LinX 不再需要这个层级。
  经过完整调研（OpenClaw-RL → GraphGPO → T-STAR → CVT-RL）
  和产品模型自省，结论是：
  
  跨会话因果推断是在错误的数据模型上做推断——
  对话不是状态节点，是编辑行为。
  
  版本记录替代因果链：
  msg-201 为什么发生 → 因为卡片从 v1 到 v4 经历了三次精炼
  不需要推断 msg-201 和 msg-12 的因果关系——
  版本 diff 已经解释了。

这个放弃是这场调研最重要的结论之一：
  我们被 memory benchmark 和 failure attribution benchmark
  的语境带偏了，试图在对话模型上做因果推断——
  回到实体模型，版本记录就是 Thread，diff 就是因果解释。
```

> 业界正在从 Level 0 走向 Level 2-3——他们在逼近 LinX 需要的数据结构（图/树/反事实），但始终困在「单任务轨迹」的框里。LinX 要做的不是在图里找关键步，而是在对话时间里串因果珠。数据结构可借鉴，任务定义完全不同。

### 归因深度：一个新指标 → 归因深度的最终定义：版本迭代次数

经过对业界实践的深入调研和 LinX 自身产品模型的重新审视，结论是：**不需要复杂的长链条因果归因。用文档版本记录替代。**

```
核心假设：
  会话内：消息
  会话外：文档（AGENTS.md + 卡片）
  
  用户批评时 → 检索文档
  ├── 没有 → 文档缺失 → 记卡片 v1
  ├── 有但搜不到 → 检索不到 → 优化检索
  └── 有且搜到了 → 语义网推理也跑了
      → 但推理结论和用户判断不一致
      → 推理不准确 → 精炼 class/predicate 定义
  
  归因有三个选项——不需要推断跨会话因果链。
```

为什么这不是 tradeoff 而是聪明：

1. **版本 diff 天然就是因果解释。** 卡片从 v1 → v4，每一次为什么改、改了什么，都在 diff 里。不需要推断。

2. **用户的记忆也是版本化的。** 你记得的是「吞异常的定义经历了三次修正」——不是「msg-47 和 msg-132 有因果关系」。系统的记忆模型应该和用户一致。

3. **长链条归因在错误的数据模型上做推断。** 对话不是状态节点——对话是编辑行为。版本记录直接在正确的数据模型（文档 = 实体）上做记录。

4. **系统能自检的，不需要推断；版本能追溯的，不需要归因。**

```
归因深度 = 同一张卡片经历的版本迭代次数

深度 1：纠正 → 文档缺失 → v1
深度 3：同一类纠正三次 → v1 → v2 → v3
  → 不需要推断——只需要看版本 diff
  
版本记录就是 Thread。
diff 就是因果解释。
```

> 这个结论来自对 OpenClaw-RL、PAHF（单步因果）、GraphGPO、T-STAR（图/树信用分配，困于单任务）和 CVT-RL（反事实，无法实时）的完整调研——以及回到 LinX 自身产品模型的追问：什么叫记住。

---

## 训练数据构造：两类任务、hindsight 方法

反馈链路的训练信号不依赖 RL rollout——而是用事后正确的版本回填到过去的决策点。

### 两类任务

```
任务 1 — 答问题（训判断力）
  prompt   = 语义网 + 上下文 + 文档
  rejected = 错误判断
  chosen   = 正确判断
  
任务 2 — 改文档（训编辑力）
  prompt   = 语义网 + 上下文 + 其他文档
  rejected = 旧版卡片
  chosen   = 新版卡片
  
  "谁被修改，其余全是 prompt"
```

### hindsight 改文档（核心创新）

```
Prompt 取第二次纠正，不是第三次。

时间线：
  t1: 用户第一次纠正 → 模型写 v1
  t2: 用户第二次纠正 → 模型写 v2（不够好，触发 t3）
  t3: 用户第三次纠正 → 模型写 v3（终于对了）

hindsight 构造：
  prompt   = t2 时的全部上下文（那时只有 v1）
  rejected = v2（t2 时模型写的——不够好）
  chosen   = v3（t3 时才确定的最终版）

如果取 t3 当 prompt → 用户已经说得很清楚了，任何模型都能写对——
训练没学到任何东西。
取 t2 → 模型学会在有限信息下直接写出最终版。
```

hindsight（小写）是机器学习通用概念（来自 Hindsight Experience Replay, Andrychowicz et al. 2017）——用事后知道的正确答案去修正此前的中间决策。不是 Vectorize.io 的 Hindsight 产品。

### 三层训练信号，同一条纠正

```
用户第三次纠正"这是第三次了"
  ↓
├── 答问题 DPO：prompt=上下文+文档, rejected=错误判断, chosen=正确判断
├── 即时改文档 DPO：prompt=第三次纠正时的上下文, rejected=没改, chosen=v3
└── hindsight 改文档 DPO：prompt=第二次纠正时的上下文, rejected=v2, chosen=v3

三个任务来自同一条纠正。
一个训判断、一个训反应、一个训前瞻。
算法可 DPO 可 SFT——数据构造逻辑独立于算法选择。
```

---

## Thread 长度、噪声和信号提取

主理人的 thread 不是完整的对话记录——是**从消息流中过滤出的 taste 信号链**。这里独有的挑战不是 memory benchmark 测的那些。

### 现有 memory benchmark 的真实性局限

```
现有 benchmark（LongMemEval / LoCoMo / PERMA）：
  Haystack = 填充文本（Lorem ipsum 或无关文章）
  Needle = 要查的事实（"用户叫什么？"）
  任务 = 找到针

LinX 的真实场景：
  Haystack = 真实对话——主理人不能直接忽略
  Needle = 12 颗散落在几百条消息里的 taste 珠子
  任务 ≠ 找到珠子
  任务 = 判断什么是珠子 + 把珠子串成因果链
```

PERMA（arXiv 2603.23231）是现有 benchmark 里最接近的——它批评标准 benchmark「把无关对话当填充物，忽略了事件之间的因果关系」。但它测的是偏好跟踪，不是反馈链路串珠。

### 信号压缩由标注层处理

不是所有消息都进 thread。标注层是关键过滤器：

```
消息 → 标注层（ISO 24617-2 + 对话四维坐标）
  → 否定 + 新词汇               → 珠子，进 thread
  → 肯定 + 引用历史              → 珠子，进 thread
  → 元对话（"你记住""以后都……"）  → 高优先级珠子，进 thread
  → 背景上下文                   → 可能不单独进，但 link 到相关珠子
  → 闲聊                        → 不进
  → 任务指令                     → 不进 taste thread，进任务 thread
```

标注精度越高，thread 越干净。90% 的日常对话被自动过滤。

### 串珠挑战

```
用户说"你看，这是第三次了"

主理人需要归因：
  第三次是指哪三次？
  msg-12 "别吞异常"
  → msg-29 "这次处理对了"
  → msg-35 "上次那种方式也不行"
  还是另一个组合？

Thread 长度问题归根结底是标注问题——
标注准了，珠子好找，thread 不会臃肿。
```

### 过程指标（新增）

用来监控标注和串珠是否正常运转：

| 指标 | 定义 |
|---|---|
| **标注准确率** | 消息被标注后，用户在下游通过行为间接修正标注的比例。越低越好 |
| **信号压缩比** | Thread 消息数 / 总消息数。标注层是否有效过滤了噪音 |
| **Thread 断裂率** | 一颗珠子找不到前因的比例。标注层漏了关键信号 |

---

## 相关文档

- `docs/secretary/taste/memory-methodology.md` — Zettelkasten / PARA / LLM Wiki / Hindsight 方法论
- `docs/secretary/README.md` — Secretary 能力设计入口
- `docs/agent-guide.md` — AGENTS.md 写法规范
