# 广州模型启用修复部署验证（2026-09-07）

## 部署

- 仅广州 Undefineds：`ns-iknkxtc8`；未操作新加坡。
- LinX：`https://undefineds-gz.sealosgzg.site/chat`。
- Xpod：`https://undefineds-gz-id.sealosgzg.site/`。
- 基于 test `977de44` 加当前未提交修复，构建版本 `0.1.0-gz-model-enable`。
- 已更新 homepage 静态资源，未变更 Xpod 镜像、数据库。
- 公网与 PVC index SHA256 均为 `89b92c24273574e28a3f68da45ad35cb16cabfc49e2d57a399f45436bb6287c6`。
- 旧 index 保存在 PVC `.releases/model-enable-20260907/previous-index.html`；旧资源保留。
- homepage / xpod-cloud 均 1/1 Ready；ChatKit health 正常。
- 临时上传 Pod 已删除，业务 PVC 保留。

## 真实浏览器结果

使用广州既有 test 账号的登录会话，未重新注册。本轮不是全部 Chat 能力验收。

- OpenAI 首次启用后显示已启用、TimiCC 地址，刷新保持：通过。
- 关闭后显示未启用，刷新保持：通过。
- 关闭后再次启用：未通过。服务端 provider 与 credential PATCH 返回 205，但页面仍显示未启用，刷新未恢复；还出现 `cloud-openai` 条目，需进一步核对凭据关联与 UI 投影。
- 关闭状态显示默认 OpenAI 地址而非已存储的 TimiCC 地址：存在显示问题。
- 16:19 在“广州回归验收 0907”会话使用 `gpt-5.6-sol`，真实发送“请只回复：广州模型启用验收成功0907”，获得真实回答“广州模型启用验收成功0907”：通过。
- 上述对话成功与页面未启用状态存在不一致，不得据此认定开关修复完整通过。
- 浏览器刷新后，新发消息及模型回答均自动恢复：通过。

## 检查边界

发布构建通过。此前同一修复内容在隔离依赖环境中 381 个测试文件、2917 个测试通过，类型检查通过；首次资源创建有本地真实 Pod 集成验证，但不能等同广州新账号首次配置通过。

结论：部署完成，真实对话通过，提供商关闭后重新启用的状态一致性仍未收口，不能标记整体验收通过。
