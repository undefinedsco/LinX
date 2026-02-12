# LinX 人-AI 协作元模型

> 本文档是 LinX 产品的系统性元设计，统一定义角色、信任拓扑、协作模式和策略体系。
> 所有 wave 文档和代码中的角色命名、权能边界、策略字段均以本文档为准。
>
> 创建时间：2025-02-11
> 状态：📝 草稿

---

## 0. 核心原则：信任壁垒（Trust Moat）

LinX 是一个 Solid App。在 Solid 生态中，数据存在 User 的 Pod 里，任何 Solid App 都可以读写同一个 Pod。**LinX 不存在数据壁垒，也不追求数据壁垒。**

LinX 的壁垒是**信任壁垒**——User 对 Secretary AI 的信任积累。

### 信任的实体化

信任不是抽象概念，它有具体的数据载体：

| 信任载体 | 存储位置 | 说明 |
|---------|---------|------|
| 审批策略 | `/settings/policies/` | User 通过每次"不再提醒"逐步下放的权限 |
| 自治配置 | `/settings/autonomy/` | User 对 Secretary 自主行动范围的授权 |
| 感知配置 | `/settings/awareness/` | User 告诉 Secretary 该关注什么、怎么响应 |
| 审计历史 | `/audit/` | Secretary 的完整决策记录和 User 的改判记录 |
| 学习成果 | `/audit/performance/` | Secretary 从 User 行为中积累的决策模式 |
| 凭证托管 | `/credentials/` | User 交给 Secretary 保管的 API key 等敏感信息 |

### 为什么信任不可移植

这些数据技术上都存在 Pod 里，另一个 Solid App 可以读取。但信任关系不可移植：

1. **策略是渐进积累的** — 每条 Layer 1 策略都是 User 在具体场景下做出的信任决策，不是一次性配置。另一个 app 拿到策略文件，缺少背后的决策上下文。
2. **学习是持续的** — Secretary 从 User 的改判、偏好、行为模式中持续学习。这些学习成果体现在决策质量上，不是简单的配置文件可以复制的。
3. **信任是双向验证的** — User 通过审计记录验证 Secretary 的决策质量，Secretary 通过失职率追踪自我改进。这个验证循环需要时间建立。
4. **上下文是不可复制的** — Secretary 对 User 的工作习惯、联系人关系、项目上下文的理解，是在长期协作中积累的隐性知识。

### 产品推论

| 推论 | 说明 |
|------|------|
| 不做数据锁定 | 所有数据标准 RDF 格式存储，任何 Solid App 可读写 |
| 做信任积累 | 产品设计围绕"让 User 逐步信任 Secretary"展开 |
| 新手引导 = 信任起点 | 第一次交互（存 API key）就是建立信任的第一步 |
| 权限下放 = 信任深化 | 每次"不再提醒"都是 User 对 Secretary 信任的加深 |
| 审计透明 = 信任维护 | User 随时可以还原现场、验证 Secretary 的决策 |
| 改判学习 = 信任修复 | Secretary 从错误中学习，修复受损的信任 |
| 切换成本 = 信任重建成本 | User 换到另一个 app，需要从零建立信任关系 |

---

## 1. 角色定义（Role Definitions）

LinX 的人-AI 协作基于三个角色。这不是三个"功能模块"，而是三种**信任等级**。

### 1.1 User（用户）

- **身份**：拥有 Solid Pod 和 WebID 的自然人
- **信任等级**：最高——数据所有者，一切权限的源头
- **核心权能**：
  - 授予/撤销其他角色的权限
  - 设定策略（Policy）
  - 最终审批权（任何操作都可以被 User 否决）
  - 查看完整审计日志
- **不可委托的权能**：
  - Pod 的 Control 权限（ACL 管理）
  - 策略的创建和删除（可以委托策略的执行，但不能委托策略的制定）

### 1.2 Secretary AI（秘书 AI）

> 旧称：Guardian AI、管家 AI。统一为 **Secretary AI**，代码中缩写为 `secretary`。

- **身份**：运行在用户可控环境（本地/边缘）的可信 AI 代理
- **信任等级**：高——用户的数字代理人，可直接访问 Pod
- **核心权能**：
  - 读写用户 Pod（在 User 授权范围内）
  - 代理审批 Worker AI 的操作请求（依据 User 设定的策略）
  - 数据脱敏——向 Worker AI 转发数据前，按策略清洗
  - 任务路由——在群聊/多 AI 场景中分派任务给合适的 Worker AI
  - 审计记录——记录所有决策，供 User 检查
- **不可拥有的权能**：
  - 不能修改策略本身（只能执行策略）
  - 不能授权其他角色访问 Pod（只有 User 可以）
  - 不能绕过 `high` 风险操作的人工审批要求
- **运行位置**：本地 sidecar / 边缘设备 / 用户自托管服务
- **为什么可信**：不经过第三方服务商，不外传数据，代码可审计

### 1.3 Worker AI（功能 AI）

> 旧称：功能 AI、打工人 AI。统一为 **Worker AI**，代码中缩写为 `worker`。

- **身份**：第三方 AI 模型服务（OpenAI、Anthropic、本地 Ollama 等）
- **信任等级**：低——能力强但不可信，可能产生幻觉或泄露数据
- **核心权能**：
  - 接收任务指令并生成响应
  - 请求执行工具调用（tool call），但必须经过审批
  - 在授权范围内读取脱敏后的上下文
- **不可拥有的权能**：
  - 不能直接访问 Pod（所有 Pod 操作必须经 Secretary AI 中转）
  - 不能自行决定执行敏感操作
  - 不能看到未脱敏的用户隐私数据
- **运行位置**：云端 API / 本地 Ollama
- **为什么不可信**：第三方控制的运行环境，可能记录输入数据

---

## 2. 信任拓扑（Trust Topology）

```
┌─────────────────────────────────────────────────┐
│                                                   │
│   User                                            │
│   ┌─────────────┐                                │
│   │ Solid Pod    │◄── ACL 保护                    │
│   │ (数据主权)   │                                │
│   └──────┬──────┘                                │
│          │                                        │
│          │ 授权（Policy + ACL）                    │
│          ▼                                        │
│   Secretary AI          信任边界                   │
│   ┌─────────────┐      ─ ─ ─ ─ ─ ─ ─ ─ ─        │
│   │ 本地/边缘    │                                │
│   │ 可信代理     │                                │
│   └──────┬──────┘                                │
│          │                                        │
│          │ 脱敏 + 审批闸门                         │
│          ▼                                        │
│   Worker AI(s)                                    │
│   ┌─────────────┐                                │
│   │ 第三方模型    │                                │
│   │ 不可信执行者  │                                │
│   └─────────────┘                                │
│                                                   │
└─────────────────────────────────────────────────┘
```

