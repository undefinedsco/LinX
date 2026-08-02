# Pod 单连接通知与 Collection 按需订阅设计

- Status: Proposed
- Date: 2026-08-02
- Scope: LinX Web Collections、drizzle-solid notification client、xpod notification gateway
- Prerequisite: xpod 对同一设备提供一条复用 WSS，多个逻辑 topic 不再各占一条 SSE/WSS

## 1. 决策摘要

通知链路采用两层生命周期：

1. **设备连接层**：每个已登录设备、Pod endpoint 和用户身份最多维持一条 WSS。
2. **逻辑订阅层**：Collection 只在存在活跃查询消费者时注册 topic；多个消费者共享同一个 topic 注册。

WSS 只负责传递“某资源可能变化”的提示。GET/query 仍是数据正确性的权威来源，断线、漏事件和服务端重启不能破坏最终一致性。

这取代旧的“每个 Collection/topic 建立一条 StreamingHTTPChannel”模型。旧模型曾在应用挂载后产生数十条 HTTP/1.1 长连接，阻塞同主机的普通数据请求。此前的 bounded Collection 改动只约束本地数据驻留，不约束通知连接；两类问题必须分别处理。

## 2. 成本判断

### 2.1 结论

一台设备一条空闲 WSS 的成本可控，通常远低于每 topic 一条 SSE。真正需要约束的是：

- 同时在线设备数；
- 每设备注册的逻辑 topic 数；
- 每次资源变化的 fan-out；
- 慢客户端积压；
- 心跳、重连和身份刷新频率。

连接数本身不是本阶段的主要风险。对于本地 xpod，通常只有少量设备连接，成本近似可忽略；对于多租户 xpod Cloud，必须用运行指标做容量规划。

### 2.2 容量估算方法

以下仅用于初始预算，不作为发布承诺：

| 指标 | 初始估算 |
| --- | --- |
| 单空闲连接综合内存 | 32-128 KiB；必须在目标运行时实测，包含应用对象和实际 socket buffer |
| 心跳周期 | 30-60 秒，并在浏览器后台适当放宽 |
| 单次 ping/pong 流量 | 约 100-300 bytes，包含 WebSocket/TLS 开销后的数量级 |
| 10,000 个空闲设备 | 约 0.3-1.3 GiB 连接内存；心跳通常低于数百 KiB/s |
| 100,000 个空闲设备 | 需要连接分片、负载均衡和独立 fan-out 容量测试，不应靠线性估算直接上线 |

发布前应测量 RSS、event-loop lag、socket 数、topic membership、消息队列长度和断线重连率。不能只记录业务请求 QPS。

## 3. 架构边界

```text
Active Live Query observers
  -> CollectionSubscriptionLease
  -> LogicalSubscriptionRegistry
  -> DeviceNotificationSession (one WSS)
  -> xpod notification gateway
  -> Pod resource changes

Notification event
  -> coalesced query invalidation / exact-row refresh
  -> bounded Collection reconciliation
  -> Live Query render
```

### 3.1 DeviceNotificationSession

按 `(podEndpoint, webId, deviceSessionId)` 唯一持有连接：

```ts
interface DeviceNotificationSession {
  state: 'idle' | 'connecting' | 'connected' | 'recovering' | 'offline'
  register(topic: string): Promise<void>
  unregister(topic: string): Promise<void>
  close(): Promise<void>
  onEvent(listener: (event: NotificationEnvelope) => void): () => void
}
```

约束：

- 同一设备内的业务模块不得直接创建 WebSocket。
- 登录身份或 Pod endpoint 变化时关闭旧 session，再创建新 session。
- access token 不进入 WSS URL；连接或注册动作必须走可轮换的认证上下文。
- 桌面端由主进程或共享 runtime 持有连接。Web 多标签页优先使用 SharedWorker；不支持时通过 BroadcastChannel 选举一个连接 owner。
- owner 崩溃后其他标签页应在随机退避后重新选举，避免同时重连。

### 3.2 LogicalSubscriptionRegistry

Registry 管理逻辑 topic，不管理第二条物理连接：

