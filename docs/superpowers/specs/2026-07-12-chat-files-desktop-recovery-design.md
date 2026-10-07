# Chat 与 Files 桌面首屏恢复设计

## 状态

- 日期：2026-07-12
- 状态：用户已确认
- 范围：LinX Desktop/Web Shell、Chat 首次进入、Files 桌面浏览与导入、Pod 错误呈现、xpod owner 权限兼容验证
- 视觉基准：Apple/macOS 克制感、微信桌面端的低负担列表/详情、Heptabase 的低 chrome 编辑、Finder 的文件夹进入与返回心智
- 证据：用户提供的三张真实桌面截图，以及 `ChatListPane`、`ChatContentPane`、`PodCollectionsBootstrap`、`PrimaryLayout`、`FilesWorkspacePane`、Files Pod adapter 和 xpod 运行日志

## 问题定义

当前桌面首屏同时暴露产品和实现错误：

1. Chat 在进入后长时间加载，Secretary 不固定在首位，没有可见欢迎流程，选中聊天后详情可能为空。
2. Chat 列表头为 64px，详情头为 48px，边界明显错位。
3. Files 被组合成 `资源树 | 文件列表 | 详情` 三个持久 pane，加上全局导航后视觉上接近四栏。
4. Files 根查询在返回任何可用结构前执行 Pod 遍历、Recent 统计、控制目录探测和资源 metadata 请求；任一请求悬挂都会造成永久“正在加载容器”。
5. 打开文件夹会清空详情并切换列表范围，但列表没有返回和当前路径。
6. Files 在全局导航有普通 Files 和聊天文件两个同形文件夹入口。
7. 列表头暴露“创建 Ingest 卡片”，没有把当前目录表达为导入目标，也没有完整的本地文件/文件夹选择路径。
8. 真实 xpod 日志显示 DPoP 身份验证成功后仍返回 403：CSS 请求 `urn:report:permissions:Read`，当前 ACP/ACL policy 使用 `http://www.w3.org/ns/auth/acl#Read`，权限引擎未做语义归一化。客户端把该失败继续显示成加载或空白。

## 设计目标

- 用户进入应用后，不依赖远端写入即可立即看到可用的 Secretary 欢迎界面。
- Secretary 永久位于聊天列表第一项，并在首次进入时被选中。
- Chat 列表和详情边界严格对齐，桌面 head 统一为 48px。
- Files 在全局导航后只有两个持久 pane：文件浏览列表和资源工作区。
- Files 首屏先显示稳定导航结构，耗时统计与 metadata 渐进加载。
- 文件夹进入、返回、当前路径和无选择状态均清晰可见。
- Files 只有一个全局入口，聊天文件保留为上下文范围。
- 创建/导入动作使用用户任务语言，并明确写入当前目录。
- 所有远端请求都有可取消的超时边界；401、403、超时和空数据是不同状态。
- 修复真实 owner 权限读写，而不是反复清理 token、localStorage 或 Keychain。

## 非目标

- 不把 Files 做成完整系统 Finder。
- 不在本轮引入新的设计系统或导航框架。
- 不把 Ingest、OCR、parser 或索引实现细节提升为主操作语言。
- 不以伪造本地数据掩盖 Pod 权限或查询错误。
- 不把聊天文件重新做成独立一级模块。

## Chat 设计

### Secretary 固定与初始选择

- Secretary 使用产品常量身份，而不是普通 `starred` 状态。
- 排序优先级为：Secretary、普通置顶/收藏、其余聊天。
- Secretary 不展示取消置顶操作，仍保留必要的保护语义。
- 冷启动且没有显式恢复的用户选择时，默认选中 Secretary。
- 用户已经选中其他聊天时，后台 bootstrap 完成不得抢回选择。

### 首次欢迎

Secretary 详情先渲染 LinX-owned welcome projection，不等待 Chat、Thread 或 welcome message 写入 Pod：

- 标题：`你好，我是 LinX Secretary`
- 简短说明：Secretary 可以协助整理文件、推进工作、查询当前空间和发起需要确认的操作。
- 2 至 3 个 starter actions，例如“整理当前空间”“添加一个文件”“告诉我你能做什么”。
- Composer 从首屏开始可见；若当前空间暂时不可写，Composer 明确显示只读/待恢复原因，而不是消失。

