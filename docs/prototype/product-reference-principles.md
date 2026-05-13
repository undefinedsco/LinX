# Product Reference Principles

## 结论

LinX 不应该像素级复制微信、Telegram 或 Signal。我们要拆开抄不同层次：

- 产品心智更像微信：用户打开就是会话，不需要先理解 Pod、OIDC、RDF、runtime 或 provider。
- 桌面交互更像 Telegram Desktop：三栏结构、会话列表、置顶、文件/链接/媒体聚合、Chat Folders 更适合桌面端。
- 个人 Pod 入口更像 Telegram Saved Messages + Signal Note to Self：用户可以把自己、AI Secretary、联系人、任务、链接都理解成会话对象。
- 数据实现继续用 LinX 和 `@undefineds.co/models` 的 Pod schema，不抄外部产品的数据模型。

## 抄什么

### 产品心智抄微信

微信值得抄的是低解释成本：

- 打开就是会话列表。
- 用户不需要理解太多系统概念。
- 固定入口让用户自然知道“东西可以先丢进去”。
- 低频设置、工具生态、服务入口不要抢首屏。

LinX 对应落点：

- 默认进入 `AI Secretary`。
- `AI Secretary` 像“文件传输助手 + 服务号 + 个人助理”的组合，但更智能。
- `聊天 / 联系人 / 文件 / 收藏` 是一级入口。
- 设置、聊天文件、服务状态放低频入口，不放主路径。

### 桌面交互抄 Telegram Desktop

Telegram Desktop 值得抄的是桌面信息架构：

- 三栏结构。
- 高密度会话列表。
- 置顶、归档、Chat Folders。
- 会话内文件、链接、媒体聚合。
- 桌面端侧栏与列表的效率。

LinX 对应落点：

- 左侧窄栏是主模块切换。
- 第二栏是当前模块列表，例如会话列表、联系人列表、文件树、收藏列表。
- 中间是主工作区。
- 右侧是当前对象详情，不做解释页。
- Chat Folders 可以演化成会话/工作区/话题组织方式。

### 个人 Pod 入口抄 Saved Messages + Note to Self

Telegram Saved Messages 和 Signal Note to Self 值得抄的是入口心智，不是数据结构：

- 用户看到一个固定会话，例如 `我的空间` 或 `AI Secretary`。
- 用户可以把链接、文件、想法、任务直接丢进去。
- 它是个人信息收纳入口，也是后续重入入口。
- 入口简单，不要求用户理解“个人数据空间”的底层概念。

LinX 对应落点：

- `AI Secretary` 是默认不可删除会话。
- 可以保留 `我的空间` 作为 Note-to-Self 类入口。
- 用户看到的是会话，背后落到 chat、thread、message、attachment、contact、agent、workspace 等已有 Pod schema。
- 当用户进入“继续工作”语境时，界面显示 Workspace；Repository 只作为 Workspace 的来源元信息，不做首屏管理对象。
- Agent 的规则、skills、MCP、backend、compaction 属于 Agent home，不跟文件夹或 Session 走。
- 文案只说“保存到你的 Pod”或“当前会话已同步”，不解释 RDF / SPARQL / Solid internal controls。

## 不抄什么

### 不抄微信品牌皮肤

不要复制：

- 微信图标。
- 微信绿色。
- 微信具体布局细节。
- 微信文案。
- 微信小程序/服务号的复杂生态入口。

我们抄的是成熟交互模式，不是品牌皮肤。

### 不抄 Telegram / Signal 数据模型

不要复制：

- Telegram Saved Messages 的内部数据结构。
- Signal Note to Self 的内部数据结构。
- Telegram / Signal 的账号、加密、同步模型。

LinX 的数据实现仍然以 `@undefineds.co/models` 为 authority。

### 不把工具生态提前暴露

工具、服务、自动化能力后续会存在，但首屏不要做成工具平台：

- 不把 runtime 当作主导航。
- 不把 provider 配置放到已有账号主路径。
- 不把模型配置放到聊天首屏。
- 不让用户先理解系统再开始工作。

## 最终关系

| 层次 | 主要参考 | LinX 落点 |
| --- | --- | --- |
| 产品心智 | 微信 | 打开就是聊天，低解释成本，固定助手入口 |
| 桌面结构 | Telegram Desktop | 三栏、会话列表、文件/链接/媒体聚合、folders |
| 个人收纳入口 | Telegram Saved Messages + Signal Note to Self | `AI Secretary` / `我的空间` 固定会话 |
| 文件管理 | Finder / File Browser | 一级 `文件` 模块是 Pod 文件浏览器 |
| 运行现场 | LinX Agent-centered model | Agent + Thread + Workspace，Session 只做运行绑定 |
| 数据实现 | LinX + `@undefineds.co/models` | 继续使用现有 Pod schema |

一句话：我们抄的是用户怎么理解和怎么进入，不是抄别人怎么存。
