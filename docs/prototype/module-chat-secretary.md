# Module Spec: Chat / AI Secretary

## 目标

Chat 是 LinX 的默认入口。`AI Secretary` 是默认不可删除助手，承担欢迎、整理、记忆、Pod 留档入口。

用户心智是“继续和一个对象聊天并推进工作”，不是“选择运行时配置”。界面可以轻量显示当前 `Thread` 和 `Workspace`，但不要求用户先理解 Session、仓库或模型配置。

## 范围

- 会话列表。
- 默认 AI Secretary 会话。
- 我的空间会话。
- 话题/thread 选择或默认话题。
- 消息流。
- 输入区。
- Secretary 改名。
- 右侧 Secretary 简介。
- 右侧当前工作现场：Thread、Workspace、Repository 摘要。
- 右侧 Agent 能力摘要：Agent home、skills、共享 AI 配置池。
- Chat inline approval card。

## 不做

- 不在首屏暴露模型服务配置。
- 不把 runtime 作为用户必须理解的前置概念。
- 不在 UI 组件里直接写 Solid dataset。
- 不用 mock 数据冒充真实聊天。

## 默认初始化

首次 Pod 数据初始化完成后：

1. 检查默认 Secretary Agent 是否存在。
2. 不存在则创建 Agent home、Agent profile、Contact、Chat、Thread。
3. 创建欢迎消息：
   - 自我介绍。
   - 说明“我会帮你把聊天、文件、链接和任务保存在你的 Pod 里”。
   - 请求用户赐名。
4. 标记 Secretary 为系统默认对象：
   - 不允许删除。
   - 允许改名。
   - 允许更换头像。
5. Agent 的默认模型偏好从共享 AI config 池选择：
   - 优先使用标记为 default 的 provider/model/credential。
   - 没有 default 时再按共享配置池策略轮询或提示配置。
   - Agent 不直接保存 API Key。

## Thread / Workspace / Session 心智

用户看到的是会话和当前工作现场：

```text
AI Secretary
当前 Thread · 默认助手 · Pod 已同步
右侧：Thread / Workspace / Repository
```

实现边界：

| 对象 | Chat UI 中的角色 | 不应该做的事 |
| --- | --- | --- |
| Thread | 当前会话里的细化时间线 | 不保存 rules、skills、MCP、backend、compaction |
| Workspace | 当前运行要操作的 worktree/cwd | 不由 Session 复制 git 元数据 |
| Repository | Workspace 关联的来源元信息 | 不作为用户首屏管理对象 |
| Session | 一次运行的记录 | 只绑定 Agent + Thread + Workspace |
| Agent | 执行能力和配置根 | 不把 API Key 塞进联系人卡或消息流 |

一次“进入工作”或“开始运行”时创建 Session。Session 记录 Agent URI、Thread URI、Workspace URI，以及可选的 effective config / workspace snapshot hash。Chat 里的消息仍然落在 message/thread 关系上。

## 会话列表

会话列表按桌面 IM 习惯呈现：

| 元素 | 规则 |
| --- | --- |
| 头像 | 48px 左右，使用全局圆角 token |
| 标题 | 一行，优先显示对象名 |
| 摘要 | 一行，显示最后消息或状态 |
| 时间 | 右上角 |
| 未读 | 红点或数字 |
| 置顶 | Secretary 默认置顶 |

## 消息类型

| 类型 | UI 表现 | 数据边界 |
| --- | --- | --- |
| 用户消息 | 右侧气泡 | message |
| Assistant 消息 | 左侧气泡 | message |
| 系统留档 | 居中轻提示 | message 或 audit 关联 |
| 文件卡片 | 气泡内卡片 | file/favorite 关联 |
| 链接卡片 | 气泡内卡片 | favorite/link metadata |
| 审批卡片 | inline card | inbox/approval 共享对象 |

## 输入区

默认 placeholder：

```text
发消息给 AI Secretary，或把链接、文件、任务直接丢进来
```

工具入口：

- 附件。
- 图片。
- 语音。
- 标签/引用。

发送后：

1. 本地 optimistic append。
2. 写入 Pod。
3. 调用 ChatKit/runtime。
4. 失败则显示可重试状态。

## 文件关联

Chat 负责产生文件/链接/runtime 产物的来源关系，但不把 `聊天文件` 做成一级入口。

`聊天文件` 入口位于窄侧栏底部菜单：

```text
窄侧栏底部菜单 -> 聊天文件
```

Chat 需要为聊天文件提供来源关系：

- chat URI。
- thread URI。
- message URI。
- file/resource URI。
- 展示摘要。

文件消息卡片可以提供 `查看聊天文件` 快捷动作，但最终打开的是同一个底部菜单二级入口或其筛选视图。

## Secretary 改名

入口：

- 右侧详情卡 `请赐名`。
- 聊天头部对象名。

交互：

1. 点击打开轻量弹窗。
2. 输入新名字。
3. 保存后更新 Agent/Contact。
4. 会话列表、聊天头部、联系人详情同步刷新。

## Inline Approval

审批事件优先出现在当前聊天中：

- 展示请求动作。
- 展示风险。
- 按钮：批准、拒绝、查看详情。
- 同一对象在 Inbox 中可见。

Chat 不复制审批数据，只引用同一 approval/inbox item。

## 空状态

| 场景 | 文案 |
| --- | --- |
| 没有会话 | `正在准备 AI Secretary...` |
| Pod 未就绪 | `正在连接你的空间...` |
| 数据库未就绪 | `正在初始化本地数据访问...` |
| 运行失败 | 显示错误和重试，不隐藏主界面 |

## 验收

- 新用户首次进入看到 Secretary 欢迎语。
- 老用户重登恢复上次聊天。
- Secretary 不可删除。
- 改名后三处同步：会话列表、聊天头部、联系人详情。
- 发消息刷新后仍存在。
- 无 provider 选择器阻断已有账户进入。
- 当前工作现场显示 Thread、Workspace、Repository，但 Session 不展示为配置页。
- Agent 能力摘要显示 Agent home 和共享 AI 配置池，不展示 API Key。
