# Local-First To Shared Core Modeling

本文档只定义 local-first runtime 接入 LinX 共享 core 的同步建模语言。它不是功能说明书。

具体资源、字段、命令、流程、冲突策略、测试和实现细节必须写在对应功能文档里。

## Principle

Local-first 是外部 runtime 和 shell 可用性策略，不是 LinX 产品事实的归属原则。

- 外部 runtime 可以本地优先，以保持可升级、可替换和弱网可用。
- LinX 自己定义的产品状态应进入 core 或共享数据面。
- 本地 archive/cache 是恢复和可用性路径，不是第二个产品事实源。
- 只有把外部 runtime / backend / 工具产生的事件纳入 LinX 共享状态时才称为
  sync/projection。LinX 自己产生的控制面事实是 core/Pod write，不是 sync。

简写：

```text
Local runtime owns availability; LinX core owns product truth.
```

## Boundary Model

每条同步路径先回答五个建模问题：

- Source: 哪一侧产生事件或状态。
- Target: 哪一侧接收事件或状态。
- Direction: 状态流向是 local-to-core、core-to-local 还是双向。
- Plane: 这条路径属于 runtime log、projection、control plane 还是 recovery。
- Authority: 哪一侧对该状态拥有最终解释权。

这个模型不绑定具体 shell、runtime、UI 框架或存储实现。

## Environment-Scoped Files

文件路径只在产生它的环境中有解释权。一个 worker 可以跑在本机、远程容器、
云端 runner、Claude Code、Codex、CodeBuddy 或未来的 LinX runtime 里；它的
workspace 就是该 worker 所在环境里的工作副本。同一个环境里的多个 worker 可以
有意共享一个 workspace，这是本地多 agent 的默认设计；这里限制的是跨环境
可移植性，不是要求每个 worker 独占目录。这个路径不自动等于 Secretary、Web、
用户机器或另一个环境里的 worker 看到的同名目录。

因此跨环境对齐不能依赖绝对路径相等。同步记录需要同时表达：

- `environment`: 产生或消费文件的运行环境，例如 local-shell、remote-container、
  cloud-runner、codex-worker。
- `workspace`: 该环境里的 workspace 根，例如 repo URL、branch、commit、
  worktree label、container image、runner id，或由 runtime 提供的 workspace URI。
- `artifact`: 文件或目录 artifact 的可携带身份，例如 repo-relative path、
  content checksum、etag、blob URI、patch URI、archive URI、offset。
- `resourceBindings`: 对应的 Pod/core URI 与环境内 local 关联值，使用
  `resourceBindings.{name}.uri` 和 `resourceBindings.{name}.local` 表达同步账本中的边关系。

同一个 repo-relative path 在不同环境里只表示“同一逻辑位置的候选副本”，不自动
表示同一文件版本。是否相同必须由 commit、checksum、etag、patch base 或 artifact
URI 证明。

文件同步的默认策略是环境内读写、跨环境传 artifact 或 patch：

```text
worker environment workspace -> file-to-file artifact/patch -> Pod/core or target environment
Pod/core artifact/patch -> file-to-file materialized -> target environment workspace
```

结构化状态仍然不靠文件路径对齐。Issue、Task、Run、Evidence、Delivery 等共享
事实用 Pod/core URI 对齐；文件只作为实现证据、补丁、日志、镜像或恢复材料被引用。

## Planes

- Runtime log: 外部 runtime 的原始事件、本地过程状态和恢复材料。
- Projection: 把 runtime/local 事实映射成 core 可理解的领域事实。
- Control plane: LinX 自己定义、需要跨端一致的控制状态。
- Recovery: 用已有事实重建 shell 运行视图，不重新定义产品语义。

## Runtime Abstraction

LinX runtime 层提供一个可复用的 Pod 同步 scope：
`createLinxPodSyncScope`。对 streaming 或事件队列型 runtime，使用
`createLinxPodSyncQueue`。

这个 scope 只封装同步建模，不封装具体资源业务：

- 固定一条同步路径的 source / target / direction / plane / authority。
- 生成稳定 operation id，并收集 run result。
- 统一把 Pod/RDF 资源引用和本地关联键写成同步账本边关系：`resourceBindings.{name}.uri` 和 `resourceBindings.{name}.local`。
- 保留领域 metadata，但不让领域代码重复拼装通用同步字段。
- metadata 里的本地队列 / checkpoint key 要叫 `syncTask`、`operationId`、`cacheKey` 这类明确的局部名字，避免和 Pod 关系字段混淆。
- 队列任务可以先写 `resourceBindings.{name}.local`，执行时再补 `resourceBindings.{name}.uri`；失败 checkpoint
  仍然能按同一条 resource binding 查询和重放。

## Multi-App Checkpoint Storage

同步 metadata 的存储计划是“每个 app/source 一份本地恢复账本”，不是“在业务资源上叠多份 app metadata”。