```ts
interface SubscriptionLease {
  release(): void
}

interface LogicalSubscriptionRegistry {
  acquire(input: {
    topic: string
    owner: string
    priority: 'foreground' | 'indicator' | 'background'
  }): Promise<SubscriptionLease>
}
```

语义：

- 同一 topic 多次 acquire 只向 WSS 注册一次。
- 最后一个 lease 释放后才 unregister。
- `release` 幂等，React Strict Mode 重挂载不能产生重复注册。
- topic 数使用软预算和告警，不静默 LRU 驱逐正在展示的数据。
- 服务端拒绝 topic 或连接不可用时，调用方进入 revalidation 模式。

### 3.3 CollectionSubscriptionLease

订阅生命周期绑定活跃查询，而不是应用启动或模块代码被 import：

- 第一个 Live Query observer 出现时 acquire。
- 最后一个 observer 消失后进入短暂 grace period，再 release，避免快速路由切换抖动。
- 一个页面中的多个组件查询同一 Collection 时共享 lease。
- 分页、搜索等独立查询只有在需要不同 topic 时才增加注册。
- Collection 继续使用 bounded working set；通知事件只更新活跃窗口或触发合并后的 refetch。

`PodCollectionsBootstrap` 只负责 database/session 初始化与 DeviceNotificationSession 生命周期，不再全量调用 Chat、Files、Favorites、Inbox、Symphony 的 `subscribeToPod()`。

### 3.4 MicroAppRuntime 激活与 handoff

模块订阅所有权由壳层显式交接，不从 React 组件是否 mount 推断：

```ts
interface MicroAppRuntime {
  activate(context: {
    db: SolidDatabase
    signal: AbortSignal
  }): Promise<() => void | Promise<void>>
}
```

- 视觉 `microAppRegistry` 与数据 `microAppRuntimeRegistry` 分离，纯 UI 组件不持有 Collection 或网络连接。
- 布局切换模块或 database identity 时，先 abort 旧 activation 并调用其 release，再激活新 runtime。
- activation 异步完成前发生 handoff 时，晚到的 lease 必须立即释放。
- 没有 Pod 数据面的模块不注册 runtime；不能用空订阅伪装激活。
- runtime 只取得 Collection lease；topic 去重、ref-count 和单 WSS 复用仍由下层订阅池负责。
- Symphony 等非主导航面板也使用同一 lease API，但由自身明确的 open/close 状态激活，不进入主模块 handoff。

## 4. 事件协议

建议 envelope 至少包含：

```ts
interface NotificationEnvelope {
  eventId: string
  sequence: number
  topic: string
  object?: string
  operation: 'create' | 'update' | 'delete' | 'invalidate'
  emittedAt: string
}
```

要求：

- 同一 device session 的 `sequence` 单调递增。
- 客户端持有最后确认的 sequence，重连时提交 resume cursor。
- 服务端无法补齐断档时返回 `resync-required`，客户端只刷新当前注册 topic。
- 高频重复事件按 `(topic, object)` 合并；删除不能被后续旧 update 覆盖。
- 不把完整敏感 RDF row 广播到通知通道。事件只携带定位信息，数据通过认证 GET/query 获取。

## 5. 断线与一致性

状态机：

```text
idle -> connecting -> connected
                     |       |
                     | error | auth/session change
                     v       v
                 recovering -> closed
                     |
                     | retry exhausted / offline
                     v
                   offline
```

恢复策略：

1. 指数退避并加入 full jitter，避免 xpod 重启后的设备群重连风暴。
2. 网络恢复、窗口重新聚焦或设备唤醒时允许立即重试一次。
3. 重连成功后先 resume；无法 resume 时批量 invalidate 当前注册 topic。
4. WSS 不可用期间，foreground 查询在窗口聚焦、重新进入页面和低频定时器上 revalidate。
5. 后台 indicator 可采用较低频率 revalidate；无可见消费者的 background topic 不轮询。

因此实时通知失效只增加陈旧时间，不会让本地状态永久错误。

## 6. 背压与服务端路由

xpod 为每条设备连接维护一个有界发送队列：

