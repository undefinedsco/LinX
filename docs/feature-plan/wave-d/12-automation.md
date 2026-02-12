# feat/automation 执行文档

> 波次：Wave D

## 1. 目标与范围

- 触发规则 + AI 自治执行 + 安全闸门。

## 2. 依赖关系

- 入依赖：`feat/contracts-sidecar-events`、`feat/mcp-bridge`
- 出依赖：无

## 3. 分阶段计划

### Phase 0（Contract Baseline）

- 冻结最小接口与数据结构，补齐 fixture。
- 先打通最小读/写路径，不追求完整交互。

### Phase 1（Vertical Slice）

- 打通端到端主链路（可灰度）。
- 完成核心场景自动化测试与手工演示路径。

### Phase 2（Hardening & Cutover）

- 完成稳定性、错误态、可观测性收敛。
- 完成默认入口切换与旧逻辑清理。

## 4. 代码集中回 main 的检查点

- CP0：只合并契约/类型/骨架，保证其他并发分支可继续。
- CP1：合并可运行链路，必须保留 Feature Flag，默认关闭。
- CP2：合并默认入口切换，附回滚策略。

## 5. 分支 DoD

- 契约测试通过（字段/事件/版本）。
- 至少 1 条端到端主链路可跑通。
- 关键失败路径有明确错误处理。
- 对应文档和迁移说明已更新。

## 6. 测试契约（并发开发必填）

- Test Owner：`TBD`
- Required Suites：`TBD`（至少包含 unit/integration/min-e2e）
- Upstream Contract Version：`TBD`
- Downstream Smoke：`TBD`（至少 1 个下游场景）

---

## 6A. Solid 数据建模规范

> Automation 模块引入 2 张新的 Pod 表（automationRule、automationRun），
> 并将 AutonomySettings 存储在现有 `settingsTable` 中。

### 6A.1 新增 Namespace

```typescript
// 新增：LinX Automation 词汇
export const LINX_AUTO = createNamespace('lxa', 'https://vocab.linx.dev/automation#', {
  // RDF Types
  AutomationRule: 'AutomationRule',
  AutomationRun: 'AutomationRun',

  // AutomationRule predicates
  ruleName: 'ruleName',
  ruleDescription: 'ruleDescription',
  ruleEnabled: 'ruleEnabled',
  triggerType: 'triggerType',           // 'session_state' | 'schedule' | 'message_match' | 'manual'
  triggerConfig: 'triggerConfig',       // JSON
  actions: 'actions',                   // JSON: Array<{ type, config }>
  maxFrequency: 'maxFrequency',         // "5m" | "1h" | "1d"
  onFailure: 'onFailure',              // 'pause' | 'retry' | 'ignore'
  totalExecutions: 'totalExecutions',
  lastTriggeredAt: 'lastTriggeredAt',
  lastRunStatus: 'lastRunStatus',       // 'success' | 'error'

  // AutomationRun predicates
  ruleRef: 'ruleRef',                   // 关联的 AutomationRule URI
  runStatus: 'runStatus',               // 'running' | 'success' | 'error' | 'skipped'
  triggerEvent: 'triggerEvent',         // JSON: 触发事件快照
  executionLog: 'executionLog',         // JSON: 执行步骤日志
  startedAt: 'startedAt',
  endedAt: 'endedAt',
  errorMessage: 'errorMessage',

  // AutonomySettings（存储在 settingsTable，此处定义 key 常量）
  autonomyLevel: 'autonomyLevel',
  autonomyMaxTokens: 'autonomyMaxTokens',
  autonomyMaxTime: 'autonomyMaxTime',
  autonomyMaxFailures: 'autonomyMaxFailures',
  autonomyAllowedPaths: 'autonomyAllowedPaths',
  autonomyBlockedPaths: 'autonomyBlockedPaths',
  autonomyCommandWhitelist: 'autonomyCommandWhitelist',
})
```

### 6A.2 Automation Vocab 对象