欢迎投影是产品 UI，不伪装成已经持久化的 assistant message。后台持久化成功后，通过稳定 id 与真实 Thread/Message 对齐，避免重复欢迎内容。

### 异步持久化

- Secretary Chat/Contact/Agent、默认 Thread、Agent Home 和 welcome persistence 分阶段执行。
- UI 只依赖确定性的本地投影，不依赖整个 bootstrap promise settle。
- 每个写入有超时、取消和独立失败状态。
- 失败时在详情 byline/status 区显示“尚未同步到当前空间”，提供重试；不阻塞切换聊天。
- 账号切换会取消旧账号请求并清理旧投影的远端状态。

### Chat 状态

- `initial`：立即显示 Secretary 和 welcome。
- `loading`：仅用于有时间边界的具体读取，使用局部 skeleton。
- `ready-empty`：显示欢迎或空会话引导，并保留 Composer。
- `ready-content`：显示 ChatKit 消息和 Composer。
- `forbidden`：说明当前账号不能读取/写入该空间，并提供重试、空间/账号入口。
- `timeout/offline`：保留已投影内容，显示连接状态和重试。
- `not-found`：说明会话已不存在，返回列表或选择 Secretary。

`activeChat === null` 不能无条件等价为“正在加载聊天”。

### Chat 几何

- 列表 header、内容 header 均为 48px。
- 搜索框和新增按钮位于列表 header 内，高度 32px。
- 内容 header 保留当前对象、模型/运行上下文和低频动作，不增加第二层说明栏。
- E2E 比较两个 header 的 `top`、`bottom` 和 `height`，容差不超过 1px。

## Files 两栏设计

### 持久结构

全局导航之后只保留：

```text
文件浏览列表 | 资源工作区
```

- Shell 的 Files `ListPane` 直接拥有当前文件夹列表、路径和工具栏。
- Shell 的 Files `ContentPane` 直接拥有文件/文件夹详情、结构化表格和编辑 sheet。
- `FilesWorkspacePane` 不再在 ContentPane 内重复拆分列表和详情。
- 文件夹树通过列表 header 的文件夹按钮打开 popover；窄屏使用 sheet/drawer。

### 列表 header

统一 48px，顺序为：

1. 文件夹/范围按钮。
2. 搜索框。
3. `+` 创建/导入菜单。
4. 筛选、排序等低频图标。

列表 header 或紧邻的窄路径行必须表达当前目录。`+` 的 tooltip/菜单说明使用该路径作为写入目标。

### 文件夹导航

- 单击文件夹：选择并在右侧显示轻量文件夹详情。
- 双击、Enter 或“打开”：进入该文件夹，左侧列表切换到其 children。
- 进入文件夹会记录浏览历史，显示返回按钮和当前路径。
- 返回恢复上一个目录和合理的选择/滚动位置。
- 无 child 选中时，右侧显示当前文件夹的名称、位置、数量、更新时间和可用操作；不得为空白。
- 路径变化必须可恢复、可键盘操作，并与浏览器 history/Files route 语义一致。

### 唯一 Files 入口

- 全局 rail 只显示一个 Files 图标。
- `聊天文件` 作为 Files 的范围选项，或从 Chat 附件/产物动作进入同一 Files 模块。
- 进入聊天文件时保留来源会话信息，但不创建第二个全局文件夹图标。

### 创建与导入

`+` 菜单使用以下用户语言：

- 新建文档
- 新建文件夹
- 上传文件...
- 上传文件夹...
- 添加网页...

规则：

- 目标目录始终是当前路径；不可写时菜单禁用并说明原因。
- Desktop 使用原生文件/文件夹 picker；Web 使用 file input 和 directory capability。
- 上传文件夹保留相对层级，按需创建 Pod container；冲突需要明确选择，不能静默覆盖。
- 添加网页提交 URL 和标题，内部可创建 source-linked card、Ingest record 和 approval，但主按钮文案为“添加网页”。
- `Ingest` 只出现在来源状态、同步进度、Review 或诊断细节中。

## 渐进加载与错误

### Files 根加载拆分

初始查询仅获取构成当前浏览所需的最小数据：

