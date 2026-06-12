# Taste Memory Methodologies

Status: active
Last reviewed: 2026-06-07

跟踪人类知识管理方法论，评估其对 LinX Secretary（主理人）taste 记忆系统的适用性。

## 为什么需要方法论脚手架

现有的 memory benchmark（LongMemEval、Memora、PerMem-Bench）表明：LLM 自己搭建的记忆系统不可靠——该忘的不忘、该记的丢、跨会话推理严重退化。直接用方法论给 LLM 脚手架（"按这个流程走"），比让它自由发挥可靠得多。

---

## 两层分类

```
方法论（人类知识管理传统）        产品级实现（AI 原生记忆系统）
─────────────────────────      ───────────────────────────
Zettelkasten                    Mem0（48K stars，最广泛部署）
PARA                            Hindsight（15.8K stars，四网络架构）
LLM Wiki（介于两者之间）
```

方法论解决「怎么组织信息」——从人类经验中提炼的脚手架。
产品级实现解决「怎么在 Agent 场景里跑通」——已通过 LongMemEval/LoCoMo 验证。

---

## 方法论矩阵

| 方法论 | 核心思想 | 结构自由度 | 适合 taste 吗 |
|---|---|---|---|
| Zettelkasten | 原子卡片 + 双向链接 + 自然生长 | 极高 | ⭐⭐⭐⭐⭐ |
| PARA | Projects/Areas/Resources/Archives 四分类 | 中 | ⭐⭐⭐ |
| LLM Wiki | LLM 维护的持久化 Wiki，渐进化知识积累 | 高 | ⭐⭐⭐⭐ |

## 产品级实现矩阵

| 系统 | LongMemEval | LoCoMo | BEAM 1M | Tokens/检索 | Stars | License |
|---|---|---|---|---|---|---|
| Mem0 (新算法) | **94.8** | **91.6** | 64.1 | ~6.9K | 48K | Apache 2.0 |
| Hindsight | 91.4 | 89.6 | — | — | 15.8K | MIT |

> Mem0 的新算法（2026.04）单次检索不到 7K tokens，全量上下文方案同样的 benchmark 耗 25K+。最大的提升在时间推理（+29.6）和多跳推理（+23.1）。

---

## 1. Zettelkasten（卡片盒笔记法）

### 来源
Niklas Luhmann（德国社会学家），用这套方法产出 70 本书 + 400 篇论文。

### 核心原理
1. **原子性**：每张卡片只记一个想法
2. **双向链接**：卡片之间建立关联
3. **不预设分类**：让链接结构自然生长
4. **定期回顾**：强化高频链接、废弃弱链接

### 对 taste 记忆的适配度：⭐⭐⭐⭐⭐
- ✅ 每次纠正天然是一张原子卡片
- ✅ 自动链接——"别吞异常"自动关联到 error-handling
- ✅ 不用预分类——taste 会往不可预测的方向长
- ⚠️ 需要定期回顾机制防腐化

### AI 实现参考
- **A-Mem** (arXiv 2502.12110): 论文级方案，代理式记忆，用 Zettelkasten 做原子笔记 + LLM 自动链接
- **open-zk-kb** (mrosnerr): 混合搜索（全文+embedding），跨会话持久化
- **zettelkasten-memory** (Kevin Keller): 语义记忆层 + 知识图谱

### 判断
**最适合 taste 记忆。** Taste 边界不清楚、会生长。Zettelkasten 的「不预设分类，让链接自然生长」恰好匹配。主理人不需要预判 taste 维度——每次纠正写一张卡片，链接自己会长出来。

---

## 2. PARA（Projects / Areas / Resources / Archives）

### 来源
Tiago Forte，《Building a Second Brain》。

### 核心原理
- **Projects**: 有截止日期的任务 → "实现 OAuth 登录"
- **Areas**: 持续责任域 → "代码风格"、"安全"
- **Resources**: 参考材料 → "Rust 最佳实践文章"
- **Archives**: 不活跃但保留

两层渐进披露：先看结构，再看内容。

### 对 taste 记忆的适配度：⭐⭐⭐
- ✅ Area 天然对应持续 taste 责任
- ✅ 两层披露——判断时先看摘要，需要时再深入
- ⚠️ 四分类对 taste 可能过重——纠正一次要判断放哪个文件夹
- ⚠️ taste 边界模糊时，分类决策本身就是负担

