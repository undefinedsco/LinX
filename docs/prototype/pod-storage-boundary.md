# Pod Storage Boundary

## 结论

原型抄的是用户心智，不抄外部产品的数据模型。LinX 继续使用现有 Pod schema 和 `@undefineds.co/models` 作为数据 authority。

## UI 心智到 Pod 对象的映射

| UI 概念 | 用户看到的东西 | 存储边界 |
| --- | --- | --- |
| AI Secretary | 默认会话、联系人卡片和默认 Agent | Contact 投影 + Agent home + chat/thread/message schema |
| 我的空间 | 给自己发内容的固定入口 | 现有 chat/thread/message，可标记为 self-space 语义 |
| 会话 | 聊天列表中的一个对象 | 现有 chat collection |
| 话题 / Thread | 会话内的上下文切片、一次工作的时间线 | 现有 thread collection，使用 URI 关系 |
| 消息 | 对话、系统留档、附件卡片 | 现有 message 结构 |
| Agent home | 某个可执行助手自己的文件系统 | `/agents/{agentId}/` |
| Workspace | 运行时真正操作的工作区 / worktree | `/.data/workspaces/{workspaceId}/` + `.meta` |
| Repository | 仓库来源元信息，不是工作区 | `/.data/repositories/{repositoryId}.ttl` |
| Session | 一次 Agent 运行记录 | 只绑定 Agent + Thread + Workspace，可挂快照 |
| 文件/链接 | 会话资产或 Pod resource | 现有 file/favorite/workspace 相关结构 |
| 收藏 | 可重入索引 | 现有 favorite 结构 |
| 待审批 | 消息流 inline card + Inbox 镜像 | 现有 inbox/audit/approval 结构 |

## 新模型边界

前端原型按 Agent-centered runtime model 表达，但不重新定义模型：

- `Contact` 是用户通讯录里的关系卡片，回答“我正在和谁互动”。
- `Person` 是人类身份，不自动拥有 Agent 文件系统。
- `Agent` 是可执行能力根，必须有 `/agents/{agentId}/`。
- `Thread` 是聊天里的细化时间线，不拥有规则、skills、MCP、backend 或 compaction。
- `Workspace` 是运行时工作区，`.meta` 存 repository、branch、commit、cwd、dirty state 等 git/worktree 信息。
- `Repository` 是 Pod 内部资源，记录远端 URL、provider、默认分支等元数据；产品首屏打开 Workspace，不做 Repository 管理页。
- `Session` 只记录一次运行绑定：Agent URI、Thread URI、Workspace URI、可选快照/hash。
- `AI config` 是共享 provider/model/credential 池；Agent 只保存默认偏好或运行策略，不保存 API key。

## 原型文案边界

用户可见文案可以出现 `Agent`、`Workspace`、`Thread` 这类产品概念，但不要把它们讲成数据库教程。

推荐写法：

- `默认 Agent · 不可删除`
- `当前 Thread · Pod 已同步`
- `Workspace: linx-prototype`
- `Agent Home: /agents/secretary/`
- `AI 配置: 共享配置池`

不要把界面建模成：

- 让一次运行记录拥有仓库和分支。
- 让 Agent 直接保存密钥。
- 把本地短 id 当成持久 RDF 关系。
- 把远端仓库地址作为 Repository 资源身份。

## 不新增 schema 的要求

原型进入开发时，优先复用：

- `@undefineds.co/models`
- `apps/web/src/modules/chat/collections.ts`
- `apps/web/src/modules/contacts/collections.ts`
- `apps/web/src/modules/favorites/collections.ts`
- `apps/web/src/modules/files/*`
- `apps/web/src/modules/inbox/*`

如果开发中发现 UI 需要新字段，先判断：

1. 是否已有 vocabulary 或 predicate 可以表达。
2. 是否只是 presentation state，应放 Zustand 或局部 state。
3. 是否是跨端业务语义，必须先进入 `@undefineds.co/models`。

## 文案边界

用户文案不直接解释：

- RDF
- TypeIndex
- SPARQL
- Solid internal controls

用户文案只表达：

- 已保存到你的 Pod。
- 当前话题已同步。
- 可以回到原会话。
- 需要你确认。

## AI Secretary 初始化

推荐开发路径：

1. Pod collection bootstrap 完成后检查默认 Agent home。
2. 如果不存在，创建 `AI Secretary` Agent home、Agent profile、Contact 投影、Chat、Thread。
3. 创建欢迎消息。
4. 该 Agent 标记为系统默认，不允许删除，只允许改名和改头像。
5. Agent runtime 默认偏好指向共享 AI config，不复制凭据。

该流程应发生在数据初始化阶段，不应由 UI 首次渲染临时补洞。