```typescript
// packages/models/src/vocab/automation.vocab.ts

import { LINX_AUTO, DCTerms } from '../namespaces'

export const AutomationRuleVocab = {
  name: LINX_AUTO.ruleName,
  description: LINX_AUTO.ruleDescription,
  enabled: LINX_AUTO.ruleEnabled,
  triggerType: LINX_AUTO.triggerType,
  triggerConfig: LINX_AUTO.triggerConfig,
  actions: LINX_AUTO.actions,
  maxFrequency: LINX_AUTO.maxFrequency,
  onFailure: LINX_AUTO.onFailure,
  totalExecutions: LINX_AUTO.totalExecutions,
  lastTriggeredAt: LINX_AUTO.lastTriggeredAt,
  lastRunStatus: LINX_AUTO.lastRunStatus,
  createdAt: DCTerms.created,
  updatedAt: DCTerms.modified,
} as const

export const AutomationRunVocab = {
  ruleRef: LINX_AUTO.ruleRef,
  runStatus: LINX_AUTO.runStatus,
  triggerEvent: LINX_AUTO.triggerEvent,
  executionLog: LINX_AUTO.executionLog,
  startedAt: LINX_AUTO.startedAt,
  endedAt: LINX_AUTO.endedAt,
  errorMessage: LINX_AUTO.errorMessage,
} as const
```

### 6A.3 Pod 表定义

```typescript
// packages/models/src/automation/automation-rule.schema.ts（新增）

export const automationRuleTable = podTable(
  'automation_rule',
  {
    id: id('id'),
    name: string('name').predicate(LINX_AUTO.ruleName).notNull(),
    description: text('description').predicate(LINX_AUTO.ruleDescription),
    enabled: boolean('enabled').predicate(LINX_AUTO.ruleEnabled).default(true),

    // 触发条件
    triggerType: string('triggerType').predicate(LINX_AUTO.triggerType).notNull(),
    triggerConfig: text('triggerConfig').predicate(LINX_AUTO.triggerConfig).notNull(),

    // 执行动作（JSON 数组）
    actions: text('actions').predicate(LINX_AUTO.actions).notNull(),

    // 执行限制
    maxFrequency: string('maxFrequency').predicate(LINX_AUTO.maxFrequency).default('5m'),
    onFailure: string('onFailure').predicate(LINX_AUTO.onFailure).default('pause'),

    // 统计
    totalExecutions: integer('totalExecutions').predicate(LINX_AUTO.totalExecutions).default(0),
    lastTriggeredAt: timestamp('lastTriggeredAt').predicate(LINX_AUTO.lastTriggeredAt),
    lastRunStatus: string('lastRunStatus').predicate(LINX_AUTO.lastRunStatus),

    // Timestamps
    createdAt: timestamp('createdAt').predicate(DCTerms.created).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').predicate(DCTerms.modified).notNull().defaultNow(),
  },
  {
    base: '/.data/automation/rules/',
    sparqlEndpoint: '/.data/automation/rules/-/sparql',
    type: LINX_AUTO.AutomationRule,
    namespace: LINX_AUTO,
    subjectTemplate: '{id}.ttl',
  },
)

// packages/models/src/automation/automation-run.schema.ts（新增）

export const automationRunTable = podTable(
  'automation_run',
  {
    id: id('id'),
    ruleRef: uri('ruleRef').predicate(LINX_AUTO.ruleRef).notNull(),
    runStatus: string('runStatus').predicate(LINX_AUTO.runStatus).notNull().default('running'),
    triggerEvent: text('triggerEvent').predicate(LINX_AUTO.triggerEvent),
    executionLog: text('executionLog').predicate(LINX_AUTO.executionLog),
    startedAt: timestamp('startedAt').predicate(LINX_AUTO.startedAt).notNull().defaultNow(),
    endedAt: timestamp('endedAt').predicate(LINX_AUTO.endedAt),
    errorMessage: text('errorMessage').predicate(LINX_AUTO.errorMessage),
  },
  {
    base: '/.data/automation/runs/',
    sparqlEndpoint: '/.data/automation/runs/-/sparql',
    type: LINX_AUTO.AutomationRun,
    namespace: LINX_AUTO,
    subjectTemplate: '{id}.ttl',
  },
)
```

### 6A.4 AutonomySettings 存储方案