### 2.1 信任链规则

| 规则 | 说明 |
|------|------|
| **单向授权** | User → Secretary → Worker，不可反向。Worker 不能给 Secretary 授权。 |
| **不可传递** | User 授权 Secretary 访问 `/chats/`，Secretary 不能把这个权限转授给 Worker。Worker 只能通过 Secretary 的 API 间接访问脱敏后的数据。 |
| **可撤销** | User 随时可以撤销 Secretary 的任何权限，立即生效。 |
| **可审计** | 所有跨信任边界的操作必须记录：谁发起、谁审批、依据什么策略、结果是什么。 |

### 2.2 映射到 Solid ACL

| 角色 | Pod 权限 | ACL 实现 |
|------|---------|---------|
| User | Control + Read + Write + Append | Pod Owner（默认） |
| Secretary AI | Read + Write（在授权容器内） | 注册为 Solid App，User 授权特定容器的 Read/Write |
| Worker AI | 无直接 Pod 权限 | 不注册为 Solid 实体，通过 Secretary AI 的 API 间接访问 |

---

## 2.5 Secretary AI 的产品形态

Secretary AI 不是后台引擎，它是 LinX 的核心交互面。User 与 LinX 的所有交互，本质上都是与 Secretary 的协作。

### 产品定位

```
LinX 的产品核心 = Secretary AI
├── 第一入口：新手引导就是和 Secretary 对话
├── 第一联系人：ChatListPane 永远置顶
├── 全局在场：每个 Group 都有秘书席位
└── 能力枢纽：所有 Worker AI 的调度都经过 Secretary
```

### 置顶 Chat

Secretary 在 ChatListPane 中拥有固定置顶位，不可取消、不可删除、不可归档。

```
┌─────────────────────────────────┐
│ 🔒 Secretary AI          置顶   │  ← 永远第一位，特殊视觉样式
│    "已帮你存储 OpenAI API key"   │
├─────────────────────────────────┤
│ Claude 3.5 Sonnet               │  ← 普通 direct_ai
│    "这段代码的问题在于..."        │
├─────────────────────────────────┤
│ 开发群                          │  ← group（Secretary 在群内）
│    "Secretary: 已分配任务给..."   │
└─────────────────────────────────┘
```

- **chatType**: `direct_ai`（但 UI 上有特殊标识，区别于普通 AI 对话）
- **不显示 unread badge**: Secretary 的消息不产生未读计数，避免通知疲劳。重要事项通过 Inbox 推送。
- **快捷入口**: 长按/右键 Secretary chat 可快速进入设置（策略、感知、自治等级）

### Group 秘书席位

每个 Group 创建时，Secretary AI 自动加入，占据秘书席位。这不是可选的——它是群聊架构的一部分。

```typescript
interface GroupChat {
  id: string
  members: GroupMember[]
  secretary: {
    agentId: string            // Secretary AI 的 Agent ID
    role: 'secretary'          // 固定角色，不可移除
    joinedAt: string           // 群创建时自动加入
    permissions: {
      canRoute: boolean        // 路由消息给 Worker（默认 true）
      canSummarize: boolean    // 生成群聊摘要（默认 true）
      canModerate: boolean     // 内容审核（默认 false，User 开启）
    }
  }
}
```

Secretary 在群聊中的行为：
- **默认静默**: 不主动发言，不干扰群聊讨论
- **被动响应**: @Secretary 时响应，或 User 在设置中开启主动行为
- **路由调度**: 当 User 在群聊中发出任务指令，Secretary 分析意图并路由给合适的 Worker
- **摘要生成**: 群聊消息过多时，Secretary 可生成摘要（需 User 在 AwarenessSettings 中开启 `canSummarize`）

### 新手引导流程

User 第一次打开 LinX，看到的不是空白界面，而是 Secretary 的欢迎对话。

```
Secretary: 你好！我是你的 AI 秘书。
           我会帮你管理所有 AI 助手、保护你的数据、
           处理日常事务。

           先来设置一下吧——你有 AI 服务的 API key 吗？

User:      有，OpenAI 的

Secretary: 好的，请把 API key 告诉我，
           我会把它安全地存储在你的个人 Pod 中。
           只有你和我能访问它，其他 AI 助手看不到。

User:      sk-xxxxx

Secretary: ✓ 已安全存储到你的 Pod（/credentials/openai）
           现在你可以和 GPT-4 对话了。
           需要我帮你设置其他 AI 服务吗？
```

这个流程建立了三个关键心智模型：
1. **Secretary 是你的秘书** — 它帮你做事，不是你帮它配置
2. **数据存在你的 Pod 里** — 你拥有数据，Secretary 只是代管
3. **Secretary 是信任中介** — API key 交给 Secretary，Worker AI 通过 Secretary 间接使用，看不到原始 key

### Secretary 的能力边界

Secretary 是产品核心，但它不是万能的。明确边界避免 User 产生错误预期：

| Secretary 能做 | Secretary 不能做 |
|---------------|-----------------|
| 存储和管理 credentials | 自行创建 credentials |
| 调度 Worker AI 执行任务 | 替代 Worker AI 执行专业任务 |
| 审批/拒绝 Worker 的操作 | 自行修改审批策略 |
| 生成摘要和提醒 | 替 User 做最终决策 |
| 学习 User 偏好并建议策略 | 自动应用学习结果 |
| 在群聊中路由和协调 | 踢出群成员或修改群设置 |

---

LinX 的人-AI 协作分为两大类、六种模式：

### 主动模式（User-Initiated）

由 User 或 User 预设的规则主动发起，Secretary AI 辅助执行。

| 模式 | 发起者 | Secretary 角色 | 复杂度 |
|------|--------|---------------|--------|
| 3.1 直接指令 | User | 旁路监控 | ★ |
| 3.2 委托代理 | User | 主导调度 | ★★ |
| 3.3 多 AI 协同 | User | 协调路由 | ★★★ |
| 3.4 自治执行 | User 预设规则 | 安全闸门 | ★★★ |
| 3.5 并行开发 | User | 项目经理 | ★★★★ |

