# 场景恢复与 Solid 建模约束

日期：2026-09-28。按 [产品体验 R6](../../homepage/docs/specs/personal-ai-product-experience-r6.md) RD01/05/09、F03/05/06 与 [LW-07/08/09/12](../../homepage/docs/reviews/product-r6-2026-09-28/linx-workflows.md) 修订恢复及授权边界。本文不建立新的授权或任务 schema；共享语义由 models、具体授权及运行由既有领域合同负责。

## 1. 文档目标

这份文档定义 LinX 在 `favorites / inbox / audit / workspace / files` 相关能力上的共享建模约束。

核心目标只有一个：

> 重要记录应能在当前身份和权限允许的范围回到原对象与原场景；无法读取时说明原因，不靠历史快照绕过权限。

本文档特别强调：

- 用 Solid / RDF 关系表达恢复链路；
- 使用 `drizzle-solid` 的 link 语义，而不是字符串 ID 语义；
- 保持短、关系化、Solid-first 的命名；
- 区分“真相资源”和“展示快照”。

---

## 2. 核心建模原则

### 2.1 IRI 是身份

- 实体身份由 IRI 决定；
- 不要在共享模型中重复制造一套字符串 ID 心智；
- `drizzle-solid` 中如果字段本质是 RDF link，就按 link 字段建模。

### 2.2 关系字段直接用关系名

如果字段本来就是对另一个资源的引用，就直接用关系语义命名：

- `thread`
- `workspace`
- `container`
- `anchor`
- `about`

不要写成：

- `threadUri`
- `workspaceUri`
- `containerUri`

原因：

- `Uri` 后缀会把 RDF 关系误导成“普通字符串字段”；
- `link('thread')` 已经足以表达“这是指向 thread 的关系”；
- 共享模型应该鼓励使用 RDF 图思维，而不是表字段思维。

### 2.3 标准词汇优先

优先使用：

- `ldp:`：Pod 容器和资源；
- `dcterms:`：时间和元数据；
- `prov:`：审计活动、输入、产出、参与者；
- `rdfs:`：类继承；
- 需要补业务含义时，再使用 `udfs:`。

### 2.4 用 subclass 表达用途，用属性表达实现

例如：

- `udfs:Container` 是上位概念；
- `udfs:PodContainer`、`udfs:LocalContainer` 是用途子类；
- “本地还是远程”“对应哪种执行器”这类实现细节，优先用属性而不是再造一层子类。

### 2.5 snapshot 是投影，不是真相

`title / summary / preview / snapshotContent` 这类字段只是：

- 用于列表展示；
- 对象不存在时，在保留与读取权限仍有效的前提下提供有限历史说明；
- 用于搜索和排序。

它们不能替代真实关系链路，也不能取得高于源对象的读取权。撤权时不能用列表摘要、预览或 snapshotContent 继续泄露内容。

换句话说：

- **快照解决“看起来是什么”**
- **关系解决“它到底指向什么”**

---

## 3. 核心对象分层

LinX 在场景恢复上建议统一使用四层对象：

1. **Container**：物理载体
2. **Workspace**：工作上下文
3. **Thread**：交互上下文
4. **Anchor**：细粒度定位点

### 3.1 Container：物理载体

用户最终工作总是落在某个“地方”上。

这个“地方”统一抽象为 `Container`。

建议类层次：

```turtle
udfs:Container a rdfs:Class .

udfs:PodContainer rdfs:subClassOf udfs:Container, ldp:Container .

udfs:LocalContainer rdfs:subClassOf udfs:Container .
```

说明：

- Pod 里的目录可直接落在 `ldp:Container` 体系；
- 本地目录不应假装成 `ldp:Container`；
- 本地目录使用自定义子类，但仍统一归入 `udfs:Container`。

### 3.2 Workspace：工作上下文

`workspace` 不是漂浮概念，而是落在 `container` 上的工作语义。

它表达的是：

- 当前工作绑定了哪个目录 / 容器；
- 是否是仓库根；
- 当前审批策略；
- 相关 runtime / session 能力；
- 相关文件和产物的上下文。

因此：

- `workspace` 必须链接到 `container`；
- `workspace` 不应脱离 `container` 单独存在为用户主心智。

### 3.3 Thread：交互上下文

