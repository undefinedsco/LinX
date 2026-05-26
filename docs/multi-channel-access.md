# 多渠道访问设计

## 目标

这份文档定义 Xpod / LinX 在本机、局域网、外网三种访问渠道下的落地边界。

当前产品目标不是让平台自动给用户的 Local SP 分配公网域名，而是：

- Cloud 路径开箱即用。
- Local 没有公网 URL 或隧道时，只做本机和局域网连通性检查；完整本地登录走 Standalone。
- 用户后来补充公网 URL、直连入口或隧道后，同一个 Local 数据目录可以升级到 Cloud IDP + Local SP。
- Standalone 保持全套本地身份和本地数据。
- 不改变 WebID / Pod / ACL / OIDC 的语义来迁就网络路径。

## 产品路径

| 路径 | IDP | SP | SP URL 来源 | 当前要求 |
| --- | --- | --- | --- | --- |
| Cloud | Cloud | Cloud | Cloud 提供 | 不启动本地 xpod |
| Local direct | Cloud | Local | 用户自有 HTTPS URL | 用户负责 DNS、HTTPS、端口转发或反向代理 |
| Local tunnel | Cloud | Local | 用户自有 HTTPS URL 或隧道稳定域名 | 用户负责隧道和域名绑定 |
| Standalone | Local | Local | 默认 `localhost` / LAN | 不走 Cloud provisioning |

统一规则：

- LinX 不再为 Local SP 自动分配 `node-*.undefineds.co`。
- 用户不再手填“平台分配的 Local 公网域名”。
- `CSS_BASE_STORAGE_DOMAIN` 不属于 Local onboarding 的用户配置路径。
- Local 这个产品入口固定表示 Cloud IDP + Local SP；Standalone 固定表示 Local IDP + Local SP；Custom 固定表示第三方 Solid provider 的 IDP/SP 一体入口。
- LinX 和 xpod 启动参数也只使用 `cloud` / `local` / `standalone` / `custom` 这组产品名，不再引入第二套技术模式名。
- Local 缺少用户公网 HTTPS origin 时，可以启动 xpod 并做本机/LAN 连通性检查，但不能静默降级为 Standalone 登录。
- 后续补充公网 route 时，必须复用同一个本地数据目录；不能因为补公网 route 就重建数据。

## 访问渠道

### 本机

本机访问是本地 xpod 的默认访问渠道。

```
LinX Desktop
  -> 启动本机 xpod
  -> http://localhost:5737/
  -> Standalone 登录，或 Local 的连通性 / route 检查
```

要求：

- 不需要公网 IP。
- 不需要域名。
- 不需要 tunnel token。
- Standalone 不调用 Cloud provisioning。
- Local 如果要完成 Cloud IDP + Local SP 登录，仍需要一个 Cloud 能访问到的 `publicUrl`。

适用路径：

- Standalone。
- Local 的本机/LAN 连通性检查。

### 局域网

局域网访问是本地 xpod 的一种访问渠道。它不是 Cloud IDP + Local SP 远程登录的替代品，因为 Cloud 仍无法从公网访问用户内网。

```
同一局域网设备
  -> http://192.168.x.x:5737/
  -> Local SP
```

要求：

- xpod 监听地址、防火墙、同网段路由需要允许访问。
- 不保证移动浏览器或普通浏览器自动发现。
- 不引入内嵌 DNS server，也不要求用户改路由器 DNS。

当前落地边界：

- Desktop / CLI 可以后续做候选地址探测。
- 普通浏览器不能透明劫持 DNS，只能访问用户实际输入的地址。
- 局域网地址不应被写成 Cloud canonical WebID 的替代身份。

### 外网

外网访问只在用户提供真实可达的 HTTPS origin 后启用。

```
Cloud IDP
  -> publicUrl=https://pod.example.com/
  -> 用户直连入口或隧道
  -> localhost:5737 的 Local SP
```

要求：

- `publicUrl` 必须是 HTTPS origin，例如 `https://pod.example.com/`。
- 用户负责 DNS、证书、反向代理、防火墙、端口转发或隧道供应商配置。
- LinX 只保存并使用用户提供的 `publicUrl`。
- 如果用户使用 Cloudflare Tunnel，LinX 可以持有 token 并随 Local SP 启动 cloudflared，但域名和 tunnel route 仍由用户配置。
- 如果用户没有公网 URL，不能完成 Cloud IDP + Local SP；应先走 Standalone 或只做 Local 本机/LAN 连通性检查。

## 本地 xpod 启动语义

### Standalone

行为：

- `CSS_BASE_URL` 使用本地 URL，例如 `http://localhost:5737/`。
- 如果使用局域网 URL，例如 `http://192.168.1.10:5737/`，监听开放由 LinX/xpod 从 `CSS_BASE_URL` 内部推导；用户只配置入口 URL。
- 不设置 Cloud `oidcIssuer`。
- 不注册 Cloud node。
- 不写入 `XPOD_NODE_ID`、`XPOD_NODE_TOKEN`、`XPOD_SERVICE_TOKEN`。
- 不要求 `CLOUDFLARE_TUNNEL_TOKEN`。

验收：

- 本机 xpod 能启动。
- 用户可以在本地账号页注册 / 登录。
- 用户可以创建 Pod 并进入 LinX。
- Solid DB 的 Pod URL 指向本地 SP。

