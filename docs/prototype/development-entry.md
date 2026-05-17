# Development Entry Checklist

## 原型应用

原型应用位于 `apps/prototype`，用于开发前视觉和交互确认。

命令：

```bash
yarn workspace @linx/prototype dev
yarn workspace @linx/prototype build
```

## 开发拆解顺序

1. `AI Secretary` 默认对象初始化。
2. Chat 首屏默认选中 Secretary。
3. Secretary 欢迎消息和“请赐名”交互。
4. 会话列表视觉和状态对齐。
5. 聊天头部、消息流、输入区对齐原型。
6. 右侧对象详情只在桌面宽屏显示。
7. 底部菜单里的 `聊天文件` 直达入口。
8. 一级 `文件` 模块的 Pod/Finder 浏览：路径、容器、类型、大小、修改时间、权限。
9. Contacts / Favorites / Chat Files 与回到聊天的重入关系。
10. Inbox 从一级导航收敛为通知入口。

## 验收标准

- 首次进入可直接看到 `AI Secretary`。
- 用户不用选择 provider 才能进入主界面。
- 已有账号重登后直接恢复主界面。
- Secretary 不可删除，但可改名。
- 用户能发第一条消息。
- 消息、默认会话和 Secretary 真实写入 Pod。
- 收藏、聊天文件、联系人入口不展示假数据。
- 聊天文件作为窄侧栏底部菜单直达入口，不作为一级模块。
- 一级文件模块保留，且主列表不按聊天来源组织。
- 视觉元素来自 global CSS token，不在组件里硬编码新品牌系统。

## 视觉验证

固定首轮视口：

- Desktop：`1440x900`
- Narrow desktop：`1180x820`
- Mobile fallback：`390x844`

截图路径：

- `docs/prototype/assets/prototype-1440x900.png`
- `docs/prototype/assets/prototype-1180x820.png`
- `docs/prototype/assets/prototype-390x844.png`
- `docs/prototype/assets/prototype-bottom-menu-640x512.png`

视觉检查项：

- 左侧窄导航是否像桌面 IM，而不是 SaaS dashboard。
- 会话列表是否低噪音，默认突出 Secretary。
- 聊天主舞台是否足够简洁。
- Pod 状态是否存在但不抢主流程。
- 右侧详情是否是辅助上下文，不压迫聊天。
- 小屏是否隐藏会话列表或详情，而不是挤压消息区。

## 开发禁止项

- 不把 `AI Secretary` 写成纯前端 mock。
- 不在 React 组件里直接绕过 collection 写 Solid dataset。
- 不为视觉原型新增真实 schema。
- 不把 Inbox/Audit/Runtime 做成抢主流程的一级解释页。
- 不把模型配置暴露到首屏主路径。