`thread` 是聊天或执行中的交互上下文。

它负责承载：

- 消息流；
- 审批卡片；
- 会话内搜索；
- 运行状态；
- 真实存在时与 `workspace` 的关联；普通私聊、群组不要求先创建工作区。

建议关系：

- `thread -> workspace` 仅在具有该执行/目录上下文时复用。Thread 的 Chat/Task 归属按共享模型合同，不能用工作区代替，也不能为凑恢复链新建工作区。

### 3.4 Anchor：细粒度定位点

`anchor` 用于精确落点。

常见 anchor 可能是：

- 某条消息；
- 某张审批卡片；
- 某个文件；
- 某个收藏对象；
- 某次审计活动的目标实体。

`anchor` 的作用不是替代 `about`，而是补足“回到哪里”的精确性。

---

## 4. 恢复链路

恢复使用真实存在的对象与来源关系，不要求每种对象拥有完整的线性链。以下为可用关系的示意，不是全部必填或固定遍历顺序：

```text
Projection Resource
  -> about / anchor
  -> thread       (来源确实存在时)
  -> workspace    (工作上下文确实存在时)
  -> container    (有适用载体关系时)
```

这里的 `Projection Resource` 包括：

- `Favorite`
- `InboxItem`
- `Audit Activity / Audit View`

恢复时：

1. 先核对当前身份与读取权限，再定位原对象/精确锚点；
2. 原位置不可用时，只沿真实存在且可授权读取的 Thread、Workspace、Container 关系寻找合法返回位置；
3. 缺某环不补造容器或业务资源；联系人、群组、Agent、独立文件可以直接恢复原对象详情；
4. UI 将有效对象转为相应页面与选中状态；没有合法位置时说明原因并保留安全模块入口。

注意：

- 共享模型负责提供**图关系**；
- UI 路由负责把图关系转译成“打开哪个页面、选中哪个面板、滚到哪里”。
- 新导航为工作/知识/我的 AI，旧 Chat/Files/Contacts/Favorites 深链仍解析同一对象；导航不重建资源 URI。
- 保存 query/scope/视图/选中项/滚动与允许保留的草稿作为 UI 恢复状态，不把它们变成第二份业务真相。
- 返回目标须通过合法返回校验；通用 URL 不携带 secret、令牌或资料正文。跨身份/空间切换先说明目标，隔离旧身份内容，再重读权威。

不要把前端路由参数直接当成共享模型真相。

---

## 5. Favorites / Inbox / Audit 的统一要求

### 5.1 Favorite

`Favorite` 的产品恢复要求是：

- 收藏的原对象是什么；
- 来源确实存在时关联哪个 thread；
- 有执行/目录上下文时关联哪个 workspace/container；
- 是否有更精确的 anchor。

必须能定位真实原对象，以下为可复用关系清单，不是全部非空的字段要求；基数与持久表达归 models：

- `about`
- `thread`
- `workspace`
- `container`
- `anchor`

### 5.2 InboxItem

`InboxItem` 是对审批、待输入、认证、知识提案和通知等事件的投影；不同决定类型使用各自控件和领域合同，不能用一个“批准”替代全部含义。

它必须能说明待决定对象并在有效权限下恢复；上下文关系按真实来源提供：

- 这条待办 / 通知关于什么；
- 来源存在时来自哪个 thread；
- 具有工作/目录上下文时关联哪个 workspace/container；
- 如果需要就地恢复，应该落在哪个 anchor。

同样可复用下列关系；缺真实来源链不补造资源，关系基数由共享领域合同确定：

- `about`
- `thread`
- `workspace`
- `container`
- `anchor`

### 5.3 同一请求与同一 Run 的续接

- 工作 inline 与 Inbox 引用同一请求，提交前读取当前状态；另端已处理、过期、撤回或权限变化时不继续提交旧表单。
- 决定写入、runtime 续接、任务完成分别显示。结果未知先查原请求，不重建请求或 Run 来掩盖失败。
- waiting_input 的回答/批准按 [Task/Run](../../xpod/docs/task-system-design.md) 回到同一 Run；只有任务 owner 判定需新一次执行时才新建，并明确重复影响。
- 请求取消与停止事实分开；关闭观察界面、暂停未来调度、停止当前 Run 与停止本机服务不是同一操作。
- 认证/连接修复返回原请求/候选/来源对象并重新核验身份、权限、版本与用途；不能自动重做训练、付费或已完成写入。

