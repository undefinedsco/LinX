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
- 和 LinX 的关系：⭐⭐⭐⭐⭐ 唯一一个测「你的 taste 会变，模型跟不跟得上」
- Gap：限定生活场景，不是 Agent 工作流审批

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

### 归因深度：一个新指标

```
归因深度 = 归因链路有几跳

深度 1（业界水平）：纠正 ← 上一步产出
深度 3（LinX 目标）：纠正 ← msg-35 ← msg-29 ← msg-12 ← AGENTS.md

归因深度分布 = 每次纠正的归因平均深度
  → 如果分布集中在深度 1，标注层可能没在串珠
  → 如果分布稳定上升，系统在积累长期记忆
```

> **单步因果是训练信号的来源——可以直接复用 OpenClaw-RL 的 directive signal 提取。多步因果是产品壁垒——标注层 + Thread + 归因。** 没有人做的东西 = 护城河。归因深度衡量系统是否真的在积累长期记忆，而不是每次都从零判断。

> 这个指标没有任何 benchmark 测——因为它对应的能力（跨会话因果链串联）没有任何产品在做。

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
