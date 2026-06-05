# Models Authority Plan

## Goal

建立 `linx`、`xpod-cli` 与第三方开发者可共用的数据面权威源：

- 词汇表 / namespace
- drizzle-solid schema / table
- 由 schema 直接推导出的 TypeScript 类型
- 与 URI 约定直接相关的纯函数

不承载：

- repository / service / collection 逻辑
- CLI / web / runtime 适配层
- discovery / client / auto-mode 等产品侧辅助模块

## Naming Decision

最终独立共享包名定为 **`@undefineds.co/models`**。

说明：

- 当前 monorepo 已收敛到：
  - `@undefineds.co/models`：共享数据面 SDK
  - `@linx/client`：Linx 客户端 helper 层

## Latest Alignment Target

以 `../xpod-cli` 当前主线为最新对齐面，不再参考旧 `xpod`。

当前已经确认的关键事实：

1. `xpod-cli` 的 AI / Credential 模型以 `UDFS` 为主词汇，不再以 `XPOD_AI` / `XPOD_CREDENTIAL` 作为主合同。
2. `xpod-cli` 内部仍混有纯 Pod schema 与运行时 / API 适配逻辑。
3. 共享数据面与 Linx 专属适配逻辑此前曾混放在同一包内：
   - 纯 Pod schema
   - repository
   - client/discovery/auto-mode
   - 一部分 UI / runtime 合同

因此要先切边界，再抽仓。

## Shared Core Scope

第一批进入唯一权威源的对象：

- vocab / namespaces
- `Credential` / `Provider` / `Model`
- `AIConfig`
- Agent container meta / AgentRuntimeConfig 共享字段合同
- Skill resource / Skill binding 共享字段合同
- `AgentStatus`
- `Chat` / `Thread` / `Message`
- `Contact`
- `Workspace`
- 审批 / 审计 / inbox 这类 Pod 留档实体

暂不进入第一批：

- SQL 身份库 schema
- quint / task / CSS 内部运行时 schema
- repository / collection / hook / client / auto-mode

## Extraction Strategy

### Phase 1

先在仓内切出共享合同层，再把产品专属入口从共享包中移出。

这一步完成后：

- `@undefineds.co/models` 成为共享权威入口
- `@linx/client` 仅保留 Linx 客户端导出

当前状态（已完成）：

- 已新增并抽离独立仓库 `@undefineds.co/models`
- `linx` 仓内不再以 `packages/models` 维护共享合同源码副本
- `@linx/client` 收缩为 Linx 客户端入口
- `@undefineds.co/models` 直接声明 `@undefineds.co/drizzle-solid` 依赖，成为版本权威入口
- `xpod-cli` 的 `AIConfig` / `VectorStore` / `IndexedFile` / `AgentStatus` 已改为消费共享包
- Agent container meta 的字段合同已收敛到共享 Agent schema。AgentRuntimeConfig 是 Agent 容器的默认运行时配置，不是独立 prompt blob。
- `/agents/{id}/.meta` 是 Agent container meta 的目标形态；`/settings/ai/agents.ttl` 若仍存在，只应作为兼容迁移来源，不应继续作为新的 Agent 配置权威。
- Skill 内容应保持文件化，Skill binding/meta 只保存 enabled、version、source、checksum、load policy、依赖和关系。
- runtime config resolver 应支持在缺少文件化 Agent manifest 时回退到 Pod 元数据中的共享字段，并在启动时冻结为 Session/Run snapshot。

### Phase 2

把共享数据面迁移到独立仓库，然后：

- `linx` 改为优先依赖 `@undefineds.co/models`
- `xpod-cli` 也依赖同一个包

### Phase 3

`@linx/client` 收缩为 Linx 客户端层，只保留：

- repositories
- discovery / client / auto-mode
- Linx 特有 runtime 合同
- 像 `favorite/starred-sync` 这类带副作用的应用层 hook

## Immediate Follow-up

下一轮代码改动应优先做两件事：

1. 继续收敛 provider 侧建模，明确 `Provider` / `AgentProvider` 是否继续二分
2. 逐步减少仓内对 `@linx/client` 的直接依赖
