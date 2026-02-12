# feat/web-contact-ui 执行文档

> 波次：Wave B

## 1. 目标与范围

- Web Contact 协作与群组会话入口。

## 2. 依赖关系

- 入依赖：`feat/contracts-chat-contact`
- 出依赖：`feat/mcp-bridge`

## 3. 分阶段计划

### Phase 0（Contract Baseline）

- 冻结最小接口与数据结构，补齐 fixture。
- 先打通最小读/写路径，不追求完整交互。

### Phase 1（Vertical Slice）

- 打通端到端主链路（可灰度）。
- 完成核心场景自动化测试与手工演示路径。

### Phase 2（Hardening & Cutover）

- 完成稳定性、错误态、可观测性收敛。
- 完成默认入口切换与旧逻辑清理。

## 4. 代码集中回 main 的检查点

- CP0：只合并契约/类型/骨架，保证其他并发分支可继续。
- CP1：合并可运行链路，必须保留 Feature Flag，默认关闭。
- CP2：合并默认入口切换，附回滚策略。

## 5. 分支 DoD

- 契约测试通过（字段/事件/版本）。
- 至少 1 条端到端主链路可跑通。
- 关键失败路径有明确错误处理。
- 对应文档和迁移说明已更新。

## 6. 测试契约（并发开发必填）

- Test Owner：`TBD`
- Required Suites：`TBD`（至少包含 unit/integration/min-e2e）
- Upstream Contract Version：`TBD`
- Downstream Smoke：`TBD`（至少 1 个下游场景）

---

## 6A. Solid 数据建模规范

> Web Contact UI 是纯 UI 消费层，不定义新的 Pod 表或 Vocab namespace。
> 本节说明群组联系人创建时的数据写入规则。

### 6A.1 消费的上游 Vocab

| 上游 Wave | Vocab | UI 组件 | 消费字段 |
|-----------|-------|---------|---------|
| 01 | `ContactVocab` | ContactList, ContactDetail | `name`, `avatarUrl`, `contactType`, `entityUri`, `alias`, `starred`, `note` |
| 01 | `ContactType.GROUP` | GroupCreateDialog | 创建群组联系人时 `contactType='group'` |
| 01 | `ChatBaseVocab` | "发起聊天" 按钮 | 创建 Chat 时关联 `contact` URI |

### 6A.2 群组创建的数据写入流程

创建群组时需要同时写入 Contact 和 Chat：

```
1. INSERT contactTable: { contactType: 'group', name: 群名, avatarUrl: 拼接头像 }
2. INSERT chatTable: { chatType: 'group', contact: 步骤1的 contact URI, participants: [成员 URIs], groupOwner: 当前用户 WebID }
```

> **约束**：群组联系人的 `entityUri` 指向自身（`/.data/contacts/{id}.ttl#this`），
> 与 Agent 联系人的 `entityUri` 指向 Agent 记录不同。

### 6A.3 不新增 Pod 表

Web Contact UI 不新增任何 Pod 表。

---

## 7. 交互设计规格（Interaction Design Review）

> 本节定义 Web Contact UI 中群组创建、成员管理的交互规格。

### 7.1 Group Contact 创建流程

#### 入口

- 联系人列表顶部 "+" 按钮 → 下拉菜单 → "创建群组"
- 或从 Chat 列表 "+" → "新建群聊"

#### 创建步骤（单页表单）

```
┌─────────────────────────────────────────────────────────┐
│ 创建群组                                          [✕]   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  群名称: [项目讨论组____________]                         │
│                                                          │
│  群头像: [📷 上传] 或自动生成（成员头像拼接）              │
│                                                          │
│  添加成员:                                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 🔍 搜索联系人...                                  │   │
│  ├──────────────────────────────────────────────────┤   │
│  │ ☑ Alice          alice@pod.example               │   │
│  │ ☑ Bob            bob@pod.example                 │   │
│  │ ☐ Carol          carol@pod.example               │   │
│  │ ☐ Dave           dave@pod.example                │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  已选: Alice, Bob (2人)                                  │
│                                                          │
│  添加 AI 助手:                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │ ☑ Claude 3.5 Sonnet    (Anthropic)               │   │
│  │ ☐ GPT-4o               (OpenAI)                  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│                              [取消]  [创建群组]          │
└─────────────────────────────────────────────────────────┘
```

- 最少 2 个成员（含创建者）才能创建
- AI 助手可选，添加后自动成为群成员
- 创建后自动跳转到新群聊

### 7.2 群成员管理 UI

#### 成员列表（右侧边栏）

```
┌──────────────────┐
│ 群成员 (5)        │
├──────────────────┤
│ 🟢 Alice (群主)   │  ← 群主标记
│ 🟢 Bob      [⋯]  │  ← hover 显示操作按钮
│ ⚪ Carol     [⋯]  │  ← 离线状态
│ 🤖 Claude    [⋯]  │  ← AI 成员用机器人图标
│ 🟢 你             │  ← 当前用户无操作按钮
├──────────────────┤
│ [+ 邀请成员]      │
└──────────────────┘
```

#### 成员操作菜单（[⋯] 点击）

| 操作 | 权限 | 说明 |
|------|------|------|
| 查看资料 | 所有人 | 跳转到联系人详情 |
| @提及 | 所有人 | 在输入栏插入 @name |
| 设为管理员 | 仅群主 | 赋予管理权限 |
| 移除成员 | 群主/管理员 | 确认弹窗后移除 |

#### 邀请成员弹窗

复用创建群组时的联系人选择器，过滤已在群内的成员。

### 7.3 联系人列表增强

联系人列表需要区分个人联系人和群组联系人：

| 类型 | 图标 | 副标题 | 操作 |
|------|------|--------|------|
| 个人 (human) | 用户头像 | WebID / 备注 | 发消息、查看资料 |
| AI Agent | Provider logo | 模型名称 | 发消息、配置 |
| 群组 | 多头像拼接 | N 人 · 最后活跃时间 | 进入群聊、群设置 |

### 7.4 关键文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `contacts/components/CreateGroupDialog.tsx` | 新增 | 群组创建弹窗 |
| `contacts/components/MemberList.tsx` | 新增 | 群成员列表侧边栏 |
| `contacts/components/MemberActionMenu.tsx` | 新增 | 成员操作菜单 |
| `contacts/components/ContactListPane.tsx` | 修改 | 区分个人/群组联系人渲染 |
| `contacts/collections.ts` | 修改 | 群组 CRUD 操作 |