1. 当前 Pod root URI 和当前目录的直接 children。
2. 立即投影稳定的“全部文件/当前空间”导航。
3. Recent 数量、可选控制目录、metadata、标签和统计分别异步加载。

禁止用递归全 Pod 扫描或串行 metadata `HEAD` 阻塞初始树/列表。

### 请求边界

- Query 和 mutation 接受 `AbortSignal`。
- 初始可见读取使用有上限的超时策略；超时后进入可重试错误态。
- React Query retry 只处理明确的瞬时错误；401/403 不自动重复多次。
- 卸载、切换账号、切换 Pod 或切换目录时取消旧请求。
- Loading、error、empty 分别投影，旧缓存可用时保留内容并显示刷新失败。

### xpod 权限兼容

需要在 xpod/CSS policy 适配层完成：

- 将 CSS `urn:report:permissions:*` 请求语义映射到 ACP/ACL mode，至少覆盖 Read、Write、Append、Create、Delete、Control。
- owner ACR/ACL 的既有规则必须能够授权相同语义的 CSS 请求。
- 使用 DPoP owner token 验证 Pod root、`/.data/`、SPARQL endpoint 和资源 PATCH/PUT。
- LinX 不在 403 时自动清理 token、本地账号记录或 Electron Safe Storage。

## 架构边界

- `ui`：只渲染 props-ready 的 welcome、browser header、path、folder overview、loading/error primitives。
- `features`：拥有 Chat bootstrap projection、Files folder history、import menu、selection/detail workflow。
- `domain`：拥有 Secretary ordering、welcome state、Files pane/navigation/import/error projection。
- `data`：拥有 Pod query/mutation、timeout/abort、progressive root load、native picker adapter 和 xpod error normalization。
- `app`：组合 Shell registry、唯一 Files 入口、Chat/Files route intent 和账号切换。
- xpod：拥有授权语义兼容与真实 Pod owner 读写，不由前端伪装成功。

## 验收标准

### Chat

- 冷启动 2 秒内显示 Secretary、welcome 和 Composer，不等待 Pod welcome 写入完成。
- Secretary 永远是第一项，普通收藏不会排到其前面。
- Pod 写入永久 pending 时，UI 仍可进入并在超时后显示同步失败与重试。
- 403 不显示为无限“正在加载聊天”或空白详情。
- Chat 两侧 header 均为 48px，边界坐标一致。
- E2E 不允许遇到“正在准备话题”后 skip。

### Files

- 全局 rail 只有一个 Files 入口。
- 宽屏 Files 只有两个持久 pane；文件夹树仅在用户调用时出现。
- 打开文件夹后列表更新，返回和当前路径可见，返回恢复上级。
- 无文件选中时右侧显示当前文件夹概览。
- 根数据请求悬挂或 403 时，在时间边界内显示具体错误和重试。
- `+` 菜单明确当前目录，支持文件和文件夹选择。
- 添加网页流程不显示“创建 Ingest 卡片”。

### 集成

- Web 单元/集成测试覆盖状态投影、取消、超时、folder history 和导入层级。
- Playwright/Electron 走查覆盖冷启动、Secretary、Chat 对齐、Files 两栏、文件夹进入/返回、上传菜单和 403。
- 真实 xpod owner 测试覆盖 authenticated read/write；权限词汇不匹配必须使测试失败。
- Web lint、typecheck、build 与 Desktop build 通过。

## 已拒绝方案

- 保留 Files 三栏但默认折叠资源树：仍保留两套文件夹导航心智，并让 Shell/Files 组件边界继续重复。
- 清理 localStorage、token 或 Keychain 修复 403：认证已经成功，清理状态无法修复权限词汇不匹配。
- 在前端塞入假 Secretary message 或假文件列表：会掩盖真实 Pod 状态并破坏数据可信度。
- 把“创建 Ingest 卡片”保留为主操作：用户任务是添加网页或文件，Ingest 是后台产品能力和状态。

## 剩余风险

- xpod 修复位于独立仓库/运行时，需要单独提交并更新 Desktop 打包版本或资源来源。
- 原生文件夹 picker 和 Web directory input 的能力不同，需要统一 relative-path command，不应让 UI 分叉成两套导入语义。
- 旧的聊天文件底部快捷入口与原型文档存在历史要求；本规格和根 `DESIGN.md` 的唯一入口规则覆盖该旧决定。
