---
name: pod-storage
description: Pod 文件系统操作 — 使用 pod_read/pod_write 读写用户 Pod 中的数据。
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, pod_read, pod_write
---

# Pod 文件系统

用户的数据存储在 Pod 中。访问 Pod 文件使用 `pod_read` / `pod_write`（不是本地 read/write）。

## 路径约定

```
/alice/
  ├── settings/           # 配置和凭据
  │   ├── credentials.ttl # 第三方 API key
  │   └── preferences.ttl # 用户偏好
  ├── logs/               # 工具/Agent 输出日志
  │   └── tasks/          # 按任务组织
  ├── repos/              # git 仓库工作区
  └── data/               # 用户自己的数据
```

## 读写

```
pod_read /alice/settings/credentials.ttl
pod_write /alice/settings/credentials.ttl "content"
```

用 `pod_read` 读 Pod 文件，`pod_write` 写 Pod 文件。Content-Type 由扩展名自动推断（.ttl → text/turtle）。

## 凭据约定

第三方 API key 存在 `/alice/settings/credentials.ttl`，每条一个节点：

```turtle
@prefix xpod: <https://undefineds.co/xpod#> .

<#jina> xpod:apiKey "jina_xxx" .
<#openai> xpod:apiKey "sk-xxx" .
```

需要 key 时先用 `pod_read` 读这个文件。没有就引导用户去对应网站注册，拿到后用 `pod_write` 写入。

写入时注意保留已有内容，只修改目标凭据行。

## 查找

不知道文件在哪时用 `bash` 配合 Pod HTTP API，或用 Grep 搜索本地 Pod mirror。

## 日志

工具执行结果写入 `/alice/logs/`，按任务 ID 分目录：

```
/alice/logs/tasks/task-001/
  ├── stdout.log
  └── result.json
```