- 队列按 topic/object 合并 invalidate 类事件。
- 超过上限时丢弃中间事件并发送一个 `resync-required`，不能无限增长。
- 写入速度持续低于事件速度的连接应被关闭，让客户端通过 resume/resync 恢复。
- topic membership 建立 `topic -> connectionId` 倒排索引，资源变化的路由成本与命中的设备数相关，而不是与所有在线设备数相关。
- 连接节点和事件生产节点分离时，使用 Redis Streams、NATS 或等价有界总线；总线不是 Pod 数据权威源。

## 7. 迁移顺序

1. 固化“一设备一 WSS”契约测试：同一设备注册 36 个 topic，服务端和浏览器均只有一条物理连接。
2. 为 DeviceNotificationSession 增加身份切换、标签页 owner、重连、resume 和 resync 测试。
3. 实现 LogicalSubscriptionRegistry 的引用计数和 Strict Mode 回归测试。
4. 将 Collection observer 生命周期接到 registry；先迁移 Favorites 和 Inbox，再迁移 Contacts、Files、Symphony，最后处理 Chat。
5. 删除 `PodCollectionsBootstrap` 中业务集合的全量订阅。
6. 删除 HTTP Pod 的特殊“全部禁用通知”分支，统一走 WSS，失败时走 revalidation。
7. 在真实私有 xpod 上执行双客户端写入、断线、睡眠唤醒、身份切换和高事件速率验证。

## 8. 验收标准

### 客户端

- 一个设备同时打开 12 个模块、注册至少 36 个 topic，CDP 观察到的 notification WSS 数量始终为 1。
- 20 个消费者观察同一 Collection，只产生一个逻辑 topic 注册。
- 离开最后一个消费者后，grace period 结束即 unregister。
- React Strict Mode 重挂载不重复注册、不提前释放。
- 登录身份切换后旧连接和旧 topic 全部释放。
- 断网恢复后不重载应用即可恢复实时更新。
- resume 失败会重新查询活跃 topic，且不会全 Pod 水化。

### xpod

- 10,000 条空闲 WSS 的 RSS、CPU、event-loop lag 和心跳带宽有可复现 benchmark。
- 单设备注册 1、10、100 个 topic 时，物理连接数不变。
- 慢客户端不会造成无界内存增长。
- 10,000 个设备同时重连时，jitter 能把峰值摊平且服务恢复。
- topic 取消注册和连接关闭后，服务端索引无残留 membership。

### Collection 正确性

- create/update/delete 能正确维护活跃排序窗口。
- 通知乱序、重复和丢失后，GET/query revalidation 能恢复正确结果。
- optimistic rollback 不受通知回流影响，不出现重复 row。
- 无活跃消费者的 Collection 不常驻数据，也不保留逻辑 topic。

## 9. 可观测性

客户端指标：

- `notification_socket_count`
- `notification_session_state`
- `notification_topic_count`
- `notification_reconnect_total`
- `notification_resume_failure_total`
- `notification_resync_total`
- `collection_active_lease_count`
- `collection_revalidation_total`

xpod 指标：

- `ws_connections_current`
- `ws_connections_by_node`
- `ws_topic_memberships_current`
- `ws_send_queue_depth`
- `ws_slow_consumer_disconnect_total`
- `ws_resume_success_total`
- `ws_resync_required_total`
- `ws_fanout_delivery_total`

日志不得包含 access token、完整私有 RDF 内容或未经脱敏的认证 header。

## 10. 非目标

- 不把完整 Pod 数据复制进通知服务。
- 不用通知替代 GET/query。
- 不在 UI 组件中直接操作 WebSocket。
- 不为每个 Collection 建立独立物理连接。
- 不用无界离线消息队列保证永久通知历史；超过可恢复窗口时明确 resync。

## 11. 剩余风险

- 浏览器多标签页无法使用 SharedWorker 时，owner 选举在崩溃边界可能短暂出现两条连接，服务端应使用 device/session generation 淘汰旧连接。
- 移动端后台会冻结心跳，服务端和客户端都必须把睡眠恢复当作正常重连，而非异常账号状态。
- 单连接减少了连接成本，但若所有模块仍永久注册 topic，服务端 membership 和 fan-out 仍会增长，因此 Collection 按需 lease 仍是必要工作。
- 一条连接成为设备级故障域，必须通过 resume/resync 保证恢复，而不是靠额外并行连接兜底。
