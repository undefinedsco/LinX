# LinX 与 xpod Chat API 集成设计

> 状态：📝 草稿
> 创建时间：2026-02-08

## 背景

xpod 提供了统一的 Chat API 代理层，LinX 需要从直接调用各 AI 厂商 API 改为调用 xpod 的 `/v1/*` 端点。

### 当前问题

1. **安全风险** - LinX 前端直接持有 API Key，从 Pod 读取后在浏览器发起请求
2. **代码冗余** - `inferBaseUrl()` 硬编码各厂商地址，维护成本高
3. **功能受限** - 无法利用 xpod 的 proxy、计费、审计等能力

### 目标架构

```
┌─────────────────────────────────────────────────────────────┐
│  LinX (前端)                                                │
│  - 使用 session.fetch (Solid Token 认证)                    │
│  - 只需知道 xpod 地址 (从 podUrl 推导)                       │
└─────────────────────────────────────────────────────────────┘
                              ↓ POST /v1/chat/completions
                              ↓ (Solid Token in Authorization header)
┌─────────────────────────────────────────────────────────────┐
│  xpod (后端)                                                │
│  - 验证 Solid Token，获取用户身份                            │
│  - 从用户 Pod 读取 AI 配置 (credential, provider, model)     │
│  - 代理请求到实际的 AI 服务                                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  OpenAI / Anthropic / DeepSeek / Ollama                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 用户配置数据模型

### 三表结构（与 xpod 对齐）

LinX 当前已经以三表为 AI 配置主线，与 xpod schema 对齐；旧的单表 `modelProviderTable` 已删除。

#### 1. Credential 表 - 凭据存储

**路径**: `/settings/credentials.ttl`

**Namespace**: `https://vocab.xpod.dev/credential#`

```typescript
export const credentialTable = podTable('credential', {
  id: string('id').primaryKey(),
  provider: uri('provider'),        // 关联 provider id
  service: string('service'),       // 'ai' | 'storage' | ...
  status: string('status'),         // 'active' | 'inactive' | 'expired'
  apiKey: string('apiKey'),         // API 密钥
  baseUrl: string('baseUrl'),       // 可选，覆盖 provider 默认地址
  label: string('label'),           // 用户自定义标签
  lastUsedAt: datetime('lastUsedAt'),
  failCount: int('failCount'),
  rateLimitResetAt: datetime('rateLimitResetAt'),
}, {
  base: '/settings/credentials.ttl',
  type: 'https://vocab.xpod.dev/credential#Credential',
  subjectTemplate: '#{id}',
})
```

#### 2. Provider 表 - AI 供应商配置

**路径**: `/settings/ai/providers.ttl`

**Namespace**: `https://vocab.xpod.dev/ai#`

```typescript
export const providerTable = podTable('provider', {
  id: string('id').primaryKey(),    // 'openai' | 'anthropic' | ...
  baseUrl: string('baseUrl'),       // 默认 API 地址
  proxyUrl: string('proxyUrl'),     // 代理地址（可选）
  hasModel: uri('hasModel'),        // 关联的 model URI
}, {
  base: '/settings/ai/providers.ttl',
  type: 'https://vocab.xpod.dev/ai#Provider',
  subjectTemplate: '#{id}',
})
```

#### 3. Model 表 - AI 模型配置

**路径**: `/settings/ai/models.ttl`

**Namespace**: `https://vocab.xpod.dev/ai#`

```typescript
export const modelTable = podTable('model', {
  id: string('id').primaryKey(),    // 模型 ID，如 'gpt-4o'
  displayName: string('displayName'),
  modelType: string('modelType'),   // 'chat' | 'embedding' | 'completion'
  isProvidedBy: uri('isProvidedBy'), // 关联 provider URI
  dimension: int('dimension'),      // embedding 维度（可选）
  status: string('status'),         // 'active' | 'deprecated'
  createdAt: datetime('createdAt'),
  updatedAt: datetime('updatedAt'),
}, {
  base: '/settings/ai/models.ttl',
  type: 'https://vocab.xpod.dev/ai#Model',
  subjectTemplate: '#{id}',
})
```

### 数据关系

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Credential    │     │    Provider     │     │     Model       │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id              │     │ id              │◄────│ isProvidedBy    │
│ provider ───────┼────►│ baseUrl         │     │ id              │
│ apiKey          │     │ proxyUrl        │     │ displayName     │
│ service         │     │ hasModel ───────┼────►│ modelType       │
│ status          │     └─────────────────┘     │ dimension       │
└─────────────────┘                             └─────────────────┘
```

### 示例数据

**`/settings/credentials.ttl`**:
```turtle
@prefix cred: <https://vocab.xpod.dev/credential#> .