- `source` 是稳定 app/runtime namespace，例如 `app-chat-ops`、`app-inbox`、`pi-runtime`、`cli-chat-store`。
- 每条 checkpoint/run result 顶层记录 `source / target / direction / plane / authority / status`，`metadata.resourceBindings` 只记录这次同步里本地 key 与 Pod URI 的绑定。
- 多个 app 可以共用同一个物理 checkpoint store，但查询、重放和清理必须带 `source`；共享 store 的 checkpoint id 也应 source-scoped，或物理路径按 `source` 分目录，例如 `sync/{source}/...`。
- 不同 app 同步同一个 Pod 资源时，各自写自己的 checkpoint。Pod 里的 `Chat / Message / Task / Issue` 等业务资源只保留 RDF predicate，不承载 app 私有同步状态。
- 如果未来需要把同步账本投影到 Pod，也必须是单独的 `SyncRun / SyncCheckpoint` 资源，按 `source` 分账；不能把它写成业务资源的 metadata 字段。

示例：

```ts
const sync = createLinxPodSyncScope({ source: 'app-chat-ops' })

await sync.run({
  action: 'message.create',
  kind: 'insert',
  resourceBindings: {
    chat: { uri: chatUri, local: chatId },
    thread: { uri: threadUri, local: threadId },
    message: { uri: messageUri, local: messageId },
  },
  metadata: { role: 'user' },
  task: () => db.insert(messageResource).values(message).execute(),
})
```

队列型 runtime 示例：

```ts
const queue = createLinxPodSyncQueue({
  source: 'pi-runtime',
  target: 'pod',
  metadata: { cwd },
})

queue.enqueue({
  action: 'message.project',
  resourceBindings: {
    session: { local: runtimeSession },
    chat: { local: chatKey },
  },
  resolveResourceBindings: async () => ({
    session: { uri: sessionUri },
    chat: { uri: chatUri },
  }),
  run: () => projectRuntimeMessage(),
})
```

同步 metadata 的稳定形状：

```ts
{
  action: 'message.create',
  resourceBindings: {
    chat: { uri: chatUri, local: chatId },
    thread: { uri: threadUri, local: threadId },
    message: { uri: messageUri, local: messageId },
  },
  role: 'user',
}
```

这条规则适用于所有 local-first 软件进入 Pod：本地 runtime 可以保留自己的
operation id、session id、UI id 和缓存 key，但只要它们用于关联 Pod 资源，
同步 metadata 必须把 Pod URI 和 local 关联值放在同一条 `resourceBindings.*` 边上，
不能把 URI 放进 `xxxId`，也不要把边拆成 `xxxUri` / `localXxx` 两个字段。

## File Shapes

通用同步层只内置两种文件形态：

- `file-to-file`: artifact 物化。它只处理 source/target、content type、etag、
  checksum、offset、overwrite 和 append 这类文件传输语义。
- `file-to-json-list`: 通用记录投影。它只把 JSON 或 JSONL 文件解析成
  `Record<string, unknown>[]`，并发出 records materialized 事件。

这两种形态不解释业务语义。拿到 records 之后，由具体场景 handler 决定如何
刷新本地 view、恢复 runtime session、触发 import，或调用共享 repository。

反向路径也按同一原则建模：

```text
pod/core -> artifact changed -> file-to-file materialized
pod/core -> records changed  -> file-to-json-list materialized -> feature handler
```

结构化 Pod 数据不走通用 `file-to-json-list -> business object` 路径。已有
schema/resource/repository 的数据必须由 `xpod`、`@undefineds.co/models` 或
`drizzle-solid` 查询和变更；shell/runtime 只调用这些 API，并把结果作为场景
事件消费。

如果需要把结构化 Pod 数据物化到本地，优先物化 RDF 图的 JSON-LD 表达，而不是
为同一业务事实再设计一套私有 JSON schema。TTL 和 JSON-LD只是同一个 RDF 图的
不同序列化；本地 JSON-LD mirror 不能拥有独立字段语义、状态机或关系命名。

## Adapter Boundary

Adapter 只做翻译：把外部 runtime、shell 输入或 UI 事件翻译到 core 模型。它不拥有产品真相，也不定义跨端语义。

## Out Of Scope

这份文档不定义任何具体产品功能。

- 不列资源清单。
- 不列字段映射。
- 不列命令行为。
- 不列重试策略。
- 不列冲突解决流程。
- 不列某个 shell 的存储方案。

如果内容需要描述某个产品功能如何同步，它应该移到该功能自己的文档。

## Review Questions

- 这条路径的 authority 是 runtime 还是 core？
- 它属于哪个 plane？
- 重放是否保持同一业务含义？
- 需要跨端可见的事实是否已经进入 core 或共享数据面？
- shell 是否只做翻译，没有发明业务语义？
