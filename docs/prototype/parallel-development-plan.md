# Parallel Development Plan

## 目标

把 LinX 微信-like 桌面体验拆成可以并行开发的模块级交互规格。每个模块文档都应该能独立交给一个开发者，不要求先读完整产品叙事。

## 并行 lanes

| Lane | 文档 | 负责人类型 | 是否阻塞其他 lane |
| --- | --- | --- | --- |
| Shell / Navigation | `module-shell-navigation.md` | 前端布局 | 是，提供主壳和底部菜单 |
| Chat / Secretary | `module-chat-secretary.md` | Chat 开发 | 是，核心路径 |
| Contacts | `module-contacts.md` | 联系人开发 | 否 |
| Files | `module-files.md` | 一级文件模块 / Pod/Finder 浏览开发 | 否 |
| Chat Files | `module-files.md` | 底部菜单聊天文件入口开发 | 否 |
| Favorites | `module-favorites.md` | 收藏/重入开发 | 否 |
| Inbox / Approval | `module-inbox-approval.md` | Inbox/审批开发 | 否，但影响 Chat inline card |
| Profile / Settings | `module-profile-settings.md` | 设置/账号开发 | 否 |

## 推荐顺序

1. Shell / Navigation 先落地，保证模块入口、右上角通知、窄侧栏底部菜单位置稳定。
2. Chat / Secretary 同步开发，完成默认会话、欢迎语、请赐名、发消息主路径。
3. Contacts、Files、Favorites 并行开发；只有 Chat Files 和 Favorites 的来源项需要支持“回到来源聊天”，一级 Files 保持 Finder 视角。
4. Inbox / Approval 与 Chat 协作：Chat 显示 inline card，Inbox 做全局汇总。
5. Profile / Settings 收尾，避免首屏过度解释。

## 全局交互原则

- 打开即聊天，默认进入 `AI Secretary`。
- 一级入口少，低频能力藏到右上角或左下角。
- Pod 是信任背书，不是首屏概念讲解。
- 任何跨模块对象都要能回到原会话。
- 没有真实数据和真实动作的入口不暴露。
- 视觉 token 以 `apps/web/src/index.css` 为准。
- Agent 是能力根；Contact 是关系卡；Person 是人类身份。
- Session 只绑定 Agent + Thread + Workspace，不拥有 git/repository 配置。
- Workspace `.meta` 承载 repository、branch、commit、cwd、dirty state 等工作区事实。
- AI provider/model/credential 来自共享 AI config 池；Agent 只保存默认偏好和运行策略。

## 开发共享约束

- 结构化 Pod 数据走 collection/repository/service，不在组件里直接写 dataset。
- 跨端业务语义走 `@undefineds.co/models`。
- Zustand 只放 UI state。
- 模块可以先用 loading/empty/error 状态，但不能用假数据冒充真实数据。
- 原型应用 `apps/prototype` 只作为视觉参考，不是生产代码来源。
- 新字段若影响 Contact/Agent/Thread/Workspace/Session 语义，先改 models 和集成测试，再接 UI。

## 集成验收矩阵

| 场景 | 期望 |
| --- | --- |
| 新用户首次进入 | 自动看到 AI Secretary 欢迎语 |
| 老用户重登 | 恢复上次聊天，不出现 provider 选择器 |
| Secretary 改名 | 联系人详情、会话列表、聊天头部同步更新 |
| 发消息 | 消息写入 Pod，刷新后仍在 |
| 收藏消息 | Favorites 可见，并能回到原消息 |
| 文件来自聊天 | `底部菜单 -> 聊天文件` 可见来源会话 |
| 进入一级文件模块 | 可浏览 Pod 根目录、容器树和 resource 详情 |
| 进入 Agent 文件夹 | 可看到 `/.data/agents/{agentId}/`，但不在 Files 中编辑 API Key |
| 开始一次运行 | Session 绑定 Agent + Thread + Workspace，git 元信息从 Workspace `.meta` 读取 |
| 待审批事件 | Chat inline card 与 Inbox 指向同一对象 |
| 退出登录 | 主界面消失，重新登录后恢复 |
