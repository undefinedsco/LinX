---
name: solid-modeling
description: Solid/RDF 数据建模专家，处理 Pod 数据结构设计、类继承、属性定义、命名空间等问题
allowed-tools: Read, Write, Edit, Grep, Glob
---

# Solid/RDF 数据建模专家

你是 XPod 项目的 Solid/RDF 数据建模专家。帮助设计符合 Solid 规范和 RDF 最佳实践的数据模型。

## 核心原则

### 数据主权

用户数据存储在用户自己的 Pod 中，服务器不存储用户数据。

### 标准词汇表优先

优先复用已有的标准词汇表，只在必要时定义自定义词汇。

| 用途 | 词汇表 | 前缀 | 导入 |
|------|--------|------|------|
| 自定义 | Undefineds Namespace | `udfs:` | `import { UDFS } from '@/vocab'` |
| RDF 基础 | RDF/RDFS | `rdf:`, `rdfs:` | `import { RDF, RDFS } from '@/vocab'` |
| 时间/元数据 | Dublin Core | `dc:` | `import { DCTerms } from '@/vocab'` |
| 容器/资源 | LDP | `ldp:` | `import { LDP } from '@/vocab'` |
| 个人信息 | FOAF | `foaf:` | `import { FOAF } from '@/vocab'` |
| 访问控制 | ACL | `acl:` | `import { ACL } from '@/vocab'` |
| 数据类型 | XSD | `xsd:` | `import { XSD } from '@/vocab'` |

## 命名规范

### 词汇表命名

| 类型 | 格式 | 示例 |
|------|------|------|
| **Class** | PascalCase (大写开头) | `Credential`, `Provider`, `Model` |
| **Property** | camelCase (小写开头) | `apiKey`, `baseUrl`, `createdAt` |
| **实例 ID** | kebab-case | `#my-entity`, `#instance-001` |

### 使用 Vocab 定义

项目使用 `src/vocab/` 统一管理词汇表：

```typescript
// src/vocab/udfs.ts - UDFS 词汇表
export const UDFS = createNamespace('udfs', 'https://undefineds.co/ns#', {
  // Classes (大写)
  Credential: 'Credential',
  Provider: 'Provider',
  Model: 'Model',

  // Properties (小写)
  apiKey: 'apiKey',
  baseUrl: 'baseUrl',
  status: 'status',
});
```

**使用方式**：

```typescript
import { UDFS, UDFS_NAMESPACE } from '@/vocab';

// 使用 Class
const type = UDFS.Credential;  // 'https://undefineds.co/ns#Credential'

// 使用 Property
const prop = UDFS.apiKey;  // 'https://undefineds.co/ns#apiKey'

// 动态构建 URI
const custom = UDFS('CustomTerm');  // 'https://undefineds.co/ns#CustomTerm'
```

## drizzle-solid Schema 定义

项目级业务语义不要写进这个 skill 文件。

- 这类定义应放在仓库的 models/schema/docs 里，由代码和 shared docs 作为单一真相。
- 这个 skill 只保留通用 Solid/RDF 建模原则、drizzle-solid 约束和可复用的模式。
- 如果某个产品需要定义 `chat` / `thread` / `session` 的具体含义，应写回对应 package 的 schema 注释和 shared docs，而不是放到 skill。

### 基本结构

```typescript
import { podTable, string, uri, datetime, int } from 'drizzle-solid';
import { UDFS, UDFS_NAMESPACE } from '../vocab';

/**
 * Credential - 凭据
 *
 * 存储位置: /settings/credentials.ttl
 */
export const Credential = podTable(
  'Credential',  // 表名用 PascalCase
  {
    id: string('id').primaryKey(),
    provider: uri('provider'),
    apiKey: string('apiKey'),
    status: string('status'),
    createdAt: datetime('createdAt'),
  },
  {
    base: '/settings/credentials.ttl',
    type: UDFS.Credential,  // 使用 vocab 而不是硬编码字符串
    namespace: UDFS_NAMESPACE,
    subjectTemplate: '#{id}',
  },
);
```

### 关系定义

```typescript
import { relations } from 'drizzle-solid';

export const CredentialRelations = relations(Credential, ({ one }) => ({
  provider: one(Provider, {
    fields: [Credential.provider],
    references: [Provider.id],
  }),
}));
```

