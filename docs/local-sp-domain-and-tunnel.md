# Local SP 域名与隧道说明

这份文档说明 LinX 在 `local` 和 `standalone` 两种空间类型下，SP URL 如何确定，以及 tunnel / LAN / localhost 这些访问渠道和 canonical storage URL 的边界。

这是 Local canonical URL 和访问渠道的主文档。IDP/SP 身份、注册、
`solid:storage` 绑定和业务写入规则以
`docs/login-identity-storage-routing-model.md` 为准；本文只在必要处摘要引用。

权威原则：

- `cloud`：OIDC issuer 和 Storage Provider 都在 Cloud。
- `local`：账号/WebID authority 和实际 OIDC issuer 都是 Cloud；LinX 传给
  Inrupt `login({ oidcIssuer })` 的入口也是 Cloud。selected Local SP 只作为
  storage/provision scope，Cloud 账号/consent 流必须据此过滤 Pod picker，不能
  展示无 scope 的 Cloud Pod。
- `standalone`：OIDC issuer 和 Storage Provider 都在本机 xpod。
- `custom`：第三方 Solid provider 的 issuer/storage 一体入口，用户只填写一个 provider URL。
- Local 的 canonical SP URL 必须稳定，并写入 Cloud WebID profile 的 `solid:storage`。
- `localhost` / LAN / tunnel 都是访问渠道；除非它们就是 selected canonical URL，否则不能写入 `solid:storage`。

## Local URL 类型

| 类型 | Canonical SP URL 来源 | 用户是否填写域名 | 说明 |
| --- | --- | --- | --- |
| Local + Cloud-managed canonical domain | Cloud provisioning 返回 `node-0000.undefineds.co`、`nodeId.nodes.undefineds.co` 或同类节点域名 | 否 | 默认 Local 路径。Cloud 负责决定 canonical URL，后续按 SP nodeId 稳定复用。 |
| Local + user-managed canonical domain | 用户自有 HTTPS origin | 是 | 高级路径。用户负责 DNS、HTTPS、反代、端口转发或隧道出口绑定。 |
| Standalone | 默认 `http://localhost:5737/` 或用户本地配置 | 可选 | 不走 Cloud provisioning，WebID 与 Cloud WebID 分离。 |

`CSS_BASE_STORAGE_DOMAIN` 不再是用户可配置项。xpod 的 `CSS_BASE_URL` 应使用 selected canonical SP URL。

## Local + Cloud-managed Canonical Domain

这是默认的 `local` 空间路径：Cloud account authority + selected Local SP
storage。它不是一个新的 LinX 内部模式，只是 Local canonical SP URL 的
分配策略。

流程：

```text
LinX 选择 Local
  -> LinX 向 Cloud /provision/nodes 注册 Local SP node，请求 Cloud 分配 canonical 域名
  -> Cloud 返回 spDomain/publicUrl，例如 https://<sp-node-id>.nodes.undefineds.co/
  -> LinX 启动 xpod，CSS_BASE_URL=https://<sp-node-id>.nodes.undefineds.co/
  -> LinX 验证 Local SP 可达，并携带 provisionCode 进入 Cloud 账号/OIDC 页面
  -> Cloud 账号/consent 流按 selected Local SP scope 过滤 Pod picker
  -> WebID profile 的 solid:storage 写到 Local SP Pod
```

规则：

- 用户不手填平台节点域名。
- Cloud 分配的 managed domain 可以是随机 nodeId 形态，也可以是当前测试/预配的 `node-0000.undefineds.co` 这类已配置域名；首次注册后和 SP nodeId 绑定，后续续约必须稳定复用，不能再当作用户输入。
- `node` 与 `device` 不同：`node` 是 Storage Provider 服务节点；`device` 是可以运行 workspace / Agent Runtime 的设备。`linx://...` 只用于本地 workspace 容器身份，不参与 Cloud SP provisioning。
- LinX 本机服务会持久化独立的 `.device-id`；它用于构造 `linx://<device-id>/...` workspace container，不应写入 `XPOD_NODE_ID` 或用于 SP 域名续约。
- 在 Cloudflare 还不能由 Cloud 自动创建 CNAME/route 的阶段，测试路径继续使用已经在 Cloudflare/tunnel 后台配置好的 `node-0000.undefineds.co`。
- Cloud-managed canonical URL 是存储 URL，不等于 Cloud 托管用户数据。
- 如果暂时没有外网 route，LinX 仍可启动 xpod 做 localhost/LAN 连通性检查。
- 无外网 route 时，第三方设备不能假设 canonical URL 已可达；但不能因此把 `localhost` 写成 storage。
- 后续补 tunnel token 或可达 route 时，应复用同一个 dataDir 和 canonical URL。

补充：

- managed 续约时，LinX 应优先带同一个 `nodeId`、`nodeToken` 和
  `serviceToken`，让 Cloud 按节点重新确认 canonical domain。
