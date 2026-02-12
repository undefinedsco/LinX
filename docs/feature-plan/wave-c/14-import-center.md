# feat/import-center 执行文档

> 波次：Wave C

## 1. 目标与范围

- 在侧边栏底部“更多”中提供二级入口：`导入数据`。
- `导入数据` 下的第一个工具为：`数据库导入（SQLite）`。
- 支持周期性将外部 SQLite 数据导入 Pod。
- MVP 支持 SQLite **无密码** 与 **密码** 两种模式。

## 2. 依赖关系

- 入依赖：`feat/contracts-chat-contact`、`feat/xpod-client-core`
- 出依赖：`feat/automation`（可消费导入产出的数据）

## 3. UI 设计

### 3.1 入口结构

- Sidebar 底部：`更多`（二级菜单）
- 更多 > 导入数据 > 数据库导入（SQLite）
- 其他导入工具先占位，不在 MVP 内实现

### 3.2 导入向导（SQLite）

- Step 1 数据源
  - SQLite 文件路径/URI
  - 认证模式：`none` / `password`
  - 密码输入（`password` 模式必填）
  - 测试连接
- Step 2 映射关系
  - 源对象（table 或 SQL）
  - 目标实体：`contacts + chats + messages + thread + files`
  - 字段映射（source -> target）
  - 主键映射与冲突策略（skip/upsert）
  - dry-run 预览
- Step 3 调度与运行
  - 手动执行
  - 周期配置（interval）
  - 最近运行记录（成功/失败、导入条数）

## 4. 数据模型设计

替换当前占位 `importJobSchema`，新增导入域表：

1. `importSourceTable`
- `id`, `name`, `sourceType(sqlite)`, `uri`, `authMode(none|password)`, `secretRef`, `enabled`, `createdAt`, `updatedAt`

2. `importMappingTable`
- `id`, `sourceId`, `targetEntity`, `sourceObject`, `fieldMap(json)`, `keyMap(json)`, `conflictPolicy`, `enabled`, `createdAt`, `updatedAt`

3. `importScheduleTable`
- `id`, `mappingId`, `intervalMinutes`, `nextRunAt`, `lastRunAt`, `enabled`

4. `importRunTable`
- `id`, `mappingId`, `status`, `startedAt`, `endedAt`, `rowsRead`, `rowsInserted`, `rowsUpdated`, `rowsFailed`, `errorSummary`

5. `importCheckpointTable`
- `mappingId`, `cursorField`, `cursorValue`, `lastSyncedAt`

### 4.1 安全约束

- Pod 中仅保存 `secretRef`，不保存明文密码。
- 密码存储在本地 service 安全存储（keychain/加密文件）。

## 5. 执行架构

- Web 端负责配置、映射、dry-run 与运行监控。
- `apps/service` 负责周期调度与执行器：
  - 读取 schedule
  - 连接 SQLite（none/password）
  - 数据映射与写入 Pod
  - 写入 run/checkpoint

## 6. 分阶段计划

### Phase 0（Contract Baseline）

- 导入域表 schema 与类型定义落地。
- “更多 > 导入数据 > 数据库导入”菜单骨架落地。
- SQLite 连接测试协议定义（none/password）。

### Phase 1（Vertical Slice）

- 打通 SQLite 手动导入链路（单次执行）。
- 打通映射配置与 dry-run 预览。
- 完成最小 e2e（测试连接 → 映射预览 → 手动导入成功）。

### Phase 2（Hardening & Cutover）

- 完成周期调度与 run/checkpoint 记录。
- 完成失败重试与错误可观测性。
- 作为“更多”菜单下稳定可用能力默认开启。

## 7. 代码集中回 main 的检查点

- CP0：合并导入域 schema、菜单入口骨架、连接测试协议。
- CP1：合并手动导入主链路与映射 dry-run（flag 默认关闭）。
- CP2：合并周期调度、运行记录与默认可用开关。

## 8. 分支 DoD

- 契约测试通过（导入域 schema、映射规则、SQLite authMode）。
- 至少 1 条端到端主链路可跑通。
- 关键失败路径有明确错误处理。
- 对应文档和迁移说明已更新。

## 9. 测试契约（并发开发必填）

