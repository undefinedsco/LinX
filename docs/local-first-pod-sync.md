# Local-first Pod Sync Model

本文档记录 LinX local-first runtime 接入 Pod 共享数据面的原则。它只定义
source/target/authority/plane 的同步语言，不承载具体登录流程、资源 schema、UI
交互或实现计划。

相关主文档：

- Pod 业务读写分层：`docs/pod-interaction-layering.md`
- CLI/App 共享 core：`docs/cli-app-shared-core.md`
- 登录后 storage authority：`docs/login-identity-storage-routing-model.md`
- Local canonical URL / route：`docs/local-sp-domain-and-tunnel.md`

## Core Rule

LinX 的本地存储面应当是一个 local-first Solid/Pod mirror，而不是 LinX 私有
数据库或第二套业务真相。

```text
workspace/
  .pod/                 # local Pod data mirror; path layout aligns with Pod root
  .solid/               # local Solid runtime/control state; never synced as Pod data
    auth/               # local auth/session material
    sync/               # cursor, etag, dirty queue, locks
    apps/
      linx/             # LinX app-private local state
        runtime/
        workers/
        outbox/
        cache/
  src/
```

- `.pod/` 是数据面。它的目录结构与远端 Pod root 对齐。
- `.solid/` 是本地 Solid 控制面。它保存认证、同步、锁、缓存和 app-private
  runtime 状态。
- LinX workspace-local 状态不再作为根目录 `.linx/` 出现；LinX 专属本地状态放在
  `.solid/apps/linx/`。
- 旧的全局 `~/.linx` 可以作为历史 client config/auth 迁移路径存在，但不能成为新
  workspace-local 存储面的设计模板。

## Authority Model

| State | `.pod/` role | Remote Pod role | Authority |
| --- | --- | --- | --- |
| No login | local-only Pod mirror | none | local `.pod/` is the only available store |
| Logged in, offline/slow sync | local-first cache and recovery log | last known sync target | remote Pod is desired convergence target, local may be ahead |
| Logged in, synced | local mirror/cache | authenticated Pod/SP | remote Pod is cross-surface authority |

Rules:

- 未登录时，`.pod/` 允许产品可用：chat、Secretary、worker、issue/task/run 等可写
  入本地 mirror。
- 登录后，`.pod/` 不变成第二套业务事实；它成为 selected Pod/SP 的 local-first
  mirror。
- 远端 Pod 是跨设备、跨端、可订阅、可恢复的权威中心。
- 本地 runtime 可以短暂领先远端 Pod，但必须有明确 dirty/sync 状态并可收敛。
- 不允许一部分端只看 `.pod/`，另一部分端只看远端 Pod，然后各自解释业务语义。

## Path Mapping

`.pod/` 内的路径应当 base-relative 对齐远端 Pod root。

Example selected Pod:

```text
https://node-0000.undefineds.co/alice/
```

Local mirror:

```text
.pod/agents/__secretary__/index.ttl
.pod/settings/providers/openai.ttl
.pod/inbox/2026/06/15.ttl
```

Remote mapping:

```text
.pod/agents/__secretary__/index.ttl
  <-> https://node-0000.undefineds.co/alice/agents/__secretary__/index.ttl

.pod/settings/providers/openai.ttl
  <-> https://node-0000.undefineds.co/alice/settings/providers/openai.ttl

.pod/inbox/2026/06/15.ttl
  <-> https://node-0000.undefineds.co/alice/inbox/2026/06/15.ttl
```

Rules:

- `.pod/` 内不要出现远端 origin 目录，例如不要写
  `.pod/https/node-0000.undefineds.co/alice/...`。
- 资源 identity 仍然使用 shared model 的 base-relative `id` 和 RDF relation IRI
  规则。
- App/CLI/Service 业务代码不得手动拼 `file://`、`pod://`、`https://` 来决定 shared
  resource 位置。
- 远端 full IRI 只在 RDF relation、exact lookup、sync projection、外部引用中出现。

## `.pod/` Data Plane

`.pod/` 只放原则上可以同步进 Pod 的内容：

- RDF/TTL resource documents
- file-primary artifacts, reports, specs, logs that are intended as Pod data
- Agent home files such as `agents/__secretary__/AGENTS.md`
- settings, inbox, chat/thread/message/session/approval/task/run resources

`.pod/` 不放：

