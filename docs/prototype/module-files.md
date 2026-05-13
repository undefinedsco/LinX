# Module Spec: Files

## 目标

Files 是一级 `文件` 模块，必须保留。它负责完整 Pod 文件浏览和 resource 管理，用户心智接近 Finder / 文件管理器。

`聊天文件` 不是一级模块，它和微信一样在窄侧栏底部菜单中直接出现：

```text
窄侧栏底部菜单 -> 聊天文件
```

## 范围

- Pod 根目录和容器树浏览。
- Pod resource 详情。
- 最近文件。
- 文件详情。
- 资源权限、URI、大小、类型、修改时间。
- 基于路径、类型、标签的浏览与过滤。

## 不做

- 不展示 mock 文件。
- 不在 Web 壳里假装能浏览本地 `linx://` 文件系统。
- 不把首屏做成只面向技术用户的裸目录树。
- 不替代系统 Finder 或完整本地文件管理器。
- 不把一级文件模块做成聊天来源列表。

## 信息架构

| 区域 | 内容 |
| --- | --- |
| 左侧树 | 常用位置、Pod 容器、资源类型过滤 |
| 顶部工具栏 | 后退/前进、路径面包屑、上传、新建容器 |
| 中间列表 | 名称、类型、大小、修改时间、权限、Pod 路径 |
| 右侧详情 | 预览/图标、路径、URI、权限、修改时间、操作 |

## 底部菜单：聊天文件

`聊天文件` 是底部菜单里的二级入口，不出现在一级导航。

默认展示所有聊天产生或引用的文件，支持按会话筛选：

- 聊天附件。
- 链接卡片。
- Runtime 产物。
- 收藏或引用过的 Pod resource。

排序优先级：

1. 当前聊天 / 当前话题。
2. 最近聊天文件。
3. 已收藏文件。
4. 其他可关联到会话的 Pod resource。

## 一级文件模块

一级 `文件` 模块面向完整 Pod 浏览：

- Pod 根目录。
- 容器树。
- RDF/resource 详情。
- 资源 URI。
- 资源权限/可访问状态。
- 最近文件。
- `.data/agents/{agentId}/` Agent home 浏览。
- `.data/workspaces/{workspaceId}/` Workspace 容器和 `.meta` 浏览。
- `.data/repositories/{repositoryId}.ttl` Repository 元信息浏览。

Pod 浏览是真实能力，不是后续可选项。区别是 `聊天文件` 面向聊天来源组织，一级 `文件` 模块面向完整目录和 resource 浏览。

## Agent / Workspace / Repository 文件视角

Files 是 Finder 视角，可以看到这些 Pod 资源，但不把它们变成单独管理产品：

| Pod 路径 | Files 中的展示 | 产品含义 |
| --- | --- | --- |
| `/.data/agents/secretary/` | 容器 / Agent home | Agent 自己的规则、skills、MCP、backend、compaction、memory |
| `/.data/workspaces/linx-prototype/` | 容器 / Workspace | 运行时真实 worktree/cwd；`.meta` 存 git/workspace 快照 |
| `/.data/repositories/linx.ttl` | RDF resource | 仓库元信息，不是工作区 |

Repository 不用单独做管理页。用户从 Chat 或 Session 回到的是 Workspace；Repository 只作为 Workspace `.meta` 链接的来源元信息出现。

Workspace `.meta` 可展示：

- repository resource URI。
- local path / cwd。
- branchRef / branchName。
- startCommit / currentCommit。
- dirty state。

这些字段是 Workspace 元数据，不复制到 Session 详情里。

## 文件详情操作

- 打开 URI。
- 复制 URI。
- 收藏。
- 进入所在 Pod 容器。
- 下载或在系统中打开：仅当能力真实存在时展示。

## 与聊天文件的边界

每个文件资产可以存在来源关系，但一级 `文件` 模块不以来源关系作为主结构。

来源关系展示在：

- 左下底部菜单的 `聊天文件`。
- 收藏详情中的回跳目标。
- 聊天消息里的文件卡片。

如果来源缺失，相关入口显示 `来源未知`，不能编造来源。一级文件模块仍按路径、类型、大小、修改时间和权限展示。

## 数据边界

- 文件对象来自现有 files/browser/query 能力。
- 收藏关系走 Favorites 模块已有结构。
- 会话关联走 chat/thread/message URI 关系。
- Pod 目录浏览走真实 Pod LDP/container listing 能力。
- Agent/Workspace/Repository 的 durable 语义由 `@undefineds.co/models` 负责，Files 只读取和展示。

## 验收

- 文件入口不展示假数据。
- `聊天文件` 只作为底部菜单的二级入口出现。
- 一级 `文件` 主导航保留。
- 能浏览 Pod 根目录和容器树。
- 能打开 Pod resource 详情。
- 文件主列表没有 `来源` 列，也不按聊天来源分组。
- 能看见 Agent home、Workspace `.meta`、Repository metadata 的文件视角。
- Session 不在 Files 里复制仓库、分支和 commit 字段。
- 收藏文件后 Favorites 可见。
- 无权限或无法访问时显示明确错误。