### AI 实现参考
- **para-memory-files** (Paperclip): YAML 原子事实 + PARA 文件夹 + Daily notes + 记忆衰减
- **PARA Workspace** (pageel): 人+AI 协作工作空间，含 Agent 结构技能、上下文路由规则

### 判断
**对结构化项目记忆很好，但对 taste 偏重。** 如果把 taste 当作一个 Area（"代码偏好"），PARA 能管。但每次纠正要分类，增加了主理人的认知负担。

---

## 3. LLM Wiki

### 来源
Andrej Karpathy (2025)，Ben Miller (agentmemory) 扩展为 v2。

### 核心原理 (Karpathy 原版)
> **不要每次都重新推导，让 LLM 维护一个持久化的、不断增长的 Wiki。**

三层架构：
1. **Raw sources**：不可变源文件
2. **Wiki**：LLM 生成的 MD 文件（摘要、实体页、概念页、对比、综述）
3. **Schema**：AGENTS.md / CLAUDE.md，规范 LLM 怎么维护 Wiki

三个操作：Ingest → Query → Lint

### v2 扩展（Ben Miller / agentmemory）
- **记忆生命周期**：置信度评分 + 废弃 + 遗忘曲线 + 整合层级（工作→情景→语义→程序）
- **知识图谱**：实体提取 + 类型化关系（uses/depends on/caused/supersedes）
- **搜索规模化**：BM25 + 向量 + 图谱遍历混合
- **自动化**：事件驱动（新源→自动摄入、会话结束→自动压缩）
- **结晶化**：把完成的探索/调试过程自动蒸馏成结构化摘要

### 对 taste 记忆的适配度：⭐⭐⭐⭐
- ✅ 核心洞察匹配——taste 就是「别每次都重新判断，积累起来」
- ✅ 三层架构清晰：AGENTS.md 是 Schema，纠正记录是 Wiki 内容
- ✅ 结晶化——一次完成的探索自动沉淀成 taste 规则
- ✅ 置信度评分——「这条 taste 被确认了 12 次」
- ⚠️ 纯文件层实现，没有原生图谱查询

### AI 实现参考
- **nvk/llm-wiki** (360 stars): Claude Code 插件，多 Agent 并行研究 + Wiki 编译
- **kenhuangus/llm-wiki**: 本地优先，状态化知识编译引擎
- **Robs87/llm-wiki**: Hermes Agent skill，含健康检查 + 知识图谱可视化
- **geronimo-iia/llm-wiki**: Git-backed，23 个 MCP 工具，Rust 实现

### 判断
**和 LinX 的 AGENTS.md + Pod 存储天然互补。** LLM Wiki 的「Schema 驱动、LLM 维护、文件持久化」三点和我们的方向高度一致。但纯文件层实现缺少 Hindsight 级别的结构化检索。

---

## 4. Hindsight

### 来源
Vectorize.io + Virginia Tech + Washington Post，MIT 开源，15.8K stars。

### 核心原理
**四网络记忆组织**（分离证据和信念）：

| 网络 | 存什么 | taste 场景对应 |
|---|---|---|
| World (𝒲) | 客观事实 | "这个项目 90% 的代码是函数式" |
| Experience (ℬ) | Agent 自身经历 | "我在 6 月 3 日推荐了函数式方案并被接受" |
| Opinion (𝒪) | 主观判断 + 置信度 | "函数式优于 OOP（置信度 0.9）" |
| Observation (𝒮) | 实体综合摘要 | "用户 X：偏好函数式、简洁、不吞异常" |

**三个核心操作**：
- **Retain**：摄入对话 → LLM 提取叙事事实 → 实体解析 → 图谱链接
- **Recall**：四路并行检索（语义+BM25+图谱+时间）+ 融合排序
- **Reflect**：检索记忆 + 行为参数（怀疑/字面/共情）→ 生成偏好条件化回答 → 更新观点

### Benchmark 表现
- LongMemEval：91.4%（开源 20B 从 39% 拉到 83.6%，更大 backbone 到 91.4%）
- LoCoMo：89.61%（对比最强开源基线 75.78%）