### 被动模式（Event-Driven）

由外部事件触发，Secretary AI 自主感知、研判、响应，User 不一定在场。

| 模式 | 发起者 | Secretary 角色 | 复杂度 |
|------|--------|---------------|--------|
| 3.6 智能感知 | 外部事件 | 感知者/研判者 | ★★★ |

> 被动模式是 Secretary AI 作为"秘书"最本质的能力——不需要 User 告诉它该关注什么，它自己知道。
> 被动模式可以升级为主动模式：Secretary 感知到事件后，如果需要调度 Worker AI，则进入委托代理或自治执行流程。

---

### 3.1 直接指令（Direct Command）

最简单的模式：User 直接对 Worker AI 下达指令。

```
User ──指令──► Worker AI ──响应──► User
                  │
            Secretary AI（旁路监控）
```

- **chatType**: `direct_ai`
- **Secretary 角色**: 旁路——监控 Worker 的 tool call，按策略自动审批或拦截
- **典型场景**: 日常对话、代码生成、内容创作
- **审批流**: Worker 的 tool call → Secretary 按策略判断 → 自动通过 / 弹出 InteractionCard

### 3.2 委托代理（Delegated Agency）

User 把一个目标委托给 Secretary AI，Secretary 自行拆解任务并调度 Worker AI。

```
User ──目标──► Secretary AI ──子任务──► Worker AI(s)
                    │                       │
                    │◄──────结果────────────┘
                    │
                    └──汇总报告──► User
```

- **chatType**: `direct_ai`（User 和 Secretary 的对话）
- **Secretary 角色**: 主导——拆解任务、选择 Worker、汇总结果
- **典型场景**: "帮我整理这周的会议记录并生成周报"
- **审批流**: Secretary 自行决策子任务的执行，仅在超出策略范围时请求 User 确认

### 3.3 多 AI 协同（Multi-AI Coordination）

群聊中多个 Worker AI 协作，Secretary AI 负责路由和协调。

```
User ──消息──► Secretary AI ──路由──► Worker AI-A（代码）
                    │                 Worker AI-B（设计）
                    │                 Worker AI-C（测试）
                    │◄──────各自响应───┘
                    └──整合──► 群聊消息流
```

- **chatType**: `group`
- **Secretary 角色**: 协调者——分析用户意图，路由到合适的 Worker，整合响应
- **典型场景**: 开发群聊中，代码助手、设计助手、测试助手各司其职
- **关键字段**: `routedBy`（Secretary WebID）、`routeTargetAgentId`（目标 Worker）、`coordinationId`（协同链路 ID）
- **审批流**: 每个 Worker 的 tool call 独立经过 Secretary 审批

### 3.4 自治执行（Autonomous Execution）

Worker AI 在预设规则下自动执行任务，Secretary AI 作为安全闸门。

```
触发器（定时/事件）──► Secretary AI ──启动──► Worker AI
                          │                     │
                          │◄──tool call 审批────┘
                          │
                     策略自动审批 / 拦截上报 User
```

- **chatType**: `cli_session`
- **Secretary 角色**: 安全闸门——按 AutonomySettings 自动审批，异常时熔断
- **典型场景**: CI/CD 自动化、定时数据处理、CLI session 中的命令执行
- **关键配置**: `AutonomySettings`（自治等级、token 限制、路径白名单）
- **审批流**: 完全由策略驱动，`low` 风险自动通过，`high` 风险必须人工确认

### 3.5 并行开发（Parallel Development）

多个 Worker AI 各自在独立 worktree/分支上并发工作，Secretary AI 负责策略继承、进度追踪和冲突协调。

与"多 AI 协同"（3.3）的区别：协同是多个 Worker 在同一上下文中讨论同一问题；并行开发是多个 Worker 在隔离的工作空间中独立推进不同任务。

```
User ──总目标──► Secretary AI
                    │
                    ├──派生 worktree-A──► Worker AI-A（feat/auth）
                    │   └── cli_session-A（独立审批上下文）
                    │
                    ├──派生 worktree-B──► Worker AI-B（feat/chat-ui）
                    │   └── cli_session-B（独立审批上下文）
                    │
                    ├──派生 worktree-C──► Worker AI-C（fix/perf）
                    │   └── cli_session-C（独立审批上下文）
                    │
                    └── 监控面板：进度汇总 / 冲突检测 / 合并协调
```

- **chatType**: `cli_session`（每个 worktree 对应一个独立 session）
- **Secretary 角色**: 项目经理——派生工作空间、继承策略、追踪进度、检测冲突、协调合并
- **典型场景**: 用户说"同时推进 auth 模块和 chat UI 的开发"，Secretary 创建两个 worktree，各分配一个 Worker
- **关键字段（Pod 可持久化 / 审计可追溯）**：
  - `agentWorkspaceRef`：指向 Contact(Agent@workspace) 的 URI（工作上下文 + 默认策略来源）
  - `policyRef`：权限策略文档的 URI 引用（thread 创建时挂载；继承/覆盖靠“引用”而不是复制内容）
  - `policyVersion`：决策时命中的策略版本（用于审计回放）
  - `parentThreadId`：派生关系（主线程 → worktree thread）
- **运行时字段（本地状态，不写入 Pod）**：
  - `localWorktreePath`：本地 worktree 路径（如 `/repo/.worktrees/feat-auth`）
  - `localBranchName`：git 分支名（如 `feat/auth`）

#### 策略继承机制

并行开发的核心难题是：每个 worktree 的审批策略从哪来？

```
父 thread（policyRef = P）
    │
    ├── 子 thread-A（默认继承 policyRef = P）
    │   └── 可覆盖：policyRef = P'（更严格；由 User 确认/发布）
    │
    ├── 子 thread-B（默认继承 policyRef = P）
    │
    └── 版本追溯：每次决策写入 policyVersion；审计回放可还原当时生效版本
```

- **继承规则**: 子 thread 默认继承父 thread 的 `policyRef`（以及 `agentWorkspaceRef` 作为默认策略来源）
- **覆盖规则**: 子 thread 可以把 `policyRef` 指向更严格的策略（或叠加 deny-only 的 override 策略），但不能放宽父策略
- **传播规则**: `policyRef` 指向的策略文档更新后，下次求值自然生效；审计通过 `policyVersion` 固定当时版本，无需额外同步字段