- Test Owner：`TBD`
- Required Suites：`TBD`（至少包含 unit/integration/min-e2e）
- Upstream Contract Version：`TBD`
- Downstream Smoke：`TBD`（至少 1 个下游场景）

---

## 9A. Solid 数据建模规范

> Import Center 引入 5 张新的导入域 Pod 表，需要新的 namespace 和 Vocab 定义。

### 9A.1 新增 Namespace

```typescript
// 新增：LinX Import 词汇
export const LINX_IMPORT = createNamespace('lxi', 'https://vocab.linx.dev/import#', {
  // RDF Types
  ImportSource: 'ImportSource',
  ImportMapping: 'ImportMapping',
  ImportSchedule: 'ImportSchedule',
  ImportRun: 'ImportRun',
  ImportCheckpoint: 'ImportCheckpoint',

  // ImportSource predicates
  sourceType: 'sourceType',             // 'sqlite' | 'mysql' | 'csv' | ...
  sourceUri: 'sourceUri',               // 数据源连接 URI
  authMode: 'authMode',                 // 'none' | 'password'
  secretRef: 'secretRef',               // 本地安全存储引用（不存明文）
  enabled: 'enabled',

  // ImportMapping predicates
  sourceRef: 'sourceRef',               // 关联的 ImportSource URI
  targetEntity: 'targetEntity',         // 'contacts' | 'chats' | 'messages' | 'thread' | 'files'
  sourceObject: 'sourceObject',         // 源表名或 SQL
  fieldMap: 'fieldMap',                 // JSON: { sourceField: targetField }
  keyMap: 'keyMap',                     // JSON: { sourceKey: targetKey }
  conflictPolicy: 'conflictPolicy',     // 'skip' | 'upsert'

  // ImportSchedule predicates
  mappingRef: 'mappingRef',             // 关联的 ImportMapping URI
  intervalMinutes: 'intervalMinutes',
  nextRunAt: 'nextRunAt',
  lastRunAt: 'lastRunAt',

  // ImportRun predicates
  runStatus: 'runStatus',               // 'running' | 'success' | 'failed' | 'cancelled'
  startedAt: 'startedAt',
  endedAt: 'endedAt',
  rowsRead: 'rowsRead',
  rowsInserted: 'rowsInserted',
  rowsUpdated: 'rowsUpdated',
  rowsFailed: 'rowsFailed',
  errorSummary: 'errorSummary',

  // ImportCheckpoint predicates
  cursorField: 'cursorField',
  cursorValue: 'cursorValue',
  lastSyncedAt: 'lastSyncedAt',
})
```

### 9A.2 Import Vocab 对象

```typescript
// packages/models/src/vocab/import.vocab.ts

import { LINX_IMPORT, DCTerms, SCHEMA } from '../namespaces'

export const ImportSourceVocab = {
  name: DCTerms.title,
  sourceType: LINX_IMPORT.sourceType,
  sourceUri: LINX_IMPORT.sourceUri,
  authMode: LINX_IMPORT.authMode,
  secretRef: LINX_IMPORT.secretRef,
  enabled: LINX_IMPORT.enabled,
  createdAt: DCTerms.created,
  updatedAt: DCTerms.modified,
} as const

export const ImportMappingVocab = {
  sourceRef: LINX_IMPORT.sourceRef,
  targetEntity: LINX_IMPORT.targetEntity,
  sourceObject: LINX_IMPORT.sourceObject,
  fieldMap: LINX_IMPORT.fieldMap,
  keyMap: LINX_IMPORT.keyMap,
  conflictPolicy: LINX_IMPORT.conflictPolicy,
  enabled: LINX_IMPORT.enabled,
  createdAt: DCTerms.created,
  updatedAt: DCTerms.modified,
} as const

export const ImportScheduleVocab = {
  mappingRef: LINX_IMPORT.mappingRef,
  intervalMinutes: LINX_IMPORT.intervalMinutes,
  nextRunAt: LINX_IMPORT.nextRunAt,
  lastRunAt: LINX_IMPORT.lastRunAt,
  enabled: LINX_IMPORT.enabled,
} as const

export const ImportRunVocab = {
  mappingRef: LINX_IMPORT.mappingRef,
  runStatus: LINX_IMPORT.runStatus,
  startedAt: LINX_IMPORT.startedAt,
  endedAt: LINX_IMPORT.endedAt,
  rowsRead: LINX_IMPORT.rowsRead,
  rowsInserted: LINX_IMPORT.rowsInserted,
  rowsUpdated: LINX_IMPORT.rowsUpdated,
  rowsFailed: LINX_IMPORT.rowsFailed,
  errorSummary: LINX_IMPORT.errorSummary,
} as const

export const ImportCheckpointVocab = {
  mappingRef: LINX_IMPORT.mappingRef,
  cursorField: LINX_IMPORT.cursorField,
  cursorValue: LINX_IMPORT.cursorValue,
  lastSyncedAt: LINX_IMPORT.lastSyncedAt,
} as const
```

