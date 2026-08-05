# 模型管理端合并 Spec（LinX 嵌入 xpod 页面）

- Status: Proposal（2026-08-05）
- 决策人拍板记录：
  - 管理端唯一实现 = xpod 的页面（`@undefineds.co/ai-connection` applet，挂在 dashboard `/settings/models`）
  - LinX 端**不保留** `model-services` 自实现，改为调用/嵌入 xpod 页面
  - 视觉与产品感觉**向 LinX 看齐**（LinX 是主产品面）
  - chat 推理改走 chatkit（xpod 服务端）——**另行立项，本 spec 不含**

## 1. 背景

两套模型管理产品并存：

| | LinX `model-services`（apps/web） | xpod `ai-connection`（packages/ + dashboard） |
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
│ model-services applet    │  npm 包     │ @undefineds.co/ai-connection │
│ （壳 + WebExtensionHost）│ ──────────▶ │  （功能并集 + LinX 视觉）      │
│  - 原生 mount applet slot │  Solid     │  - connect/quota/keys/client │
│  - 只读投影（contacts 用）│ authFetch─▶ │  - 模型 CRUD（新增，自 LinX）  │
└─────────────────────────┘  跨域 API    │  （dashboard 同样 host 它）   │
                                        └──────────────────────────────┘
```

### 2.1 集成方式：native host（主），iframe（降级）

**主方案——LinX 作为 extension-sdk host 原生运行 applet**：`@undefineds.co/ai-connection` 本就是可发布 npm 包（applet 组件 + 类型化 client + host 契约），LinX 实现 `WebExtensionHost`（参照 `xpod/ui/src/extensions/ai-connection-host.ts`），把 applet 的 list/main slot 直接 mount 进 LinX 自己的 applet 双栏壳。

- **零 iframe、零第二次 OIDC**：applet client 用 LinX 已有 Solid 会话的 authFetch 调 xpod 管理 API；视觉天然统一（跑在 LinX 壳内）
- **可行性已实测**（2026-08-05，`tests/e2e/specs/applet-native-host-auth.spec.ts`）：LinX origin 跨域 DPoP authFetch 调 `/api/ai/connections/providers`、`/api/applets/service-access/ai-connection`、`/api/ai/client-configuration/capability`、`/v1/models` 全部 200，CORS 无拦截。已知缺口：`/api/ai/gateway/keys` 在 0.3.71 seeded 包 404（xpod 源码侧确认注册）
- 前置：`@undefineds.co/ai-connection` 发布 npm（`private:false` 已备，尚无 README）

**降级方案——iframe 嵌 `{podOrigin}/settings/models?embed=1`**：`embed=1` 隐藏 dashboard chrome + 无会话时自动发起 login（SSO 链静默，消掉那次点击）。登录态已实测（`applet-sso-embed.spec.ts`：标签页/iframe 均免密，无 X-Frame-Options 拦截）。native host 受阻（如发包/契约缺口）时先用 iframe 交付。

### 2.2 功能并集（xpod applet 侧补齐清单）

从 LinX `model-services` 搬入 applet（视觉按 LinX 现行）：

| 功能 | 来源 | 落点 |
| --- | --- | --- |
| 13 家 provider 目录（含 docs/apiKey URL、placeholder、默认模型） | LinX `domain/provider-catalog.ts` | 先收敛进 `@undefineds.co/models` 单一目录（§4 step 0），applet 消费 |
| 模型列表：搜索、能力图标、复制 ID | LinX detail view | applet 新增模型区（只读版先上） |
| 模型 CRUD（添加/编辑/删除，ModelEditorDialog） | LinX `ModelEditorDialog` | applet 写路径走 xpod API（**新增** model 写路由）或 Pod-direct 读侧投影+服务端写——spec 落地时定 |
| "验证"按钮（连通性 + 模型发现） | LinX `model-fetcher` | 改走 xpod 服务端（避免浏览器直连 CORS 暴露），复用 quota refresh 通道 |

applet 独有保留：connect 流程、配额卡、网关 Key 管理、编码客户端配置。

LinX 侧删除：`modules/model-services/ui/`、`features/`、`data/collections.ts` 的写路径、`ModelEditorDialog`、provider 目录副本。

### 2.3 LinX 侧保留的只读投影

- `contacts` 详情读 `useModelServices().providers`（显示 agent provider）——改为轻量只读 hook（`aiProviderResource` 集合 + catalog 投影），不依赖被删的 UI 模块
- `initializeModelCollections`（bootstrap）只保留 provider/model/credential 的**只读**集合（订阅照旧走 lease 体系）
- chat 推理读凭据现状**不动**（chatkit 迁移另立项；明文凭据在迁移前仍是事实通路，applet 写入的加密凭据与 LinX 明文并存的冲突期在产品上接受——两端写同一 `credentialResource` 不同字段，读侧各自取自己能解的）

## 3. 视觉对齐方案

- token：两边已是同一套 shadcn 语义 token（`foreground/muted-foreground/border/primary`），xpod `shared-ui/theme.css` 与 LinX `apps/web` token 值对齐为同一组（以 LinX 为准，差异项逐个 diff）
- 组件：applet 继续使用 `@undefineds.co/shared-ui`，缺的组件原语（Switch/Dialog/Tooltip/Badge 变体）从 LinX `components/ui` 移植进 shared-ui（同一套 radix + tailwind 写法，机械搬运）
- 交互范式：以 LinX 双栏 applet 为准——列表栏（avatar+名称+状态点+搜索+键盘导航）、详情栏（header 开关、连接配置区、模型区）、中文文案风格、toast 语义
- iframe 接缝：applet 根背景透明/同底色，隐藏 dashboard chrome（`embed=1`），禁用 applet 内自身的页面级滚动条（滚动归 LinX 外壳）

## 4. 落地步骤

0. **provider 目录收敛**（models 仓）：13+5 并集为单一目录，UI extras（docs/apiKey URL/placeholder）作为目录字段下沉；发新版 models；xpod applet 与 LinX 只读投影都改消费它
1. **xpod applet 视觉对齐**（xpod 仓）：theme.css token 对齐 LinX；shared-ui 补组件原语；列表/详情交互按 LinX 改版
2. **xpod applet 功能补齐**：模型区（只读）→ 验证按钮服务端化 → 模型 CRUD（含 xpod 写路由）
3. **applet 发包 + LinX host**（两侧）：`@undefineds.co/ai-connection` 发 npm；LinX 实现 `WebExtensionHost` 并原生 mount（含 `/api/ai/gateway/keys` 404 缺口确认）；iframe `?embed=1` + 自动 login 作为降级路径备着
4. **LinX 整合**（linx 仓）：model-services 壳切换为原生 host 渲染 applet；导航/布局配置保留；删旧 UI 与写路径；contacts 只读投影切换
5. **清理**：models 目录旧副本删除、文档更新、e2e（嵌入 smoke：model-services 路由渲出 iframe 且 applet 加载）

## 5. 风险与回退

- **iframe 登录态**：已由 Solid SSO 覆盖（§2.1），仅需实测验证静默重定向链
- **模型 CRUD 写路径**：applet 走服务端写意味着 xpod 需新增 model 写路由（此前模型资源只由客户端直写 Pod）；schema 双方共用 models 包，无协议风险
- **凭据双轨冲突期**：applet 加密凭据与 LinX 明文凭据同资源并存，直到 chatkit 迁移完成；`selectAIConfigCredential` 读侧需确认不会被加密行干扰（读明文列，加密行 `apiKey` 为空即被过滤）
- **回退**：LinX 侧删除发生在 step 4，此前旧模块完好，可随时停止；xpod applet 改动全部增量

## 6. 关联

- 前置：无（step 0 可立即开始）
- 后续：chat 推理走 chatkit（解决凭据双轨）；F10/F11/F12 等水化 spec 独立
- 文档：`docs/pod-subscription-budget-design.md`（订阅体系，只读投影遵守其 lease 原则）
