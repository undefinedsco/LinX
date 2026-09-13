# Xpod AI Connections 一次性迁移计划

## Goal

LinX 直接注册最新已发布的 `@undefineds.co/ai-connections@0.1.0-rc.0` Applet/Controller。Xpod 成为模型供应商、凭据、模型、配额和网关密钥的唯一管理实现；LinX 仅保留导航入口、Applet Host 和聊天侧只读模型目录。

历史 LinX 模型管理数据与兼容代码不迁移、不保留。

## Decisions

- 一次性替换并删除 LinX 旧模型管理实现，不采用双轨过渡。
- 使用 Xpod `aiConnectionApplet` 的双栏 slots，不在 LinX 页面内嵌套完整 Panel。
- 聊天、联系人和新建聊天共用一个 Xpod 只读模型目录适配器；禁止在该适配器中实现写操作。
- Node 开发、主 CI、Docker 与发布构建统一为 Node 22 LTS；Node 24/25 仅作为非阻塞兼容性矩阵。
- 公共包使用精确版本，升级必须通过依赖更新提交和完整验收。

## What already exists

- Xpod 已发布 Applet、Controller、列表、详情、模型编辑、凭据池、配额和 Gateway Key UI，全部复用。
- Xpod `createAiConnectionsClient()` 已提供供应商、模型、凭据和网关 API，全部复用。
- LinX `micro-app-registry.tsx` 已有双栏微应用容器，保留并接入 Xpod slots。
- ChatHeader、AddChatDialog 和联系人已消费统一 `useModelServices`，把该入口收缩为只读 Xpod 目录，避免修改三个消费者的业务接口。
- LinX 的 Pod collections、provider catalog、editor、model fetcher 和管理 controller 属于重复实现，删除。

## Architecture

```text
用户进入 /model-services
        |
        v
LinX micro-app host
        |
        v
Xpod aiConnectionApplet / Controller
   |          |             |
   v          v             v
providers  credentials    models/quota/keys
   \          |             /
    +---- Xpod /api/ai/** --+
                 |
                 v
              用户 Pod

Chat / Contacts / Add Chat
        |
        v
LinX read-only model catalog
        |
        v
Xpod client.listProviders + listModels
```

管理写入只有一条路径：Xpod Applet → Xpod API → Pod。LinX 只读目录不得绕过 Xpod API 写资源。

## Implementation order

1. 修复上次失败安装对 lockfile 造成的机械变化，并在 Node 22 下执行 frozen 基线安装。
2. 精确安装 `@undefineds.co/ai-connections@0.1.0-rc.0`，验证实际 npm artifact 的 exports，禁止引用相邻 Xpod 源码。
3. 新增 LinX Applet Host，向 Xpod Client 注入当前 `webId`、Pod URL 和 authenticated fetch。
4. 在 `micro-app-registry.tsx` 用 Xpod Applet slots 替换 LinX ModelServices list/content/layout bridge。
5. 将 `useModelServices` 收缩为只读目录：加载、错误、刷新、供应商/模型投影；无 credential/model mutation。
6. 更新 ChatHeader、AddChatDialog、联系人和聊天 runtime 的类型映射，模型能力完全采用 Xpod 返回值。
7. 删除 LinX 重复实现及对应旧测试：provider catalog、Pod model collections、model fetcher、editor、detail/list controllers、views和 store。
8. 删除 model collections bootstrap；清理无引用 exports、依赖和样式。
9. 完成单元、集成、浏览器、Docker 和广州前验收。

## Failure handling

- 公共包加载失败：模型管理路由显示可重试错误，不回退旧页面。
- Xpod 未连接或会话过期：Applet 显示 Xpod 标准错误，LinX 不伪造空配置。
- 模型目录请求失败：聊天保留当前选择但禁止发起不可解析的新请求，用户可刷新目录。
- 空模型目录：显示明确空状态，不自动创建默认模型或旧凭据。
- 公共包升级破坏契约：精确版本和 contract test 阻止发布。
- 双击、快速切换供应商和离开页面：由 Xpod Controller 生命周期处理，LinX Host 卸载后不得继续更新状态。

## Deletion boundary

删除 `apps/web/src/modules/model-services` 下所有管理实现，仅保留：

- Xpod Applet Host/route adapter
- 只读 model catalog hook 与类型投影
- 面向 LinX 消费者的最小 exports
- 新 contract/smoke tests

保留聊天 runtime 路由、当前会话选择、消息能力校验，以及其他模块仍使用的已发布 `@undefineds.co/models` 类型。

## Test coverage

```text
Xpod package boundary
├── [UNIT] npm exports / Applet slots / client factory
├── [UNIT] authenticated session, missing session, expired session
└── [UNIT] providers + models: success, empty, malformed, timeout, 401, 500

/model-services user flow                                      [→E2E]
├── load route → Xpod list + detail
├── add custom provider → save credential → verify
├── add/edit/delete model → refresh → reload
├── enable/disable provider → selection updates
├── rapid submit / navigate away / reconnect
└── quota and gateway-key operations

Chat consumers
├── [UNIT] one shared request for ChatHeader/AddChat/Contacts
├── [UNIT] capability projection and empty/error states
├── [CRITICAL REGRESSION] Xpod-created model appears after refresh
├── [CRITICAL REGRESSION] selected text model sends text without image gate
└── [→E2E] select model → send real message → visible assistant response

Distribution
├── Node 22 clean install + typecheck + production build
├── isolated archive build proves published package use
├── Xpod Docker image build and local acceptance
└── Guangzhou authenticated message with browser traffic ending at Xpod
```

No LLM prompt or tool definition changes are included, so no model-quality eval is required.

## Performance

- Lazy-load the Xpod Applet only on `/model-services`.
- Scope one model-catalog query/cache per authenticated Pod session.
- Invalidate the read-only catalog after Xpod Applet mutations instead of polling.
- No provider/model N+1 calls from LinX consumers.

## NOT in scope

- Migrating or restoring LinX legacy model-management data：explicitly rejected.
- Supporting Node 25 as the primary runtime：blocked by current Solid engine contract; retained only as compatibility testing.
- Forking or copying Xpod UI source into LinX：would recreate dual ownership.
- Changing chat generation routing beyond adapting Xpod model identifiers and capabilities.
- Deploying Guangzhou before local browser and Docker acceptance passes.

## Rollback

Redeploy the previous LinX build and revert the dependency/route adapter commit. Deleted legacy configuration and code are intentionally not restored.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | Not required for ownership consolidation |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | SKIPPED | Running under Codex; nested pass disabled |
| Eng Review | `/plan-eng-review` | Architecture & tests | 1 | CLEAR | 3 decisions resolved; 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | Existing Xpod UI reused without redesign |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | Node 22 pin included in implementation |

**VERDICT:** ENG CLEARED — ready to implement

NO UNRESOLVED DECISIONS
