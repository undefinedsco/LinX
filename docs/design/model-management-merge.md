# 模型管理端合并 Spec（LinX 嵌入 xpod 页面）

- Status: Proposal（2026-08-05）
- 决策人拍板记录：
  - 管理端唯一实现 = xpod 的页面（`@undefineds.co/ai-connection` applet，挂在 dashboard `/settings/models`）
  - LinX 端**不保留** `ai-connections` 自实现，改为调用/嵌入 xpod 页面
  - 视觉与产品感觉**向 LinX 看齐**（LinX 是主产品面）
  - chat 推理改走 chatkit（xpod 服务端）——**另行立项，本 spec 不含**

## 1. 背景

两套模型管理产品并存：

| | LinX `ai-connections`（apps/web） | xpod `ai-connection`（packages/ + dashboard） |
| --- | --- | --- |
| Provider 目录 | 13 家 | 5 家 |
| 凭据 | 明文直写 Pod | 加密经服务端 vault |
| Connect | 手输 Key + 浏览器直连验证 | 浏览器辅助 Key / device-code OAuth |
| 模型 CRUD | 完整（编辑器、能力标记） | 只读列表 |
| 配额 / 网关 Key / 编码客户端配置 | 无 | 完整 |
| 数据通路 | 纯 Pod-direct | 纯 xpod API（invocation token） |

合并后：**功能取并集，实现归 xpod，视觉归 LinX，LinX 端只留嵌入壳与只读投影。**

## 2. 目标形态

```
LinX app                                xpod
┌─────────────────────────┐             ┌──────────────────────────────┐
│ ai-connections applet    │  npm 包     │ @undefineds.co/ai-connection │
│ （壳 + WebExtensionHost）│ ──────────▶ │  （功能并集 + LinX 视觉）      │
│  - 原生 mount applet slot │  Solid     │  - connect/quota/keys/client │
│  - 只读投影（contacts 用）│ authFetch─▶ │  - 模型 CRUD（新增，自 LinX）  │
└─────────────────────────┘  跨域 API    │  （dashboard 同样 host 它）   │
                                        └──────────────────────────────┘
```

### 2.1 集成方式：native host（唯一路径）

**LinX 作为 extension-sdk host 原生运行 applet**：`@undefineds.co/ai-connections` 本就是可发布 npm 包（applet 组件 + 类型化 client + host 契约），LinX 实现 `WebExtensionHost`（参照 `xpod/ui/src/extensions/ai-connections-host.ts`），把 applet 的 list/main slot 直接 mount 进 LinX 自己的 applet 双栏壳。

- **零 iframe、零第二次 OIDC**：applet client 用 LinX 已有 Solid 会话的 authFetch 调 xpod 管理 API；视觉天然统一（跑在 LinX 壳内）；登录由 LinX 自己的登录弹窗承载，xpod 的 issuer 输入视图不出现
- **可行性已实测**（2026-08-05，`tests/e2e/specs/applet-native-host-auth.spec.ts`）：LinX origin 跨域 DPoP authFetch 调 `/api/ai/connections/providers`、`/api/applets/service-access/ai-connections`、`/api/ai/client-configuration/capability`、`/v1/models` 全部 200，CORS 无拦截。已知缺口：`/api/ai/gateway/keys` 在 0.3.71 seeded 包 404（xpod 源码侧确认注册）
- 前置任务（全是任务，非风险）：`@undefineds.co/ai-connections` 发 npm、LinX host 契约实现、xpod 版本对齐

**iframe 嵌入路径已废弃**（2026-08-06 拍板）：native host 不存在实质失败模式，iframe 反而要额外付 embed 模式、自动登录与视觉接缝成本。xpod dashboard 宿主保留（同一 applet 的另一宿主，是服务器管理面，不是降级方案）。SSO 实测结论仍有效并保留 e2e（`applet-sso-embed.spec.ts`）作为协议行为回归。

