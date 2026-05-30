# Local SP 域名与隧道说明

这份文档说明 LinX 在 `local` 和 `standalone` 两种空间类型下，SP URL 如何确定，以及 tunnel / LAN / localhost 这些访问渠道和 canonical storage URL 的边界。

这是 Local canonical URL 和访问渠道的主文档。IDP/SP 身份、注册、
`solid:storage` 绑定和业务写入规则以
`docs/login-identity-storage-routing-model.md` 为准；本文只在必要处摘要引用。

权威原则：

- `cloud`：OIDC issuer 和 Storage Provider 都在 Cloud。
- `local`：OIDC issuer 使用 Cloud，Storage Provider 运行在本机 xpod。
- `standalone`：OIDC issuer 和 Storage Provider 都在本机 xpod。
- `custom`：第三方 Solid provider 的 issuer/storage 一体入口，用户只填写一个 provider URL。
- Local 的 canonical SP URL 必须稳定，并写入 Cloud WebID profile 的 `solid:storage`。
- `localhost` / LAN / tunnel 都是访问渠道；除非它们就是 selected canonical URL，否则不能写入 `solid:storage`。

## Local URL 类型

| 类型 | Canonical SP URL 来源 | 用户是否填写域名 | 说明 |
| --- | --- | --- | --- |
| Local + Cloud-managed canonical domain | Cloud provisioning 返回 `node-*.undefineds.co` | 否 | 默认 Local 路径。Cloud 分配 canonical URL，LinX 保存并传给 xpod。 |
| Local + user-managed canonical domain | 用户自有 HTTPS origin | 是 | 高级路径。用户负责 DNS、HTTPS、反代、端口转发或隧道出口绑定。 |
| Standalone | 默认 `http://localhost:5737/` 或用户本地配置 | 可选 | 不走 Cloud provisioning，WebID 与 Cloud WebID 分离。 |

`CSS_BASE_STORAGE_DOMAIN` 不再是用户可配置项。xpod 的 `CSS_BASE_URL` 应使用 selected canonical SP URL。

## Local + Cloud-managed Canonical Domain

这是默认的 `local` 空间路径：Cloud issuer + Local storage。它不是一个新的
LinX 内部模式，只是 Local canonical SP URL 的分配策略。

流程：

```text
LinX 选择 Local
  -> LinX 向 Cloud /provision/nodes 注册 Local node，请求 Cloud 分配 canonical 域名
  -> Cloud 返回 spDomain/publicUrl，例如 https://node-0000.undefineds.co/
  -> LinX 启动 xpod，CSS_BASE_URL=https://node-0000.undefineds.co/
  -> 用户走 Cloud 登录 / 注册 / consent
  -> Cloud 根据 provision scope 把 WebID solid:storage 写到 Local SP Pod
```

规则：

- 用户不手填 `node-*.undefineds.co`。
- Cloud-managed canonical URL 是存储 URL，不等于 Cloud 托管用户数据。
- 如果暂时没有外网 route，LinX 仍可启动 xpod 做 localhost/LAN 连通性检查。
- 无外网 route 时，第三方设备不能假设 canonical URL 已可达；但不能因此把 `localhost` 写成 storage。
- 后续补 tunnel token 或可达 route 时，应复用同一个 dataDir 和 canonical URL。

## Local + User-managed Canonical Domain

这是用户明确要使用自有域名时的 Local canonical SP URL 策略。

用户需要准备：

- 一个自己控制的 HTTPS origin，例如 `https://pod.example.com/`。
- DNS、证书、反向代理、防火墙、端口转发或隧道出口。

LinX 行为：

- 向 Cloud provisioning 发送用户提供的 `publicUrl`，域名策略为 user-managed。
- xpod 使用该 URL 作为 `CSS_BASE_URL`。
- 登录、注册、Pod picker、`solid:storage` 都以该 URL 为 selected SP canonical URL。

## 隧道

隧道只解决访问渠道，不改变身份和存储语义。

Local + Cloud-managed canonical domain 可以使用 Cloudflare Tunnel 或其他隧道把 Cloud 分配的 canonical URL 接到本机 xpod。Local + user-managed canonical domain 也可以由用户把自己的域名接到隧道出口。

规则：

- LinX 可以保存 tunnel token 并随 xpod 启动 tunnel client。
- tunnel token 不决定 WebID 或 storage；selected canonical SP URL 才决定 storage。
- tunnel 可用性失败时，应展示 route 状态，不得 fallback 到 Cloud Pod 或 Standalone Pod。

## 登录 / 注册边界

本文不定义登录模型。Local flow 的 Cloud issuer、provision scope、
consent/Pod picker 过滤、WebID profile `solid:storage` 绑定，以及 LinX
登录后如何选择 Solid DB base，全部以
`docs/login-identity-storage-routing-model.md` 为准。

## 用户侧判断

用户只需要判断：

- 想账号和数据都托管：选 Cloud。
- 想 Cloud 账号、数据在本机：选 Local，默认使用 Cloud-managed canonical domain。
- 想 Cloud 账号、数据在本机且使用自有域名：选 Local，并在高级配置里使用 user-managed canonical domain。
- 想账号和数据都在本机：选 Standalone。
- 想使用第三方 Solid provider：选 Custom。

## 验收要求

- Local + Cloud-managed canonical domain：Cloud provisioning 返回 canonical `publicUrl`，xpod 使用该 URL 作为 `CSS_BASE_URL`，Cloud profile 的 `solid:storage` 指向该 URL 下的 Pod。
- Local + user-managed canonical domain：用户提供的 HTTPS URL 是 canonical SP URL，Cloud profile 的 `solid:storage` 指向该 URL 下的 Pod。
- Local route 优化：localhost/LAN/tunnel 只能作为 same-node 访问渠道，不能改变 canonical resource URI。
- Pod 创建：Local SP 必须创建 Pod root 和结构化 root metadata，`HEAD /<pod>/` 返回存在。
- 登录后：Solid DB Pod URL、首个业务写入、后续 update/delete 都必须在 selected SP Pod URL 前缀下。
- 错误路径：Cloud profile 仍指向 Cloud、旧 Local 节点、缺少 `solid:storage` 或缺少 SP-scoped provision 时，必须阻断进入。
