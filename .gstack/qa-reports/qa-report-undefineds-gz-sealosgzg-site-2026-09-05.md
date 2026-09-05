# 广州 Chat 全链路验收报告（2026-09-05）

## 范围

- LinX Web：`https://undefineds-gz.sealosgzg.site`
- Xpod 身份服务：`https://undefineds-gz-id.sealosgzg.site`
- 环境：广州 `Undefineds` 工作空间（未操作新加坡环境）
- 数据：真实广州测试账号、真实 Pod、真实模型请求；未使用 mock 代替端到端验收

## 已验证

- 广州 OIDC 登录、授权回调及刷新后的会话恢复
- 第三方 OpenAI-compatible Base URL 规范化与真实流式对话
- Markdown 标题、表格和代码块
- TXT、PDF 上传、内容读取及历史附件下载
- 图片预览与图片文字理解
- 图片生成、消息内展示及刷新后的图片恢复
- 点赞反馈持久化入口
- 回答重试及回答版本导航
- 编辑提问、分支导航及刷新恢复
- 停止生成、保留部分回答及刷新恢复
- 浏览器请求保持在广州 Web/Xpod 链路，不回退到正式身份站点

## 自动化结果

- Web 全量 Vitest：381 个测试文件，2905/2905 通过
- Web TypeScript + production build：通过
- Chat 定向回归：58/58 通过
- Xpod lite integration：24 个测试文件通过，130 个测试通过，5 个按环境跳过
- 广州真实图片生成 E2E：通过

## 修复记录

- OpenAI-compatible 纯域名 Base URL 自动补全 `/v1`，避免请求命中 HTML 首页。
- ChatKit 刷新时强制重新选择并加载持久化 Thread，避免空消息区。
- 密钥只通过 Xpod 密封凭据接口保存，普通 Provider 集合不再覆盖密钥。
- 生成图片使用 ChatKit 官方图片消息协议，并从 Pod 附件恢复历史图片。
- Pod 冷启动 RDF 查询允许有限的 60 秒窗口，避免成功查询被 30 秒边界误判失败。
- E2E 登录兼容 Xpod 首次密码登录落在账户首页后重新发起 OIDC 授权。
