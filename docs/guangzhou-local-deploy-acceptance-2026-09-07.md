# 广州本地构建与真实验收记录

## 范围与判定

- 仅广州 Undefineds：集群 `https://gzg.sealos.run:6443`，命名空间 `ns-iknkxtc8`。
- LinX：`https://undefineds-gz.sealosgzg.site/chat`。
- Xpod：`https://undefineds-gz-id.sealosgzg.site/`，目标 Deployment `xpod-cloud`，不是 `xpod-rc`。
- 不修改新加坡，不删除用户数据，不新增本地数据库快照。
- 单测、上游连通性、镜像构建、Pod Ready 均不替代浏览器端到端验收。
- 每项必须记录实际版本、操作、结果和证据；未执行、失败、上游缺能力分别记录，不能计为通过。

## 构建进展

- Xpod `test`：`962f5ea3229ca18989c96baf1d00282267e14224`。
- LinX `test`：`1173622`，本批前端业务代码基线 `f96d6cc`。
- SDK [34048737675](https://github.com/undefinedsco/xpod/actions/runs/34048737675) 已成功，26 分 47 秒。
- SDK：`ghcr.io/undefinedsco/xpod-qlever-sdk@sha256:db71728c9ab0b5c9285e7e9b25cc5c130cc05757c2dafb6e3729e388fa2edf76`。
- 本地 Linux amd64 runtime 已构建成功，启动、动态库、全文检索和向量构建冒烟通过；日志 `/tmp/xpod-gz-local-runtime-962f5ea3.log`。已推送，摘要见下文。
- LinX 发布检查发现本地 models 链接到含未提交改动的旧 `packages/models`，检查正确拒绝发布。保留原目录，使用 `git archive HEAD` 的隔离源码 `/tmp/linx-gz-release-1173622.BVKCgf` 和冻结锁文件重新安装。日志 `/tmp/linx-gz-clean-install-1173622.log`。
- 直接下载依赖有网络重试，已使用本机现有代理显式传给 Yarn；当前日志 `/tmp/linx-gz-clean-install-1173622-verbose.log`，未关闭 TLS 验证。

### 原生门禁实测

- `QleverPreparedNewResource.integration.test.ts`：对新 Docker runtime 的 5 项测试全部通过，日志 `/tmp/xpod-gz-native-prepared-962f5ea3.log`。
- 语义门禁第一次执行 12/14 通过；日期更新和 DELETE/INSERT WHERE 后读回旧值。日志 `/tmp/xpod-gz-native-semantic-962f5ea3.log`，不计为通过。
- 进一步真实协议记录确认 native prepared delta 包含正确删除和插入；宿主写入端报告各 1 行且能读到新值，但 Linux 容器仍读旧值，关闭容器后宿主出现 `SQLITE_IOERR_VNODE`。证据 `/tmp/xpod-gz-debug-delta.log`。当前测试跨 macOS/Linux 共享 SQLite WAL，必须在同一 Linux 环境重测以区分测试运行环境与产品故障。
- 隔离 Linux 测试镜像构建成功，Bun 写入端和 native runtime 共用容器内数据库，语义测试 **14/14 通过，0 失败，deniedRowsObserved=0**。证据 `/tmp/xpod-gz-linux-semantic-962f5ea3.log` 与同名 `.json`；跨 macOS/Linux 的共享 SQLite WAL 不作为发布门禁运行方式。
- 通过后已推送团队镜像仓库：`ccr.ccs.tencentyun.com/undefineds/xpod@sha256:6271425bd721c5b9aed4a36fc4a451e3940c65f45ff4b8de24920d8944af2684`（原生 runtime），推送日志 `/tmp/xpod-gz-runtime-push-962f5ea3.log`。
- Xpod server 正在本地构建，绑定上述原生不可变摘要，候选标签 `gz-test-962f5ea3`。本地构建配方仅移除仓库 Dockerfile 原有的 `NODE_TLS_REJECT_UNAUTHORIZED=0`，保持 TLS 校验，不修改业务源码；日志 `/tmp/xpod-gz-server-build-962f5ea3.log`。
- 更新：server 构建和推送已成功，摘要 `ccr.ccs.tencentyun.com/undefineds/xpod@sha256:e3e78139880d471f091a926b0240405afbccb56c5b297e45fb0fe91094a9cc3b`；架构 amd64、revision 标签与 962f5ea3 一致，`node dist/main.js --help` 正常。推送日志 `/tmp/xpod-gz-server-push-962f5ea3.log`。
- 广州 MAIN `xpod-cloud` 已成功 rollout，实际容器镜像摘要匹配上述 server；保留原有配置和 PVC。`/.account/` 与 `/v1/chatkit/health` 均 HTTP 200，后者返回 status=ok。误用 `/api/v1/chatkit/health` 返回 404，正确路径不含 `/api`。尚不代表 Chat 验收通过。
- LinX 干净安装的引擎声明无交集：项目要求 >=22，authn-node 支持 20/22，旧 universal-fetch 支持至 20。Node20 安装被项目拒绝，现保留官方 Node22.22.0，安装阶段显式 ignore-engines，必须用实际构建和测试确认兼容性，不能将安装器检查算通过。日志 `/tmp/linx-gz-clean-install-node22-verified-1173622.log`。

## 切换前基线（只读核实）

### 新发现的前端发布阻塞

- 干净 npm `@undefineds.co/models@0.2.51` 发布守卫通过，但 `build:check` 失败：未导出 `reconcileChatProjectContext` 与 `markConversationShareRevoked`。日志 `/tmp/linx-gz-clean-build-1173622.log`。
- 这两项位于旧本地 models 分支已提交的 `983e8e8`，并非 LinX 代码已经能依赖的正式 npm API。读取 npm 最新 `0.2.53` 的发布包也未发现这两项导出，单纯升级版本不能解决。
- 干净依赖 Web 单测：**2911/2912 通过，1 失败**，失败为模型资源 ID 带 provider 路径时更新已有模型。报告 `/tmp/linx-gz-clean-tests-1173622.json`。此前本地 2912 全过不能替代这次发布依赖实测。
- 必须完成共享 models 的正式发布与 LinX 精确版本更新，再重跑构建、测试、前端部署和完整浏览器验收；不复制共享语义到 LinX，不打包脏 models 检出，不用旧版本的 PASS 代替。
- 用户已确认补齐独立 models 发版。基于独立仓库 `origin/main`（`fd94b5d`）创建隔离工作区，保留两个原有 models 检出的未提交内容。
- models `0.2.54`：提交 `ea2e6e3`，补齐两个公开 API，保留已有 API、无 schema 修改。审查中修复旧页面无条件 upsert 覆盖/复活其他客户端记忆的问题：仅写入实际修改的设置字段、仅 upsert 新增/修改的记忆。
- 回归实测：修复前 7 失败 / 23 通过，修复后 30/30 通过；完整 `test:ci` 187/187 通过；TypeScript build、skills 检查、四类发布包打包通过，包内 JS 和声明文件均包含新导出。证据 `/tmp/models-gz-054-regression-red.log`、`/tmp/models-gz-054-regression-green.log`、`/tmp/models-gz-054-tests.log`、`/tmp/models-gz-054-pack.log`。
- [models 0.2.54 发布流水线](https://github.com/undefinedsco/models/actions/runs/34087219817) 已触发；待确认 npm 产物后升级 LinX。发布包测试是单元/契约验证，不是广州浏览器 E2E。
- LinX 已移除隐式 legacy models workspace 和 Vite/Vitest 源码 alias，防止本地与正式发布依赖不一致。当前前端尚未覆盖，广州 Xpod 新镜像已就绪。

- `xpod-cloud`：1 Ready，revision 59，镜像 `ccr.ccs.tencentyun.com/undefineds/xpod:gz-openai-base-c877db3c`。
- `homepage`：1 Ready，revision 69，镜像 `nginxinc/nginx-unprivileged:1.27-alpine`，内容 PVC `linx-web-content`。
- `xpod-cloud` 保留 `/app/data` 等存储挂载、现有密钥引用和 `cloud.json` 配置挂载。部署前再次确认并保存回滚版本。

## 待执行的发布门禁

1. 新 runtime 的启动、动态库、全文检索和向量冒烟。
2. 新 runtime 的 SQLite QLever 语义一致性。
3. 新 runtime 的 5 项真实回归：JSON 字面量、新资源写入、不存在授权图/来源的隔离。
4. 新 runtime 不可变摘要绑定到 Xpod server 构建；推送团队仓库。
5. 干净 LinX 依赖检查、构建、测试，广州 issuer 构建参数。
6. 广州 MAIN 版本、健康检查、实际镜像摘要与前端资源一致性。

## 本轮独立发布结果

- npm `models@0.2.54` 已可下载，shasum 与独立仓库发布检查产物一致：`2ca469bc9932aeab3501e1ce45b12cfefc77e0a4`。发布后的短暂 registry 同步延迟已结束。
- LinX 消费正式 npm 包，移除旧本地 models 源码 alias/workspace；lockfile 随之删除旧 models 开发依赖，不升级其他业务依赖。
- 原有单测失败实际是 `rdfType` 旧断言，不是资源 ID 更新失败。正式 models 既有契约为 `[ChatModel]`，已同步断言并增加 `ChatCapability` 检查，保留原资源更新及不重复插入检查。
- 干净依赖最终 Web 单测 **2912/2912 通过，0 跳过**，日志 `/tmp/linx-gz-054-tests-final.log`，JSON `/tmp/linx-gz-054-tests-final.json`；发布守卫、stores/Web TypeScript 和生产构建通过。
- 本地构建使用广州 issuer/site，版本标识 `0.1.0-gz-models054`，已部署到广州 MAIN `homepage` 内容 PVC。入口采用先上传 assets、最后原子替换 index 的方式；旧 assets 保留，旧入口备份 `.releases/pre-models054/index.html`。
- 本地、PVC、外网 `index.html` SHA256 均为 `c5124794903aa21a127f81ad20687c1cd965cc4415e468ccde19843a5a559d0a`。
- 部署后 `homepage` / `xpod-cloud` 均 1/1 Ready、1 Available；广州 `/v1/chatkit/health` 返回 `status=ok`。这些状态不等于完整 Chat E2E 通过。
- 构建仍有第三方 drizzle-solid eval 与大 chunk 警告，非本次编译失败原因，未通过调高阈值隐藏。

## 真实浏览器验收矩阵

以下按当前部署逐项记录，不能复用旧版本报告的 PASS。

2026-09-07 本地 Chrome 实测：广州 issuer 的既有 cuilinsu 账号点击 Authorize 后回到广州 LinX；通过页面创建“广州独立部署验收 0907”，选择 `gpt-5.6-sol`，发送唯一标记请求，真实返回“广州模型对话成功 GZ054 ✅”。刷新后当前会话、用户消息和回答均恢复。截图已在本次任务内展示，测试数据保留。历史恢复仍有明显等待，本轮没有将性能标为通过。此前一条过期授权回调报 `requested scopes not granted`，点击重新登录并重新授权后恢复。

LinX 发布提交 `fa02069` 已推送 test；共享包修复 [PR #3](https://github.com/undefinedsco/models/pull/3) 已创建且 CI 通过。临时上传 Pod 已删除，未删除 PVC 或业务数据；定时重试保持关闭。

| 场景 | 验证重点 | 状态 |
| --- | --- | --- |
| 登录与授权 | 广州 issuer、广州 Pod、回调及刷新登录恢复 | 既有账号授权和刷新通过；新注册待执行 |
| 新建会话与默认主理人 | 默认模型实际回答，新会话不显示其他会话队列 | 待执行 |
| 切换模型 | Sol/Terra/Luna 等实际可用模型，刷新后保持 | 待执行 |
| 接口能力 | Chat Completions/Responses 各自实际请求及回答 | 待执行 |
| 连续对话 | 上下文、中文、emoji、Markdown、代码、表格、公式 | 待执行 |
| 上传入口 | 选择、拖拽、粘贴与附件卡片 | 待执行 |
| 文档 | TXT/Markdown/PDF/DOCX/XLSX/PPTX 唯一内容参与回答 | 待执行 |
| 图片理解 | 真实图片上传、缩略图、内容识别 | 待执行 |
| 图片生成与编辑 | 支持能力的真实模型、成品展示、下载 | 待执行 |
| 附件异常 | 大小限制、取消、失败重试、无孤儿文件 | 待执行 |
| 停止与重试 | 中断保留部分回答，重试生成 sibling | 待执行 |
| 编辑与分支 | 原消息不覆盖、分支后续隔离、刷新保持 | 待执行 |
| 消息操作 | 复制、反馈持久化、删除、引用、朗读 | 待执行 |
| 历史恢复 | 当前会话和消息恢复、分页、加载耗时 | 当前会话/双向消息刷新恢复通过；分页待测，速度待优化 |
| 异常恢复 | 队列仅当前会话、断网重连、授权失效提示 | 待执行 |
| 联网搜索 | 有能力时真实搜索引用，无能力时明确说明 | 待执行 |
| 语音 | 实际麦克风与语音发送、加载期间协调 | 待执行 |
| 分享与导出 | 真实链接、权限、撤销、导出内容 | 待执行 |
| 项目上下文与资产 | 实际 Pod 读写及刷新恢复 | 待执行 |
| 请求边界 | 浏览器模型请求经过广州 Xpod，不误用新加坡 | 待执行 |

若设备或上游不提供某项能力，应记录明确缺口并向用户请求对应资源，不用模拟成功代替。

## 2026-09-07 下午：模型设置与发送故障修复后的实测

本节是后续增量记录，不将前面的待执行项目改为通过。

### 修复与部署

- Agent Home 的 provider/model 相对资源引用缺少 Pod 根 BASE，且按旧缓存精确删除会留下多值。更新改为 Pod 根 BASE、按变更谓词删除当前值后插入；创建也使用同一引用基准。
- Chat Completions 的 HTTP 200 流内 `error` 不再被吞掉或算作成功回答，明确结束为失败/不完整状态。
- test 账号的 credentials Turtle 可读取但 SPARQL 查询为空。以该账号正常认证读取内容、核对前后内容一致后原样 PUT（205）重新同步这一资源；未更换密钥、未新建 credential、未修改 ACL。刷新后模型列表恢复。历史索引漂移的产生原因未在本轮证明，不能称已根治所有索引问题。
- 在正式 npm models 0.2.54 的隔离发布目录执行：相关测试先 2 失败/47 通过，修复后 49/49；完整 Web 381 文件、2913/2913；TypeScript、生产构建、diff 检查通过。日志 `/tmp/gz-model-stream-{red,green,full}.log`、`/tmp/gz-model-recovery-build.log`。
- 广州 MAIN 前端版本 `0.1.0-gz-model-recovery`，静态发布 `model-recovery-20260907`；外网与本地入口 SHA256 相同：`9bfabac76599a27a165756cf8d1c3885704800dfff89fefa7153b1f57948b054`。旧 assets 保留。
- Xpod consent 修复镜像摘要 `sha256:4947fc185e1340f1ad4084db2e1a014428b13e6f65072138417fee734690e18a`；`homepage`、`xpod-cloud` 均 1/1。没有操作新加坡。

### 当前真实浏览器证据

使用广州 test 账号、实际页面点击和输入；模型调用均为广州 Xpod `/v1/chat/completions`。下列请求 ID 为本次浏览器网络记录标识，不是模拟请求。

| 操作 | 实际结果 | 判定 |
| --- | --- | --- |
| 主理人切换 Sol，发送中文并要求 emoji | 返回“你好，很高兴见到你！😊”；14077.1700，真实 SSE 正常结束 | 通过 |
| 刷新上述会话 | Sol、用户消息、回答保留 | 通过；加载速度未达成性能验收 |
| 新建“广州回归验收 0907”、选 GPT-5.4 | 创建成功，刷新后助手和模型保留 | 通过 |
| GPT-5.4 故事/表格/代码请求 | 14077.1983 返回上游 503；手动重试 14077.2001 仍 503 | 未通过，不计作格式验收 |
| 原失败会话改 Sol、重新生成 | 实际请求模型已改；14077.2291 HTTP 200 内含 overload/502，页面明确生成失败 | 错误识别通过；成功重生成及 sibling 验收未通过 |
| 同一会话失败后继续发送 1+1 | 14077.2306 返回“2”，输入框恢复可用 | 通过 |
| 对“2”点赞 | 14077.2308 PATCH 写入 positive，205，按钮进入已点状态 | 写入通过，刷新读回待测 |
| 从加号菜单选择 TXT 测试文档 | 附件资源上传 204、读取 200、消息附件卡片出现 | 上传通过；内容参与回答另行确认 |
| TXT 内容参与模型回答 | 提问未包含答案，模型真实返回文件唯一值 `ORCHID-4827`，请求 14077.2325 | 通过 |

当前上游存在间歇性 503/流内 502 过载，不能将普通聊天稳定性和全量 Chat E2E 标为通过。没有用单测或 HTTP 200 替代实际回答。

### 刷新二次复测发现的问题与补修

- TXT 回复后刷新，新会话显示空白。真实线程查询证明原 `41e87542-48fc-408d-be71-5f3722426587` 仍在，但刷新创建并选中了空的 `476c994d-853d-4f27-8111-063f2cc21b56`，不是消息已删除。
- 原因：LiveQuery 已 ready 的空缓存不代表 Pod 重绑定读取完成，控制器据此创建默认话题。补修为空时先真实 refetch 当前 chat 的话题，保留已有选择；读取失败不创建。refetch 结果按当前 chat 隔离。
- 新增两条回归：空缓存仍有服务端话题、服务端查询失败。修复前 2 失败/49 通过，修复后 51/51；正式发布依赖完整 Web **2915/2915**，类型检查和构建通过。日志 `/tmp/gz-thread-recovery-{red,green,full,build}.log`。
- 最新部署覆盖为 `0.1.0-gz-thread-recovery`，发布目录 `thread-recovery-20260907`；线上、本地入口 SHA256 均 `e0eb9073623fe84e505dd9824088bb904acbdf888bc4e30abd631f9f90d86af6`。保留旧版本、所有话题和测试消息。
- 最新版本真实发送（14077.2830、Sol）返回“广州刷新验收成功”。再次刷新后同一会话、Sol、用户消息和回答均恢复，网络记录未再出现新建“默认话题”的 PATCH；本次恢复补修通过。未删除之前因缺陷产生的空话题，也未把旧话题内容搬进新话题。
- 临时上传 Pod 清理不涉及 PVC、业务服务或数据。完整 E2E 仍未全部验收：多模型稳定性受上游 503/502 影响；图片、Office/PDF、停止后的部分内容、分支、语音、搜索与分享等仍按矩阵待验，不计入本次通过项。
