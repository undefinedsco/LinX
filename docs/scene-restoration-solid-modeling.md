# 场景恢复与 Solid 建模约束

## 1. 文档目标

这份文档定义 LinX 在 `favorites / inbox / audit / workspace / files` 相关能力上的共享建模约束。

核心目标只有一个：

> 任何重要记录都必须能回到原对象和原场景，而不是退化成只读日志。

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
- 用于对象不存在时的降级展示；
- 用于搜索和排序。

它们不能替代真实关系链路。

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
- 和 `workspace` 的关联。

建议关系：

- `thread -> workspace`

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

统一的恢复链路建议是：

```text
Projection Resource
  -> thread
  -> workspace
  -> container
  -> anchor / about
```

这里的 `Projection Resource` 包括：

- `Favorite`
- `InboxItem`
- `Audit Activity / Audit View`

恢复时：

1. 先找到原始对象；
2. 再找到所属 thread；
3. 再找到 workspace；
4. 再找到 container；
5. 最后由 UI 决定如何恢复当前界面。

注意：

- 共享模型负责提供**图关系**；
- UI 路由负责把图关系转译成“打开哪个页面、选中哪个面板、滚到哪里”。

不要把前端路由参数直接当成共享模型真相。

---

## 5. Favorites / Inbox / Audit 的统一要求

### 5.1 Favorite

`Favorite` 必须至少表达：

- 收藏的原对象是什么；
- 属于哪个 thread；
- 属于哪个 workspace；
- 落在哪个 container；
- 是否有更精确的 anchor。

因此最小关系建议是：

- `about`
- `thread`
- `workspace`
- `container`
- `anchor`

### 5.2 InboxItem

`InboxItem` 是对审批、认证、通知等事件的投影。

它必须至少表达：

- 这条待办 / 通知关于什么；
- 它来自哪个 thread；
- 它属于哪个 workspace；
- 它属于哪个 container；
- 如果需要就地恢复，应该落在哪个 anchor。

同样建议关系：

- `about`
- `thread`
- `workspace`
- `container`
- `anchor`

### 5.3 Audit

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
linx://{node-id}/path/to/directory
```

但要注意：

- 这是资源身份；
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
- `policy`
- `actor`
- `result`

### 7.2 避免的命名

- `threadUri`
- `workspaceUri`
- `containerUri`
- `targetId`
- `chatId`（当真实身份已经是 IRI 时）
- `sourceId`（当它只是旧本地关联键时应迁到同步账本 metadata 的 `resourceBindings.*.local`）

### 7.3 何时需要更具体的名字

只有当同一资源上存在多个语义不同的同类关系时，才需要更具体命名。

例如：

- `sourceContainer`
- `workingContainer`
- `outputContainer`

这类命名体现的是**关系差异**，不是“它是个 URI”。

---

## 8. 自动审批策略的建模

自动审批不应只有一个散落在 UI 中的布尔值。

建议引入 `ApprovalPolicy` 资源。

例如：

```turtle
udfs:ApprovalPolicy a rdfs:Class .

udfs:ManualApprovalPolicy rdfs:subClassOf udfs:ApprovalPolicy .
udfs:SafeAutoApprovalPolicy rdfs:subClassOf udfs:ApprovalPolicy .
udfs:ContainerScopedAutoApprovalPolicy rdfs:subClassOf udfs:ApprovalPolicy .
```

关系建议：

- `workspace -> policy`
- 必要时 `thread -> policy`

这样可以表达：

- 默认策略；
- 当前会话覆写；
- 审批记录引用的生效策略；
- 自动批准事件的审计依据。

---

## 9. 恢复失败时的退化规则

共享模型和前端都应接受“原对象可能已经不存在”。

因此恢复逻辑必须支持分级退化：

1. 优先恢复 `anchor`
2. 其次恢复 `about`
3. 再恢复 `thread`
4. 再恢复 `workspace`
5. 再恢复 `container`
6. 最后展示 `snapshot`

这样可以保证：

- 即使对象被删了，也能把用户带回最接近的上下文；
- 不会只剩一条死记录。

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
- `sourceId`（除非只是旧本地兼容键，否则应迁到 URI relation 或同步账本 metadata 的 `resourceBindings.*`）

这些都会削弱共享模型的可读性和一致性。

---

## 11. 最小共享关系建议

如果只保留最小必需关系，建议如下：

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
- `policy`

### Thread

- `workspace`

---

## 12. 决策摘要

这套建模约束最终落在五句话上：

1. IRI 是身份，link 是关系；
2. 字段名用关系语义，不加 `Uri` 后缀；
3. `workspace` 必须绑定 `container`；
4. `favorites / inbox / audit` 都必须具备场景恢复链路；
5. snapshot 只是投影，不能替代对象关系。