AutonomySettings 不单独建表，复用现有 `settingsTable`（key-value 模式）：

```typescript
// packages/models/src/settings/settings.schema.ts 中追加 SETTING_KEYS

export const SETTING_KEYS = {
  // ... 现有 keys ...

  // Autonomy 设置（新增）
  AUTONOMY_LEVEL: 'autonomy.level',                       // 'manual' | 'semi_auto' | 'full_auto'
  AUTONOMY_MAX_TOKENS: 'autonomy.maxTokensPerExecution',  // number
  AUTONOMY_MAX_TIME: 'autonomy.maxTimePerExecution',      // number (seconds)
  AUTONOMY_MAX_FAILURES: 'autonomy.maxConsecutiveFailures', // number
  AUTONOMY_ALLOWED_PATHS: 'autonomy.allowedPaths',        // JSON string[]
  AUTONOMY_BLOCKED_PATHS: 'autonomy.blockedPaths',        // JSON string[]
  AUTONOMY_COMMAND_WHITELIST: 'autonomy.commandWhitelist', // JSON string[]
} as const
```

> **设计决策**：AutonomySettings 是全局配置（非 per-rule），适合 key-value 存储。
> 如果未来需要 per-agent 或 per-session 的自治配置，再考虑独立建表。

### 6A.5 Automation → 审计日志集成

自动化规则执行时，需要写入审计日志（复用 02-sidecar-events 的 `auditTable`）：

| 自动化事件 | auditTable 写入 | 说明 |
|-----------|----------------|------|
| 规则触发 AI 消息 | `action='auto_ai_message'`, `actorRole='system'` | 自动化触发的 AI 对话 |
| 规则执行 CLI 命令 | `action='auto_command'`, `actorRole='system'` | 自动化执行的命令 |
| 规则执行失败 | `action='auto_error'`, `context={errorMessage}` | 失败记录 |
| 规则自动暂停 | `action='auto_pause'`, `context={reason}` | 连续失败后自动暂停 |

### 6A.6 存储路径汇总

| 实体 | Pod 路径 | RDF Type | Namespace | 状态 |
|------|---------|----------|-----------|------|
| AutomationRule | `/.data/automation/rules/{id}.ttl` | `lxa:AutomationRule` | LINX_AUTO | **新增** |
| AutomationRun | `/.data/automation/runs/{id}.ttl` | `lxa:AutomationRun` | LINX_AUTO | **新增** |
| AutonomySettings | `idp:///settings/{key}.ttl` | `schema:PropertyValue` | UDFS | 复用 settingsTable |

### 6A.7 Vocab 文件结构

```
packages/models/src/vocab/
├── automation.vocab.ts   ← AutomationRuleVocab, AutomationRunVocab

packages/models/src/automation/
├── automation-rule.schema.ts
├── automation-run.schema.ts
└── index.ts              ← 统一导出
```

### 6A.8 下游 Vocab 引用规则

| 消费方 | 引用的 Vocab | 用途 |
|--------|-------------|------|
| 03-xpod-client-core | AutonomySettings (SETTING_KEYS) | tool call 审批前检查自治等级 |
| 11-mcp-bridge | AutonomySettings (commandWhitelist) | 命令自动审批匹配 |
| 10-cli-collector | AutonomySettings (allowedPaths/blockedPaths) | 文件操作权限检查 |

---

## 7. 交互设计规格（Interaction Design Review）

> 本节定义自动化模块的 UI 交互规格，包括规则列表、AI 自治安全闸门、自治等级配置。

### 7.1 自动化规则列表

```
┌─────────────────────────────────────────────────────────┐
│ 自动化规则                                               │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ 🟢 代码审查助手                              [开/关]     │
│    当 CLI session 完成时，自动审查变更                     │
│    上次触发: 10分钟前 · 已执行 23 次                      │
│                                                          │
│ 🟡 日报生成                                  [开/关]     │
│    每天 18:00 汇总所有 session 生成日报                   │
│    上次触发: 昨天 18:00                                   │
│                                                          │
│ 🔴 紧急告警                                  [开/关]     │
│    当 session 出错时，推送通知到手机                       │
│    上次触发: 3天前                                        │
│                                                          │
├─────────────────────────────────────────────────────────┤
│ [+ 创建规则]                                             │
└─────────────────────────────────────────────────────────┘
```