- `spDomain` 只有两种权威来源：当前显式配置的 managed SP domain，或
  Cloud 本次返回 / 仍有效签名 `provisionCode` 中声明的 domain。历史
  registration 里的 `spDomain` 不能在没有显式配置时直接带回 Cloud 当作请求条件。
- managed `spDomain` 是 Cloud-managed 域名请求/续约条件，不是 user-managed
  `publicUrl`；LinX 可以把当前显式配置的预配 `node-0000.undefineds.co` 作为
  `spDomain` 发给 Cloud，但不能把历史记录里的同名字段当成用户自有域名或当前权威。
- Local 登录必须先验证 selected SP/canonical URL 可达并取得有效
  `provisionCode`。验证失败时必须展示 Local 错误并 fail closed，不能退回
  Cloud-only 登录或 Cloud Pod。
- Local setup/provision 的长期状态只落在本机 setup JSON（当前为
  `xpod-cloud-registration.json`）。`xpod-service.json` 只是当前进程快照，
  `xpod.runtime.env` 只是启动输入；二者不能成为续约、canonical URL 或
  provision token 的第二套权威。运行中的 xpod 续约 `provisionCode` 时也必须
  写回同一份 setup JSON，LinX 只读取它并重新生成 runtime env。

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

- LinX/xpod 可以保存多个 tunnel profile，但运行时只能有一个生效。
- 生效入口由 `activeTunnelId` 指向；切换时必须先停止旧 tunnel client，再启动新 profile，并重新做可达性检测。
- tunnel profile 至少包含 `id`、`provider`、`label`、出口域名/endpoint、secret 引用、状态和 last heartbeat；secret 明文不回显。
- 旧的单 tunnel 配置（如 `tunnelProvider` + token）迁移为一个默认 profile，并把它设为 active。
- tunnel token 不决定 WebID 或 storage；selected canonical SP URL 才决定 storage。
- tunnel 可用性失败时，应展示 route 状态，不得 fallback 到 Cloud Pod 或 Standalone Pod。
- P2P、ngrok、Cloudflare、Sakura/frp、有固定 IP / 自有反代都应落到同一类“访问渠道 profile”抽象；是否启用由 active profile 决定，不允许多个公网 tunnel 同时生效。

## 桌面交互

Local 登录路径必须无配置：

1. 用户选择 Local。
2. LinX 自动启动 xpod，并向 Cloud provisioning 申请或续约 canonical URL。
3. 服务 ready 后，如果已有可用 session，直接进入 selected Local SP
   scoped consent；没有 session 时打开 Cloud 账号/OIDC 页面，并携带 selected
   Local SP 的 provision scope。
4. 登录面必须始终提供返回空间选择的入口；关闭嵌入窗口或返回不能把用户
   留在不可操作的等待状态。
5. 登录、注册、Pod 创建和 storage 绑定按
   `docs/login-identity-storage-routing-model.md` 执行。

Local 网络配置属于设置 / Local 管理路径，不出现在登录路径。设置里可以展示：

- Cloud 分配的 Local 域名，例如 `https://node-0000.undefineds.co/`，并提供复制入口。
- 访问渠道列表：公网直连 / 局域网 / 本机 / Cloudflare / Sakura/frp / ngrok / P2P 等 profile；列表可保存多个，但只能把一个设为“当前生效”。
- 当前生效 profile 的配置表单：供应商、出口域名/endpoint、secret/token、Service URL；不同供应商字段可以折叠为相同三类输入（供应商、域名/入口、密钥）。
- Cloudflare Tunnel 指引：Public Hostname 填 Local 域名，Service URL 指向
  `http://localhost:5737`，然后把 tunnel token 粘贴回 LinX。
- 切换生效 profile 后立即触发一次联通性测试：同时探测本机入口和公网 canonical URL，并用
  `/api/linx/capabilities.baseUrl` 判断是否同一个 Local 节点。

交互状态：

- `unknown`：还未测试。
- `checking`：正在测试。
- `local-only`：本机入口可用，公网入口不可达；用户仍可继续本机使用，但外网不可用。
- `ready`：本机入口和公网入口都可达，且 same-node 校验通过。
- `failed`：本机入口不可达。
- `mismatch`：入口可达但不是同一个 canonical Local 节点，必须阻断当作公网 Local 使用。

测试阶段如果 Cloud 还没有自动维护 Cloudflare route，验收可以继续使用已经手工
配置好的 `node-0000.undefineds.co`。生产阶段如果 Cloud 随机分配新域名，Cloud 必须
同时提供 route/CNAME/tunnel 后台配置能力，或者在 UI 中明确提示用户需要自己完成
Cloudflare 配置。

## 登录 / 注册边界

本文不定义登录模型。Local flow 的 account authority、OIDC entry/issuer、
provision scope、consent/Pod picker 过滤、WebID profile `solid:storage`
绑定，以及 LinX 登录后如何选择 Solid DB base，全部以
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
