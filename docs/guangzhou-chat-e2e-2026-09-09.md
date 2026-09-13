# 广州 Chat 真实验收（2026-09-10，浏览器端最终复测待完成）

## 2026-09-10 中转站配置与发布收口

- 已按用户提供的 OpenAI 兼容中转配置在广州 `ns-iknkxtc8` 的既有 Xpod 凭据资源中完成配置；密钥未写入仓库、前端构建产物或本验收文档。
- 有效凭据继续使用 Xpod 已支持的 OpenAI 兼容适配器，Base URL 使用带 `/v1` 的兼容入口；“自定义兼容服务”条目经验证不被当前 Xpod 适配器支持，已停用。
- 已停用历史空的 `openai-default` 凭据，并将其从默认选择中移除；停用前凭据文件已在 Xpod 内部备份，可恢复。广州既有 PG、Redis、R2、PVC 和聊天数据未清理或替换，新加坡未修改。
- LinX Web r4 已发布到广州 homepage，静态入口 SHA256 与本地构建一致；`homepage`、`xpod-cloud` 均为 1/1 Ready，`/v1/chatkit/health` 返回 `status: ok`。
- 代码修复了“启用提供商时把没有密钥载荷的历史凭据重新激活”的问题；定向回归 35/35 通过，生产构建成功。
- 清理前曾通过广州真实 ChatKit → Xpod → 中转站链路取得精确回复 `TIMICC-RELAY-20260910`；随后发现旧空凭据被设置页的启用操作重新激活，已修复代码并再次停用该旧记录。r4 发布后需在浏览器解锁后重跑一次“刷新 → 选择模型 → 发送 → 回复 → 刷新恢复”作为最终闭环证据。
- 本轮浏览器自动化因桌面被锁定而暂时无法读取页面；因此本节不把 r4 发布后的页面点击复测标为通过。
- 独立 headless 浏览器已尝试接管广州页面，但该环境将广州域名解析到云元数据地址并安全拦截导航，且不具备现有广州登录态；不能用它替代真实登录浏览器验收。

> 下方旧日期段是 r4 发布前的历史快照，仅用于保留排查过程；当前状态以本节为准。

## 2026-09-10 继续复测结果

- 本地 Xpod `http://localhost:5737` 保持运行，LinX Vite `http://127.0.0.1:5174` 已启动；本地 Pod 读请求和账号会话初始化正常。
- 本地真实浏览器进入既有聊天后，ChatKit 远程 iframe 在 HTTP `127.0.0.1` 宿主下显示“cdn.platform.openai.com 意外终止了连接”，没有渲染输入框，因此本轮没有发送消息，也没有把本地真实助手回复记为通过。广州 HTTPS 页面可以正常渲染 ChatKit 输入框。
- 广州页面只做了只读检查：顶部仍显示 `gpt-5.6-sol`，打开“模型设置”后模型搜索为空；没有保存设置、切换模型或发送消息。该现象与已部署模型目录 / 页面投影不一致，仍是发布阻塞。
- LinX Web 定向回归 33/33 通过；完整 Web 单测 382 文件、2923/2923 通过；`build:check` 通过。
- LinX CLI 全量回归 492 项：489 通过、3 跳过、0 失败，退出码 0。
- 独立 models 工作树的共享 AI Config / vocab 定向测试 36/36 通过；该工作树仍是未发布的 0.2.51 checkout，LinX 发布测评仍以已安装的 npm `@undefineds.co/models@0.2.54` 为准。已将 CLI/Web 中过时的资源引用断言同步到 0.2.54 的相对 `settings/providers/...` 契约。
- 本轮未更新广州部署，未修改新加坡，未发送远程消息。

### 当前结论

代码回归与构建检查已通过；真实 Chat E2E 仍为“未通过 / 阻塞”，原因是本地 HTTP ChatKit iframe 无法初始化，且广州模型设置页没有可选模型。要完成最终 E2E，需先解决部署模型目录和本地 ChatKit 宿主问题，再在获得发送确认后复测“选模型 → 发送 → 真实回复 → 刷新恢复”。