#### 冲突检测

Secretary AI 持续监控并行 worktree 之间的潜在冲突：

| 冲突类型 | 检测方式 | 处理 |
|---------|---------|------|
| 文件冲突 | 两个 worktree 修改了同一文件 | 通知 User，建议合并顺序 |
| 依赖冲突 | 两个 worktree 修改了同一 package.json | 通知 User，标记冲突依赖 |
| 语义冲突 | 两个 worktree 修改了同一接口的不同实现 | Secretary 分析影响范围，生成冲突报告 |

#### 生命周期

```
创建 → 活跃 → [暂停] → 完成/合并 → 归档
  │                        │
  │                        └── Secretary 生成合并建议
  └── Secretary 派生 worktree + 继承策略
```

---

### — 被动模式分界线 —

### 3.6 智能感知（Intelligent Awareness）

前五种模式都由 User 或预设规则发起。这个模式不同——发起者是外部事件本身，Secretary AI 自主感知、研判、响应。

这是 Secretary 作为"秘书"最本质的能力：不需要 User 告诉它该关注什么，它自己知道。

```
外部事件（消息到达 / Pod 数据变更 / 系统通知）
        │
        ▼
  Secretary AI（持续感知）
        │
        ├── 研判：这条消息/事件是否需要关注？
        │
        ├─► 不需要 → 静默记录，不打扰 User
        │
        ├─► 需要提醒 → 生成提醒通知推送给 User
        │   （"张三发了一条紧急消息"）
        │   （"你的 Pod 存储快满了"）
        │
        └─► 需要行动 → 触发协助流程
            │
            ├── 简单协助：Secretary 自行处理
            │   （自动回复"收到，稍后回复"）
            │   （自动归档低优先级通知）
            │
            └── 复杂协助：Secretary 调度 Worker AI
                （收到客户邮件 → 调用 Worker 起草回复 → 等 User 确认后发送）
                （检测到代码仓库 CI 失败 → 调用 Worker 分析原因 → 推送诊断报告）
```

- **chatType**: 不固定——提醒出现在相关 chat 中，或出现在全局 Inbox
- **Secretary 角色**: 感知者 + 研判者——自主决定响应级别和行动方式
- **典型场景**:
  - 收到外部 IM 消息 → Secretary 判断紧急程度 → 紧急则推送通知，普通则静默
  - 收到 @mention → Secretary 分析上下文 → 建议回复内容
  - Pod 数据异常（存储告警、权限变更）→ Secretary 主动通知 User
  - 检测到 User 的日历有冲突 → Secretary 提醒并建议调整
  - 收到客户需求邮件 → Secretary 调用 Worker 起草方案 → 推送给 User 审阅

#### 感知源

| 感知源 | 触发方式 | 说明 |
|--------|---------|------|
| Pod 消息到达 | Solid Notification 订阅 | 新消息、@mention、群聊动态 |
| 外部 IM 导入 | Import Plugin 写入 Pod 后触发 | WeChat、Telegram 等消息 |
| Pod 数据变更 | Solid Notification 订阅 | 文件变更、联系人更新、权限变更 |
| 系统事件 | sidecar 事件 | CLI session 状态变更、CI/CD 结果 |
| 时间感知 | 内部定时器 | 日历提醒、定期汇总、超时检测 |

#### 响应级别

| 级别 | Secretary 行为 | User 感知 | 示例 |
|------|---------------|----------|------|
| 静默 | 记录日志，不通知 | 无 | 低优先级群聊消息、已读回执 |
| 标记 | 在消息上添加标记/摘要 | 下次打开时看到 | 长群聊生成摘要、标记重要消息 |
| 提醒 | 推送通知到 Inbox / 系统通知 | 收到通知 | 紧急消息、@mention、日历冲突 |
| 协助 | 自行处理或调度 Worker | 收到处理结果待确认 | 起草回复、生成报告、自动归档 |
| 升级 | 生成 InteractionCard 请求决策 | 必须响应 | 敏感权限请求、异常数据访问 |

#### 研判依据

Secretary 的研判不是硬编码规则，而是基于：

1. **User 偏好**（存储在 Pod `/settings/awareness/`）
   - 哪些联系人的消息是紧急的
   - 哪些关键词需要立即通知
   - 免打扰时段
   - 自动回复规则
2. **上下文理解**
   - 消息内容的语义分析（紧急程度、情感、意图）
   - 发送者与 User 的关系（亲密度、工作关系）
   - 当前 User 的状态（忙碌/空闲、在线/离线）
3. **历史模式**
   - User 过去对类似消息的处理方式
   - 响应时间模式（工作时间 vs 非工作时间）

```typescript
interface AwarenessSettings {
  // 联系人优先级
  contactPriority: Array<{
    contactId: string
    level: 'urgent' | 'normal' | 'low'
  }>
  // 关键词触发
  keywords: Array<{
    pattern: string            // regex
    action: 'notify' | 'assist' | 'escalate'
  }>
  // 免打扰
  quietHours: {
    enabled: boolean
    schedule: string           // cron 或简化格式
    exceptions: string[]       // 即使免打扰也通知的联系人
  }
  // 自动回复
  autoReply: {
    enabled: boolean
    message: string            // 模板，支持变量
    scope: 'all' | 'contacts_only' | 'none'
  }
}
```

#### 与自治执行（3.4）的区别

| 维度 | 自治执行 | 智能感知 |
|------|---------|---------|
| 触发者 | 预设规则（确定性） | 外部事件（不确定性） |
| 决策者 | 规则引擎（if-then） | Secretary AI（语义研判） |
| 行动范围 | 规则定义的固定动作 | 动态决定响应级别和行动方式 |
| User 预期 | 明确知道会发生什么 | 不一定预期，但事后认可 |
| 策略层 | Layer 3 Automation Rules | 新增 AwarenessSettings + Secretary 自主判断 |

### 3.7 模式选择矩阵