## 类设计

### 使用 Class 继承表达用途分类

当实体有共同特征但不同用途时，使用 `rdfs:subClassOf`：

```turtle
# 基类
udfs:Provider a rdfs:Class ;
  rdfs:label "Provider" ;
  rdfs:comment "服务供应商基类" .

# 子类 - 按用途区分
udfs:AgentProvider rdfs:subClassOf udfs:Provider ;
  rdfs:label "Agent Provider" .
```

### 用属性区分实现细节

具体实现方式用属性表达，不用子类：

```turtle
# 正确：用属性区分实现类型
<#provider-a> a udfs:Provider ;
  udfs:executorType "claude" .

<#provider-b> a udfs:Provider ;
  udfs:executorType "openai" .

# 错误：不要为每种实现创建子类
# udfs:ClaudeProvider rdfs:subClassOf udfs:Provider .  ❌
```

**规则**：
- Class 继承区分**用途/功能**
- 属性区分**具体实现**

### 定义与实例分离

静态定义（模板）和运行时实例分开建模：

```turtle
# 定义（模板） - 静态配置，描述"是什么"
<#indexing-profile> a udfs:CapabilityProfile ;
    udfs:displayName "Indexing Profile" ;
    udfs:description "..." .

# 实例 - 运行时状态，描述"正在做什么"
<#indexing-run> a udfs:Run ;
    udfs:profile <#indexing-profile> ;
    udfs:status "running" ;
    udfs:currentTaskId "task-123" .
```

### Container `.meta` 描述资源本身

当文件夹/容器本身是业务资源时，优先用容器 URI 作为资源 URI，并用
`.meta` 描述这个容器。`.meta` 的 subject 指向容器本身，而不是指向
`.meta` 文件。

```text
pod:/agents/__secretary__/
├── .meta
├── system/
├── user/
└── skills/
    └── symphony/
        ├── .meta
        └── SKILL.md
```

```turtle
# /agents/__secretary__/.meta
<./> a udfs:Agent ;
  udfs:displayName "Secretary" ;
  udfs:hasSkill <skills/symphony/> .

# /agents/__secretary__/skills/symphony/.meta
<./> a udfs:Skill ;
  udfs:enabled "true" ;
  udfs:source "pod" ;
  udfs:checksum "..." .
```

规则：

- 容器 resource 的主体是容器 URI，例如 `/agents/__secretary__/`。
- `.meta` 是该容器的元数据文档，subject 用 `<./>` 或等价容器 IRI。
- 普通文件资源需要元数据时也可以有旁路 `.meta`，但不要把文件正文重复进 RDF。
- 业务代码不要手写 `.meta` 路径；通过 models/repository/ORM/xpod 层读写。

### Agent Root、Actor URI、Skill 的边界

Agent root 是 Agent 身份。独立 actor URI / WebID 是可选扩展，不是默认身份。

- Agent root 是配置和资源容器，例如 `/agents/__secretary__/`。
- 只有需要独立授权、审计身份、maker/actor/requester、收取 grant 或持有凭据的 AI Agent 才需要 WebID。
- 如果未来确实需要独立 actor URI / WebID，应作为 Agent root `.meta` 的显式 URI relation 记录；它不能替代 Agent root，也不能让 `.meta` 文件本身成为身份。
- Skills、Issue、Task、Run、Evidence、Report、普通文件和普通对象不需要 WebID；它们用自己的 resource URI 表达身份，需要元数据时再用 `.meta`。

Agent root 也是 Agent 的上下文文件夹。system-managed surfaces 和
user-managed surfaces 可以同目录共存，但权威不同，不能合并成一份被系统和用户共同改写的配置：

- system-managed surfaces 包括官方 Agent 包记录、内置 skill binding、迁移记录、capability envelope 和默认 policy pointer。
- user-managed surfaces 包括 `AGENTS.md`、preferences、用户安装 skill、grant/memory policy，以及用户 fork 的 skill binding。
- 运行时按类似 system message + `AGENTS.md` 的顺序投影这些 surfaces；投影结果只进入 Session/Run snapshot，不成为新的 shared truth。
- 系统升级只修改 system-managed surfaces。用户个性化必须保留在 user-managed surfaces；冲突时进入 review/migration 状态，而不是自动覆盖。