## 最新进展（本地 2026-09-09 03:06）

以下结果覆盖后文较早的进行中状态，后文保留为排查历史：

- 本地 Xpod 实际运行镜像为 `sha256:860342bc7cae11efad701fbf15ae92da7bfcf76972534fa2b5af0fc848533169`。已核对更新前后环境变量和数据挂载一致，旧镜像保留。
- 新原生 SDK / runtime 构建、链接、实际查询通过，HEAD 和账户角色读取修复已随本地镜像运行。
- 真实鼠标创建“本地真实验收 0909 原生修复”成功：联系人写入 201，助手目录创建 201，会话写入 201/205、读取 200。会话 ID：`f718e2ab-3a0f-4d0c-8f88-78f339d123ef`。
- 模型验证仍未通过。已定位两处：当前用户作为服务主体时，前端不必要地用旧资源列表拒绝新描述；后端模型发现丢失凭据 metadata 中的 Base URL，回退官方端点。源代码修复已补测试，后端新镜像正在构建。自定义中转应使用已有 custom provider，不放宽官方 provider 的地址安全约束。
- 最新 Web 单测 382 文件、2923 测试通过；最新 `build:check` 通过。模型端点回归 40/40；完整多节点集成最新重跑 45/45（退出码 0），此前 lite 150 通过、6 跳过。
- 尚未取得此版本的真实助手回复，不把创建会话、模型连通性或自动化检查记为 Chat E2E 通过。广州尚未更新。

## 最新执行顺序（用户确认）

先在本地 Docker Xpod + 本地 LinX 完成真实验收与修复，再部署广州，最后重跑广州 E2E。后续广州更新已暂停。

- HEAD 修复镜像 `7d3140b038b149c3f35ea1f4248926c1bf271f5da2da188b9022983157f48fe2` 已上传仓库，但**未替换广州服务**。
- 本地 `xpod-local` 已更新到该镜像；数据挂载、既有 `xpod_local` PG 连接保留。旧镜像保留为 `xpod:local-before-20260909`。
- 本地 LinX `http://127.0.0.1:5174`，本地 Xpod `http://localhost:5737`。
- 本地完整服务 HEAD 探测已返回合法 401，不再 502。
- 多节点自动化最新重跑：45/45 通过；完整集成再次执行为 lite 150 通过、6 跳过，full 45 通过。上述结果不代表真实 Chat 已通过。

### 本地真实验收新增结果

- 浏览器创建 `acceptance0909` 本地账号成功，在 `localhost:5737` 同意授权后返回 `127.0.0.1:5174/chat`。没有使用广州或新加坡登录服务。
- 进入聊天后，服务日志出现 `query options could not be mapped to the native QLever ABI`。模型按钮提示“当前聊天没有可编辑的模型”；尚不能判定正常 Chat 通过。
- 当前运行原生组件的补丁摘要为 `0b436af...`，代码锁文件为 `603ae070...`，存在镜像与源码不一致，需重建并复测，不能仅凭健康检查放行。
- 本地账户角色初始化另有 Drizzle 包装错误识别问题：实际使用 `internal_kv`，可选 `identity_store` 不存在时，未解包 PostgreSQL `42P01`，阻断后续读取。已补窄范围识别及 9 项回归测试；仍待完整服务重建验证。权限、缺列、连接失败不会被吞掉。
- 使用实际 `xpod-local` 的连接配置，对本机现有 `xpod_local` 数据库做只读验证：`identity_store=null`、`internal_kv` 存在；修复后的 Repository 已能找到刚在浏览器注册的 `acceptance0909` WebID。未创建表或修改账号数据。TypeScript 编译通过。
- 原生契约本机初跑 295 通过、14 失败、1 跳过（缺 CMake 等工具链问题），已改在 Linux SDK 容器验证；这些测试不替代真实浏览器验收。
- 已通过实际运行的原生二进制和独立临时 SQLite 夹具复现：空 options 查询成功，加入 `defaultDataset: scopedUnion` 后返回 `unsupported` / `query options could not be mapped to native QLever ABI`。业务数据库未改动。
- 镜像构建增加源码锁与原生 manifest / 二进制摘要检查，当前旧运行时已被正确拒绝；不会通过改 manifest 或绕过检查复用旧组件。
- 两项多节点失败根因：测试继承本机 `SOLID_OIDC_ISSUER=http://localhost:5739/`，导致授权码签名和 WebID issuer 不一致；部分节点还继承本机 Redis 6379。明确每个测试节点的 issuer、Redis 及 quota PG 地址后，真实集成请求通过，原有权限检查保留。26 项定向回归通过。
- 原生 Linux 全套一轮为 308 通过、1 跳过、1 编译超时。该用例编译四个翻译单元，跨架构环境中超出写死的 15 秒；保留可执行断言、调整为 60 秒后，单文件 9/9 通过。全套重跑 309 通过、1 跳过、0 失败；Python 98/98 通过。跳过项需要实际 QLever 链接环境，将在 SDK / runtime 构建中继续验证。新 SDK 本地构建已启动，尚未完成新原生镜像构建。

