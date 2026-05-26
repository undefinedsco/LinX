# xpod 需求：支持 LinX Desktop 本地部署

> 状态：已按当前登录路径重写。旧版“平台为 Local SP 分配 `pods.undefineds.co` / `node-*.undefineds.co` 子域名并下发隧道”的方案已废弃。

## 权威路径

LinX 只保留四条登录/部署路线：

| 路线 | IDP | SP | SP URL 来源 |
| --- | --- | --- | --- |
| Cloud | Cloud | Cloud | 平台提供 |
| Local 直连 | Cloud | Local | 用户提供 |
| Local 隧道 | Cloud | Local | 用户提供 |
| Standalone | Local | Local | 默认 `localhost`，公网 URL 可选且用户提供 |

## xpod 必须支持

### 1. 环境变量配置

LinX 会为本地 xpod 写入基础配置：

| 环境变量 | 说明 | 示例 |
| --- | --- | --- |
| `CSS_EDITION` | 运行模式 | `local` |
| `XPOD_MODE` | 运行模式 | `local` |
| `CSS_PORT` | 监听端口 | `5737` |
| `CSS_BASE_URL` | xpod 对外 URL | `http://localhost:5737/` 或 `https://pod.example.com/` |
| `CSS_ROOT_FILE_PATH` | 数据目录 | `/Users/alice/Library/Application Support/LinX/pod` |
| `CSS_SPARQL_ENDPOINT` | SPARQL 存储 | `sqlite:/path/to/quadstore.sqlite` |
| `CSS_IDENTITY_DB_URL` | 身份数据库 | `sqlite:/path/to/identity.sqlite` |

`CSS_BASE_URL` 是 xpod 生成 WebID、issuer、storage URL 的 canonical 入口。需要局域网访问时，把 `CSS_BASE_URL` 设成局域网 URL，监听开放由 LinX/xpod 内部推导。

### 2. Local 直连

当用户提供公网域名且本机可被外网直连时：

- LinX 设置 `CSS_BASE_URL=https://pod.example.com/`。
- xpod 仍监听本机端口。
- xpod 生成的 issuer、WebID、storage URL 必须使用 `CSS_BASE_URL`。
- DNS、端口转发、反向代理、证书由用户负责。

### 3. Local 隧道

当用户提供公网域名并配置隧道时：

- LinX 设置 `CSS_BASE_URL=https://pod.example.com/`。
- LinX 写入对应隧道 token，例如 `CLOUDFLARE_TUNNEL_TOKEN` 或 `SAKURA_TOKEN`。
- 用户负责把域名接到隧道出口。
- xpod 不需要知道平台分配域名，只需要按 `CSS_BASE_URL` 对外声明身份和 storage。

### 4. Standalone

当用户选择全套本地：

- 默认 `CSS_BASE_URL=http://localhost:5737/`。
- 不要求公网域名。
- 不要求隧道。
- 默认自动路径只保证本机/局域网可用；如果用户还想走 Cloud IDP 远程登录，必须改成 Local 远程路径并提供自己的公网 URL。
- 如果用户填了公网域名，LinX 可设置 `CSS_BASE_URL=https://pod.example.com/`，但域名、网络入口和证书仍由用户负责。

## 不再支持的需求

- 不再需要 `pods.undefineds.co` 子域名申请 API。
- 不再需要 Cloud 为 Local SP 创建 DNS 记录。
- 不再需要 Cloud 为 Local SP 分发隧道 token。
- 不再要求用户填写平台生成的 Local 公网域名。
- `CSS_BASE_STORAGE_DOMAIN` 不再是 Local onboarding 的用户配置项。

如果 xpod/cloud 内部为了兼容仍保留这些字段，只能作为内部实现细节，不应暴露到 LinX 产品配置和用户文档。