- auth tokens
- OIDC session storage
- sync cursor / etag / leases / locks
- runtime process pid/state
- local-only worker cache
- provider API keys unless they are intentionally represented through the
  approved Pod credential resource path and encrypted/protected by the selected
  storage policy

如果一个文件不应该上传到用户 Pod，就不应该放在 `.pod/`。

## `.solid/` Control Plane

`.solid/` 保存本地 Solid runtime/control state，不作为 Pod data sync。

Recommended layout:

```text
.solid/
  auth/
  sync/
    manifest.json
    dirty.jsonl
    cursors/
    locks/
  apps/
    linx/
      runtime/
      workers/
      outbox/
      cache/
```

Rules:

- `.solid/auth/` 是本地认证材料，不进 `.pod/`。
- `.solid/sync/` 是同步器内部状态，不进远端 Pod。
- `.solid/apps/linx/` 是 LinX app-private local state，不定义 shared Pod semantics。
- 如果某个状态需要 Web/CLI/Service 跨端共享，应提升为 `.pod/` 里的 shared model
  resource，而不是留在 `.solid/apps/linx/`。

## Access Boundary

业务代码访问 Pod 数据仍然走统一链路：

```text
UI / CLI / Service adapter
  -> shared use-case
  -> @undefineds.co/models repository/resource helper
  -> drizzle-solid dialect
  -> local file-backed Solid store or remote Solid Pod
```

Rules:

- Web collections 可以保留，用于 optimistic UI/cache；它们不是业务真相。
- CLI/Web/Service 不得分别实现一套 `.pod` 文件读写语义。
- `.pod` 应该通过 file-backed Solid adapter/dialect 接入 drizzle-solid。
- 资源路径、predicate、id/default、repository 查询语义仍属于
  `@undefineds.co/models` 和 `drizzle-solid`，不属于 LinX 壳层。
- Service 可以拥有 Node/filesystem authority，例如把 `.pod/` 暴露成本机 Solid
  store，或做 sync worker；但它不拥有 shared resource semantics。

## Sync Engine Boundary

同步器只负责 local mirror 与 selected remote Pod/SP 的收敛。

It owns:

- dirty queue
- conflict metadata
- etag / mtime / hash tracking
- retry state
- local-to-remote upload
- remote-to-local hydrate
- exact path mapping between `.pod/` and selected Pod URL

It does not own:

- RDF class/predicate design
- LinX product state machines
- Chat/Thread/Message/Task/Run semantics
- login identity/storage authority
- provider credential selection policy

Sync target must be selected from the authenticated storage authority:

```text
SolidDatabase.getDialect().getPodUrl()
```

For split Local, this URL must be the selected Local SP Pod URL, not the Cloud
WebID/IDP origin. The sync engine must fail closed on storage mismatch rather
than uploading `.pod/` to the wrong SP.

## Workspace Relation

Workspace 不需要单独建模为一张业务表或一个平行资源类型。执行现场可以是一个
container：

- local project folder
- git worktree folder
- `.pod/` container
- selected remote Pod container

如果需要 metadata，挂在 container 的 `.meta` 或 shared model 已定义的 relation 上。
不要因为 runtime 需要 workspace 参数就创建第二套 durable Workspace truth。

## Git / Repo Hygiene

默认不要把 local Pod mirror 和 Solid control state 提交进业务 repo：

```gitignore
.pod/
.solid/
```

例外只能是明确用于测试 fixture 或文档示例的最小样本目录，并且不能包含真实用户
credential、message、setting 或 auth material。

## Review Checklist

修改 local-first / sync / workspace 相关实现时检查：

- 是否把 LinX workspace-local 状态放进了 `.solid/apps/linx/`，而不是根目录 `.linx/`。
- 是否保持 `.pod/` 与远端 Pod root 的 base-relative 路径对齐。
- 是否通过 shared use-case / models / drizzle-solid 访问业务资源。
- 是否避免在壳层手写 RDF predicate、subject path、resource IRI builder。
- 是否把 sync cursor、etag、locks、auth 留在 `.solid/`，没有污染 `.pod/`。
- 是否在登录后使用 selected SP Pod URL 作为 sync target。
- 是否在 split Local 场景防止 Cloud WebID origin 被误用为业务写入或 sync target。
- 是否保留 no-login local-only 可用性，同时在登录后能收敛到远端 Pod。