### Local

行为：

- `publicUrl` 使用用户自有 HTTPS origin。
- LinX 向 Cloud 注册 Local node。
- xpod 使用 Cloud IDP 作为 `oidcIssuer`，并通过 CSS Components shorthand 注入外部 IdP。
- Cloud 通过 provision code 把 Cloud WebID 和 Local SP 绑定。
- 如果配置了 Cloudflare token，xpod / local runtime 可以启动 tunnel client。

验收：

- 没有 `publicUrl` 时必须阻断 Cloud IDP + Local SP 登录，并提示用户先配置自己的公网域名或隧道域名；不能自动切到 Standalone。
- 有 `publicUrl` 时，Cloud provisioning 请求必须标记为 self-managed domain。
- Cloud 回调创建 Pod 后，Pod URL 必须以用户提供的 `publicUrl` 开头。
- 从 Standalone 改走 Local 时，只切换产品入口为 Local，并复用原 dataDir。

## 身份与存储边界

### Cloud

Cloud 路径里，IDP 和 SP 都属于 Cloud。用户不配置 Local SP 域名。

### Local

Local 路径里，Cloud 是身份权威，Local SP 是存储权威。LinX 不能把一个局域网地址静默当成新的身份，也不能把不同 host 下的 Pod 当成同一个资源空间，除非服务端能证明它们属于同一 node。

### Standalone

Standalone 是 Local IDP + Local SP。它不经过 Cloud provisioning，WebID 和 Cloud WebID 分离。

## 当前多渠道优化

Local 或 Standalone 登录后，LinX 会在后台自动探测同一个 Local SP 的可达入口，用户不需要再次选择网络路径。

实现边界：

- 用户账号、空间选择、`storedAccount.storageProviderUrl` 和 Solid DB 的 canonical Pod URL 不变。
- xpod 通过 `/api/linx/capabilities` 返回 `contract=linx-local-onboarding/v1` 和 canonical `baseUrl`。
- LinX 只在返回的 `baseUrl` 与当前 canonical SP URL 一致时，才把候选入口视为 same-node。
- LinX 并发探测 `localUrl`、`baseUrl`、`publicUrl` 和 canonical URL，选择延迟最低且 same-node 校验通过的入口。
- 数据层仍用 canonical Pod URL 初始化。只有在浏览器 fetch 语义安全时，前端 fetch 层才把 canonical URL 的请求静默转发到选中的入口；DPoP/资源 URI 仍按 canonical URL 生成。
- `https` canonical SP 不会被浏览器直接改写到 `http://localhost` / `http://LAN`。这种情况下 LinX 仍记录探测结果，但静默保留 canonical HTTPS 传输，避免 SPARQL identifier-space、CORS 和 mixed-content 问题。
- xpod gateway 会把请求的 Host / `x-forwarded-host` 还原到 `CSS_BASE_URL`，所以本机/LAN 入口不会变成新的身份或资源 IRI。
- 普通浏览器不做系统 DNS 劫持；优化只发生在 LinX App/Web Runtime 内部。

验证要求：

- 单测覆盖 localhost 优先、localhost 不通时 LAN 降级、localhost/LAN 都不通时保留 public/canonical、same-node proof 不匹配时拒绝、HTTP canonical 请求静默改走 Local 入口、HTTPS canonical 到 HTTP Local 时禁用改写。
- Docker LAN e2e 覆盖同一 Local xpod 从宿主和 Docker 容器都能访问 `/api/linx/capabilities`，并返回同一个 canonical `baseUrl`。

未承诺：

- 不承诺任意第三方浏览器访问 canonical URL 时自动走 LAN。
- 不在没有 same-node proof 时把局域网 URL 和公网 URL 当成同一个 SP。
- 不通过内嵌 DNS server 或路由器 DNS 修改来实现透明切换。

当前不采用：

- 平台统一 `node-*.undefineds.co` 转发到用户隧道。
- 内嵌 DNS server。
- 要求用户修改路由器 DNS。
- 用 302 重定向在每次请求里切 route。
- 在没有同 node 证明时，把局域网 URL 和公网 URL 当成同一个 SP URI。

## 验证状态

截至 2026-05-11，本轮 LinX 验证结果：

- Cloud：生产 Cloud 注册、授权、进入 `/chat` 通过。
- Standalone：无公网 URL、无 tunnel token 时，本机 xpod 启动、注册、授权、进入 `/chat` 通过。
- Local tunnel：使用用户提供的 `https://node-0000.undefineds.co/` 和 Cloudflare tunnel token，Cloud IDP + Local SP 注册、授权、进入 `/chat` 通过。
- Local / Standalone switch：desktop 单测覆盖 Local 入口使用 Cloud IDP + Local SP，Standalone 入口使用 Local IDP + Local SP。

已知风险：

- Local tunnel 验证日志里仍能看到部分容器创建 400/404 重试噪声；最终 Solid DB ready 和 `/chat` 通过，但需要后续把 root/container provisioning 行为收敛到更干净的服务端语义。
- LinX 内部数据访问已补充 best-route 探测与安全 fetch 级静默转发；第三方浏览器级透明 DNS 切换仍不属于当前承诺。