| 维度 | 直接指令 | 委托代理 | 多 AI 协同 | 自治执行 | 并行开发 | 智能感知 |
|------|---------|---------|-----------|---------|---------|---------|
| User 参与度 | 高（每轮交互） | 中（设定目标后等结果） | 中（参与讨论） | 低（设定规则后放手） | 低（设定目标后监控） | 无（Secretary 自主） |
| Secretary 角色 | 旁路监控 | 主导调度 | 协调路由 | 安全闸门 | 项目经理 | 感知者/研判者 |
| Worker 数量 | 1 | 1-N | N | 1 | N（各自隔离） | 0-1（按需调度） |
| 工作空间 | 共享 | 共享 | 共享 | 独立 session | 独立 worktree | 无固定空间 |
| 审批密度 | 按需 | 低（Secretary 代理） | 中（多 Worker 各自审批） | 策略驱动 | 策略继承 + 独立审批 | Secretary 自主 + 升级时审批 |
| 对应 chatType | direct_ai | direct_ai | group | cli_session | cli_session（多个） | 不固定 |

---

## 4. 策略体系（Policy System）

策略是 User 意志的持久化表达。Secretary AI 执行策略，但不能创建或修改策略。

### 4.1 策略层次

```
┌─────────────────────────────────────────┐
│ Layer 4: Awareness Settings             │  ← Secretary 感知配置
│   "张三的消息紧急通知，免打扰 22:00-8:00" │
├─────────────────────────────────────────┤
│ Layer 3: Automation Rules               │  ← 触发规则 + 动作
│   "当 session 完成时，自动审查代码"        │
├─────────────────────────────────────────┤
│ Layer 2: Autonomy Settings              │  ← 自治等级 + 安全限制
│   "半自动模式，读取自动、写入需确认"        │
├─────────────────────────────────────────┤
│ Layer 1: Approval Policies              │  ← 审批规则
│   "allow-always: yarn test"             │
│   "deny: rm -rf"                        │
├─────────────────────────────────────────┤
│ Layer 0: Solid ACL                      │  ← Pod 级访问控制
│   "Secretary AI 可读写 /chats/"          │
└─────────────────────────────────────────┘
```

### 4.2 各层定义

#### Layer 0: Solid ACL（基础设施层）

- **管理者**: User（通过 Pod 管理界面或 LinX 设置）
- **粒度**: Pod 容器/资源级别
- **存储**: Pod 的 `.acl` 资源
- **作用**: 决定 Secretary AI 能访问 Pod 的哪些数据
- **不可被 Secretary 修改**

#### Layer 1: Approval Policies（审批策略层）

- **管理者**: User（通过 InteractionCard 的"记住我的选择"或设置页面）
- **粒度**: 操作类型 + 目标资源的组合
- **存储**: Pod 的 `/settings/policies/` 容器
- **作用**: 决定 Secretary AI 如何处理 Worker AI 的 tool call

```typescript
interface ApprovalPolicy {
  id: string
  // 匹配条件
  match: {
    toolName?: string          // glob pattern, e.g. "file.*", "shell.exec"
    riskLevel?: 'low' | 'medium' | 'high'
    targetPath?: string        // glob pattern, e.g. "src/**"
    agentRef?: string          // 特定 Worker AI（Contact URI 或 WebID）
  }
  // 决策
  decision: 'allow-always' | 'deny-always' | 'ask-user'
  // 元数据
  createdBy: string            // User WebID
  createdAt: string
  expiresAt?: string           // 可选过期时间
  note?: string                // User 备注（"我信任这个操作"）
}
```

**决策优先级**: `deny-always` > `allow-always` > `ask-user`（deny 优先）

#### Layer 2: Autonomy Settings（自治配置层）

- **管理者**: User（通过设置页面）
- **粒度**: 全局 / 每个 Agent / 每个 Agent@workspace
- **存储**: Pod 的 `/settings/autonomy/` 容器
- **作用**: 决定 Secretary AI 的默认行为模式

```typescript
interface AutonomySettings {
  scope: {
    type: 'global' | 'agent' | 'agentWorkspace'
    targetRef?: string         // agentRef 或 agentWorkspaceRef（URI / WebID）
  }
  level: 'manual' | 'semi_auto' | 'full_auto'
  limits: {
    maxTokensPerExecution: number
    maxTimePerExecution: number    // seconds
    maxConsecutiveFailures: number
  }
  fileAccess: {
    allowedPaths: string[]
    blockedPaths: string[]
  }
  commandWhitelist: string[]
}
```

#### Layer 3: Automation Rules（自动化规则层）

- **管理者**: User（通过自动化规则编辑器）
- **粒度**: 事件触发 + 条件 + 动作
- **存储**: Pod 的 `/automation/rules/` 容器
- **作用**: 定义无人值守场景下的自动化行为
- **执行者**: Secretary AI（按规则触发，受 Layer 1-2 约束）

#### Layer 4: Awareness Settings（智能感知层）

- **管理者**: User（通过感知设置页面）+ Secretary AI（通过学习 User 行为模式自动建议）
- **粒度**: 感知源 + 响应级别 + 行动方式
- **存储**: Pod 的 `/settings/awareness/` 容器
- **作用**: 定义 Secretary AI 对外部事件的感知和响应行为
- **与 Layer 3 的区别**: Layer 3 是确定性规则（if-then），Layer 4 是 Secretary 的自主研判框架——定义的是"关注什么、怎么响应"，而不是"触发什么、执行什么"

```typescript
interface AwarenessSettings {
  // 联系人优先级
  contactPriority: Array<{
    contactId: string
    level: 'urgent' | 'normal' | 'low'
  }>
  // 关键词触发
  keywords: Array<{
    pattern: string            // regex
    action: 'notify' | 'assist' | 'escalate'
  }>
  // 免打扰
  quietHours: {
    enabled: boolean
    schedule: string           // cron 或简化格式
    exceptions: string[]       // 即使免打扰也通知的联系人
  }
  // 自动回复
  autoReply: {
    enabled: boolean
    message: string            // 模板，支持变量
    scope: 'all' | 'contacts_only' | 'none'
  }
  // Secretary 自主行动边界
  assistBoundary: {
    canAutoReply: boolean      // 是否允许自动回复
    canDraftReply: boolean     // 是否允许起草回复待确认
    canArchive: boolean        // 是否允许自动归档低优先级消息
    canSummarize: boolean      // 是否允许自动生成群聊摘要
    canDispatchWorker: boolean // 是否允许自主调度 Worker AI 协助
  }
}
```

### 4.3 策略求值流程

策略求值有两条路径：Worker 发起的操作审批，和 Secretary 自主感知的响应决策。

#### 路径 A: Worker tool call 审批

