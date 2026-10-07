# Xpod AI Connections 本地端到端修复记录

日期：2026-09-12

## 症状

- 自定义模型在 Xpod 模型服务页可以发现并勾选，但刷新后选择状态曾丢失。
- 聊天页模型选择器只显示 `linx-lite`，无法使用 Xpod 已配置的自定义模型。
- 纯文本消息曾被图片输入能力检查误拦截。
- 上游失败后曾把消息写入离线发送队列，导致旧请求可能在后续启动时重放。

## 根因

1. AI Connections 客户端只做模型发现，没有调用 Xpod 的模型选择持久化接口。
2. 首次写入模型选择 Turtle 文档时缺少可唯一识别的 RDF source provenance，原子更新失败。
3. Xpod 活跃模型目录默认未包含通用 `custom` provider。
4. LinX 的 Xpod AI Connections Provider 只挂载在“模型服务”微应用内部；聊天页拿不到公共 controller，因此退回内置模型。
5. 旧聊天发送实现把临时网络/上游错误加入持久队列，并在文本轮次上错误使用历史图片能力进行前置拦截。

## 修复

- AI Connections 保存勾选模型时，先发现模型，再调用 Xpod `/models/selection` 持久化。
- 首次模型选择写入前创建空的 Turtle 资源，确保 RDF 更新有稳定来源。
- 将 `custom` 纳入 Xpod 默认活跃模型选择目录，并兼容通用 custom 与 credential-scoped custom 的展示合并。
- 将 Xpod AI Connections Provider 提升为所有 LinX 微应用共享的工作区基础能力；聊天和联系人直接消费 Xpod 公共模型目录。
- 文本请求不再受图片能力前置检查影响；只有实际附加图片时才提示不支持。
- 生成失败只返回一次错误，不再进入持久发送队列。
- Vite 依赖指纹加入 Xpod AI Connections 和共享 models 入口，避免本地使用陈旧预构建缓存。

## 验证

- Xpod AI Connections client：30/30 通过。
- Xpod PodModelSelectionRepository + AiGatewayService：54/54 通过。
- LinX PrimaryLayout + ChatHeader 回归：23/23 通过。
- Xpod TypeScript 构建和 Docker Compose 配置校验通过。
- LinX Web `build:check`（stores、TypeScript、生产构建）通过。
- 浏览器确认聊天页模型选择器出现 `custom/gpt-5.6-terra`，保存后页头显示 `Custom / gpt-5.6-terra`。
- 纯文本真实调用最终返回 `LOCAL-XPOD-TIMI-OK`，没有图片能力误拦截，也没有新增离线队列。
- 本地 Xpod 容器健康；已固化镜像 `xpod:local`，镜像 ID：`sha256:97bd008af3c64fdde84262e353768895685e908184f61c64819431bb229f91f2`。

## 已知非阻塞项

- 一次真实流式调用在返回 `LOCAL-XP` 后收到上游 502；紧接着重试完整成功。这属于上游瞬时流中断，不是本地模型路由或凭据配置失败。
- 完整 Dockerfile 重建曾卡在依赖下载；本轮通过将已构建的服务产物写入容器并提交为本地镜像完成验收固化。后续 CI/发布仍应在稳定依赖网络下完成可复现镜像构建。