### 2.2 功能并集（xpod applet 侧补齐清单）

从 LinX `ai-connections` 搬入 applet（视觉按 LinX 现行）：

| 功能 | 来源 | 落点 |
| --- | --- | --- |
| 13 家 provider 目录（含 docs/apiKey URL、placeholder、默认模型） | LinX `domain/provider-catalog.ts` | 先收敛进 `@undefineds.co/models` 单一目录（§4 step 0），applet 消费 |
| 模型列表：搜索、能力图标、复制 ID | LinX detail view | applet 新增模型区（只读版先上） |
| 模型 CRUD（添加/编辑/删除，ModelEditorDialog） | LinX `ModelEditorDialog` | applet 写路径走 xpod API（**新增** model 写路由）或 Pod-direct 读侧投影+服务端写——spec 落地时定 |
| "验证"按钮（连通性 + 模型发现） | LinX `model-fetcher` | 改走 xpod 服务端（避免浏览器直连 CORS 暴露），复用 quota refresh 通道 |
applet 独有保留：connect 流程、配额卡、网关 Key 管理、编码客户端配置。

LinX 侧删除：`modules/ai-connections/ui/`、`features/`、`data/collections.ts` 的写路径、`ModelEditorDialog`、provider 目录副本。

### 2.3 LinX 侧保留的只读投影

- `contacts` 详情读 `useAiConnections().providers`（显示 agent provider）——改为轻量只读 hook（`aiProviderResource` 集合 + catalog 投影），不依赖被删的 UI 模块
- `initializeModelCollections`（bootstrap）只保留 provider/model/credential 的**只读**集合（订阅照旧走 lease 体系）
- chat 推理读凭据现状**不动**（chatkit 迁移另立项；明文凭据在迁移前仍是事实通路，applet 写入的加密凭据与 LinX 明文并存的冲突期在产品上接受——两端写同一 `credentialResource` 不同字段，读侧各自取自己能解的）

## 3. 视觉对齐方案

**总原则：LinX 的皮 + xpod 的骨，逐点取舍、谁好用谁**（2026-08-05 与用户逐条确认）。token 已完全同源（linked-data taro，`shared-ui/theme.css` 已补齐 LinX 的 `--layout-*`/`--purple-*`，8 个组件原语已移植进 shared-ui）。

| 交互点 | 采用方 | 说明 |
| --- | --- | --- |
| 列表行：真 Avatar、选中 3px 左竖线、键盘导航（listbox 语义） | LinX | 视觉成熟度 |
| 列表状态：五态文字标签（未设置/已配置/已连接/需处理/读取中） | **xpod** | 信息量高于 LinX 单圆点；圆点与标签共存 |
| 详情头部：Avatar+名称+描述 tooltip+主页链接 | LinX | 呈现层 |
| 启用/连接操作：按钮流（连接/重连/断开） | **xpod** | 连接状态机是核心语义，不简化成 Switch |
| Base URL | **xpod**：选填，默认折叠不展示（目录提供默认值） | LinX 的显眼必填表单不采用 |
| API Key 输入：attempt 门控（点"配置"才出现） | **xpod** | 安全门控保留；输入框本身按 LinX 密码框+显隐眼睛样式 |
| "验证"按钮 | LinX | 但改走 xpod 服务端通道，不浏览器直连 |
| 模型区：搜索+能力图标+复制 ID（+CRUD 待服务端写路由） | LinX | 只读列表先行 |
| 配额卡 / 网关 Key / 编码客户端配置 | **xpod** 独有 | LinX 无对应物 |
| 中文文案与 toast 语义 | LinX | 文案风格基准 |

**落地形态**：applet 组件（`AiConnectionsList`/`AiProviderCard`/`AiConnectionsPanel`）按上表重排呈现层，状态机与服务端交互不变。。

## 4. 落地步骤