### 9A.3 Pod 表定义

```typescript
// packages/models/src/import/import-source.schema.ts（新增）

export const importSourceTable = podTable(
  'import_source',
  {
    id: id('id'),
    name: string('name').predicate(DCTerms.title).notNull(),
    sourceType: string('sourceType').predicate(LINX_IMPORT.sourceType).notNull().default('sqlite'),
    sourceUri: string('sourceUri').predicate(LINX_IMPORT.sourceUri).notNull(),
    authMode: string('authMode').predicate(LINX_IMPORT.authMode).notNull().default('none'),
    secretRef: string('secretRef').predicate(LINX_IMPORT.secretRef),
    enabled: boolean('enabled').predicate(LINX_IMPORT.enabled).default(true),
    createdAt: timestamp('createdAt').predicate(DCTerms.created).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').predicate(DCTerms.modified).notNull().defaultNow(),
  },
  {
    base: '/.data/import/sources/',
    sparqlEndpoint: '/.data/import/sources/-/sparql',
    type: LINX_IMPORT.ImportSource,
    namespace: LINX_IMPORT,
    subjectTemplate: '{id}.ttl',
  },
)

// packages/models/src/import/import-mapping.schema.ts（新增）

export const importMappingTable = podTable(
  'import_mapping',
  {
    id: id('id'),
    sourceRef: uri('sourceRef').predicate(LINX_IMPORT.sourceRef).notNull(),
    targetEntity: string('targetEntity').predicate(LINX_IMPORT.targetEntity).notNull(),
    sourceObject: string('sourceObject').predicate(LINX_IMPORT.sourceObject).notNull(),
    fieldMap: text('fieldMap').predicate(LINX_IMPORT.fieldMap).notNull(),
    keyMap: text('keyMap').predicate(LINX_IMPORT.keyMap),
    conflictPolicy: string('conflictPolicy').predicate(LINX_IMPORT.conflictPolicy).notNull().default('skip'),
    enabled: boolean('enabled').predicate(LINX_IMPORT.enabled).default(true),
    createdAt: timestamp('createdAt').predicate(DCTerms.created).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').predicate(DCTerms.modified).notNull().defaultNow(),
  },
  {
    base: '/.data/import/mappings/',
    sparqlEndpoint: '/.data/import/mappings/-/sparql',
    type: LINX_IMPORT.ImportMapping,
    namespace: LINX_IMPORT,
    subjectTemplate: '{id}.ttl',
  },
)

// packages/models/src/import/import-schedule.schema.ts（新增）

export const importScheduleTable = podTable(
  'import_schedule',
  {
    id: id('id'),
    mappingRef: uri('mappingRef').predicate(LINX_IMPORT.mappingRef).notNull(),
    intervalMinutes: integer('intervalMinutes').predicate(LINX_IMPORT.intervalMinutes).notNull(),
    nextRunAt: timestamp('nextRunAt').predicate(LINX_IMPORT.nextRunAt),
    lastRunAt: timestamp('lastRunAt').predicate(LINX_IMPORT.lastRunAt),
    enabled: boolean('enabled').predicate(LINX_IMPORT.enabled).default(true),
  },
  {
    base: '/.data/import/schedules/',
    sparqlEndpoint: '/.data/import/schedules/-/sparql',
    type: LINX_IMPORT.ImportSchedule,
    namespace: LINX_IMPORT,
    subjectTemplate: '{id}.ttl',
  },
)

// packages/models/src/import/import-run.schema.ts（新增）

export const importRunTable = podTable(
  'import_run',
  {
    id: id('id'),
    mappingRef: uri('mappingRef').predicate(LINX_IMPORT.mappingRef).notNull(),
    runStatus: string('runStatus').predicate(LINX_IMPORT.runStatus).notNull().default('running'),
    startedAt: timestamp('startedAt').predicate(LINX_IMPORT.startedAt).notNull().defaultNow(),
    endedAt: timestamp('endedAt').predicate(LINX_IMPORT.endedAt),
    rowsRead: integer('rowsRead').predicate(LINX_IMPORT.rowsRead).default(0),
    rowsInserted: integer('rowsInserted').predicate(LINX_IMPORT.rowsInserted).default(0),
    rowsUpdated: integer('rowsUpdated').predicate(LINX_IMPORT.rowsUpdated).default(0),
    rowsFailed: integer('rowsFailed').predicate(LINX_IMPORT.rowsFailed).default(0),
    errorSummary: text('errorSummary').predicate(LINX_IMPORT.errorSummary),
  },
  {
    base: '/.data/import/runs/',
    sparqlEndpoint: '/.data/import/runs/-/sparql',
    type: LINX_IMPORT.ImportRun,
    namespace: LINX_IMPORT,
    subjectTemplate: '{id}.ttl',
  },
)

// packages/models/src/import/import-checkpoint.schema.ts（新增）

export const importCheckpointTable = podTable(
  'import_checkpoint',
  {
    id: id('id'),
    mappingRef: uri('mappingRef').predicate(LINX_IMPORT.mappingRef).notNull(),
    cursorField: string('cursorField').predicate(LINX_IMPORT.cursorField).notNull(),
    cursorValue: string('cursorValue').predicate(LINX_IMPORT.cursorValue).notNull(),
    lastSyncedAt: timestamp('lastSyncedAt').predicate(LINX_IMPORT.lastSyncedAt).notNull().defaultNow(),
  },
  {
    base: '/.data/import/checkpoints/',
    sparqlEndpoint: '/.data/import/checkpoints/-/sparql',
    type: LINX_IMPORT.ImportCheckpoint,
    namespace: LINX_IMPORT,
    subjectTemplate: '{id}.ttl',
  },
)
```

