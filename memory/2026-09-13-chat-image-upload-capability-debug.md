# 聊天图片上传失败排查：custom provider 能力声明链路（2026-09-13）

## 症状

ChatKit 粘贴/选择图片后 toast「无法上传文件。请重试。」；console 真实报错是
`此模型不支持图像输入。请尝试其他模型`（`LocalChatKitService.assertAttachmentCapability`，
service.ts:698 附近）。同套机制还导致「未声明 图片生成 能力」。

## 根因（四层，层层叠加）

1. **凭据 metadata 无 schema 列**：`@undefineds.co/models` 的 credential schema 没有
   `metadata` 字段，`ProviderCustomModelsService.upsert` 写的 `metadata.customModels`
   在 drizzle-solid insert/update 时被静默丢弃 → 用户在「添加模型」里勾选的能力
   从未真正落盘（POST 返回 200 是假象）。
2. **xpod ModelRouter 投影丢能力**：`credentialVisibleModels`（ModelRouter.ts ~763）和
   `visibleTargets`（~318）里，模型在凭据的已选 `models` 列表里时先被推入裸投影并
   `seen.add()`，随后 customModels 循环因 `seen.has(key)` 跳过 → 能力永远丢失。
   修复：抽 `customModelProjection` / `indexCustomModels` / `registryModelDescriptor`，
   已选模型若匹配 customModel 且无注册描述符则用自定义投影（custom:true +
   modalities + custom_capabilities）。
3. **LinX 只认 `/v1/models` 的 `capabilities` 字符串数组**，而 xpod 把能力放在
   `custom_capabilities` + `modalities.input`；结构化 `capabilities` 对象
   （models.dev 来的）也被 `Array.isArray` 判空。修复：loadGatewayModels 合并三种形态
   （custom_capabilities 原样、modalities.input 含 image → image_input、
   structured.imageInput/toolCalls → 对应能力）。
4. **兜底语义**：LinX `resolveProviderCapabilities` 原先「列表为空才回退
   chat_completions」，合并出 image_input 后会丢掉 chat_completions 基线 →
   改为一律带上 chat_completions。

## 改动位置

- xpod: `src/api/ai-gateway/routing/ModelRouter.ts`（投影修复）+
  `tests/api/ai-gateway/ModelRouter.test.ts`（+3 测试）
- LinX: `apps/web/src/modules/chat/services/chatkit-local/service.ts`
  （loadGatewayModels 合并三种形态；resolveProviderCapabilities 基线）+
  `service.platform-runtime.test.ts`（modalities 正路径回归测试）

## 复现/验证手法

- 浏览器（gstack browse headed）里直接对 ChatKit iframe 的 `input[type=file]` 塞
  `DataTransfer` 文件并 dispatch change，无需系统文件选择器。
- `xpod auth login --url http://localhost:5737 --email ... --password ...` 后可用
  `xpod rdf query --scope /settings/` 直接查凭据行（确认 metadata.customModels 是否写入）。
- 重建容器注意：Dockerfile 需要 `XPOD_QLEVER_LOCAL_RUNTIME_IMAGE`（@sha256 不可变引用），
  `docker compose build` 缺这个变量会静默失败（管道吞 exit code），镜像不会更新。

## 遗留的三个缺口（2026-09-13 当日已全部修复）

1. ~~能力检查粒度 provider 级并集~~ → 改为模型级：`resolveModelCapabilities(provider,
   modelId)` 按 `/v1/models` 里 provider+model 精确匹配；匹配不到条目时回退 provider
   级并集。`resolveProviderCapabilities`（图片生成寻路等）保持 provider 级不变。
2. ~~custom provider 声明不了图片生成~~ → xpod `packages/ai-connections/src/
   AiModelEditorDialog.tsx` 的 capabilityOptions 增加 `image_generation`（图片生成）/
   `image_editing`（图片编辑）开关（snake_case，对齐 LinX 词汇表）；重建 dist 同步到
   LinX vendor/ai-connections + node_modules，版本号 0.1.0-rc.0 → 0.1.0-rc.1。
   注意：改 file: 依赖后 Vite 的 optimizeDeps 缓存不会自动失效（hash 只看
   lockfile+config），必须重启 dev server 才会重新打包。
3. ~~ChatKit 报错不透传~~ → ChatKit toast 文案是 CDN 闭包里写死的（uploadFailedTitleV2
   /uploadFailedMessage），改不了；改为 LinX 侧透传：fetch-handler catch 里新增
   `onRequestError(message)` 回调 → useLocalChatKitRuntime 用 ref 透传（避免 inline
   callback 导致 localFetch 重建）→ ChatKitPanel 用 useToast 弹 destructive toast。
   现在用户能看到真实原因（如「此模型不支持图像输入。请尝试其他模型」）。

验证：无视觉模型 gpt-5.5-nano 会话传图被拒且红色 toast 显示真实原因；有视觉的
gpt-5.5 正常。回归测试 +3（模型级正反路径、onRequestError 透传）。

## 升级注意事项

- @undefineds.co/models 的 credential schema 没有 metadata 列（权威源在 LinX
  packages/models/src/credential.schema.ts），xpod 靠
  patches/@undefineds.co%2Fmodels@0.2.53.patch 给 dist 加了
  `metadata: json("metadata").predicate(UDFS.metadata)`。升级 models 版本时需把该列
  合入正式 schema 并移除 patch。drizzle-solid 的 json 列以 hash 子资源
  （credentials.ttl#metadata-N）存储，读写对称、无需额外处理。
- xpod registry capabilities 是结构化对象，LinX 已映射 imageInput/toolCalls；
  imageGeneration/imageEditing 走 custom_capabilities 字符串路径（applet 开关
  已支持声明）。

## 修复后验证（2026-09-13）

- 容器内 `/v1/models` 从 80B → 175B（含 modalities.input:["image"] 与
  custom_capabilities）；图片上传 PUT → 201；带图提问「这张图是什么颜色？」模型
  基于图像内容作答，端到端打通。
- 用户验收账号（acceptance0909）需自行在「模型服务 → Custom → 添加模型」里对
  gpt-5.5 勾选「视觉识别」保存一次（声明存各自 Pod）。

## 后续：刷新后图片变文件卡片（同日修复）

现象：刚上传时图片内联渲染，刷新后变成通用文件卡片（文档图标 + "Image"）。
原因：持久化时 `preview_url` 被替换为需 DPoP 鉴权的 Pod URL（store.ts
threadItemToMessageRecord），ChatKit iframe 里的 <img> 拉不到 → 退化为文件卡。
修复：`LocalChatKitService.hydrateItemAttachmentUrls`，在 `items.list` 与
`threads.get_by_id` 两个出口把 image 附件的 preview_url/download_url（及
generated_image 的 image.url）换成 `store.loadAttachmentObjectUrl` 生成的会话
blob URL（带缓存）。注意 ChatKit 走 `threads.get_by_id` 内嵌 items 加载会话，
`items.list` 反而不在首屏路径上；`loadAllThreadItems` 只被内部变更操作使用。
坑：解构 `const f = store.loadAttachmentObjectUrl` 会丢 this，必须 `store.f()` 调用。