### 对 taste 记忆的适配度：⭐⭐⭐⭐
- ✅ 四网络天然区分「事实」「经历」「观点」——这正是 taste 需要的
- ✅ 置信度评分 + 观点更新——taste 可以演化
- ✅ 行为参数——主理人的「保守/激进」可配置
- ✅ 已验证的检索性能——LongMemEval 91.4% 不是玩具
- ⚠️ 重——15.8K stars 的项目，集成成本不低
- ⚠️ 四网络结构固化——可能对 taste 来说过度设计了

### 判断
**最成熟的产品级方案，但可能过度设计。** 如果 LinX 要做生产级 taste 记忆，Hindsight 的四网络 + 三操作是最完整的参考实现。但对「读 AGENTS.md + 记纠正」这个场景，Zettelkasten 或 LLM Wiki 的轻量方案可能更合适。

---

## 5. Mem0

### 来源
Mem0 Inc.，Apache 2.0 开源，48K stars。2026 年 4 月发布新算法。

### 核心原理
**单次提取 + 多信号检索**，目标是在准确率和 token 效率之间找最优解。

- **分层提取**：一次 LLM 调用完成事实提取 + 分类 + 去重，不反复回吐上下文
- **多信号检索**：语义向量 + 关键词 + 时间衰减 + 图关系，融合排序
- **记忆生命周期**：置信度评分、新鲜度衰减、自动合并冗余记忆
- **灵活存储后端**：支持 20+ 向量数据库，可自托管

### Benchmark 表现（新算法，2026.04）

| Benchmark | 旧算法 | 新算法 | 提升 | 每次检索 Token |
|---|---|---|---|---|
| LoCoMo | 71.4 | **91.6** | +20.2 | 7.0K |
| LongMemEval | 67.8 | **94.8** | +27.0 | 6.8K |
| BEAM (1M) | — | **64.1** | — | 6.7K |
| BEAM (10M) | — | **48.6** | — | 6.9K |

- 时间推理：+29.6 分
- 多跳推理：+23.1 分
- 助手记忆召回：+53.6 分

### 对 taste 记忆的适配度：⭐⭐⭐⭐
- ✅ **最高准确率**——LongMemEval 94.8 是当前所有系统的最高分
- ✅ **最低 token 成本**——每次检索不到 7K token，是 full-context 的 1/3~1/4
- ✅ **生产化程度最高**——48K stars、21 框架集成、20+ 向量存储、可自托管
- ✅ **记忆生命周期**——和 taste 的「创建→确认→衰减→遗忘」天然匹配
- ⚠️ 通用记忆系统，不做 taste 特化——需要自己在上面搭判断层
- ⚠️ 和 Hindsight 一样重——集成成本不低

### 判断
**当前最成熟的生产级选择，但需要自己搭 taste 判断层。** Mem0 解决的是「记住什么 + 怎么搜」，不是「怎么按 taste 判断」。它是最强的记忆存储引擎，但 taste 的判断逻辑仍然需要在 Secretary 层实现。如果用 Mem0 做存储 + Zettelkasten 做组织哲学 + AGENTS.md 做 Schema，就是完整的 LinX taste 记忆方案。

---

## 选型建议

```
场景                            推荐

最小可行（现在就做）              Zettelkasten 原子卡片 + AGENTS.md
  - 每次纠正写一张卡片
  - 判断时搜相关卡片
  - 不需要任何外部依赖

中等规模（taste 积累到 50+ 规则）  LLM Wiki 文件层 + Mem0 存储
  - AGENTS.md 驱动 Schema
  - Mem0 负责记忆存储+检索（比文件层快一个量级）
  - Zettelkasten 组织哲学

生产级（多项目、长时间）          Mem0 存储 + Hindsight 四网络 + 自建 taste 判断层
  - Mem0 做记忆管线（94.8 LongMemEval, 6.9K token/检索）
  - Hindsight 四网络区分事实/经历/观点
  - Secretary 层实现 taste 特定判断逻辑
```

---

## 相关文档

- `docs/secretary/taste/benchmark-survey.md` — 相关 benchmark 全景
- `docs/agent-guide.md` — AGENTS.md 写法规范
- `docs/secretary/README.md` — Secretary 能力边界
- `docs/external-project-watchlist.md` — 外部项目跟踪清单