### 5.4 Audit

审计优先按 `prov:` 思路表达。

建议：

- 重要动作优先建模为 `prov:Activity`；
- 相关对象使用 `prov:Entity`；
- 参与者使用 `prov:Agent` 或已有身份实体。

可优先复用：

- `prov:used`
- `prov:wasGeneratedBy`
- `prov:wasAssociatedWith`
- `prov:wasDerivedFrom`

LinX 业务补充关系再用 `udfs:`：

- `thread`
- `workspace`
- `container`
- `anchor`

如果为了前端聚合确实需要 `AuditRecord` 形式，也应保证它能链接回 `prov:` 图和原对象，而不是只存一段文本日志。

以上上下文关系按真实活动复用，不要求每个审计事件都拥有工作区/容器；不得为了统一卡片补写虚构来源。具体谓词、基数和写入归 models/审计领域。

---

## 6. Workspace 与 Folder / Container 的关系

### 6.1 产品层

用户理解的是：

- 这个话题绑定了哪个目录；
- 这个目录是不是仓库；
- 这个目录里产生了哪些资产；
- 当前是否能继续运行。

因此产品层文案可以说“目录”“文件夹”“仓库”。

### 6.2 模型层

共享模型层统一使用 `container`。

原因：

- `container` 同时覆盖 Pod 容器和本地目录；
- `folder` 更偏 UI 文案；
- `container` 更适合作为跨端、跨环境的中性语义。

建议关系链：

- `workspace.container`
- `thread.workspace`
- `favorite.container`
- `inboxItem.container`
- `audit.container`

### 6.3 本地目录 URI

本地目录可以使用 LinX 自己的 URI 方案，例如：

```text
linx://{device-id}/path/to/directory
```

但要注意：

- 这是资源身份；
- `device-id` 标识能运行 workspace 的设备，不是 SP nodeId；
- 不意味着它天然就是 `ldp:Container`；
- 仍应通过类声明明确其是 `udfs:LocalContainer`。

---

## 7. 命名规范

### 7.1 应该使用的关系名

- `about`
- `thread`
- `workspace`
- `container`
- `anchor`
- 授权依据按统一领域合同引用（不在本文冻结 `policy` schema）
- `actor`
- `result`

### 7.2 避免的命名

- `threadUri`
- `workspaceUri`
- `containerUri`
- `targetId`
- `chatId`（当真实身份已经是 IRI 时）

### 7.3 何时需要更具体的名字

只有当同一资源上存在多个语义不同的同类关系时，才需要更具体命名。

例如：

- `sourceContainer`
- `workingContainer`
- `outputContainer`

这类命名体现的是**关系差异**，不是“它是个 URI”。

---

## 8. 自动推进与授权引用边界

原文提出的 Manual/SafeAuto/ContainerScoped 三档及同名 ApprovalPolicy 资源只是历史建议，不能作为现行产品模式或由本文件创建的模型权威。新的 schema/资源是否必要由统一授权与 models owner 决定；本次不新增定义。

现行边界参见 [Capability contract](secretary/capability-contract.md) 的 Approval/Input、Grant Coverage，以及 [Auto contract](secretary/auto-symphony-contract.md)：

- auto 决定由谁继续输入/推进，不修改 backend approval，也不创建或撤销 grant。
- 一次允许/拒绝只作用于当前请求；Secretary 不替用户创建 allow_for_session/allow_always。
- 长期 grant 由用户显式决定，显示动作、对象、范围与时效；有效 grant 的行为不因 auto off 自动消失。
- 方法、知识确认、训练授权、模型启用不是上述授权的别名，不能互相推断。
- 恢复与审计引用真实请求、决定来源、适用 grant/policy 依据和运行结果，不把 UI 里的选择档位存成新权限真相。

`docs/approval-grant-design.md` 当前缺失，是 R6 DEP05 的领域依赖。反应窗口、强制人审类别、撤回/过期及并发 apply 合同由原 owner 补齐；不能用此文档的通用 `policy` 字段承诺已经具备完整授权能力。

## 9. 有权限的恢复与失败分流

