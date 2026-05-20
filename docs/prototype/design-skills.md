# Design Skill Selection

## 目标

本轮不是重写 LinX 的视觉系统，而是把已有视觉 token 固化为可开发的原型和交互文档。视觉元素以 `apps/web/src/index.css` 为准，原型只新增局部布局样式。

## 选定 skill 组合

| Skill | 用途 | 本轮职责 |
| --- | --- | --- |
| `visual-ralph` | 视觉实现循环 | 定义“原型 -> 截图 -> 视觉评审 -> 下一轮调整”的工作方式 |
| `visual-verdict` | 截图质量评估 | 对原型截图做结构化 QA，输出可修复差异 |
| `playwright-interactive` | UI 运行与截图 | 启动原型、截取桌面 viewport、验证主要交互状态 |
| `solid-modeling` | Pod 边界校验 | 确认 UI 心智不引入新的数据 authority 或 schema |

## 不选的 skill

| Skill | 原因 |
| --- | --- |
| `imagegen` | 用户已有视觉元素设定，本轮不生成新视觉风格图 |
| `rightcodes-imagegen` | 同上，不需要生成 bitmap 参考图 |
| 通用 `frontend-skill` | 可作为后续 UI 代码实现参考，但本轮不安装新 skill、不让外部风格覆盖现有 token |

## 使用规则

1. 先看 `apps/web/src/index.css` 的变量和组件类，再做原型布局。
2. 原型样式只能表达结构、状态和局部排布，不重新定义品牌色、主圆角、字体栈或阴影体系。
3. 视觉验证以截图为准，主视口先用 `1440x900`。
4. 如果视觉评审要求改色、改圆角、改 logo 比例，需要先回到全局 token 讨论，不能在原型里偷偷覆盖。

## 设计蓝本分工

| 蓝本 | 抄什么 | 不抄什么 |
| --- | --- | --- |
| 微信桌面端 | 低负担聊天入口、窄侧栏、会话列表、打开即聊 | 品牌色、图标、具体皮肤 |
| Signal Desktop | 三栏效率、会话列表、右侧详情、聊天媒体聚合 | Signal 的数据模型和品牌皮肤 |
| File Browser | 路径面包屑、文件列表列、文件操作、resource 详情 | File Browser 的品牌皮肤和认证模型 |
| Telegram Desktop | 历史产品心智参考；本轮源码 sparse clone 失败，不能作为已验证实现依据 | Telegram 视觉资产和具体交互动效 |
| Signal Note to Self | “我的空间”这个自发消息入口 | Signal 的数据模型 |
| 微信文件传输助手 | 固定入口、低解释成本、可丢文件链接 | 微信文案和品牌表达 |