当 Worker AI 发起一个 tool call 时，Secretary AI 按以下顺序求值：

```
Worker AI 发起 tool call
        │
        ▼
[1] 检查 Layer 0: Secretary 是否有权访问目标资源？
        │ 无权限 → 直接拒绝（不通知 User）
        ▼
[2] 检查 Layer 1: 是否命中 deny-always 策略？
        │ 命中 deny → 拒绝，记录审计
        ▼
[3] 检查 Layer 1: 是否命中 allow-always 策略？
        │ 命中 allow → 执行，记录审计
        ▼
[4] 检查 Layer 2: 当前自治等级下，该操作风险等级是否允许自动执行？
        │ 允许 → 执行，记录审计
        ▼
[5] 兜底: 生成 InteractionCard，请求 User 确认
        │ User 选择"记住" → 写入 Layer 1 策略
        ▼
[6] 记录审计日志（无论结果如何）
```

#### 路径 B: Secretary 智能感知响应

当外部事件到达时，Secretary AI 按以下顺序研判：

```
外部事件到达（消息 / Pod 变更 / 系统通知）
        │
        ▼
[1] 检查 Layer 4: 是否在免打扰时段？
        │ 是 → 检查是否命中 exceptions → 不命中则静默记录
        ▼
[2] 检查 Layer 4: 发送者优先级？
        │ urgent → 直接进入提醒/协助流程
        │ low → 静默或标记
        ▼
[3] 检查 Layer 4: 是否命中关键词触发？
        │ 命中 → 按配置的 action 执行（notify / assist / escalate）
        ▼
[4] Secretary 语义研判: 分析内容紧急程度、上下文、User 历史模式
        │ → 决定响应级别（静默 / 标记 / 提醒 / 协助 / 升级）
        ▼
[5] 如果响应级别 = 协助，检查 Layer 4 assistBoundary:
        │ canAutoReply? canDraftReply? canDispatchWorker?
        │ 超出边界 → 降级为提醒，不自主行动
        ▼
[6] 如果需要调度 Worker AI → 进入路径 A 的审批流程
        ▼
[7] 记录审计日志（无论结果如何）
```

### 4.4 审计记录与现场还原

审计不只是记录"谁做了什么"，而是保留完整决策上下文，让 User 可以还原现场、回放 Secretary 的决策过程，判断其是否合理。

#### 审计记录结构

```typescript
interface AuditEntry {
  id: string
  timestamp: string            // ISO datetime

  // 谁（执行动作的主体）
  actor: {
    ref: string                // URI: WebID（human/secretary/system）或 Pod 资源（worker contact）
    role: 'human' | 'secretary' | 'worker' | 'system'
  }

  // 做了什么
  action: {
    type: string               // tool call name / event type
    target?: string            // 目标资源 URI（如 Pod 文档、文件、会话）
    risk: 'low' | 'medium' | 'high'
    arguments?: Record<string, unknown>
  }

  // 决策（发生在跨信任边界的动作上）
  decision?: {
    result: 'approved' | 'rejected' | 'auto_approved'
    decisionBy?: string        // WebID（human/secretary/system）
    decisionRole?: 'human' | 'secretary' | 'system'
    onBehalfOf?: string        // 代理审批时记录委托方 WebID
    policyRef?: string         // 命中的策略文档 URI
    policyVersion?: string     // 命中的策略版本（用于审计回放）
    reason?: string
  }

  // 决策上下文快照（现场还原的关键）
  context: {
    // Secretary 看到了什么
    triggerEvent?: {
      type: string             // 触发事件类型
      source: string           // 来源（消息 ID / 事件 ID）
      content?: string         // 事件内容摘要（脱敏后）
    }
    // Secretary 怎么想的
    reasoning: string          // Secretary 的决策推理过程（自然语言）
    // Secretary 参考了什么
    matchedPolicies: Array<{
      policyRef: string
      matched: boolean         // 是否命中
      reason: string           // 为什么命中/不命中
    }>
    // 当时的环境
    autonomyLevel: string      // 当时生效的自治等级
    userStatus?: 'online' | 'offline' | 'busy'  // 当时 User 的状态
    relatedAuditIds?: string[] // 关联的前序审计记录（决策链）
  }

  // User 事后改判（如果有）
  override?: {
    overriddenAt: string       // 改判时间
    originalResult: string     // Secretary 原始决策
    newResult: string          // User 改判后的决策
    userReason?: string        // User 改判理由
    learningSignal: 'correction' | 'preference_change' | 'context_missed'
  }

  // 关联（全部用 URI/ID 字符串表达；不存本地路径）
  sessionId?: string
  chatId?: string
  inboxItemId?: string
  agentWorkspaceRef?: string
  parentThreadId?: string
}
```

#### 现场还原 UI

User 在审计视图中可以：
1. **查看决策链** — 点击一条审计记录，展开 Secretary 的完整推理过程（`context.reasoning`）
2. **回放上下文** — 查看触发事件的原始内容、当时命中的策略、当时的自治等级
3. **追溯关联** — 通过 `relatedAuditIds` 查看前序决策，理解 Secretary 的决策链路
4. **改判** — 如果 User 认为 Secretary 决策不合理，可以直接改判，改判记录写入 `override`

### 4.5 Inbox 权限下放机制

Inbox 审批项除了"同意/拒绝"，还提供"不再提醒"选项。这不是简单的通知屏蔽——它是 User 向 Secretary 下放权限的正式入口。

```
┌─────────────────────────────────────────────────┐
│ ⚠️ Worker AI 请求执行: yarn test               │
│                                                   │
│ 风险等级: medium                                  │
│ 目标路径: /src/tests/                             │
│ Secretary 建议: 允许（匹配历史模式）               │
│                                                   │
│ [同意]  [拒绝]  [不再提醒此类操作 ▼]              │
│                  ├── 此工具 + 此路径               │
│                  ├── 此工具（所有路径）             │
│                  └── 此风险等级（所有工具）          │
└─────────────────────────────────────────────────┘
```

#### "不再提醒"的语义

| User 选择 | 生成的 Layer 1 策略 | Secretary 获得的权限 |
|-----------|-------------------|-------------------|
| 此工具 + 此路径 | `match: {toolName: "yarn test", targetPath: "/src/tests/**"}` → `allow-always` | 仅限该工具在该路径下自动审批 |
| 此工具（所有路径） | `match: {toolName: "yarn test"}` → `allow-always` | 该工具在任何路径下自动审批 |
| 此风险等级（所有工具） | `match: {riskLevel: "medium"}` → `allow-always` | 所有 medium 风险操作自动审批 |