#### 规则列表项视觉规格

| 元素 | 样式 | 说明 |
|------|------|------|
| 状态指示灯 | 🟢 启用 / 🟡 暂停 / 🔴 错误 / ⚪ 禁用 | 左侧圆点 |
| 规则名称 | `text-sm font-medium` | 第一行 |
| 规则描述 | `text-xs text-muted-foreground` | 第二行，一句话描述触发条件和动作 |
| 统计信息 | `text-xs text-muted-foreground` | 第三行，上次触发时间 + 累计执行次数 |
| 开关 | Switch 组件 | 右侧，启用/禁用规则 |

#### 规则操作

- 点击规则行 → 进入规则编辑页
- 右键菜单 → 编辑 / 复制 / 删除 / 查看执行历史
- 开关切换 → 立即生效，Toast 提示 "规则已启用/禁用"

### 7.2 创建/编辑规则

```
┌─────────────────────────────────────────────────────────┐
│ 创建自动化规则                                     [✕]   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  规则名称: [代码审查助手__________]                       │
│                                                          │
│  触发条件:                                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 当 [CLI session ▼] 的状态变为 [completed ▼]      │   │
│  │ 且 [修改文件数 ▼] [> ▼] [0]                      │   │
│  │ [+ 添加条件]                                      │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  执行动作:                                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │ [发送消息给 AI ▼]                                 │   │
│  │ AI: [Claude 3.5 Sonnet ▼]                        │   │
│  │ Prompt: [请审查以下代码变更，关注安全性和性能...]   │   │
│  │ [+ 添加动作]                                      │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  执行限制:                                               │
│  ├── 最大执行频率: [每 5 分钟最多 1 次 ▼]               │
│  └── 失败后: [暂停规则 ▼]                               │
│                                                          │
│                              [取消]  [保存规则]          │
└─────────────────────────────────────────────────────────┘
```

#### 触发条件类型

| 触发器 | 参数 | 说明 |
|--------|------|------|
| Session 状态变更 | session tool, target status | CLI session 完成/出错时 |
| 定时触发 | cron 表达式 或 简化选择器 | 每天/每周/自定义 |
| 消息匹配 | chat, keyword/regex | 特定聊天中出现关键词 |
| 手动触发 | 无 | 用户点击"立即执行"按钮 |

#### 执行动作类型

| 动作 | 参数 | 说明 |
|------|------|------|
| 发送消息给 AI | AI agent, prompt template | 触发 AI 对话 |
| 推送通知 | 通知内容模板 | 发送到 Web/Mobile |
| 执行 CLI 命令 | command, working directory | 在 sidecar 执行命令 |
| Webhook | URL, payload template | 调用外部 API |

### 7.3 AI 自治安全闸门 UI

```
┌─────────────────────────────────────────────────────────┐
│ Agent 自治设置                                           │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ 自治等级:                                                │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐                    │
│ │  手动    │ │ 半自动  │ │ 全自动  │                    │
│ │         │ │  ● 选中  │ │         │                    │
│ └─────────┘ └─────────┘ └─────────┘                    │
│                                                          │
│ 半自动模式:                                              │
│ ├── 🟢 读取操作: 自动执行                                │
│ ├── 🟡 写入操作: 需要确认                                │
│ ├── 🔴 删除操作: 必须确认                                │
│ └── 🔴 系统命令: 必须确认                                │
│                                                          │
│ 安全限制:                                                │
│ ├── 单次执行最大 token: [10000        ]                  │
│ ├── 单次执行最大时间:   [5 分钟  ▼]                      │
│ └── 连续失败自动停止:   [3 次    ▼]                      │
│                                                          │
│ 高级设置:                                                │
│ ├── 允许的文件路径:     [src/**, tests/** ]              │
│ ├── 禁止的文件路径:     [.env, *.key     ]              │
│ └── 允许的命令白名单:   [yarn *, npm test ]              │
│                                                          │
│                              [恢复默认]  [保存]          │
└─────────────────────────────────────────────────────────┘
```

