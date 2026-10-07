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
- `文件` 按 File Browser / Pod 视角表达：左侧文件夹树、内容区文件/表格；除内容详情弹窗外，folder/file/`.ttl` 的 `.meta` 统一放在右侧抽屉，默认收起；普通可编辑文件用富文本编辑详情弹窗，meta 放在弹窗尾部；Finder 只作为用户熟悉的文件心智参考。
- `.ttl` / RDF resource 默认以 subject table 打开：class / `rdf:type` 是右上角 Class icon 里的必选 scope，不混排不同 class；当前 class 的表头就是 schema，业务数据表顺序是 `subject / predicate... / + Predicate`，不重复展示 class 列；predicate header 默认隐藏 namespace，可用滑动 `ns` switch 展开，列宽按 Excel 式表头分隔线拖拽调整；predicate cell 按类型整格点击操作，包括编辑、Heptabase-like tag selector 中选择/搜索/新增枚举值、multi-select 加减枚举值、打开 relation/URL、日期选择或 checkbox toggle；`.ttl` 右侧 `.meta` 抽屉默认收起；personal `.data` 表的已有 predicate 值可原地编辑，但先进入 structured cell proposal / Inbox approval，批准前不写回 canonical Pod resource；待确认字段定义用 `*` 标在表头/选项上；业务数据里的 `+ Predicate` 先展示当前 class 已有 predicates，第一行展开新增流程并填写 URI / 类型；本地 `/.vocab/terms.ttl#term` 是 term registry 记录，`udfs:predicate` 可以指向实际 RDF predicate URI（如 `https://schema.org/summary`），表格列和校验使用实际 predicate，审批记录仍落当前 Pod vocab；`+ Subject` 在末行；`/.vocab/terms.ttl` 默认只读浏览 term registry，`/.vocab/shapes.ttl` 存 shape/约束，`/.vocab/namespaces.ttl` 存 prefix/namespace 注册；额外视图通过 `+ View` 切换到 Kanban、Whiteboard、Raw，Discover 保留为未来/原型；ACL/ACR 作为文件级 Access 弹窗展示，不混入普通 `.meta` 行。
- 生产实现选型记录：表格状态层首选 TanStack Table，LinX 自建表格 UI primitives；Whiteboard 优先评估 tldraw，关系图型视图评估 React Flow；Kanban 拖拽优先评估 dnd-kit，跨文件/跨窗口拖放能力再评估 Pragmatic Drag and Drop。
- 非 `.ttl` 可编辑文件不进入 subject table，也不在主区域内嵌正文 preview；单击只做 Finder-like 选择/轻量预览，双击、Enter 或显式打开才进入富文本编辑详情弹窗，`.meta` 在弹窗尾部。只读文件可保留轻量预览面，页面级 `.meta` 仍进右侧抽屉。
- `收藏` 按微信收藏式列表表达，每项保留回跳目标。
- 消息中心铃铛在模块头部右上角，不放在左侧窄栏。
- `聊天文件` 保持为左下底部菜单里的二级入口，点击后以弹窗打开按聊天来源组织的文件原型。
- `Inbox` 从右上角铃铛打开为三栏弹窗：左侧分类，中间列表项展开审批详情，右侧保留来源入口和快捷动作；Chat inline 审批卡与 Inbox 使用同一状态。
- `密钥` 和 `模型` 是左下底部菜单里与 `设置` 并列的二级页面；供应商只作为两者内部的分组，不另设供应商设置。
- `设置` 只保留账号、服务、Local 和通知等通用低频配置。
- 一级 `文件` 模块保留，用于 Pod 浏览和 resource 管理，不按聊天来源组织。
- 截图证据见 `visual-verification-report.md`。