每次"不再提醒"都会：
1. 自动生成一条 Layer 1 ApprovalPolicy，记录 `createdBy: user`、`createdVia: inbox`
2. 记录一条审计日志，标记为权限下放事件
3. Secretary 立即生效新策略

### 4.6 Secretary 学习机制

Secretary AI 不是静态的策略执行器，它需要从 User 的行为中持续学习，提升决策质量。

#### 学习信号来源

| 信号 | 含义 | 强度 | 来源 |
|------|------|------|------|
| User 改判 | Secretary 决策错误，User 纠正 | 🔴 强（失职信号） | `AuditEntry.override` |
| User 在 Inbox 选择"不再提醒" | Secretary 过度谨慎，User 下放权限 | 🟡 中（偏好信号） | Inbox 交互 |
| User 主动修改策略 | User 调整 Secretary 的行为边界 | 🟡 中（偏好信号） | 设置页面 |
| User 对 Secretary 建议的采纳/忽略 | Secretary 建议的相关性 | 🟢 弱（参考信号） | 智能感知响应 |
| User 响应时间模式 | User 对不同类型事件的关注度 | 🟢 弱（参考信号） | 行为统计 |

#### User 改判 = 失职信号

当 User 改判 Secretary 的决策时（`AuditEntry.override` 非空），这是最强的学习信号：

```
Secretary 自动批准了一个操作
        │
        ▼
User 事后查看审计，认为不应该批准
        │
        ▼
User 改判为 rejected
        │
        ├── override.learningSignal = 'correction'
        │   → Secretary 记录：这类操作我判断错了
        │
        ├── override.learningSignal = 'preference_change'
        │   → Secretary 记录：User 的偏好变了，不是我判断错
        │
        └── override.learningSignal = 'context_missed'
            → Secretary 记录：我漏看了某个上下文信息
```

#### 学习产出

Secretary 的学习不是黑箱——产出必须是可解释、可审计的：

| 学习产出 | 形式 | User 可见性 |
|---------|------|-----------|
| 策略建议 | Secretary 向 User 建议新增/修改 Layer 1 策略 | User 在 Inbox 中确认或拒绝 |
| 决策权重调整 | Secretary 内部调整对特定模式的风险评估 | 体现在 `context.reasoning` 中 |
| 失职报告 | 当改判率超过阈值时，Secretary 主动生成自检报告 | User 在审计视图中查看 |

**关键约束**: Secretary 的学习永远不能自动修改策略。它只能建议，User 确认后才生效。这保证了"策略是 User 意志的表达"这一核心原则不被破坏。

#### 失职率追踪

```typescript
interface SecretaryPerformance {
  period: string               // 统计周期（如 "2025-02"）
  totalDecisions: number       // 总决策数
  overriddenByUser: number     // 被 User 改判的次数
  overrideRate: number         // 改判率 = overriddenByUser / totalDecisions
  byCategory: Record<string, {
    decisions: number
    overrides: number
    rate: number
  }>                           // 按操作类型分类的改判率
  trend: 'improving' | 'stable' | 'degrading'  // 趋势
}
```

- 改判率 > 10% → Secretary 生成自检报告，建议 User 审查策略
- 某类操作改判率 > 30% → Secretary 主动暂停该类操作的自动审批，回退为 ask-user

---

## 5. 数据归属与存储（Data Ownership）

### 5.1 核心原则

所有数据存入 User 的 Pod。Secretary AI 和 Worker AI 不拥有数据。

### 5.2 Pod 目录结构（策略相关）

```
/settings/
  ├── policies/              # Layer 1: 审批策略
  │   ├── policy-001.ttl
  │   └── policy-002.ttl
  ├── autonomy/              # Layer 2: 自治配置
  │   ├── global.ttl
  │   └── agent-{id}.ttl
  ├── awareness/             # Layer 4: 感知配置
  │   ├── contact-priority.ttl
  │   ├── keywords.ttl
  │   ├── quiet-hours.ttl
  │   └── assist-boundary.ttl
  └── preferences.ttl        # 用户偏好

/automation/
  └── rules/                 # Layer 3: 自动化规则
      ├── rule-001.ttl
      └── rule-002.ttl

/audit/
  ├── 2025-01/               # 审计日志（按月分区，含完整上下文快照）
  ├── 2025-02/
  └── performance/           # Secretary 失职率统计
      └── 2025-02.ttl
```

### 5.3 外部数据流入

外部 IM（WeChat、Telegram 等）的数据通过 Import Plugin 进入 Pod：

```
外部 IM ──Import Plugin──► Pod（标记 sourceChannel）──► LinX UI 消费
```

- Pod 中的消息带 `sourceChannel` 字段标识来源
- LinX 自己的消息 `sourceChannel` 为空或 `linx`
- 回发外部 IM 是 Export Plugin 的职责，不在核心架构内

---

## 6. 统一术语表（Glossary）

