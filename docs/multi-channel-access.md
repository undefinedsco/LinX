# 多渠道访问设计

## 目标

这份文档定义 Xpod / LinX 在本机、局域网、外网三种访问渠道下的落地边界。

当前产品目标不是让平台自动给用户的 Local SP 分配公网域名，而是：

- Cloud 路径开箱即用。
- Local 没有公网 URL 或隧道时，先保证本机和局域网可用。
- 用户后来补充公网 URL、直连入口或隧道后，同一个 Local 数据目录可以升级到 Cloud IDP + Local SP。
- Standalone 保持全套本地身份和本地数据。
- 不改变 WebID / Pod / ACL / OIDC 的语义来迁就网络路径。

## 产品路径

| 路径 | IDP | SP | SP URL 来源 | 当前要求 |
| --- | --- | --- | --- | --- |
| Cloud | Cloud | Cloud | Cloud 提供 | 不启动本地 xpod |
| Local base / LAN | Local，后续可加 Cloud route | Local | `localhost` / LAN | 不要求公网 URL，不要求隧道 |
| Local direct | Cloud | Local | 用户自有 HTTPS URL | 用户负责 DNS、HTTPS、端口转发或反向代理 |
| Local tunnel | Cloud | Local | 用户自有 HTTPS URL 或隧道稳定域名 | 用户负责隧道和域名绑定 |
| Standalone | Local | Local | 默认 `localhost` / LAN | 不走 Cloud provisioning |

统一规则：

- LinX 不再为 Local SP 自动分配 `node-*.undefineds.co`。
- 用户不再手填“平台分配的 Local 公网域名”。
- `CSS_BASE_STORAGE_DOMAIN` 不属于 Local onboarding 的用户配置路径。
- Cloud IDP + Local SP 只有在 Local SP 需要被 Cloud 或外网访问时，才要求用户提供公网 HTTPS origin。
- Local 默认自动路径是 device-only：启动本机 xpod，允许用户先完成本机登录和数据写入。
- 后续从 device-only 升级到 remote-ready 时，必须复用同一个本地数据目录；不能因为补公网 route 就重建数据。

## 访问渠道

### 本机

本机访问是 Local 的默认路径。

```
LinX Desktop
  -> 启动本机 xpod
  -> http://localhost:5737/
  -> 本地账号 / 本地 Pod
  -> 回到 LinX
```

要求：

- 不需要公网 IP。
- 不需要域名。
- 不需要 tunnel token。
- 不调用 Cloud provisioning。

适用路径：

- Local base / LAN。
- Standalone。

### 局域网

局域网访问仍然属于 Local base / LAN。它不是 Cloud IDP + Local SP 的替代品，因为 Cloud 仍无法从公网访问用户内网。

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
- 如果用户没有公网 URL，不能完成 Cloud IDP + Local SP 远程路径；应先走 Local base / LAN 或 Standalone。

## Local 启动模式

### device-only

`device-only` 是 Local 供应商首次启动的自动路径。

行为：

- `CSS_BASE_URL` 使用本地 URL，例如 `http://localhost:5737/`。
- 不设置 Cloud `oidcIssuer`。
- 不注册 Cloud node。
- 不写入 `XPOD_NODE_ID`、`XPOD_NODE_TOKEN`、`XPOD_SERVICE_TOKEN`。
- 不要求 `CLOUDFLARE_TUNNEL_TOKEN`。

验收：

- 本机 xpod 能启动。
- 用户可以在本地账号页注册 / 登录。
- 用户可以创建 Pod 并进入 LinX。
- Solid DB 的 Pod URL 指向本地 SP。

### remote-ready

`remote-ready` 是用户已经配置 `publicUrl` 后的 Local 远程路径。

行为：

- `publicUrl` 使用用户自有 HTTPS origin。
- LinX 向 Cloud 注册 Local node。
- xpod 使用 Cloud IDP 作为 `oidcIssuer`。
- Cloud 通过 provision code 把 Cloud WebID 和 Local SP 绑定。
- 如果配置了 Cloudflare token，xpod / local runtime 可以启动 tunnel client。

验收：

- 没有 `publicUrl` 时必须阻断 remote-ready 启动，并提示用户先配置自己的公网域名或隧道域名。
- 有 `publicUrl` 时，Cloud provisioning 请求必须标记为 self-managed domain。
- Cloud 回调创建 Pod 后，Pod URL 必须以用户提供的 `publicUrl` 开头。
- 从 device-only 升级到 remote-ready 时，持久化模式应切换到 `remote-ready`，并复用原 dataDir。

## 身份与存储边界

### Cloud

Cloud 路径里，IDP 和 SP 都属于 Cloud。用户不配置 Local SP 域名。

### Local

Local 路径里，SP 在用户本机。身份可以分两层：

- device-only：本地 xpod 签发身份。
- remote-ready：Cloud 签发身份，Local SP 保存数据。

Cloud IDP + Local SP 时，Cloud 是身份权威，Local SP 是存储权威。LinX 不能把一个局域网地址静默当成新的身份，也不能把不同 host 下的 Pod 当成同一个资源空间，除非服务端能证明它们属于同一 node。

### Standalone

Standalone 是 Local IDP + Local SP。它不经过 Cloud provisioning，WebID 和 Cloud WebID 分离。

## 后续多渠道优化

“同一个 URI 在本机、局域网、外网之间自动选最优访问渠道”是后续优化，不是当前已经完成的产品承诺。

后续可以考虑的方向：

- xpod 在 capabilities 或 well-known 响应里暴露候选地址。
- LinX Desktop / CLI 后台用 HTTP HEAD 探测候选地址可达性。
- 只有在 same-node proof、canonical WebID 稳定、Inrupt SDK 兼容都验证后，才允许透明改写 transport route。
- 浏览器 Web 不做透明 DNS 劫持；最多使用用户实际输入的地址或系统 hosts。

当前不采用：

- 平台统一 `node-*.undefineds.co` 转发到用户隧道。
- 内嵌 DNS server。
- 要求用户修改路由器 DNS。
- 用 302 重定向在每次请求里切 route。
- 在没有同 node 证明时，把局域网 URL 和公网 URL 当成同一个 SP URI。

## 验证状态

截至 2026-05-11，本轮 LinX 验证结果：

- Cloud：生产 Cloud 注册、授权、进入 `/chat` 通过。
- Local base / LAN：无公网 URL、无 tunnel token 时，本机 Local 启动、注册、授权、进入 `/chat` 通过。
- Local tunnel：使用用户提供的 `https://node-0000.undefineds.co/` 和 Cloudflare tunnel token，Cloud IDP + Local SP 注册、授权、进入 `/chat` 通过。
- Local mode switch：desktop 单测覆盖从 device-only 持久化状态补充 public domain 后升级到 remote-ready。
- Standalone：当前等同 Local device-only 的本地身份 / 本地 SP 路径；已通过本机真实 Local 登录验证。

已知风险：

- Local tunnel 验证日志里仍能看到部分容器创建 400/404 重试噪声；最终 Solid DB ready 和 `/chat` 通过，但需要后续把 root/container provisioning 行为收敛到更干净的服务端语义。
- 自动 LAN / 外网 route 透明切换尚未完成，不能在产品文案里承诺“同一 URI 自动本机、局域网、外网全切换”。