### 9A.4 安全约束

| 约束 | 实现 | 说明 |
|------|------|------|
| 密码不存 Pod | `secretRef` 仅存引用 ID | 明文密码存 `apps/service` 本地 keychain |
| fieldMap 校验 | 写入前验证 JSON 格式 | 防止注入恶意映射 |
| targetEntity 白名单 | 仅允许 `contacts\|chats\|messages\|thread\|files` | 防止写入非预期表 |

### 9A.5 存储路径汇总

| 实体 | Pod 路径 | RDF Type | Namespace | 状态 |
|------|---------|----------|-----------|------|
| ImportSource | `/.data/import/sources/{id}.ttl` | `lxi:ImportSource` | LINX_IMPORT | **新增** |
| ImportMapping | `/.data/import/mappings/{id}.ttl` | `lxi:ImportMapping` | LINX_IMPORT | **新增** |
| ImportSchedule | `/.data/import/schedules/{id}.ttl` | `lxi:ImportSchedule` | LINX_IMPORT | **新增** |
| ImportRun | `/.data/import/runs/{id}.ttl` | `lxi:ImportRun` | LINX_IMPORT | **新增** |
| ImportCheckpoint | `/.data/import/checkpoints/{id}.ttl` | `lxi:ImportCheckpoint` | LINX_IMPORT | **新增** |

### 9A.6 Vocab 文件结构

```
packages/models/src/vocab/
├── import.vocab.ts     ← ImportSourceVocab, ImportMappingVocab, ImportScheduleVocab, ImportRunVocab, ImportCheckpointVocab

packages/models/src/import/
├── import-source.schema.ts
├── import-mapping.schema.ts
├── import-schedule.schema.ts
├── import-run.schema.ts
├── import-checkpoint.schema.ts
└── index.ts            ← 统一导出
```
