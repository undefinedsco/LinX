# 多渠道访问设计

这份文档只定义本机、局域网、外网三种访问渠道和 same-node route 优化。它不定义登录、注册、WebID 或 `solid:storage` 语义。

权威来源：

- IDP/SP、注册、`solid:storage`、业务写入：`docs/login-identity-storage-routing-model.md`
- Local canonical URL、canonical domain 策略、tunnel：`docs/local-sp-domain-and-tunnel.md`

## 目标

Local SP 先拥有一个稳定 canonical URL，再按网络条件选择访问渠道。

- Cloud 路径开箱即用。
- Local 默认由 Cloud 分配 canonical SP URL，例如 `https://node-xxxx.undefineds.co/`。
- Local 的高级配置可使用用户自有 HTTPS origin 作为 canonical SP URL。
- `localhost`、LAN 和 tunnel 只是访问渠道，不改变 WebID、Pod URL、ACL 或 OIDC 语义。
- 后续补充 tunnel token 或可达 route 时，同一个 Local 数据目录继续使用同一个 canonical SP URL。

## 访问渠道

| 渠道 | 示例 | 作用 | 是否可写入 `solid:storage` |
| --- | --- | --- | --- |
| Canonical | `https://node-xxxx.undefineds.co/` | selected SP URL 和资源 URI 基准 | 是 |
| 本机 | `http://localhost:5737/` | 当前机器访问本地 xpod | 否，除非 Standalone 选择它作为 canonical |
| 局域网 | `http://192.168.x.x:5737/` | 同 LAN 设备访问本地 xpod | 否，除非 Standalone 显式选择它作为 canonical |
| Tunnel | Cloudflare Tunnel / 其他隧道 | 让 canonical 或 self-managed URL 到达本地 xpod | 否，tunnel 本身不是 storage 语义 |

## 本机

本机访问是本地 xpod 的默认访问渠道。

```text
LinX Desktop
  -> 启动本机 xpod
  -> http://localhost:5737/
```

要求：

- 不需要公网 IP。
- 不需要域名。
- 不需要 tunnel token。
- Standalone 可以把本机 URL 作为 canonical。
- Local 只能把本机 URL 当访问渠道，不能把它写入 Cloud WebID profile。

## 局域网

局域网访问是本地 xpod 的一种访问渠道。

```text
同一局域网设备
  -> http://192.168.x.x:5737/
  -> Local SP
```

要求：

- xpod 监听地址、防火墙、同网段路由需要允许访问。
- 普通浏览器不能透明劫持 DNS，只能访问用户实际输入的地址。
- 局域网地址不应被写成 Cloud canonical WebID、Pod URL 或 storage。

## 外网

外网访问只在 canonical URL 有真实可达 route 后启用。

```text
Cloud account authority
  -> canonical=https://node-xxxx.undefineds.co/
  -> tunnel / 直连 / 反向代理
  -> localhost:5737 的 Local SP
```

要求：

- Cloud-managed canonical URL 由 Cloud provisioning 返回。
- User-managed canonical URL 由用户提供。
- 用户或 LinX 配置 route，让 selected canonical URL 能到达本地 xpod。
- route 状态失败只能影响可达性，不能改变 selected SP 或 fallback 到 Cloud Pod。

## Same-node Route 优化

Local 或 Standalone 登录后，LinX 可以在后台探测同一个 Local SP 的候选访问入口，用户不需要再次选择网络路径。

实现边界：

- 用户账号、空间选择、`storedAccount.storageProviderUrl` 和 Solid DB canonical Pod URL 不变。
- xpod 通过 `/api/linx/capabilities` 返回 `contract=linx-local-onboarding/v1`、canonical `baseUrl` 和候选地址。
- LinX 只在返回的 `baseUrl` 与当前 canonical SP URL 一致时，才把候选入口视为 same-node。
- LinX 可以并发探测 `localUrl`、LAN URL、`publicUrl` 和 canonical URL，选择延迟最低且 same-node 校验通过的入口。
- 数据层仍用 canonical Pod URL 初始化。只有在浏览器 fetch 语义安全时，前端 fetch 层才把 canonical URL 的请求静默转发到选中的入口。
- `https` canonical SP 不会被浏览器直接改写到 `http://localhost` 或 `http://LAN`，避免 SPARQL identifier-space、CORS 和 mixed-content 问题。
- xpod gateway 必须保留 canonical Host / forwarded headers，避免本机/LAN 入口变成新的身份或资源 IRI。

验证要求：

- 单测覆盖 localhost 优先、localhost 不通时 LAN 降级、localhost/LAN 都不通时保留 public/canonical。
- 单测覆盖 same-node proof 不匹配时拒绝。
- 单测覆盖 HTTP canonical 请求可静默改走 Local 入口，HTTPS canonical 到 HTTP Local 时禁用改写。
- Docker LAN e2e 覆盖同一 Local xpod 从宿主和 Docker 容器都能访问 `/api/linx/capabilities`，并返回同一个 canonical `baseUrl`。

## 不承诺

- 不承诺任意第三方浏览器访问 canonical URL 时自动走 LAN。
- 不在没有 same-node proof 时把局域网 URL 和公网 URL 当成同一个 SP。
- 不通过内嵌 DNS server、路由器 DNS 修改或每请求 302 重定向实现透明切换。
- 不把平台 `node-*.undefineds.co` 统一转发到用户任意自有域名。

## 验证状态

截至 2026-05-11，本轮 LinX 验证结果：

- Cloud：生产 Cloud 注册、授权、进入 `/chat` 通过。
- Standalone：无公网 URL、无 tunnel token 时，本机 xpod 启动、注册、授权、进入 `/chat` 通过。
- Local tunnel：使用 Cloud 分配的 `https://node-0000.undefineds.co/` 和 Cloudflare tunnel token，Cloud account authority + Local SP 注册、授权、进入 `/chat` 通过。
- Local / Standalone switch：desktop 单测覆盖 Local 入口使用 Cloud account authority + Local SP，Standalone 入口使用 local account authority + Local SP。