| 术语 | 英文 | 代码标识 | 定义 |
|------|------|---------|------|
| 用户 | User | `user` | 拥有 Pod 的自然人，最终决策者 |
| 秘书 AI | Secretary AI | `secretary` | 用户的可信数字代理人，运行在本地/边缘 |
| 功能 AI | Worker AI | `worker` | 第三方 AI 模型，能力强但不可信 |
| 策略 | Policy | `policy` | User 意志的持久化表达，Secretary 执行但不能修改 |
| 审批 | Approval | `approval` | 对 Worker tool call 的允许/拒绝决策 |
| 自治等级 | Autonomy Level | `autonomy_level` | manual / semi_auto / full_auto |
| 交互卡片 | InteractionCard | `interaction_card` | 人机回环的 UI 载体 |
| 审计 | Audit | `audit` | 跨信任边界操作的完整记录 |
| 信任边界 | Trust Boundary | — | User↔Secretary 和 Secretary↔Worker 之间的分界线 |
| 脱敏 | Sanitization | `sanitize` | Secretary 向 Worker 转发数据前的隐私清洗 |
| 协同链路 | Coordination Chain | `coordinationId` | 多 AI 协同场景中的任务追踪 ID |
| 工作空间 | Workspace | — | 本地代码仓库/工作目录概念；Pod 侧通过 `agentWorkspaceRef` 关联策略与权限，不存绝对路径 |
| Agent 工作空间 | Agent@workspace | `agentWorkspaceRef` | 指向 Contact(Agent@workspace) 的 URI，表示“哪个 Agent 在哪个 workspace 上工作” |
| 策略引用 | Policy Ref | `policyRef` | 指向策略文档的 URI；thread 创建时挂载，子 thread 默认继承 |
| 策略版本 | Policy Version | `policyVersion` | 决策时命中的策略版本（用于审计回放） |
| 派生关系 | Thread Derivation | `parentThreadId` | 主线程 → 派生 thread 的父子关系（Pod 持久化） |
| 本地 Worktree | Local Worktree | `localWorktreePath` | 本地 git worktree 路径（运行时）；不写入 Pod |
| 智能感知 | Intelligent Awareness | `awareness` | Secretary 自主感知外部事件并分级响应 |
| 感知设置 | Awareness Settings | `awareness_settings` | User 定义 Secretary 的感知范围和响应边界 |
| 响应级别 | Response Level | — | 静默 / 标记 / 提醒 / 协助 / 升级 |
| 现场还原 | Scene Replay | — | 通过审计上下文快照回放 Secretary 决策过程 |
| 改判 | Override | `override` | User 事后纠正 Secretary 的决策 |
| 失职信号 | Dereliction Signal | — | User 改判触发的 Secretary 学习信号 |
| 失职率 | Override Rate | `overrideRate` | 被 User 改判的决策占总决策的比例 |
| 置顶 Chat | Pinned Chat | — | Secretary 在 ChatListPane 中的固定置顶对话 |
| 秘书席位 | Secretary Seat | `secretary` | Group 中 Secretary AI 的固定角色位 |
| 权限下放 | Permission Delegation | — | User 通过"不再提醒"向 Secretary 授权 |

---

## 7. 与 Wave 文档的映射

| 元模型概念 | 消费方 Wave 文档 | 具体字段/组件 |
|-----------|-----------------|-------------|
| Secretary 代理审批 | 01-contracts | `ToolApprovalBlock.decisionRole: 'secretary'` + `decisionBy(WebID)` |
| Worker tool call | 02-sidecar-events | `MCPToolEvent.status: waiting_approval` |
| 策略求值 | 03-xpod-client-core | Secretary 本地策略引擎 |
| InteractionCard | 04-web-chat-ui, 05-mobile | 审批卡片 UI 组件 |
| 多 AI 路由 | 01-contracts | `GroupMessageExtension.routedBy` |
| 并行开发 worktree | 01-contracts | `ChatRowExtension.agentWorkspaceRef/policyRef/parentThreadId` |
| 策略继承 | 01-contracts, 03-xpod | `ChatRowExtension.policyRef/policyVersion` |
| 冲突检测 | 11-mcp-bridge | Secretary 监控多 worktree 文件变更 |
| AwarenessSettings | 新增（待分配 wave） | 感知设置 UI + Secretary 感知引擎 |
| 智能感知响应 | 04-web-chat-ui, 05-mobile | 提醒通知、摘要标记、起草回复卡片 |
| 感知 Inbox | 02-sidecar-events | Secretary 生成的提醒/协助项进入 Inbox |
| Inbox 权限下放 | 04-web-chat-ui, 05-mobile | "不再提醒"选项 → 生成 Layer 1 策略 |
| 审计现场还原 | 08-web-session-files-ui | 审计详情展开、决策链回放、改判操作 |
| Secretary 学习 | 03-xpod-client-core | 改判信号收集、失职率统计、策略建议生成 |
| Secretary 自检报告 | 08-web-session-files-ui | 失职率超阈值时的自检报告视图 |
| AutonomySettings | 12-automation | 自治等级配置 UI |
| 审计日志 | 08-web-session-files-ui | Session 审计视图 |
| Inbox 审批 | 02-sidecar-events | `InboxApprovalEvent` |
| sourceChannel | 14-import-center | 外部 IM 数据标记 |
| Secretary 置顶 Chat | 04-web-chat-ui, 05-mobile | ChatListPane 固定置顶位、特殊视觉样式 |
| Group 秘书席位 | 01-contracts, 04-web-chat-ui | GroupChat.secretary 固定角色、群内行为 |
| 新手引导 | 04-web-chat-ui, 05-mobile | Secretary 欢迎对话、API key 存储引导 |

---

## 8. 开放问题

| # | 问题 | 影响范围 | 状态 |
|---|------|---------|------|
| 1 | Secretary AI 的具体实现形态——是一个独立进程（sidecar）还是 LinX 应用内的模块？ | 架构、部署 | 待定 |
| 2 | Secretary AI 是否需要自己的 WebID？如果需要，如何注册和管理？ | 身份体系、ACL | 待定 |
| 3 | 策略的版本控制——User 修改策略后，正在执行的 session 是否立即生效？ | 策略引擎 | 待定 |
| 4 | 脱敏规则如何定义？是 User 手动配置还是 Secretary 自动识别 PII？ | 隐私、UX | 待定 |
| 5 | 多设备场景下，策略和审计日志的同步——是否依赖 Pod 的 Solid Notification？ | 同步机制 | 待定 |
| 6 | Worker AI 本地运行（Ollama）时，信任等级是否可以提升？ | 信任模型 | 待定 |

---

## 更新日志

| 日期 | 版本 | 更新内容 |
|------|------|---------|
| 2025-02-11 | v0.1 | 创建元模型文档，定义三角色、四种协作模式、四层策略体系 |
| 2025-02-11 | v0.2 | 新增并行开发模式（3.5）、智能感知模式（3.6）；策略体系扩展为五层（+Layer 4 Awareness）；主动/被动分类 |
| 2025-02-11 | v0.3 | 审计记录增加完整上下文快照和现场还原；Inbox 权限下放机制；Secretary 学习机制（改判=失职信号、失职率追踪、策略建议） |
| 2025-02-11 | v0.4 | Secretary 产品形态定义：置顶 Chat、Group 秘书席位、新手引导流程、能力边界 |
| 2025-02-11 | v0.5 | 新增第 0 章"信任壁垒"核心原则：LinX 无数据壁垒，壁垒是 User 对 Secretary 的信任积累 |