<#openai-key-1> a cred:Credential ;
    cred:provider </settings/ai/providers.ttl#openai> ;
    cred:service "ai" ;
    cred:status "active" ;
    cred:apiKey "sk-xxx..." ;
    cred:label "我的 OpenAI Key" .
```

**`/settings/ai/providers.ttl`**:
```turtle
@prefix ai: <https://vocab.xpod.dev/ai#> .

<#openai> a ai:Provider ;
    ai:baseUrl "https://api.openai.com/v1" ;
    ai:hasModel </settings/ai/models.ttl#gpt-4o> .

<#anthropic> a ai:Provider ;
    ai:baseUrl "https://api.anthropic.com/v1" ;
    ai:proxyUrl "http://proxy.example.com:8080" .
```

**`/settings/ai/models.ttl`**:
```turtle
@prefix ai: <https://vocab.xpod.dev/ai#> .

<#gpt-4o> a ai:Model ;
    ai:displayName "GPT-4o" ;
    ai:modelType "chat" ;
    ai:isProvidedBy </settings/ai/providers.ttl#openai> ;
    ai:status "active" .
```

---

## 用户配置流程

### 配置入口

用户在 LinX 的「模型服务」模块配置 AI Provider：

**路径**: 设置 → 模型服务 → 选择 Provider

### 配置步骤

1. **选择 Provider** - 从预定义列表选择（OpenAI、Anthropic 等）
2. **填写 API Key** - 输入从厂商获取的密钥
3. **配置 Base URL**（可选）- 自定义 API 地址或代理
4. **选择 Models** - 启用需要的模型

### 数据写入

LinX 将配置写入用户 Pod 的三个文件：
- `/settings/credentials.ttl` - API Key
- `/settings/ai/providers.ttl` - Provider 配置
- `/settings/ai/models.ttl` - Model 列表

### xpod 读取配置

xpod 的 `InternalPodService` 从这些路径读取配置，组装成 AI 请求所需的参数。

---

## xpod Chat API 规范

### 端点列表

| 端点 | 方法 | 用途 | 兼容性 |
|------|------|------|--------|
| `/v1/chat/completions` | POST | OpenAI 兼容聊天补全 | OpenAI SDK |
| `/v1/responses` | POST | OpenAI Responses API | OpenAI 新 API |
| `/v1/messages` | POST | Anthropic Messages API | Claude SDK |
| `/v1/models` | GET | 列出可用模型 | OpenAI SDK |

### 认证方式

xpod 支持两种认证：

1. **Solid Token** (前端使用) - 通过 `session.fetch` 自动携带
2. **API Key** (第三方使用) - `Authorization: Bearer <api-key>`

LinX 使用 Inrupt 的 `session.fetch`，自动携带 Solid Token。

### 请求格式

**POST /v1/chat/completions**

```typescript
interface ChatCompletionRequest {
  model: string              // 格式: "provider/model" 如 "openai/gpt-4o"
  messages: Array<{
    role: 'system' | 'user' | 'assistant'
    content: string
  }>
  temperature?: number       // 0-2, 默认 0.7
  max_tokens?: number        // 最大输出 token
  stream?: boolean           // 是否流式返回
}
```

**model 字段格式**

使用 `provider/model` 格式，xpod 根据 provider 从用户 Pod 读取对应配置：

| provider | 示例 model | 说明 |
|----------|-----------|------|
| `openai` | `openai/gpt-4o` | OpenAI 官方 |
| `anthropic` | `anthropic/claude-3-opus` | Anthropic Claude |
| `deepseek` | `deepseek/deepseek-chat` | DeepSeek |
| `ollama` | `ollama/llama3` | 本地 Ollama |
| `openrouter` | `openrouter/meta-llama/llama-3-70b` | OpenRouter |

### 响应格式

**非流式响应**

```typescript
interface ChatCompletionResponse {
  id: string
  object: 'chat.completion'
  created: number
  model: string
  choices: Array<{
    index: number
    message: {
      role: 'assistant'
      content: string
    }
    finish_reason: 'stop' | 'length' | 'content_filter'
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}
```

**流式响应 (SSE)**

```
data: {"choices":[{"delta":{"content":"Hello"}}]}
data: {"choices":[{"delta":{"content":" world"}}]}
data: {"choices":[{"delta":{"reasoning_content":"Let me think..."}}]}
data: [DONE]
```

特殊字段：
- `delta.content` - 正常输出内容
- `delta.reasoning_content` - DeepSeek R1 风格的思考过程

---

## LinX 改动方案

### 1. Schema 改动（`packages/models`）

**新增**:
- `credential.schema.ts` - 凭据表
- `ai-provider.schema.ts` - Provider 表
- `ai-model.schema.ts` - Model 表

**修改**:
- `namespaces.ts` - 添加 xpod 的 namespace 定义
- `index.ts` - 导出新表

### 2. UI 改动（`apps/web/src/modules/model-services`）

**修改**:
- `collections.ts` - 改用新的三表结构
- `hooks/useModelServices.ts` - 适配新 schema
- `ModelServicesContentPane.tsx` - UI 逻辑适配

### 3. Chat Handler 改动

**修改 `types.ts`**:

在 `ChatHandlerContext.session` 中添加 `fetch` 字段：

```typescript
export interface ChatHandlerContext {
  // ...
  session: {
    webId: string
    podUrl: string
    fetch: typeof fetch  // 新增：Inrupt authenticated fetch
  }
}
```

**修改 `useChatHandler.ts`**:

传入 `session.fetch`：

```typescript
const ctx = {
  // ...
  session: {
    webId: session.info.webId,
    podUrl,
    fetch: session.fetch,  // 新增
  },
}
```

**修改 `agent-handler.ts`**:

改为调用 xpod API：

```typescript
// Before: 直接调用厂商 API
const endpoint = `${baseUrl}/chat/completions`
const response = await fetch(endpoint, {
  headers: { 'Authorization': `Bearer ${apiKey}` },
})

// After: 调用 xpod 代理
const { podUrl, fetch: authFetch } = this.ctx.session
const endpoint = `${podUrl.replace(/\/$/, '')}/v1/chat/completions`
const response = await authFetch(endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: `${agent.provider}/${agent.model}`,
    messages: apiMessages,
    stream: true,
  }),
})
```

**删除**:
- `inferBaseUrl()` 函数
- 从 Pod 读取 apiKey 的逻辑
- `api/chatkit.ts`

---

## 文件改动清单

### packages/models

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `credential.schema.ts` | 新增 | 凭据表 |
| `ai-provider.schema.ts` | 新增 | Provider 表 |
| `ai-model.schema.ts` | 新增 | Model 表 |
| `namespaces.ts` | 修改 | 添加 xpod namespace |
| `index.ts` | 修改 | 导出新表 |

### apps/web/src/modules/model-services

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `collections.ts` | 修改 | 改用三表结构 |
| `hooks/useModelServices.ts` | 修改 | 适配新 schema |
| `ModelServicesContentPane.tsx` | 修改 | UI 逻辑适配 |
| `types.ts` | 修改 | 类型定义更新 |

### apps/web/src/modules/chat

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `services/types.ts` | 修改 | session 加 fetch 字段 |
| `hooks/useChatHandler.ts` | 修改 | 传入 session.fetch |
| `services/handlers/agent-handler.ts` | 重构 | 改用 xpod API |

### apps/web/src/api

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `chatkit.ts` | 删除 | 不再需要 |

---

## 测试计划

### 单元测试

1. 验证新 schema 的 CRUD 操作
2. 验证 `agent-handler.ts` 构建正确的请求格式
3. 验证 model 字段格式为 `provider/model`

### 集成测试

1. 启动 xpod (local 模式)
2. 在 LinX「模型服务」中配置 Provider（如 Ollama）
3. 验证数据正确写入 Pod 的三个文件
4. 创建 AI Agent，选择配置好的 Provider 和 Model
5. 发起 AI 对话
6. 验证：
   - 请求正确到达 xpod
   - 流式响应正常显示
   - thinking 内容正确解析

---

## 相关文档

- [xpod Sidecar API](../../../xpod/docs/sidecar-api.md)
- [xpod ChatHandler](../../../xpod/src/api/handlers/ChatHandler.ts)
- [xpod VercelChatService](../../../xpod/src/api/service/VercelChatService.ts)
- [xpod Credential Schema](../../../xpod/src/credential/schema/tables.ts)
- [xpod AI Schema](../../../xpod/src/embedding/schema/tables.ts)
