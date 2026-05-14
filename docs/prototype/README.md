# LinX Prototype Handoff

本目录是 LinX 下一轮 UI 开发的原型交付入口。它只描述视觉原型、交互分解和开发验收，不替代现有业务实现。

## 原型边界

- 原型应用：`apps/prototype`
- 运行命令：`yarn workspace @linx/prototype dev`
- 构建命令：`yarn workspace @linx/prototype build`
- 视觉 token 来源：`apps/web/src/index.css`
- 原型局部样式：`apps/prototype/src/prototype.css`
- 截图与验证产物：`docs/prototype/assets/`

## 明确不做

- 不改 `apps/web` 现有业务组件。
- 不改现有 global CSS token。
- 不接入真实登录、Solid session、Pod collection 或 runtime。
- 不新增 Pod schema。
- 不像素级复制微信、Telegram 或 Signal 的品牌皮肤。

## 交付文档

- `product-reference-principles.md`：产品感觉和参考边界，明确产品心智、桌面交互、个人 Pod 入口分别抄什么。
- `page-mindset-ascii.md`：重新设计前的页面主心智、用户关心的信息、丝滑交互和 ASCII 线框。
- `design-skills.md`：本轮使用的设计 skill 组合和职责边界。
- `reference-extraction.md`：从 Signal Desktop 和 File Browser 源码抽取的模块结构依据。
- `module-interactions.md`：以微信/Signal/File Browser 心智为蓝本拆分模块交互。
- `pod-storage-boundary.md`：UI 心智和现有 Pod schema 的边界。
- `development-entry.md`：进入开发阶段前的任务拆解、验收和验证清单。

## 当前原型结论

原型采用“微信式低负担聊天入口 + Signal Desktop 三栏效率 + File Browser 文件管理器结构 + Note-to-Self/文件传输助手心智”的组合。

用户第一屏看到的是聊天，不是数据库、Pod、runtime 或设置。`AI Secretary` 是默认不可删除会话，负责把文件、链接、任务和上下文整理到用户 Pod 中。

新模型下，原型以 Agent 为中心表达运行能力：

- `AI Secretary` 同时有 Contact 投影和 Agent home。
- Chat 右栏显示当前 Thread、Workspace、Repository 摘要。
- Session 不作为用户首屏对象，只在运行时绑定 Agent + Thread + Workspace。
- Agent 的规则、skills、MCP、backend、compaction 归 Agent home。
- AI provider/model/credential 来自共享 AI config 池，不放在联系人卡或 Session 里。

## 本轮视觉覆盖

- 四个一级模块都有静态视觉状态：`聊天`、`联系人`、`文件`、`收藏`。
- `联系人` 按通讯录分组和名片详情表达，不做 Agent 配置页。
- `文件` 按 Pod/Finder 视角表达：位置/容器树、路径面包屑、文件表格、右侧 resource 详情；可看到 Agent home、Workspace `.meta`、Repository metadata。
- `收藏` 按微信收藏式列表表达，每项保留回跳目标。
- 消息中心铃铛在模块头部右上角，不放在左侧窄栏。
- `聊天文件` 保持为左下底部菜单里的二级入口，点击后以弹窗打开按聊天来源组织的文件原型。
- `Inbox` 从右上角铃铛打开为三栏弹窗：左侧分类，中间列表项展开审批详情，右侧保留来源入口和快捷动作；Chat inline 审批卡与 Inbox 使用同一状态。
- 一级 `文件` 模块保留，用于 Pod 浏览和 resource 管理，不按聊天来源组织。
- 截图证据见 `visual-verification-report.md`。