恢复顺序可从 anchor、about、thread、workspace、container 逐级寻找，但每个节点都需当前身份/读取权限成立；不是不分原因地一路展示到 snapshot。

| 原因 | 用户可见结果 | 恢复规则 |
|---|---|---|
| 原对象被删除 | 已删除及有权保留的历史说明 | 可到仍可访问的原工作；历史快照须有独立有效的保留与读取依据 |
| 无权限/权限撤回 | 不可访问，申请访问或返回 | 隐藏正文和敏感摘要，不回显缓存或派生知识快照 |
| 失联/查询失败 | 未读取/最后观测时间与重试 | 保留允许保留的草稿与位置，不宣称对象不存在，不换另一份本地真相 |
| 版本变化 | 当前版本与原引用版本及变化 | 原动作依赖版本时重新核对，不能无提示套用新对象 |
| 跨身份/空间 | 当前与目标上下文，明确切换 | 隔离旧身份内容，验证合法返回，再读取原对象 |
| 请求另端已处理/过期 | 最新状态与可用下一动作 | 不提交旧决定；已记录但续接失败只恢复后续阶段 |

返回至少恢复查询范围/筛选、视图、选中对象、滚动位置及允许保存的未提交内容。无法恢复时给可理解的最近合法入口，不制造可读假数据或空成功状态。

### 恢复验收

- 源消息删除与权限撤回得到不同结果；无权时不泄露旧标题/正文/摘要中敏感内容。
- 跨身份跳转、失联、来源修订、编辑中打开来源再返回，不丢允许保留的草稿或误换对象。
- 同一请求双端处理保持一致，waiting_input 回同一 Run；未知结果先查，取消不提前宣称已停止。
- 修复依赖后回到原决定，费用、资料版本、用途或权限变化可见；不重复已确认的外部副作用。
- 共享对象/权限/授权/任务事实与 UI 恢复提示分别记录；测试依据为真实领域结果，不是画板本地状态。

---

## 10. 反模式

以下做法应避免：

### 10.1 用前端路由当真相

不要把这类字段当共享模型核心：

- `app=chat`
- `tab=lineage`
- `panel=right`

这些只能是 UI hint，不能替代图关系。

### 10.2 只存 snapshot，不存 link

如果一条收藏 / 待办 / 审计记录只有：

- 标题
- 摘要
- 作者
- 时间

而没有对象关系，那它只是展示卡片，不是可恢复对象。

### 10.3 把 Pod 容器和本地目录混成同一类

不要把本地目录直接当成 `ldp:Container`。

正确方式是：

- 统一上位类：`udfs:Container`
- Pod 容器：`udfs:PodContainer`
- 本地目录：`udfs:LocalContainer`

### 10.4 在字段名里塞实现细节

例如：

- `threadUri`
- `workspaceIri`
- `targetRdfId`

这些都会削弱共享模型的可读性和一致性。

---

## 11. 共享关系复用清单

以下是跨产品恢复时应检查的既有关系，不是全体非空字段或新的 schema。Favorite/Inbox 必须能定位所指对象；thread/workspace/container/anchor 只在真实来源存在时复用。关系基数与资源所有权由 models/相应领域合同决定，普通交流与收藏不能被 UI 强制创建 Task/Workspace/Container。

### Favorite

- `about`
- `thread`
- `workspace`
- `container`
- `anchor`

### InboxItem

- `about`
- `thread`
- `workspace`
- `container`
- `anchor`

### Audit Activity / Audit View

- `about`
- `thread`
- `workspace`
- `container`
- `anchor`
- `actor`

### Workspace

- `container`
- 生效授权依据引用由统一授权/models 合同决定；不把通用 `policy` 字段或原三档建议作为已冻结 schema。

### Thread

- 按共享模型保留 Chat/Task 归属；`workspace` 仅在实际工作区关系存在时复用。

---

## 12. 决策摘要

这套建模约束最终落在五句话上：

1. IRI 是身份，link 是关系；
2. 字段名用关系语义，不加 `Uri` 后缀；
3. `workspace` 必须绑定 `container`；
4. `favorites / inbox / audit` 必须能定位原对象并按真实关系恢复，不能强制完整工作容器链；
5. snapshot 只是有权限的投影，不能替代对象关系或绕过撤权；同一请求/Run 续接与合法返回由对应领域合同提供。
