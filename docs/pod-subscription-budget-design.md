# Pod 订阅预算与按需化设计

- Status: **已落地（原生协议版）**（2026-08-05）
- **硬约束（钉死，任何后续方案不得违反）**：浏览器侧关键特性（实时同步、离线水化等）一律由**标准 Solid 协议**承载，不另行发明私有 wire format。协议级优化必须在标准语义内做（topic 拓扑、传输分档、水化策略）；xpod multiplex（`xpod.notifications.v1`）正是因此被否决——它是为了绕开优化工作而新造的协议。
- 原始 Proposal（2026-08-02）基于"每 topic 一条 SSE channel"；后经 multiplex 私有协议绕行，最终被"原生协议三杠杆"取代。本文档记录最终形态。

## 0. 为什么否决 multiplex（私有协议）

1. 原则问题：浏览器实时同步是关键特性，必须由标准 Solid 协议承载；`xpod.notifications.v1` 只有 drizzle-solid ≥0.3.20 懂，是为绕开优化工作另造的协议
2. 其实现也不成立：事件扇入依赖 `ObservableResourceStore.addGlobalListener`——进程内静态注册表，hub 在 API 子进程，CSS 子进程的用户数据变更**根本流不过去**（跨进程缺口），订阅会静默无实时
3. 补齐该缺口需要在 CSS 进程与 API 进程之间再造一条事件通道，复杂度远超收益

## 1. 最终架构：原生协议三杠杆

病根是"细粒度 topic × HTTP/1.1 连接池"，不是标准协议本身。

### 杠杆 1：topic 拓扑收敛（订阅面最小化）

- **订阅原则**：谁活跃（可见/可交互）且需要实时合并，谁订阅；历史/只读数据走 revalidation。唯一后台例外是 pinned inbox（导航徽标）
- 单活跃 micro-app 协调器：activate 订阅 / deactivate 释放（`micro-app-runtime.ts`）
- 引用计数 lease 去重（`@linx/stores/collection-subscription-lease`，250ms grace）
- **订阅跟着数据走**：跨模块渲染共享数据时，消费方通过共享 lease 引用（同一函数引用）acquire 属主模块的订阅——已落地两处：files 详情页 → favorites 星标、chat 选择器 → contacts agents（`agentCollection` 此前无人订阅，已并入 `contactOps.subscribeToPod`）
- 典型稳态 topic 数 1~4（+pinned inbox 4）；symphony 面板打开时 +6 属正常——面板打开即活跃场景（观看运行中的 workflow 正是需要实时的面）

### 杠杆 2：传输按 URL scheme 分档（全标准）

- `https:`（h2）：原生 SSE——h2 传输层多路复用，N 条 SSE 共享 1 条 TCP
- `http:`（HTTP/1.1 本地）：原生 **WebSocketChannel2023**——升级后的 socket 不占 Chromium 每主机 6 连接池（浏览器硬上限，HTTP/1.1 持久连接每 host:port 仅 6 条，SSE 长连接会占死）
- 实现：`linx-solid-database.ts` 创建时按 podUrl scheme 选 `preferredChannels`，podUrl 创建时未知则 init 后按 dialect 实际值改写（NotificationsClient 懒创建，届时读配置）
- **标准协议内 channel 无法合并**：channel = 单 topic；粗粒度（父容器）订阅只冒泡 Create/Delete，成员 Update 不冒泡（CSS `DataAccessorBasedStore` 实证），父容器订阅会丢更新。降 channel 只能靠砍订阅面，不能靠合流

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
| 跨模块订阅跟数据走（files→favorites、chat→agents，agents 纳入 contacts 订阅） | 各 runtime + 消费 hook | `2105543e` |
| Files runtime 归入 data 层 | `files/data/runtime.ts` | `13a2522d` |
| e2e seeded xpod models 版本分裂 | package.json | `6e887313` |
| ~~xpod gateway descriptor 广播~~ **已 revert**：关键特性走原生协议的原则确立后，multiplex 路径不再向浏览器开放 | xpod | `17653f96` → `04a1ea8e` |

## 3. 乐观更新 + 水化审计（2026-08-05 专项）

对 `packages/stores/src/pod-collection.ts` 的专项审计发现 18 项，已修 7 项，其余按架构量级推迟。

### 已修（`cf06ed6d`、`01b385f8`）

| 问题 | 修法 |
| --- | --- |
| 写入已持久化但 backfill 查询失败 → 乐观事务回滚 → 已写入行消失/已删行复活 | reconcile 隔离 try/catch，失败回退 `{ refetch: true }` |
| 每次写/远程事件 backfill 拉 101 行（3 次往返）只用 1 行 | 按需 fetch（通常 1~2 行一次往返）；更新行仍在窗口底之上时整个跳过 |
| 窗口外插入的行提交后从 UI 消失 | 本地插入无条件 upsert 进集合状态 |
| 非窗口集合的 IRI 删除 → 整表 refetch；删除风暴无去重 | 从内存集合状态解析 key 点删；窗口外 IRI 删除忽略；兜底走去重失效 |
| thread/message 失效键 `['chats',id,'threads']` 永远匹配不到集合键 → 写后兜底失效是死的 | 指向真实集合键 `['threads']`/`['messages']` |
| db 未就绪时集合缓存空列表 5 分钟，登录后仅 `['chats']` 被失效 | db 就绪时全量失效（`01b385f8`） |

### 推迟（架构级，各有独立 spec）

| 问题 | Spec | 建议顺序 |
| --- | --- | --- |
| F17：Pod 不可达时部分集合 hook 把真实错误覆盖成 `null`，UI 误显示空态 | `docs/design/collection-error-surface.md` | 1（先让后续 revalidate 失败可观察） |
| F9：任何整表 refetch 会把多页驻留窗口塌缩回第 1 页 | `docs/design/collection-refetch-window-preservation.md` | 2（先稳定窗口与快照语义） |
| F11：`hydrateChatRows` 每个 chat 行一次 GET（N+1），且 `createAIChat` 后全量重复 | `docs/design/chat-hydration-dedup.md` | 3（独立于 thread/message，可先降低请求数） |
| F10：thread/message 集合无窗口无过滤，首次使用全表扫描 Pod（聊天冷启动主成本） | `docs/design/chat-thread-message-parameterized-collections.md` | 4（参数化 SELECT；订阅继续按 resource 共享） |
| F12：无本地快照持久化，每次冷启动全量网络拉取 | `docs/design/collection-local-snapshot-persistence.md` | 5（最后持久化已稳定的 query key、窗口和错误语义） |

## 4. 待办

- **CDP 实测（原生路径）**：本地 HTTP/1.1 下挂起连接盘点——预期 `/.notifications/StreamingHTTPChannel2023/` = 0、`/.notifications/WebSocketChannel2023/` ≤ 活跃 topic 数且不阻塞数据请求；重跑 files visual audit 时用 CDP `Network.requestWillBeSent` 验证
- **水化增强**：按 §3 的依赖顺序推进 F17 → F9 → F11 → F10 → F12
- ~~topic 合并~~ **已证伪**：标准协议单 topic/channel，父容器不冒泡 Update，无合规合流手段；降 channel 只能砍订阅面（已完成）
- **非目标维持**：不改 drizzle-solid 的通道模型；不改集合读路径；不引入私有通知协议

## 4. 回退

- app 侧：各 commit 独立可 revert；WS-first 偏好回退即恢复 SSE-first
- xpod 侧：`04a1ea8e` 已撤销 Link 注入；`/v1/notifications/ws` 升级路由保留（DeviceNotificationRuntime 供设备通知网关使用，与浏览器 live query 无关）