### 本地创建会话错误提示复测

真实浏览器使用本地 `acceptance0909`，提交“本地真实验收 0909”创建表单。联系人 PATCH 返回 500，响应明确为 `query options could not be mapped to the native QLever ABI`，与原生版本问题一致。原 UI 把 `Write failed` 优先映射为“换一个空间”，已调整服务器错误优先级，保留 401/403 和缺少根容器的具体提示。热更新后重走同一表单，真实 UI 显示“服务暂时没有响应。请稍后重试。”；定向 42 项通过。创建会话本身仍未通过。

窄浏览器面板另发现新建按钮被分栏边界遮挡：鼠标点击落到分隔条，键盘 Enter 能打开菜单。已记录，待修复并复测，不以键盘操作替代鼠标验收。

另一个独立问题已修复：桌面宽度下“新建聊天 → 创建助手 → 取消”后，整个页面残留 `body { pointer-events: none }`。菜单和弹窗分别加载不同的 Radix dismissable-layer，造成全局锁恢复冲突。统一为项目已使用的 1.1.15，新增依赖单实例回归测试。清理本地隔离安装中残留的旧依赖（移至临时备份而非删除），重启前端后，用真实鼠标重复打开 / 取消，页面 body 样式恢复为空，后续菜单点击成功。原始窄窗口的分栏遮挡仍存在，未混报为已修复。

前端本轮完整重跑为 382 文件、2920 测试通过，`build:check` 通过。新 QLever SDK 的实际 adapter 链接 / runtime smoke 通过，local runtime 构建与 smoke 通过。使用同一独立 SQLite 夹具对新二进制再次发送 `scopedUnion` 查询，已返回 `status: ok`，不再报 ABI 参数不支持。完整服务镜像已通过新增源码身份门禁，正在导出，尚未替换本地服务。

## 部署范围

- 广州 Undefineds / `ns-iknkxtc8`，只更新 `homepage` 和 `xpod-cloud`。
- 既有 PG、Redis、R2、PVC 保留；未改动新加坡。
- LinX：test `c5c471511cd2ff1f44b5ca82bd89523cbbdc74e1` 加本地 Chat / 模型启用修复。
- Xpod：test `663bec92409b883a7bdb0cb731abb9d7d0a8ebed` 加本地协议、镜像证书修复。
- 初次部署镜像：`ccr.ccs.tencentyun.com/undefineds/xpod@sha256:98046b4a6b8d62a56ad360d95a2a7fc102e76d0dd0482520f12c735e31c235a1`，1 Ready，ChatKit health 正常。
- 前端入口文件本地 / PVC / 外网 SHA256 一致：`89b92c24273574e28a3f68da45ad35cb16cabfc49e2d57a399f45436bb6287c6`。静态发布保留旧 assets，并备份原 index。

## 非 E2E 检查

