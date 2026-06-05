# Module Spec: Contacts

## 目标

Contacts 统一呈现人、Agent、群组。它回答“这个对象是谁、和我是什么关系、我能和它做什么”，不是模型配置页。

Contacts 展示的是 Contact 投影。它可以链接到 Person 或 Agent，但 Contact 本身不拥有 Agent runtime 文件系统。

## 范围

- 联系人列表。
- Agent 列表。
- 群组列表。
- 对象详情。
- 发起聊天。
- 回到已有聊天。
- Secretary 的详情展示。
- Contact / Person / Agent 的关系提示。

## 不做

- 不在 Contacts 中直接编辑底层 RDF。
- 不把 API Key、模型服务配置塞进联系人详情首屏。
- 不给 Secretary 删除入口。

## 列表分组

| 分组 | 内容 |
| --- | --- |
| AI 助手 | AI Secretary、用户创建的 Agent |
| 联系人 | 人 |
| 群组 | 多人或多 Agent 会话 |

## Contact / Person / Agent 区分

| 对象 | 用户心智 | 存储/实现边界 |
| --- | --- | --- |
| Contact | 通讯录卡片、关系、备注、最近互动 | 可链接到 Person 或 Agent |
| Person | 人类身份、WebID/Profile | 不自动拥有 Agent context root |
| Agent | 可执行助手、能力根 | 必须有 `/agents/{agentKey}/` |

AI Secretary 同时有 Contact 投影和 Agent 身份：

```text
Contact: /.data/contacts/__secretary__.ttl
Agent:   /agents/__secretary__/
Meta:    /agents/__secretary__/.meta
```

联系人详情可以显示这些链接作为开发/高级信息，但首屏语言应是“默认助手”“发消息”“请赐名”，不要变成配置表单。

## 详情页信息层级

1. 头像、名称、类型。
2. 简短描述。
3. 主操作：发消息 / 回到聊天。
4. 关系信息：来源、最近互动、共享上下文。
5. 次要设置：备注、头像、说明。

## Secretary 特殊规则

- 默认显示在 AI 助手分组第一位。
- badge：`默认助手`。
- 禁用删除。
- 支持改名。
- 支持回到 Secretary 会话。
- Contact 改名需要同步到 Chat 展示名；Agent context root 不因改名而迁移路径。

## 发起聊天

点击 `发消息`：

1. 如果已有 chat，跳转到该 chat。
2. 如果没有 chat，创建 chat/thread。
3. 跳转到 Chat 模块并选中。

## 数据边界

- Contact / Agent 语义来自 `@undefineds.co/models`。
- Contact 是关系卡；Agent 是 runtime capability root。
- Agent 的 rules、skills、MCP、backend、compaction、memory 都在 Agent context root，不属于联系人详情首屏编辑项。
- AI provider/model/credential 来自共享 AI config 池；联系人详情不展示 API Key。
- UI state 如选中联系人、筛选分组走 Zustand 或局部 state。
- 新增跨端字段前先进入 models。

## 验收

- Secretary 在联系人里可见且不可删除。
- 从联系人可回到对应聊天。
- Agent 改名能反映到 Chat。
- AI Secretary 详情能看出 Contact 投影链接到 Agent，但没有删除和 API Key 入口。
- 没有真实联系人时显示空状态，不展示假联系人。