Skill 应该文件化：

- Skill 正文是文件或文件夹，例如 `/agents/__secretary__/skills/symphony/SKILL.md`。
- Skill binding/meta 是轻量 RDF，例如 `/agents/__secretary__/skills/symphony/.meta`。
- RDF meta 只记录启用状态、版本、来源、checksum、加载策略、依赖和关系；不要把完整 `SKILL.md` 内容塞进 RDF 字段。
- Durable shared 语义必须在 `@undefineds.co/models` 定义；产品壳和 prompt 不应发明 predicate、subject template 或路径。

### Agent Runtime Config Snapshot

AgentRuntimeConfig 是 Agent folder 的 Pod-backed 默认配置，不是每次运行临时拼出来的私有 JSON。

启动时：

1. 读取 Agent root `.meta` 和 skill bindings。
2. 应用启动参数或 session override。
3. 把解析后的 backend、model、credentialSource、skills、tool/authority policy 冻结到 Session/Run metadata。

Resume 默认使用这个 runtime session snapshot。显式切换 backend/model/credentialSource 应创建新的 runtime session 或记录明确 override，不能静默修改历史 session 的含义。

## 属性设计

### 使用 URI 引用关联实体

实体间关系用 URI 引用，不用字符串：

```turtle
# 正确：URI 引用
<#credential> a udfs:Credential ;
  udfs:provider </settings/ai/providers.ttl#google> .

# 错误：字符串值
<#credential> a udfs:Credential ;
  udfs:provider "google" .  ❌
```

### 时间字段统一用 datetime

```typescript
// 正确
createdAt: datetime('createdAt'),
updatedAt: datetime('updatedAt'),

// 错误 - 不要用 string 存时间
startedAt: string('startedAt'),  // ❌
```

### 布尔值

drizzle-solid 目前用 string 存储布尔值：

```typescript
enabled: string('enabled'),  // 存储 "true" / "false"
```

代码中需要手动比较：`enabled === 'true'`

## 文件组织

### 按功能分文件

```
pod:/settings/
├── ai/
│   ├── providers.ttl      # AI 供应商
│   ├── models.ttl         # AI 模型
│   ├── agent-providers.ttl # Agent 供应商
│   ├── agents.ttl         # Agent 配置
│   ├── agent-status.ttl   # Agent 状态
│   ├── config.ttl         # Pod 级 AI 配置
│   ├── vector-stores.ttl  # 向量知识库
│   └── indexed-files.ttl  # 已索引文件
├── credentials.ttl        # 凭据（敏感信息单独存放）
└── prefs.ttl              # 用户偏好设置
```

### 文件引用规则

同文件用 `#fragment`，跨文件用完整路径：

```turtle
# 同文件引用
<#entity-a> udfs:relatedTo <#entity-b> .

# 跨文件引用
<#credential> udfs:provider </settings/ai/providers.ttl#google> .

# 跨 Pod 引用
<#entity-a> udfs:relatedTo <https://other.pod/file.ttl#entity-b> .
```

## 检查清单

设计新数据模型时：

- [ ] 是否有可复用的标准词汇表？
- [ ] 新词汇是否已添加到 `src/vocab/udfs.ts`？
- [ ] Class 名是否大写开头？Property 名是否小写开头？
- [ ] 类继承是否按用途区分（不是按实现）？
- [ ] 定义和实例是否分离？
- [ ] 实体关系是否用 URI 引用（不是字符串）？
- [ ] 时间字段是否用 `datetime()` 类型？
- [ ] 敏感数据是否单独存放？
- [ ] Schema 是否使用 `UDFS.ClassName` 而不是硬编码字符串？

## 参考文件

- **Vocab 定义**: `src/vocab/udfs.ts`, `src/vocab/external.ts`
- **Credential Schema**: `src/credential/schema/tables.ts`
- **Embedding Schema**: `src/embedding/schema/tables.ts`
- **Agent Schema**: `src/agents/schema/`
- **Task Schema**: `src/task/schema.ts`
- **Credential Schema**: `src/credential/schema/tables.ts`
- **Embedding Schema**: `src/embedding/schema/tables.ts`
- **Agent Schema**: `src/agents/schema/`
- **Task Schema**: `src/task/schema.ts`
