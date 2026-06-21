# xpod 需求：支持 LinX Desktop 本地部署

> 状态：已按当前登录路径重写。旧版“用户手填平台分配域名”方案已废弃；当前 Local 默认由 Cloud provisioning 分配 managed canonical，注册后与 SP nodeId 绑定并稳定复用，高级配置才使用用户自有域名。deviceId 只表示能运行 workspace 的设备，不参与 SP 域名分配。

本文是 xpod 交付需求，不是登录模型主文档；只记录 LinX 需要 xpod
稳定提供的配置和运行契约。

权威来源：

- IDP/SP、注册、`solid:storage`、业务写入：`docs/login-identity-storage-routing-model.md`
- Local canonical URL、canonical domain 策略、tunnel：`docs/local-sp-domain-and-tunnel.md`

## 路径摘要

LinX 只保留 Cloud / Local / Standalone / Custom 四类产品入口。本文只记录
xpod 对 Local / Standalone 的运行契约；OIDC issuer、Storage Provider、
registration 和 `solid:storage` 语义以主文档为准。

## xpod 必须支持

### 1. 环境变量配置

LinX 会为本地 xpod 写入基础配置：

| 环境变量 | 说明 | 示例 |
| --- | --- | --- |
| `CSS_EDITION` | 运行类型 | `local` |
| `CSS_PORT` | 监听端口 | `5737` |
| `CSS_BASE_URL` | xpod canonical 对外 URL | `https://node-0000.undefineds.co/` 或 `https://pod.example.com/` |
| `CSS_ROOT_FILE_PATH` | 数据目录 | `/Users/alice/Library/Application Support/LinX/pod` |
| `CSS_SPARQL_ENDPOINT` | SPARQL 存储 | `sqlite:/path/to/quadstore.sqlite` |
| `CSS_IDENTITY_DB_URL` | 身份数据库 | `sqlite:/path/to/identity.sqlite` |

`CSS_BASE_URL` 是 xpod 的 canonical 对外入口。它在 Local 和
Standalone 下的取值规则以 `docs/local-sp-domain-and-tunnel.md` 为准。

### 2. Local + Cloud-managed Canonical Domain

默认 Local 路径的 xpod 运行要求：

- LinX 向 Cloud `/provision/nodes` 注册 Local node，请求 Cloud 分配 canonical 域名。
- Cloud 返回 `spDomain` / `publicUrl`，例如 `https://node-0000.undefineds.co/` 或 `https://868c9f63-6b0e-4255-8f7f-f2e347908ba4.nodes.undefineds.co/`。
- LinX 设置 `CSS_BASE_URL` 为 Cloud 返回的 canonical URL。
- xpod 仍监听本机端口。
- xpod 生成的 OIDC discovery/issuer surface、Pod、storage 和资源 URL
  必须使用 `CSS_BASE_URL`。Local 的 canonical WebID 可以仍是 Cloud WebID，
  但 profile 里的 `solid:oidcIssuer` 必须信任实际 OIDC issuer，且
  `solid:storage` 必须指向 `CSS_BASE_URL` 下的 Local Pod。
- xpod 需要能消费 Cloud provision scope；profile/storage 绑定语义见登录主文档。
- 可选 tunnel/直连 route 只改变访问渠道，不改变 canonical URL。

### 3. Local + User-managed Canonical Domain

当用户明确提供自己的 HTTPS origin 时：

- LinX 设置 `CSS_BASE_URL=https://pod.example.com/`。
- LinX 向 Cloud `/provision/nodes` 注册 Local node，并把用户提供的 `publicUrl` 作为 canonical SP URL。
- 用户负责 DNS、证书、端口转发、反向代理或隧道出口。
- xpod 按 `CSS_BASE_URL` 对外声明身份和 storage。

### 4. 隧道

隧道不是独立登录路径，只是访问渠道：

- LinX 可写入对应隧道 token，例如 `CLOUDFLARE_TUNNEL_TOKEN` 或 `SAKURA_TOKEN`。
- Cloud-managed canonical domain 可把 Cloud 分配的 canonical URL 接到本机 xpod。
- User-managed canonical domain 可把用户自有域名接到隧道出口。
- 隧道状态不得改变 WebID、Pod URL、ACL 或 `solid:storage`。

### 5. Standalone

当用户选择全套本地：

- 默认 `CSS_BASE_URL=http://localhost:5737/`。
- 不要求公网域名。
- 不要求隧道。
- 默认自动路径只保证本机/局域网可用；如果用户还想走 Cloud-backed Local 路径，需要改成 Local 并完成 Cloud provisioning/binding。
- 如果用户填了公网域名，LinX 可设置 `CSS_BASE_URL=https://pod.example.com/`，但域名、网络入口和证书仍由用户负责。

## 不再支持的需求

- 不再需要用户手填 `pods.undefineds.co` / `node-*.undefineds.co`。
- 当前没有 Cloud 自动维护 Cloudflare CNAME/route 时，测试路径可继续使用已在 Cloudflare/tunnel 后台配置好的 `node-0000.undefineds.co`，但它仍是 Cloud-managed `spDomain`，不是用户自有 `publicUrl`。
- 不再需要 Cloud 为 Local SP 分发隧道 token。
- 不再要求用户填写平台生成的 Local 公网域名。
- `CSS_BASE_STORAGE_DOMAIN` 不再是 Local onboarding 的用户配置项。

如果 xpod/cloud 内部为了兼容仍保留这些字段，只能作为内部实现细节，不应暴露到 LinX 产品配置和用户文档。
