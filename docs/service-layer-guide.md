# Service 层设计指南

本文档只说明 LinX Web 模块内的 `service.ts` / service adapter 使用边界。Pod 交互的总分层以 `docs/pod-interaction-layering.md` 为准。

## 核心原则

`service.ts` 不是业务逻辑默认归宿。

- 简单单资源 CRUD → 用对应 collection / repository。
- 前端乐观更新、订阅刷新、query invalidation → 留在 collection / hook。
- 跨资源且跨端一致的业务动作 → 放 shared use-case，不放 Web `collections.ts` 或 Web `service.ts`。
- 需要外部 API、浏览器能力或 Web-only adapter 的流程 → 可以放 Web service adapter。

## 何时需要 Web Service Adapter

| 场景 | 示例 | 是否需要 Web service adapter |
| --- | --- | --- |
| 简单单资源 CRUD | 改联系人名字 | 否，collection/repository |
| 前端乐观更新 | 列表立即显示新消息 | 否，collection/hook |
| 跨资源 shared 业务 | 创建 Secretary、Agent+Contact+Chat、append Message | 否，调用 shared use-case 后 patch collection |
| Web-only 外部 API | 浏览器侧上传、OAuth UI callback adapter | 是 |
| GUI-only 编排 | Dialog 表单状态到 use-case input 的转换 | 可以 |
| 运行时/daemon 能力 | 本地进程、文件系统、网络探活 | 不在 Web service；走 Service/desktop adapter |

## Collection 与 Use-case 的关系

Collection 可以自动映射到 model/resource，因为它是单资源 UI cache adapter：

```text
chatCollection    -> chatResource
threadCollection  -> threadResource
messageCollection -> messageResource
contactCollection -> contactResource
```

Collection 不能自动映射到 shared use-case。Use-case 是显式业务动作，可能写多个资源，有顺序、幂等、权限、风险和 runtime 语义。

正确形态：

```ts
const result = await ensureSecretary(db, input)

writeCollectionRow(agentCollection, result.agent)
writeCollectionRow(contactCollection, result.contact)
writeCollectionRow(chatCollection, result.chat)
queryClient.invalidateQueries({ queryKey: ['chats'] })
```

shared use-case 不 import React/TanStack/Electron；Web adapter 负责把结果投影回 collection。

## 不再推荐的旧模式

不要把跨 collection 的业务流程直接扩展到 `collections.ts` 里作为长期结构，例如：

- `ensureSecretary`。
- `createAgentContact`。
- `createDirectChat`。
- `appendMessage`。
- runtime event → approval/audit/inbox projection。

这些应进入 shared use-case；`collections.ts` 只保留 collection 定义、UI cache adapter、hooks 和对 shared use-case 的薄适配。

## 当前收口方向

| 逻辑 | 目标位置 |
| --- | --- |
| collection optimistic state / subscription | Web collection |
| resource id / IRI helper | `@undefineds.co/models` 或 `drizzle-solid`，按是否资源特定划分 |
| exact record generic mutation | `drizzle-solid` |
| Agent/Contact/Secretary/Message 业务动作 | shared use-case |
| runtime event → sidecar resources | shared use-case |
| Web result → collection patch | Web adapter |
