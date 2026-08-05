# Pod 订阅预算与按需化设计

- Status: **已落地（原生协议版）**（2026-08-05）
- **硬约束（钉死，任何后续方案不得违反）**：浏览器与 Pod 之间只使用**标准 Solid 通知协议**（StreamingHTTPChannel2023 / WebSocketChannel2023），不依赖任何私有 wire format；xpod multiplex（`xpod.notifications.v1`）方案已否决，descriptor 不得向浏览器客户端广播。
- 原始 Proposal（2026-08-02）基于"每 topic 一条 SSE channel"；后经 multiplex 私有协议绕行，最终被"原生协议三杠杆"取代。本文档记录最终形态。

## 0. 为什么否决 multiplex（私有协议）

1. `xpod.notifications.v1` 是私有 wire format，只有 drizzle-solid ≥0.3.20 懂，违背 Solid 互操作目标
2. 其事件扇入依赖 `ObservableResourceStore.addGlobalListener`——进程内静态注册表，hub 在 API 子进程，CSS 子进程的用户数据变更**根本流不过去**（跨进程缺口），订阅会静默无实时
3. 补齐该缺口需要在 CSS 进程与 API 进程之间再造一条事件通道，复杂度远超收益

## 1. 最终架构：原生协议三杠杆

病根是"细粒度 topic × HTTP/1.1 连接池"，不是标准协议本身。

### 杠杆 1：topic 拓扑收敛（订阅面最小化）

- 单活跃 micro-app 协调器：activate 订阅 / deactivate 释放（`micro-app-runtime.ts`）
- 引用计数 lease 去重（`@linx/stores/collection-subscription-lease`，250ms grace）
- 全局 pinned 仅 inbox（导航铃铛），典型稳态 topic 数 1~4
- 后续可再收：CSS 事件向父容器冒泡，数据布局合并后 pinned 可降为 1 条

### 杠杆 2：传输按 URL scheme 分档（全标准）

- `https:`（h2）：原生 SSE——h2 传输层多路复用，N 条 SSE 共享 1 条 TCP
- `http:`（HTTP/1.1 本地）：原生 **WebSocketChannel2023**——升级后的 socket 不占 Chromium 每主机 6 连接池
- 实现：`linx-solid-database.ts` 创建时按 podUrl scheme 选 `preferredChannels`，podUrl 创建时未知则 init 后按 dialect 实际值改写（NotificationsClient 懒创建，届时读配置）

### 杠杆 3：本地优先水化（降低实时依赖）

- 正确性永远来自 GET/查询路径（ETag 条件请求），通知只是缩短过期时间的提示
- 集合快照持久化（IndexedDB）→ 启动秒渲染——**待做**
- 聚焦/进入页面 revalidate；后台徽标可降为低频条件 GET——**待评估**

## 2. 落地清单

| 项 | 位置 | 提交 |
| --- | --- | --- |
| BlockNote tiptap 去重 + whiteboard snapshot 保留 + e2e 对齐 | linx-files | `839da346` |
| plain-HTTP WS-first 偏好（创建时 + init 后补写） | `linx-solid-database.ts` | `b18f3f08` |
| inbox 铃铛 pinned 常驻订阅（共享 lease） | `pod-collections-bootstrap.tsx`、`inbox/runtime.ts` | `d248acf7` |
| dev-only 逻辑订阅预算 warn（12） | `use-pod-collection-subscription.ts` | `d248acf7` |
| Files runtime 归入 data 层 | `files/data/runtime.ts` | `13a2522d` |
| e2e seeded xpod models 版本分裂 | package.json | `6e887313` |
| ~~xpod gateway descriptor 广播~~ **已 revert**：私有协议否决后 descriptor 不得广播 | xpod | `17653f96` → revert |

## 3. 待办

- **CDP 实测（原生路径）**：本地 HTTP/1.1 下挂起连接盘点——预期 `/.notifications/StreamingHTTPChannel2023/` = 0、`/.notifications/WebSocketChannel2023/` ≤ 活跃 topic 数且不阻塞数据请求；重跑 files visual audit 时用 CDP `Network.requestWillBeSent` 验证
- **水化增强**（杠杆 3 待做项）：集合快照 IndexedDB 持久化、聚焦 revalidate、后台徽标低频条件 GET 的取舍
- **topic 合并**（杠杆 1 待做项）：inbox 数据布局合并到单容器，pinned 4 → 1
- **非目标维持**：不改 drizzle-solid 的通道模型；不改集合读路径；不引入私有通知协议

## 4. 回退

- app 侧：各 commit 独立可 revert；WS-first 偏好回退即恢复 SSE-first
- xpod 侧：`17653f96` 的 Link 注入已 revert；`/v1/notifications/ws` 升级路由保留（DeviceNotificationRuntime 供设备通知网关使用，与浏览器 live query 无关）