- LinX 正式依赖 models 0.2.54，build:check、models:assert-release-safe 通过。
- Web 单测：381 文件、2918/2918 通过。不能替代真实 Chat。
- HEAD 修复定向测试：25/25 通过；Xpod lite 集成：150 通过、6 跳过。
- 完整多节点测试第一次因本机 Redis 16379 端口被其他项目占用而无法启动；换测试专用端口重跑，不停止其他项目。

## 浏览器真实操作结果

浏览器真实点击，账号为广州现有 test，非 mock。时间以服务器 UTC 日志为准（本地 2026-09-09）。

| 场景 | 结果 | 证据 |
|---|---|---|
| 广州登录授权 | 通过 | 广州 consent 选中 test、点击 Authorize，回到广州 Chat |
| 更新后刷新并恢复已有历史 | 通过，但较慢 | 新服务上再次 reload，恢复 4 个既有助手及主理人旧消息；历史查询日志 6.7s / 12.2s |
| 新建“广州全链路验收 0909” | 失败，修复中 | contact PATCH 201；agent 目录 HEAD 在 CSS 404、Gateway 502，页面“服务暂时没有响应” |
| 主理人发送中文 / 表情 / 表格 / 代码请求 | 失败，修复中 | `Message container check failed: 502`；尚未进入模型生成 |

## 已定位阻断

Xpod 内 CSS 使用 Bun 1.3.8。HEAD 错误响应仍被写入 chunked 正文；Gateway 的 Node HTTP parser 报 `Parse Error: Expected HTTP/, RTSP/ or ICE/`，把合法 401/404 变为 502。

直接原始 TCP 探测确认内部 3001 HEAD 401 后存在 JSON 正文，而 3000 返回 502。不是用户 API Key 或模型本身失败。

修复：CSS ResponseWriter 等位替换，HEAD 显式关闭未使用的正文流，保留状态和元数据。修复镜像已在本地运行，须按本地先行顺序通过验收后再更新广州并复测原路径。

## 待验收（不能标为通过）

新建会话、默认模型、切模型、Chat Completions / Responses、连续上下文、表情 / Markdown / 代码 / 表格、Stop、重试、编辑 / 分支、刷新保持、TXT/PDF/Office/图片上传、视觉理解、图片生成、附件失败恢复、复制 / 反馈 / 分享、异常队列的会话隔离。

## 入口

- Chat：https://undefineds-gz.sealosgzg.site/chat
- Xpod：https://undefineds-gz-id.sealosgzg.site/

## 本地执行日志

- `/tmp/linx-gz-main-build-20260909.log`
- `/tmp/linx-gz-main-tests-20260909.log`
- `/tmp/xpod-gz-head-build-0909.log`
- `/tmp/xpod-head-integration-0909.log`
- `/tmp/xpod-head-full-0909.log`
- `/tmp/xpod-local-integration-0909-r4.log`
- `/tmp/xpod-fix-regression-0909-r5.log`
- `/tmp/xpod-native-linux-gate-0909-r5.log`
- `/tmp/xpod-native-sdk-build-0909.log`
- `/tmp/linx-local-full-tests-0909-r3.log`
- `/tmp/linx-local-build-check-0909-r3.log`
- `/tmp/xpod-native-runtime-build-0909.log`
- `/tmp/xpod-local-native-fixed-build-0909.log`

## 2026-09-11 final frontend rollout follow-up

- Found and fixed a release packaging fault: the updated `index.html` referenced
  a new entry bundle that had not been copied to the Guangzhou PVC, causing a
  fresh browser to render a white screen.
- Re-published the complete frontend build, restarted only the Guangzhou
  `homepage` deployment, and left Singapore untouched.
- Added an automated deployment verifier; its unit regression passed 3/3 and the
  live Guangzhou page passed all 9 referenced static assets.
- Authenticated browser verification passed for ChatKit initialization, model
  discovery, model selection persistence (`gpt-5.6-terra`), and history recovery
  after a full reload.
- One new relay-backed send/reply remains pending explicit action-time approval.
