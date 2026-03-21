# CLI / App Shared Core

本文档定义 LinX CLI 与 LinX App 的共享边界。

目标只有一个：CLI 和 App 共享同一个 domain + service 内核，只在最外层分别套 TUI 和 GUI。

当前权威包约定：

- `@undefineds.co/models`：共享数据面权威源
- `@linx/models`：Linx 仓内兼容入口，逐步收缩为适配层

## Core Rule

- CLI 和 App 必须共享数据模型、领域语义、用例服务、运行时协议。
- CLI 和 App 不共享命令行壳、React 壳、页面状态壳、展示元数据壳。
- 如果某段逻辑同时被 CLI 和 App 需要，它不能继续留在 `apps/web` 或 `apps/cli` 内部。

## Shared Layers

### 1. Storage Contracts

必须共享：

- Pod schema
- RDF namespace / predicate / subject 规则
- 本地 `~/.linx` 配置文件结构
- watch session archive 格式
- sidecar / approval / tool-call 事件格式

推荐落点：

- `@undefineds.co/models`: Pod schema、repository、runtime contracts
- 后续独立 shared package: 本地配置 schema、watch archive schema、client session schema

当前主线：

- `@linx/models/watch`: watch session/event/archive contract
- `@linx/models/watch`: `credential-source=local|cloud|auto` 解析 helper
- `@linx/models/watch`: auth failure / auth status normalization helper
- `@linx/models/watch`: generic JSON line / codex JSON-RPC event normalization helper
- `@linx/models/watch`: approval request / structured user-input / auto-approval decision helper
- `@undefineds.co/models`: `approval / audit / inbox_notification` 是跨端 remote approval 的共享真相
- `@linx/models/client`: `~/.linx` account/config/secrets contract
- `@linx/models/client`: linx cloud login bootstrap / whoami field helper
- `@linx/models/client`: linx cloud account API 与 runtime API URL 解析 helper

强约束：

- 不允许 CLI 和 App 分别维护不同的 predicate 或 subject 规则
- 不允许一端写 `udfs:*`，另一端读 `cred:*` / `ai:*`
- 不允许新功能继续建立平行 schema

## 2. Domain Models

必须共享的领域对象：

- `AccountSession`
- `AIProviderConfig`
- `AICredential`
- `AIModel`
- `Thread`
- `Message`
- `ThreadExecutionMetadata`
- `ApprovalRequest`

这些类型必须是纯 domain 类型，不得包含：

- React 类型
- icon / avatar / image URL
- UI 文案
- 按钮状态
- layout / dialog / pane 配置

结论：

- `apps/web` 中的 provider 展示元数据只能是 web view metadata
- 它不能作为 CLI / App 共用的 domain type

## 3. Use Case Services

必须共享的用例服务：

- `login / logout / whoami`
- `ai connect / disconnect / status`
- `resolve credential-source local | cloud | auto`
- `create thread / append turn / continue thread`
- `watch` 后端事件归一化
- `local runtime + remote approval` 的 pending / resolve 控制面
- approval / tool-call / archive 持久化

规则：

- CLI 负责参数解析、TTY prompt、stdout/stderr 渲染
- App 负责 React hook、Collection 订阅、GUI 状态同步
- 真正的业务语义必须下沉到共享 service

## 4. Runtime Protocols

必须共享：

- 本地后端统一事件格式
- watch session record 结构
- provider alias 规则
- auth failure / approval / tool-call 的归一化规则
- structured user-input / approval response payload 规则
- local runtime 把 pending approval 写入 Pod，remote surface 回写 decision 的控制协议

示例：

- `claude` 与 `anthropic` 的 alias 规则必须只有一份
- `codex` 与 `openai` 的 alias 规则必须只有一份
- `credential-source=local|cloud|auto` 的解析逻辑必须只有一份

## 5. Discovery Boundary

`discovery` 是可选增强层，不是主路径依赖。

规则：

- 没有远端 discovery 服务时，CLI / App 仍必须可正常使用
- runtime 真正依赖的默认值，仍以共享 domain 规则为准，例如 provider alias、默认 `baseUrl`、AI config 写入语义
- discovery 只负责补充 provider / model 的展示元数据和推荐信息
- cloud identity / account 默认入口应指向身份域，例如 `https://id.undefineds.co/`；Pod 托管域如 `https://pods.undefineds.co/` 不能被当成默认 OIDC issuer
- cloud runtime 的模型真相来自 live API，例如 `https://api.undefineds.co/v1/models`
- cloud runtime 的对话主路径来自 live API，例如 `https://api.undefineds.co/v1/chat/completions`
- discovery 请求失败时，必须回退到 `@undefineds.co/models/discovery` 内置快照，不能让 provider 消失或阻塞主流程
- 内置快照只是离线 fallback / 词典，不得替代 live cloud `/v1/models`
- 内置快照应优先通过共享包同步脚本更新，而不是在多个端里各自手改 provider/model 词典

## Non-Shared Layers

以下内容不得下沉到 shared core：

- `yargs` command modules
- CLI prompt / terminal rendering / ANSI 输出
- React hooks
- Zustand stores
- TanStack Router / page layout / dialog state
- web provider avatar / docsUrl / apiKeyUrl
- GUI/TUI 专属文案和交互细节

原则：

- 壳层可以不同
- 业务语义不能不同

## AI Config Specification

AI 配置以三张表为准，不允许再引入平行主线：

- `credentialTable`: 凭据状态，如 `provider`、`service`、`status`、`apiKey`、`baseUrl`
- `aiProviderTable`: provider 级配置，如 `baseUrl`、`proxyUrl`、`hasModel`
- `aiModelTable`: model 级配置，如 `displayName`、`isProvidedBy`、`status`

规则：

- 三张表保持分离，不合并成单表
- 上层可以构造一个聚合读模型给 CLI 或 App 使用
- 这个聚合读模型必须是共享 domain object，不是某个 UI hook 的私有产物

`ai connect / disconnect / status` 的语义必须基于这三张表定义，而不是各端自行拼凑。

## Removed Path

`modelProviderTable` 已从代码主线移除，不得恢复为 AI 配置主线。

要求：

- 新功能不得重新引入 `modelProviderTable`
- AI 配置共享导出只允许使用 `credentialTable`、`aiProviderTable`、`aiModelTable`
- 评审时发现单表回流，视为架构回退

## Package Boundary

目标边界如下：

- `@undefineds.co/models`: schema、repository、runtime contracts
- `packages/core` 或等价 shared package: 领域对象、用例服务、alias 规则、配置解析
- `apps/cli`: 命令行入口、TTY 交互、stdout/stderr 壳
- `apps/web`: GUI 页面、Collection 订阅、UI state、view metadata

规则：

- `apps/cli` 不直接定义业务真相
- `apps/web` 不直接定义业务真相
- 业务真相必须在 shared package 内

## Migration Order

按以下顺序收口：

1. 先冻结 shared contracts 和 AI config 语义
2. 抽出不带 React 的 shared domain/service
3. 让 CLI 改为调用 shared service
4. 让 App 改为在 shared service 之上构建 hook / collection adapter
5. 保持 `modelProviderTable` 已删除状态，不得回流

## Review Checklist

评审 CLI 或 App 改动时，必须检查：

- 是否改动了共享 schema 或 namespace
- 是否把业务语义偷偷放进了 `apps/cli` 或 `apps/web`
- 是否引入了 UI 类型到 shared core
- 是否新增了与三张 AI 表并行的第二套配置表示法
- 是否新增了第二份 provider alias 规则
- 是否为共享语义补了 contract tests
