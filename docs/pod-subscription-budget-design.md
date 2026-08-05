# Pod 订阅预算与按需化设计

- Status: **已落地（架构演进后修订版）**（2026-08-05）
- 原始 Proposal（2026-08-02）基于"每 topic 一条 SSE channel"的假设；drizzle-solid 0.3.20 的 multiplex 客户端使该假设失效，方案随之简化。本文档记录最终落地的形态。

## 1. 最终架构（与原方案的差异）

原方案的三个核心机制，两个以更好的形式落地，一个被证伪：

| 原方案 | 实际落地 |
| --- | --- |
| 中央 PodSubscriptionManager + 引用计数 | **已存在**：`@linx/stores/collection-subscription-lease`（refcount + 250ms grace）+ 单活跃 micro-app 协调器（activate/deactivate + AbortSignal），见 `micro-app-runtime.ts`、`use-pod-collection-subscription.ts` |
| 预算 + 分级顶出 | **不需要**：multiplex 后所有 topic 共享一条 WS，物理连接数与订阅数解耦；仅保留 dev-only 逻辑订阅高水位 warn（`use-pod-collection-subscription.ts`，阈值 12） |
| http SSE 预算 2~3 | **证伪**：SSE 挤占 Chromium 每主机 6 连接池，任何 SSE 预算都会阻塞数据请求。改为：xpod descriptor → multiplex WS；无 descriptor 的 plain-HTTP → WS-first 偏好；https → SSE-first 维持 |

## 2. multiplex 通知链路（关键发现）

drizzle-solid 0.3.20 的 `NotificationsClient.subscribe`：

1. HEAD 资源做 discovery：读 `X-Xpod-Notifications` header 或 `Link: <...>; rel="urn:xpod:notifications:v1"`
2. 发现 descriptor → `MultiplexNotificationsClient`，按 (webId, sessionId, origin) 共享**一条 WebSocket**（`ws://…/v1/notifications/ws`，ticket 认证，`register/unregister` 帧管理 topic）
3. 未发现 → 按 `preferredChannels` 回退（SSE/WS per topic）

xpod 服务端设施（`DeviceNotificationRuntime`：ticket 颁发 + WS server + hub + resource listener）本已就绪，但**gateway 既不广播 descriptor 也不路由 WS 升级**——已补（xpod `17653f96`）：

- CSS 响应注入 `Link: </v1/notifications/ws>; rel="urn:xpod:notifications:v1"`（GET/HEAD，append 不覆盖）
- `/v1/notifications/ws` upgrade 路由到 API server
- 集成测试 `tests/gateway/notification-multiplex.test.ts` 覆盖全链路

## 3. 落地清单

| 项 | 位置 | 提交 |
| --- | --- | --- |
| BlockNote tiptap 去重 + whiteboard snapshot 保留 + e2e 对齐 | linx-files | `839da346` |
| xpod gateway descriptor 广播 + WS 路由 | xpod | `17653f96` |
| plain-HTTP WS-first 偏好（创建时 + init 后补写） | `linx-solid-database.ts` | `b18f3f08` |
| inbox 铃铛 pinned 常驻订阅（共享 lease，与 runtime 激活去重） | `pod-collections-bootstrap.tsx`、`inbox/runtime.ts` | `d248acf7` |
| dev-only 逻辑订阅预算 warn（12） | `use-pod-collection-subscription.ts` | `d248acf7` |
| Files runtime 归入 data 层（架构边界测试修复） | `files/data/runtime.ts` | `13a2522d` |
| e2e  seeded xpod models 版本分裂（app 0.2.45 / xpod 0.2.48） | package.json resolutions | `6e887313` |

## 4. 待办

- **CDP 实测**：multiplex 端到端（挂起连接中 SSE=0、WS=1）需等包含 `17653f96` 的 xpod 发布（>0.3.71），重跑 files visual audit 时用 CDP `Network.requestWillBeSent` 盘点
- **云端验证**：云端 https 部署的 descriptor 广播路径（cloud 模式 ingress 是否经 GatewayProxy）需在下次云端部署后确认；云端 wss 失败的历史记录针对旧部署，multiplex 路径未验证
- **非目标维持**：不改 drizzle-solid 的 per-topic 回退模型；不改集合读路径

## 5. 回退

- app 侧：三个 commit 各自独立可 revert；WS-first 偏好回退即恢复 SSE-first
- xpod 侧：gateway 补丁是纯增量（注入 header + 路由规则），revert `17653f96` 即回到 SSE 模式，客户端自动回退