0. **provider 目录收敛**（models 仓，2026-08-06 瘦身定稿）：
   - **Schema 先行**：以 models 包 `aiProvider`/`aiModel` RDF schema 为单一 schema，TS 类型对齐，能力词表采用 models.dev 命名（`image`/`tool_call`/`reasoning`，`web` 为自有扩展）
   - **三层目录**：全局层 = models.dev vendor（api.json → provider id 映射 → 覆盖层合并 apiKeyUrl/connect 模式/baseUrl 校正 → 纯 JSON 数据文件，直接 import，**不做 DiscoveryService 封装**；discovery 模块等服务化需求再启用）；Pod 层 = 用户自定义供应商/模型（企业网关、自部署、长尾），UI 手填或用户 AI 代查代写（标准 Solid 写 Pod，凭据流向是用户显式授权，无需组织级 safeBaseUrls 审查，但服务端须限定 Pod 定义供应商仅该用户凭据可发往）；消费侧直接读两层，合并逻辑为普通函数
   - **维护循环**：CI 周跑 vendor 脚本有 diff 自动开 PR → AI 预审查（新模型标注合理性、删除/改名 breaking、覆盖层过期巡检）写结论 → 人合并发版；**提交前门禁** = catalog schema 校验 + provider id 映射完整性 + vendor 产物新鲜度
   - **新供应商接入**：通用 OpenAI 兼容路径（connect/发现/runtime）配置化零代码；quota adapter 是唯一定制点且可降级 unsupported；safeBaseUrls 与 client 联合类型/UI avatar 仍需代码 + 人审
   - **延后**：第一方更新通道（自建域名托管目录快照、xpod server 后台拉取 + vendor 兜底 + opt-out）——等不更新用户的新鲜度问题被证实再建；新模型已由实时发现兜底
1. **xpod applet 视觉对齐**（xpod 仓）：theme.css token 对齐 LinX；shared-ui 补组件原语；列表/详情交互按 LinX 改版
2. **xpod applet 功能补齐**（已全部落地 2026-08-06）：~~模型区（只读）~~ → ~~验证按钮服务端化~~（`POST .../models/refresh` + 验证按钮，凭据走 vault、错误映射 LinX 文案）→ ~~模型 CRUD~~（`POST/DELETE .../providers/:provider/models`，存 `metadata.customModels` 独立于路由白名单，路由与 /v1/models 无条件并集；编辑器走 shared-ui Dialog，能力图标读数据不再正则猜测）
3. **applet 发包 + LinX host**（两侧）：`@undefineds.co/ai-connections` 发 npm；LinX 实现 `WebExtensionHost` 并原生 mount（含 `/api/ai/gateway/keys` 404 缺口确认）
4. **LinX 整合**（linx 仓）：ai-connections 壳切换为原生 host 渲染 applet；导航/布局配置保留；删旧 UI 与写路径；contacts 只读投影切换
5. **清理**：models 目录旧副本删除、文档更新、e2e（native host smoke：ai-connections 路由渲出 applet 且 connect 流程跑通）

## 5. 风险与回退

- ~~iframe 登录态~~：路径已废弃；Solid SSO 结论保留为协议认知
- **模型 CRUD 写路径**：applet 走服务端写意味着 xpod 需新增 model 写路由（此前模型资源只由客户端直写 Pod）；schema 双方共用 models 包，无协议风险
- **凭据双轨冲突期**：applet 加密凭据与 LinX 明文凭据同资源并存，直到 chatkit 迁移完成；`selectAIConfigCredential` 读侧需确认不会被加密行干扰（读明文列，加密行 `apiKey` 为空即被过滤）
- **回退**：LinX 侧删除发生在 step 4，此前旧模块完好，可随时停止；xpod applet 改动全部增量

## 6. 关联

- 前置：无（step 0 可立即开始）
- 后续：chat 推理走 chatkit（解决凭据双轨）；F10/F11/F12 等水化 spec 独立
- 文档：`docs/pod-subscription-budget-design.md`（订阅体系，只读投影遵守其 lease 原则）
