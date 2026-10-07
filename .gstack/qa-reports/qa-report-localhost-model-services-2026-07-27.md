# LinX 本地 xpod 模型管理专项 QA

- 日期：2026-07-27
- LinX：`http://localhost:5173`
- xpod：`http://localhost:5737`
- 范围：登录、模型服务列表、验证、同步、模糊搜索、添加服务入口、刷新/直达
- 结果：DONE_WITH_CONCERNS

## 结论

模型管理核心操作可用：

- 本地 xpod 登录成功。
- 已有 `timecc` 服务和 11 个模型能从 Pod 读取。
- “验证”成功，提示“连接成功，已同步 11 个模型”。
- “同步模型”成功，提示“已同步 11 个模型”。
- 搜索 `5.5` 后只保留 `gpt-5.5`。
- 添加模型服务弹窗正常打开，字段和创建入口完整。

## ISSUE-001：刷新或直达模型管理会清掉本地登录态

- 严重度：High
- 分类：功能 / 登录恢复
- 状态：未修复

复现：

1. 使用本地 xpod 登录 LinX。
2. 从 Chat 的“设置 → 模型管理”进入，页面正常。
3. 刷新页面，或直接访问 `http://localhost:5173/model-services`。
4. 页面回到“重新登录 LinX 用户”。

影响：

- 模型管理不能可靠刷新。
- 收藏或复制模型管理链接后不能直达。
- 每次完整页面重载都需要重新走 OIDC 授权。

根因范围：

- Service Web 模式启动时对 loopback Solid 会话的清理策略过宽。
- 它规避了 xpod 重置后的旧动态 OIDC client，但也清除了仍然有效的本地会话。

证据：

- 登录门禁：[model-management-list.png](screenshots/model-management-list.png)
- 应用内导航正常页面：[model-management-spa-entry.png](screenshots/model-management-spa-entry.png)

## 其他观察

- Chat 初始化出现两次 HTTP 412。
- Secretary 默认线程存在重复 `parent` 单值字段警告。
- ChatKit iframe 对外部设置接口产生 CORS 控制台错误。
- 以上问题没有阻断本次模型验证、同步和搜索，但会污染控制台，应单独治理。

## 正确操作路径（当前版本）

1. 打开 `http://localhost:5173/chat`。
2. 登录时选择“本机”，使用 `http://localhost:5737`。
3. 左下角“设置” → “模型管理”。
4. 选择左侧供应商。
5. “验证”检查 API Key 和 Base URL。
6. “同步模型”拉取模型列表。
7. 使用“搜索模型”按名称或 ID 模糊筛选。
8. 启用服务后回到 Chat，在模型选择器选择该供应商模型。

当前不要刷新模型管理页面；刷新登录态问题修复后再做持久化最终验收。