#### 自治等级定义

| 等级 | 读取操作 | 写入操作 | 删除操作 | 系统命令 | 适用场景 |
|------|---------|---------|---------|---------|---------|
| 手动 | 需确认 | 需确认 | 需确认 | 需确认 | 初次使用、敏感项目 |
| 半自动 | 自动 | 需确认 | 需确认 | 需确认 | 日常开发（推荐） |
| 全自动 | 自动 | 自动 | 需确认 | 白名单内自动 | 信任的 CI/CD 场景 |

#### 安全限制说明

| 限制 | 默认值 | 触发行为 |
|------|--------|---------|
| 单次最大 token | 10,000 | 达到上限自动暂停，通知用户 |
| 单次最大时间 | 5 分钟 | 超时自动停止，标记为 error |
| 连续失败停止 | 3 次 | 连续 3 次工具调用失败，自动暂停 session |
| 文件路径限制 | 无限制 | 访问禁止路径时自动拒绝 + 通知 |
| 命令白名单 | 空（全部需确认） | 匹配白名单的命令自动执行 |

### 7.4 执行历史

每条规则可查看执行历史：

```
┌─────────────────────────────────────────────────────────┐
│ 代码审查助手 · 执行历史                                   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ ✅ 10:30  session "linx-web 重构" 完成后触发              │
│    审查了 3 个文件，发现 1 个潜在问题                      │
│    [查看详情]                                             │
│                                                          │
│ ✅ 09:15  session "API 端点修复" 完成后触发               │
│    审查了 5 个文件，无问题                                 │
│    [查看详情]                                             │
│                                                          │
│ ❌ 昨天 18:00  session "数据库迁移" 出错后触发            │
│    AI 响应超时                                            │
│    [查看详情]                                             │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 7.5 数据模型

```typescript
interface AutomationRule {
  id: string
  name: string
  description: string
  enabled: boolean
  trigger: {
    type: 'session_state' | 'schedule' | 'message_match' | 'manual'
    config: Record<string, unknown>
  }
  actions: Array<{
    type: 'send_ai_message' | 'push_notification' | 'execute_command' | 'webhook'
    config: Record<string, unknown>
  }>
  limits: {
    maxFrequency: string    // "5m", "1h", "1d"
    onFailure: 'pause' | 'retry' | 'ignore'
  }
  stats: {
    totalExecutions: number
    lastTriggeredAt?: string
    lastStatus?: 'success' | 'error'
  }
  createdAt: string
  updatedAt: string
}

interface AutonomySettings {
  level: 'manual' | 'semi_auto' | 'full_auto'
  limits: {
    maxTokensPerExecution: number
    maxTimePerExecution: number    // seconds
    maxConsecutiveFailures: number
  }
  fileAccess: {
    allowedPaths: string[]        // glob patterns
    blockedPaths: string[]        // glob patterns
  }
  commandWhitelist: string[]      // glob patterns
}
```

### 7.6 下游消费映射

| 数据 | 消费方 | 说明 |
|------|--------|------|
| `AutomationRule.trigger` | sidecar event listener | 监听事件并触发规则 |
| `AutomationRule.actions` | 11-mcp-bridge | 执行 AI 消息发送、命令执行 |
| `AutonomySettings.level` | 03-xpod-client-core | 决定 tool call 是否需要审批 |
| `AutonomySettings.fileAccess` | 10-cli-collector | 文件操作权限检查 |
| `AutonomySettings.commandWhitelist` | 11-mcp-bridge | 命令自动审批匹配 |

### 7.7 关键文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `automation/components/RuleListPane.tsx` | 新增 | 规则列表页 |
| `automation/components/RuleEditor.tsx` | 新增 | 规则创建/编辑弹窗 |
| `automation/components/RuleHistory.tsx` | 新增 | 执行历史列表 |
| `automation/components/AutonomySettings.tsx` | 新增 | AI 自治安全闸门设置页 |
| `automation/collections.ts` | 新增 | 规则 CRUD Collection |
| `settings/components/AutonomyCard.tsx` | 新增 | 设置页中的自治等级卡片 |

